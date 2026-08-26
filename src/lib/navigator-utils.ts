export type NavigatorFilterValues = { topic?: string; subtopic?: string; section?: string; q?: string; qid?: string; zid?: string; kes?: string; answerType?: string; hasMedia?: boolean; page?: number; pageSize?: number };

export function buildOgeSearchParams(filters: NavigatorFilterValues, maxPageSize = 50) {
  const params = new URLSearchParams();
  const normalized = { ...filters, page: Math.max(1, filters.page || 1), pageSize: Math.min(Math.max(1, filters.pageSize || 20), maxPageSize) };
  for (const [key, value] of Object.entries(normalized)) if (value !== undefined && value !== '') params.set(key, String(value));
  return params;
}

export function normalizeOgeSearchMetadata<T>(data: { items?: T[]; total?: number; page?: number; pageSize?: number; pages?: number }, fallback: { page: number; pageSize: number }) {
  return { items: data.items || [], total: Number(data.total || 0), page: Number(data.page || fallback.page), pageSize: Number(data.pageSize || fallback.pageSize), pages: Number(data.pages || 0) };
}

export function filterUnusedNavigatorTasks<T extends { qid: string }>(tasks: T[], usedQids: Iterable<string>) {
  const used = new Set(usedQids);
  return tasks.filter((task) => !used.has(task.qid));
}

export function navigatorUsageMap<T extends { qid: string }>(usage: T[]) { return new Map(usage.map((item) => [item.qid,item])); }

export function currentPositionSearchValue(position: { stage: string; lesson: string | null; intent: Record<string, unknown> } | null) {
  if (!position) return '';
  const intent = [position.intent.topic, position.intent.subtopic, position.intent.section, position.intent.skill].find((item) => typeof item === 'string' && item.trim());
  return String(intent || position.lesson || position.stage).trim();
}

export function navigatorConnectionLabel(configured: boolean, available: boolean) {
  if (available) return '● Navigator подключён';
  return configured ? '⚠ Navigator временно недоступен' : '⚠ Интеграция не настроена';
}
