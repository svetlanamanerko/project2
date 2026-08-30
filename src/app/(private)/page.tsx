import { CalendarDays, CheckCircle2, ClipboardList, LifeBuoy, RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { dbConfigured } from '@/lib/db';
import { getAppDateString, getLessonsForDate, getRecycling, getUpcomingTasks } from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import { EmptyState } from '@/components/EmptyState';
import { createTodayDrafts, createTomorrowDrafts } from './actions';
import { DashboardCalendar } from './DashboardCalendar';
import { LessonPlanButton } from './LessonPlanButton';
import './hero.css';
import './hero-sprig-fix.css';
import './ai-plan.css';
import './day-switch.css';

function validDateParam(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatDateLabel(value: string, short = false) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', short
    ? { day: 'numeric', month: 'long', timeZone: 'UTC' }
    : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export default async function TodayPage({ searchParams }: PageProps<'/'>) {
  const params = await searchParams;
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const legacyTomorrow = params.day === 'tomorrow';
  const today = getAppDateString();
  const tomorrow = getAppDateString(1);
  const targetDate = validDateParam(rawDate) ? rawDate : (legacyTomorrow ? tomorrow : today);
  const isToday = targetDate === today;
  const isTomorrow = targetDate === tomorrow;
  const selectedDateLabel = formatDateLabel(targetDate);
  const panelDateLabel = isToday ? 'сегодня' : isTomorrow ? 'завтра' : formatDateLabel(targetDate, true);
  const [lessons, recycling, tasks] = await Promise.all([getLessonsForDate(targetDate), getRecycling(), getUpcomingTasks()]);
  const ready = lessons.filter((x) => x.status === 'prepared').length;
  const missing = lessons.filter((x) => x.status === 'missing' || x.status === 'draft').length;
  const hasDb = dbConfigured();

  return <>
    <header className="hero hero-rich">
      <div className="hero-copy">
        <p className="eyebrow">Рабочий день без хаоса</p>
        <h1>{isToday ? 'Сегодня в мастерской' : isTomorrow ? 'Завтра в мастерской' : 'План на выбранный день'}</h1>
        <p className="muted"><span style={{ textTransform: 'capitalize' }}>{selectedDateLabel}</span> · Всё, что нужно подготовить, повторить и не забыть.</p>
        <div className="hero-chips">
          <span><CalendarDays size={14}/><strong>{lessons.length}</strong> уроков</span>
          <span><CheckCircle2 size={14}/><strong>{ready}</strong> уже готовы</span>
          <span><RefreshCw size={14}/><strong>{recycling.length}</strong> в повторении</span>
        </div>
      </div>
      <div className="hero-scene" aria-hidden="true">
        <div className="hero-glow glow-one"></div>
        <div className="hero-glow glow-two"></div>
        <div className="hero-spark spark-one">✦</div>
        <div className="hero-spark spark-two">✧</div>
        <div className="hero-spark spark-three">✦</div>
        <div className="hero-mini-card">
          <span className="mini-card-icon"><Sparkles size={15}/></span>
          <span><b>План дня</b><small>всё под контролем</small></span>
        </div>
        <div className="book-stack">
          <span className="book book-lilac"></span>
          <span className="book book-pink"></span>
          <span className="book book-mint"></span>
        </div>
        <div className="hero-notebook">
          <span className="notebook-ring r1"></span><span className="notebook-ring r2"></span><span className="notebook-ring r3"></span>
          <span className="notebook-line l1"></span><span className="notebook-line l2"></span><span className="notebook-line l3"></span>
          <span className="notebook-check">✓</span>
        </div>
        <div className="hero-cup"><span className="cup-heart">♥</span><span className="cup-handle"></span><span className="steam s1"></span><span className="steam s2"></span></div>
        <div className="hero-sprig"><i></i><i></i><i></i><i></i><i></i></div>
        <div className="hero-desk-shadow"></div>
      </div>
    </header>

    <nav className="day-switch" aria-label="Быстрый выбор дня">
      <Link className={isToday ? 'active' : ''} href={`/?date=${today}`}>Сегодня</Link>
      <Link className={isTomorrow ? 'active' : ''} href={`/?date=${tomorrow}`}>Завтра</Link>
    </nav>

    <DashboardCalendar selectedDate={targetDate}/>

    {!hasDb && <div className="notice warning">PostgreSQL пока не подключена. Интерфейс уже работает; после подключения базы здесь появятся реальные ученики и расписание.</div>}
    <section className="summary-strip">
      <div><CalendarDays/><span><strong>{lessons.length}</strong> уроков на выбранную дату</span></div>
      <div><CheckCircle2/><span><strong>{ready}</strong> подготовлено</span></div>
      <div><ClipboardList/><span><strong>{missing}</strong> требуют внимания</span></div>
      {isToday || isTomorrow
        ? <form action={isTomorrow ? createTomorrowDrafts : createTodayDrafts}><button className="button primary" type="submit" disabled={!hasDb}><Sparkles size={18}/>{isTomorrow ? 'Подготовить недостающие на завтра' : 'Подготовить недостающие'}</button></form>
        : <span className="muted small">На будущую дату можно готовить любой урок прямо из списка ниже.</span>}
    </section>
    <div className="dashboard-grid">
      <section className="panel lessons-panel"><div className="panel-title"><h2>Уроки на {panelDateLabel}</h2><span className="soft-badge">по расписанию</span></div>
        {lessons.length === 0 ? <EmptyState title="На эту дату уроков нет" text="Выбери другой день в календаре — расписание подставится автоматически."/> : <div className="lesson-list">{lessons.map((lesson) => <div className="lesson-entry" key={lesson.scheduleId}><article className="lesson-row"><time>{lesson.time}<small> · {lesson.durationMinutes} мин</small></time><div className="course-icon"><ClipboardList size={20}/></div><div className="lesson-main"><strong>{lesson.course}</strong><span>{lesson.student}{lesson.note ? ` · ${lesson.note}` : ''}</span></div><StatusPill status={lesson.status}/></article><LessonPlanButton enrollmentId={lesson.enrollmentId} lessonId={lesson.lessonId} initialPlan={lesson.summary} initialPackage={lesson.package} scheduledTime={lesson.time} scheduledDate={targetDate}/></div>)}</div>}
      </section>
      <aside className="right-stack">
        <section className="panel"><div className="panel-title"><h2><RefreshCw size={18}/>Очередь повторения</h2><span className="count-badge">{recycling.length}</span></div>{recycling.length ? <ul className="pretty-list">{recycling.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted small">Пока нет активных пунктов.</p>}</section>
        <section className="panel"><div className="panel-title"><h2><LifeBuoy size={18}/>Ближайшие задачи</h2><span className="count-badge peach">{tasks.length}</span></div>{tasks.length ? <ul className="pretty-list tasks">{tasks.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted small">Контрольные и важные даты появятся здесь.</p>}</section>
      </aside>
    </div>
  </>;
}
