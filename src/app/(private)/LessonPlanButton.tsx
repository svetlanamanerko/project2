'use client';

import { Check, Copy, Download, ExternalLink, FileText, MonitorPlay, Palette, Printer, Sparkles, WandSparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

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

type VocabularyRow = {
  english: string;
  russian: string;
  example: string;
};

function parseVocabularyBank(text: string): VocabularyRow[] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
    .map((line) => {
      const parts = line.split(/\s+(?:—|–)\s+|\s+-\s+/).map((part) => part.trim()).filter(Boolean);
      return {
        english: parts[0] || '',
        russian: parts[1] || '',
        example: parts.slice(2).join(' — '),
      };
    })
    .filter((row) => row.english && row.russian);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function safeDownloadName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Vocabulary';
}

export function LessonPlanButton({
  enrollmentId,
  lessonId,
  initialPlan,
  initialPackage,
}: {
  enrollmentId: string;
  lessonId?: string | null;
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
  const [copiedVocabulary, setCopiedVocabulary] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);

  const vocabularyRows = useMemo(
    () => parseVocabularyBank(lessonPackage?.vocabularyBank || ''),
    [lessonPackage?.vocabularyBank],
  );

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
    setCopiedVocabulary(false);
    setDesignOpen(false);
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

  async function copyVocabulary() {
    if (!vocabularyRows.length) return;
    const text = vocabularyRows.map((row) => `${row.english}\t${row.russian}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedVocabulary(true);
      window.setTimeout(() => setCopiedVocabulary(false), 2200);
    } catch {
      setPackageError('Не удалось скопировать Vocabulary Bank. Разрешите браузеру доступ к буферу обмена.');
    }
  }

  function downloadVocabularyCsv() {
    if (!lessonPackage || !vocabularyRows.length) return;
    const rows = [
      ['Word / Phrase', 'Russian', 'Example / Collocation'],
      ...vocabularyRows.map((row) => [row.english, row.russian, row.example]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeDownloadName(lessonPackage.title)} — Vocabulary.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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

        {lessonId && <div className="design-version-block">
          <button className="button design-version-button" type="button" onClick={() => setDesignOpen((value) => !value)}>
            <Palette size={16}/>Создать дизайн-версию
          </button>
          {designOpen && <div className="design-version-options">
            <a className="design-option interactive" href={`/lessons/${lessonId}/interactive`}><MonitorPlay size={18}/><span><strong>Интерактивный урок</strong><small>Карточки, поля ответов и прогресс</small></span></a>
            <a className="design-option printable" href={`/lessons/${lessonId}/print`}><Printer size={18}/><span><strong>Версия для печати</strong><small>A4 / печать / сохранить PDF</small></span></a>
          </div>}
        </div>}

        <details className="package-section" open><summary>Student Worksheet — CORE</summary><div>{lessonPackage.studentWorksheet}</div></details>
        <details className="package-section"><summary>RESERVE</summary><div>{lessonPackage.reserve}</div></details>
        <details className="package-section"><summary>HOMEWORK</summary><div>{lessonPackage.homework}</div></details>

        <details className="package-section vocabulary-section" open>
          <summary>VOCABULARY BANK · EXPORT</summary>
          <div className="vocabulary-export">
            {vocabularyRows.length ? <>
              <div className="vocabulary-actions">
                <button className="button vocabulary-copy-button" type="button" onClick={copyVocabulary}>
                  {copiedVocabulary ? <Check size={15}/> : <Copy size={15}/>} {copiedVocabulary ? 'Скопировано' : 'Скопировать для Wordwall / Quizlet / Взнания'}
                </button>
                <button className="button vocabulary-download-button" type="button" onClick={downloadVocabularyCsv}>
                  <Download size={15}/>Скачать для Excel
                </button>
              </div>
              <div className="vocabulary-table-wrap">
                <table className="vocabulary-table">
                  <thead><tr><th>Word / Phrase</th><th>Russian</th><th>Example / Collocation</th></tr></thead>
                  <tbody>{vocabularyRows.map((row, index) => <tr key={`${row.english}-${index}`}><td>{row.english}</td><td>{row.russian}</td><td>{row.example || '—'}</td></tr>)}</tbody>
                </table>
              </div>
            </> : <div className="vocabulary-raw">{lessonPackage.vocabularyBank}</div>}
          </div>
        </details>

        <details className="package-section"><summary>Teacher’s Pack</summary><div>{lessonPackage.teacherPack}</div></details>
      </div>
    </details>}
  </div>;
}
