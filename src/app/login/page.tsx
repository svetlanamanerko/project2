import { redirect } from 'next/navigation';
import { BookOpen, LockKeyhole, Sparkles } from 'lucide-react';
import { authConfigured, hasSession } from '@/lib/auth';
import { loginAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await hasSession()) redirect('/');
  const params = await searchParams;
  const configured = authConfigured();
  const message = params.error === 'password'
    ? 'Пароль не подошёл. Попробуйте ещё раз.'
    : params.error === 'config'
      ? 'Сначала задайте ADMIN_PASSWORD и SESSION_SECRET в переменных окружения.'
      : '';

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark"><BookOpen size={30} /><Sparkles size={18} /></div>
        <p className="eyebrow">Личный рабочий центр</p>
        <h1>Мастерская уроков</h1>
        <p className="muted">Подготовка, память курсов, повторение и срочная помощь — в одном месте.</p>
        {!configured && <div className="notice warning">Авторизация ещё не настроена на сервере.</div>}
        {message && <div className="notice danger">{message}</div>}
        <form action={loginAction} className="login-form">
          <label htmlFor="password">Пароль</label>
          <div className="input-with-icon"><LockKeyhole size={18} /><input id="password" name="password" type="password" autoComplete="current-password" required disabled={!configured} /></div>
          <button className="button primary" type="submit" disabled={!configured}>Войти в мастерскую</button>
        </form>
      </section>
    </main>
  );
}
