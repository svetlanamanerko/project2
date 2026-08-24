import { NextResponse } from 'next/server';
import { authConfigured } from '@/lib/auth';
import { dbConfigured } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ ok: true, app: 'Мастерская уроков', authConfigured: authConfigured(), databaseConfigured: dbConfigured() });
}
