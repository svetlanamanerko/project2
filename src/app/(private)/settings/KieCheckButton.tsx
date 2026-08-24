'use client';

import { useState } from 'react';

type CheckResult = {
  ok: boolean;
  message: string;
  credits?: number | null;
};

export function KieCheckButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  async function check() {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/kie/check', { method: 'POST' });
      const data = await response.json() as CheckResult;
      setResult(data);
    } catch {
      setResult({ ok: false, message: 'Не удалось выполнить проверку.' });
    } finally {
      setLoading(false);
    }
  }

  return <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8}}>
    <button className="button primary" type="button" onClick={check} disabled={loading}>
      {loading ? 'Проверяю…' : 'Проверить AI'}
    </button>
    {result && <span className={result.ok ? 'status status-prepared' : 'status status-draft'}>
      {result.ok ? 'KIE работает' : result.message}
      {result.ok && result.credits != null ? ` · тест ${result.credits} credits` : ''}
    </span>}
  </div>;
}
