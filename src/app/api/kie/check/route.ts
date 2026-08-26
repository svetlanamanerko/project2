import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { generateKieText, KieRequestError } from '@/lib/ai-routing';

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
    const result = await generateKieText({
      route: 'fast',
      key,
      input: [{ type: 'input_text', text: 'Reply exactly with: KIE OK' }],
    });

    return NextResponse.json({
      ok: true,
      message: result.text || 'KIE отвечает. Соединение работает.',
      credits: result.credits,
    });
  } catch (error) {
    console.error('[kie] Проверка соединения не удалась:', error);
    return NextResponse.json({
      ok: false,
      message: error instanceof KieRequestError ? error.message : 'Не удалось связаться с KIE. Проверьте сеть и ключ.',
    }, { status: 502 });
  }
}
