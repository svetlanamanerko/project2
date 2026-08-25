'use server';

import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, dbConfigured } from '@/lib/db';
import { getAppDateString, isoWeekday } from '@/lib/data';
import { getGoogleDriveCourseFolders } from '@/lib/google-drive';

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

export async function updateCourse(formData: FormData) {
  const courseId = String(formData.get('courseId') || '').trim();
  const title = String(formData.get('title') || '').trim();
  const gradeRaw = String(formData.get('grade') || '').trim();
  const publisher = String(formData.get('publisher') || '').trim();
  if (!courseId || !title) return;
  const grade = gradeRaw ? Number(gradeRaw) : null;
  await requireDb()`UPDATE courses SET title=${title}, grade=${grade}, publisher=${publisher || null} WHERE id=${courseId}`;
  revalidatePath('/courses');
  revalidatePath('/students');
  revalidatePath('/');
  revalidatePath(`/courses/${courseId}`);
}

export async function updateCourseSource(formData: FormData) {
  const courseId = String(formData.get('courseId') || '').trim();
  const folderId = String(formData.get('folderId') || '').trim();
  if (!courseId || !folderId) return;

  const drive = await getGoogleDriveCourseFolders();
  if (!drive.connected || !drive.folders.some((folder) => folder.id === folderId)) {
    redirect(`/courses/${courseId}?source=invalid#source`);
  }

  await requireDb()`UPDATE courses SET drive_folder_id=${folderId} WHERE id=${courseId} AND active=true`;
  revalidatePath(`/courses/${courseId}`);
  revalidatePath('/courses');
  revalidatePath('/materials');
  redirect(`/courses/${courseId}?source=saved#source`);
}

export async function deleteCourse(formData: FormData) {
  const courseId = String(formData.get('courseId') || '').trim();
  if (!courseId) return;
  const sql = requireDb();
  const linked = await sql<Array<{ count: number }>>`
    SELECT count(*)::int as count FROM enrollments WHERE course_id=${courseId}
  `;
  if ((linked[0]?.count || 0) > 0) redirect('/courses?error=linked');
  await sql`DELETE FROM courses WHERE id=${courseId}`;
  revalidatePath('/courses');
  redirect('/courses?deleted=1');
}

export async function configureStudentCourse(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const courseId = String(formData.get('courseId') || '').trim();
  const weekdayRaw = String(formData.get('weekday') || '').trim();
  const time = String(formData.get('time') || '').trim();
  const module = String(formData.get('module') || '').trim();
  const topic = String(formData.get('topic') || '').trim();
  const note = String(formData.get('note') || '').trim();

  if (!studentId || !courseId) return;

  const sql = requireDb();
  await sql.begin(async (tx) => {
    const existing = await tx<Array<{ id: string }>>`
      SELECT id FROM enrollments
      WHERE student_id=${studentId} AND course_id=${courseId}
      LIMIT 1
    `;

    const enrollmentId = existing[0]?.id || randomUUID();

    if (existing.length) {
      await tx`UPDATE enrollments SET active=true WHERE id=${enrollmentId}`;
    } else {
      await tx`
        INSERT INTO enrollments (id, student_id, course_id, active, started_on)
        VALUES (${enrollmentId}, ${studentId}, ${courseId}, true, CURRENT_DATE)
      `;
    }

    if (module || topic || note) {
      await tx`
        INSERT INTO school_positions (enrollment_id, module, topic, note, updated_at)
        VALUES (${enrollmentId}, ${module || null}, ${topic || null}, ${note || null}, now())
        ON CONFLICT (enrollment_id) DO UPDATE SET
          module=EXCLUDED.module,
          topic=EXCLUDED.topic,
          note=EXCLUDED.note,
          updated_at=now()
      `;
    }

    const weekday = weekdayRaw ? Number(weekdayRaw) : null;
    if (weekday && time) {
      const same = await tx<Array<{ id: string }>>`
        SELECT id FROM schedule_rules
        WHERE enrollment_id=${enrollmentId}
          AND iso_weekday=${weekday}
          AND start_time=${time}::time
        LIMIT 1
      `;
      if (!same.length) {
        await tx`
          INSERT INTO schedule_rules (id, enrollment_id, iso_weekday, start_time, active)
          VALUES (${randomUUID()}, ${enrollmentId}, ${weekday}, ${time}::time, true)
        `;
      }
    }
  });

  revalidatePath('/students');
  revalidatePath('/');
  revalidatePath('/urgent');
}

export async function createUrgentRequest(formData: FormData) {
  const enrollmentId = String(formData.get('enrollmentId') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const attachment = formData.get('attachment');

  if (!enrollmentId || !description) redirect('/urgent?error=missing');
  if (attachment instanceof File && attachment.size > 15 * 1024 * 1024) {
    redirect('/urgent?error=file-too-large');
  }

  const sql = requireDb();
  const requestId = randomUUID();
  const lessonId = randomUUID();
  let savedFile: null | {
    id: string;
    filename: string;
    storedName: string;
    mimeType: string;
    size: number;
    localPath: string;
  } = null;
  let failed = false;

  try {
    if (attachment instanceof File && attachment.size > 0) {
      const extension = path.extname(attachment.name).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
      const storedName = `${randomUUID()}${extension}`;
      const folder = path.join(process.env.DATA_DIR?.trim() || '/data', 'uploads', 'urgent', requestId);
      await mkdir(folder, { recursive: true });
      const localPath = path.join(folder, storedName);
      await writeFile(localPath, Buffer.from(await attachment.arrayBuffer()));
      savedFile = {
        id: randomUUID(),
        filename: attachment.name || 'attachment',
        storedName,
        mimeType: attachment.type || 'application/octet-stream',
        size: attachment.size,
        localPath,
      };
    }

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO lessons (id, enrollment_id, lesson_type, status, title)
        VALUES (${lessonId}, ${enrollmentId}, 'urgent', 'draft', ${`Срочная помощь: ${description.slice(0, 80)}`})
      `;
      await tx`
        INSERT INTO urgent_requests (id, enrollment_id, description, status, lesson_id)
        VALUES (${requestId}, ${enrollmentId}, ${description}, 'draft', ${lessonId})
      `;
      if (savedFile) {
        await tx`
          INSERT INTO urgent_attachments (id, urgent_request_id, filename, stored_name, mime_type, size_bytes, local_path)
          VALUES (${savedFile.id}, ${requestId}, ${savedFile.filename}, ${savedFile.storedName}, ${savedFile.mimeType}, ${savedFile.size}, ${savedFile.localPath})
        `;
      }
    });
  } catch (error) {
    failed = true;
    if (savedFile) await unlink(savedFile.localPath).catch(() => undefined);
    console.error('[urgent] Не удалось создать срочный запрос:', error);
  }

  if (failed) redirect('/urgent?error=save');
  revalidatePath('/urgent');
  revalidatePath('/materials');
  revalidatePath('/');
  redirect('/urgent?created=1');
}

async function createDraftsForDate(date: string) {
  const sql = requireDb();
  const weekday = isoWeekday(date);
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

export async function createTodayDrafts() {
  await createDraftsForDate(getAppDateString());
}

export async function createTomorrowDrafts() {
  await createDraftsForDate(getAppDateString(1));
}
