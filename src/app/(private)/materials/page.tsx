import { Download, ExternalLink, FileText, Folder, FolderOpen } from 'lucide-react';
import { getMaterials } from '@/lib/data';
import { getDriveCourseMaterials } from '@/lib/drive-materials';
import { EmptyState } from '@/components/EmptyState';
import styles from './materials.module.css';

function fileKind(mimeType: string, isFolder: boolean) {
  if (isFolder) return 'Папка Google Drive';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Документ';
  if (mimeType.includes('presentation')) return 'Презентация';
  if (mimeType.includes('spreadsheet')) return 'Таблица';
  if (mimeType.startsWith('audio/')) return 'Аудио';
  if (mimeType.startsWith('image/')) return 'Изображение';
  return 'Файл Google Drive';
}

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
      {driveCourses.length ? <div className={styles.courseStack}>{driveCourses.map((course)=><article className={styles.courseBlock} key={course.courseId}>
        <div className={styles.courseHead}>
          <div className={styles.courseHeadLeft}><div className="course-icon"><Folder size={19}/></div><div><strong>{course.courseTitle}</strong><span>{course.items.length} объектов в папке</span></div></div>
          <a className={styles.folderLink} href={course.folderUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Открыть папку</a>
        </div>
        {course.items.length ? <div className={styles.driveGrid}>{course.items.map((item)=><div className={styles.driveCard} key={item.id}>
          <div className={`${styles.driveIcon} ${item.isFolder ? styles.folderIcon : ''}`}>{item.isFolder ? <Folder size={19}/> : <FileText size={19}/>}</div>
          <div className={styles.driveCardText}><strong title={item.name}>{item.name}</strong><span>{fileKind(item.mimeType,item.isFolder)}</span></div>
          {item.webViewLink && <a className={styles.openLink} href={item.webViewLink} target="_blank" rel="noreferrer" aria-label={`Открыть ${item.name}`}><ExternalLink size={17}/></a>}
        </div>)}</div> : <div className={styles.emptyDrive}>Папка курса пока пустая.</div>}
      </article>)}</div> : !driveError ? <EmptyState title="Пока нет привязанных папок курса" text="Когда курс будет связан с папкой Google Drive, её содержимое появится здесь автоматически."/> : null}
    </section>

    <section className={`panel ${styles.localPanel}`}><div className="panel-title"><h2><FolderOpen size={18}/>Файлы Мастерской</h2><span className="count-badge">{materials.length}</span></div>{materials.length ? <div className="material-grid">{materials.map((m)=>{const href=m.driveUrl || m.localUrl; return <article className="material-card" key={m.id}><div className="file-icon"><FileText/></div><div><strong>{m.title}</strong><span>{m.kind}</span></div>{href && <a href={href} target="_blank" rel="noreferrer" aria-label={`Открыть ${m.title}`}>{m.localUrl ? <Download size={18}/> : <ExternalLink size={18}/>}</a>}</article>})}</div> : <EmptyState title="Здесь появятся готовые файлы" text="Сюда будут попадать Student Worksheet, Teacher Pack, домашние задания и срочные вложения, созданные в Мастерской."/>}</section>
  </>;
}
