import {describe,expect,it} from 'vitest';
import {compareRunwayRecords,deriveRunwayRecord,recalculateRunwayRecord,KRASNOYARSK_TIME_ZONE} from './channelRunwayCore';
import {loadChannelRunwayStore,markRunwayRefreshIssue,upsertChannelRunwayFromYoutube} from './channelRunwayStore';
import type {Channel,YoutubeExistingVideo} from './types';

const now=new Date('2026-11-18T06:00:00.000Z');
const channel={id:'neon',name:'Neon Drive FM'} as Channel;
const scheduled=(id:string,iso='2026-12-12T17:00:00+07:00'):YoutubeExistingVideo=>({
 id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus:'private',publishAt:iso,selected:false
});
const memory=()=>{
 const data=new Map<string,string>();
 return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)}};
};

describe('critical YouTube runway evidence regression',()=>{
 it.each([10,100])('%i privately scheduled videos remain scheduled, never local inventory',count=>{
  const record=deriveRunwayRecord(channel,Array.from({length:count},(_,n)=>scheduled('v'+n)),now,now.toISOString(),true);
  expect(record.scheduledVideoCount).toBe(count);
  expect(record.scheduledUntil).toBe('2026-12-12');
  expect(record.runwayDays).toBe(24);
  expect(record.dataState).toBe('CONFIRMED_SCHEDULE');
 });
 it('only a complete empty inventory can prove zero future videos',()=>{
  const verified=deriveRunwayRecord(channel,[],now,now.toISOString(),true);
  const partial=deriveRunwayRecord(channel,[],now,undefined,false);
  expect(verified.dataState).toBe('CONFIRMED_EMPTY');
  expect(verified.runwayDays).toBe(0);
  expect(partial.dataState).toBe('UNKNOWN');
  expect(partial.runwayDays).toBeUndefined();
  expect(partial.status).toBe('no-data');
 });
 it('does not confuse unscheduled private, public, or expired videos with future schedule',()=>{
  const rows=[scheduled('private-no-publish',''),{...scheduled('public-future'),privacyStatus:'public'},{...scheduled('yesterday'),'publishAt':'2026-11-17T17:00:00+07:00'}];
  const record=deriveRunwayRecord(channel,rows,now,now.toISOString(),true);
  expect(record.scheduledVideoCount).toBe(0);
  expect(record.dataState).toBe('CONFIRMED_EMPTY');
 });
 it('counts calendar dates in Krasnoyarsk, not UTC hour rounding',()=>{
  expect(KRASNOYARSK_TIME_ZONE).toBe('Asia/Krasnoyarsk');
  const boundary=new Date('2026-11-18T16:59:59Z'); // 23:59:59 Nov 18 KRSK
  const next='2026-11-18T17:00:00Z'; // 00:00:00 Nov 19 KRSK
  expect(deriveRunwayRecord(channel,[scheduled('next',next)],boundary,boundary.toISOString(),true).runwayDays).toBe(1);
 });
 it('retains confirmed last date and count on API failure, but never displays confirmed zero',()=>{
  const storage=memory();
  expect(upsertChannelRunwayFromYoutube(channel,[scheduled('a'),scheduled('b')],now,storage).ok).toBe(true);
  expect(markRunwayRefreshIssue(channel,'API_FAILED','network',new Date(now.getTime()+1000),storage).ok).toBe(true);
  const row=loadChannelRunwayStore(storage).channels.neon;
  expect(row.scheduledUntil).toBe('2026-12-12');
  expect(row.scheduledVideoCount).toBe(2);
  expect(row.dataState).toBe('API_FAILED');
  expect(row.runwayDays).toBeUndefined();
  expect(row.status).toBe('no-data');
 });
 it('expires verified schedule after TTL without overwriting historical evidence',()=>{
  const record=deriveRunwayRecord(channel,[scheduled('a')],now,now.toISOString(),true);
  const expired=recalculateRunwayRecord(record,new Date(now.getTime()+7*60*60*1000));
  expect(expired.dataState).toBe('STALE_CACHE');
  expect(expired.scheduledUntil).toBe('2026-12-12');
  expect(expired.runwayDays).toBeUndefined();
  expect(expired.status).toBe('no-data');
 });
 it('sorts unknown runways after confirmed zero and confirmed positive',()=>{
  const confirmed=deriveRunwayRecord(channel,[],now,now.toISOString(),true);
  const unknown=deriveRunwayRecord({id:'other',name:'Other'},[],now,undefined,false);
  expect(compareRunwayRecords(confirmed,unknown)).toBeLessThan(0);
 });
});
