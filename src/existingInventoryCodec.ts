import type {YoutubeExistingVideo} from './types';

export type ExistingInventoryCache={
  version:1;updatedAt:string;videos:YoutubeExistingVideo[];
  baseline:Record<string,YoutubeExistingVideo>;lastUndo:YoutubeExistingVideo[];
  syncInfo:any;lastCompleteAt?:string;lastCompleteSyncInfo?:any
};
export const INVENTORY_SCHEMA_VERSION=2;

const record=(x:unknown):x is Record<string,unknown>=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const str=(x:unknown)=>typeof x==='string'&&x.trim()?x:undefined;
export function normalizeExistingVideo(value:unknown,index=0):YoutubeExistingVideo|undefined{
  if(!record(value))return;const id=str(value.id);if(!id)return;
  const num=(x:unknown)=>Number.isFinite(Number(x))?Number(x):undefined;
  return{id,position:Number.isFinite(Number(value.position))?Number(value.position):index,title:typeof value.title==='string'?value.title:'',description:typeof value.description==='string'?value.description:'',tags:Array.isArray(value.tags)?value.tags.filter((x):x is string=>typeof x==='string'):[],categoryId:typeof value.categoryId==='string'?value.categoryId:'10',publishedAt:str(value.publishedAt),privacyStatus:typeof value.privacyStatus==='string'?value.privacyStatus:'',publishAt:str(value.publishAt),thumbnail:str(value.thumbnail),duration:str(value.duration),views:num(value.views),likes:num(value.likes),comments:num(value.comments),selected:value.selected===true,channelId:str(value.channelId),verified:typeof value.verified==='boolean'?value.verified:undefined};
}
export const normalizeExistingVideos=(x:unknown)=>Array.isArray(x)?x.map(normalizeExistingVideo).filter((v):v is YoutubeExistingVideo=>Boolean(v)):[];
export function compactBaselineVideo(v:YoutubeExistingVideo):YoutubeExistingVideo{
  return{id:v.id,position:v.position,title:v.title,description:v.description,tags:[...(v.tags||[])],categoryId:v.categoryId,publishedAt:v.publishedAt,privacyStatus:v.privacyStatus,publishAt:v.publishAt,selected:false,channelId:v.channelId,verified:v.verified}
}
export function compactBaseline(videos:YoutubeExistingVideo[]){return Object.fromEntries(normalizeExistingVideos(videos).map(v=>[v.id,compactBaselineVideo(v)]))}
export function normalizeBaseline(x:unknown){
  const out:Record<string,YoutubeExistingVideo>={};if(!record(x))return out;let i=0;
  for(const [id,row] of Object.entries(x)){const v=normalizeExistingVideo(row,i++);if(v)out[id||v.id]=v}return out
}
export function normalizeSyncInfo(value:unknown){
  if(value===null)return null;if(!record(value))return null;const {videos:_videos,...rest}=value;return rest
}
const same=(a:YoutubeExistingVideo,b:YoutubeExistingVideo)=>a.title===b.title&&a.description===b.description&&JSON.stringify(a.tags||[])===JSON.stringify(b.tags||[])&&a.categoryId===b.categoryId&&a.privacyStatus===b.privacyStatus&&(a.publishAt||'')===(b.publishAt||'')&&(a.publishedAt||'')===(b.publishedAt||'');
function baselineDelta(videos:YoutubeExistingVideo[],baseline:Record<string,YoutubeExistingVideo>){
  const current=new Map(videos.map(v=>[v.id,v])),out:Record<string,YoutubeExistingVideo>={};
  for(const [id,base] of Object.entries(baseline||{})){const row=current.get(id);if(!row||!same(row,base))out[id]=compactBaselineVideo(base)}return out
}
function baselineFromDelta(videos:YoutubeExistingVideo[],delta:unknown){
  const out=compactBaseline(videos);for(const [id,row] of Object.entries(normalizeBaseline(delta)))out[id]=compactBaselineVideo(row);return out
}
export function encodeInventory(channelId:string,c:ExistingInventoryCache){
  return{schemaVersion:2,channelId,updatedAt:c.updatedAt,lastCompleteAt:c.lastCompleteAt,syncInfo:normalizeSyncInfo(c.syncInfo),lastCompleteSyncInfo:normalizeSyncInfo(c.lastCompleteSyncInfo),videos:normalizeExistingVideos(c.videos),baselineDelta:baselineDelta(c.videos,c.baseline),lastUndo:normalizeExistingVideos(c.lastUndo).map(compactBaselineVideo)}
}
export function decodeInventory(value:unknown):ExistingInventoryCache|undefined{
  if(!record(value)||value.schemaVersion!==2||typeof value.channelId!=='string'||!Array.isArray(value.videos)||!record(value.baselineDelta))return;
  const videos=normalizeExistingVideos(value.videos);
  return{version:1,updatedAt:str(value.updatedAt)||'1970-01-01T00:00:00.000Z',videos,baseline:baselineFromDelta(videos,value.baselineDelta),lastUndo:normalizeExistingVideos(value.lastUndo),syncInfo:normalizeSyncInfo(value.syncInfo),lastCompleteAt:str(value.lastCompleteAt),lastCompleteSyncInfo:normalizeSyncInfo(value.lastCompleteSyncInfo)}
}
export function decodeLegacyInventory(value:unknown):ExistingInventoryCache|undefined{
  if(!record(value)||value.version!==1)return;
  return{version:1,updatedAt:str(value.updatedAt)||'1970-01-01T00:00:00.000Z',videos:normalizeExistingVideos(value.videos),baseline:normalizeBaseline(value.baseline),lastUndo:normalizeExistingVideos(value.lastUndo),syncInfo:normalizeSyncInfo(value.syncInfo),lastCompleteAt:str(value.lastCompleteAt),lastCompleteSyncInfo:normalizeSyncInfo(value.lastCompleteSyncInfo)}
}
