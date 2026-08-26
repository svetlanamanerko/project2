import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeSlotsForWeekday, validDuration, validStartTime, validWeekday } from '../src/lib/schedule-utils.ts';

let slots=[
  {id:'monday',enrollmentId:'one',weekday:1,time:'16:00',durationMinutes:60,active:true},
  {id:'thursday',enrollmentId:'one',weekday:4,time:'16:00',durationMinutes:60,active:true},
  {id:'tuesday-early',enrollmentId:'one',weekday:2,time:'16:00',durationMinutes:60,active:true},
  {id:'tuesday-late',enrollmentId:'one',weekday:2,time:'18:00',durationMinutes:90,active:true},
];
assert.equal(slots.filter((slot)=>slot.enrollmentId==='one').length,4);
assert.deepEqual(activeSlotsForWeekday(slots,2).map((slot)=>slot.id),['tuesday-early','tuesday-late']);
assert.equal(slots.some((slot)=>slot.enrollmentId==='one'&&slot.weekday===1&&slot.time==='16:00'),true);
assert.equal(slots.filter((slot)=>slot.enrollmentId==='one'&&slot.weekday===1&&slot.time==='16:00').length,1);
slots=slots.map((slot)=>slot.id==='monday'?{...slot,time:'17:00',durationMinutes:75}:slot);
assert.equal(slots.find((slot)=>slot.id==='monday')?.time,'17:00');
assert.equal(slots.find((slot)=>slot.id==='monday')?.durationMinutes,75);
slots=slots.map((slot)=>slot.id==='tuesday-early'?{...slot,active:false}:slot);
assert.deepEqual(activeSlotsForWeekday(slots,2).map((slot)=>slot.id),['tuesday-late']);
assert.equal(validWeekday(7)&&!validWeekday(8),true);
assert.equal(validStartTime('09:30')&&!validStartTime('25:00'),true);
assert.equal(validDuration(30)&&validDuration(180)&&!validDuration(29),true);
const migration=fs.readFileSync(new URL('../db/migrations/005_weekly_schedule_duration.sql',import.meta.url),'utf8');
assert.match(migration,/duration_minutes integer DEFAULT 60/);
assert.match(migration,/SET duration_minutes = 60/);
assert.match(migration,/schedule_rules_active_slot_uidx/);
console.log('Weekly schedule checks passed.');
