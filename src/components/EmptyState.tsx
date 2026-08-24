import { Sparkles } from 'lucide-react';

export function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><div className="empty-icon"><Sparkles size={22}/></div><strong>{title}</strong><p>{text}</p></div>;
}
