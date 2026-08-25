'use client';

import Link from 'next/link';
import { BookOpen, Check, ChevronLeft, Circle, Download, MessageSquareText, Printer, RotateCcw, Save, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { extractVocabularyTiles, isSpeakingExercise, parseExercises, parseVocabulary, type DesignExercise, type ExerciseKind } from '@/lib/lesson-design-parser';
import type { DesignStyleId } from '@/lib/design-styles';
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
  designStyle?: DesignStyleId;
  standalone?: boolean;
  cleanMode?: boolean;
};

type Tab = 'core' | 'reserve' | 'homework' | 'vocabulary';

type SavedState = {
  completed?: string[];
  answers?: Record<string, string>;
  speaking?: Record<string, string>;
};

const kindLabel: Record<ExerciseKind, string> = {
  vocabulary: 'WORD LAB',
  'gap-fill': 'BUILD IT',
  speaking: 'SPEAKING CHALLENGE',
  grammar: 'GRAMMAR FOCUS',
  reading: 'READING ZONE',
  matching: 'MATCH IT',
  choice: 'CHOOSE',
  translation: 'TRANSLATION LAB',
  practice: 'PRACTICE',
};

const kindClass: Record<ExerciseKind, string> = {
  vocabulary: styles.kindVocabulary,
  'gap-fill': styles.kindGap,
  speaking: styles.kindSpeaking,
  grammar: styles.kindGrammar,
  reading: styles.kindReading,
  matching: styles.kindMatching,
  choice: styles.kindChoice,
  translation: styles.kindTranslation,
  practice: styles.kindPractice,
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}

function lineParts(text: string, lineKey: string, answers: Record<string, string>) {
  const parts = text.split(/(_{1,})/g);
  let blank = 0;
  return parts.map((part, index) => {
    if (!/^_+$/.test(part)) return { type: 'text' as const, key: `${lineKey}-t-${index}`, value: part };
    const key = `${lineKey}-b-${blank++}`;
    return { type: 'blank' as const, key, value: answers[key] || '', width: Math.max(42, Math.min(150, part.length * 16 + 22)) };
  });
}

function FillableLine({ text, lineKey, answers, setAnswer }: {
  text: string;
  lineKey: string;
  answers: Record<string, string>;
  setAnswer: (key: string, value: string) => void;
}) {
  return <p className={styles.exerciseLine}>{lineParts(text, lineKey, answers).map((part) => part.type === 'text'
    ? <span key={part.key}>{part.value}</span>
    : <input
        key={part.key}
        className={styles.inlineInput}
        style={{ width: part.width }}
        value={part.value}
        onChange={(event) => setAnswer(part.key, event.target.value)}
        aria-label="Впишите ответ"
        autoComplete="off"
      />)}</p>;
}

function StandardLines({ exercise, answers, setAnswer }: {
  exercise: DesignExercise;
  answers: Record<string, string>;
  setAnswer: (key: string, value: string) => void;
}) {
  return <>{exercise.body.map((line, index) => line
    ? <FillableLine key={`${exercise.id}-${index}`} text={line} lineKey={`${exercise.id}-${index}`} answers={answers} setAnswer={setAnswer}/>
    : <div key={`${exercise.id}-${index}`} className={styles.smallGap}/>)}</>;
}

function VisualExerciseBody({ exercise, answers, setAnswer }: {
  exercise: DesignExercise;
  answers: Record<string, string>;
  setAnswer: (key: string, value: string) => void;
}) {
  const tiles = exercise.kind === 'vocabulary' ? extractVocabularyTiles(exercise) : [];
  if (exercise.kind === 'vocabulary' && tiles.length >= 3) {
    const tileLines = new Set(tiles.map((tile) => `${tile.label} - ${tile.value}`.toLowerCase()));
    const intro = exercise.body.filter((line) => line && !tileLines.has(line.replace(/[–—]/g, '-').toLowerCase()));
    return <div className={styles.visualBody}>
      {intro.slice(0, 2).map((line, index) => <p className={styles.visualIntro} key={`${exercise.id}-intro-${index}`}>{line}</p>)}
      <div className={styles.wordTileGrid}>{tiles.map((tile, index) => <div className={styles.wordTile} key={`${tile.label}-${tile.value}-${index}`}>
        <span>{tile.label}</span><strong>{tile.value}</strong>
      </div>)}</div>
    </div>;
  }

  if (exercise.kind === 'grammar') {
    return <div className={styles.grammarBoard}>
      {exercise.body.filter(Boolean).map((line, index) => <div className={styles.grammarStrip} key={`${exercise.id}-g-${index}`}>
        <span className={styles.grammarNumber}>{index + 1}</span>
        <FillableLine text={line} lineKey={`${exercise.id}-${index}`} answers={answers} setAnswer={setAnswer}/>
      </div>)}
    </div>;
  }

  if (exercise.kind === 'reading') {
    return <div className={styles.readingPanel}>{exercise.body.map((line, index) => line
      ? <p key={`${exercise.id}-r-${index}`}>{line}</p>
      : <div key={`${exercise.id}-r-${index}`} className={styles.readingBreak}/>)}</div>;
  }

  if (exercise.kind === 'matching' || exercise.kind === 'choice' || exercise.kind === 'translation') {
    return <div className={styles.taskBoard}>{exercise.body.filter(Boolean).map((line, index) => <div className={styles.taskRow} key={`${exercise.id}-task-${index}`}>
      <span className={styles.taskBadge}>{String(index + 1).padStart(2, '0')}</span>
      <FillableLine text={line} lineKey={`${exercise.id}-${index}`} answers={answers} setAnswer={setAnswer}/>
    </div>)}</div>;
  }

  return <StandardLines exercise={exercise} answers={answers} setAnswer={setAnswer}/>;
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
  return <article className={`${styles.exerciseCard} ${kindClass[exercise.kind]} ${completed ? styles.exerciseDone : ''}`}>
    <div className={styles.exerciseHead}>
      <div>
        <span className={styles.exerciseEyebrow}>{kindLabel[exercise.kind]}</span>
        <h3>{exercise.title}</h3>
      </div>
      <button type="button" className={styles.doneButton} onClick={onToggle} aria-pressed={completed}>
        {completed ? <Check size={17}/> : <Circle size={17}/>} {completed ? 'Готово' : 'Отметить'}
      </button>
    </div>
    <div className={styles.exerciseBody}>
      <VisualExerciseBody exercise={exercise} answers={answers} setAnswer={setAnswer}/>
    </div>
    {hasSpeaking && <div className={styles.speakingBox}>
      <div className={styles.speakingTitle}><MessageSquareText size={17}/> Мой ответ / опора для речи</div>
      <textarea
        value={speaking[exercise.id] || ''}
        onChange={(event) => setSpeaking(exercise.id, event.target.value)}
        placeholder="Ключевые слова, полезные фразы или сам ответ…"
        rows={3}
      />
    </div>}
  </article>;
}

const themeClass: Record<DesignStyleId, string> = {
  'bright-kids': styles.themeKids,
  'teen-study': styles.themeTeen,
  'reading-magazine': styles.themeReading,
  'grammar-visual': styles.themeGrammar,
};

export function InteractiveLesson(props: Props) {
  const designStyle = props.designStyle || 'teen-study';
  const [tab, setTab] = useState<Tab>('core');
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [speaking, setSpeaking] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  const core = useMemo(() => parseExercises(props.studentWorksheet, 'core'), [props.studentWorksheet]);
  const reserve = useMemo(() => parseExercises(props.reserve, 'reserve'), [props.reserve]);
  const homework = useMemo(() => parseExercises(props.homework, 'homework'), [props.homework]);
  const vocabulary = useMemo(() => parseVocabulary(props.vocabularyBank), [props.vocabularyBank]);
  const allExercises = useMemo(() => [...core, ...reserve, ...homework], [core, reserve, homework]);

  const storageKey = `masterurok:interactive:${props.lessonId}`;

  useEffect(() => {
    if (!props.cleanMode) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as SavedState;
          setCompleted(new Set(saved.completed || []));
          setAnswers(saved.answers || {});
          setSpeaking(saved.speaking || {});
        }
      } catch {}
    }
    setLoaded(true);
  }, [props.cleanMode, storageKey]);

  useEffect(() => {
    if (!loaded || props.cleanMode) return;
    const state: SavedState = { completed: [...completed], answers, speaking };
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [answers, completed, loaded, props.cleanMode, speaking, storageKey]);

  const visible = tab === 'core' ? core : tab === 'reserve' ? reserve : homework;
  const completedCount = allExercises.filter((item) => completed.has(item.id)).length;
  const percent = allExercises.length ? Math.round((completedCount / allExercises.length) * 100) : 0;
  const printHref = props.standalone
    ? `/lesson-view/${props.lessonId}/print?style=${designStyle}`
    : `/lessons/${props.lessonId}/print?style=${designStyle}`;
  const cleanHref = `/lesson-view/${props.lessonId}?style=${designStyle}&clean=1`;

  function toggle(id: string) {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function saveWork() {
    if (props.cleanMode) return;
    const state: SavedState = { completed: [...completed], answers, speaking };
    localStorage.setItem(storageKey, JSON.stringify(state));
    setSaveFlash(true);
    window.setTimeout(() => setSaveFlash(false), 1800);
  }

  function reset() {
    if (!window.confirm('Очистить ответы и прогресс этого интерактивного урока?')) return;
    setCompleted(new Set());
    setAnswers({});
    setSpeaking({});
    if (!props.cleanMode) localStorage.removeItem(storageKey);
  }

  function renderOfflineLine(exercise: DesignExercise, line: string, lineIndex: number) {
    return lineParts(line, `${exercise.id}-${lineIndex}`, answers).map((part) => part.type === 'text'
      ? escapeHtml(part.value)
      : `<input class="blank" data-key="${escapeHtml(part.key)}" value="${escapeHtml(part.value)}" />`).join('');
  }

  function buildExportHtml() {
    const section = (title: string, exercises: DesignExercise[]) => `<section><h2>${escapeHtml(title)}</h2>${exercises.map((exercise) => `<article class="exercise ${escapeHtml(exercise.kind)}"><label class="done"><input type="checkbox" data-done="${escapeHtml(exercise.id)}" ${completed.has(exercise.id) ? 'checked' : ''}> готово</label><div class="kind">${escapeHtml(kindLabel[exercise.kind])}</div><h3>${escapeHtml(exercise.title)}</h3>${exercise.body.map((line, index) => line ? `<p>${renderOfflineLine(exercise, line, index)}</p>` : '<br>').join('')}${isSpeakingExercise(exercise) ? `<textarea data-speaking="${escapeHtml(exercise.id)}" placeholder="Мой ответ / опора для речи">${escapeHtml(speaking[exercise.id] || '')}</textarea>` : ''}</article>`).join('')}</section>`;
    const vocab = `<section><h2>VOCABULARY BANK</h2><div class="vocab">${vocabulary.map((row) => `<div><strong>${escapeHtml(row.word)}</strong><span>${escapeHtml(row.russian)}</span><small>${escapeHtml(row.example)}</small></div>`).join('')}</div></section>`;
    const title = escapeHtml(props.title);
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f5f7ff;color:#243257;font-family:Arial,sans-serif}main{max-width:1000px;margin:auto;padding:24px}.toolbar{position:sticky;top:0;z-index:5;display:flex;gap:8px;justify-content:flex-end;padding:10px;background:rgba(245,247,255,.95)}button{border:1px solid #d8deef;border-radius:10px;background:#fff;padding:9px 12px;font-weight:700;cursor:pointer}.hero{padding:24px;border-radius:22px;background:linear-gradient(135deg,#fff8c9,#e6f8ff,#f0e9ff);border:2px solid #a7d8ff}.hero h1{margin:0 0 8px}.hero p{margin:0;color:#64708c}section{margin-top:18px}h2{padding:9px 12px;border-left:6px solid #6b72db;background:#eef1ff}.exercise{position:relative;margin:12px 0;padding:18px;border:2px solid #dce7fa;border-radius:18px;background:#fff;break-inside:avoid}.exercise h3{margin:5px 0 12px}.kind{font-size:10px;font-weight:900;letter-spacing:.08em;color:#7657c8}.done{float:right;font-size:11px}.exercise p{line-height:1.65}.blank{min-width:70px;border:0;border-bottom:2px solid #777fd0;background:#f8f8ff;padding:4px 6px;font:inherit}textarea{width:100%;min-height:70px;border:1px solid #d6dcf0;border-radius:10px;padding:10px}.vocab{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.vocab>div{display:grid;gap:5px;padding:14px;border-radius:14px;background:#fff;border:1px solid #dde4f2}.vocab span{font-size:13px}.vocab small{color:#7c8499}@media(max-width:700px){.vocab{grid-template-columns:1fr 1fr}}@media print{body{background:#fff}.toolbar{display:none}main{max-width:none;padding:0}.hero{box-shadow:none}.exercise{break-inside:avoid}.vocab{grid-template-columns:repeat(3,1fr)}}
    </style></head><body><div class="toolbar"><button onclick="saveLocal()">💾 Сохранить</button><button onclick="window.print()">🖨 Печать / PDF</button></div><main><header class="hero"><h1>${title}</h1><p>${escapeHtml(props.student)} · ${escapeHtml(props.course)}</p></header>${section('CORE', core)}${section('RESERVE', reserve)}${section('HOMEWORK', homework)}${vocab}</main><script>
      const key='masterurok-offline-${escapeHtml(props.lessonId)}';
      function snapshot(){const fields={};document.querySelectorAll('[data-key]').forEach(x=>fields[x.dataset.key]=x.value);const speaking={};document.querySelectorAll('[data-speaking]').forEach(x=>speaking[x.dataset.speaking]=x.value);const done={};document.querySelectorAll('[data-done]').forEach(x=>done[x.dataset.done]=x.checked);return {fields,speaking,done}}
      function saveLocal(){localStorage.setItem(key,JSON.stringify(snapshot()));const b=document.querySelector('.toolbar button');const old=b.textContent;b.textContent='✓ Сохранено';setTimeout(()=>b.textContent=old,1400)}
      try{const s=JSON.parse(localStorage.getItem(key)||'null');if(s){document.querySelectorAll('[data-key]').forEach(x=>{if(s.fields&&s.fields[x.dataset.key]!=null)x.value=s.fields[x.dataset.key]});document.querySelectorAll('[data-speaking]').forEach(x=>{if(s.speaking&&s.speaking[x.dataset.speaking]!=null)x.value=s.speaking[x.dataset.speaking]});document.querySelectorAll('[data-done]').forEach(x=>{if(s.done&&s.done[x.dataset.done]!=null)x.checked=s.done[x.dataset.done]})}}catch(e){}document.addEventListener('input',()=>localStorage.setItem(key,JSON.stringify(snapshot())));document.addEventListener('change',()=>localStorage.setItem(key,JSON.stringify(snapshot())));
    </script></body></html>`;
  }

  function downloadHtml() {
    const blob = new Blob([buildExportHtml()], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.course} — ${props.title}.html`.replace(/[\\/:*?"<>|]/g, ' ');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function printCompleted() {
    const popup = window.open('', '_blank');
    if (!popup) return;
    popup.document.open();
    popup.document.write(buildExportHtml());
    popup.document.close();
    window.setTimeout(() => popup.print(), 400);
  }

  return <div className={`${styles.lessonPage} ${themeClass[designStyle]}`} data-design-style={designStyle}>
    <div className={styles.topActions}>
      {props.standalone
        ? <button type="button" className={styles.backLink} onClick={() => window.close()}><X size={16}/> Закрыть урок</button>
        : <Link href="/" className={styles.backLink}><ChevronLeft size={17}/> Сегодня</Link>}
      <div className={styles.actionGroup}>
        {!props.cleanMode && <button type="button" className={styles.saveButton} onClick={saveWork}><Save size={15}/> {saveFlash ? 'Сохранено ✓' : 'Сохранить работу'}</button>}
        {props.standalone && !props.cleanMode && <a className={styles.secondaryButton} href={cleanHref} target="_blank" rel="noreferrer"><Sparkles size={15}/> Чистая версия</a>}
        <button type="button" className={styles.printLink} onClick={printCompleted}><Printer size={15}/> Печать выполненного</button>
        <button type="button" className={styles.downloadButton} onClick={downloadHtml}><Download size={15}/> Скачать HTML</button>
        <button type="button" className={styles.secondaryButton} onClick={reset}><RotateCcw size={15}/> Сбросить</button>
      </div>
    </div>

    {props.cleanMode && <div className={styles.cleanNotice}>Чистая версия · ответы из рабочего урока сюда не подгружены.</div>}

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

    <div className={styles.bottomHint}>Ответы сохраняются в браузере автоматически. Кнопка «Сохранить работу» фиксирует текущее состояние явно.</div>
  </div>;
}
