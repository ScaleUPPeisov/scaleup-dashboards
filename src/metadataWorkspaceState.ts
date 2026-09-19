import {tenantStorageKey} from './tenantStorage';
import type {ImportedMetadata} from './metadata';
import type {YoutubeExistingVideo} from './types';
import type {ExistingFilter} from './youtubeWorkflow';

export type MetadataTarget='future'|'youtube';
export type MetadataDraft={version:1;updatedAt:string;target:MetadataTarget;rows:ImportedMetadata[];paste:string;order:'oldest'|'newest';filter:ExistingFilter;docxStrict:boolean;start:string;cadence:number;scheduleMode?:'auto'|'manual';selectedVideos:YoutubeExistingVideo[]};
export type MetadataChangedField='title'|'description'|'tags'|'publish date/time'|'privacy/status'|'category';
export type MetadataOperationStatus='success'|'partial'|'failed';
export type MetadataDraftSaveStatus='saved'|'unsaved'|'restored'|'completed';
export function metadataDraftStatusLabel(status:MetadataDraftSaveStatus,hasDraft:boolean){if(status==='unsaved')return 'Сохранение…';if(status==='restored')return 'Черновик восстановлен';if(status==='completed')return 'Операция завершена • черновик очищен';return hasDraft?'Черновик сохранён':'Нет сохранённого черновика'}
export type MetadataOperationHistory={
  version:1;operationId:string;at:string;channelId:string;channelName:string;selectedVideoCount:number;changedVideoCount:number;
  changedFields:MetadataChangedField[];plannedQuota?:number;actualQuota?:number;status:MetadataOperationStatus;backupPath?:string;
  metadataOk:number;total:number;scheduleOk:number;scheduleTotal:number;failed:number;pausedByQuota?:boolean;
};

const draftKey=(channelId:string)=>tenantStorageKey(`vyron:metadata-draft:v1:${channelId}`);
const historyKey=(channelId:string)=>tenantStorageKey(`vyron:metadata-history:v1:${channelId}`);
const allowedFields=new Set<MetadataChangedField>(['title','description','tags','publish date/time','privacy/status','category']);

function cleanRow(x:any):ImportedMetadata{return{
  number:Number.isFinite(+x?.number)?+x.number:undefined,channel:x?.channel||undefined,title:x?.title||undefined,description:x?.description||undefined,
  tags:Array.isArray(x?.tags)?x.tags.map(String):undefined,publishAt:x?.publishAt||undefined,publishTime:x?.publishTime||undefined,
  publishTimezone:x?.publishTimezone||undefined,publishUtcOffsetMinutes:Number.isFinite(+x?.publishUtcOffsetMinutes)?+x.publishUtcOffsetMinutes:undefined,
  source:String(x?.source||'saved-draft')
}}
function cleanVideo(x:any):YoutubeExistingVideo{return{
  id:String(x?.id||''),position:Number.isFinite(+x?.position)?+x.position:0,title:String(x?.title||''),description:String(x?.description||''),
  tags:Array.isArray(x?.tags)?x.tags.map(String):[],categoryId:String(x?.categoryId||'10'),publishedAt:x?.publishedAt||undefined,
  privacyStatus:String(x?.privacyStatus||'private'),publishAt:x?.publishAt||undefined,duration:x?.duration||undefined,
  views:Number.isFinite(+x?.views)?+x.views:undefined,likes:Number.isFinite(+x?.likes)?+x.likes:undefined,comments:Number.isFinite(+x?.comments)?+x.comments:undefined,
  selected:true,channelId:x?.channelId||undefined,verified:Boolean(x?.verified)
}}
function cleanDraft(x:any):MetadataDraft|undefined{
  if(!x||x.version!==1)return;
  return{version:1,updatedAt:String(x.updatedAt||new Date(0).toISOString()),target:x.target==='future'?'future':'youtube',rows:Array.isArray(x.rows)?x.rows.map(cleanRow):[],paste:String(x.paste||''),order:x.order==='oldest'?'oldest':'newest',filter:['private','scheduled','public','unlisted','all'].includes(String(x.filter))?x.filter:'private',docxStrict:Boolean(x.docxStrict),start:String(x.start||''),cadence:Math.max(1,Math.floor(Number(x.cadence)||2)),scheduleMode:x.scheduleMode==='manual'?'manual':'auto',selectedVideos:Array.isArray(x.selectedVideos)?x.selectedVideos.map(cleanVideo).filter((v:YoutubeExistingVideo)=>v.id):[]}
}
export function loadMetadataDraft(channelId:string):MetadataDraft|undefined{if(!channelId)return;try{return cleanDraft(JSON.parse(localStorage.getItem(draftKey(channelId))||'null'))}catch{return}}
export function saveMetadataDraft(channelId:string,draft:MetadataDraft){if(!channelId)return;const clean=cleanDraft(draft);if(!clean)return;try{localStorage.setItem(draftKey(channelId),JSON.stringify(clean))}catch{}}
export function clearMetadataDraft(channelId:string){if(!channelId)return;try{localStorage.removeItem(draftKey(channelId))}catch{}}

function cleanHistory(x:any):MetadataOperationHistory|undefined{
  if(!x||!x.operationId||!x.channelId)return;
  const status:MetadataOperationStatus=x.status==='success'||x.status==='partial'?'success'===x.status?'success':'partial':'failed';
  return{version:1,operationId:String(x.operationId),at:String(x.at||new Date(0).toISOString()),channelId:String(x.channelId),channelName:String(x.channelName||x.channelId),selectedVideoCount:Math.max(0,Number(x.selectedVideoCount)||0),changedVideoCount:Math.max(0,Number(x.changedVideoCount)||0),changedFields:Array.isArray(x.changedFields)?x.changedFields.filter((v:any)=>allowedFields.has(v)):[],plannedQuota:Number.isFinite(+x.plannedQuota)?+x.plannedQuota:undefined,actualQuota:Number.isFinite(+x.actualQuota)?+x.actualQuota:undefined,status,backupPath:x.backupPath?String(x.backupPath):undefined,metadataOk:Math.max(0,Number(x.metadataOk)||0),total:Math.max(0,Number(x.total)||0),scheduleOk:Math.max(0,Number(x.scheduleOk)||0),scheduleTotal:Math.max(0,Number(x.scheduleTotal)||0),failed:Math.max(0,Number(x.failed)||0),pausedByQuota:Boolean(x.pausedByQuota)}
}
export function loadMetadataHistory(channelId:string):MetadataOperationHistory[]{if(!channelId)return[];try{const x=JSON.parse(localStorage.getItem(historyKey(channelId))||'[]');return Array.isArray(x)?x.map(cleanHistory).filter(Boolean) as MetadataOperationHistory[]:[]}catch{return[]}}
export function appendMetadataHistory(entry:MetadataOperationHistory){const clean=cleanHistory(entry);if(!clean)return[];const next=[clean,...loadMetadataHistory(clean.channelId).filter(x=>x.operationId!==clean.operationId)].slice(0,100);try{localStorage.setItem(historyKey(clean.channelId),JSON.stringify(next))}catch{}return next}
