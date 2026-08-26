import { createHash } from 'node:crypto';

export type HistorySourceRef = {
  id: string;
  title: string;
  path: string;
  url: string | null;
  modifiedTime: string | null;
};

export type HistoricalMaterialCandidate = HistorySourceRef & {
  mimeType: string;
  association: 'student_specific' | 'shared_candidate';
  confidence: 'high' | 'medium' | 'low';
  references: { stages: string[]; lessons: string[]; pages: string[] };
};

export type BootstrapFinding = {
  key: string;
  stage: string | null;
  lesson: string | null;
  topic: string | null;
  pages: string | null;
  grammar: string[];
  vocabulary: string[];
  skills: string[];
  coverageSummary: string;
  sourceRefs: HistorySourceRef[];
  confidence: 'high' | 'medium' | 'low';
  association: 'student_specific' | 'shared_candidate';
};

export type HistoryBootstrapAnalysis = {
  summary: string;
  findings: BootstrapFinding[];
  currentPositionCandidate: { stage: string; lesson: string | null; confidence: 'high' | 'medium' | 'low'; reason: string } | null;
  questions: Array<{ id: string; type: string; text: string; options: Array<{ value: string; label: string }>; relatedFindingKeys: string[] }>;
};

const SOURCE_BOOK = /(?:student|pupil|activity|work)\s*book|teacher\s*s?\s*book|workbook\s*keys?|test\s*booklet|course\s*map|curriculum|syllabus|учебник|книга\s*для\s*учителя/i;
const HISTORICAL_MATERIAL = /worksheet|teacher\s*s?\s*(?:pack|key)|homework|lesson|practice|revision|extra\s*(?:grammar|vocabulary)|рабоч(?:ий|ая)\s*(?:лист|тетрад)|домашн/i;

export function normalizeEvidenceText(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function isSourceBook(nameOrPath: string) {
  return SOURCE_BOOK.test(normalizeEvidenceText(nameOrPath));
}

export function extractHistoricalReferences(value: string) {
  const text = value.replace(/[–—]/g, '-');
  const stages = Array.from(text.matchAll(/\b(?:module|unit|block)\s*[-:]?\s*([\p{L}\d]+)/giu), (match) => `${match[0].split(/\s/)[0]} ${match[1]}`);
  const lessons = Array.from(text.matchAll(/\b(?:lesson|l)\s*[-:]?\s*0*(\d+[a-zа-я]?)/giu), (match) => `Lesson ${match[1]}`);
  for (const match of text.matchAll(/(?:^|\s)(\d+[a-z])(?:\s|$)/giu)) lessons.push(match[1]);
  const pages = Array.from(text.matchAll(/(?:pp?\.|pages?|стр\.)\s*(\d+)(?:\s*[-]\s*(\d+))?/giu), (match) => match[2] ? `${match[1]}–${match[2]}` : match[1]);
  return {
    stages: [...new Set(stages)].slice(0, 6),
    lessons: [...new Set(lessons)].slice(0, 8),
    pages: [...new Set(pages)].slice(0, 8),
  };
}

export function classifyHistoricalMaterial(input: Omit<HistorySourceRef, 'url' | 'modifiedTime'> & Partial<Pick<HistorySourceRef, 'url' | 'modifiedTime'>> & { mimeType: string }, studentName: string): HistoricalMaterialCandidate | null {
  const evidence = `${input.path} / ${input.title}`;
  if (isSourceBook(evidence)) return null;
  const normalizedEvidence = normalizeEvidenceText(evidence);
  const normalizedStudent = normalizeEvidenceText(studentName);
  const studentTokens = normalizedStudent.split(' ').filter((token) => token.length >= 3);
  const studentSpecific = Boolean(normalizedStudent && (normalizedEvidence.includes(normalizedStudent) || (studentTokens.length > 0 && studentTokens.every((token) => normalizedEvidence.includes(token)))));
  const references = extractHistoricalReferences(evidence);
  const hasReference = references.stages.length + references.lessons.length + references.pages.length > 0;
  if (!HISTORICAL_MATERIAL.test(normalizedEvidence) && !(studentSpecific && hasReference)) return null;
  return {
    ...input,
    url: input.url || null,
    modifiedTime: input.modifiedTime || null,
    association: studentSpecific ? 'student_specific' : 'shared_candidate',
    confidence: studentSpecific && hasReference ? 'high' : hasReference ? 'medium' : 'low',
    references,
  };
}

function strings(value: unknown, limit = 12) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, limit) : [];
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sourceRefs(value: unknown): HistorySourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const ref = item as Record<string, unknown>;
    const id = nullableString(ref.id);
    const title = nullableString(ref.title);
    if (!id || !title) return [];
    return [{ id, title, path: nullableString(ref.path) || '', url: nullableString(ref.url), modifiedTime: nullableString(ref.modifiedTime) }];
  }).slice(0, 20);
}

export function parseHistoryBootstrapAnalysis(text: string): HistoryBootstrapAnalysis | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: unknown;
  try { raw = JSON.parse(match[0]); } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const object = raw as Record<string, unknown>;
  const findings = Array.isArray(object.findings) ? object.findings.flatMap((item, index): BootstrapFinding[] => {
    if (!item || typeof item !== 'object') return [];
    const finding = item as Record<string, unknown>;
    const coverageSummary = nullableString(finding.coverageSummary);
    if (!coverageSummary) return [];
    const confidence = ['high', 'medium', 'low'].includes(String(finding.confidence)) ? finding.confidence as BootstrapFinding['confidence'] : 'low';
    const association = finding.association === 'student_specific' ? 'student_specific' : 'shared_candidate';
    return [{
      key: nullableString(finding.key) || `finding-${index + 1}`,
      stage: nullableString(finding.stage), lesson: nullableString(finding.lesson), topic: nullableString(finding.topic), pages: nullableString(finding.pages),
      grammar: strings(finding.grammar), vocabulary: strings(finding.vocabulary), skills: strings(finding.skills),
      coverageSummary, sourceRefs: sourceRefs(finding.sourceRefs), confidence, association,
    }];
  }).slice(0, 30) : [];
  const positionRaw = object.currentPositionCandidate;
  const position = positionRaw && typeof positionRaw === 'object' && !Array.isArray(positionRaw)
    ? positionRaw as Record<string, unknown> : null;
  const stage = position ? nullableString(position.stage) : null;
  const questions = Array.isArray(object.questions) ? object.questions.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const question = item as Record<string, unknown>;
    const questionText = nullableString(question.text);
    if (!questionText) return [];
    const options = Array.isArray(question.options) ? question.options.flatMap((option) => {
      if (!option || typeof option !== 'object') return [];
      const candidate = option as Record<string, unknown>;
      const value = nullableString(candidate.value), label = nullableString(candidate.label);
      return value && label ? [{ value, label }] : [];
    }).slice(0, 5) : [];
    return options.length ? [{ id: nullableString(question.id) || `question-${index + 1}`, type: nullableString(question.type) || 'clarification', text: questionText, options, relatedFindingKeys: strings(question.relatedFindingKeys, 10) }] : [];
  }).slice(0, 5) : [];
  return { summary: nullableString(object.summary) || '', findings, currentPositionCandidate: stage ? { stage, lesson: nullableString(position?.lesson), confidence: ['high', 'medium', 'low'].includes(String(position?.confidence)) ? position?.confidence as 'high' | 'medium' | 'low' : 'low', reason: nullableString(position?.reason) || '' } : null, questions };
}

export function evidenceFingerprint(enrollmentId: string, refs: Array<{ id: string; modifiedTime?: string | null }>) {
  return createHash('sha256').update(`${enrollmentId}|${refs.map((ref) => `${ref.id}:${ref.modifiedTime || ''}`).sort().join('|')}`).digest('hex');
}

export function findingFingerprint(enrollmentId: string, finding: Pick<BootstrapFinding, 'key' | 'sourceRefs'>) {
  return createHash('sha256').update(`${enrollmentId}|${finding.key}|${finding.sourceRefs.map((ref) => ref.id).sort().join('|')}`).digest('hex');
}
