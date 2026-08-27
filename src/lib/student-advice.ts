import 'server-only';

import { db, dbConfigured } from '@/lib/db';
import { getDriveCourseMaterials } from '@/lib/drive-materials';
import { generateKieText } from '@/lib/ai-routing';

export type StudentAdvice = {
  summary: string;
  priorities: string[];
  nextLesson: string[];
  watch: string[];
  planItems: string[];
  recycleItems: string[];
};

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

function stringList(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeAdvice(value: unknown): StudentAdvice | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const summary = typeof object.summary === 'string' ? object.summary.trim() : '';
  const advice: StudentAdvice = {
    summary,
    priorities: stringList(object.priorities, 6),
    nextLesson: stringList(object.nextLesson ?? object.next_lesson, 6),
    watch: stringList(object.watch, 6),
    planItems: stringList(object.planItems ?? object.plan_items, 8),
    recycleItems: stringList(object.recycleItems ?? object.recycle_items, 8),
  };
  if (!advice.summary && !advice.priorities.length && !advice.nextLesson.length && !advice.watch.length) return null;
  return advice;
}

function parseAdvice(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const candidates = [cleaned];
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const advice = normalizeAdvice(parsed);
      if (advice) return advice;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

export async function generateStudentLearningAdvice(studentId: string): Promise<{ advice: StudentAdvice; credits: number | null }> {
  if (!dbConfigured()) throw new Error('PostgreSQL не подключена');
  const key = process.env.KIE_API_KEY?.trim();
  if (!key) throw new Error('KIE_API_KEY не найден');

  const sql = db();
  const students = await sql<Array<{ displayName: string; schoolGrade: number | null; notes: string | null }>>`
    SELECT display_name as "displayName", school_grade as "schoolGrade", notes
    FROM students WHERE id=${studentId} AND active=true LIMIT 1
  `;
  const student = students[0];
  if (!student) throw new Error('Ученик не найден');

  const [courses, observations, recentLessons, recycling, skills, planItems, historicalCoverage] = await Promise.all([
    sql<Array<{
      enrollmentId: string;
      courseId: string;
      course: string;
      driveFolderId: string | null;
      currentStage: string | null;
      currentLesson: string | null;
      positionNote: string | null;
      module: string | null;
      topic: string | null;
      note: string | null;
    }>>`
      SELECT e.id as "enrollmentId", c.id as "courseId", c.title as course,
             c.drive_folder_id as "driveFolderId",
             p.stage_label as "currentStage", p.lesson_label as "currentLesson", p.note as "positionNote",
             sp.module, sp.topic, sp.note
      FROM enrollments e
      JOIN courses c ON c.id=e.course_id AND c.active=true
      LEFT JOIN student_course_positions p ON p.enrollment_id=e.id
      LEFT JOIN school_positions sp ON sp.enrollment_id=e.id
      WHERE e.student_id=${studentId} AND e.active=true
      ORDER BY c.title
    `,
    sql<Array<{ observedOn: string; course: string | null; strengths: string | null; difficulties: string | null; recycle: string | null; comment: string | null }>>`
      SELECT to_char(o.observed_on, 'YYYY-MM-DD') as "observedOn", c.title as course,
             o.strengths, o.difficulties, o.recycle, o.comment
      FROM student_observations o
      LEFT JOIN enrollments e ON e.id=o.enrollment_id
      LEFT JOIN courses c ON c.id=e.course_id
      WHERE o.student_id=${studentId}
      ORDER BY o.observed_on DESC, o.created_at DESC
      LIMIT 12
    `,
    sql<Array<{ date: string | null; course: string; title: string; status: string; summary: string | null }>>`
      SELECT to_char(l.scheduled_date, 'YYYY-MM-DD') as date, c.title as course,
             l.title, l.status, l.summary
      FROM lessons l
      JOIN enrollments e ON e.id=l.enrollment_id
      JOIN courses c ON c.id=e.course_id
      WHERE e.student_id=${studentId} AND l.status IN ('prepared','done')
      ORDER BY COALESCE(l.scheduled_date, l.created_at::date) DESC, l.created_at DESC
      LIMIT 8
    `,
    sql<Array<{ course: string; label: string; category: string }>>`
      SELECT c.title as course, r.label, r.category
      FROM recycling_items r
      JOIN enrollments e ON e.id=r.enrollment_id
      JOIN courses c ON c.id=e.course_id
      WHERE e.student_id=${studentId} AND r.status='active'
      ORDER BY r.priority ASC, r.created_at ASC
      LIMIT 12
    `,
    sql<Array<{ course: string; skill: string; level: number; note: string | null }>>`
      SELECT c.title as course, sp.skill, sp.level, sp.note
      FROM skill_profiles sp
      JOIN enrollments e ON e.id=sp.enrollment_id
      JOIN courses c ON c.id=e.course_id
      WHERE e.student_id=${studentId}
      ORDER BY sp.level ASC
      LIMIT 12
    `,
    sql<Array<{ course: string; label: string }>>`
      SELECT c.title as course, p.label
      FROM learning_plan_items p
      JOIN enrollments e ON e.id=p.enrollment_id
      JOIN courses c ON c.id=e.course_id
      WHERE e.student_id=${studentId} AND p.status='active'
      ORDER BY p.created_at ASC
      LIMIT 12
    `,
    sql<Array<{
      course: string;
      stage: string | null;
      lesson: string | null;
      topic: string | null;
      summary: string;
      confidence: 'high' | 'medium' | 'low';
    }>>`
      SELECT c.title as course, h.stage_label as stage, h.lesson_label as lesson, h.topic,
             h.coverage_summary as summary, h.confidence
      FROM historical_coverage h
      JOIN enrollments e ON e.id=h.enrollment_id
      JOIN courses c ON c.id=e.course_id
      WHERE e.student_id=${studentId} AND e.active=true AND h.status='confirmed'
      ORDER BY h.updated_at DESC
      LIMIT 12
    `,
  ]);

  let driveContext = 'Источники Google Drive не прочитаны.';
  try {
    const allMaterials = await getDriveCourseMaterials();
    const courseIds = new Set(courses.map((course) => course.courseId));
    const relevant = allMaterials.filter((item) => courseIds.has(item.courseId));
    if (relevant.length) {
      driveContext = relevant.map((item) => {
        const names = item.items.slice(0, 30).map((file) => file.name).join('; ');
        return `${item.courseTitle}: папка подключена; верхний уровень: ${names || 'пусто'}`;
      }).join('\n');
    } else if (courses.some((course) => course.driveFolderId)) {
      driveContext = 'У курса есть привязанная папка Google Drive, но список материалов сейчас не получен.';
    } else {
      driveContext = 'Папки-источники Google Drive к курсам не привязаны.';
    }
  } catch (error) {
    console.error('[student-advice] Не удалось прочитать материалы курса:', error);
  }

  const courseContext = courses.length
    ? courses.map((course) => {
      const factualPosition = course.currentStage
        ? `${course.currentStage}${course.currentLesson ? ` / ${course.currentLesson}` : ''}`
        : 'не указана';
      const schoolTopic = course.module || course.topic
        ? `${course.module || ''}${course.module && course.topic ? ' · ' : ''}${course.topic || ''}`
        : 'не указана';
      return `${course.course} [enrollment ${course.enrollmentId}] — фактическая позиция: ${factualPosition}; тема школы: ${schoolTopic}; комментарий к позиции: ${course.positionNote || 'нет'}; сейчас важно: ${course.note || 'нет'}`;
    }).join('\n')
    : 'Активных курсов нет.';
  const observationContext = observations.length
    ? observations.map((item) => `${item.observedOn}${item.course ? ` · ${item.course}` : ''}: получается — ${item.strengths || 'не отмечено'}; трудно — ${item.difficulties || 'не отмечено'}; повторить — ${item.recycle || 'не отмечено'}; комментарий — ${item.comment || 'нет'}`).join('\n')
    : 'Наблюдений пока нет.';
  const lessonContext = recentLessons.length
    ? recentLessons.map((item) => `${item.date || 'без даты'} · ${item.course} · ${item.title} · ${item.status}${item.summary ? ` · план: ${item.summary.slice(0, 700)}` : ''}`).join('\n')
    : 'Подготовленных/проведённых уроков пока нет.';
  const recyclingContext = recycling.length ? recycling.map((item) => `${item.course}: ${item.label} (${item.category})`).join('; ') : 'Очередь пустая.';
  const skillsContext = skills.length ? skills.map((item) => `${item.course}: ${item.skill} ${item.level}/100${item.note ? ` — ${item.note}` : ''}`).join('; ') : 'Профиль навыков пока не заполнен.';
  const planContext = planItems.length ? planItems.map((item) => `${item.course}: ${item.label}`).join('; ') : 'Активных пунктов плана пока нет.';
  const historicalContext = historicalCoverage.length
    ? historicalCoverage.map((item) => `${item.course}: ${item.stage || item.topic || 'исторический материал'}${item.lesson ? ` / ${item.lesson}` : ''}${item.topic && item.stage ? ` · ${item.topic}` : ''} — ${item.summary.slice(0, 500)} [достоверность связи с материалом: ${item.confidence}]`).join('\n')
    : 'Подтверждённой преподавателем истории до Мастерской пока нет.';

  const prompt = `Ты методист личной «Мастерской уроков» преподавателя английского языка. Проанализируй конкретного ученика и предложи практический маршрут обучения.\n\nУЧЕНИК:\n${student.displayName}${student.schoolGrade ? `, ${student.schoolGrade} класс` : ''}\n\nПОСТОЯННЫЙ КОНТЕКСТ / ИСТОРИЯ:\n${student.notes || 'Пока не заполнено.'}\n\nАКТИВНЫЕ КУРСЫ И ТЕКУЩАЯ ПОЗИЦИЯ:\n${courseContext}\n\nПОДТВЕРЖДЕННАЯ ИСТОРИЯ ДО МАСТЕРСКОЙ:\n${historicalContext}\n\nВАЖНО ПРО ИСТОРИЮ ДО МАСТЕРСКОЙ:\nПодтверждённая запись означает только, что ученик с большой вероятностью встречал или проходил этот материал. Это НЕ означает, что материал освоен, закреплён или может быть автоматически засчитан как сильная сторона. Confidence показывает качество связи материала с учеником, а не уровень владения.\n\nНАБЛЮДЕНИЯ ПРЕПОДАВАТЕЛЯ ПО ХОДУ ОБУЧЕНИЯ:\n${observationContext}\n\nПОСЛЕДНИЕ УРОКИ:\n${lessonContext}\n\nУЖЕ СТОИТ В ПОВТОРЕНИИ:\n${recyclingContext}\n\nПРОФИЛЬ НАВЫКОВ:\n${skillsContext}\n\nУЖЕ В ПЛАНЕ ОБУЧЕНИЯ:\n${planContext}\n\nИСТОЧНИКИ КУРСОВ В GOOGLE DRIVE:\n${driveContext}\n\nВАЖНО ПРО ИСТОЧНИКИ:\nЗдесь перечислены только имена папок/файлов верхнего уровня. Не придумывай их содержание. Используй названия только как ориентир, что у преподавателя есть такой источник.\n\nПРАВИЛА:\n- опирайся только на факты из переданного контекста; не придумывай грамматику, лексику, ошибки, слабости или темы только потому, что они типичны для класса или учебника;\n- если данных для вывода недостаточно, формулируй действие как «проверить / диагностировать», а не как «повторить / отработать»;\n- каждый приоритет и действие должны быть конкретно связаны с фактом: текущей позицией, подтверждённой историей, наблюдением, профилем навыка, активным повторением или последним уроком;\n- подтверждённая историческая встреча с материалом сама по себе не является основанием считать его освоенным или ставить его в повторение;\n- recycleItems добавляй ТОЛЬКО когда есть прямое основание: наблюдение преподавателя о трудности/повторении, уже зафиксированный слабый навык, незакрытый результат урока или явная очередь повторения; если такого основания нет — верни пустой массив;\n- если исторический материал стоит проверить, но трудность не доказана, помести это в watch или nextLesson как короткую диагностику, а не в recycleItems;\n- не ставь диагнозы и не делай выводы о способностях ученика без данных;\n- отличай фактическую позицию по курсу, текущую школьную тему и долгосрочную цель;\n- рекомендации должны помогать выбрать следующие 2–4 урока, а не быть общей теорией;\n- избегай универсальных формулировок вроде «расширять словарный запас», «укреплять грамматику», «развивать говорение» без конкретного основания и конкретного действия;\n- учитывай уже активные пункты плана и повторения, не дублируй их без причины;\n- для экзаменационного курса упоминай экзаменационную траекторию только если она действительно следует из названия/контекста курса;\n- мысль строится по логике ФАКТ → ВЫВОД → ДЕЙСТВИЕ;\n- язык ответа — русский;\n- верни ТОЛЬКО JSON без markdown.\n\nФОРМАТ JSON:\n{\n  "summary": "2-4 предложения: конкретные факты о текущем состоянии, что из них следует и общая стратегия",\n  "priorities": ["3-5 конкретных приоритетов на ближайшие уроки, каждый с понятным основанием"],\n  "nextLesson": ["конкретные действия ближайшего урока; если данных мало — короткая диагностика конкретного пункта"],\n  "watch": ["что именно наблюдать или проверять, если навык ещё не подтверждён данными"],\n  "planItems": ["короткие обоснованные пункты, которые можно добавить в план обучения"],\n  "recycleItems": ["только доказанные языковые трудности для повторения; иначе пустой массив"]\n}`;

  const result = await generateKieText({
    route: 'analysis',
    key,
    purpose: 'student-advice',
    studentId,
    input: [{ type: 'input_text', text: prompt }],
  });
  const text = result.text;
  const advice = parseAdvice(text);
  if (!advice) throw new Error('KIE не вернул корректные рекомендации');
  return { advice, credits: result.credits };
}
