'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Expand,
  Eye,
  FileText,
  Fullscreen,
  GripVertical,
  Maximize2,
  Minimize2,
  PanelRight,
  Pin,
  PinOff,
  Printer,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  GapFillExercise,
  LessonExercise,
  LessonJsonV1,
  LessonResource,
  LessonSectionId,
  MatchingExercise,
  SortExercise,
} from '@/lib/lesson-json';
import type { DesignStyleId } from '@/lib/design-styles';
import styles from './lesson-json-player.module.css';

type Props = {
  lessonId: string;
  student: string;
  course: string;
  title: string;
  sourceLabel: string | null;
  lesson: LessonJsonV1;
  sourceAvailable: boolean;
  designStyle?: DesignStyleId;
  standalone?: boolean;
  cleanMode?: boolean;
};

type SavedState = {
  responses?: Record<string, unknown>;
  completed?: string[];
};

type Feedback = { correct: number; total: number };
type SourceMode = 'closed' | 'floating' | 'docked' | 'full';

const themeClass: Record<DesignStyleId, string> = {
  'bright-kids': styles.themeKids,
  'teen-study': styles.themeTeen,
  'reading-magazine': styles.themeReading,
  'grammar-visual': styles.themeGrammar,
};

const typeLabels: Record<LessonExercise['type'], string> = {
  gap_fill: 'FILL THE GAPS',
  dropdown: 'CHOOSE',
  true_false_ns: 'TRUE / FALSE / NS',
  multiple_choice: 'CHOOSE',
  matching: 'MATCH',
  sort: 'SORT',
  open_answer: 'WRITE',
  speaking: 'SPEAKING CHALLENGE',
  reading: 'READING',
  listening: 'LISTENING',
};

function normalize(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function responseObject(responses: Record<string, unknown>, exerciseId: string) {
  const value = responses[exerciseId];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, string>
    : {};
}

function setExerciseResponse(
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
  exerciseId: string,
  next: unknown,
) {
  setResponses((current) => ({ ...current, [exerciseId]: next }));
}

function checkExercise(exercise: LessonExercise, responses: Record<string, unknown>): Feedback | null {
  const value = responseObject(responses, exercise.id);
  if (exercise.type === 'gap_fill') {
    const correct = exercise.blanks.filter((blank) => normalize(value[blank.id]) === normalize(blank.answer)).length;
    return { correct, total: exercise.blanks.length };
  }
  if (exercise.type === 'dropdown') {
    const correct = exercise.items.filter((item) => normalize(value[item.id]) === normalize(item.answer)).length;
    return { correct, total: exercise.items.length };
  }
  if (exercise.type === 'true_false_ns') {
    const correct = exercise.items.filter((item) => value[item.id] === item.answer).length;
    return { correct, total: exercise.items.length };
  }
  if (exercise.type === 'multiple_choice') {
    const correct = exercise.items.filter((item) => value[item.id] === item.answerId).length;
    return { correct, total: exercise.items.length };
  }
  if (exercise.type === 'matching') {
    const correct = exercise.leftItems.filter((item) => value[item.id] === exercise.pairs[item.id]).length;
    return { correct, total: exercise.leftItems.length };
  }
  if (exercise.type === 'sort') {
    const correct = exercise.items.filter((item) => value[item.id] === exercise.answers[item.id]).length;
    return { correct, total: exercise.items.length };
  }
  return null;
}

function correctResponse(exercise: LessonExercise): Record<string, string> | null {
  if (exercise.type === 'gap_fill') return Object.fromEntries(exercise.blanks.map((item) => [item.id, item.answer]));
  if (exercise.type === 'dropdown') return Object.fromEntries(exercise.items.map((item) => [item.id, item.answer]));
  if (exercise.type === 'true_false_ns') return Object.fromEntries(exercise.items.map((item) => [item.id, item.answer]));
  if (exercise.type === 'multiple_choice') return Object.fromEntries(exercise.items.map((item) => [item.id, item.answerId]));
  if (exercise.type === 'matching') return { ...exercise.pairs };
  if (exercise.type === 'sort') return { ...exercise.answers };
  return null;
}

function GapFill({ exercise, responses, setResponses, feedback, onPin }: {
  exercise: GapFillExercise;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  feedback?: Feedback;
  onPin: () => void;
}) {
  const values = responseObject(responses, exercise.id);
  const parts = exercise.text.split(/(\{\{[a-zA-Z0-9_-]+\}\})/g);
  const bank = exercise.wordBank || [];
  function update(blankId: string, value: string) {
    setExerciseResponse(setResponses, exercise.id, { ...values, [blankId]: value });
  }
  function useWord(word: string) {
    const empty = exercise.blanks.find((blank) => !String(values[blank.id] || '').trim());
    if (empty) update(empty.id, word);
  }

  return <div className={styles.gapWrap}>
    {bank.length > 0 && <div className={styles.bankBox}>
      <div className={styles.bankHead}><strong>Нажмите для выбора</strong><button type="button" onClick={onPin}><Pin size={15}/> Закрепить</button></div>
      <div className={styles.wordBank}>{bank.map((word, index) => <button key={`${word}-${index}`} type="button" onClick={() => useWord(word)}>{word}</button>)}</div>
    </div>}
    <div className={styles.flowText}>{parts.map((part, index) => {
      const marker = part.match(/^\{\{([a-zA-Z0-9_-]+)\}\}$/);
      if (!marker) return <span key={`t-${index}`}>{part}</span>;
      const id = marker[1];
      const blank = exercise.blanks.find((item) => item.id === id);
      const ok = feedback && blank ? normalize(values[id]) === normalize(blank.answer) : null;
      return <input
        key={`b-${id}`}
        value={values[id] || ''}
        onChange={(event) => update(id, event.target.value)}
        className={ok == null ? '' : ok ? styles.answerOk : styles.answerBad}
        aria-label="Впишите ответ"
        autoComplete="off"
      />;
    })}</div>
  </div>;
}

function DropdownTask({ exercise, responses, setResponses, feedback }: {
  exercise: Extract<LessonExercise, { type: 'dropdown' }>;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  feedback?: Feedback;
}) {
  const values = responseObject(responses, exercise.id);
  return <div className={styles.dropdownList}>{exercise.items.map((item, index) => {
    const ok = feedback ? normalize(values[item.id]) === normalize(item.answer) : null;
    return <div className={styles.dropdownRow} key={item.id}>
      <span className={styles.itemNumber}>{index + 1}</span><span>{item.before}</span>
      <label className={`${styles.selectWrap} ${ok == null ? '' : ok ? styles.answerOk : styles.answerBad}`}>
        <select value={values[item.id] || ''} onChange={(event) => setExerciseResponse(setResponses, exercise.id, { ...values, [item.id]: event.target.value })}>
          <option value="">—</option>
          {item.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select><ChevronDown size={15}/>
      </label>
      {item.after && <span>{item.after}</span>}
    </div>;
  })}</div>;
}

function TrueFalseTask({ exercise, responses, setResponses, feedback }: {
  exercise: Extract<LessonExercise, { type: 'true_false_ns' }>;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  feedback?: Feedback;
}) {
  const values = responseObject(responses, exercise.id);
  const options = [['true', 'True'], ['false', 'False'], ['ns', 'Not stated']] as const;
  return <div className={styles.statementList}>{exercise.items.map((item) => <div className={styles.statementCard} key={item.id}>
    <p>{item.statement}</p><div className={styles.statementOptions}>{options.map(([value, label]) => {
      const selected = values[item.id] === value;
      const ok = feedback && selected ? item.answer === value : null;
      return <button
        type="button"
        key={value}
        className={`${selected ? styles.selected : ''} ${ok == null ? '' : ok ? styles.answerOk : styles.answerBad}`}
        onClick={() => setExerciseResponse(setResponses, exercise.id, { ...values, [item.id]: value })}
      >{label}</button>;
    })}</div>
  </div>)}</div>;
}

function MultipleChoiceTask({ exercise, responses, setResponses, feedback }: {
  exercise: Extract<LessonExercise, { type: 'multiple_choice' }>;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  feedback?: Feedback;
}) {
  const values = responseObject(responses, exercise.id);
  return <div className={styles.statementList}>{exercise.items.map((item, index) => <div className={styles.statementCard} key={item.id}>
    <p><strong>{index + 1}.</strong> {item.question}</p><div className={styles.choiceGrid}>{item.options.map((option) => {
      const selected = values[item.id] === option.id;
      const ok = feedback && selected ? item.answerId === option.id : null;
      return <button
        type="button"
        key={option.id}
        className={`${selected ? styles.selected : ''} ${ok == null ? '' : ok ? styles.answerOk : styles.answerBad}`}
        onClick={() => setExerciseResponse(setResponses, exercise.id, { ...values, [item.id]: option.id })}
      >{option.label}</button>;
    })}</div>
  </div>)}</div>;
}

function MatchingTask({ exercise, responses, setResponses, feedback }: {
  exercise: MatchingExercise;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  feedback?: Feedback;
}) {
  const values = responseObject(responses, exercise.id);
  const [activeLeft, setActiveLeft] = useState(exercise.leftItems[0]?.id || '');
  return <div className={styles.matchGrid}>
    <div className={styles.matchColumn}>{exercise.leftItems.map((item) => {
      const selected = activeLeft === item.id;
      const chosen = values[item.id];
      const ok = feedback && chosen ? exercise.pairs[item.id] === chosen : null;
      return <button type="button" key={item.id} className={`${selected ? styles.activeMatch : ''} ${ok == null ? '' : ok ? styles.answerOk : styles.answerBad}`} onClick={() => setActiveLeft(item.id)}>
        <span>{item.label}</span>{chosen && <small>→ {exercise.rightItems.find((right) => right.id === chosen)?.label}</small>}
      </button>;
    })}</div>
    <div className={styles.matchColumn}>{exercise.rightItems.map((item) => <button type="button" key={item.id} onClick={() => {
      if (!activeLeft) return;
      setExerciseResponse(setResponses, exercise.id, { ...values, [activeLeft]: item.id });
      const index = exercise.leftItems.findIndex((left) => left.id === activeLeft);
      setActiveLeft(exercise.leftItems[index + 1]?.id || activeLeft);
    }}>{item.label}</button>)}</div>
  </div>;
}

function SortTask({ exercise, responses, setResponses, feedback, onPin }: {
  exercise: SortExercise;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  feedback?: Feedback;
  onPin: () => void;
}) {
  const values = responseObject(responses, exercise.id);
  const [selectedItem, setSelectedItem] = useState('');
  const unassigned = exercise.items.filter((item) => !values[item.id]);
  function assign(itemId: string, groupId: string) {
    setExerciseResponse(setResponses, exercise.id, { ...values, [itemId]: groupId });
    setSelectedItem('');
  }
  return <div className={styles.sortWrap}>
    <div className={styles.bankBox}>
      <div className={styles.bankHead}><strong>Нажмите или перетащите карточку</strong><button type="button" onClick={onPin}><Pin size={15}/> Закрепить внизу</button></div>
      <div className={styles.wordBank}>{unassigned.map((item) => <button
        type="button"
        draggable
        key={item.id}
        className={selectedItem === item.id ? styles.selected : ''}
        onClick={() => setSelectedItem(item.id)}
        onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}
      ><GripVertical size={14}/>{item.label}</button>)}</div>
    </div>
    <div className={styles.sortGroups}>{exercise.groups.map((group) => <div
      className={styles.sortGroup}
      key={group.id}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => assign(event.dataTransfer.getData('text/plain'), group.id)}
      onClick={() => selectedItem && assign(selectedItem, group.id)}
    >
      <h4>{group.label}</h4>
      <div className={styles.groupItems}>{exercise.items.filter((item) => values[item.id] === group.id).map((item) => {
        const ok = feedback ? exercise.answers[item.id] === group.id : null;
        return <button type="button" key={item.id} className={ok == null ? '' : ok ? styles.answerOk : styles.answerBad} onClick={(event) => {
          event.stopPropagation();
          const next = { ...values }; delete next[item.id]; setExerciseResponse(setResponses, exercise.id, next);
        }}>{item.label}</button>;
      })}</div>
    </div>)}</div>
  </div>;
}

function TextTask({ exercise, responses, setResponses }: {
  exercise: Extract<LessonExercise, { type: 'open_answer' }>;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const values = responseObject(responses, exercise.id);
  return <div className={styles.openList}>{exercise.prompts.map((item, index) => <label key={item.id}><span>{index + 1}. {item.prompt}</span><textarea value={values[item.id] || ''} onChange={(event) => setExerciseResponse(setResponses, exercise.id, { ...values, [item.id]: event.target.value })} rows={2}/></label>)}</div>;
}

function SpeakingTask({ exercise, responses, setResponses }: {
  exercise: Extract<LessonExercise, { type: 'speaking' }>;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const values = responseObject(responses, exercise.id);
  return <div className={styles.speakingCard}>
    <h4>{exercise.prompt}</h4>
    {!!exercise.starters?.length && <div className={styles.supportBlock}><strong>Start like this</strong>{exercise.starters.map((item) => <span key={item}>{item}</span>)}</div>}
    {!!exercise.usefulLanguage?.length && <div className={styles.phraseChips}>{exercise.usefulLanguage.map((item) => <span key={item}>{item}</span>)}</div>}
    <label><span>Моя опора / ключевые слова</span><textarea rows={4} value={values.answer || ''} onChange={(event) => setExerciseResponse(setResponses, exercise.id, { ...values, answer: event.target.value })}/></label>
  </div>;
}

function SourcePanel({ resource, mode, zoom, setMode, setZoom }: {
  resource: LessonResource | null;
  mode: SourceMode;
  zoom: number;
  setMode: (mode: SourceMode) => void;
  setZoom: (zoom: number) => void;
}) {
  if (!resource || mode === 'closed') return null;
  return <aside className={`${styles.sourcePanel} ${styles[`source_${mode}`]}`}>
    <div className={styles.sourceToolbar}>
      <strong>{resource.title}</strong>
      <div>
        <button type="button" onClick={() => setZoom(Math.max(70, zoom - 10))}>−</button><span>{zoom}%</span><button type="button" onClick={() => setZoom(Math.min(160, zoom + 10))}>+</button>
        <button type="button" title="Закрепить справа" onClick={() => setMode(mode === 'docked' ? 'floating' : 'docked')}><PanelRight size={16}/></button>
        <button type="button" title="На весь экран" onClick={() => setMode(mode === 'full' ? 'floating' : 'full')}><Maximize2 size={16}/></button>
        <button type="button" title="Закрыть" onClick={() => setMode('closed')}><X size={16}/></button>
      </div>
    </div>
    <div className={styles.sourceBody} style={{ fontSize: `${zoom}%` }}>
      {resource.type === 'pdf' && resource.url && <iframe title={resource.title} src={resource.url} style={{ width: `${10000 / zoom}%`, height: `${10000 / zoom}%`, transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}/>} 
      {resource.type === 'image' && resource.url && <img src={resource.url} alt={resource.alt || resource.title}/>} 
      {(resource.type === 'text' || resource.type === 'reference') && <div className={styles.sourceText}>{resource.content}</div>}
      {resource.type === 'audio' && resource.url && <audio controls src={resource.url}/>} 
    </div>
  </aside>;
}

function ExerciseCard({ exercise, responses, setResponses, completed, setCompleted, feedback, onCheck, onRetry, onShowAnswer, onOpenSource, onPin }: {
  exercise: LessonExercise;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  completed: boolean;
  setCompleted: (id: string, value: boolean) => void;
  feedback?: Feedback;
  onCheck: () => void;
  onRetry: () => void;
  onShowAnswer: () => void;
  onOpenSource: () => void;
  onPin: () => void;
}) {
  const objective = ['gap_fill', 'dropdown', 'true_false_ns', 'multiple_choice', 'matching', 'sort'].includes(exercise.type);
  return <article className={`${styles.exerciseCard} ${feedback && feedback.correct === feedback.total ? styles.exerciseCorrect : ''}`}>
    <header className={styles.exerciseHead}>
      <div><span>{typeLabels[exercise.type]}</span><h3>{exercise.title}</h3><p>{exercise.instruction}</p></div>
      {exercise.resourceId && <button type="button" className={styles.sourceButton} onClick={onOpenSource}><FileText size={16}/> Источник</button>}
    </header>
    <div className={styles.exerciseBody}>
      {exercise.type === 'gap_fill' && <GapFill exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback} onPin={onPin}/>} 
      {exercise.type === 'dropdown' && <DropdownTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'true_false_ns' && <TrueFalseTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'multiple_choice' && <MultipleChoiceTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'matching' && <MatchingTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'sort' && <SortTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback} onPin={onPin}/>} 
      {exercise.type === 'open_answer' && <TextTask exercise={exercise} responses={responses} setResponses={setResponses}/>} 
      {exercise.type === 'speaking' && <SpeakingTask exercise={exercise} responses={responses} setResponses={setResponses}/>} 
      {exercise.type === 'reading' && <div className={styles.readingPrompt}>{exercise.prompt || 'Откройте источник и выполните задание.'}</div>}
      {exercise.type === 'listening' && <div className={styles.readingPrompt}>{exercise.prompt || 'Прослушайте аудио и выполните задание.'}</div>}
    </div>
    <footer className={styles.exerciseFooter}>
      {objective ? <>
        <button type="button" className={styles.checkButton} onClick={onCheck}><Check size={17}/> Проверить</button>
        {feedback && feedback.correct < feedback.total && <button type="button" onClick={onRetry}><RotateCcw size={16}/> Попробовать ещё раз</button>}
        {feedback && feedback.correct < feedback.total && <button type="button" onClick={onShowAnswer}><Eye size={16}/> Показать ответ</button>}
        {feedback && <strong className={feedback.correct === feedback.total ? styles.resultOk : styles.resultBad}>{feedback.correct} / {feedback.total}</strong>}
      </> : <button type="button" className={completed ? styles.doneButton : ''} onClick={() => setCompleted(exercise.id, !completed)}><Check size={16}/> {completed ? 'Выполнено' : 'Отметить выполненным'}</button>}
    </footer>
  </article>;
}

export function LessonJsonPlayer(props: Props) {
  const designStyle = props.designStyle || 'teen-study';
  const [sectionId, setSectionId] = useState<LessonSectionId>('core');
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [completed, setCompletedState] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [loaded, setLoaded] = useState(false);
  const [saveFlash, setSaveFlash] = useState('');
  const [playerMode, setPlayerMode] = useState(false);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [sourceMode, setSourceMode] = useState<SourceMode>('closed');
  const [sourceId, setSourceId] = useState('');
  const [sourceZoom, setSourceZoom] = useState(100);
  const [pinnedExerciseId, setPinnedExerciseId] = useState('');

  const storageKey = `masterurok:json:${props.lessonId}`;
  const sections = props.lesson.sections;
  const currentSection = sections.find((section) => section.id === sectionId) || sections[0];
  const exercises = currentSection?.exercises || [];
  const currentExercise = exercises[Math.min(playerIndex, Math.max(0, exercises.length - 1))] || null;
  const allExercises = useMemo(() => sections.flatMap((section) => section.exercises), [sections]);

  const resources = useMemo(() => {
    const list = [...props.lesson.resources];
    if (props.sourceAvailable && !list.some((item) => item.id === 'source-book')) {
      list.push({ id: 'source-book', type: 'pdf', title: props.sourceLabel || 'Страницы учебника', url: `/api/lesson-source/${props.lessonId}` });
    }
    return list;
  }, [props.lesson.resources, props.lessonId, props.sourceAvailable, props.sourceLabel]);
  const activeResource = resources.find((item) => item.id === sourceId) || null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (props.cleanMode) { setLoaded(true); return; }
      let found = false;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const state = JSON.parse(raw) as SavedState;
          setResponses(state.responses || {});
          setCompletedState(new Set(state.completed || []));
          found = true;
        }
      } catch {}
      if (!found) {
        try {
          const response = await fetch(`/api/lesson-progress/${props.lessonId}`, { cache: 'no-store' });
          const payload = await response.json() as { ok?: boolean; state?: SavedState | null };
          if (!cancelled && payload.ok && payload.state) {
            setResponses(payload.state.responses || {});
            setCompletedState(new Set(payload.state.completed || []));
          }
        } catch {}
      }
      if (!cancelled) setLoaded(true);
    }
    load();
    return () => { cancelled = true; };
  }, [props.cleanMode, props.lessonId, storageKey]);

  useEffect(() => {
    if (!loaded || props.cleanMode) return;
    const state: SavedState = { responses, completed: [...completed] };
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [completed, loaded, props.cleanMode, responses, storageKey]);

  useEffect(() => {
    if (!playerMode) return;
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'ArrowRight') setPlayerIndex((index) => Math.min(exercises.length - 1, index + 1));
      if (event.key === 'ArrowLeft') setPlayerIndex((index) => Math.max(0, index - 1));
      if (event.key === 'Escape') setPlayerMode(false);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [exercises.length, playerMode]);

  const completedCount = allExercises.filter((exercise) => completed.has(exercise.id)).length;
  const percent = allExercises.length ? Math.round((completedCount / allExercises.length) * 100) : 0;
  const printHref = `/lesson-view/${props.lessonId}/print?style=${designStyle}`;
  const cleanHref = `/lesson-view/${props.lessonId}?style=${designStyle}&clean=1`;

  function setCompleted(id: string, value: boolean) {
    setCompletedState((current) => {
      const next = new Set(current);
      if (value) next.add(id); else next.delete(id);
      return next;
    });
  }

  function runCheck(exercise: LessonExercise) {
    const result = checkExercise(exercise, responses);
    if (!result) return;
    setFeedback((current) => ({ ...current, [exercise.id]: result }));
    if (result.correct === result.total) setCompleted(exercise.id, true);
  }

  function retry(exercise: LessonExercise) {
    setFeedback((current) => { const next = { ...current }; delete next[exercise.id]; return next; });
    setCompleted(exercise.id, false);
  }

  function showAnswer(exercise: LessonExercise) {
    const answer = correctResponse(exercise);
    if (!answer) return;
    setExerciseResponse(setResponses, exercise.id, answer);
    const result = checkExercise(exercise, { ...responses, [exercise.id]: answer });
    if (result) setFeedback((current) => ({ ...current, [exercise.id]: result }));
    setCompleted(exercise.id, true);
  }

  function openSource(exercise: LessonExercise) {
    if (!exercise.resourceId) return;
    setSourceId(exercise.resourceId);
    setSourceMode(sourceMode === 'closed' ? 'floating' : sourceMode);
  }

  async function saveWork() {
    if (props.cleanMode) return;
    const state: SavedState = { responses, completed: [...completed] };
    localStorage.setItem(storageKey, JSON.stringify(state));
    setSaveFlash('Сохраняю…');
    try {
      const response = await fetch(`/api/lesson-progress/${props.lessonId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state),
      });
      setSaveFlash(response.ok ? 'Сохранено ✓' : 'Локально сохранено');
    } catch { setSaveFlash('Локально сохранено'); }
    window.setTimeout(() => setSaveFlash(''), 1800);
  }

  function reset() {
    if (!window.confirm('Очистить ответы и прогресс этого урока?')) return;
    setResponses({}); setCompletedState(new Set()); setFeedback({}); setPinnedExerciseId('');
    if (!props.cleanMode) localStorage.removeItem(storageKey);
  }

  async function enterPlayer() {
    setPlayerMode(true);
    setPlayerIndex(0);
    try { await document.documentElement.requestFullscreen?.(); } catch {}
  }
  async function leavePlayer() {
    setPlayerMode(false);
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify({ lesson: props.lesson, work: { responses, completed: [...completed] } }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${props.title.replace(/[\\/:*?"<>|]+/g, ' ')} — lesson.json`; a.click(); URL.revokeObjectURL(url);
  }

  const pinnedExercise = allExercises.find((exercise) => exercise.id === pinnedExerciseId);
  const contentClass = sourceMode === 'docked' ? styles.withDockedSource : '';

  const renderExercise = (exercise: LessonExercise) => <ExerciseCard
    key={exercise.id}
    exercise={exercise}
    responses={responses}
    setResponses={setResponses}
    completed={completed.has(exercise.id)}
    setCompleted={setCompleted}
    feedback={feedback[exercise.id]}
    onCheck={() => runCheck(exercise)}
    onRetry={() => retry(exercise)}
    onShowAnswer={() => showAnswer(exercise)}
    onOpenSource={() => openSource(exercise)}
    onPin={() => setPinnedExerciseId((current) => current === exercise.id ? '' : exercise.id)}
  />;

  if (playerMode && currentExercise) {
    return <div className={`${styles.fullscreenPlayer} ${themeClass[designStyle]}`}>
      <div className={styles.playerTopbar}>
        <button type="button" onClick={leavePlayer}><X size={22}/> Выйти</button>
        <div className={styles.playerProgress}><div><strong>Task {playerIndex + 1}</strong><span>из {exercises.length} · {currentSection.title}</span></div><div className={styles.progressDots}>{exercises.map((exercise, index) => <button type="button" key={exercise.id} className={`${index === playerIndex ? styles.currentDot : ''} ${completed.has(exercise.id) ? styles.doneDot : ''}`} onClick={() => setPlayerIndex(index)} aria-label={`Task ${index + 1}`}/>)}</div></div>
        <button type="button" className={styles.iconButton} title="Свернуть fullscreen" onClick={() => document.exitFullscreen?.()}><Minimize2 size={22}/></button>
        <button type="button" disabled={playerIndex === 0} onClick={() => setPlayerIndex((index) => Math.max(0, index - 1))}><ArrowLeft size={22}/> Назад</button>
        <button type="button" disabled={playerIndex >= exercises.length - 1} onClick={() => setPlayerIndex((index) => Math.min(exercises.length - 1, index + 1))}>Вперёд <ArrowRight size={22}/></button>
      </div>
      <main className={`${styles.playerCanvas} ${contentClass}`}>{renderExercise(currentExercise)}</main>
      <SourcePanel resource={activeResource} mode={sourceMode} zoom={sourceZoom} setMode={setSourceMode} setZoom={setSourceZoom}/>
      {pinnedExercise && <StickyBank exercise={pinnedExercise} responses={responses} setResponses={setResponses} onClose={() => setPinnedExerciseId('')}/>} 
    </div>;
  }

  return <div className={`${styles.page} ${themeClass[designStyle]}`}>
    <div className={styles.toolbar}>
      <div>{props.standalone ? <button type="button" onClick={() => window.close()}><X size={16}/> Закрыть урок</button> : <Link href="/"><ArrowLeft size={16}/> Сегодня</Link>}</div>
      <div className={styles.toolbarGroup}>
        {!props.cleanMode && <button type="button" onClick={saveWork}><Save size={16}/> {saveFlash || 'Сохранить работу'}</button>}
        <Link href={cleanHref} target="_blank"><Sparkles size={16}/> Чистая версия</Link>
        <Link href={printHref} target="_blank"><Printer size={16}/> Печать</Link>
        <button type="button" onClick={downloadJson}><Download size={16}/> JSON</button>
        <button type="button" onClick={reset}><RotateCcw size={16}/> Сбросить</button>
        <button type="button" className={styles.fullscreenButton} onClick={enterPlayer}><Fullscreen size={17}/> Полный экран</button>
      </div>
    </div>

    <div className={`${styles.content} ${contentClass}`}>
      <header className={styles.hero}><div><span><Sparkles size={14}/> INTERACTIVE LESSON · JSON V1</span><h1>{props.title}</h1><p>{props.student} · {props.course}</p>{props.sourceLabel && <small>{props.sourceLabel}</small>}</div><div className={styles.progressCard}><strong>{percent}%</strong><span>{completedCount} из {allExercises.length}</span><i><b style={{ width: `${percent}%` }}/></i></div></header>
      <nav className={styles.sectionTabs}>{sections.map((section) => <button type="button" key={section.id} className={sectionId === section.id ? styles.activeTab : ''} onClick={() => { setSectionId(section.id); setPlayerIndex(0); }}>{section.title}<span>{section.exercises.length}</span></button>)}</nav>
      <section className={styles.exerciseList}>{exercises.map(renderExercise)}</section>
    </div>

    <SourcePanel resource={activeResource} mode={sourceMode} zoom={sourceZoom} setMode={setSourceMode} setZoom={setSourceZoom}/>
    {pinnedExercise && <StickyBank exercise={pinnedExercise} responses={responses} setResponses={setResponses} onClose={() => setPinnedExerciseId('')}/>} 
  </div>;
}

function StickyBank({ exercise, responses, setResponses, onClose }: {
  exercise: LessonExercise;
  responses: Record<string, unknown>;
  setResponses: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onClose: () => void;
}) {
  if (exercise.type !== 'gap_fill' && exercise.type !== 'sort') return null;
  const values = responseObject(responses, exercise.id);
  const words = exercise.type === 'gap_fill'
    ? exercise.wordBank || []
    : exercise.items.filter((item) => !values[item.id]).map((item) => item.label);
  return <div className={styles.stickyBank}><div><Pin size={16}/><strong>{exercise.title}</strong></div><div className={styles.wordBank}>{words.map((word, index) => <button type="button" key={`${word}-${index}`} onClick={() => {
    if (exercise.type === 'gap_fill') {
      const empty = exercise.blanks.find((blank) => !String(values[blank.id] || '').trim());
      if (empty) setExerciseResponse(setResponses, exercise.id, { ...values, [empty.id]: word });
    }
  }}>{word}</button>)}</div><button type="button" onClick={onClose}><PinOff size={16}/> Открепить</button></div>;
}
