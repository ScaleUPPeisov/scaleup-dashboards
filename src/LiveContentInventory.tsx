import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {inventoryTotals,scanAllInventories,scanInventoryChannel,useLiveInventory,type ChannelInventorySnapshot,type InventoryLevel} from './renderInventoryRuntime';
import {saveActivePublishChannel} from './publishWorkspaceState';
import {sortChannelsAlphabetically} from './channelSort';

const levelLabel:Record<InventoryLevel,string>={NORMAL:'НОРМА',SOON:'СКОРО НУЖНО',LOW:'МАЛО',EMPTY:'ПУСТО',OFFLINE:'OFFLINE'};
const levelIcon:Record<InventoryLevel,string>={NORMAL:'🟢',SOON:'🟡',LOW:'🟠',EMPTY:'🔴',OFFLINE:'⚫'};
const age=(iso:string|undefined,now:number)=>{
  if(!iso)return'—';
  const ms=now-Date.parse(iso);if(!Number.isFinite(ms)||ms<0)return'только что';
  const sec=Math.floor(ms/1000);if(sec<60)return String(sec)+' сек назад';
  const min=Math.floor(sec/60);if(min<60)return String(min)+' мин назад';
  return new Date(iso).toLocaleString('ru-RU')
};
function fallback(channelId:string,name:string,path:string):ChannelInventorySnapshot{
  return{channelId,channelName:name,renderFolderPath:path,folderState:path?'SCANNING':'OFFLINE',stale:true,physicalFiles:0,readyVideos:0,uploadingVideos:0,uploadedLocalCopies:0,newCandidates:0,newGenerations:0,knownReady:0,verifyRequired:0,invalid:0,runwayDays:0,level:'OFFLINE'}
}

export function LiveContentInventory(){
  const channels=useApp(s=>s.channels),setPage=useApp(s=>s.setPage);
  const snapshots=useLiveInventory(s=>s.snapshots),audit=useLiveInventory(s=>s.audit),globalScanning=useLiveInventory(s=>s.globalScanning);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id)},[]);
  const enabled=useMemo(()=>sortChannelsAlphabetically(channels.filter(c=>c.enabled!==false)),[channels]);
  const totals=useMemo(()=>inventoryTotals(snapshots,enabled),[snapshots,enabled]);
  const rows=enabled.map(c=>snapshots[c.id]||fallback(c.id,c.name,String(c.renderFolderPath||'')));
  const lastFresh=rows.map(x=>x.lastScanAt).filter((x):x is string=>Boolean(x)).sort().at(-1);
  const channelName=new Map(enabled.map(c=>[c.id,c.name]));
  const openPublisher=(channelId:string)=>{saveActivePublishChannel(channelId);setPage('publisher')};

  return <div className="liveInventoryPage">
    <div className="pageHeader liveInventoryHeader">
      <div><small>LOCAL CONTENT MONITOR • ZERO YOUTUBE API</small><h1>Запас видео</h1><p>Живой физический запас Render-папок. Upload history и trusted fingerprints остаются историческим source of truth.</p></div>
      <button className="primary" disabled={globalScanning} onClick={()=>void scanAllInventories('manual-all')}>{globalScanning?'СИНХРОНИЗИРУЮ…':'↻ СИНХРОНИЗИРОВАТЬ ВСЕ ПАПКИ'}</button>
    </div>

    <div className="inventoryHeroGrid">
      <div className="inventoryHero primaryMetric"><small>ВСЕГО ГОТОВО</small><b>{totals.ready}</b><span>{totals.uploading} сейчас загружается</span></div>
      <div className="inventoryHero"><small>КАНАЛОВ</small><b>{totals.channels}</b><span>скоро нужно: {totals.soon}</span></div>
      <div className="inventoryHero normal"><small>НОРМА</small><b>{totals.normal}</b><span>&gt; 14 дней</span></div>
      <div className="inventoryHero low"><small>МАЛО</small><b>{totals.low}</b><span>1–6 дней</span></div>
      <div className="inventoryHero low"><small>ПУСТО</small><b>{totals.empty}</b><span>0 ready</span></div>
      <div className="inventoryHero offline"><small>OFFLINE</small><b>{totals.offline}</b><span>snapshot не обнуляется</span></div>
    </div>
    <div className="inventoryLiveLine"><b>🟢 LIVE</b><span>{lastFresh?'проверено '+age(lastFresh,now):'первичное сканирование…'}</span><em>YouTube API requests: 0</em></div>

    <section className="panel liveInventoryTablePanel">
      <div className="panelHead"><div><small>CHANNEL INVENTORY</small><h3>Фактический запас по каналам</h3></div><span>{rows.length} каналов</span></div>
      <div className="liveInventoryTable">
        <div className="liveInventoryRow head"><span>Канал</span><span>Готово</span><span>Загружается</span><span>Запас дней</span><span>Состояние папки</span><span>Последний scan</span><span/></div>
        {rows.map(row=><div role="button" tabIndex={0} className={'liveInventoryRow level-'+row.level.toLowerCase()} key={row.channelId} onClick={()=>openPublisher(row.channelId)} onKeyDown={e=>{if(e.key==='Enter')openPublisher(row.channelId)}}>
          <span className="liveInventoryChannel"><b>{row.channelName}</b><small title={row.renderFolderPath}>{row.renderFolderPath||'Render folder не настроена'}</small></span>
          <span><b>{row.readyVideos}</b><small>{row.newCandidates} new • {row.newGenerations} gen • {row.knownReady} known</small></span>
          <span><b>{row.uploadingVideos}</b><small>active</small></span>
          <span><b>{row.folderState==='OFFLINE'?'—':row.runwayDays}</b><small>{row.folderState==='OFFLINE'?'last known':String(row.runwayDays)+' дней'}</small></span>
          <span><b>{levelIcon[row.level]} {levelLabel[row.level]}</b><small>{row.folderState}{row.stale?' • STALE':''}{row.uploadedLocalCopies?' • uploaded copies '+row.uploadedLocalCopies:''}{row.verifyRequired?' • verify '+row.verifyRequired:''}</small></span>
          <span><b>{age(row.lastScanAt||row.lastConfirmedAt,now)}</b><small>{row.folderState==='OFFLINE'&&row.lastConfirmedAt?'последний подтверждённый snapshot':'local scan'}</small></span>
          <span><button className="mini" disabled={row.folderState==='SCANNING'} onClick={e=>{e.stopPropagation();void scanInventoryChannel(row.channelId,'manual-channel')}}>↻ Пересканировать</button></span>
        </div>)}
      </div>
    </section>

    <div className="inventoryBottomGrid">
      <section className="panel">
        <div className="panelHead"><div><small>CLASSIFICATION</small><h3>Что считается готовым</h3></div></div>
        <div className="inventoryRules">
          <span><b>NEW_CANDIDATE</b><em>новый физический файл</em></span>
          <span><b>NEW_GENERATION</b><em>новые bytes по старому пути</em></span>
          <span><b>UPLOADED_LOCAL_COPY</b><em>виден отдельно, не входит в ready</em></span>
          <span><b>VERIFY_REQUIRED</b><em>не считается новым без доказательства</em></span>
        </div>
      </section>
      <section className="panel">
        <div className="panelHead"><div><small>OPERATIONAL EVENTS</small><h3>Последние изменения</h3></div><span>{Math.min(audit.length,12)}</span></div>
        <div className="inventoryAudit">{audit.slice(0,12).map(e=><div key={e.id}><time>{new Date(e.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><b>{channelName.get(e.channelId)||e.channelId}</b><span>{e.message}</span></div>)}{!audit.length&&<p>События появятся после первого scan или изменения Render-папки.</p>}</div>
      </section>
    </div>
  </div>
}
