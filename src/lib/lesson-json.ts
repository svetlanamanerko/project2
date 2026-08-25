export const LESSON_JSON_VERSION = 1 as const;

export type LessonSectionId = 'core' | 'reserve' | 'homework';
export type LessonResourceType = 'text' | 'reference' | 'image' | 'audio' | 'pdf';
export type LessonExerciseType =
  | 'gap_fill'
  | 'dropdown'
  | 'true_false_ns'
  | 'multiple_choice'
  | 'matching'
  | 'sort'
  | 'open_answer'
  | 'speaking'
  | 'reading'
  | 'listening';

export type LessonResource = {
  id: string;
  type: LessonResourceType;
  title: string;
  content?: string;
  url?: string;
  alt?: string;
};

type ExerciseBase = {
  id: string;
  type: LessonExerciseType;
  title: string;
  instruction: string;
  resourceId?: string;
};

export type GapFillExercise = ExerciseBase & {
  type: 'gap_fill';
  text: string;
  blanks: Array<{ id: string; answer: string; options?: string[] }>;
  wordBank?: string[];
};

export type DropdownExercise = ExerciseBase & {
  type: 'dropdown';
  items: Array<{
    id: string;
    before: string;
    after?: string;
    options: string[];
    answer: string;
  }>;
};

export type TrueFalseNsExercise = ExerciseBase & {
  type: 'true_false_ns';
  items: Array<{ id: string; statement: string; answer: 'true' | 'false' | 'ns' }>;
};

export type MultipleChoiceExercise = ExerciseBase & {
  type: 'multiple_choice';
  items: Array<{
    id: string;
    question: string;
    options: Array<{ id: string; label: string }>;
    answerId: string;
  }>;
};

export type MatchingExercise = ExerciseBase & {
  type: 'matching';
  leftItems: Array<{ id: string; label: string }>;
  rightItems: Array<{ id: string; label: string }>;
  pairs: Record<string, string>;
};

export type SortExercise = ExerciseBase & {
  type: 'sort';
  items: Array<{ id: string; label: string }>;
  groups: Array<{ id: string; label: string }>;
  answers: Record<string, string>;
};

export type OpenAnswerExercise = ExerciseBase & {
  type: 'open_answer';
  prompts: Array<{ id: string; prompt: string; sampleAnswer?: string }>;
};

export type SpeakingExercise = ExerciseBase & {
  type: 'speaking';
  prompt: string;
  usefulLanguage?: string[];
  starters?: string[];
  sampleAnswer?: string;
};

export type ReadingExercise = ExerciseBase & {
  type: 'reading';
  prompt?: string;
};

export type ListeningExercise = ExerciseBase & {
  type: 'listening';
  prompt?: string;
};

export type LessonExercise =
  | GapFillExercise
  | DropdownExercise
  | TrueFalseNsExercise
  | MultipleChoiceExercise
  | MatchingExercise
  | SortExercise
  | OpenAnswerExercise
  | SpeakingExercise
  | ReadingExercise
  | ListeningExercise;

export type LessonSection = {
  id: LessonSectionId;
  title: string;
  exercises: LessonExercise[];
};

export type LessonJsonV1 = {
  version: typeof LESSON_JSON_VERSION;
  title: string;
  resources: LessonResource[];
  sections: LessonSection[];
};

const exerciseTypes = new Set<LessonExerciseType>([
  'gap_fill',
  'dropdown',
  'true_false_ns',
  'multiple_choice',
  'matching',
  'sort',
  'open_answer',
  'speaking',
  'reading',
  'listening',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value.map((item) => item.trim()).filter(Boolean)
    : null;
}

function nonEmptyArray(value: unknown) {
  return Array.isArray(value) && value.length > 0 ? value : null;
}

function validIdLabelArray(value: unknown) {
  const items = nonEmptyArray(value);
  return !!items && items.every((item) => {
    const obj = record(item);
    return !!obj && !!text(obj.id) && !!text(obj.label);
  });
}

function validateExercise(value: unknown, issues: string[], path: string) {
  const exercise = record(value);
  if (!exercise) {
    issues.push(`${path}: упражнение должно быть объектом`);
    return;
  }
  const id = text(exercise.id);
  const type = text(exercise.type) as LessonExerciseType;
  if (!id) issues.push(`${path}: нет id`);
  if (!exerciseTypes.has(type)) issues.push(`${path}: неизвестный type ${type || '—'}`);
  if (!text(exercise.title)) issues.push(`${path}: нет title`);
  if (!text(exercise.instruction)) issues.push(`${path}: нет instruction`);

  if (type === 'gap_fill') {
    if (!text(exercise.text)) issues.push(`${path}: gap_fill без text`);
    const blanks = nonEmptyArray(exercise.blanks);
    if (!blanks || !blanks.every((item) => {
      const blank = record(item);
      return !!blank && !!text(blank.id) && !!text(blank.answer) &&
        (blank.options == null || stringArray(blank.options) !== null);
    })) issues.push(`${path}: gap_fill без корректных blanks`);
    if (exercise.wordBank != null && stringArray(exercise.wordBank) === null) {
      issues.push(`${path}: wordBank должен быть массивом строк`);
    }
  }

  if (type === 'dropdown') {
    const items = nonEmptyArray(exercise.items);
    if (!items || !items.every((item) => {
      const obj = record(item);
      const options = obj ? stringArray(obj.options) : null;
      return !!obj && !!text(obj.id) && !!text(obj.before) && !!options?.length && !!text(obj.answer) && options.includes(text(obj.answer));
    })) issues.push(`${path}: dropdown без корректных items/options/answer`);
  }

  if (type === 'true_false_ns') {
    const items = nonEmptyArray(exercise.items);
    if (!items || !items.every((item) => {
      const obj = record(item);
      return !!obj && !!text(obj.id) && !!text(obj.statement) && ['true', 'false', 'ns'].includes(text(obj.answer));
    })) issues.push(`${path}: true_false_ns без корректных items`);
  }

  if (type === 'multiple_choice') {
    const items = nonEmptyArray(exercise.items);
    if (!items || !items.every((item) => {
      const obj = record(item);
      if (!obj || !text(obj.id) || !text(obj.question) || !text(obj.answerId)) return false;
      const options = nonEmptyArray(obj.options);
      if (!options) return false;
      const ids = options.map((option) => text(record(option)?.id)).filter(Boolean);
      return options.every((option) => {
        const opt = record(option);
        return !!opt && !!text(opt.id) && !!text(opt.label);
      }) && ids.includes(text(obj.answerId));
    })) issues.push(`${path}: multiple_choice без корректных items/options`);
  }

  if (type === 'matching') {
    if (!validIdLabelArray(exercise.leftItems) || !validIdLabelArray(exercise.rightItems)) {
      issues.push(`${path}: matching должен иметь leftItems и rightItems`);
    }
    const pairs = record(exercise.pairs);
    if (!pairs || !Object.keys(pairs).length || !Object.values(pairs).every((item) => typeof item === 'string' && item.trim())) {
      issues.push(`${path}: matching без pairs`);
    }
  }

  if (type === 'sort') {
    if (!validIdLabelArray(exercise.items) || !validIdLabelArray(exercise.groups)) {
      issues.push(`${path}: sort должен иметь items и groups`);
    }
    const answers = record(exercise.answers);
    if (!answers || !Object.keys(answers).length || !Object.values(answers).every((item) => typeof item === 'string' && item.trim())) {
      issues.push(`${path}: sort без answers`);
    }
  }

  if (type === 'open_answer') {
    const prompts = nonEmptyArray(exercise.prompts);
    if (!prompts || !prompts.every((item) => {
      const obj = record(item);
      return !!obj && !!text(obj.id) && !!text(obj.prompt);
    })) issues.push(`${path}: open_answer без prompts`);
  }

  if (type === 'speaking' && !text(exercise.prompt)) {
    issues.push(`${path}: speaking без prompt`);
  }

  if ((type === 'reading' || type === 'listening') && !text(exercise.resourceId)) {
    issues.push(`${path}: ${type} требует resourceId`);
  }
}

export function validateLessonJson(value: unknown): { ok: true; lesson: LessonJsonV1 } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const root = record(value);
  if (!root) return { ok: false, issues: ['interactiveLesson должен быть объектом'] };
  if (Number(root.version) !== LESSON_JSON_VERSION) issues.push('version должен быть 1');
  if (!text(root.title)) issues.push('interactiveLesson.title обязателен');

  const resourceIds = new Set<string>();
  if (!Array.isArray(root.resources)) issues.push('resources должен быть массивом');
  else root.resources.forEach((raw, index) => {
    const resource = record(raw);
    if (!resource) {
      issues.push(`resources[${index}] должен быть объектом`);
      return;
    }
    const id = text(resource.id);
    const type = text(resource.type);
    if (!id) issues.push(`resources[${index}]: нет id`);
    else if (resourceIds.has(id)) issues.push(`resources[${index}]: повтор id ${id}`);
    else resourceIds.add(id);
    if (!['text', 'reference', 'image', 'audio', 'pdf'].includes(type)) issues.push(`resources[${index}]: неизвестный type ${type}`);
    if (!text(resource.title)) issues.push(`resources[${index}]: нет title`);
    if ((type === 'text' || type === 'reference') && !text(resource.content)) issues.push(`resources[${index}]: ${type} требует content`);
    if ((type === 'image' || type === 'audio' || type === 'pdf') && !text(resource.url)) issues.push(`resources[${index}]: ${type} требует url`);
  });

  const sections = nonEmptyArray(root.sections);
  if (!sections) issues.push('sections должен быть непустым массивом');
  else {
    const sectionIds = new Set<string>();
    const exerciseIds = new Set<string>();
    sections.forEach((raw, index) => {
      const section = record(raw);
      const path = `sections[${index}]`;
      if (!section) {
        issues.push(`${path} должен быть объектом`);
        return;
      }
      const id = text(section.id);
      if (!['core', 'reserve', 'homework'].includes(id)) issues.push(`${path}: id должен быть core/reserve/homework`);
      if (sectionIds.has(id)) issues.push(`${path}: повтор section id ${id}`);
      sectionIds.add(id);
      if (!text(section.title)) issues.push(`${path}: нет title`);
      const exercises = nonEmptyArray(section.exercises);
      if (!exercises) {
        issues.push(`${path}: нет exercises`);
        return;
      }
      exercises.forEach((exercise, exerciseIndex) => {
        const exerciseObject = record(exercise);
        const exerciseId = exerciseObject ? text(exerciseObject.id) : '';
        if (exerciseId && exerciseIds.has(exerciseId)) issues.push(`${path}.exercises[${exerciseIndex}]: повтор id ${exerciseId}`);
        if (exerciseId) exerciseIds.add(exerciseId);
        validateExercise(exercise, issues, `${path}.exercises[${exerciseIndex}]`);
      });
    });
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, lesson: value as LessonJsonV1 };
}

export function objectiveExercise(type: LessonExerciseType) {
  return ['gap_fill', 'dropdown', 'true_false_ns', 'multiple_choice', 'matching', 'sort'].includes(type);
}
