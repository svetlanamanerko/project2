import 'server-only';
import { excludeUsedQids } from '@/lib/learning-context-utils';

export type OgeTask = { qid: string; section?: string; preview?: string; topic?: string; subtopic?: string; kesCode?: string | null; answerType?: string; hasMedia?: boolean; [key: string]: unknown };
export type OgeTaskDetail = { task: OgeTask & { conditionText?: string; contentText?: string; topics?: Array<{ name?: string; slug?: string }>; classifications?: Record<string,string> }; group: unknown | null };
export type OgeFilters = { topic?: string; subtopic?: string; section?: string; q?: string; qid?: string; zid?: string; kes?: string; answerType?: string; hasMedia?: boolean; page?: number; pageSize?: number };

function baseUrl() { return process.env.OGE_NAVIGATOR_BASE_URL?.trim().replace(/\/$/, '') || ''; }

export async function searchOgeTasks(filters: OgeFilters) {
  const base = baseUrl();
  if (!base) return { configured: false, available: false, items: [] as OgeTask[] };
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries({ ...filters, page: filters.page || 1, pageSize: Math.min(filters.pageSize || 10, 10) })) if (value !== undefined) params.set(key, String(value));
  try {
    const response = await fetch(`${base}/api/tasks?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { items?: OgeTask[] };
    return { configured: true, available: true, items: (data.items || []).slice(0, 10) };
  } catch (error) { console.error('[oge-navigator] search unavailable:', error); return { configured: true, available: false, items: [] as OgeTask[] }; }
}

export async function getOgeTask(qid: string): Promise<OgeTaskDetail | null> {
  const base = baseUrl(); if (!base) return null;
  try { const response = await fetch(`${base}/api/tasks/${encodeURIComponent(qid)}`, { cache:'no-store', signal:AbortSignal.timeout(8000) }); if (!response.ok) return null; return await response.json() as OgeTaskDetail; } catch { return null; }
}

export async function getOgeCandidatesForStudent(usedQids: string[], intent: Record<string, unknown>) {
  const result = await searchOgeTasks({ topic: String(intent.topic || '') || undefined, subtopic: String(intent.subtopic || '') || undefined, section: String(intent.section || intent.skill || '') || undefined, q: String(intent.query || '') || undefined, pageSize: 10 });
  return { ...result, items: excludeUsedQids(result.items, usedQids).slice(0, 10) };
}
