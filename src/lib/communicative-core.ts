import 'server-only';
import { db, dbConfigured } from '@/lib/db';

export type CommunicativeTopicStatus = 'practising' | 'recycle' | 'mastered';

export const ANSWER_STAGE_DESCRIPTORS: Record<number, string> = {
  1: 'слово/короткая фраза + 1 простое предложение по модели',
  2: '1–2 простых связанных предложения; можно использовать and / but / because',
  3: '3–4 связанных предложения с причиной или примером',
  4: '5–6 предложений: объяснение, сравнение или уточняющий follow-up',
  5: 'развёрнутый связный ответ: мнение, аргумент, пример и спонтанный follow-up',
};

export function speakingStageFromLevel(level: number | null | undefined) {
  if (level === null || level === undefined || !Number.isFinite(level)) return 3;
  if (level <= 20) return 1;
  if (level <= 40) return 2;
  if (level <= 60) return 3;
  if (level <= 80) return 4;
  return 5;
}

export function speakingLevelForStage(stage: number) {
  const safe = Math.max(1, Math.min(5, Math.round(stage)));
  return [10, 30, 50, 70, 90][safe - 1];
}

export function communicativeTopicKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

type MasteryRow = {
  topicLabel: string;
  answerStage: number;
  status: CommunicativeTopicStatus;
  lastPractisedOn: string;
};

export async function buildCommunicativeCorePrompt(enrollmentId: string | null) {
  let speakingLevel: number | null = null;
  let speakingNote: string | null = null;
  let currentTopic: string | null = null;
  let recycling: string[] = [];
  let mastery: MasteryRow[] = [];

  if (enrollmentId && dbConfigured()) {
    const sql = db();
    try {
      const [speakingRows, schoolRows, recyclingRows] = await Promise.all([
        sql<Array<{ level: number; note: string | null }>>`
          SELECT level::int as level, note FROM skill_profiles
          WHERE enrollment_id=${enrollmentId} AND skill='speaking' LIMIT 1
        `,
        sql<Array<{ module: string | null; topic: string | null }>>`
          SELECT module, topic FROM school_positions WHERE enrollment_id=${enrollmentId} LIMIT 1
        `,
        sql<Array<{ label: string }>>`
          SELECT label FROM recycling_items
          WHERE enrollment_id=${enrollmentId} AND status='active'
          ORDER BY priority ASC, created_at ASC LIMIT 8
        `,
      ]);
      speakingLevel = speakingRows[0]?.level ?? null;
      speakingNote = speakingRows[0]?.note ?? null;
      const school = schoolRows[0];
      currentTopic = school?.topic?.trim() || school?.module?.trim() || null;
      recycling = recyclingRows.map((item) => item.label).filter(Boolean);
    } catch (error) {
      console.error('[communicative-core] Base context unavailable:', error);
    }

    try {
      mastery = await sql<MasteryRow[]>`
        SELECT topic_label as "topicLabel", answer_stage::int as "answerStage", status,
               to_char(last_practised_on, 'YYYY-MM-DD') as "lastPractisedOn"
        FROM communicative_topic_mastery
        WHERE enrollment_id=${enrollmentId}
        ORDER BY CASE status WHEN 'recycle' THEN 0 WHEN 'practising' THEN 1 ELSE 2 END,
                 updated_at DESC
        LIMIT 12
      `;
    } catch {
      // Migration can be deployed just before it is applied. The core still works from skill/recycling context.
      mastery = [];
    }
  }

  const answerStage = speakingStageFromLevel(speakingLevel);
  const stageDescription = ANSWER_STAGE_DESCRIPTORS[answerStage];
  const recycleTopics = mastery.filter((item) => item.status === 'recycle').map((item) => item.topicLabel);
  const practisedTopics = mastery.filter((item) => item.status !== 'recycle').map((item) => item.topicLabel);
  const knownTopics = [...new Set([...recycleTopics, ...recycling, ...practisedTopics])].slice(0, 10);

  return `COMMUNICATIVE CORE CONTRACT — обязательный короткий слой каждого обычного урока.
- Формат: 5–8 минут устной работы + 1–2 минуты Writing Transfer в конце этого слоя.
- Дай 3–5 устных вопросов. Примерно 70% вопросов должны возвращать уже знакомые/нуждающиеся в повторении темы, примерно 30% — текущую школьную тему. Это ориентир, а не математическая квота: не выдумывай прошлые темы, если данных мало.
- Текущая тема: ${currentTopic || 'определи только из переданного контекста урока; не выдумывай'}.
- Темы для осмысленного recycling: ${knownTopics.length ? knownTopics.join('; ') : 'отдельно подтверждённых тем пока нет — используй только реальное повторение из контекста урока'}.
- Общий speaking profile: ${speakingLevel === null ? 'не заполнен' : `${speakingLevel}/100`}${speakingNote ? ` — ${speakingNote}` : ''}.
- Рабочая ступень ответа: ${answerStage}/5 — ${stageDescription}. Если реальный контекст ученика явно требует больше опор, упрости формулировку, но не меняй долгосрочный маршрут.
- Для каждого вопроса дай короткую опору: sentence starter / useful chunk. Опоры должны постепенно сниматься от вопроса к вопросу.
- Не превращай Communicative Core в экзаменационный тренажёр. Если в контексте есть ОГЭ или ВПР, развивай переносимый язык, связность, аргументацию и реакцию на вопрос, но НЕ хардкодь номера заданий, шаблоны конкретного варианта или формат экзамена без явного источника.
- Writing Transfer обязан использовать ту же лексику/chunks и ту же коммуникативную функцию, что только что были в речи. Объём по ступени: 1 → 1 предложение; 2 → 2 предложения; 3 → 3–4; 4 → 5–6; 5 → 6–8 или короткое связное сообщение.
- Это fast-generation слой: не анализируй весь курс и не перестраивай долгосрочный маршрут.

Верни PLAIN TEXT в компактной структуре:
COMMUNICATIVE CORE — Stage ${answerStage}/5
Speaking (5–8 min)
1. ...
Useful language: ...
...
Writing Transfer (1–2 min)
...
Teacher signal: одна короткая строка, что наблюдать в речи (не ставь диагноз и не объявляй mastery автоматически).`;
}
