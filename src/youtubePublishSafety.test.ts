import {describe,it,expect,beforeEach} from 'vitest';
import {acquireChannelUploadLock,beginPublishAttempt,completePublishAttempt,findSuccessfulUpload,isYoutubeDailyUploadLimitError,releaseChannelUploadLock,safeDailyStatus} from './youtubePublishSafety';
import {mapThumbnailsToJobs,metadataCoverage} from './publishCenterCore';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>storage.has(k)?storage.get(k)!:null,
 setItem:(k:string,v:string)=>{storage.set(k,String(v))},
 removeItem:(k:string)=>{storage.delete(k)},
 clear:()=>{storage.clear()},
 key:(i:number)=>Array.from(storage.keys())[i]??null,
 get length(){return storage.size}
}});

describe('Publish safety',()=>{
 beforeEach(()=>localStorage.clear());
 it('counts completed uploads in the current YouTube day and protects duplicate fingerprint',()=>{const a=beginPublishAttempt({channelId:'c',jobId:'j',filePath:'/x.mp4',fingerprint:'abc',fileSize:10});expect(safeDailyStatus('c',15).used).toBe(0);completePublishAttempt(a.id,'YT1');expect(safeDailyStatus('c',15)).toEqual(expect.objectContaining({used:1,remaining:14}));expect(findSuccessfulUpload('c','abc')?.videoId).toBe('YT1')});
 it('resets the local VYRON channel limit at the next Pacific YouTube day',()=>{
  localStorage.setItem('vyron:youtube-publish-records:v1',JSON.stringify([
   {id:'old',channelId:'c',jobId:'old',filePath:'/old.mp4',fingerprint:'old',fileSize:1,startedAt:'2026-09-28T06:55:00Z',completedAt:'2026-09-28T06:56:00Z',videoId:'YT_OLD',status:'completed'},
   {id:'new',channelId:'c',jobId:'new',filePath:'/new.mp4',fingerprint:'new',fileSize:1,startedAt:'2026-09-28T07:05:00Z',completedAt:'2026-09-28T07:06:00Z',videoId:'YT_NEW',status:'completed'}
  ]));
  const before=safeDailyStatus('c',10,Date.parse('2026-09-28T06:59:00Z'));
  const after=safeDailyStatus('c',10,Date.parse('2026-09-28T08:00:00Z'));
  expect(before.used).toBe(1);
  expect(after.used).toBe(1);
  expect(after.remaining).toBe(9);
  expect(before.day).not.toBe(after.day)
 });
 it('locks one channel but not another',()=>{const a=acquireChannelUploadLock('c');expect(a).toBeTruthy();expect(acquireChannelUploadLock('c')).toBeNull();const b=acquireChannelUploadLock('d');expect(b).toBeTruthy();releaseChannelUploadLock('c',a!);expect(acquireChannelUploadLock('c')).toBeTruthy()});
 it('recognizes real daily upload limit wording',()=>expect(isYoutubeDailyUploadLimitError('daily upload limit exceeded')).toBe(true));
});
describe('Publish mapping',()=>{it('maps numbered thumbnails first and remaining in natural order',()=>{const jobs:any[]=[{id:'a',number:1},{id:'b',number:2},{id:'c',number:3}];const m=mapThumbnailsToJobs(jobs,['/THUMBNAIL_003.png','/THUMBNAIL_001.jpg','/other.png']);expect(m.a).toContain('001');expect(m.c).toContain('003');expect(m.b).toContain('other')});it('uses WORD >= selected rule',()=>{expect(metadataCoverage(new Array(30) as any,19).ok).toBe(true);expect(metadataCoverage(new Array(1) as any,19).ok).toBe(false)})});
