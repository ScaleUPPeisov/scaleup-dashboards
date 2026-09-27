import React,{useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {open,save} from '@tauri-apps/plugin-dialog';
import {notifyError,notifyInfo,notifySuccess,notifyWarning} from './notificationCenter';
import {api} from './api';
import type {AppState,YoutubeChannelStatistics} from './types';

type Summary={
 localChannels:number;importedChannels:number;duplicateChannels:number;newChannels:number;
 afterChannels:number;updatedChannels:number;deletedChannels:number;importedProfiles:number;
 existingProfiles:number;newProfiles:number;googleProjects:number;remapRequired:number;willDelete:number
};
type Preview={
 sourceOs:string;appVersion:string;createdAt:string;bundleUuid:string;summary:Summary;
 remap:Array<{channelId:string;channelName:string;field:string;oldPath:string}>;willDelete:number
};

const LEDGER='vyron:youtube-quota-ledger:v3';
const GUARD='vyron:youtube-quota-guard:v1';
const PLAN='vyron:youtube-quota-plan:v1';
const OP_LEDGER='vyron:youtube-operation-ledger:v1';

function readJson(key:string){
 try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}
}
function browserState(){
 return{
  quotaLedger:readJson(LEDGER),
  quotaGuard:readJson(GUARD),
  quotaPlan:readJson(PLAN),
  operationLedger:readJson(OP_LEDGER)
 };
}
function mergeLedger(local:any,imported:any){
 if(!imported)return local;
 if(!local)return imported;
 const out:any={...imported,...local,buckets:{...(imported.buckets||{}),...(local.buckets||{})},uploadProjects:{...(imported.uploadProjects||{})}};
 for(const [key,row] of Object.entries(imported.uploadProjects||{}))out.uploadProjects[key]={...(row as any)};
 for(const [key,row] of Object.entries(local.uploadProjects||{})){
  const a:any=out.uploadProjects[key]||{},b:any=row;
  const same=Boolean(a.quotaDay&&b.quotaDay&&a.quotaDay===b.quotaDay);
  out.uploadProjects[key]={
   ...a,...b,
   used:same?Math.max(Number(a.used)||0,Number(b.used)||0):(Number(b.used)||0),
   calls:same?Math.max(Number(a.calls)||0,Number(b.calls)||0):(Number(b.calls)||0),
   configuredLimit:b.configuredLimit??a.configuredLimit??null,
   limitSource:b.limitSource||a.limitSource||'default'
  };
 }
 for(const bucket of ['general','search']){
  const a=imported.buckets?.[bucket],b=local.buckets?.[bucket];
  if(a&&b&&imported.ptDate===local.ptDate){
   out.buckets[bucket]={...a,...b,used:Math.max(Number(a.used)||0,Number(b.used)||0),calls:Math.max(Number(a.calls)||0,Number(b.calls)||0)};
  }
 }
 return out;
}
function mergeOperationLedger(local:any,imported:any){
 const rows:Array<any>=[];
 const seen=new Map<string,any>();
 for(const row of [...(Array.isArray(imported)?imported:[]),...(Array.isArray(local)?local:[])]){
  if(!row?.operationId)continue;
  const key=String(row.operationId)+'|'+String(row.ptDate||'');
  const current=seen.get(key);
  if(!current){seen.set(key,row);continue}
  const next={...current,...row,buckets:{...(current.buckets||{}),...(row.buckets||{})},methods:{...(current.methods||{}),...(row.methods||{})}};
  seen.set(key,next);
 }
 for(const x of seen.values())rows.push(x);
 return rows.slice(-200);
}
function applyBrowserState(x:any){
 if(!x)return;
 try{
  const merged=mergeLedger(readJson(LEDGER),x.quotaLedger);
  if(merged)localStorage.setItem(LEDGER,JSON.stringify(merged));
 }catch{}
 try{
  const ops=mergeOperationLedger(readJson(OP_LEDGER),x.operationLedger);
  if(ops.length)localStorage.setItem(OP_LEDGER,JSON.stringify(ops));
 }catch{}
 try{if(!localStorage.getItem(GUARD)&&x.quotaGuard)localStorage.setItem(GUARD,JSON.stringify(x.quotaGuard))}catch{}
 try{if(!localStorage.getItem(PLAN)&&x.quotaPlan)localStorage.setItem(PLAN,JSON.stringify(x.quotaPlan))}catch{}
}


async function refreshYoutubeAfterImport(){
 const state:AppState=await api.loadState();
 const groups=new Map<string,Array<{localId:string;youtubeChannelId:string}>>();
 for(const channel of state.channels){
  if(!channel.youtubeProfileId||!channel.youtubeChannelId)continue;
  const rows=groups.get(channel.youtubeProfileId)||[];
  rows.push({localId:channel.id,youtubeChannelId:channel.youtubeChannelId});
  groups.set(channel.youtubeProfileId,rows);
 }
 let refreshed=0,pending=0,requests=0;
 const statsByLocal=new Map<string,YoutubeChannelStatistics>();
 const warningByLocal=new Map<string,string>();
 for(const [profileId,rows] of groups){
  for(let offset=0;offset<rows.length;offset+=50){
   const chunk=rows.slice(offset,offset+50);
   try{
    const operationId='migration-refresh-'+crypto.randomUUID();
    const result=await api.youtubeChannelStatisticsBatch(profileId,chunk.map(x=>x.youtubeChannelId),operationId);
    requests+=result.apiRequests||1;
    const byYoutube=new Map(result.items.map(x=>[String(x.channelId||''),x]));
    for(const row of chunk){
     const stat=byYoutube.get(row.youtubeChannelId);
     if(stat){statsByLocal.set(row.localId,{...stat,lastAttemptAt:new Date().toISOString(),syncWarning:undefined});refreshed++}
     else{warningByLocal.set(row.localId,'MIGRATION_REFRESH_PENDING: channel not returned by YouTube');pending++}
    }
   }catch(e){
    const message=String(e);
    for(const row of chunk){warningByLocal.set(row.localId,'MIGRATION_REFRESH_PENDING: '+message);pending++}
   }
  }
 }
 state.channels=state.channels.map(channel=>{
  const stat=statsByLocal.get(channel.id);
  if(stat)return {...channel,name:stat.channelTitle||channel.name,stats:{...(channel.stats||{}),...stat}};
  const warning=warningByLocal.get(channel.id);
  if(warning)return {...channel,stats:{...(channel.stats||{}),lastAttemptAt:new Date().toISOString(),syncWarning:warning}};
  return channel;
 });
 await api.saveState(state);
 return{refreshed,pending,requests,total:[...groups.values()].reduce((n,x)=>n+x.length,0)};
}

export function MigrationPanel(){
 const [passphrase,setPassphrase]=useState('');
 const [file,setFile]=useState('');
 const [preview,setPreview]=useState<Preview|undefined>();
 const [busy,setBusy]=useState(false);
 const strong=passphrase.length>=10;
 const counts=useMemo(()=>preview?.summary,[preview]);

 async function doExport(){
  if(!strong){notifyWarning('Пароль слишком короткий','Минимум 10 символов. Он нужен для расшифровки пакета на другом компьютере.');return}
  const date=new Date().toISOString().slice(0,10);
  const path=await save({title:'Создать пакет переноса VYRON',defaultPath:'vyron-migration-'+date+'.vyron',filters:[{name:'VYRON Migration',extensions:['vyron']}]});
  if(!path)return;
  setBusy(true);
  try{
   const r:any=await invoke('migration_export',{path,passphrase,browserState:browserState()});
   notifySuccess('Пакет переноса создан',String(r.channels)+' каналов • '+String(r.profiles)+' OAuth профилей • encrypted');
  }catch(e){notifyError('Экспорт VYRON',String(e))}
  finally{setBusy(false)}
 }

 async function chooseImport(){
  const p=await open({title:'Выбрать пакет переноса VYRON',multiple:false,filters:[{name:'VYRON Migration',extensions:['vyron']}]});
  if(typeof p==='string'){setFile(p);setPreview(undefined)}
 }

 async function doPreview(){
  if(!file||!strong)return;
  setBusy(true);
  try{
   const r=await invoke<Preview>('migration_preview',{path:file,passphrase});
   setPreview(r);
   if(r.willDelete!==0)notifyError('Импорт заблокирован','Политика VYRON требует WILL DELETE = 0.');
   else notifyInfo('План импорта готов',String(r.summary.newChannels)+' новых каналов • '+String(r.summary.duplicateChannels)+' совпадений • удалить 0');
  }catch(e){setPreview(undefined);notifyError('Проверка пакета',String(e))}
  finally{setBusy(false)}
 }

 async function doImport(){
  if(!preview||preview.willDelete!==0)return;
  setBusy(true);
  try{
   const r:any=await invoke('migration_import',{path:file,passphrase});
   applyBrowserState(r.browserState);
   notifySuccess('Миграция завершена',String(r.summary.afterChannels)+' уникальных каналов • удалено 0 • OAuth merge выполнен');
   if(r.summary.remapRequired)notifyWarning('Нужен remap папок',String(r.summary.remapRequired)+' путей относятся к другой ОС и не блокируют каналы/OAuth.');
   const refresh=await refreshYoutubeAfterImport();
   if(refresh.pending)notifyWarning('YouTube refresh частично отложен',String(refresh.refreshed)+' обновлено • '+String(refresh.pending)+' pending. Каналы не удалены.');
   else if(refresh.total)notifySuccess('YouTube post-import refresh: PASS',String(refresh.refreshed)+' каналов • API requests: '+String(refresh.requests));
   window.setTimeout(()=>location.reload(),900);
  }catch(e){notifyError('Импорт VYRON',String(e))}
  finally{setBusy(false)}
 }

 async function restore(){
  if(!window.confirm('Восстановить последний migration snapshot? Текущий импортированный state будет заменён предыдущим локальным snapshot.'))return;
  setBusy(true);
  try{
   const r:any=await invoke('migration_restore_latest');
   notifySuccess('Migration snapshot восстановлен',String(r.snapshot||''));
   window.setTimeout(()=>location.reload(),700);
  }catch(e){notifyError('Rollback migration',String(e))}
  finally{setBusy(false)}
 }

 return <div className="settingsStack">
  <section className="settingsCard">
   <small>WINDOWS ↔ macOS • ENCRYPTED</small>
   <h3>Backup & Migration</h3>
   <p>Merge, не replace: существующие Google/YouTube профили и каналы не удаляются. Каналы дедуплицируются по YouTube Channel ID, OAuth — по стабильному profile UUID. Повторный импорт идемпотентен.</p>
   <label>Пароль пакета<input type="password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} placeholder="минимум 10 символов" autoComplete="new-password"/></label>
   <div className="publishActions">
    <button className="primary" disabled={busy||!strong} onClick={doExport}>Создать пакет переноса</button>
    <button disabled={busy} onClick={chooseImport}>Выбрать пакет</button>
    <button disabled={busy||!file||!strong} onClick={doPreview}>Проверить импорт</button>
   </div>
   {file&&<p className="note mono">{file}</p>}
  </section>

  {preview&&<section className="settingsCard">
   <small>IMPORT PLAN • {preview.sourceOs.toUpperCase()} • VYRON {preview.appVersion}</small>
   <h3>До применения</h3>
   <div className="settingsInfoGrid">
    <span><small>Локально каналов</small><b>{counts?.localChannels}</b></span>
    <span><small>В пакете</small><b>{counts?.importedChannels}</b></span>
    <span><small>Уже существуют</small><b>{counts?.duplicateChannels}</b></span>
    <span><small>Будет добавлено</small><b>{counts?.newChannels}</b></span>
    <span><small>После merge</small><b>{counts?.afterChannels}</b></span>
    <span><small>OAuth profiles new</small><b>{counts?.newProfiles}</b></span>
    <span><small>Folder remap</small><b>{counts?.remapRequired}</b></span>
    <span><small>WILL DELETE</small><b>{preview.willDelete}</b></span>
   </div>
   {preview.remap.length>0&&<details className="advancedPanel"><summary>Пути другой ОС: {preview.remap.length}</summary>{preview.remap.map((x,i)=><p key={i}><b>{x.channelName||x.channelId}</b> • {x.field}<br/><span className="mono">{x.oldPath}</span></p>)}</details>}
   <div className="publishActions">
    <button className="primary" disabled={busy||preview.willDelete!==0} onClick={doImport}>Импортировать и MERGE</button>
    <button disabled={busy} onClick={restore}>Restore previous migration snapshot</button>
   </div>
   <p className="note">После commit VYRON перезагрузит локальное состояние. Статистика импортированных каналов будет обновлена через обычный контролируемый YouTube refresh. Недоступные пути к папкам не инвалидируют OAuth.</p>
  </section>}
 </div>
}
