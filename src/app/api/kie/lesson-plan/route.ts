import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';

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

function todayString() {
  const zone = process.env.APP_TIMEZONE || 'Europe/Moscow';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function POST(request: Request) {
  if (!(await hasSession())) {
    return NextResponse.json({ ok: false, message: 'Нужен вход в Мастерскую.' }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, message: 'PostgreSQL не подключена.' }, { status: 503 });
  }
  const key = process.env.KIE_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ ok: false, message: 'KIE_API_KEY не найден.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { enrollmentId?: string };
  const enrollmentId = String(body.enrollmentId || '').trim();
  if (!enrollmentId) {
    return NextResponse.json({ ok: false, message: 'Не выбран ученик.' }, { status: 400 });
  }

  const sql = db();
  const contextRows = await sql<Array<{
    student: string;
    grade: number | null;
    course: string;
    module: string | null;
    topic: string | null;
    note: string | null;
  }>>`
    SELECT s.display_name as student, s.school_grade as grade, c.title as course,
           sp.module, sp.topic, sp.note
    FROM enrollments e
    JOIN students s ON s.id=e.student_id
    JOIN courses c ON c.id=e.course_id
    LEFT JOIN school_positions sp ON sp.enrollment_id=e.id
    WHERE e.id=${enrollmentId} AND e.active=true
    LIMIT 1
  `;
  const context = contextRows[0];
  if (!context) {
    return NextResponse.json({ ok: false, message: 'Маршрут ученика не найден.' }, { status: 404 });
  }

  const recycling = await sql<Array<{ label: string; category: string }>>`
    SELECT label, category FROM recycling_items
    WHERE enrollment_id=${enrollmentId} AND status='active'
    ORDER BY priority ASC, created_at ASC LIMIT 6
  `;
  const urgent = await sql<Array<{ description: string; detectedTopic: string | null }>>`
    SELECT description, detected_topic as "detectedTopic" FROM urgent_requests
    WHERE enrollment_id=${enrollmentId} AND status <> 'done'
    ORDER BY created_at DESC LIMIT 3
  `;
  const skills = await sql<Array<{ skill: string; level: number; note: string | null }>>`
    SELECT skill, level, note FROM skill_profiles
    WHERE enrollment_id=${enrollmentId}
    ORDER BY level ASC LIMIT 5
  `;

  const sourceContext = [
    `Ученик: ${context.student}${context.grade ? `, ${context.grade} класс` : ''}`,
    `Курс: ${context.course}`,
    `Модуль/раздел: ${context.module || 'не указан'}`,
    `Тема школы: ${context.topic || 'не указана'}`,
    `Что важно сейчас: ${context.note || 'нет заметки'}`,
    `На повторение: ${recycling.length ? recycling.map((x) => `${x.label}${x.category ? ` (${x.category})` : ''}`).join('; ') : 'ничего не отмечено'}`,
    `Срочные запросы: ${urgent.length ? urgent.map((x) => x.description).join(' | ') : 'нет'}`,
    `Профиль навыков: ${skills.length ? skills.map((x) => `${x.skill} ${x.level}/100${x.note ? ` — ${x.note}` : ''}`).join('; ') : 'пока не заполнен'}`,
  ].join('\n');

  const prompt = `Ты методист личной Мастерской уроков преподавателя английского. Составь КОРОТКИЙ ПЛАН ПОДГОТОВКИ к индивидуальному уроку на 60 минут. Это ещё не worksheet.\n\nДАННЫЕ ИЗ БАЗЫ:\n${sourceContext}\n\nЖЁСТКИЕ ПРАВИЛА:\n- используй только данные выше;\n- НЕ выдумывай содержание страниц учебника, номера упражнений, тексты, слова, правила или задания ФИПИ, которых нет в данных;\n- если для точной подготовки нужен учебник/фото/источник, прямо напиши «Нужен источник»;\n- учитывай школьный темп: не предлагай надолго задерживаться на одном материале;\n- обязательно предусмотрите вывод материала в речь;\n- язык ответа — русский, компактно, без длинных объяснений.\n\nФОРМАТ:\nФокус урока: ...\nЦель: ...\nCORE 60 минут:\n1. ...\n2. ...\n3. ...\n4. ...\nSpeaking transfer: ...\nЧто повторить: ...\nRESERVE: ...\nНужен источник: ...`;

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
      const msg = payload && typeof payload === 'object' && 'msg' in payload
        ? String((payload as { msg?: unknown }).msg || '') : '';
      return NextResponse.json({ ok: false, message: msg || `KIE ответил HTTP ${response.status}.` }, { status: 502 });
    }
    const plan = extractText(payload);
    if (!plan) {
      return NextResponse.json({ ok: false, message: 'KIE ответил без текста.' }, { status: 502 });
    }

    const date = todayString();
    const lessonRows = await sql<Array<{ id: string }>>`
      SELECT id FROM lessons
      WHERE enrollment_id=${enrollmentId} AND scheduled_date=${date}::date AND lesson_type <> 'urgent'
      ORDER BY created_at DESC LIMIT 1
    `;
    const lessonId = lessonRows[0]?.id || randomUUID();
    if (lessonRows.length) {
      await sql`UPDATE lessons SET summary=${plan} WHERE id=${lessonId}`;
    } else {
      await sql`
        INSERT INTO lessons (id, enrollment_id, lesson_type, status, title, scheduled_date, summary)
        VALUES (${lessonId}, ${enrollmentId}, 'planned', 'draft', ${context.course}, ${date}::date, ${plan})
      `;
    }

    const credits = payload && typeof payload === 'object' && 'credits_consumed' in payload
      ? Number((payload as { credits_consumed?: unknown }).credits_consumed) : null;
    return NextResponse.json({ ok: true, plan, credits: Number.isFinite(credits) ? credits : null });
  } catch (error) {
    console.error('[kie] Не удалось составить AI-план урока:', error);
    return NextResponse.json({ ok: false, message: 'Не удалось связаться с KIE.' }, { status: 502 });
  }
}
