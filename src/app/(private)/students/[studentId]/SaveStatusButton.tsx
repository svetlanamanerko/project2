'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

type Props = {
  idleLabel: string;
  pendingLabel?: string;
  className?: string;
  title?: string;
};

export function SaveStatusButton({ idleLabel, pendingLabel = 'Сохраняю…', className, title }: Props) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      setSaved(false);
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    setSaved(true);
    const timer = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <button className={className} title={title} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : idleLabel}
    </button>
    <span role="status" aria-live="polite" style={{ minWidth: saved ? undefined : 0, color: '#287a52', fontSize: 13, fontWeight: 700 }}>
      {saved ? '✓ Сохранено' : ''}
    </span>
  </span>;
}
