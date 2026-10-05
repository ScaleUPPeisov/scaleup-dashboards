import {describe,expect,it} from 'vitest';
import {metadataPublishAt} from './publisherMetadata';
import {inferYoutubePublishClock,resolvePublisherBatchSchedule} from './scheduleContinuation';

const now=new Date('2026-10-05T12:00:00.000Z');
const rows=[
 {number:1,publishAt:'2026-10-10',publishTime:'07:00',publishTimezone:'KRAT',publishUtcOffsetMinutes:420,source:'docx'},
 {number:2,publishAt:'2026-10-11',publishTime:'08:30',publishTimezone:'KRAT',publishUtcOffsetMinutes:420,source:'docx'},
];
const filePublishAts=rows.map(row=>metadataPublishAt(row as any));

describe('VYRON 6.1.9 independent DATE SOURCE and TIME SOURCE',()=>{
 it('A file date + file time',()=>{
  const r=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:2,timeSource:'file',fileTimeRows:rows as any,filePublishAts,now});
  expect(r.items.map(x=>x.publishAt)).toEqual(['2026-10-10T00:00:00.000Z','2026-10-11T01:30:00.000Z']);
 });

 it('B file date + manual time keeps file dates and replaces only clock time',()=>{
  const r=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:2,timeSource:'common',fileTimeRows:rows as any,filePublishAts,now});
  expect(r.items.map(x=>x.publishAt)).toEqual(['2026-10-10T11:00:00.000Z','2026-10-11T11:00:00.000Z']);
 });

 it('D switching time source changes only time, never file calendar dates',()=>{
  const fromFile=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:2,timeSource:'file',fileTimeRows:rows as any,filePublishAts,now});
  const manual=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:2,timeSource:'common',fileTimeRows:rows as any,filePublishAts,now});
  expect(fromFile.items.map(x=>x.publishAt?.slice(0,10))).toEqual(manual.items.map(x=>x.publishAt?.slice(0,10)));
  expect(manual.items.map(x=>x.publishAt)).toEqual(['2026-10-10T11:00:00.000Z','2026-10-11T11:00:00.000Z']);
 });

 it('E missing file time blocks only when TIME SOURCE = FILE',()=>{
  const withGap=[rows[0],{number:2,publishAt:'2026-10-11',source:'docx'}];
  const fileAts=withGap.map(row=>metadataPublishAt(row as any));
  const fromFile=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:2,timeSource:'file',fileTimeRows:withGap as any,filePublishAts:fileAts,now});
  const manual=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:2,timeSource:'common',fileTimeRows:withGap as any,filePublishAts:fileAts,now});
  expect(fromFile.items[1]).toMatchObject({status:'MISSING',reason:'MISSING'});
  expect(manual.items[1].publishAt).toBe('2026-10-11T11:00:00.000Z');
 });

 it('F manual time works when metadata has DATE but no PUBLISH TIME',()=>{
  const row={number:1,publishAt:'2026-10-12',source:'docx'};
  const r=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:1,timeSource:'common',fileTimeRows:[row] as any,filePublishAts:[metadataPublishAt(row as any)],now});
  expect(r.items[0].publishAt).toBe('2026-10-12T11:00:00.000Z');
 });

 it('K occupied future YouTube slot remains protected',()=>{
  const occupied='2026-10-10T11:00:00.000Z';
  const r=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:1,timeSource:'common',fileTimeRows:[rows[0]] as any,filePublishAts:[filePublishAts[0]],occupied:[occupied],now});
  expect(r.items[0].publishAt).not.toBe(occupied);
  expect(r.conflicts).toBe(1);
 });

 it('L KRAT conversion keeps the file calendar date across UTC boundary',()=>{
  const row={number:1,publishAt:'2026-10-10',publishTime:'23:30',publishTimezone:'KRAT',publishUtcOffsetMinutes:420,source:'docx'};
  const r=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'00:30',count:1,timeSource:'common',fileTimeRows:[row] as any,filePublishAts:[metadataPublishAt(row as any)],now});
  expect(r.items[0].publishAt).toBe('2026-10-09T17:30:00.000Z');
 });

 it('M 30 mixed file dates preserve exact calendar dates with manual time',()=>{
  const many=Array.from({length:30},(_,i)=>({number:i+1,publishAt:`2026-11-${String(i+1).padStart(2,'0')}`,publishTime:i%2?'08:30':'07:00',publishTimezone:'KRAT',publishUtcOffsetMinutes:420,source:'docx'}));
  const r=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:30,timeSource:'common',fileTimeRows:many as any,filePublishAts:many.map(x=>metadataPublishAt(x as any)),now});
  expect(r.items.map(x=>x.publishAt)).toEqual(many.map(x=>`${x.publishAt}T11:00:00.000Z`));
 });

 it('N past-date repair remains deterministic',()=>{
  const row={number:1,publishAt:'2026-10-01',publishTime:'07:00',publishTimezone:'KRAT',publishUtcOffsetMinutes:420,source:'docx'};
  const run=()=>resolvePublisherBatchSchedule({mode:'file',startDate:'',time:'18:00',count:1,timeSource:'common',fileTimeRows:[row] as any,filePublishAts:[metadataPublishAt(row as any)],fallbackIntervalDays:1,now});
  expect(run()).toEqual(run());
  expect(run().items[0].status).toBe('RESCHEDULED');
 });
});

describe('VYRON 6.1.9 YouTube-history time evidence',()=>{
 it('H future scheduled private video is preferred as time evidence',()=>{
  const r=inferYoutubePublishClock([
   {privacyStatus:'public',publishedAt:'2026-10-01T03:00:00.000Z'},
   {privacyStatus:'private',publishAt:'2026-10-10T07:00:00.000Z'},
   {privacyStatus:'private',publishAt:'2026-10-11T07:00:00.000Z'},
  ],now);
  expect(r).toMatchObject({time:'14:00',source:'scheduled',evidenceCount:2,timezone:'Asia/Krasnoyarsk'});
 });

 it('I historical actually-published time is fallback evidence',()=>{
  const r=inferYoutubePublishClock([
   {privacyStatus:'public',publishedAt:'2026-10-01T07:00:00.000Z'},
   {privacyStatus:'unlisted',publishedAt:'2026-10-02T07:00:00.000Z'},
  ],now);
  expect(r).toMatchObject({time:'14:00',source:'published',evidenceCount:2});
 });

 it('J private unscheduled video without publishAt is not trusted',()=>{
  const r=inferYoutubePublishClock([{privacyStatus:'private'}],now);
  expect(r).toBeUndefined();
 });

 it('C/G file dates can use inferred YouTube time even without PUBLISH TIME',()=>{
  const evidence=inferYoutubePublishClock([{privacyStatus:'private',publishAt:'2026-10-15T07:00:00.000Z'}],now)!;
  const row={number:1,publishAt:'2026-10-12',source:'docx'};
  const r=resolvePublisherBatchSchedule({mode:'file',startDate:'',time:evidence.time,count:1,timeSource:'youtube',fileTimeRows:[row] as any,filePublishAts:[undefined],now});
  expect(r.items[0].publishAt).toBe('2026-10-12T07:00:00.000Z');
 });
});
