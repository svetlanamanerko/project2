import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { getAppDateString } from '@/lib/data';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function dateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftMonth(value: string, delta: number) {
  const { year, month, day } = dateParts(value);
  const target = new Date(Date.UTC(year, month - 1 + delta, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return isoDate(targetYear, targetMonth, Math.min(day, daysInTargetMonth));
}

function monthDays(value: string) {
  const { year, month } = dateParts(value);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: count }, (_, index) => isoDate(year, month, index + 1)),
  ];
}

function formatMonth(value: string) {
  const { year, month } = dateParts(value);
  const formatted = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatSelectedDate(value: string) {
  const { year, month, day } = dateParts(value);
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function DashboardCalendar({ selectedDate }: { selectedDate: string }) {
  const today = getAppDateString();
  const tomorrow = getAppDateString(1);
  const days = monthDays(selectedDate);

  return <section className="dashboard-calendar" aria-label="Календарь уроков">
    <div className="calendar-month-card">
      <div className="calendar-month-head">
        <Link href={`/?date=${shiftMonth(selectedDate, -1)}`} aria-label="Предыдущий месяц"><ChevronLeft size={18}/></Link>
        <strong>{formatMonth(selectedDate)}</strong>
        <Link href={`/?date=${shiftMonth(selectedDate, 1)}`} aria-label="Следующий месяц"><ChevronRight size={18}/></Link>
      </div>
      <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days">
        {days.map((date, index) => date
          ? <Link
              key={date}
              href={`/?date=${date}`}
              className={`calendar-day ${date === selectedDate ? 'selected' : ''} ${date === today ? 'today' : ''}`}
              aria-current={date === selectedDate ? 'date' : undefined}
            >{Number(date.slice(-2))}</Link>
          : <span key={`empty-${index}`} className="calendar-day empty" aria-hidden="true"/>)}
      </div>
    </div>

    <div className="calendar-selection">
      <div className="calendar-selection-title"><CalendarDays size={20}/><span>Показать уроки на дату</span></div>
      <strong>{formatSelectedDate(selectedDate)}</strong>
      <p>Можно открыть любой будущий день и подготовить уроки заранее.</p>
      <div className="calendar-quick-links">
        <Link className={selectedDate === today ? 'active' : ''} href={`/?date=${today}`}>Сегодня</Link>
        <Link className={selectedDate === tomorrow ? 'active' : ''} href={`/?date=${tomorrow}`}>Завтра</Link>
      </div>
      <form className="calendar-date-form" method="get">
        <input type="date" name="date" defaultValue={selectedDate}/>
        <button className="button" type="submit">Перейти</button>
      </form>
    </div>
  </section>;
}
