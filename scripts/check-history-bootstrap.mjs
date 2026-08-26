import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  classifyHistoricalMaterial,
  evidenceFingerprint,
  extractHistoricalReferences,
  findingFingerprint,
  isSourceBook,
  parseHistoryBootstrapAnalysis,
} from '../src/lib/history-bootstrap-utils.ts';

const studentSpecific = classifyHistoricalMaterial({
  id: 'student-file', title: 'Lesson 04 — Student Worksheet',
  path: 'Spotlight 4 / Глеб / Module 3 / Lesson 04 — Student Worksheet', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}, 'Глеб');
const shared = classifyHistoricalMaterial({
  id: 'shared-file', title: 'Module 3A — Worksheet', path: 'Spotlight 4 / Shared / Module 3A — Worksheet', mimeType: 'application/pdf',
}, 'Глеб');
assert.equal(studentSpecific?.association, 'student_specific');
assert.equal(studentSpecific?.confidence, 'high');
assert.equal(shared?.association, 'shared_candidate');
assert.notEqual(shared?.confidence, 'high');
assert.equal(classifyHistoricalMaterial({ id: 'book', title: 'Student Book.pdf', path: 'Spotlight 4 / Student Book.pdf', mimeType: 'application/pdf' }, 'Глеб'), null);
assert.equal(classifyHistoricalMaterial({ id: 'keys', title: 'Workbook Keys.pdf', path: 'Spotlight 4 / Workbook Keys.pdf', mimeType: 'application/pdf' }, 'Глеб'), null);
assert.equal(isSourceBook('Course Map curriculum.pdf'), true);
assert.deepEqual(extractHistoricalReferences('Module 3 / Unit 2 / L04 / pp. 14-15'), {
  stages: ['Module 3', 'Unit 2'], lessons: ['Lesson 4'], pages: ['14–15'],
});

const parsed = parseHistoryBootstrapAnalysis(JSON.stringify({
  summary: 'Найдены материалы',
  findings: [{ key: 'one', stage: 'Module 3', lesson: '3a', topic: 'My day', pages: '14–15', grammar: ['Present Simple'], vocabulary: ['daily routine'], skills: ['Speaking'], coverageSummary: 'Тема встречалась', sourceRefs: [{ id: 'student-file', title: 'Worksheet', path: 'Глеб / Lesson 04' }], confidence: 'high', association: 'student_specific' }],
  currentPositionCandidate: { stage: 'Module 3', lesson: '3a', confidence: 'medium', reason: 'Последний файл' },
  questions: [{ id: 'repeat', type: 'repeat', text: 'Нужно повторить?', options: [{ value: 'needs_repeat', label: 'Нужно повторить' }], relatedFindingKeys: ['one'] }],
}));
assert.equal(parsed?.findings.length, 1);
assert.equal(parsed?.questions.length, 1);
assert.equal(evidenceFingerprint('enrollment-a', [{ id: 'a' }, { id: 'b' }]), evidenceFingerprint('enrollment-a', [{ id: 'b' }, { id: 'a' }]));
assert.notEqual(evidenceFingerprint('enrollment-a', [{ id: 'a' }]), evidenceFingerprint('enrollment-b', [{ id: 'a' }]));
assert.notEqual(findingFingerprint('enrollment-a', parsed.findings[0]), findingFingerprint('enrollment-b', parsed.findings[0]));

const driveSource = fs.readFileSync(new URL('../src/lib/historical-course-materials.ts', import.meta.url), 'utf8');
assert.match(driveSource, /c\.drive_folder_id as "folderId"/);
assert.match(driveSource, /WHERE e\.id=\$\{enrollmentId\} AND e\.student_id=\$\{studentId\}/);
assert.match(driveSource, /MAX_REQUESTS = 30/);
assert.match(driveSource, /MAX_FILES = 400/);
assert.match(driveSource, /MAX_SNIPPET_FILES = 8/);
assert.match(driveSource, /MAX_TOTAL_SNIPPET_CHARS = 12_000/);
assert.match(driveSource, /application\/vnd\.google-apps\.document/);
assert.doesNotMatch(driveSource, /getGoogleDriveCourseFolders|getRelevantCourseMaterials/);

const serviceSource = fs.readFileSync(new URL('../src/lib/history-bootstrap.ts', import.meta.url), 'utf8');
assert.match(serviceSource, /route: 'analysis'/);
assert.match(serviceSource, /purpose: 'history_bootstrap'/);
assert.match(serviceSource, /INSERT INTO history_bootstrap_runs/);
assert.doesNotMatch(serviceSource, /INSERT INTO historical_coverage/);
assert.doesNotMatch(serviceSource, /UPDATE student_course_positions|UPDATE skill_profiles|student_course_stage_statuses/);
assert.match(serviceSource, /status='rejected'/);

const actionsSource = fs.readFileSync(new URL('../src/app/(private)/actions.ts', import.meta.url), 'utf8');
const runAction = actionsSource.match(/export async function generateHistoryBootstrapAction[\s\S]*?(?=\nexport async function)/)?.[0] || '';
const confirmAction = actionsSource.match(/export async function confirmHistoryBootstrapAction[\s\S]*?(?=\nexport async function)/)?.[0] || '';
assert.match(runAction, /runHistoryBootstrap\(studentId, enrollmentId\)/);
assert.match(confirmAction, /INSERT INTO historical_coverage/);
assert.match(confirmAction, /included \? 'confirmed' : 'rejected'/);
assert.match(confirmAction, /history_bootstrap/);
assert.doesNotMatch(confirmAction, /UPDATE student_course_positions|UPDATE skill_profiles|course_map_items/);
assert.match(confirmAction, /\['needs_repeat', 'repeat', 'нужно повторить'\]/);
assert.match(confirmAction, /NOT EXISTS/);

const pageSource = fs.readFileSync(new URL('../src/app/(private)/students/[studentId]/page.tsx', import.meta.url), 'utf8');
assert.match(pageSource, /action=\{generateHistoryBootstrapAction\}/);
assert.match(pageSource, /action=\{confirmHistoryBootstrapAction\}/);
assert.match(pageSource, /Старые материалы ещё не анализировались/);
assert.doesNotMatch(pageSource, /getCourseHistoricalMaterialCandidates|generateKieText/);

const learningSource = fs.readFileSync(new URL('../src/lib/student-learning-context.ts', import.meta.url), 'utf8');
assert.match(learningSource, /h\.status='confirmed'/);
assert.match(learningSource, /usedMaterialsByEnrollment/);
assert.doesNotMatch(learningSource.match(/historicalCoverage[\s\S]*?usedQids/)?.[0] || '', /status='rejected'/);
const contextSource = fs.readFileSync(new URL('../src/lib/lesson-context.ts', import.meta.url), 'utf8');
assert.match(contextSource, /usedMaterialsByEnrollment\[course\.enrollmentId\]/);
assert.match(contextSource, /historicalCoverage: studentProgress\.historicalCoverage\.filter/);

const migration = fs.readFileSync(new URL('../db/migrations/007_history_bootstrap.sql', import.meta.url), 'utf8');
assert.match(migration, /UNIQUE\(enrollment_id, fingerprint\)/);
assert.match(migration, /CHECK \(status IN \('confirmed','rejected'\)\)/);

console.log('History bootstrap regression checks passed.');
