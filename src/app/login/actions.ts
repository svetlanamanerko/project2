'use server';

import { redirect } from 'next/navigation';
import { authConfigured, createSession, destroySession, passwordMatches } from '@/lib/auth';

export async function loginAction(formData: FormData) {
  if (!authConfigured()) redirect('/login?error=config');
  const password = String(formData.get('password') || '');
  if (!passwordMatches(password)) redirect('/login?error=password');
  await createSession();
  redirect('/');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
