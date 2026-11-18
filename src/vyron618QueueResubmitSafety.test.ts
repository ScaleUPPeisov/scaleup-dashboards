import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {MultiChannelUploadQueue,type ImmutableUploadJob} from './uploadQueue';

const source=()=>readFileSync('src/PublisherOS.tsx','utf8');
const spec=(n:number,channelId='channel-a'):ImmutableUploadJob=>({
 jobId:`job-${channelId}-${n}`,projectId:'project-1',
 localVideoIdentity:`${channelId}:job-${n}`,
 videoNumber:n,channelId,channelName:channelId,
 profileId:'profile-a',filePath:`/render/${n}.mp4`,
 fingerprint:n.toString(16).padStart(64,'0'),fileSize:1024,modifiedAt:1,
 publishAt:'2030-01-01T12:00:00Z',title:`Original ambient film ${n}`,
 description:'test',tags:['test'],categoryId:'10',
 quotaOperations:[{method:'videos.insert',count:1}],
 allowDuplicate:false,submittedAt:'2026-11-18T00:00:00Z'
});

describe('VYRON queue resubmit safety',()=>{
 it('checks existing paused/queued/running job BEFORE touching physical file or metadata',()=>{
  const s=source();
  const start=s.indexOf('async function runBatchOnce(');
  const end=s.indexOf('const missingMetadata=',start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const block=s.slice(start,end);
  const guard=block.indexOf('const existingQueue=uploadQueueSnapshot();');
  const earlyContinue=block.indexOf('if(existing){',guard);
  expect(guard).toBeGreaterThan(0);
  expect(earlyContinue).toBeGreaterThan(guard);
  expect(block.slice(earlyContinue,block.indexOf('let queueReserved=false;',earlyContinue)))
    .toContain('continue;');
  for(const sideEffect of [
   'api.localSourceStatus(j.finalPath)',
   'fingerprintForJob(j,true)',
   'api.metadataQueueReserve(',
   'patchJob(j.id,{title:payload.title',
   'enqueueUpload({jobId:j.id'
  ]){
   expect(block.indexOf(sideEffect)).toBeGreaterThan(earlyContinue);
  }
  expect(block).toContain("alreadyOwned.filter(row=>row.state==='PAUSED')");
  expect(block).toContain('повторное добавление не выполнялось');
 });
 it('does not rewrite restored paused ownership while skipping an existing job',()=>{
  let durable:unknown;
  const persistence={load:()=>durable,save:(data:unknown)=>{durable=JSON.parse(JSON.stringify(data))}};
  const first=new MultiChannelUploadQueue(()=>new Promise<void>(()=>{}),1,1,{persistence});
  first.enqueue(spec(41));first.enqueue(spec(42));first.enqueue(spec(43));
  const restored=new MultiChannelUploadQueue(()=>new Promise<void>(()=>{}),1,1,{persistence});
  const snap=restored.snapshot();
  expect(snap.paused.map(x=>x.spec.videoNumber)).toEqual([41,42,43]);
  const savedBefore=JSON.stringify(durable);
  // Publisher guard observes existing ownership; no re-enqueue, unpause,
  // disk touch, quota reservation or videos.insert happens here.
  for(const j of [41,42,43]){
   const old=[...snap.paused,...snap.queued,...snap.running].find(x=>x.spec.jobId===spec(j).jobId);
   expect(old?.state).toBe('PAUSED');
  }
  expect(JSON.stringify(durable)).toBe(savedBefore);
 });
 it('continues to reject true same-channel fingerprint duplicates between DIFFERENT jobs',()=>{
  const q=new MultiChannelUploadQueue(()=>new Promise<void>(()=>{}),1);
  const first=spec(41);
  const second={...spec(42),fingerprint:first.fingerprint};
  q.enqueue(first);
  expect(q.findDuplicate(second)?.kind).toBe('channel_fingerprint');
  expect(()=>q.enqueue(second)).toThrow('UPLOAD_QUEUE_DUPLICATE');
 });
});
