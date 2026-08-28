export type PlanningDocumentKind =
  | 'federal-baseline'
  | 'assessment-map'
  | 'course-priority-map'
  | 'course-map'
  | 'module-brief'
  | 'oge-navigator-baseline'
  | 'oge-master-curriculum'
  | 'oge-student-route'
  | 'oge-coverage-audit'
  | 'oge-bank-completion'
  | 'oge-technological-map';

const SPACE_RE = /[\t\u00a0]+/g;

export function planningDocumentKind(name: string): PlanningDocumentKind | null {
  const value = name.toLocaleUpperCase('ru-RU');
  if (value.includes('OGE') && value.includes('TECHNOLOGICAL MAP')) return 'oge-technological-map';
  if (value.includes('OGE NAVIGATOR BASELINE')) return 'oge-navigator-baseline';
  if (value.includes('OGE MASTER CURRICULUM MAP')) return 'oge-master-curriculum';
  if (value.includes('OGE STUDENT ROUTE SYSTEM')) return 'oge-student-route';
  if (value.includes('NAVIGATOR COVERAGE AUDIT')) return 'oge-coverage-audit';
  if (value.includes('OGE FIPI BANK COMPLETION PLAN')) return 'oge-bank-completion';
  if (value.includes('MODULE BRIEF')) return 'module-brief';
  if (value.includes('FEDERAL BASELINE')) return 'federal-baseline';
  if (value.includes('ASSESSMENT MAP')) return 'assessment-map';
  if (value.includes('COURSE PRIORITY MAP')) return 'course-priority-map';
  if (value.includes('COURSE MAP')) return 'course-map';
  return null;
}

export function isPlanningGuidanceFolder(name: string) {
  const value = name.toLocaleUpperCase('ru-RU');
  return value.includes('COURSE BASELINE') || value.includes('COURSE MAP') || value.includes('CURRICULUM MAP');
}

export function isPlanningGuidancePath(path: string) {
  const value = path.toLocaleUpperCase('ru-RU');
  return value.includes('00 COURSE BASELINE') || value.includes('00 CURRICULUM MAP') || Boolean(planningDocumentKind(value));
}

function stringsFromIntent(intent: Record<string, unknown>) {
  return Object.values(intent)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function moduleNumberFromIntent(intent: Record<string, unknown>): number | null {
  for (const value of stringsFromIntent(intent)) {
    const explicit = value.match(/\bmodule\s*0?(\d{1,2})(?:[a-zа-я])?\b/i);
    if (explicit) return Number(explicit[1]);
    const compact = value.match(/(?:^|\b)m\s*0?(\d{1,2})(?:\.|\b)/i);
    if (compact) return Number(compact[1]);
  }
  return null;
}

export function ogeLessonNumberFromIntent(intent: Record<string, unknown>): number | null {
  for (const value of stringsFromIntent(intent)) {
    const explicit = value.match(/\b(?:lesson|урок|l)\s*0?(\d{1,2})\b/i);
    if (explicit) return Number(explicit[1]);
    const standalone = value.match(/^0?(\d{1,2})\s*[—-]/);
    if (standalone) return Number(standalone[1]);
  }
  return null;
}

export function ogeBlockNumberFromIntent(intent: Record<string, unknown>): number | null {
  for (const value of stringsFromIntent(intent)) {
    const block = value.match(/\bblock\s*0?(\d{1,2})\b/i);
    if (block) return Number(block[1]);
  }
  const lesson = ogeLessonNumberFromIntent(intent);
  if (lesson == null) return null;
  const ranges = [
    [2, 8, 1], [9, 15, 2], [17, 24, 3], [25, 31, 4], [33, 40, 5],
    [41, 46, 6], [48, 55, 7], [56, 60, 8], [62, 68, 9],
  ] as const;
  const match = ranges.find(([start, end]) => lesson >= start && lesson <= end);
  return match?.[2] ?? null;
}

export function moduleBriefScore(name: string, moduleNumber: number | null) {
  if (planningDocumentKind(name) !== 'module-brief') return -1;
  const value = name.toLocaleUpperCase('ru-RU');
  if (value.includes('TEMPLATE') || value.includes('ШАБЛОН')) return 0;
  if (moduleNumber == null) return 0;
  if (new RegExp(`\\bMODULE\\s*0?${moduleNumber}\\b`, 'i').test(value)) return 100;
  if (new RegExp(`(?:^|\\b)M\\s*0?${moduleNumber}(?:\\.|\\b)`, 'i').test(value)) return 80;
  return 0;
}

export function ogeTechnologicalMapScore(name: string, blockNumber: number | null) {
  if (planningDocumentKind(name) !== 'oge-technological-map') return -1;
  if (blockNumber == null) return 0;
  return new RegExp(`\\bBLOCK\\s*0?${blockNumber}\\b`, 'i').test(name) ? 100 : 0;
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(SPACE_RE, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipped(text: string, max: number) {
  const value = normalizeText(text);
  return value.length <= max ? value : `${value.slice(0, max).trimEnd()}\n[…сокращено…]`;
}

function before(text: string, stop: RegExp, max: number) {
  const value = normalizeText(text);
  const match = stop.exec(value);
  const end = match?.index != null ? match.index : Math.min(value.length, max);
  return clipped(value.slice(0, Math.min(end, max)), max);
}

function section(text: string, start: RegExp, stop: RegExp, max: number) {
  const value = normalizeText(text);
  const match = start.exec(value);
  if (!match || match.index == null) return '';
  const from = match.index;
  const tail = value.slice(from + match[0].length);
  const stopMatch = stop.exec(tail);
  const to = stopMatch?.index != null ? from + match[0].length + stopMatch.index : value.length;
  return clipped(value.slice(from, to), max);
}

function uniqueSegments(parts: string[], max: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const value = normalizeText(part);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return clipped(result.join('\n\n---\n\n'), max);
}

export function compactPlanningText(kind: PlanningDocumentKind, text: string, moduleNumber: number | null, ogeBlockNumber: number | null = null) {
  const value = normalizeText(text);
  if (!value) return '';
  if (kind === 'module-brief') return clipped(value, 11_000);
  if (kind === 'oge-navigator-baseline') return clipped(value, 7_000);
  if (kind === 'oge-student-route') return clipped(value, 8_000);
  if (kind === 'oge-coverage-audit') return clipped(value, 8_000);
  if (kind === 'oge-bank-completion') return clipped(value, 7_000);
  if (kind === 'oge-technological-map') return clipped(value, 10_000);

  if (kind === 'oge-master-curriculum') {
    const intro = before(value, /(?:^|\n)BLOCK\s*1\b/i, 3_600);
    const blockPart = ogeBlockNumber == null ? '' : section(
      value,
      new RegExp(`(?:^|\\n)BLOCK\\s*${ogeBlockNumber}\\b`, 'i'),
      /\n(?:BLOCK\s*\d+|\d+\s*[—-]\s*C\d|69\s*[—-]\s*FULL OGE MOCK)/i,
      5_800,
    );
    return uniqueSegments([intro, blockPart], 9_000);
  }

  if (kind === 'course-map') {
    const intro = before(value, /(?:^|\n)[A-ZА-Я0-9. ]*MODULE\s*\d+\b/i, 2_500);
    const modulePart = moduleNumber == null ? '' : section(
      value,
      new RegExp(`(?:^|\\n)[A-ZА-Я0-9. ]*MODULE\\s*0?${moduleNumber}\\b`, 'i'),
      /\n[A-ZА-Я0-9. ]*MODULE\s*\d+\b/i,
      7_500,
    );
    return uniqueSegments([intro, modulePart], 9_000);
  }

  if (kind === 'course-priority-map') {
    const intro = before(value, /(?:^|\n)[A-ZА-Я0-9. ]*MODULE\s*\d+\b/i, 2_100);
    const modulePart = moduleNumber == null ? '' : section(
      value,
      new RegExp(`(?:^|\\n)[A-ZА-Я0-9. ]*MODULE\\s*0?${moduleNumber}\\b`, 'i'),
      /\n[A-ZА-Я0-9. ]*MODULE\s*\d+\b/i,
      5_500,
    );
    const gapMap = section(value, /(?:^|\n)[A-ZА-Я0-9. ]*FEDERAL GAP MAP\b/i, /\n[A-ZА-Я0-9. ]*(?:HOME|BACKWARDS|STATUS)\b/i, 2_000);
    return uniqueSegments([intro, modulePart, gapMap], 8_000);
  }

  if (kind === 'assessment-map') {
    const intro = before(value, /(?:^|\n)PC1\s*[—-]|(?:^|\n)[A-ZА-Я0-9. ]*SPOTLIGHT PROGRESS CHECK/i, 2_400);
    if (moduleNumber == null) return uniqueSegments([intro], 3_000);
    const progress = section(
      value,
      new RegExp(`(?:^|\\n)PC${moduleNumber}\\s*[—-]`, 'i'),
      new RegExp(`\\nPC${moduleNumber + 1}\\s*[—-]|\\n[A-ZА-Я0-9. ]*TEST BOOKLET`, 'i'),
      1_200,
    );
    const test = section(
      value,
      new RegExp(`(?:^|\\n)TEST\\s*${moduleNumber}\\s*[—-]`, 'i'),
      new RegExp(`\\nTEST\\s*${moduleNumber + 1}\\s*[—-]|\\n[A-ZА-Я0-9. ]*SIX MAJOR EVIDENCE`, 'i'),
      2_200,
    );
    return uniqueSegments([intro, progress, test], 5_500);
  }

  const intro = clipped(value.slice(0, 2_300), 2_300);
  const federalGaps = section(value, /(?:^|\n)КРИТИЧЕСКИЙ ВЫВОД ДЛЯ SPOTLIGHT 5/i, /\nD\.\s/i, 2_200);
  const endOutcome = section(value, /(?:^|\n)F\.\s*ОБЯЗАТЕЛЬНЫЙ END-OF-GRADE/i, /\nSTATUS\b/i, 2_200);
  return uniqueSegments([intro, federalGaps, endOutcome], 6_500);
}
