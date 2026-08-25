import 'server-only';
import { db } from '@/lib/db';
import { refreshGoogleAccessToken } from '@/lib/google-drive';
import { rankByIntent } from '@/lib/learning-context-utils';

type DriveCandidate = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  path: string;
};

const FOLDER = 'application/vnd.google-apps.folder';

async function listFolder(token: string, parentId: string) {
  const items = new Map<string, Omit<DriveCandidate, 'path'>>();
  let pageToken: string | undefined;

  do {
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
}: {
  courseId: string;
  studentId: string;
  lessonIntent: Record<string, unknown>;
  usedMaterialIds?: string[];
  limit?: number;
}) {
  const rows = await db()<Array<{ folderId: string | null }>>`
    SELECT drive_folder_id as "folderId" FROM courses WHERE id=${courseId} AND active=true LIMIT 1
  `;
  const courseFolderId = rows[0]?.folderId;
  if (!courseFolderId) return [];

  const token = await refreshGoogleAccessToken();
  const found = new Map<string, DriveCandidate>();
  const visitedFolders = new Set<string>();
  const pending = [{ id: courseFolderId, path: '' }];

  while (pending.length) {
    const folder = pending.shift()!;
    if (visitedFolders.has(folder.id)) continue;
    visitedFolders.add(folder.id);

    for (const item of await listFolder(token, folder.id)) {
      const path = [folder.path, item.name].filter(Boolean).join(' / ');
      if (item.mimeType === FOLDER) pending.push({ id: item.id, path });
      else found.set(item.id, { ...item, path });
    }
  }

  return rankByIntent(Array.from(found.values()), lessonIntent, usedMaterialIds, limit);
}
