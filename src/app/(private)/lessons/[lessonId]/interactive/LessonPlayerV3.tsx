'use client';

import { ArrowLeft, ArrowRight, Check, FileText, Fullscreen, Maximize2, Minus, PanelRight, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DesignStyleId } from '@/lib/design-styles';
import type { LessonExercise, LessonJsonV1, LessonResource, LessonSectionId } from '@/lib/lesson-json';
import styles from './lesson-player-v3.module.css';

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

type SavedState = { responses?: Record<string, unknown>; completed?: string[] };
type Feedback = { correct: number; total: number };
type SourceMode = 'closed' | 'floating' | 'docked' | 'full';

const sectionLabels: Record<LessonSectionId, string> = { core: 'CORE', reserve: 'RESERVE', homework: 'HOMEWORK' };
const typeLabels: Record<LessonExercise['type'], string> = {
  gap_fill: 'FILL THE GAPS', dropdown: 'CHOOSE IN CONTEXT', true_false_ns: 'TRUE / FALSE / NOT STATED',
  multiple_choice: 'MULTIPLE CHOICE', matching: 'MATCHING', sort: 'SORT THE CARDS', open_answer: 'YOUR ANSWER',
  speaking: 'SPEAKING CHALLENGE', reading: 'READING SOURCE', listening: 'LISTENING SOURCE',
};
const objectiveTypes = new Set<LessonExercise['type']>(['gap_fill', 'dropdown', 'true_false_ns', 'multiple_choice', 'matching', 'sort']);

function normalized(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function answerMap(responses: Record<string, unknown>, id: string): Record<string, string> {
  const value = responses[id];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {};
}

function correctAnswers(exercise: LessonExercise): Record<string, string> | null {
  if (exercise.type === 'gap_fill') return Object.fromEntries(exercise.blanks.map((item) => [item.id, item.answer]));
  if (exercise.type === 'dropdown') return Object.fromEntries(exercise.items.map((item) => [item.id, item.answer]));
  if (exercise.type === 'true_false_ns') return Object.fromEntries(exercise.items.map((item) => [item.id, item.answer]));
  if (exercise.type === 'multiple_choice') return Object.fromEntries(exercise.items.map((item) => [item.id, item.answerId]));
  if (exercise.type === 'matching') return { ...exercise.pairs };
  if (exercise.type === 'sort') return { ...exercise.answers };
  return null;
}

function checkAnswers(exercise: LessonExercise, responses: Record<string, unknown>): Feedback | null {
  const expected = correctAnswers(exercise);
  if (!expected) return null;
  const actual = answerMap(responses, exercise.id);
  const keys = Object.keys(expected);
  return { correct: keys.filter((key) => normalized(actual[key]) === normalized(expected[key])).length, total: keys.length };
}

function SourcePanel({ resource, mode, zoom, onMode, onZoom }: {
  resource: LessonResource | null; mode: SourceMode; zoom: number;
  onMode: (mode: SourceMode) => void; onZoom: (zoom: number) => void;
}) {
  if (!resource || mode === 'closed') return null;
  return <aside className={`${styles.sourcePanel} ${styles[`source_${mode}`]}`} aria-label="Источник">
    <header><div><small>ИСТОЧНИК</small><strong>{resource.title}</strong></div><div className={styles.sourceTools}>
      <button type="button" aria-label="Уменьшить" onClick={() => onZoom(Math.max(70, zoom - 10))}><Minus size={16}/></button><span>{zoom}%</span>
      <button type="button" aria-label="Увеличить" onClick={() => onZoom(Math.min(160, zoom + 10))}><Plus size={16}/></button>
      <button type="button" title="Закрепить справа" onClick={() => onMode(mode === 'docked' ? 'floating' : 'docked')}><PanelRight size={17}/></button>
      <button type="button" title="На весь экран" onClick={() => onMode(mode === 'full' ? 'floating' : 'full')}><Maximize2 size={17}/></button>
      <button type="button" title="Закрыть" onClick={() => onMode('closed')}><X size={17}/></button>
    </div></header>
    <div className={styles.sourceBody} style={{ fontSize: `${zoom}%` }}>
      {resource.type === 'pdf' && resource.url ? <iframe title={resource.title} src={resource.url}/> : null}
      {resource.type === 'image' && resource.url ? <img src={resource.url} alt={resource.alt || resource.title}/> : null}
      {(resource.type === 'text' || resource.type === 'reference') ? <div className={styles.sourceText}>{resource.content}</div> : null}
      {resource.type === 'audio' && resource.url ? <audio controls src={resource.url}/> : null}
    </div>
  </aside>;
}

function TaskBody({ exercise, value, feedback, update, openSource }: {
  exercise: LessonExercise; value: Record<string, string>; feedback?: Feedback;
  update: (value: Record<string, string>) => void; openSource: () => void;
}) {
  const state = (id: string, expected: string) => feedback ? (normalized(value[id]) === normalized(expected) ? styles.correct : styles.wrong) : '';
  if (exercise.type === 'gap_fill') {
    const parts = exercise.text.split(/(\{\{[a-zA-Z0-9_-]+\}\})/g);
    const useWord = (word: string) => { const blank = exercise.blanks.find((item) => !value[item.id]); if (blank) update({ ...value, [blank.id]: word }); };
    return <div className={styles.gapTask}>{exercise.wordBank?.length ? <aside className={styles.wordBank}><b>WORD BANK</b><div>{exercise.wordBank.map((word, index) => <button type="button" key={`${word}-${index}`} onClick={() => useWord(word)}>{word}</button>)}</div></aside> : null}<p className={styles.inlineText}>{parts.map((part, index) => { const marker = part.match(/^\{\{(.+)\}\}$/); if (!marker) return <span key={index}>{part}</span>; const id = marker[1]; const expected = exercise.blanks.find((item) => item.id === id)?.answer || ''; return <input key={id} className={state(id, expected)} value={value[id] || ''} onChange={(event) => update({ ...value, [id]: event.target.value })} aria-label="Ответ"/>; })}</p></div>;
  }
  if (exercise.type === 'dropdown') return <div className={styles.workbookRows}>{exercise.items.map((item, index) => <label key={item.id}><b>{index + 1}</b><span>{item.before}</span><select className={state(item.id, item.answer)} value={value[item.id] || ''} onChange={(event) => update({ ...value, [item.id]: event.target.value })}><option value="">—</option>{item.options.map((option) => <option key={option}>{option}</option>)}</select><span>{item.after}</span></label>)}</div>;
  if (exercise.type === 'true_false_ns') return <div className={styles.statementList}>{exercise.items.map((item, index) => <section key={item.id}><p><b>{index + 1}</b>{item.statement}</p><div>{([['true','True'],['false','False'],['ns','Not stated']] as const).map(([id,label]) => <button type="button" key={id} className={`${value[item.id] === id ? styles.selected : ''} ${value[item.id] === id ? state(item.id, item.answer) : ''}`} onClick={() => update({ ...value, [item.id]: id })}>{label}</button>)}</div></section>)}</div>;
  if (exercise.type === 'multiple_choice') return <div className={styles.statementList}>{exercise.items.map((item, index) => <section key={item.id}><p><b>{index + 1}</b>{item.question}</p><div>{item.options.map((option) => <button type="button" key={option.id} className={`${value[item.id] === option.id ? styles.selected : ''} ${value[item.id] === option.id ? state(item.id, item.answerId) : ''}`} onClick={() => update({ ...value, [item.id]: option.id })}>{option.label}</button>)}</div></section>)}</div>;
  if (exercise.type === 'matching') return <MatchingTask exercise={exercise} value={value} update={update} feedback={feedback}/>;
  if (exercise.type === 'sort') return <SortTask exercise={exercise} value={value} update={update} feedback={feedback}/>;
  if (exercise.type === 'open_answer') return <div className={styles.openAnswers}>{exercise.prompts.map((item, index) => <label key={item.id}><span><b>{index + 1}</b>{item.prompt}</span><textarea rows={3} value={value[item.id] || ''} onChange={(event) => update({ ...value, [item.id]: event.target.value })}/></label>)}</div>;
  if (exercise.type === 'speaking') return <div className={styles.speaking}><div className={styles.speakingPrompt}><span>🎤</span><div><small>SPEAK NOW</small><h3>{exercise.prompt}</h3></div></div><div className={styles.support}>{exercise.starters?.length ? <section><b>START LIKE THIS</b>{exercise.starters.map((item) => <span key={item}>{item}</span>)}</section> : null}{exercise.usefulLanguage?.length ? <section><b>USEFUL LANGUAGE</b><div>{exercise.usefulLanguage.map((item) => <i key={item}>{item}</i>)}</div></section> : null}</div><label className={styles.notes}><span>МОЯ ОПОРА</span><textarea rows={3} value={value.answer || ''} onChange={(event) => update({ ...value, answer: event.target.value })}/></label></div>;
  const needsAudio = exercise.type === 'listening';
  return <div className={styles.resourceTask}><span>{needsAudio ? '🎧' : '📖'}</span><div><b>{needsAudio ? 'LISTENING' : 'READING'}</b><p>{exercise.prompt}</p></div><button type="button" onClick={openSource}>Открыть источник</button></div>;
}

function MatchingTask({ exercise, value, update, feedback }: { exercise: Extract<LessonExercise,{type:'matching'}>; value: Record<string,string>; update:(value:Record<string,string>)=>void; feedback?:Feedback }) {
  const [active, setActive] = useState(exercise.leftItems[0]?.id || '');
  return <div className={styles.matching}><div><b>1. Выберите слева</b>{exercise.leftItems.map((item) => <button type="button" key={item.id} className={`${active === item.id ? styles.selected : ''} ${feedback ? (value[item.id] === exercise.pairs[item.id] ? styles.correct : styles.wrong) : ''}`} onClick={() => setActive(item.id)}>{item.label}{value[item.id] ? <small> → {exercise.rightItems.find((right) => right.id === value[item.id])?.label}</small> : null}</button>)}</div><div><b>2. Выберите пару</b>{exercise.rightItems.map((item) => <button type="button" key={item.id} onClick={() => { if (active) update({ ...value, [active]: item.id }); }}>{item.label}</button>)}</div></div>;
}

function SortTask({ exercise, value, update, feedback }: { exercise: Extract<LessonExercise,{type:'sort'}>; value: Record<string,string>; update:(value:Record<string,string>)=>void; feedback?:Feedback }) {
  const [selected, setSelected] = useState('');
  const assign = (itemId:string, groupId:string) => { if (itemId) { update({ ...value, [itemId]: groupId }); setSelected(''); } };
  return <div className={styles.sortTask}><div className={styles.cardBank}><b>CARD BANK</b>{exercise.items.filter((item) => !value[item.id]).map((item) => <button draggable type="button" key={item.id} className={selected === item.id ? styles.selected : ''} onClick={() => setSelected(item.id)} onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}>{item.label}</button>)}</div><div className={styles.dropZones}>{exercise.groups.map((group) => <section key={group.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => assign(event.dataTransfer.getData('text/plain'), group.id)} onClick={() => assign(selected, group.id)}><h3>{group.label}</h3>{exercise.items.filter((item) => value[item.id] === group.id).map((item) => <button type="button" key={item.id} className={feedback ? (exercise.answers[item.id] === group.id ? styles.correct : styles.wrong) : ''} onClick={(event) => { event.stopPropagation(); const next={...value}; delete next[item.id]; update(next); }}>{item.label}</button>)}</section>)}</div></div>;
}

export function LessonPlayerV3(props: Props) {
  const sections = props.lesson.sections;
  const [sectionId, setSectionId] = useState<LessonSectionId>(sections[0]?.id || 'core');
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>('closed');
  const [sourceId, setSourceId] = useState('');
  const [sourceZoom, setSourceZoom] = useState(100);
  const storageKey = `masterurok:player-v3:${props.lessonId}`;
  const currentSection = sections.find((section) => section.id === sectionId) || sections[0];
  const exercises = currentSection?.exercises || [];
  const exercise = exercises[Math.min(index, Math.max(0, exercises.length - 1))] || null;
  const allExercises = useMemo(() => sections.flatMap((section) => section.exercises), [sections]);
  const resources = useMemo(() => { const list=[...props.lesson.resources]; if (props.sourceAvailable && !list.some((item) => item.id === 'source-book')) list.push({ id:'source-book', type:'pdf', title:props.sourceLabel || 'Страницы учебника', url:`/api/lesson-source/${props.lessonId}` }); return list; }, [props.lesson.resources, props.lessonId, props.sourceAvailable, props.sourceLabel]);
  const resource = resources.find((item) => item.id === sourceId) || null;

  useEffect(() => { let cancelled=false; async function load(){ if(props.cleanMode){setLoaded(true);return;} try{const local=localStorage.getItem(storageKey); if(local){const state=JSON.parse(local) as SavedState;if(!cancelled){setResponses(state.responses||{});setCompleted(new Set(state.completed||[]));setLoaded(true);}return;}}catch{} try{const response=await fetch(`/api/lesson-progress/${props.lessonId}`,{cache:'no-store'});const payload=await response.json() as {ok?:boolean;state?:SavedState};if(!cancelled&&payload.ok&&payload.state){setResponses(payload.state.responses||{});setCompleted(new Set(payload.state.completed||[]));}}catch{}if(!cancelled)setLoaded(true);}load();return()=>{cancelled=true;};},[props.cleanMode,props.lessonId,storageKey]);
  useEffect(() => { if(loaded&&!props.cleanMode)localStorage.setItem(storageKey,JSON.stringify({responses,completed:[...completed]} satisfies SavedState)); },[completed,loaded,props.cleanMode,responses,storageKey]);
  useEffect(() => { const onKey=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(target&&['INPUT','TEXTAREA','SELECT'].includes(target.tagName))return;if(event.key==='ArrowRight')setIndex((value)=>Math.min(exercises.length-1,value+1));if(event.key==='ArrowLeft')setIndex((value)=>Math.max(0,value-1));if(event.key==='Escape'&&fullscreen)leaveFullscreen();};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[exercises.length,fullscreen]);
  const setAnswer=(value:Record<string,string>)=>{if(exercise)setResponses((current)=>({...current,[exercise.id]:value}));};
  const markComplete=(id:string,done=true)=>setCompleted((current)=>{const next=new Set(current);if(done)next.add(id);else next.delete(id);return next;});
  const check=()=>{if(!exercise)return;const result=checkAnswers(exercise,responses);if(result){setFeedback((current)=>({...current,[exercise.id]:result}));if(result.correct===result.total)markComplete(exercise.id);}};
  const showAnswer=()=>{if(!exercise)return;const answer=correctAnswers(exercise);if(answer){setResponses((current)=>({...current,[exercise.id]:answer}));setFeedback((current)=>({...current,[exercise.id]:{correct:Object.keys(answer).length,total:Object.keys(answer).length}}));markComplete(exercise.id);}};
  const openSource=()=>{if(!exercise)return;const id=exercise.resourceId||(props.sourceAvailable?'source-book':'');if(id){setSourceId(id);setSourceMode(sourceMode==='closed'?'floating':sourceMode);}};
  const save=async()=>{if(props.cleanMode)return;const state:SavedState={responses,completed:[...completed]};localStorage.setItem(storageKey,JSON.stringify(state));setSaveStatus('Сохраняю…');try{const response=await fetch(`/api/lesson-progress/${props.lessonId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});setSaveStatus(response.ok?'Сохранено ✓':'Сохранено локально');}catch{setSaveStatus('Сохранено локально');}window.setTimeout(()=>setSaveStatus(''),1600);};
  const enterFullscreen=async()=>{setFullscreen(true);try{await document.documentElement.requestFullscreen?.();}catch{}};
  const leaveFullscreen=async()=>{setFullscreen(false);try{if(document.fullscreenElement)await document.exitFullscreen();}catch{}};
  const progress=allExercises.length?Math.round(allExercises.filter((item)=>completed.has(item.id)).length/allExercises.length*100):0;
  const previous=()=>setIndex((value)=>Math.max(0,value-1));const next=()=>setIndex((value)=>Math.min(exercises.length-1,value+1));
  if(!exercise)return null;
  return <div className={`${styles.shell} ${fullscreen?styles.fullscreen:''} ${sourceMode==='docked'?styles.withSource:''}`} data-theme={props.designStyle||'teen-study'}>
    <header className={styles.playerBar}><button type="button" onClick={fullscreen?leaveFullscreen:()=>window.history.back()}><X size={19}/> Выйти</button><div className={styles.progress}><strong>Task {index+1} из {exercises.length}</strong><div>{exercises.map((item,itemIndex)=><button type="button" key={item.id} aria-label={`Task ${itemIndex+1}`} className={`${itemIndex===index?styles.currentDot:''} ${completed.has(item.id)?styles.doneDot:''}`} onClick={()=>setIndex(itemIndex)}/>)}</div></div><button type="button" disabled={index===0} onClick={previous}><ArrowLeft size={19}/> Назад</button><button type="button" disabled={index===exercises.length-1} onClick={next}>Вперёд <ArrowRight size={19}/></button>{!fullscreen?<button type="button" onClick={enterFullscreen}><Fullscreen size={18}/> Полный экран</button>:null}</header>
    {!fullscreen?<section className={styles.lessonHeader}><div><small>ИНТЕРАКТИВНЫЙ УРОК</small><h1>{props.title}</h1><p>{props.student} · {props.course}</p></div><div><strong>{progress}%</strong><span>{completed.size} из {allExercises.length}</span></div></section>:null}
    {!fullscreen?<nav className={styles.sections}>{sections.map((section)=><button type="button" key={section.id} className={section.id===sectionId?styles.activeSection:''} onClick={()=>{setSectionId(section.id);setIndex(0);}}>{sectionLabels[section.id]} <b>{section.exercises.length}</b></button>)}</nav>:null}
    <main className={styles.stage}><article className={`${styles.scene} ${styles[`type_${exercise.type}`]}`}><header><div><span>{typeLabels[exercise.type]}</span><h2>{exercise.title}</h2>{exercise.instruction?<p>{exercise.instruction}</p>:null}</div>{exercise.resourceId||props.sourceAvailable?<button type="button" onClick={openSource}><FileText size={17}/> Источник</button>:null}</header><div className={styles.taskBody}><TaskBody exercise={exercise} value={answerMap(responses,exercise.id)} feedback={feedback[exercise.id]} update={setAnswer} openSource={openSource}/></div><footer>{objectiveTypes.has(exercise.type)?<><button type="button" className={styles.primary} onClick={check}><Check size={18}/> Проверить</button>{feedback[exercise.id]&&feedback[exercise.id].correct<feedback[exercise.id].total?<><button type="button" onClick={()=>{setFeedback((current)=>{const next={...current};delete next[exercise.id];return next;});markComplete(exercise.id,false);}}><RotateCcw size={17}/> Ещё раз</button><button type="button" onClick={showAnswer}>Показать ответ</button></>:null}{feedback[exercise.id]?<strong>{feedback[exercise.id].correct} / {feedback[exercise.id].total}</strong>:null}</>:<button type="button" className={completed.has(exercise.id)?styles.done:''} onClick={()=>markComplete(exercise.id,!completed.has(exercise.id))}><Check size={17}/>{completed.has(exercise.id)?'Выполнено':'Отметить выполненным'}</button>}{!props.cleanMode?<button type="button" onClick={save}><Save size={17}/>{saveStatus||'Сохранить'}</button>:null}</footer></article></main>
    <SourcePanel resource={resource} mode={sourceMode} zoom={sourceZoom} onMode={setSourceMode} onZoom={setSourceZoom}/>
  </div>;
}
