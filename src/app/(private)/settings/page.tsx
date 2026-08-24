import { Database, KeyRound, Server } from 'lucide-react';
import { authConfigured } from '@/lib/auth';
import { dbConfigured } from '@/lib/db';

export default function SettingsPage() {
  const checks = [
    { icon: KeyRound, label: 'Авторизация', ready: authConfigured(), detail: 'ADMIN_PASSWORD + SESSION_SECRET' },
    { icon: Database, label: 'PostgreSQL', ready: dbConfigured(), detail: 'DATABASE_URL' },
    { icon: Server, label: 'AI и Google Drive', ready: false, detail: 'подключаем после ядра' },
  ];
  return <><header className="page-head"><div><p className="eyebrow">Техническое состояние</p><h1>Настройки</h1><p className="muted">Секреты не показываются в интерфейсе и не лежат в GitHub.</p></div></header><section className="panel"><div className="settings-list">{checks.map(({icon:Icon,label,ready,detail})=><div className="setting-row" key={label}><div className="course-icon"><Icon size={20}/></div><div><strong>{label}</strong><span>{detail}</span></div><span className={ready?'status status-prepared':'status status-draft'}>{ready?'Готово':'Нужно настроить'}</span></div>)}</div></section></>;
}
