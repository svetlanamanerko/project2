import 'server-only';

import { createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
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
  printedStart: number;
  printedEnd: number;
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
  section: string;
  title: string;
  startPage: number;
  endPage: number;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('ru-RU');
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
  return compact.toLocaleLowerCase('ru-RU');
}

function detectLessonReference(values: Array<string | null>) {
  for (const value of values) {
    if (!value) continue;
    const lesson = value.match(/\bL\s*0?(\d{1,2})\b/i);
    if (lesson) return normalizeLessonReference(`L${lesson[1]}`);
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
    if (end - start > 12) continue;
    return { start, end };
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

function parseCourseMap(text: string) {
  const entries = new Map<string, CourseMapEntry>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = line.match(/\b(L\d{1,2})\s*[—–-]\s*((?:10|[1-9])[abc])\b/i);
    if (!header) continue;

    const pageMatches = [...line.matchAll(/\bpp?\.\s*(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?/gi)];
    if (!pageMatches.length) continue;
    const ranges = pageMatches.map((match) => ({
      start: Number(match[1]),
      end: Number(match[2] || match[1]),
    })).filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end));
    if (!ranges.length) continue;

    const lessonId = normalizeLessonReference(header[1]);
    const section = normalizeLessonReference(header[2]);
    const firstPageMarker = line.search(/\bpp?\./i);
    const prefixEnd = (header.index || 0) + header[0].length;
    const title = firstPageMarker > prefixEnd
      ? line.slice(prefixEnd, firstPageMarker).trim().replace(/[.—–-]+$/g, '').trim()
      : '';
    const entry: CourseMapEntry = {
      lessonId,
      section,
      title,
      startPage: Math.min(...ranges.map((range) => range.start)),
      endPage: Math.max(...ranges.map((range) => range.end)),
    };
    entries.set(lessonId, entry);
    entries.set(section, entry);
  }
  return entries;
}

async function getCourseMap(accessToken: string, courseFolderId: string) {
  const rootItems = await listChildren(accessToken, courseFolderId);
  const mapFolder = rootItems.find((item) => item.mimeType === FOLDER_MIME && normalizeName(item.name).includes('COURSE MAP'));
  if (!mapFolder) return new Map<string, CourseMapEntry>();
  const mapItems = await listChildren(accessToken, mapFolder.id);
  const mapDoc = mapItems.find((item) => item.mimeType === DOC_MIME && normalizeName(item.name).includes('COURSE MAP'));
  if (!mapDoc) return new Map<string, CourseMapEntry>();
  return parseCourseMap(await exportGoogleDocText(accessToken, mapDoc.id));
}

async function findStudentBook(accessToken: string, courseFolderId: string) {
  const rootItems = await listChildren(accessToken, courseFolderId);
  const sourceFolder = rootItems.find((item) => item.mimeType === FOLDER_MIME && normalizeName(item.name).includes('SOURCE BOOK'));
  const sourceItems = sourceFolder ? await listChildren(accessToken, sourceFolder.id) : rootItems;
  const pdfs = sourceItems.filter((item) => item.mimeType === PDF_MIME || item.name.toLocaleLowerCase().endsWith('.pdf'));
  return pdfs.find((item) => {
    const name = normalizeName(item.name);
    return name.includes('STUDENT') && name.includes('BOOK') && !name.includes('WORKBOOK');
  }) || pdfs.find((item) => !normalizeName(item.name).includes('TEACHER') && !normalizeName(item.name).includes('WORKBOOK')) || null;
}

function configuredPageOffset(courseTitle: string, courseProfile: unknown) {
  if (courseProfile && typeof courseProfile === 'object') {
    const profile = courseProfile as Record<string, unknown>;
    const raw = profile.sourcePageOffset ?? profile.pageOffset;
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= -20 && raw <= 20) return raw;
  }
  const known: Record<string, number> = {
    'SPOTLIGHT 5': 3,
  };
  return known[normalizeName(courseTitle)] ?? 0;
}

async function fileExists(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 1024;
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
  const bytes = await import('node:fs/promises').then(({ readFile }) => readFile(filePath));
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

  const explicitPages = detectExplicitPages([context.note, context.topic, context.module]);
  const requestedReference = detectLessonReference([context.module, context.topic, context.note]);
  if (!explicitPages && !requestedReference) return null;

  const accessToken = await refreshGoogleAccessToken();
  let printedStart: number;
  let printedEnd: number;
  let reference: string;
  let mapTitle = '';

  if (explicitPages) {
    printedStart = explicitPages.start;
    printedEnd = explicitPages.end;
    reference = `стр. ${printedStart}${printedEnd !== printedStart ? `–${printedEnd}` : ''}`;
  } else {
    const courseMap = await getCourseMap(accessToken, context.courseFolderId);
    const entry = requestedReference ? courseMap.get(requestedReference) : null;
    if (!entry) return null;
    printedStart = entry.startPage;
    printedEnd = entry.endPage;
    reference = entry.section;
    mapTitle = entry.title;
  }

  if (printedEnd - printedStart > 12) return null;
  const sourceBook = await findStudentBook(accessToken, context.courseFolderId);
  if (!sourceBook) return null;

  const pageOffset = configuredPageOffset(context.courseTitle, context.courseProfile);
  const firstPhysicalPage = printedStart + pageOffset;
  const lastPhysicalPage = printedEnd + pageOffset;
  if (firstPhysicalPage < 1 || lastPhysicalPage < firstPhysicalPage) return null;

  const dataDir = process.env.DATA_DIR?.trim() || '/data';
  const sourcePath = path.join(dataDir, 'cache', 'lesson-source', 'books', `${sourceBook.id}.pdf`);
  await downloadDriveFile(accessToken, sourceBook.id, sourcePath);
  const excerptPath = await extractPdfRange(sourcePath, sourceBook.id, firstPhysicalPage, lastPhysicalPage);
  await access(excerptPath);

  const rangeText = `стр. ${printedStart}${printedEnd !== printedStart ? `–${printedEnd}` : ''}`;
  const label = [context.courseTitle, requestedReference && !explicitPages ? reference : null, mapTitle || null, rangeText, sourceBook.name]
    .filter(Boolean)
    .join(' · ');
  const filename = safeFilename(`${context.courseTitle}-${requestedReference || `pages-${printedStart}-${printedEnd}`}.pdf`);
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
