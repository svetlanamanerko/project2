'use server';

import { redirect } from 'next/navigation';
import {
  updateStudentContext as updateStudentContextLegacy,
  updateStudentCurrentFocus as updateStudentCurrentFocusLegacy,
  addStudentObservation as addStudentObservationLegacy,
} from './actions-legacy';

export * from './actions-legacy';

export async function updateStudentContext(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  await updateStudentContextLegacy(formData);
  if (studentId) redirect(`/students/${studentId}?saved=context`);
}

export async function updateStudentCurrentFocus(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  await updateStudentCurrentFocusLegacy(formData);
  if (studentId) redirect(`/students/${studentId}?saved=focus`);
}

export async function addStudentObservation(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  await addStudentObservationLegacy(formData);
  if (studentId) redirect(`/students/${studentId}?saved=observation`);
}
