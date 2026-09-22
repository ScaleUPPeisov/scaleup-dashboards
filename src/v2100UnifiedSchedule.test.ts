import {describe,expect,it} from 'vitest';
import {publisherUnifiedChannelSlots} from './publisherSchedule';

describe('VYRON unified long-video channel scheduler',()=>{
 it('10 Sep + YouTube latest 15 Dec daily => 16 Dec',()=>{
  const slots=publisherUnifiedChannelSlots({startDate:'2026-09-10',times:['18:00'],count:1,occupied:['2026-12-15T11:00:00.000Z'],now:new Date('2026-09-10T00:00:00.000Z')});
  expect(slots[0]).toBe('2026-12-16T11:00:00.000Z');
 });
 it('latest yesterday always yields a future valid slot',()=>{
  const now=new Date('2026-09-10T10:00:00.000Z');const [slot]=publisherUnifiedChannelSlots({startDate:'2026-09-09',times:['18:00'],count:1,occupied:['2026-09-09T11:00:00.000Z'],now});
  expect(Date.parse(slot)).toBeGreaterThan(now.getTime());
 });
 it('future latest blocks tomorrow and starts after it',()=>{
  const [slot]=publisherUnifiedChannelSlots({startDate:'2026-09-11',times:['18:00'],count:1,occupied:['2026-12-15T11:00:00.000Z'],now:new Date('2026-09-10T00:00:00.000Z')});
  expect(slot).toBe('2026-12-16T11:00:00.000Z');
 });
 it('normalizes timezone offsets by instant, not raw string',()=>{
  const slots=publisherUnifiedChannelSlots({startDate:'2026-09-10',times:['18:00','19:00'],count:1,occupied:['2026-09-10T18:00:00+07:00','2026-09-10T11:00:00Z'],now:new Date('2026-09-10T00:00:00Z')});
  expect(slots[0]).toBe('2026-09-10T12:00:00.000Z');
 });
});
