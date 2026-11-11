import {describe,it,expect,vi} from 'vitest';
import {MultiChannelUploadQueue,type ImmutableUploadJob} from './uploadQueue';

const wait=()=>new Promise<void>(r=>setTimeout(r,0));
function spec(n:number,channelId:string,profileId=`profile-${channelId}`):ImmutableUploadJob{return{jobId:`j${n}`,projectId:`p${n}`,localVideoIdentity:`video-${n}`,videoNumber:n,channelId,channelName:channelId,profileId,filePath:`/${n}.mp4`,fingerprint:`${n}`.padStart(64,'a'),fileSize:100,modifiedAt:1,publishAt:'2030-01-01T00:00:00Z',title:`Video ${n}`,description:'d',tags:['x'],categoryId:'10',quotaOperations:[{method:'videos.insert',count:1},{method:'videos.list',count:1}],allowDuplicate:false,submittedAt:'2026-09-14T00:00:00Z'}}

describe('multi-channel upload queue',()=>{
 it('uses bounded concurrency and at most one active upload per channel',async()=>{const resolvers:Record<string,()=>void>={},started:string[]=[];const q=new MultiChannelUploadQueue(s=>new Promise<void>(r=>{started.push(s.jobId);resolvers[s.jobId]=r}),2);q.enqueue(spec(1,'A'));q.enqueue(spec(2,'A'));q.enqueue(spec(3,'B'));await wait();expect(started).toEqual(['j1','j3']);expect(q.snapshot().running.map(x=>x.spec.channelId).sort()).toEqual(['A','B']);resolvers.j1();await wait();expect(started).toEqual(['j1','j3','j2'])});
 it('supports explicit per-channel concurrency without globally blocking other channels',async()=>{const done:Record<string,()=>void>={},started:string[]=[];const q=new MultiChannelUploadQueue(s=>new Promise<void>(r=>{started.push(s.jobId);done[s.jobId]=r}),3,2);q.enqueue(spec(1,'A'));q.enqueue(spec(2,'A'));q.enqueue(spec(3,'B'));await wait();expect(started).toEqual(['j1','j2','j3']);expect(q.snapshot().perChannelConcurrency).toBe(2);done.j1();done.j2();done.j3();await wait()});
 it('keeps FIFO order while allowing another channel past a busy channel',async()=>{const done:Record<string,()=>void>={},started:string[]=[];const q=new MultiChannelUploadQueue(s=>new Promise<void>(r=>{started.push(s.jobId);done[s.jobId]=r}),2);q.enqueue(spec(1,'A'));q.enqueue(spec(2,'A'));q.enqueue(spec(3,'B'));q.enqueue(spec(4,'C'));await wait();expect(started).toEqual(['j1','j3']);done.j3();await wait();expect(started).toEqual(['j1','j3','j4']);done.j1();await wait();expect(started).toEqual(['j1','j3','j4','j2'])});
 it('freezes channel/profile/file identity at submission',async()=>{let captured:ImmutableUploadJob|undefined;let release!:()=>void;const q=new MultiChannelUploadQueue(s=>new Promise<void>(r=>{captured=s;release=r}),1);const mutable:any=spec(1,'Beta Room','profile-fixture-alpha');q.enqueue(mutable);mutable.channelId='Quartz Harbor';mutable.profileId='profile-lost';mutable.filePath='/evil.mp4';mutable.tags.push('changed');await wait();expect(captured?.channelId).toBe('Beta Room');expect(captured?.profileId).toBe('profile-fixture-alpha');expect(captured?.filePath).toBe('/1.mp4');expect(captured?.tags).toEqual(['x']);release()});
 it('scopes active fingerprint duplicates to channel while keeping project identity global',async()=>{let release!:()=>void;const q=new MultiChannelUploadQueue(()=>new Promise<void>(r=>release=r),1);const a=spec(1,'A');q.enqueue(a);expect(q.hasDuplicate({...spec(2,'A'),fingerprint:a.fingerprint})).toBe(true);expect(q.hasDuplicate({...spec(3,'B'),fingerprint:a.fingerprint})).toBe(false);expect(q.hasDuplicate({...spec(4,'C'),projectId:a.projectId})).toBe(true);release();await wait()});
 it('keeps credentials isolated across simultaneous channels and UI-like switching',async()=>{const seen:Array<[string,string,string]>=[];const q=new MultiChannelUploadQueue(async s=>{seen.push([s.jobId,s.channelId,s.profileId])},2);q.enqueue(spec(1,'Beta Room','profile-fixture-alpha'));q.enqueue(spec(2,'Quartz Harbor','profile-lost'));await wait();await wait();expect(seen).toContainEqual(['j1','Beta Room','profile-fixture-alpha']);expect(seen).toContainEqual(['j2','Quartz Harbor','profile-lost'])});
 it('allows safe removal only while queued',async()=>{let release!:()=>void;const q=new MultiChannelUploadQueue(()=>new Promise<void>(r=>release=r),1);q.enqueue(spec(1,'A'));q.enqueue(spec(2,'B'));await wait();expect(q.removeQueued('j1')).toBe(false);expect(q.removeQueued('j2')).toBe(true);expect(q.snapshot().queued).toHaveLength(0);release()});
 it('waits for the exact submitted batch and returns every terminal failure beyond recent UI limits',async()=>{const q=new MultiChannelUploadQueue(async s=>{throw new Error(`boom-${s.jobId}`)},4);const ids:string[]=[];for(let i=1;i<=25;i++)ids.push(q.enqueue(spec(i,`C${i}`)).queueId);const rows=await q.waitForEntries(ids);expect(rows).toHaveLength(25);expect(rows.every(x=>x.state==='FAILED')).toBe(true);expect(rows.map(x=>x.spec.jobId)).toContain('j25')});
 it('restores queued/running work after restart as fail-closed paused entries',async()=>{
  let durable:unknown,release!:()=>void;
  const persistence={load:()=>durable,save:(value:unknown)=>{durable=JSON.parse(JSON.stringify(value))}};
  const first=new MultiChannelUploadQueue(()=>new Promise<void>(r=>release=r),1,1,{persistence});
  first.enqueue(spec(1,'A'));first.enqueue(spec(2,'B'));await wait();
  expect(first.snapshot().running).toHaveLength(1);expect(first.snapshot().queued).toHaveLength(1);
  const restartedExecutor=vi.fn(async()=>{}),restarted=new MultiChannelUploadQueue(restartedExecutor,1,1,{persistence});
  expect(restarted.snapshot().paused.map(x=>x.spec.jobId)).toEqual(['j1','j2']);
  expect(restartedExecutor).not.toHaveBeenCalled();
  expect(restarted.hasDuplicate(spec(1,'A'))).toBe(true);
  expect(restarted.resumePaused('j1')).toBe(true);await wait();
  expect(restartedExecutor).toHaveBeenCalledTimes(1);
  release()
 });
 it('pauses quota failures without losing the immutable queue payload',async()=>{
  const q=new MultiChannelUploadQueue(async()=>{throw new Error('UPLOAD_QUEUE_QUOTA_RECHECK_FAILED')},1,1,{pauseOnError:error=>String(error).includes('QUOTA_RECHECK')});
  const entry=q.enqueue(spec(1,'A')),settled=q.waitForEntries([entry.queueId]);await wait();await wait();
  expect(q.snapshot().paused).toHaveLength(1);
  expect(q.snapshot().paused[0].spec.jobId).toBe('j1');
  expect(q.snapshot().recent).toHaveLength(0);
  expect((await settled)[0].state).toBe('PAUSED')
 });
 it('rejects corrupt and duplicate durable entries during recovery',()=>{
  const good={queueId:'q1',spec:spec(1,'A'),state:'RUNNING',submittedSequence:5};
  const persistence={load:()=>({version:1,entries:[good,{...good,queueId:'q2',submittedSequence:6},{queueId:'bad',spec:{},submittedSequence:7}]}),save:()=>{}};
  const q=new MultiChannelUploadQueue(async()=>{},1,1,{persistence});
  expect(q.snapshot().paused).toHaveLength(1);
  expect(q.snapshot().paused[0].queueId).toBe('q1')
 });
 it('fails closed before executor start when durable enqueue cannot be written',async()=>{
  const executor=vi.fn(async()=>{}),q=new MultiChannelUploadQueue(executor,1,1,{persistence:{load:()=>undefined,save:()=>{throw new Error('disk full')}}});
  expect(()=>q.enqueue(spec(1,'A'))).toThrow(/UPLOAD_QUEUE_PERSIST_FAILED/);
  await wait();expect(executor).not.toHaveBeenCalled();expect(q.snapshot().queued).toHaveLength(0)
 });
});
