'use client';

import Link from 'next/link';
import { BookOpen, Check, ChevronLeft, Circle, MessageSquareText, Printer, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { isSpeakingExercise, parseExercises, parseVocabulary, type DesignExercise } from '@/lib/lesson-design-parser';
import styles from './interactive.module.css';

type Props = {
  lessonId: string;
  student: string;
  course: string;
  title: string;
  sourceLabel: string | null;
  studentWorksheet: string;
  reserve: string;
  homework: string;
  vocabularyBank: string;
};

type Tab = 'core' | 'reserve' | 'homework' | 'vocabulary';

type SavedState = {
  completed?: string[];
  answers?: Record<string, string>;
  speaking?: Record<string, string>;
};

function FillableLine({ text, lineKey, answers, setAnswer }: {
  text: string;
  lineKey: string;
  answers: Record<string, string>;
  setAnswer: (key: string, value: string) => void;
}) {
  const parts = text.split(/(_{1,})/g);
  let blank = 0;
  return <p className={styles.exerciseLine}>{parts.map((part, index) => {
    if (!/^_+$/.test(part)) return <span key={`${lineKey}-t-${index}`}>{part}</span>;
    const key = `${lineKey}-b-${blank++}`;
    const width = Math.max(42, Math.min(120, part.length * 16 + 22));
    return <input
      key={key}
      className={styles.inlineInput}
      style={{ width }}
      value={answers[key] || ''}
      onChange={(event) => setAnswer(key, event.target.value)}
      aria-label="Впишите ответ"
      autoComplete="off"
    />;
  })}</p>;
}

function ExerciseCard({ exercise, completed, onToggle, answers, setAnswer, speaking, setSpeaking }: {
  exercise: DesignExercise;
  completed: boolean;
  onToggle: () => void;
  answers: Record<string, string>;
  setAnswer: (key: string, value: string) => void;
  speaking: Record<string, string>;
  setSpeaking: (key: string, value: string) => void;
}) {
  const hasSpeaking = isSpeakingExercise(exercise);
  return <article className={`${styles.exerciseCard} ${completed ? styles.exerciseDone : ''}`}>
    <div className={styles.exerciseHead}>
      <div>
        <span className={styles.exerciseEyebrow}>Practice</span>
        <h3>{exercise.title}</h3>
      </div>
      <button type="button" className={styles.doneButton} onClick={onToggle} aria-pressed={completed}>
        {completed ? <Check size={17}/> : <Circle size={17}/>} {completed ? 'Готово' : 'Отметить'}
      </button>
    </div>
    <div className={styles.exerciseBody}>
      {exercise.body.map((line, index) => line
        ? <FillableLine key={`${exercise.id}-${index}`} text={line} lineKey={`${exercise.id}-${index}`} answers={answers} setAnswer={setAnswer}/>
        : <div key={`${exercise.id}-${index}`} className={styles.smallGap}/>)}
    </div>
    {hasSpeaking && <div className={styles.speakingBox}>
      <div className={styles.speakingTitle}><MessageSquareText size={17}/> Мой ответ / опора для речи</div>
      <textarea
        value={speaking[exercise.id] || ''}
        onChange={(event) => setSpeaking(exercise.id, event.target.value)}
        placeholder="Можно набросать ключевые слова или фразы…"
        rows={3}
      />
    </div>}
  </article>;
}

export function InteractiveLesson(props: Props) {
  const [tab, setTab] = useState<Tab>('core');
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [speaking, setSpeaking] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const core = useMemo(() => parseExercises(props.studentWorksheet, 'core'), [props.studentWorksheet]);
  const reserve = useMemo(() => parseExercises(props.reserve, 'reserve'), [props.reserve]);
  const homework = useMemo(() => parseExercises(props.homework, 'homework'), [props.homework]);
  const vocabulary = useMemo(() => parseVocabulary(props.vocabularyBank), [props.vocabularyBank]);
  const allExercises = useMemo(() => [...core, ...reserve, ...homework], [core, reserve, homework]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`masterurok:interactive:${props.lessonId}`);
      if (raw) {
        const saved = JSON.parse(raw) as SavedState;
        setCompleted(new Set(saved.completed || []));
        setAnswers(saved.answers || {});
        setSpeaking(saved.speaking || {});
      }
    } catch {}
    setLoaded(true);
  }, [props.lessonId]);

  useEffect(() => {
    if (!loaded) return;
    const state: SavedState = { completed: [...completed], answers, speaking };
    localStorage.setItem(`masterurok:interactive:${props.lessonId}`, JSON.stringify(state));
  }, [answers, completed, loaded, props.lessonId, speaking]);

  const visible = tab === 'core' ? core : tab === 'reserve' ? reserve : homework;
  const completedCount = allExercises.filter((item) => completed.has(item.id)).length;
  const percent = allExercises.length ? Math.round((completedCount / allExercises.length) * 100) : 0;

  function toggle(id: string) {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function reset() {
    if (!window.confirm('Очистить ответы и прогресс этого интерактивного урока?')) return;
    setCompleted(new Set());
    setAnswers({});
    setSpeaking({});
    localStorage.removeItem(`masterurok:interactive:${props.lessonId}`);
  }

  return <div className={styles.lessonPage}>
    <div className={styles.topActions}>
      <Link href="/" className={styles.backLink}><ChevronLeft size={17}/> Сегодня</Link>
      <div className={styles.actionGroup}>
        <button type="button" className={styles.secondaryButton} onClick={reset}><RotateCcw size={15}/> Сбросить</button>
        <Link href={`/lessons/${props.lessonId}/print`} className={styles.printLink}><Printer size={15}/> Версия для печати</Link>
      </div>
    </div>

    <header className={styles.lessonHero}>
      <div className={styles.heroIcon}><BookOpen size={28}/></div>
      <div className={styles.heroCopy}>
        <div className={styles.heroKicker}><Sparkles size={14}/> Интерактивный урок</div>
        <h1>{props.title}</h1>
        <p>{props.student} · {props.course}</p>
        {props.sourceLabel && <small>Источник: {props.sourceLabel}</small>}
      </div>
      <div className={styles.progressCard}>
        <strong>{percent}%</strong>
        <span>{completedCount} из {allExercises.length} заданий</span>
        <div className={styles.progressTrack}><i style={{ width: `${percent}%` }}/></div>
      </div>
    </header>

    <nav className={styles.tabs} aria-label="Разделы урока">
      <button className={tab === 'core' ? styles.activeTab : ''} onClick={() => setTab('core')}>CORE <span>{core.length}</span></button>
      <button className={tab === 'reserve' ? styles.activeTab : ''} onClick={() => setTab('reserve')}>RESERVE <span>{reserve.length}</span></button>
      <button className={tab === 'homework' ? styles.activeTab : ''} onClick={() => setTab('homework')}>HOMEWORK <span>{homework.length}</span></button>
      <button className={tab === 'vocabulary' ? styles.activeTab : ''} onClick={() => setTab('vocabulary')}>VOCABULARY <span>{vocabulary.length}</span></button>
    </nav>

    {tab !== 'vocabulary' ? <section className={styles.exerciseGrid}>
      {visible.map((exercise) => <ExerciseCard
        key={exercise.id}
        exercise={exercise}
        completed={completed.has(exercise.id)}
        onToggle={() => toggle(exercise.id)}
        answers={answers}
        setAnswer={(key, value) => setAnswers((current) => ({ ...current, [key]: value }))}
        speaking={speaking}
        setSpeaking={(key, value) => setSpeaking((current) => ({ ...current, [key]: value }))}
      />)}
    </section> : <section className={styles.vocabGrid}>
      {vocabulary.map((row, index) => <article className={styles.vocabCard} key={`${row.word}-${index}`}>
        <span className={styles.vocabNumber}>{String(index + 1).padStart(2, '0')}</span>
        <h3>{row.word}</h3>
        <p>{row.russian}</p>
        {row.example && <small>{row.example}</small>}
      </article>)}
    </section>}
  </div>;
}
