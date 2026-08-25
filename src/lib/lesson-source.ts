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
    const unit = value.match(/\bUnit\s*(\d{1,2})\b/i);
    if (unit) return normalizeLessonReference(`unit${unit[1]}`);
    const moduleSection = value.match(/\bModule\s*(\d{1,2})\s*([A-H])\b/i);
    if (moduleSection) return normalizeLessonReference(`module${moduleSection[1]}${moduleSection[2]}`);
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
    let start = Number(match[1]);
    let end = match[2] ? Number(match[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1) continue;
    if (end < start) [start, end] = [end, start];
    if (end - start > 20) continue;
    return { start, end };
  }
  return null;
}

function detectPartHint(values: Array<string | null>) {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/\b(?:Part|част[ьи])\s*([12])\b/i);
    if (match) return `part${match[1]}`;
  }
  return null;
}

async function driveJson<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Google Drive API HTTP ${response.status}`);
  return payload as T;
}

async function listChildren(accessToken: string, folderId: string) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
    pageSize: '1000',
  });
  const payload = await driveJson<{ files?: DriveItem[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );
  return payload.files || [];
}

async function exportGoogleDocText(accessToken: string, fileId: string) {
  const mime = encodeURIComponent('text/plain');
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${mime}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' },
  );
  if (!response.ok) throw new Error(`Google Docs export HTTP ${response.status}`);
  return response.text();
}

function deriveMapTitle(tail: string) {
  const pageMarker = tail.search(/\b(?:SB\s*)?pp?\.?\s*\d/i);
  let beforePages = pageMarker >= 0 ? tail.slice(0, pageMarker) : tail;
  let afterPages = pageMarker >= 0 ? tail.slice(pageMarker) : '';

  beforePages = beforePages
    .replace(/^\s*(?:10|[1-9])\s*[abcабс]\b\s*/i, '')
    .replace(/^\s*UNIT\s+\d{1,2}\s*[—–-]?\s*/i, '')
    .replace(/^\s*Module\s+\d{1,2}\s*[A-H]?(?:\s*[–—-]\s*[A-H])?\s*/i, '')
    .replace(/^\s*(?:CORE|WRITING\s*&\s*FUNCTION|MASTERY)\b\s*/i, '')
    .trim();

  beforePages = beforePages
    .split(/\b(?:Vocabulary|Grammar|Reading|Listening|Speaking|Writing|Functions?|Consolidation|CORE)\s*:/i)[0]
    .replace(/[.—–-]+$/g, '')
    .trim();

  if (beforePages.length >= 4) return beforePages.slice(0, 180);

  if (afterPages) {
    afterPages = afterPages
      .replace(/^\b(?:SB\s*)?pp?\.?\s*\d{1,3}(?:\s*[–—-]\s*\d{1,3})?\s*[.]?\s*/i, '')
      .trim();
    const sentence = afterPages.split(/\.\s+/)[0]?.trim() || '';
    if (sentence.length >= 4) return sentence.slice(0, 180);
  }
  return '';
}

function addAlias(target: string[], value: string | null) {
  if (!value) return;
  const normalized = normalizeLessonReference(value);
  if (normalized && !target.includes(normalized)) target.push(normalized);
}

function parseCourseMap(text: string): ParsedCourseMap {
  const aliases = new Map<string, CourseMapEntry>();
  const ordered: CourseMapEntry[] = [];
  let partHint: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const partMatches = [...line.matchAll(/\bPart\s*([12])\b/gi)];
    if (partMatches.length === 1 && (/\bMODULE\b/i.test(line) || !/[+&]/.test(line))) {
      partHint = `part${partMatches[0][1]}`;
    }

    const lessonMatch = line.match(/\b(L\d{1,2})\b\s*[—–-]\s*(.+)$/i);
    if (!lessonMatch) continue;

    const lessonId = normalizeLessonReference(lessonMatch[1]);
    const tail = lessonMatch[2].trim();
    const entryAliases: string[] = [lessonId];

    const section = tail.match(/\b(10|[1-9])\s*([abcабс])\b/i);
    if (section) addAlias(entryAliases, `${section[1]}${section[2]}`);

    const unit = tail.match(/\bUNIT\s+(\d{1,2})\b/i);
    if (unit) addAlias(entryAliases, `unit${unit[1]}`);

    const moduleSection = tail.match(/\bModule\s+(\d{1,2})\s*([A-H])\b/i);
    if (moduleSection) {
      addAlias(entryAliases, `module${moduleSection[1]}${moduleSection[2]}`);
      addAlias(entryAliases, `${moduleSection[1]}${moduleSection[2]}`);
    }

    const pageMatches = [...line.matchAll(/\b(?:SB\s*)?pp?\.?\s*(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?/gi)];
    const ranges = pageMatches.map((match) => ({
      start: Number(match[1]),
      end: Number(match[2] || match[1]),
    })).filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end));

    const entry: CourseMapEntry = {
      lessonId,
      aliases: entryAliases,
      title: deriveMapTitle(tail),
      startPage: ranges.length ? Math.min(...ranges.map((range) => range.start)) : null,
      endPage: ranges.length ? Math.max(...ranges.map((range) => range.end)) : null,
      partHint,
      raw: line,
    };

    ordered.push(entry);
    for (const alias of entryAliases) {
      if (!aliases.has(alias)) aliases.set(alias, entry);
    }
  }

  return { aliases, ordered };
}

function emptyCourseMap(): ParsedCourseMap {
  return { aliases: new Map<string, CourseMapEntry>(), ordered: [] };
}

async function getCourseMap(accessToken: string, courseFolderId: string, courseTitle: string) {
  const rootItems = await listChildren(accessToken, courseFolderId);
  const mapFolder = rootItems.find((item) => item.mimeType === FOLDER_MIME && normalizeName(item.name).includes('COURSE MAP'));
  if (!mapFolder) return emptyCourseMap();
  const mapItems = await listChildren(accessToken, mapFolder.id);
  const candidates = mapItems.filter((item) => item.mimeType === DOC_MIME && normalizeName(item.name).includes('COURSE MAP'));
  if (!candidates.length) return emptyCourseMap();

  const courseName = normalizeName(courseTitle);
  candidates.sort((a, b) => {
    const score = (item: DriveItem) => {
      const name = normalizeName(item.name);
      let value = 0;
      if (name.includes(courseName)) value += 20;
      if (name.includes('2026')) value += 4;
      if (name.includes('ARCHIVE') || name.includes('OLDER') || name.includes('BEFORE')) value -= 50;
      if (name.includes('AUGUST') || name.includes('BRIDGE')) value -= 10;
      return value;
    };
    return score(b) - score(a);
  });

  return parseCourseMap(await exportGoogleDocText(accessToken, candidates[0].id));
}

function bookPartNumber(name: string) {
  const match = name.match(/\bPart\s*([12])\b/i) || name.match(/\bчаст[ьи]\s*([12])\b/i);
  return match ? Number(match[1]) : 0;
}

async function findStudentBooks(accessToken: string, courseFolderId: string) {
  const rootItems = await listChildren(accessToken, courseFolderId);
  const sourceFolder = rootItems.find((item) => item.mimeType === FOLDER_MIME && normalizeName(item.name).includes('SOURCE BOOK'));
  const sourceItems = sourceFolder ? await listChildren(accessToken, sourceFolder.id) : rootItems;
  const pdfs = sourceItems.filter((item) => item.mimeType === PDF_MIME || item.name.toLocaleLowerCase().endsWith('.pdf'));
  const primary = pdfs.filter((item) => {
    const name = normalizeName(item.name);
    return name.includes('STUDENT') && name.includes('BOOK') && !name.includes('WORKBOOK') && !name.includes('TEACHER');
  });
  const fallback = pdfs.filter((item) => {
    const name = normalizeName(item.name);
    return !name.includes('TEACHER') && !name.includes('WORKBOOK') && !name.includes('TEST') && !name.includes('GRAMMAR');
  });
  const books = primary.length ? primary : fallback;
  return books.sort((a, b) => {
    const aDup = normalizeName(a.name).includes('DUP') ? 1 : 0;
    const bDup = normalizeName(b.name).includes('DUP') ? 1 : 0;
    if (aDup !== bDup) return aDup - bDup;
    const partDiff = bookPartNumber(a.name) - bookPartNumber(b.name);
    if (partDiff) return partDiff;
    return a.name.localeCompare(b.name, 'en', { numeric: true });
  });
}

function booksForPart(books: DriveItem[], partHint: string | null) {
  if (!partHint) return books;
  const part = Number(partHint.replace(/\D/g, ''));
  if (!part) return books;
  const matching = books.filter((book) => bookPartNumber(book.name) === part);
  return matching.length ? matching : books;
}

function configuredPageOffset(courseTitle: string, courseProfile: unknown) {
  if (courseProfile && typeof courseProfile === 'object') {
    const profile = courseProfile as Record<string, unknown>;
    const raw = profile.sourcePageOffset ?? profile.pageOffset;
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= -30 && raw <= 30) return raw;
  }
  const known: Record<string, number> = {
    'SPOTLIGHT 5': 3,
  };
  return known[normalizeName(courseTitle)] ?? 0;
}

async function fileExists(filePath: string, minimumBytes = 1024) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > minimumBytes;
  } catch {
    return false;
  }
}

async function downloadDriveFile(accessToken: string, fileId: string, destination: string) {
  if (await fileExists(destination)) return destination;
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part-${process.pid}`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' },
  );
  if (!response.ok || !response.body) throw new Error(`Google Drive download HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary));
  await rename(temporary, destination);
  return destination;
}

function cachedBookPath(fileId: string) {
  const dataDir = process.env.DATA_DIR?.trim() || '/data';
  return path.join(dataDir, 'cache', 'lesson-source', 'books', `${fileId}.pdf`);
}

async function ensureBookDownloaded(accessToken: string, book: DriveItem) {
  const sourcePath = cachedBookPath(book.id);
  await downloadDriveFile(accessToken, book.id, sourcePath);
  return sourcePath;
}

async function getPdfTextPages(sourcePath: string, fileId: string) {
  const dataDir = process.env.DATA_DIR?.trim() || '/data';
  const textDir = path.join(dataDir, 'cache', 'lesson-source', 'text');
  await mkdir(textDir, { recursive: true });
  const textPath = path.join(textDir, `${fileId}.txt`);
  if (!(await fileExists(textPath, 50))) {
    const temporary = `${textPath}.part-${process.pid}`;
    await execFileAsync('pdftotext', ['-layout', sourcePath, temporary], { timeout: 180_000 });
    await rename(temporary, textPath);
  }
  return (await readFile(textPath, 'utf8')).split('\f');
}

function titleTokens(title: string) {
  const stop = new Set(['CORE', 'MODULE', 'UNIT', 'LESSON', 'THE', 'AND', 'WITH', 'FROM', 'ABOUT', 'PART']);
  return normalizeLoose(title)
    .split(' ')
    .filter((token) => token.length >= 4 && !stop.has(token))
    .slice(0, 10);
}

function scorePageForEntry(page: string, entry: CourseMapEntry) {
  const normalized = normalizeLoose(page);
  if (!normalized) return 0;
  let score = 0;

  const normalizedTitle = normalizeLoose(entry.title);
  if (normalizedTitle.length >= 6 && normalized.includes(normalizedTitle)) score += 14;
  const tokens = titleTokens(entry.title);
  const matchedTokens = tokens.filter((token) => normalized.includes(token)).length;
  score += Math.min(10, matchedTokens * 2);
  if (matchedTokens >= 2) score += 3;

  for (const alias of entry.aliases) {
    if (/^\d{1,2}[a-c]$/.test(alias)) {
      const compact = alias.toUpperCase();
      if (normalized.replace(/\s+/g, '').includes(compact)) score += 7;
    } else if (/^unit\d+$/.test(alias)) {
      const number = alias.replace(/\D/g, '');
      if (normalized.includes(`UNIT ${number}`) || normalized.replace(/\s+/g, '').includes(`UNIT${number}`)) score += 7;
    } else if (/^module\d+[a-h]$/.test(alias)) {
      const compact = alias.toUpperCase();
      if (normalized.replace(/\s+/g, '').includes(compact)) score += 6;
    }
  }

  return score;
}

function bestPageForEntry(pages: string[], entry: CourseMapEntry, startIndex = 0) {
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = Math.max(0, startIndex); index < pages.length; index += 1) {
    const score = scorePageForEntry(pages[index] || '', entry);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return { index: bestIndex, score: bestScore };
}

function scorePrintedPageNumber(page: string, printedPage: number) {
  const lines = page.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const edge = [...lines.slice(0, 8), ...lines.slice(-8)];
  const value = String(printedPage);
  let score = 0;
  for (const line of edge) {
    if (line === value) score = Math.max(score, 12);
    else if (new RegExp(`^${value}\\b|\\b${value}$`).test(line)) score = Math.max(score, 8);
  }
  return score;
}

function nextMapEntry(courseMap: ParsedCourseMap, entry: CourseMapEntry) {
  const index = courseMap.ordered.indexOf(entry);
  if (index < 0) return null;
  for (let nextIndex = index + 1; nextIndex < courseMap.ordered.length; nextIndex += 1) {
    const candidate = courseMap.ordered[nextIndex];
    if (!entry.partHint || !candidate.partHint || candidate.partHint === entry.partHint) return candidate;
  }
  return null;
}

async function locateEntryInBooks(
  accessToken: string,
  books: DriveItem[],
  entry: CourseMapEntry,
  courseMap: ParsedCourseMap,
): Promise<LocatedEntry | null> {
  const candidates = booksForPart(books, entry.partHint);
  let best: LocatedEntry | null = null;

  for (const sourceBook of candidates) {
    const sourcePath = await ensureBookDownloaded(accessToken, sourceBook);
    const pages = await getPdfTextPages(sourcePath, sourceBook.id);
    const current = bestPageForEntry(pages, entry);
    if (current.index < 0 || current.score < 7) continue;

    let lastPhysicalPage: number;
    if (entry.startPage != null && entry.endPage != null) {
      lastPhysicalPage = current.index + 1 + Math.max(0, entry.endPage - entry.startPage);
    } else {
      const next = nextMapEntry(courseMap, entry);
      let nextStart = -1;
      if (next) {
        const locatedNext = bestPageForEntry(pages, next, current.index + 1);
        if (locatedNext.score >= 7 && locatedNext.index > current.index && locatedNext.index - current.index <= 10) {
          nextStart = locatedNext.index + 1;
        }
      }
      lastPhysicalPage = nextStart > 0 ? nextStart - 1 : current.index + 2;
    }

    lastPhysicalPage = Math.min(pages.length, Math.max(current.index + 1, lastPhysicalPage));
    const located: LocatedEntry = {
      sourceBook,
      sourcePath,
      firstPhysicalPage: current.index + 1,
      lastPhysicalPage,
      score: current.score,
    };
    if (!best || located.score > best.score) best = located;
  }

  return best;
}

async function locatePrintedPageInBooks(
  accessToken: string,
  books: DriveItem[],
  printedPage: number,
  partHint: string | null,
) {
  const candidates = booksForPart(books, partHint);
  let best: { sourceBook: DriveItem; sourcePath: string; physicalPage: number; score: number } | null = null;
  for (const sourceBook of candidates) {
    const sourcePath = await ensureBookDownloaded(accessToken, sourceBook);
    const pages = await getPdfTextPages(sourcePath, sourceBook.id);
    for (let index = 0; index < pages.length; index += 1) {
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
  };
}
