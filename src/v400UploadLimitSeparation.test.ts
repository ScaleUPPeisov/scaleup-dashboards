import fs from 'node:fs';
import {beforeEach,describe,expect,it} from 'vitest';
import {planYoutubeQuota,registerYoutubeUploadProject,youtubeUploadQuotaState} from './youtubeQuota';
import {publisherLocalUploadCapacity} from './publisherQuota';
import {safeDailyStatus} from './youtubePublishSafety';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>storage.get(k)??null,
 setItem:(k:string,v:string)=>storage.set(k,String(v)),
 removeItem:(k:string)=>storage.delete(k),
 clear:()=>storage.clear(),
 key:(i:number)=>Array.from(storage.keys())[i]??null,
 get length(){return storage.size}
}});

describe('VYRON 4 API quota / channel upload-limit separation',()=>{
 beforeEach(()=>localStorage.clear());

 it('a project has no invented video allowance until an explicit/confirmed limit exists',()=>{
   const x=registerYoutubeUploadProject('gcp:owner');
   expect(x.limit).toBeNull();
   expect(x.remaining).toBeNull();
   expect(x.limitSource).toBe('unknown');
   const plan=planYoutubeQuota([{method:'videos.insert',count:100}],undefined,'gcp:owner');
   expect(plan.buckets.videoUploads.limitKnown).toBe(false)
 });

 it('local channel limit 10 blocks the 11th VYRON upload independently of API units',()=>{
   const rows=Array.from({length:10},(_,i)=>({
     id:'r'+i,channelId:'c1',jobId:'j'+i,filePath:'/v'+i+'.mp4',fingerprint:'f'+i,fileSize:1,
     startedAt:'2026-09-28T08:00:00Z',completedAt:'2026-09-28T08:01:00Z',videoId:'YT'+i,status:'completed'
   }));
   localStorage.setItem('vyron:youtube-publish-records:v1',JSON.stringify(rows));
   const daily=safeDailyStatus('c1',10,Date.parse('2026-09-28T09:00:00Z'));
   expect(daily.used).toBe(10);
   expect(daily.remaining).toBe(0);
   expect(publisherLocalUploadCapacity(daily.remaining,5).canUploadToday).toBe(0)
 });

 it('Publisher labels provider allowance as unavailable and exposes local VYRON presets',()=>{
   const src=fs.readFileSync('src/PublisherOS.tsx','utf8');
   expect(src).toContain('Дневной лимит загрузок VYRON');
   expect(src).toContain('10,20,30');
   expect(src).toContain('Без ограничения VYRON');
   expect(src).toContain('API upload allowance');
   expect(src).toContain('Не предоставляется API');
   expect(src).not.toContain('Осталось upload-квоты')
 });

 it('upload queue removes videos.insert from API-quota reservations but keeps local limiter',()=>{
   const src=fs.readFileSync('src/uploadQueueRuntime.ts','utf8');
   expect(src).toContain(".filter(x=>x.method!=='videos.insert')");
   expect(src).toContain('safeDailyStatus(spec.channelId,channel.safeDailyUploadLimit)');
   expect(src).toContain('UPLOAD_QUEUE_CHANNEL_DAILY_LIMIT')
 });
});
