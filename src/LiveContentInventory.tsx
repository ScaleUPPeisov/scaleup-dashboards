import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {api} from './api';
import {notifySuccess,notifyWarning} from './notificationCenter';
import {renderChannelFolderPath,validateRenderFolderSelection,validateRenderRootSelection} from './renderFolderSelection';
import {inventoryTotals,scanAllInventories,scanInventoryChannel,useLiveInventory,type ChannelInventorySnapshot,type InventoryLevel} from './renderInventoryRuntime';
import {saveActivePublishChannel} from './publishWorkspaceState';
import {sortChannelsAlphabetically} from './channelSort';
import {DailyOperationsCenter} from './DailyOperationsCenter';
import './inventory-apex.css';

const levelLabel:Record<InventoryLevel,string>={NORMAL:'Норма',SOON:'Скоро понадобится',LOW:'Мало',EMPTY:'Пусто',OFFLINE:'Недоступно'};
const folderLabel:Record<ChannelInventorySnapshot['folderState'],string>={ONLINE:'Папка доступна',OFFLINE:'Папка недоступна',SCANNING:'Проверяется',ERROR:'Ошибка проверки'};
const hasConfirmedStock=(row:ChannelInventorySnapshot)=>Boolean(row.lastConfirmedAt||row.lastScanAt||row.folderState==='ONLINE');
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
  const unknownCount=rows.filter(row=>!hasConfirmedStock(row)).length;
  const staleCount=rows.filter(row=>row.stale&&hasConfirmedStock(row)).length;
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

  return <div className="liveInventoryPage inventoryApex">
    <header className="inventoryApexHeader">
      <div><small>ЛОКАЛЬНЫЙ ЗАПАС</small><h1>Запас видео</h1><p>Готовые видео в папках каналов</p></div>
      <div className="inventoryHeaderActions">
        <button className="secondary" disabled={rootPicking||globalScanning} onClick={()=>void chooseAllRenderFolders()}>{rootPicking?'Выбираем…':'Общая папка Render'}</button>
        <button className="primary" disabled={globalScanning||rootPicking} onClick={()=>void scanAllInventories('manual-all')}>{globalScanning?'Проверяем…':'Проверить все папки'}</button>
      </div>
    </header>

    <DailyOperationsCenter snapshots={snapshots} onChooseRender={channelId=>void chooseRenderFolder(channelId)}/>

    <section className="inventoryApexOverview" aria-label="Сводка запаса">
      <div className="inventoryApexMetric inventoryApexMetricPrimary"><span>Готово к публикации</span><strong>{unknownCount===rows.length&&rows.length>0?'—':totals.ready}</strong><small>{unknownCount||staleCount?'По доступным и последним сохранённым данным':'Во всех проверенных папках'}</small></div>
      <div className="inventoryApexMetric"><span>Загружается</span><strong>{totals.uploading}</strong><small>Сейчас в работе</small></div>
      <div className="inventoryApexMetric"><span>Мало или пусто</span><strong>{totals.low+totals.empty}</strong><small>Каналов требуют внимания</small></div>
      <div className="inventoryApexMetric"><span>Недоступно</span><strong>{rows.filter(row=>row.folderState==='OFFLINE'||row.folderState==='ERROR').length}</strong><small>Папок каналов</small></div>
    </section>
    <details className="inventoryApexBreakdown"><summary>Распределение запаса</summary><div><span>Норма: {totals.normal}</span><span>Скоро понадобится: {totals.soon}</span><span>Мало: {totals.low}</span><span>Пусто: {totals.empty}</span><small>Состояние по последним данным каналов</small></div></details>
    <div className="inventoryApexStatus" role="status">
      <span>{lastFresh?'Последняя проверка: '+age(lastFresh,now):'Проверка ещё не завершена'}</span>
      {staleCount>0&&<span>Устаревшие данные: {staleCount}</span>}
      {unknownCount>0&&<span>Нет подтверждённых данных: {unknownCount}</span>}
      <span title="YouTube API requests: 0">Без запросов к YouTube</span>
    </div>

    <section className="inventoryApexList" aria-labelledby="inventory-channel-heading">
      <div className="inventoryApexSectionHead"><div><h2 id="inventory-channel-heading">По каналам</h2><p>Выберите канал, чтобы открыть публикацию</p></div><span>{rows.length} каналов</span></div>
      {rows.length===0?<p className="inventoryApexEmpty">Нет активных каналов</p>:<div className="inventoryApexRows">
        {rows.map(row=>{
          const known=hasConfirmedStock(row);
          return <article className={'inventoryApexRow inventoryApexRow-'+row.level.toLowerCase()} key={row.channelId} aria-label={row.channelName}>
            <div className="inventoryApexIdentity"><button className="inventoryApexChannel" onClick={()=>openPublisher(row.channelId)}>{row.channelName}</button><span title={row.renderFolderPath}>{row.renderFolderPath||'Папка Render не выбрана'}</span></div>
            <dl className="inventoryApexFigures">
              <div><dt>Готово</dt><dd>{known?row.readyVideos:'—'}</dd></div>
              <div><dt>Загружается</dt><dd>{row.uploadingVideos}</dd></div>
              <div><dt>Запас дней</dt><dd>{known?row.runwayDays:'—'}</dd></div>
            </dl>
            <div className="inventoryApexRowStatus"><strong>{known?levelLabel[row.level]:'Нет данных'}</strong><span>{folderLabel[row.folderState]}{row.stale&&known?' · данные устарели':''}</span><small>{known?(row.folderState==='OFFLINE'?'Последний подтверждённый запас · ':'Проверено · ')+age(row.lastScanAt||row.lastConfirmedAt,now):'Ожидает первой проверки'}</small></div>
            <details className="inventoryApexDetails"><summary>Подробнее</summary><div>
              <span>Новые файлы: {known?row.newCandidates:'—'}</span><span>Обновлённые файлы: {known?row.newGenerations:'—'}</span><span>Известные готовые: {known?row.knownReady:'—'}</span><span>Загруженные копии: {known?row.uploadedLocalCopies:'—'}</span><span>Требуют проверки: {known?row.verifyRequired:'—'}</span><span>Расчёт запаса: 1 видео в день</span>
            </div></details>
            <div className="inventoryApexActions">
              <button className="secondary" disabled={folderPicking===row.channelId} onClick={()=>void chooseRenderFolder(row.channelId)}>{folderPicking===row.channelId?'Выбираем…':row.renderFolderPath?'Сменить папку':'Выбрать папку'}</button>
              <button className="secondary" disabled={row.folderState==='SCANNING'||folderPicking===row.channelId||!row.renderFolderPath} onClick={()=>void scanInventoryChannel(row.channelId,'manual-channel')}>Проверить</button>
            </div>
          </article>
        })}
      </div>}
    </section>

    <div className="inventoryApexBottom">
      <details className="inventoryApexRules"><summary>Как определяется готовность</summary><div><p><b>Новый файл</b> — найден в папке канала.</p><p><b>Обновлённый файл</b> — содержимое по прежнему пути изменилось.</p><p><b>Загруженная копия</b> показывается отдельно и не входит в готовые.</p><p><b>Требует проверки</b> — недостаточно данных, чтобы считать файл новым.</p></div></details>
      <section className="inventoryApexAudit" aria-labelledby="inventory-audit-heading"><div className="inventoryApexSectionHead"><h2 id="inventory-audit-heading">Последние изменения</h2><span>{Math.min(audit.length,12)}</span></div>
        <div className="inventoryApexAuditList">{audit.slice(0,12).map(e=><div key={e.id}><time>{new Date(e.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><b>{channelName.get(e.channelId)||e.channelId}</b><span>{e.message}</span></div>)}{!audit.length&&<p>Изменения появятся после проверки папок.</p>}</div>
      </section>
    </div>
  </div>
}
