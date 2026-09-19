import React,{useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {api,type OAuthCredentialStatesResponse} from './api';
import {useApp} from './store';
import type {YoutubeProfile} from './types';
import {isOAuthMissingErrorText,resolveOAuthMissingErrors} from './errorHistory';
import {notifyError,notifySuccess,notifyWarning} from './notificationCenter';
import {buildFinalRecoveryRows,channelsWithoutProfile,nextReconnectProfileId,reconnectFailure,reconnectQueue,type FinalAuthStatus,type RecoveryTransient} from './authRecoveryFinalCore';
import {availableReconnectBrowsers,resolveReconnectBrowser,type BrowserOption} from './reconnectBrowserChoiceCore';

const badge=(s:FinalAuthStatus)=>s==='CONNECTED'?'✓ ПОДКЛЮЧЕНО':s==='CANONICAL_PRESENT_UNVERIFIED'?'○ CREDENTIAL ГОТОВ К ПРОВЕРКЕ':s==='CLIENT SECRET REQUIRED'?'⚿ НУЖЕН OAUTH CLIENT SECRET':s==='RECONNECT REQUIRED'?'↻ ТРЕБУЕТ ПЕРЕПОДКЛЮЧЕНИЯ':s==='MISSING'?'↻ CREDENTIAL ОТСУТСТВУЕТ':s==='CONNECTING'?'… CONNECTING':s==='VALIDATING'?'… VALIDATING':s==='WRONG CHANNEL'?'⚠ WRONG CHANNEL':'✕ FAILED';

export function AuthRecoveryCenter(){
 const channels=useApp(x=>x.channels),jobs=useApp(x=>x.jobs),patchJob=useApp(x=>x.patchJob);
 const [profiles,setProfiles]=useState<YoutubeProfile[]>([]),[credentialStates,setCredentialStates]=useState<OAuthCredentialStatesResponse>({credentialSchemaVersion:2,profiles:[],secretValuesIncluded:false,youtubeApiRequests:0,keychainSecretReads:0}),[busy,setBusy]=useState(''),[focus,setFocus]=useState(''),[transient,setTransient]=useState<Record<string,RecoveryTransient>>({}),[loaded,setLoaded]=useState(false),[browserOpen,setBrowserOpen]=useState(false),[browsers,setBrowsers]=useState<BrowserOption[]>([]),[selectedBrowser,setSelectedBrowser]=useState('default'),[pendingProfileId,setPendingProfileId]=useState('');
 const initialTotal=useRef<number|undefined>(undefined),completed=useRef(0);
 async function load(){const [p,resolved]=await Promise.all([api.youtubeProfiles(),api.youtubeOauthCredentialStates()]);setProfiles(p);setCredentialStates(resolved);setLoaded(true);const base=buildFinalRecoveryRows(channels,p,resolved.profiles,{});const q=reconnectQueue(base);if(initialTotal.current===undefined)initialTotal.current=q.length;if(!focus&&q[0])setFocus(q[0].profileId);return{profiles:p,credentialStates:resolved,rows:base}}
 useEffect(()=>{void load().catch(e=>notifyError('Не удалось открыть восстановление каналов',String(e),{persistError:false}))},[]);
 const rows=useMemo(()=>buildFinalRecoveryRows(channels,profiles,credentialStates.profiles,transient),[channels,profiles,credentialStates,transient]),queue=useMemo(()=>reconnectQueue(rows),[rows]),unmapped=useMemo(()=>channelsWithoutProfile(channels,profiles),[channels,profiles]);
 const connected=rows.filter(x=>x.status==='CONNECTED').length,ready=rows.filter(x=>x.status==='CANONICAL_PRESENT_UNVERIFIED').length,secretRequired=rows.filter(x=>x.status==='CLIENT SECRET REQUIRED').length,errors=rows.filter(x=>x.status==='FAILED'||x.status==='WRONG CHANNEL').length+unmapped.length,target=(focus&&queue.find(x=>x.profileId===focus))||queue[0];
 async function reconnect(profileId:string,browserChoice?:string){if(busy)return;const row=rows.find(x=>x.profileId===profileId);if(!row||(row.status!=='RECONNECT REQUIRED'&&row.status!=='MISSING'))return;setBusy(profileId);setFocus(profileId);setTransient(x=>({...x,[profileId]:{status:'CONNECTING',detail:'Откройте Google и подтвердите нужный аккаунт/канал.'}}));const timer=window.setTimeout(()=>setTransient(x=>({...x,[profileId]:{status:'VALIDATING',detail:'Проверяю refresh token и expected YouTube channel_id до сохранения.'}})),1200);
  try{
   const browser=browserChoice||row.profile?.preferredBrowser||'default';
   localStorage.setItem('vyron:oauth-browser',browser);
   const reconnectResult=await invoke<{keychainReadback?:string}>('youtube_oauth_reconnect_existing',{profileId,browser});
   window.clearTimeout(timer);
   const fresh=await api.youtubeOauthCredentialStates();setCredentialStates(fresh);
   const resolved=fresh.profiles.find(x=>x.profileUuid===profileId);
   if(reconnectResult.keychainReadback!=='FOUND'||resolved?.credentialState!=='CONNECTED'||!resolved.canonicalRefreshPresent)throw new Error('OAUTH_STATE_VERIFY_FAILED_AFTER_RECONNECT');
   const localIds=row.channels.map(c=>c.id),youtubeIds=row.channels.map(c=>c.youtubeChannelId||'').filter(Boolean);
   for(const j of jobs)if(localIds.includes(j.channelId)&&isOAuthMissingErrorText(j.error))patchJob(j.id,{error:undefined});
   resolveOAuthMissingErrors(profileId,[...localIds,...youtubeIds,row.expectedChannelId||''].filter(Boolean));
   completed.current+=1;setTransient(x=>({...x,[profileId]:{status:'CONNECTED',detail:'refresh_token stored • Keychain readback PASS • token refresh PASS • channel_id PASS'}}));
   notifySuccess('YouTube снова подключён',`${row.channels.map(c=>c.name).join(', ')} • существующий Profile UUID сохранён.`);
   const p=await api.youtubeProfiles();setProfiles(p);const base=buildFinalRecoveryRows(channels,p,fresh.profiles,{});const next=nextReconnectProfileId(base,profileId);setFocus(next||'');window.setTimeout(()=>setTransient(x=>{const n={...x};delete n[profileId];return n}),500);
  }catch(e){window.clearTimeout(timer);const f=reconnectFailure(e);setTransient(x=>({...x,[profileId]:{status:f.status,detail:f.message}}));if(f.status==='WRONG CHANNEL')notifyWarning('Авторизован другой YouTube канал',f.message);else notifyError('Переподключение не завершено',f.message,{persistError:false})}finally{setBusy('')}}
 async function chooseBrowser(profileId:string){
  if(busy)return;
  const row=rows.find(x=>x.profileId===profileId);if(!row)return;
  try{
   const raw=await api.youtubeOauthBrowsers();const available=availableReconnectBrowsers(raw);
   const remembered=localStorage.getItem('vyron:oauth-browser')||'default';
   const initial=resolveReconnectBrowser(available,row.profile?.preferredBrowser,remembered);
   setBrowsers(available);setSelectedBrowser(initial);setPendingProfileId(profileId);setBrowserOpen(true);
  }catch{
   const fallback:BrowserOption[]=[{id:'default',label:'Браузер по умолчанию',available:true}];setBrowsers(fallback);setSelectedBrowser('default');setPendingProfileId(profileId);setBrowserOpen(true);
  }
 }
 async function confirmBrowserReconnect(){const id=pendingProfileId;if(!id)return;const browser=selectedBrowser||'default';setBrowserOpen(false);setPendingProfileId('');await reconnect(id,browser)}
 const total=initialTotal.current??queue.length,currentNo=Math.min(total,completed.current+1);
 return <section className="settingsCard authRecoveryCenter"><div className="panelHead"><div><small>EXISTING PROFILE RE-AUTH • SAFE RECOVERY</small><h3>Восстановление каналов</h3><p>Каналы, расписания, SEO и Production data не пересоздаются. Выберите существующий Profile UUID, затем браузер с нужным Google/YouTube аккаунтом. Старый OAuth Client может безопасно мигрировать на текущий OAuth Client VYRON без смены UUID и Channel ID.</p></div><button className="settingsAction" onClick={()=>load()} disabled={!!busy}>Обновить статусы</button></div>
  <div className="settingsInfoGrid"><span><small>Всего каналов</small><b>{channels.length}</b></span><span><small>OAuth profiles</small><b>{profiles.length}</b></span><span><small>Подключены</small><b>{connected}</b></span><span><small>Готовы к проверке</small><b>{ready}</b></span><span><small>Нужен OAuth Client Secret</small><b>{secretRequired}</b></span><span><small>Требуют переподключения</small><b>{queue.length}</b></span><span><small>Ошибки mapping/auth</small><b>{errors}</b></span></div>
  {target&&<div className="settingsCard" style={{marginTop:12}}><small>ОЧЕРЕДЬ ПЕРЕПОДКЛЮЧЕНИЯ</small><h3>Профиль {currentNo} из {Math.max(total,1)}</h3><p><b>{target.channels.map(c=>c.name).join(' • ')}</b></p><p>Profile UUID: <code>{target.profileId}</code></p><p>Expected channel_id: <code>{target.expectedChannelId||'—'}</code></p><button className="primary" disabled={!!busy} onClick={()=>chooseBrowser(target.profileId)}>{busy===target.profileId?'Подключение…':'Переподключить следующий'}</button><p className="note">Сначала выбирается браузер, затем Google/YouTube аккаунт. После проверки exact Channel ID VYRON сохраняет credentials в существующий Profile UUID и переходит к следующему профилю.</p></div>}
  {!queue.length&&loaded&&errors===0&&ready===0&&secretRequired===0&&<div className="successBox"><b>Восстановление завершено</b><br/>Channels: {channels.length} • OAuth profiles: {profiles.length} • Connected: {connected} • Reconnect required: 0</div>}
  <div className="recoveryProfileRows">{rows.map(r=><article key={r.profileId} className={r.status==='CONNECTED'?'good':(r.status==='RECONNECT REQUIRED'||r.status==='MISSING'||r.status==='CANONICAL_PRESENT_UNVERIFIED'||r.status==='CLIENT SECRET REQUIRED')?'warn':'bad'}><div><small>{r.channels.length?`${r.channels.length} channel${r.channels.length>1?'s':''}`:'STALE PROFILE'}</small><b>{r.channels.length?r.channels.map(c=>c.name).join(' • '):(r.profile?.channelTitle||'Без привязанного канала')}</b><p>Profile UUID: <code>{r.profileId}</code></p><p>Channel ID: <code>{r.expectedChannelId||'—'}</code></p><p>{r.detail}</p></div><div><strong>{badge(r.status)}</strong>{r.status==='CLIENT SECRET REQUIRED'&&<span className="note">Настройте GLOBAL GOOGLE CONFIG один раз в YouTube → Аккаунты.</span>}{(r.status==='RECONNECT REQUIRED'||r.status==='MISSING')&&<button disabled={!!busy} onClick={()=>chooseBrowser(r.profileId)}>Переподключить</button>}{(r.status==='WRONG CHANNEL'||r.status==='FAILED')&&!r.stale&&!r.duplicate&&!r.conflict&&r.expectedChannelId&&<button disabled={!!busy} onClick={()=>{setTransient(x=>{const n={...x};delete n[r.profileId];return n});void chooseBrowser(r.profileId)}}>Повторить OAuth</button>}</div></article>)}</div>
  {unmapped.length>0&&<div className="errorBox"><b>Каналы без существующего OAuthProfile: {unmapped.length}</b><p>Они не включены в автоматическую очередь: новый UUID без явной необходимости не создаётся.</p>{unmapped.map(c=><p key={c.id}>{c.name} • {c.youtubeChannelId||'channel_id отсутствует'} • PROFILE UUID: {c.youtubeProfileId||'NONE'}</p>)}</div>}
  {browserOpen&&<div className="modalBackdrop" onMouseDown={()=>{setBrowserOpen(false);setPendingProfileId('')}}><section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}><small>GOOGLE OAUTH • ВОССТАНОВЛЕНИЕ</small><h2>Через какой браузер открыть этот канал?</h2><p>Выберите браузер, где уже открыт нужный Google/YouTube аккаунт. Выбор действует только для текущего переподключения.</p><div className="browserGrid">{browsers.map(x=><button key={x.id} className={selectedBrowser===x.id?'active':''} onClick={()=>setSelectedBrowser(x.id)}><b>{x.label}</b><small>{x.id==='default'?'Использовать системный браузер':'Открыть OAuth именно здесь'}</small></button>)}</div><footer><button onClick={()=>{setBrowserOpen(false);setPendingProfileId('')}}>Отмена</button><button className="primary" onClick={()=>void confirmBrowserReconnect()}>Продолжить через {browsers.find(x=>x.id===selectedBrowser)?.label||'браузер'}</button></footer></section></div>}
 </section>
}
