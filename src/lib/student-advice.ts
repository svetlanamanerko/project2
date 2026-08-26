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

  const [courses, observations, recentLessons, recycling, skills, planItems] = await Promise.all([
    sql<Array<{
      enrollmentId: string;
      courseId: string;
      course: string;
      driveFolderId: string | null;
      module: string | null;
      topic: string | null;
      note: string | null;
    }>>`
      SELECT e.id as "enrollmentId", c.id as "courseId", c.title as course,
             c.drive_folder_id as "driveFolderId", sp.module, sp.topic, sp.note
      FROM enrollments e
      JOIN courses c ON c.id=e.course_id AND c.active=true
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
    ? courses.map((course) => `${course.course} [enrollment ${course.enrollmentId}] — модуль: ${course.module || 'не указан'}; тема: ${course.topic || 'не указана'}; сейчас важно: ${course.note || 'нет'}`).join('\n')
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

  const prompt = `Ты методист личной «Мастерской уроков» преподавателя английского языка. Проанализируй конкретного ученика и предложи практический маршрут обучения.\n\nУЧЕНИК:\n${student.displayName}${student.schoolGrade ? `, ${student.schoolGrade} класс` : ''}\n\nПОСТОЯННЫЙ КОНТЕКСТ / ИСТОРИЯ:\n${student.notes || 'Пока не заполнено.'}\n\nАКТИВНЫЕ КУРСЫ И ТЕКУЩАЯ ПОЗИЦИЯ:\n${courseContext}\n\nНАБЛЮДЕНИЯ ПРЕПОДАВАТЕЛЯ ПО ХОДУ ОБУЧЕНИЯ:\n${observationContext}\n\nПОСЛЕДНИЕ УРОКИ:\n${lessonContext}\n\nУЖЕ СТОИТ В ПОВТОРЕНИИ:\n${recyclingContext}\n\nПРОФИЛЬ НАВЫКОВ:\n${skillsContext}\n\nУЖЕ В ПЛАНЕ ОБУЧЕНИЯ:\n${planContext}\n\nИСТОЧНИКИ КУРСОВ В GOOGLE DRIVE:\n${driveContext}\n\nВАЖНО ПРО ИСТОЧНИКИ:\nЗдесь перечислены только имена папок/файлов верхнего уровня. Не придумывай их содержание. Используй названия только как ориентир, что у преподавателя есть такой источник.\n\nПРАВИЛА:\n- опирайся на реальные наблюдения и историю ученика;\n- не ставь диагнозы и не делай выводы о способностях ученика без данных;\n- отличай текущую школьную помощь от долгосрочной цели курса;\n- рекомендации должны помогать выбрать следующие 2–4 урока, а не быть общей теорией;\n- учитывай уже активные пункты плана и повторения, не дублируй их без причины;\n- для экзаменационного курса учитывай необходимость баланса формата экзамена и реального языка;\n- язык ответа — русский;\n- верни ТОЛЬКО JSON без markdown.\n\nФОРМАТ JSON:\n{\n  "summary": "2-4 предложения: где ученик сейчас и общая стратегия",\n  "priorities": ["3-5 конкретных приоритетов на ближайшие уроки"],\n  "nextLesson": ["что разумно включить в ближайший урок"],\n  "watch": ["на что преподавателю наблюдать и что проверять"],\n  "planItems": ["короткие пункты, которые можно добавить в план обучения"],\n  "recycleItems": ["короткие языковые пункты, которые стоит поставить в повторение"]\n}`;

  const result = await generateKieText({
    route: 'analysis',
    key,
    input: [{ type: 'input_text', text: prompt }],
  });
  const text = result.text;
  const advice = parseAdvice(text);
  if (!advice) throw new Error('KIE не вернул корректные рекомендации');
  return { advice, credits: result.credits };
}
