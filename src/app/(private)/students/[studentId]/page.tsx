import { ArrowLeft, BookOpenCheck, CalendarDays, Clock3, LifeBuoy, Sparkles, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudentDetails } from '@/lib/data';
import styles from './student.module.css';

const weekdayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

function formatLessonDate(date: string | null) {
  if (!date) return 'без даты';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

export default async function StudentPage({ params }: PageProps<'/students/[studentId]'>) {
  const { studentId } = await params;
  const student = await getStudentDetails(studentId);
  if (!student) notFound();

  const importantNotes = student.courses.map((course) => course.note).filter(Boolean);

  return <>
    <Link className={styles.backLink} href="/students"><ArrowLeft size={16}/>Все ученики</Link>
    <header className={`page-head ${styles.header}`}>
      <div className={styles.identity}>
        <div className={`avatar soft ${styles.avatar}`}><UserRound size={28}/></div>
        <div><p className="eyebrow">Карточка ученика</p><h1>{student.displayName}</h1><p className="muted">{student.schoolGrade ? `${student.schoolGrade} класс` : 'Класс не указан'}</p></div>
      </div>
      <div className={styles.actions}>
        <Link className={`button ${styles.secondaryButton}`} href={`/students?student=${studentId}#learning-setup`}><BookOpenCheck size={17}/>Настроить обучение</Link>
        <Link className="button primary" href={`/?student=${studentId}`}><Sparkles size={17}/>Подготовить урок</Link>
        <Link className={`button ${styles.urgentButton}`} href={`/urgent?student=${studentId}`}><LifeBuoy size={17}/>Срочная помощь</Link>
      </div>
    </header>

    <div className={styles.grid}>
      <section className="panel">
        <div className="panel-title"><h2><BookOpenCheck size={18}/>Обучение сейчас</h2><span className="count-badge">{student.courses.length}</span></div>
        {student.courses.length ? <div className={styles.courseList}>{student.courses.map((course) => <article className={styles.courseCard} key={course.enrollmentId}>
          <strong>{course.title}</strong>
          <dl><div><dt>Модуль / раздел</dt><dd>{course.module || 'Не указан'}</dd></div><div><dt>Тема школы</dt><dd>{course.topic || 'Не указана'}</dd></div></dl>
        </article>)}</div> : <p className="muted small">Курс пока не настроен.</p>}
      </section>

      <section className="panel">
        <div className="panel-title"><h2><Clock3 size={18}/>Текущее расписание</h2></div>
        {student.schedule.length ? <ul className={styles.schedule}>{student.schedule.map((item) => <li key={item.id}><span>{weekdayNames[item.weekday - 1]}</span><strong>{item.time}</strong><small>{item.course}</small></li>)}</ul> : <p className="muted small">Занятия пока не добавлены в расписание.</p>}
      </section>

      <section className={`panel ${styles.important}`}>
        <div className="panel-title"><h2>Что важно сейчас</h2></div>
        {importantNotes.length ? <ul className="pretty-list">{importantNotes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}</ul> : <p className="muted small">{student.notes || 'Важных заметок пока нет.'}</p>}
      </section>

      <section className={`panel ${styles.recent}`}>
        <div className="panel-title"><h2><CalendarDays size={18}/>Последние подготовленные уроки</h2></div>
        {student.recentLessons.length ? <div className={styles.lessonList}>{student.recentLessons.map((lesson) => <article key={lesson.id}>
          <div><strong>{lesson.title}</strong><span>{lesson.course}</span></div><time>{formatLessonDate(lesson.scheduledDate)}</time>
        </article>)}</div> : <p className="muted small">Подготовленных уроков пока нет.</p>}
      </section>
    </div>
  </>;
}
