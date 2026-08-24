import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';

const labels = { draft: 'Черновик', prepared: 'Подготовлен', done: 'Проведён', cancelled: 'Отменён', missing: 'Нужно подготовить' } as const;

export function StatusPill({ status }: { status: keyof typeof labels }) {
  const Icon = status === 'prepared' || status === 'done' ? CheckCircle2 : status === 'cancelled' ? XCircle : CircleDashed;
  return <span className={`status status-${status}`}><Icon size={15}/>{labels[status]}</span>;
}
