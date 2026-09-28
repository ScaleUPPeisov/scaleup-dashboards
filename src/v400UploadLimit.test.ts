import {beforeEach,describe,expect,it} from 'vitest';
import {safeDailyStatus,uploadsByVyronCalendarDay} from './youtubePublishSafety';
import {resetYoutubeUploadQuotaLimit,setYoutubeUploadQuotaLimit,youtubeUploadQuotaState} from './youtubeQuota';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>storage.has(k)?storage.get(k)!:null,
 setItem:(k:string,v:string)=>{storage.set(k,String(v))},
 removeItem:(k:string)=>{storage.delete(k)},
 clear:()=>{storage.clear()},
 key:(i:number)=>Array.from(storage.keys())[i]??null,
 get length(){return storage.size}
}});

const completed=(id:string,at:string)=>({id,channelId:'c1',jobId:id,filePath:'/x.mov',fingerprint:id.padEnd(64,'a').slice(0,64),fileSize:1,startedAt:at,completedAt:at,videoId:'yt-'+id,status:'completed' as const});

describe('VYRON 4.0.0 upload limits are explicit and separated from API quota',()=>{
 beforeEach(()=>localStorage.clear());

 it('does not invent a 100-video allowance when no limit is configured',()=>{
  const x=youtubeUploadQuotaState('gcp:test');
  expect(x.configuredLimit).toBeNull();
  expect(x.limit).toBeNull();
  expect(x.remaining).toBeNull();
  expect(x.limitSource).toBe('unknown')
 });

 it('uses an explicit configured limit and returns to unknown after reset',()=>{
  const configured=setYoutubeUploadQuotaLimit('gcp:test',10);
  expect(configured.limit).toBe(10);
  expect(configured.remaining).toBe(10);
  expect(configured.limitSource).toBe('user-configured');
  const reset=resetYoutubeUploadQuotaLimit('gcp:test');
  expect(reset.limit).toBeNull();
  expect(reset.remaining).toBeNull();
  expect(reset.limitSource).toBe('unknown')
 });

 it('counts VYRON uploads by local calendar day, not rolling 24h',()=>{
  const now=new Date(2026,8,28,0,30,0,0);
  const yesterday=new Date(2026,8,27,23,45,0,0).toISOString();
  const today=new Date(2026,8,28,0,10,0,0).toISOString();
  localStorage.setItem('vyron:youtube-publish-records:v1',JSON.stringify([completed('old',yesterday),completed('today',today)]));
  expect(uploadsByVyronCalendarDay('c1',now.getTime())).toHaveLength(1);
  expect(safeDailyStatus('c1',10,now.getTime())).toEqual(expect.objectContaining({used:1,remaining:9,window:'local-calendar-day'}))
 });

 it('blocks capacity at 10/10 through the local counter surface',()=>{
  const now=new Date(2026,8,28,15,0,0,0);
  const rows=Array.from({length:10},(_,i)=>completed('x'+i,new Date(2026,8,28,8,i,0,0).toISOString()));
  localStorage.setItem('vyron:youtube-publish-records:v1',JSON.stringify(rows));
  expect(safeDailyStatus('c1',10,now.getTime())).toEqual(expect.objectContaining({used:10,remaining:0,configured:true}))
 })
});
