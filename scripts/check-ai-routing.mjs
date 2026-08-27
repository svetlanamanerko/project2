import assert from 'node:assert/strict';
import { generateKieText, getAiModel, isClaudeModel, kieProviderErrorMessage, KieRequestError } from '../src/lib/ai-routing.ts';
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
  assert.equal(getAiModel('analysis'), 'gpt-5-4');
  assert.equal(isClaudeModel(getAiModel('fast')), false);
  assert.equal(isClaudeModel(getAiModel('analysis')), false);

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
  const fetcher = async () => new Response(JSON.stringify({
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }],
    credits_consumed: route === 'fast' ? 0.01 : route === 'standard' ? 0.02 : 0.03,
  }), { status: 200 });
  await generateKieText({ route, key: 'test', purpose: `${route}-test`, input: [{ type: 'input_text', text: 'test' }], fetcher, usageRecorder });
}
assert.deepEqual(recorded.map((item) => item.route), ['fast', 'standard', 'analysis']);
assert.deepEqual(recorded.map((item) => item.model), ['gpt-5-6-luna', 'gpt-5-4', 'gpt-5-4']);
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

const transportRequests = [];
const transportFetcher = async (url, init) => {
  transportRequests.push({ url, body: JSON.parse(init.body) });
  return new Response(JSON.stringify({
    output: [
      { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Internal reasoning summary' }] },
      { type: 'message', content: [{ type: 'output_text', text: 'Visible answer' }] },
    ],
  }), { status: 200 });
};
const analysisResponse = await generateKieText({
  route: 'analysis', key: 'test', purpose: 'transport-analysis', input: [{ type: 'input_text', text: 'test' }],
  fetcher: transportFetcher, usageRecorder: async () => undefined,
});
await generateKieText({
  route: 'standard', key: 'test', purpose: 'transport-standard', input: [{ type: 'input_text', text: 'test' }],
  fetcher: transportFetcher, usageRecorder: async () => undefined,
});
await generateKieText({
  route: 'fast', key: 'test', purpose: 'transport-fast', input: [{ type: 'input_text', text: 'test' }],
  fetcher: transportFetcher, usageRecorder: async () => undefined,
});
assert.equal(analysisResponse.text, 'Visible answer');
assert.equal(transportRequests[0].url, 'https://api.kie.ai/codex/v1/responses');
assert.equal(transportRequests[0].body.model, 'gpt-5-4');
assert.equal(transportRequests[0].body.reasoning.effort, 'high');
assert.equal(transportRequests[1].body.reasoning.effort, 'low');
assert.equal(transportRequests[2].body.model, 'gpt-5-6-luna');
assert.equal(transportRequests[2].body.reasoning.effort, 'low');

const savedAnalysisModel = process.env.AI_ANALYSIS_MODEL;
process.env.AI_ANALYSIS_MODEL = 'claude-sonnet-4-5';
try {
  let claudeRequest;
  const overridden = await generateKieText({
    route: 'analysis', key: 'test', purpose: 'claude-override', input: [{ type: 'input_text', text: 'test' }],
    fetcher: async (url, init) => {
      claudeRequest = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Claude answer' }] }), { status: 200 });
    },
    usageRecorder: async () => undefined,
  });
  assert.equal(overridden.text, 'Claude answer');
  assert.equal(claudeRequest.url, 'https://api.kie.ai/claude/v1/messages');
  assert.equal(claudeRequest.body.thinkingFlag, true);
} finally {
  if (savedAnalysisModel === undefined) delete process.env.AI_ANALYSIS_MODEL;
  else process.env.AI_ANALYSIS_MODEL = savedAnalysisModel;
}

assert.equal(kieProviderErrorMessage({ error: { message: 'Upstream overloaded', type: 'server_error', code: 'overload' } }), 'Upstream overloaded · server_error · overload');
assert.equal(kieProviderErrorMessage({ msg: 'Direct message' }), 'Direct message');

const originalWarn = console.warn;
const originalError = console.error;
const diagnosticLogs = [];
console.warn = (...args) => diagnosticLogs.push(args);
console.error = (...args) => diagnosticLogs.push(args);
try {
  let retry500Calls = 0;
  const retry500Usage = [];
  const recovered = await generateKieText({
    route: 'analysis', key: 'super-secret-kie-key', purpose: 'history_bootstrap',
    input: [{ type: 'input_text', text: 'Student Alice private context and lesson history' }], retryDelayMs: 0,
    fetcher: async () => {
      retry500Calls += 1;
      return retry500Calls === 1
        ? new Response(JSON.stringify({ error: { message: 'Failure for Student Alice with super-secret-kie-key', type: 'server_error', code: '500' } }), { status: 500 })
        : new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Recovered' }] }], credits_consumed: 0.04 }), { status: 200 });
    },
    usageRecorder: async (usage) => retry500Usage.push(usage),
  });
  assert.equal(retry500Calls, 2);
  assert.equal(recovered.text, 'Recovered');
  assert.equal(retry500Usage.length, 1);
  assert.equal(retry500Usage[0].status, 'success');

  let retry503Calls = 0;
  const retry503Usage = [];
  await assert.rejects(() => generateKieText({
    route: 'analysis', key: 'test-key', purpose: 'history_bootstrap', input: [{ type: 'input_text', text: 'private prompt' }], retryDelayMs: 0,
    fetcher: async () => { retry503Calls += 1; return new Response(JSON.stringify({ error: { message: 'Temporarily unavailable' } }), { status: 503 }); },
    usageRecorder: async (usage) => retry503Usage.push(usage),
  }), (error) => error instanceof KieRequestError && error.status === 503 && error.providerMessage === 'Temporarily unavailable');
  assert.equal(retry503Calls, 2);
  assert.equal(retry503Usage.length, 1);
  assert.equal(retry503Usage[0].status, 'error');
  assert.equal(retry503Usage[0].creditsConsumed, null);

  for (const status of [400, 401]) {
    let calls = 0;
    await assert.rejects(() => generateKieText({
      route: 'analysis', key: 'test-key', purpose: 'no-retry-test', input: [{ type: 'input_text', text: 'private prompt' }], retryDelayMs: 0,
      fetcher: async () => { calls += 1; return new Response(JSON.stringify({ error: { message: 'Request rejected' } }), { status }); },
      usageRecorder: async () => undefined,
    }), (error) => error instanceof KieRequestError && error.status === status);
    assert.equal(calls, 1);
  }

  let textErrorCalls = 0;
  await assert.rejects(() => generateKieText({
    route: 'analysis', key: 'test-key', purpose: 'text-error-test', input: [{ type: 'input_text', text: 'private prompt' }], retryDelayMs: 0,
    fetcher: async () => { textErrorCalls += 1; return new Response(`temporary provider failure ${'x'.repeat(3000)}`, { status: 500, headers: { 'content-type': 'text/plain' } }); },
    usageRecorder: async () => undefined,
  }), (error) => error instanceof KieRequestError && Boolean(error.safeDetails) && error.safeDetails.length <= 600);
  assert.equal(textErrorCalls, 2);
} finally {
  console.warn = originalWarn;
  console.error = originalError;
}
const serializedLogs = JSON.stringify(diagnosticLogs);
assert.doesNotMatch(serializedLogs, /super-secret-kie-key|Student Alice|private context|lesson history/);
assert.match(serializedLogs, /history_bootstrap/);
assert.match(serializedLogs, /gpt-5-4/);

const usageSource = fs.readFileSync(new URL('../src/lib/ai-usage.ts', import.meta.url), 'utf8');
assert.match(usageSource, /date_trunc\('month'/);
const settingsSource = fs.readFileSync(new URL('../src/app/(private)/settings/page.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(settingsSource, /generateKieText/);
assert.match(settingsSource, /getKieBalanceStatus/);
assert.match(settingsSource, /Временно недоступен/);
assert.match(settingsSource, /Статистика начнёт собираться с этого момента/);
const adviceSource = fs.readFileSync(new URL('../src/lib/student-advice.ts', import.meta.url), 'utf8');
assert.match(adviceSource, /route: 'analysis'/);
console.log('AI usage regression: balance, recording, failures and settings rendering OK');
