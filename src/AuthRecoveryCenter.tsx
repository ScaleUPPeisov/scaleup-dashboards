import React,{useEffect,useMemo,useRef,useState} from 'react';
import {api,type GoogleConfigStatus,type OAuthCredentialStatesResponse,type OAuthExistingProfilesRecoveryResult} from './api';
import {useApp} from './store';
import type {YoutubeProfile} from './types';
import {isOAuthMissingErrorText,resolveOAuthMissingErrors} from './errorHistory';
import {notifyError,notifySuccess,notifyWarning} from './notificationCenter';
import {buildFinalRecoveryRows,channelsWithoutProfile,reconnectFailure,reconnectQueue,type FinalAuthStatus,type RecoveryTransient} from './authRecoveryFinalCore';
import {availableReconnectBrowsers,resolveReconnectBrowser,type BrowserOption} from './reconnectBrowserChoiceCore';

const badge=(s:FinalAuthStatus)=>s==='CONNECTED'?'✓ ГОТОВО':s==='KEYCHAIN BLOCKED'?'⚠ ДОСТУП KEYCHAIN ЗАБЛОКИРОВАН':s==='NOT CHECKED'?'○ НЕ ПРОВЕРЕНО':s==='CANONICAL_PRESENT_UNVERIFIED'?'○ СОХРАНЁННЫЙ ДОСТУП НАЙДЕН':s==='CLIENT SECRET REQUIRED'?'⚿ НУЖЕН GLOBAL OAUTH CLIENT':s==='RECONNECT REQUIRED'?'↻ НУЖЕН ПОВТОРНЫЙ ВХОД':s==='MISSING'?'↻ НУЖЕН ПОВТОРНЫЙ ВХОД':s==='CONNECTING'?'… ПОДКЛЮЧЕНИЕ':s==='VALIDATING'?'… ПРОВЕРКА':s==='WRONG CHANNEL'?'⚠ ДРУГОЙ КАНАЛ':'✕ ОШИБКА';

export function AuthRecoveryCenter(){
 const channels=useApp(x=>x.channels),jobs=useApp(x=>x.jobs),patchJob=useApp(x=>x.patchJob);
 const [profiles,setProfiles]=useState<YoutubeProfile[]>([]);
 const [credentialStates,setCredentialStates]=useState<OAuthCredentialStatesResponse>({credentialSchemaVersion:2,profiles:[],secretValuesIncluded:false,youtubeApiRequests:0,keychainSecretReads:0});
 const [globalStatus,setGlobalStatus]=useState<GoogleConfigStatus|null>(null);
 const [automatic,setAutomatic]=useState<OAuthExistingProfilesRecoveryResult|null>(null);
 const [busy,setBusy]=useState('');
 const [transient,setTransient]=useState<Record<string,RecoveryTransient>>({});
 const [loaded,setLoaded]=useState(false);
 const [browserOpen,setBrowserOpen]=useState(false),[browsers,setBrowsers]=useState<BrowserOption[]>([]),[selectedBrowser,setSelectedBrowser]=useState('default'),[pendingProfileId,setPendingProfileId]=useState('');
 const credentialsFile=useRef<HTMLInputElement>(null);

 async function load(){
  const [p,resolved,global]=await Promise.all([api.youtubeProfiles(),api.youtubeOauthCredentialStates(),api.youtubeGoogleConfig()]);
  setProfiles(p);setCredentialStates(resolved);setGlobalStatus(global);setLoaded(true);
  return{profiles:p,credentialStates:resolved,global}
 }
 async function runAutomaticRecovery(quiet=false){
  if(busy)return null;
  setBusy('automatic');
  try{
   const result=await api.youtubeOauthRecoverExistingProfiles();
   setAutomatic(result);
   await load();
   if(!quiet)notifySuccess('Сохранённые подключения проверены','Автоматически восстановлено: '+result.automaticallyRestored+'. Ручной вход нужен только для '+result.manualQueue+' профилей. Браузер автоматически не открывался.');
   return result
  }catch(e){if(!quiet)notifyError('Автоматическое восстановление не завершено',String(e),{persistError:false});return null}
  finally{setBusy('')}
 }
 useEffect(()=>{void (async()=>{try{const first=await load();if(first.global.oauthReady&&first.profiles.length)await runAutomaticRecovery(true)}catch(e){notifyError('Не удалось открыть восстановление каналов',String(e),{persistError:false})}})()},[]);

 const rows=useMemo(()=>buildFinalRecoveryRows(channels,profiles,credentialStates.profiles,transient),[channels,profiles,credentialStates,transient]);
 const queue=useMemo(()=>reconnectQueue(rows),[rows]),unmapped=useMemo(()=>channelsWithoutProfile(channels,profiles),[channels,profiles]);
 const connected=rows.filter(x=>x.status==='CONNECTED').length,keychainBlocked=rows.filter(x=>x.status==='KEYCHAIN BLOCKED').length;
 const unresolved=rows.filter(x=>x.status!=='CONNECTED'&&x.status!=='CANONICAL_PRESENT_UNVERIFIED'&&x.status!=='NOT CHECKED');
 const reconnectRequired=queue.length;
 const manualQueue=keychainBlocked+reconnectRequired+rows.filter(x=>x.status==='FAILED'||x.status==='WRONG CHANNEL').length;

 async function reconnect(profileId:string,browserChoice?:string){
  if(busy)return;const row=rows.find(x=>x.profileId===profileId);if(!row)return;
  setBusy(profileId);setTransient(x=>({...x,[profileId]:{status:'CONNECTING',detail:'Откройте Google только для этого канала и подтвердите нужный аккаунт.'}}));
  const timer=window.setTimeout(()=>setTransient(x=>({...x,[profileId]:{status:'VALIDATING',detail:'Проверяю refresh token и ожидаемый YouTube Channel ID до сохранения.'}})),1200);
  try{
   const browser=browserChoice||row.profile?.preferredBrowser||'default';localStorage.setItem('vyron:oauth-browser',browser);
   const result=await api.youtubeReconnectExisting(profileId,browser);
   window.clearTimeout(timer);
   const fresh=await api.youtubeOauthCredentialStates();setCredentialStates(fresh);
   const resolved=fresh.profiles.find(x=>x.profileUuid===profileId);
   if(result.keychainReadback!=='FOUND'||!['READY','CONNECTED'].includes(String(resolved?.credentialState||''))||!resolved?.canonicalRefreshPresent)throw new Error('OAUTH_STATE_VERIFY_FAILED_AFTER_RECONNECT');
   const localIds=row.channels.map(c=>c.id),youtubeIds=row.channels.map(c=>c.youtubeChannelId||'').filter(Boolean);
   for(const j of jobs)if(localIds.includes(j.channelId)&&isOAuthMissingErrorText(j.error))patchJob(j.id,{error:undefined});
   resolveOAuthMissingErrors(profileId,[...localIds,...youtubeIds,row.expectedChannelId||''].filter(Boolean));
   setTransient(x=>({...x,[profileId]:{status:'CONNECTED',detail:'Доступ восстановлен. Profile UUID и Channel ID сохранены.'}}));
   notifySuccess('YouTube снова подключён',(row.channels.map(c=>c.name).join(', ')||row.profile?.channelTitle||profileId)+' • существующий Profile UUID сохранён.');
   await load();window.setTimeout(()=>setTransient(x=>{const n={...x};delete n[profileId];return n}),500);
  }catch(e){window.clearTimeout(timer);const f=reconnectFailure(e);setTransient(x=>({...x,[profileId]:{status:f.status,detail:f.message}}));if(f.status==='WRONG CHANNEL')notifyWarning('Авторизован другой YouTube канал',f.message);else notifyError('Переподключение не завершено',f.message,{persistError:false})}
  finally{setBusy('')}
 }
 async function importGlobalCredentials(files:FileList|null){
  const file=files?.[0];if(!file||busy)return;setBusy('global-credentials');
  try{
   const status=await api.youtubeImportGoogleConfig(await file.text(),'');setGlobalStatus(status);
   if(!status.oauthReady)throw new Error('OAUTH_CLIENT_SETUP_REQUIRED: GLOBAL Client Secret не читается');
   setBusy('');
   const result=await runAutomaticRecovery(true);
   if(result)notifySuccess('GLOBAL OAuth Client восстановлен','Один credentials.json применён ко всему VYRON. Автоматически восстановлено: '+result.automaticallyRestored+'; ручной вход: '+result.manualQueue+'.');
  }catch(e){notifyError('Не удалось восстановить GLOBAL OAuth Client',String(e),{persistError:false})}
  finally{setBusy('')}
 }
 async function retryGlobal(){
  if(busy)return;setBusy('global-retry');
  try{
   const status=await api.youtubeRetryGoogleConfig();setGlobalStatus(status);
   if(status.oauthReady){setBusy('');await runAutomaticRecovery(false)}
   else notifyWarning('Keychain всё ещё блокирует Client Secret','Можно выбрать тот же credentials.json OAuth Client VYRON. Каналы и профили не удаляются.')
  }catch(e){notifyError('Безопасная проверка не завершена',String(e),{persistError:false})}
  finally{setBusy('')}
 }
 async function retryProfile(profileId:string){
  if(busy)return;setBusy(profileId);
  try{
   const result=await api.youtubeOauthRetryProfileKeychain(profileId);
   if(result.status==='ACCESSIBLE'){setBusy('');await runAutomaticRecovery(true);notifySuccess('Сохранённый токен снова читается','Повторный вход в Google не потребовался.');}
   else if(result.status==='KEYCHAIN_BLOCKED')notifyWarning('Keychain всё ещё блокирует доступ','Можно повторить позже или явно войти через браузер только для этого канала.');
   else notifyWarning('Сохранённый токен отсутствует','Повторный вход нужен только этому каналу.');
  }catch(e){notifyError('Проверка профиля не завершена',String(e),{persistError:false})}
  finally{setBusy('')}
 }
 async function chooseBrowser(profileId:string){
  if(busy)return;const row=rows.find(x=>x.profileId===profileId);if(!row)return;
  try{const raw=await api.youtubeOauthBrowsers();const available=availableReconnectBrowsers(raw);const remembered=localStorage.getItem('vyron:oauth-browser')||'default';setBrowsers(available);setSelectedBrowser(resolveReconnectBrowser(available,row.profile?.preferredBrowser,remembered));}
  catch{setBrowsers([{id:'default',label:'Браузер по умолчанию',available:true}]);setSelectedBrowser('default')}
  setPendingProfileId(profileId);setBrowserOpen(true)
 }
 async function confirmBrowserReconnect(){const id=pendingProfileId;if(!id)return;const browser=selectedBrowser||'default';setBrowserOpen(false);setPendingProfileId('');await reconnect(id,browser)}

 return <section className="settingsCard authRecoveryCenter">
  <input ref={credentialsFile} hidden type="file" accept=".json,application/json" onChange={e=>{void importGlobalCredentials(e.target.files);e.currentTarget.value=''}}/>
  <div className="panelHead"><div><small>OAUTH RECOVERY CENTER</small><h3>Восстановление подключений</h3><p>Сначала восстанавливается один GLOBAL OAuth Client, затем VYRON использует уже сохранённые refresh tokens. Браузер открывается только по вашему нажатию для действительно проблемного канала.</p></div><button className="settingsAction" onClick={()=>void load()} disabled={!!busy}>Обновить статусы</button></div>

  <div className="settingsCard" style={{marginTop:12}}><small>ШАГ 1 • GLOBAL OAUTH</small><h3>{globalStatus?.oauthReady?'READY':globalStatus?.oauthState||'NOT READY'}</h3><p>{globalStatus?.oauthState==='KEYCHAIN_ACCESS_BLOCKED'?'Client Secret сохранён, но macOS Keychain временно не даёт его прочитать. Сначала безопасная проверка; при необходимости можно выбрать тот же credentials.json.':'Один credentials.json используется для всех существующих и новых каналов VYRON.'}</p><div className="headerActions">{globalStatus?.oauthState==='KEYCHAIN_ACCESS_BLOCKED'&&<button disabled={!!busy} onClick={()=>void retryGlobal()}>Повторить безопасную проверку</button>}<button disabled={!!busy} onClick={()=>credentialsFile.current?.click()}>{globalStatus?.oauthState==='KEYCHAIN_ACCESS_BLOCKED'?'Восстановить через credentials.json':globalStatus?.oauthReady?'Заменить credentials.json':'Настроить OAuth Client один раз'}</button></div></div>

  <div className="settingsCard" style={{marginTop:12}}><small>ШАГ 2 • АВТОМАТИЧЕСКОЕ ВОССТАНОВЛЕНИЕ</small><h3>Существующие профили — без браузера</h3><p>VYRON читает текущий refresh-token pointer и делает только Google OAuth token refresh. YouTube Data API на этом шаге не используется.</p><button className="primary" disabled={!!busy||!globalStatus?.oauthReady||!profiles.length} onClick={()=>void runAutomaticRecovery(false)}>{busy==='automatic'?'Восстановление…':'Восстановить сохранённые подключения'}</button>{automatic&&<div className="settingsInfoGrid"><span><small>Профили</small><b>{automatic.total}</b></span><span><small>Автоматически восстановлено</small><b>{automatic.automaticallyRestored}</b></span><span><small>Keychain blocked</small><b>{automatic.keychainBlocked}</b></span><span><small>Требуют входа</small><b>{automatic.reconnectRequired+automatic.failed}</b></span><span><small>Браузеры открыты автоматически</small><b>{automatic.browserLaunches}</b></span><span><small>YouTube API requests</small><b>{automatic.youtubeApiRequests}</b></span></div>}</div>

  <div className="settingsCard" style={{marginTop:12}}><small>ШАГ 3 • ТОЛЬКО НЕРЕШЁННЫЕ</small><h3>Ручная очередь: {manualQueue}</h3><p>Не нужно проходить все каналы. Ручной вход предлагается только там, где сохранённый token заблокирован, отсутствует или отозван.</p></div>
  <div className="settingsInfoGrid"><span><small>Всего каналов</small><b>{channels.length}</b></span><span><small>OAuth profiles</small><b>{profiles.length}</b></span><span><small>READY</small><b>{connected}</b></span><span><small>Keychain blocked</small><b>{keychainBlocked}</b></span><span><small>Reconnect required</small><b>{reconnectRequired}</b></span><span><small>Browser auto-open</small><b>{automatic?.browserLaunches??0}</b></span></div>

  {loaded&&manualQueue===0&&unmapped.length===0&&<div className="successBox"><b>Каналы сохранены</b><br/>Все доступные сохранённые подключения восстановлены без массового Google login.</div>}
  <div className="recoveryProfileRows">{unresolved.map(r=><article key={r.profileId} className="warn"><div><small>{r.channels.length?(r.channels.length+' channel'+(r.channels.length>1?'s':'')):'ПРОФИЛЬ БЕЗ LOCAL MAPPING'}</small><b>{r.channels.length?r.channels.map(c=>c.name).join(' • '):(r.profile?.channelTitle||'Без привязанного канала')}</b><p>{r.detail}</p><details><summary>Технические сведения</summary><p>Profile UUID: <code>{r.profileId}</code></p><p>Channel ID: <code>{r.expectedChannelId||'—'}</code></p></details></div><div><strong>{badge(r.status)}</strong>{r.status==='CLIENT SECRET REQUIRED'&&<button disabled={!!busy} onClick={()=>credentialsFile.current?.click()}>Восстановить GLOBAL OAuth Client</button>}{r.status==='KEYCHAIN BLOCKED'&&<><button disabled={!!busy} onClick={()=>void retryProfile(r.profileId)}>Повторить безопасную проверку</button><button disabled={!!busy} onClick={()=>void chooseBrowser(r.profileId)}>Войти заново через браузер</button></>}{(r.status==='RECONNECT REQUIRED'||r.status==='MISSING'||r.status==='WRONG CHANNEL'||r.status==='FAILED')&&!r.stale&&!r.duplicate&&!r.conflict&&r.expectedChannelId&&<button disabled={!!busy} onClick={()=>void chooseBrowser(r.profileId)}>Переподключить через браузер</button>}</div></article>)}</div>
  {unmapped.length>0&&<div className="errorBox"><b>Каналы сохранены, но для {unmapped.length} local mapping не найден OAuthProfile</b><p>VYRON не удаляет youtubeProfileId и не создаёт новый UUID автоматически.</p>{unmapped.map(c=><p key={c.id}>{c.name} • {c.youtubeChannelId||'Channel ID отсутствует'}</p>)}</div>}

  {browserOpen&&<div className="modalBackdrop" onMouseDown={()=>{setBrowserOpen(false);setPendingProfileId('')}}><section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}><small>GOOGLE OAUTH • РУЧНОЙ FALLBACK</small><h2>Через какой браузер открыть этот канал?</h2><p>Браузер откроется только после этого явного действия. Выберите браузер с нужным Google/YouTube аккаунтом; затем Google покажет выбор аккаунта.</p><div className="browserGrid">{browsers.map(x=><button key={x.id} className={selectedBrowser===x.id?'active':''} onClick={()=>setSelectedBrowser(x.id)}><b>{x.label}</b><small>{x.id==='default'?'Использовать системный браузер':'Открыть OAuth именно здесь'}</small></button>)}</div><footer><button onClick={()=>{setBrowserOpen(false);setPendingProfileId('')}}>Отмена</button><button className="primary" onClick={()=>void confirmBrowserReconnect()}>Продолжить через {browsers.find(x=>x.id===selectedBrowser)?.label||'браузер'}</button></footer></section></div>}
 </section>
}
