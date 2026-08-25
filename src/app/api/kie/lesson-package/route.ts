import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';
import { prepareLessonSource } from '@/lib/lesson-source';
import { buildLessonDocx } from '@/lib/lesson-docx';
import { generatedDocxMimeType, uploadLessonPackageFiles } from '@/lib/generated-materials-drive';

type PackageDraft = {
  title: string;
  studentWorksheet: string;
  teacherPack: string;
  homework: string;
  reserve: string;
  vocabularyBank: string;
};

function todayString() {
  const zone = process.env.APP_TIMEZONE || 'Europe/Moscow';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

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

function parseJsonLoose(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const attempts = [cleaned];
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(cleaned.slice(first, last + 1));
  for (const attempt of attempts) {
    try {
      let parsed: unknown = JSON.parse(attempt);
      for (let depth = 0; depth < 3 && typeof parsed === 'string'; depth += 1) parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const row = parsed as Record<string, unknown>;
        for (const wrapper of ['data', 'result', 'package']) {
          const nested = row[wrapper];
          if (nested && typeof nested === 'object' && !Array.isArray(nested)) return nested as Record<string, unknown>;
        }
        return row;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function parsePackage(text: string): PackageDraft | null {
  const parsed = parseJsonLoose(text);
  if (!parsed) return null;
  const fields = ['title', 'studentWorksheet', 'teacherPack', 'homework', 'reserve', 'vocabularyBank'] as const;
  for (const field of fields) {
    if (typeof parsed[field] !== 'string' || !String(parsed[field]).trim()) return null;
  }
  return {
    title: String(parsed.title).trim(),
    studentWorksheet: String(parsed.studentWorksheet).trim(),
    teacherPack: String(parsed.teacherPack).trim(),
    homework: String(parsed.homework).trim(),
    reserve: String(parsed.reserve).trim(),
    vocabularyBank: String(parsed.vocabularyBank).trim(),
  };
}

function findPackage(payload: unknown) {
  for (const text of extractTextCandidates(payload).reverse()) {
    const draft = parsePackage(text);
    if (draft) return draft;
  }
  return null;
}

function safeFilePart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Lesson';
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
  const date = todayString();
  const contextRows = await sql<Array<{
    student: string;
    grade: number | null;
    course: string;
    courseFolderId: string | null;
    courseProfile: unknown;
    module: string | null;
    topic: string | null;
    note: string | null;
    lessonId: string | null;
    plan: string | null;
  }>>`
    SELECT s.display_name as student, s.school_grade as grade, c.title as course,
           c.drive_folder_id as "courseFolderId", c.course_profile as "courseProfile",
           sp.module, sp.topic, sp.note,
           l.id as "lessonId", l.summary as plan
    FROM enrollments e
    JOIN students s ON s.id=e.student_id
    JOIN courses c ON c.id=e.course_id
    LEFT JOIN school_positions sp ON sp.enrollment_id=e.id
    LEFT JOIN LATERAL (
      SELECT id, summary FROM lessons
      WHERE enrollment_id=e.id AND scheduled_date=${date}::date AND lesson_type <> 'urgent'
      ORDER BY created_at DESC LIMIT 1
    ) l ON true
    WHERE e.id=${enrollmentId} AND e.active=true
    LIMIT 1
  `;
  const context = contextRows[0];
  if (!context) {
    return NextResponse.json({ ok: false, message: 'Маршрут ученика не найден.' }, { status: 404 });
  }
  if (!context.courseFolderId) {
    return NextResponse.json({ ok: false, message: 'У курса пока нет связанной папки Google Drive.' }, { status: 409 });
  }

  const [recycling, urgent, skills] = await Promise.all([
    sql<Array<{ label: string; category: string }>>`
      SELECT label, category FROM recycling_items
      WHERE enrollment_id=${enrollmentId} AND status='active'
      ORDER BY priority ASC, created_at ASC LIMIT 8
    `,
    sql<Array<{ description: string }>>`
      SELECT description FROM urgent_requests
      WHERE enrollment_id=${enrollmentId} AND status <> 'done'
      ORDER BY created_at DESC LIMIT 3
    `,
    sql<Array<{ skill: string; level: number; note: string | null }>>`
      SELECT skill, level, note FROM skill_profiles
      WHERE enrollment_id=${enrollmentId}
      ORDER BY level ASC LIMIT 8
    `,
  ]);

  let source;
  try {
    source = await prepareLessonSource({
      courseTitle: context.course,
      courseFolderId: context.courseFolderId,
      courseProfile: context.courseProfile,
      module: context.module,
      topic: context.topic,
      note: context.note,
    }, key);
  } catch (error) {
    console.error('[lesson-package] Не удалось открыть источник:', error);
    source = null;
  }
  if (!source) {
    return NextResponse.json({
      ok: false,
      message: 'Не удалось определить точные страницы учебника. Укажите страницу, 1a / Unit / L01 и сначала обновите AI-план.',
    }, { status: 409 });
  }

  const contextText = [
    `Ученик: ${context.student}${context.grade ? `, ${context.grade} класс` : ''}`,
    `Курс: ${context.course}`,
    `Школьный раздел: ${context.module || 'не указан'}`,
    `Тема: ${context.topic || 'не указана'}`,
    `Заметка преподавателя: ${context.note || 'нет'}`,
    `Реальный источник: ${source.label}`,
    `Предыдущий AI-план: ${context.plan || 'нет'}`,
    `Повторение: ${recycling.length ? recycling.map((x) => `${x.label} (${x.category})`).join('; ') : 'нет'}`,
    `Срочное: ${urgent.length ? urgent.map((x) => x.description).join(' | ') : 'нет'}`,
    `Навыки: ${skills.length ? skills.map((x) => `${x.skill} ${x.level}/100${x.note ? ` — ${x.note}` : ''}`).join('; ') : 'пока не заполнены'}`,
  ].join('\n');

  const prompt = `Ты методист и автор материалов личной «Мастерской уроков» преподавателя английского. К сообщению приложен реальный фрагмент учебника. Собери ПОЛНЫЙ текстовый пакет к индивидуальному уроку на 60 минут, который можно сразу использовать онлайн и распечатать.

КОНТЕКСТ:
${contextText}

МЕТОДИКА:
- учебник — основа урока; внимательно изучи приложенные страницы;
- не выдумывай содержание страниц и номера упражнений;
- не перепечатывай длинные тексты учебника: создавай оригинальную дополнительную практику по реально видимой лексике/грамматике/функциям;
- CORE реально заполняет 60 минут, RESERVE — большой запас;
- глубокая vocabulary practice + chunks/collocations, grammar recycling, reading/listening где уместно, Reverse Translation для подходящего возраста, обязательный speaking transfer, постепенное снятие опор;
- строй progression: короткий вход/активация -> recognition/comprehension -> controlled practice -> freer production/speaking;
- не дроби одно содержательное упражнение на десяток однофразовых микрозаданий; лучше один плотный task с 5–10 items, если это методически естественно;
- держи одну лексику, персонажей, ситуацию и grammar target в связанных заданиях, а не вводи случайные новые темы;
- Student Worksheet без ответов и teacher-only комментариев;
- Teacher Pack содержит ответы ко ВСЕМ заданиям, scripts, примерные speaking answers, тайминг и teacher notes;
- HOMEWORK самостоятельный; VOCABULARY BANK: English phrase — русский перевод — короткий example/collocation;
- материал помогает школьной программе, а не уводит далеко вперёд.

ВАЖНО:
- Сейчас НЕ создавай interactiveLesson, HTML или дизайн-версию. Интерактив строится отдельной кнопкой позже из уже готового пакета, чтобы не тратить AI credits без необходимости.
- Верни только текстовые части пакета.

ВЕРНИ ТОЛЬКО валидный JSON, без markdown и без текста до/после. Структура верхнего уровня строго такая:
{
  "title": "короткое название урока",
  "studentWorksheet": "полный CORE worksheet на 60 минут; без reserve/homework/vocabulary bank",
  "teacherPack": "ключи, скрипты, тайминг и teacher notes ко всему пакету",
  "homework": "полноценное домашнее задание",
  "reserve": "большой запас дополнительных упражнений",
  "vocabularyBank": "Vocabulary Bank строками: phrase — перевод — example"
}`;

  try {
    const response = await fetch('https://api.kie.ai/codex/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5-4',
        stream: false,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_file', file_url: source.kieFileUrl },
          ],
        }],
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

    const draft = findPackage(payload);
    if (!draft) {
      console.error('[lesson-package] KIE вернул невалидную структуру');
      return NextResponse.json({ ok: false, message: 'AI собрал урок, но вернул его в неверном формате. Нажмите «Собрать урок» ещё раз.' }, { status: 502 });
    }

    let lessonId = context.lessonId;
    if (!lessonId) {
      lessonId = randomUUID();
      await sql`
        INSERT INTO lessons (id, enrollment_id, lesson_type, status, title, scheduled_date, source_position, summary)
        VALUES (${lessonId}, ${enrollmentId}, 'planned', 'draft', ${context.course}, ${date}::date, ${source.label}, ${context.plan})
      `;
    }

    const subtitle = `${context.student} · ${context.course} · ${source.label}`;
    const studentDocx = await buildLessonDocx({
      title: draft.title,
      subtitle,
      sections: [
        { title: 'STUDENT WORKSHEET — CORE', content: draft.studentWorksheet },
        { title: 'RESERVE / EXTRA PRACTICE', content: draft.reserve },
        { title: 'HOMEWORK', content: draft.homework },
        { title: 'VOCABULARY BANK', content: draft.vocabularyBank },
      ],
    });
    const teacherDocx = await buildLessonDocx({
      title: `${draft.title} — Teacher’s Pack`,
      subtitle,
      sections: [
        { title: 'AI PLAN', content: context.plan || 'План отдельно не сохранён.' },
        { title: 'TEACHER’S PACK', content: draft.teacherPack },
        { title: 'RESERVE — STUDENT TASKS', content: draft.reserve },
        { title: 'HOMEWORK — STUDENT TASKS', content: draft.homework },
        { title: 'VOCABULARY BANK', content: draft.vocabularyBank },
      ],
    });

    const refName = source.reference || `pages-${source.printedStart}-${source.printedEnd}`;
    const baseName = safeFilePart(`${context.course} — ${context.student} — ${refName}`);
    const studentFilename = `${baseName} — Student Worksheet.docx`;
    const teacherFilename = `${baseName} — Teacher Pack.docx`;

    let drive: Awaited<ReturnType<typeof uploadLessonPackageFiles>> | null = null;
    let warning: string | null = null;
    try {
      drive = await uploadLessonPackageFiles({
        courseFolderId: context.courseFolderId,
        date,
        student: context.student,
        reference: refName,
        studentFilename,
        teacherFilename,
        studentDocx,
        teacherDocx,
      });
    } catch (error) {
      console.error('[lesson-package] Урок собран, но Drive upload не удался:', error);
      warning = 'Урок собран и сохранён в Мастерской, но Word-файлы пока не удалось записать на Google Drive.';
    }

    const creditsRaw = payload && typeof payload === 'object' && 'credits_consumed' in payload
      ? Number((payload as { credits_consumed?: unknown }).credits_consumed) : null;
    const credits = Number.isFinite(creditsRaw) ? creditsRaw : null;

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO lesson_packages (
          lesson_id, title, source_label, student_worksheet, teacher_pack, homework, reserve, vocabulary_bank,
          interactive_json, source_excerpt_path, interactive_generated_at,
          student_drive_file_id, student_drive_url, teacher_drive_file_id, teacher_drive_url, drive_folder_id, credits, updated_at
        ) VALUES (
          ${lessonId}, ${draft.title}, ${source.label}, ${draft.studentWorksheet}, ${draft.teacherPack}, ${draft.homework}, ${draft.reserve}, ${draft.vocabularyBank},
          NULL, ${source.excerptPath}, NULL,
          ${drive?.student.id || null}, ${drive?.student.url || null}, ${drive?.teacher.id || null}, ${drive?.teacher.url || null}, ${drive?.folderId || null}, ${credits}, now()
        )
        ON CONFLICT (lesson_id) DO UPDATE SET
          title=EXCLUDED.title,
          source_label=EXCLUDED.source_label,
          student_worksheet=EXCLUDED.student_worksheet,
          teacher_pack=EXCLUDED.teacher_pack,
          homework=EXCLUDED.homework,
          reserve=EXCLUDED.reserve,
          vocabulary_bank=EXCLUDED.vocabulary_bank,
          interactive_json=NULL,
          source_excerpt_path=EXCLUDED.source_excerpt_path,
          interactive_generated_at=NULL,
          student_drive_file_id=EXCLUDED.student_drive_file_id,
          student_drive_url=EXCLUDED.student_drive_url,
          teacher_drive_file_id=EXCLUDED.teacher_drive_file_id,
          teacher_drive_url=EXCLUDED.teacher_drive_url,
          drive_folder_id=EXCLUDED.drive_folder_id,
          credits=EXCLUDED.credits,
          updated_at=now()
      `;
      await tx`
        UPDATE lessons SET status='prepared', prepared_at=now(), source_position=${source.label}
        WHERE id=${lessonId}
      `;

      if (drive) {
        await tx`DELETE FROM materials WHERE lesson_id=${lessonId} AND kind IN ('Student Worksheet', 'Teacher Pack')`;
        await tx`
          INSERT INTO materials (id, lesson_id, kind, title, drive_file_id, drive_url, mime_type)
          VALUES
            (${randomUUID()}, ${lessonId}, 'Student Worksheet', ${studentFilename}, ${drive.student.id}, ${drive.student.url}, ${generatedDocxMimeType}),
            (${randomUUID()}, ${lessonId}, 'Teacher Pack', ${teacherFilename}, ${drive.teacher.id}, ${drive.teacher.url}, ${generatedDocxMimeType})
        `;
      }
    });

    return NextResponse.json({
      ok: true,
      warning,
      credits,
      interactiveReady: false,
      package: {
        title: draft.title,
        sourceLabel: source.label,
        studentWorksheet: draft.studentWorksheet,
        teacherPack: draft.teacherPack,
        homework: draft.homework,
        reserve: draft.reserve,
        vocabularyBank: draft.vocabularyBank,
        studentDriveUrl: drive?.student.url || null,
        teacherDriveUrl: drive?.teacher.url || null,
      },
    });
  } catch (error) {
    console.error('[lesson-package] Не удалось собрать урок:', error);
    return NextResponse.json({ ok: false, message: 'Не удалось собрать полный урок.' }, { status: 502 });
  }
}
