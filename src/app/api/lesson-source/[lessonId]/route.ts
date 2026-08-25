import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';

export async function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!(await hasSession())) {
    return NextResponse.json({ ok: false, message: 'Нужен вход в Мастерскую.' }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, message: 'PostgreSQL не подключена.' }, { status: 503 });
  }

  const { lessonId } = await params;
  const rows = await db()<Array<{ path: string | null }>>`
    SELECT source_excerpt_path as path
    FROM lesson_packages
    WHERE lesson_id=${lessonId}
    LIMIT 1
  `;
  const filePath = rows[0]?.path;
  if (!filePath) return new NextResponse('Источник не найден', { status: 404 });

  try {
    const bytes = await readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="lesson-source-${lessonId}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('Файл источника пока недоступен', { status: 404 });
  }
}
