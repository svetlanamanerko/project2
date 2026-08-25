'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Fullscreen,
  GripVertical,
  Maximize2,
  Minimize2,
  PanelRight,
  Play,
  Printer,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { DesignStyleId } from '@/lib/design-styles';
import type {
  GapFillExercise,
  LessonExercise,
  LessonJsonV1,
  LessonResource,
  LessonSectionId,
  MatchingExercise,
  SortExercise,
} from '@/lib/lesson-json';
import styles from './lesson-player-v2.module.css';

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

type ExerciseProps<T extends LessonExercise = LessonExercise> = {
  exercise: T;
  responses: Record<string, unknown>;
  setResponses: Dispatch<SetStateAction<Record<string, unknown>>>;
  feedback?: Feedback;
};

const themeMap: Record<DesignStyleId, string> = {
  'bright-kids': styles.themeBrightKids,
  'teen-study': styles.themeTeen,
  'reading-magazine': styles.themeReading,
  'grammar-visual': styles.themeGrammar,
};

const sectionLabels: Record<LessonSectionId, string> = {
  core: 'CORE',
  reserve: 'RESERVE',
  homework: 'HOMEWORK',
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
  oral_drill: 'ORAL PRACTICE',
  self_check: 'SELF-CHECK',
  reading: 'READING',
  listening: 'LISTENING',
};

function normalize(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function responseObject(responses: Record<string, unknown>, id: string) {
  const value = responses[id];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, string>
    : {};
}

function setExerciseResponse(
  setter: Dispatch<SetStateAction<Record<string, unknown>>>,
  id: string,
  value: unknown,
) {
  setter((current) => ({ ...current, [id]: value }));
}

function objectiveExercise(exercise: LessonExercise) {
  return ['gap_fill', 'dropdown', 'true_false_ns', 'multiple_choice', 'matching', 'sort'].includes(exercise.type);
}

function checkExercise(exercise: LessonExercise, responses: Record<string, unknown>): Feedback | null {
  const value = responseObject(responses, exercise.id);
  if (exercise.type === 'gap_fill') {
    return { correct: exercise.blanks.filter((item) => normalize(value[item.id]) === normalize(item.answer)).length, total: exercise.blanks.length };
  }
  if (exercise.type === 'dropdown') {
    return { correct: exercise.items.filter((item) => normalize(value[item.id]) === normalize(item.answer)).length, total: exercise.items.length };
  }
  if (exercise.type === 'true_false_ns') {
    return { correct: exercise.items.filter((item) => value[item.id] === item.answer).length, total: exercise.items.length };
  }
  if (exercise.type === 'multiple_choice') {
    return { correct: exercise.items.filter((item) => value[item.id] === item.answerId).length, total: exercise.items.length };
  }
  if (exercise.type === 'matching') {
    return { correct: exercise.leftItems.filter((item) => value[item.id] === exercise.pairs[item.id]).length, total: exercise.leftItems.length };
  }
  if (exercise.type === 'sort') {
    return { correct: exercise.items.filter((item) => value[item.id] === exercise.answers[item.id]).length, total: exercise.items.length };
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

function FeedbackClass({ ok }: { ok: boolean | null }) {
  return <span aria-hidden="true" className={ok == null ? styles.answerStateIdle : ok ? styles.answerStateOk : styles.answerStateBad} />;
}

function GapFillTask({ exercise, responses, setResponses, feedback }: ExerciseProps<GapFillExercise>) {
  const values = responseObject(responses, exercise.id);
  const parts = exercise.text.split(/(\{\{[a-zA-Z0-9_-]+\}\})/g);
  const update = (blankId: string, value: string) => setExerciseResponse(setResponses, exercise.id, { ...values, [blankId]: value });
  const useWord = (word: string) => {
    const blank = exercise.blanks.find((item) => !String(values[item.id] || '').trim());
    if (blank) update(blank.id, word);
  };
  return <div className={styles.gapLayout}>
    {!!exercise.wordBank?.length && <aside className={styles.wordBank}>
      <div className={styles.bankTitle}><span>WORD BANK</span><small>Нажмите на слово</small></div>
      <div className={styles.chips}>{exercise.wordBank.map((word, index) => <button type="button" key={`${word}-${index}`} onClick={() => useWord(word)}>{word}</button>)}</div>
    </aside>}
    <div className={styles.gapText}>{parts.map((part, index) => {
      const marker = part.match(/^\{\{([a-zA-Z0-9_-]+)\}\}$/);
      if (!marker) return <span key={`text-${index}`}>{part}</span>;
      const blankId = marker[1];
      const blank = exercise.blanks.find((item) => item.id === blankId);
      const ok = feedback && blank ? normalize(values[blankId]) === normalize(blank.answer) : null;
      return <span className={styles.inlineInput} key={blankId}>
        <input value={values[blankId] || ''} onChange={(event) => update(blankId, event.target.value)} autoComplete="off" aria-label="Ответ" />
        <FeedbackClass ok={ok}/>
      </span>;
    })}</div>
  </div>;
}

function DropdownTask({ exercise, responses, setResponses, feedback }: ExerciseProps<Extract<LessonExercise, { type: 'dropdown' }>>) {
  const values = responseObject(responses, exercise.id);
  return <div className={styles.rows}>{exercise.items.map((item, index) => {
    const ok = feedback ? normalize(values[item.id]) === normalize(item.answer) : null;
    return <div className={styles.choiceRow} key={item.id}>
      <b>{index + 1}</b><span>{item.before}</span>
      <label className={styles.selectBox}><select value={values[item.id] || ''} onChange={(event) => setExerciseResponse(setResponses, exercise.id, { ...values, [item.id]: event.target.value })}>
        <option value="">—</option>{item.options.map((option) => <option value={option} key={option}>{option}</option>)}
      </select><ChevronDown size={16}/></label>
      {item.after && <span>{item.after}</span>}<FeedbackClass ok={ok}/>
    </div>;
  })}</div>;
}

function TrueFalseTask({ exercise, responses, setResponses, feedback }: ExerciseProps<Extract<LessonExercise, { type: 'true_false_ns' }>>) {
  const values = responseObject(responses, exercise.id);
  const options = [['true', 'True'], ['false', 'False'], ['ns', 'Not stated']] as const;
  return <div className={styles.statementStack}>{exercise.items.map((item, index) => <div className={styles.statement} key={item.id}>
    <p><b>{index + 1}</b>{item.statement}</p>
    <div className={styles.bigOptions}>{options.map(([value, label]) => {
      const selected = values[item.id] === value;
      const ok = feedback && selected ? item.answer === value : null;
      return <button type="button" key={value} className={`${selected ? styles.selected : ''} ${ok == null ? '' : ok ? styles.correctChoice : styles.wrongChoice}`} onClick={() => setExerciseResponse(setResponses, exercise.id, { ...values, [item.id]: value })}>{label}</button>;
    })}</div>
  </div>)}</div>;
}

function MultipleChoiceTask({ exercise, responses, setResponses, feedback }: ExerciseProps<Extract<LessonExercise, { type: 'multiple_choice' }>>) {
  const values = responseObject(responses, exercise.id);
  return <div className={styles.statementStack}>{exercise.items.map((item, index) => <div className={styles.statement} key={item.id}>
    <p><b>{index + 1}</b>{item.question}</p>
    <div className={styles.bigOptions}>{item.options.map((option) => {
      const selected = values[item.id] === option.id;
      const ok = feedback && selected ? item.answerId === option.id : null;
      return <button type="button" key={option.id} className={`${selected ? styles.selected : ''} ${ok == null ? '' : ok ? styles.correctChoice : styles.wrongChoice}`} onClick={() => setExerciseResponse(setResponses, exercise.id, { ...values, [item.id]: option.id })}>{option.label}</button>;
    })}</div>
  </div>)}</div>;
}

function MatchingTask({ exercise, responses, setResponses, feedback }: ExerciseProps<MatchingExercise>) {
  const values = responseObject(responses, exercise.id);
  const [activeLeft, setActiveLeft] = useState(exercise.leftItems[0]?.id || '');
  const usedRight = new Set(Object.values(values));
  return <div className={styles.matchBoard}>
    <div className={styles.matchSide}><span className={styles.sideTitle}>1. Выберите слева</span>{exercise.leftItems.map((item) => {
      const chosenId = values[item.id];
      const chosen = exercise.rightItems.find((right) => right.id === chosenId);
      const ok = feedback && chosenId ? exercise.pairs[item.id] === chosenId : null;
      return <button type="button" key={item.id} className={`${styles.matchCard} ${activeLeft === item.id ? styles.activeMatch : ''} ${ok == null ? '' : ok ? styles.matchOk : styles.matchBad}`} onClick={() => setActiveLeft(item.id)}>
        <span>{item.label}</span>{chosen && <small>→ {chosen.label}</small>}
      </button>;
    })}</div>
    <div className={styles.matchArrow}>→</div>
    <div className={styles.matchSide}><span className={styles.sideTitle}>2. Выберите пару</span>{exercise.rightItems.map((item) => <button type="button" key={item.id} className={`${styles.matchCard} ${usedRight.has(item.id) ? styles.usedMatch : ''}`} onClick={() => {
      if (!activeLeft) return;
      const next = { ...values, [activeLeft]: item.id };
      setExerciseResponse(setResponses, exercise.id, next);
      const index = exercise.leftItems.findIndex((left) => left.id === activeLeft);
      setActiveLeft(exercise.leftItems[index + 1]?.id || activeLeft);
    }}>{item.label}</button>)}</div>
  </div>;
}

function SortTask({ exercise, responses, setResponses, feedback }: ExerciseProps<SortExercise>) {
  const values = responseObject(responses, exercise.id);
  const [selected, setSelected] = useState('');
  const assign = (itemId: string, groupId: string) => {
    if (!itemId) return;
    setExerciseResponse(setResponses, exercise.id, { ...values, [itemId]: groupId });
    setSelected('');
  };
  const unassigned = exercise.items.filter((item) => !values[item.id]);
  return <div className={styles.sortLayout}>
    <div className={styles.sortBank}><div><span>CARD BANK</span><small>Нажмите или перетащите</small></div><div className={styles.chips}>{unassigned.map((item) => <button type="button" draggable key={item.id} className={selected === item.id ? styles.selectedChip : ''} onClick={() => setSelected(item.id)} onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}><GripVertical size={14}/>{item.label}</button>)}</div></div>
    <div className={styles.dropGrid}>{exercise.groups.map((group) => <div className={styles.dropZone} key={group.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => assign(event.dataTransfer.getData('text/plain'), group.id)} onClick={() => selected && assign(selected, group.id)}>
      <h4>{group.label}</h4>
      <div>{exercise.items.filter((item) => values[item.id] === group.id).map((item) => {
        const ok = feedback ? exercise.answers[item.id] === group.id : null;
        return <button type="button" key={item.id} className={ok == null ? '' : ok ? styles.correctChip : styles.wrongChip} onClick={(event) => {
          event.stopPropagation(); const next = { ...values }; delete next[item.id]; setExerciseResponse(setResponses, exercise.id, next);
        }}>{item.label}</button>;
      })}</div>
    </div>)}</div>
  </div>;
}

function OpenAnswerTask({ exercise, responses, setResponses }: ExerciseProps<Extract<LessonExercise, { type: 'open_answer' }>>) {
  const values = responseObject(responses, exercise.id);
  return <div className={styles.openGrid}>{exercise.prompts.map((item, index) => <label key={item.id}><span><b>{index + 1}</b>{item.prompt}</span><textarea rows={3} value={values[item.id] || ''} onChange={(event) => setExerciseResponse(setResponses, exercise.id, { ...values, [item.id]: event.target.value })}/></label>)}</div>;
}

function SpeakingTask({ exercise, responses, setResponses }: ExerciseProps<Extract<LessonExercise, { type: 'speaking' }>>) {
  const values = responseObject(responses, exercise.id);
  return <div className={styles.speakingScene}>
    <div className={styles.speakingPrompt}><span>🎤</span><div><small>SPEAK NOW</small><h4>{exercise.prompt}</h4></div></div>
    <div className={styles.speakingSupport}>
      {!!exercise.starters?.length && <section><b>START LIKE THIS</b>{exercise.starters.map((item) => <span key={item}>{item}</span>)}</section>}
      {!!exercise.usefulLanguage?.length && <section><b>USEFUL LANGUAGE</b><div className={styles.phraseCloud}>{exercise.usefulLanguage.map((item) => <span key={item}>{item}</span>)}</div></section>}
    </div>
    <label className={styles.speechNotes}><span>Моя опора / ключевые слова</span><textarea rows={3} value={values.answer || ''} onChange={(event) => setExerciseResponse(setResponses, exercise.id, { ...values, answer: event.target.value })}/></label>
  </div>;
}

function PassiveResourceTask({ exercise, onOpenSource }: { exercise: Extract<LessonExercise, { type: 'reading' | 'listening' }>; onOpenSource: () => void }) {
  return <div className={styles.resourceScene}>
    <div className={styles.resourceIcon}>{exercise.type === 'listening' ? <Play size={32}/> : <FileText size={32}/>}</div>
    <div><small>{exercise.type === 'listening' ? 'AUDIO SOURCE' : 'READING SOURCE'}</small><p>{exercise.prompt || (exercise.type === 'listening' ? 'Прослушайте источник и выполните задание.' : 'Откройте текст и выполните задание.')}</p></div>
    <button type="button" onClick={onOpenSource}>{exercise.type === 'listening' ? <Play size={18}/> : <FileText size={18}/>} Открыть источник</button>
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
    <header><div><small>ИСТОЧНИК</small><strong>{resource.title}</strong></div><div className={styles.sourceTools}>
      <button type="button" onClick={() => setZoom(Math.max(70, zoom - 10))}>−</button><span>{zoom}%</span><button type="button" onClick={() => setZoom(Math.min(160, zoom + 10))}>+</button>
      <button type="button" title="Закрепить справа" onClick={() => setMode(mode === 'docked' ? 'floating' : 'docked')}><PanelRight size={17}/></button>
      <button type="button" title="На весь экран" onClick={() => setMode(mode === 'full' ? 'floating' : 'full')}><Maximize2 size={17}/></button>
      <button type="button" title="Закрыть" onClick={() => setMode('closed')}><X size={17}/></button>
    </div></header>
    <div className={styles.sourceBody} style={{ fontSize: `${zoom}%` }}>
      {resource.type === 'pdf' && resource.url && <iframe title={resource.title} src={resource.url}/>} 
      {resource.type === 'image' && resource.url && <img src={resource.url} alt={resource.alt || resource.title}/>} 
      {(resource.type === 'text' || resource.type === 'reference') && <div className={styles.sourceText}>{resource.content}</div>}
      {resource.type === 'audio' && resource.url && <audio controls src={resource.url}/>} 
    </div>
  </aside>;
}

function ExerciseScene({ exercise, responses, setResponses, feedback, completed, onCheck, onRetry, onShowAnswer, onToggleComplete, onOpenSource }: {
  exercise: LessonExercise;
  responses: Record<string, unknown>;
  setResponses: Dispatch<SetStateAction<Record<string, unknown>>>;
  feedback?: Feedback;
  completed: boolean;
  onCheck: () => void;
  onRetry: () => void;
  onShowAnswer: () => void;
  onToggleComplete: () => void;
  onOpenSource: () => void;
}) {
  const objective = objectiveExercise(exercise);
  return <article className={`${styles.exerciseScene} ${styles[`type_${exercise.type}`]}`}>
    <header className={styles.exerciseHeader}>
      <div><span>{typeLabels[exercise.type]}</span><h3>{exercise.title}</h3>{exercise.instruction && <p>{exercise.instruction}</p>}</div>
      {exercise.resourceId && <button type="button" className={styles.sourceButton} onClick={onOpenSource}><FileText size={17}/> Источник</button>}
    </header>
    <div className={styles.exerciseContent}>
      {exercise.type === 'gap_fill' && <GapFillTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'dropdown' && <DropdownTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'true_false_ns' && <TrueFalseTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'multiple_choice' && <MultipleChoiceTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'matching' && <MatchingTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'sort' && <SortTask exercise={exercise} responses={responses} setResponses={setResponses} feedback={feedback}/>} 
      {exercise.type === 'open_answer' && <OpenAnswerTask exercise={exercise} responses={responses} setResponses={setResponses}/>} 
      {exercise.type === 'speaking' && <SpeakingTask exercise={exercise} responses={responses} setResponses={setResponses}/>} 
      {(exercise.type === 'reading' || exercise.type === 'listening') && <PassiveResourceTask exercise={exercise} onOpenSource={onOpenSource}/>} 
    </div>
    <footer className={styles.exerciseActions}>
      {objective ? <>
        <button type="button" className={styles.primaryAction} onClick={onCheck}><Check size={18}/> Проверить</button>
        {feedback && feedback.correct < feedback.total && <button type="button" onClick={onRetry}><RotateCcw size={17}/> Ещё раз</button>}
        {feedback && feedback.correct < feedback.total && <button type="button" onClick={onShowAnswer}>Показать ответ</button>}
        {feedback && <strong className={feedback.correct === feedback.total ? styles.scoreOk : styles.scoreBad}>{feedback.correct} / {feedback.total}</strong>}
      </> : <button type="button" className={completed ? styles.doneAction : styles.secondaryAction} onClick={onToggleComplete}><Check size={17}/>{completed ? 'Выполнено' : 'Отметить выполненным'}</button>}
    </footer>
  </article>;
}

export function LessonPlayerV2(props: Props) {
  const designStyle = props.designStyle || 'teen-study';
  const storageKey = `masterurok:player-v2:${props.lessonId}`;
  const [sectionId, setSectionId] = useState<LessonSectionId>('core');
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [playerMode, setPlayerMode] = useState(false);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [sourceMode, setSourceMode] = useState<SourceMode>('closed');
  const [sourceId, setSourceId] = useState('');
  const [sourceZoom, setSourceZoom] = useState(100);

  const sections = props.lesson.sections;
  const currentSection = sections.find((section) => section.id === sectionId) || sections[0];
  const currentExercises = currentSection?.exercises || [];
  const allExercises = useMemo(() => sections.flatMap((section) => section.exercises), [sections]);
  const currentExercise = currentExercises[Math.min(playerIndex, Math.max(0, currentExercises.length - 1))] || null;

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
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const state = JSON.parse(raw) as SavedState;
          if (!cancelled) { setResponses(state.responses || {}); setCompleted(new Set(state.completed || [])); setLoaded(true); }
          return;
        }
      } catch {}
      try {
        const response = await fetch(`/api/lesson-progress/${props.lessonId}`, { cache: 'no-store' });
        const payload = await response.json() as { ok?: boolean; state?: SavedState | null };
        if (!cancelled && payload.ok && payload.state) {
          setResponses(payload.state.responses || {}); setCompleted(new Set(payload.state.completed || []));
        }
      } catch {}
      if (!cancelled) setLoaded(true);
    }
    load(); return () => { cancelled = true; };
  }, [props.cleanMode, props.lessonId, storageKey]);

  useEffect(() => {
    if (!loaded || props.cleanMode) return;
    localStorage.setItem(storageKey, JSON.stringify({ responses, completed: [...completed] } satisfies SavedState));
  }, [completed, loaded, props.cleanMode, responses, storageKey]);

  useEffect(() => {
    if (!playerMode) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'ArrowRight') setPlayerIndex((index) => Math.min(currentExercises.length - 1, index + 1));
      if (event.key === 'ArrowLeft') setPlayerIndex((index) => Math.max(0, index - 1));
      if (event.key === 'Escape') leavePlayer();
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [currentExercises.length, playerMode]);

  const completedCount = allExercises.filter((exercise) => completed.has(exercise.id)).length;
  const percent = allExercises.length ? Math.round((completedCount / allExercises.length) * 100) : 0;

  const markComplete = (id: string, value: boolean) => setCompleted((current) => {
    const next = new Set(current); if (value) next.add(id); else next.delete(id); return next;
  });

  const runCheck = (exercise: LessonExercise) => {
    const result = checkExercise(exercise, responses); if (!result) return;
    setFeedback((current) => ({ ...current, [exercise.id]: result }));
    if (result.correct === result.total) markComplete(exercise.id, true);
  };

  const retry = (exercise: LessonExercise) => {
    setFeedback((current) => { const next = { ...current }; delete next[exercise.id]; return next; });
    markComplete(exercise.id, false);
  };

  const showAnswer = (exercise: LessonExercise) => {
    const answer = correctResponse(exercise); if (!answer) return;
    setExerciseResponse(setResponses, exercise.id, answer);
    const result = checkExercise(exercise, { ...responses, [exercise.id]: answer });
    if (result) setFeedback((current) => ({ ...current, [exercise.id]: result }));
    markComplete(exercise.id, true);
  };

  const openSource = (exercise: LessonExercise) => {
    const id = exercise.resourceId || (props.sourceAvailable ? 'source-book' : '');
    if (!id) return; setSourceId(id); setSourceMode('floating');
  };

  const saveWork = async () => {
    if (props.cleanMode) return;
    const state: SavedState = { responses, completed: [...completed] };
    localStorage.setItem(storageKey, JSON.stringify(state)); setSaveStatus('Сохраняю…');
    try {
      const response = await fetch(`/api/lesson-progress/${props.lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
      setSaveStatus(response.ok ? 'Сохранено ✓' : 'Сохранено локально');
    } catch { setSaveStatus('Сохранено локально'); }
    window.setTimeout(() => setSaveStatus(''), 1600);
  };

  const reset = () => {
    if (!window.confirm('Очистить ответы и прогресс этого урока?')) return;
    setResponses({}); setCompleted(new Set()); setFeedback({});
    if (!props.cleanMode) localStorage.removeItem(storageKey);
  };

  const enterPlayer = async () => {
    setPlayerMode(true); setPlayerIndex(0);
    try { await document.documentElement.requestFullscreen?.(); } catch {}
  };

  const leavePlayer = async () => {
    setPlayerMode(false);
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
  };

  const closeLesson = () => {
    if (window.opener) window.close(); else window.history.back();
  };

  const renderExercise = (exercise: LessonExercise) => <ExerciseScene
    key={exercise.id}
    exercise={exercise}
    responses={responses}
    setResponses={setResponses}
    feedback={feedback[exercise.id]}
    completed={completed.has(exercise.id)}
    onCheck={() => runCheck(exercise)}
    onRetry={() => retry(exercise)}
    onShowAnswer={() => showAnswer(exercise)}
    onToggleComplete={() => markComplete(exercise.id, !completed.has(exercise.id))}
    onOpenSource={() => openSource(exercise)}
  />;

  const shellClass = `${styles.shell} ${themeMap[designStyle]} ${sourceMode === 'docked' ? styles.withDockedSource : ''}`;

  if (playerMode && currentExercise) {
    return <div className={`${styles.fullscreenShell} ${themeMap[designStyle]}`}>
      <header className={styles.playerBar}>
        <button type="button" onClick={leavePlayer}><X size={22}/> Выйти</button>
        <div className={styles.taskProgress}><div><strong>Task {playerIndex + 1}</strong><span>из {currentExercises.length}</span></div><div className={styles.dots}>{currentExercises.map((exercise, index) => <button type="button" key={exercise.id} onClick={() => setPlayerIndex(index)} className={`${index === playerIndex ? styles.currentDot : ''} ${completed.has(exercise.id) ? styles.doneDot : ''}`} aria-label={`Task ${index + 1}`}/>)}</div></div>
        <button type="button" title="Свернуть полноэкранный режим" onClick={() => document.exitFullscreen?.()}><Minimize2 size={22}/></button>
        <button type="button" disabled={playerIndex === 0} onClick={() => setPlayerIndex((index) => Math.max(0, index - 1))}><ArrowLeft size={22}/> Назад</button>
        <button type="button" disabled={playerIndex >= currentExercises.length - 1} onClick={() => setPlayerIndex((index) => Math.min(currentExercises.length - 1, index + 1))}>Вперёд <ArrowRight size={22}/></button>
      </header>
      <main className={styles.playerStage}>{renderExercise(currentExercise)}</main>
      <SourcePanel resource={activeResource} mode={sourceMode} zoom={sourceZoom} setMode={setSourceMode} setZoom={setSourceZoom}/>
    </div>;
  }

  return <div className={shellClass}>
    <header className={styles.topbar}>
      <button type="button" onClick={closeLesson}><X size={17}/> Закрыть урок</button>
      <div className={styles.topActions}>
        {!props.cleanMode && <button type="button" onClick={saveWork}><Save size={17}/>{saveStatus || 'Сохранить работу'}</button>}
        <a href={`/lesson-view/${props.lessonId}/print?style=${designStyle}`} target="_blank" rel="noreferrer"><Printer size={17}/> Версия для печати</a>
        <button type="button" onClick={reset}><RotateCcw size={17}/> Сбросить</button>
        <button type="button" className={styles.fullscreenCta} onClick={enterPlayer}><Fullscreen size={18}/> Полный экран</button>
      </div>
    </header>

    <main className={styles.workspace}>
      <section className={styles.hero}>
        <div className={styles.heroBadge}><Sparkles size={18}/></div>
        <div className={styles.heroText}><small>ИНТЕРАКТИВНЫЙ УРОК</small><h1>{props.title}</h1><p>{props.student} · {props.course}</p>{props.sourceLabel && <span>{props.sourceLabel}</span>}</div>
        <div className={styles.heroProgress}><strong>{percent}%</strong><span>{completedCount} из {allExercises.length} заданий</span><i><b style={{ width: `${percent}%` }}/></i></div>
      </section>

      <nav className={styles.sectionNav}>{sections.map((section) => <button type="button" key={section.id} className={section.id === sectionId ? styles.activeSection : ''} onClick={() => { setSectionId(section.id); setPlayerIndex(0); }}><span>{sectionLabels[section.id]}</span><b>{section.exercises.length}</b></button>)}</nav>

      <section className={styles.lessonFlow}>{currentExercises.map(renderExercise)}</section>
    </main>

    <SourcePanel resource={activeResource} mode={sourceMode} zoom={sourceZoom} setMode={setSourceMode} setZoom={setSourceZoom}/>
  </div>;
}
