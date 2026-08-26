export type WeeklySlot = {
  id: string;
  enrollmentId: string;
  weekday: number;
  time: string;
  durationMinutes: number;
  active: boolean;
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

export function activeSlotsForWeekday<T extends Pick<WeeklySlot, 'active' | 'weekday' | 'time'>>(slots: T[], weekday: number) {
  return slots.filter((slot) => slot.active && slot.weekday === weekday).sort((left, right) => left.time.localeCompare(right.time));
}
