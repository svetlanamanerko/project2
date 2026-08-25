import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';
import { normalizeLessonJson } from '@/lib/lesson-json-normalize';
import { validateLessonJson, type LessonJsonV1 } from '@/lib/lesson-json';

function extractTextCandidates(payload: unknown) {
  const result: string[] = [];
  if (!payload || typeof payload !== 'object') return result;

  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === 'string' && direct.trim()) result.push(direct.trim());

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return result;
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) result.push(text.trim());
    }
  }
  return result;
}

function stripFence(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function parseJsonLoose(text: string): unknown | null {
  const cleaned = stripFence(text);
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    // KIE may add one short sentence before/after the JSON despite the prompt.
  }

  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as unknown;
    } catch {
      // Try array below.
    }
  }

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1)) as unknown;
    } catch {
      return null;
    }
  }
  return null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unwrapLessonJson(value: unknown) {
  let current = value;

  // Be liberal only about transport/wrapping. The strict validator still checks lesson semantics.
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current === 'string') {
      const parsed = parseJsonLoose(current);
      if (parsed == null) return current;
      current = parsed;
      continue;
    }

    if (Array.isArray(current)) {
      if (current.length === 1) {
        current = current[0];
        continue;
      }
      return current;
    }

    const row = object(current);
    if (!row) return current;

    // Already the direct Lesson JSON object.
    if ('sections' in row || ('version' in row && 'resources' in row)) return row;

    const wrappers = ['interactiveLesson', 'interactive_lesson', 'lesson', 'data', 'result', 'json'];
    const wrapper = wrappers.find((key) => key in row && row[key] != null);
    if (!wrapper) return row;
    current = row[wrapper];
  }

  return current;
}

function findValidLessonJson(payload: unknown, fallbackTitle: string): {
  lesson: LessonJsonV1 | null;
  issues: string[];
} {
  const candidates = extractTextCandidates(payload);
  let bestIssues: string[] = ['KIE не вернул JSON-объект урока'];

  // Final message/output is normally last, so inspect from the end first.
  for (const text of [...candidates].reverse()) {
    const parsed = parseJsonLoose(text);
    if (parsed == null) continue;
    const unwrapped = unwrapLessonJson(parsed);
    const normalized = normalizeLessonJson(unwrapped, fallbackTitle);
    const checked = validateLessonJson(normalized);
    if (checked.ok) return { lesson: checked.lesson, issues: [] };
    if (checked.issues.length > bestIssues.length || bestIssues[0] === 'KIE не вернул JSON-объект урока') {
      bestIssues = checked.issues;
    }
  }

  return { lesson: null, issues: bestIssues };
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
    const existing = validateLessonJson(normalizeLessonJson(unwrapLessonJson(lesson.interactiveJson), lesson.title));
    if (existing.ok) return NextResponse.json({ ok: true, ready: true, alreadyReady: true, credits: 0 });
  }

  const prompt = `Преобразуй УЖЕ ГОТОВЫЙ урок английского в структурированный Lesson JSON версии 1. НЕ переписывай и не расширяй методическое содержание. Твоя задача только правильно разложить существующие задания по интерактивным типам и перенести answer keys из Teacher Pack.\n\nTITLE:\n${lesson.title}\n\nCORE:\n${lesson.studentWorksheet}\n\nRESERVE:\n${lesson.reserve}\n\nHOMEWORK:\n${lesson.homework}\n\nTEACHER PACK / ANSWER KEYS:\n${lesson.teacherPack}\n\nПРАВИЛА ОТВЕТА:\n- Верни ТОЛЬКО ОДИН JSON-ОБЪЕКТ. Первый символ ответа {, последний символ }.\n- НЕ добавляй внешнюю обёртку interactiveLesson, data, result или lesson.\n- Корневые ключи ровно: version, title, resources, sections.\n- version=1; sections: core/reserve/homework. Пустую секцию можно не включать.\n- Только type: gap_fill, dropdown, true_false_ns, multiple_choice, matching, sort, open_answer, speaking, reading.\n- gap_fill: text с {{b1}} маркерами; blanks [{id,answer,options?}], wordBank при наличии банка.\n- dropdown: items [{id,before,after?,options,answer}], answer обязательно один из options.\n- true_false_ns: answer только true/false/ns.\n- multiple_choice: options [{id,label}], answerId — id правильного варианта.\n- matching: leftItems/rightItems [{id,label}], pairs как leftId:rightId.\n- sort: items/groups [{id,label}], answers как itemId:groupId.\n- open_answer: prompts [{id,prompt,sampleAnswer?}].\n- speaking: prompt, usefulLanguage, starters, sampleAnswer.\n- reading: если для задания нужен исходный учебник/текст, ставь resourceId="source-book".\n- Если инструкция говорит Look at the picture / по картинке / по странице учебника — resourceId="source-book".\n- Не создавай listening: аудио-движок ещё не подключён. Если в готовом уроке есть Listen, пока представь его как reading/open_answer только если задание можно честно выполнить без аудио; иначе пропусти из интерактивной версии.\n- Не выдумывай answer key. Если в Teacher Pack нет объективного ответа, используй open_answer/speaking.\n- У каждого упражнения уникальные id/title/instruction.\n- resources могут содержать только созданные тобой text/reference resources с content. source-book в resources НЕ добавляй.\n\nПРИМЕР КОРНЯ (только форма, не копируй содержание):\n{"version":1,"title":"Lesson","resources":[],"sections":[{"id":"core","title":"CORE","exercises":[]}]}`;

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

    const found = findValidLessonJson(payload, lesson.title);
    if (!found.lesson) {
      console.error('[interactive-repair] validator issues:', found.issues);
      return NextResponse.json({
        ok: false,
        message: 'Интерактивный JSON снова требует корректировки. Word-пакет сохранён; покажите это сообщение в чате.',
        issues: found.issues.slice(0, 12),
      }, { status: 422 });
    }

    await sql`
      UPDATE lesson_packages SET interactive_json=${JSON.stringify(found.lesson)}::jsonb,
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
