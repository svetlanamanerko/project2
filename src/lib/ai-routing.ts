export type AiRoute = 'fast' | 'standard' | 'analysis';

type AiUsageRecord = {
  route: AiRoute;
  model: string;
  purpose: string;
  creditsConsumed: number | null;
  studentId: string | null;
  enrollmentId: string | null;
  status: 'success' | 'error';
  errorMessage: string | null;
};

export type AiUsageRecorder = (record: AiUsageRecord) => Promise<void>;

export type KieInputPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_file'; file_url: string };

const DEFAULT_MODELS: Record<AiRoute, string> = {
  fast: 'gpt-5-6-luna',
  standard: 'gpt-5-4',
  analysis: 'claude-sonnet-4-5',
};

const MODEL_ENV: Record<AiRoute, 'AI_FAST_MODEL' | 'AI_STANDARD_MODEL' | 'AI_ANALYSIS_MODEL'> = {
  fast: 'AI_FAST_MODEL',
  standard: 'AI_STANDARD_MODEL',
  analysis: 'AI_ANALYSIS_MODEL',
};

function normalizeCredits(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const credits = Number(value);
  return Number.isFinite(credits) && credits >= 0 ? credits : null;
}

export function getAiModel(route: AiRoute) {
  return process.env[MODEL_ENV[route]]?.trim() || DEFAULT_MODELS[route];
}

export class KieRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'KieRequestError';
    this.status = status;
  }
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text.trim();
      }
    }
  }
  return '';
}

function claudeText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { type?: string; text: string } => Boolean(
      part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string',
    ))
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function errorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === 'object') {
    const value = (payload as { msg?: unknown; message?: unknown; error?: unknown }).msg
      || (payload as { message?: unknown }).message
      || (payload as { error?: unknown }).error;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return `KIE ответил HTTP ${status}.`;
}

export async function generateKieText({
  route,
  key,
  input,
  purpose,
  studentId = null,
  enrollmentId = null,
  timeoutMs = 45_000,
  fetcher = fetch,
  usageRecorder,
}: {
  route: AiRoute;
  key: string;
  input: KieInputPart[];
  purpose: string;
  studentId?: string | null;
  enrollmentId?: string | null;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  usageRecorder?: AiUsageRecorder;
}) {
  const model = getAiModel(route);
  const recorder = usageRecorder || (async (record: AiUsageRecord) => {
    const usage = await import('@/lib/ai-usage');
    await usage.recordAiUsage(record);
  });
  const record = async (status: 'success' | 'error', creditsConsumed: number | null, errorMessage: string | null) => {
    try {
      await recorder({ route, model, purpose, creditsConsumed, studentId, enrollmentId, status, errorMessage });
    } catch (error) {
      console.error('[ai-routing] Failed to record AI usage:', error);
    }
  };

  let credits: number | null = null;
  try {
    if (route === 'fast' && isClaudeModel(model)) {
      throw new KieRequestError('AI_FAST_MODEL не может указывать на Claude: быстрые задания должны использовать fast-generation route.', 500);
    }
    const analysis = route === 'analysis';
    const response = await fetcher(
      analysis ? 'https://api.kie.ai/claude/v1/messages' : 'https://api.kie.ai/codex/v1/responses',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(analysis ? {
          model,
          messages: [{ role: 'user', content: input.filter((part) => part.type === 'input_text').map((part) => part.text).join('\n\n') }],
          thinkingFlag: true,
          stream: false,
          max_tokens: 4096,
        } : {
          model,
          stream: false,
          input: [{ role: 'user', content: input }],
          reasoning: { effort: 'low' },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    const payload = await response.json().catch(() => null);
    credits = normalizeCredits(payload && typeof payload === 'object'
      ? (payload as { credits_consumed?: unknown }).credits_consumed
      : null);
    if (!response.ok) throw new KieRequestError(errorMessage(payload, response.status), response.status);
    const text = analysis ? claudeText(payload) : responseText(payload);
    if (!text) throw new KieRequestError('KIE ответил без текста.');
    await record('success', credits, null);
    return { text, credits, model, route };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown KIE error';
    await record('error', credits, message);
    throw error;
  }
}

export function isClaudeModel(model: string) {
  return model.trim().toLowerCase().startsWith('claude');
}
