import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE_NAME = 'mu_session';
const TTL_SECONDS = 60 * 60 * 24 * 30;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function secret() {
  return process.env.SESSION_SECRET?.trim() || '';
}

export function authConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD?.trim() && secret());
}

export function passwordMatches(input: string) {
  const expected = process.env.ADMIN_PASSWORD || '';
  return Boolean(expected) && safeEqual(input, expected);
}

function signature(expires: string) {
  return createHmac('sha256', secret()).update(expires).digest('hex');
}

export async function createSession() {
  if (!authConfigured()) throw new Error('Авторизация не настроена');
  const expires = String(Math.floor(Date.now() / 1000) + TTL_SECONDS);
  const token = `${expires}.${signature(expires)}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export async function hasSession() {
  if (process.env.AUTH_BYPASS === 'true') return true;
  if (!authConfigured()) return false;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig) return false;
  if (Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, signature(expires));
}

export async function requireSession() {
  if (!(await hasSession())) redirect('/login');
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}
