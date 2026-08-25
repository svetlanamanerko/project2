'use server';

import { redirect } from 'next/navigation';
import * as legacy from './actions-legacy';

export async function addStudent(formData: FormData) { return legacy.addStudent(formData); }
export async function addCourse(formData: FormData) { return legacy.addCourse(formData); }
export async function updateCourse(formData: FormData) { return legacy.updateCourse(formData); }
export async function updateCourseSource(formData: FormData) { return legacy.updateCourseSource(formData); }
export async function deleteCourse(formData: FormData) { return legacy.deleteCourse(formData); }
export async function configureStudentCourse(formData: FormData) { return legacy.configureStudentCourse(formData); }
export async function createUrgentRequest(formData: FormData) { return legacy.createUrgentRequest(formData); }
export async function createTodayDrafts() { return legacy.createTodayDrafts(); }
export async function createTomorrowDrafts() { return legacy.createTomorrowDrafts(); }
export async function generateStudentAdviceAction(formData: FormData) { return legacy.generateStudentAdviceAction(formData); }
export async function addLearningPlanItem(formData: FormData) { return legacy.addLearningPlanItem(formData); }
export async function addRecyclingItem(formData: FormData) { return legacy.addRecyclingItem(formData); }
export async function completeLearningPlanItem(formData: FormData) { return legacy.completeLearningPlanItem(formData); }
export async function completeRecyclingItem(formData: FormData) { return legacy.completeRecyclingItem(formData); }

export async function updateStudentContext(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  await legacy.updateStudentContext(formData);
  if (studentId) redirect(`/students/${studentId}?saved=context`);
}

export async function updateStudentCurrentFocus(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  await legacy.updateStudentCurrentFocus(formData);
  if (studentId) redirect(`/students/${studentId}?saved=focus`);
}

export async function addStudentObservation(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  await legacy.addStudentObservation(formData);
  if (studentId) redirect(`/students/${studentId}?saved=observation`);
}
