import {beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {cleanupEligibleUpload,markHistoryTrashed,recordVerifiedUpload,updateUploadProcessing} from './storageLifecycle';
import {appendErrorHistory,clearErrorHistory,readErrorHistory} from './errorHistory';
import {MultiChannelUploadQueue,type ImmutableUploadJob} from './uploadQueue';
import type {UploadHistoryRecord,VideoJob} from './types';

const read=(p:string)=>readFileSync(p,'utf8');
const mem=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>mem.has(k)?mem.get(k)!:null,setItem:(k:string,v:string)=>void mem.set(k,String(v)),
 removeItem:(k:string)=>void mem.delete(k),clear:()=>mem.clear(),key:(i:number)=>[...mem.keys()][i]??null,get length(){return mem.size}
}});
if(typeof globalThis.window==='undefined')Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>true,addEventListener:()=>{},removeEventListener:()=>{}}});
if(typeof globalThis.CustomEvent==='undefined')Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:class{detail:any;constructor(_n:string,i?:any){this.detail=i?.detail}}});

const history=(state:UploadHistoryRecord['processingState']='UPLOAD_ACCEPTED'):UploadHistoryRecord=>({
 id:'h1',jobId:'j1',channelId:'c1',profileId:'p1',youtubeChannelId:'UC1',youtubeVideoId:'yt1',
 localFilePath:'/workspace/VIDEO_001.mp4',originalFilename:'VIDEO_001.mp4',uploadedAt:'2026-09-20T00:00:00Z',
 fileSize:100,sha256:'a'.repeat(64),publishAt:'2026-09-21T00:00:00Z',status:'UPLOADED',fingerprintProofSource:'UPLOAD_TIME',proofSchemaVersion:1,fingerprintCapturedAt:'2026-09-20T00:00:00Z',sourceGenerationKeyAtUpload:`c1:${'a'.repeat(64)}:100`,uploadOperationId:'upload:j1',processingState:state,sourceLifecycle:'PRESENT',remoteExists:true
});
const job:VideoJob={id:'j1',channelId:'c1',number:1,folder:'/workspace/VIDEO_001',status:'SCHEDULED',createdAt:'2026-09-20T00:00:00Z',tracksCount:10,minTracks:10,title:'x',description:'',tags:[],finalPath:'/workspace/VIDEO_001.mp4',uploadFingerprint:'a'.repeat(64),currentSourceFingerprint:'a'.repeat(64),currentSourceFileSize:100,sourceGenerationKey:`c1:${'a'.repeat(64)}:100`,youtubeVideoId:'yt1',storageLifecycle:'UPLOADED'};
const spec=(n:number):ImmutableUploadJob=>({jobId:`j${n}`,projectId:`p${n}`,localVideoIdentity:`id-${n}`,videoNumber:n,channelId:`c${n}`,channelName:`C${n}`,profileId:`profile-${n}`,filePath:`/workspace/${n}.mp4`,fingerprint:String(n).padStart(64,'a'),fileSize:100,modifiedAt:1,publishAt:'2030-01-01T00:00:00Z',title:'x',description:'',tags:[],categoryId:'10',quotaOperations:[{method:'videos.insert',count:1}],allowDuplicate:false,submittedAt:'2026-09-20T00:00:00Z'});

describe('VYRON 2.1.15 RC3 critical stability contracts',()=>{
 beforeEach(()=>{mem.clear();clearErrorHistory()});

 it('never treats metadata-only client secret presence as OAuth READY',()=>{
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('google_config_operational_status_value');
  expect(y).toContain('"oauthReady":configured&&operational');
  expect(y).toContain('NEEDS_SECURE_STORAGE_REPAIR');
  expect(y).toContain('KEYCHAIN_ACCESS_DENIED_CACHED');
  expect(y).toContain('secretOperational');
 });

 it('explicit credentials import persists and verifies the encrypted vault while Keychain remains fallback',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const sec=read('src-tauri/src/security.rs');
  const block=y.split('pub fn youtube_google_config_import(',2)[1]?.split('#[tauri::command]',2)[0]||'';
  expect(block).toContain('oauth_vault::set_global_client(&app,&client_id,&client_secret)');
  expect(block).toContain('oauth_vault::global_client_secret(&app,&client_id)');
  expect(block).toContain('OAUTH_VAULT_READBACK_FAILED');
  expect(block).toContain('canonical_set_secret(&new_account,&client_secret)');
  expect(block).toContain('google_config_operational_status_value');
  expect(sec).toContain('if let Ok(mut d)=canonical_denied().lock(){d.remove(account);}');
 });

 it('profile metadata is loaded independently from global config and orphan mappings stay visible',()=>{
  const ui=read('src/AccountsPage.tsx');
  expect(ui).toContain('p=await api.youtubeProfiles();setProfiles(p)');
  expect(ui).toContain('setConfig(await api.youtubeGoogleConfig())');
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('"reason":"ORPHAN_MAPPING"');
  expect(ui).toContain('orphanMappings');
  expect(ui).toContain('Метаданные OAuth-профилей не найдены, но каналы сохранены');
  const p=ui.indexOf('p=await api.youtubeProfiles();setProfiles(p)'),c=ui.indexOf('setConfig(await api.youtubeGoogleConfig())');
  expect(p).toBeGreaterThan(0);expect(c).toBeGreaterThan(p);
 });

 it('reconciliation diagnostics never read secrets or auto-delete orphan records',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const a=y.indexOf('pub fn youtube_oauth_reconciliation_diagnostics');
  const b=y.indexOf('#[tauri::command]',a+20);
  const block=y.slice(a,b);
  expect(block).toContain('"keychainSecretsRead":false');
  expect(block).toContain('"secretValuesIncluded":false');
  expect(block).not.toContain('canonical_get_secret');
  expect(block).not.toContain('profiles.retain');
  expect(block).not.toContain('profiles.clear');
 });

 it('inventory authentication preflight occurs before YouTube request accounting',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const a=y.indexOf('pub async fn youtube_list_existing_videos'),b=y.indexOf('emit_youtube_api_request',a);
  expect(a).toBeGreaterThan(0);expect(b).toBeGreaterThan(a);expect(y.slice(a,b)).toContain('valid_access_token');
 });

 it('accepted upload is persisted separately from processing READY and duplicate retry is blocked',()=>{
  const q=read('src/uploadQueueRuntime.ts');
  expect(q).toContain("processingState:'UPLOAD_ACCEPTED'");
  expect(q).toContain('UPLOAD_ALREADY_HAS_VIDEO_ID');
  expect(q).toContain("processingState:'PROCESSING_UNKNOWN'");
  expect(q).toContain('youtubeVideoProcessingStatus');
 });

 it('cleanup candidates require READY, exact job path/fingerprint and never include processing/failed rows',()=>{
  expect(cleanupEligibleUpload(history('UPLOAD_ACCEPTED'),job)).toBe(false);
  expect(cleanupEligibleUpload(history('YOUTUBE_PROCESSING'),job)).toBe(false);
  expect(cleanupEligibleUpload(history('PROCESSING_FAILED'),job)).toBe(false);
  expect(cleanupEligibleUpload(history('READY'),job)).toBe(true);
  expect(cleanupEligibleUpload(history('READY'),{...job,finalPath:'/workspace/other.mp4'})).toBe(false);
  expect(cleanupEligibleUpload({...history('READY'),sha256:'b'.repeat(64)},job)).toBe(false);
 });

 it('TRASHED history is written only for READY records',()=>{
  expect(markHistoryTrashed([history('YOUTUBE_PROCESSING')],'j1')[0].trashedAt).toBeUndefined();
  expect(markHistoryTrashed([history('READY')],'j1')[0].trashedAt).toBeTruthy();
 });

 it('local cleanup uses OS Trash and never permanent deletion in the cleanup command',()=>{
  const d=read('src-tauri/src/local_delete.rs').split('#[cfg(test)]',1)[0];
  expect(d).toContain('trash::delete');
  expect(d).not.toContain('fs::remove_file');
  expect(d).not.toContain('fs::remove_dir_all');
 });

 it('processing state and videoId remain persisted across store saves/restarts',()=>{
  const types=read('src/types.ts'),store=read('src/store.ts'),monitor=read('src/UploadProcessingMonitor.tsx');
  expect(types).toContain('processingState?:YoutubeProcessingState');
  expect(types).toContain('youtubeVideoId?:string');
  expect(store).toContain('jobs:s.jobs');
  expect(store).toContain('uploadHistory:s.uploadHistory');
  expect(monitor).toContain("x.processingState!=='READY'");
 });

 it('a failed queue item cannot turn the whole batch into success',async()=>{
  const q=new MultiChannelUploadQueue(async x=>{if(x.jobId==='j2')throw new Error('controlled');},2);
  const ids=[q.enqueue(spec(1)).queueId,q.enqueue(spec(2)).queueId,q.enqueue(spec(3)).queueId];
  const rows=await q.waitForEntries(ids);
  expect(rows.filter(x=>x.state==='SUCCEEDED')).toHaveLength(2);
  expect(rows.filter(x=>x.state==='FAILED')).toHaveLength(1);
 });

 it('Error Center deduplicates one stable root issue instead of multiplying it',()=>{
  appendErrorHistory('Google OAuth требует восстановления','secret unavailable','KEYCHAIN_ACCESS_DENIED_CACHED',{rootIssueKey:'google.client_secret'});
  appendErrorHistory('Google OAuth требует восстановления','another surface','KEYCHAIN_ACCESS_DENIED_CACHED',{rootIssueKey:'google.client_secret'});
  expect(readErrorHistory()).toHaveLength(1);
 });

 it('processing updates preserve uploaded identity and only READY gets readyAt',()=>{
  const row=history('UPLOAD_ACCEPTED');const {id:_id,status:_status,...input}=row;
  const base=recordVerifiedUpload([],input);
  const ready=updateUploadProcessing(base,'j1',{processingState:'READY',processingCheckedAt:'2026-09-20T01:00:00Z',readyAt:'2026-09-20T01:00:00Z'});
  expect(ready[0].youtubeVideoId).toBe('yt1');expect(ready[0].processingState).toBe('READY');expect(ready[0].readyAt).toBeTruthy();
 });

 it('no OAuth secret values are placed in Google config status/reconciliation payloads',()=>{
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('"secretValuesIncluded":false');
  expect(y).not.toContain('"clientSecret":c.client_secret');
  expect(y).not.toContain('"refreshToken":');
 });
});
