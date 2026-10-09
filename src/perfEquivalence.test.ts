import {beforeEach,describe,expect,it} from 'vitest';
import {youtubePtDate} from './youtubeQuota';
import {latestUploadRecord} from './storageLifecycle';
import {publishRecords,uploadsByVyronToday,globalDailyUploadStatus,beginPublishAttempt,completePublishAttempt} from './youtubePublishSafety';
import type {UploadHistoryRecord} from './types';
class MemoryStorage{private m=new Map<string,string>();getItem(k:string){return this.m.get(k)??null}setItem(k:string,v:string){this.m.set(k,String(v))}removeItem(k:string){this.m.delete(k)}clear(){this.m.clear()}key(){return null}get length(){return this.m.size}}
const storage=new MemoryStorage();Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});

// Reference implementations: the exact pre-optimization code. The optimized versions must be observationally identical.
function refParts(date:Date,timeZone:string){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).reduce<Record<string,string>>((a,x)=>(a[x.type]=x.value,a),{})}
function refPtDate(now:Date){const p=refParts(now,'America/Los_Angeles');return `${p.year}-${p.month}-${p.day}`}
function refLatest(history:UploadHistoryRecord[],jobId:string){return history.slice().reverse().find(x=>x.jobId===jobId&&x.status==='UPLOADED'&&!x.staleLinkClearedAt)}

describe('performance refactors keep behavior identical',()=>{
  it('youtubePtDate with a cached formatter matches the uncached reference, including DST boundaries',()=>{
    const instants:number[]=[];
    const start=Date.UTC(2026,0,1),end=Date.UTC(2027,0,1);
    for(let t=start;t<end;t+=53*60*1000)instants.push(t);
    // US DST: 2026-03-08 10:00Z spring forward, 2026-11-01 09:00Z fall back; midnight Pacific is 07:00Z/08:00Z.
    for(const base of [Date.UTC(2026,2,8,9,59,0),Date.UTC(2026,2,9,6,59,0),Date.UTC(2026,10,1,8,59,0),Date.UTC(2026,10,2,7,59,0),Date.UTC(2026,11,31,23,59,59)])for(const d of [-1000,0,1000,59999,60000])instants.push(base+d);
    for(const t of instants)expect(youtubePtDate(new Date(t))).toBe(refPtDate(new Date(t)));
  });
  it('latestUploadRecord returns the last matching UPLOADED record without copying the array',()=>{
    let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
    const mk=(i:number,jobId:string,status:string,cleared:boolean)=>({id:'h'+i,jobId,channelId:'c',status,staleLinkClearedAt:cleared?'2026-01-01T00:00:00Z':undefined,youtubeVideoId:'v'+i}) as unknown as UploadHistoryRecord;
    for(let round=0;round<200;round++){
      const n=Math.floor(rnd()*40);
      const history=Array.from({length:n},(_,i)=>mk(i,'j'+Math.floor(rnd()*5),rnd()<.7?'UPLOADED':'FAILED',rnd()<.25));
      const copy=history.slice();
      for(let j=0;j<6;j++)expect(latestUploadRecord(history,'j'+j)).toBe(refLatest(history,'j'+j));
      expect(history).toEqual(copy);
    }
    expect(latestUploadRecord([],'x')).toBeUndefined();
  });
});

// Reference: the exact pre-optimization reader.
function refPublishRecords(){const get=<T,>(key:string,fallback:T):T=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}};const r=get<any[]>('vyron:youtube-publish-records:v1',[]);return Array.isArray(r)?r:[]}
const KEY='vyron:youtube-publish-records:v1';
describe('publishRecords parse cache keeps behavior identical',()=>{
  beforeEach(()=>storage.clear());
  it('matches the uncached reader for absent, empty, invalid, non-array and valid raw values, and invalidates on every change',()=>{
    const rows=(n:number)=>Array.from({length:n},(_,i)=>({id:'r'+i,channelId:'c'+(i%3),jobId:'j'+i,filePath:'/f'+i,fingerprint:'fp'+i,fileSize:1,startedAt:'2026-10-09T01:00:00.000Z',completedAt:'2026-10-09T01:05:00.000Z',videoId:'v'+i,status:'completed'}));
    const steps:(string|null)[]=[null,'','null','not json','{"a":1}','"str"','123','[]',JSON.stringify(rows(3)),JSON.stringify(rows(3)),JSON.stringify(rows(4)),'[]',null,JSON.stringify(rows(1)),'{broken'];
    for(const raw of steps){
      if(raw===null)storage.removeItem(KEY);else storage.setItem(KEY,raw);
      for(let k=0;k<3;k++)expect(publishRecords()).toEqual(refPublishRecords());
    }
  });
  it('write paths see fresh data and derived daily counts match a reference computed from raw storage',()=>{
    const a=beginPublishAttempt({channelId:'c1',jobId:'j1',filePath:'/a',fingerprint:'f1',fileSize:1} as any);
    expect(publishRecords()).toEqual(refPublishRecords());
    expect(publishRecords().length).toBe(1);
    completePublishAttempt(a.id,'vid1');
    expect(publishRecords()).toEqual(refPublishRecords());
    expect(publishRecords()[0].status).toBe('completed');
    const now=new Date();
    expect(uploadsByVyronToday('c1',now).length).toBe(1);
    expect(uploadsByVyronToday('c2',now).length).toBe(0);
    const b=beginPublishAttempt({channelId:'c2',jobId:'j2',filePath:'/b',fingerprint:'f2',fileSize:1} as any);completePublishAttempt(b.id,'vid2');
    expect(uploadsByVyronToday('c2',now).length).toBe(1);
    expect(globalDailyUploadStatus(100,now).used).toBe(2);
    storage.removeItem(KEY);
    expect(publishRecords()).toEqual([]);expect(globalDailyUploadStatus(100,now).used).toBe(0);
  });
});
