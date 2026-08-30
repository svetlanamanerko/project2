import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { db, dbConfigured } from '@/lib/db';
import { prepareLessonSourceWithPlanning } from '@/lib/lesson-source-planning';
import { type PreparedLessonSource } from '@/lib/lesson-source';
import { buildLessonDocx } from '@/lib/lesson-docx';
import { generatedDocxMimeType, uploadLessonPackageFiles } from '@/lib/generated-materials-drive';
import { buildLessonContext } from '@/lib/lesson-context';
import { generateKieText, KieRequestError, type KieInputPart } from '@/lib/ai-routing';
import { courseMethodologyPrompt } from '@/lib/course-profile';
import { isOgeCourseTitle } from '@/lib/course-folder-match-utils';
import { resolveGoogleDriveCourseFolder } from '@/lib/google-drive-source-folders';
import { getOgeTask } from '@/lib/oge-navigator-client';

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

function normalizeScheduledDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return todayString();
  const parsed = new Date(`${raw}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : todayString();
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

function compactOgeText(value: unknown, max = 2600) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length <= max ? text : `${text.slice(0, max).trim()}…`;
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

  const body = await request.json().catch(() => ({})) as { enrollmentId?: string; scheduledTime?: string; scheduledDate?: string };
  const enrollmentId = String(body.enrollmentId || '').trim();
  const scheduledTime = /^\d{2}:\d{2}$/.test(String(body.scheduledTime || '')) ? String(body.scheduledTime) : null;
  const date = normalizeScheduledDate(body.scheduledDate);
  if (!enrollmentId) {
    return NextResponse.json({ ok: false, message: 'Не выбран ученик.' }, { status: 400 });
  }

  const sql = db();
  const contextRows = await sql<Array<{
    studentId: string;
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
    SELECT s.id as "studentId", s.display_name as student, s.school_grade as grade, c.title as course,
           c.drive_folder_id as "courseFolderId", c.course_profile as "courseProfile",
           sp.module, sp.topic, sp.note,
           l.id as "lessonId", l.summary as plan
    FROM enrollments e
    JOIN students s ON s.id=e.student_id
    JOIN courses c ON c.id=e.course_id
    LEFT JOIN school_positions sp ON sp.enrollment_id=e.id
    LEFT JOIN LATERAL (
      SELECT id, summary FROM lessons
      WHERE enrollment_id=e.id AND scheduled_date=${date}::date
        AND (${scheduledTime}::text IS NULL OR scheduled_time=${scheduledTime}::time)
        AND lesson_type <> 'urgent'
      ORDER BY created_at DESC LIMIT 1
    ) l ON true
    WHERE e.id=${enrollmentId} AND e.active=true
    LIMIT 1
  `;
  const context = contextRows[0];
  if (!context) {
    return NextResponse.json({ ok: false, message: 'Маршрут ученика не найден.' }, { status: 404 });
  }

  const lessonContext = await buildLessonContext(context.studentId, { enrollmentId });
  const isOge = lessonContext.planningGuidance.mode === 'oge' || isOgeCourseTitle(context.course);
  let effectiveCourseFolderId = context.courseFolderId;
  if (isOge) {
    try {
      effectiveCourseFolderId = (await resolveGoogleDriveCourseFolder(context.course, context.courseFolderId)).folder?.id || null;
    } catch (error) {
      console.warn('[lesson-package] Не удалось автоматически определить OGE MASTER:', error);
    }
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

  let source: PreparedLessonSource | null = null;
  if (!isOge) {
    if (!effectiveCourseFolderId) {
      return NextResponse.json({ ok: false, message: 'У курса пока нет связанной папки Google Drive.' }, { status: 409 });
    }
    try {
      source = await prepareLessonSourceWithPlanning({
        courseTitle: context.course,
        courseFolderId: effectiveCourseFolderId,
        courseProfile: context.courseProfile,
        module: context.module,
        topic: context.topic,
        note: context.note,
      }, key, lessonContext.planningGuidance.moduleBrief?.text);
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
  }

  const ogeDetails = isOge
    ? (await Promise.allSettled(lessonContext.navigatorCandidates.slice(0, 6).map((item) => getOgeTask(item.qid))))
      .flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value.task] : [])
    : [];
  const ogeEvidence = isOge
    ? ogeDetails.length
      ? ogeDetails.map((task) => [
          `QID ${task.qid}`,
          task.section ? `section=${task.section}` : '',
          task.topic ? `topic=${task.topic}` : '',
          task.subtopic ? `subtopic=${task.subtopic}` : '',
          task.conditionText ? `condition=${compactOgeText(task.conditionText)}` : '',
          task.contentText ? `content=${compactOgeText(task.contentText)}` : '',
        ].filter(Boolean).join(' | ')).join('\n')
      : lessonContext.navigatorCandidates.slice(0, 8).map((task) => `QID ${task.qid} | ${task.section || ''} | ${task.topic || task.subtopic || ''} | ${task.preview || ''}`).join('\n')
    : '';

  const ogePlanningTitle = lessonContext.planningGuidance.ogeTechnologicalMap?.title
    || lessonContext.planningGuidance.ogeMasterCurriculum?.title
    || lessonContext.planningGuidance.ogeNavigatorBaseline?.title
    || 'OGE Navigator';
  const sourceLabel = source?.label || `${lessonContext.planningGuidance.ogeBlock || 'OGE'} · ${ogePlanningTitle}`;

  const contextText = [
    `${courseMethodologyPrompt(context.courseProfile)}\nПравила применения: это постоянная педагогическая настройка. Применяй её, если она не конфликтует с реальным источником и текущей целью ученика. Текущие реальные данные ученика важнее шаблонной методики. Методика не определяет фактическую текущую позицию и не заменяет student context.`,
    `Ученик: ${context.student}${context.grade ? `, ${context.grade} класс` : ''}`,
    `Дата урока: ${date}`,
    `Курс: ${context.course}`,
    `Школьный раздел: ${context.module || 'не указан'}`,
    `Тема: ${context.topic || 'не указана'}`,
    `Заметка преподавателя НА СЕГОДНЯ: ${context.note || 'нет'}`,
    `Источник: ${sourceLabel}`,
    `Предыдущий AI-план: ${context.plan || 'нет'}`,
    `Повторение: ${recycling.length ? recycling.map((x) => `${x.label} (${x.category})`).join('; ') : 'нет'}`,
    `Срочное: ${urgent.length ? urgent.map((x) => x.description).join(' | ') : 'нет'}`,
    `Навыки: ${skills.length ? skills.map((x) => `${x.skill} ${x.level}/100${x.note ? ` — ${x.note}` : ''}`).join('; ') : 'пока не заполнены'}`,
    `${isOge ? 'OGE PLANNING' : 'COURSE BASELINE / MODULE BRIEF'}: ${JSON.stringify(lessonContext.planningGuidance)}`,
    `Отобранный lesson context: ${JSON.stringify(lessonContext)}`,
    `HISTORICAL COVERAGE: ${JSON.stringify(lessonContext.historicalCoverage)}. Это темы и материалы, которые встречались до начала журнала, а не доказательство mastery.`,
    isOge ? `ПРОВЕРЕННЫЕ ДАННЫЕ NAVIGATOR (не придумывай другие QID):\n${ogeEvidence || 'Конкретные task details сейчас недоступны. Создавай оригинальную учебную практику по Master Curriculum и не приписывай ей QID.'}` : '',
  ].filter(Boolean).join('\n');

  let communicativeWarmup = '';
  let fastGenerationWarning: string | null = null;
  try {
    const warmup = await generateKieText({
      route: 'fast',
      key,
      purpose: 'communicative-warm-up',
      studentId: context.studentId,
      enrollmentId,
      timeoutMs: 20_000,
      input: [{
        type: 'input_text',
        text: `Create one short Communicative Core warm-up for an individual English lesson.\n${contextText}\n\nReturn plain text only: 3-5 oral questions, useful sentence starters and a compact phrase bank. Adapt it to the learner and current topic. Do not analyse or redesign the long-term route.`,
      }],
    });
    communicativeWarmup = warmup.text;
  } catch (error) {
    fastGenerationWarning = 'Быстрая генерация Communicative Core временно недоступна; урок собран без автоматически созданной разминки.';
    console.error('[lesson-package] fast Communicative Core unavailable:', error);
  }

  const sourceMethod = isOge
    ? `ОГЭ-РЕЖИМ:
- Master Curriculum + Student Route + заметка преподавателя определяют, ЧТО делать сегодня; заметка преподавателя на сегодня имеет высокий приоритет.
- Если диагностика уже проведена и преподаватель явно пишет «начинаем с блока 1», НЕ проводи входную диагностику заново. Начинай реальную работу Block 1 по Master Curriculum.
- Если указан только Block 1 без конкретного урока, стартуй с первого рабочего урока этого блока из Master Curriculum и подробно отрабатывай его цели.
- «Тщательно проработать» означает дать реальный полный учебный материал, а не только рекомендации: vocabulary/chunks, controlled grammar/WF practice, receptive task or original training text where appropriate, speaking transfer, reverse translation/accuracy practice, homework and reserve.
- Navigator QID можно упоминать только из ПРОВЕРЕННЫХ ДАННЫХ NAVIGATOR выше. Не копируй длинные официальные задания; используй QID как официальный anchor, а дополнительные упражнения создавай оригинальными.
- Если конкретного официального task detail недостаточно, не выдумывай его содержание: создай оригинальную тренировку нужного формата и честно отметь teacher note, что официальный QID нужно открыть отдельно.
- Для слабой базы объём поддержки увеличивай: больше controlled practice, короткие шаги и повторяемость, но урок остаётся экзаменационно направленным.`
    : `УЧЕБНИКОВЫЙ РЕЖИМ:
- учебник — основа урока; внимательно изучи приложенные страницы;
- Module Brief и Course Baseline определяют цель, приоритет и объём урока; реальный PDF определяет фактическое содержание страницы;
- не выдумывай содержание страниц и номера упражнений;
- не перепечатывай длинные тексты учебника: создавай оригинальную дополнительную практику по реально видимой лексике/грамматике/функциям.`;

  const prompt = `Ты методист и автор материалов личной «Мастерской уроков» преподавателя английского. Собери ПОЛНЫЙ текстовый пакет к индивидуальному уроку на 60 минут, который можно сразу использовать онлайн и распечатать.

COMMUNICATIVE CORE (создан отдельным fast-generation route):
${communicativeWarmup || 'Fast-generation warm-up недоступен. Не заменяй его глубокой аналитической разминкой.'}

Если Communicative Core указан выше, включи его в начало CORE без повторной генерации и без методического переосмысления.

КОНТЕКСТ:
${contextText}

${sourceMethod}

ОБЩАЯ МЕТОДИКА:
- CORE реально заполняет 60 минут, RESERVE — большой запас;
- глубокая vocabulary practice + chunks/collocations, grammar recycling, reading/listening где уместно, Reverse Translation для подходящего возраста, обязательный speaking transfer, постепенное снятие опор;
- строй progression: короткий вход/активация -> recognition/comprehension -> controlled practice -> freer production/speaking;
- не дроби одно содержательное упражнение на десяток однофразовых микрозаданий; лучше один плотный task с 5–10 items, если это методически естественно;
- держи одну лексику, персонажей, ситуацию и grammar target в связанных заданиях, а не вводи случайные новые темы;
- Student Worksheet без ответов и teacher-only комментариев;
- Teacher Pack содержит ответы ко ВСЕМ заданиям, scripts, примерные speaking answers, тайминг и teacher notes;
- HOMEWORK самостоятельный; VOCABULARY BANK: English phrase — русский перевод — короткий example/collocation;
- явная заметка преподавателя «что нужно сегодня» должна быть реально выполнена в содержании урока, а не просто пересказана в плане.

ВАЖНО:
- Сейчас НЕ создавай interactiveLesson, HTML или дизайн-версию. Интерактив строится отдельной кнопкой позже из уже готового пакета.
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
    const input: KieInputPart[] = [{ type: 'input_text', text: prompt }];
    if (source) input.push({ type: 'input_file', file_url: source.kieFileUrl });
    const result = await generateKieText({
      route: 'standard',
      key,
      purpose: 'lesson-package',
      studentId: context.studentId,
      enrollmentId,
      input,
    });
    const draft = findPackage({ output_text: result.text });
    if (!draft) {
      console.error('[lesson-package] KIE вернул невалидную структуру');
      return NextResponse.json({ ok: false, message: 'AI собрал урок, но вернул его в неверном формате. Нажмите «Собрать материалы» ещё раз.' }, { status: 502 });
    }

    let lessonId = context.lessonId;
    if (!lessonId) {
      lessonId = randomUUID();
      await sql`
        INSERT INTO lessons (id, enrollment_id, lesson_type, status, title, scheduled_date, scheduled_time, source_position, summary)
        VALUES (${lessonId}, ${enrollmentId}, 'planned', 'draft', ${context.course}, ${date}::date, ${scheduledTime}::time, ${sourceLabel}, ${context.plan})
      `;
    }

    const subtitle = `${context.student} · ${context.course} · ${sourceLabel}`;
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

    const refName = source?.reference || lessonContext.planningGuidance.ogeBlock || 'OGE';
    const baseName = safeFilePart(`${context.course} — ${context.student} — ${refName}`);
    const studentFilename = `${baseName} — Student Worksheet.docx`;
    const teacherFilename = `${baseName} — Teacher Pack.docx`;

    let drive: Awaited<ReturnType<typeof uploadLessonPackageFiles>> | null = null;
    let warning: string | null = fastGenerationWarning;
    if (effectiveCourseFolderId) {
      try {
        drive = await uploadLessonPackageFiles({
          courseFolderId: effectiveCourseFolderId,
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
        const driveWarning = 'Урок собран и сохранён в Мастерской, но Word-файлы пока не удалось записать на Google Drive.';
        warning = warning ? `${warning} ${driveWarning}` : driveWarning;
      }
    } else {
      const driveWarning = 'Урок собран и сохранён в Мастерской, но папка курса на Google Drive не найдена для сохранения Word-файлов.';
      warning = warning ? `${warning} ${driveWarning}` : driveWarning;
    }

    const credits = result.credits;

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO lesson_packages (
          lesson_id, title, source_label, student_worksheet, teacher_pack, homework, reserve, vocabulary_bank,
          interactive_json, source_excerpt_path, interactive_generated_at,
          student_drive_file_id, student_drive_url, teacher_drive_file_id, teacher_drive_url, drive_folder_id, credits, updated_at
        ) VALUES (
          ${lessonId}, ${draft.title}, ${sourceLabel}, ${draft.studentWorksheet}, ${draft.teacherPack}, ${draft.homework}, ${draft.reserve}, ${draft.vocabularyBank},
          NULL, ${source?.excerptPath || null}, NULL,
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
        UPDATE lessons SET status='prepared', prepared_at=now(), source_position=${sourceLabel}
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
        sourceLabel,
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
    return NextResponse.json({
      ok: false,
      message: error instanceof KieRequestError ? error.message : 'Не удалось собрать полный урок.',
    }, { status: 502 });
  }
}
