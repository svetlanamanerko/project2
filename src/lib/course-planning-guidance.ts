import 'server-only';
import { refreshGoogleAccessToken } from '@/lib/google-drive';
import {
  compactPlanningText,
  isPlanningGuidanceFolder,
  moduleBriefScore,
  moduleNumberFromIntent,
  planningDocumentKind,
  type PlanningDocumentKind,
} from '@/lib/course-planning-guidance-utils';

const FOLDER = 'application/vnd.google-apps.folder';
const GOOGLE_DOC = 'application/vnd.google-apps.document';
const REQUEST_TIMEOUT_MS = 5_500;
const CACHE_TTL_MS = 5 * 60 * 1000;

type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

export type PlanningGuidanceDocument = {
  id: string;
  title: string;
  url: string | null;
  text: string;
};

export type CoursePlanningGuidance = {
  available: boolean;
  module: string | null;
  hierarchy: string[];
  federalBaseline: PlanningGuidanceDocument | null;
  assessmentMap: PlanningGuidanceDocument | null;
  coursePriorityMap: PlanningGuidanceDocument | null;
  courseMap: PlanningGuidanceDocument | null;
  moduleBrief: PlanningGuidanceDocument | null;
};

const cache = new Map<string, { expiresAt: number; value: CoursePlanningGuidance }>();

function emptyGuidance(moduleNumber: number | null): CoursePlanningGuidance {
  return {
    available: false,
    module: moduleNumber ? `Module ${moduleNumber}` : null,
    hierarchy: [
      'Federal Baseline — обязательные результаты курса',
      'Assessment Map — официальная/школьная evidence layer',
      'Course Priority Map — CORE / IMPORTANT / HOME / SKIP решения',
      'Module Brief — конкретные end-of-module outcomes и маршрут текущего модуля',
      'Course Map — фактические слоты, темы и страницы курса',
    ],
    federalBaseline: null,
    assessmentMap: null,
    coursePriorityMap: null,
    courseMap: null,
    moduleBrief: null,
  };
}

async function driveJson<T>(token: string, url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Google Drive planning context HTTP ${response.status}`);
  return payload as T;
}

async function listChildren(token: string, parentId: string, signal?: AbortSignal) {
  const params = new URLSearchParams({
    q: `'${parentId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,webViewLink)',
    pageSize: '1000',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });
  const payload = await driveJson<{ files?: DriveEntry[] }>(
    token,
    `https://www.googleapis.com/drive/v3/files?${params}`,
    signal,
  );
  return payload.files || [];
}

async function exportGoogleDocText(token: string, fileId: string, signal?: AbortSignal) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`Google Docs planning export HTTP ${response.status}`);
  return response.text();
}

function pickByKind(entries: DriveEntry[], kind: PlanningDocumentKind) {
  return entries.find((entry) => (
    entry.mimeType === GOOGLE_DOC
    && planningDocumentKind(entry.name) === kind
    && !/ARCHIVE|АРХИВ|TEMPLATE|ШАБЛОН/i.test(entry.name)
  )) || null;
}

function pickModuleBrief(entries: DriveEntry[], moduleNumber: number | null) {
  return entries
    .filter((entry) => entry.mimeType === GOOGLE_DOC && planningDocumentKind(entry.name) === 'module-brief')
    .map((entry) => ({ entry, score: moduleBriefScore(entry.name, moduleNumber) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'ru'))[0]?.entry || null;
}

async function hydrate(
  token: string,
  entry: DriveEntry | null,
  kind: PlanningDocumentKind,
  moduleNumber: number | null,
  signal?: AbortSignal,
): Promise<PlanningGuidanceDocument | null> {
  if (!entry) return null;
  try {
    const raw = await exportGoogleDocText(token, entry.id, signal);
    const text = compactPlanningText(kind, raw, moduleNumber);
    if (!text) return null;
    return { id: entry.id, title: entry.name, url: entry.webViewLink || null, text };
  } catch (error) {
    console.error(`[course-planning-guidance] Не удалось прочитать ${entry.name}:`, error);
    return null;
  }
}

export async function getCoursePlanningGuidance({
  courseFolderId,
  lessonIntent,
  signal,
}: {
  courseFolderId: string | null;
  lessonIntent: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<CoursePlanningGuidance> {
  const moduleNumber = moduleNumberFromIntent(lessonIntent);
  if (!courseFolderId) return emptyGuidance(moduleNumber);

  const cacheKey = `${courseFolderId}:${moduleNumber ?? 'course'}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const token = await refreshGoogleAccessToken();
  const rootChildren = await listChildren(token, courseFolderId, signal);
  const planningFolders = rootChildren.filter((entry) => entry.mimeType === FOLDER && isPlanningGuidanceFolder(entry.name));
  const nested = planningFolders.length
    ? (await Promise.all(planningFolders.slice(0, 5).map((folder) => listChildren(token, folder.id, signal)))).flat()
    : [];
  const entries = Array.from(new Map([...rootChildren, ...nested].map((entry) => [entry.id, entry])).values());

  const federalEntry = pickByKind(entries, 'federal-baseline');
  const assessmentEntry = pickByKind(entries, 'assessment-map');
  const priorityEntry = pickByKind(entries, 'course-priority-map');
  const courseMapEntry = pickByKind(entries, 'course-map');
  const moduleBriefEntry = pickModuleBrief(entries, moduleNumber);

  const [federalBaseline, assessmentMap, coursePriorityMap, courseMap, moduleBrief] = await Promise.all([
    hydrate(token, federalEntry, 'federal-baseline', moduleNumber, signal),
    hydrate(token, assessmentEntry, 'assessment-map', moduleNumber, signal),
    hydrate(token, priorityEntry, 'course-priority-map', moduleNumber, signal),
    hydrate(token, courseMapEntry, 'course-map', moduleNumber, signal),
    hydrate(token, moduleBriefEntry, 'module-brief', moduleNumber, signal),
  ]);

  const value: CoursePlanningGuidance = {
    ...emptyGuidance(moduleNumber),
    available: Boolean(federalBaseline || assessmentMap || coursePriorityMap || courseMap || moduleBrief),
    federalBaseline,
    assessmentMap,
    coursePriorityMap,
    courseMap,
    moduleBrief,
  };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
