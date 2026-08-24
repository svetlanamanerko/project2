import { Bot, Database, HardDrive, KeyRound } from 'lucide-react';
import { authConfigured } from '@/lib/auth';
import { dbConfigured } from '@/lib/db';
import { KieCheckButton } from './KieCheckButton';

export default function SettingsPage() {
  const kieConfigured = Boolean(process.env.KIE_API_KEY?.trim());

  return <>
    <header className="page-head"><div><p className="eyebrow">Техническое состояние</p><h1>Настройки</h1><p className="muted">Секреты не показываются в интерфейсе и не лежат в GitHub.</p></div></header>
    <section className="panel"><div className="settings-list">
      <div className="setting-row"><div className="course-icon"><KeyRound size={20}/></div><div><strong>Авторизация</strong><span>ADMIN_PASSWORD + SESSION_SECRET</span></div><span className={authConfigured()?'status status-prepared':'status status-draft'}>{authConfigured()?'Готово':'Нужно настроить'}</span></div>
      <div className="setting-row"><div className="course-icon"><Database size={20}/></div><div><strong>PostgreSQL</strong><span>База учеников, курсов и уроков</span></div><span className={dbConfigured()?'status status-prepared':'status status-draft'}>{dbConfigured()?'Готово':'Нужно настроить'}</span></div>
      <div className="setting-row"><div className="course-icon"><Bot size={20}/></div><div><strong>KIE AI</strong><span>{kieConfigured ? 'KIE_API_KEY найден · можно проверить соединение' : 'Добавьте KIE_API_KEY в секреты Amvera'}</span></div>{kieConfigured ? <KieCheckButton/> : <span className="status status-draft">Нужно настроить</span>}</div>
      <div className="setting-row"><div className="course-icon"><HardDrive size={20}/></div><div><strong>Google Drive</strong><span>Подключим после первого AI-теста</span></div><span className="status status-draft">Следующий этап</span></div>
    </div></section>
  </>;
}
