'use client';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { recordLessonHistory, setStudentCoursePosition } from '../../actions';
import { saveCommunicativeTopicResult } from './communicative-actions';
import styles from './progress.module.css';

type Row = {
  enrollmentId: string;
  studentId: string;
  student: string;
  course: string;
  stage: string | null;
  lesson: string | null;
  mapItemId: string | null;
  completedBeforeTracking: boolean;
  mapItems: Array<{ id: string; stage: string; lesson: string | null; title: string }>;
};

export function ProgressRows({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return <div className={styles.rows}>{rows.map((row) => {
    const active = open === row.enrollmentId;
    const defaultTopic = `${row.stage || ''}${row.lesson ? ` / ${row.lesson}` : ''}`.trim();
    return <article className={styles.row} key={row.enrollmentId}>
      <button type="button" className={styles.summary} aria-expanded={active} onClick={() => setOpen(active ? null : row.enrollmentId)}>
        <span><strong>{row.student}</strong><small>{row.course}</small></span>
        <span className={styles.position}>{row.stage || 'Позиция не настроена'}{row.lesson ? ` / ${row.lesson}` : ''}</span>
        <ChevronDown className={active ? styles.open : ''} size={18}/>
      </button>
      {active && <div>
        <form action={setStudentCoursePosition} className={styles.form}>
          <input type="hidden" name="enrollmentId" value={row.enrollmentId}/>
          <input type="hidden" name="studentId" value={row.studentId}/>
          <label>Этап Course Map<select name="mapItemId" defaultValue={row.mapItemId || ''}><option value="">Указать вручную</option>{row.mapItems.map((x) => <option key={x.id} value={x.id}>{x.stage}{x.lesson ? ` / ${x.lesson}` : ''} — {x.title}</option>)}</select></label>
          <label>Текущий раздел / этап<input name="stage" required defaultValue={row.stage || ''} placeholder="Block 3, Module 5, Unit 2…"/></label>
          <label>Текущий урок<input name="lesson" defaultValue={row.lesson || ''} placeholder="5b — необязательно"/></label>
          <label className={styles.check}><input type="checkbox" name="completedBeforeTracking" defaultChecked={row.completedBeforeTracking}/>Предыдущие этапы пройдены до начала журнала</label>
          <label className={styles.note}>Комментарий<textarea name="note" rows={2}/></label>
          <button className="button primary" type="submit">Сохранить позицию</button>
        </form>

        <details className={styles.history}>
          <summary>Записать результат реального урока</summary>
          <form action={recordLessonHistory} className={styles.form}>
            <input type="hidden" name="enrollmentId" value={row.enrollmentId}/>
            <label>Дата<input name="date" type="date"/></label>
            <label>Этап<input name="stage" required defaultValue={row.stage || ''}/></label>
            <label>Урок<input name="lesson" defaultValue={row.lesson || ''}/></label>
            <label>Что делали<input name="skills" placeholder="Vocabulary, Grammar, Speaking"/></label>
            <label>Результат<select name="status" defaultValue="completed"><option value="completed">Завершено</option><option value="repeat">Повторить</option><option value="unfinished">Не закончено</option></select></label>
            <label>QID Navigator<input name="qids" placeholder="12345, 12346"/></label>
            <label className={styles.note}>Материалы Google Drive<textarea name="materials" rows={2} placeholder="drive-id | Название | https://drive.google.com/… (по одному в строке)"/></label>
            <label className={styles.note}>Заметка<textarea name="teacherNote" rows={2}/></label>
            <label>Домашнее задание<textarea name="homework" rows={2}/></label>
            <label>Следующие шаги<textarea name="nextSteps" rows={2}/></label>
            <button className="button primary" type="submit">Сохранить урок</button>
          </form>
        </details>

        <details className={styles.history}>
          <summary>Communicative Core — результат речи</summary>
          <form action={saveCommunicativeTopicResult} className={styles.form}>
            <input type="hidden" name="enrollmentId" value={row.enrollmentId}/>
            <input type="hidden" name="studentId" value={row.studentId}/>
            <label>Дата<input name="date" type="date"/></label>
            <label>Тема<input name="topic" required defaultValue={defaultTopic} placeholder="Travelling / Daily routine / Environment…"/></label>
            <label>Уровень ответа 1–5<select name="answerStage" defaultValue="3">
              <option value="1">1 — фраза + 1 простое предложение</option>
              <option value="2">2 — 1–2 связанных предложения</option>
              <option value="3">3 — 3–4 предложения + причина/пример</option>
              <option value="4">4 — 5–6 предложений + уточнение</option>
              <option value="5">5 — развёрнутый ответ + follow-up</option>
            </select></label>
            <label>Статус темы<select name="topicStatus" defaultValue="practising">
              <option value="practising">В работе</option>
              <option value="recycle">Нужно повторить</option>
              <option value="mastered">Освоено</option>
            </select></label>
            <label className={styles.note}>Что получилось / что мешало<textarea name="evidence" rows={2} placeholder="Например: отвечает 3–4 фразами, но теряет because / нужна опора на chunks"/></label>
            <button className="button primary" type="submit">Сохранить Communicative Core</button>
          </form>
        </details>
      </div>}
    </article>;
  })}</div>;
}
