import { readFile } from 'node:fs/promises';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return new Response('Unauthorized', { status: 401 });
  if (!dbConfigured()) return new Response('Database unavailable', { status: 503 });

  const { id } = await params;
  const rows = await db()<Array<{ filename: string; mimeType: string | null; localPath: string }>>`
    SELECT filename, mime_type as "mimeType", local_path as "localPath"
    FROM urgent_attachments
    WHERE id=${id}
    LIMIT 1
  `;
  const file = rows[0];
  if (!file) return new Response('Not found', { status: 404 });

  try {
    const bytes = await readFile(file.localPath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[files] Не удалось прочитать вложение:', error);
    return new Response('File unavailable', { status: 404 });
  }
}
