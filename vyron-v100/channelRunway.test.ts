import {describe,expect,it} from 'vitest';
import type {Channel} from './types';
import {buildChannelRunwayPlan,buildChannelRunwayRows,nextKrasnoyarskSixAt,statusForRunway} from './channelRunway';

const channel=(id:string,name=id):Channel=>({id,name,slug:id,cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'en',genre:'music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}});
const quota=(used=0)=>({ptDate:'2026-09-02',limit:10000,used,calls:0});

describe('Channel Runway',()=>{
 it('NEON: 01.12.2026 from 02.09.2026 is 90 days and next batch is 17.10.2026',()=>{
  const now=new Date('2026-09-02T05:00:00Z');
  const rows=buildChannelRunwayRows([channel('neon','NEON')],{neon:{version:1,updatedAt:'2026-09-02T04:00:00Z',videos:[{id:'v1',position:1,title:'',description:'',tags:[],categoryId:'10',privacyStatus:'private',publishAt:'2026-12-01T11:00:00Z',selected:false}]}},{},now);
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

 it('uses required runway statuses without fake values',()=>{
  expect(statusForRunway(undefined).status).toBe('nodata');
  expect(statusForRunway(0).status).toBe('empty');
  expect(statusForRunway(14).status).toBe('urgent');
  expect(statusForRunway(30).status).toBe('prepare');
  expect(statusForRunway(45).status).toBe('plan');
  expect(statusForRunway(46).status).toBe('safe');
 });

 it('schedules the local-only daily runtime for 06:00 Asia/Krasnoyarsk',()=>{
  expect(nextKrasnoyarskSixAt(new Date('2026-09-01T22:30:00Z')).toISOString()).toBe('2026-09-01T23:00:00.000Z');
  expect(nextKrasnoyarskSixAt(new Date('2026-09-01T23:10:00Z')).toISOString()).toBe('2026-09-02T23:00:00.000Z');
 });
});
