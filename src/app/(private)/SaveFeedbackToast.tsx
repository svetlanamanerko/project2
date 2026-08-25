'use client';

import { useEffect, useState } from 'react';

const messages: Record<string, string> = {
  context: 'Контекст ученика сохранён',
  focus: 'Текущий фокус обновлён',
  observation: 'Наблюдение после урока сохранено',
};

export function SaveFeedbackToast() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const url = new URL(window.location.href);
    const saved = url.searchParams.get('saved');
    if (!saved || !messages[saved]) return;

    setMessage(messages[saved]);
    url.searchParams.delete('saved');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

    const timer = window.setTimeout(() => setMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 9999,
        padding: '12px 16px',
        borderRadius: 14,
        background: '#ffffff',
        border: '1px solid #d8d5f0',
        boxShadow: '0 12px 36px rgba(67, 57, 145, .18)',
        color: '#4d468f',
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      ✓ {message}
    </div>
  );
}
