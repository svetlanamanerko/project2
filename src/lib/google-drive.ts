import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db, dbConfigured } from '@/lib/db';

const PROVIDER = 'google_drive';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const SCHOOL_ROOT_NAME = '01 SCHOOL COURSES';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type DriveFile = {
  id: string;
  name: string;
  webViewLink?: string;
};

export type GoogleDriveStatus = {
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  linkedCourses: number;
};

export function googleDriveOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleDriveScope() {
  return DRIVE_SCOPE;
}

function encryptionKey() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error('SESSION_SECRET не настроен');
  return createHash('sha256').update(secret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decrypt(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Некорректный формат сохранённого Google token');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

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

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Google OAuth не настроен');

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as TokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || `Google OAuth HTTP ${response.status}`);
  }
  return payload;
}

export async function refreshGoogleAccessToken() {
  if (!dbConfigured()) throw new Error('PostgreSQL не настроен');
  const rows = await db()<Array<{ encryptedToken: string }>>`
    SELECT encrypted_refresh_token as "encryptedToken"
    FROM app_integrations WHERE provider=${PROVIDER} LIMIT 1
  `;
  const encryptedToken = rows[0]?.encryptedToken;
  if (!encryptedToken) throw new Error('Google Drive ещё не подключён');

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Google OAuth не настроен');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: decrypt(encryptedToken),
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as TokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || `Google OAuth HTTP ${response.status}`);
  }
  return payload.access_token;
}

export async function inspectGoogleDrive(accessToken: string) {
  const about = await driveFetch<{ user?: { displayName?: string; emailAddress?: string } }>(
    accessToken,
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)',
  );

  const rootParams = new URLSearchParams({
    q: `name = '${SCHOOL_ROOT_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name,webViewLink)',
    pageSize: '20',
  });
  const roots = await driveFetch<{ files?: DriveFile[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${rootParams.toString()}`,
  );
  const root = roots.files?.[0] || null;

  let childFolders: DriveFile[] = [];
  if (root) {
    const childParams = new URLSearchParams({
      q: `'${root.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id,name,webViewLink)',
      pageSize: '1000',
    });
    const children = await driveFetch<{ files?: DriveFile[] }>(
      accessToken,
      `https://www.googleapis.com/drive/v3/files?${childParams.toString()}`,
    );
    childFolders = children.files || [];
  }

  return {
    accountEmail: about.user?.emailAddress || null,
    root,
    childFolders,
  };
}

function normalizeCourseTitle(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('ru-RU');
}

export async function saveGoogleDriveConnection(params: {
  refreshToken: string;
  accountEmail: string | null;
  root: DriveFile | null;
  childFolders: DriveFile[];
}) {
  if (!dbConfigured()) throw new Error('PostgreSQL не настроен');
  const sql = db();
  const encryptedToken = encrypt(params.refreshToken);

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO app_integrations (
        provider, encrypted_refresh_token, account_email, root_folder_id, root_folder_name, connected_at, updated_at
      ) VALUES (
        ${PROVIDER}, ${encryptedToken}, ${params.accountEmail}, ${params.root?.id || null}, ${params.root?.name || null}, now(), now()
      )
      ON CONFLICT (provider) DO UPDATE SET
        encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,
        account_email=EXCLUDED.account_email,
        root_folder_id=EXCLUDED.root_folder_id,
        root_folder_name=EXCLUDED.root_folder_name,
        updated_at=now()
    `;

    if (params.root && params.childFolders.length) {
      const folderMap = new Map(params.childFolders.map((folder) => [normalizeCourseTitle(folder.name), folder.id]));
      const courses = await tx<Array<{ id: string; title: string; driveFolderId: string | null }>>`
        SELECT id, title, drive_folder_id as "driveFolderId" FROM courses WHERE active=true
      `;
      for (const course of courses) {
        if (course.driveFolderId) continue;
        const folderId = folderMap.get(normalizeCourseTitle(course.title));
        if (folderId) {
          await tx`UPDATE courses SET drive_folder_id=${folderId} WHERE id=${course.id}`;
        }
      }
    }
  });
}

export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  const configured = googleDriveOAuthConfigured();
  if (!configured || !dbConfigured()) {
    return { configured, connected: false, accountEmail: null, rootFolderId: null, rootFolderName: null, linkedCourses: 0 };
  }

  const sql = db();
  const rows = await sql<Array<{
    accountEmail: string | null;
    rootFolderId: string | null;
    rootFolderName: string | null;
  }>>`
    SELECT account_email as "accountEmail", root_folder_id as "rootFolderId", root_folder_name as "rootFolderName"
    FROM app_integrations WHERE provider=${PROVIDER} LIMIT 1
  `;
  const linked = await sql<Array<{ count: number }>>`
    SELECT COUNT(*)::int as count FROM courses WHERE active=true AND drive_folder_id IS NOT NULL
  `;
  const row = rows[0];
  return {
    configured,
    connected: Boolean(row),
    accountEmail: row?.accountEmail || null,
    rootFolderId: row?.rootFolderId || null,
    rootFolderName: row?.rootFolderName || null,
    linkedCourses: linked[0]?.count || 0,
  };
}
