import {beforeEach,describe,expect,it} from 'vitest';
import {futureScheduledVideos,getChannelScheduleState,krasDateKey,scheduleSyncTruthFromInfo,writeExistingCache} from './channelSchedule';
import type {Channel,YoutubeExistingVideo} from './types';

const mem=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>mem.has(k)?mem.get(k)!:null,
 setItem:(k:string,v:string)=>{mem.set(k,String(v))},
 removeItem:(k:string)=>{mem.delete(k)},
 clear:()=>mem.clear(),
 key:(i:number)=>[...mem.keys()][i]??null,
 get length(){return mem.size}
}});

const channel=(id:string):Channel=>({id,name:id,slug:id,cadenceDays:1,targetBufferDays:60,publishHour:4,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}});
const video=(id:string,privacyStatus='private',publishAt?:string):YoutubeExistingVideo=>({id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus,publishAt,selected:false});
const NOW=Date.parse('2026-09-18T00:00:00.000Z');
beforeEach(()=>mem.clear());

describe('physical schedule truth regression',()=>{
 it('detects only future private publishAt using absolute timestamps',()=>{
  const rows=[video('future','private','2026-09-18T00:00:01.000Z'),video('past','private','2026-09-17T23:59:59.000Z'),video('public','public','2026-11-01T00:00:00.000Z'),video('bad','private','legacy')];
  expect(futureScheduledVideos(rows,NOW).map(x=>x.id)).toEqual(['future']);
 });
 it('selects the latest factual future publishAt',()=>{
  const c=channel('latest'),rows=[video('a','private','2026-10-01T21:00:00.000Z'),video('b','private','2026-11-09T21:00:00.000Z')];
  writeExistingCache(c.id,{version:1,updatedAt:'2026-09-18T00:00:00.000Z',videos:rows,baseline:Object.fromEntries(rows.map(v=>[v.id,v])),lastUndo:[],syncInfo:{complete:true,scheduleComplete:true,draftCandidateCount:0}});
  const state=getChannelScheduleState(c.id,c,[],NOW);
  expect(state.lastScheduledAt).toBe('2026-11-09T21:00:00.000Z');
  expect(state.nextAvailableAt).toBe('2026-11-10T21:00:00.000Z');
 });
 it('uses the complete 152-video baseline rather than six selected/edit rows',()=>{
  const c=channel('baseline');
  const all=Array.from({length:152},(_,i)=>video('v'+i,'private',i===151?'2026-11-09T21:00:00.000Z':undefined));
  const six=all.slice(0,6).map(v=>({...v,selected:true}));
  writeExistingCache(c.id,{version:1,updatedAt:'2026-09-18T00:00:00.000Z',videos:six,baseline:Object.fromEntries(all.map(v=>[v.id,v])),lastUndo:[],syncInfo:{complete:true,scheduleComplete:true,draftCandidateCount:0}});
  const state=getChannelScheduleState(c.id,c,[],NOW);
  expect(Object.keys(JSON.parse(localStorage.getItem('vyron:existing-cache:v1:'+c.id)!).baseline)).toHaveLength(152);
  expect(state.lastScheduledAt).toBe('2026-11-09T21:00:00.000Z');
  expect(state.scheduledCount).toBe(1);
 });
 it('marks partial/fallback sync as non-authoritative instead of factual zero',()=>{
  expect(scheduleSyncTruthFromInfo({complete:false,scheduleComplete:false})).toBe('incomplete');
  expect(scheduleSyncTruthFromInfo({complete:true,draftCandidateCount:2})).toBe('incomplete');
  expect(scheduleSyncTruthFromInfo(null)).toBe('unknown');
 });
 it('handles UTC to Krasnoyarsk day boundary without string comparison',()=>{
  const rows=[video('edge','private','2026-09-18T17:00:00.000Z')];
  expect(futureScheduledVideos(rows,Date.parse('2026-09-18T16:59:59.000Z'))).toHaveLength(1);
  expect(krasDateKey(rows[0].publishAt)).toBe('2026-09-19');
 });
 it('keeps schedule cache isolated by channel id',()=>{
  const a=channel('A'),b=channel('B'),va=video('a','private','2026-10-01T21:00:00.000Z');
  writeExistingCache(a.id,{version:1,updatedAt:'2026-09-18T00:00:00.000Z',videos:[va],baseline:{a:va},lastUndo:[],syncInfo:{complete:true,scheduleComplete:true}});
  writeExistingCache(b.id,{version:1,updatedAt:'2026-09-18T00:00:00.000Z',videos:[],baseline:{},lastUndo:[],syncInfo:{complete:true,scheduleComplete:true}});
  expect(getChannelScheduleState(a.id,a,[],NOW).lastScheduledAt).toBe(va.publishAt);
  expect(getChannelScheduleState(b.id,b,[],NOW).lastScheduledAt).toBeUndefined();
 });
});
