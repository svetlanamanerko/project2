import 'server-only';
import { getGoogleDriveStatus, refreshGoogleAccessToken, type DriveFolder } from '@/lib/google-drive';

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
