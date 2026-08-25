export function SaveNotice({ type }: { type?: string }) {
  const messages: Record<string, string> = {
    context: 'Контекст ученика сохранён.',
    focus: 'Текущий фокус обновлён.',
    observation: 'Наблюдение сохранено.',
  };
  const message = type ? messages[type] : null;
  if (!message) return null;
  return <div className="notice success" role="status">✓ {message}</div>;
}
