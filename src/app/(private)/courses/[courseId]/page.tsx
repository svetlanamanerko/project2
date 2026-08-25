import { ArrowLeft, BookMarked, FolderOpen, Pencil, Sparkles, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCourseDetails } from '@/lib/data';
import { getGoogleDriveCourseFolders } from '@/lib/google-drive';
import { updateCourse, updateCourseSource } from '../../actions';
import { CourseDeleteButton } from '../CourseDeleteButton';
import styles from './course.module.css';

function formatLessonDate(date: string | null) {
  if (!date) return 'без даты';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

export default async function CoursePage({ params, searchParams }: PageProps<'/courses/[courseId]'>) {
  const [{ courseId }, query] = await Promise.all([params, searchParams]);
  const course = await getCourseDetails(courseId);
  if (!course) notFound();

  let drive: Awaited<ReturnType<typeof getGoogleDriveCourseFolders>> & { error?: boolean };
  try {
    drive = await getGoogleDriveCourseFolders();
  } catch (error) {
    console.error('[course-source] Не удалось прочитать папки Google Drive:', error);
    drive = { connected: true, folders: [], error: true };
  }
  const sourceFolder = drive.folders.find((folder) => folder.id === course.driveFolderId) || null;

  return <>
    <Link className={styles.backLink} href="/courses"><ArrowLeft size={16}/>Все курсы</Link>
    <header className={`page-head ${styles.header}`}>
      <div className={styles.identity}>
        <div className={`course-icon large ${styles.icon}`}><BookMarked size={26}/></div>
        <div><p className="eyebrow">Карточка курса</p><h1>{course.title}</h1><p className="muted">{course.grade ? `${course.grade} класс` : 'Класс не указан'}{course.publisher ? ` · ${course.publisher}` : ''}</p></div>
      </div>
      <div className={styles.actions}>
        <a className={`button ${styles.secondaryButton}`} href="#source"><FolderOpen size={17}/>Настроить источник</a>
        <a className={`button ${styles.secondaryButton}`} href="#edit"><Pencil size={17}/>Редактировать курс</a>
        <Link className="button primary" href={`/?course=${courseId}`}><Sparkles size={17}/>Подготовить урок</Link>
      </div>
    </header>

    {query.source === 'saved' && <div className="notice success">Папка-источник сохранена.</div>}
    {query.source === 'invalid' && <div className="notice warning">Не удалось выбрать папку. Обновите список и попробуйте ещё раз.</div>}

    <div className={styles.grid}>
      <section className={`panel ${styles.sourcePanel}`} id="source">
        <div className="panel-title"><h2><FolderOpen size={18}/>Папка-источник Google Drive</h2><span className={`status ${sourceFolder ? 'status-prepared' : 'status-draft'}`}>{sourceFolder ? 'Подключено' : 'Не подключено'}</span></div>
        {sourceFolder ? <div className={styles.connectedSource}><div><strong>{sourceFolder.name}</strong><span>Материалы курса читаются из этой папки.</span></div>{sourceFolder.webViewLink && <a href={sourceFolder.webViewLink} target="_blank" rel="noreferrer">Открыть в Drive</a>}</div> : course.driveFolderId ? <div className="notice warning">Папка привязана, но сейчас её название не удалось получить из Google Drive.</div> : <p className="muted small">Источник пока не выбран.</p>}

        {!drive.connected ? <div className={styles.sourceAction}><p className="muted small">Сначала подключите существующую интеграцию Google Drive.</p><Link className="button primary" href="/settings">Перейти в настройки</Link></div> : drive.error ? <div className="notice warning">Google Drive подключён, но список папок сейчас недоступен. Попробуйте обновить страницу.</div> : drive.folders.length ? <details className={styles.sourcePicker} open={!course.driveFolderId}>
          <summary>{course.driveFolderId ? 'Изменить источник' : 'Выбрать папку'}</summary>
          <form action={updateCourseSource}>
            <input type="hidden" name="courseId" value={courseId}/>
            <label>Папка внутри 01 SCHOOL COURSES<select name="folderId" required defaultValue={course.driveFolderId || ''}><option value="" disabled>Выберите папку</option>{drive.folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
            <button className="button primary" type="submit">Сохранить источник</button>
          </form>
        </details> : <p className="muted small">В папке 01 SCHOOL COURSES пока нет доступных папок курсов.</p>}
      </section>

      <section className="panel">
        <div className="panel-title"><h2><UserRound size={18}/>Ученики курса</h2><span className="count-badge">{course.students.length}</span></div>
        {course.students.length ? <div className={styles.studentList}>{course.students.map((student) => <Link href={`/students/${student.studentId}`} key={student.enrollmentId}><div className="avatar soft"><UserRound size={18}/></div><div><strong>{student.student}</strong><span>{student.module || 'Модуль не указан'}{student.topic ? ` · ${student.topic}` : ''}</span>{student.note && <small>{student.note}</small>}</div></Link>)}</div> : <p className="muted small">К этому курсу пока не привязаны ученики.</p>}
      </section>

      <section className={`panel ${styles.lessonsPanel}`}>
        <div className="panel-title"><h2>Последние подготовленные уроки</h2></div>
        {course.recentLessons.length ? <div className={styles.lessonList}>{course.recentLessons.map((lesson) => <article key={lesson.id}><div><strong>{lesson.title}</strong><span>{lesson.student}</span></div><time>{formatLessonDate(lesson.scheduledDate)}</time></article>)}</div> : <p className="muted small">Подготовленных уроков по курсу пока нет.</p>}
      </section>

      <section className={`panel ${styles.editPanel}`} id="edit">
        <div className="panel-title"><h2><Pencil size={18}/>Редактировать курс</h2></div>
        <form action={updateCourse} className={styles.editForm}>
          <input type="hidden" name="courseId" value={courseId}/>
          <label>Название<input name="title" required defaultValue={course.title}/></label>
          <label>Класс<input name="grade" type="number" min="1" max="11" defaultValue={course.grade ?? ''} placeholder="Не указан"/></label>
          <label>Издательство<input name="publisher" defaultValue={course.publisher || ''} placeholder="Например, Просвещение"/></label>
          <button className="button primary" type="submit">Сохранить изменения</button>
        </form>
        <div className={styles.deleteAction}><CourseDeleteButton courseId={course.id} title={course.title}/></div>
      </section>
    </div>
  </>;
}
