import type {ImportedMetadata} from './metadata';
import type {VideoJob} from './types';
import {useApp} from './store';

export type PublishScheduleMode='file'|'daily'|'2/2'|'3/1';
export type PublishTimeSource='file'|'common'|'youtube';
export type PublishWorkspaceDraft={channelId:string;selectedIds:string[];rows:ImportedMetadata[];docx:boolean;thumbs:string[];allowMissingThumbs:boolean;allowDuplicate:boolean;scheduleMode:PublishScheduleMode;scheduleTimeSource:PublishTimeSource;scheduleStartDate:string;scheduleTime:string;updatedAt:string};
const KEY='vyron:youtube-publish-workspaces:v2',ACTIVE='vyron:youtube-publish-active-channel:v2',RECENT='vyron:youtube-recent-channels:v1',ACTIVE_EVENT='vyron:youtube-active-channel';
const empty=(channelId:string):PublishWorkspaceDraft=>({channelId,selectedIds:[],rows:[],docx:false,thumbs:[],allowMissingThumbs:false,allowDuplicate:false,scheduleMode:'file',scheduleTimeSource:'common',scheduleStartDate:'',scheduleTime:'',updatedAt:new Date(0).toISOString()});
function all():Record<string,PublishWorkspaceDraft>{try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return x&&typeof x==='object'?x:{}}catch{return{}}}
function cleanRow(x:any):ImportedMetadata{
 const boundJobId=String(x?.boundJobId||'').trim()||undefined,metadataImportedAt=String(x?.metadataImportedAt||'').trim()||undefined;
 return{number:Number.isFinite(+x?.number)?+x.number:undefined,channel:x?.channel||undefined,title:x?.title||undefined,description:x?.description||undefined,tags:Array.isArray(x?.tags)?x.tags.map(String):undefined,publishAt:x?.publishAt||undefined,publishTime:x?.publishTime||undefined,publishTimezone:x?.publishTimezone||undefined,publishUtcOffsetMinutes:Number.isFinite(+x?.publishUtcOffsetMinutes)?+x.publishUtcOffsetMinutes:undefined,source:String(x?.source||'saved-draft'),metadataImportedAt,metadataLegacyPersisted:Boolean(x?.metadataLegacyPersisted||(!boundJobId&&!metadataImportedAt)),metadataBindingIssue:x?.metadataBindingIssue==='METADATA_CHANNEL_MISMATCH'||x?.metadataBindingIssue==='METADATA_GENERATION_STALE'?x.metadataBindingIssue:undefined,boundChannelId:String(x?.boundChannelId||'').trim()||undefined,boundChannelName:String(x?.boundChannelName||'').trim()||undefined,boundJobId,boundSourceGenerationKey:String(x?.boundSourceGenerationKey||'').trim()||undefined,boundSourceFingerprint:String(x?.boundSourceFingerprint||'').trim()||undefined,boundSourceFileSize:Number.isFinite(+x?.boundSourceFileSize)?+x.boundSourceFileSize:undefined}
}
function userRowShape(x:ImportedMetadata){return{number:x.number,channel:x.channel,title:x.title,description:x.description,tags:x.tags,publishAt:x.publishAt,publishTime:x.publishTime,publishTimezone:x.publishTimezone,publishUtcOffsetMinutes:x.publishUtcOffsetMinutes,source:x.source}}
function sameUserRows(a:ImportedMetadata[],b:ImportedMetadata[]){try{return JSON.stringify(a.map(userRowShape))===JSON.stringify(b.map(userRowShape))}catch{return false}}
function normalizeChannel(value?:string){return String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')}
function generationStartedAt(job:VideoJob){const created=Date.parse(job.createdAt||''),modified=Number(job.currentSourceModifiedAt||0);return Math.max(Number.isFinite(created)?created:0,Number.isFinite(modified)?modified:0)}
function clearBinding(row:ImportedMetadata):ImportedMetadata{return{...row,metadataLegacyPersisted:false,metadataBindingIssue:undefined,boundChannelId:undefined,boundChannelName:undefined,boundJobId:undefined,boundSourceGenerationKey:undefined,boundSourceFingerprint:undefined,boundSourceFileSize:undefined}}
function bindRows(channelId:string,rows:ImportedMetadata[],selectedIds:string[]):ImportedMetadata[]{
 if(!channelId||!selectedIds.length||!rows.length)return rows;
 const state=useApp.getState(),channel=state.channels.find(x=>x.id===channelId),selectedSet=new Set(selectedIds),jobs=state.jobs.filter(j=>j.channelId===channelId&&selectedSet.has(j.id)).sort((a,b)=>a.number-b.number);
 if(!channel||!jobs.length)return rows;
 return rows.map((row,index):ImportedMetadata=>{
  const job=(row.number!=null?jobs.find(j=>j.number===row.number):undefined)||jobs[index];if(!job)return row;
  const explicit=normalizeChannel(row.channel),channelMatch=!explicit||explicit===normalizeChannel(channel.id)||explicit===normalizeChannel(channel.name);
  if(row.boundJobId&&row.boundJobId!==job.id)return{...row,metadataBindingIssue:'METADATA_GENERATION_STALE'};
  const importedAt=Date.parse(row.metadataImportedAt||''),generationAt=generationStartedAt(job);
  if(!row.boundJobId&&(!Number.isFinite(importedAt)||(generationAt>0&&importedAt+1000<generationAt)))return{...row,metadataLegacyPersisted:!Number.isFinite(importedAt)||row.metadataLegacyPersisted,metadataBindingIssue:'METADATA_GENERATION_STALE'};
  const staleGeneration=Boolean(
   (row.boundSourceGenerationKey&&job.sourceGenerationKey&&row.boundSourceGenerationKey!==job.sourceGenerationKey)||
   (row.boundSourceFingerprint&&job.currentSourceFingerprint&&row.boundSourceFingerprint.toLowerCase()!==job.currentSourceFingerprint.toLowerCase())||
   (row.boundSourceFileSize!=null&&job.currentSourceFileSize!=null&&Number(row.boundSourceFileSize)!==Number(job.currentSourceFileSize))
  );
  const metadataBindingIssue:ImportedMetadata['metadataBindingIssue']=staleGeneration?'METADATA_GENERATION_STALE':channelMatch?undefined:'METADATA_CHANNEL_MISMATCH';
  return{...row,metadataLegacyPersisted:false,metadataBindingIssue,boundChannelId:channel.id,boundChannelName:channel.name,boundJobId:job.id,boundSourceGenerationKey:job.sourceGenerationKey,boundSourceFingerprint:job.currentSourceFingerprint,boundSourceFileSize:job.currentSourceFileSize};
 })
}
function writeWorkspace(channelId:string,next:PublishWorkspaceDraft){const rows=all();rows[channelId]=next;try{localStorage.setItem(KEY,JSON.stringify(rows))}catch{}return next}
export function loadPublishWorkspace(channelId:string):PublishWorkspaceDraft{if(!channelId)return empty('');const x=all()[channelId];if(!x)return empty(channelId);return{channelId,selectedIds:Array.isArray(x.selectedIds)?x.selectedIds.map(String):[],rows:Array.isArray(x.rows)?x.rows.map(cleanRow):[],docx:Boolean(x.docx),thumbs:Array.isArray(x.thumbs)?x.thumbs.map(String):[],allowMissingThumbs:Boolean(x.allowMissingThumbs),allowDuplicate:Boolean(x.allowDuplicate),scheduleMode:(['daily','2/2','3/1'].includes(String(x.scheduleMode))?String(x.scheduleMode):'file') as PublishScheduleMode,scheduleTimeSource:(x.scheduleTimeSource==='file'?'file':x.scheduleTimeSource==='youtube'?'youtube':'common') as PublishTimeSource,scheduleStartDate:String(x.scheduleStartDate||''),scheduleTime:String(x.scheduleTime||''),updatedAt:x.updatedAt||new Date(0).toISOString()}}
export function savePublishWorkspace(channelId:string,draft:Partial<PublishWorkspaceDraft>){
 if(!channelId)return loadPublishWorkspace('');
 const prev=loadPublishWorkspace(channelId),now=new Date().toISOString(),incomingRows=Array.isArray(draft.rows)?draft.rows:prev.rows,rowsChanged=Array.isArray(draft.rows)&&!sameUserRows(incomingRows,prev.rows);
 let nextRows=rowsChanged?incomingRows.map(row=>({...clearBinding(row),metadataImportedAt:now})):incomingRows.map(row=>({...row}));
 const selectedIds=Array.isArray(draft.selectedIds)?draft.selectedIds.map(String):prev.selectedIds;
 nextRows=bindRows(channelId,nextRows,selectedIds);
 const next:PublishWorkspaceDraft={...prev,...draft,channelId,selectedIds,rows:nextRows,updatedAt:now};
 return writeWorkspace(channelId,next)
}
export function retirePublishWorkspaceDraft(prev:PublishWorkspaceDraft,jobId:string,updatedAt=new Date().toISOString()):PublishWorkspaceDraft{
 if(!jobId)return prev;
 return{...prev,selectedIds:prev.selectedIds.filter(id=>id!==jobId),rows:prev.rows.filter(row=>row.boundJobId!==jobId),updatedAt}
}
export function retireCompletedWorkspaceMetadata(channelId:string,jobId:string){
 if(!channelId||!jobId)return loadPublishWorkspace(channelId);
 return writeWorkspace(channelId,retirePublishWorkspaceDraft(loadPublishWorkspace(channelId),jobId))
}
export function clearPublishWorkspace(channelId:string){const rows=all();delete rows[channelId];try{localStorage.setItem(KEY,JSON.stringify(rows))}catch{}return empty(channelId)}
export function loadActivePublishChannel(){try{return localStorage.getItem(ACTIVE)||''}catch{return''}}
export function loadRecentPublishChannels(){try{const x=JSON.parse(localStorage.getItem(RECENT)||'[]');return Array.isArray(x)?x.map(String).filter(Boolean).slice(0,5):[]}catch{return[]}}
export function saveActivePublishChannel(channelId:string){if(!channelId)return;try{localStorage.setItem(ACTIVE,channelId);const recent=[channelId,...loadRecentPublishChannels().filter(id=>id!==channelId)].slice(0,5);localStorage.setItem(RECENT,JSON.stringify(recent))}catch{}if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(ACTIVE_EVENT,{detail:{channelId}}))}
export function subscribeActivePublishChannel(listener:(channelId:string)=>void){if(typeof window==='undefined')return()=>{};const onActive=(event:Event)=>{const id=(event as CustomEvent<{channelId?:string}>).detail?.channelId||loadActivePublishChannel();listener(id)};const onStorage=(event:StorageEvent)=>{if(event.key===ACTIVE)listener(event.newValue||'')};window.addEventListener(ACTIVE_EVENT,onActive);window.addEventListener('storage',onStorage);return()=>{window.removeEventListener(ACTIVE_EVENT,onActive);window.removeEventListener('storage',onStorage)}}