import { ArchiveRestore, ArrowLeft, BookOpenCheck, BrainCircuit, CalendarDays, CheckCircle2, Clock3, History, LifeBuoy, NotebookPen, Pencil, Plus, RefreshCw, Sparkles, Target, Trash2, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAppDateString, getStudentDetails } from '@/lib/data';
import { getStudentHistoryBootstrapView } from '@/lib/history-bootstrap';
import {
  addLearningPlanItem,
  addRecyclingItem,
  addScheduleRule,
  addStudentObservation,
  completeLearningPlanItem,
  completeRecyclingItem,
  deactivateLearningPlanItem,
  deactivateRecyclingItem,
  generateStudentAdviceAction,
  generateHistoryBootstrapAction,
  confirmHistoryBootstrapAction,
  deactivateScheduleRule,
  updateScheduleRule,
  setStudentCoursePosition,
  updateStudentContext,
  updateStudentCurrentFocus,
  updateStudentSchoolPosition,
} from '../../actions';
import { AdviceSubmitButton } from './AdviceSubmitButton';
import { SaveStatusButton } from './SaveStatusButton';
import styles from './student.module.css';

const weekdayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const weekdayOptions = weekdayNames.map((label, index) => ({ value: index + 1, label }));
const commonDurations = [30, 45, 60, 75, 90, 120];

type AdviceView = {
  summary: string;
  priorities: string[];
  nextLesson: string[];
  watch: string[];
  planItems: string[];
  recycleItems: string[];
};

function formatLessonDate(date: string | null) {
  if (!date) return 'без даты';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

function formatObservationDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

function adviceStringList(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeAdviceForView(value: unknown): AdviceView | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const object = candidate as Record<string, unknown>;
  const advice: AdviceView = {
    summary: typeof object.summary === 'string' ? object.summary.trim() : '',
    priorities: adviceStringList(object.priorities, 6),
    nextLesson: adviceStringList(object.nextLesson ?? object.next_lesson, 6),
    watch: adviceStringList(object.watch, 6),
    planItems: adviceStringList(object.planItems ?? object.plan_items, 8),
    recycleItems: adviceStringList(object.recycleItems ?? object.recycle_items, 8),
  };
  if (!advice.summary && !advice.priorities.length && !advice.nextLesson.length && !advice.watch.length) return null;
  return advice;
}

function normalizeCredits(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export default async function StudentPage({ params, searchParams }: PageProps<'/students/[studentId]'>) {
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const [student, historyBootstrap] = await Promise.all([getStudentDetails(studentId), getStudentHistoryBootstrapView(studentId)]);
  if (!student) notFound();

  const latestAdviceRecord = student.recommendations[0] || null;
  const latestAdvice = latestAdviceRecord ? normalizeAdviceForView(latestAdviceRecord.advice) : null;
  const latestCredits = latestAdviceRecord ? normalizeCredits(latestAdviceRecord.credits) : null;
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
        <Link className="button primary" href={`/students/${studentId}/lesson-preview`}><Sparkles size={17}/>Подготовить урок</Link>
        <Link className={`button ${styles.urgentButton}`} href={`/urgent?student=${studentId}`}><LifeBuoy size={17}/>Срочная помощь</Link>
      </div>
    </header>

    <div className={styles.grid}>
      <section className={`panel ${styles.wide} ${styles.contextPanel}`}>
        <div className="panel-title"><div><h2><History size={18}/>Об ученике / контекст</h2><p className="muted small">Постоянная история: как учился раньше, зачем пришёл, цели, особенности работы. Это не стирается после урока.</p></div></div>
        <form action={updateStudentContext} className={styles.contextForm}>
          <input type="hidden" name="studentId" value={studentId}/>
          <textarea name="context" rows={4} defaultValue={student.notes || ''} placeholder="Например: раньше занимался английским без экзаменационной цели. В августе решил сдавать ОГЭ. Нужно определить уровень, сильные и слабые стороны и выстроить подготовку."/>
          <SaveStatusButton className={`button ${styles.secondaryButton}`} idleLabel="Сохранить контекст"/>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title"><h2><BookOpenCheck size={18}/>Обучение сейчас</h2><span className="count-badge">{student.courses.length}</span></div>
        {student.courses.length ? <div className={styles.courseList}>{student.courses.map((course) => <article className={styles.courseCard} key={course.enrollmentId}>
          <strong>{course.title}</strong>
          <div className={styles.learningFields}>
            <section className={styles.learningField}>
              <div className={styles.learningFieldHead}><div><span>Фактическая позиция</span><strong>{course.currentStage || 'Не настроена'}{course.currentLesson ? ` / ${course.currentLesson}` : ''}</strong></div></div>
              <details className={styles.inlineEditor}><summary><Pencil size={14}/>{course.currentStage ? 'Изменить' : 'Настроить'}</summary>
                <form action={setStudentCoursePosition} className={styles.inlineEditorForm}>
                  <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="enrollmentId" value={course.enrollmentId}/>
                  {course.mapItems.length > 0 && <label>Course Map item<select name="mapItemId" defaultValue={course.currentMapItemId || ''}><option value="">Указать вручную</option>{course.mapItems.map((item) => <option key={item.id} value={item.id}>{item.position}. {item.stage}{item.lesson ? ` / ${item.lesson}` : ''} — {item.title}</option>)}</select></label>}
                  <label>Текущий этап<input name="stage" required defaultValue={course.currentStage || ''} placeholder="Старт ОГЭ, Module 2…"/></label>
                  <label>Текущий урок<input name="lesson" defaultValue={course.currentLesson || ''} placeholder="Урок 1 — необязательно"/></label>
                  <label className={styles.inlineCheckbox}><input type="checkbox" name="completedBeforeTracking" defaultChecked={course.completedBeforeTracking}/>Предыдущие этапы пройдены до начала журнала</label>
                  <label>Комментарий<textarea name="note" rows={2} defaultValue={course.positionNote || ''} placeholder="Необязательно"/></label>
                  <SaveStatusButton className="button primary" idleLabel="Сохранить позицию" pendingLabel="Сохраняю…"/>
                </form>
              </details>
            </section>
            <section className={styles.learningField}>
              <div className={styles.learningFieldHead}><div><span>Тема школы</span><strong>{course.module ? `${course.module}${course.topic ? ' · ' : ''}` : ''}{course.topic || 'Не указана'}</strong></div></div>
              <details className={styles.inlineEditor}><summary><Pencil size={14}/>{course.module || course.topic ? 'Изменить' : 'Указать тему'}</summary>
                <form action={updateStudentSchoolPosition} className={styles.inlineEditorForm}>
                  <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="enrollmentId" value={course.enrollmentId}/>
                  <label>Модуль / Unit<input name="module" defaultValue={course.module || ''} placeholder="Module 2 — необязательно"/></label>
                  <label>Текущая школьная тема<input name="topic" defaultValue={course.topic || ''} placeholder="Travelling"/></label>
                  <SaveStatusButton className="button primary" idleLabel="Сохранить тему" pendingLabel="Сохраняю…"/>
                </form>
              </details>
            </section>
          </div>{course.completedBeforeTracking&&<p className="muted small">Предыдущие этапы пройдены до начала журнала.</p>}
          <form action={updateStudentCurrentFocus} className={styles.focusForm}>
            <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="enrollmentId" value={course.enrollmentId}/>
            <label>Что важно сейчас<textarea name="note" rows={2} defaultValue={course.note || ''} placeholder="Короткая текущая задача: диагностика, контрольная, слабое говорение…"/></label>
            <SaveStatusButton idleLabel="Сохранить фокус"/>
          </form>
          {(() => {
            const run = historyBootstrap.runs.find((item) => item.enrollmentId === course.enrollmentId) || null;
            const confirmed = historyBootstrap.coverage.filter((item) => item.enrollmentId === course.enrollmentId && item.status === 'confirmed');
            const materialCount = new Set(confirmed.flatMap((item) => item.sourceRefs || []).map((ref) => ref.id)).size;
            return <section className={styles.historyBootstrap} id={`history-${course.enrollmentId}`}>
              <div className={styles.historyBootstrapHead}><div><ArchiveRestore size={17}/><div><strong>История до Мастерской</strong><span>{course.title}</span></div></div></div>
              {query.history === 'drive-error' && <div className="notice warning">Не удалось прочитать папку курса. История не изменена.</div>}
              {query.history === 'kie-unavailable' && <div className="notice warning">KIE/Claude временно не ответил. История не изменена. Попробуйте повторить позже.</div>}
              {query.history === 'ai-error' && <div className="notice warning">Не удалось проанализировать старые материалы. История не изменена.</div>}
              {query.history === 'confirmed' && <div className="notice success">История подтверждена преподавателем.</div>}
              {confirmed.length > 0 ? <>
                <p className="muted small">Найдено и подтверждено:</p>
                <ul className={styles.coverageList}>{confirmed.map((item) => <li key={item.id}><strong>{item.stage || item.topic || 'Исторический материал'}{item.lesson ? ` / ${item.lesson}` : ''}</strong><span>{item.summary}</span><small>{item.confidence.toUpperCase()} · источников: {(item.sourceRefs || []).length}</small></li>)}</ul>
                <p className="muted small">Использовано старых материалов: {materialCount}</p>
              </> : !run?.analysis && <p className="muted small">Старые материалы ещё не анализировались.</p>}

              {run?.status === 'draft' && run.analysis && <div className={styles.historyReview}>
                <h3>Черновик восстановленной истории</h3>
                <p>{run.analysis.summary}</p>
                {run.analysis.findings.length === 0 ? <div className="notice">Подходящих старых материалов не найдено. Можно указать текущую позицию вручную.</div> : <form action={confirmHistoryBootstrapAction} className={styles.historyReviewForm}>
                  <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="enrollmentId" value={course.enrollmentId}/><input type="hidden" name="runId" value={run.id}/>
                  {run.analysis.findings.map((finding, index) => <fieldset key={finding.key} className={styles.historyFinding}>
                    <label className={styles.findingToggle}><input type="checkbox" name={`include-${index}`} defaultChecked={finding.association === 'student_specific'}/><span>Включить в подтверждённую историю</span></label>
                    <p>{finding.coverageSummary}</p>
                    <small>{finding.confidence.toUpperCase()} · {finding.association === 'student_specific' ? 'есть связь с учеником' : 'общий материал — нужна проверка'}</small>
                    <div className={styles.findingFields}><label>Этап<input name={`stage-${index}`} defaultValue={finding.stage || ''}/></label><label>Урок<input name={`lesson-${index}`} defaultValue={finding.lesson || ''}/></label><label>Тема<input name={`topic-${index}`} defaultValue={finding.topic || ''}/></label><label>Комментарий<input name={`note-${index}`}/></label></div>
                    {(finding.sourceRefs || []).length > 0 && <ul className={styles.sourceRefs}>{finding.sourceRefs.map((ref) => <li key={ref.id}>{ref.url ? <a href={ref.url} target="_blank" rel="noreferrer">{ref.title}</a> : ref.title}<span>{ref.path}</span></li>)}</ul>}
                  </fieldset>)}
                  {run.analysis.questions.length > 0 && <div className={styles.historyQuestions}><h4>Нужно уточнить</h4>{run.analysis.questions.map((question) => <fieldset key={question.id}><legend>{question.text}</legend>{question.options.map((option) => <label key={option.value}><input type="radio" name={`question-${question.id}`} value={option.value}/>{option.label}</label>)}</fieldset>)}</div>}
                  <SaveStatusButton className="button primary" idleLabel="Подтвердить историю" pendingLabel="Сохраняю…"/>
                </form>}
                {run.analysis.currentPositionCandidate && <form action={setStudentCoursePosition} className={styles.positionCandidate}>
                  <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="enrollmentId" value={course.enrollmentId}/><input type="hidden" name="stage" value={run.analysis.currentPositionCandidate.stage}/><input type="hidden" name="lesson" value={run.analysis.currentPositionCandidate.lesson || ''}/><input type="hidden" name="note" value={course.positionNote || ''}/>{course.completedBeforeTracking && <input type="hidden" name="completedBeforeTracking" value="on"/>}
                  <span>Предложенная позиция: <strong>{run.analysis.currentPositionCandidate.stage}{run.analysis.currentPositionCandidate.lesson ? ` / ${run.analysis.currentPositionCandidate.lesson}` : ''}</strong></span><button className={`button ${styles.secondaryButton}`} type="submit">Использовать как фактическую позицию</button>
                </form>}
              </div>}

              <form action={generateHistoryBootstrapAction} className={styles.bootstrapAction}>
                <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="enrollmentId" value={course.enrollmentId}/>
                <SaveStatusButton className={`button ${styles.secondaryButton}`} idleLabel={confirmed.length ? 'Проверить историю ещё раз' : 'Восстановить историю'} pendingLabel="Анализирую…"/>
              </form>
            </section>;
          })()}
        </article>)}</div> : <p className="muted small">Курс пока не настроен.</p>}
      </section>

      <section className={`panel ${styles.wide}`} id="schedule">
        <div className="panel-title"><h2><Clock3 size={18}/>Текущее расписание</h2></div>
        {query.schedule === 'duplicate' && <div className="notice warning">Такой день и время уже есть у этого курса. Измените существующий слот.</div>}
        {query.schedule && query.schedule !== 'duplicate' && <div className="notice success">Расписание обновлено.</div>}
        {student.courses.length ? <div className={styles.scheduleCourses}>{student.courses.map((course) => {
          const slots = student.schedule.filter((item) => item.enrollmentId === course.enrollmentId);
          return <article className={styles.scheduleCourse} key={course.enrollmentId}>
            <div className={styles.scheduleCourseHead}><strong>{course.title}</strong><span>{slots.length} занятий в неделю</span></div>
            {slots.length ? <ul className={styles.schedule}>{slots.map((item) => <li key={item.id}>
              <div className={styles.slotSummary}><span>{weekdayNames[item.weekday - 1]} · {item.time} · {item.durationMinutes} мин</span></div>
              <details className={styles.slotEditor}><summary>Изменить</summary><form action={updateScheduleRule} className={styles.slotForm}>
                <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="scheduleId" value={item.id}/>
                <label>День<select name="weekday" defaultValue={item.weekday}>{weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label>Время<input name="time" type="time" required defaultValue={item.time}/></label>
                <label>Длительность<input name="durationMinutes" type="number" min="30" max="180" step="1" list="common-durations" required defaultValue={item.durationMinutes}/></label>
                <button className="button" type="submit">Сохранить</button>
              </form></details>
              <form action={deactivateScheduleRule}><input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="scheduleId" value={item.id}/><button className={styles.deleteSlot} type="submit"><Trash2 size={14}/>Удалить</button></form>
            </li>)}</ul> : <p className="muted small">Для этого курса занятий пока нет.</p>}
            <details className={styles.addSlot}><summary><Plus size={15}/>Добавить занятие</summary><form action={addScheduleRule} className={styles.slotForm}>
              <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="enrollmentId" value={course.enrollmentId}/>
              <label>День<select name="weekday" required defaultValue="1">{weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>Время<input name="time" type="time" required/></label>
              <label>Длительность<input name="durationMinutes" type="number" min="30" max="180" step="1" list="common-durations" required defaultValue="60"/></label>
              <button className="button primary" type="submit">Добавить</button>
            </form></details>
          </article>;
        })}</div> : <p className="muted small">Сначала настройте ученику курс.</p>}
        <datalist id="common-durations">{commonDurations.map((duration) => <option key={duration} value={duration}>{duration} мин</option>)}</datalist>
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
          <SaveStatusButton className="button primary" idleLabel="Сохранить наблюдение"/>
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

      <section className={`panel ${styles.queuePanel}`} id="learning-plan">
        <div className="panel-title"><h2><Target size={18}/>План обучения</h2><span className="count-badge">{student.learningPlan.length}</span></div>
        {query.queue === 'plan-added' && <div className="notice success">Цель добавлена в план.</div>}
        {query.queue === 'plan-duplicate' && <div className="notice warning">Такая активная цель уже есть для выбранного курса.</div>}
        {student.learningPlan.length ? <div className={styles.queueList}>{student.learningPlan.map((item) => <article key={item.id}><div><strong>{item.label}</strong><span>{item.course}</span></div><div className={styles.queueActions}><form action={completeLearningPlanItem}><input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="itemId" value={item.id}/><button title="Готово" type="submit"><CheckCircle2 size={17}/></button></form><form action={deactivateLearningPlanItem}><input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="itemId" value={item.id}/><button className={styles.removeQueueItem} title="Убрать ошибочно созданную цель" type="submit"><Trash2 size={16}/></button></form></div></article>)}</div> : <p className="muted small">Пока целей нет.</p>}
        {student.courses.length > 0 && <details className={styles.queueAdd}><summary><Plus size={15}/>Добавить цель</summary><form action={addLearningPlanItem} className={styles.queueAddForm}>
          <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="source" value="student-card"/>
          <label>Курс<select name="enrollmentId" required defaultValue={defaultEnrollmentId}>{student.courses.map((course) => <option key={course.enrollmentId} value={course.enrollmentId}>{course.title}</option>)}</select></label>
          <label>Цель<textarea name="label" rows={2} required placeholder="Например: отработать Past Simple questions"/></label>
          <SaveStatusButton className="button primary" idleLabel="Добавить в план" pendingLabel="Добавляю…"/>
        </form></details>}
      </section>

      <section className={`panel ${styles.queuePanel}`} id="recycling">
        <div className="panel-title"><h2><RefreshCw size={18}/>Повторение</h2><span className="count-badge">{student.recycling.length}</span></div>
        {query.queue === 'recycling-added' && <div className="notice success">Пункт добавлен в повторение.</div>}
        {query.queue === 'recycling-duplicate' && <div className="notice warning">Такой активный пункт уже есть для выбранного курса.</div>}
        {student.recycling.length ? <div className={styles.queueList}>{student.recycling.map((item) => <article key={item.id}><div><strong>{item.label}</strong><span>{item.course} · приоритет {item.priority}</span></div><div className={styles.queueActions}><form action={completeRecyclingItem}><input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="itemId" value={item.id}/><button title="Больше не нужно повторять" type="submit"><CheckCircle2 size={17}/></button></form><form action={deactivateRecyclingItem}><input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="itemId" value={item.id}/><button className={styles.removeQueueItem} title="Убрать ошибочно созданный пункт" type="submit"><Trash2 size={16}/></button></form></div></article>)}</div> : <p className="muted small">Активных пунктов повторения нет.</p>}
        {student.courses.length > 0 && <details className={styles.queueAdd}><summary><Plus size={15}/>Добавить на повторение</summary><form action={addRecyclingItem} className={styles.queueAddForm}>
          <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="source" value="student-card"/>
          <label>Курс<select name="enrollmentId" required defaultValue={defaultEnrollmentId}>{student.courses.map((course) => <option key={course.enrollmentId} value={course.enrollmentId}>{course.title}</option>)}</select></label>
          <label>Что повторить<textarea name="label" rows={2} required placeholder="Например: Present Perfect vs Past Simple"/></label>
          <label>Приоритет<select name="priority" defaultValue="2"><option value="1">1 — высокий</option><option value="2">2 — обычный</option><option value="3">3 — низкий</option></select></label>
          <SaveStatusButton className="button primary" idleLabel="Добавить" pendingLabel="Добавляю…"/>
        </form></details>}
      </section>

      <section className={`panel ${styles.wide} ${styles.advicePanel}`} id="recommendations">
        <div className="panel-title"><div><h2><BrainCircuit size={19}/>Рекомендации по обучению</h2><p className="muted small">AI учитывает контекст ученика, твои наблюдения, текущие курсы, прошлые уроки, план и очередь повторения.</p></div></div>
        {query.advice === 'ready' && <div className="notice success">Новый анализ ученика готов.</div>}
        {query.advice === 'error' && <div className="notice warning">Не удалось получить рекомендации. Данные ученика сохранены — попробуй анализ ещё раз позже.</div>}
        <form action={generateStudentAdviceAction} className={styles.adviceAction}><input type="hidden" name="studentId" value={studentId}/><AdviceSubmitButton/></form>

        {latestAdviceRecord && latestAdvice ? <div className={styles.adviceResult}>
          <div className={styles.adviceMeta}><span>Последний анализ: {String(latestAdviceRecord.createdAt || '').replace(' ', ' · ') || 'дата не указана'}</span>{latestCredits != null && <span>{latestCredits.toFixed(2)} credits</span>}</div>
          <p className={styles.adviceSummary}>{latestAdvice.summary}</p>
          <div className={styles.adviceColumns}>
            <div><h3>Приоритеты</h3><ul>{latestAdvice.priorities.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3>Ближайший урок</h3><ul>{latestAdvice.nextLesson.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3>Наблюдать</h3><ul>{latestAdvice.watch.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>

          {student.courses.length > 0 && (latestAdvice.planItems.length > 0 || latestAdvice.recycleItems.length > 0) && <div className={styles.suggestionGrid}>
            <div><h3>Добавить в план обучения</h3>{latestAdvice.planItems.map((item) => <form action={addLearningPlanItem} className={styles.suggestionForm} key={item}>
              <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="recommendationId" value={latestAdviceRecord.id}/><input type="hidden" name="label" value={item}/>
              <span>{item}</span><select name="enrollmentId" defaultValue={defaultEnrollmentId}>{student.courses.map((course) => <option key={course.enrollmentId} value={course.enrollmentId}>{course.title}</option>)}</select><SaveStatusButton idleLabel="В план" pendingLabel="Добавляю…"/>
            </form>)}</div>
            <div><h3>Добавить в повторение</h3>{latestAdvice.recycleItems.map((item) => <form action={addRecyclingItem} className={styles.suggestionForm} key={item}>
              <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="label" value={item}/>
              <span>{item}</span><select name="enrollmentId" defaultValue={defaultEnrollmentId}>{student.courses.map((course) => <option key={course.enrollmentId} value={course.enrollmentId}>{course.title}</option>)}</select><SaveStatusButton idleLabel="Повторять" pendingLabel="Добавляю…"/>
            </form>)}</div>
          </div>}
          {student.recommendations.length > 1 && <p className="muted small">В истории сохранено ещё {student.recommendations.length - 1} прошлых анализа.</p>}
        </div> : latestAdviceRecord ? <div className="notice warning">Анализ сохранён, но его формат не удалось прочитать. Повторно запускать AI не нужно — запись сохранена, карточка продолжает работать.</div> : <div className={styles.emptyAdvice}><BrainCircuit size={28}/><div><strong>Анализа пока нет</strong><p>Сначала заполни контекст и несколько наблюдений — тогда рекомендации будут намного полезнее.</p></div></div>}
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
