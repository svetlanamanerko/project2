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
  analysis: 'gpt-5-4',
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
  readonly providerMessage: string | null;
  readonly safeDetails: string | null;

  constructor(message: string, status = 502, providerMessage: string | null = null) {
    super(message);
    this.name = 'KieRequestError';
    this.status = status;
    this.providerMessage = providerMessage;
    this.safeDetails = providerMessage;
  }
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const responseItem = item as { type?: unknown; content?: unknown };
    if (typeof responseItem.type === 'string' && responseItem.type !== 'message') continue;
    const content = responseItem.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const outputPart = part as { type?: unknown; text?: unknown };
      if (typeof outputPart.type === 'string' && outputPart.type !== 'output_text') continue;
      if (typeof outputPart.text === 'string' && outputPart.text.trim()) return outputPart.text.trim();
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

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function kieProviderErrorMessage(payload: unknown, fallbackText = '') {
  if (payload && typeof payload === 'object') {
    const object = payload as { msg?: unknown; message?: unknown; error?: unknown };
    const direct = stringValue(object.msg) || stringValue(object.message) || stringValue(object.error);
    if (direct) return direct;
    if (object.error && typeof object.error === 'object') {
      const nested = object.error as { message?: unknown; type?: unknown; code?: unknown };
      const parts = [stringValue(nested.message), stringValue(nested.type), stringValue(nested.code)].filter(Boolean);
      if (parts.length) return [...new Set(parts)].join(' · ');
    }
  }
  return stringValue(fallbackText);
}

async function boundedResponseText(response: Response, maxChars = 1_600) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  try {
    while (result.length < maxChars) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return result.slice(0, maxChars).trim();
}

function safeProviderDetails(value: string | null, key: string, input: KieInputPart[]) {
  if (!value) return null;
  let safe = value.replaceAll(key, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  const promptText = input.filter((part) => part.type === 'input_text').map((part) => part.text).join('\n');
  if (promptText && safe.includes(promptText)) safe = safe.replaceAll(promptText, '[prompt redacted]');
  const sensitiveTokens = [...new Set(promptText.match(/[\p{L}\p{N}@._-]{2,}/gu) || [])]
    .sort((a, b) => b.length - a.length)
    .slice(0, 1_000);
  for (const token of sensitiveTokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    safe = safe.replace(new RegExp(escaped, 'giu'), '[redacted]');
  }
  return safe.replace(/\s+/g, ' ').trim().slice(0, 600) || null;
}

function retryableAnalysisStatus(route: AiRoute, status: number) {
  return route === 'analysis' && [500, 502, 503, 504].includes(status);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  retryDelayMs = 1_500,
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
  retryDelayMs?: number;
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
    const claudeTransport = isClaudeModel(model);
    const url = claudeTransport ? 'https://api.kie.ai/claude/v1/messages' : 'https://api.kie.ai/codex/v1/responses';
    const body = JSON.stringify(claudeTransport ? {
      model,
      messages: [{ role: 'user', content: input.filter((part) => part.type === 'input_text').map((part) => part.text).join('\n\n') }],
      thinkingFlag: true,
      stream: false,
      max_tokens: 4096,
    } : {
      model,
      stream: false,
      input: [{ role: 'user', content: input }],
      reasoning: { effort: analysis ? 'high' : 'low' },
    });
    const maxAttempts = analysis ? 2 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetcher(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      let payload: unknown = null;
      let fallbackText = '';
      if (response.ok) {
        payload = await response.json().catch(() => null);
      } else {
        const boundedText = await boundedResponseText(response);
        try { payload = JSON.parse(boundedText); } catch { fallbackText = boundedText; }
      }
      const attemptCredits = normalizeCredits(payload && typeof payload === 'object'
        ? (payload as { credits_consumed?: unknown }).credits_consumed
        : null);
      if (attemptCredits !== null) credits = (credits ?? 0) + attemptCredits;

      if (!response.ok) {
        const providerMessage = safeProviderDetails(kieProviderErrorMessage(payload, fallbackText), key, input);
        const requestError = new KieRequestError(`KIE ответил HTTP ${response.status}.`, response.status, providerMessage);
        if (attempt < maxAttempts && retryableAnalysisStatus(route, response.status)) {
          console.warn('[ai-routing] KIE analysis retrying', { route, model, purpose, status: response.status, provider: providerMessage || 'details unavailable' });
          await delay(retryDelayMs);
          continue;
        }
        throw requestError;
      }

      const text = claudeTransport ? claudeText(payload) : responseText(payload);
      if (!text) throw new KieRequestError('KIE ответил без текста.');
      await record('success', credits, null);
      return { text, credits, model, route };
    }
    throw new KieRequestError('KIE analysis exhausted retry attempts.');
  } catch (error) {
    const message = error instanceof KieRequestError
      ? `${error.message}${error.safeDetails ? ` Provider: ${error.safeDetails}` : ''}`
      : error instanceof Error ? error.message : 'Unknown KIE error';
    await record('error', credits, message);
    if (error instanceof KieRequestError) {
      console.error(`[ai-routing] KIE ${route} failed`, { route, model, purpose, status: error.status, provider: error.safeDetails || 'details unavailable' });
    } else {
      console.error(`[ai-routing] KIE ${route} failed`, { route, model, purpose, status: null, provider: error instanceof Error ? error.name : 'unknown error' });
    }
    throw error;
  }
}

export function isClaudeModel(model: string) {
  return model.trim().toLowerCase().startsWith('claude');
}
