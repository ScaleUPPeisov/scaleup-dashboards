import React,{useEffect,useRef,useState} from 'react';
import {api,type GoogleConfigStatus,type YoutubeProfileHealth} from './api';
import {useApp} from './store';
import type {YoutubeProfile} from './types';
import {findFutureChannelMatch} from './channelIdentity';

type BrowserOption={id:string;label:string;available:boolean};
const ago=(iso?:string)=>{if(!iso)return '—';const ms=Date.now()-new Date(iso).getTime();const m=Math.max(0,Math.round(ms/60000));return m<1?'только что':m<60?`${m} мин. назад`:m<1440?`${Math.round(m/60)} ч. назад`:`${Math.round(m/1440)} дн. назад`};

export function AccountsPage(){
 const channels=useApp(s=>s.channels),toast=useApp(s=>s.toast),settings=useApp(s=>s.settings),patchSettings=useApp(s=>s.patchSettings);
 const [profiles,setProfiles]=useState<YoutubeProfile[]>([]),[health,setHealth]=useState<Record<string,YoutubeProfileHealth>>({}),[config,setConfig]=useState<GoogleConfigStatus|null>(null),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[browserOpen,setBrowserOpen]=useState(false),[browsers,setBrowsers]=useState<BrowserOption[]>([]),[browser,setBrowser]=useState(localStorage.getItem('vyron:oauth-browser')||'default'),[pendingProfileId,setPendingProfileId]=useState('');const file=useRef<HTMLInputElement>(null);

 function bindProfile(p:YoutubeProfile){
  if(!p.channelId)return;
  const state=useApp.getState();
  const exact=state.channels.find(x=>x.youtubeChannelId===p.channelId||x.youtubeProfileId===p.id);
  if(exact){state.updateChannel(exact.id,{youtubeProfileId:p.id,youtubeChannelId:p.channelId});return{channel:exact,mode:'existing' as const}}
  const future=findFutureChannelMatch(state.channels,p.channelTitle);
  if(future){state.updateChannel(future.id,{youtubeProfileId:p.id,youtubeChannelId:p.channelId});return{channel:future,mode:'future' as const}}
  const created=state.addChannel({name:p.channelTitle||'YouTube канал',youtubeProfileId:p.id,youtubeChannelId:p.channelId});return{channel:created,mode:'created' as const}
 }

 async function refresh(){
  const [p,c]=await Promise.all([api.youtubeProfiles(),api.youtubeGoogleConfig()]);
  setProfiles(p);setConfig(c);
  for(const profile of p)bindProfile(profile);
  return p
 }

 useEffect(()=>{void refresh().catch(e=>toast(String(e)))},[]);

 async function importCredentials(fl:FileList|null){
  const selected=fl?.[0];if(!selected)return;
  setBusy(true);
  try{
   const c=await api.youtubeImportGoogleConfig(await selected.text(),settings.youtubeApiKey||'');
   setConfig(c);
   toast(c.oauthReady?'✓ OAuth Client VYRON настроен. Теперь для каналов нужен только выбор браузера и Google-аккаунта.':'OAuth Client сохранён, но Client Secret всё ещё отсутствует.')
  }catch(e){toast(String(e))}finally{setBusy(false)}
 }

 async function askBrowser(profileId=''){
  if(busy)return;
  if(!profileId&&!config?.oauthReady){
   toast('Сначала один раз настройте GLOBAL OAuth Client VYRON через credentials.json. Отдельный credentials.json для каждого канала не нужен.');
   file.current?.click();
   return
  }
  setBusy(true);
  try{
   const rows=await api.youtubeOauthBrowsers();
   const available=rows.filter(x=>x.available);
   setBrowsers(available.length?available:[{id:'default',label:'Браузер по умолчанию',available:true}]);
   if(!available.some(x=>x.id===browser))setBrowser('default');
   setPendingProfileId(profileId);
   setBrowserOpen(true)
  }catch{
   setBrowsers([{id:'default',label:'Браузер по умолчанию',available:true}]);
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
    if(profile)bindProfile(profile);
    setHealth(h=>({...h,[reconnectId]:{ok:true,status:'CONNECTED',channelId:result.authorizedChannelId,channelTitle:result.channelTitle}}));
    toast(`✓ ${result.channelTitle||result.authorizedChannelId} переподключён. Profile UUID сохранён.`);
    return
   }
   const p=await api.youtubeConnectGlobal(browser);
   const binding=bindProfile(p);
   await refresh();
   toast(binding?.mode==='existing'
    ?`✓ ${p.channelTitle||p.channelId||'YouTube канал'} переавторизован и привязан к существующему каналу без нового Profile UUID.`
    :binding?.mode==='future'
      ?`✓ ${p.channelTitle||p.channelId||'YouTube канал'} привязан к будущему каналу ${binding.channel.name}. Все готовые проекты сохранены.`
      :`✓ ${p.channelTitle||p.channelId||'YouTube канал'} подключён и привязан автоматически`)
  }catch(e){toast(String(e))}finally{setBusy(false)}
 }

 async function checkAll(){
  setChecking(true);
  const next:Record<string,YoutubeProfileHealth>={};
  for(const p of profiles){
   try{next[p.id]=await api.youtubeProfileHealth(p.id)}
   catch(e){next[p.id]={ok:false,status:'RECONNECT_REQUIRED',error:String(e)}}
  }
  setHealth(next);setChecking(false)
 }

 const oauthReady=!!config?.oauthReady;

 return <>
  <div className="pageHeader">
   <div><small>ACCOUNT CENTER</small><h1>Аккаунты YouTube</h1><p>Один GLOBAL Google OAuth Client обслуживает все каналы. Для существующего канала нажмите «Переподключить», выберите браузер с нужным Google/YouTube аккаунтом — Profile UUID и Channel ID сохранятся.</p></div>
   <div className="headerActions">
    <button disabled={checking||!profiles.length} onClick={checkAll}>{checking?'Проверяю…':'↻ Проверить'}</button>
    <button className="primary compactAction" disabled={busy} onClick={()=>void askBrowser('')}>+ Добавить канал</button>
   </div>
  </div>

  <input ref={file} hidden type="file" accept=".json,application/json" onChange={e=>{void importCredentials(e.target.files);e.currentTarget.value=''}}/>

  <section className="panel googleConfigCard">
   <div><small>GLOBAL GOOGLE CONFIG</small><h3>Одна конфигурация для всех каналов</h3><p>credentials.json нужен один раз на весь VYRON. После этого каждый канал подключается только через выбор браузера и нужного Google-аккаунта.</p></div>
   <div className="configChecks">
    <span className={config?.configured?'good':''}>OAuth Client ID <b>{config?.configured?'✓':'—'}</b></span>
    <span className={config?.projectId?'good':''}>Project <b>{config?.projectId||'—'}</b></span>
    <span className={config?.hasSecret?'good':''}>Client Secret <b>{config?.hasSecret?'✓':'—'}</b></span>
    <span className={oauthReady?'good':'warn'}>OAuth Ready <b>{oauthReady?'✓':'—'}</b></span>
    <span className={settings.youtubeApiKey?'good':''}>Public API Key <b>{settings.youtubeApiKey?'✓':'не нужен для OAuth'}</b></span>
   </div>
   {!oauthReady&&<div className="publisherNotice"><b>OAuth Client настроен не полностью</b><p>Нужен один credentials.json текущего OAuth Client VYRON. Не импортируйте credentials отдельно для 17 каналов.</p></div>}
   <div className="googleConfigActions"><button disabled={busy} onClick={()=>file.current?.click()}>{oauthReady?'Заменить credentials.json':'Импортировать credentials.json один раз'}</button><label>Public API Key<input type="password" placeholder="опционально" value={settings.youtubeApiKey} onChange={e=>patchSettings({youtubeApiKey:e.target.value.trim()})}/></label></div>
  </section>

  <section className="panel accountsPanel">
   <div className="panelHead"><div><small>YOUTUBE ACCOUNTS</small><h3>{profiles.length?`${profiles.length} OAuth profiles`:'Аккаунтов пока нет'}</h3></div></div>
   {!profiles.length
    ?<div className="empty"><b>Подключи первый YouTube-канал</b><p>Сначала один раз настройте GLOBAL OAuth Client, затем VYRON спросит браузер и после OAuth привяжет реальный канал.</p></div>
    :<div className="accountList">{profiles.map(p=>{
      const h=health[p.id];
      const bound=channels.find(c=>c.youtubeProfileId===p.id||c.youtubeChannelId===p.channelId);
      return <article className="accountRow" key={p.id}>
       {h?.thumbnail?<img src={h.thumbnail} loading="lazy"/>:<div className="accountAvatar">YT</div>}
       <div className="accountMain"><b>{h?.channelTitle||p.channelTitle||'YouTube канал'}</b><small>{p.channelId||'Channel ID ещё не определён'}</small><div className="accountBadges"><span className={h?.ok?'good':'warn'}>{h?.ok?'● OAuth healthy':h?'● Требуется переподключение':'● Статус не проверен'}</span><span>{bound?`VYRON YT PEISOV: ${bound.name}`:'Автопривязка…'}</span>{p.preferredBrowser&&<span>Браузер: {p.preferredBrowser}</span>}</div></div>
       <div className="accountMeta"><small>Подключён</small><b>{ago(p.connectedAt)}</b><small>Token</small><b>{h?.status||'—'}</b></div>
       <div className="accountActions"><button className="mini" disabled={busy} onClick={()=>void askBrowser(p.id)}>Переподключить</button><button className="danger mini" disabled={busy} onClick={async()=>{await api.youtubeDisconnect(p.id);await refresh()}}>Отключить</button></div>
      </article>
     })}</div>
   }
  </section>

  {browserOpen&&<div className="modalBackdrop" onMouseDown={()=>{setBrowserOpen(false);setPendingProfileId('')}}>
   <section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}>
    <small>GOOGLE OAUTH</small>
    <h2>{pendingProfileId?'Через какой браузер переподключить этот канал?':'Через какой браузер добавить канал?'}</h2>
    <p>Выбери браузер, где уже открыт нужный Gmail/YouTube аккаунт. OAuth откроется именно там.</p>
    <div className="browserGrid">{browsers.map(x=><button key={x.id} className={browser===x.id?'active':''} onClick={()=>setBrowser(x.id)}><b>{x.label}</b><small>{x.id==='default'?'Использовать системный браузер':'Открыть OAuth именно здесь'}</small></button>)}</div>
    <footer><button onClick={()=>{setBrowserOpen(false);setPendingProfileId('')}}>Отмена</button><button className="primary" onClick={()=>void connect()}>Продолжить через {browsers.find(x=>x.id===browser)?.label||'браузер'}</button></footer>
   </section>
  </div>}
 </>
}
