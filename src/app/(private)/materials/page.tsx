import { Download, ExternalLink, FileText, FolderOpen } from 'lucide-react';
import { getMaterials } from '@/lib/data';
import { EmptyState } from '@/components/EmptyState';

export default async function MaterialsPage() {
  const materials = await getMaterials();
  return <><header className="page-head"><div><p className="eyebrow">Всё готовое — под рукой</p><h1>Материалы</h1><p className="muted">Student Worksheet, Teacher Pack, домашняя работа, срочные вложения и другие файлы хранятся здесь; Google Drive подключим следующим слоем.</p></div></header><section className="panel"><div className="panel-title"><h2><FolderOpen size={18}/>Последние материалы</h2><span className="count-badge">{materials.length}</span></div>{materials.length ? <div className="material-grid">{materials.map((m)=>{const href=m.driveUrl || m.localUrl; return <article className="material-card" key={m.id}><div className="file-icon"><FileText/></div><div><strong>{m.title}</strong><span>{m.kind}</span></div>{href && <a href={href} target="_blank" rel="noreferrer" aria-label={`Открыть ${m.title}`}>{m.localUrl ? <Download size={18}/> : <ExternalLink size={18}/>}</a>}</article>})}</div> : <EmptyState title="Здесь появятся готовые файлы" text="Срочные вложения появятся здесь сразу; позже добавим автоматическое сохранение Student Worksheet и Teacher Pack в Google Drive."/>}</section></>;
}
