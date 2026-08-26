import assert from 'node:assert/strict';
import { generateKieText, getAiModel, isClaudeModel } from '../src/lib/ai-routing.ts';
import { aggregateRecordedCredits, fetchKieBalance, parseKieBalance, sumRecordedCredits } from '../src/lib/ai-usage-utils.ts';
import fs from 'node:fs';

const previous = {
  fast: process.env.AI_FAST_MODEL,
  standard: process.env.AI_STANDARD_MODEL,
  analysis: process.env.AI_ANALYSIS_MODEL,
};

try {
  delete process.env.AI_FAST_MODEL;
  delete process.env.AI_STANDARD_MODEL;
  delete process.env.AI_ANALYSIS_MODEL;
  assert.equal(getAiModel('fast'), 'gpt-5-6-luna');
  assert.equal(getAiModel('standard'), 'gpt-5-4');
  assert.equal(getAiModel('analysis'), 'claude-sonnet-4-5');
  assert.equal(isClaudeModel(getAiModel('fast')), false);
  assert.equal(isClaudeModel(getAiModel('analysis')), true);

  process.env.AI_FAST_MODEL = 'custom-fast-model';
  process.env.AI_STANDARD_MODEL = 'custom-standard-model';
  process.env.AI_ANALYSIS_MODEL = 'claude-custom-analysis';
  assert.equal(getAiModel('fast'), 'custom-fast-model');
  assert.equal(getAiModel('standard'), 'custom-standard-model');
  assert.equal(getAiModel('analysis'), 'claude-custom-analysis');
} finally {
  for (const [key, value] of Object.entries(previous)) {
    const envKey = `AI_${key.toUpperCase()}_MODEL`;
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
}

console.log('AI routing regression: fast / standard / analysis configuration OK');

assert.equal(parseKieBalance({ code: 200, data: 123.45 }), 123.45);
assert.equal(parseKieBalance({ code: 500, data: 123.45 }), null);
const balance = await fetchKieBalance('test-key', async (url, init) => {
  assert.equal(url, 'https://api.kie.ai/api/v1/chat/credit');
  assert.equal(init?.method, 'GET');
  assert.equal(init?.headers?.Authorization, 'Bearer test-key');
  return new Response(JSON.stringify({ code: 200, msg: 'success', data: 87.25 }), { status: 200 });
});
assert.equal(balance, 87.25);
await assert.rejects(() => fetchKieBalance('test-key', async () => new Response(
  JSON.stringify({ code: 503, msg: 'temporary failure' }),
  { status: 503 },
)));

const recorded = [];
const usageRecorder = async (usage) => { recorded.push(usage); };
for (const route of ['fast', 'standard', 'analysis']) {
  const fetcher = async () => new Response(JSON.stringify(route === 'analysis'
    ? { content: [{ type: 'text', text: 'OK' }], credits_consumed: 0.03 }
    : { output: [{ content: [{ text: 'OK' }] }], credits_consumed: route === 'fast' ? 0.01 : 0.02 }), { status: 200 });
  await generateKieText({ route, key: 'test', purpose: `${route}-test`, input: [{ type: 'input_text', text: 'test' }], fetcher, usageRecorder });
}
assert.deepEqual(recorded.map((item) => item.route), ['fast', 'standard', 'analysis']);
assert.deepEqual(recorded.map((item) => item.model), ['gpt-5-6-luna', 'gpt-5-4', 'claude-sonnet-4-5']);
assert.equal(sumRecordedCredits(recorded), 0.06);
assert.deepEqual(aggregateRecordedCredits([
  { createdAt: new Date('2026-08-26T08:00:00Z'), creditsConsumed: 0.01 },
  { createdAt: new Date('2026-08-25T08:00:00Z'), creditsConsumed: 0.02 },
  { createdAt: new Date('2026-07-31T08:00:00Z'), creditsConsumed: 9 },
  { createdAt: new Date('2026-08-26T09:00:00Z'), creditsConsumed: null },
], new Date('2026-08-26T12:00:00Z')), { today: 0.01, month: 0.03 });

await assert.rejects(() => generateKieText({
  route: 'fast', key: 'test', purpose: 'failed-test', input: [{ type: 'input_text', text: 'test' }],
  fetcher: async () => new Response(JSON.stringify({ msg: 'temporary failure' }), { status: 503 }), usageRecorder,
}));
const failed = recorded.at(-1);
assert.equal(failed.status, 'error');
assert.equal(failed.creditsConsumed, null);

const usageSource = fs.readFileSync(new URL('../src/lib/ai-usage.ts', import.meta.url), 'utf8');
assert.match(usageSource, /date_trunc\('month'/);
const settingsSource = fs.readFileSync(new URL('../src/app/(private)/settings/page.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(settingsSource, /generateKieText/);
assert.match(settingsSource, /getKieBalanceStatus/);
assert.match(settingsSource, /Временно недоступен/);
assert.match(settingsSource, /Статистика начнёт собираться с этого момента/);
console.log('AI usage regression: balance, recording, failures and settings rendering OK');
