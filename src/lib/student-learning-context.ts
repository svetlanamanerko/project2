import 'server-only';
import { db, dbConfigured } from '@/lib/db';

export type StudentLearningContext = {
  student: { id: string; name: string; grade: number | null };
  courses: Array<{
    enrollmentId: string;
    courseId: string;
    title: string;
    driveFolderId: string | null;
    module: string | null;
    topic: string | null;
    note: string | null;
    currentPosition: { mapItemId: string | null; stage: string; lesson: string | null; completedBeforeTracking: boolean; note: string | null } | null;
  }>;
  recentLessons: Array<{ id: string; enrollmentId: string; date: string; stage: string; lesson: string | null; skills: string[]; status: string; note: string | null; homework: string | null; nextSteps: string | null }>;
  completedTopics: string[];
  repeatTopics: string[];
  unfinishedItems: string[];
  usedMaterials: string[];
  usedMaterialsByEnrollment: Record<string, string[]>;
  historicalCoverage: Array<{ enrollmentId: string; stage: string | null; lesson: string | null; topic: string | null; summary: string; confidence: 'high' | 'medium' | 'low'; sourceRefs: Array<{ id: string; title: string }> }>;
  usedQids: string[];
  homework: string[];
  nextSteps: string[];
};

export async function getStudentLearningContext(studentId: string): Promise<StudentLearningContext | null> {
  if (!dbConfigured()) return null;
  const sql = db();
  const students = await sql<Array<{ id: string; name: string; grade: number | null }>>`SELECT id, display_name as name, school_grade as grade FROM students WHERE id=${studentId} AND active=true LIMIT 1`;
  const student = students[0];
  if (!student) return null;
  const [courses, history, repeats, materials, qids, historicalCoverage] = await Promise.all([
    sql<StudentLearningContext['courses']>`
      SELECT e.id as "enrollmentId", c.id as "courseId", c.title, c.drive_folder_id as "driveFolderId",
        sp.module, sp.topic, sp.note,
        CASE WHEN p.enrollment_id IS NULL THEN NULL ELSE json_build_object('mapItemId',p.current_map_item_id,'stage',p.stage_label,'lesson',p.lesson_label,'completedBeforeTracking',p.completed_before_tracking,'note',p.note) END as "currentPosition"
      FROM enrollments e JOIN courses c ON c.id=e.course_id AND c.active=true
      LEFT JOIN student_course_positions p ON p.enrollment_id=e.id
      LEFT JOIN school_positions sp ON sp.enrollment_id=e.id
      WHERE e.student_id=${studentId} AND e.active=true ORDER BY c.title`,
    sql<StudentLearningContext['recentLessons']>`
      SELECT h.id, h.enrollment_id as "enrollmentId", to_char(h.occurred_on,'YYYY-MM-DD') as date, h.stage_label as stage, h.lesson_label as lesson, h.skills, h.result_status as status, h.teacher_note as note, h.homework, h.next_steps as "nextSteps"
      FROM lesson_history h JOIN enrollments e ON e.id=h.enrollment_id WHERE e.student_id=${studentId}
      ORDER BY h.occurred_on DESC,h.created_at DESC LIMIT 10`,
    sql<Array<{ label: string }>>`SELECT r.label FROM recycling_items r JOIN enrollments e ON e.id=r.enrollment_id WHERE e.student_id=${studentId} AND r.status='active' ORDER BY r.priority,r.created_at LIMIT 20`,
    sql<Array<{ enrollmentId: string; referenceId: string }>>`SELECT DISTINCT h.enrollment_id as "enrollmentId",m.reference_id as "referenceId" FROM lesson_history_materials m JOIN lesson_history h ON h.id=m.lesson_history_id JOIN enrollments e ON e.id=h.enrollment_id WHERE e.student_id=${studentId} AND m.reference_id IS NOT NULL`,
    sql<Array<{ qid: string }>>`SELECT DISTINCT q.qid FROM lesson_history_qids q JOIN lesson_history h ON h.id=q.lesson_history_id JOIN enrollments e ON e.id=h.enrollment_id WHERE e.student_id=${studentId}`,
    sql<StudentLearningContext['historicalCoverage']>`SELECT h.enrollment_id as "enrollmentId",h.stage_label as stage,h.lesson_label as lesson,h.topic,h.coverage_summary as summary,h.confidence,h.source_refs as "sourceRefs" FROM historical_coverage h JOIN enrollments e ON e.id=h.enrollment_id WHERE e.student_id=${studentId} AND h.status='confirmed' ORDER BY h.updated_at DESC LIMIT 20`,
  ]);
  const historicalMaterials = historicalCoverage.flatMap((item) => (item.sourceRefs || []).map((ref) => ({ enrollmentId: item.enrollmentId, referenceId: ref.id })));
  const allMaterials = [...materials, ...historicalMaterials];
  const usedMaterialsByEnrollment = Object.fromEntries(courses.map((course) => [course.enrollmentId, [...new Set(allMaterials.filter((item) => item.enrollmentId === course.enrollmentId).map((item) => item.referenceId))]]));
  return {
    student, courses, recentLessons: history,
    completedTopics: history.filter((x) => x.status === 'completed').map((x) => `${x.stage}${x.lesson ? ` / ${x.lesson}` : ''}`),
    repeatTopics: [...new Set([...repeats.map((x) => x.label), ...history.filter((x) => x.status === 'repeat').map((x) => x.nextSteps || x.stage)])].slice(0, 20),
    unfinishedItems: history.filter((x) => x.status === 'unfinished').map((x) => x.nextSteps || `${x.stage}${x.lesson ? ` / ${x.lesson}` : ''}`).slice(0, 10),
    usedMaterials: [...new Set(allMaterials.map((x) => x.referenceId))], usedMaterialsByEnrollment, historicalCoverage, usedQids: qids.map((x) => x.qid),
    homework: history.map((x) => x.homework).filter((x): x is string => Boolean(x)).slice(0, 5),
    nextSteps: history.map((x) => x.nextSteps).filter((x): x is string => Boolean(x)).slice(0, 5),
  };
}
