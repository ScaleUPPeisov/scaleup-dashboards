import React,{useEffect,useRef,useState} from 'react';
import {api,type GoogleConfigStatus,type OAuthAuthorizedChannel,type OAuthCredentialStateProfile,type OAuthExistingProfilesRecoveryResult,type OAuthNewChannelSelectionRequired,type OAuthReconnectWrongChannel,type OAuthReconciliationDiagnostic,type YoutubeProfileHealth} from './api';
import {useApp} from './store';
import type {YoutubeProfile,YoutubeChannelStatistics} from './types';
import {findFutureChannelMatch} from './channelIdentity';
import {channelStatsStatusLabel,compactChannelStat,exactChannelStat,formatStatsUpdatedAt,normalizeChannelStatistics,subscriberStatLabel} from './youtubeChannelStats';
import {refreshYoutubeChannelStatistics,refreshYoutubeProfileStatistics,type ChannelStatisticsRefreshProgress} from './youtubeChannelStatsRuntime';
import {journal} from './activityJournalRuntime';
import {resolveOAuthKeychainErrors} from './errorHistory';
import {humanizeError} from './errorCenter';

type BrowserOption={id:string;label:string;available:boolean};
type DuplicateChannel={profileId:string;channelId?:string;title?:string};
const ago=(iso?:string)=>{if(!iso)return '—';const ms=Date.now()-new Date(iso).getTime();const m=Math.max(0,Math.round(ms/60000));return m<1?'только что':m<60?`${m} мин. назад`:m<1440?`${Math.round(m/60)} ч. назад`:`${Math.round(m/1440)} дн. назад`};

export function AccountsPage(){
 const channels=useApp(s=>s.channels),toast=useApp(s=>s.toast),settings=useApp(s=>s.settings),patchSettings=useApp(s=>s.patchSettings);
 const [profiles,setProfiles]=useState<YoutubeProfile[]>([]);
 const [health,setHealth]=useState<Record<string,YoutubeProfileHealth>>({});
 const [credentialStates,setCredentialStates]=useState<Record<string,OAuthCredentialStateProfile>>({});
 const [config,setConfig]=useState<GoogleConfigStatus|null>(null);
 const [reconciliation,setReconciliation]=useState<OAuthReconciliationDiagnostic|null>(null);
 const [busy,setBusy]=useState(false),[checking,setChecking]=useState(false);
 const [browserOpen,setBrowserOpen]=useState(false),[browsers,setBrowsers]=useState<BrowserOption[]>([]);
 const [browser,setBrowser]=useState(localStorage.getItem('vyron:oauth-browser')||'default');
 const [pendingProfileId,setPendingProfileId]=useState('');
 const [preReconnectProfileId,setPreReconnectProfileId]=useState('');
 const [wrongChannel,setWrongChannel]=useState<(OAuthReconnectWrongChannel&{browser:string})|null>(null);
 const [newChannelSelection,setNewChannelSelection]=useState<OAuthNewChannelSelectionRequired|null>(null);
 const [oauthSetupOpen,setOauthSetupOpen]=useState(false);
 const [pendingAddAfterGlobalRepair,setPendingAddAfterGlobalRepair]=useState(false);
 const [recovery,setRecovery]=useState<(OAuthExistingProfilesRecoveryResult&{running:boolean;done:number})|null>(null);
 const [duplicate,setDuplicate]=useState<DuplicateChannel|null>(null);
 const [refreshingStats,setRefreshingStats]=useState<Record<string,boolean>>({});
 const [allStats,setAllStats]=useState<ChannelStatisticsRefreshProgress&{running:boolean}>({running:false,done:0,total:0});
 const file=useRef<HTMLInputElement>(null);

 function boundChannel(p:YoutubeProfile){
  return useApp.getState().channels.find(x=>x.youtubeChannelId===p.channelId||x.youtubeProfileId===p.id);
 }

 function bindProfile(p:YoutubeProfile){
  if(!p.channelId)return;
  const state=useApp.getState();
  const exact=state.channels.find(x=>x.youtubeChannelId===p.channelId||x.youtubeProfileId===p.id);
  if(exact){state.updateChannel(exact.id,{youtubeProfileId:p.id,youtubeChannelId:p.channelId});return{channel:exact,mode:'existing' as const}}
  const future=findFutureChannelMatch(state.channels,p.channelTitle);
  if(future){state.updateChannel(future.id,{youtubeProfileId:p.id,youtubeChannelId:p.channelId});return{channel:future,mode:'future' as const}}
  const created=state.addChannel({name:p.channelTitle||'YouTube канал',youtubeProfileId:p.id,youtubeChannelId:p.channelId});
  return{channel:created,mode:'created' as const}
 }

 function applyStatistics(p:YoutubeProfile,stats:YoutubeChannelStatistics){
  const binding=boundChannel(p)||bindProfile(p)?.channel;
  if(!binding)return;
  const current=useApp.getState().channels.find(x=>x.id===binding.id)||binding;
  useApp.getState().updateChannel(binding.id,{stats:normalizeChannelStatistics(stats,current.stats)});
 }

 async function refreshProfileStats(p:YoutubeProfile,quiet=false){
  if(!p.id||!p.channelId)return null;
  setRefreshingStats(x=>({...x,[p.id]:true}));
  try{
   const stats=await refreshYoutubeProfileStatistics(p);
   if(stats&&!quiet)toast(`✓ Статистика ${p.channelTitle||p.channelId} обновлена`);
   if(!stats&&!quiet)toast(`Не удалось обновить статистику ${p.channelTitle||p.channelId}. Показаны последние сохранённые данные.`);
   return stats
  }finally{setRefreshingStats(x=>({...x,[p.id]:false}))}
 }

 async function refresh(){
  // Profile metadata is independent from Keychain/global-client health. Never let a
  // global credential error collapse Account Center to an empty profile list.
  let p:YoutubeProfile[]=[];
  try{p=await api.youtubeProfiles();setProfiles(p);for(const profile of p)bindProfile(profile)}
  catch(e){toast(`Не удалось прочитать метаданные OAuth-профилей: ${String(e)}`)}
  try{setConfig(await api.youtubeGoogleConfig())}
  catch{setConfig({configured:false,hasSecret:false,hasApiKey:false,oauthReady:false,oauthState:'ERROR',repairRequired:true,secretOperational:false,secureStorageErrorCode:'KEYCHAIN_READ_FAILED'})}
  try{setReconciliation(await api.youtubeOauthReconciliationDiagnostics())}catch{}
  try{const states=await api.youtubeOauthCredentialStates();setCredentialStates(Object.fromEntries(states.profiles.map(x=>[x.profileUuid,x])))}catch{}
  return p
 }

 async function refreshAllStats(force=true){
  if(allStats.running)return;
  setAllStats({running:true,done:0,total:0});
  try{
   const result=await refreshYoutubeChannelStatistics(force,p=>setAllStats({running:true,...p}));
   setAllStats({running:false,done:result.done,total:result.total});
   if(force){
    if(result.credentialBlocked)toast(`Статистика обновлена частично. Обновлено: ${result.updated}. Требуют восстановления доступа: ${result.credentialBlocked}. YouTube API errors: ${result.failed}.`);
    else toast(result.failed?`Статистика обновлена: ${result.updated}, YouTube API ошибок: ${result.failed}`:`✓ Статистика каналов обновлена: ${result.updated}`);
   }
  }catch(e){
   setAllStats(x=>({...x,running:false}));
   if(force)toast(`Не удалось обновить статистику каналов: ${String(e)}`)
  }
 }

 useEffect(()=>{
  let cancelled=false,stopProgress:(()=>void)|undefined;
  void api.onOauthExistingRecoveryProgress(p=>{
   if(cancelled)return;
   setRecovery(x=>x?{...x,running:true,done:p.done,total:p.total,automaticallyRestored:p.automaticallyRestored,keychainBlocked:p.keychainBlocked,reconnectRequired:p.reconnectRequired,failed:p.failed}:x);
  }).then(stop=>{if(cancelled)stop();else stopProgress=stop});
  void (async()=>{
   try{
    const p=await refresh();
    const version=await api.appVersion();
    const cfg=await api.youtubeGoogleConfig();
    if(cancelled)return;
    setConfig(cfg);
    if(cfg.oauthReady&&p.length&&localStorage.getItem('vyron:oauth-continuity-version')!==version){
     await recoverExistingProfiles(p.length,true,version);
    }
   }catch(e){if(!cancelled)toast(String(e))}
  })();
  return()=>{cancelled=true;stopProgress?.()}
 },[]);

 async function recoverExistingProfiles(totalHint=profiles.length,quiet=false,versionToMark?:string){
  setRecovery({running:true,done:0,total:totalHint,automaticallyRestored:0,ready:0,keychainBlocked:0,reconnectRequired:0,failed:0,manualQueue:0,browserLaunches:0,googleAccountSelectors:0,credentialsDialogs:0,keychainPasswordDialogs:0,youtubeApiRequests:0,videosInsert:0,profiles:[],secretValuesIncluded:false});
  try{
   const result=await api.youtubeOauthRecoverExistingProfiles();
   setRecovery({...result,running:false,done:result.total});
   await refresh();
   const version=versionToMark||await api.appVersion();
   localStorage.setItem('vyron:oauth-continuity-version',version);
   if(!quiet)toast('Каналы сохранены. Автоматически восстановлено: '+result.automaticallyRestored+'. Требуют ручного входа: '+result.manualQueue+'. Браузер автоматически не открывался.');
   return result
  }catch(e){
   setRecovery(null);
   if(!quiet)toast('Автоматическое восстановление OAuth не завершено: '+String(e));
   throw e
  }
 }

 async function importCredentials(fl:FileList|null){
  const selected=fl?.[0];if(!selected)return;
  setBusy(true);
  let continueAdd=false;
  try{
   const c=await api.youtubeImportGoogleConfig(await selected.text(),settings.youtubeApiKey||'');
   setConfig(c);
   if(!c.oauthReady)throw new Error('GLOBAL OAuth Client сохранён, но secure storage всё ещё недоступен.');
   setOauthSetupOpen(false);
   const current=await refresh();
   const result=await recoverExistingProfiles(current.length,false);
   continueAdd=pendingAddAfterGlobalRepair;
   setPendingAddAfterGlobalRepair(false);
   toast('✓ GLOBAL OAuth Client восстановлен. Существующие профили проверены без браузера: '+result.automaticallyRestored+' READY, ручная проверка: '+result.manualQueue+'.');
  }catch(e){toast(String(e))}finally{setBusy(false)}
  if(continueAdd)await openBrowserPicker('');
 }

 async function retryGlobalOauth(){
  if(busy)return;
  setBusy(true);
  let continueAdd=false;
  try{
   const next=await api.youtubeRetryGoogleConfig();setConfig(next);
   if(next.oauthReady){
    setOauthSetupOpen(false);
    const current=await refresh();
    await recoverExistingProfiles(current.length,false);
    continueAdd=pendingAddAfterGlobalRepair;
    setPendingAddAfterGlobalRepair(false);
   }else{
    toast('Keychain пока блокирует Client Secret. Можно выбрать тот же credentials.json OAuth Client VYRON; каналы и Profile UUID не будут удалены.');
   }
  }catch(e){toast(String(e))}finally{setBusy(false)}
  if(continueAdd)await openBrowserPicker('');
 }

 async function openBrowserPicker(profileId:string){
  try{
   const rows=await api.youtubeOauthBrowsers();
   const available=rows.filter(x=>x.available);
   const options=available.some(x=>x.id==='default')?available:[{id:'default',label:'Браузер по умолчанию',available:true},...available];
   setBrowsers(options);
   if(!options.some(x=>x.id===browser))setBrowser('default');
  }catch(e){
   toast('Не удалось определить установленные браузеры, будет использован системный: '+String(e));
   setBrowsers([{id:'default',label:'Браузер по умолчанию',available:true}]);
   setBrowser('default');
  }
  setPendingProfileId(profileId);
  setBrowserOpen(true)
 }

 async function askBrowser(profileId=''){
  if(busy)return;
  if(profileId){setPreReconnectProfileId(profileId);return}
  setBusy(true);
  let ready=false;
  try{
   let readiness:GoogleConfigStatus;
   try{readiness=await api.youtubeGoogleConfig()}catch(e){toast('Не удалось проверить GLOBAL OAuth Client: '+String(e));return}
   setConfig(readiness);
   if(!readiness.oauthReady){setPendingAddAfterGlobalRepair(true);setOauthSetupOpen(true);return}
   ready=true;
  }finally{setBusy(false)}
  if(ready)await openBrowserPicker('')
 }

 async function openYoutubeForProfile(profileId:string,browserChoice?:string){
  const p=profiles.find(x=>x.id===profileId);
  const chosen=browserChoice||p?.preferredBrowser||localStorage.getItem('vyron:oauth-browser')||'default';
  try{await api.youtubeOpenYoutube(chosen)}catch(e){toast('Не удалось открыть YouTube: '+String(e))}
 }

 async function reconnectExisting(profileId:string,browserChoice:string){
  setBusy(true);
  try{
   localStorage.setItem('vyron:oauth-browser',browserChoice);
   const result=await api.youtubeReconnectExisting(profileId,browserChoice);
   if(result.status==='WRONG_CHANNEL'){
    setWrongChannel({...result,browser:browserChoice});
    return
   }
   const p=await refresh();
   const profile=p.find(x=>x.id===profileId);
   if(profile){bindProfile(profile);await refreshProfileStats(profile,true)}
   setHealth(h=>({...h,[profileId]:{ok:true,status:'CONNECTED',channelId:result.authorizedChannelId,channelTitle:result.channelTitle}}));
   resolveOAuthKeychainErrors(profileId);
   journal({eventId:`oauth-profile-reconnected:${profileId}:${Date.now()}`,eventType:'OAUTH_PROFILE_RECONNECTED',status:'SUCCESS',source:'LIVE_OPERATION',profileId,channelId:boundChannel(profile||{id:profileId,channelId:result.authorizedChannelId} as YoutubeProfile)?.id,channelName:result.channelTitle,details:{authorizedChannelId:result.authorizedChannelId,profileUuidPreserved:result.profileUuidPreserved,keychainReadback:result.keychainReadback,youtubeIdentityRequests:result.youtubeIdentityRequests,videosInsert:result.videosInsert}});
   if(result.credentialRotated)journal({eventId:`oauth-credential-rotated:${profileId}:${Date.now()}`,eventType:'OAUTH_CREDENTIAL_ROTATED',status:'SUCCESS',source:'LIVE_OPERATION',profileId,channelId:boundChannel(profile||{id:profileId,channelId:result.authorizedChannelId} as YoutubeProfile)?.id,channelName:result.channelTitle,details:{oldAccount:result.oldRefreshAccount||'',newAccount:result.activeRefreshAccount||'',reason:result.rotationReason||'KEYCHAIN_BLOCKED',osstatus:result.oldRefreshOsstatus??null,generation:result.credentialGeneration||0,profileUuidPreserved:result.profileUuidPreserved}});
   toast(`✓ ${result.channelTitle||result.authorizedChannelId}: Google подключён • Channel ID verified • Profile UUID preserved`);
  }catch(e){
   const message=String(e);
   if(/KEYCHAIN_|NEW_ITEM_READBACK|OAUTH_POST_COMMIT_READ|OAUTH_METADATA_POINTER_COMMIT/i.test(message)){const h=humanizeError(message,'oauth');toast(`${h.title}. ${h.message}`);return}
   toast(message)
  }finally{setBusy(false)}
 }

 async function finishNewChannel(p:YoutubeProfile&{statistics?:YoutubeChannelStatistics}){
  const binding=bindProfile(p);
  if(p.statistics)applyStatistics(p,p.statistics);
  await refresh();
  toast(binding?.mode==='future'
   ?`✓ ${p.channelTitle||p.channelId||'YouTube канал'} привязан к будущему каналу ${binding.channel.name}. Все готовые проекты сохранены.`
   :`✓ ${p.channelTitle||p.channelId||'YouTube канал'} подключён и привязан автоматически`)
 }

 async function chooseNewAuthorizedChannel(channel:OAuthAuthorizedChannel){
  const pending=newChannelSelection;if(!pending)return;
  if(channel.alreadyConnected&&channel.existingProfileId){
   setDuplicate({profileId:channel.existingProfileId,channelId:channel.channelId,title:channel.channelTitle});return
  }
  setBusy(true);
  try{const p=await api.youtubeSelectNewChannel(pending.sessionId,channel.channelId);setNewChannelSelection(null);await finishNewChannel(p)}
  catch(e){const message=String(e);if(message.includes('YOUTUBE_CHANNEL_ALREADY_CONNECTED')){const profileId=message.match(/profile_id=([^;]+)/)?.[1]?.trim()||'';if(profileId){setDuplicate({profileId,channelId:channel.channelId,title:channel.channelTitle});return}}toast(message)}
  finally{setBusy(false)}
 }

 async function cancelNewChannelSelection(){
  const pending=newChannelSelection;setNewChannelSelection(null);
  if(pending)try{await api.youtubeCancelNewChannelSelection(pending.sessionId)}catch{}
 }

 async function connect(){
  const reconnectId=pendingProfileId;
  setBrowserOpen(false);setPendingProfileId('');
  if(reconnectId){await reconnectExisting(reconnectId,browser);return}
  setBusy(true);
  try{
   localStorage.setItem('vyron:oauth-browser',browser);
   const p=await api.youtubeConnectGlobal(browser);
   if(p.status==='CHANNEL_SELECTION_REQUIRED'){setNewChannelSelection(p);return}
   await finishNewChannel(p)
  }catch(e){
   const message=String(e);
   if(message.includes('YOUTUBE_CHANNEL_ALREADY_CONNECTED')){
    const profileId=message.match(/profile_id=([^;]+)/)?.[1]?.trim()||'';
    const channelId=message.match(/channel_id=([^;]+)/)?.[1]?.trim();
    const title=message.match(/title=([^;]+)/)?.[1]?.trim();
    if(profileId){setDuplicate({profileId,channelId,title});return}
   }
   if(/KEYCHAIN_|NEW_ITEM_READBACK|OAUTH_POST_COMMIT_READ|OAUTH_METADATA_POINTER_COMMIT/i.test(message)){const h=humanizeError(message,'oauth');toast(`${h.title}. ${h.message}`);return}
   toast(message)
  }finally{setBusy(false)}
 }
 async function checkProfile(p:YoutubeProfile,quiet=false){
  try{
   const h=await api.youtubeProfileHealth(p.id);
   setHealth(x=>({...x,[p.id]:h}));
   if(h.statistics)applyStatistics(p,h.statistics);
   journal({eventId:`oauth-validation:${p.id}:${Date.now()}`,eventType:'OAUTH_VALIDATION_PASS',status:'SUCCESS',source:'LIVE_OPERATION',profileId:p.id,channelId:boundChannel(p)?.id,channelName:p.channelTitle,details:{youtubeChannelId:p.channelId||'',youtubeApiRequests:1}});
   if(!quiet)toast(`✓ ${h.channelTitle||p.channelTitle||'Канал'}: OAuth READY, YouTube API OK`);
   await refresh();
   return h
  }catch(e){
   const raw=String(e),profileKeychain=/KEYCHAIN_|OAUTH_CREDENTIAL_PRECHECK_FAILED/i.test(raw),globalBlocked=Boolean(config?.repairRequired)||raw.includes('OAUTH_CLIENT_SECRET');
   const h:YoutubeProfileHealth={ok:false,status:profileKeychain?'KEYCHAIN_BLOCKED':globalBlocked?'GLOBAL_OAUTH_REPAIR_REQUIRED':raw.includes('OAUTH_INVALID_GRANT')?'RECONNECT_REQUIRED':'CHECK_FAILED',error:raw};
   setHealth(x=>({...x,[p.id]:h}));
   if(profileKeychain){
    journal({eventId:`oauth-keychain-denied:${p.id}:${Date.now()}`,eventType:'OAUTH_KEYCHAIN_ACCESS_DENIED',status:'FAILED',source:'LIVE_OPERATION',profileId:p.id,channelId:boundChannel(p)?.id,channelName:p.channelTitle,errorCode:'KEYCHAIN_ACCESS_DENIED',details:{youtubeChannelId:p.channelId||'',youtubeApiRequests:0}});
   }
   if(!quiet)toast(profileKeychain?'VYRON не может прочитать OAuth-токен канала. Запрос к YouTube не выполнялся. Выполните безопасную проверку.':globalBlocked?'GLOBAL OAuth Client требует восстановления. Профиль и канал сохранены.':raw);
   return h
  }
 }

 async function safeRetryProfile(p:YoutubeProfile,quiet=false){
  const result=await api.youtubeOauthRetryProfileKeychain(p.id);
  if(result.status==='ACCESSIBLE'){
   resolveOAuthKeychainErrors(p.id);
   journal({eventId:`oauth-keychain-recovered:${p.id}:${Date.now()}`,eventType:'OAUTH_KEYCHAIN_ACCESS_RECOVERED',status:'SUCCESS',source:'LIVE_OPERATION',profileId:p.id,channelId:boundChannel(p)?.id,channelName:p.channelTitle,details:{youtubeChannelId:p.channelId||'',youtubeApiRequests:0}});
   if(!quiet)toast(`✓ ${p.channelTitle||p.channelId||'Канал'}: OAuth-токен снова читается. YouTube API: 0.`);
  }else if(result.status==='KEYCHAIN_BLOCKED'){
   const details:Record<string,string|number|boolean|null>={youtubeChannelId:p.channelId||'',youtubeApiRequests:0};
   if(typeof result.osstatus==='number')details.osstatus=result.osstatus;
   journal({eventId:`oauth-keychain-denied:${p.id}:${Date.now()}`,eventType:'OAUTH_KEYCHAIN_ACCESS_DENIED',status:'FAILED',source:'LIVE_OPERATION',profileId:p.id,channelId:boundChannel(p)?.id,channelName:p.channelTitle,errorCode:result.errorCode||'KEYCHAIN_ACCESS_DENIED',details});
   if(!quiet)toast(`Keychain всё ещё блокирует токен ${p.channelTitle||p.channelId||''}. Password popup не открывался.`);
  }else if(result.status==='MISSING'&&!quiet)toast(`OAuth-токен ${p.channelTitle||p.channelId||''} отсутствует. Переподключение требуется только этому профилю.`);
  await refresh();
  return result
 }

 async function checkAll(){
  setChecking(true);
  try{
   const result=await api.youtubeOauthSafeCheckAllProfiles();
   for(const row of result.profiles){
    const p=profiles.find(x=>x.id===row.profileUuid);if(!p)continue;
    if(row.status==='ACCESSIBLE'){resolveOAuthKeychainErrors(p.id);if(row.recovered)journal({eventId:`oauth-keychain-recovered:${p.id}:${Date.now()}`,eventType:'OAUTH_KEYCHAIN_ACCESS_RECOVERED',status:'SUCCESS',source:'LIVE_OPERATION',profileId:p.id,channelId:boundChannel(p)?.id,channelName:p.channelTitle,details:{youtubeChannelId:p.channelId||'',youtubeApiRequests:0}})}
    else if(row.status==='KEYCHAIN_BLOCKED'){
     const details:Record<string,string|number|boolean|null>={youtubeChannelId:p.channelId||'',youtubeApiRequests:0};
     if(typeof row.osstatus==='number')details.osstatus=row.osstatus;
     journal({eventId:`oauth-keychain-denied:${p.id}:${Date.now()}`,eventType:'OAUTH_KEYCHAIN_ACCESS_DENIED',status:'FAILED',source:'LIVE_OPERATION',profileId:p.id,channelId:boundChannel(p)?.id,channelName:p.channelTitle,errorCode:row.errorCode||'KEYCHAIN_ACCESS_DENIED',details});
    }
   }
   await refresh();
   toast(`Проверка OAuth завершена. Доступны: ${result.accessible}. Автоматически восстановлены: ${result.recoveredAutomatically}. Keychain blocked: ${result.keychainBlocked}. Missing: ${result.missing}. YouTube API requests: 0.`);
  }catch(e){toast(`Безопасная OAuth-проверка не завершена: ${String(e)}`)}
  finally{setChecking(false)}
 }

 const oauthReady=!!config?.oauthReady&&config?.secretOperational!==false;
 const oauthKeychainBlocked=config?.oauthState==='KEYCHAIN_ACCESS_BLOCKED';
 const oauthRepairRequired=!oauthKeychainBlocked&&(Boolean(config?.repairRequired)||config?.oauthState==='NEEDS_SECURE_STORAGE_REPAIR');
 const orphanMappings=reconciliation?.orphanChannels||[];
 const credentialRows=Object.values(credentialStates);
 const oauthOperational=credentialRows.filter(x=>x.credentialState==='READY').length;
 const keychainBlocked=credentialRows.filter(x=>x.credentialState==='KEYCHAIN_BLOCKED').length;
 const reconnectRequired=credentialRows.filter(x=>x.credentialState==='RECONNECT_REQUIRED'||x.credentialState==='MISSING').length;
 const oauthNotChecked=Math.max(0,profiles.length-oauthOperational-keychainBlocked-reconnectRequired);

 return <>
  <div className="pageHeader">
   <div><small>ACCOUNT CENTER</small><h1>Аккаунты YouTube</h1><p>GLOBAL OAuth Client настраивается один раз. «+ Добавить канал» открывает браузер, а Finder используется только для отдельного импорта credentials.json.</p></div>
   <div className="headerActions">
    <button disabled={checking||!profiles.length} onClick={checkAll}>{checking?'Проверяю OAuth…':'✓ Проверить OAuth'}</button>
    <button disabled={allStats.running||!profiles.length} onClick={()=>void refreshAllStats(true)}>{allStats.running?`↻ ${allStats.done} / ${allStats.total}`:'↻ Обновить все'}</button>
    <button className="primary compactAction" disabled={busy} onClick={()=>void askBrowser('')}>+ Добавить канал</button>
   </div>
  </div>

  {allStats.running&&<div className="statsRefreshProgress"><b>Обновление каналов</b><span>{allStats.done} / {allStats.total}</span><i style={{width:`${allStats.total?Math.round(allStats.done/allStats.total*100):0}%`}}/></div>}
  {recovery?.running&&<div className="statsRefreshProgress"><b>Восстановление подключений без повторного входа</b><span>{recovery.done} / {recovery.total}</span><i style={{width:`${recovery.total?Math.round(recovery.done/recovery.total*100):0}%`}}/></div>}
  {recovery&&!recovery.running&&<div className="publisherNotice"><b>Каналы сохранены</b><p>Автоматически восстановлено: <b>{recovery.automaticallyRestored}</b> • Keychain blocked: <b>{recovery.keychainBlocked}</b> • Требуют ручного входа: <b>{recovery.reconnectRequired+recovery.failed}</b> • браузер автоматически открыт: <b>{recovery.browserLaunches}</b>.</p></div>}

  <input ref={file} hidden type="file" accept=".json,application/json" onChange={e=>{void importCredentials(e.target.files);e.currentTarget.value=''}}/>

  <section className="panel googleConfigCard">
   <div><small>GLOBAL GOOGLE CONFIG</small><h3>Одна конфигурация для всех каналов</h3><p>credentials.json нужен один раз на весь VYRON. После этого каждый канал подключается только через выбор браузера и нужного Google-аккаунта.</p></div>
   <div className="configChecks">
    <span className={config?.configured?'good':''}>OAuth Client ID <b>{config?.configured?'✓':'—'}</b></span>
    <span className={config?.projectId?'good':''}>Project <b>{config?.projectId||'—'}</b></span>
    <span className={config?.secretOperational?'good':config?.hasSecret?'warn':''}>Client Secret <b>{config?.secretOperational?'✓':oauthKeychainBlocked?'сохранён • Keychain blocked':config?.hasSecret?'сохранён • не проверен':'—'}</b></span>
    <span className={oauthReady?'good':'warn'}>OAuth <b>{oauthReady?'READY':config?.oauthState||'NOT CONFIGURED'}</b></span>
    <span className={settings.youtubeApiKey?'good':''}>Public API Key <b>{settings.youtubeApiKey?'✓':'не нужен для OAuth'}</b></span>
   </div>
   {oauthKeychainBlocked&&<div className="publisherNotice"><b>Client Secret сохранён, но macOS Keychain сейчас не даёт VYRON его прочитать</b><p>Сначала попробуйте безопасную проверку. Если Keychain продолжает блокировать доступ, можно повторно выбрать тот же credentials.json OAuth Client VYRON. Каналы, Profile UUID и сохранённые подключения не будут удалены.</p>{config?.secureStorageErrorCode&&<small>Диагностика: {config.secureStorageErrorCode}</small>}<button disabled={busy} onClick={()=>void retryGlobalOauth()}>Повторить безопасную проверку</button></div>}
   {oauthRepairRequired&&<div className="publisherNotice"><b>Google OAuth Client Secret действительно отсутствует</b><p>Canonical secure item не найден. Только в этом случае требуется один повторный импорт credentials.json; профили и каналы не удаляются.</p>{config?.secureStorageErrorCode&&<small>Диагностика: {config.secureStorageErrorCode}</small>}</div>}
   {!oauthReady&&!oauthRepairRequired&&!oauthKeychainBlocked&&<div className="publisherNotice"><b>OAuth Client настроен не полностью</b><p>Нужен один credentials.json текущего OAuth Client VYRON. Finder откроется только после явного нажатия кнопки импорта ниже.</p></div>}
   <div className="googleConfigActions"><button disabled={busy} onClick={()=>file.current?.click()}>{oauthKeychainBlocked?'Восстановить через credentials.json':oauthRepairRequired?'Восстановить OAuth Client':oauthReady?'Заменить credentials.json':'Импортировать credentials.json один раз'}</button><label>Public API Key<input type="password" placeholder="опционально" value={settings.youtubeApiKey} onChange={e=>patchSettings({youtubeApiKey:e.target.value.trim()})}/></label></div>
  </section>

  <section className="panel accountsPanel">
   <div className="panelHead"><div><small>YOUTUBE ACCOUNTS</small><h3>{profiles.length?`${profiles.length} OAuth profiles`:orphanMappings.length?`Профили требуют восстановления • ${orphanMappings.length} mappings`:'Аккаунтов пока нет'}</h3>{reconciliation&&<p>Каналов: {reconciliation.channelsTotal} • profiles: {reconciliation.profilesTotal} • mappings: {reconciliation.channelsWithYoutubeProfileId}</p>}{profiles.length>0&&<p>OAuth operational: <b>{oauthOperational}</b> • Keychain blocked: <b>{keychainBlocked}</b> • Reconnect required: <b>{reconnectRequired}</b> • Not checked: <b>{oauthNotChecked}</b></p>}</div>{keychainBlocked>0&&<button disabled={checking} onClick={checkAll}>Повторить безопасную проверку</button>}</div>
   {profiles.length>0&&<details className="advancedPanel"><summary>OAuth credential diagnostics • без secret values</summary><div className="logs">{profiles.map(p=>{const x=credentialStates[p.id],denial=x?.keychainDenial,meta=x?.canonicalRefreshMetadata;return <div key={p.id}><b>{p.channelTitle||p.channelId||p.id}</b><small>Profile UUID: {p.id} • Channel ID: {p.channelId||'—'}</small><small>Canonical refresh: {x?.canonicalRefreshPresent?'PRESENT':'ABSENT'} • current read: {x?.canonicalRefreshAccessibleThisProcess?'ACCESSIBLE':denial?'DENIED':'NOT CHECKED'} • state: {x?.credentialState||'NOT_CHECKED'}</small><small>Metadata: {meta?.metadataEnumeration||'NOT CHECKED'} • generation: {x?.credentialGeneration??0} • OSStatus: {typeof denial?.currentOsstatus==='number'?denial.currentOsstatus:'unknown'} • root: {denial?.originalErrorCode||'—'} • legacy blocked: {x?.legacyBlockedAccounts?.length||0} • last validation: {x?.lastValidationResult||'NOT_RUN'} • {x?.lastValidatedAt?new Date(x.lastValidatedAt).toLocaleString('ru-RU'):'—'}</small></div>})}</div></details>}
   {!profiles.length
    ?<div className="empty">{orphanMappings.length?<><b>Метаданные OAuth-профилей не найдены, но каналы сохранены</b><p>Ничего не удалено автоматически. Исправьте GLOBAL OAuth и проверьте OAuth metadata; массовое переподключение не запускается.</p>{orphanMappings.slice(0,31).map(x=><p key={x.channelId}><b>{x.channelName}</b> • ORPHAN_MAPPING • {x.youtubeProfileId}</p>)}</>:<><b>Подключи первый YouTube-канал</b><p>Настройте GLOBAL OAuth Client один раз, затем нажмите «+ Добавить канал», выберите браузер и нужный Google-аккаунт.</p></>}</div>
    :<div className="accountList">{profiles.map(p=>{
      const h=health[p.id],bound=channels.find(c=>c.youtubeProfileId===p.id||c.youtubeChannelId===p.channelId),stats=bound?.stats,credential=credentialStates[p.id],credentialState=credential?.credentialState||p.credentialStatus||'NOT_CHECKED';
      const oauthOk=!!h?.ok||credentialState==='READY'||p.credentialStatus==='WORKING',oauthNeedsGlobal=oauthRepairRequired&&!h?.ok;
      const syncOk=!!(stats?.statisticsUpdatedAt||stats?.updatedAt)&&!stats?.syncWarning;
      return <article id={`oauth-profile-${p.id}`} className="accountRow accountRowStats" key={p.id}>
       {(h?.thumbnail||stats?.thumbnail)?<img src={h?.thumbnail||stats?.thumbnail} loading="lazy"/>:<div className="accountAvatar">YT</div>}
       <div className="accountMain">
        <b>{h?.channelTitle||p.channelTitle||stats?.channelTitle||'YouTube канал'}</b>
        <small>{stats?.handle?`${stats.handle} • `:''}{p.channelId||'Channel ID ещё не определён'}</small>{p.googleEmail&&<small>Google: {p.googleEmail}</small>}
        <div className="accountBadges">
         <span className={oauthOk?'good':credentialState==='KEYCHAIN_BLOCKED'?'warn':''}>OAuth: {oauthOk?'READY':oauthNeedsGlobal?'GLOBAL REPAIR':credentialState==='KEYCHAIN_BLOCKED'?'KEYCHAIN BLOCKED':credentialState==='RECONNECT_REQUIRED'||credentialState==='MISSING'?'RECONNECT REQUIRED':credentialState==='WRONG_CHANNEL'?'WRONG CHANNEL':'NOT CHECKED'}</span>
         <span className={syncOk?'good':stats?.syncWarning?'warn':''}>YouTube API: {syncOk?'OK':stats?.syncWarning?'WARNING':'CACHE'}</span>
         {p.googleEmail&&<span>Google: {p.googleEmail}</span>}{p.preferredBrowser&&<span>Браузер: {p.preferredBrowser}</span>}
        </div>
        <div className="accountStatsGrid">
         <span><small>👥 Подписчики</small><b title={stats?.hiddenSubscriberCount?'Подписчики скрыты владельцем канала':exactChannelStat(stats?.subscriberCount??stats?.subscribers)}>{subscriberStatLabel(stats)}</b></span>
         <span><small>👁 Всего просмотров</small><b title={exactChannelStat(stats?.viewCount??stats?.views)}>{compactChannelStat(stats?.viewCount??stats?.views)}</b></span>
         <span><small>🎬 Видео</small><b title={exactChannelStat(stats?.videoCount??stats?.videos)}>{compactChannelStat(stats?.videoCount??stats?.videos)}</b></span>
        </div>
        <div className={stats?.syncWarning?'statsState warn':'statsState'}>{channelStatsStatusLabel(stats,!!refreshingStats[p.id])}</div>
       </div>
       <div className="accountMeta">
        <small>Последняя синхронизация</small><b>{formatStatsUpdatedAt(stats?.statisticsUpdatedAt||stats?.updatedAt)}</b>
        <small>Подключён</small><b>{ago(p.connectedAt)}</b>
       </div>
       <div className="accountActions">
        <button className="mini" disabled={busy} onClick={()=>void checkProfile(p)}>Проверить</button>
        {credentialState==='KEYCHAIN_BLOCKED'&&<button className="mini" disabled={busy} onClick={()=>void safeRetryProfile(p)}>Безопасный retry</button>}
        <button className="mini" disabled={!!refreshingStats[p.id]} onClick={()=>void refreshProfileStats(p)}>{refreshingStats[p.id]?'↻ Обновление…':'↻ Обновить'}</button>
        <button className="mini" disabled={busy} onClick={()=>void askBrowser(p.id)}>{credentialState==='KEYCHAIN_BLOCKED'?'Войти заново через браузер':'Переподключить через браузер'}</button>
        <button className="danger mini" disabled={busy} onClick={async()=>{await api.youtubeDisconnect(p.id);await refresh()}}>Удалить</button>
       </div>
      </article>
     })}</div>
   }
  </section>

  {oauthSetupOpen&&<div className="modalBackdrop" onMouseDown={()=>{setOauthSetupOpen(false);setPendingAddAfterGlobalRepair(false)}}>
   <section className="confirmModal oauthSetupModal" onMouseDown={e=>e.stopPropagation()}>
    <small>GLOBAL GOOGLE OAUTH</small>
    <h2>{oauthKeychainBlocked?'VYRON не может прочитать OAuth Client Secret':oauthRepairRequired?'Google OAuth Client требует восстановления':'Google OAuth Client ещё не настроен'}</h2>
    <p>{oauthKeychainBlocked?'Сначала попробуйте безопасную проверку. Если Keychain продолжает блокировать доступ, выберите тот же credentials.json OAuth Client VYRON. Каналы, Profile UUID и сохранённые подключения останутся на месте.':oauthRepairRequired?'Выберите тот же credentials.json один раз. Профили и каналы не удаляются; меняется только GLOBAL secure credential после успешного readback.':'Для подключения YouTube-каналов один раз импортируйте credentials.json вашего VYRON OAuth Client.'}</p>
    {pendingAddAfterGlobalRepair&&<p className="note">После восстановления VYRON автоматически продолжит «+ Добавить канал» и откроет выбор браузера — повторно нажимать кнопку не нужно.</p>}
    <footer><button onClick={()=>{setOauthSetupOpen(false);setPendingAddAfterGlobalRepair(false)}}>Отмена</button>{oauthKeychainBlocked&&<button disabled={busy} onClick={()=>void retryGlobalOauth()}>Повторить безопасную проверку</button>}<button className="primary" onClick={()=>file.current?.click()}>{oauthKeychainBlocked?'Выбрать credentials.json':oauthRepairRequired?'Восстановить OAuth Client':'Импортировать credentials.json'}</button></footer>
   </section>
  </div>}

  {preReconnectProfileId&&(()=>{const p=profiles.find(x=>x.id===preReconnectProfileId),bound=p?channels.find(c=>c.youtubeProfileId===p.id||c.youtubeChannelId===p.channelId):undefined,stats=bound?.stats;return <div className="modalBackdrop" onMouseDown={()=>setPreReconnectProfileId('')}>
   <section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}>
    <small>ПЕРЕПОДКЛЮЧЕНИЕ СУЩЕСТВУЮЩЕГО ПРОФИЛЯ</small>
    <h2>Переподключение {p?.channelTitle||bound?.name||'YouTube-канала'}</h2>
    <p>Нужно войти в сохранённый Google-аккаунт и авторизовать именно ожидаемый YouTube-канал. Email помогает выбрать аккаунт, но authoritative identity остаётся Profile UUID + YouTube Channel ID.</p>
    <div className="publisherNotice"><b>{p?.channelTitle||bound?.name||'YouTube канал'}</b>{p?.googleEmail&&<p>Нужно войти в Google-аккаунт: <b>{p.googleEmail}</b></p>}{stats?.handle&&<p>{stats.handle}</p>}<p>Expected YouTube Channel ID: <code>{p?.channelId||'—'}</code></p></div>
    <footer><button onClick={()=>setPreReconnectProfileId('')}>Отмена</button><button onClick={()=>void openYoutubeForProfile(preReconnectProfileId)}>Открыть YouTube</button><button className="primary" onClick={()=>{const id=preReconnectProfileId;setPreReconnectProfileId('');void openBrowserPicker(id)}}>Выбрать браузер и продолжить</button></footer>
   </section>
  </div>})()}

  {wrongChannel&&<div className="modalBackdrop" onMouseDown={()=>setWrongChannel(null)}>
   <section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}>
    <small>YOUTUBE IDENTITY</small>
    <h2>{wrongChannel.code==='WRONG_ACCOUNT'?'Вы вошли не в тот Google-аккаунт':'Выбран другой YouTube-канал'}</h2>
    <p>Вы пытаетесь восстановить <b>{wrongChannel.expectedChannelTitle||profiles.find(x=>x.id===wrongChannel.profileId)?.channelTitle||'сохранённый канал'}</b>, но Google вернул другую сохранённую identity. VYRON не изменил привязку и не сохранил новые credentials.</p>
    <div className="publisherNotice"><b>Нужно авторизовать</b><p>{wrongChannel.expectedChannelTitle||'Сохранённый канал'} • <code>{wrongChannel.expectedChannelId}</code></p></div>
    <div className="browserGrid">{wrongChannel.authorizedChannels.map(ch=><div key={ch.channelId} className="settingsCard">{ch.thumbnail&&<img src={ch.thumbnail} loading="lazy"/>}<b>{ch.channelTitle}</b>{ch.handle&&<small>{ch.handle}</small>}<small>{ch.channelId}</small>{ch.alreadyConnected&&<small>Уже подключён в VYRON</small>}{ch.alreadyConnected&&ch.existingProfileId&&<button onClick={()=>{const id=ch.existingProfileId!;setWrongChannel(null);window.setTimeout(()=>document.getElementById(`oauth-profile-${id}`)?.scrollIntoView({behavior:'smooth',block:'center'}),50)}}>Открыть этот канал в VYRON</button>}</div>)}</div>
    <details><summary>Технические сведения</summary><p>Profile UUID: <code>{wrongChannel.profileId}</code></p>{wrongChannel.expectedGoogleEmail&&<p>Expected Google: <code>{wrongChannel.expectedGoogleEmail}</code></p>}{wrongChannel.authorizedGoogleEmail&&<p>Received Google: <code>{wrongChannel.authorizedGoogleEmail}</code></p>}<p>Expected Channel ID: <code>{wrongChannel.expectedChannelId}</code></p><p>Authorized Channel ID(s): {wrongChannel.authorizedChannels.map(x=>x.channelId).join(', ')||'NONE'}</p><p>Browser: {wrongChannel.browser}</p><p>credentialsCommitted=false</p></details>
    <footer><button onClick={()=>setWrongChannel(null)}>Отмена</button><button onClick={()=>void api.youtubeOpenYoutube(wrongChannel.browser)}>Открыть YouTube</button><button onClick={()=>{const w=wrongChannel;setWrongChannel(null);void openBrowserPicker(w.profileId)}}>Выбрать другой браузер</button><button className="primary" onClick={()=>{const w=wrongChannel;setWrongChannel(null);void reconnectExisting(w.profileId,w.browser)}}>Попробовать ещё раз</button></footer>
   </section>
  </div>}

  {newChannelSelection&&<div className="modalBackdrop" onMouseDown={()=>void cancelNewChannelSelection()}>
   <section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}>
    <small>НОВЫЙ YOUTUBE-КАНАЛ</small>
    <h2>Какой YouTube-канал добавить?</h2>
    <p>Google-аккаунт открыл несколько YouTube/Brand Account identities. VYRON ничего не сохранил до вашего выбора.</p>
    <div className="browserGrid">{newChannelSelection.channels.map(ch=><button key={ch.channelId} disabled={busy||ch.alreadyConnected} onClick={()=>void chooseNewAuthorizedChannel(ch)}>{ch.thumbnail&&<img src={ch.thumbnail} loading="lazy"/>}<b>{ch.channelTitle}</b>{ch.handle&&<small>{ch.handle}</small>}<small>{ch.channelId}</small><small>{ch.alreadyConnected?'Уже подключён в VYRON':'Добавить этот канал'}</small></button>)}</div>
    <footer><button onClick={()=>void cancelNewChannelSelection()}>Отмена</button></footer>
   </section>
  </div>}
  {browserOpen&&<div className="modalBackdrop" onMouseDown={()=>{setBrowserOpen(false);setPendingProfileId('')}}>
   <section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}>
    <small>GOOGLE OAUTH</small>
    <h2>{pendingProfileId?'Выберите браузер для переподключения':'Выберите браузер для Google авторизации'}</h2>
    <p>Показываются только браузеры, которые VYRON нашёл на этом Mac. Google отдельно покажет выбор нужного аккаунта.</p>
    <div className="browserGrid">{browsers.map(x=><button key={x.id} className={browser===x.id?'active':''} onClick={()=>setBrowser(x.id)}><b>{x.label}</b><small>{x.id==='default'?'Системный браузер':'Открыть Google OAuth именно здесь'}</small></button>)}</div>
    <footer><button onClick={()=>{setBrowserOpen(false);setPendingProfileId('')}}>Отмена</button><button className="primary" onClick={()=>void connect()}>Продолжить через {browsers.find(x=>x.id===browser)?.label||'браузер'}</button></footer>
   </section>
  </div>}

  {duplicate&&<div className="modalBackdrop" onMouseDown={()=>setDuplicate(null)}>
   <section className="confirmModal duplicateChannelModal" onMouseDown={e=>e.stopPropagation()}>
    <small>YOUTUBE CHANNEL</small>
    <h2>Этот YouTube-канал уже подключён</h2>
    <p><b>{duplicate.title||duplicate.channelId||'YouTube канал'}</b></p>
    {duplicate.channelId&&<p>{duplicate.channelId}</p>}
    <p>Новый профиль не создан. Можно явно переподключить существующий Profile UUID или отменить действие.</p>
    <footer><button onClick={()=>setDuplicate(null)}>Отмена</button><button className="primary" onClick={()=>{const id=duplicate.profileId;setDuplicate(null);void askBrowser(id)}}>Переподключить</button></footer>
   </section>
  </div>}
 </>
}
