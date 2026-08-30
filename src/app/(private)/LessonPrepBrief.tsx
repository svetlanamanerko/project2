'use client';

import { MessageCircleMore, Sparkles } from 'lucide-react';
import { useState } from 'react';

export function LessonPrepBrief({
  initialValue = '',
  onChange,
}: {
  initialValue?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  function update(next: string) {
    setValue(next);
    onChange?.(next);
  }

  return <div className="teacher-brief-box">
    <div className="teacher-brief-head">
      <div className="teacher-brief-icon"><MessageCircleMore size={20}/></div>
      <div>
        <strong>Что нужно сегодня?</strong>
        <span>Пиши как в чате. Мастерская сама совместит это с планом курса и историей ученика.</span>
      </div>
    </div>
    <textarea
      value={value}
      onChange={(event) => update(event.target.value)}
      rows={4}
      placeholder="Например: продолжаем по плану, но сегодня ещё повторить Past Simple и дать 10 минут speaking. Домашку сделать короче."
    />
    <div className="teacher-brief-quick">
      <button type="button" onClick={() => update('Продолжаем по плану.')}>Продолжаем по плану</button>
      <button type="button" onClick={() => update('')}>Очистить</button>
      <span><Sparkles size={14}/>Это указание будет приоритетом именно для сегодняшнего урока.</span>
    </div>
  </div>;
}
