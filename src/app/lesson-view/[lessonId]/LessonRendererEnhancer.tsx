'use client';

import { useEffect } from 'react';

function detectType(article: HTMLElement) {
  const label = article.querySelector('header span')?.textContent?.trim().toUpperCase() || '';
  if (label.includes('SPEAKING')) return 'speaking';
  if (label.includes('FILL THE GAPS')) return 'gap_fill';
  if (label.includes('TRUE / FALSE')) return 'true_false_ns';
  if (label === 'MATCH') return 'matching';
  if (label === 'SORT') return 'sort';
  if (label === 'WRITE') return 'open_answer';
  if (label === 'READING') return 'reading';
  if (label === 'LISTENING') return 'listening';
  if (label === 'CHOOSE') return article.querySelector('select') ? 'dropdown' : 'multiple_choice';
  return 'generic';
}

export function LessonRendererEnhancer() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.lesson-json-v3');
    if (!root) return;

    const enhance = () => {
      root.querySelectorAll<HTMLElement>('article').forEach((article) => {
        article.classList.add('mu-exercise-card');
        article.dataset.exerciseType = detectType(article);
        article.querySelector(':scope > header')?.classList.add('mu-exercise-head');
        article.querySelector(':scope > div')?.classList.add('mu-exercise-body');
        article.querySelector(':scope > footer')?.classList.add('mu-exercise-footer');
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
