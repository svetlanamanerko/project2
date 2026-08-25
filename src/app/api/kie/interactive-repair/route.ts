import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';
import { normalizeLessonJson } from '@/lib/lesson-json-normalize';
import { validateLessonJson } from '@/lib/lesson-json';

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
        return (part as { text: string }).text.trim();
      }
    }
  }
  return '';
}

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(cleaned.slice(first, last + 1)) as unknown; } catch { return null; }
}

export async function POST(request: Request) {
  if (!(await hasSession())) return NextResponse.json({ ok: false, message: 'Нужен вход в Мастерскую.' }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ ok: false, message: 'PostgreSQL не подключена.' }, { status: 503 });
  const key = process.env.KIE_API_KEY?.trim();
  if (!key) return NextResponse.json({ ok: false, message: 'KIE_API_KEY не найден.' }, { status: 503 });

  const body = await request.json().catch(() => ({})) as { lessonId?: string; force?: boolean };
  const lessonId = String(body.lessonId || '').trim();
  if (!lessonId) return NextResponse.json({ ok: false, message: 'Не выбран урок.' }, { status: 400 });

  const sql = db();
  const rows = await sql<Array<{
    title: string;
    studentWorksheet: string;
    teacherPack: string;
    reserve: string;
    homework: string;
    vocabularyBank: string;
    interactiveJson: unknown;
  }>>`
    SELECT title,
           student_worksheet as "studentWorksheet",
           teacher_pack as "teacherPack",
           reserve,
           homework,
           vocabulary_bank as "vocabularyBank",
           interactive_json as "interactiveJson"
    FROM lesson_packages WHERE lesson_id=${lessonId} LIMIT 1
  `;
  const lesson = rows[0];
  if (!lesson) return NextResponse.json({ ok: false, message: 'Готовый пакет урока не найден.' }, { status: 404 });

  if (lesson.interactiveJson && !body.force) {
    const existing = validateLessonJson(normalizeLessonJson(lesson.interactiveJson, lesson.title));
    if (existing.ok) return NextResponse.json({ ok: true, ready: true, alreadyReady: true, credits: 0 });
  }

  const prompt = `Преобразуй УЖЕ ГОТОВЫЙ урок английского в структурированный interactiveLesson JSON версии 1. НЕ переписывай и не расширяй методическое содержание. Твоя задача только правильно разложить существующие задания по интерактивным типам и перенести answer keys из Teacher Pack.\n\nTITLE:\n${lesson.title}\n\nCORE:\n${lesson.studentWorksheet}\n\nRESERVE:\n${lesson.reserve}\n\nHOMEWORK:\n${lesson.homework}\n\nTEACHER PACK / ANSWER KEYS:\n${lesson.teacherPack}\n\nПРАВИЛА:\n- Верни ТОЛЬКО объект interactiveLesson, без markdown.\n- version=1; sections: core/reserve/homework. Пустую секцию можно не включать.\n- Только type: gap_fill, dropdown, true_false_ns, multiple_choice, matching, sort, open_answer, speaking, reading.\n- gap_fill: text с {{b1}} маркерами; blanks [{id,answer,options?}], wordBank при наличии банка.\n- dropdown: items [{id,before,after?,options,answer}], answer обязательно один из options.\n- true_false_ns: answer только true/false/ns.\n- multiple_choice: options [{id,label}], answerId — id правильного варианта.\n- matching: leftItems/rightItems [{id,label}], pairs как leftId:rightId.\n- sort: items/groups [{id,label}], answers как itemId:groupId.\n- open_answer: prompts [{id,prompt,sampleAnswer?}].\n- speaking: prompt, usefulLanguage, starters, sampleAnswer.\n- reading: если для задания нужен исходный учебник/текст, ставь resourceId="source-book".\n- Если инструкция говорит Look at the picture / по картинке / по странице учебника — resourceId="source-book".\n- Не создавай listening: аудио-движок ещё не подключён. Если в готовом уроке есть Listen, пока представь его как reading/open_answer только если задание можно честно выполнить без аудио; иначе пропусти из интерактивной версии.\n- Не выдумывай answer key. Если в Teacher Pack нет объективного ответа, используй open_answer/speaking.\n- У каждого упражнения уникальные id/title/instruction.\n- resources могут содержать только созданные тобой text/reference resources с content. source-book в resources НЕ добавляй.`;

  try {
    const response = await fetch('https://api.kie.ai/codex/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5-4',
        stream: false,
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
        reasoning: { effort: 'low' },
      }),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const msg = payload && typeof payload === 'object' && 'msg' in payload ? String((payload as { msg?: unknown }).msg || '') : '';
      return NextResponse.json({ ok: false, message: msg || `KIE ответил HTTP ${response.status}.` }, { status: 502 });
    }

    const raw = extractText(payload);
    const parsed = parseJson(raw);
    const candidate = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'interactiveLesson' in (parsed as Record<string, unknown>)
      ? (parsed as Record<string, unknown>).interactiveLesson
      : parsed;
    const normalized = normalizeLessonJson(candidate, lesson.title);
    const checked = validateLessonJson(normalized);
    if (!checked.ok) {
      console.error('[interactive-repair] validator issues:', checked.issues);
      return NextResponse.json({
        ok: false,
        message: 'Интерактивный JSON снова требует корректировки. Я сохранил Word-пакет; покажите это сообщение в чате.',
        issues: checked.issues.slice(0, 12),
      }, { status: 422 });
    }

    await sql`
      UPDATE lesson_packages SET interactive_json=${JSON.stringify(checked.lesson)}::jsonb,
        interactive_generated_at=now(), updated_at=now()
      WHERE lesson_id=${lessonId}
    `;

    const creditsRaw = payload && typeof payload === 'object' && 'credits_consumed' in payload
      ? Number((payload as { credits_consumed?: unknown }).credits_consumed) : null;
    const credits = Number.isFinite(creditsRaw) ? creditsRaw : null;
    return NextResponse.json({ ok: true, ready: true, alreadyReady: false, credits });
  } catch (error) {
    console.error('[interactive-repair] failed:', error);
    return NextResponse.json({ ok: false, message: 'Не удалось подготовить интерактивную версию.' }, { status: 502 });
  }
}
