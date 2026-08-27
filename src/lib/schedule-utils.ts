export type WeeklySlot = {
  id: string;
  enrollmentId: string;
  weekday: number;
  time: string;
  durationMinutes: number;
  active: boolean;
};

export type ScheduleInputRow = {
  weekday: number;
  time: string;
  durationMinutes: number;
};

export function validWeekday(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

export function validDuration(value: number) {
  return Number.isInteger(value) && value >= 30 && value <= 180;
}

export function validStartTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeScheduleInputRows(
  weekdayValues: readonly unknown[],
  timeValues: readonly unknown[],
  durationValues: readonly unknown[],
) {
  const count = Math.min(Math.max(weekdayValues.length, timeValues.length, durationValues.length), 14);
  const rows = new Map<string, ScheduleInputRow>();

  for (let index = 0; index < count; index += 1) {
    const weekdayRaw = String(weekdayValues[index] ?? '').trim();
    const time = String(timeValues[index] ?? '').trim();
    const durationRaw = String(durationValues[index] ?? '').trim();
    if (!weekdayRaw && !time) continue;

    const weekday = Number(weekdayRaw);
    const durationMinutes = Number(durationRaw || '60');
    if (!validWeekday(weekday) || !validStartTime(time) || !validDuration(durationMinutes)) continue;

    rows.set(`${weekday}|${time}`, { weekday, time, durationMinutes });
  }

  return [...rows.values()];
}

export function activeSlotsForWeekday<T extends Pick<WeeklySlot, 'active' | 'weekday' | 'time'>>(slots: T[], weekday: number) {
  return slots.filter((slot) => slot.active && slot.weekday === weekday).sort((left, right) => left.time.localeCompare(right.time));
}
