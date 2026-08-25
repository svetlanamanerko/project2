import type { LessonExerciseType } from '@/lib/lesson-json';

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function str(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function arr(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseJsonText(value: string): unknown {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned) as unknown; } catch { return value; }
}

export function unwrapLessonJson(value: unknown) {
  let current = value;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current === 'string') {
      const parsed = parseJsonText(current);
      if (parsed === current) return current;
      current = parsed;
      continue;
    }
    if (Array.isArray(current)) {
      if (current.length !== 1) return current;
      current = current[0];
      continue;
    }
    const row = obj(current);
    if (!row || 'sections' in row || ('version' in row && 'resources' in row)) return current;
    const key = ['interactiveLesson', 'interactive_lesson', 'lesson', 'data', 'result', 'json']
      .find((candidate) => row[candidate] != null);
    if (!key) return current;
    current = row[key];
  }
  return current;
}

function strings(value: unknown) {
  return arr(value).map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
    const row = obj(item);
    return row ? str(row.label || row.text || row.value || row.option) : '';
  }).filter(Boolean);
}

function normalizeType(value: unknown): LessonExerciseType | '' {
  const raw = str(value).toLowerCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, LessonExerciseType> = {
    gap_fill: 'gap_fill', gapfill: 'gap_fill', fill_gaps: 'gap_fill', fill_in_the_gaps: 'gap_fill',
    dropdown: 'dropdown', select: 'dropdown', select_option: 'dropdown',
    true_false_ns: 'true_false_ns', true_false_not_stated: 'true_false_ns', true_false_not_given: 'true_false_ns', tfns: 'true_false_ns',
    multiple_choice: 'multiple_choice', multiplechoice: 'multiple_choice', choice: 'multiple_choice', mcq: 'multiple_choice',
    matching: 'matching', match: 'matching', match_pairs: 'matching',
    sort: 'sort', sorting: 'sort', categorize: 'sort', categorise: 'sort', classification: 'sort',
    open_answer: 'open_answer', open: 'open_answer', short_answer: 'open_answer', write: 'open_answer',
    speaking: 'speaking', speak: 'speaking', oral: 'speaking', dialogue: 'speaking', dialog: 'speaking',
    oral_drill: 'oral_drill', oraldrill: 'oral_drill', controlled_oral: 'oral_drill', read_aloud: 'oral_drill',
    self_check: 'self_check', selfcheck: 'self_check', checklist: 'self_check',
    reading: 'reading', read: 'reading',
    listening: 'listening', listen: 'listening',
  };
  return aliases[raw] || '';
}

const communicativePattern = /\b(introduce yourself|talk about|tell (?:me )?about|answer .*about yourself|act out (?:the )?dialogue|make (?:a )?dialogue|describe|personali[sz]ation)\b/i;
const oralDrillPattern = /\b(read .* aloud|say (?:the )?(?:letters?|words?|sounds?)|spell\b|repeat\b|read (?:the )?names|name (?:the )?pictures|fast picture naming|quick (?:picture )?naming|last[- ]letter chain|first[- ]letter|last[- ]letter|word chain)\b/i;
const selfCheckPattern = /\b(self[- ]check|tick the words you can|circle the words you can|check what you can)\b/i;
const dictationPattern = /\b(?:mini[- ]?)?dictation\b/i;

export function classifyLegacyExerciseType(value: { type?: unknown; title?: unknown; instruction?: unknown; prompt?: unknown; hasAnswerKey?: boolean }) {
  const current = normalizeType(value.type);
  const semantics = [value.title, value.instruction, value.prompt].map(str).join(' ');
  if (!value.hasAnswerKey && selfCheckPattern.test(semantics)) return 'self_check' as const;
  if (current === 'speaking' && !communicativePattern.test(semantics) && oralDrillPattern.test(semantics)) return 'oral_drill' as const;
  return current;
}

function oralMode(value: string) {
  if (/read .* aloud|read (?:the )?names/i.test(value)) return 'read_aloud' as const;
  if (/spell/i.test(value)) return 'say_and_spell' as const;
  if (/repeat/i.test(value)) return 'repeat' as const;
  if (/chain|first[- ]letter|last[- ]letter/i.test(value)) return 'word_chain' as const;
  if (/quick|fast|name (?:the )?pictures/i.test(value)) return 'quick_name' as const;
  return 'say' as const;
}

function cueItems(row: Record<string, unknown>, prefix: string) {
  const explicit = idLabelItems(row.items || row.cues || row.cards || row.words, prefix);
  if (explicit.length) return explicit;
  return strings(row.usefulLanguage || row.useful_language || row.phrases)
    .map((label, index) => ({ id: `${prefix}${index + 1}`, label }));
}

function normalizeTf(value: unknown) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  const raw = str(value).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  if (['true', 't', 'yes', '1'].includes(raw)) return 'true';
  if (['false', 'f', 'no', '0'].includes(raw)) return 'false';
  if (['ns', 'not stated', 'not given', 'not mentioned', 'unknown'].includes(raw)) return 'ns';
  return raw;
}

function idLabelItems(value: unknown, prefix: string) {
  return arr(value).map((item, index) => {
    if (typeof item === 'string' || typeof item === 'number') {
      return { id: `${prefix}${index + 1}`, label: String(item).trim() };
    }
    const row = obj(item) || {};
    return {
      id: str(row.id || row.key || row.value) || `${prefix}${index + 1}`,
      label: str(row.label || row.text || row.value || row.title || row.name),
    };
  }).filter((item) => item.label);
}

function normalizeOptions(value: unknown, prefix: string) {
  return arr(value).map((item, index) => {
    if (typeof item === 'string' || typeof item === 'number') {
      return { id: `${prefix}${index + 1}`, label: String(item).trim() };
    }
    const row = obj(item) || {};
    return {
      id: str(row.id || row.key || row.value) || `${prefix}${index + 1}`,
      label: str(row.label || row.text || row.value || row.option),
    };
  }).filter((item) => item.label);
}

function resolveOptionId(options: Array<{ id: string; label: string }>, rawAnswer: unknown) {
  const answer = str(rawAnswer);
  if (!answer) return '';
  const exactId = options.find((option) => option.id === answer);
  if (exactId) return exactId.id;
  const byLabel = options.find((option) => option.label.toLowerCase() === answer.toLowerCase());
  if (byLabel) return byLabel.id;
  const number = Number(answer);
  if (Number.isInteger(number)) {
    if (number >= 1 && number <= options.length) return options[number - 1].id;
    if (number >= 0 && number < options.length) return options[number].id;
  }
  return answer;
}

function remapAnswerRecord(value: unknown, left: Array<{ id: string; label: string }>, right: Array<{ id: string; label: string }>) {
  const source = obj(value) || {};
  const result: Record<string, string> = {};
  const leftByLabel = new Map(left.map((item) => [item.label.toLowerCase(), item.id]));
  const rightByLabel = new Map(right.map((item) => [item.label.toLowerCase(), item.id]));
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = left.some((item) => item.id === rawKey) ? rawKey : leftByLabel.get(rawKey.toLowerCase()) || rawKey;
    const value = str(rawValue);
    const mapped = right.some((item) => item.id === value) ? value : rightByLabel.get(value.toLowerCase()) || value;
    if (key && mapped) result[key] = mapped;
  }
  return result;
}

function normalizeExercise(raw: unknown, sectionId: string, index: number, supportedDictationResources: Set<string>) {
  const row = obj(raw) || {};
  const rawType = row.type || row.kind || row.exerciseType || row.exercise_type;
  const originalType = normalizeType(rawType);
  let type = classifyLegacyExerciseType({
    type: rawType,
    title: row.title || row.name || row.heading,
    instruction: row.instruction || row.instructions || row.task,
    prompt: row.prompt || row.question || row.text,
    hasAnswerKey: row.answer != null || row.answers != null || row.answerKey != null || row.answer_key != null || row.correct != null,
  });
  const id = str(row.id || row.key) || `${sectionId}-${index + 1}`;
  const title = str(row.title || row.name || row.heading) || `Task ${index + 1}`;
  const instruction = str(row.instruction || row.instructions || row.prompt || row.task) || title;
  const resourceId = str(row.resourceId || row.resource_id || row.sourceId || row.source_id || row.resource || row.source) || undefined;
  const semantics = `${title} ${instruction} ${str(row.prompt || row.question || row.text)}`;
  if (dictationPattern.test(semantics) && (!resourceId || !supportedDictationResources.has(resourceId))) return null;

  const migratedItems = type === 'oral_drill' || type === 'self_check'
    ? cueItems(row, type === 'oral_drill' ? 'o' : 's')
    : [];
  if (type !== originalType && !migratedItems.length) type = originalType;
  const base = { id, type, title, instruction, ...(resourceId ? { resourceId } : {}) };

  if (type === 'oral_drill') {
    return { ...base, mode: oralMode(str(row.mode) || semantics), items: migratedItems.length ? migratedItems : cueItems(row, 'o') };
  }

  if (type === 'self_check') {
    return { ...base, items: migratedItems.length ? migratedItems : cueItems(row, 's') };
  }

  if (type === 'gap_fill') {
    const blanks = arr(row.blanks || row.gaps).map((item, blankIndex) => {
      const blank = obj(item) || {};
      return {
        id: str(blank.id || blank.key) || `b${blankIndex + 1}`,
        answer: str(blank.answer || blank.correct || blank.correctAnswer || blank.correct_answer),
        ...(strings(blank.options || blank.choices).length ? { options: strings(blank.options || blank.choices) } : {}),
      };
    });
    const bank = strings(row.wordBank || row.word_bank || row.bank);
    return { ...base, text: str(row.text || row.content || row.sentence || row.passage), blanks, ...(bank.length ? { wordBank: bank } : {}) };
  }

  if (type === 'dropdown') {
    const items = arr(row.items || row.questions).map((item, itemIndex) => {
      const q = obj(item) || {};
      const options = strings(q.options || q.choices);
      let answer = str(q.answer || q.correct || q.correctAnswer || q.correct_answer);
      const same = options.find((option) => option.toLowerCase() === answer.toLowerCase());
      if (same) answer = same;
      return {
        id: str(q.id || q.key) || `d${itemIndex + 1}`,
        before: str(q.before || q.prefix || q.question || q.text),
        ...(str(q.after || q.suffix) ? { after: str(q.after || q.suffix) } : {}),
        options,
        answer,
      };
    });
    return { ...base, items };
  }

  if (type === 'true_false_ns') {
    const items = arr(row.items || row.statements || row.questions).map((item, itemIndex) => {
      const q = obj(item) || {};
      return {
        id: str(q.id || q.key) || `tf${itemIndex + 1}`,
        statement: str(q.statement || q.question || q.text || q.label),
        answer: normalizeTf(q.answer || q.correct || q.correctAnswer || q.correct_answer),
      };
    });
    return { ...base, items };
  }

  if (type === 'multiple_choice') {
    const items = arr(row.items || row.questions).map((item, itemIndex) => {
      const q = obj(item) || {};
      const options = normalizeOptions(q.options || q.choices || q.answers, `mc${itemIndex + 1}-o`);
      return {
        id: str(q.id || q.key) || `mc${itemIndex + 1}`,
        question: str(q.question || q.prompt || q.text || q.statement),
        options,
        answerId: resolveOptionId(options, q.answerId || q.answer_id || q.answer || q.correct || q.correctAnswer || q.correct_answer),
      };
    });
    return { ...base, items };
  }

  if (type === 'matching') {
    const leftItems = idLabelItems(row.leftItems || row.left_items || row.left || row.questions, 'l');
    const rightItems = idLabelItems(row.rightItems || row.right_items || row.right || row.answers || row.options, 'r');
    return { ...base, leftItems, rightItems, pairs: remapAnswerRecord(row.pairs || row.matches || row.answerKey || row.answer_key, leftItems, rightItems) };
  }

  if (type === 'sort') {
    const items = idLabelItems(row.items || row.cards || row.options, 's');
    const groups = idLabelItems(row.groups || row.categories || row.zones, 'g');
    return { ...base, items, groups, answers: remapAnswerRecord(row.answers || row.answerKey || row.answer_key || row.classification, items, groups) };
  }

  if (type === 'open_answer') {
    const source = row.prompts || row.items || row.questions;
    const prompts = arr(source).map((item, itemIndex) => {
      if (typeof item === 'string' || typeof item === 'number') return { id: `oa${itemIndex + 1}`, prompt: String(item).trim() };
      const q = obj(item) || {};
      const sample = str(q.sampleAnswer || q.sample_answer || q.answer || q.example);
      return {
        id: str(q.id || q.key) || `oa${itemIndex + 1}`,
        prompt: str(q.prompt || q.question || q.text || q.statement),
        ...(sample ? { sampleAnswer: sample } : {}),
      };
    });
    return { ...base, prompts };
  }

  if (type === 'speaking') {
    const sample = str(row.sampleAnswer || row.sample_answer || row.answer || row.example);
    return {
      ...base,
      prompt: str(row.prompt || row.question || row.text || row.task) || instruction,
      ...(strings(row.usefulLanguage || row.useful_language || row.phrases).length ? { usefulLanguage: strings(row.usefulLanguage || row.useful_language || row.phrases) } : {}),
      ...(strings(row.starters || row.sentenceStarters || row.sentence_starters).length ? { starters: strings(row.starters || row.sentenceStarters || row.sentence_starters) } : {}),
      ...(sample ? { sampleAnswer: sample } : {}),
    };
  }

  if (type === 'reading' || type === 'listening') {
    const prompt = str(row.prompt || row.question || row.text);
    return { ...base, ...(prompt ? { prompt } : {}) };
  }

  return { ...base };
}

export function normalizeLessonJson(value: unknown, fallbackTitle = 'Interactive lesson') {
  const root = obj(value);
  if (!root) return value;

  const rawResources = arr(root.resources || root.resource || root.sources);
  const resources = rawResources.map((item, index) => {
    const row = obj(item) || {};
    let type = str(row.type || row.kind).toLowerCase().replace(/[\s-]+/g, '_');
    if (type === 'source' || type === 'text_resource') type = 'text';
    if (type === 'rule' || type === 'grammar') type = 'reference';
    return {
      id: str(row.id || row.key) || `resource-${index + 1}`,
      type,
      title: str(row.title || row.name) || `Resource ${index + 1}`,
      ...(str(row.content || row.text) ? { content: str(row.content || row.text) } : {}),
      ...(str(row.url || row.fileUrl || row.file_url) ? { url: str(row.url || row.fileUrl || row.file_url) } : {}),
      ...(str(row.alt || row.description) ? { alt: str(row.alt || row.description) } : {}),
    };
  });
  const supportedDictationResources = new Set(resources
    .filter((resource) => resource.type === 'audio' || (resource.type === 'reference' && /teacher|dictation cue/i.test(resource.title)))
    .map((resource) => resource.id));

  const rawSections = Array.isArray(root.sections)
    ? root.sections
    : ['core', 'reserve', 'homework'].map((id) => ({ id, title: id.toUpperCase(), exercises: (obj(root.sections)?.[id] ?? root[id]) || [] }));

  const sections = rawSections.map((item, sectionIndex) => {
    const row = obj(item) || {};
    const rawId = str(row.id || row.key || row.name).toLowerCase();
    const id = rawId.includes('reserve') ? 'reserve' : rawId.includes('home') ? 'homework' : rawId.includes('core') ? 'core' : ['core', 'reserve', 'homework'][sectionIndex] || rawId;
    const exercises = arr(row.exercises || row.tasks || row.items)
      .map((exercise, exerciseIndex) => normalizeExercise(exercise, id, exerciseIndex, supportedDictationResources))
      .filter((exercise) => !!obj(exercise) && !!str(obj(exercise)?.type));
    return { id, title: str(row.title || row.name) || id.toUpperCase(), exercises };
  }).filter((section) => section.exercises.length > 0);

  return {
    version: Number(root.version) || 1,
    title: str(root.title || root.name) || fallbackTitle,
    resources,
    sections,
  };
}
