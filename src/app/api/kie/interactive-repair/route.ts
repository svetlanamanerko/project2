import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';
import { normalizeLessonJson, unwrapLessonJson } from '@/lib/lesson-json-normalize';
import { validateLessonJson, type LessonJsonV1 } from '@/lib/lesson-json';
import { buildInteractiveRepairPrompt } from '@/lib/lesson-json-prompt';
import { generateKieText, KieRequestError } from '@/lib/ai-routing';

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

function findValidLessonJson(payload: unknown, fallbackTitle: string): {
  lesson: LessonJsonV1 | null;
  issues: string[];
} {
  const candidates = extractTextCandidates(payload);
  let bestIssues: string[] = ['KIE не вернул JSON-объект урока'];

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

  const prompt = buildInteractiveRepairPrompt({
    title: lesson.title,
    studentWorksheet: lesson.studentWorksheet,
    reserve: lesson.reserve,
    homework: lesson.homework,
    teacherPack: lesson.teacherPack,
  });

  try {
    const result = await generateKieText({
      route: 'fast',
      key,
      purpose: 'interactive-repair',
      input: [{ type: 'input_text', text: prompt }],
    });
    const found = findValidLessonJson({ output_text: result.text }, lesson.title);
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

    return NextResponse.json({ ok: true, ready: true, alreadyReady: false, credits: result.credits });
  } catch (error) {
    console.error('[interactive-repair] failed:', error);
    return NextResponse.json({
      ok: false,
      message: error instanceof KieRequestError ? error.message : 'Не удалось подготовить интерактивную версию.',
    }, { status: 502 });
  }
}
