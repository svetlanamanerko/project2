import 'server-only';

import { createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { refreshGoogleAccessToken } from '@/lib/google-drive';

const execFileAsync = promisify(execFile);
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOC_MIME = 'application/vnd.google-apps.document';
const PDF_MIME = 'application/pdf';

export type LessonSourceContext = {
  courseTitle: string;
  courseFolderId: string | null;
  courseProfile: unknown;
  module: string | null;
  topic: string | null;
  note: string | null;
};

export type PreparedLessonSource = {
  label: string;
  reference: string;
  printedStart: number | null;
  printedEnd: number | null;
  sourceFileId: string;
  sourceFileName: string;
  kieFileUrl: string;
  excerptPath: string;
};

type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

type CourseMapEntry = {
  lessonId: string;
  aliases: string[];
  title: string;
  startPage: number | null;
  endPage: number | null;
  partHint: string | null;
  raw: string;
};

type ParsedCourseMap = {
  aliases: Map<string, CourseMapEntry>;
  ordered: CourseMapEntry[];
};

type LocatedEntry = {
  sourceBook: DriveItem;
  sourcePath: string;
  firstPhysicalPage: number;
  lastPhysicalPage: number;
  score: number;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('ru-RU');
}

function normalizeLoose(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleUpperCase('ru-RU')
    .replace(/[^0-9A-ZА-ЯЁ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSectionLetter(value: string) {
  const letter = value.toLocaleLowerCase('ru-RU');
  if (letter === 'а') return 'a';
  if (letter === 'б') return 'b';
  if (letter === 'с') return 'c';
  return letter;
}

function normalizeLessonReference(value: string) {
  const compact = value.trim().replace(/\s+/g, '');
  const lesson = compact.match(/^l(\d{1,2})$/i);
  if (lesson) return `l${lesson[1].padStart(2, '0')}`;
  const section = compact.match(/^(10|[1-9])([abcабс])$/i);
  if (section) return `${section[1]}${normalizeSectionLetter(section[2])}`;
  const unit = compact.match(/^unit(\d{1,2})$/i);
  if (unit) return `unit${Number(unit[1])}`;
  const module = compact.match(/^module(\d{1,2})([a-h])$/i);
  if (module) return `module${Number(module[1])}${module[2].toLocaleLowerCase()}`;
  return compact.toLocaleLowerCase('ru-RU');
}

function detectLessonReference(values: Array<string | null>) {
  for (const value of values) {
    if (!value) continue;
    const lesson = value.match(/\bL\s*0?(\d{1,2})\b/i);
    if (lesson) return normalizeLessonReference(`L${lesson[1]}`);
    const unitSection = value.match(/\bUnit\s*(\d{1,2})\s*([A-CАБС])\b/i);
    if (unitSection) return normalizeLessonReference(`${unitSection[1]}${unitSection[2]}`);
    const moduleSection = value.match(/\bModule\s*(\d{1,2})\s*([A-H])\b/i);
    if (moduleSection) return normalizeLessonReference(`module${moduleSection[1]}${moduleSection[2]}`);
    const unit = value.match(/\bUnit\s*(\d{1,2})\b/i);
    if (unit) return normalizeLessonReference(`unit${unit[1]}`);
    const section = value.match(/\b(10|[1-9])\s*([abcабс])\b/i);
    if (section) return normalizeLessonReference(`${section[1]}${section[2]}`);
  }
  return null;
}

function detectExplicitPages(values: Array<string | null>) {
  const pattern = /(?:стр(?:\.|аниц(?:а|ы|е|у|ах)?)?|pp?\.?|pages?)\s*[:№]?\s*(\d{1,3})(?:\s*(?:[-–—]|до|и|,|\s)\s*(\d{1,3}))?/i;
  for (const value of values) {
    if (!value) continue;
    const match = value.match(pattern);
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start && end - start <= 20) {
      return { start, end };
    }
  }
  return null;
}

function detectPartHint(values: Array<string | null>) {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/(?:part|часть)\s*([12])\b/i);
    if (match) return match[1];
  }
  return null;
}

function configuredPageOffset(courseTitle: string, courseProfile: unknown) {
  if (courseProfile && typeof courseProfile === 'object') {
    const profile = courseProfile as Record<string, unknown>;
    const value = Number(profile.pdfPageOffset ?? profile.pageOffset);
    if (Number.isInteger(value) && Math.abs(value) <= 20) return value;
  }
  return /spotlight\s*5/i.test(courseTitle) ? 3 : 0;
}

function folderQuery(parentId: string) {
  return `'${parentId.replace(/'/g, "\\'")}' in parents and trashed=false`;
}

async function driveList(accessToken: string, parentId: string) {
  const params = new URLSearchParams({
    q: folderQuery(parentId),
    fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
    pageSize: '100',
    orderBy: 'folder,name_natural',
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google Drive list HTTP ${response.status}`);
  const payload = await response.json() as { files?: DriveItem[] };
  return payload.files || [];
}

async function driveText(accessToken: string, fileId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google Drive export HTTP ${response.status}`);
  return response.text();
}

async function findChildFolder(accessToken: string, parentId: string, patterns: RegExp[]) {
  const items = await driveList(accessToken, parentId);
  return items.find((item) => item.mimeType === FOLDER_MIME && patterns.some((pattern) => pattern.test(item.name))) || null;
}

async function walkFolders(accessToken: string, rootId: string, maxDepth = 2) {
  const result: Array<{ folder: DriveItem; depth: number }> = [];
  let frontier = [{ id: rootId, depth: 0 }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const current of frontier) {
      if (current.depth >= maxDepth) continue;
      const children = await driveList(accessToken, current.id);
      for (const child of children) {
        if (child.mimeType !== FOLDER_MIME) continue;
        result.push({ folder: child, depth: current.depth + 1 });
        next.push({ id: child.id, depth: current.depth + 1 });
      }
    }
    frontier = next;
  }
  return result;
}

async function findCourseMap(accessToken: string, courseFolderId: string) {
  const folders = await walkFolders(accessToken, courseFolderId, 2);
  const mapFolder = folders.find(({ folder }) => /course\s*map|курс.*map|карта/i.test(folder.name))?.folder;
  const candidateFolders = [mapFolder?.id, courseFolderId].filter(Boolean) as string[];
  for (const folderId of candidateFolders) {
    const items = await driveList(accessToken, folderId);
    const doc = items.find((item) => item.mimeType === DOC_MIME && /course\s*map|карта|curriculum/i.test(item.name));
    if (doc) return doc;
  }
  return null;
}

function contextWindow(lines: string[], index: number, before = 3) {
  return lines.slice(Math.max(0, index - before), index + 1).join(' ');
}

function pagesFromText(value: string) {
  const matches = [...value.matchAll(/(?:pp?\.?|стр\.?|pages?)\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/gi)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  const start = Number(last[1]);
  const end = Number(last[2] || last[1]);
  if (start < 1 || end < start || end - start > 40) return null;
  return { start, end };
}

function parseCourseMap(text: string): ParsedCourseMap {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const aliases = new Map<string, CourseMapEntry>();
  const ordered: CourseMapEntry[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lessonMatch = line.match(/\bL\s*0?(\d{1,2})\b/i);
    if (!lessonMatch) continue;
    const lessonId = `l${lessonMatch[1].padStart(2, '0')}`;
    const windowText = contextWindow(lines, index, 4);
    const directPages = pagesFromText(line);
    const inheritedPages = directPages || pagesFromText(windowText);
    const partHint = detectPartHint([windowText]);
    const entryAliases = new Set<string>([lessonId]);

    const section = line.match(/\b(10|[1-9])\s*([abcабс])\b/i);
    if (section) entryAliases.add(normalizeLessonReference(`${section[1]}${section[2]}`));
    const unit = line.match(/\bUnit\s*(\d{1,2})\b/i);
    if (unit) entryAliases.add(normalizeLessonReference(`unit${unit[1]}`));
    const module = line.match(/\bModule\s*(\d{1,2})\s*([A-H])\b/i);
    if (module) entryAliases.add(normalizeLessonReference(`module${module[1]}${module[2]}`));

    const entry: CourseMapEntry = {
      lessonId,
      aliases: [...entryAliases],
      title: line,
      startPage: inheritedPages?.start ?? null,
      endPage: inheritedPages?.end ?? null,
      partHint,
      raw: line,
    };
    ordered.push(entry);
    for (const alias of entry.aliases) aliases.set(alias, entry);
  }

  return { aliases, ordered };
}

async function getCourseMap(accessToken: string, courseFolderId: string, courseTitle: string) {
  const doc = await findCourseMap(accessToken, courseFolderId);
  if (!doc) throw new Error(`COURSE MAP не найден для ${courseTitle}`);
  return parseCourseMap(await driveText(accessToken, doc.id));
}

async function findStudentBooks(accessToken: string, courseFolderId: string) {
  const sourceFolder = await findChildFolder(accessToken, courseFolderId, [/source\s*books/i, /учебник/i, /source/i]);
  const folders = [sourceFolder?.id, courseFolderId].filter(Boolean) as string[];
  const result: DriveItem[] = [];
  for (const folderId of folders) {
    const items = await driveList(accessToken, folderId);
    result.push(...items.filter((item) => item.mimeType === PDF_MIME && /student|students|student's|pupil|учебник|sb\b/i.test(item.name)));
  }
  const unique = new Map(result.map((item) => [item.id, item]));
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

function booksForPart(books: DriveItem[], partHint: string | null) {
  if (!partHint) return books;
  const preferred = books.filter((book) => new RegExp(`(?:part|часть)[ _-]*${partHint}\\b`, 'i').test(book.name));
  return preferred.length ? preferred : books;
}

function fileExists(filePath: string) {
  return stat(filePath).then(() => true).catch(() => false);
}

async function ensureBookDownloaded(accessToken: string, item: DriveItem) {
  const dataDir = process.env.DATA_DIR?.trim() || '/data';
  const cacheDir = path.join(dataDir, 'cache', 'lesson-source', 'books');
  await mkdir(cacheDir, { recursive: true });
  const target = path.join(cacheDir, `${item.id}.pdf`);
  if (await fileExists(target)) return target;

  const temporary = `${target}.part-${process.pid}-${Date.now()}`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok || !response.body) throw new Error(`Google Drive PDF HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary));
  await rename(temporary, target);
  return target;
}

async function readPdfPages(filePath: string) {
  const tempDir = `${filePath}.text-${process.pid}-${Date.now()}`;
  await mkdir(tempDir, { recursive: true });
  try {
    await execFileAsync('pdftotext', ['-layout', filePath, path.join(tempDir, 'book.txt')], { timeout: 180_000 });
    const text = await readFile(path.join(tempDir, 'book.txt'), 'utf8');
    return text.split('\f');
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function scoreEntry(pageText: string, entry: CourseMapEntry) {
  const haystack = normalizeLoose(pageText);
  let score = 0;
  for (const alias of entry.aliases) {
    const normalized = normalizeLoose(alias);
    if (normalized && haystack.includes(normalized)) score += 4;
  }
  const titleTokens = normalizeLoose(entry.title).split(' ').filter((token) => token.length >= 4 && !/^\d+$/.test(token));
  for (const token of titleTokens.slice(0, 8)) if (haystack.includes(token)) score += 1;
  if (entry.startPage != null && new RegExp(`(^|\\s)${entry.startPage}(\\s|$)`).test(pageText)) score += 2;
  return score;
}

async function locateEntryInBooks(accessToken: string, books: DriveItem[], entry: CourseMapEntry, map: ParsedCourseMap) {
  const candidates = booksForPart(books, entry.partHint);
  const index = map.ordered.findIndex((item) => item.lessonId === entry.lessonId);
  const next = index >= 0 ? map.ordered[index + 1] : null;
  let best: LocatedEntry | null = null;

  for (const sourceBook of candidates) {
    const sourcePath = await ensureBookDownloaded(accessToken, sourceBook);
    const pages = await readPdfPages(sourcePath);
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const score = scoreEntry(pages[pageIndex] || '', entry);
      if (score < 5 || (best && score <= best.score)) continue;
      let last = pageIndex + 2;
      if (next) {
        for (let nextIndex = pageIndex + 1; nextIndex < Math.min(pages.length, pageIndex + 14); nextIndex++) {
          if (scoreEntry(pages[nextIndex] || '', next) >= 5) {
            last = nextIndex;
            break;
          }
        }
      }
      best = {
        sourceBook,
        sourcePath,
        firstPhysicalPage: pageIndex + 1,
        lastPhysicalPage: Math.min(pages.length, Math.max(pageIndex + 1, last)),
        score,
      };
    }
  }
  return best;
}

function scorePrintedPageNumber(pageText: string, printedPage: number) {
  const lines = pageText.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  let score = 0;
  const page = String(printedPage);
  for (const line of [...lines.slice(0, 8), ...lines.slice(-8)]) {
    if (line === page) score = Math.max(score, 10);
    else if (new RegExp(`^${page}\\s|\\s${page}$`).test(line)) score = Math.max(score, 8);
  }
  return score;
}

async function locatePrintedPageInBooks(accessToken: string, books: DriveItem[], printedPage: number, partHint: string | null) {
  const candidates = booksForPart(books, partHint);
  let best: { sourceBook: DriveItem; sourcePath: string; physicalPage: number; score: number } | null = null;
  for (const sourceBook of candidates) {
    const sourcePath = await ensureBookDownloaded(accessToken, sourceBook);
    const pages = await readPdfPages(sourcePath);
    for (let index = 0; index < pages.length; index++) {
      const score = scorePrintedPageNumber(pages[index] || '', printedPage);
      if (score >= 8 && (!best || score > best.score)) {
        best = { sourceBook, sourcePath, physicalPage: index + 1, score };
      }
    }
  }
  return best;
}

function pageNumberFromFilename(filename: string) {
  const match = filename.match(/page-(\d+)\.pdf$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function extractPdfRange(sourcePath: string, fileId: string, firstPage: number, lastPage: number) {
  const dataDir = process.env.DATA_DIR?.trim() || '/data';
  const excerptDir = path.join(dataDir, 'cache', 'lesson-source', 'excerpts');
  await mkdir(excerptDir, { recursive: true });
  const output = path.join(excerptDir, `${fileId}-${firstPage}-${lastPage}.pdf`);
  if (await fileExists(output)) return output;

  const temporaryDir = path.join(excerptDir, `tmp-${fileId}-${firstPage}-${lastPage}-${process.pid}-${Date.now()}`);
  await mkdir(temporaryDir, { recursive: true });
  try {
    await execFileAsync('pdfseparate', [
      '-f', String(firstPage),
      '-l', String(lastPage),
      sourcePath,
      path.join(temporaryDir, 'page-%d.pdf'),
    ], { timeout: 120_000 });

    const pageFiles = (await readdir(temporaryDir))
      .filter((name) => /^page-\d+\.pdf$/i.test(name))
      .sort((a, b) => pageNumberFromFilename(a) - pageNumberFromFilename(b))
      .map((name) => path.join(temporaryDir, name));
    if (!pageFiles.length) throw new Error('Не удалось выделить страницы PDF');
    if (pageFiles.length === 1) await copyFile(pageFiles[0], output);
    else await execFileAsync('pdfunite', [...pageFiles, output], { timeout: 120_000 });
    return output;
  } finally {
    await rm(temporaryDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function uploadPdfToKie(filePath: string, filename: string, apiKey: string) {
  const bytes = await import('node:fs/promises').then(({ readFile: readBytes }) => readBytes(filePath));
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: PDF_MIME }), filename);
  form.append('uploadPath', 'masterurok/source-excerpts');
  form.append('fileName', filename);
  const response = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as {
    data?: { downloadUrl?: string; fileUrl?: string };
    msg?: string;
  } | null;
  const url = payload?.data?.downloadUrl || payload?.data?.fileUrl;
  if (!response.ok || !url) throw new Error(payload?.msg || `KIE upload HTTP ${response.status}`);
  return url;
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 100) || 'lesson-source.pdf';
}

export async function prepareLessonSource(context: LessonSourceContext, kieApiKey: string): Promise<PreparedLessonSource | null> {
  if (!context.courseFolderId) return null;

  const values = [context.note, context.topic, context.module];
  const explicitPages = detectExplicitPages(values);
  const requestedReference = detectLessonReference([context.module, context.topic, context.note]);
  if (!explicitPages && !requestedReference) return null;

  const accessToken = await refreshGoogleAccessToken();
  const courseMap = await getCourseMap(accessToken, context.courseFolderId, context.courseTitle);
  const mapEntry = requestedReference ? courseMap.aliases.get(requestedReference) || null : null;
  const sourceBooks = await findStudentBooks(accessToken, context.courseFolderId);
  if (!sourceBooks.length) return null;

  let printedStart: number | null = explicitPages?.start ?? mapEntry?.startPage ?? null;
  let printedEnd: number | null = explicitPages?.end ?? mapEntry?.endPage ?? null;
  const reference = explicitPages
    ? `стр. ${explicitPages.start}${explicitPages.end !== explicitPages.start ? `–${explicitPages.end}` : ''}`
    : requestedReference || mapEntry?.lessonId || 'урок';
  const partHint = mapEntry?.partHint || detectPartHint(values);

  let sourceBook: DriveItem | null = null;
  let sourcePath = '';
  let firstPhysicalPage = 0;
  let lastPhysicalPage = 0;

  if (mapEntry) {
    const located = await locateEntryInBooks(accessToken, sourceBooks, mapEntry, courseMap);
    if (located) {
      sourceBook = located.sourceBook;
      sourcePath = located.sourcePath;
      firstPhysicalPage = located.firstPhysicalPage;
      if (explicitPages && mapEntry.startPage != null) {
        firstPhysicalPage += Math.max(0, explicitPages.start - mapEntry.startPage);
        lastPhysicalPage = firstPhysicalPage + Math.max(0, explicitPages.end - explicitPages.start);
      } else {
        lastPhysicalPage = located.lastPhysicalPage;
      }
    }
  }

  if (!sourceBook && printedStart != null) {
    const locatedPrinted = await locatePrintedPageInBooks(accessToken, sourceBooks, printedStart, partHint);
    if (locatedPrinted) {
      sourceBook = locatedPrinted.sourceBook;
      sourcePath = locatedPrinted.sourcePath;
      firstPhysicalPage = locatedPrinted.physicalPage;
      lastPhysicalPage = firstPhysicalPage + Math.max(0, (printedEnd ?? printedStart) - printedStart);
    }
  }

  if (!sourceBook && printedStart != null) {
    const candidates = booksForPart(sourceBooks, partHint);
    sourceBook = candidates[0] || sourceBooks[0];
    sourcePath = await ensureBookDownloaded(accessToken, sourceBook);
    const pageOffset = configuredPageOffset(context.courseTitle, context.courseProfile);
    firstPhysicalPage = printedStart + pageOffset;
    lastPhysicalPage = (printedEnd ?? printedStart) + pageOffset;
  }

  if (!sourceBook || !sourcePath || firstPhysicalPage < 1 || lastPhysicalPage < firstPhysicalPage) return null;
  if (lastPhysicalPage - firstPhysicalPage > 20) lastPhysicalPage = firstPhysicalPage + 20;

  const excerptPath = await extractPdfRange(sourcePath, sourceBook.id, firstPhysicalPage, lastPhysicalPage);
  await access(excerptPath);

  const rangeText = printedStart != null
    ? `стр. ${printedStart}${printedEnd != null && printedEnd !== printedStart ? `–${printedEnd}` : ''}`
    : `фрагмент ${requestedReference || mapEntry?.lessonId || ''}`.trim();
  const displayReference = requestedReference || mapEntry?.aliases.find((alias) => /^\d{1,2}[a-c]$|^unit\d+$|^module\d+[a-h]$/.test(alias)) || mapEntry?.lessonId || null;
  const label = [
    context.courseTitle,
    displayReference,
    mapEntry?.title || null,
    rangeText,
    sourceBook.name,
  ].filter(Boolean).join(' · ');
  const filename = safeFilename(`${context.courseTitle}-${requestedReference || `pages-${printedStart ?? firstPhysicalPage}-${printedEnd ?? lastPhysicalPage}`}.pdf`);
  const kieFileUrl = await uploadPdfToKie(excerptPath, filename, kieApiKey);

  return {
    label,
    reference,
    printedStart,
    printedEnd,
    sourceFileId: sourceBook.id,
    sourceFileName: sourceBook.name,
    kieFileUrl,
    excerptPath,
  };
}
