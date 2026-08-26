import { ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import { getNavigatorStudentPosition, getNavigatorStudents, getNavigatorUsageForStudent, currentPositionSearch, filterUnusedOgeTasks } from '@/lib/navigator-data';
import { ogeNavigatorBaseUrl, searchOgeTasks, type OgeFilters } from '@/lib/oge-navigator-client';
import { navigatorConnectionLabel } from '@/lib/navigator-utils';
import styles from './navigator.module.css';

const sections = ['Grammar', 'Reading', 'Listening', 'Writing', 'Speaking', 'Vocabulary', 'Word Formation'];
function text(value: string | string[] | undefined) { return typeof value === 'string' ? value.trim() : ''; }
function pageHref(query: Record<string,string|string[]|undefined>, page: number) { const params=new URLSearchParams(); for(const[key,value]of Object.entries(query))if(typeof value==='string'&&value)params.set(key,value);params.set('page',String(page));return `/navigator?${params}`; }

export default async function NavigatorPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const query = await searchParams;
  const studentId = text(query.student);
  const page = Math.max(1, Number(text(query.page)) || 1);
  const mediaFilter = text(query.hasMedia);
  const filters: OgeFilters = { q:text(query.q)||undefined,qid:text(query.qid)||undefined,section:text(query.section)||undefined,topic:text(query.topic)||undefined,subtopic:text(query.subtopic)||undefined,kes:text(query.kes)||undefined,answerType:text(query.answerType)||undefined,hasMedia:mediaFilter==='true'?true:mediaFilter==='false'?false:undefined,page,pageSize:20 };
  const [result, students, usage, position] = await Promise.all([searchOgeTasks(filters),getNavigatorStudents(),studentId?getNavigatorUsageForStudent(studentId):Promise.resolve([]),studentId?getNavigatorStudentPosition(studentId):Promise.resolve(null)]);
  const usageByQid = new Map(usage.map((item) => [item.qid,item]));
  const onlyUnused = text(query.unused)==='1';
  const items = onlyUnused ? filterUnusedOgeTasks(result.items,usageByQid.keys()) : result.items;
  const base = ogeNavigatorBaseUrl();
  const positionQuery = currentPositionSearch(position);
  return <>
    <header className={`page-head ${styles.head}`}><div><p className="eyebrow">Read-only каталог ОГЭ</p><h1>ФИПИ Navigator</h1><p className="muted">Каталог заданий ОГЭ. Поиск, фильтрация и контроль использования заданий у учеников.</p></div><div className={styles.headActions}><span className={`${styles.connection} ${result.available?styles.online:styles.offline}`}>{navigatorConnectionLabel(result.configured,result.available)}</span>{base&&<a className="button" href={`${base}/tasks`} target="_blank" rel="noreferrer">Открыть полный Navigator <ExternalLink size={15}/></a>}</div></header>
    {!result.configured&&<div className="notice warning">Для доступа к каталогу настройте OGE_NAVIGATOR_BASE_URL.</div>}
    {result.configured&&!result.available&&<div className="notice warning">Navigator временно не отвечает. Страница продолжает работать — повторите поиск позже.</div>}
    <section className={`panel ${styles.searchPanel}`}><form className={styles.searchForm} action="/navigator">
      <label>Поиск<input name="q" defaultValue={text(query.q)} placeholder="тема, текст, QID, ключевое слово"/></label>
      <label>Раздел<select name="section" defaultValue={text(query.section)}><option value="">Все разделы</option>{sections.map((section)=><option key={section}>{section}</option>)}</select></label>
      <button className="button primary" type="submit"><Search size={16}/>Найти</button>
      <details className={styles.advanced}><summary>Дополнительные фильтры</summary><div className={styles.advancedFields}><label>Topic<input name="topic" defaultValue={text(query.topic)}/></label><label>Subtopic<input name="subtopic" defaultValue={text(query.subtopic)}/></label><label>KES<input name="kes" defaultValue={text(query.kes)}/></label><label>Answer type<input name="answerType" defaultValue={text(query.answerType)}/></label><label>QID<input name="qid" defaultValue={text(query.qid)}/></label><label>Медиа<select name="hasMedia" defaultValue={text(query.hasMedia)}><option value="">Не важно</option><option value="true">Есть</option><option value="false">Нет</option></select></label></div></details>
      <div className={styles.studentRow}><label>Проверить для ученика<select name="student" defaultValue={studentId}><option value="">Все ученики</option>{students.map((student)=><option key={student.id} value={student.id}>{student.name}</option>)}</select></label>{studentId&&<label className={styles.check}><input type="checkbox" name="unused" value="1" defaultChecked={onlyUnused}/>Только неиспользованные задания</label>}</div>
    </form></section>
    {position&&<div className={styles.position}><div><span>Текущая позиция</span><strong>{position.stage}{position.lesson?` — ${position.lesson}`:''}</strong></div>{positionQuery&&<Link className="button" href={`/navigator?student=${encodeURIComponent(studentId)}&q=${encodeURIComponent(positionQuery)}`}>Подобрать по текущему блоку</Link>}</div>}
    <div className={styles.resultsHead}><strong>Найдено: {result.total}</strong>{onlyUnused&&<span className="muted small">На этой странице неиспользованных: {items.length}</span>}</div>
    <section className={styles.results}>{items.map((task)=>{const used=usageByQid.get(task.qid);return <article className={styles.task} key={task.qid}><div><div className={styles.badges}><span className={styles.badge}>{task.section||'Без раздела'}</span><span className={styles.badge}>QID {task.qid}</span>{task.hasMedia&&<span className={styles.badge}>Есть медиа</span>}</div><h2>{task.topic||task.subtopic||task.kesText||'Задание ОГЭ'}</h2><p>{task.preview||'Краткое описание отсутствует.'}</p><div className={styles.meta}>{task.subtopic&&<span>{task.subtopic}</span>}{task.kesCode&&<span>KES {task.kesCode}</span>}{task.answerType&&<span>{task.answerType}</span>}</div></div><div className={styles.taskActions}>{studentId&&(used?<span className={styles.used}>Использовалось · {used.date}<br/>{used.course} · {used.stage}{used.lesson?` / ${used.lesson}`:''}</span>:<span className={styles.unused}>Не использовалось</span>)}<Link className="button" href={`/navigator/${encodeURIComponent(task.qid)}`}>Открыть задание</Link></div></article>})}</section>
    {result.available&&!items.length&&<div className="empty-state"><strong>Задания не найдены</strong><p>Измените запрос или отключите фильтр неиспользованных.</p></div>}
    {result.pages>1&&<nav className={styles.pagination}>{result.page>1&&<Link className="button" href={pageHref(query,result.page-1)}>← Назад</Link>}<span>Страница {result.page} из {result.pages}</span>{result.page<result.pages&&<Link className="button" href={pageHref(query,result.page+1)}>Дальше →</Link>}</nav>}
  </>;
}
