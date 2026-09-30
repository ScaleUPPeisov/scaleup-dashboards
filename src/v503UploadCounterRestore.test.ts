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

function historyRows(count:number):UploadHistoryRecord[]{
 return Array.from({length:count},(_,i)=>({
  id:`history-${i+1}`,
  jobId:`job-${i+1}`,
  channelId:`channel-${(i%3)+1}`,
  profileId:`profile-${(i%3)+1}`,
  youtubeVideoId:`YT-${i+1}`,
  localFilePath:`/Render/${i+1}.mp4`,
  originalFilename:`${i+1}.mp4`,
  uploadedAt:`2026-09-29T23:${String(i).padStart(2,'0')}:00.000Z`,
  fileSize:1000+i,
  sha256:String(i+1).padStart(64,'a').slice(-64),
  status:'UPLOADED' as const
 }))
}

describe('VYRON 5.0.3 upload counter restore hotfix',()=>{
 beforeEach(()=>{
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T00:30:00.000Z'));
 });
 afterEach(()=>vi.useRealTimers());

 it('restores 10 successful VYRON uploads from persisted uploadHistory after update',()=>{
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:0,limit:100,remaining:100}));
  expect(restorePublishLedgerFromUploadHistory(historyRows(10))).toBe(10);
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:10,limit:100,remaining:90}));
 });

 it('is idempotent across restart/hydrate and never double counts restored history',()=>{
  const rows=historyRows(10);
  expect(restorePublishLedgerFromUploadHistory(rows)).toBe(10);
  expect(restorePublishLedgerFromUploadHistory(rows)).toBe(0);
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:10,remaining:90}));
 });

 it('updates subscribers so Topbar and QuotaMeter can refresh from the same global status',()=>{
  const snapshots:Array<{used:number;remaining:number}>=[];
  const off=subscribeGlobalDailyUploadStatus(()=>{
   const x=globalDailyUploadStatus();
   snapshots.push({used:x.used,remaining:x.remaining});
  });
  restorePublishLedgerFromUploadHistory(historyRows(10));
  expect(snapshots.at(-1)).toEqual({used:10,remaining:90});
  off();
 });

 it('increments to 11/100 on the next successful upload without restart',()=>{
  restorePublishLedgerFromUploadHistory(historyRows(10));
  const attempt=beginPublishAttempt({channelId:'channel-4',jobId:'job-11',filePath:'/Render/11.mp4',fingerprint:'f'.repeat(64),fileSize:1111});
  completePublishAttempt(attempt.id,'YT-11');
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:11,remaining:89}));
 });

 it('does not increment on failed upload',()=>{
  restorePublishLedgerFromUploadHistory(historyRows(10));
  const attempt=beginPublishAttempt({channelId:'channel-4',jobId:'job-failed',filePath:'/Render/failed.mp4',fingerprint:'e'.repeat(64),fileSize:2222});
  failPublishAttempt(attempt.id,'network error');
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:10,remaining:90}));
 });

 it('deduplicates a successful video already present in the publish ledger',()=>{
  const attempt=beginPublishAttempt({channelId:'channel-1',jobId:'job-1',filePath:'/Render/1.mp4',fingerprint:'1'.repeat(64),fileSize:1001});
  completePublishAttempt(attempt.id,'YT-1');
  expect(restorePublishLedgerFromUploadHistory(historyRows(10))).toBe(9);
  expect(globalDailyUploadStatus()).toEqual(expect.objectContaining({used:10,remaining:90}));
 });
});
