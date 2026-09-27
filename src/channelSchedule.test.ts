import {beforeEach,describe,expect,it} from 'vitest';
import {deriveChannelScheduleState,generatePatternSchedule,isPatternPublishDate,readExistingCache,writeExistingCache,existingCacheKey} from './channelSchedule';
import {setFrontendTenant} from './tenantStorage';
import type {Channel,YoutubeExistingVideo} from './types';

class MemoryStorage{
 private data=new Map<string,string>();
 get length(){return this.data.size}
 clear(){this.data.clear()}
 getItem(k:string){return this.data.has(k)?this.data.get(k)!:null}
 key(i:number){return [...this.data.keys()][i]??null}
 removeItem(k:string){this.data.delete(k)}
 setItem(k:string,v:string){this.data.set(k,String(v))}
}
beforeEach(()=>{
 Object.defineProperty(globalThis,'localStorage',{value:new MemoryStorage(),configurable:true});
 setFrontendTenant('');
});

const base:Channel={id:'c',name:'Channel',slug:'c',cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'FR',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}};
const v=(id:string,publishAt?:string):YoutubeExistingVideo=>({id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus:'private',publishAt,selected:false});
const pattern=(extra:Partial<Channel>={}):Channel=>({...base,scheduleMode:'pattern',publishDays:3,pauseDays:1,patternAnchorDate:'2026-09-15',...extra});
describe('VYRON calendar schedule strategies',()=>{
 it('keeps old cadence channels backward compatible as interval mode',()=>{const s=deriveChannelScheduleState(base,[v('x','2026-09-13T18:00:00+07:00')]);expect(s.scheduleMode).toBe('interval');expect(s.nextAvailableAt).toBe('2026-09-15T11:00:00.000Z')});
 it('3/1 calendar slots are deterministic from anchor',()=>{const p={publishDays:3,pauseDays:1,anchorDate:'2026-09-15'};expect(isPatternPublishDate('2026-09-15',p)).toBe(true);expect(isPatternPublishDate('2026-09-16',p)).toBe(true);expect(isPatternPublishDate('2026-09-17',p)).toBe(true);expect(isPatternPublishDate('2026-09-18',p)).toBe(false);expect(isPatternPublishDate('2026-09-19',p)).toBe(true)});
 it('preview shows pause days and creates exactly requested video dates',()=>{const c=pattern();const g=generatePatternSchedule(c,[],10);expect(g.dates).toHaveLength(10);expect(g.calendar.slice(0,5).map(x=>x.kind)).toEqual(['video','video','video','pause','video']);expect(g.dates[0]).toBe('2026-09-15T11:00:00.000Z');expect(g.dates[9]).toBe('2026-09-27T11:00:00.000Z')});
 it('continues in the middle of an existing 3/1 cycle',()=>{const c=pattern({patternAnchorDate:'2026-09-01'});const rows=[v('9','2026-09-09T18:00:00+07:00'),v('10','2026-09-10T18:00:00+07:00')];const g=generatePatternSchedule(c,rows,4);expect(g.dates.map(x=>x.slice(0,10))).toEqual(['2026-09-11','2026-09-13','2026-09-14','2026-09-15']);expect(g.calendar.some(x=>x.date==='2026-09-12'&&x.kind==='pause')).toBe(true)});
 it('occupied publish slot is skipped without moving pause day',()=>{const c=pattern();const rows=[v('busy','2026-09-16T18:00:00+07:00')];const g=generatePatternSchedule(c,rows,4);expect(g.dates.map(x=>x.slice(0,10))).toEqual(['2026-09-17','2026-09-19','2026-09-20','2026-09-21']);expect(g.calendar.some(x=>x.date==='2026-09-16')).toBe(false);expect(g.calendar.find(x=>x.date==='2026-09-18')?.kind).toBe('pause')});
 it('34 videos produce 34 slots without duplicate dates',()=>{const g=generatePatternSchedule(pattern(),[],34);expect(g.dates).toHaveLength(34);expect(new Set(g.dates.map(x=>x.slice(0,10))).size).toBe(34)});
 it('different channels keep different strategies',()=>{expect(deriveChannelScheduleState(base,[]).scheduleMode).toBe('interval');expect(deriveChannelScheduleState(pattern(),[]).scheduleMode).toBe('pattern')});

 it('isolates existing-video cache between tenants',()=>{
   const row=(id:string)=>({version:1 as const,updatedAt:'2026-09-27T00:00:00.000Z',videos:[v(id)],baseline:{},lastUndo:[],syncInfo:{complete:true}});
   setFrontendTenant('tenant-a');
   writeExistingCache('same-channel',row('a-video'));
   expect(readExistingCache('same-channel')?.videos[0]?.id).toBe('a-video');

   setFrontendTenant('tenant-b');
   expect(readExistingCache('same-channel')).toBeUndefined();
   writeExistingCache('same-channel',row('b-video'));
   expect(readExistingCache('same-channel')?.videos[0]?.id).toBe('b-video');

   setFrontendTenant('tenant-a');
   expect(readExistingCache('same-channel')?.videos[0]?.id).toBe('a-video');
 });

 it('migrates legacy global existing-video cache only once into active tenant',()=>{
   const legacyKey='vyron:existing-cache:v1:legacy-channel';
   localStorage.setItem(legacyKey,JSON.stringify({version:1,updatedAt:'2026-09-27T00:00:00.000Z',videos:[v('legacy-video')],baseline:{},lastUndo:[],syncInfo:{complete:true}}));
   setFrontendTenant('tenant-first');
   expect(readExistingCache('legacy-channel')?.videos[0]?.id).toBe('legacy-video');
   expect(localStorage.getItem(legacyKey)).toBeNull();
   expect(localStorage.getItem(existingCacheKey('legacy-channel'))).toContain('legacy-video');

   setFrontendTenant('tenant-second');
   expect(readExistingCache('legacy-channel')).toBeUndefined();
 });
});
