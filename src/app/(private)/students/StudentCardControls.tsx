'use client';

import { Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { deleteStudent, updateStudentProfile } from '../actions';
import styles from './students.module.css';

type Props = {
  student: { id: string; displayName: string; schoolGrade: number | null };
};

export function StudentCardControls({ student }: Props) {
  const [editing, setEditing] = useState(false);

  return <>
    <div className={styles.studentControls}>
      <button type="button" onClick={() => setEditing((value) => !value)} title={`Редактировать ученика ${student.displayName}`} aria-label={`Редактировать ученика ${student.displayName}`}><Pencil size={15}/></button>
      <form action={deleteStudent} onSubmit={(event) => {
        if (!window.confirm(`Удалить ученика «${student.displayName}» из активного списка?`)) event.preventDefault();
      }}>
        <input type="hidden" name="studentId" value={student.id}/>
        <button className={styles.deleteButton} type="submit" title={`Удалить ученика ${student.displayName}`} aria-label={`Удалить ученика ${student.displayName}`}><Trash2 size={15}/></button>
      </form>
    </div>
    {editing && <form action={updateStudentProfile} className={styles.studentEdit}>
      <input type="hidden" name="studentId" value={student.id}/>
      <label>Имя<input name="name" required defaultValue={student.displayName}/></label>
      <label>Класс<input name="grade" type="number" min="1" max="11" defaultValue={student.schoolGrade ?? ''}/></label>
      <button className="button primary" type="submit">Сохранить</button>
      <button className={styles.editCancel} type="button" onClick={() => setEditing(false)}><X size={14}/>Отмена</button>
    </form>}
  </>;
}
