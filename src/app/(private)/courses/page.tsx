import { BookMarked, Plus } from 'lucide-react';
import Link from 'next/link';
import { dbConfigured } from '@/lib/db';
import { getCourses } from '@/lib/data';
import { EmptyState } from '@/components/EmptyState';
import { addCourse } from '../actions';
import './courses.css';

type CoursesPageProps = {
  searchParams?: Promise<{ error?: string; deleted?: string }>;
};

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const courses = await getCourses();
  const hasDb = dbConfigured();
  const params = searchParams ? await searchParams : {};
  return <>
    <header className="page-head"><div><p className="eyebrow">Школьный УМК как каркас</p><h1>Курсы</h1><p className="muted">Учебник загружается один раз и может использоваться несколькими учениками.</p></div></header>
    {params.error === 'linked' && <div className="notice warning">Этот курс уже связан с учеником, поэтому я его не удаляю. Сначала отвяжем ученика или просто отредактируйте курс.</div>}
    {params.deleted === '1' && <div className="notice success">Курс удалён.</div>}
    <div className="two-col"><section className="panel"><div className="panel-title"><h2>Библиотека курсов</h2><span className="count-badge">{courses.length}</span></div>{courses.length ? <div className="card-list">{courses.map((c) => <Link className="course-card-link" href={`/courses/${c.id}`} key={c.id}><article className="course-card course-card-manage"><div className="course-icon large"><BookMarked/></div><div><strong>{c.title}</strong><span>{c.grade ? `${c.grade} класс` : 'класс не указан'}</span></div><span className="soft-badge">Открыть</span></article></Link>)}</div> : <EmptyState title="Курсы добавляются постепенно" text="Не нужно знать всю базу учебников заранее."/>}</section>
    <section className="panel form-panel"><div className="panel-title"><h2><Plus size={18}/>Добавить курс</h2></div>{!hasDb ? <div className="notice warning">Сначала подключим PostgreSQL.</div> : <form action={addCourse} className="stack-form"><label>Название<input name="title" required placeholder="Spotlight 7"/></label><label>Класс<input name="grade" type="number" min="1" max="11" placeholder="7"/></label><button className="button primary" type="submit">Добавить курс</button></form>}</section></div>
  </>;
}
