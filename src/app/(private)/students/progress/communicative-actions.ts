'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db, dbConfigured } from '@/lib/db';
import { communicativeTopicKey, speakingLevelForStage, type CommunicativeTopicStatus } from '@/lib/communicative-core';

function validStatus(value: string): value is CommunicativeTopicStatus {
  return ['practising', 'recycle', 'mastered'].includes(value);
}

export async function saveCommunicativeTopicResult(formData: FormData) {
  if (!dbConfigured()) return;
  const enrollmentId = String(formData.get('enrollmentId') || '').trim();
  const studentId = String(formData.get('studentId') || '').trim();
  const topic = String(formData.get('topic') || '').trim();
  const answerStage = Number(String(formData.get('answerStage') || ''));
  const statusValue = String(formData.get('topicStatus') || '').trim();
  const evidence = String(formData.get('evidence') || '').trim();
  const dateRaw = String(formData.get('date') || '').trim();
  const practisedOn = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
  const topicKey = communicativeTopicKey(topic);

  if (!enrollmentId || !studentId || !topicKey || !Number.isInteger(answerStage) || answerStage < 1 || answerStage > 5 || !validStatus(statusValue)) return;

  const sql = db();
  const enrollment = await sql<Array<{ id: string }>>`
    SELECT id FROM enrollments
    WHERE id=${enrollmentId} AND student_id=${studentId} AND active=true
    LIMIT 1
  `;
  if (!enrollment.length) return;

  const observedSpeakingLevel = speakingLevelForStage(answerStage);
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO communicative_topic_mastery(
        id,enrollment_id,topic_key,topic_label,answer_stage,status,evidence,last_practised_on,updated_at
      ) VALUES(
        ${randomUUID()},${enrollmentId},${topicKey},${topic},${answerStage},${statusValue},${evidence || null},
        COALESCE(${practisedOn}::date,CURRENT_DATE),now()
      )
      ON CONFLICT(enrollment_id,topic_key) DO UPDATE SET
        topic_label=EXCLUDED.topic_label,
        answer_stage=EXCLUDED.answer_stage,
        status=EXCLUDED.status,
        evidence=EXCLUDED.evidence,
        last_practised_on=EXCLUDED.last_practised_on,
        updated_at=now()
    `;

    const currentSpeaking = await tx<Array<{ level: number }>>`
      SELECT level::int as level FROM skill_profiles
      WHERE enrollment_id=${enrollmentId} AND skill='speaking' LIMIT 1
    `;
    const nextSpeakingLevel = currentSpeaking.length
      ? Math.round(currentSpeaking[0].level * 0.7 + observedSpeakingLevel * 0.3)
      : observedSpeakingLevel;
    const speakingNote = `Communicative Core: stage ${answerStage}/5; последняя тема — ${topic}`;
    await tx`
      INSERT INTO skill_profiles(id,enrollment_id,skill,level,note,updated_at)
      VALUES(${randomUUID()},${enrollmentId},'speaking',${nextSpeakingLevel},${speakingNote},now())
      ON CONFLICT(enrollment_id,skill) DO UPDATE SET
        level=EXCLUDED.level,note=EXCLUDED.note,updated_at=now()
    `;

    if (statusValue === 'recycle') {
      await tx`
        INSERT INTO recycling_items(id,enrollment_id,label,category,priority,status)
        SELECT ${randomUUID()},${enrollmentId},${topic},'communicative_core',2,'active'
        WHERE NOT EXISTS(
          SELECT 1 FROM recycling_items
          WHERE enrollment_id=${enrollmentId} AND status='active' AND lower(trim(label))=lower(${topic})
        )
      `;
    }
    if (statusValue === 'mastered') {
      await tx`
        UPDATE recycling_items SET status='done',completed_at=now()
        WHERE enrollment_id=${enrollmentId} AND status='active' AND lower(trim(label))=lower(${topic})
      `;
    }
  });

  revalidatePath('/students/progress');
  revalidatePath(`/students/${studentId}`);
  revalidatePath('/');
}
