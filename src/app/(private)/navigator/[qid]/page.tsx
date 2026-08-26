import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { getOgeTask, ogeNavigatorBaseUrl } from '@/lib/oge-navigator-client';
import styles from '../navigator.module.css';

function value(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }

export default async function NavigatorDetailPage({ params }: { params: Promise<{ qid: string }> }) {
  const { qid } = await params;
  const detail = await getOgeTask(qid);
  const base = ogeNavigatorBaseUrl();
  if (!detail) return <><Link className={styles.back} href="/navigator"><ArrowLeft size={15}/>Назад к поиску</Link><div className="notice warning">Задание не найдено или Navigator временно недоступен.</div></>;
  const task = detail.task;
  const classifications = Object.entries(task.classifications || {}).filter(([,item])=>value(item));
  const group = detail.group && typeof detail.group === 'object' ? detail.group as Record<string,unknown> : null;
  const groupTasks = group && Array.isArray(group.tasks) ? group.tasks.length : 0;
  return <>
    <Link className={styles.back} href="/navigator"><ArrowLeft size={15}/>Назад к поиску</Link>
    <header className="page-head"><div><p className="eyebrow">Задание ФИПИ</p><h1>QID {task.qid}</h1><p className="muted">{task.section||'Раздел не указан'}{task.topic?` · ${task.topic}`:''}</p></div>{base&&<a className="button" href={`${base}/tasks?qid=${encodeURIComponent(task.qid)}`} target="_blank" rel="noreferrer">Открыть в полном Navigator <ExternalLink size={15}/></a>}</header>
    <div className={styles.detailGrid}><section className="panel"><div className={styles.badges}>{task.section&&<span className={styles.badge}>{task.section}</span>}{task.kesCode&&<span className={styles.badge}>KES {task.kesCode}</span>}{task.hasMedia&&<span className={styles.badge}>Есть медиа</span>}</div>{task.conditionText&&<><h2>Условие</h2><div className={styles.detailText}>{task.conditionText}</div></>}{task.contentText&&task.contentText!==task.conditionText&&<><h2>Содержание задания</h2><div className={styles.detailText}>{task.contentText}</div></>}{!task.conditionText&&!task.contentText&&task.preview&&<div className={styles.detailText}>{task.preview}</div>}</section>
      <aside className={`panel ${styles.facts}`}><div className={styles.fact}><span>QID</span><strong>{task.qid}</strong></div>{task.topic&&<div className={styles.fact}><span>Topic</span><strong>{task.topic}</strong></div>}{task.subtopic&&<div className={styles.fact}><span>Subtopic</span><strong>{task.subtopic}</strong></div>}{task.kesCode&&<div className={styles.fact}><span>KES</span><strong>{task.kesCode}{task.kesText?` · ${task.kesText}`:''}</strong></div>}{task.answerType&&<div className={styles.fact}><span>Тип ответа</span><strong>{task.answerType}</strong></div>}{classifications.length>0&&<div className={styles.fact}><span>Классификация</span>{classifications.map(([key,item])=><strong key={key}>{key}: {value(item)}</strong>)}</div>}{task.topics&&task.topics.length>0&&<div className={styles.fact}><span>Темы</span><div className={styles.topics}>{task.topics.map((topic,index)=><span className={styles.badge} key={`${topic.slug||topic.name}-${index}`}>{topic.name||topic.slug}</span>)}</div></div>}{group&&<div className={styles.fact}><span>Группа заданий</span><strong>{value(group.title)||value(group.name)||value(group.zid)||'Связанная группа'}{groupTasks?` · ${groupTasks} заданий`:''}</strong></div>}</aside>
    </div>
  </>;
}
