import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  chooseSourcePages,
  moduleRangeFromBrief,
  pagesForTextbookSection,
  textbookSectionFromReference,
} from '../src/lib/source-resolution-utils.ts';

const brief = `SPOTLIGHT 5 — MODULE BRIEF — MODULE 1: SCHOOL DAYS
MODULE: 1 — SCHOOL DAYS
SB pages: 25–34
KEEP LIVE CORE: 1a pp.26–27; 1b pp.28–29; productive listening/speaking core of 1c p.30.
Slot 04 — M1.1 SCHOOL CORE — pp.26–27.`;

assert.equal(textbookSectionFromReference('module 1a'), '1a');
assert.equal(textbookSectionFromReference('module1a'), '1a');
assert.deepEqual(moduleRangeFromBrief(brief), { start: 25, end: 34 });
assert.deepEqual(pagesForTextbookSection(brief, 'module1a'), { start: 26, end: 27 });
assert.deepEqual(pagesForTextbookSection(brief, '1b'), { start: 28, end: 29 });

assert.deepEqual(chooseSourcePages({
  explicitPages: { start: 14, end: 15 },
  planningPages: { start: 26, end: 27 },
  moduleRange: { start: 25, end: 34 },
}), { start: 26, end: 27 });

assert.deepEqual(chooseSourcePages({
  explicitPages: { start: 27, end: 27 },
  planningPages: { start: 26, end: 27 },
  moduleRange: { start: 25, end: 34 },
}), { start: 27, end: 27 });

const planRoute = fs.readFileSync(new URL('../src/app/api/kie/lesson-plan/route.ts', import.meta.url), 'utf8');
const packageRoute = fs.readFileSync(new URL('../src/app/api/kie/lesson-package/route.ts', import.meta.url), 'utf8');
const planningWrapper = fs.readFileSync(new URL('../src/lib/lesson-source-planning.ts', import.meta.url), 'utf8');
const planCss = fs.readFileSync(new URL('../src/app/(private)/ai-plan.css', import.meta.url), 'utf8');

assert.match(planRoute, /prepareLessonSourceWithPlanning/);
assert.match(planRoute, /planningGuidance\.moduleBrief\?\.text/);
assert.match(packageRoute, /prepareLessonSourceWithPlanning/);
assert.match(packageRoute, /planningGuidance\.moduleBrief\?\.text/);
assert.match(planningWrapper, /pagesForTextbookSection/);
assert.match(planningWrapper, /explicitInsideModule/);
assert.match(planCss, /\.ai-plan-text\{[^}]*font-size:14px/);

console.log('Lesson source resolution and AI-plan readability checks passed.');
