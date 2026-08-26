import 'server-only';
import { DIAGNOSTIC_OGE_SECTIONS, excludeUsedQids } from '@/lib/learning-context-utils';
import { buildOgeSearchParams, normalizeOgeSearchMetadata, type NavigatorFilterValues } from '@/lib/navigator-utils';

export type OgeTask = { qid: string; section?: string; preview?: string; topic?: string; subtopic?: string; kesCode?: string | null; kesText?: string; answerType?: string; hasMedia?: boolean; [key: string]: unknown };
export type OgeTaskDetail = { task: OgeTask & { conditionText?: string; contentText?: string; topics?: Array<{ name?: string; slug?: string; parentName?: string }>; classifications?: Record<string,string>; media?: unknown[] }; group: unknown | null };
export type OgeFilters = NavigatorFilterValues;
export type OgeSearchResult = { configured: boolean; available: boolean; items: OgeTask[]; total: number; page: number; pageSize: number; pages: number };

export function ogeNavigatorBaseUrl() { return process.env.OGE_NAVIGATOR_BASE_URL?.trim().replace(/\/$/, '') || ''; }

export async function searchOgeTasks(filters: OgeFilters, options?: { maxPageSize?: number }): Promise<OgeSearchResult> {
  const base = ogeNavigatorBaseUrl();
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(Math.max(1, filters.pageSize || 20), options?.maxPageSize || 50);
  if (!base) return { configured: false, available: false, items: [], total: 0, page, pageSize, pages: 0 };
  const params = buildOgeSearchParams({ ...filters, page, pageSize }, options?.maxPageSize || 50);
  try {
    const response = await fetch(`${base}/api/tasks?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { items?: OgeTask[]; total?: number; page?: number; pageSize?: number; pages?: number };
    return { configured: true, available: true, ...normalizeOgeSearchMetadata(data,{page,pageSize}) };
  } catch (error) {
    console.error('[oge-navigator] search unavailable:', error);
    return { configured: true, available: false, items: [], total: 0, page, pageSize, pages: 0 };
  }
}

export async function getOgeTask(qid: string): Promise<OgeTaskDetail | null> {
  const base = ogeNavigatorBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/api/tasks/${encodeURIComponent(qid)}`, { cache:'no-store', signal:AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return await response.json() as OgeTaskDetail;
  } catch (error) {
    console.error(`[oge-navigator] detail ${qid} unavailable:`, error);
    return null;
  }
}

export async function getOgeCandidatesForStudent(usedQids: string[], intent: Record<string, unknown>) {
  const explicitValue = intent.qids ?? intent.explicitQids;
  const explicitQids = (Array.isArray(explicitValue) ? explicitValue : typeof explicitValue === 'string' ? explicitValue.split(/[\s,;]+/) : []).map(String).map((qid) => qid.trim()).filter(Boolean);
  const explicitResults = await Promise.allSettled(explicitQids.map((qid) => getOgeTask(qid)));
  const explicitItems = explicitResults.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value.task] : []);
  if (intent.diagnosticMode === true) {
    const sectionResults = await Promise.all(DIAGNOSTIC_OGE_SECTIONS.map((section) => searchOgeTasks({ section, pageSize: 4 }, { maxPageSize: 10 })));
    const combined = [...explicitItems, ...sectionResults.flatMap((result) => result.items)];
    return { configured: explicitItems.length > 0 || sectionResults.some((result) => result.configured), available: explicitItems.length > 0 || sectionResults.some((result) => result.available), items: excludeUsedQids(Array.from(new Map(combined.map((item) => [item.qid, item])).values()), usedQids).slice(0, 10) };
  }
  const result = await searchOgeTasks({ topic: String(intent.topic || '') || undefined, subtopic: String(intent.subtopic || '') || undefined, section: String(intent.section || intent.skill || '') || undefined, q: String(intent.query || '') || undefined, pageSize: 10 }, { maxPageSize: 10 });
  const unique = Array.from(new Map([...explicitItems, ...result.items].map((item) => [item.qid, item])).values());
  return { configured: result.configured || explicitItems.length > 0, available: result.available || explicitItems.length > 0, items: excludeUsedQids(unique, usedQids).slice(0, 10) };
}

export async function getOgeNavigatorInventory(filters: Omit<OgeFilters, 'section' | 'page' | 'pageSize'>, sections: readonly string[]) {
  const results = await Promise.all(sections.map(async (section) => {
    const result = await searchOgeTasks({ ...filters, section, page: 1, pageSize: 1 }, { maxPageSize: 1 });
    return { section, total: result.total, available: result.available };
  }));
  return { configured: results.some((item) => item.available) || Boolean(ogeNavigatorBaseUrl()), available: results.some((item) => item.available), sections: results };
}
