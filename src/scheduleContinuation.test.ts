import {describe,expect,it} from 'vitest';
import {metadataPublishAt} from './publisherMetadata';
import {publisherKrasnoyarskIso} from './publisherSchedule';
import {recommendScheduleContinuation,resolvePublisherBatchSchedule} from './scheduleContinuation';
const now=new Date('2026-09-12T00:00:00.000Z');
const existing=['2026-09-13T07:00:00.000Z','2026-09-15T07:00:00.000Z','2026-09-17T07:00:00.000Z'].map(publishAt=>({privacyStatus:'private',publishAt}));
describe('VYRON schedule continuation A-G',()=>{
 it('A continues 2/2 after existing YouTube queue instead of tomorrow',()=>{const r=recommendScheduleContinuation(existing,'2/2','14:00',now);expect(r.futureCount).toBe(3);expect(r.lastPublishAt).toBe('2026-09-17T07:00:00.000Z');expect(r.recommendedStart).toBe('2026-09-19')});
 it('B manual start begins exactly at 25.09 14:00 and keeps 2/2 semantics',()=>{const r=resolvePublisherBatchSchedule({mode:'2/2',startDate:'2026-09-25',time:'14:00',count:4,now});expect(r.dates).toEqual(['2026-09-25T07:00:00.000Z','2026-09-26T07:00:00.000Z','2026-09-29T07:00:00.000Z','2026-09-30T07:00:00.000Z'])});
 it('C moves only occupied file slot to nearest configured future interval',()=>{const wanted='2026-09-19T07:00:00.000Z';const r=resolvePublisherBatchSchedule({mode:'file',startDate:'2026-09-19',time:'14:00',count:2,filePublishAts:[wanted,'2026-09-20T07:00:00.000Z'],occupied:[wanted],fallbackIntervalDays:2,now});expect(r.items[0].publishAt).toBe('2026-09-21T07:00:00.000Z');expect(r.items[0].status).toBe('RESCHEDULED');expect(r.items[1].publishAt).toBe('2026-09-20T07:00:00.000Z');expect(r.conflicts).toBe(1)});
 it('D one past date among 30 is repaired without blocking other 29',()=>{const rows=Array.from({length:30},(_,i)=>i===7?'2026-09-01T07:00:00.000Z':`2026-10-${String(i+1).padStart(2,'0')}T07:00:00.000Z`);const r=resolvePublisherBatchSchedule({mode:'file',startDate:'2026-09-19',time:'14:00',count:30,filePublishAts:rows,fallbackIntervalDays:1,now});expect(r.items.filter(x=>x.publishAt)).toHaveLength(30);expect(r.items[7].status).toBe('RESCHEDULED');expect(r.pastCorrected).toBe(1)});
 it('E future Word DATE + PUBLISH TIME is preserved exactly',()=>{const x=metadataPublishAt({publishAt:'2026-09-25',publishTime:'14:00',source:'test'} as any);const r=resolvePublisherBatchSchedule({mode:'file',startDate:'2026-09-19',time:'14:00',count:1,filePublishAts:[x],now});expect(r.items[0]).toMatchObject({publishAt:'2026-09-25T07:00:00.000Z',status:'UNCHANGED'})});
 it('F past Word DATE is reassigned to a future slot',()=>{const x=metadataPublishAt({publishAt:'2026-09-01',publishTime:'14:00',source:'test'} as any);const r=resolvePublisherBatchSchedule({mode:'file',startDate:'2026-09-19',time:'14:00',count:1,filePublishAts:[x],now});expect(r.items[0].status).toBe('RESCHEDULED');expect(Date.parse(r.items[0].publishAt!)).toBeGreaterThan(now.getTime())});
 it('G Krasnoyarsk local UI time becomes correct RFC3339 instant for YouTube',()=>{expect(publisherKrasnoyarskIso('2026-09-25','14:00')).toBe('2026-09-25T07:00:00.000Z')});
});


describe('VYRON 3.3.3 cadence date + per-video file time',()=>{
 const rows=[
  {number:1,publishTime:'07:00',publishTimezone:'KRAT',publishUtcOffsetMinutes:420,source:'docx'},
  {number:2,publishTime:'08:30',publishTimezone:'KRAT',publishUtcOffsetMinutes:420,source:'docx'},
  {number:3,publishTime:'10:00',publishTimezone:'KRAT',publishUtcOffsetMinutes:420,source:'docx'},
  {number:4,publishTime:'07:00',publishTimezone:'KRAT',publishUtcOffsetMinutes:420,source:'docx'}
 ];
 const before=new Date('2026-09-27T00:00:00.000Z');
 it('DAILY uses cadence dates and each VIDEO time from file',()=>{
  const r=resolvePublisherBatchSchedule({mode:'daily',startDate:'2026-09-28',time:'18:00',count:4,timeSource:'file',fileTimeRows:rows,now:before});
  expect(r.items.map(x=>x.publishAt)).toEqual(['2026-09-28T00:00:00.000Z','2026-09-29T01:30:00.000Z','2026-09-30T03:00:00.000Z','2026-10-01T00:00:00.000Z']);
 });
 it('2/2 keeps publish/pause dates while taking file time by VIDEO',()=>{
  const r=resolvePublisherBatchSchedule({mode:'2/2',startDate:'2026-09-28',time:'18:00',count:4,timeSource:'file',fileTimeRows:rows,now:before});
  expect(r.items.map(x=>x.publishAt)).toEqual(['2026-09-28T00:00:00.000Z','2026-09-29T01:30:00.000Z','2026-10-02T03:00:00.000Z','2026-10-03T00:00:00.000Z']);
 });
 it('3/1 keeps publish/pause dates while taking file time by VIDEO',()=>{
  const r=resolvePublisherBatchSchedule({mode:'3/1',startDate:'2026-09-28',time:'18:00',count:4,timeSource:'file',fileTimeRows:rows,now:before});
  expect(r.items.map(x=>x.publishAt)).toEqual(['2026-09-28T00:00:00.000Z','2026-09-29T01:30:00.000Z','2026-09-30T03:00:00.000Z','2026-10-02T00:00:00.000Z']);
 });
 it('COMMON TIME behavior remains unchanged',()=>{
  const r=resolvePublisherBatchSchedule({mode:'daily',startDate:'2026-09-28',time:'18:00',count:3,timeSource:'common',fileTimeRows:rows,now:before});
  expect(r.items.map(x=>x.publishAt)).toEqual(['2026-09-28T11:00:00.000Z','2026-09-29T11:00:00.000Z','2026-09-30T11:00:00.000Z']);
 });
 it('missing file time blocks only that VIDEO and does not shift following VIDEO mapping',()=>{
  const withGap=[rows[0],{number:2,source:'docx'},rows[2]];
  const r=resolvePublisherBatchSchedule({mode:'daily',startDate:'2026-09-28',time:'18:00',count:3,timeSource:'file',fileTimeRows:withGap,now:before});
  expect(r.items[0].publishAt).toBe('2026-09-28T00:00:00.000Z');
  expect(r.items[1]).toMatchObject({status:'MISSING',reason:'MISSING'});
  expect(r.items[2].publishAt).toBe('2026-09-30T03:00:00.000Z');
 });
 it('occupied slot is skipped without overwriting existing YouTube schedule',()=>{
  const occupied='2026-09-28T00:00:00.000Z';
  const r=resolvePublisherBatchSchedule({mode:'daily',startDate:'2026-09-28',time:'18:00',count:2,timeSource:'file',fileTimeRows:rows.slice(0,2),occupied:[occupied],now:before});
  expect(r.items[0]).toMatchObject({publishAt:'2026-09-29T00:00:00.000Z',status:'RESCHEDULED',reason:'CONFLICT'});
  expect(r.items[1].publishAt).toBe('2026-09-30T01:30:00.000Z');
  expect(r.dates).not.toContain(occupied);
 });
});
