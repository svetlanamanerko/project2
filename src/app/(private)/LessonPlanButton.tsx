'use client';

import { ExternalLink, FileText, Sparkles, WandSparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type PlanResponse = {
  ok: boolean;
  plan?: string;
  message?: string;
  credits?: number | null;
};

type LessonPackage = {
  title: string;
  sourceLabel: string | null;
  studentWorksheet: string;
  teacherPack: string;
  homework: string;
  reserve: string;
  vocabularyBank: string;
  studentDriveUrl: string | null;
  teacherDriveUrl: string | null;
  credits?: number | null;
};

type PackageResponse = {
  ok: boolean;
  message?: string;
  warning?: string | null;
  credits?: number | null;
  package?: LessonPackage;
};

export function LessonPlanButton({
  enrollmentId,
  initialPlan,
  initialPackage,
}: {
  enrollmentId: string;
  initialPlan?: string | null;
  initialPackage?: LessonPackage | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(initialPlan || '');
  const [error, setError] = useState('');
  const [credits, setCredits] = useState<number | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [lessonPackage, setLessonPackage] = useState<LessonPackage | null>(initialPackage || null);
  const [packageError, setPackageError] = useState('');
  const [packageWarning, setPackageWarning] = useState('');
  const [packageCredits, setPackageCredits] = useState<number | null>(initialPackage?.credits ?? null);

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

  async function assemble() {
    setPackageLoading(true);
    setPackageError('');
    setPackageWarning('');
    try {
      const response = await fetch('/api/kie/lesson-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId }),
      });
      const data = await response.json() as PackageResponse;
      if (!response.ok || !data.ok || !data.package) {
        setPackageError(data.message || 'Не удалось собрать урок.');
        return;
      }
      setLessonPackage(data.package);
      setPackageCredits(data.credits ?? null);
      setPackageWarning(data.warning || '');
      router.refresh();
    } catch {
      setPackageError('Не удалось связаться с AI. Попробуйте ещё раз.');
    } finally {
      setPackageLoading(false);
    }
  }

  return <div className="ai-plan-box">
    <div className="ai-action-row">
      <button className="button ai-plan-button" type="button" onClick={generate} disabled={loading || packageLoading}>
        <Sparkles size={16}/>{loading ? 'Составляю…' : plan ? 'Обновить AI-план' : 'Составить план подготовки'}
      </button>
      {plan && <button className="button assemble-lesson-button" type="button" onClick={assemble} disabled={packageLoading || loading}>
        <WandSparkles size={16}/>{packageLoading ? 'Собираю урок…' : lessonPackage ? 'Пересобрать урок' : 'Собрать урок'}
      </button>}
    </div>

    {error && <div className="notice danger ai-plan-message">{error}</div>}
    {plan && <details className="ai-plan-details" open={!lessonPackage}>
      <summary>AI-план подготовки{credits != null ? ` · ${credits} credits` : ''}</summary>
      <div className="ai-plan-text">{plan}</div>
    </details>}

    {packageError && <div className="notice danger ai-plan-message">{packageError}</div>}
    {packageWarning && <div className="notice warning ai-plan-message">{packageWarning}</div>}

    {lessonPackage && <details className="lesson-package-details" open>
      <summary>Готовый урок · {lessonPackage.title}{packageCredits != null ? ` · ${packageCredits} credits` : ''}</summary>
      <div className="lesson-package-body">
        {lessonPackage.sourceLabel && <div className="package-source">Источник: {lessonPackage.sourceLabel}</div>}
        {(lessonPackage.studentDriveUrl || lessonPackage.teacherDriveUrl) && <div className="package-file-row">
          {lessonPackage.studentDriveUrl && <a className="button package-file-link" href={lessonPackage.studentDriveUrl} target="_blank" rel="noreferrer"><FileText size={15}/>Student Worksheet <ExternalLink size={13}/></a>}
          {lessonPackage.teacherDriveUrl && <a className="button package-file-link" href={lessonPackage.teacherDriveUrl} target="_blank" rel="noreferrer"><FileText size={15}/>Teacher Pack <ExternalLink size={13}/></a>}
        </div>}

        <details className="package-section" open><summary>Student Worksheet — CORE</summary><div>{lessonPackage.studentWorksheet}</div></details>
        <details className="package-section"><summary>RESERVE</summary><div>{lessonPackage.reserve}</div></details>
        <details className="package-section"><summary>HOMEWORK</summary><div>{lessonPackage.homework}</div></details>
        <details className="package-section"><summary>VOCABULARY BANK</summary><div>{lessonPackage.vocabularyBank}</div></details>
        <details className="package-section"><summary>Teacher’s Pack</summary><div>{lessonPackage.teacherPack}</div></details>
      </div>
    </details>}
  </div>;
}
