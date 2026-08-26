import 'server-only';
import { db } from '@/lib/db';
import { refreshGoogleAccessToken } from '@/lib/google-drive';
import { materialMatchScore, prioritizeMaterialBranches, rankByIntent } from '@/lib/learning-context-utils';

type DriveCandidate = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  path: string;
};

const FOLDER = 'application/vnd.google-apps.folder';
const DRIVE_REQUEST_TIMEOUT_MS = 6_000;
const MAX_DRIVE_REQUESTS = 40;
const MAX_DRIVE_FILES = 500;
const TARGETED_RESULT_MIN = 3;

async function listFolder(token: string, parentId: string, signal: AbortSignal | undefined, budget: { requests: number }) {
  const items = new Map<string, Omit<DriveCandidate, 'path'>>();
  let pageToken: string | undefined;

  do {
    if (budget.requests >= MAX_DRIVE_REQUESTS) break;
    budget.requests += 1;
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink)',
      pageSize: '1000',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(DRIVE_REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(DRIVE_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);

    const page = await response.json() as {
      files?: Array<Omit<DriveCandidate, 'path'>>;
      nextPageToken?: string;
    };
    for (const item of page.files || []) items.set(item.id, item);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return Array.from(items.values());
}

export async function getRelevantCourseMaterials({
  courseId,
  lessonIntent,
  usedMaterialIds = [],
  limit = 10,
  signal,
}: {
  courseId: string;
  studentId: string;
  lessonIntent: Record<string, unknown>;
  usedMaterialIds?: string[];
  limit?: number;
  signal?: AbortSignal;
}) {
  const rows = await db()<Array<{ folderId: string | null }>>`
    SELECT drive_folder_id as "folderId" FROM courses WHERE id=${courseId} AND active=true LIMIT 1
  `;
  const courseFolderId = rows[0]?.folderId;
  if (!courseFolderId) return [];

  const token = await refreshGoogleAccessToken();
  const found = new Map<string, DriveCandidate>();
  const visitedFolders = new Set<string>();
  const pending = [{ id: courseFolderId, path: '', score: 0 }];
  const budget = { requests: 0 };
  let targetedMatchCount = 0;

  while (pending.length && budget.requests < MAX_DRIVE_REQUESTS && found.size < MAX_DRIVE_FILES) {
    signal?.throwIfAborted();
    const folder = pending.shift()!;
    if (visitedFolders.has(folder.id)) continue;
    visitedFolders.add(folder.id);

    for (const item of await listFolder(token, folder.id, signal, budget)) {
      const path = [folder.path, item.name].filter(Boolean).join(' / ');
      const score = materialMatchScore(path, lessonIntent);
      if (item.mimeType === FOLDER) pending.push({ id: item.id, path, score });
      else if (found.size < MAX_DRIVE_FILES) {
        found.set(item.id, { ...item, path });
        if (score > 0) targetedMatchCount += 1;
      }
    }
    pending.splice(0, pending.length, ...prioritizeMaterialBranches(pending, lessonIntent));
    if (targetedMatchCount >= TARGETED_RESULT_MIN && folder.score > 0) break;
  }

  if (pending.length) console.warn(`[lesson-context] Google Drive scan stopped at ${budget.requests} requests and ${found.size} files`);

  return rankByIntent(Array.from(found.values()), lessonIntent, usedMaterialIds, limit);
}
