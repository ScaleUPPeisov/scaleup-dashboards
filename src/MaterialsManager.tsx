import React,{useEffect,useMemo,useState} from 'react';
import {productionManagerApi,type GlobalProjectCleanupPreview,type MaterialsSummary} from './productionManagerApi';
import {useProductionPrefs} from './productionPrefs';
import {useApp} from './store';
import {notifySuccess} from './notificationCenter';

function n(value:number|undefined){return (value||0).toLocaleString('ru-RU')}
function gb(value:number|undefined){return ((value||0)/1024/1024/1024).toFixed(2)}

export function MaterialsManager(){
  const channels=useApp(s=>s.channels);
  const jobs=useApp(s=>s.jobs);
  const settings=useApp(s=>s.settings);
  const toast=useApp(s=>s.toast);
  const [prefs,patchPrefs]=useProductionPrefs();
  const [rows,setRows]=useState<Record<string,MaterialsSummary>>({});
  const [busy,setBusy]=useState('');
  const [cleanup,setCleanup]=useState<GlobalProjectCleanupPreview|null>(null);
  const workspace=settings.workspace||'';

  const cleanupRoots=useMemo(()=>[
    settings.workspace,
    prefs.productionRoot,
    ...Object.values(prefs.byChannel||{}).map(x=>x.productionRoot)
  ].map(x=>(x||'').trim()).filter((x,i,a)=>Boolean(x)&&a.indexOf(x)===i),[settings.workspace,prefs.productionRoot,prefs.byChannel]);

  async function refresh(){
    if(!workspace){setRows({});setCleanup(null);return}
    const next:Record<string,MaterialsSummary>={};
    for(const ch of channels){
      try{next[ch.id]=await productionManagerApi.materialsSummary(workspace,ch.id)}catch{}
    }
    setRows(next);
    if(cleanupRoots.length){
      try{setCleanup(await productionManagerApi.previewGlobalProjectCleanup(cleanupRoots))}catch{setCleanup(null)}
    }else setCleanup(null);
  }

  useEffect(()=>{void refresh()},[workspace,channels.map(x=>x.id).join('|'),jobs.length,cleanupRoots.join('|')]);

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
      await refresh();
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
      await refresh();
    }catch(e){toast('Не удалось обновить Music Library: '+String(e))}
    finally{setBusy('')}
  }

  async function reindexMusic(channelId:string){
    if(!workspace)return;
    setBusy('music:'+channelId);
    try{await productionManagerApi.indexMusic(workspace,channelId);await refresh()}
    catch(e){toast('Не удалось переиндексировать музыку: '+String(e))}
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
      await refresh();
    }catch(e){toast('Cleanup не выполнен: '+String(e))}
    finally{setBusy('')}
  }

  if(!channels.length)return <section className="panel"><b>Нет каналов</b><p>Подключите YouTube-каналы, затем Materials будет вести отдельную библиотеку для каждого channelId.</p></section>;

  return <div className="materialsManager">
    <section className="panel materialsHero">
      <div><small>PRODUCTION → MATERIALS</small><h2>Материалы по каналам</h2><p>Изображения привязываются к channelId вручную при импорте. Имя файла не используется для определения канала.</p></div>
      <div className="pmActions"><button disabled={!!busy} onClick={()=>void refresh()}>↻ ОБНОВИТЬ</button></div>
    </section>

    <section className="panel materialsTablePanel">
      <div className="materialsTableHead"><div><small>IMAGE + MUSIC LIBRARY</small><h3>Все каналы</h3></div><span>{channels.length} каналов</span></div>
      <div className="materialsTable">
        <div className="materialsRow materialsHeader"><span>Канал</span><span>Музыка</span><span>Изображения</span><span>Назначено</span><span>Использовано</span><span>Нужны изображения</span><span>READY_RENDER</span><span>Действия</span></div>
        {channels.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(ch=>{
          const row=rows[ch.id];
          const waiting=jobs.filter(j=>j.channelId===ch.id&&j.status==='NEED_IMAGE').length;
          const ready=jobs.filter(j=>j.channelId===ch.id&&j.status==='READY_RENDER').length;
          const available=row?.image.available||0;
          const need=Math.max(0,waiting-available);
          return <div className="materialsRow" key={ch.id}>
            <span className="materialsChannel"><b>{ch.name}</b><small>{ch.id}</small></span>
            <span><b>{n(row?.musicTotal)}</b><small>своб. {n(row?.musicFree)} • назнач. {n(row?.musicAssigned)}</small><small title={row?.musicLibraryPath||''}>{row?.musicLibraryPath||'Music Library не выбрана'}</small></span>
            <span><b>{n(available)}</b><small>master: {n(row?.image.total)}</small></span>
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
      <div><small>SAFE CLEANUP</small><h3>Готово к очистке</h3><p>Eligibility определяется валидным завершённым Render. Master Image Library и source Music Library не удаляются.</p></div>
      <div className="materialsCleanupStats">
        <span><b>{n(cleanup?.eligibleProjects)}</b><small>проектов</small></span>
        <span><b>{gb(cleanup?.estimatedBytes)} GB</b><small>можно освободить</small></span>
        <span><b>{n(cleanup?.protectedRenders)}</b><small>Render защищены</small></span>
      </div>
      <label className="materialsPolicy">После успешного Render
        <select value={prefs.cleanupPolicy} onChange={e=>patchPrefs({cleanupPolicy:e.target.value as typeof prefs.cleanupPolicy})}>
          <option value="prompt">Предлагать очистку</option>
          <option value="never">Никогда</option>
          <option value="auto3d">Автоматически через 3 дня</option>
          <option value="afterUpload">После успешной загрузки на YouTube</option>
        </select>
      </label>
      <div className="pmActions"><button className="danger" disabled={busy==='cleanup'||!cleanup?.eligibleProjects} onClick={()=>void cleanSafeProjects()}>{busy==='cleanup'?'ОЧИЩАЮ…':'ОЧИСТИТЬ '+(cleanup?.eligibleProjects||0)+' ПРОЕКТОВ'}</button></div>
    </section>
  </div>
}
