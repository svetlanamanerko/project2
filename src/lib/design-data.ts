import 'server-only';
import { db, dbConfigured } from '@/lib/db';

export type LessonDesignData = {
  lessonId: string;
  student: string;
  course: string;
  title: string;
  sourceLabel: string | null;
  studentWorksheet: string;
  reserve: string;
  homework: string;
  vocabularyBank: string;
  teacherPack: string;
};

export async function getLessonDesignData(lessonId: string): Promise<LessonDesignData | null> {
  if (!dbConfigured()) return null;
  const rows = await db()<LessonDesignData[]>`
    SELECT
      l.id as "lessonId",
      s.display_name as student,
      c.title as course,
      lp.title,
      lp.source_label as "sourceLabel",
      lp.student_worksheet as "studentWorksheet",
      lp.reserve,
      lp.homework,
      lp.vocabulary_bank as "vocabularyBank",
      lp.teacher_pack as "teacherPack"
    FROM lessons l
    JOIN lesson_packages lp ON lp.lesson_id=l.id
    JOIN enrollments e ON e.id=l.enrollment_id
    JOIN students s ON s.id=e.student_id
    JOIN courses c ON c.id=e.course_id
    WHERE l.id=${lessonId}
    LIMIT 1
  `;
  return rows[0] || null;
}
