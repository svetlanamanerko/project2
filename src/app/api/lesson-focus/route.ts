import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';
import { normalizeTeacherInstruction } from '@/lib/teacher-instruction-utils';

export async function POST(request: Request) {
  if (!(await hasSession())) {
    return NextResponse.json({ ok: false, message: 'Нужен вход в Мастерскую.' }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, message: 'PostgreSQL не подключена.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { enrollmentId?: string; note?: string };
  const enrollmentId = String(body.enrollmentId || '').trim();
  const note = normalizeTeacherInstruction(body.note);
  if (!enrollmentId) {
    return NextResponse.json({ ok: false, message: 'Не выбран курс ученика.' }, { status: 400 });
  }

  const rows = await db()<Array<{ id: string }>>`
    INSERT INTO school_positions (enrollment_id, note, updated_at)
    SELECT e.id, ${note || null}, now()
    FROM enrollments e
    WHERE e.id=${enrollmentId} AND e.active=true
    ON CONFLICT (enrollment_id) DO UPDATE SET note=EXCLUDED.note, updated_at=now()
    RETURNING enrollment_id as id
  `;
  if (!rows.length) {
    return NextResponse.json({ ok: false, message: 'Активный курс ученика не найден.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, note });
}
