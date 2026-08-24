import 'server-only';
import { db, dbConfigured } from '@/lib/db';

export type TodayLesson = {
  scheduleId: string;
  time: string;
  student: string;
  course: string;
  enrollmentId: string;
  lessonId: string | null;
  status: 'draft' | 'prepared' | 'done' | 'cancelled' | 'missing';
  note: string | null;
};

function todayString() {
  const zone = process.env.APP_TIMEZONE || 'Europe/Amsterdam';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function isoWeekday(date: string) {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function demoLessons(): TodayLesson[] {
  return [
    { scheduleId: 'd1', time: '14:00', student: 'Ученик 1', course: 'Spotlight 4', enrollmentId: 'e1', lessonId: 'l1', status: 'prepared', note: 'повторить чтение и грамматику' },
    { scheduleId: 'd2', time: '16:00', student: 'Ученик 2', course: 'Spotlight 5', enrollmentId: 'e2', lessonId: null, status: 'missing', note: 'школа ушла вперёд' },
    { scheduleId: 'd3', time: '18:00', student: 'Ученик 3', course: 'Spotlight 7', enrollmentId: 'e3', lessonId: null, status: 'missing', note: 'добавить говорение' },
    { scheduleId: 'd4', time: '20:00', student: 'Ученик 4', course: 'Starlight 9', enrollmentId: 'e4', lessonId: null, status: 'missing', note: 'пришла срочная школьная тема' },
  ];
}

export async function getTodayLessons() {
  if (!dbConfigured()) return process.env.DEMO_DATA === 'true' ? demoLessons() : [];
  const date = todayString();
  const weekday = isoWeekday(date);
  const sql = db();
  const rows = await sql<TodayLesson[]>`
    SELECT
      sr.id as "scheduleId",
      to_char(sr.start_time, 'HH24:MI') as time,
      s.display_name as student,
      c.title as course,
      e.id as "enrollmentId",
      l.id as "lessonId",
      COALESCE(l.status, 'missing') as status,
      COALESCE(sp.note, sp.topic) as note
    FROM schedule_rules sr
    JOIN enrollments e ON e.id = sr.enrollment_id AND e.active = true
    JOIN students s ON s.id = e.student_id AND s.active = true
    JOIN courses c ON c.id = e.course_id AND c.active = true
    LEFT JOIN school_positions sp ON sp.enrollment_id = e.id
    LEFT JOIN lessons l ON l.enrollment_id = e.id AND l.scheduled_date = ${date}::date AND l.lesson_type <> 'urgent'
    WHERE sr.active = true AND sr.iso_weekday = ${weekday}
    ORDER BY sr.start_time ASC
  `;
  return rows;
}

export async function getRecycling() {
  if (!dbConfigured()) return process.env.DEMO_DATA === 'true' ? ['have got', 'вопросы в Present Simple', 'говорение по теме Character'] : [];
  const rows = await db()<Array<{ label: string }>>`
    SELECT r.label FROM recycling_items r
    WHERE r.status = 'active'
    ORDER BY r.priority ASC, r.created_at ASC LIMIT 5
  `;
  return rows.map((row) => row.label);
}

export async function getUpcomingTasks() {
  if (!dbConfigured()) return process.env.DEMO_DATA === 'true' ? ['контрольная по Spotlight 7', 'ВПР в конце года', 'ОГЭ — следующий блок'] : [];
  const date = todayString();
  const rows = await db()<Array<{ title: string }>>`
    SELECT title FROM upcoming_tasks WHERE done = false AND (due_date IS NULL OR due_date >= ${date}::date)
    ORDER BY due_date NULLS LAST LIMIT 5
  `;
  return rows.map((row) => row.title);
}

export async function getStudents() {
  if (!dbConfigured()) return [];
  return db()<Array<{ id: string; displayName: string; schoolGrade: number | null }>>`
    SELECT id, display_name as "displayName", school_grade as "schoolGrade" FROM students WHERE active = true ORDER BY display_name
  `;
}

export async function getCourses() {
  if (!dbConfigured()) return [];
  return db()<Array<{ id: string; title: string; grade: number | null }>>`
    SELECT id, title, grade FROM courses WHERE active = true ORDER BY title
  `;
}

export async function getEnrollments() {
  if (!dbConfigured()) return [];
  return db()<Array<{ id: string; student: string; course: string }>>`
    SELECT e.id, s.display_name as student, c.title as course
    FROM enrollments e JOIN students s ON s.id=e.student_id JOIN courses c ON c.id=e.course_id
    WHERE e.active=true ORDER BY s.display_name
  `;
}

export async function getMaterials() {
  if (!dbConfigured()) return [];
  return db()<Array<{ id: string; title: string; kind: string; driveUrl: string | null }>>`
    SELECT id, title, kind, drive_url as "driveUrl" FROM materials ORDER BY created_at DESC LIMIT 50
  `;
}
