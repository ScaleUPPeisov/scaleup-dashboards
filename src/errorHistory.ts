export type ErrorStage='selection'|'metadata'|'schedule'|'preflight'|'reconciliation'|'upload-init'|'upload-transfer'|'youtube-insert'|'metadata-apply'|'schedule-apply'|'verification'|'updater-check'|'updater-download'|'updater-install'|'updater-relaunch';
export type ErrorHistoryMeta={errorCode?:string;videoId?:string;filePath?:string;stage?:ErrorStage;profileId?:string;channelId?:string;currentVersion?:string;targetVersion?:string;operationId?:string;rootIssueKey?:string;youtubeRequestSent?:boolean;videosInsertSent?:boolean;videoIdReceivedThisAttempt?:boolean;operationPhase?:string};
export type ErrorHistoryItem={id:string;title:string;message:string;technicalDetail?:string;errorCode?:string;videoId?:string;filePath?:string;stage?:ErrorStage;profileId?:string;channelId?:string;currentVersion?:string;targetVersion?:string;operationId?:string;rootIssueKey?:string;youtubeRequestSent?:boolean;videosInsertSent?:boolean;videoIdReceivedThisAttempt?:boolean;operationPhase?:string;createdAt:number;resolvedAt?:number;resolvedBy?:string};
const KEY='vyron:error-history:v1',EVENT='vyron:error-history-change';
function load():ErrorHistoryItem[]{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x.filter(x=>x?.id&&x?.title).slice(-200):[]}catch{return[]}}
function save(rows:ErrorHistoryItem[]){try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-200)));window.dispatchEvent(new Event(EVENT))}catch{}}
function errorIdentity(title:string,message:string,technicalDetail:string,meta:ErrorHistoryMeta){
 if(meta.rootIssueKey)return`root:${meta.rootIssueKey}`;
 if(meta.operationId)return`op:${meta.operationId}`;
 return['err',meta.errorCode||'',meta.stage||'',meta.profileId||'',meta.channelId||'',meta.videoId||'',meta.filePath||'',title,message,technicalDetail].join('|');
}
export function appendErrorHistory(title:string,message='',technicalDetail='',meta:ErrorHistoryMeta={}){
 const rows=load(),identity=errorIdentity(title,message,technicalDetail,meta),existing=rows.slice().reverse().find(x=>!x.resolvedAt&&errorIdentity(x.title,x.message,x.technicalDetail||'',x)===identity);
 if(existing)return existing;
 const row:ErrorHistoryItem={id:crypto.randomUUID(),title,message,technicalDetail:technicalDetail||undefined,errorCode:meta.errorCode,videoId:meta.videoId,filePath:meta.filePath,stage:meta.stage,profileId:meta.profileId,channelId:meta.channelId,currentVersion:meta.currentVersion,targetVersion:meta.targetVersion,operationId:meta.operationId,rootIssueKey:meta.rootIssueKey,youtubeRequestSent:meta.youtubeRequestSent,videosInsertSent:meta.videosInsertSent,videoIdReceivedThisAttempt:meta.videoIdReceivedThisAttempt,operationPhase:meta.operationPhase,createdAt:Date.now()};save([...rows,row]);return row
}
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

export function isOAuthKeychainErrorText(value:unknown){const s=String(value??'').toLocaleLowerCase('ru-RU');return s.includes('keychain_access_denied_cached')||s.includes('keychain_interaction_required')||s.includes('keychain_auth_failed')||s.includes('keychain_user_canceled')||s.includes('oauth credential precheck failed')}
export function resolveOAuthKeychainErrors(profileId:string,now=Date.now()){
 const p=String(profileId||'').toLowerCase();
 save(load().map(row=>{
  if(row.resolvedAt||!isOAuthKeychainErrorText([row.errorCode,row.title,row.message,row.technicalDetail].filter(Boolean).join(' ')))return row;
  if(row.profileId&&String(row.profileId).toLowerCase()!==p)return row;
  return {...row,resolvedAt:now,resolvedBy:`oauth-keychain-recovered:${profileId}`};
 }))
}
export function resolveStatisticsCredentialErrors(profileIds:string[]=[],now=Date.now()){
 const ids=new Set(profileIds.filter(Boolean).map(x=>String(x).toLowerCase()));
 save(load().map(row=>{
  if(row.resolvedAt)return row;
  const statsCredential=row.rootIssueKey?.startsWith('oauth-keychain-batch:')||row.errorCode==='KEYCHAIN_ACCESS_DENIED'&&row.stage==='preflight';
  if(!statsCredential)return row;
  if(row.profileId&&ids.size&&!ids.has(String(row.profileId).toLowerCase()))return row;
  return {...row,resolvedAt:now,resolvedBy:'statistics-oauth-recovered'};
 }))
}
export function subscribeErrorHistory(cb:()=>void){if(typeof window==='undefined')return()=>{};window.addEventListener(EVENT,cb);window.addEventListener('storage',cb);return()=>{window.removeEventListener(EVENT,cb);window.removeEventListener('storage',cb)}}
