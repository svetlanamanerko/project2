import 'server-only';
import { getGoogleDriveStatus, refreshGoogleAccessToken, type DriveFolder } from '@/lib/google-drive';

const SCHOOL_ROOT_NAME = '01 SCHOOL COURSES';

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
  folders: DriveFolder[];
}> {
  const status = await getGoogleDriveStatus();
  if (!status.connected) return { connected: false, folders: [] };

  const accessToken = await refreshGoogleAccessToken();
  const root = await driveFetch<{ id: string }>(
    accessToken,
    'https://www.googleapis.com/drive/v3/files/root?fields=id&supportsAllDrives=true',
  );

  const topLevel = await listChildFolders(accessToken, root.id);
  const schoolRoot = topLevel.find((folder) => folder.name === SCHOOL_ROOT_NAME) || null;
  const schoolCourses = schoolRoot ? await listChildFolders(accessToken, schoolRoot.id) : [];

  const candidates = new Map<string, DriveFolder>();

  // Верхний уровень нужен для самостоятельных мастер-папок вроде 02 OGE MASTER.
  // Контейнер 01 SCHOOL COURSES сам по себе источником отдельного курса не является.
  for (const folder of topLevel) {
    if (folder.id !== schoolRoot?.id) candidates.set(folder.id, folder);
  }

  // Для школьных курсов источником является корневая папка самого курса:
  // Spotlight 4, Spotlight 7, Starlight 9 и т. п., но не их вложенные папки.
  for (const folder of schoolCourses) candidates.set(folder.id, folder);

  return {
    connected: true,
    folders: Array.from(candidates.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  };
}
