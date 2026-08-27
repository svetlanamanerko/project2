'use client';

import { Clock3, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import styles from './students.module.css';

const weekdays = [
  ['1', 'Понедельник'],
  ['2', 'Вторник'],
  ['3', 'Среда'],
  ['4', 'Четверг'],
  ['5', 'Пятница'],
  ['6', 'Суббота'],
  ['7', 'Воскресенье'],
];

type ScheduleRow = { id: string };

export function InitialScheduleRows() {
  const [rows, setRows] = useState<ScheduleRow[]>([{ id: 'initial-0' }]);

  function addRow() {
    setRows((current) => [...current, { id: `slot-${Date.now()}-${current.length}` }]);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  return <div className={styles.scheduleEditor}>
    <div className={styles.scheduleEditorHead}>
      <div><strong>Расписание</strong><span>Можно сразу добавить все регулярные занятия.</span></div>
      <button className={styles.scheduleAdd} type="button" onClick={addRow}><Plus size={15}/>Добавить занятие</button>
    </div>

    {rows.length ? <div className={styles.scheduleRows}>{rows.map((row, index) => <div className={styles.scheduleRow} key={row.id}>
      <label>День<select name="weekday" defaultValue=""><option value="">Пока не указывать</option>{weekdays.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Время<div className={styles.inputIcon}><Clock3 size={16}/><input name="time" type="time"/></div></label>
      <label>Длительность<input name="durationMinutes" type="number" min="30" max="180" step="1" defaultValue="60"/></label>
      <button className={styles.scheduleRemove} type="button" onClick={() => removeRow(row.id)} aria-label={`Удалить занятие ${index + 1}`} title="Удалить занятие"><Trash2 size={16}/></button>
    </div>)}</div> : <p className={`muted small ${styles.emptySchedule}`}>Расписание пока не указано. Его можно добавить сейчас или позже в карточке ученика.</p>}
  </div>;
}
