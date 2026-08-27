export type PageRange = { start: number; end: number };

export function textbookSectionFromReference(reference: string | null) {
  if (!reference) return null;
  const compact = reference.trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, '');
  const match = compact.match(/^(?:module)?(10|[1-9])([a-c])$/i);
  if (!match) return null;
  return `${Number(match[1])}${match[2].toLocaleLowerCase()}`;
}

export function moduleRangeFromBrief(text: string | null | undefined): PageRange | null {
  if (!text) return null;
  const match = text.match(/\bSB\s+pages?\s*:\s*(\d{1,3})\s*[-–—]\s*(\d{1,3})\b/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return start > 0 && end >= start ? { start, end } : null;
}

export function pagesForTextbookSection(text: string | null | undefined, reference: string | null): PageRange | null {
  if (!text) return null;
  const section = textbookSectionFromReference(reference);
  if (!section) return null;
  const pattern = new RegExp(`(?:^|\\b)${section}\\b[^\\n]{0,180}?(?:pp?\\.?|pages?)\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?`, 'i');
  const match = text.match(pattern);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  return start > 0 && end >= start && end - start <= 20 ? { start, end } : null;
}

export function chooseSourcePages({ explicitPages, planningPages, moduleRange }: {
  explicitPages: PageRange | null;
  planningPages: PageRange | null;
  moduleRange: PageRange | null;
}) {
  if (!planningPages) return explicitPages;
  if (!explicitPages) return planningPages;
  if (moduleRange && (explicitPages.start < moduleRange.start || explicitPages.end > moduleRange.end)) return planningPages;
  return explicitPages;
}
