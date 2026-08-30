import 'server-only';
import { db } from '@/lib/db';
import { getStudentLearningContext } from '@/lib/student-learning-context';
import { getRelevantCourseMaterials } from '@/lib/relevant-course-materials';
import { getCoursePlanningGuidance } from '@/lib/course-planning-guidance';
import { ogeBlockNumberFromIntent } from '@/lib/course-planning-guidance-utils';
import { getOgeCandidatesForStudent } from '@/lib/oge-navigator-client';
import { isDiagnosticIntent, resolveCurrentAndNext } from '@/lib/learning-context-utils';
import { isOgeCourseTitle } from '@/lib/course-folder-match-utils';
import { resolveGoogleDriveCourseFolder } from '@/lib/google-drive-source-folders';

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

function ogeBlockSearchHint(block: number | null) {
  const hints: Record<number, string> = {
    1: 'family friends relationships appearance character home duties family celebrations',
    2: 'hobbies free time books sport games media internet music films',
    3: 'holidays travel transport accommodation sights excursions',
    4: 'health lifestyle doctor food nutrition fitness routine',
    5: 'school education subjects exams learning extracurricular activities',
    6: 'shopping money clothes fashion food shopping',
    7: 'city country home environment animals weather climate ecology',
    8: 'jobs careers professions workplace skills future career',
    9: 'Russia English-speaking countries traditions history culture famous people',
  };
  return block == null ? '' : hints[block] || '';
}

export async function buildLessonContext(studentId: string, options?: { enrollmentId?: string }) {
  const studentProgress = await getStudentLearningContext(studentId);
  if (!studentProgress) throw new Error('Ученик не найден');

  const course = options?.enrollmentId
    ? studentProgress.courses.find((item) => item.enrollmentId === options.enrollmentId)
    : studentProgress.courses[0];
  if (!course) throw new Error('Активный курс не найден');

  const sql = db();
  const [items, schoolPositionRows] = await Promise.all([
    sql<Array<{
      id: string;
      position: number;
      stage: string;
      lesson: string | null;
      title: string;
      intent: Record<string, unknown>;
    }>>`
      SELECT id,position,stage_label as stage,lesson_label as lesson,title,intent
      FROM course_map_items WHERE course_id=${course.courseId} ORDER BY position
    `,
    sql<Array<{ module: string | null; topic: string | null; note: string | null }>>`
      SELECT module, topic, note FROM school_positions WHERE enrollment_id=${course.enrollmentId} LIMIT 1
    `,
  ]);
  const schoolPosition = schoolPositionRows[0] || { module: null, topic: null, note: null };
  const coursePlan = resolveCurrentAndNext(items, course.currentPosition, studentProgress.recentLessons, course.enrollmentId);
  const currentStage = coursePlan.current?.stage || course.currentPosition?.stage || '';
  const currentLesson = coursePlan.current?.lesson || course.currentPosition?.lesson || '';
  const explicitIntent = coursePlan.current?.intent && Object.keys(coursePlan.current.intent).length ? coursePlan.current.intent : {};
  const isOge = isOgeCourseTitle(course.title);
  const explicitOgeBlock = isOge ? ogeBlockNumberFromIntent({
    teacherInstruction: schoolPosition.note || '',
    schoolModule: schoolPosition.module || '',
    schoolTopic: schoolPosition.topic || '',
  }) : null;
  const blockSearchHint = ogeBlockSearchHint(explicitOgeBlock);
  const lessonIntent = {
    ...explicitIntent,
    topic: String(schoolPosition.topic || (isOge && blockSearchHint ? blockSearchHint : '') || explicitIntent.topic || coursePlan.current?.title || currentStage),
    query: String(isOge && blockSearchHint ? blockSearchHint : explicitIntent.query || ''),
    stage: currentStage,
    lesson: currentLesson,
    schoolModule: schoolPosition.module || '',
    schoolTopic: schoolPosition.topic || '',
    teacherInstruction: schoolPosition.note || '',
    studentName: studentProgress.student.name,
    courseTitle: course.title,
    recentHistory: studentProgress.recentLessons.slice(0, 3).map((item) => `${item.stage}${item.lesson ? ` / ${item.lesson}` : ''} — ${item.status}`).join('; '),
    nextSteps: studentProgress.nextSteps.join('; '),
  };
  const diagnosticMode = isDiagnosticIntent(lessonIntent) && explicitOgeBlock == null;

  let effectiveCourseFolderId = course.driveFolderId;
  if (isOge) {
    try {
      const resolved = await resolveGoogleDriveCourseFolder(course.title, course.driveFolderId);
      effectiveCourseFolderId = resolved.folder?.id || null;
    } catch (error) {
      console.warn('[lesson-context] Не удалось автоматически определить OGE MASTER:', errorMessage(error));
    }
  }

  const driveController = new AbortController();
  const drivePromise = withTimeout(
    getRelevantCourseMaterials({
      courseId: course.courseId,
      courseFolderId: effectiveCourseFolderId,
      studentId,
      lessonIntent,
      usedMaterialIds: studentProgress.usedMaterialsByEnrollment[course.enrollmentId] || [],
      limit: 10,
      signal: driveController.signal,
    }),
    'Google Drive',
    () => driveController.abort(),
  );

  const planningController = new AbortController();
  const planningPromise = withTimeout(
    getCoursePlanningGuidance({
      courseFolderId: effectiveCourseFolderId,
      lessonIntent,
      signal: planningController.signal,
    }),
    'Course planning baseline',
    () => planningController.abort(),
  );

  const navigatorConfigured = Boolean(process.env.OGE_NAVIGATOR_BASE_URL);
  const navigatorPromise = withTimeout(
    isOge
      ? getOgeCandidatesForStudent(studentProgress.usedQids, { ...lessonIntent, diagnosticMode })
      : Promise.resolve({ configured: navigatorConfigured, available: true, items: [] }),
    'OGE Navigator',
  );

  const [driveResult, planningResult, navigatorResult] = await Promise.allSettled([
    drivePromise,
    planningPromise,
    navigatorPromise,
  ]);

  const driveMaterials = driveResult.status === 'fulfilled' ? driveResult.value : [];
  const driveAvailable = driveResult.status === 'fulfilled';
  if (driveResult.status === 'rejected') {
    console.error('[lesson-context] Google Drive unavailable:', errorMessage(driveResult.reason));
  }

  const planningGuidance = planningResult.status === 'fulfilled'
    ? planningResult.value
    : {
      available: false,
      mode: 'textbook' as const,
      module: null,
      ogeBlock: null,
      hierarchy: [],
      federalBaseline: null,
      assessmentMap: null,
      coursePriorityMap: null,
      courseMap: null,
      moduleBrief: null,
      ogeNavigatorBaseline: null,
      ogeMasterCurriculum: null,
      ogeStudentRoute: null,
      ogeCoverageAudit: null,
      ogeBankCompletion: null,
      ogeTechnologicalMap: null,
    };
  if (planningResult.status === 'rejected') {
    console.error('[lesson-context] Course planning baseline unavailable:', errorMessage(planningResult.reason));
  }

  const navigator = navigatorResult.status === 'fulfilled'
    ? navigatorResult.value
    : { configured: navigatorConfigured, available: false, items: [] };
  if (navigatorResult.status === 'rejected') {
    console.error('[lesson-context] OGE Navigator unavailable:', errorMessage(navigatorResult.reason));
  }

  return {
    studentProgress: { student: studentProgress.student, course, currentPosition: course.currentPosition },
    coursePlan,
    lessonIntent,
    planningGuidance,
    planningStatus: { available: planningResult.status === 'fulfilled' && planningGuidance.available },
    driveMaterials,
    driveStatus: { available: driveAvailable },
    navigatorCandidates: navigator.items,
    navigatorStatus: { configured: navigator.configured, available: navigator.available },
    recentLessonHistory: studentProgress.recentLessons.slice(0, 10),
    historicalCoverage: studentProgress.historicalCoverage.filter((item) => item.enrollmentId === course.enrollmentId).slice(0, 20),
    repeatItems: studentProgress.repeatTopics,
    unfinishedItems: studentProgress.unfinishedItems,
    usedQids: studentProgress.usedQids,
    nextSteps: studentProgress.nextSteps,
  };
}
