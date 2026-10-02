import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {
 beginPublishAttempt,
 completePublishAttempt,
 failPublishAttempt,
 globalDailyUploadStatus,
 restorePublishLedgerFromUploadHistory,
 subscribeGlobalDailyUploadStatus
} from './youtubePublishSafety';
import type {UploadHistoryRecord} from './types';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>storage.has(k)?storage.get(k)!:null,
 setItem:(k:string,v:string)=>{storage.set(k,String(v))},
 removeItem:(k:string)=>{storage.delete(k)},
 clear:()=>{storage.clear()},
 key:(i:number)=>Array.from(storage.keys())[i]??null,
 get length(){return storage.size}
}});

function historyRow(i:number,channelId='channel-1',uploadedAt='2026-10-02T05:00:00.000Z',videoId=`YT-${i}`):UploadHistoryRecord{
 return{
  id:`history-${i}`,jobId:`job-${i}`,channelId,profileId:`profile-${channelId}`,youtubeVideoId:videoId,
  localFilePath:`/Render/${i}.mp4`,originalFilename:`${i}.mp4`,uploadedAt,fileSize:1000+i,
  sha256:String(i).padStart(64,'a').slice(-64),status:'UPLOADED'
 }
}
function historyRows10(uploadedAt='2026-10-02T05:00:00.000Z'){
 return[
  ...Array.from({length:5},(_,i)=>historyRow(i+1,'channel-A',uploadedAt)),
  ...Array.from({length:3},(_,i)=>historyRow(i+6,'channel-B',uploadedAt)),
  ...Array.from({length:2},(_,i)=>historyRow(i+9,'channel-C',uploadedAt))
 ]
}

describe('VYRON 6.1.0 global verified upload counter',()=>{
 beforeEach(()=>{
  localStorage.clear();
  restorePublishLedgerFromUploadHistory([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T06:00:00.000Z'));
 });
 afterEach(()=>vi.useRealTimers());

 it('LIVE SUCCESS: increments 1..10 immediately and ends at 10/100 remaining 90',()=>{
  for(let i=1;i<=10;i++){
   const a=beginPublishAttempt({channelId:`channel-${(i%3)+1}`,jobId:`live-${i}`,filePath:`/Render/live-${i}.mp4`,fingerprint:String(i).repeat(64).slice(0,64),fileSize:1000+i});
   completePublishAttempt(a.id,`LIVE-YT-${i}`);
   expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:i,limit:100,remaining:100-i}));
  }
 });

 it('UI SUBSCRIBERS: one completion fans the same snapshot to Dashboard, QuotaMeter and Publisher listeners',()=>{
  const dashboard:any[]=[],quota:any[]=[],publisher:any[]=[];
  const capture=(target:any[])=>(()=>{const x=globalDailyUploadStatus();target.push({used:x.used,remaining:x.remaining})});
  const offDashboard=subscribeGlobalDailyUploadStatus(capture(dashboard));
  const offQuota=subscribeGlobalDailyUploadStatus(capture(quota));
  const offPublisher=subscribeGlobalDailyUploadStatus(capture(publisher));
  const a=beginPublishAttempt({channelId:'A',jobId:'ui-1',filePath:'/Render/ui.mp4',fingerprint:'a'.repeat(64),fileSize:1000});
  completePublishAttempt(a.id,'UI-YT-1');
  expect(dashboard.at(-1)).toEqual({used:1,remaining:99});
  expect(quota.at(-1)).toEqual({used:1,remaining:99});
  expect(publisher.at(-1)).toEqual({used:1,remaining:99});
  offDashboard();offQuota();offPublisher();
 });

 it('UI CONTRACT: Dashboard, QuotaMeter and Publisher all subscribe to the shared counter',()=>{
  for(const file of ['DashboardOS.tsx','QuotaMeter.tsx','PublisherOS.tsx']){
   const src=readFileSync(new URL('./'+file,import.meta.url),'utf8');
   expect(src,file).toContain('subscribeGlobalDailyUploadStatus');
  }
 });

 it('RESTART: durable uploadHistory restores 10/100 even with an empty publish ledger',()=>{
  const rows=historyRows10();
  localStorage.clear();restorePublishLedgerFromUploadHistory([]);
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:0,remaining:100}));
  restorePublishLedgerFromUploadHistory(rows);
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:10,remaining:90}));
 });

 it('UPDATE: the same persisted uploadHistory restores 10/100 after a clean runtime ledger',()=>{
  const rows=historyRows10();
  restorePublishLedgerFromUploadHistory(rows);
  localStorage.clear();restorePublishLedgerFromUploadHistory([]);
  restorePublishLedgerFromUploadHistory(rows);
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:10,remaining:90}));
 });

 it('DUPLICATE: youtubeVideoId is authoritative across ledger and duplicate history rows',()=>{
  const a=beginPublishAttempt({channelId:'A',jobId:'dup-live',filePath:'/Render/dup.mp4',fingerprint:'d'.repeat(64),fileSize:1000});
  completePublishAttempt(a.id,'SAME-YT');
  restorePublishLedgerFromUploadHistory([
   historyRow(1,'A','2026-10-02T05:00:00.000Z','SAME-YT'),
   historyRow(2,'B','2026-10-02T05:01:00.000Z','SAME-YT')
  ]);
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:1,remaining:99}));
 });

 it('FAILED: ten completed plus one failed remains 10/100',()=>{
  restorePublishLedgerFromUploadHistory(historyRows10());
  const a=beginPublishAttempt({channelId:'A',jobId:'failed',filePath:'/Render/failed.mp4',fingerprint:'f'.repeat(64),fileSize:1000});
  failPublishAttempt(a.id,'network');
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:10,remaining:90}));
 });

 it('DAY ROLLOVER: resets at 00:00 America/Los_Angeles including DST-aware date conversion',()=>{
  const before='2026-11-01T06:50:00.000Z';
  restorePublishLedgerFromUploadHistory(Array.from({length:10},(_,i)=>historyRow(i+1,'A',before)));
  expect(globalDailyUploadStatus(100,new Date('2026-11-01T06:59:59.000Z'))).toEqual(expect.objectContaining({used:10,remaining:90,quotaDay:'2026-10-31'}));
  expect(globalDailyUploadStatus(100,new Date('2026-11-01T07:00:01.000Z'))).toEqual(expect.objectContaining({used:0,remaining:100,quotaDay:'2026-11-01'}));
 });

 it('MULTI CHANNEL: 5 + 3 + 2 is one global 10/100 counter',()=>{
  restorePublishLedgerFromUploadHistory(historyRows10());
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:10,remaining:90}));
 });

 it('NO API COST: counter recovery is local-only',()=>{
  const src=readFileSync(new URL('./youtubePublishSafety.ts',import.meta.url),'utf8');
  const start=src.indexOf('export function restorePublishLedgerFromUploadHistory');
  const end=src.indexOf('export function uploadsByVyronLast24h');
  const body=src.slice(start,end);
  expect(src).not.toContain("from './api'");
  for(const forbidden of ['api.','channels.list','videos.list','search.list','playlistItems.list'])expect(body).not.toContain(forbidden);
 });
});
