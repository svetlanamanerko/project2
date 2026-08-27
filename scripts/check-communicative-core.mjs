import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../db/migrations/008_communicative_core.sql', import.meta.url), 'utf8');
assert.match(migration, /CREATE TABLE IF NOT EXISTS communicative_topic_mastery/);
assert.match(migration, /answer_stage BETWEEN 1 AND 5/);
assert.match(migration, /'practising','recycle','mastered'/);
assert.match(migration, /UNIQUE\(enrollment_id, topic_key\)/);

const core = fs.readFileSync(new URL('../src/lib/communicative-core.ts', import.meta.url), 'utf8');
assert.match(core, /5–8 минут/);
assert.match(core, /3–5 устных вопросов/);
assert.match(core, /70%/);
assert.match(core, /30%/);
assert.match(core, /Writing Transfer/);
assert.match(core, /ОГЭ или ВПР/);
assert.match(core, /НЕ хардкодь номера заданий/);
assert.match(core, /speakingStageFromLevel/);
assert.match(core, /skill_profiles/);
assert.match(core, /communicative_topic_mastery/);

const routing = fs.readFileSync(new URL('../src/lib/ai-routing.ts', import.meta.url), 'utf8');
assert.match(routing, /purpose === 'communicative-warm-up'/);
assert.match(routing, /buildCommunicativeCorePrompt/);
assert.match(routing, /effectiveInput/);

const action = fs.readFileSync(new URL('../src/app/(private)/students/progress/communicative-actions.ts', import.meta.url), 'utf8');
assert.match(action, /INSERT INTO communicative_topic_mastery/);
assert.match(action, /skill_profiles/);
assert.match(action, /skill='speaking'/);
assert.match(action, /communicative_core/);
assert.match(action, /statusValue === 'mastered'/);

const progress = fs.readFileSync(new URL('../src/app/(private)/students/progress/ProgressRows.tsx', import.meta.url), 'utf8');
assert.match(progress, /saveCommunicativeTopicResult/);
assert.match(progress, /Communicative Core — результат речи/);
assert.match(progress, /Уровень ответа 1–5/);
assert.match(progress, /value="1"/);
assert.match(progress, /value="5"/);

const packageRoute = fs.readFileSync(new URL('../src/app/api/kie/lesson-package/route.ts', import.meta.url), 'utf8');
assert.match(packageRoute, /purpose: 'communicative-warm-up'/);
assert.match(packageRoute, /route: 'fast'/);
assert.match(packageRoute, /COMMUNICATIVE CORE/);

console.log('Communicative Core regression: fast speaking/writing layer, stage 1–5 and topic mastery OK');
