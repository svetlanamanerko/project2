import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';
import { prepareLessonSource, type PreparedLessonSource } from '@/lib/lesson-source';
import { buildLessonContext } from '@/lib/lesson-context';
import { generateKieText, KieRequestError, type KieInputPart } from '@/lib/ai-routing';
import { courseMethodologyPrompt } from '@/lib/course-profile';

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

  const body = await request.json().catch(() => ({})) as { enrollmentId?: string; scheduledTime?: string };
  const enrollmentId = String(body.enrollmentId || '').trim();
  const scheduledTime = /^\d{2}:\d{2}$/.test(String(body.scheduledTime || '')) ? String(body.scheduledTime) : null;
  if (!enrollmentId) {
    return NextResponse.json({ ok: false, message: 'Не выбран ученик.' }, { status: 400 });
  }

  const sql = db();
  const contextRows = await sql<Array<{
    studentId: string;
    student: string;
    grade: number | null;
    studentContext: string | null;
    course: string;
    courseFolderId: string | null;
    courseProfile: unknown;
    module: string | null;
    topic: string | null;
    note: string | null;
  }>>`
    SELECT s.id as "studentId", s.display_name as student, s.school_grade as grade, s.notes as "studentContext", c.title as course,
           c.drive_folder_id as "courseFolderId", c.course_profile as "courseProfile",
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
  const lessonContext = await buildLessonContext(context.studentId, { enrollmentId });

  const [recycling, urgent, skills, observations, learningPlan] = await Promise.all([
    sql<Array<{ label: string; category: string }>>`
      SELECT label, category FROM recycling_items
      WHERE enrollment_id=${enrollmentId} AND status='active'
      ORDER BY priority ASC, created_at ASC LIMIT 8
    `,
    sql<Array<{ description: string; detectedTopic: string | null }>>`
      SELECT description, detected_topic as "detectedTopic" FROM urgent_requests
      WHERE enrollment_id=${enrollmentId} AND status <> 'done'
      ORDER BY created_at DESC LIMIT 3
    `,
    sql<Array<{ skill: string; level: number; note: string | null }>>`
      SELECT skill, level, note FROM skill_profiles
      WHERE enrollment_id=${enrollmentId}
      ORDER BY level ASC LIMIT 8
    `,
    sql<Array<{ observedOn: string; strengths: string | null; difficulties: string | null; recycle: string | null; comment: string | null }>>`
      SELECT to_char(observed_on, 'YYYY-MM-DD') as "observedOn", strengths, difficulties, recycle, comment
      FROM student_observations
      WHERE enrollment_id=${enrollmentId}
      ORDER BY observed_on DESC, created_at DESC LIMIT 8
    `,
    sql<Array<{ label: string }>>`
      SELECT label FROM learning_plan_items
      WHERE enrollment_id=${enrollmentId} AND status='active'
      ORDER BY created_at ASC LIMIT 10
    `,
  ]);

  let preparedSource: PreparedLessonSource | null = null;
  try {
    preparedSource = await prepareLessonSource({
      courseTitle: context.course,
      courseFolderId: context.courseFolderId,
      courseProfile: context.courseProfile,
      module: context.module,
      topic: context.topic,
      note: context.note,
    }, key);
  } catch (error) {
    console.error('[lesson-source] Не удалось подготовить страницы учебника:', error);
  }

  const observationText = observations.length
    ? observations.map((item) => `${item.observedOn}: получается — ${item.strengths || 'не отмечено'}; трудно — ${item.difficulties || 'не отмечено'}; повторить — ${item.recycle || 'не отмечено'}; комментарий — ${item.comment || 'нет'}`).join(' | ')
    : 'наблюдений пока нет';

  const sourceContext = [
    `${courseMethodologyPrompt(context.courseProfile)}\nПравила применения: это постоянная педагогическая настройка. Применяй её, если она не конфликтует с реальным источником и текущей целью ученика. Текущие реальные данные ученика важнее шаблонной методики. Методика не определяет фактическую текущую позицию и не заменяет student context.`,
    `Ученик: ${context.student}${context.grade ? `, ${context.grade} класс` : ''}`,
    `Постоянный контекст ученика: ${context.studentContext || 'не заполнен'}`,
    `Курс: ${context.course}`,
    `Модуль/раздел: ${context.module || 'не указан'}`,
    `Тема школы: ${context.topic || 'не указана'}`,
    `Что важно сейчас: ${context.note || 'нет заметки'}`,
    `Наблюдения по прошлым урокам: ${observationText}`,
    `Активный план обучения: ${learningPlan.length ? learningPlan.map((x) => x.label).join('; ') : 'пока пуст'}`,
    `Источник Google Drive: ${preparedSource ? preparedSource.label : 'точный фрагмент не найден или не указан'}`,
    `На повторение: ${recycling.length ? recycling.map((x) => `${x.label}${x.category ? ` (${x.category})` : ''}`).join('; ') : 'ничего не отмечено'}`,
    `Срочные запросы: ${urgent.length ? urgent.map((x) => x.description).join(' | ') : 'нет'}`,
    `Профиль навыков: ${skills.length ? skills.map((x) => `${x.skill} ${x.level}/100${x.note ? ` — ${x.note}` : ''}`).join('; ') : 'пока не заполнен'}`,
    `Отобранный lesson context (Course Map → Progress → Drive/Navigator): ${JSON.stringify(lessonContext)}`,
    `HISTORICAL COVERAGE: ${JSON.stringify(lessonContext.historicalCoverage)}. Это темы и материалы, которые встречались до начала журнала, а не доказательство mastery. Избегай случайного дословного повторения старых материалов. Повторяй тему, если current student context, recycling или история этого требуют.`,
  ].join('\n');

  const sourceRule = preparedSource
    ? `К сообщению приложен PDF-фрагмент реального учебника (${preparedSource.label}). Изучи именно эти страницы. Можно ссылаться на реально видимые упражнения, тексты, лексику и грамматику, но ничего не додумывай за пределами приложенного фрагмента.`
    : 'PDF-фрагмент учебника не приложен. Не выдумывай содержание страниц, номера упражнений, тексты или лексику; если они нужны, укажи, что нужен источник.';

  const prompt = `Ты методист личной Мастерской уроков преподавателя английского. Составь КОРОТКИЙ ПЛАН ПОДГОТОВКИ к индивидуальному уроку на 60 минут. Это ещё не worksheet.\n\nДАННЫЕ ИЗ БАЗЫ:\n${sourceContext}\n\nРАБОТА С ИСТОЧНИКОМ:\n${sourceRule}\n\nЖЁСТКИЕ ПРАВИЛА:\n- опирайся на данные базы, историю ученика, наблюдения преподавателя и приложенный источник, если он есть;\n- НЕ выдумывай упражнения, тексты, слова, правила или задания, которых нет в источнике/данных;\n- активные пункты плана обучения должны влиять на приоритеты урока, если они релевантны текущей школьной теме;\n- учитывай школьный темп: не предлагай надолго задерживаться на одном материале;\n- обязательно предусмотрите вывод материала в речь;\n- язык ответа — русский, компактно, без длинных объяснений.\n\nФОРМАТ:\nИсточник: ${preparedSource ? preparedSource.label : 'не найден'}\nФокус урока: ...\nЦель: ...\nCORE 60 минут:\n1. ...\n2. ...\n3. ...\n4. ...\nSpeaking transfer: ...\nЧто повторить: ...\nRESERVE: ...\nНужен дополнительный источник: ...`;

  try {
    const inputContent: KieInputPart[] = [
      { type: 'input_text', text: prompt },
    ];
    if (preparedSource) {
      inputContent.push({ type: 'input_file', file_url: preparedSource.kieFileUrl });
    }

    const result = await generateKieText({
      route: 'standard', key, input: inputContent, purpose: 'lesson-plan',
      studentId: context.studentId, enrollmentId,
    });
    const plan = result.text;
    if (!plan) {
      return NextResponse.json({ ok: false, message: 'KIE ответил без текста.' }, { status: 502 });
    }

    const date = todayString();
    const lessonRows = await sql<Array<{ id: string }>>`
      SELECT id FROM lessons
      WHERE enrollment_id=${enrollmentId} AND scheduled_date=${date}::date
        AND (${scheduledTime}::text IS NULL OR scheduled_time=${scheduledTime}::time)
        AND lesson_type <> 'urgent'
      ORDER BY created_at DESC LIMIT 1
    `;
    const lessonId = lessonRows[0]?.id || randomUUID();
    const sourcePosition = preparedSource?.label || null;
    if (lessonRows.length) {
      await sql`UPDATE lessons SET summary=${plan}, source_position=${sourcePosition} WHERE id=${lessonId}`;
    } else {
      await sql`
        INSERT INTO lessons (id, enrollment_id, lesson_type, status, title, scheduled_date, scheduled_time, summary, source_position)
        VALUES (${lessonId}, ${enrollmentId}, 'planned', 'draft', ${context.course}, ${date}::date, ${scheduledTime}::time, ${plan}, ${sourcePosition})
      `;
    }

    return NextResponse.json({
      ok: true,
      plan,
      source: preparedSource?.label || null,
      credits: result.credits,
    });
  } catch (error) {
    console.error('[kie] Не удалось составить AI-план урока:', error);
    return NextResponse.json({
      ok: false,
      message: error instanceof KieRequestError ? error.message : 'Не удалось связаться с KIE.',
    }, { status: 502 });
  }
}
