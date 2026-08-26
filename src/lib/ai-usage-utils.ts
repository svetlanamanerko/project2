import type { AiRoute, AiUsageRecorder } from './ai-routing';

export type AiUsageStatus = 'success' | 'error';

export type AiUsageRecord = {
  route: AiRoute;
  model: string;
  purpose: string;
  creditsConsumed: number | null;
  studentId: string | null;
  enrollmentId: string | null;
  status: AiUsageStatus;
  errorMessage: string | null;
};

export type { AiUsageRecorder };

export function normalizeKieCredits(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const credits = Number(value);
  return Number.isFinite(credits) && credits >= 0 ? credits : null;
}

export function parseKieBalance(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const object = payload as { code?: unknown; data?: unknown };
  if (Number(object.code) !== 200) return null;
  return normalizeKieCredits(object.data);
}

export async function fetchKieBalance(key: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher('https://api.kie.ai/api/v1/chat/credit', {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(6_000),
  });
  const payload = await response.json().catch(() => null);
  const balance = response.ok ? parseKieBalance(payload) : null;
  if (balance === null) throw new Error(`KIE balance unavailable (HTTP ${response.status})`);
  return balance;
}

export function sumRecordedCredits(records: Array<{ creditsConsumed: number | null }>) {
  return records.reduce((total, record) => total + (record.creditsConsumed ?? 0), 0);
}

export function aggregateRecordedCredits(
  records: Array<{ createdAt: Date; creditsConsumed: number | null }>,
  now: Date,
) {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    today: sumRecordedCredits(records.filter((record) => record.createdAt >= dayStart)),
    month: sumRecordedCredits(records.filter((record) => record.createdAt >= monthStart)),
  };
}
