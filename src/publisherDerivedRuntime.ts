import {create} from 'zustand';
import {useApp} from './store';
import {readyRows,useLiveInventory} from './renderInventoryRuntime';
import {normalizeRenderPath} from './renderScanClassifier';
import {publisherInventoryJobs,publisherReadyPathSet} from './publisherInventoryReconcile';
import {classifyUploadState,type CanonicalUploadState} from './storageLifecycle';
import type {VideoJob} from './types';

export type PublisherDerivedCounts={NEW:number;ON_YOUTUBE:number;PROCESSING:number;VERIFY_REQUIRED:number;ERRORS:number;ALL:number};
export type PublisherDerivedFilters={
 new:VideoJob[];youtube:VideoJob[];processing:VideoJob[];verify:VideoJob[];errors:VideoJob[];all:VideoJob[];
};
export type PublisherChannelDerived={
 jobs:VideoJob[];
 uploadStateById:Map<string,CanonicalUploadState>;
 selectableJobs:VideoJob[];
 selectableJobIds:Set<string>;
 filters:PublisherDerivedFilters;
 counts:PublisherDerivedCounts;
 inventoryReady:boolean;
};
type PublisherDerivedState={byChannel:Record<string,PublisherChannelDerived>;revision:number};

const EMPTY_COUNTS:PublisherDerivedCounts={NEW:0,ON_YOUTUBE:0,PROCESSING:0,VERIFY_REQUIRED:0,ERRORS:0,ALL:0};
export const EMPTY_PUBLISHER_DERIVED:PublisherChannelDerived={
 jobs:[],uploadStateById:new Map(),selectableJobs:[],selectableJobIds:new Set(),
 filters:{new:[],youtube:[],processing:[],verify:[],errors:[],all:[]},counts:EMPTY_COUNTS,inventoryReady:false
};

function buildPublisherDerived():Record<string,PublisherChannelDerived>{
 const app=useApp.getState(),snapshots=useLiveInventory.getState().snapshots;
 const grouped=new Map<string,VideoJob[]>();
 for(const job of app.jobs){
  const rows=grouped.get(job.channelId);
  if(rows)rows.push(job);else grouped.set(job.channelId,[job])
 }
 const out:Record<string,PublisherChannelDerived>={};
 for(const [channelId,raw] of grouped){
  const jobs=raw.slice().sort((a,b)=>a.number-b.number);
  const uploadStateById=new Map<string,CanonicalUploadState>();
  const youtube:VideoJob[]=[],processing:VideoJob[]=[],verify:VideoJob[]=[],errors:VideoJob[]=[];
  const counts:PublisherDerivedCounts={NEW:0,ON_YOUTUBE:0,PROCESSING:0,VERIFY_REQUIRED:0,ERRORS:0,ALL:jobs.length};
  for(const job of jobs){
   const state=classifyUploadState(job,app.uploadHistory);uploadStateById.set(job.id,state);
   if(state==='NEW')counts.NEW++;
   else if(state==='READY'||state==='UPLOAD_ACCEPTED'){counts.ON_YOUTUBE++;youtube.push(job)}
   else if(state==='YOUTUBE_PROCESSING'||state==='QUEUED'||state==='UPLOADING'){counts.PROCESSING++;processing.push(job)}
   else if(state==='VERIFY_REQUIRED'){counts.VERIFY_REQUIRED++;verify.push(job)}
   else if(state==='UPLOAD_FAILED'||state==='PROCESSING_FAILED'||state==='REJECTED'||state==='REMOTE_MISSING'||state==='SOURCE_MISSING'){counts.ERRORS++;errors.push(job)}
  }
  const snapshot=snapshots[channelId];
  let selectableJobs:VideoJob[]=[];
  const inventoryReady=Boolean(snapshot?.folderState==='ONLINE'&&snapshot.rows&&snapshot.result);
  if(inventoryReady&&snapshot?.rows&&snapshot.result){
   const physicalReady=readyRows(snapshot.rows,jobs);
   const readyPaths=publisherReadyPathSet(physicalReady,snapshot.result.root);
   selectableJobs=publisherInventoryJobs({jobs,channelId,readyPhysicalPaths:readyPaths})
    .filter(job=>uploadStateById.get(job.id)==='NEW'&&readyPaths.has(normalizeRenderPath(job.finalPath||'')));
  }
  const selectableJobIds=new Set(selectableJobs.map(j=>j.id));
  out[channelId]={
   jobs,uploadStateById,selectableJobs,selectableJobIds,counts,inventoryReady,
   filters:{new:selectableJobs,youtube,processing,verify,errors,all:jobs}
  }
 }
 return out
}

export const usePublisherDerived=create<PublisherDerivedState>(()=>({byChannel:buildPublisherDerived(),revision:1}));

function refreshPublisherDerived(){
 usePublisherDerived.setState(s=>({byChannel:buildPublisherDerived(),revision:s.revision+1}))
}
useApp.subscribe((state,previous)=>{
 if(state.jobs===previous.jobs&&state.uploadHistory===previous.uploadHistory)return;
 refreshPublisherDerived()
});
useLiveInventory.subscribe((state,previous)=>{
 if(state.snapshots===previous.snapshots)return;
 refreshPublisherDerived()
});
