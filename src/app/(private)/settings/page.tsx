import { Bot, Database, HardDrive, KeyRound } from 'lucide-react';
import { authConfigured } from '@/lib/auth';
import { dbConfigured } from '@/lib/db';
import { getGoogleDriveStatus } from '@/lib/google-drive';
import { KieCheckButton } from './KieCheckButton';
import { searchOgeTasks } from '@/lib/oge-navigator-client';
import { getAiUsageSummary, getKieBalanceStatus } from '@/lib/ai-usage';
import styles from './settings.module.css';

const purposeLabels: Record<string, string> = {
  'connection-check': 'Проверка соединения',
  'communicative-warm-up': 'Communicative warm-up',
  'interactive-repair': 'Интерактивная версия',
  'lesson-plan': 'План урока',
  'lesson-package': 'Пакет урока',
  'student-advice': 'Анализ маршрута ученика',
};

function credits(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(value);
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const [drive, params, navigator, balance, usage] = await Promise.all([
    getGoogleDriveStatus(), searchParams, searchOgeTasks({ pageSize: 1 }), getKieBalanceStatus(), getAiUsageSummary(),
  ]);
  const kieConfigured = Boolean(process.env.KIE_API_KEY?.trim());

  const driveNotice = params.drive === 'connected'
    ? 'Google Drive подключён. Папка школьных курсов найдена, совпадающие курсы привязаны автоматически.'
    : params.drive === 'connected-no-root'
      ? 'Google Drive подключён, но папка «01 SCHOOL COURSES» не найдена. Подключение сохранилось.'
      : params.drive === 'missing-config'
        ? 'Сначала добавьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в секреты Amvera.'
        : params.drive === 'cancelled'
          ? 'Подключение Google Drive отменено.'
          : params.drive === 'invalid-state'
            ? 'Сессия подключения Google Drive устарела. Нажмите «Подключить» ещё раз.'
            : params.drive === 'no-refresh-token'
              ? 'Google не выдал постоянный токен. Повторите подключение и подтвердите доступ.'
              : params.drive === 'error'
                ? 'Не удалось подключить Google Drive. Проверьте OAuth-настройки Google Cloud.'
                : '';

  return <>
    <header className="page-head"><div><p className="eyebrow">Техническое состояние</p><h1>Настройки</h1><p className="muted">Секреты не показываются в интерфейсе и не лежат в GitHub.</p></div></header>
    {driveNotice && <div className={params.drive?.startsWith('connected') ? 'notice success' : 'notice warning'}>{driveNotice}</div>}
    <section className="panel"><div className="settings-list">
      <div className="setting-row"><div className="course-icon"><KeyRound size={20}/></div><div><strong>Авторизация</strong><span>ADMIN_PASSWORD + SESSION_SECRET</span></div><span className={authConfigured()?'status status-prepared':'status status-draft'}>{authConfigured()?'Готово':'Нужно настроить'}</span></div>
      <div className="setting-row"><div className="course-icon"><Database size={20}/></div><div><strong>PostgreSQL</strong><span>База учеников, курсов и уроков</span></div><span className={dbConfigured()?'status status-prepared':'status status-draft'}>{dbConfigured()?'Готово':'Нужно настроить'}</span></div>
      <div className={styles.aiSetting}>
        <div className={styles.aiHeader}><div className="course-icon"><Bot size={20}/></div><div><strong>KIE AI</strong><span>{kieConfigured ? 'Расход учитывается по фактическим credits_consumed KIE' : 'Добавьте KIE_API_KEY в секреты Amvera'}</span></div>{kieConfigured ? <KieCheckButton/> : <span className="status status-draft">Нужно настроить</span>}</div>
        {kieConfigured && <div className={styles.aiUsage}>
          <div className={styles.balance}><span>Баланс KIE</span><strong>{balance.available && balance.balance !== null ? `${credits(balance.balance)} credits` : 'Временно недоступен'}</strong></div>
          <div className={styles.totals}><div><span>Сегодня</span><strong>{usage.available ? `${credits(usage.today)} credits` : '—'}</strong></div><div><span>Этот месяц</span><strong>{usage.available ? `${credits(usage.month)} credits` : '—'}</strong></div></div>
          <div className={styles.lastCall}><span>Последний AI-вызов</span>{usage.last ? <><strong>{usage.last.route.toUpperCase()} · {usage.last.model}</strong><p>{purposeLabels[usage.last.purpose] || usage.last.purpose}</p><small>{usage.last.status === 'error' ? usage.last.creditsConsumed === null ? 'Ошибка · credits не получены' : `Ошибка · ${credits(usage.last.creditsConsumed)} credits` : usage.last.creditsConsumed === null ? 'KIE не вернул credits_consumed' : `${credits(usage.last.creditsConsumed)} credits`} · {usage.last.createdAt}</small></> : <p>Статистика начнёт собираться с этого момента.</p>}</div>
        </div>}
      </div>
      <div className="setting-row">
        <div className="course-icon"><HardDrive size={20}/></div>
        <div>
          <strong>Google Drive</strong>
          <span>{drive.connected
            ? `${drive.accountEmail || 'Google аккаунт'} · ${drive.rootFolderName || 'корневая папка не найдена'} · привязано курсов: ${drive.linkedCourses}`
            : drive.configured
              ? 'OAuth настроен · осталось разрешить доступ к Drive'
              : 'Нужны GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET'}</span>
        </div>
        {drive.connected
          ? <div style={{display:'flex',alignItems:'center',gap:10,marginLeft:'auto'}}><span className="status status-prepared">Подключено</span><a className="button" href="/api/google/connect">Переподключить</a></div>
          : drive.configured
            ? <a className="button primary" style={{marginLeft:'auto'}} href="/api/google/connect">Подключить Google Drive</a>
            : <span className="status status-draft">Нужно настроить</span>}
      </div>
      <div className="setting-row"><div className="course-icon"><Bot size={20}/></div><div><strong>OGE FIPI Navigator</strong><span>{!navigator.configured?'Добавьте OGE_NAVIGATOR_BASE_URL':navigator.available?'Read-only каталог заданий доступен':'Navigator временно недоступен; остальные источники продолжают работать'}</span></div><span className={`status ${navigator.available?'status-prepared':'status-draft'}`}>{!navigator.configured?'Не настроен':navigator.available?'Подключён':'Ошибка подключения'}</span></div>
    </div></section>
  </>;
}
