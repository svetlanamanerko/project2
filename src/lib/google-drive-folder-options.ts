import 'server-only';
import { getGoogleDriveStatus, refreshGoogleAccessToken } from '@/lib/google-drive';

type RawDriveFolder = {
  id: string;
  name: string;
  webViewLink?: string;
  parents?: string[];
};

export type DriveFolderOption = {
  id: string;
  name: string;
  path: string;
  webViewLink?: string;
};

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

function buildFolderPaths(folders: RawDriveFolder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const memo = new Map<string, string>();

  function resolve(folderId: string, seen = new Set<string>()): string {
    const cached = memo.get(folderId);
    if (cached) return cached;
    const folder = byId.get(folderId);
    if (!folder) return '';
    if (seen.has(folderId)) return folder.name;

    const nextSeen = new Set(seen);
    nextSeen.add(folderId);
    const parentId = folder.parents?.find((id) => byId.has(id));
    const parentPath = parentId ? resolve(parentId, nextSeen) : '';
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    memo.set(folderId, path);
    return path;
  }

  return folders.map<DriveFolderOption>((folder) => ({
    id: folder.id,
    name: folder.name,
    path: resolve(folder.id),
    webViewLink: folder.webViewLink,
  }));
}

export async function getGoogleDriveFolderOptions(): Promise<{
  connected: boolean;
  folders: DriveFolderOption[];
}> {
  const status = await getGoogleDriveStatus();
  if (!status.connected) return { connected: false, folders: [] };

  const accessToken = await refreshGoogleAccessToken();
  const folders = new Map<string, RawDriveFolder>();
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'nextPageToken,files(id,name,webViewLink,parents)',
      pageSize: '1000',
      spaces: 'drive',
      corpora: 'user',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const page = await driveFetch<{ files?: RawDriveFolder[]; nextPageToken?: string }>(
      accessToken,
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    );
    for (const folder of page.files || []) folders.set(folder.id, folder);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return {
    connected: true,
    folders: buildFolderPaths(Array.from(folders.values()))
      .sort((a, b) => a.path.localeCompare(b.path, 'ru')),
  };
}
