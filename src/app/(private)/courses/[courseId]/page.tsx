import { ArrowLeft, BookMarked, FolderOpen, Pencil, Sparkles, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCourseDetails, getCourseMapItems } from '@/lib/data';
import { getGoogleDriveSourceFolders } from '@/lib/google-drive-source-folders';
import { getCourseMethodology } from '@/lib/course-profile';
import { addCourseMapItem, updateCourse, updateCourseMethodology, updateCourseSource } from '../../actions';
import { CourseDeleteButton } from '../CourseDeleteButton';
import styles from './course.module.css';

function formatLessonDate(date: string | null) {
  if (!date) return 'без даты';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

export default async function CoursePage({ params, searchParams }: PageProps<'/courses/[courseId]'>) {
  const [{ courseId }, query] = await Promise.all([params, searchParams]);
  const [course, courseMap] = await Promise.all([getCourseDetails(courseId), getCourseMapItems(courseId)]);
  if (!course) notFound();

  let drive: Awaited<ReturnType<typeof getGoogleDriveSourceFolders>> & { error?: boolean };
  try {
    drive = await getGoogleDriveSourceFolders();
  } catch (error) {
    console.error('[course-source] Не удалось прочитать корневые папки Google Drive:', error);
    drive = { connected: true, libraryRoot: null, folders: [], error: true };
  }
  const sourceFolder = drive.folders.find((folder) => folder.id === course.driveFolderId) || null;
  const methodology = getCourseMethodology(course.courseProfile);

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

    {query.source === 'saved' && <div className="notice success">Папка курса сохранена.</div>}
    {query.source === 'invalid' && <div className="notice warning">Не удалось выбрать папку. Обновите список и попробуйте ещё раз.</div>}

    <div className={styles.grid}>
      <section className={`panel ${styles.methodologyPanel}`} id="methodology">
        <div className="panel-title"><div><h2>Методика курса</h2><p className="muted small">Постоянные правила, по которым Мастерская готовит уроки по этому курсу.</p></div></div>
        {methodology ? <p className={styles.methodologyText}>{methodology}</p> : <p className="muted small">Методика курса пока не заполнена.</p>}
        <details className={styles.methodologyEditor}>
          <summary>{methodology ? 'Изменить' : 'Настроить методику'}</summary>
          <form action={updateCourseMethodology}>
            <input type="hidden" name="courseId" value={courseId}/>
            <label>Как мы работаем по этому курсу<textarea name="methodology" rows={10} defaultValue={methodology || ''} placeholder={'Учебник — каркас урока. Лексику активно отрабатываем…\nGrammar: explanation → practice → speaking…\nStudent Worksheet без ответов…'}/></label>
            <button className="button primary" type="submit">Сохранить методику</button>
          </form>
        </details>
      </section>
      <section className={`panel ${styles.editPanel}`} id="course-map"><div className="panel-title"><div><h2>Course Map</h2><p className="muted small">Общий маршрут курса: что и в каком порядке проходить.</p></div><span className="count-badge">{courseMap.length}</span></div>{courseMap.length?<div className={styles.lessonList}>{courseMap.map((item)=><article key={item.id}><div><strong>{item.stage}{item.lesson?` / ${item.lesson}`:''} — {item.title}</strong><span>Шаг {item.position}</span></div></article>)}</div>:<p className="muted small">Маршрут пока пуст.</p>}<details className={styles.sourcePicker}><summary>Добавить этап</summary><form action={addCourseMapItem}><input type="hidden" name="courseId" value={courseId}/><label>Порядок<input name="position" type="number" min="1" required defaultValue={courseMap.length+1}/></label><label>Этап<input name="stage" required placeholder="Block 3 / Module 5"/></label><label>Урок<input name="lesson" placeholder="5b"/></label><label>Название<input name="title" required placeholder="Travelling"/></label><label>Тема<input name="topic"/></label><label>Раздел ОГЭ / skill<input name="section" placeholder="Speaking"/></label><button className="button primary" type="submit">Сохранить этап</button></form></details></section>
      <section className={`panel ${styles.sourcePanel}`} id="source">
        <div className="panel-title"><h2><FolderOpen size={18}/>Google Drive</h2><span className={`status ${sourceFolder ? 'status-prepared' : 'status-draft'}`}>{sourceFolder ? 'Подключено' : 'Не подключено'}</span></div>
        {drive.libraryRoot && <div className={styles.connectedSource}><div><span>Библиотека:</span><strong>{drive.libraryRoot.name}</strong><span>Папка курса:</span><strong>{sourceFolder?.name || 'Не выбрана'}</strong>{sourceFolder && <span>Сайт читает все материалы внутри этой папки и её подпапок.</span>}</div>{sourceFolder?.webViewLink && <a href={sourceFolder.webViewLink} target="_blank" rel="noreferrer">Открыть папку курса в Drive</a>}</div>}
        {course.driveFolderId && !sourceFolder ? <div className="notice warning">Сохранённая папка недоступна или больше не находится непосредственно внутри общей библиотеки. Выберите папку курса ниже.</div> : !sourceFolder && <p className="muted small">Выберите одну папку курса внутри общей библиотеки. Вложенные разделы и материалы будут найдены автоматически.</p>}

        {!drive.connected ? <div className={styles.sourceAction}><p className="muted small">Сначала подключите существующую интеграцию Google Drive.</p><Link className="button primary" href="/settings">Перейти в настройки</Link></div> : drive.error ? <div className="notice warning">Google Drive подключён, но список папок сейчас недоступен. Попробуйте обновить страницу.</div> : drive.folders.length ? <details className={styles.sourcePicker} open={!course.driveFolderId || !sourceFolder}>
          <summary>{course.driveFolderId ? 'Изменить папку курса' : 'Выбрать папку курса'}</summary>
          <form action={updateCourseSource}>
            <input type="hidden" name="courseId" value={courseId}/>
            <label>Папка курса<select name="folderId" required defaultValue={sourceFolder?.id || ''}><option value="" disabled>Выберите папку внутри библиотеки</option>{drive.folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
            <button className="button primary" type="submit">Сохранить папку курса</button>
          </form>
        </details> : <p className="muted small">В общей библиотеке пока нет доступных папок курсов.</p>}
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
