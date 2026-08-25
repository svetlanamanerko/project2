import { Download, ExternalLink, FileText, FolderOpen } from 'lucide-react';
import { getMaterials } from '@/lib/data';
import { getDriveCourseMaterials } from '@/lib/drive-materials';
import { EmptyState } from '@/components/EmptyState';
import { MaterialsAccordion } from './MaterialsAccordion';
import styles from './materials.module.css';

export default async function MaterialsPage() {
  const materials = await getMaterials();
  let driveCourses: Awaited<ReturnType<typeof getDriveCourseMaterials>> = [];
  let driveError = false;
  try {
    driveCourses = await getDriveCourseMaterials();
  } catch (error) {
    driveError = true;
    console.error('[materials] Не удалось прочитать Google Drive:', error);
  }

  const driveItemCount = driveCourses.reduce((sum, course) => sum + course.items.length, 0);

  return <>
    <header className="page-head"><div><p className="eyebrow">Всё готовое — под рукой</p><h1>Материалы</h1><p className="muted">Учебники и материалы курсов читаются прямо из Google Drive; готовые Student Worksheet, Teacher Pack, домашние задания и срочные вложения хранятся здесь же.</p></div></header>

    {driveError && <div className={`notice warning ${styles.driveError}`}>Google Drive подключён, но сейчас не удалось прочитать папки. Обновите страницу чуть позже или переподключите Drive в Настройках.</div>}

    <section className={`panel ${styles.drivePanel}`}>
      <div className="panel-title"><h2><FolderOpen size={18}/>Google Drive — материалы курсов</h2><span className="count-badge">{driveItemCount}</span></div>
      {driveCourses.length ? <MaterialsAccordion courses={driveCourses}/> : !driveError ? <EmptyState title="Пока нет привязанных папок курса" text="Когда курс будет связан с папкой Google Drive, её содержимое появится здесь автоматически."/> : null}
    </section>

    <section className={`panel ${styles.localPanel}`}><div className="panel-title"><h2><FolderOpen size={18}/>Файлы Мастерской</h2><span className="count-badge">{materials.length}</span></div>{materials.length ? <div className="material-grid">{materials.map((m)=>{const href=m.driveUrl || m.localUrl; return <article className="material-card" key={m.id}><div className="file-icon"><FileText/></div><div><strong>{m.title}</strong><span>{m.kind}</span></div>{href && <a href={href} target="_blank" rel="noreferrer" aria-label={`Открыть ${m.title}`}>{m.localUrl ? <Download size={18}/> : <ExternalLink size={18}/>}</a>}</article>})}</div> : <EmptyState title="Здесь появятся готовые файлы" text="Сюда будут попадать Student Worksheet, Teacher Pack, домашние задания и срочные вложения, созданные в Мастерской."/>}</section>
  </>;
}
