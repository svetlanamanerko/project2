import 'server-only';
import { db, dbConfigured } from '@/lib/db';
import { googleDriveOAuthConfigured, refreshGoogleAccessToken } from '@/lib/google-drive';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export type DriveMaterialItem = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  modifiedTime: string | null;
  size: string | null;
  isFolder: boolean;
};

export type DriveCourseMaterials = {
  courseId: string;
  courseTitle: string;
  folderId: string;
  folderUrl: string;
  items: DriveMaterialItem[];
};

type DriveListResponse = {
  files?: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
    webViewLink?: string;
    modifiedTime?: string;
    size?: string;
  }>;
};

async function listFolder(accessToken: string, folderId: string) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,webViewLink,modifiedTime,size)',
    pageSize: '100',
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as DriveListResponse | null;
  if (!response.ok) {
    throw new Error(`Google Drive API: ${response.status}`);
  }

  return (payload?.files || [])
    .filter((file) => file.id && file.name && file.mimeType)
    .map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      webViewLink: file.webViewLink || null,
      modifiedTime: file.modifiedTime || null,
      size: file.size || null,
      isFolder: file.mimeType === FOLDER_MIME,
    }))
    .sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
    });
}

export async function getDriveCourseMaterials(): Promise<DriveCourseMaterials[]> {
  if (!dbConfigured() || !googleDriveOAuthConfigured()) return [];

  const courses = await db()<Array<{ id: string; title: string; driveFolderId: string }>>`
    SELECT id, title, drive_folder_id as "driveFolderId"
    FROM courses
    WHERE active = true AND drive_folder_id IS NOT NULL
    ORDER BY title
  `;
  if (!courses.length) return [];

  const accessToken = await refreshGoogleAccessToken();
  const result: DriveCourseMaterials[] = [];

  for (const course of courses) {
    const items = await listFolder(accessToken, course.driveFolderId);
    result.push({
      courseId: course.id,
      courseTitle: course.title,
      folderId: course.driveFolderId,
      folderUrl: `https://drive.google.com/drive/folders/${course.driveFolderId}`,
      items,
    });
  }

  return result;
}
