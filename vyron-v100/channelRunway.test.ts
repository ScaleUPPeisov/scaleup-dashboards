import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Channel} from './types';
import {CHANNEL_RUNWAY_KEY,buildChannelRunwayPlan,buildChannelRunwayRows,channelSignature,nextKrasnoyarskSixAt,readChannelRunwayState,recalculateChannelRunway,shouldRunDailyChannelRunway,statusForRunway} from './channelRunway';

const channel=(id:string,name=id):Channel=>({id,name,slug:id,cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'en',genre:'music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}});
const quota=(used=0)=>({ptDate:'2026-09-02',limit:10000,used,calls:0});
const video=(id:string,publishAt:string)=>({id,position:1,title:'',description:'',tags:[],categoryId:'10',privacyStatus:'private' as const,publishAt,selected:false});
function memoryStorage(){
 const map=new Map<string,string>();
 return {getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>void map.set(k,String(v)),removeItem:(k:string)=>void map.delete(k),clear:()=>map.clear(),key:(i:number)=>Array.from(map.keys())[i]??null,get length(){return map.size}};
}
afterEach(()=>vi.unstubAllGlobals());

describe('Channel Runway',()=>{
 it('NEON: 01.12.2026 from 02.09.2026 is 90 days and next batch is 17.10.2026',()=>{
  const now=new Date('2026-09-02T05:00:00Z');
  const rows=buildChannelRunwayRows([channel('neon','NEON')],{neon:{version:1,updatedAt:'2026-09-02T04:00:00Z',videos:[video('v1','2026-12-01T11:00:00Z')]}},{},now);
  expect(rows.neon.runwayDays).toBe(90);
  expect(rows.neon.batchVideos).toBe(30);
  expect(rows.neon.batchCoverageDays).toBe(60);
  expect(rows.neon.nextProductionDate).toBe('2026-10-17');
 });

 it('20 channels x 30 videos / 60 days => about one channel every 3 days, 6 per quota day, 4 quota days',()=>{
  const channels=Array.from({length:20},(_,i)=>channel(`c${i+1}`));
  const rows=buildChannelRunwayRows(channels,{}, {},new Date('2026-09-02T05:00:00Z'));
  const plan=buildChannelRunwayPlan(rows,quota(),new Date('2026-09-02T05:00:00Z'));
  expect(plan.averageBatchVideos).toBe(30);
  expect(plan.averageBatchCoverageDays).toBe(60);
  expect(plan.recommendedPaceDays).toBe(3);
  expect(plan.fullQuotaCapacity).toBe(6);
  expect(plan.quotaDaysAll).toBe(4);
 });

 it('reduces today capacity when part of the daily quota is already spent',()=>{
  const channels=Array.from({length:20},(_,i)=>channel(`c${i+1}`));
  const rows=buildChannelRunwayRows(channels,{}, {},new Date('2026-09-02T05:00:00Z'));
  const plan=buildChannelRunwayPlan(rows,quota(5000),new Date('2026-09-02T05:00:00Z'));
  expect(plan.fullQuotaCapacity).toBe(6);
  expect(plan.remainingQuotaCapacity).toBe(3);
  expect(plan.quotaRemaining).toBe(5000);
 });

 it('uses required runway statuses without fake values',()=>{
  expect(statusForRunway(undefined).status).toBe('nodata');
  expect(statusForRunway(0).status).toBe('empty');
  expect(statusForRunway(14).status).toBe('urgent');
  expect(statusForRunway(30).status).toBe('prepare');
  expect(statusForRunway(45).status).toBe('plan');
  expect(statusForRunway(46).status).toBe('safe');
  const row=buildChannelRunwayRows([channel('missing')],{}, {},new Date('2026-09-02T05:00:00Z')).missing;
  expect(row.scheduledUntil).toBeUndefined();
  expect(row.runwayDays).toBeUndefined();
  expect(row.scheduledVideoCount).toBe(0);
  expect(row.status).toBe('nodata');
 });

 it('derives scheduled count, last date and real average interval from local cache',()=>{
  const rows=buildChannelRunwayRows([channel('neon','NEON')],{neon:{version:1,updatedAt:'2026-09-02T04:00:00Z',videos:[video('v1','2026-09-10T11:00:00Z'),video('v2','2026-09-12T11:00:00Z'),video('v3','2026-09-14T11:00:00Z')]}},{},new Date('2026-09-02T05:00:00Z'));
  expect(rows.neon.scheduledVideoCount).toBe(3);
  expect(rows.neon.averagePublishIntervalDays).toBe(2);
  expect(rows.neon.scheduledUntil).toBe('2026-09-14T11:00:00Z');
 });

 it('schedules the local-only daily runtime for 06:00 Asia/Krasnoyarsk',()=>{
  expect(nextKrasnoyarskSixAt(new Date('2026-09-01T22:30:00Z')).toISOString()).toBe('2026-09-01T23:00:00.000Z');
  expect(nextKrasnoyarskSixAt(new Date('2026-09-01T23:10:00Z')).toISOString()).toBe('2026-09-02T23:00:00.000Z');
 });

 it('catches a missed daily calculation at 06:00 Krasnoyarsk, but not before 06:00',()=>{
  const channels=[channel('neon','NEON')];
  const rows=buildChannelRunwayRows(channels,{}, {},new Date('2026-09-01T12:00:00Z'));
  const state={version:1 as const,calculatedAt:'2026-09-01T12:00:00.000Z',calculationDateKrasnoyarsk:'2026-09-01',channelSignature:channelSignature(channels),rows,plan:buildChannelRunwayPlan(rows,quota(),new Date('2026-09-01T12:00:00Z'))};
  expect(shouldRunDailyChannelRunway(state,channels,new Date('2026-09-01T22:59:00Z'))).toBe(false);
  expect(shouldRunDailyChannelRunway(state,channels,new Date('2026-09-01T23:00:00Z'))).toBe(true);
 });

 it('persists Runway independently and restores it without a YouTube request',()=>{
  const storage=memoryStorage();vi.stubGlobal('localStorage',storage);
  storage.setItem('vyron:existing-cache:v1:neon',JSON.stringify({version:1,updatedAt:'2026-09-02T04:00:00Z',videos:[video('v1','2026-12-01T11:00:00Z')]}));
  const state=recalculateChannelRunway([channel('neon','NEON')],new Date('2026-09-02T05:00:00Z'));
  expect(storage.getItem(CHANNEL_RUNWAY_KEY)).toBeTruthy();
  expect(state.rows.neon.runwayDays).toBe(90);
  expect(readChannelRunwayState()?.rows.neon.scheduledUntil).toBe('2026-12-01T11:00:00Z');
 });
});
