'use server';

import { normalizeScheduleInputRows } from '@/lib/schedule-utils';
import { configureStudentCourse } from '../actions';

const routeFields = ['studentId', 'courseId', 'module', 'topic', 'note'] as const;

export async function configureStudentCourseWithSchedule(formData: FormData) {
  const studentId = String(formData.get('studentId') || '').trim();
  const courseId = String(formData.get('courseId') || '').trim();
  if (!studentId || !courseId) return;

  const base = new FormData();
  for (const field of routeFields) {
    const value = formData.get(field);
    if (value !== null) base.set(field, String(value));
  }
  await configureStudentCourse(base);

  const rows = normalizeScheduleInputRows(
    formData.getAll('weekday'),
    formData.getAll('time'),
    formData.getAll('durationMinutes'),
  );

  for (const row of rows) {
    const slot = new FormData();
    slot.set('studentId', studentId);
    slot.set('courseId', courseId);
    slot.set('weekday', String(row.weekday));
    slot.set('time', row.time);
    slot.set('durationMinutes', String(row.durationMinutes));
    await configureStudentCourse(slot);
  }
}
