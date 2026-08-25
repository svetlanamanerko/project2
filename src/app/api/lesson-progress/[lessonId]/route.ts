import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!(await hasSession())) return NextResponse.json({ ok: false }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const { lessonId } = await params;
  const rows = await db()<Array<{ state: unknown }>>`
    SELECT state FROM lesson_interactive_progress WHERE lesson_id=${lessonId} LIMIT 1
  `;
  return NextResponse.json({ ok: true, state: rows[0]?.state || null });
}

export async function PUT(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!(await hasSession())) return NextResponse.json({ ok: false }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const { lessonId } = await params;
  const payload = await request.json().catch(() => null);
  const state = objectValue(payload);
  if (!state) return NextResponse.json({ ok: false, message: 'Некорректное состояние урока.' }, { status: 400 });
  const serialized = JSON.stringify(state);
  if (serialized.length > 1_000_000) {
    return NextResponse.json({ ok: false, message: 'Состояние урока слишком большое.' }, { status: 413 });
  }

  await db()`
    INSERT INTO lesson_interactive_progress (lesson_id, state, updated_at)
    VALUES (${lessonId}, ${serialized}::jsonb, now())
    ON CONFLICT (lesson_id) DO UPDATE SET state=EXCLUDED.state, updated_at=now()
  `;
  return NextResponse.json({ ok: true });
}
