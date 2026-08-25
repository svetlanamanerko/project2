'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, FolderOpen, GraduationCap, Home, LifeBuoy, LogOut, Settings, Target, Users } from 'lucide-react';

const links = [
  { href: '/', label: 'Сегодня', icon: Home },
  { href: '/students', label: 'Ученики', icon: Users },
  { href: '/students/progress', label: 'Прогресс', icon: Target },
  { href: '/courses', label: 'Курсы', icon: GraduationCap },
  { href: '/urgent', label: 'Срочная помощь', icon: LifeBuoy },
  { href: '/materials', label: 'Материалы', icon: FolderOpen },
];

export function Sidebar({ ownerName, logoutAction }: { ownerName: string; logoutAction: () => Promise<void> }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BookOpen size={28} /></div><div><strong>Мастерская<br/>уроков</strong><span>Единый центр подготовки</span></div></div>
      <nav>{links.map(({ href, label, icon: Icon }) => <Link key={href} className={pathname === href ? 'nav-link active' : 'nav-link'} href={href}><Icon size={19}/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="owner-card"><div className="avatar">{ownerName.slice(0,1).toUpperCase()}</div><div><strong>{ownerName}</strong><span>Преподаватель</span></div></div>
        <Link className="nav-link muted-link" href="/settings"><Settings size={18}/>Настройки</Link>
        <form action={logoutAction}><button className="nav-link button-link" type="submit"><LogOut size={18}/>Выйти</button></form>
      </div>
    </aside>
  );
}
