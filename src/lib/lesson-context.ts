import 'server-only';
import { db } from '@/lib/db';
import { getStudentLearningContext } from '@/lib/student-learning-context';
import { getRelevantCourseMaterials } from '@/lib/relevant-course-materials';
import { getOgeCandidatesForStudent } from '@/lib/oge-navigator-client';

export async function buildLessonContext(studentId:string, options?:{enrollmentId?:string}) {
  const studentProgress=await getStudentLearningContext(studentId); if(!studentProgress) throw new Error('Ученик не найден');
  const course=options?.enrollmentId?studentProgress.courses.find((x)=>x.enrollmentId===options.enrollmentId):studentProgress.courses[0]; if(!course) throw new Error('Активный курс не найден');
  const currentId=course.currentPosition?.mapItemId;
  const items=await db()<Array<{id:string;position:number;stage:string;lesson:string|null;title:string;intent:Record<string,unknown>}>>`
    SELECT id,position,stage_label as stage,lesson_label as lesson,title,intent FROM course_map_items WHERE course_id=${course.courseId} ORDER BY position`;
  const currentIndex=currentId?items.findIndex((x)=>x.id===currentId):-1; const next=items[Math.max(0,currentIndex+1)]||null;
  const lessonIntent=next?.intent&&Object.keys(next.intent).length?next.intent:{topic:next?.title||course.currentPosition?.stage||'',stage:next?.stage||course.currentPosition?.stage||'',lesson:next?.lesson||course.currentPosition?.lesson||''};
  let driveMaterials:Awaited<ReturnType<typeof getRelevantCourseMaterials>>=[]; try{driveMaterials=await getRelevantCourseMaterials({courseId:course.courseId,studentId,lessonIntent,usedMaterialIds:studentProgress.usedMaterials,limit:10});}catch(error){console.error('[lesson-context] Drive unavailable:',error);}
  const isOge=/\b(oge|огэ)\b/i.test(course.title); const navigator=isOge?await getOgeCandidatesForStudent(studentProgress.usedQids,lessonIntent):{configured:Boolean(process.env.OGE_NAVIGATOR_BASE_URL),available:true,items:[]};
  return {studentProgress:{student:studentProgress.student,course,currentPosition:course.currentPosition},coursePlan:{current:currentIndex>=0?items[currentIndex]:null,next},lessonIntent,driveMaterials,navigatorCandidates:navigator.items,navigatorStatus:{configured:navigator.configured,available:navigator.available},recentLessonHistory:studentProgress.recentLessons.slice(0,10),repeatItems:studentProgress.repeatTopics,unfinishedItems:studentProgress.unfinishedItems,usedQids:studentProgress.usedQids,nextSteps:studentProgress.nextSteps};
}
