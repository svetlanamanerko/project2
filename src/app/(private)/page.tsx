import { CalendarDays, CheckCircle2, ClipboardList, LifeBuoy, RefreshCw, Sparkles } from 'lucide-react';
import { dbConfigured } from '@/lib/db';
import { getRecycling, getTodayLessons, getUpcomingTasks } from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import { EmptyState } from '@/components/EmptyState';
import { createTodayDrafts } from './actions';
import { LessonPlanButton } from './LessonPlanButton';
import './hero.css';
import './hero-sprig-fix.css';
import './ai-plan.css';

export default async function TodayPage() {
  const [lessons, recycling, tasks] = await Promise.all([getTodayLessons(), getRecycling(), getUpcomingTasks()]);
  const ready = lessons.filter((x) => x.status === 'prepared').length;
  const missing = lessons.filter((x) => x.status === 'missing' || x.status === 'draft').length;
  const hasDb = dbConfigured();

  return <>
    <header className="hero hero-rich">
      <div className="hero-copy">
        <p className="eyebrow">Рабочий день без хаоса</p>
        <h1>Сегодня в мастерской</h1>
        <p className="muted">Всё, что нужно подготовить, повторить и не забыть.</p>
        <div className="hero-chips">
          <span><CalendarDays size={14}/><strong>{lessons.length}</strong> уроков сегодня</span>
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
    {!hasDb && <div className="notice warning">PostgreSQL пока не подключена. Интерфейс уже работает; после подключения базы здесь появятся реальные ученики и расписание.</div>}
    <section className="summary-strip">
      <div><CalendarDays/><span><strong>{lessons.length}</strong> уроков сегодня</span></div>
      <div><CheckCircle2/><span><strong>{ready}</strong> подготовлено</span></div>
      <div><ClipboardList/><span><strong>{missing}</strong> требуют внимания</span></div>
      <form action={createTodayDrafts}><button className="button primary" type="submit" disabled={!hasDb}><Sparkles size={18}/>Подготовить недостающие</button></form>
    </section>
    <div className="dashboard-grid">
      <section className="panel lessons-panel"><div className="panel-title"><h2>Уроки на сегодня</h2><span className="soft-badge">по расписанию</span></div>
        {lessons.length === 0 ? <EmptyState title="На сегодня пока пусто" text="Добавьте учеников, курсы и расписание — список соберётся автоматически."/> : <div className="lesson-list">{lessons.map((lesson) => <div className="lesson-entry" key={lesson.scheduleId}><article className="lesson-row"><time>{lesson.time}</time><div className="course-icon"><ClipboardList size={20}/></div><div className="lesson-main"><strong>{lesson.course}</strong><span>{lesson.student}{lesson.note ? ` · ${lesson.note}` : ''}</span></div><StatusPill status={lesson.status}/></article><LessonPlanButton enrollmentId={lesson.enrollmentId} initialPlan={lesson.summary}/></div>)}</div>}
      </section>
      <aside className="right-stack">
        <section className="panel"><div className="panel-title"><h2><RefreshCw size={18}/>Очередь повторения</h2><span className="count-badge">{recycling.length}</span></div>{recycling.length ? <ul className="pretty-list">{recycling.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted small">Пока нет активных пунктов.</p>}</section>
        <section className="panel"><div className="panel-title"><h2><LifeBuoy size={18}/>Ближайшие задачи</h2><span className="count-badge peach">{tasks.length}</span></div>{tasks.length ? <ul className="pretty-list tasks">{tasks.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted small">Контрольные и важные даты появятся здесь.</p>}</section>
      </aside>
    </div>
  </>;
}
