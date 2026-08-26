import 'server-only';
import { db, dbConfigured } from '@/lib/db';
import type { OgeTask } from '@/lib/oge-navigator-client';
import { currentPositionSearchValue, filterUnusedNavigatorTasks } from '@/lib/navigator-utils';

export type NavigatorStudent = { id: string; name: string };
export type NavigatorUsage = { qid: string; date: string; course: string; stage: string; lesson: string | null };
export type NavigatorStudentPosition = { stage: string; lesson: string | null; intent: Record<string, unknown> };

export function filterUnusedOgeTasks(tasks: OgeTask[], usedQids: Iterable<string>) { return filterUnusedNavigatorTasks(tasks,usedQids); }

export async function getNavigatorStudents(): Promise<NavigatorStudent[]> {
  if (!dbConfigured()) return [];
  return db()<NavigatorStudent[]>`
    SELECT DISTINCT s.id,s.display_name as name FROM students s
    JOIN enrollments e ON e.student_id=s.id AND e.active=true
    JOIN courses c ON c.id=e.course_id AND c.active=true
    WHERE s.active=true AND c.title ~* '(OGE|ОГЭ)'
    ORDER BY name
  `;
}

export async function getNavigatorUsageForStudent(studentId: string): Promise<NavigatorUsage[]> {
  if (!dbConfigured() || !studentId) return [];
  return db()<NavigatorUsage[]>`
    SELECT q.qid,to_char(h.occurred_on,'YYYY-MM-DD') as date,c.title as course,h.stage_label as stage,h.lesson_label as lesson
    FROM lesson_history_qids q JOIN lesson_history h ON h.id=q.lesson_history_id
    JOIN enrollments e ON e.id=h.enrollment_id JOIN courses c ON c.id=e.course_id
    WHERE e.student_id=${studentId} ORDER BY h.occurred_on DESC,h.created_at DESC
  `;
}

export async function getNavigatorStudentPosition(studentId: string): Promise<NavigatorStudentPosition | null> {
  if (!dbConfigured() || !studentId) return null;
  const rows = await db()<NavigatorStudentPosition[]>`
    SELECT p.stage_label as stage,p.lesson_label as lesson,COALESCE(m.intent,'{}'::jsonb) as intent
    FROM student_course_positions p JOIN enrollments e ON e.id=p.enrollment_id AND e.active=true
    JOIN courses c ON c.id=e.course_id AND c.active=true
    LEFT JOIN course_map_items m ON m.id=p.current_map_item_id
    WHERE e.student_id=${studentId} AND c.title ~* '(OGE|ОГЭ)' ORDER BY c.title LIMIT 1
  `;
  return rows[0] || null;
}

export function currentPositionSearch(position: NavigatorStudentPosition | null) { return currentPositionSearchValue(position); }
