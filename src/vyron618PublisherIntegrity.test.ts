import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import type {UploadHistoryRecord,VideoJob} from './types';

const monitorFixture=vi.hoisted(()=>{
 let resolveStatus:((value:any)=>void)|undefined;
 const status=vi.fn(()=>new Promise<any>(resolve=>{resolveStatus=resolve}));
 const state:any={
  uploadHistory:[],projectLifecycle:{},jobs:[],channels:[],
  replaceUploadHistory(rows:any[]){state.uploadHistory=rows},
  patchJob:vi.fn(),patchProjectLifecycle:vi.fn()
 };
 return{state,status,resolve(value:any){resolveStatus?.(value)},reset(){resolveStatus=undefined;status.mockClear();state.uploadHistory=[];state.projectLifecycle={};state.patchJob.mockClear();state.patchProjectLifecycle.mockClear()}}
});
vi.mock('./api',()=>({api:{youtubeVideoProcessingStatus:monitorFixture.status}}));
vi.mock('./store',()=>({useApp:{getState:()=>monitorFixture.state}}));
vi.mock('./activityJournalRuntime',()=>({journalProcessingState:vi.fn()}));

import {metadataQueueRowAsImported,type MetadataQueueRecord} from './metadataQueue';
import {metadataRowForJob,resolvedUploadMetadata} from './publisherMetadata';
import {validateFinalUploadPayload} from './publisherIntegrity';
import {retirePublishWorkspaceDraft,type PublishWorkspaceDraft} from './publishWorkspaceState';
import {MultiChannelUploadQueue,type ImmutableUploadJob} from './uploadQueue';
import {processingMonitorCandidates,runUploadProcessingMonitorCycle} from './UploadProcessingMonitor';

const job=(id='job-b',number=1):VideoJob=>({id,channelId:'channel-a',number,folder:'/projects/video',status:'READY_UPLOAD',createdAt:'2026-10-05T10:00:00.000Z',tracksCount:10,minTracks:10,title:'Beautiful Autumn Jazz',description:'description',tags:['jazz'],currentSourceFingerprint:'bbb',currentSourceFileSize:200,sourceGenerationKey:'channel-a:bbb:200'});
const queueSpec=(n:number,title=`Autumn Jazz ${n}`):ImmutableUploadJob=>({jobId:`job-${n}`,projectId:`project-${n}`,localVideoIdentity:`channel-a:job-${n}:hash-${n}`,videoNumber:n,channelId:'channel-a',channelName:'Aegean Afterglow',profileId:'profile-a',filePath:`/VIDEO_${String(n).padStart(3,'0')}.mov`,fingerprint:`${n}`.padStart(64,'b'),fileSize:200,modifiedAt:1,publishAt:'2030-01-01T00:00:00.000Z',title,description:'description',tags:['jazz'],categoryId:'10',quotaOperations:[{method:'videos.insert',count:1}],allowDuplicate:false,submittedAt:'2026-10-05T10:00:00.000Z'});
const workspace=(rows:PublishWorkspaceDraft['rows']):PublishWorkspaceDraft=>({channelId:'channel-a',selectedIds:Array.from({length:10},(_,i)=>`job-${i+1}`),rows,docx:true,thumbs:[],allowMissingThumbs:false,allowDuplicate:false,scheduleMode:'file',scheduleTimeSource:'common',scheduleStartDate:'',scheduleTime:'',updatedAt:'2026-10-05T10:00:00.000Z'});
const historyRow=(processingState:UploadHistoryRecord['processingState'],jobId='job-processing'):UploadHistoryRecord=>({id:`history-${jobId}`,jobId,channelId:'channel-a',profileId:'profile-a',youtubeVideoId:`yt-${jobId}`,localFilePath:`/${jobId}.mov`,originalFilename:`${jobId}.mov`,titleAtUpload:'Good title',uploadedAt:'2026-10-05T09:00:00.000Z',fileSize:200,sha256:'a'.repeat(64),status:'UPLOADED',processingState,processingCheckedAt:'2026-10-05T09:01:00.000Z'});

describe('VYRON 6.1.8 Publisher integrity',()=>{
 it('does not let Generation A metadata bind to a reused VIDEO number in Generation B',()=>{
  const current=job('job-generation-b');
  const stale={number:1,title:'Generation A title',source:'A.docx',boundChannelId:'channel-a',boundJobId:'job-generation-a',boundSourceGenerationKey:'channel-a:aaa:100',boundSourceFingerprint:'aaa',boundSourceFileSize:100};
  const row=metadataRowForJob([stale],current,0);
  expect(row?.metadataBindingIssue).toBe('METADATA_GENERATION_STALE');
  expect(row?.title).toBeUndefined();
  expect(()=>resolvedUploadMetadata(current,row,'2030-01-01T00:00:00.000Z')).toThrow(/METADATA_GENERATION_STALE/)
 });

 it('blocks a ten-video LOGIC batch before queue creation or executor start',()=>{
  const executor=vi.fn(async()=>{}),queue=new MultiChannelUploadQueue(executor,4);
  for(let n=1;n<=10;n++)expect(()=>queue.enqueue(queueSpec(n,'LOGIC'))).toThrow(/FINAL_TITLE_RESERVED/);
  expect(queue.snapshot().queued).toHaveLength(0);
  expect(queue.snapshot().running).toHaveLength(0);
  expect(executor).toHaveBeenCalledTimes(0)
 });

 it('validates the final row.title rather than a good job.title',()=>{
  expect(()=>resolvedUploadMetadata(job(),{number:1,title:'LOGIC',source:'bad.docx'},'2030-01-01T00:00:00.000Z')).toThrow(/FINAL_TITLE_RESERVED/)
 });

 it('blocks explicit metadata for another channel while allowing omitted CHANNEL',()=>{
  const current=job();
  const mismatch=validateFinalUploadPayload({job:current,channel:{id:'channel-a',name:'Aegean Afterglow'},payload:{title:'Valid title',description:'',tags:[]},metadata:{number:1,channel:'Rain & Roast Jazz',title:'Valid title',source:'wrong.docx',boundChannelId:'channel-a',boundChannelName:'Aegean Afterglow',boundJobId:current.id}});
  expect(mismatch.issues.map(x=>x.code)).toContain('METADATA_CHANNEL_MISMATCH');
  const omitted=validateFinalUploadPayload({job:current,channel:{id:'channel-a',name:'Aegean Afterglow'},payload:{title:'Valid title',description:'',tags:[]},metadata:{number:1,title:'Valid title',source:'ok.docx',boundChannelId:'channel-a',boundJobId:current.id}});
  expect(omitted.valid).toBe(true)
 });

 it('routes Metadata Queue through the exact same reserved-title gate',()=>{
  const record:MetadataQueueRecord={id:'m1',channelId:'channel-a',packId:'pack',sequence:1,sourceNumber:1,title:'LOGIC',description:'d',tags:['x'],status:'RESERVED',reservedJobId:'job-b',reservedVideoNumber:1,createdAt:'2026-10-05T10:00:00.000Z',reservedAt:'2026-10-05T10:01:00.000Z',sourceHash:'s',recordHash:'r'};
  const row=metadataQueueRowAsImported(record);
  expect(row.boundJobId).toBe('job-b');
  expect(()=>resolvedUploadMetadata(job('job-b'),row,'2030-01-01T00:00:00.000Z')).toThrow(/FINAL_TITLE_RESERVED/)
 });

 it('retires eight successful rows but preserves the exact two retry rows',()=>{
  const rows=Array.from({length:10},(_,i)=>({number:i+1,title:`Title ${i+1}`,source:'pack.docx',boundChannelId:'channel-a',boundJobId:`job-${i+1}`}));
  let draft=workspace(rows);
  for(let n=1;n<=8;n++)draft=retirePublishWorkspaceDraft(draft,`job-${n}`,`2026-10-05T10:${String(n).padStart(2,'0')}:00.000Z`);
  expect(draft.selectedIds).toEqual(['job-9','job-10']);
  expect(draft.rows.map(x=>x.boundJobId)).toEqual(['job-9','job-10'])
 });

 it('keeps every Publisher control represented while cold-mounting the production advanced shell',()=>{
  const shell=readFileSync(decodeURIComponent(new URL('./PublisherShell.tsx',import.meta.url).pathname),'utf8');
  const publisher=readFileSync(decodeURIComponent(new URL('./PublisherOS.tsx',import.meta.url).pathname),'utf8');
  expect(shell).toContain('data-publisher-controls="always-visible"');
  for(const label of ['Папки','Recovery','Метаданные','Обложки','Расписание','Очистка','Очистить черновик'])expect(shell).toContain(label);
  expect(publisher).toContain('function PublisherOSAdvanced');
  expect(publisher).toContain('<PublisherShell');
  expect(publisher).toContain('return <PublisherOSAdvanced activityRef={activityRef}/>');
  expect(publisher).not.toContain('PublisherOSLightController');
  expect(publisher).not.toContain('if(advancedPanel)return <PublisherOSAdvanced')
 });

 it('polls only eligible nonterminal processing rows and never READY/failed terminal rows',()=>{
  const oldNow=Date.parse('2026-10-05T10:00:00.000Z'),processing=historyRow('YOUTUBE_PROCESSING','processing'),ready=historyRow('READY','ready'),failed=historyRow('PROCESSING_FAILED','failed'),rejected=historyRow('REJECTED','rejected');
  expect(processingMonitorCandidates([processing,ready,failed,rejected],oldNow).map(x=>x.jobId)).toEqual(['processing'])
 });

 it('prevents overlapping watchdog cycles and stops polling after READY',async()=>{
  monitorFixture.reset();
  monitorFixture.state.uploadHistory=[historyRow('YOUTUBE_PROCESSING')];
  const first=runUploadProcessingMonitorCycle(),overlap=runUploadProcessingMonitorCycle();
  await Promise.resolve();
  expect(monitorFixture.status).toHaveBeenCalledTimes(1);
  monitorFixture.resolve({processingState:'READY',processingCheckedAt:'2026-10-05T10:00:00.000Z',processingStatus:'succeeded',identityVerified:true});
  await Promise.all([first,overlap]);
  expect(monitorFixture.state.uploadHistory[0].processingState).toBe('READY');
  await runUploadProcessingMonitorCycle();
  expect(monitorFixture.status).toHaveBeenCalledTimes(1)
 });

 it('blocks deterministic technical VIDEO_### placeholders without minimum-length heuristics',()=>{
  const current=job();
  expect(validateFinalUploadPayload({job:current,channel:{id:'channel-a',name:'Aegean Afterglow'},payload:{title:'VIDEO_001',description:'',tags:[]},safeMode:true}).issues.map(x=>x.code)).toContain('FINAL_TITLE_TECHNICAL_PLACEHOLDER');
  expect(validateFinalUploadPayload({job:current,channel:{id:'channel-a',name:'Aegean Afterglow'},payload:{title:'X',description:'',tags:[]},safeMode:true}).valid).toBe(true)
 });
});
