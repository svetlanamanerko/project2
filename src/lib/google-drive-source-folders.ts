import 'server-only';
import { courseFolderMatchScore, isOgeCourseTitle, pickBestCourseFolder } from '@/lib/course-folder-match-utils';
import { getGoogleDriveStatus, refreshGoogleAccessToken, type DriveFolder } from '@/lib/google-drive';

const OGE_MASTER_FOLDER_NAME = '02 OGE MASTER';
const OGE_FOLDER_CACHE_TTL_MS = 5 * 60 * 1000;
let ogeFolderCache: { expiresAt: number; folder: DriveFolder | null } | null = null;

async function driveFetch<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'error' in payload
      ? JSON.stringify((payload as { error?: unknown }).error)
      : `HTTP ${response.status}`;
    throw new Error(`Google Drive API: ${detail}`);
  }
  return payload as T;
}

async function listChildFolders(accessToken: string, parentId: string) {
  const folders = new Map<string, DriveFolder>();
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'nextPageToken,files(id,name,webViewLink)',
      pageSize: '1000',
      spaces: 'drive',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const page = await driveFetch<{ files?: DriveFolder[]; nextPageToken?: string }>(
      accessToken,
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    );
    for (const folder of page.files || []) folders.set(folder.id, folder);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return Array.from(folders.values());
}

async function findGlobalOgeMasterFolder(accessToken: string): Promise<DriveFolder | null> {
  if (ogeFolderCache && ogeFolderCache.expiresAt > Date.now()) return ogeFolderCache.folder;

  const params = new URLSearchParams({
    q: `name = '${OGE_MASTER_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name,webViewLink)',
    pageSize: '20',
    spaces: 'drive',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });
  const payload = await driveFetch<{ files?: DriveFolder[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );
  const candidates = payload.files || [];
  const folder = candidates.find((item) => item.name === OGE_MASTER_FOLDER_NAME)
    || pickBestCourseFolder('ОГЭ 2027', candidates)
    || null;
  ogeFolderCache = { expiresAt: Date.now() + OGE_FOLDER_CACHE_TTL_MS, folder };
  return folder;
}

export async function getGoogleDriveSourceFolders(): Promise<{
  connected: boolean;
  libraryRoot: DriveFolder | null;
  folders: DriveFolder[];
}> {
  const status = await getGoogleDriveStatus();
  if (!status.connected) return { connected: false, libraryRoot: null, folders: [] };

  const libraryRoot = status.rootFolderId
    ? { id: status.rootFolderId, name: status.rootFolderName || 'Google Drive Library' }
    : null;
  if (!libraryRoot) return { connected: true, libraryRoot: null, folders: [] };

  const accessToken = await refreshGoogleAccessToken();
  const candidates = new Map(
    (await listChildFolders(accessToken, libraryRoot.id)).map((folder) => [folder.id, folder]),
  );

  return {
    connected: true,
    libraryRoot,
    folders: Array.from(candidates.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  };
}

export async function resolveGoogleDriveCourseFolder(courseTitle: string, savedFolderId?: string | null): Promise<{
  folder: DriveFolder | null;
  automatic: boolean;
}> {
  const drive = await getGoogleDriveSourceFolders();
  const saved = savedFolderId ? drive.folders.find((folder) => folder.id === savedFolderId) || null : null;
  const isOge = isOgeCourseTitle(courseTitle);

  // Textbook courses intentionally respect an explicitly saved folder. OGE is different:
  // an old/stale saved folder must never override the canonical OGE MASTER source.
  if (saved && (!isOge || courseFolderMatchScore(courseTitle, saved.name) >= 50)) {
    return { folder: saved, automatic: false };
  }

  const matched = pickBestCourseFolder(courseTitle, drive.folders);
  if (matched) return { folder: matched, automatic: true };

  // 02 OGE MASTER is intentionally stored next to, not inside, 01 SCHOOL COURSES.
  // Therefore OGE resolution must also search the connected Drive globally instead of
  // assuming every course source is a direct child of the school-course library root.
  if (isOge && drive.connected) {
    const accessToken = await refreshGoogleAccessToken();
    const globalOgeMaster = await findGlobalOgeMasterFolder(accessToken);
    if (globalOgeMaster) return { folder: globalOgeMaster, automatic: true };
  }

  return { folder: null, automatic: false };
}

export async function getGoogleDriveCourseFolder(folderId: string): Promise<DriveFolder | null> {
  const status = await getGoogleDriveStatus();
  if (!status.connected || !status.rootFolderId) return null;

  const accessToken = await refreshGoogleAccessToken();
  const params = new URLSearchParams({
    fields: 'id,name,webViewLink,mimeType,trashed,parents',
    supportsAllDrives: 'true',
  });
  const folder = await driveFetch<DriveFolder & {
    mimeType?: string;
    trashed?: boolean;
    parents?: string[];
  }>(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?${params}`);

  if (
    folder.mimeType !== 'application/vnd.google-apps.folder'
    || folder.trashed === true
    || !folder.parents?.includes(status.rootFolderId)
  ) return null;

  return { id: folder.id, name: folder.name, webViewLink: folder.webViewLink };
}
