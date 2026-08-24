import { Plus, UserRound } from 'lucide-react';
import { dbConfigured } from '@/lib/db';
import { getStudents } from '@/lib/data';
import { EmptyState } from '@/components/EmptyState';
import { addStudent } from '../actions';

export default async function StudentsPage() {
  const students = await getStudents();
  const hasDb = dbConfigured();
  return <>
    <header className="page-head"><div><p className="eyebrow">Личные маршруты</p><h1>Ученики</h1><p className="muted">Каждый ученик хранит свой прогресс, школьную позицию и очередь повторения.</p></div></header>
    <div className="two-col">
      <section className="panel"><div className="panel-title"><h2>Активные ученики</h2><span className="count-badge">{students.length}</span></div>
        {students.length ? <div className="card-list">{students.map((s) => <article className="person-card" key={s.id}><div className="avatar soft"><UserRound size={20}/></div><div><strong>{s.displayName}</strong><span>{s.schoolGrade ? `${s.schoolGrade} класс` : 'класс не указан'}</span></div></article>)}</div> : <EmptyState title="Пока никого нет" text="Добавьте первого ученика — полный список заранее знать не нужно."/>}
      </section>
      <section className="panel form-panel"><div className="panel-title"><h2><Plus size={18}/>Добавить ученика</h2></div>
        {!hasDb ? <div className="notice warning">Сначала подключим PostgreSQL.</div> : <form action={addStudent} className="stack-form"><label>Имя<input name="name" required placeholder="Например, Артём"/></label><label>Класс<input name="grade" type="number" min="1" max="11" placeholder="9"/></label><button className="button primary" type="submit">Добавить ученика</button></form>}
      </section>
    </div>
  </>;
}
