import assert from 'node:assert/strict';
import fs from 'node:fs';
import { effectiveTeacherInstruction, normalizeTeacherInstruction } from '../src/lib/teacher-instruction-utils.ts';

assert.equal(normalizeTeacherInstruction('  Продолжаем по плану.  '), 'Продолжаем по плану.');
assert.equal(normalizeTeacherInstruction(null), '');
assert.equal(effectiveTeacherInstruction('Сегодня speaking', 'Старая заметка'), 'Сегодня speaking');
assert.equal(effectiveTeacherInstruction('', 'Старая заметка'), 'Старая заметка');

const preview = fs.readFileSync(new URL('../src/app/(private)/students/[studentId]/lesson-preview/page.tsx', import.meta.url), 'utf8');
assert.match(preview, /ConversationalLessonPrep/);
assert.match(preview, /Что Мастерская учтёт автоматически/);
assert.match(preview, /Подготовка без лишних настроек/);
assert.doesNotMatch(preview, /LessonPlanButton/);

const panel = fs.readFileSync(new URL('../src/app/(private)/ConversationalLessonPrep.tsx', import.meta.url), 'utf8');
assert.match(panel, /Что нужно сегодня\?/);
assert.match(panel, /как мне в чате/);
assert.match(panel, /Продолжаем по плану/);
assert.match(panel, /\/api\/lesson-focus/);
assert.match(panel, /\/api\/kie\/lesson-plan/);
assert.match(panel, /\/api\/kie\/lesson-package/);
assert.match(panel, /prepareEverything/);
assert.match(panel, /await requestPackage\(\)/);
assert.match(panel, /Подготовить урок/);
assert.match(panel, /Собираю материалы/);
assert.match(panel, /диагностику уже провели\. Начинаем с блока 1/i);

const focusRoute = fs.readFileSync(new URL('../src/app/api/lesson-focus/route.ts', import.meta.url), 'utf8');
assert.match(focusRoute, /INSERT INTO school_positions/);
assert.match(focusRoute, /ON CONFLICT \(enrollment_id\) DO UPDATE/);
assert.match(focusRoute, /normalizeTeacherInstruction/);

const learning = fs.readFileSync(new URL('../src/lib/student-learning-context.ts', import.meta.url), 'utf8');
assert.match(learning, /sp\.module, sp\.topic, sp\.note/);
assert.match(learning, /LEFT JOIN school_positions sp/);

const dashboard = fs.readFileSync(new URL('../src/app/(private)/page.tsx', import.meta.url), 'utf8');
assert.match(dashboard, /DashboardCalendar/);
assert.match(dashboard, /params\.date/);
assert.match(dashboard, /scheduledDate=\{targetDate\}/);
assert.match(dashboard, /На будущую дату можно готовить любой урок прямо из списка ниже/);

const calendar = fs.readFileSync(new URL('../src/app/(private)/DashboardCalendar.tsx', import.meta.url), 'utf8');
assert.match(calendar, /Показать уроки на дату/);
assert.match(calendar, /Можно открыть любой будущий день и подготовить уроки заранее/);
assert.match(calendar, /type="date"/);

const dashboardPlanButton = fs.readFileSync(new URL('../src/app/(private)/LessonPlanButton.tsx', import.meta.url), 'utf8');
assert.match(dashboardPlanButton, /scheduledDate\?: string/);
assert.match(dashboardPlanButton, /JSON\.stringify\(\{ enrollmentId, scheduledTime, scheduledDate \}\)/);

const planRoute = fs.readFileSync(new URL('../src/app/api/kie/lesson-plan/route.ts', import.meta.url), 'utf8');
assert.match(planRoute, /scheduledDate\?: string/);
assert.match(planRoute, /normalizeScheduledDate\(body\.scheduledDate\)/);
assert.match(planRoute, /scheduled_date=\$\{scheduledDate\}/);

const packageRoute = fs.readFileSync(new URL('../src/app/api/kie/lesson-package/route.ts', import.meta.url), 'utf8');
assert.match(packageRoute, /scheduledDate\?: string/);
assert.match(packageRoute, /normalizeScheduledDate\(body\.scheduledDate\)/);
assert.match(packageRoute, /scheduled_date=\$\{date\}/);

console.log('Conversational lesson preparation checks passed.');
