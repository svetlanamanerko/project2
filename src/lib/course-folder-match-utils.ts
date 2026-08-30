export function normalizeCourseFolderName(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/[—–_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isOgeCourseTitle(value: string) {
  return /(^|\s)(oge|огэ)(\s|$)/i.test(normalizeCourseFolderName(value));
}

export function courseFolderMatchScore(courseTitle: string, folderName: string) {
  const title = normalizeCourseFolderName(courseTitle);
  const folder = normalizeCourseFolderName(folderName);
  if (isOgeCourseTitle(title)) {
    if (!isOgeCourseTitle(folder)) return 0;
    return 100 + (folder.includes('master') ? 20 : 0);
  }

  let score = 0;
  for (const series of ['spotlight', 'starlight']) {
    if (title.includes(series) && folder.includes(series)) score += 70;
  }
  const grade = title.match(/\b(1[01]|[1-9])\b/)?.[1];
  if (grade && new RegExp(`(^|\\D)${grade}(\\D|$)`).test(folder)) score += 35;
  return score;
}

export function pickBestCourseFolder<T extends { name: string }>(courseTitle: string, folders: T[], minScore = 50) {
  return folders
    .map((folder) => ({ folder, score: courseFolderMatchScore(courseTitle, folder.name) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score || a.folder.name.localeCompare(b.folder.name, 'ru'))[0]?.folder || null;
}
