import { BookOpenCheck, Clock3, Plus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { dbConfigured } from '@/lib/db';
import { getCourses, getEnrollments, getStudents } from '@/lib/data';
import { EmptyState } from '@/components/EmptyState';
import { addStudent, configureStudentCourse } from '../actions';
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

export default async function StudentsPage({ searchParams }: PageProps<'/students'>) {
  const [students, courses, enrollments, params] = await Promise.all([getStudents(), getCourses(), getEnrollments(), searchParams]);
  const hasDb = dbConfigured();
  const selectedStudentId = students.some((student) => student.id === params.student) ? params.student : '';

  return <>
    <header className="page-head"><div><p className="eyebrow">Личные маршруты</p><h1>Ученики</h1><p className="muted">Каждый ученик хранит свой прогресс, школьную позицию и очередь повторения.</p></div></header>

    <div className="two-col">
      <section className="panel"><div className="panel-title"><h2>Активные ученики</h2><span className="count-badge">{students.length}</span></div>
        {students.length ? <div className="card-list">{students.map((s) => <article className={styles.studentCard} key={s.id}>
          <Link className={styles.studentPrimary} href={`/students/${s.id}`} aria-label={`Открыть карточку ученика ${s.displayName}`}><div className="avatar soft"><UserRound size={20}/></div><div><strong>{s.displayName}</strong><span>{s.schoolGrade ? `${s.schoolGrade} класс` : 'класс не указан'}</span></div></Link>
          <Link className={styles.studentAction} href={`/students/${s.id}`}>Открыть карточку <span aria-hidden="true">→</span></Link>
        </article>)}</div> : <EmptyState title="Пока никого нет" text="Добавьте первого ученика — полный список заранее знать не нужно."/>}
      </section>

      <section className="panel form-panel"><div className="panel-title"><h2><Plus size={18}/>Добавить ученика</h2></div>
        {!hasDb ? <div className="notice warning">Сначала подключим PostgreSQL.</div> : <form action={addStudent} className="stack-form"><label>Имя<input name="name" required placeholder="Например, Артём"/></label><label>Класс<input name="grade" type="number" min="1" max="11" placeholder="9"/></label><button className="button primary" type="submit">Добавить ученика</button></form>}
      </section>
    </div>

    <section className={`panel ${styles.learningSetup}`} id="learning-setup">
      <div className="panel-title"><div><h2><BookOpenCheck size={18}/>Настроить обучение</h2><p className="muted small">Сначала свяжите ученика с курсом и укажите школьную позицию. Первый слот расписания можно добавить здесь, остальные — в карточке ученика.</p></div><span className="soft-badge">курс и позиция</span></div>

      {!hasDb ? <div className="notice warning">Сначала подключим PostgreSQL.</div> : students.length === 0 || courses.length === 0 ? <div className="notice warning">Сначала добавьте хотя бы одного ученика и один курс.</div> : <form action={configureStudentCourse} className={styles.setupGrid}>
        <label>Ученик<select name="studentId" required defaultValue={selectedStudentId}><option value="" disabled>Выберите ученика</option>{students.map((s) => <option value={s.id} key={s.id}>{s.displayName}</option>)}</select></label>
        <label>Курс<select name="courseId" required defaultValue=""><option value="" disabled>Выберите курс</option>{courses.map((c) => <option value={c.id} key={c.id}>{c.title}</option>)}</select></label>
        <label>День<select name="weekday" defaultValue=""><option value="">Пока не указывать</option>{weekdays.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Время<div className={styles.inputIcon}><Clock3 size={16}/><input name="time" type="time"/></div></label>
        <label>Длительность<input name="durationMinutes" type="number" min="30" max="180" step="1" defaultValue="60"/></label>
        <label>Модуль / раздел<input name="module" placeholder="Например, Module 1"/></label>
        <label>Тема школы<input name="topic" placeholder="Например, Present Simple"/></label>
        <label className={styles.note}>Что важно сейчас<textarea name="note" rows={2} placeholder="Школа ушла вперёд; не поняла вопросы; скоро контрольная…"/></label>
        <button className={`button primary ${styles.submit}`} type="submit">Сохранить маршрут</button>
        <p className={`muted small ${styles.scheduleHint}`}>После сохранения добавляйте и изменяйте все регулярные занятия в карточке ученика.</p>
      </form>}
    </section>

    {enrollments.length > 0 && <section className={`panel ${styles.routePanel}`}><div className="panel-title"><h2>Текущие маршруты</h2><span className="count-badge">{enrollments.length}</span></div><div className={styles.routeChips}>{enrollments.map((e) => <div className={styles.routeChip} key={e.id}><UserRound size={15}/><strong>{e.student}</strong><span>→</span><span>{e.course}</span></div>)}</div></section>}
  </>;
}
