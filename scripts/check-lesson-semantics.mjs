import assert from 'node:assert/strict';
import { validateLessonJson } from '../src/lib/lesson-json.ts';
import { normalizeLessonJson } from '../src/lib/lesson-json-normalize.ts';

const speaking = (id, title, instruction, cues, extra = {}) => ({ id, type: 'speaking', title, instruction, prompt: instruction, usefulLanguage: cues, ...extra });
const gap = (id, title) => ({ id, type: 'gap_fill', title, instruction: title, text: '{{b1}}', blanks: [{ id: 'b1', answer: 'ink' }] });
const sort = (id, title) => ({ id, type: 'sort', title, instruction: title, items: [{ id: 'i1', label: 'ink' }], groups: [{ id: 'g1', label: 'short i' }], answers: { i1: 'g1' } });
const open = (id, title, instruction = title) => ({ id, type: 'open_answer', title, instruction, prompts: [{ id: 'p1', prompt: instruction }] });

const legacy = {
  version: 1,
  title: 'Alphabet Ii-Rr Review',
  resources: [{ id: 'reading-rules', type: 'reference', title: 'Reading rules', content: 'Ii says /ɪ/.' }],
  sections: [
    { id: 'core', title: 'CORE', exercises: [
      speaking('core-1', 'Look and say', 'Say the letters and words.', ['Ii — ink', 'Jj — jam'], { resourceId: 'source-book' }),
      gap('core-2', 'Complete the words'),
      speaking('core-3', 'Reading rules', 'Say the sounds and words.', ['Ii — /ɪ/ — ink'], { resourceId: 'reading-rules' }),
      speaking('core-4', 'Read the words aloud', 'Read the words aloud.', ['ink', 'jam']),
      speaking('core-5', 'Last-letter chain', 'Continue the last-letter chain.', ['red → dog', 'green → name']),
      speaking('core-6', 'Read the names', 'Read the names aloud.', ['Jim', 'Kate']),
      speaking('core-7', 'Dialogue', 'Act out the dialogue.', ['Nice to meet you.']),
      speaking('core-8', 'Introduce yourself', 'Introduce yourself.', ['My name is...']),
      speaking('core-9', 'Quick review', 'Say the letter, say the word, spell the word.', ['Ii — ink']),
    ] },
    { id: 'reserve', title: 'RESERVE', exercises: [
      speaking('reserve-1', 'Fast picture naming', 'Name the pictures quickly.', ['ink', 'jam'], { resourceId: 'source-book' }),
      speaking('reserve-2', 'First/last-letter game', 'Say the first letter and the last letter.', ['ink', 'jam']),
      sort('reserve-3', 'Sound focus'),
      open('reserve-4-dictation', 'Mini-dictation', 'Write the words you hear.'),
      sort('reserve-5', 'Names: boys and girls'),
      speaking('reserve-6', 'Personalisation', 'Talk about yourself.', ['My name is...']),
      speaking('reserve-7', 'Challenge reading', 'Read the words aloud.', ['kite', 'lion']),
    ] },
    { id: 'homework', title: 'HOMEWORK', exercises: [
      open('homework-1', 'Copy and spell'),
      gap('homework-2', 'Complete the words'),
      speaking('homework-3', 'Read aloud', 'Read the words aloud.', ['mouse', 'nest']),
      open('homework-4', 'Write greeting lines'),
      { id: 'homework-5', type: 'open_answer', title: 'Self-check', instruction: 'Tick the words you can spell without looking.', items: ['ink', 'jam'] },
    ] },
  ],
};

const normalized = normalizeLessonJson(legacy);
const [core, reserve, homework] = normalized.sections;
const all = normalized.sections.flatMap((section) => section.exercises);

assert.equal(all.length, 20);
assert.equal(core.exercises.length, 9);
assert.equal(reserve.exercises.length, 6);
assert.equal(homework.exercises.length, 5);
assert.equal(all.some((exercise) => exercise.id === 'reserve-4-dictation'), false);
assert.deepEqual(core.exercises.map((exercise) => exercise.type), ['oral_drill', 'gap_fill', 'oral_drill', 'oral_drill', 'oral_drill', 'oral_drill', 'speaking', 'speaking', 'oral_drill']);
assert.deepEqual(reserve.exercises.map((exercise) => exercise.type), ['oral_drill', 'oral_drill', 'sort', 'sort', 'speaking', 'oral_drill']);
assert.deepEqual(homework.exercises.map((exercise) => exercise.type), ['open_answer', 'gap_fill', 'oral_drill', 'open_answer', 'self_check']);
assert.equal(core.exercises.find((exercise) => exercise.title === 'Read the words aloud')?.type, 'oral_drill');
assert.equal(core.exercises.find((exercise) => exercise.title === 'Look and say')?.type, 'oral_drill');
assert.equal(core.exercises.find((exercise) => exercise.title === 'Introduce yourself')?.type, 'speaking');
assert.equal(core.exercises.find((exercise) => exercise.title === 'Dialogue')?.type, 'speaking');
assert.equal(homework.exercises.find((exercise) => exercise.title === 'Self-check')?.type, 'self_check');
for (const exercise of all.filter((item) => item.type === 'oral_drill')) {
  assert.ok(exercise.items.length > 0);
  assert.equal('usefulLanguage' in exercise, false);
}
for (const exercise of all.filter((item) => item.type === 'self_check')) assert.ok(exercise.items.length > 0);
assert.equal(validateLessonJson(normalized).ok, true);

const safetyLesson = normalizeLessonJson({ version: 1, title: 'Safety', resources: [], sections: [{ id: 'core', title: 'CORE', exercises: [{ id: 'safe-1', type: 'speaking', title: 'Read the words aloud', instruction: 'Read the words aloud.', prompt: 'Read the words aloud.' }] }] });
assert.equal(safetyLesson.sections[0].exercises[0].type, 'speaking');
assert.equal(validateLessonJson(safetyLesson).ok, true);

console.log('Lesson semantic regression: 21 mapped, 20 retained, validation OK');
