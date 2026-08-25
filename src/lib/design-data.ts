import 'server-only';
import { db, dbConfigured } from '@/lib/db';
import { validateLessonJson, type LessonJsonV1 } from '@/lib/lesson-json';
import { normalizeLessonJson, unwrapLessonJson } from '@/lib/lesson-json-normalize';

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
  interactiveLesson: LessonJsonV1 | null;
  sourceAvailable: boolean;
};

type LessonDesignRow = Omit<LessonDesignData, 'interactiveLesson' | 'sourceAvailable'> & {
  interactiveJson: unknown;
  sourceExcerptPath: string | null;
};

export async function getLessonDesignData(lessonId: string): Promise<LessonDesignData | null> {
  if (!dbConfigured()) return null;
  const rows = await db()<LessonDesignRow[]>`
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
      lp.teacher_pack as "teacherPack",
      lp.interactive_json as "interactiveJson",
      lp.source_excerpt_path as "sourceExcerptPath"
    FROM lessons l
    JOIN lesson_packages lp ON lp.lesson_id=l.id
    JOIN enrollments e ON e.id=l.enrollment_id
    JOIN students s ON s.id=e.student_id
    JOIN courses c ON c.id=e.course_id
    WHERE l.id=${lessonId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const normalized = normalizeLessonJson(unwrapLessonJson(row.interactiveJson), row.title);
  const validation = validateLessonJson(normalized);
  if (row.interactiveJson != null && !validation.ok) {
    console.error(`[lesson-design] interactive_json rejected for lesson ${lessonId}:`, validation.issues);
  }
  return {
    lessonId: row.lessonId,
    student: row.student,
    course: row.course,
    title: row.title,
    sourceLabel: row.sourceLabel,
    studentWorksheet: row.studentWorksheet,
    reserve: row.reserve,
    homework: row.homework,
    vocabularyBank: row.vocabularyBank,
    teacherPack: row.teacherPack,
    interactiveLesson: validation.ok ? validation.lesson : null,
    sourceAvailable: !!row.sourceExcerptPath,
  };
}
