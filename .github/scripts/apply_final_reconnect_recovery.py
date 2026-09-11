#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1])

# 1) Human-readable missing-token errors.
p=root/'src/errorCenter.ts'
s=p.read_text()
marker="if(s.includes('oauth_refresh_token_required'))"
if marker not in s:
    anchor=" if(s.includes('invalid_grant')||s.includes('token')&&s.includes('expired')||s.includes('oauth')&&(s.includes('401')||s.includes('unauthor')))"
    if anchor not in s: raise SystemExit('errorCenter OAuth anchor not found')
    insert=" if(s.includes('oauth_refresh_token_required'))return{code:'OAUTH_REFRESH_TOKEN_REQUIRED',title:'Google не вернул refresh token',message:'Google не вернул refresh token. Повторите подключение.',detail,retryable:true,action:'reconnect'};\n if(s.includes('refresh_token_missing')||s.includes('refresh_token отсутствует')||s.includes('refresh token отсутствует'))return{code:'REFRESH_TOKEN_MISSING',title:'Требуется повторное подключение YouTube',message:'Данные канала сохранены. Нужно только снова войти в Google.',detail,retryable:true,action:'reconnect'};\n"
    s=s.replace(anchor,insert+anchor)
p.write_text(s)

# 2) Keep resolved OAuth errors in history storage, but remove them from ACTIVE Error Center.
(root/'src/errorHistory.ts').write_text(r'''export type ErrorStage='selection'|'metadata'|'schedule'|'preflight'|'upload-init'|'upload-transfer'|'youtube-insert'|'metadata-apply'|'schedule-apply'|'verification';
export type ErrorHistoryMeta={errorCode?:string;videoId?:string;filePath?:string;stage?:ErrorStage;profileId?:string;channelId?:string};
export type ErrorHistoryItem={id:string;title:string;message:string;technicalDetail?:string;errorCode?:string;videoId?:string;filePath?:string;stage?:ErrorStage;profileId?:string;channelId?:string;createdAt:number;resolvedAt?:number;resolvedBy?:string};
const KEY='vyron:error-history:v1',EVENT='vyron:error-history-change';
function load():ErrorHistoryItem[]{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x.filter(x=>x?.id&&x?.title).slice(-200):[]}catch{return[]}}
function save(rows:ErrorHistoryItem[]){try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-200)));window.dispatchEvent(new Event(EVENT))}catch{}}
export function appendErrorHistory(title:string,message='',technicalDetail='',meta:ErrorHistoryMeta={}){const row:ErrorHistoryItem={id:crypto.randomUUID(),title,message,technicalDetail:technicalDetail||undefined,errorCode:meta.errorCode,videoId:meta.videoId,filePath:meta.filePath,stage:meta.stage,profileId:meta.profileId,channelId:meta.channelId,createdAt:Date.now()};save([...load(),row]);return row}
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
''')

# 3) Pure mapping / queue logic used by the UI and targeted tests.
(root/'src/authRecoveryFinalCore.ts').write_text(r'''export type FinalAuthStatus='CONNECTED'|'RECONNECT REQUIRED'|'CONNECTING'|'VALIDATING'|'WRONG CHANNEL'|'FAILED';
export type RecoveryChannelLike={id:string;name:string;youtubeProfileId?:string;youtubeChannelId?:string};
export type RecoveryProfileLike={id:string;channelId?:string;channelTitle?:string;preferredBrowser?:string};
export type RecoveryInventoryLike={profile_uuid:string;refresh_token_account?:string;refresh_token_read?:string};
export type RecoveryTransient={status:FinalAuthStatus;detail?:string};
export type FinalRecoveryRow={profileId:string;profile?:RecoveryProfileLike;channels:RecoveryChannelLike[];expectedChannelId?:string;status:FinalAuthStatus;detail:string;stale:boolean;duplicate:boolean;conflict:boolean};

export function buildFinalRecoveryRows(channels:RecoveryChannelLike[],profiles:RecoveryProfileLike[],inventory:RecoveryInventoryLike[],transient:Record<string,RecoveryTransient>={}){
 const inv=new Map(inventory.map(x=>[x.profile_uuid,x])),byProfile=new Map<string,RecoveryChannelLike[]>();
 for(const c of channels){if(c.youtubeProfileId){const a=byProfile.get(c.youtubeProfileId)||[];a.push(c);byProfile.set(c.youtubeProfileId,a)}}
 const duplicateIds=new Set<string>();const byYoutube=new Map<string,string[]>();
 for(const p of profiles){if(!p.channelId)continue;const a=byYoutube.get(p.channelId)||[];a.push(p.id);byYoutube.set(p.channelId,a)}
 for(const ids of byYoutube.values())if(ids.length>1)ids.forEach(x=>duplicateIds.add(x));
 return profiles.map(profile=>{
  const mapped=byProfile.get(profile.id)||[],stale=mapped.length===0,duplicate=duplicateIds.has(profile.id);
  const expectedIds=new Set<string>();if(profile.channelId)expectedIds.add(profile.channelId);for(const c of mapped)if(c.youtubeChannelId)expectedIds.add(c.youtubeChannelId);
  const conflict=expectedIds.size>1,expectedChannelId=expectedIds.size===1?[...expectedIds][0]:undefined,forced=transient[profile.id];
  if(forced)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:forced.status,detail:forced.detail||forced.status,stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(stale)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'FAILED',detail:'OAuth profile не привязан ни к одному текущему каналу. Данные не удалены.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(duplicate)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'FAILED',detail:'Обнаружены duplicate OAuth profiles для одного YouTube channel_id. Автоматический reconnect заблокирован.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(conflict)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'FAILED',detail:'Внутри одного OAuth profile обнаружены разные expected channel_id. Автоматический reconnect заблокирован.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(!expectedChannelId)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'FAILED',detail:'У профиля нет ожидаемого YouTube channel_id. Сначала требуется безопасная привязка mapping.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  const key=inv.get(profile.id),connected=key?.refresh_token_account==='PRESENT'&&key?.refresh_token_read==='PASS';
  return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:connected?'CONNECTED':'RECONNECT REQUIRED',detail:connected?'Refresh token сохранён и читается из Keychain.':'Данные канала сохранены. Нужно только снова войти в Google.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
 })
}
export function channelsWithoutProfile(channels:RecoveryChannelLike[],profiles:RecoveryProfileLike[]){const ids=new Set(profiles.map(x=>x.id));return channels.filter(c=>!c.youtubeProfileId||!ids.has(c.youtubeProfileId))}
export function reconnectQueue(rows:FinalRecoveryRow[]){return rows.filter(x=>x.status==='RECONNECT REQUIRED')}
export function nextReconnectProfileId(rows:FinalRecoveryRow[],afterProfileId?:string){const q=reconnectQueue(rows);if(!q.length)return undefined;if(!afterProfileId)return q[0].profileId;const all=rows.map(x=>x.profileId),start=all.indexOf(afterProfileId);for(let i=1;i<=all.length;i++){const id=all[(Math.max(start,0)+i)%all.length];if(q.some(x=>x.profileId===id))return id}return q[0].profileId}
export function reconnectFailure(error:unknown):{status:'WRONG CHANNEL'|'FAILED';message:string}{const raw=String(error??'');const low=raw.toLowerCase();if(low.includes('wrong_channel'))return{status:'WRONG CHANNEL',message:raw.replace(/^.*WRONG_CHANNEL:\s*/i,'')||'Авторизован другой YouTube канал.'};if(low.includes('oauth_refresh_token_required')||low.includes('google не вернул refresh token'))return{status:'FAILED',message:'Google не вернул refresh token. Повторите подключение.'};return{status:'FAILED',message:raw.replace(/^Error:\s*/i,'')||'Подключение не завершено.'}}
''')

# 4) Replace Recovery Center with mass existing-profile reconnect UI.
(root/'src/AuthRecoveryCenter.tsx').write_text(r'''import React,{useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {api} from './api';
import {useApp} from './store';
import type {YoutubeProfile} from './types';
import {isOAuthMissingErrorText,resolveOAuthMissingErrors} from './errorHistory';
import {notifyError,notifySuccess,notifyWarning} from './notificationCenter';
import {buildFinalRecoveryRows,channelsWithoutProfile,nextReconnectProfileId,reconnectFailure,reconnectQueue,type FinalAuthStatus,type RecoveryTransient} from './authRecoveryFinalCore';

type Inventory={enumeration_status:string;profiles:Array<{profile_uuid:string;refresh_token_account?:string;refresh_token_read?:string}>};
const badge=(s:FinalAuthStatus)=>s==='CONNECTED'?'✓ CONNECTED':s==='RECONNECT REQUIRED'?'↻ RECONNECT REQUIRED':s==='CONNECTING'?'… CONNECTING':s==='VALIDATING'?'… VALIDATING':s==='WRONG CHANNEL'?'⚠ WRONG CHANNEL':'✕ FAILED';

export function AuthRecoveryCenter(){
 const channels=useApp(x=>x.channels),jobs=useApp(x=>x.jobs),patchJob=useApp(x=>x.patchJob);
 const [profiles,setProfiles]=useState<YoutubeProfile[]>([]),[inventory,setInventory]=useState<Inventory>({enumeration_status:'PASS',profiles:[]}),[busy,setBusy]=useState(''),[focus,setFocus]=useState(''),[transient,setTransient]=useState<Record<string,RecoveryTransient>>({}),[loaded,setLoaded]=useState(false);
 const initialTotal=useRef<number|undefined>(undefined),completed=useRef(0);
 async function load(){const [p,i]=await Promise.all([api.youtubeProfiles(),invoke<Inventory>('security_oauth_inventory')]);setProfiles(p);setInventory(i);setLoaded(true);const base=buildFinalRecoveryRows(channels,p,i.profiles,{});const q=reconnectQueue(base);if(initialTotal.current===undefined)initialTotal.current=q.length;if(!focus&&q[0])setFocus(q[0].profileId);return{profiles:p,inventory:i,rows:base}}
 useEffect(()=>{void load().catch(e=>notifyError('Не удалось открыть восстановление каналов',String(e),{persistError:false}))},[]);
 const rows=useMemo(()=>buildFinalRecoveryRows(channels,profiles,inventory.profiles,transient),[channels,profiles,inventory,transient]),queue=useMemo(()=>reconnectQueue(rows),[rows]),unmapped=useMemo(()=>channelsWithoutProfile(channels,profiles),[channels,profiles]);
 const connected=rows.filter(x=>x.status==='CONNECTED').length,errors=rows.filter(x=>x.status==='FAILED'||x.status==='WRONG CHANNEL').length+unmapped.length,target=(focus&&queue.find(x=>x.profileId===focus))||queue[0];
 async function reconnect(profileId:string){if(busy)return;const row=rows.find(x=>x.profileId===profileId);if(!row||row.status!=='RECONNECT REQUIRED')return;setBusy(profileId);setFocus(profileId);setTransient(x=>({...x,[profileId]:{status:'CONNECTING',detail:'Откройте Google и подтвердите нужный аккаунт/канал.'}}));const timer=window.setTimeout(()=>setTransient(x=>({...x,[profileId]:{status:'VALIDATING',detail:'Проверяю refresh token и expected YouTube channel_id до сохранения.'}})),1200);
  try{
   const browser=row.profile?.preferredBrowser||'default';
   await invoke('youtube_oauth_reconnect_existing',{profileId,browser});
   window.clearTimeout(timer);
   const fresh=await invoke<Inventory>('security_oauth_inventory');setInventory(fresh);
   const kp=fresh.profiles.find(x=>x.profile_uuid===profileId);
   if(kp?.refresh_token_account!=='PRESENT'||kp?.refresh_token_read!=='PASS')throw new Error('KEYCHAIN_READBACK_FAILED_AFTER_RECONNECT');
   const localIds=row.channels.map(c=>c.id),youtubeIds=row.channels.map(c=>c.youtubeChannelId||'').filter(Boolean);
   for(const j of jobs)if(localIds.includes(j.channelId)&&isOAuthMissingErrorText(j.error))patchJob(j.id,{error:undefined});
   resolveOAuthMissingErrors(profileId,[...localIds,...youtubeIds,row.expectedChannelId||''].filter(Boolean));
   completed.current+=1;setTransient(x=>({...x,[profileId]:{status:'CONNECTED',detail:'refresh_token stored • Keychain readback PASS • token refresh PASS • channel_id PASS'}}));
   notifySuccess('YouTube снова подключён',`${row.channels.map(c=>c.name).join(', ')} • существующий Profile UUID сохранён.`);
   const p=await api.youtubeProfiles();setProfiles(p);const base=buildFinalRecoveryRows(channels,p,fresh.profiles,{});const next=nextReconnectProfileId(base,profileId);setFocus(next||'');window.setTimeout(()=>setTransient(x=>{const n={...x};delete n[profileId];return n}),500);
  }catch(e){window.clearTimeout(timer);const f=reconnectFailure(e);setTransient(x=>({...x,[profileId]:{status:f.status,detail:f.message}}));if(f.status==='WRONG CHANNEL')notifyWarning('Авторизован другой YouTube канал',f.message);else notifyError('Переподключение не завершено',f.message,{persistError:false})}finally{setBusy('')}}
 const total=initialTotal.current??queue.length,currentNo=Math.min(total,completed.current+1);
 return <section className="settingsCard authRecoveryCenter"><div className="panelHead"><div><small>EXISTING PROFILE RE-AUTH • SAFE RECOVERY</small><h3>Восстановление каналов</h3><p>Каналы, расписания, SEO и Production data не пересоздаются. Меняются только OAuth credentials существующего Profile UUID.</p></div><button className="settingsAction" onClick={()=>load()} disabled={!!busy}>Обновить статусы</button></div>
  <div className="settingsInfoGrid"><span><small>Всего каналов</small><b>{channels.length}</b></span><span><small>OAuth profiles</small><b>{profiles.length}</b></span><span><small>Подключены</small><b>{connected}</b></span><span><small>Требуют переподключения</small><b>{queue.length}</b></span><span><small>Уникальных профилей для входа</small><b>{queue.length}</b></span><span><small>Ошибки mapping/auth</small><b>{errors}</b></span></div>
  {target&&<div className="settingsCard" style={{marginTop:12}}><small>ОЧЕРЕДЬ ПЕРЕПОДКЛЮЧЕНИЯ</small><h3>Профиль {currentNo} из {Math.max(total,1)}</h3><p><b>{target.channels.map(c=>c.name).join(' • ')}</b></p><p>Profile UUID: <code>{target.profileId}</code></p><p>Expected channel_id: <code>{target.expectedChannelId||'—'}</code></p><button className="primary" disabled={!!busy} onClick={()=>reconnect(target.profileId)}>{busy===target.profileId?'Подключение…':'Переподключить следующий'}</button><p className="note">После validated success VYRON автоматически выбирает следующий missing profile. Google consent/login остаётся вашим действием.</p></div>}
  {!queue.length&&loaded&&errors===0&&<div className="successBox"><b>Восстановление завершено</b><br/>Channels: {channels.length} • OAuth profiles: {profiles.length} • Connected: {connected} • Reconnect required: 0</div>}
  <div className="recoveryProfileRows">{rows.map(r=><article key={r.profileId} className={r.status==='CONNECTED'?'good':r.status==='RECONNECT REQUIRED'?'warn':'bad'}><div><small>{r.channels.length?`${r.channels.length} channel${r.channels.length>1?'s':''}`:'STALE PROFILE'}</small><b>{r.channels.length?r.channels.map(c=>c.name).join(' • '):(r.profile?.channelTitle||'Без привязанного канала')}</b><p>Profile UUID: <code>{r.profileId}</code></p><p>Channel ID: <code>{r.expectedChannelId||'—'}</code></p><p>{r.detail}</p></div><div><strong>{badge(r.status)}</strong>{r.status==='RECONNECT REQUIRED'&&<button disabled={!!busy} onClick={()=>reconnect(r.profileId)}>Переподключить</button>}{(r.status==='WRONG CHANNEL'||r.status==='FAILED')&&!r.stale&&!r.duplicate&&!r.conflict&&r.expectedChannelId&&<button disabled={!!busy} onClick={()=>{setTransient(x=>{const n={...x};delete n[r.profileId];return n});void reconnect(r.profileId)}}>Повторить OAuth</button>}</div></article>)}</div>
  {unmapped.length>0&&<div className="errorBox"><b>Каналы без существующего OAuthProfile: {unmapped.length}</b><p>Они не включены в автоматическую очередь: новый UUID без явной необходимости не создаётся.</p>{unmapped.map(c=><p key={c.id}>{c.name} • {c.youtubeChannelId||'channel_id отсутствует'} • PROFILE UUID: {c.youtubeProfileId||'NONE'}</p>)}</div>}
 </section>
}
''')

# 5) Ensure Recovery Center is present inside Settings -> YouTube, and use requested name.
p=root/'src/SettingsOS.tsx';s=p.read_text()
if "./AuthRecoveryCenter" not in s:
    anchor="import {VYRON_RELEASE_HISTORY} from './releaseHistory';"
    if anchor not in s: raise SystemExit('Settings import anchor missing')
    s=s.replace(anchor,anchor+"\nimport {AuthRecoveryCenter} from './AuthRecoveryCenter';")
if '<AuthRecoveryCenter/>' not in s:
    anchor="{tab==='youtube'&&<div className=\"settingsStack\">"
    if anchor not in s: raise SystemExit('Settings youtube anchor missing')
    s=s.replace(anchor,anchor+'<AuthRecoveryCenter/>',1)
s=s.replace('Восстановление авторизации','Восстановление каналов')
p.write_text(s)

# 6) Targeted tests for final UX semantics / old-error resolution.
(root/'src/finalAuthRecoveryUi.test.ts').write_text(r'''import {describe,it,expect} from 'vitest';
import {humanizeError} from './errorCenter';
import {isOAuthMissingErrorText,resolveOAuthMissingRows,type ErrorHistoryItem} from './errorHistory';
import {buildFinalRecoveryRows,nextReconnectProfileId,reconnectFailure,reconnectQueue} from './authRecoveryFinalCore';

describe('final real-Mac reconnect recovery',()=>{
 it('replaces REFRESH_TOKEN_MISSING with user reconnect action',()=>{const h=humanizeError('REFRESH_TOKEN_MISSING: refresh_token отсутствует','oauth');expect(h.title).toBe('Требуется повторное подключение YouTube');expect(h.message).toContain('Данные канала сохранены');expect(h.action).toBe('reconnect')});
 it('Google callback without refresh_token is explicit failure',()=>{const h=humanizeError('OAUTH_REFRESH_TOKEN_REQUIRED','oauth');expect(h.title).toContain('Google не вернул refresh token');expect(reconnectFailure('OAUTH_REFRESH_TOKEN_REQUIRED').status).toBe('FAILED')});
 it('31 channels can map to 17 unique profiles and queue only missing profiles',()=>{const profiles=Array.from({length:17},(_,i)=>({id:`p${i}`,channelId:`UC${i}`}));const channels=Array.from({length:31},(_,i)=>({id:`c${i}`,name:`Channel ${i}`,youtubeProfileId:`p${i%17}`,youtubeChannelId:`UC${i%17}`}));const inv=profiles.map((p,i)=>({profile_uuid:p.id,refresh_token_account:i===0?'PRESENT':'ABSENT',refresh_token_read:i===0?'PASS':'NOT_RUN'}));const rows=buildFinalRecoveryRows(channels,profiles,inv);expect(rows).toHaveLength(17);expect(reconnectQueue(rows)).toHaveLength(16);expect(rows[0].status).toBe('CONNECTED');expect(rows.some(r=>r.channels.length>1)).toBe(true)});
 it('queue moves to next unique missing profile only',()=>{const channels=[{id:'c1',name:'A',youtubeProfileId:'p1',youtubeChannelId:'UC1'},{id:'c2',name:'B',youtubeProfileId:'p2',youtubeChannelId:'UC2'}],profiles=[{id:'p1',channelId:'UC1'},{id:'p2',channelId:'UC2'}],inv:any[]=[];const rows=buildFinalRecoveryRows(channels,profiles,inv);expect(nextReconnectProfileId(rows,'p1')).toBe('p2')});
 it('wrong channel stays rejected',()=>{expect(reconnectFailure('WRONG_CHANNEL: Expected UC1; Authorized UC2').status).toBe('WRONG CHANNEL')});
 it('successful reconnect resolves old active REFRESH_TOKEN_MISSING errors without deleting history row',()=>{const rows:ErrorHistoryItem[]=[{id:'1',title:'YouTube error',message:'REFRESH_TOKEN_MISSING',technicalDetail:'profile p1',createdAt:1},{id:'2',title:'Other',message:'network',createdAt:2}];const out=resolveOAuthMissingRows(rows,'p1',['UC1'],100);expect(out).toHaveLength(2);expect(out[0].resolvedAt).toBe(100);expect(out[0].resolvedBy).toContain('p1');expect(out[1].resolvedAt).toBeUndefined();expect(isOAuthMissingErrorText(out[0].message)).toBe(true)});
});
''')

print('final reconnect recovery UX patch applied')
