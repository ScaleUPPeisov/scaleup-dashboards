import {beforeEach,describe,expect,it} from 'vitest';
import type {VideoJob} from './types';
import {useApp} from './store';
import {loadPublishWorkspace,savePublishWorkspace} from './publishWorkspaceState';
import {metadataRowForJob,resolvedUploadMetadata} from './publisherMetadata';

class MemoryStorage{
 private rows=new Map<string,string>();
 get length(){return this.rows.size}
 clear(){this.rows.clear()}
 getItem(key:string){return this.rows.get(key)??null}
 key(index:number){return[...this.rows.keys()][index]??null}
 removeItem(key:string){this.rows.delete(key)}
 setItem(key:string,value:string){this.rows.set(key,String(value))}
}
Object.defineProperty(globalThis,'localStorage',{value:new MemoryStorage(),configurable:true});
if(typeof (globalThis as any).window==='undefined')Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});

const channelId='chrome-city-radio';
const channel:any={id:channelId,name:'Chrome City Radio',enabled:true};
const hash=(n:number)=>n.toString(16).padStart(64,'a').slice(-64);
const job=(n:number):VideoJob=>({
 id:`job-${n}`,channelId,number:n,folder:`/projects/VIDEO_${String(n).padStart(3,'0')}`,
 status:'READY_UPLOAD',createdAt:'2026-10-01T00:00:00.000Z',tracksCount:10,minTracks:10,
 title:`VIDEO_${String(n).padStart(3,'0')}`,description:'',tags:[],
 currentSourceFingerprint:hash(n),currentSourceFileSize:500_000_000+n,
 currentSourceModifiedAt:Date.parse('2026-10-01T00:00:00.000Z')+n,
 sourceGenerationKey:`${channelId}:${hash(n)}:${500_000_000+n}`,
});
const jobs=Array.from({length:10},(_,i)=>job(i+2)); // VIDEO_002 .. VIDEO_011
const rows=Array.from({length:10},(_,i)=>({number:i+1,title:`SEO TITLE ${i+1}`,description:`SEO ${i+1}`,tags:[`tag${i+1}`],source:'Chrome_City_Radio_10_New_Videos.docx'}));
const selectedIds=jobs.map(x=>x.id);
const WORKSPACE_KEY='vyron:youtube-publish-workspaces:v2';

function prime(){
 localStorage.clear();
 useApp.setState({channels:[channel],jobs} as any)
}

describe('VYRON 6.1.11 physical generation metadata identity mapping',()=>{
 beforeEach(prime);

 it('maps a ten-row SEO pack positionally when publishing starts at VIDEO_002',()=>{
  const saved=savePublishWorkspace(channelId,{selectedIds,rows,docx:true});
  expect(saved.rows.map(x=>x.boundJobId)).toEqual(selectedIds);
  expect(saved.rows.map(x=>x.number)).toEqual([1,2,3,4,5,6,7,8,9,10]);
  expect(new Set(saved.rows.map(x=>x.boundJobId)).size).toBe(10);
  expect(saved.rows.at(-1)?.boundJobId).toBe('job-11');
 });

 it('VIDEO_011 receives row 10 and never requires a nonexistent row 11',()=>{
  const saved=savePublishWorkspace(channelId,{selectedIds,rows,docx:true});
  const first=metadataRowForJob(saved.rows,jobs[0],0);
  const last=metadataRowForJob(saved.rows,jobs[9],9);
  expect(first?.title).toBe('SEO TITLE 1');
  expect(first?.boundJobId).toBe('job-2');
  expect(last?.title).toBe('SEO TITLE 10');
  expect(last?.boundJobId).toBe('job-11');
  expect(last?.metadataBindingIssue).toBeUndefined();
  expect(resolvedUploadMetadata(jobs[9],last,'2030-01-01T00:00:00.000Z').title).toBe('SEO TITLE 10');
 });

 it('durable job identity wins even if metadata rows are later reordered',()=>{
  const saved=savePublishWorkspace(channelId,{selectedIds,rows,docx:true});
  const reversed=[...saved.rows].reverse();
  const last=metadataRowForJob(reversed,jobs[9],0);
  expect(last?.boundJobId).toBe('job-11');
  expect(last?.title).toBe('SEO TITLE 10');
 });

 it('reimports an identical Word pack as fresh metadata for the next physical batch',()=>{
  const first=savePublishWorkspace(channelId,{selectedIds,rows,docx:true});
  expect(first.rows[0].boundJobId).toBe('job-2');

  const nextJobs=Array.from({length:10},(_,i)=>job(i+12)); // VIDEO_012 .. VIDEO_021
  const nextIds=nextJobs.map(x=>x.id);
  useApp.setState({channels:[channel],jobs:[...jobs,...nextJobs]} as any);
  const second=savePublishWorkspace(channelId,{selectedIds:nextIds,rows:[...rows],docx:true});

  expect(second.rows.map(x=>x.boundJobId)).toEqual(nextIds);
  expect(new Set(second.rows.map(x=>x.boundJobId)).size).toBe(10);
  expect(second.rows.every(x=>!x.metadataBindingIssue)).toBe(true);
  expect(metadataRowForJob(second.rows,nextJobs[9],9)?.title).toBe('SEO TITLE 10');
 });

 it('repairs the exact 6.1.10 duplicate-binding signature on workspace load',()=>{
  const importedAt='2026-10-13T10:00:00.000Z';
  const brokenRows=rows.map((row,index)=>{
   // Old algorithm: row 1 fell back to first selected VIDEO_002, then row 2
   // matched VIDEO_002 by technical number; VIDEO_011 was never bound.
   const targetNumber=index===0?2:index+1;
   const target=jobs.find(x=>x.number===targetNumber)!;
   return{...row,metadataImportedAt,boundChannelId:channelId,boundChannelName:channel.name,boundJobId:target.id,boundSourceGenerationKey:target.sourceGenerationKey,boundSourceFingerprint:target.currentSourceFingerprint,boundSourceFileSize:target.currentSourceFileSize};
  });
  localStorage.setItem(WORKSPACE_KEY,JSON.stringify({[channelId]:{channelId,selectedIds,rows:brokenRows,docx:true,thumbs:[],allowMissingThumbs:false,allowDuplicate:false,scheduleMode:'file',scheduleTimeSource:'common',scheduleStartDate:'',scheduleTime:'',updatedAt:importedAt}}));

  const repaired=loadPublishWorkspace(channelId);
  expect(repaired.rows.map(x=>x.boundJobId)).toEqual(selectedIds);
  expect(new Set(repaired.rows.map(x=>x.boundJobId)).size).toBe(10);
  expect(metadataRowForJob(repaired.rows,jobs[9],9)?.title).toBe('SEO TITLE 10');
 });

 it('still blocks metadata from an older physical generation of the same job',()=>{
  const current=jobs[0];
  const stale={number:1,title:'OLD GENERATION',source:'old.docx',boundChannelId:channelId,boundJobId:current.id,boundSourceGenerationKey:'old-generation',boundSourceFingerprint:'b'.repeat(64),boundSourceFileSize:1};
  const selected=metadataRowForJob([stale],current,0);
  expect(selected?.metadataBindingIssue).toBe('METADATA_GENERATION_STALE');
  expect(selected?.title).toBeUndefined();
  expect(()=>resolvedUploadMetadata(current,selected,'2030-01-01T00:00:00.000Z')).toThrow(/METADATA_GENERATION_STALE/)
 });
});
