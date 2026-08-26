import assert from 'node:assert/strict';
import { getAiModel, isClaudeModel } from '../src/lib/ai-routing.ts';

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
