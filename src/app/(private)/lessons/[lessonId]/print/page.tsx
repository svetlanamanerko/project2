import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getLessonDesignData } from '@/lib/design-data';
import { parseExercises, parseVocabulary } from '@/lib/lesson-design-parser';
import { PrintButton } from './PrintButton';
import styles from './print.module.css';

function ExerciseSection({ title, text, prefix }: { title: string; text: string; prefix: string }) {
  const exercises = parseExercises(text, prefix);
  return <section className={styles.section}>
    <h2 className={styles.sectionTitle}>{title}</h2>
    {exercises.map((exercise) => <article className={styles.exercise} key={exercise.id}>
      <h3>{exercise.title}</h3>
      {exercise.body.map((line, index) => line
        ? <p key={`${exercise.id}-${index}`}>{line}</p>
        : <p key={`${exercise.id}-${index}`}>&nbsp;</p>)}
    </article>)}
  </section>;
}

export default async function PrintLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = await getLessonDesignData(lessonId);
  if (!lesson) notFound();
  const vocabulary = parseVocabulary(lesson.vocabularyBank);

  return <div className={styles.page}>
    <div className={styles.toolbar}>
      <Link className={styles.backLink} href={`/lessons/${lesson.lessonId}/interactive`}><ChevronLeft size={16}/> Интерактивный урок</Link>
      <PrintButton/>
    </div>
    <article className={styles.sheet}>
      <header className={styles.header}>
        <p className={styles.kicker}>Student Worksheet · Design Version</p>
        <h1>{lesson.title}</h1>
        <p className={styles.meta}>{lesson.student} · {lesson.course}</p>
        {lesson.sourceLabel && <small className={styles.source}>Источник: {lesson.sourceLabel}</small>}
      </header>

      <ExerciseSection title="CORE" text={lesson.studentWorksheet} prefix="print-core"/>
      <ExerciseSection title="RESERVE / EXTRA PRACTICE" text={lesson.reserve} prefix="print-reserve"/>
      <ExerciseSection title="HOMEWORK" text={lesson.homework} prefix="print-homework"/>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>VOCABULARY BANK</h2>
        <table className={styles.vocabTable}>
          <thead><tr><th>Word / Phrase</th><th>Russian</th><th>Example / Collocation</th></tr></thead>
          <tbody>{vocabulary.map((row, index) => <tr key={`${row.word}-${index}`}><td><strong>{row.word}</strong></td><td>{row.russian}</td><td>{row.example}</td></tr>)}</tbody>
        </table>
      </section>

      <div className={styles.footer}>Мастерская уроков · дизайн-версия</div>
    </article>
  </div>;
}
