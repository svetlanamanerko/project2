'use client';

import { LessonPlayerV2, type LessonPlayerProps } from './LessonPlayerV2';

export function LessonPlayerV3(props: LessonPlayerProps) {
  return <LessonPlayerV2 {...props} sceneMode />;
}
