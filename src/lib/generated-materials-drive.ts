import 'server-only';

import { refreshGoogleAccessToken } from '@/lib/google-drive';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type DriveItem = {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
};

function escapeQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' ? JSON.stringify(payload) : `HTTP ${response.status}`;
    throw new Error(`Google Drive API: ${detail}`);
  }
  return payload as T;
}

async function findNamedChild(accessToken: string, parentId: string, name: string, mimeType?: string) {
  const filters = [
    `'${escapeQuery(parentId)}' in parents`,
    `name = '${escapeQuery(name)}'`,
    'trashed = false',
  ];
  if (mimeType) filters.push(`mimeType = '${escapeQuery(mimeType)}'`);
  const params = new URLSearchParams({
    q: filters.join(' and '),
    fields: 'files(id,name,mimeType,webViewLink)',
    pageSize: '20',
  });
  const payload = await driveJson<{ files?: DriveItem[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );
  return payload.files?.[0] || null;
}

async function createFolder(accessToken: string, parentId: string, name: string) {
  return driveJson<DriveItem>(
    accessToken,
    'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    },
  );
}

async function ensureFolder(accessToken: string, parentId: string, name: string) {
  return await findNamedChild(accessToken, parentId, name, FOLDER_MIME)
    || await createFolder(accessToken, parentId, name);
}

async function uploadBytes(accessToken: string, fileId: string, bytes: Buffer, mimeType: string) {
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,mimeType,webViewLink`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: new Uint8Array(bytes),
      cache: 'no-store',
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Google Drive upload HTTP ${response.status}`);
  return payload as DriveItem;
}

async function upsertFile(accessToken: string, parentId: string, name: string, bytes: Buffer) {
  let file = await findNamedChild(accessToken, parentId, name);
  if (!file) {
    file = await driveJson<DriveItem>(
      accessToken,
      'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: DOCX_MIME, parents: [parentId] }),
      },
    );
  }
  return uploadBytes(accessToken, file.id, bytes, DOCX_MIME);
}

function cleanName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export async function uploadLessonPackageFiles(params: {
  courseFolderId: string;
  date: string;
  student: string;
  reference: string;
  studentFilename: string;
  teacherFilename: string;
  studentDocx: Buffer;
  teacherDocx: Buffer;
}) {
  const accessToken = await refreshGoogleAccessToken();
  const lessonsFolder = await ensureFolder(accessToken, params.courseFolderId, 'LESSONS');
  const lessonFolderName = cleanName(`${params.date} — ${params.student} — ${params.reference || 'урок'}`);
  const lessonFolder = await ensureFolder(accessToken, lessonsFolder.id, lessonFolderName);

  const studentFile = await upsertFile(accessToken, lessonFolder.id, cleanName(params.studentFilename), params.studentDocx);
  const teacherFile = await upsertFile(accessToken, lessonFolder.id, cleanName(params.teacherFilename), params.teacherDocx);

  return {
    folderId: lessonFolder.id,
    student: { id: studentFile.id, url: studentFile.webViewLink || `https://drive.google.com/file/d/${studentFile.id}/view` },
    teacher: { id: teacherFile.id, url: teacherFile.webViewLink || `https://drive.google.com/file/d/${teacherFile.id}/view` },
  };
}

export const generatedDocxMimeType = DOCX_MIME;
