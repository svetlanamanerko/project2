'use client';

import { MessageCircleMore, Sparkles, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import styles from './ConversationalLessonPrep.module.css';

type PlanResponse = {
  ok: boolean;
  plan?: string;
  message?: string;
  credits?: number | null;
};

type LessonPackage = {
  title: string;
  sourceLabel: string | null;
  studentWorksheet: string;
  teacherPack: string;
  homework: string;
  reserve: string;
  vocabularyBank: string;
  studentDriveUrl: string | null;
  teacherDriveUrl: string | null;
};

type PackageResponse = {
  ok: boolean;
  message?: string;
  warning?: string | null;
  credits?: number | null;
  package?: LessonPackage;
};

export function ConversationalLessonPrep({
  enrollmentId,
  initialInstruction = '',
}: {
  enrollmentId: string;
  initialInstruction?: string | null;
}) {
  const [instruction, setInstruction] = useState(initialInstruction || '');
  const [plan, setPlan] = useState('');
  const [planCredits, setPlanCredits] = useState<number | null>(null);
  const [lessonPackage, setLessonPackage] = useState<LessonPackage | null>(null);
  const [packageCredits, setPackageCredits] = useState<number | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingPackage, setLoadingPackage] = useState(false);

  async function saveInstruction() {
    const response = await fetch('/api/lesson-focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, note: instruction }),
    });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
    if (!response.ok || !data.ok) throw new Error(data.message || 'Не удалось сохранить пожелание к уроку.');
  }

  async function preparePlan() {
    setLoadingPlan(true);
    setError('');
    setWarning('');
    try {
      await saveInstruction();
      const response = await fetch('/api/kie/lesson-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId }),
      });
      const data = await response.json() as PlanResponse;
      if (!response.ok || !data.ok || !data.plan) throw new Error(data.message || 'Не удалось подготовить план урока.');
      setPlan(data.plan);
      setPlanCredits(data.credits ?? null);
      setLessonPackage(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось подготовить урок.');
    } finally {
      setLoadingPlan(false);
    }
  }

  async function assemblePackage() {
    setLoadingPackage(true);
    setError('');
    setWarning('');
    try {
      await saveInstruction();
      const response = await fetch('/api/kie/lesson-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId }),
      });
      const data = await response.json() as PackageResponse;
      if (!response.ok || !data.ok || !data.package) throw new Error(data.message || 'Не удалось собрать материалы урока.');
      setLessonPackage(data.package);
      setPackageCredits(data.credits ?? null);
      setWarning(data.warning || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось собрать материалы урока.');
    } finally {
      setLoadingPackage(false);
    }
  }

  return <div className={styles.root}>
    <div className={styles.head}>
      <div className={styles.icon}><MessageCircleMore size={22}/></div>
      <div>
        <h2>Что нужно сегодня?</h2>
        <p>Пиши обычными словами, как мне в чате. Всё остальное Мастерская подхватит сама.</p>
      </div>
    </div>

    <textarea
      className={styles.textarea}
      value={instruction}
      onChange={(event) => setInstruction(event.target.value)}
      rows={4}
      placeholder="Например: продолжаем по плану, но сегодня ещё повторить Past Simple и дать 10 минут speaking. Домашку сделать короче."
    />

    <div className={styles.chips}>
      <button type="button" onClick={() => setInstruction('Продолжаем по плану.')}>Продолжаем по плану</button>
      <button type="button" onClick={() => setInstruction('')}>Без дополнительной заметки</button>
    </div>

    <div className={styles.actions}>
      <button className="button primary" type="button" onClick={preparePlan} disabled={loadingPlan || loadingPackage}>
        <Sparkles size={17}/>{loadingPlan ? 'Готовлю…' : plan ? 'Обновить план' : 'Подготовить урок'}
      </button>
      {plan && <button className={`button ${styles.secondary}`} type="button" onClick={assemblePackage} disabled={loadingPackage || loadingPlan}>
        <WandSparkles size={17}/>{loadingPackage ? 'Собираю материалы…' : lessonPackage ? 'Пересобрать материалы' : 'Собрать материалы'}
      </button>}
    </div>

    {error && <div className={`notice danger ${styles.message}`}>{error}</div>}
    {warning && <div className={`notice warning ${styles.message}`}>{warning}</div>}

    {plan && <section className={styles.result}>
      <div className={styles.resultTitle}>План урока{planCredits != null ? ` · ${planCredits} credits` : ''}</div>
      <div className={styles.planText}>{plan}</div>
    </section>}

    {lessonPackage && <section className={`${styles.result} ${styles.package}`}>
      <div className={styles.resultTitle}>Готовые материалы{packageCredits != null ? ` · ${packageCredits} credits` : ''}</div>
      <h3>{lessonPackage.title}</h3>
      {lessonPackage.sourceLabel && <p className={styles.source}>Источник: {lessonPackage.sourceLabel}</p>}
      {(lessonPackage.studentDriveUrl || lessonPackage.teacherDriveUrl) && <div className={styles.fileRow}>
        {lessonPackage.studentDriveUrl && <a className={`button ${styles.secondary}`} href={lessonPackage.studentDriveUrl} target="_blank" rel="noreferrer">Student Worksheet</a>}
        {lessonPackage.teacherDriveUrl && <a className={`button ${styles.secondary}`} href={lessonPackage.teacherDriveUrl} target="_blank" rel="noreferrer">Teacher Pack</a>}
      </div>}
      <details open><summary>Student Worksheet</summary><div>{lessonPackage.studentWorksheet}</div></details>
      <details><summary>Teacher Pack</summary><div>{lessonPackage.teacherPack}</div></details>
      <details><summary>Homework</summary><div>{lessonPackage.homework}</div></details>
      <details><summary>Reserve</summary><div>{lessonPackage.reserve}</div></details>
      <details><summary>Vocabulary Bank</summary><div>{lessonPackage.vocabularyBank}</div></details>
    </section>}
  </div>;
}
