import { notFound } from 'next/navigation';
import { getLessonDesignData } from '@/lib/design-data';
import { InteractiveLesson } from './InteractiveLesson';
import { LessonJsonPlayer } from './LessonJsonPlayer';

export default async function InteractiveLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = await getLessonDesignData(lessonId);
  if (!lesson) notFound();

  if (lesson.interactiveLesson) {
    return <div className="lesson-json-v2" data-design-style="teen-study">
      <LessonJsonPlayer
        lessonId={lesson.lessonId}
        student={lesson.student}
        course={lesson.course}
        title={lesson.title}
        sourceLabel={lesson.sourceLabel}
        lesson={lesson.interactiveLesson}
        sourceAvailable={lesson.sourceAvailable}
      />
    </div>;
  }

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
  />;
}
