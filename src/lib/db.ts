import 'server-only';
import postgres, { type Sql } from 'postgres';

const globalForDb = globalThis as unknown as { lessonDb?: Sql };

function connectionUrl() {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;

  const host = process.env.DB_HOST?.trim();
  const name = process.env.DB_NAME?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD ?? '';
  const port = process.env.DB_PORT?.trim() || '5432';

  if (!host || !name || !user || !password) return '';

  const url = new URL('postgres://localhost');
  url.hostname = host;
  url.port = port;
  url.username = user;
  url.password = password;
  url.pathname = `/${name}`;
  url.searchParams.set('sslmode', process.env.DB_SSLMODE?.trim() || 'disable');
  return url.toString();
}

export function dbConfigured() {
  return Boolean(connectionUrl());
}

export function db() {
  const url = connectionUrl();
  if (!url) throw new Error('PostgreSQL не настроен');

  if (!globalForDb.lessonDb) {
    globalForDb.lessonDb = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: url.includes('sslmode=disable') ? false : 'require',
    });
  }
  return globalForDb.lessonDb;
}
