export type CourseProfile = Record<string, unknown>;

export function readCourseProfile(value: unknown): CourseProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as CourseProfile;
}

export function getCourseMethodology(value: unknown) {
  const methodology = readCourseProfile(value).methodology;
  return typeof methodology === 'string' && methodology.trim() ? methodology.trim() : null;
}

export function mergeCourseMethodology(value: unknown, methodology: string) {
  return { ...readCourseProfile(value), methodology: methodology.trim() || null };
}

export function courseMethodologyPrompt(value: unknown) {
  const methodology = getCourseMethodology(value);
  return `МЕТОДИКА КУРСА:\n${methodology || 'не заполнена'}`;
}
