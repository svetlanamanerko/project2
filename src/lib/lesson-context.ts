import 'server-only';
import { db } from '@/lib/db';
import { getStudentLearningContext } from '@/lib/student-learning-context';
import { getRelevantCourseMaterials } from '@/lib/relevant-course-materials';
import { getOgeCandidatesForStudent } from '@/lib/oge-navigator-client';

const EXTERNAL_CONTEXT_TIMEOUT_MS = 9_000;

function errorMessage(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function withTimeout<T>(promise: Promise<T>, label: string, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`${label} exceeded ${EXTERNAL_CONTEXT_TIMEOUT_MS}ms deadline`));
    }, EXTERNAL_CONTEXT_TIMEOUT_MS);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export async function buildLessonContext(studentId: string, options?: { enrollmentId?: string }) {
  const studentProgress = await getStudentLearningContext(studentId);
  if (!studentProgress) throw new Error('Ученик не найден');

  const course = options?.enrollmentId
    ? studentProgress.courses.find((item) => item.enrollmentId === options.enrollmentId)
    : studentProgress.courses[0];
  if (!course) throw new Error('Активный курс не найден');

  const currentId = course.currentPosition?.mapItemId;
  const items = await db()<Array<{
    id: string;
    position: number;
    stage: string;
    lesson: string | null;
    title: string;
    intent: Record<string, unknown>;
  }>>`
    SELECT id,position,stage_label as stage,lesson_label as lesson,title,intent
    FROM course_map_items WHERE course_id=${course.courseId} ORDER BY position
  `;
  const currentIndex = currentId ? items.findIndex((item) => item.id === currentId) : -1;
  const next = items[Math.max(0, currentIndex + 1)] || null;
  const lessonIntent = next?.intent && Object.keys(next.intent).length
    ? next.intent
    : {
        topic: next?.title || course.currentPosition?.stage || '',
        stage: next?.stage || course.currentPosition?.stage || '',
        lesson: next?.lesson || course.currentPosition?.lesson || '',
      };

  const driveController = new AbortController();
  const drivePromise = withTimeout(
    getRelevantCourseMaterials({
      courseId: course.courseId,
      studentId,
      lessonIntent,
      usedMaterialIds: studentProgress.usedMaterials,
      limit: 10,
      signal: driveController.signal,
    }),
    'Google Drive',
    () => driveController.abort(),
  );

  const navigatorConfigured = Boolean(process.env.OGE_NAVIGATOR_BASE_URL);
  const isOge = /\b(oge|огэ)\b/i.test(course.title);
  const navigatorPromise = withTimeout(
    isOge
      ? getOgeCandidatesForStudent(studentProgress.usedQids, lessonIntent)
      : Promise.resolve({ configured: navigatorConfigured, available: true, items: [] }),
    'OGE Navigator',
  );

  const [driveResult, navigatorResult] = await Promise.allSettled([drivePromise, navigatorPromise]);

  const driveMaterials = driveResult.status === 'fulfilled' ? driveResult.value : [];
  const driveAvailable = driveResult.status === 'fulfilled';
  if (driveResult.status === 'rejected') {
    console.error('[lesson-context] Google Drive unavailable:', errorMessage(driveResult.reason));
  }

  const navigator = navigatorResult.status === 'fulfilled'
    ? navigatorResult.value
    : { configured: navigatorConfigured, available: false, items: [] };
  if (navigatorResult.status === 'rejected') {
    console.error('[lesson-context] OGE Navigator unavailable:', errorMessage(navigatorResult.reason));
  }

  return {
    studentProgress: { student: studentProgress.student, course, currentPosition: course.currentPosition },
    coursePlan: { current: currentIndex >= 0 ? items[currentIndex] : null, next },
    lessonIntent,
    driveMaterials,
    driveStatus: { available: driveAvailable },
    navigatorCandidates: navigator.items,
    navigatorStatus: { configured: navigator.configured, available: navigator.available },
    recentLessonHistory: studentProgress.recentLessons.slice(0, 10),
    repeatItems: studentProgress.repeatTopics,
    unfinishedItems: studentProgress.unfinishedItems,
    usedQids: studentProgress.usedQids,
    nextSteps: studentProgress.nextSteps,
  };
}
