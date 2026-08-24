import 'server-only';
import postgres, { type Sql } from 'postgres';

const globalForDb = globalThis as unknown as { lessonDb?: Sql };

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function db() {
  if (!dbConfigured()) throw new Error('DATABASE_URL не задан');
  if (!globalForDb.lessonDb) {
    globalForDb.lessonDb = postgres(process.env.DATABASE_URL!, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : 'require',
    });
  }
  return globalForDb.lessonDb;
}
