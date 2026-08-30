import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { generateKieText } from '@/lib/ai-routing';
import { getCourseHistoricalMaterialCandidates, getHistoricalCandidateSnippets } from '@/lib/historical-course-materials';
import { evidenceFingerprint, parseHistoryBootstrapAnalysis, type HistoryBootstrapAnalysis, type HistorySourceRef } from '@/lib/history-bootstrap-utils';

export type HistoricalCoverageView = {
  id: string;
  enrollmentId: string;
  status: 'confirmed' | 'rejected';
  stage: string | null;
  lesson: string | null;
  topic: string | null;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  sourceRefs: HistorySourceRef[];
  details: Record<string, unknown>;
  teacherNote: string | null;
};

export type HistoryBootstrapRunView = {
  id: string;
  enrollmentId: string;
  status: 'draft' | 'confirmed' | 'failed';
  analysis: HistoryBootstrapAnalysis | null;
  error: string | null;
};

function normalizeStoredAnalysis(value: unknown): HistoryBootstrapAnalysis | null {
  if (!value) return null;
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return parseHistoryBootstrapAnalysis(text);
  } catch {
    return null;
  }
}

export async function getStudentHistoryBootstrapView(studentId: string) {
  const sql = db();
  try {
    const [coverage, runs] = await Promise.all([
      sql<Array<Omit<HistoricalCoverageView, 'confidence' | 'sourceRefs' | 'details'> & { confidence: unknown; sourceRefs: unknown; details: unknown }>>`
        SELECT h.id, h.enrollment_id as "enrollmentId", h.status, h.stage_label as stage,
               h.lesson_label as lesson, h.topic, h.coverage_summary as summary, h.confidence,
               h.source_refs as "sourceRefs", h.details, h.teacher_note as "teacherNote"
        FROM historical_coverage h JOIN enrollments e ON e.id=h.enrollment_id
        WHERE e.student_id=${studentId} ORDER BY h.updated_at DESC LIMIT 100
      `,
      sql<Array<Omit<HistoryBootstrapRunView, 'analysis'> & { analysis: unknown }>>`
        SELECT DISTINCT ON (r.enrollment_id) r.id, r.enrollment_id as "enrollmentId", r.status,
               r.analysis, r.error_message as error
        FROM history_bootstrap_runs r JOIN enrollments e ON e.id=r.enrollment_id
        WHERE e.student_id=${studentId}
        ORDER BY r.enrollment_id, r.updated_at DESC
      `,
    ]);

    const safeCoverage: HistoricalCoverageView[] = coverage.map((item) => ({
      ...item,
      confidence: ['high', 'medium', 'low'].includes(String(item.confidence)) ? item.confidence as HistoricalCoverageView['confidence'] : 'low',
      sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs as HistorySourceRef[] : [],
      details: item.details && typeof item.details === 'object' && !Array.isArray(item.details) ? item.details as Record<string, unknown> : {},
    }));
    const safeRuns: HistoryBootstrapRunView[] = runs.map((run) => ({ ...run, analysis: normalizeStoredAnalysis(run.analysis) }));
    return { coverage: safeCoverage, runs: safeRuns };
  } catch (error) {
    console.error('[history-bootstrap] Student history view unavailable:', error);
    return { coverage: [] as HistoricalCoverageView[], runs: [] as HistoryBootstrapRunView[] };
  }
}

export async function runHistoryBootstrap(studentId: string, enrollmentId: string) {
  const sql = db();
  const contexts = await sql<Array<{
    student: string; course: string; courseId: string; stage: string | null; lesson: string | null;
  }>>`
    SELECT s.display_name as student, c.title as course, c.id as "courseId",
           p.stage_label as stage, p.lesson_label as lesson
    FROM enrollments e
    JOIN students s ON s.id=e.student_id AND s.active=true
    JOIN courses c ON c.id=e.course_id AND c.active=true
    LEFT JOIN student_course_positions p ON p.enrollment_id=e.id
    WHERE e.id=${enrollmentId} AND e.student_id=${studentId} AND e.active=true LIMIT 1
  `;
  const context = contexts[0];
  if (!context) throw new Error('Активный курс ученика не найден');

  const driveSignal = AbortSignal.timeout(45_000);
  const candidates = await getCourseHistoricalMaterialCandidates({ enrollmentId, studentId, signal: driveSignal });
  const [rejected, map, lessonHistory, confirmed] = await Promise.all([
    sql<Array<{ sourceRefs: HistorySourceRef[] }>>`SELECT source_refs as "sourceRefs" FROM historical_coverage WHERE enrollment_id=${enrollmentId} AND status='rejected'`,
    sql<Array<{ stage: string; lesson: string | null; title: string; position: number }>>`SELECT stage_label as stage, lesson_label as lesson, title, position FROM course_map_items WHERE course_id=${context.courseId} ORDER BY position LIMIT 100`,
    sql<Array<{ date: string; stage: string; lesson: string | null; status: string }>>`SELECT to_char(occurred_on,'YYYY-MM-DD') as date,stage_label as stage,lesson_label as lesson,result_status as status FROM lesson_history WHERE enrollment_id=${enrollmentId} ORDER BY occurred_on DESC LIMIT 20`,
    sql<Array<{ stage: string | null; lesson: string | null; topic: string | null; summary: string; confidence: string }>>`SELECT stage_label as stage,lesson_label as lesson,topic,coverage_summary as summary,confidence FROM historical_coverage WHERE enrollment_id=${enrollmentId} AND status='confirmed' ORDER BY updated_at DESC LIMIT 20`,
  ]);
  const rejectedIds = new Set(rejected.flatMap((row) => row.sourceRefs || []).map((ref) => ref.id));
  const eligible = candidates.filter((candidate) => !rejectedIds.has(candidate.id));
  const fingerprint = evidenceFingerprint(enrollmentId, eligible);

  let analysis: HistoryBootstrapAnalysis;
  if (!eligible.length) {
    analysis = { summary: 'Подходящих старых материалов не найдено. Можно указать текущую позицию вручную.', findings: [], currentPositionCandidate: null, questions: [] };
  } else {
    const key = process.env.KIE_API_KEY?.trim();
    if (!key) throw new Error('KIE AI не настроен');
    const snippets = await getHistoricalCandidateSnippets(eligible, driveSignal);
    const evidence = eligible.slice(0, 60).map((item) => ({
      id: item.id, title: item.title, path: item.path, url: item.url, modifiedTime: item.modifiedTime,
      association: item.association, deterministicConfidence: snippets.has(item.id) ? item.confidence : item.confidence === 'high' ? 'medium' : 'low', references: item.references,
      extractedSnippet: snippets.get(item.id) || null,
    }));
    const prompt = `Ты анализируешь исторические следы занятий ученика до начала цифрового журнала.
Наличие файла означает только вероятный факт работы с темой/материалом, но НИКОГДА не mastery.
Shared candidate нельзя автоматически приписывать ученику: задай конкретный вопрос преподавателю.
Не меняй Course Map, current position, mastery или recycling. Только предложи findings и максимум 5 вопросов при реальной неоднозначности.

Ученик: ${context.student}
Курс: ${context.course}
Текущая позиция: ${context.stage || 'не задана'} / ${context.lesson || 'не задана'}
Course Map: ${JSON.stringify(map)}
История журнала: ${JSON.stringify(lessonHistory)}
Уже подтверждённая historical coverage: ${JSON.stringify(confirmed)}
Кандидаты Drive после детерминированной фильтрации: ${JSON.stringify(evidence)}

Верни только JSON:
{"summary":"...","findings":[{"key":"...","stage":null,"lesson":null,"topic":null,"pages":null,"grammar":[],"vocabulary":[],"skills":[],"coverageSummary":"...","sourceRefs":[{"id":"...","title":"...","path":"...","url":null,"modifiedTime":null}],"confidence":"high|medium|low","association":"student_specific|shared_candidate"}],"currentPositionCandidate":{"stage":"...","lesson":null,"confidence":"medium","reason":"..."},"questions":[{"id":"...","type":"...","text":"...","options":[{"value":"...","label":"..."}],"relatedFindingKeys":["..."]}]}`;
    const result = await generateKieText({ route: 'analysis', key, purpose: 'history_bootstrap', studentId, enrollmentId, input: [{ type: 'input_text', text: prompt }] });
    const parsed = parseHistoryBootstrapAnalysis(result.text);
    if (!parsed) throw new Error('AI вернул некорректный формат анализа истории');
    const eligibleById = new Map(eligible.map((candidate) => [candidate.id, candidate]));
    analysis = {
      ...parsed,
      findings: parsed.findings.map((finding) => {
        const matchedCandidates = finding.sourceRefs.flatMap((ref) => {
          const candidate = eligibleById.get(ref.id);
          return candidate ? [candidate] : [];
        });
        const association = matchedCandidates.length > 0 && matchedCandidates.every((candidate) => candidate.association === 'student_specific')
          ? 'student_specific' as const : 'shared_candidate' as const;
        const allHigh = matchedCandidates.length > 0 && matchedCandidates.every((candidate) => candidate.confidence === 'high' && snippets.has(candidate.id));
        return {
          ...finding,
          sourceRefs: matchedCandidates.map((candidate) => ({ id: candidate.id, title: candidate.title, path: candidate.path, url: candidate.url, modifiedTime: candidate.modifiedTime })),
          association,
          confidence: association === 'student_specific' && allHigh ? finding.confidence : finding.confidence === 'high' ? 'medium' as const : finding.confidence,
        };
      }).filter((finding) => finding.sourceRefs.length > 0),
    };
  }

  const id = randomUUID();
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO history_bootstrap_runs(id,enrollment_id,status,evidence_fingerprint,analysis,error_message)
    VALUES(${id},${enrollmentId},'draft',${fingerprint},${JSON.stringify(analysis)}::jsonb,NULL)
    ON CONFLICT(enrollment_id,evidence_fingerprint) DO UPDATE
      SET status='draft',analysis=EXCLUDED.analysis,error_message=NULL,updated_at=now()
    RETURNING id
  `;
  return rows[0]?.id || id;
}