'use server';

import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, dbConfigured } from '@/lib/db';
import { getAppDateString, isoWeekday } from '@/lib/data';
import { getGoogleDriveCourseFolder } from '@/lib/google-drive-source-folders';
import { generateStudentLearningAdvice } from '@/lib/student-advice';
import { validDuration, validStartTime, validWeekday } from '@/lib/schedule-utils';

function requireDb() {
  if (!dbConfigured()) throw new Error('Сначала подключите PostgreSQL');
  return db();
}

function splitLearningItems(value: string) {
  return value
    .split(/\n|;/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function addStudent(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const gradeRaw = String(formData.get('grade') || '').trim();
  if (!name) return;
  const grade = gradeRaw ? Number(gradeRaw) : null;
  await requireDb()`INSERT INTO students (id, display_name, school_grade) VALUES (${randomUUID()}, ${name}, ${grade})`;
  revalidatePath('/students');
}

export async function updateStudentContext(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const context = String(formData.get('context') || '').trim();
  if (!studentId) return;
  await requireDb()`UPDATE students SET notes=${context || null} WHERE id=${studentId} AND active=true`;
  revalidatePath(`/students/${studentId}`);
  revalidatePath('/students');
}

export async function updateStudentCurrentFocus(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const enrollmentId = String(formData.get('enrollmentId') || '').trim();
  const note = String(formData.get('note') || '').trim();
  if (!studentId || !enrollmentId) return;
  const sql = requireDb();
  await sql`
    INSERT INTO school_positions (enrollment_id, note, updated_at)
    SELECT e.id, ${note || null}, now()
    FROM enrollments e
    WHERE e.id=${enrollmentId} AND e.student_id=${studentId} AND e.active=true
    ON CONFLICT (enrollment_id) DO UPDATE SET note=EXCLUDED.note, updated_at=now()
  `;
  revalidatePath(`/students/${studentId}`);
  revalidatePath('/');
}

export async function addStudentObservation(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const enrollmentId = String(formData.get('enrollmentId') || '').trim();
  const observedOnRaw = String(formData.get('observedOn') || '').trim();
  const strengths = String(formData.get('strengths') || '').trim();
  const difficulties = String(formData.get('difficulties') || '').trim();
  const recycle = String(formData.get('recycle') || '').trim();
  const comment = String(formData.get('comment') || '').trim();
  if (!studentId || !enrollmentId || (!strengths && !difficulties && !recycle && !comment)) return;

  const observedOn = /^\d{4}-\d{2}-\d{2}$/.test(observedOnRaw) ? observedOnRaw : getAppDateString();
  const sql = requireDb();
  const valid = await sql<Array<{ id: string }>>`
    SELECT id FROM enrollments
    WHERE id=${enrollmentId} AND student_id=${studentId} AND active=true
    LIMIT 1
  `;
  if (!valid.length) return;

  await sql`
    INSERT INTO student_observations (id, student_id, enrollment_id, observed_on, strengths, difficulties, recycle, comment)
    VALUES (${randomUUID()}, ${studentId}, ${enrollmentId}, ${observedOn}::date, ${strengths || null}, ${difficulties || null}, ${recycle || null}, ${comment || null})
  `;

  for (const label of splitLearningItems(recycle)) {
    await sql`
      INSERT INTO recycling_items (id, enrollment_id, label, category, priority, status)
      SELECT ${randomUUID()}, ${enrollmentId}, ${label}, 'observation', 2, 'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM recycling_items
        WHERE enrollment_id=${enrollmentId} AND status='active' AND lower(label)=lower(${label})
      )
    `;
  }

  revalidatePath(`/students/${studentId}`);
  revalidatePath('/');
}

export async function generateStudentAdviceAction(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  if (!studentId) return;
  try {
    const { advice, credits } = await generateStudentLearningAdvice(studentId);
    await requireDb()`
      INSERT INTO student_recommendations (id, student_id, analysis, credits)
      VALUES (${randomUUID()}, ${studentId}, ${JSON.stringify(advice)}::jsonb, ${credits})
    `;
  } catch (error) {
    console.error('[student-advice] Не удалось построить рекомендации:', error);
    redirect(`/students/${studentId}?advice=error#recommendations`);
  }
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}?advice=ready#recommendations`);
}

export async function addLearningPlanItem(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const enrollmentId = String(formData.get('enrollmentId') || '').trim();
  const label = String(formData.get('label') || '').trim();
  const recommendationId = String(formData.get('recommendationId') || '').trim();
  if (!studentId || !enrollmentId || !label) return;
  const sql = requireDb();
  const valid = await sql<Array<{ id: string }>>`
    SELECT id FROM enrollments WHERE id=${enrollmentId} AND student_id=${studentId} AND active=true LIMIT 1
  `;
  if (!valid.length) return;
  let sourceRecommendationId: string | null = null;
  if (recommendationId) {
    const recommendation = await sql<Array<{ id: string }>>`
      SELECT id FROM student_recommendations WHERE id=${recommendationId} AND student_id=${studentId} LIMIT 1
    `;
    sourceRecommendationId = recommendation[0]?.id || null;
  }
  await sql`
    INSERT INTO learning_plan_items (id, enrollment_id, label, status, source_recommendation_id)
    SELECT ${randomUUID()}, ${enrollmentId}, ${label}, 'active', ${sourceRecommendationId}
    WHERE NOT EXISTS (
      SELECT 1 FROM learning_plan_items
      WHERE enrollment_id=${enrollmentId} AND status='active' AND lower(label)=lower(${label})
    )
  `;
  revalidatePath(`/students/${studentId}`);
}

export async function addRecyclingItem(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const enrollmentId = String(formData.get('enrollmentId') || '').trim();
  const label = String(formData.get('label') || '').trim();
  if (!studentId || !enrollmentId || !label) return;
  const sql = requireDb();
  const valid = await sql<Array<{ id: string }>>`
    SELECT id FROM enrollments WHERE id=${enrollmentId} AND student_id=${studentId} AND active=true LIMIT 1
  `;
  if (!valid.length) return;
  await sql`
    INSERT INTO recycling_items (id, enrollment_id, label, category, priority, status)
    SELECT ${randomUUID()}, ${enrollmentId}, ${label}, 'recommendation', 2, 'active'
    WHERE NOT EXISTS (
      SELECT 1 FROM recycling_items
      WHERE enrollment_id=${enrollmentId} AND status='active' AND lower(label)=lower(${label})
    )
  `;
  revalidatePath(`/students/${studentId}`);
  revalidatePath('/');
}

export async function completeLearningPlanItem(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const itemId = String(formData.get('itemId') || '').trim();
  if (!studentId || !itemId) return;
  await requireDb()`
    UPDATE learning_plan_items p
    SET status='done', completed_at=now()
    FROM enrollments e
    WHERE p.id=${itemId} AND p.enrollment_id=e.id AND e.student_id=${studentId}
  `;
  revalidatePath(`/students/${studentId}`);
}

export async function completeRecyclingItem(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const itemId = String(formData.get('itemId') || '').trim();
  if (!studentId || !itemId) return;
  await requireDb()`
    UPDATE recycling_items r
    SET status='done', completed_at=now()
    FROM enrollments e
    WHERE r.id=${itemId} AND r.enrollment_id=e.id AND e.student_id=${studentId}
  `;
  revalidatePath(`/students/${studentId}`);
  revalidatePath('/');
}

export async function addCourse(formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  const gradeRaw = String(formData.get('grade') || '').trim();
  if (!title) return;
  const grade = gradeRaw ? Number(gradeRaw) : null;
  await requireDb()`INSERT INTO courses (id, title, grade) VALUES (${randomUUID()}, ${title}, ${grade})`;
  revalidatePath('/courses');
}

export async function updateCourse(formData: FormData) {
  const courseId = String(formData.get('courseId') || '').trim();
  const title = String(formData.get('title') || '').trim();
  const gradeRaw = String(formData.get('grade') || '').trim();
  const publisher = String(formData.get('publisher') || '').trim();
  if (!courseId || !title) return;
  const grade = gradeRaw ? Number(gradeRaw) : null;
  await requireDb()`UPDATE courses SET title=${title}, grade=${grade}, publisher=${publisher || null} WHERE id=${courseId}`;
  revalidatePath('/courses');
  revalidatePath('/students');
  revalidatePath('/');
  revalidatePath(`/courses/${courseId}`);
}

export async function updateCourseSource(formData: FormData) {
  const courseId = String(formData.get('courseId') || '').trim();
  const folderId = String(formData.get('folderId') || '').trim();
  if (!courseId || !folderId) return;

  let folder = null;
  try {
    folder = await getGoogleDriveCourseFolder(folderId);
  } catch (error) {
    console.error('[course-source] Не удалось проверить папку Google Drive:', error);
  }
  if (!folder) {
    redirect(`/courses/${courseId}?source=invalid#source`);
  }

  const sql=requireDb(); await sql.begin(async(tx)=>{await tx`UPDATE courses SET drive_folder_id=${folderId} WHERE id=${courseId} AND active=true`;await tx`UPDATE course_sources SET enabled=false WHERE course_id=${courseId} AND kind='google_drive_root'`;await tx`INSERT INTO course_sources(id,course_id,kind,title,drive_file_id,drive_url,enabled) VALUES(${randomUUID()},${courseId},'google_drive_root',${folder.name},${folder.id},${folder.webViewLink||`https://drive.google.com/drive/folders/${folder.id}`},true) ON CONFLICT(course_id,drive_file_id) WHERE kind='google_drive_root' AND enabled=true AND drive_file_id IS NOT NULL DO UPDATE SET title=EXCLUDED.title,drive_url=EXCLUDED.drive_url,enabled=true`});
  revalidatePath(`/courses/${courseId}`);
  revalidatePath('/courses');
  revalidatePath('/materials');
  redirect(`/courses/${courseId}?source=saved#source`);
}

export async function deleteCourse(formData: FormData) {
  const courseId = String(formData.get('courseId') || '').trim();
  if (!courseId) return;
  const sql = requireDb();
  const linked = await sql<Array<{ count: number }>>`
    SELECT count(*)::int as count FROM enrollments WHERE course_id=${courseId}
  `;
  if ((linked[0]?.count || 0) > 0) redirect('/courses?error=linked');
  await sql`DELETE FROM courses WHERE id=${courseId}`;
  revalidatePath('/courses');
  redirect('/courses?deleted=1');
}

export async function configureStudentCourse(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const courseId = String(formData.get('courseId') || '').trim();
  const weekdayRaw = String(formData.get('weekday') || '').trim();
  const time = String(formData.get('time') || '').trim();
  const durationRaw = String(formData.get('durationMinutes') || '60').trim();
  const module = String(formData.get('module') || '').trim();
  const topic = String(formData.get('topic') || '').trim();
  const note = String(formData.get('note') || '').trim();

  if (!studentId || !courseId) return;

  const sql = requireDb();
  await sql.begin(async (tx) => {
    const existing = await tx<Array<{ id: string }>>`
      SELECT id FROM enrollments
      WHERE student_id=${studentId} AND course_id=${courseId}
      LIMIT 1
    `;

    const enrollmentId = existing[0]?.id || randomUUID();

    if (existing.length) {
      await tx`UPDATE enrollments SET active=true WHERE id=${enrollmentId}`;
    } else {
      await tx`
        INSERT INTO enrollments (id, student_id, course_id, active, started_on)
        VALUES (${enrollmentId}, ${studentId}, ${courseId}, true, CURRENT_DATE)
      `;
    }

    if (module || topic || note) {
      await tx`
        INSERT INTO school_positions (enrollment_id, module, topic, note, updated_at)
        VALUES (${enrollmentId}, ${module || null}, ${topic || null}, ${note || null}, now())
        ON CONFLICT (enrollment_id) DO UPDATE SET
          module=EXCLUDED.module,
          topic=EXCLUDED.topic,
          note=EXCLUDED.note,
          updated_at=now()
      `;
    }

    const weekday = weekdayRaw ? Number(weekdayRaw) : null;
    const durationMinutes = Number(durationRaw);
    if (weekday && time && validWeekday(weekday) && validStartTime(time) && validDuration(durationMinutes)) {
      const same = await tx<Array<{ id: string }>>`
        SELECT id FROM schedule_rules
        WHERE enrollment_id=${enrollmentId}
          AND iso_weekday=${weekday}
          AND start_time=${time}::time
        ORDER BY active DESC
        LIMIT 1
      `;
      if (same.length) {
        await tx`UPDATE schedule_rules SET duration_minutes=${durationMinutes}, active=true WHERE id=${same[0].id}`;
      } else {
        await tx`
          INSERT INTO schedule_rules (id, enrollment_id, iso_weekday, start_time, duration_minutes, active)
          VALUES (${randomUUID()}, ${enrollmentId}, ${weekday}, ${time}::time, ${durationMinutes}, true)
        `;
      }
    }
  });

  revalidatePath('/students');
  revalidatePath('/');
  revalidatePath('/urgent');
}

function scheduleValues(formData: FormData) {
  const weekday = Number(String(formData.get('weekday') || ''));
  const time = String(formData.get('time') || '').trim();
  const durationMinutes = Number(String(formData.get('durationMinutes') || '60'));
  return { weekday, time, durationMinutes };
}

export async function addScheduleRule(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const enrollmentId = String(formData.get('enrollmentId') || '').trim();
  const { weekday, time, durationMinutes } = scheduleValues(formData);
  if (!studentId || !enrollmentId || !validWeekday(weekday) || !validStartTime(time) || !validDuration(durationMinutes)) return;
  const sql = requireDb();
  const enrollment = await sql<Array<{ id: string }>>`SELECT id FROM enrollments WHERE id=${enrollmentId} AND student_id=${studentId} AND active=true LIMIT 1`;
  if (!enrollment.length) return;
  const same = await sql<Array<{ id: string }>>`
    SELECT id FROM schedule_rules WHERE enrollment_id=${enrollmentId} AND iso_weekday=${weekday} AND start_time=${time}::time ORDER BY active DESC LIMIT 1
  `;
  if (same.length) await sql`UPDATE schedule_rules SET duration_minutes=${durationMinutes}, active=true WHERE id=${same[0].id}`;
  else await sql`INSERT INTO schedule_rules(id,enrollment_id,iso_weekday,start_time,duration_minutes,active) VALUES(${randomUUID()},${enrollmentId},${weekday},${time}::time,${durationMinutes},true)`;
  revalidatePath(`/students/${studentId}`);
  revalidatePath('/');
  redirect(`/students/${studentId}?schedule=added#schedule`);
}

export async function updateScheduleRule(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const scheduleId = String(formData.get('scheduleId') || '').trim();
  const { weekday, time, durationMinutes } = scheduleValues(formData);
  if (!studentId || !scheduleId || !validWeekday(weekday) || !validStartTime(time) || !validDuration(durationMinutes)) return;
  const sql = requireDb();
  const owned = await sql<Array<{ enrollmentId: string }>>`
    SELECT sr.enrollment_id as "enrollmentId" FROM schedule_rules sr JOIN enrollments e ON e.id=sr.enrollment_id
    WHERE sr.id=${scheduleId} AND e.student_id=${studentId} AND e.active=true LIMIT 1
  `;
  if (!owned.length) return;
  const duplicate = await sql<Array<{ id: string }>>`
    SELECT id FROM schedule_rules WHERE enrollment_id=${owned[0].enrollmentId} AND iso_weekday=${weekday} AND start_time=${time}::time AND active=true AND id<>${scheduleId} LIMIT 1
  `;
  if (duplicate.length) redirect(`/students/${studentId}?schedule=duplicate#schedule`);
  await sql`UPDATE schedule_rules SET iso_weekday=${weekday},start_time=${time}::time,duration_minutes=${durationMinutes},active=true WHERE id=${scheduleId}`;
  revalidatePath(`/students/${studentId}`);
  revalidatePath('/');
  redirect(`/students/${studentId}?schedule=updated#schedule`);
}

export async function deactivateScheduleRule(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const scheduleId = String(formData.get('scheduleId') || '').trim();
  if (!studentId || !scheduleId) return;
  await requireDb()`UPDATE schedule_rules sr SET active=false FROM enrollments e WHERE sr.id=${scheduleId} AND e.id=sr.enrollment_id AND e.student_id=${studentId}`;
  revalidatePath(`/students/${studentId}`);
  revalidatePath('/');
  redirect(`/students/${studentId}?schedule=removed#schedule`);
}

export async function createUrgentRequest(formData: FormData) {
  const enrollmentId = String(formData.get('enrollmentId') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const attachment = formData.get('attachment');

  if (!enrollmentId || !description) redirect('/urgent?error=missing');
  if (attachment instanceof File && attachment.size > 15 * 1024 * 1024) {
    redirect('/urgent?error=file-too-large');
  }

  const sql = requireDb();
  const requestId = randomUUID();
  const lessonId = randomUUID();
  let savedFile: null | {
    id: string;
    filename: string;
    storedName: string;
    mimeType: string;
    size: number;
    localPath: string;
  } = null;
  let failed = false;

  try {
    if (attachment instanceof File && attachment.size > 0) {
      const extension = path.extname(attachment.name).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
      const storedName = `${randomUUID()}${extension}`;
      const folder = path.join(process.env.DATA_DIR?.trim() || '/data', 'uploads', 'urgent', requestId);
      await mkdir(folder, { recursive: true });
      const localPath = path.join(folder, storedName);
      await writeFile(localPath, Buffer.from(await attachment.arrayBuffer()));
      savedFile = {
        id: randomUUID(),
        filename: attachment.name || 'attachment',
        storedName,
        mimeType: attachment.type || 'application/octet-stream',
        size: attachment.size,
        localPath,
      };
    }

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO lessons (id, enrollment_id, lesson_type, status, title)
        VALUES (${lessonId}, ${enrollmentId}, 'urgent', 'draft', ${`Срочная помощь: ${description.slice(0, 80)}`})
      `;
      await tx`
        INSERT INTO urgent_requests (id, enrollment_id, description, status, lesson_id)
        VALUES (${requestId}, ${enrollmentId}, ${description}, 'draft', ${lessonId})
      `;
      if (savedFile) {
        await tx`
          INSERT INTO urgent_attachments (id, urgent_request_id, filename, stored_name, mime_type, size_bytes, local_path)
          VALUES (${savedFile.id}, ${requestId}, ${savedFile.filename}, ${savedFile.storedName}, ${savedFile.mimeType}, ${savedFile.size}, ${savedFile.localPath})
        `;
      }
    });
  } catch (error) {
    failed = true;
    if (savedFile) await unlink(savedFile.localPath).catch(() => undefined);
    console.error('[urgent] Не удалось создать срочный запрос:', error);
  }

  if (failed) redirect('/urgent?error=save');
  revalidatePath('/urgent');
  revalidatePath('/materials');
  revalidatePath('/');
  redirect('/urgent?created=1');
}

async function createDraftsForDate(date: string) {
  const sql = requireDb();
  const weekday = isoWeekday(date);
  const rows = await sql<Array<{ enrollmentId: string; startTime: string; course: string }>>`
    SELECT sr.enrollment_id as "enrollmentId", to_char(sr.start_time,'HH24:MI') as "startTime", c.title as course
    FROM schedule_rules sr JOIN enrollments e ON e.id=sr.enrollment_id JOIN courses c ON c.id=e.course_id
    WHERE sr.active=true AND sr.iso_weekday=${weekday}
  `;
  for (const row of rows) {
    await sql`
      INSERT INTO lessons (id, enrollment_id, lesson_type, status, title, scheduled_date, scheduled_time)
      SELECT ${randomUUID()}, ${row.enrollmentId}, 'planned', 'draft', ${row.course}, ${date}::date, ${row.startTime}::time
      WHERE NOT EXISTS (SELECT 1 FROM lessons WHERE enrollment_id=${row.enrollmentId} AND scheduled_date=${date}::date AND scheduled_time=${row.startTime}::time AND lesson_type <> 'urgent')
    `;
  }
  revalidatePath('/');
}

export async function createTodayDrafts() {
  await createDraftsForDate(getAppDateString());
}

export async function createTomorrowDrafts() {
  await createDraftsForDate(getAppDateString(1));
}

export async function setStudentCoursePosition(formData: FormData) {
  const enrollmentId=String(formData.get('enrollmentId')||'').trim(); const mapItemId=String(formData.get('mapItemId')||'').trim();
  const stage=String(formData.get('stage')||'').trim(); const lesson=String(formData.get('lesson')||'').trim(); const note=String(formData.get('note')||'').trim();
  const previous=formData.get('completedBeforeTracking')==='on'; if(!enrollmentId||!stage)return;
  const sql=requireDb(); await sql.begin(async(tx)=>{const valid=await tx<Array<{studentId:string;courseId:string;position:number|null}>>`
    SELECT e.student_id as "studentId",e.course_id as "courseId",m.position FROM enrollments e LEFT JOIN course_map_items m ON m.id=${mapItemId||null} AND m.course_id=e.course_id WHERE e.id=${enrollmentId} AND e.active=true LIMIT 1`;
    if(!valid.length||mapItemId&&!valid[0].position)return;
    await tx`INSERT INTO student_course_positions(enrollment_id,current_map_item_id,stage_label,lesson_label,completed_before_tracking,note,updated_at) VALUES(${enrollmentId},${mapItemId||null},${stage},${lesson||null},${previous},${note||null},now()) ON CONFLICT(enrollment_id) DO UPDATE SET current_map_item_id=EXCLUDED.current_map_item_id,stage_label=EXCLUDED.stage_label,lesson_label=EXCLUDED.lesson_label,completed_before_tracking=EXCLUDED.completed_before_tracking,note=EXCLUDED.note,updated_at=now()`;
    if(mapItemId){await tx`INSERT INTO student_course_stage_statuses(enrollment_id,course_map_item_id,status) VALUES(${enrollmentId},${mapItemId},'in_progress') ON CONFLICT(enrollment_id,course_map_item_id) DO UPDATE SET status='in_progress',updated_at=now()`;if(previous)await tx`INSERT INTO student_course_stage_statuses(enrollment_id,course_map_item_id,status) SELECT ${enrollmentId},id,'completed_before_tracking' FROM course_map_items WHERE course_id=${valid[0].courseId} AND position<${valid[0].position} ON CONFLICT(enrollment_id,course_map_item_id) DO UPDATE SET status='completed_before_tracking',updated_at=now()`;}
  }); revalidatePath('/students/progress'); revalidatePath('/students'); revalidatePath('/');
}

export async function addCourseMapItem(formData: FormData) {
  const courseId=String(formData.get('courseId')||'').trim(),stage=String(formData.get('stage')||'').trim(),lesson=String(formData.get('lesson')||'').trim(),title=String(formData.get('title')||'').trim(); if(!courseId||!stage||!title)return;
  const position=Number(formData.get('position')); const intent={topic:String(formData.get('topic')||'').trim(),section:String(formData.get('section')||'').trim(),skill:String(formData.get('skill')||'').trim()};
  await requireDb()`INSERT INTO course_map_items(id,course_id,position,stage_label,lesson_label,title,intent) VALUES(${randomUUID()},${courseId},${Number.isInteger(position)&&position>0?position:1},${stage},${lesson||null},${title},${JSON.stringify(intent)}::jsonb) ON CONFLICT(course_id,position) DO UPDATE SET stage_label=EXCLUDED.stage_label,lesson_label=EXCLUDED.lesson_label,title=EXCLUDED.title,intent=EXCLUDED.intent`;
  revalidatePath(`/courses/${courseId}`); revalidatePath('/students/progress');
}

export async function recordLessonHistory(formData:FormData){const enrollmentId=String(formData.get('enrollmentId')||'').trim(),stage=String(formData.get('stage')||'').trim(),lesson=String(formData.get('lesson')||'').trim(),status=String(formData.get('status')||'').trim();if(!enrollmentId||!stage||!['completed','repeat','unfinished'].includes(status))return;const dateRaw=String(formData.get('date')||'');const date=/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)?dateRaw:getAppDateString();const allowed=new Set(['Vocabulary','Grammar','Reading','Listening','Speaking','Writing','Other']);const skills=String(formData.get('skills')||'').split(',').map(x=>x.trim()).filter(x=>allowed.has(x));const note=String(formData.get('teacherNote')||'').trim(),homework=String(formData.get('homework')||'').trim(),next=String(formData.get('nextSteps')||'').trim();const qids=String(formData.get('qids')||'').split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);const materials=String(formData.get('materials')||'').split(/\r?\n/).map(line=>{const[referenceId,title,url]=line.split('|').map(value=>value.trim());return{referenceId,title:title||referenceId,url};}).filter(item=>item.referenceId&&item.title).slice(0,20);const historyId=randomUUID();const sql=requireDb();await sql.begin(async tx=>{await tx`INSERT INTO lesson_history(id,enrollment_id,occurred_on,stage_label,lesson_label,skills,result_status,teacher_note,homework,next_steps) VALUES(${historyId},${enrollmentId},${date}::date,${stage},${lesson||null},${skills},${status},${note||null},${homework||null},${next||null})`;for(const qid of new Set(qids))await tx`INSERT INTO lesson_history_qids(lesson_history_id,qid) VALUES(${historyId},${qid}) ON CONFLICT DO NOTHING`;for(const material of materials)await tx`INSERT INTO lesson_history_materials(id,lesson_history_id,source_kind,reference_id,title,url) VALUES(${randomUUID()},${historyId},'google_drive',${material.referenceId},${material.title},${material.url||null})`;});revalidatePath('/students/progress');}
