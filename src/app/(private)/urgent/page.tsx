import { LifeBuoy, Paperclip, Sparkles } from 'lucide-react';
import { dbConfigured } from '@/lib/db';
import { getEnrollments } from '@/lib/data';
import { createUrgentRequest } from '../actions';

export default async function UrgentPage() {
  const enrollments = await getEnrollments();
  const hasDb = dbConfigured();
  return <>
    <header className="page-head urgent-head"><div><p className="eyebrow">Школьный пожар — без сломанного курса</p><h1>Срочная помощь</h1><p className="muted">Домашнее задание ночью, непонятная тема утром — фиксируем отдельно и основной маршрут не двигаем.</p></div><div className="round-icon"><LifeBuoy/></div></header>
    <div className="two-col urgent-grid"><section className="panel form-panel"><div className="step"><span>1</span><div><strong>Выберите ученика</strong><p>Система возьмёт его курс и текущий контекст.</p></div></div>
      {!hasDb ? <div className="notice warning">Сначала подключим PostgreSQL.</div> : <form action={createUrgentRequest} className="stack-form"><label>Ученик и курс<select name="enrollmentId" required defaultValue=""><option value="" disabled>Выберите ученика</option>{enrollments.map((e)=><option key={e.id} value={e.id}>{e.student} — {e.course}</option>)}</select></label><label>Что произошло<textarea name="description" rows={5} required placeholder="Например: не понял Present Perfect и слова из школьного ДЗ"/></label><div className="drop-placeholder"><Paperclip size={20}/><span>Фото и файлы подключим вместе с Google Drive на следующем этапе</span></div><button className="button primary" type="submit"><Sparkles size={18}/>Создать срочный запрос</button></form>}
    </section><aside className="panel soft-panel"><h2>Что система сохранит</h2><ul className="check-list"><li>отдельный срочный урок;</li><li>тему и проблему;</li><li>выявленные пробелы;</li><li>пункты для будущего повторения;</li><li>связь с готовыми материалами.</li></ul><div className="notice success">Основной плановый курс не сдвигается.</div></aside></div>
  </>;
}
