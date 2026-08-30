'use client';

import { CircleHelp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './course.module.css';

type Props = {
  title: string;
  text: string;
  examples?: string[];
};

export function CourseHelpPopover({ title, text, examples = [] }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return <span className={styles.helpWrap} ref={rootRef}>
    <button
      type="button"
      className={styles.helpButton}
      aria-label={`Подсказка: ${title}`}
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      <CircleHelp size={16}/>
    </button>
    {open && <span className={styles.helpPopover} role="dialog" aria-label={title}>
      <span className={styles.helpHeader}>
        <strong>{title}</strong>
        <button type="button" aria-label="Закрыть подсказку" onClick={() => setOpen(false)}><X size={15}/></button>
      </span>
      <span className={styles.helpText}>{text}</span>
      {examples.length > 0 && <span className={styles.helpExamples}>
        <b>Пример</b>
        {examples.map((example) => <span key={example}>{example}</span>)}
      </span>}
    </span>}
  </span>;
}
