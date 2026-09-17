import {beforeEach,describe,expect,it} from 'vitest';
import {releaseYoutubeQuotaReservation,reserveYoutubeQuotaAtomic,setYoutubeUploadQuotaLimit,youtubeUploadQuotaState} from './youtubeQuota';
const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,String(v)),removeItem:(k:string)=>storage.delete(k),clear:()=>storage.clear(),key:(i:number)=>Array.from(storage.keys())[i]??null,get length(){return storage.size}}});
describe('atomic quota reservation',()=>{
 beforeEach(()=>localStorage.clear());
 it('rechecks current reservations at reservation time so stale simultaneous plans cannot oversubscribe',()=>{const project='gcp:test';setYoutubeUploadQuotaLimit(project,1);const ops=[{method:'videos.insert' as const,count:1}];const a=reserveYoutubeQuotaAtomic('A',ops,project);const b=reserveYoutubeQuotaAtomic('B',ops,project);expect(a.reserved).toBe(true);expect(b.reserved).toBe(false);expect(b.plan.buckets.videoUploads.available).toBe(0);expect(youtubeUploadQuotaState(project).reserved).toBe(1);releaseYoutubeQuotaReservation('A')});
 it('keeps independent upload reservations isolated by project key',()=>{setYoutubeUploadQuotaLimit('gcp:A',1);setYoutubeUploadQuotaLimit('gcp:B',1);expect(reserveYoutubeQuotaAtomic('A',[{method:'videos.insert',count:1}],'gcp:A').reserved).toBe(true);expect(reserveYoutubeQuotaAtomic('B',[{method:'videos.insert',count:1}],'gcp:B').reserved).toBe(true)});
});
