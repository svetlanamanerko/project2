'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db, dbConfigured } from '@/lib/db';

function requireDb() {
  if (!dbConfigured()) throw new Error('Сначала подключите PostgreSQL');
  return db();
}

export async function addStudent(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const gradeRaw = String(formData.get('grade') || '').trim();
  if (!name) return;
  const grade = gradeRaw ? Number(gradeRaw) : null;
  await requireDb()`INSERT INTO students (id, display_name, school_grade) VALUES (${randomUUID()}, ${name}, ${grade})`;
  revalidatePath('/students');
}

export async function addCourse(formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  const gradeRaw = String(formData.get('grade') || '').trim();
  if (!title) return;
  const grade = gradeRaw ? Number(gradeRaw) : null;
  await requireDb()`INSERT INTO courses (id, title, grade) VALUES (${randomUUID()}, ${title}, ${grade})`;
  revalidatePath('/courses');
}

export async function createUrgentRequest(formData: FormData) {
  const enrollmentId = String(formData.get('enrollmentId') || '');
  const description = String(formData.get('description') || '').trim();
  if (!enrollmentId || !description) return;
  const sql = requireDb();
  const requestId = randomUUID();
  const lessonId = randomUUID();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO lessons (id, enrollment_id, lesson_type, status, title) VALUES (${lessonId}, ${enrollmentId}, 'urgent', 'draft', ${`Срочная помощь: ${description.slice(0, 80)}`})`;
    await tx`INSERT INTO urgent_requests (id, enrollment_id, description, status, lesson_id) VALUES (${requestId}, ${enrollmentId}, ${description}, 'draft', ${lessonId})`;
  });
  revalidatePath('/urgent');
}

export async function createTodayDrafts() {
  const sql = requireDb();
  const zone = process.env.APP_TIMEZONE || 'Europe/Amsterdam';
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekday = d === 0 ? 7 : d;
  const rows = await sql<Array<{ enrollmentId: string; startTime: string; course: string }>>`
    SELECT sr.enrollment_id as "enrollmentId", to_char(sr.start_time,'HH24:MI') as "startTime", c.title as course
    FROM schedule_rules sr JOIN enrollments e ON e.id=sr.enrollment_id JOIN courses c ON c.id=e.course_id
    WHERE sr.active=true AND sr.iso_weekday=${weekday}
  `;
  for (const row of rows) {
    await sql`
      INSERT INTO lessons (id, enrollment_id, lesson_type, status, title, scheduled_date, scheduled_time)
      SELECT ${randomUUID()}, ${row.enrollmentId}, 'planned', 'draft', ${row.course}, ${date}::date, ${row.startTime}::time
      WHERE NOT EXISTS (SELECT 1 FROM lessons WHERE enrollment_id=${row.enrollmentId} AND scheduled_date=${date}::date AND lesson_type <> 'urgent')
    `;
  }
  revalidatePath('/');
}
