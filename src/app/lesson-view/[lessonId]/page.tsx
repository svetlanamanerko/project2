import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getLessonDesignData } from '@/lib/design-data';
import { normalizeDesignStyle } from '@/lib/design-styles';
import { InteractiveLesson } from '@/app/(private)/lessons/[lessonId]/interactive/InteractiveLesson';

export default async function StudentLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ style?: string; clean?: string }>;
}) {
  await requireSession();
  const [{ lessonId }, query] = await Promise.all([params, searchParams]);
  const lesson = await getLessonDesignData(lessonId);
  if (!lesson) notFound();
  const designStyle = normalizeDesignStyle(query.style);

  return <InteractiveLesson
    lessonId={lesson.lessonId}
    student={lesson.student}
    course={lesson.course}
    title={lesson.title}
    sourceLabel={lesson.sourceLabel}
    studentWorksheet={lesson.studentWorksheet}
    reserve={lesson.reserve}
    homework={lesson.homework}
    vocabularyBank={lesson.vocabularyBank}
    designStyle={designStyle}
    standalone
    cleanMode={query.clean === '1'}
  />;
}
