import { ArrowLeft, BookOpenCheck, BrainCircuit, CalendarDays, CheckCircle2, Clock3, History, LifeBuoy, NotebookPen, RefreshCw, Sparkles, Target, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAppDateString, getStudentDetails } from '@/lib/data';
import {
  addLearningPlanItem,
  addRecyclingItem,
  addStudentObservation,
  completeLearningPlanItem,
  completeRecyclingItem,
  generateStudentAdviceAction,
  updateStudentContext,
  updateStudentCurrentFocus,
} from '../../actions';
import { AdviceSubmitButton } from './AdviceSubmitButton';
import styles from './student.module.css';

const weekdayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

function formatLessonDate(date: string | null) {
  if (!date) return 'без даты';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

function formatObservationDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

export default async function StudentPage({ params, searchParams }: PageProps<'/students/[studentId]'>) {
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const student = await getStudentDetails(studentId);
  if (!student) notFound();

  const latestAdvice = student.recommendations[0] || null;
  const defaultEnrollmentId = student.courses[0]?.enrollmentId || '';

  return <>
    <Link className={styles.backLink} href="/students"><ArrowLeft size={16}/>Все ученики</Link>
    <header className={`page-head ${styles.header}`}>
      <div className={styles.identity}>
        <div className={`avatar soft ${styles.avatar}`}><UserRound size={28}/></div>
        <div><p className="eyebrow">Карточка ученика</p><h1>{student.displayName}</h1><p className="muted">{student.schoolGrade ? `${student.schoolGrade} класс` : 'Класс не указан'} · история и маршрут обучения</p></div>
      </div>
      <div className={styles.actions}>
        <Link className={`button ${styles.secondaryButton}`} href={`/students?student=${studentId}#learning-setup`}><BookOpenCheck size={17}/>Настроить обучение</Link>
        <Link className="button primary" href={`/?student=${studentId}`}><Sparkles size={17}/>Подготовить урок</Link>
        <Link className={`button ${styles.urgentButton}`} href={`/urgent?student=${studentId}`}><LifeBuoy size={17}/>Срочная помощь</Link>
      </div>
    </header>

    <div className={styles.grid}>
      <section className={`panel ${styles.wide} ${styles.contextPanel}`}>
        <div className="panel-title"><div><h2><History size={18}/>Об ученике / контекст</h2><p className="muted small">Постоянная история: как учился раньше, зачем пришёл, цели, особенности работы. Это не стирается после урока.</p></div></div>
        <form action={updateStudentContext} className={styles.contextForm}>
          <input type="hidden" name="studentId" value={studentId}/>
          <textarea name="context" rows={4} defaultValue={student.notes || ''} placeholder="Например: раньше занимался английским без экзаменационной цели. В августе решил сдавать ОГЭ. Нужно определить уровень, сильные и слабые стороны и выстроить подготовку."/>
          <button className={`button ${styles.secondaryButton}`} type="submit">Сохранить контекст</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title"><h2><BookOpenCheck size={18}/>Обучение сейчас</h2><span className="count-badge">{student.courses.length}</span></div>
        {student.courses.length ? <div className={styles.courseList}>{student.courses.map((course) => <article className={styles.courseCard} key={course.enrollmentId}>
          <strong>{course.title}</strong>
          <dl><div><dt>Модуль / раздел</dt><dd>{course.module || 'Не указан'}</dd></div><div><dt>Тема школы</dt><dd>{course.topic || 'Не указана'}</dd></div></dl>
          <form action={updateStudentCurrentFocus} className={styles.focusForm}>
            <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="enrollmentId" value={course.enrollmentId}/>
            <label>Что важно сейчас<textarea name="note" rows={2} defaultValue={course.note || ''} placeholder="Короткая текущая задача: диагностика, контрольная, слабое говорение…"/></label>
            <button type="submit">Обновить</button>
          </form>
        </article>)}</div> : <p className="muted small">Курс пока не настроен.</p>}
      </section>

      <section className="panel">
        <div className="panel-title"><h2><Clock3 size={18}/>Текущее расписание</h2></div>
        {student.schedule.length ? <ul className={styles.schedule}>{student.schedule.map((item) => <li key={item.id}><span>{weekdayNames[item.weekday - 1]}</span><strong>{item.time}</strong><small>{item.course}</small></li>)}</ul> : <p className="muted small">Занятия пока не добавлены в расписание.</p>}
      </section>

      <section className={`panel ${styles.wide} ${styles.observationPanel}`}>
        <div className="panel-title"><div><h2><NotebookPen size={18}/>После урока · быстрое наблюдение</h2><p className="muted small">Запиши только то, что реально заметила. Поле «Повторить» автоматически добавит пункты в очередь повторения.</p></div></div>
        {student.courses.length ? <form action={addStudentObservation} className={styles.observationForm}>
          <input type="hidden" name="studentId" value={studentId}/>
          <label>Дата<input type="date" name="observedOn" defaultValue={getAppDateString()}/></label>
          <label>Курс<select name="enrollmentId" required defaultValue={defaultEnrollmentId}>{student.courses.map((course) => <option key={course.enrollmentId} value={course.enrollmentId}>{course.title}</option>)}</select></label>
          <label>Получается хорошо<textarea name="strengths" rows={2} placeholder="reading; быстро запоминает лексику…"/></label>
          <label>Трудно<textarea name="difficulties" rows={2} placeholder="односложные ответы; путает do/does…"/></label>
          <label>Повторить<textarea name="recycle" rows={2} placeholder={'Past Simple questions\ndo/does'}/><small>По одному пункту на строку или через ;</small></label>
          <label>Комментарий<textarea name="comment" rows={2} placeholder="Любая важная деталь по уроку"/></label>
          <button className="button primary" type="submit">Сохранить наблюдение</button>
        </form> : <div className="notice warning">Сначала свяжи ученика хотя бы с одним курсом.</div>}

        {student.observations.length > 0 && <div className={styles.timeline}>
          {student.observations.map((item) => <article key={item.id}>
            <div className={styles.timelineHead}><strong>{formatObservationDate(item.observedOn)}</strong><span>{item.course || 'Без курса'}</span></div>
            <div className={styles.observationBits}>
              {item.strengths && <p><b>Получается:</b> {item.strengths}</p>}
              {item.difficulties && <p><b>Трудно:</b> {item.difficulties}</p>}
              {item.recycle && <p><b>Повторить:</b> {item.recycle}</p>}
              {item.comment && <p><b>Комментарий:</b> {item.comment}</p>}
            </div>
          </article>)}
        </div>}
      </section>

      <section className={`panel ${styles.queuePanel}`}>
        <div className="panel-title"><h2><Target size={18}/>План обучения</h2><span className="count-badge">{student.learningPlan.length}</span></div>
        {student.learningPlan.length ? <div className={styles.queueList}>{student.learningPlan.map((item) => <article key={item.id}><div><strong>{item.label}</strong><span>{item.course}</span></div><form action={completeLearningPlanItem}><input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="itemId" value={item.id}/><button title="Готово" type="submit"><CheckCircle2 size={17}/></button></form></article>)}</div> : <p className="muted small">Пока пусто. Сюда можно добавлять конкретные методические цели из рекомендаций.</p>}
      </section>

      <section className={`panel ${styles.queuePanel}`}>
        <div className="panel-title"><h2><RefreshCw size={18}/>Повторение</h2><span className="count-badge">{student.recycling.length}</span></div>
        {student.recycling.length ? <div className={styles.queueList}>{student.recycling.map((item) => <article key={item.id}><div><strong>{item.label}</strong><span>{item.course}</span></div><form action={completeRecyclingItem}><input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="itemId" value={item.id}/><button title="Больше не нужно повторять" type="submit"><CheckCircle2 size={17}/></button></form></article>)}</div> : <p className="muted small">Активных пунктов повторения нет.</p>}
      </section>

      <section className={`panel ${styles.wide} ${styles.advicePanel}`} id="recommendations">
        <div className="panel-title"><div><h2><BrainCircuit size={19}/>Рекомендации по обучению</h2><p className="muted small">AI учитывает контекст ученика, твои наблюдения, текущие курсы, прошлые уроки, план и очередь повторения.</p></div></div>
        {query.advice === 'ready' && <div className="notice success">Новый анализ ученика готов.</div>}
        {query.advice === 'error' && <div className="notice warning">Не удалось получить рекомендации. Данные ученика сохранены — попробуй анализ ещё раз позже.</div>}
        <form action={generateStudentAdviceAction} className={styles.adviceAction}><input type="hidden" name="studentId" value={studentId}/><AdviceSubmitButton/></form>

        {latestAdvice ? <div className={styles.adviceResult}>
          <div className={styles.adviceMeta}><span>Последний анализ: {latestAdvice.createdAt.replace(' ', ' · ')}</span>{latestAdvice.credits != null && <span>{latestAdvice.credits.toFixed(2)} credits</span>}</div>
          <p className={styles.adviceSummary}>{latestAdvice.advice.summary}</p>
          <div className={styles.adviceColumns}>
            <div><h3>Приоритеты</h3><ul>{latestAdvice.advice.priorities.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3>Ближайший урок</h3><ul>{latestAdvice.advice.nextLesson.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3>Наблюдать</h3><ul>{latestAdvice.advice.watch.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>

          {student.courses.length > 0 && (latestAdvice.advice.planItems.length > 0 || latestAdvice.advice.recycleItems.length > 0) && <div className={styles.suggestionGrid}>
            <div><h3>Добавить в план обучения</h3>{latestAdvice.advice.planItems.map((item) => <form action={addLearningPlanItem} className={styles.suggestionForm} key={item}>
              <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="recommendationId" value={latestAdvice.id}/><input type="hidden" name="label" value={item}/>
              <span>{item}</span><select name="enrollmentId" defaultValue={defaultEnrollmentId}>{student.courses.map((course) => <option key={course.enrollmentId} value={course.enrollmentId}>{course.title}</option>)}</select><button type="submit">В план</button>
            </form>)}</div>
            <div><h3>Добавить в повторение</h3>{latestAdvice.advice.recycleItems.map((item) => <form action={addRecyclingItem} className={styles.suggestionForm} key={item}>
              <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="label" value={item}/>
              <span>{item}</span><select name="enrollmentId" defaultValue={defaultEnrollmentId}>{student.courses.map((course) => <option key={course.enrollmentId} value={course.enrollmentId}>{course.title}</option>)}</select><button type="submit">Повторять</button>
            </form>)}</div>
          </div>}
          {student.recommendations.length > 1 && <p className="muted small">В истории сохранено ещё {student.recommendations.length - 1} прошлых анализа.</p>}
        </div> : <div className={styles.emptyAdvice}><BrainCircuit size={28}/><div><strong>Анализа пока нет</strong><p>Сначала заполни контекст и несколько наблюдений — тогда рекомендации будут намного полезнее.</p></div></div>}
      </section>

      <section className={`panel ${styles.wide} ${styles.recent}`}>
        <div className="panel-title"><h2><CalendarDays size={18}/>Последние подготовленные уроки</h2></div>
        {student.recentLessons.length ? <div className={styles.lessonList}>{student.recentLessons.map((lesson) => <article key={lesson.id}>
          <div><strong>{lesson.title}</strong><span>{lesson.course}</span></div><time>{formatLessonDate(lesson.scheduledDate)}</time>
        </article>)}</div> : <p className="muted small">Подготовленных уроков пока нет.</p>}
      </section>
    </div>
  </>;
}