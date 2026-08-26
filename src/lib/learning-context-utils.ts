export function excludeUsedQids<T extends {qid:string}>(tasks:T[],usedQids:string[]){const used=new Set(usedQids);return tasks.filter((task)=>!used.has(task.qid));}
export function rankByIntent<T extends {id:string;name:string;path:string}>(items:T[],intent:Record<string,unknown>,used:string[],limit=10){const needles=Object.values(intent).flatMap((value)=>typeof value==='string'?value.toLocaleLowerCase('ru').split(/[^\p{L}\p{N}]+/u):[]).filter((term)=>term.length>2);const excluded=new Set(used);return items.filter((item)=>!excluded.has(item.id)).map((item)=>({item,score:needles.reduce((sum,term)=>sum+(item.path.toLocaleLowerCase('ru').includes(term)?1:0),0)})).sort((a,b)=>b.score-a.score||a.item.name.localeCompare(b.item.name,'ru')).slice(0,Math.min(limit,15)).map(({item})=>item);}

type CourseMapItem = { id: string; position: number; stage: string; lesson: string | null; title: string; intent: Record<string, unknown> };
type CurrentPosition = { mapItemId: string | null; stage: string; lesson: string | null } | null;
type LessonRecord = { enrollmentId: string; stage: string; lesson: string | null; status: string };

function sameLabel(left: string | null | undefined, right: string | null | undefined) {
  return (left || '').trim().toLocaleLowerCase('ru') === (right || '').trim().toLocaleLowerCase('ru');
}

export function resolveCurrentAndNext(items: CourseMapItem[], position: CurrentPosition, history: LessonRecord[], enrollmentId: string) {
  const currentIndex = position?.mapItemId ? items.findIndex((item) => item.id === position.mapItemId) : -1;
  const currentMapItem = currentIndex >= 0 ? items[currentIndex] : null;
  const matchingHistory = position
    ? history.find((record) => record.enrollmentId === enrollmentId && sameLabel(record.stage, position.stage) && sameLabel(record.lesson, position.lesson))
    : undefined;
  const currentCompleted = matchingHistory?.status === 'completed';

  if (currentCompleted && currentIndex >= 0) {
    return { current: items[currentIndex + 1] || null, next: items[currentIndex + 2] || null, currentCompleted };
  }
  return { current: currentMapItem, next: currentIndex >= 0 ? items[currentIndex + 1] || null : null, currentCompleted };
}

export function isDiagnosticIntent(intent: Record<string, unknown>) {
  const value = [intent.topic, intent.stage, intent.lesson].filter((item): item is string => typeof item === 'string').join(' ').toLocaleLowerCase('ru');
  return /(?:diagnostic|entry|start|диагност|входн|старт)/i.test(value);
}

export function materialSearchTokens(intent: Record<string, unknown>) {
  const raw = [intent.studentName, intent.courseTitle, intent.topic, intent.stage, intent.lesson]
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .toLocaleLowerCase('ru');
  const tokens = raw.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2);
  if (/\b(?:оге|oge)\b/i.test(raw)) tokens.push('oge', 'огэ');
  if (/(?:старт|start)/i.test(raw)) tokens.push('start', 'старт');
  const lessonNumber = raw.match(/(?:урок|lesson)\s*0*(\d+)/i)?.[1];
  if (lessonNumber) tokens.push(`lesson ${lessonNumber.padStart(2, '0')}`, `урок ${Number(lessonNumber)}`);
  return [...new Set(tokens)];
}

export function materialMatchScore(value: string, intent: Record<string, unknown>) {
  const normalized = value.toLocaleLowerCase('ru');
  return materialSearchTokens(intent).reduce((score, token) => score + (normalized.includes(token) ? (token.includes(' ') ? 4 : 1) : 0), 0);
}

export function prioritizeMaterialBranches<T extends { path: string }>(items: T[], intent: Record<string, unknown>) {
  return items.map((item, index) => ({ item, index, score: materialMatchScore(item.path, intent) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

export const DIAGNOSTIC_OGE_SECTIONS = ['Grammar', 'Reading', 'Listening'] as const;
