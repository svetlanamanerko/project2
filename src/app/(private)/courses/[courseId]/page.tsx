import { ArrowLeft, BookMarked, CheckCircle2, FolderOpen, Pencil, Sparkles, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCourseDetails, getCourseMapItems } from '@/lib/data';
import { getGoogleDriveSourceFolders } from '@/lib/google-drive-source-folders';
import { courseFolderMatchScore, isOgeCourseTitle } from '@/lib/course-folder-match-utils';
import { getCourseMethodology } from '@/lib/course-profile';
import { addCourseMapItem, updateCourse, updateCourseMethodology, updateCourseSource } from '../../actions';
import { CourseDeleteButton } from '../CourseDeleteButton';
import { CourseHelpPopover } from './CourseHelpPopover';
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
  const isOge = isOgeCourseTitle(course.title);
  const recommendedFolder = sourceFolder ? null : drive.folders
    .map((folder) => ({ folder, score: courseFolderMatchScore(course.title, folder.name) }))
    .filter((item) => item.score >= 50)
    .sort((a, b) => b.score - a.score)[0]?.folder || null;
  const effectiveSourceFolder = sourceFolder || (isOge ? recommendedFolder : null);

  const mapHelpText = isOge
    ? 'Для ОГЭ этот список не нужно забивать вручную целиком. Master Curriculum и технологические карты живут на Google Drive. Ручной этап нужен только если ты специально хочешь добавить или поправить один шаг маршрута внутри сайта.'
    : 'Это внутренний маршрут курса для CURRENT → NEXT. Если маршрут уже есть — сайт показывает, где находится ученик и какой шаг следующий. Ручное добавление нужно только если ты хочешь вести этот маршрут прямо в Мастерской.';

  return <>
    <Link className={styles.backLink} href="/courses"><ArrowLeft size={16}/>Все курсы</Link>
    <header className={`page-head ${styles.header}`}>
      <div className={styles.identity}>
        <div className={`course-icon large ${styles.icon}`}><BookMarked size={26}/></div>
        <div><p className="eyebrow">Карточка курса</p><h1>{course.title}</h1><p className="muted">{course.grade ? `${course.grade} класс` : 'Класс не указан'}{course.publisher ? ` · ${course.publisher}` : ''}</p></div>
      </div>
      <div className={styles.actions}>
        {!isOge && <a className={`button ${styles.secondaryButton}`} href="#source"><FolderOpen size={17}/>Настроить источник</a>}
        <a className={`button ${styles.secondaryButton}`} href="#edit"><Pencil size={17}/>Редактировать курс</a>
        <Link className="button primary" href={`/?course=${courseId}`}><Sparkles size={17}/>Подготовить урок</Link>
      </div>
    </header>

    {query.source === 'saved' && <div className="notice success">Папка курса сохранена.</div>}
    {query.source === 'invalid' && <div className="notice warning">Не удалось выбрать папку. Обновите список и попробуйте ещё раз.</div>}

    <section className={`panel ${styles.setupGuide}`}>
      <div className={styles.guideTitle}>
        <div><h2>Что здесь нужно сделать?</h2><p className="muted small">Не заполняй всё подряд. Для рабочего курса достаточно пройти шаги слева направо.</p></div>
        <CourseHelpPopover
          title="Карточка курса"
          text="Здесь хранится не сам урок, а настройки курса. Большую часть данных Мастерская берёт из Google Drive и карточки ученика. Непонятные технические поля можно вообще не трогать, пока они не понадобятся."
          examples={isOge ? ['1. OGE MASTER подключается автоматически', '2. У ученика указать текущий блок', '3. Нажать «Подготовить урок»'] : ['1. Подключить папку Spotlight / Starlight', '2. У ученика указать текущую тему', '3. Нажать «Подготовить урок»']}
        />
      </div>
      <div className={styles.setupSteps}>
        <div className={`${styles.setupStep} ${effectiveSourceFolder ? styles.stepDone : styles.stepActive}`}>
          <span>{effectiveSourceFolder ? <CheckCircle2 size={18}/> : '1'}</span>
          <div><strong>Google Drive</strong><small>{effectiveSourceFolder ? `${isOge && !sourceFolder ? 'Автоматически: ' : 'Подключено: '}${effectiveSourceFolder.name}` : isOge ? 'OGE MASTER не найден' : 'Сначала подключи папку курса'}</small></div>
        </div>
        <div className={`${styles.setupStep} ${styles.stepNeutral}`}>
          <span>2</span>
          <div><strong>Позиция ученика</strong><small>{isOge ? 'В карточке ученика: текущий Block / диагностика' : 'В карточке ученика: Module / 1a / 1b и т. п.'}</small></div>
        </div>
        <div className={`${styles.setupStep} ${styles.stepNeutral}`}>
          <span>3</span>
          <div><strong>Подготовить урок</strong><small>Мастерская сама соберёт контекст и предложит план</small></div>
        </div>
      </div>
    </section>

    <div className={styles.grid}>
      <section className={`panel ${styles.methodologyPanel}`} id="methodology">
        <div className="panel-title"><div className={styles.titleWithHelp}><div><h2>Методика курса</h2><p className="muted small">Постоянные правила, по которым Мастерская готовит уроки по этому курсу.</p></div><CourseHelpPopover title="Методика курса" text="Это постоянные педагогические правила курса: темп, подход к грамматике, speaking transfer, формат worksheet и т. д. Это не текущая тема ученика." examples={['«Учебник — каркас; лишнее сокращать; грамматику выводить в речь»']}/></div></div>
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

      <section className={`panel ${styles.editPanel}`} id="course-map">
        <div className="panel-title"><div className={styles.titleWithHelp}><div><h2>Маршрут курса <span className={styles.technicalLabel}>Course Map</span></h2><p className="muted small">Показывает порядок этапов и помогает определить CURRENT → NEXT.</p></div><CourseHelpPopover title="Маршрут курса" text={mapHelpText} examples={isOge ? ['Block 3 → Lesson 17 → Why We Travel'] : ['Module 1 → 1a → School Days']}/></div><span className="count-badge">{courseMap.length}</span></div>
        {courseMap.length ? <div className={styles.lessonList}>{courseMap.map((item) => <article key={item.id}><div><strong>{item.stage}{item.lesson ? ` / ${item.lesson}` : ''} — {item.title}</strong><span>Шаг {item.position}</span></div></article>)}</div> : <div className={styles.emptyMap}><strong>{isOge ? 'Для ОГЭ вручную заполнять 72 шага здесь не нужно.' : 'Внутренний маршрут пока пуст.'}</strong><span>{isOge ? 'OGE MASTER подключается автоматически. Master Curriculum используется при планировании, а этот блок оставляем только для редких ручных поправок.' : 'Это не мешает планировать по текущей теме ученика. Маршрут нужен, если хочешь автоматический переход CURRENT → NEXT внутри сайта.'}</span></div>}
        <details className={`${styles.sourcePicker} ${styles.manualMapEditor}`}>
          <summary>Ручное добавление этапа <span>обычно не нужно</span></summary>
          <form action={addCourseMapItem}>
            <input type="hidden" name="courseId" value={courseId}/>
            <label><span className={styles.fieldLabel}>Порядок<CourseHelpPopover title="Порядок" text="Просто номер шага внутри курса. 1 — первый, 2 — второй и т. д." examples={['1']}/></span><input name="position" type="number" min="1" required defaultValue={courseMap.length + 1}/></label>
            <label><span className={styles.fieldLabel}>Этап<CourseHelpPopover title="Этап" text={isOge ? 'Крупный блок подготовки к ОГЭ.' : 'Крупный раздел учебника.'} examples={isOge ? ['Block 3'] : ['Module 1']}/></span><input name="stage" required placeholder={isOge ? 'Block 3' : 'Module 1'}/></label>
            <label><span className={styles.fieldLabel}>Урок<CourseHelpPopover title="Урок" text="Короткое обозначение конкретного урока или секции." examples={isOge ? ['17'] : ['1a']}/></span><input name="lesson" placeholder={isOge ? '17' : '1a'}/></label>
            <label><span className={styles.fieldLabel}>Название<CourseHelpPopover title="Название" text="Человеческое название шага, которое будет видно тебе в маршруте." examples={isOge ? ['Why We Travel'] : ['School Days']}/></span><input name="title" required placeholder={isOge ? 'Why We Travel' : 'School Days'}/></label>
            <label><span className={styles.fieldLabel}>Тема<CourseHelpPopover title="Тема" text="Смысловая тема урока. Если не нужна для фильтрации материалов, можно оставить пустой." examples={isOge ? ['Holidays & Travel'] : ['school subjects and timetable']}/></span><input name="topic" placeholder={isOge ? 'Holidays & Travel' : 'school subjects'}/></label>
            <label><span className={styles.fieldLabel}>Навык / раздел экзамена<CourseHelpPopover title="Навык / раздел" text="Какой навык является главным на этом шаге. Можно оставить пустым, если урок смешанный." examples={['Speaking', 'Grammar', 'Reading']}/></span><input name="section" placeholder="Speaking / Grammar / Reading"/></label>
            <button className="button primary" type="submit">Сохранить этап</button>
          </form>
        </details>
      </section>

      <section className={`panel ${styles.sourcePanel}`} id="source">
        <div className="panel-title"><div className={styles.titleWithHelp}><h2><FolderOpen size={18}/>Google Drive</h2><CourseHelpPopover title="Google Drive" text={isOge ? 'Для курса ОГЭ отдельную папку выбирать не нужно: Мастерская сама использует общую папку OGE MASTER.' : 'Здесь выбирается одна главная папка курса. Мастерская читает все нужные подпапки внутри неё: учебники, Course Baseline, Module Brief и готовые материалы.'} examples={isOge ? ['02 OGE MASTER — общий источник ОГЭ'] : [`Папка с материалами ${course.title}`]}/></div><span className={`status ${effectiveSourceFolder ? 'status-prepared' : 'status-draft'}`}>{effectiveSourceFolder ? isOge && !sourceFolder ? 'Автоматически' : 'Подключено' : 'Не найдено'}</span></div>
        {isOge ? <>
          {effectiveSourceFolder ? <div className={styles.connectedSource}><div><span>Источник ОГЭ:</span><strong>{effectiveSourceFolder.name}</strong><span>Отдельно привязывать папку к этому курсу не нужно. Планирование, материалы и история используют OGE MASTER автоматически.</span></div>{effectiveSourceFolder.webViewLink && <a href={effectiveSourceFolder.webViewLink} target="_blank" rel="noreferrer">Открыть OGE MASTER в Drive</a>}</div> : <div className="notice warning">Не удалось автоматически найти OGE MASTER внутри библиотеки. Проверь подключение Google Drive в Настройках.</div>}
        </> : <>
          {drive.libraryRoot && <div className={styles.connectedSource}><div><span>Библиотека:</span><strong>{drive.libraryRoot.name}</strong><span>Папка курса:</span><strong>{sourceFolder?.name || 'Не выбрана'}</strong>{sourceFolder && <span>Сайт читает все материалы внутри этой папки и её подпапок.</span>}</div>{sourceFolder?.webViewLink && <a href={sourceFolder.webViewLink} target="_blank" rel="noreferrer">Открыть папку курса в Drive</a>}</div>}
          {course.driveFolderId && !sourceFolder ? <div className="notice warning">Сохранённая папка недоступна или больше не находится непосредственно внутри общей библиотеки. Выберите папку курса ниже.</div> : !sourceFolder && <p className="muted small">Сначала подключите папку курса. Остальные материалы внутри неё Мастерская найдёт сама.</p>}

          {!sourceFolder && recommendedFolder && <div className={styles.folderRecommendation}>
            <div><span>Мастерская нашла вероятное совпадение</span><strong>{recommendedFolder.name}</strong><small>Если это нужный курс, просто нажми кнопку — искать в списке не надо.</small></div>
            <form action={updateCourseSource}><input type="hidden" name="courseId" value={courseId}/><input type="hidden" name="folderId" value={recommendedFolder.id}/><button className="button primary" type="submit">Подключить эту папку</button></form>
          </div>}

          {!drive.connected ? <div className={styles.sourceAction}><p className="muted small">Сначала подключите существующую интеграцию Google Drive.</p><Link className="button primary" href="/settings">Перейти в настройки</Link></div> : drive.error ? <div className="notice warning">Google Drive подключён, но список папок сейчас недоступен. Попробуйте обновить страницу.</div> : drive.folders.length ? <details className={styles.sourcePicker} open={!course.driveFolderId || !sourceFolder}>
            <summary>{course.driveFolderId ? 'Изменить папку курса' : 'Выбрать другую папку'}</summary>
            <form action={updateCourseSource}>
              <input type="hidden" name="courseId" value={courseId}/>
              <label>Папка курса<select name="folderId" required defaultValue={sourceFolder?.id || recommendedFolder?.id || ''}><option value="" disabled>Выберите папку внутри библиотеки</option>{drive.folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
              <button className="button primary" type="submit">Сохранить папку курса</button>
            </form>
          </details> : <p className="muted small">В общей библиотеке пока нет доступных папок курсов.</p>}
        </>}
      </section>

      <section className="panel">
        <div className="panel-title"><div className={styles.titleWithHelp}><h2><UserRound size={18}/>Ученики курса</h2><CourseHelpPopover title="Ученики курса" text="Здесь только список учеников, привязанных к курсу. Текущую тему и позицию меняем в карточке конкретного ученика, а не здесь."/></div><span className="count-badge">{course.students.length}</span></div>
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
