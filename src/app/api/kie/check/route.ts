import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';

function extractText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
    }
  }
  return '';
}

export async function POST() {
  if (!(await hasSession())) {
    return NextResponse.json({ ok: false, message: 'Нужен вход в Мастерскую.' }, { status: 401 });
  }

  const key = process.env.KIE_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ ok: false, message: 'KIE_API_KEY не найден в переменных Amvera.' }, { status: 503 });
  }

  try {
    const response = await fetch('https://api.kie.ai/codex/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-4',
        stream: false,
        input: [{
          role: 'user',
          content: [{ type: 'input_text', text: 'Reply exactly with: KIE OK' }],
        }],
        reasoning: { effort: 'low' },
      }),
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const msg = payload && typeof payload === 'object' && 'msg' in payload
        ? String((payload as { msg?: unknown }).msg || '')
        : '';
      return NextResponse.json({
        ok: false,
        message: msg ? `KIE ответил ошибкой: ${msg}` : `KIE ответил HTTP ${response.status}.`,
      }, { status: 502 });
    }

    const text = extractText(payload);
    const credits = payload && typeof payload === 'object' && 'credits_consumed' in payload
      ? Number((payload as { credits_consumed?: unknown }).credits_consumed)
      : null;

    return NextResponse.json({
      ok: true,
      message: text || 'KIE отвечает. Соединение работает.',
      credits: Number.isFinite(credits) ? credits : null,
    });
  } catch (error) {
    console.error('[kie] Проверка соединения не удалась:', error);
    return NextResponse.json({ ok: false, message: 'Не удалось связаться с KIE. Проверьте сеть и ключ.' }, { status: 502 });
  }
}
