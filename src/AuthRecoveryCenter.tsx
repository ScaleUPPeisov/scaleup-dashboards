import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ModalPortal} from './ModalPortal';
import {api,type GoogleConfigStatus,type OAuthCredentialStatesResponse,type OAuthExistingProfilesRecoveryResult,type OAuthInteractiveRecoveryResult,type OAuthReconnectWrongChannel} from './api';
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
 const [interactive,setInteractive]=useState<(OAuthInteractiveRecoveryResult&{running?:boolean;done?:number})|null>(null);
 const [busy,setBusy]=useState('');
 const [transient,setTransient]=useState<Record<string,RecoveryTransient>>({});
 const [loaded,setLoaded]=useState(false);
 const [browserOpen,setBrowserOpen]=useState(false),[browsers,setBrowsers]=useState<BrowserOption[]>([]),[selectedBrowser,setSelectedBrowser]=useState('default'),[pendingProfileId,setPendingProfileId]=useState('');
 const [preReconnectProfileId,setPreReconnectProfileId]=useState('');
 const [wrongChannel,setWrongChannel]=useState<(OAuthReconnectWrongChannel&{browser:string})|null>(null);
 const credentialsFile=useRef<HTMLInputElement>(null);
 const initialRecoveryStarted=useRef(false);

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
   if(!quiet)notifySuccess('Сохранённые подключения проверены','Автоматически восстановлено: '+result.automaticallyRestored+'. Ручной вход нужен только для '+result.reconnectRequired+' профилей. Браузер автоматически не открывался.');
   return result
  }catch(e){if(!quiet)notifyError('Автоматическое восстановление не завершено',String(e),{persistError:false});return null}
  finally{setBusy('')}
 }
 useEffect(()=>{
  if(initialRecoveryStarted.current)return;
  initialRecoveryStarted.current=true;
  void (async()=>{
   try{
    const initial=await load();
    const needsRecovery=initial.credentialStates.profiles.some(x=>x.credentialState==='NOT_CHECKED'||x.credentialState==='CANONICAL_PRESENT_UNVERIFIED');
    if(initial.global.oauthReady&&initial.profiles.length&&needsRecovery){
     const result=await api.youtubeOauthRecoverExistingProfiles();
     setAutomatic(result);
     await load();
    }
   }catch(e){notifyError('Не удалось открыть восстановление каналов',String(e),{persistError:false})}
  })()
 },[]);

 const rows=useMemo(()=>buildFinalRecoveryRows(channels,profiles,credentialStates.profiles,transient),[channels,profiles,credentialStates,transient]);
 const queue=useMemo(()=>reconnectQueue(rows),[rows]),unmapped=useMemo(()=>channelsWithoutProfile(channels,profiles),[channels,profiles]);
 const connected=rows.filter(x=>x.status==='CONNECTED').length,keychainBlocked=rows.filter(x=>x.status==='KEYCHAIN BLOCKED').length;
 const unresolved=rows.filter(x=>x.status!=='CONNECTED'&&x.status!=='CANONICAL_PRESENT_UNVERIFIED'&&x.status!=='NOT CHECKED');
 const reconnectRequired=queue.length;
 // Manual Google login is factual reconnect state only. NOT_CHECKED/Keychain/FAILED are not login evidence.
 const manualQueue=reconnectRequired;

 async function reconnect(profileId:string,browserChoice?:string){
  if(busy)return;const row=rows.find(x=>x.profileId===profileId);if(!row)return;
  setBusy(profileId);setTransient(x=>({...x,[profileId]:{status:'CONNECTING',detail:'Откройте Google только для этого канала и подтвердите нужный аккаунт.'}}));
  const timer=window.setTimeout(()=>setTransient(x=>({...x,[profileId]:{status:'VALIDATING',detail:'Проверяю refresh token и ожидаемый YouTube Channel ID до сохранения.'}})),1200);
  try{
   const browser=browserChoice||row.profile?.preferredBrowser||'default';localStorage.setItem('vyron:oauth-browser',browser);
   const result=await api.youtubeReconnectExisting(profileId,browser);
   window.clearTimeout(timer);
   if(result.status==='WRONG_CHANNEL'){
    setWrongChannel({...result,browser});
    setTransient(x=>({...x,[profileId]:{status:'WRONG CHANNEL',detail:'Выбран другой YouTube-канал. Привязка и credentials не изменены.'}}));
    return
   }
   const fresh=await api.youtubeOauthCredentialStates();setCredentialStates(fresh);
   const resolved=fresh.profiles.find(x=>x.profileUuid===profileId);
   if(result.keychainReadback!=='FOUND'||!['READY','CONNECTED'].includes(String(resolved?.credentialState||''))||!resolved?.canonicalRefreshPresent)throw new Error('OAUTH_STATE_VERIFY_FAILED_AFTER_RECONNECT');
   const localIds=row.channels.map(c=>c.id),youtubeIds=row.channels.map(c=>c.youtubeChannelId||'').filter(Boolean);
   for(const j of jobs)if(localIds.includes(j.channelId)&&isOAuthMissingErrorText(j.error))patchJob(j.id,{error:undefined});
   resolveOAuthMissingErrors(profileId,[...localIds,...youtubeIds,row.expectedChannelId||''].filter(Boolean));
   setTransient(x=>({...x,[profileId]:{status:'CONNECTED',detail:'Доступ восстановлен. Profile UUID и Channel ID сохранены.'}}));
   notifySuccess('YouTube снова подключён',(row.channels.map(c=>c.name).join(', ')||row.profile?.channelTitle||profileId)+' • существующий Profile UUID сохранён.');
   await load();window.setTimeout(()=>setTransient(x=>{const n={...x};delete n[profileId];return n}),500);
  }catch(e){window.clearTimeout(timer);const f=reconnectFailure(e);setTransient(x=>({...x,[profileId]:{status:f.status,detail:f.message}}));if(f.status==='WRONG CHANNEL')notifyWarning('Выбран другой YouTube-канал','VYRON не изменил профиль. Используйте повторный вход через нужный канал.');else notifyError('Переподключение не завершено',f.message,{persistError:false})}
  finally{setBusy('')}
 }
 async function runInteractiveRecovery(){
  if(busy||!globalStatus?.oauthReady)return;
  if(!window.confirm('VYRON попробует восстановить старые сохранённые refresh tokens через macOS Keychain. macOS может запросить разрешение доступа. Google-браузеры автоматически не откроются. Продолжить?'))return;
  setBusy('interactive');
  setInteractive({total:profiles.length,recoveredWithoutGoogle:0,keychainBlocked:0,reconnectRequired:0,failed:0,skippedReady:0,manualQueue:profiles.length,browserLaunches:0,googleAccountSelectors:0,credentialsDialogs:0,youtubeApiRequests:0,videosInsert:0,profiles:[],secretValuesIncluded:false,running:true,done:0});
  let stop:(()=>void)|undefined;
  try{
   stop=await api.onOauthInteractiveRecoveryProgress(p=>setInteractive(x=>x?{...x,running:true,done:p.done,total:p.total,recoveredWithoutGoogle:p.recoveredWithoutGoogle,keychainBlocked:p.keychainBlocked,reconnectRequired:p.reconnectRequired,failed:p.failed}:x));
   const result=await api.youtubeOauthInteractiveRecoverBlockedProfiles();
   setInteractive({...result,running:false,done:result.total});
   await load();
   if(result.recoveredWithoutGoogle)notifySuccess('Сохранённые подключения восстановлены',`Без Google-входа восстановлено: ${result.recoveredWithoutGoogle}. Требуют ручного входа: ${result.reconnectRequired}.`);
   else notifyWarning('Автоматически восстановить токены не удалось',`Доступ заблокирован macOS: ${result.keychainBlocked}. Требуют входа: ${result.reconnectRequired}. Ошибки: ${result.failed}. Google-браузеры не открывались.`);
  }catch(e){notifyError('Восстановление Keychain не завершено',String(e),{persistError:false})}
  finally{stop?.();setBusy('')}
 }
 async function importGlobalCredentials(files:FileList|null){
  const file=files?.[0];if(!file||busy)return;setBusy('global-credentials');
  try{
   const status=await api.youtubeImportGoogleConfig(await file.text(),'');setGlobalStatus(status);
   if(!status.oauthReady)throw new Error('OAUTH_CLIENT_SETUP_REQUIRED: GLOBAL Client Secret не читается');
   setBusy('');
   const result=await runAutomaticRecovery(true);
   if(result)notifySuccess('GLOBAL OAuth Client восстановлен','Один credentials.json применён ко всему VYRON. Автоматически восстановлено: '+result.automaticallyRestored+'; ручной вход: '+result.reconnectRequired+'.');
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
 async function recoverSavedGlobal(){
  if(busy)return;setBusy('global-saved-recovery');
  try{
   // One manual action handles legacy build-270 vault migration first. If the old
   // master key is unavailable, normal saved-client fallbacks may still rebuild the local vault.
   try{await api.youtubeOauthVaultRecover()}catch{}
   const status=await api.youtubeRecoverSavedGoogleConfig();setGlobalStatus(status);
   if(!status.oauthReady)throw new Error('Сохранённый OAuth Client пока не восстановлен');
   setBusy('');
   await runAutomaticRecovery(true);
   window.dispatchEvent(new Event('vyron:oauth-state-changed'));
   notifySuccess('Сохранённый OAuth Client восстановлен','credentials.json и Google-вход не потребовались.');
  }catch(e){notifyError('Локальное восстановление OAuth Client не завершено',String(e),{persistError:false})}
  finally{setBusy('')}
 }
 async function retryProfile(profileId:string){
  if(busy)return;setBusy(profileId);
  try{
   const result=await api.youtubeOauthRetryProfileKeychain(profileId);
   if(result.status==='ACCESSIBLE'){setBusy('');await runAutomaticRecovery(true);notifySuccess('Сохранённый токен снова читается','Повторный вход в Google не потребовался.');}
   else if(result.status==='KEYCHAIN_BLOCKED')notifyWarning('Keychain всё ещё блокирует доступ','Refresh token существует. Используйте «Восстановить доступ Keychain»; Google login пока не требуется.');
   else notifyWarning('Сохранённый токен отсутствует','Повторный вход нужен только этому каналу.');
  }catch(e){notifyError('Проверка профиля не завершена',String(e),{persistError:false})}
  finally{setBusy('')}
 }
 async function openYoutubeForProfile(profileId:string,browserChoice?:string){
  const row=rows.find(x=>x.profileId===profileId);
  const chosen=browserChoice||row?.profile?.preferredBrowser||localStorage.getItem('vyron:oauth-browser')||'default';
  try{await api.youtubeOpenYoutube(chosen)}catch(e){notifyError('Не удалось открыть YouTube',String(e),{persistError:false})}
 }
 function prepareReconnect(profileId:string){setPreReconnectProfileId(profileId)}
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

  <div className="settingsCard" style={{marginTop:12}}><small>ШАГ 1 • GLOBAL OAUTH</small><h3>{globalStatus?.oauthReady?'READY':globalStatus?.oauthState||'NOT READY'}</h3><p>{globalStatus?.oauthState==='KEYCHAIN_ACCESS_BLOCKED'||globalStatus?.repairRequired?'Сначала восстановите уже сохранённый доступ локально. VYRON перенесёт старый Client Secret в OAuth Vault; Google-вход и credentials.json не требуются.':'Один credentials.json используется для всех существующих и новых каналов VYRON.'}</p><div className="headerActions"><button className="primary" disabled={!!busy} onClick={()=>void recoverSavedGlobal()}>Восстановить сохранённый доступ</button>{globalStatus?.oauthState==='KEYCHAIN_ACCESS_BLOCKED'&&<button disabled={!!busy} onClick={()=>void retryGlobal()}>Повторить безопасную проверку</button>}<button disabled={!!busy} onClick={()=>credentialsFile.current?.click()}>{globalStatus?.oauthReady?'Заменить credentials.json':'Загрузить credentials.json'}</button></div></div>

  <div className="settingsCard" style={{marginTop:12}}><small>ШАГ 2 • NO-UI ПРОВЕРКА</small><h3>Существующие профили — без системных диалогов</h3><p>Обычная проверка читает доступные refresh tokens без macOS password prompts и делает только Google OAuth token refresh. YouTube Data API не используется.</p><button className="primary" disabled={!!busy||!globalStatus?.oauthReady||!profiles.length} onClick={()=>void runAutomaticRecovery(false)}>{busy==='automatic'?'Проверка…':'Проверить сохранённые подключения без запросов macOS'}</button>{automatic&&<div className="settingsInfoGrid"><span><small>Профили</small><b>{automatic.total}</b></span><span><small>Автоматически восстановлено</small><b>{automatic.automaticallyRestored}</b></span><span><small>Keychain blocked</small><b>{automatic.keychainBlocked}</b></span><span><small>Требуют входа</small><b>{automatic.reconnectRequired+automatic.failed}</b></span><span><small>Браузеры открыты автоматически</small><b>{automatic.browserLaunches}</b></span><span><small>YouTube API requests</small><b>{automatic.youtubeApiRequests}</b></span></div>}</div>

  <div className="settingsCard" style={{marginTop:12}}><small>ШАГ 3 • ЯВНОЕ ВОССТАНОВЛЕНИЕ KEYCHAIN</small><h3>Восстановить все сохранённые подключения</h3><p>Запускается только вручную. macOS может запросить разрешение на чтение старых защищённых записей. После успешного доступа VYRON переносит token в новый canonical item, проверяет readback и OAuth token refresh. Google браузеры не открываются.</p><div className="cardActions"><button disabled={!!busy} onClick={async()=>{try{setBusy('interactive');await api.youtubeOauthVaultRecover();await load();}finally{setBusy('')}}}>Восстановить доступ OAuth Vault</button><button className="primary" disabled={!!busy||!globalStatus?.oauthReady||!profiles.length} onClick={()=>void runInteractiveRecovery()}>{busy==='interactive'?'Восстановление…':'Восстановить все сохранённые подключения'}</button></div>{interactive?.running&&<div className="statsRefreshProgress"><b>Keychain recovery</b><span>{interactive.done||0} / {interactive.total}</span><i style={{width:`${interactive.total?Math.round((interactive.done||0)/interactive.total*100):0}%`}}/></div>}{interactive&&!interactive.running&&<div className="settingsInfoGrid"><span><small>Без Google-входа</small><b>{interactive.recoveredWithoutGoogle}</b></span><span><small>Keychain blocked</small><b>{interactive.keychainBlocked}</b></span><span><small>Требуют browser login</small><b>{interactive.reconnectRequired}</b></span><span><small>Ошибки</small><b>{interactive.failed}</b></span><span><small>Browser auto-open</small><b>{interactive.browserLaunches}</b></span><span><small>YouTube API requests</small><b>{interactive.youtubeApiRequests}</b></span></div>}</div>

  <div className="settingsCard" style={{marginTop:12}}><small>ШАГ 4 • ТОЛЬКО НЕРЕШЁННЫЕ</small><h3>Ручная очередь: {manualQueue}</h3><p>Google-вход нужен только профилям, которые macOS действительно не разрешил восстановить или чей refresh token был отозван.</p></div>
  <div className="settingsInfoGrid"><span><small>Всего каналов</small><b>{channels.length}</b></span><span><small>OAuth profiles</small><b>{profiles.length}</b></span><span><small>READY</small><b>{connected}</b></span><span><small>Keychain blocked</small><b>{keychainBlocked}</b></span><span><small>Reconnect required</small><b>{reconnectRequired}</b></span><span><small>Browser auto-open</small><b>{automatic?.browserLaunches??0}</b></span></div>

  {loaded&&manualQueue===0&&unmapped.length===0&&<div className="successBox"><b>Каналы сохранены</b><br/>Все доступные сохранённые подключения восстановлены без массового Google login.</div>}
  <div className="recoveryProfileRows">{unresolved.map(r=><article key={r.profileId} className="warn"><div><small>{r.channels.length?(r.channels.length+' channel'+(r.channels.length>1?'s':'')):'ПРОФИЛЬ БЕЗ LOCAL MAPPING'}</small><b>{r.channels.length?r.channels.map(c=>c.name).join(' • '):(r.profile?.channelTitle||'Без привязанного канала')}</b><p>{r.detail}</p><details><summary>Технические сведения</summary><p>Profile UUID: <code>{r.profileId}</code></p><p>Channel ID: <code>{r.expectedChannelId||'—'}</code></p></details></div><div><strong>{badge(r.status)}</strong>{r.status==='CLIENT SECRET REQUIRED'&&<button disabled={!!busy} onClick={()=>credentialsFile.current?.click()}>Восстановить GLOBAL OAuth Client</button>}{r.status==='KEYCHAIN BLOCKED'&&<><button disabled={!!busy} onClick={()=>void retryProfile(r.profileId)}>Повторить безопасную проверку</button><button className="primary" disabled={!!busy||!globalStatus?.oauthReady} onClick={()=>void runInteractiveRecovery()}>Восстановить доступ Keychain</button></>}{(r.status==='RECONNECT REQUIRED'||r.status==='MISSING'||r.status==='WRONG CHANNEL'||r.status==='FAILED')&&!r.stale&&!r.duplicate&&!r.conflict&&r.expectedChannelId&&<button disabled={!!busy} onClick={()=>prepareReconnect(r.profileId)}>Переподключить через браузер</button>}</div></article>)}</div>
  {unmapped.length>0&&<div className="errorBox"><b>Каналы сохранены, но для {unmapped.length} local mapping не найден OAuthProfile</b><p>VYRON не удаляет youtubeProfileId и не создаёт новый UUID автоматически.</p>{unmapped.map(c=><p key={c.id}>{c.name} • {c.youtubeChannelId||'Channel ID отсутствует'}</p>)}</div>}

  {preReconnectProfileId&&(()=>{const r=rows.find(x=>x.profileId===preReconnectProfileId);return <ModalPortal onClose={()=>setPreReconnectProfileId('')}>
   <section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}>
    <small>ПЕРЕПОДКЛЮЧЕНИЕ СУЩЕСТВУЮЩЕГО ПРОФИЛЯ</small><h2>Переподключение {r?.channels[0]?.name||r?.profile?.channelTitle||'YouTube-канала'}</h2>
    <p>Нужно войти именно в этот YouTube-канал. Если на Google-аккаунте несколько YouTube/Brand Account identities, сначала переключитесь на нужный канал в YouTube.</p>
    <div className="settingsCard"><b>{r?.channels[0]?.name||r?.profile?.channelTitle||'YouTube канал'}</b><p>Expected YouTube Channel ID: <code>{r?.expectedChannelId||'—'}</code></p></div>
    <footer><button onClick={()=>setPreReconnectProfileId('')}>Отмена</button><button onClick={()=>void openYoutubeForProfile(preReconnectProfileId)}>Открыть YouTube</button><button className="primary" onClick={()=>{const id=preReconnectProfileId;setPreReconnectProfileId('');void chooseBrowser(id)}}>Выбрать браузер и продолжить</button></footer>
   </section></ModalPortal>})()}

  {wrongChannel&&<ModalPortal onClose={()=>setWrongChannel(null)}><section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}>
   <small>YOUTUBE IDENTITY</small><h2>Выбран другой YouTube-канал</h2>
   <p>Нужен <b>{wrongChannel.expectedChannelTitle||rows.find(x=>x.profileId===wrongChannel.profileId)?.channels[0]?.name||'сохранённый канал'}</b>. VYRON не изменил Profile UUID, Channel ID или credentials.</p>
   <div className="browserGrid">{wrongChannel.authorizedChannels.map(ch=><div key={ch.channelId} className="settingsCard">{ch.thumbnail&&<img src={ch.thumbnail} loading="lazy"/>}<b>{ch.channelTitle}</b>{ch.handle&&<small>{ch.handle}</small>}<small>{ch.channelId}</small>{ch.alreadyConnected&&<small>Этот канал уже подключён в VYRON</small>}</div>)}</div>
   <details><summary>Технические сведения</summary><p>Profile UUID: <code>{wrongChannel.profileId}</code></p><p>Expected: <code>{wrongChannel.expectedChannelId}</code></p><p>Authorized: {wrongChannel.authorizedChannels.map(x=>x.channelId).join(', ')||'NONE'}</p><p>Browser: {wrongChannel.browser}</p><p>credentialsCommitted=false</p></details>
   <footer><button onClick={()=>setWrongChannel(null)}>Отмена</button><button onClick={()=>void api.youtubeOpenYoutube(wrongChannel.browser)}>Открыть YouTube</button><button onClick={()=>{const w=wrongChannel;setWrongChannel(null);void chooseBrowser(w.profileId)}}>Выбрать другой браузер</button><button className="primary" onClick={()=>{const w=wrongChannel;setWrongChannel(null);void reconnect(w.profileId,w.browser)}}>Попробовать ещё раз</button></footer>
  </section></ModalPortal>}
  {browserOpen&&<ModalPortal onClose={()=>{setBrowserOpen(false);setPendingProfileId('')}}><section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}><small>GOOGLE OAUTH • РУЧНОЙ FALLBACK</small><h2>Через какой браузер открыть этот канал?</h2><p>Браузер откроется только после этого явного действия. Выберите браузер с нужным Google/YouTube аккаунтом; затем Google покажет выбор аккаунта.</p><div className="browserGrid">{browsers.map(x=><button key={x.id} className={selectedBrowser===x.id?'active':''} onClick={()=>setSelectedBrowser(x.id)}><b>{x.label}</b><small>{x.id==='default'?'Использовать системный браузер':'Открыть OAuth именно здесь'}</small></button>)}</div><footer><button onClick={()=>{setBrowserOpen(false);setPendingProfileId('')}}>Отмена</button><button className="primary" onClick={()=>void confirmBrowserReconnect()}>Продолжить через {browsers.find(x=>x.id===selectedBrowser)?.label||'браузер'}</button></footer></section></ModalPortal>}
 </section>
}
