import 'server-only';

import { prepareLessonSource, type LessonSourceContext } from '@/lib/lesson-source';
import { moduleRangeFromBrief, pagesForTextbookSection } from '@/lib/source-resolution-utils';

export async function prepareLessonSourceWithPlanning(
  context: LessonSourceContext,
  kieApiKey: string,
  moduleBriefText?: string | null,
) {
  const requested = [context.module, context.topic, context.note].filter(Boolean).join(' ');
  const planningPages = pagesForTextbookSection(moduleBriefText, requested.match(/\b(?:module\s*)?(10|[1-9])\s*([a-c])\b/i)?.[0] || null);
  const moduleRange = moduleRangeFromBrief(moduleBriefText);

  if (!planningPages) return prepareLessonSource(context, kieApiKey);

  const explicitText = [context.note, context.topic, context.module].filter(Boolean).join(' ');
  const explicitMatch = explicitText.match(/(?:стр(?:\.|аниц(?:а|ы|е|у|ах)?)?|pp?\.?|pages?)\s*[:№]?\s*(\d{1,3})(?:\s*(?:[-–—]|до|и|,|\s)\s*(\d{1,3}))?/i);
  const explicit = explicitMatch
    ? { start: Number(explicitMatch[1]), end: Number(explicitMatch[2] || explicitMatch[1]) }
    : null;
  const explicitInsideModule = explicit && moduleRange
    ? explicit.start >= moduleRange.start && explicit.end <= moduleRange.end
    : Boolean(explicit);

  if (explicitInsideModule) return prepareLessonSource(context, kieApiKey);

  const pageHint = `pp. ${planningPages.start}${planningPages.end !== planningPages.start ? `–${planningPages.end}` : ''}`;
  return prepareLessonSource({
    ...context,
    note: [pageHint, context.note].filter(Boolean).join(' · '),
  }, kieApiKey);
}
