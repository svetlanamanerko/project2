'use client';

import { ChevronDown, ExternalLink, FileText, Folder } from 'lucide-react';
import { useState } from 'react';
import styles from './materials.module.css';

type MaterialItem = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  isFolder: boolean;
};

type MaterialCourse = {
  courseId: string;
  courseTitle: string;
  folderUrl: string;
  items: MaterialItem[];
};

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

export function MaterialsAccordion({ courses }: { courses: MaterialCourse[] }) {
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);

  return <div className={styles.courseStack}>{courses.map((course, index) => {
    const isOpen = openCourseId === course.courseId;
    const panelId = `course-materials-${index}`;
    return <article className={`${styles.courseBlock} ${isOpen ? styles.courseBlockOpen : ''}`} key={course.courseId}>
      <div className={styles.courseHead}>
        <button className={styles.courseTrigger} type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenCourseId(isOpen ? null : course.courseId)}>
          <span className={styles.courseHeadLeft}><span className="course-icon"><Folder size={19}/></span><span><strong>{course.courseTitle}</strong><small>{course.items.length} папок/объектов</small></span></span>
          <ChevronDown className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} size={19}/>
        </button>
        <a className={styles.folderLink} href={course.folderUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Открыть папку</a>
      </div>
      {isOpen && <div className={styles.courseContent} id={panelId}>
        {course.items.length ? <div className={styles.driveGrid}>{course.items.map((item) => {
          const content = <><span className={`${styles.driveIcon} ${item.isFolder ? styles.folderIcon : ''}`}>{item.isFolder ? <Folder size={19}/> : <FileText size={19}/>}</span><span className={styles.driveCardText}><strong title={item.name}>{item.name}</strong><small>{fileKind(item.mimeType,item.isFolder)}</small></span><ExternalLink className={styles.itemExternal} size={16}/></>;
          return item.webViewLink
            ? <a className={styles.driveCard} href={item.webViewLink} target="_blank" rel="noreferrer" key={item.id}>{content}</a>
            : <div className={styles.driveCard} key={item.id}>{content}</div>;
        })}</div> : <div className={styles.emptyDrive}>Папка курса пока пустая.</div>}
      </div>}
    </article>;
  })}</div>;
}
