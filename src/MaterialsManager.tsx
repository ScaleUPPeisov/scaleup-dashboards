import React,{useEffect,useMemo,useRef,useState} from 'react';
import {productionManagerApi,type GlobalProjectCleanupPreview,type MaterialsSummary} from './productionManagerApi';
import {patchChannelProductionPrefs,useProductionPrefs} from './productionPrefs';
import {createJobsCount} from './autopilotCore';
import {useApp} from './store';
import {notifySuccess} from './notificationCenter';

function n(value:number|undefined){return (value||0).toLocaleString('ru-RU')}
function gb(value:number|undefined){return ((value||0)/1024/1024/1024).toFixed(2)}
function fileName(path:string){return path.split(/[\\/]/).filter(Boolean).pop()||path}
const materialsSummaryCache=new Map<string,MaterialsSummary>();
function summaryCacheKey(workspace:string,channelId:string){return workspace+'\u0000'+channelId}

export function MaterialsManager(){
  const channels=useApp(s=>s.channels);
  const jobs=useApp(s=>s.jobs);
  const setJobs=useApp(s=>s.setJobs);
  const settings=useApp(s=>s.settings);
  const toast=useApp(s=>s.toast);
  const [prefs,patchPrefs]=useProductionPrefs();
  const [rows,setRows]=useState<Record<string,MaterialsSummary>>({});
  const [busy,setBusy]=useState('');
  const [cleanup,setCleanup]=useState<GlobalProjectCleanupPreview|null>(null);
  const [manualOpen,setManualOpen]=useState(false);
  const [manualChannelId,setManualChannelId]=useState('');
  const [manualImages,setManualImages]=useState<string[]>([]);
  const [manualMusic,setManualMusic]=useState<string[]>([]);
  const [manualMusicRoot,setManualMusicRoot]=useState('');
  const [manualBusy,setManualBusy]=useState('');
  const [loadingRows,setLoadingRows]=useState(true);
  const refreshGeneration=useRef(0);
  const workspace=settings.workspace||'';
  const channelIdsKey=useMemo(()=>channels.map(x=>x.id).sort().join('|'),[channels]);
  const jobCountersByChannel=useMemo(()=>{
    const out:Record<string,{waiting:number;ready:number}>={};
    for(const job of jobs){
      const row=out[job.channelId]||(out[job.channelId]={waiting:0,ready:0});
      if(job.status==='NEED_IMAGE')row.waiting++;
      if(job.status==='READY_RENDER')row.ready++;
    }
    return out;
  },[jobs]);

  const cleanupRoots=useMemo(()=>[
    settings.workspace,
    prefs.productionRoot,
    ...Object.values(prefs.byChannel||{}).map(x=>x.productionRoot)
  ].map(x=>(x||'').trim()).filter((x,i,a)=>Boolean(x)&&a.indexOf(x)===i),[settings.workspace,prefs.productionRoot,prefs.byChannel]);

  const manualChannel=channels.find(x=>x.id===manualChannelId);
  const manualTracksPerProject=Math.max(1,Math.min(100,prefs.byChannel[manualChannelId]?.tracksPerProject||manualChannel?.minTracks||10));
  const manualCanBuild=Boolean(manualChannel&&manualImages.length&&manualMusic.length>=manualTracksPerProject);
  const manualExisting=manualChannelId?jobs.filter(j=>j.channelId===manualChannelId):[];
  const manualFrom=Math.max(0,...manualExisting.map(j=>j.number))+1;
  const manualTo=manualFrom+Math.max(0,manualImages.length-1);
  const manualRequiredTracks=manualImages.length*manualTracksPerProject;

  async function loadSummaries(channelIds:string[],generation:number){
    try{
      const summaries=await productionManagerApi.materialsSummaries(workspace,channelIds);
      if(generation!==refreshGeneration.current)return;
      setRows(prev=>{
        const next={...prev};
        for(const summary of summaries){
          next[summary.channelId]=summary;
          materialsSummaryCache.set(summaryCacheKey(workspace,summary.channelId),summary);
        }
        return next;
      });
    }catch{
      // External/offline storage must never make navigation fail. Keep cached/empty rows visible.
    }finally{
      if(generation===refreshGeneration.current)setLoadingRows(false);
    }
  }

  async function refreshChannels(channelIds:string[]){
    if(!workspace){setRows({});setLoadingRows(false);return}
    const generation=++refreshGeneration.current;
    if(channelIds.some(id=>!rows[id]))setLoadingRows(true);
    await loadSummaries(channelIds,generation);
  }

  async function refreshChannel(channelId:string){
    await refreshChannels([channelId]);
  }

  async function refresh(){
    await refreshChannels(channels.map(x=>x.id));
  }

  useEffect(()=>{
    const ids=channels.map(x=>x.id);
    if(!workspace){refreshGeneration.current++;setRows({});setCleanup(null);setLoadingRows(false);return}
    const cached:Record<string,MaterialsSummary>={};
    for(const id of ids){
      const hit=materialsSummaryCache.get(summaryCacheKey(workspace,id));
      if(hit)cached[id]=hit;
    }
    setRows(cached);
    setLoadingRows(ids.some(id=>!cached[id]));
    const generation=++refreshGeneration.current;
    let first=0,second=0;
    // Double RAF guarantees the Materials shell paints before any filesystem IPC begins.
    first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{void loadSummaries(ids,generation)})});
    return ()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);refreshGeneration.current++};
  },[workspace,channelIdsKey]);

  async function importImages(channel:{id:string;name:string}){
    if(!workspace){toast('Сначала выберите рабочую папку VYRON');return}
    patchPrefs({selectedChannelId:channel.id});
    setBusy('images:'+channel.id);
    try{
      let defaultPath='';
      try{defaultPath=await productionManagerApi.materialsDownloadsPath()}catch{}
      const files=await productionManagerApi.chooseMaterialImages(defaultPath||undefined);
      if(!files.length)return;
      if(!window.confirm('Канал: '+channel.name+'\nВыбрано: '+files.length+' изображений\n\nИмпортировать в Image Library этого канала?'))return;
      const result=await productionManagerApi.importMaterialImages(workspace,channel.id,channel.name,files);
      notifySuccess('Изображения импортированы',channel.name+' • добавлено '+result.added+' • дубликаты '+result.duplicates+' • пропущено '+result.skipped,{operationId:'materials-images:'+channel.id+':'+Date.now()});
      await refreshChannel(channel.id);
    }catch(e){toast('Не удалось импортировать изображения: '+String(e))}
    finally{setBusy('')}
  }

  async function chooseMusic(channel:{id:string;name:string}){
    if(!workspace){toast('Сначала выберите рабочую папку VYRON');return}
    patchPrefs({selectedChannelId:channel.id});
    setBusy('music:'+channel.id);
    try{
      const path=await productionManagerApi.chooseMusicFolder(rows[channel.id]?.musicLibraryPath||undefined);
      if(!path)return;
      await productionManagerApi.setMusicLibrary(workspace,channel.id,channel.name,path);
      const indexed=await productionManagerApi.indexMusic(workspace,channel.id);
      notifySuccess('Музыкальная библиотека обновлена',channel.name+' • '+indexed.tracks.toLocaleString('ru-RU')+' треков',{operationId:'materials-music:'+channel.id+':'+indexed.indexedAt});
      await refreshChannel(channel.id);
    }catch(e){toast('Не удалось обновить Music Library: '+String(e))}
    finally{setBusy('')}
  }

  async function reindexMusic(channelId:string){
    if(!workspace)return;
    setBusy('music:'+channelId);
    try{await productionManagerApi.indexMusic(workspace,channelId);await refreshChannel(channelId)}
    catch(e){toast('Не удалось переиндексировать музыку: '+String(e))}
    finally{setBusy('')}
  }

  function openManualAssembly(){
    const id=(prefs.selectedChannelId&&channels.some(x=>x.id===prefs.selectedChannelId)?prefs.selectedChannelId:channels[0]?.id)||'';
    setManualChannelId(id);setManualImages([]);setManualMusic([]);setManualMusicRoot('');setManualOpen(true);
  }

  function changeManualChannel(id:string){
    setManualChannelId(id);
    setManualImages([]);
    setManualMusic([]);
    setManualMusicRoot('');
  }

  async function chooseManualImages(){
    if(!manualChannel)return;
    setManualBusy('images');
    try{
      let defaultPath='';try{defaultPath=await productionManagerApi.materialsDownloadsPath()}catch{}
      const files=await productionManagerApi.chooseMaterialImages(defaultPath||undefined);
      if(files.length)setManualImages(files);
    }catch(e){toast('Не удалось выбрать изображения: '+String(e))}
    finally{setManualBusy('')}
  }

  async function chooseManualMusicFiles(){
    if(!manualChannel)return;
    setManualBusy('music');
    try{
      const files=await productionManagerApi.chooseManualMusicFiles(manualMusicRoot||rows[manualChannel.id]?.musicLibraryPath||undefined);
      if(files.length){setManualMusic(files);setManualMusicRoot('')}
    }catch(e){toast('Не удалось выбрать музыку: '+String(e))}
    finally{setManualBusy('')}
  }

  async function chooseManualMusicFolder(){
    if(!manualChannel)return;
    setManualBusy('music-folder');
    try{
      const root=await productionManagerApi.chooseManualMusicFolder(manualMusicRoot||rows[manualChannel.id]?.musicLibraryPath||undefined);
      if(!root)return;
      const files=await productionManagerApi.scanManualMusic(root);
      if(!files.length){toast('В выбранной папке нет поддерживаемых аудиофайлов');return}
      setManualMusicRoot(root);setManualMusic(files);
    }catch(e){toast('Не удалось прочитать папку музыки: '+String(e))}
    finally{setManualBusy('')}
  }

  async function buildManualProjects(){
    if(!workspace||!manualChannel||!manualCanBuild)return;
    const outputWorkspace=(prefs.byChannel[manualChannel.id]?.productionRoot||prefs.productionRoot||workspace||'').trim();
    if(!outputWorkspace){toast('Сначала выберите Production workspace');return}
    setManualBusy('build');
    try{
      const storage=await productionManagerApi.storageStatus(outputWorkspace);
      if(!storage.exists||!storage.writable)throw new Error(storage.error||'Production workspace недоступен');
      const currentJobs=useApp.getState().jobs;
      const staged=createJobsCount(manualChannel,currentJobs,manualImages.length);
      if(staged.length!==manualImages.length||staged.some(j=>j.channelId!==manualChannel.id))throw new Error('BLOCK: project.channelId != selectedChannelId');
      const result=await productionManagerApi.manualBuild({
        requestId:crypto.randomUUID(),
        workspace,
        outputWorkspace,
        channelId:manualChannel.id,
        channelName:manualChannel.name,
        images:[...manualImages],
        audioFiles:[...manualMusic],
        tracksPerProject:manualTracksPerProject,
        jobLinks:staged.map(j=>({jobId:j.id,number:j.number,channelId:j.channelId})),
        recoveryUiContext:{page:'production',channelId:manualChannel.id,productionTab:'manager'}
      });
      const byJob=new Map(result.projects.map(x=>[x.jobId,x]));
      if(byJob.size!==staged.length)throw new Error('MANUAL_BUILD_RESULT_MISMATCH');
      const committed=staged.map(j=>{
        const p=byJob.get(j.id);if(!p)throw new Error('MANUAL_PROJECT_MAPPING_MISSING:'+j.id);
        return {...j,folder:p.folderPath,coverPath:p.coverPath,tracksCount:p.tracksCount,minTracks:manualTracksPerProject,status:'READY_RENDER' as const};
      });
      setJobs([...useApp.getState().jobs,...committed]);
      patchChannelProductionPrefs(manualChannel.id,{lastBatchId:result.batch.batchId,selectedProjectIds:result.projects.map(x=>x.projectId)});
      patchPrefs({selectedChannelId:manualChannel.id});
      notifySuccess('Ручная сборка готова',manualChannel.name+' • '+committed.length+' проектов • VIDEO_'+String(staged[0]?.number||0).padStart(3,'0')+' — VIDEO_'+String(staged[staged.length-1]?.number||0).padStart(3,'0'),{operationId:'manual-assembly:'+result.batch.batchId});
      setManualOpen(false);setManualImages([]);setManualMusic([]);setManualMusicRoot('');
      await refreshChannel(manualChannel.id);
    }catch(e){toast('Ручная сборка не выполнена: '+String(e))}
    finally{setManualBusy('')}
  }

  async function previewCleanup(){
    if(!cleanupRoots.length){setCleanup(null);return}
    setBusy('cleanup-preview');
    try{setCleanup(await productionManagerApi.previewGlobalProjectCleanup(cleanupRoots))}
    catch(e){setCleanup(null);toast('Не удалось проверить Safe Cleanup: '+String(e))}
    finally{setBusy('')}
  }

  async function cleanSafeProjects(){
    if(!cleanup?.eligibleProjects||!cleanupRoots.length)return;
    const message=[
      'Готово к очистке: '+cleanup.eligibleProjects+' проектов • ~'+gb(cleanup.estimatedBytes)+' GB',
      '',
      'БУДЕТ УДАЛЕНО:',
      '• project folders',
      '• project copies музыки',
      '• project covers',
      '• временные project-файлы',
      '',
      'НЕ БУДЕТ УДАЛЕНО:',
      '• Render videos',
      '• source Music Libraries',
      '• master Image Library',
      '• Google / OAuth / YouTube data',
      '• uploadHistory',
      '',
      'Продолжить?'
    ].join('\n');
    if(!window.confirm(message))return;
    if(!window.confirm('ФИНАЛЬНОЕ ПОДТВЕРЖДЕНИЕ: переместить только SAFE_TO_CLEAN project-папки в Корзину?'))return;
    setBusy('cleanup');
    try{
      const result=await productionManagerApi.executeGlobalProjectCleanup(cleanupRoots,true);
      notifySuccess('Безопасная очистка завершена','Удалено '+result.deletedProjects+' проектов • освобождено '+gb(result.bytesFreed)+' GB • Render сохранены: '+result.protectedRenders,{operationId:'materials-cleanup:'+Date.now()});
      setCleanup(null);
      await refresh();
    }catch(e){toast('Cleanup не выполнен: '+String(e))}
    finally{setBusy('')}
  }

  if(!channels.length)return <section className="panel"><b>Нет каналов</b><p>Подключите YouTube-каналы, затем Materials будет вести отдельную библиотеку для каждого channelId.</p></section>;

  return <div className="materialsManager">
    <section className="panel materialsHero">
      <div><small>PRODUCTION → MATERIALS</small><h2>Материалы по каналам</h2><p>Изображения привязываются к channelId вручную при импорте. Имя файла не используется для определения канала.</p></div>
      <div className="pmActions"><button className="primary" disabled={!!busy} onClick={openManualAssembly}>+ РУЧНАЯ СБОРКА</button><button disabled={!!busy} onClick={()=>void refresh()}>↻ ОБНОВИТЬ</button></div>
    </section>

    <section className="panel materialsTablePanel">
      <div className="materialsTableHead"><div><small>IMAGE + MUSIC LIBRARY</small><h3>Все каналы</h3></div><span>{loadingRows?'Загрузка в фоне • ':''}{channels.length} каналов</span></div>
      <div className="materialsTable">
        <div className="materialsRow materialsHeader"><span>Канал</span><span>Музыка</span><span>Изображения</span><span>Назначено</span><span>Использовано</span><span>Нужны изображения</span><span>READY_RENDER</span><span>Действия</span></div>
        {channels.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(ch=>{
          const row=rows[ch.id];
          const counters=jobCountersByChannel[ch.id]||{waiting:0,ready:0};
          const waiting=counters.waiting;
          const ready=counters.ready;
          const available=row?.image.available||0;
          const need=Math.max(0,waiting-available);
          return <div className="materialsRow" key={ch.id}>
            <span className="materialsChannel"><b>{ch.name}</b><small>{ch.id}</small></span>
            <span><b>{row?n(row.musicTotal):'…'}</b><small>{row?'своб. '+n(row.musicFree)+' • назнач. '+n(row.musicAssigned):'Загрузка…'}</small><small title={row?.musicLibraryPath||''}>{row?(row.musicLibraryPath||'Music Library не выбрана'):'Данные читаются в фоне'}</small></span>
            <span><b>{row?n(available):'…'}</b><small>{row?'master: '+n(row.image.total):'Загрузка…'}</small></span>
            <span><b>{n(row?.image.assigned)}</b><small>ASSIGNED</small></span>
            <span><b>{n(row?.image.used)}</b><small>USED{row?.image.missing?' • missing '+n(row.image.missing):''}</small></span>
            <span className={need>0?'materialsDanger':''}><b>{need>0?'🔴 '+need:'0'}</b><small>ждут cover: {waiting}</small></span>
            <span><b>{ready}</b><small>готовы к ENDLUME</small></span>
            <span className="materialsActions">
              <button className="primary" disabled={!!busy} onClick={()=>void importImages(ch)}>+ ИЗОБРАЖЕНИЯ</button>
              <button disabled={!!busy} onClick={()=>void chooseMusic(ch)}>{row?.musicLibraryPath?'МУЗЫКА':'+ МУЗЫКА'}</button>
              {row?.musicLibraryPath&&<button disabled={!!busy} onClick={()=>void reindexMusic(ch.id)}>↻</button>}
              {row?.image.rootPath&&<button onClick={()=>void productionManagerApi.openFolder(row.image.rootPath)}>ПАПКА</button>}
            </span>
          </div>
        })}
      </div>
    </section>

    <section className="panel materialsCleanup">
      <div><small>SAFE CLEANUP</small><h3>Готово к очистке</h3><p>Проверка запускается только вручную и выполняется в фоне. Открытие Материалов больше не сканирует Production workspace.</p></div>
      <div className="materialsCleanupStats">
        <span><b>{cleanup?n(cleanup.eligibleProjects):'—'}</b><small>проектов</small></span>
        <span><b>{cleanup?gb(cleanup.estimatedBytes)+' GB':'—'}</b><small>можно освободить</small></span>
        <span><b>{cleanup?n(cleanup.protectedRenders):'—'}</b><small>Render защищены</small></span>
      </div>
      <label className="materialsPolicy">После успешного Render
        <select value={prefs.cleanupPolicy||'prompt'} onChange={e=>patchPrefs({cleanupPolicy:e.target.value as 'prompt'|'never'|'auto3d'|'afterUpload'})}>
          <option value="prompt">Предлагать очистку</option>
          <option value="never">Никогда</option>
          <option value="auto3d">Автоматически через 3 дня</option>
          <option value="afterUpload">После успешной загрузки на YouTube</option>
        </select>
      </label>
      <div className="pmActions"><button disabled={!!busy} onClick={()=>void previewCleanup()}>{busy==='cleanup-preview'?'ПРОВЕРЯЮ…':'ПРОВЕРИТЬ'}</button><button className="danger" disabled={!!busy||!cleanup?.eligibleProjects} onClick={()=>void cleanSafeProjects()}>{busy==='cleanup'?'ОЧИЩАЮ…':'ОЧИСТИТЬ '+(cleanup?.eligibleProjects||0)+' ПРОЕКТОВ'}</button></div>
    </section>

    {manualOpen&&<div className="modalBackdrop" onMouseDown={()=>{if(!manualBusy)setManualOpen(false)}}>
      <section className="confirmModal manualAssemblyModal" onMouseDown={e=>e.stopPropagation()}>
        <small>PRODUCTION → MATERIALS • ДОПОЛНИТЕЛЬНЫЙ РЕЖИМ</small>
        <h2>РУЧНАЯ СБОРКА ПРОЕКТОВ</h2>
        <p>Image Library и Music Library не изменяются. Файлы используются только для выбранного channelId и копируются в обычный Production batch.</p>

        <label className="manualField">Канал
          <select value={manualChannelId} disabled={!!manualBusy} onChange={e=>changeManualChannel(e.target.value)}>
            {channels.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(ch=><option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
          <small>{manualChannel?.id||'—'}</small>
        </label>

        <div className="manualSection">
          <div><small>ИЗОБРАЖЕНИЯ</small><b>{manualImages.length.toLocaleString('ru-RU')} выбрано</b></div>
          <div className="pmActions"><button className="primary" disabled={!!manualBusy} onClick={()=>void chooseManualImages()}>ВЫБРАТЬ ИЗ DOWNLOADS</button>{manualImages.length>0&&<button disabled={!!manualBusy} onClick={()=>setManualImages([])}>ОЧИСТИТЬ</button>}</div>
          {manualImages.length>0&&<div className="manualPreviewList">{manualImages.slice(0,8).map((x,i)=><span key={x}>{String(i+1).padStart(2,'0')} • {fileName(x)}</span>)}{manualImages.length>8&&<span>+ ещё {manualImages.length-8}</span>}</div>}
        </div>

        <div className="manualSection">
          <div><small>МУЗЫКА</small><b>{manualMusic.length.toLocaleString('ru-RU')} файлов</b></div>
          <div className="pmActions"><button className="primary" disabled={!!manualBusy} onClick={()=>void chooseManualMusicFiles()}>ВЫБРАТЬ С ДИСКА</button><button disabled={!!manualBusy} onClick={()=>void chooseManualMusicFolder()}>ВЫБРАТЬ ПАПКУ</button>{manualMusic.length>0&&<button disabled={!!manualBusy} onClick={()=>{setManualMusic([]);setManualMusicRoot('')}}>ОЧИСТИТЬ</button>}</div>
          {manualMusicRoot&&<code className="pmPath">{manualMusicRoot}</code>}
          {manualMusic.length>0&&<div className="manualPreviewList">{manualMusic.slice(0,6).map((x,i)=><span key={x}>{String(i+1).padStart(2,'0')} • {fileName(x)}</span>)}{manualMusic.length>6&&<span>+ ещё {manualMusic.length-6}</span>}</div>}
        </div>

        <div className="manualAssemblySummary">
          <span><small>Канал</small><b>{manualChannel?.name||'—'}</b></span>
          <span><small>Изображений</small><b>{manualImages.length}</b></span>
          <span><small>Музыки</small><b>{manualMusic.length}</b></span>
          <span><small>Треков на видео</small><b>{manualTracksPerProject}</b></span>
          <span><small>Будет создано</small><b>{manualCanBuild?manualImages.length:0} проектов</b></span>
          <span><small>Диапазон</small><b>{manualImages.length?'VIDEO_'+String(manualFrom).padStart(3,'0')+' — VIDEO_'+String(manualTo).padStart(3,'0'):'—'}</b></span>
        </div>
        {manualImages.length>0&&manualMusic.length<manualTracksPerProject&&<div className="pmShortage"><div><b>Недостаточно музыки</b><span>Нужно минимум {manualTracksPerProject} уникальных файлов для одного проекта.</span></div></div>}
        {manualCanBuild&&manualMusic.length<manualRequiredTracks&&<small className="pmHint">Выбрано меньше {manualRequiredTracks} треков на весь batch — после исчерпания списка музыка будет использоваться повторно, но внутри одного VIDEO дублей не будет.</small>}

        <div className="manualModalActions">
          <button disabled={!!manualBusy} onClick={()=>setManualOpen(false)}>ОТМЕНА</button>
          <button className="primary" disabled={!manualCanBuild||!!manualBusy} onClick={()=>void buildManualProjects()}>{manualBusy==='build'?'СОБИРАЮ…':'СОБРАТЬ '+(manualCanBuild?manualImages.length:0)+' ПРОЕКТОВ'}</button>
        </div>
      </section>
    </div>}
  </div>
}
