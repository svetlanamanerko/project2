import assert from 'node:assert/strict';
import { normalizeLessonJson } from '../src/lib/lesson-json-normalize.ts';

const exercises = [
  { id: 'a', type: 'speaking', title: 'Read the words aloud', instruction: 'Read the words aloud.', prompt: 'Read aloud.', usefulLanguage: ['Ii — ink', 'Jj — jam'] },
  { id: 'b', type: 'speaking', title: 'Look and say', instruction: 'Say the letters and words.', prompt: 'Say the letters and words.', usefulLanguage: ['Ii — ink'] },
  { id: 'c', type: 'speaking', title: 'Introduce yourself', instruction: 'Introduce yourself.', prompt: 'Introduce yourself.', usefulLanguage: ['My name is...'] },
  { id: 'd', type: 'speaking', title: 'Dialogue', instruction: 'Act out the dialogue.', prompt: 'Act out the dialogue.', usefulLanguage: ['Nice to meet you.'] },
  { id: 'e', type: 'open_answer', title: 'Self-check', instruction: 'Tick the words you can spell without looking.', items: ['ink', 'jam'] },
];

const lesson = normalizeLessonJson({ version: 1, title: 'Alphabet Ii-Rr Review', resources: [], sections: [{ id: 'core', title: 'CORE', exercises }] });
const mapped = lesson.sections[0].exercises;

assert.deepEqual(mapped.map((exercise) => exercise.type), ['oral_drill', 'oral_drill', 'speaking', 'speaking', 'self_check']);
assert.deepEqual(mapped[0].items.map((item) => item.label), ['Ii — ink', 'Jj — jam']);
assert.equal('usefulLanguage' in mapped[0], false);
console.log('Lesson semantic regression: OK');
