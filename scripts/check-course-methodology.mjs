import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  courseMethodologyPrompt,
  getCourseMethodology,
  mergeCourseMethodology,
} from '../src/lib/course-profile.ts';

const original = { pdfPageOffset: 4, pageOffset: 7, source: { folder: 'drive-id' } };
const spotlight = mergeCourseMethodology(original, 'Учебник — каркас урока.');
const starlight = mergeCourseMethodology({ pdfPageOffset: 2 }, 'Больше устной практики.');

assert.equal(getCourseMethodology(spotlight), 'Учебник — каркас урока.');
assert.equal(getCourseMethodology(starlight), 'Больше устной практики.');
assert.equal(getCourseMethodology(original), null);
assert.deepEqual(
  { pdfPageOffset: spotlight.pdfPageOffset, pageOffset: spotlight.pageOffset, source: spotlight.source },
  original,
);
assert.match(courseMethodologyPrompt(spotlight), /^МЕТОДИКА КУРСА:\nУчебник/);

const actionSource = fs.readFileSync(new URL('../src/app/(private)/actions.ts', import.meta.url), 'utf8');
assert.match(actionSource, /export async function updateCourseMethodology/);
assert.match(actionSource, /SELECT course_profile as "courseProfile"/);
assert.match(actionSource, /mergeCourseMethodology\(courses\[0\]\.courseProfile, methodology\)/);
assert.match(actionSource, /course_profile=\$\{JSON\.stringify\(courseProfile\)\}::jsonb/);
assert.match(actionSource, /\[course-methodology\] save failed/);
assert.match(actionSource, /WHERE id=\$\{courseId\} AND active=true/);
assert.match(actionSource, /revalidatePath\(`\/courses\/\$\{courseId\}`\)/);

for (const route of ['lesson-plan', 'lesson-package']) {
  const source = fs.readFileSync(new URL(`../src/app/api/kie/${route}/route.ts`, import.meta.url), 'utf8');
  assert.match(source, /courseMethodologyPrompt\(context\.courseProfile\)/);
  assert.match(source, /Текущие реальные данные ученика важнее/);
  assert.match(source, /не заменяет student context/);
}

const pageSource = fs.readFileSync(new URL('../src/app/(private)/courses/[courseId]/page.tsx', import.meta.url), 'utf8');
assert.match(pageSource, /Методика курса пока не заполнена/);
assert.match(pageSource, /updateCourseMethodology/);
assert.doesNotMatch(pageSource, /generateKieText/);

assert.doesNotMatch(actionSource.slice(
  actionSource.indexOf('export async function updateCourseMethodology'),
  actionSource.indexOf('export async function updateCourseSource'),
), /student_course_positions|course_map_items/);

console.log('Course methodology regression checks passed.');
