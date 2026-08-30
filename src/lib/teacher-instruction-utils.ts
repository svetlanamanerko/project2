export function normalizeTeacherInstruction(value: unknown, maxLength = 2000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r/g, '').trim().slice(0, maxLength);
}

export function effectiveTeacherInstruction(todayInstruction: string, savedNote?: string | null) {
  return todayInstruction || String(savedNote || '').trim();
}
