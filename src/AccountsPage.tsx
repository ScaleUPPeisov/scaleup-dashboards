import React,{useEffect,useRef,useState} from 'react';
import {api,type GoogleConfigStatus,type OAuthReconciliationDiagnostic,type YoutubeProfileHealth} from './api';
import {useApp} from './store';
import type {YoutubeProfile,YoutubeChannelStatistics} from './types';
import {findFutureChannelMatch} from './channelIdentity';
import {channelStatsStatusLabel,compactChannelStat,exactChannelStat,formatStatsUpdatedAt,normalizeChannelStatistics,subscriberStatLabel} from './youtubeChannelStats';
import {refreshYoutubeChannelStatistics,refreshYoutubeProfileStatistics,type ChannelStatisticsRefreshProgress} from './youtubeChannelStatsRuntime';

type BrowserOption={id:string;label:string;available:boolean};
type DuplicateChannel={profileId:string;channelId?:string;title?:string};
const ago=(iso?:string)=>{if(!iso)return '—';const ms=Date.now()-new Date(iso).getTime();const m=Math.max(0,Math.round(ms/60000));return m<1?'только что':m<60?`${m} мин. назад`:m<1440?`${Math.round(m/60)} ч. назад`:`${Math.round(m/1440)} дн. назад`};

export function AccountsPage(){
 const channels=useApp(s=>s.channels),toast=useApp(s=>s.toast),settings=useApp(s=>s.settings),patchSettings=useApp(s=>s.patchSettings);
 const [profiles,setProfiles]=useState<YoutubeProfile[]>([]);
 const [health,setHealth]=useState<Record<string,YoutubeProfileHealth>>({});
 const [config,setConfig]=useState<GoogleConfigStatus|null>(null);
 const [reconciliation,setReconciliation]=useState<OAuthReconciliationDiagnostic|null>(null);
 const [busy,setBusy]=useState(false),[checking,setChecking]=useState(false);
 const [browserOpen,setBrowserOpen]=useState(false),[browsers,setBrowsers]=useState<BrowserOption[]>([]);
 const [browser,setBrowser]=useState(localStorage.getItem('vyron:oauth-browser')||'default');
 const [pendingProfileId,setPendingProfileId]=useState('');
 const [oauthSetupOpen,setOauthSetupOpen]=useState(false);
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
  return p
 }

 async function refreshAllStats(force=true){
  if(allStats.running)return;
  setAllStats({running:true,done:0,total:0});
  try{
   const result=await refreshYoutubeChannelStatistics(force,p=>setAllStats({running:true,...p}));
   setAllStats({running:false,done:result.done,total:result.total});
   if(force)toast(result.failed?`Статистика обновлена: ${result.updated}, ошибок: ${result.failed}`:`✓ Статистика каналов обновлена: ${result.updated}`);
  }catch(e){
   setAllStats(x=>({...x,running:false}));
   if(force)toast(`Не удалось обновить статистику каналов: ${String(e)}`)
  }
 }

 useEffect(()=>{
  let cancelled=false;
  void (async()=>{
   try{
    await refresh();
    if(!cancelled)void refreshAllStats(false);
   }catch(e){if(!cancelled)toast(String(e))}
  })();
  return()=>{cancelled=true}
 },[]);

 async function importCredentials(fl:FileList|null){
  const selected=fl?.[0];if(!selected)return;
  setBusy(true);
  try{
   const c=await api.youtubeImportGoogleConfig(await selected.text(),settings.youtubeApiKey||'');
   setConfig(c);
   if(c.oauthReady)setOauthSetupOpen(false);
   await refresh();
   toast(c.oauthReady?'✓ OAuth Client восстановлен и реально читается текущей версией VYRON.':'OAuth Client сохранён, но secure storage всё ещё требует восстановления.')
  }catch(e){toast(String(e))}finally{setBusy(false)}
 }

 async function askBrowser(profileId=''){
  if(busy)return;
  setBusy(true);
  try{
   if(!profileId){
    let readiness:GoogleConfigStatus;
    try{readiness=await api.youtubeGoogleConfig()}catch(e){toast(`Не удалось проверить GLOBAL OAuth Client: ${String(e)}`);return}
    setConfig(readiness);
    if(!readiness.oauthReady){
     setOauthSetupOpen(true);
     return
    }
   }
   try{
    const rows=await api.youtubeOauthBrowsers();
    const available=rows.filter(x=>x.available);
    const options=available.some(x=>x.id==='default')?available:[{id:'default',label:'Браузер по умолчанию',available:true},...available];
    setBrowsers(options);
    if(!options.some(x=>x.id===browser))setBrowser('default');
   }catch(e){
    toast(`Не удалось определить установленные браузеры, будет использован системный: ${String(e)}`);
    setBrowsers([{id:'default',label:'Браузер по умолчанию',available:true}]);
    setBrowser('default');
   }
   setPendingProfileId(profileId);
   setBrowserOpen(true)
  }finally{setBusy(false)}
 }

 async function connect(){
  const reconnectId=pendingProfileId;
  setBrowserOpen(false);setPendingProfileId('');setBusy(true);
  try{
   localStorage.setItem('vyron:oauth-browser',browser);
   if(reconnectId){
    const result=await api.youtubeReconnectExisting(reconnectId,browser);
    const p=await refresh();
    const profile=p.find(x=>x.id===reconnectId);
    if(profile){bindProfile(profile);await refreshProfileStats(profile,true)}
    setHealth(h=>({...h,[reconnectId]:{ok:true,status:'CONNECTED',channelId:result.authorizedChannelId,channelTitle:result.channelTitle}}));
    toast(`✓ ${result.channelTitle||result.authorizedChannelId} переподключён. Profile UUID сохранён.`);
    return
   }
   const p=await api.youtubeConnectGlobal(browser);
   const binding=bindProfile(p);
   if(p.statistics)applyStatistics(p,p.statistics);
   await refresh();
   toast(binding?.mode==='future'
      ?`✓ ${p.channelTitle||p.channelId||'YouTube канал'} привязан к будущему каналу ${binding.channel.name}. Все готовые проекты сохранены.`
      :`✓ ${p.channelTitle||p.channelId||'YouTube канал'} подключён и привязан автоматически`)
  }catch(e){
   const message=String(e);
   if(message.includes('YOUTUBE_CHANNEL_ALREADY_CONNECTED')){
    const profileId=message.match(/profile_id=([^;]+)/)?.[1]?.trim()||'';
    const channelId=message.match(/channel_id=([^;]+)/)?.[1]?.trim();
    const title=message.match(/title=([^;]+)/)?.[1]?.trim();
    if(profileId){setDuplicate({profileId,channelId,title});return}
   }
   toast(message)
  }finally{setBusy(false)}
 }

 async function checkProfile(p:YoutubeProfile,quiet=false){
  try{
   const h=await api.youtubeProfileHealth(p.id);
   setHealth(x=>({...x,[p.id]:h}));
   if(h.statistics)applyStatistics(p,h.statistics);
   if(!quiet)toast(`✓ ${h.channelTitle||p.channelTitle||'Канал'}: OAuth READY, YouTube API OK`);
   return h
  }catch(e){
   const raw=String(e),globalBlocked=Boolean(config?.repairRequired)||raw.includes('KEYCHAIN_ACCESS_DENIED')||raw.includes('OAUTH_CLIENT_SECRET');
   const h:YoutubeProfileHealth={ok:false,status:globalBlocked?'GLOBAL_OAUTH_REPAIR_REQUIRED':'RECONNECT_REQUIRED',error:raw};
   setHealth(x=>({...x,[p.id]:h}));
   if(!quiet)toast(globalBlocked?'Google OAuth Client требует восстановления. Профиль и канал сохранены.':raw);
   return h
  }
 }

 async function checkAll(){
  setChecking(true);
  try{for(const p of profiles)await checkProfile(p,true)}finally{setChecking(false)}
 }

 const oauthReady=!!config?.oauthReady&&config?.secretOperational!==false;
 const oauthRepairRequired=Boolean(config?.repairRequired)||config?.oauthState==='NEEDS_SECURE_STORAGE_REPAIR';
 const orphanMappings=reconciliation?.orphanChannels||[];

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

  <input ref={file} hidden type="file" accept=".json,application/json" onChange={e=>{void importCredentials(e.target.files);e.currentTarget.value=''}}/>

  <section className="panel googleConfigCard">
   <div><small>GLOBAL GOOGLE CONFIG</small><h3>Одна конфигурация для всех каналов</h3><p>credentials.json нужен один раз на весь VYRON. После этого каждый канал подключается только через выбор браузера и нужного Google-аккаунта.</p></div>
   <div className="configChecks">
    <span className={config?.configured?'good':''}>OAuth Client ID <b>{config?.configured?'✓':'—'}</b></span>
    <span className={config?.projectId?'good':''}>Project <b>{config?.projectId||'—'}</b></span>
    <span className={config?.secretOperational?'good':config?.hasSecret?'warn':''}>Client Secret <b>{config?.secretOperational?'✓':config?.hasSecret?'требуется восстановление':'—'}</b></span>
    <span className={oauthReady?'good':'warn'}>OAuth <b>{oauthReady?'READY':config?.oauthState||'NOT CONFIGURED'}</b></span>
    <span className={settings.youtubeApiKey?'good':''}>Public API Key <b>{settings.youtubeApiKey?'✓':'не нужен для OAuth'}</b></span>
   </div>
   {oauthRepairRequired&&<div className="publisherNotice"><b>Google OAuth требует восстановления</b><p>Защищённый Client Secret недоступен текущей версии VYRON. Каналы, профили, расписания и сохранённая статистика не удалены. Импортируйте тот же credentials.json один раз — VYRON создаст новый защищённый secure item без запроса пароля macOS.</p>{config?.secureStorageErrorCode&&<small>Диагностика: {config.secureStorageErrorCode}</small>}</div>}
   {!oauthReady&&!oauthRepairRequired&&<div className="publisherNotice"><b>OAuth Client настроен не полностью</b><p>Нужен один credentials.json текущего OAuth Client VYRON. Finder откроется только после явного нажатия кнопки импорта ниже.</p></div>}
   <div className="googleConfigActions"><button disabled={busy} onClick={()=>file.current?.click()}>{oauthRepairRequired?'Восстановить OAuth Client':oauthReady?'Заменить credentials.json':'Импортировать credentials.json один раз'}</button><label>Public API Key<input type="password" placeholder="опционально" value={settings.youtubeApiKey} onChange={e=>patchSettings({youtubeApiKey:e.target.value.trim()})}/></label></div>
  </section>

  <section className="panel accountsPanel">
   <div className="panelHead"><div><small>YOUTUBE ACCOUNTS</small><h3>{profiles.length?`${profiles.length} OAuth profiles`:orphanMappings.length?`Профили требуют восстановления • ${orphanMappings.length} mappings`:'Аккаунтов пока нет'}</h3>{reconciliation&&<p>Каналов: {reconciliation.channelsTotal} • profiles: {reconciliation.profilesTotal} • mappings: {reconciliation.channelsWithYoutubeProfileId}</p>}</div></div>
   {!profiles.length
    ?<div className="empty">{orphanMappings.length?<><b>Метаданные OAuth-профилей не найдены, но каналы сохранены</b><p>Ничего не удалено автоматически. Исправьте GLOBAL OAuth и проверьте OAuth metadata; массовое переподключение не запускается.</p>{orphanMappings.slice(0,31).map(x=><p key={x.channelId}><b>{x.channelName}</b> • ORPHAN_MAPPING • {x.youtubeProfileId}</p>)}</>:<><b>Подключи первый YouTube-канал</b><p>Настройте GLOBAL OAuth Client один раз, затем нажмите «+ Добавить канал», выберите браузер и нужный Google-аккаунт.</p></>}</div>
    :<div className="accountList">{profiles.map(p=>{
      const h=health[p.id],bound=channels.find(c=>c.youtubeProfileId===p.id||c.youtubeChannelId===p.channelId),stats=bound?.stats;
      const oauthOk=!!h?.ok||p.credentialStatus==='WORKING',oauthNeedsGlobal=oauthRepairRequired&&!h?.ok;
      const syncOk=!!(stats?.statisticsUpdatedAt||stats?.updatedAt)&&!stats?.syncWarning;
      return <article className="accountRow accountRowStats" key={p.id}>
       {(h?.thumbnail||stats?.thumbnail)?<img src={h?.thumbnail||stats?.thumbnail} loading="lazy"/>:<div className="accountAvatar">YT</div>}
       <div className="accountMain">
        <b>{h?.channelTitle||p.channelTitle||stats?.channelTitle||'YouTube канал'}</b>
        <small>{stats?.handle?`${stats.handle} • `:''}{p.channelId||'Channel ID ещё не определён'}</small>
        <div className="accountBadges">
         <span className={oauthOk?'good':'warn'}>OAuth: {oauthOk?'READY':oauthNeedsGlobal?'GLOBAL REPAIR':h?'RECONNECT':p.credentialStatus==='CHECK_ON_USE'?'CHECK ON USE':'не проверен'}</span>
         <span className={syncOk?'good':stats?.syncWarning?'warn':''}>YouTube API: {syncOk?'OK':stats?.syncWarning?'WARNING':'CACHE'}</span>
         {p.preferredBrowser&&<span>Браузер: {p.preferredBrowser}</span>}
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
        <button className="mini" disabled={!!refreshingStats[p.id]} onClick={()=>void refreshProfileStats(p)}>{refreshingStats[p.id]?'↻ Обновление…':'↻ Обновить'}</button>
        <button className="mini" disabled={busy} onClick={()=>void askBrowser(p.id)}>Переподключить</button>
        <button className="danger mini" disabled={busy} onClick={async()=>{await api.youtubeDisconnect(p.id);await refresh()}}>Удалить</button>
       </div>
      </article>
     })}</div>
   }
  </section>

  {oauthSetupOpen&&<div className="modalBackdrop" onMouseDown={()=>setOauthSetupOpen(false)}>
   <section className="confirmModal oauthSetupModal" onMouseDown={e=>e.stopPropagation()}>
    <small>GLOBAL GOOGLE OAUTH</small>
    <h2>{oauthRepairRequired?'Google OAuth Client требует восстановления':'Google OAuth Client ещё не настроен'}</h2>
    <p>{oauthRepairRequired?'Выберите тот же credentials.json один раз. Профили и каналы не удаляются; VYRON перепишет только GLOBAL secure credential в новый защищённый item и проверит readback.':'Для подключения YouTube-каналов сначала один раз импортируйте credentials.json вашего VYRON OAuth Client. После этого «+ Добавить канал» будет открывать выбор браузера, а не Finder.'}</p>
    <footer><button onClick={()=>setOauthSetupOpen(false)}>Отмена</button><button className="primary" onClick={()=>file.current?.click()}>{oauthRepairRequired?'Восстановить OAuth Client':'Импортировать credentials.json'}</button></footer>
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
