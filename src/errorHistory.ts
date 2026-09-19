import {tenantStorageKey} from './tenantStorage';
export type ErrorStage='selection'|'metadata'|'schedule'|'preflight'|'upload-init'|'upload-transfer'|'youtube-insert'|'metadata-apply'|'schedule-apply'|'verification'|'updater-check'|'updater-download'|'updater-install'|'updater-relaunch';
export type ErrorHistoryMeta={errorCode?:string;videoId?:string;filePath?:string;stage?:ErrorStage;profileId?:string;channelId?:string;currentVersion?:string;targetVersion?:string};
export type ErrorHistoryItem={id:string;title:string;message:string;technicalDetail?:string;errorCode?:string;videoId?:string;filePath?:string;stage?:ErrorStage;profileId?:string;channelId?:string;currentVersion?:string;targetVersion?:string;createdAt:number;resolvedAt?:number;resolvedBy?:string};
const KEY='vyron:error-history:v1',EVENT='vyron:error-history-change';
function load():ErrorHistoryItem[]{try{const x=JSON.parse(localStorage.getItem(tenantStorageKey(KEY))||'[]');return Array.isArray(x)?x.filter(x=>x?.id&&x?.title).slice(-200):[]}catch{return[]}}
function save(rows:ErrorHistoryItem[]){try{localStorage.setItem(tenantStorageKey(KEY),JSON.stringify(rows.slice(-200)));window.dispatchEvent(new Event(EVENT))}catch{}}
export function appendErrorHistory(title:string,message='',technicalDetail='',meta:ErrorHistoryMeta={}){const row:ErrorHistoryItem={id:crypto.randomUUID(),title,message,technicalDetail:technicalDetail||undefined,errorCode:meta.errorCode,videoId:meta.videoId,filePath:meta.filePath,stage:meta.stage,profileId:meta.profileId,channelId:meta.channelId,currentVersion:meta.currentVersion,targetVersion:meta.targetVersion,createdAt:Date.now()};save([...load(),row]);return row}
export function readErrorHistory(){return load().filter(x=>!x.resolvedAt).sort((a,b)=>b.createdAt-a.createdAt)}
export function readResolvedErrorHistory(){return load().filter(x=>!!x.resolvedAt).sort((a,b)=>(b.resolvedAt||0)-(a.resolvedAt||0))}
export function removeErrorHistory(id:string){save(load().filter(x=>x.id!==id))}
export function clearErrorHistory(){save([])}
export function isOAuthMissingErrorText(value:unknown){const s=String(value??'').toLocaleLowerCase('ru-RU');return s.includes('refresh_token_missing')||s.includes('refresh_token отсутствует')||s.includes('refresh token отсутствует')||s.includes('требуется повторное подключение youtube')}
export function resolveOAuthMissingRows(rows:ErrorHistoryItem[],profileId:string,channelIds:string[]=[],now=Date.now()){
 const p=String(profileId||'').toLowerCase(),ids=new Set(channelIds.filter(Boolean).map(x=>String(x).toLowerCase()));
 return rows.map(row=>{
  if(row.resolvedAt||!isOAuthMissingErrorText([row.errorCode,row.title,row.message,row.technicalDetail].filter(Boolean).join(' ')))return row;
  if(row.profileId&&String(row.profileId).toLowerCase()!==p)return row;
  if(row.channelId&&ids.size&&!ids.has(String(row.channelId).toLowerCase()))return row;
  return {...row,resolvedAt:now,resolvedBy:`oauth-reconnect:${profileId}`};
 })
}
export function resolveOAuthMissingErrors(profileId:string,channelIds:string[]=[]){save(resolveOAuthMissingRows(load(),profileId,channelIds))}
export function subscribeErrorHistory(cb:()=>void){if(typeof window==='undefined')return()=>{};window.addEventListener(EVENT,cb);window.addEventListener('storage',cb);return()=>{window.removeEventListener(EVENT,cb);window.removeEventListener('storage',cb)}}
