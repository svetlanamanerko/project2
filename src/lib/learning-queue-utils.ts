export type ActiveQueueItem = { id: string; enrollmentId: string; label: string; active: boolean };

export function normalizeLearningLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function validLearningPriority(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 3;
}

export function hasActiveQueueDuplicate(items: ActiveQueueItem[], enrollmentId: string, label: string) {
  const normalized = normalizeLearningLabel(label).toLocaleLowerCase('ru');
  return items.some((item) => item.active && item.enrollmentId === enrollmentId && normalizeLearningLabel(item.label).toLocaleLowerCase('ru') === normalized);
}

export function deactivateQueueItem(items: ActiveQueueItem[], itemId: string) {
  return items.map((item) => item.id === itemId ? { ...item, active: false } : item);
}
