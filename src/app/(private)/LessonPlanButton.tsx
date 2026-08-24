'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';

type PlanResponse = {
  ok: boolean;
  plan?: string;
  message?: string;
  credits?: number | null;
};

export function LessonPlanButton({ enrollmentId, initialPlan }: { enrollmentId: string; initialPlan?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(initialPlan || '');
  const [error, setError] = useState('');
  const [credits, setCredits] = useState<number | null>(null);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/kie/lesson-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId }),
      });
      const data = await response.json() as PlanResponse;
      if (!response.ok || !data.ok || !data.plan) {
        setError(data.message || 'Не удалось составить план.');
        return;
      }
      setPlan(data.plan);
      setCredits(data.credits ?? null);
    } catch {
      setError('Не удалось связаться с AI. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="ai-plan-box">
    <button className="button ai-plan-button" type="button" onClick={generate} disabled={loading}>
      <Sparkles size={16}/>{loading ? 'Составляю…' : plan ? 'Обновить AI-план' : 'Составить план подготовки'}
    </button>
    {error && <div className="notice danger ai-plan-message">{error}</div>}
    {plan && <details className="ai-plan-details" open>
      <summary>AI-план подготовки{credits != null ? ` · ${credits} credits` : ''}</summary>
      <div className="ai-plan-text">{plan}</div>
    </details>}
  </div>;
}
