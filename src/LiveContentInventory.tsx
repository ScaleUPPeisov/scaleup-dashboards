import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {api} from './api';
import {notifySuccess,notifyWarning} from './notificationCenter';
import {renderChannelFolderPath,validateRenderFolderSelection,validateRenderRootSelection} from './renderFolderSelection';
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
  const channels=useApp(s=>s.channels),settings=useApp(s=>s.settings),setPage=useApp(s=>s.setPage),updateChannel=useApp(s=>s.updateChannel),patchSettings=useApp(s=>s.patchSettings);
  const snapshots=useLiveInventory(s=>s.snapshots),audit=useLiveInventory(s=>s.audit),globalScanning=useLiveInventory(s=>s.globalScanning);
  const [now,setNow]=useState(Date.now());
  const [folderPicking,setFolderPicking]=useState<string>();
  const [rootPicking,setRootPicking]=useState(false);
  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),30000);return()=>window.clearInterval(id)},[]);
  const enabled=useMemo(()=>sortChannelsAlphabetically(channels.filter(c=>c.enabled!==false)),[channels]);
  const totals=useMemo(()=>inventoryTotals(snapshots,enabled),[snapshots,enabled]);
  const rows=enabled.map(c=>snapshots[c.id]||fallback(c.id,c.name,String(c.renderFolderPath||'')));
  const lastFresh=rows.map(x=>x.lastScanAt).filter((x):x is string=>Boolean(x)).sort().at(-1);
  const channelName=new Map(enabled.map(c=>[c.id,c.name]));
  const openPublisher=(channelId:string)=>{saveActivePublishChannel(channelId);setPage('publisher')};
  const chooseAllRenderFolders=async()=>{
    if(rootPicking||globalScanning)return;
    setRootPicking(true);
    try{
      const selected=await api.chooseRenderRoot(settings.renderRootPath||undefined);
      if(!selected)return;
      const rootValidation=validateRenderRootSelection(selected);
      if(!rootValidation.ok){
        notifyWarning('Не сохранено как общая Render-папка',rootValidation.message);
        return
      }
      const rootStatus=await api.localSourceStatus(rootValidation.path).catch(()=>null);
      if(!rootStatus?.exists||rootStatus.isFile){
        notifyWarning('Render-папка недоступна','Подключите диск и выберите существующую общую папку Render.');
        return
      }
      const current=useApp.getState().channels.filter(x=>x.enabled!==false);
      const checks=await Promise.all(current.map(async channel=>{
        const candidate=renderChannelFolderPath(rootValidation.path,channel.name);
        const status=await api.localSourceStatus(candidate).catch(()=>null);
        return{channel,candidate,ok:Boolean(status?.exists&&!status.isFile)}
      }));
      const matched=checks.filter(x=>x.ok);
      patchSettings({renderRootPath:rootValidation.path});
      for(const row of matched)updateChannel(row.channel.id,{renderFolderPath:row.candidate});
      try{
        await useApp.getState().persist();
      }catch(error){
        notifyWarning('Не удалось сохранить общую Render-папку',String(error));
        return
      }
      const missing=checks.filter(x=>!x.ok).map(x=>x.channel.name);
      notifySuccess('Render-папки привязаны',`Найдено и сохранено: ${matched.length}/${current.length} каналов.${missing.length?' Не найдены: '+missing.slice(0,5).join(', ')+(missing.length>5?'…':''):''}`);
      await scanAllInventories('manual-all');
    }finally{
      setRootPicking(false)
    }
  };

  const chooseRenderFolder=async(channelId:string)=>{
    const channel=useApp.getState().channels.find(x=>x.id===channelId);
    if(!channel||folderPicking)return;
    setFolderPicking(channelId);
    try{
      const selected=await api.chooseRenderFolder(channel.renderFolderPath||undefined);
      if(!selected)return;
      const validation=validateRenderFolderSelection(selected,channel.name,channel.projectsFolderPath);
      if(!validation.ok){
        notifyWarning('Не сохранено как Render',validation.message);
        return
      }
      const status=await api.localSourceStatus(validation.path).catch(()=>null);
      if(!status?.exists||status.isFile){
        notifyWarning('Render-папка недоступна','Выберите существующую папку канала на подключённом диске.');
        return
      }
      const previous=channel.renderFolderPath;
      updateChannel(channel.id,{renderFolderPath:validation.path});
      try{
        await useApp.getState().persist();
      }catch(error){
        updateChannel(channel.id,{renderFolderPath:previous});
        notifyWarning('Не удалось сохранить Render-папку',String(error));
        return
      }
      notifySuccess('Render-папка сохранена',`${channel.name} → ${validation.path}`);
      await scanInventoryChannel(channel.id,'manual-channel');
    }finally{
      setFolderPicking(undefined)
    }
  };

  return <div className="liveInventoryPage">
    <div className="pageHeader liveInventoryHeader">
      <div><small>LOCAL CONTENT MONITOR • ZERO YOUTUBE API</small><h1>Запас видео</h1><p>Живой физический запас Render-папок. Upload history и trusted fingerprints остаются историческим source of truth.</p></div>
      <div className="inventoryHeaderActions">
        <button className="secondary" disabled={rootPicking||globalScanning} onClick={()=>void chooseAllRenderFolders()}>{rootPicking?'ВЫБИРАЮ…':'📁 ВЫБРАТЬ ОБЩУЮ ПАПКУ RENDER'}</button>
        <button className="primary" disabled={globalScanning||rootPicking} onClick={()=>void scanAllInventories('manual-all')}>{globalScanning?'СИНХРОНИЗИРУЮ…':'↻ СИНХРОНИЗИРОВАТЬ ВСЕ ПАПКИ'}</button>
      </div>
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
        <div className="liveInventoryRow head"><span>Канал</span><span>Готово</span><span>Загружается</span><span>Запас дней (1 видео/день)</span><span>Состояние папки</span><span>Последний scan</span><span/></div>
        {rows.map(row=><div role="button" tabIndex={0} className={'liveInventoryRow level-'+row.level.toLowerCase()} key={row.channelId} onClick={()=>openPublisher(row.channelId)} onKeyDown={e=>{if(e.key==='Enter')openPublisher(row.channelId)}}>
          <span className="liveInventoryChannel"><b>{row.channelName}</b><small title={row.renderFolderPath}>{row.renderFolderPath||'Render folder не настроена'}</small></span>
          <span><b>{row.readyVideos}</b><small>{row.newCandidates} new • {row.newGenerations} gen • {row.knownReady} known</small></span>
          <span><b>{row.uploadingVideos}</b><small>active</small></span>
          <span><b>{row.runwayDays}</b><small>{row.folderState==='OFFLINE'?'last known • '+row.runwayDays+' дней':String(row.runwayDays)+' дней • 1/день'}</small></span>
          <span><b>{levelIcon[row.level]} {levelLabel[row.level]}</b><small>{row.folderState}{row.stale?' • STALE':''}{row.uploadedLocalCopies?' • uploaded copies '+row.uploadedLocalCopies:''}{row.verifyRequired?' • verify '+row.verifyRequired:''}</small></span>
          <span><b>{age(row.lastScanAt||row.lastConfirmedAt,now)}</b><small>{row.folderState==='OFFLINE'&&row.lastConfirmedAt?'последний подтверждённый snapshot':'local scan'}</small></span>
          <span className="liveInventoryActions">
            <button className="mini" disabled={folderPicking===row.channelId} onClick={e=>{e.stopPropagation();void chooseRenderFolder(row.channelId)}}>{folderPicking===row.channelId?'ВЫБИРАЮ…':row.renderFolderPath?'📁 Сменить Render':'📁 Выбрать Render'}</button>
            <button className="mini" disabled={row.folderState==='SCANNING'||folderPicking===row.channelId||!row.renderFolderPath} onClick={e=>{e.stopPropagation();void scanInventoryChannel(row.channelId,'manual-channel')}}>↻ Пересканировать</button>
          </span>
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
