import { ArrowLeft, FolderOpen, ListChecks, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildLessonContext } from '@/lib/lesson-context';
import { getStudentLearningContext } from '@/lib/student-learning-context';
import { LessonPlanButton } from '../../../LessonPlanButton';
import styles from './preview.module.css';

export default async function LessonPreviewPage({ params, searchParams }: PageProps<'/students/[studentId]/lesson-preview'>) {
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const student = await getStudentLearningContext(studentId);
  if (!student) notFound();
  const enrollmentId = typeof query.enrollment === 'string' ? query.enrollment : student.courses[0]?.enrollmentId;
  if (!enrollmentId) return <div className="notice warning">У ученика нет активного курса.</div>;

  const context = await buildLessonContext(studentId, { enrollmentId });
  const position = context.studentProgress.currentPosition;
  const currentStage = context.coursePlan.current?.stage || position?.stage || 'не определён';
  const currentLesson = context.coursePlan.current?.lesson || position?.lesson || 'урок не указан';
  const nextLabel = context.coursePlan.next
    ? `${context.coursePlan.next.stage}${context.coursePlan.next.lesson ? ` / ${context.coursePlan.next.lesson}` : ''}`
    : 'не определён / будет выбран после диагностики';

  return <>
    <Link className={styles.back} href={`/students/${studentId}`}><ArrowLeft size={16}/>Карточка ученика</Link>
    <header className="page-head"><div><p className="eyebrow">Контекст до обращения к AI</p><h1>Подготовка урока</h1><p className="muted">{context.studentProgress.student.name} · {context.studentProgress.course.title}</p></div></header>
    <section className={`panel ${styles.lessonPosition}`}>
      <div><small>Текущий урок</small><strong>{currentStage}</strong><span>{currentLesson}</span></div>
      <div><small>Следующий этап</small><strong>{nextLabel}</strong></div>
    </section>
    <section className={`panel ${styles.summary}`}>
      <div><ListChecks/><span><small>Course Map</small><strong>{context.coursePlan.current?.title || 'Текущая позиция задана вручную'}</strong></span></div>
      <div><FolderOpen/><span><small>Google Drive</small><strong>{context.driveStatus.available ? `${context.driveMaterials.length} подходящих материалов` : 'временно недоступен'}</strong></span></div>
      <div><Sparkles/><span><small>OGE Navigator</small><strong>{!context.navigatorStatus.configured ? 'не настроен' : context.navigatorStatus.available ? `${context.navigatorCandidates.length} заданий` : 'временно недоступен'}</strong></span></div>
    </section>
    <div className={styles.details}>
      <details><summary>Материалы Google Drive</summary><ul>{context.driveMaterials.map((item) => <li key={item.id}>{item.path}</li>)}</ul></details>
      <details><summary>Задания ФИПИ</summary><ul>{context.navigatorCandidates.map((item) => <li key={item.qid}>QID {item.qid} · {item.section} · {item.preview}</li>)}</ul></details>
      <details><summary>Повторить / закончить</summary><ul>{[...context.repeatItems, ...context.unfinishedItems].map((item) => <li key={item}>{item}</li>)}</ul></details>
    </div>
    <section className="panel"><LessonPlanButton enrollmentId={enrollmentId} lessonId={null} initialPlan={null} initialPackage={null}/></section>
  </>;
}
