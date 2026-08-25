import { NextResponse } from 'next/server';
import { authConfigured } from '@/lib/auth';
import { dbConfigured } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const appVersion = process.env.APP_VERSION || process.env.GIT_COMMIT_SHA || 'lesson-player-v3-normalized-json';
  return NextResponse.json({ ok: true, app: 'Мастерская уроков', appVersion, authConfigured: authConfigured(), databaseConfigured: dbConfigured() });
}
