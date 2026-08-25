'use client';

import { Sparkles } from 'lucide-react';
import { useFormStatus } from 'react-dom';

export function AdviceSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" disabled={pending}>
    <Sparkles size={17}/>{pending ? 'Анализирую ученика…' : 'Проанализировать ученика'}
  </button>;
}
