import {describe,expect,it} from 'vitest';
import {publisherKrasnoyarskIso,publisherScheduleDates,publisherSchedulePreview} from './publisherSchedule';

describe('publisher schedule uses Metadata calendar semantics',()=>{
 it('keeps file mode untouched',()=>{expect(publisherScheduleDates('file','2026-09-10','18:00',5)).toEqual([])});
 it('converts Krasnoyarsk wall time to ISO',()=>{expect(publisherKrasnoyarskIso('2026-09-10','18:00')).toBe('2026-09-10T11:00:00.000Z')});
 it('creates every-day schedule',()=>{expect(publisherScheduleDates('daily','2026-09-10','18:00',4)).toEqual(['2026-09-10T11:00:00.000Z','2026-09-11T11:00:00.000Z','2026-09-12T11:00:00.000Z','2026-09-13T11:00:00.000Z'])});
 it('creates 2/2 publish-pause cycle',()=>{expect(publisherScheduleDates('2/2','2026-09-10','18:00',6)).toEqual(['2026-09-10T11:00:00.000Z','2026-09-11T11:00:00.000Z','2026-09-14T11:00:00.000Z','2026-09-15T11:00:00.000Z','2026-09-18T11:00:00.000Z','2026-09-19T11:00:00.000Z'])});
 it('creates 3/1 publish-pause cycle',()=>{const x=publisherSchedulePreview('3/1','2026-09-10','20:30',6);expect(x.dates).toEqual(['2026-09-10T13:30:00.000Z','2026-09-11T13:30:00.000Z','2026-09-12T13:30:00.000Z','2026-09-14T13:30:00.000Z','2026-09-15T13:30:00.000Z','2026-09-16T13:30:00.000Z']);expect(x.first).toBe(x.dates[0]);expect(x.last).toBe(x.dates[5])});
 it('rejects incomplete date/time instead of inventing a schedule',()=>{expect(publisherScheduleDates('daily','','18:00',3)).toEqual([]);expect(publisherScheduleDates('2/2','2026-09-10','',3)).toEqual([])});
});

import {repairPastPublishAt} from './publisherSchedule';
describe('past-date auto repair',()=>{
 it('I daily moves to nearest future slot',()=>{const now=new Date('2026-09-11T05:00:00.000Z');const r=repairPastPublishAt('2026-09-10T11:00:00.000Z',{kind:'daily',time:'18:00'},now);expect(r.status).toBe('RESCHEDULED');expect(Date.parse(r.publishAt!)).toBeGreaterThan(now.getTime())});
 it('J every two days preserves interval policy',()=>{const now=new Date('2026-09-11T05:00:00.000Z');const r=repairPastPublishAt('2026-09-10T11:00:00.000Z',{kind:'interval',intervalDays:2,time:'18:00'},now);expect(r.status).toBe('RESCHEDULED');expect(r.publishAt?.slice(0,10)).toBe('2026-09-12')});
 it('K impossible policy becomes SKIPPED_PAST_DATE',()=>{const r=repairPastPublishAt('2026-09-10T00:00:00.000Z',{kind:'unavailable'},new Date('2026-09-11T00:00:00.000Z'));expect(r.status).toBe('SKIPPED_PAST_DATE')});
});
