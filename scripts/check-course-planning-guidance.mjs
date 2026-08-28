import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  compactPlanningText,
  isPlanningGuidanceFolder,
  isPlanningGuidancePath,
  moduleBriefScore,
  moduleNumberFromIntent,
  ogeBlockNumberFromIntent,
  ogeTechnologicalMapScore,
  planningDocumentKind,
} from '../src/lib/course-planning-guidance-utils.ts';

assert.equal(planningDocumentKind('01 FEDERAL BASELINE — SPOTLIGHT 5'), 'federal-baseline');
assert.equal(planningDocumentKind('02 ASSESSMENT MAP — SPOTLIGHT 5'), 'assessment-map');
assert.equal(planningDocumentKind('03 COURSE PRIORITY MAP — SPOTLIGHT 5'), 'course-priority-map');
assert.equal(planningDocumentKind('05 MODULE BRIEF — MODULE 1 — SCHOOL DAYS'), 'module-brief');
assert.equal(planningDocumentKind('Starlight 9 — COURSE MAP 2026-2027'), 'course-map');
assert.equal(planningDocumentKind('00 OGE NAVIGATOR BASELINE — 2026-2027'), 'oge-navigator-baseline');
assert.equal(planningDocumentKind('01 OGE MASTER CURRICULUM MAP — 72 LESSONS — 2026-2027'), 'oge-master-curriculum');
assert.equal(planningDocumentKind('02 OGE STUDENT ROUTE SYSTEM — 2026-2027'), 'oge-student-route');
assert.equal(planningDocumentKind('03 NAVIGATOR COVERAGE AUDIT — 13 THEMES · 47 SUBTOPICS · 1735 TASKS — 2026-2027'), 'oge-coverage-audit');
assert.equal(planningDocumentKind('04 OGE FIPI BANK COMPLETION PLAN — 1735 QID — SEP-MAY 2026-2027'), 'oge-bank-completion');
assert.equal(planningDocumentKind('OGE — Block 3 — TECHNOLOGICAL MAP — Holidays & Travel'), 'oge-technological-map');
assert.equal(planningDocumentKind('Spotlight 5 — Student Book.pdf'), null);

assert.equal(isPlanningGuidancePath('00 COURSE BASELINE / 01 FEDERAL BASELINE'), true);
assert.equal(isPlanningGuidancePath('00 CURRICULUM MAP / 01 OGE MASTER CURRICULUM MAP'), true);
assert.equal(isPlanningGuidancePath('SOURCE / Student Book.pdf'), false);
assert.equal(isPlanningGuidanceFolder('00 COURSE BASELINE'), true);
assert.equal(isPlanningGuidanceFolder('01 COURSE MAP'), true);
assert.equal(isPlanningGuidanceFolder('00 CURRICULUM MAP'), true);
assert.equal(isPlanningGuidanceFolder('SOURCE BOOKS'), false);
assert.equal(moduleNumberFromIntent({ stage: 'Module 1', lesson: 'M1.4 GRAMMAR → SPEAK' }), 1);
assert.equal(moduleNumberFromIntent({ stage: 'module 1a' }), 1);
assert.equal(moduleNumberFromIntent({ stage: 'Module 10b' }), 10);
assert.equal(moduleNumberFromIntent({ topic: 'M7.2 Clothes' }), 7);
assert.equal(moduleNumberFromIntent({ topic: 'School' }), null);
assert.equal(ogeBlockNumberFromIntent({ stage: 'Block 3', lesson: 'Lesson 18' }), 3);
assert.equal(ogeBlockNumberFromIntent({ lesson: '17 — Why We Travel' }), 3);
assert.equal(ogeBlockNumberFromIntent({ lesson: '56 — Jobs & Careers' }), 8);
assert.equal(ogeBlockNumberFromIntent({ stage: 'Entry Diagnostic' }), null);
assert.ok(moduleBriefScore('05 MODULE BRIEF — MODULE 1 — SCHOOL DAYS', 1) > moduleBriefScore('05 MODULE BRIEF — MODULE 2 — THAT’S ME', 1));
assert.equal(moduleBriefScore('04 MODULE BRIEF — TEMPLATE — SPOTLIGHT 5', 1), 0);
assert.equal(moduleBriefScore('05 MODULE BRIEF — MODULE 1 — SCHOOL DAYS', null), 0);
assert.equal(ogeTechnologicalMapScore('OGE — Block 3 — TECHNOLOGICAL MAP — Holidays & Travel', 3), 100);
assert.equal(ogeTechnologicalMapScore('OGE — Block 3 — TECHNOLOGICAL MAP — Holidays & Travel', 4), 0);

const starlightMapFixture = `STARLIGHT 9 — COURSE MAP\nРАМКА КУРСА\nMODULE 1 — LIFESTYLES — SB pp. 7–21\n02 — WAYS OF LIVING\n03 — CUSTOMS\nMODULE 2 — EXTREME FACTS — SB pp. 27–41\n07 — EXTREME PEOPLE`;
const compactCourseMap = compactPlanningText('course-map', starlightMapFixture, 1);
assert.match(compactCourseMap, /SB pp\. 7–21/);
assert.match(compactCourseMap, /02 — WAYS OF LIVING/);
assert.doesNotMatch(compactCourseMap, /EXTREME PEOPLE/);

const priorityFixture = `HEADER\nPRIORITY RULES\nCORE / HOME\nD. MODULE 1 — SCHOOL DAYS — BUDGET 6\nM1 KEEP LIVE CORE\nM1 HOME duplicate drills\nE. MODULE 2 — THAT'S ME — BUDGET 5\nM2 ONLY\nN. FEDERAL GAP MAP — NON-NEGOTIABLE\nFG1 M2–M3\nO. HOME / SKIP DECISION RULE\nend`;
const compactPriority = compactPlanningText('course-priority-map', priorityFixture, 1);
assert.match(compactPriority, /M1 KEEP LIVE CORE/);
assert.doesNotMatch(compactPriority, /M2 ONLY/);
assert.match(compactPriority, /FEDERAL GAP MAP/);

const assessmentFixture = `VPR 2027\nListening Reading Grammar Email\nPC1 — school subjects and to be\nPC2 — countries\nD. TEST BOOKLET\nTEST 1 — SCHOOL DAYS\nGrammar: a\/an, to be\nPriority: item bank\nTEST 2 — THAT'S ME\nGrammar: have got\nE. SIX MAJOR EVIDENCE POINTS`;
const compactAssessment = compactPlanningText('assessment-map', assessmentFixture, 1);
assert.match(compactAssessment, /PC1/);
assert.match(compactAssessment, /TEST 1/);
assert.doesNotMatch(compactAssessment, /Grammar: have got/);

const ogeMasterFixture = `OGE MASTER CURRICULUM MAP\n72 LESSONS × 60 MINUTES\nПРИНЦИП УРОКА\nTheme + Exam + Language\nBLOCK 1 — FAMILY — LESSONS 02–08\n02 — Family Entry\n08 — Performance\nBLOCK 2 — HOBBIES — LESSONS 09–15\n09 — Hobbies Entry\n15 — Performance\nBLOCK 3 — HOLIDAYS & TRAVEL — LESSONS 17–24\n17 — Why We Travel\n18 — Travel Language Lab\n24 — Final Performance\nBLOCK 4 — HEALTH — LESSONS 25–31\n25 — Health Entry`;
const compactOgeMaster = compactPlanningText('oge-master-curriculum', ogeMasterFixture, null, 3);
assert.match(compactOgeMaster, /72 LESSONS/);
assert.match(compactOgeMaster, /BLOCK 3/);
assert.match(compactOgeMaster, /18 — Travel Language Lab/);
assert.doesNotMatch(compactOgeMaster, /25 — Health Entry/);

const contextSource = fs.readFileSync(new URL('../src/lib/lesson-context.ts', import.meta.url), 'utf8');
assert.match(contextSource, /getCoursePlanningGuidance/);
assert.match(contextSource, /planningGuidance/);
assert.match(contextSource, /planningStatus/);
assert.match(contextSource, /ogeMasterCurriculum/);

const materialsSource = fs.readFileSync(new URL('../src/lib/relevant-course-materials.ts', import.meta.url), 'utf8');
assert.match(materialsSource, /isPlanningGuidancePath/);

const planRoute = fs.readFileSync(new URL('../src/app/api/kie/lesson-plan/route.ts', import.meta.url), 'utf8');
assert.match(planRoute, /OGE Navigator Baseline/);
assert.match(planRoute, /OGE Master Curriculum/);
assert.match(planRoute, /OGE Student Route/);
assert.match(planRoute, /Technological Map текущего блока/);
assert.match(planRoute, /не заставляет каждого ученика механически проходить все 72 позиции/);
assert.match(planRoute, /QID\/ZID/);
assert.match(planRoute, /HOME \/ SHORTEN/);
assert.match(planRoute, /Course Map определяет фактическое место ученика/);

const previewSource = fs.readFileSync(new URL('../src/app/(private)/students/[studentId]/lesson-preview/page.tsx', import.meta.url), 'utf8');
assert.match(previewSource, /OGE Planning/);
assert.match(previewSource, /Методическая база ОГЭ/);
assert.match(previewSource, /planningGuidance\.ogeMasterCurriculum/);
assert.match(previewSource, /planningGuidance\.ogeTechnologicalMap/);
assert.match(previewSource, /planningGuidance\.moduleBrief/);
assert.match(previewSource, /planningGuidance\.courseMap/);

console.log('Course planning guidance checks passed.');
