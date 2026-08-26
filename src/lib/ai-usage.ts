import 'server-only';

import { randomUUID } from 'node:crypto';
import { db, dbConfigured } from '@/lib/db';
import { fetchKieBalance, type AiUsageRecord } from '@/lib/ai-usage-utils';

export async function recordAiUsage(record: AiUsageRecord) {
  if (!dbConfigured()) return;
  await db()`
    INSERT INTO ai_usage(
      id, route, model, purpose, credits_consumed, student_id, enrollment_id, status, error_message
    ) VALUES(
      ${randomUUID()}, ${record.route}, ${record.model}, ${record.purpose}, ${record.creditsConsumed},
      ${record.studentId}, ${record.enrollmentId}, ${record.status}, ${record.errorMessage}
    )
  `;
}

export async function getKieBalanceStatus() {
  const key = process.env.KIE_API_KEY?.trim();
  if (!key) return { configured: false, available: false, balance: null, error: null };
  try {
    const balance = await fetchKieBalance(key);
    return { configured: true, available: true, balance, error: null };
  } catch (error) {
    console.error('[ai-usage] KIE balance unavailable:', error);
    return { configured: true, available: false, balance: null, error: 'Баланс временно недоступен' };
  }
}

export type AiUsageSummary = {
  today: number;
  month: number;
  last: {
    createdAt: string;
    route: 'fast' | 'standard' | 'analysis';
    model: string;
    purpose: string;
    creditsConsumed: number | null;
    status: 'success' | 'error';
  } | null;
  available: boolean;
};

export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  if (!dbConfigured()) return { today: 0, month: 0, last: null, available: false };
  const zone = process.env.APP_TIMEZONE?.trim() || 'Europe/Moscow';
  try {
    const [totals, last] = await Promise.all([
      db()<Array<{ today: number; month: number }>>`
        SELECT
          COALESCE(sum(credits_consumed) FILTER (
            WHERE created_at >= date_trunc('day', now() AT TIME ZONE ${zone}) AT TIME ZONE ${zone}
          ), 0)::float8 as today,
          COALESCE(sum(credits_consumed) FILTER (
            WHERE created_at >= date_trunc('month', now() AT TIME ZONE ${zone}) AT TIME ZONE ${zone}
          ), 0)::float8 as month
        FROM ai_usage
      `,
      db()<Array<NonNullable<AiUsageSummary['last']>>>`
        SELECT to_char(created_at AT TIME ZONE ${zone}, 'YYYY-MM-DD HH24:MI') as "createdAt",
               route, model, purpose, credits_consumed::float8 as "creditsConsumed", status
        FROM ai_usage ORDER BY created_at DESC LIMIT 1
      `,
    ]);
    return { today: totals[0]?.today || 0, month: totals[0]?.month || 0, last: last[0] || null, available: true };
  } catch (error) {
    console.error('[ai-usage] Local usage statistics unavailable:', error);
    return { today: 0, month: 0, last: null, available: false };
  }
}
