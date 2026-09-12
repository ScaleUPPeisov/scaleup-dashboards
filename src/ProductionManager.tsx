import React,{useEffect,useMemo,useState} from 'react';
import {createJobsCount} from './autopilotCore';
import {productionManagerApi,type BatchStatus,type BatchSummary,type BuildResult,type ChannelProductionState,type DistributionMode,type ImportSession,type MusicSummary,type ProductionStorageStatus,type Validation} from './productionManagerApi';
import {defaultChannelProductionPrefs,patchChannelProductionPrefs,useProductionPrefs} from './productionPrefs';
import {useApp} from './store';
import {nextProjectLifecycle} from './storageLifecycle';
import {notifyInfo,notifySuccess} from './notificationCenter';

const MODES:Array<{id:DistributionMode;title:string;hint:string}>=[
  {id:'even',title:'Равномерно',hint:'Сначала используются треки с наименьшим числом использований.'},
  {id:'random',title:'Случайно',hint:'Случайные комбинации без дубля одного трека внутри проекта.'},
  {id:'alphabetical',title:'По порядку',hint:'Песни берутся по порядку из музыкальной библиотеки.'},
];

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,Math.floor(value||min)))}
function shortPath(value?:string){if(!value)return 'Не выбрана';return value.length>72?'…'+value.slice(-71):value}
function batchLabel(batch:BatchSummary){return `${batch.channelName} • ${batch.batchId}`}
function bytesLabel(value?:number|null){if(!value&&value!==0)return '—';const gb=value/1024/1024/1024;return gb>=1?`${gb.toFixed(gb>=100?0:1)} GB`:`${(value/1024/1024).toFixed(0)} MB`}

export function ProductionManager({view='all'}:{view?:'all'|'materials'|'builder'}){
  const channels=useApp(s=>s.channels);
  const jobs=useApp(s=>s.jobs);
  const setJobs=useApp(s=>s.setJobs);
  const settings=useApp(s=>s.settings);
  const uploadHistory=useApp(s=>s.uploadHistory);
  const patchProjectLifecycle=useApp(s=>s.patchProjectLifecycle);
  const toast=useApp(s=>s.toast);

  const [prefs,patchPrefs]=useProductionPrefs();
  const channelId=(prefs.selectedChannelId&&channels.some(c=>c.id===prefs.selectedChannelId)?prefs.selectedChannelId:channels[0]?.id)||'';
  const channelPrefs={...defaultChannelProductionPrefs(),...(prefs.byChannel[channelId]||{})};
  const projectCount=clamp(channelPrefs.projectCount,1,10000),tracksPerProject=clamp(channelPrefs.tracksPerProject,1,100),mode=(['even','random','alphabetical'].includes(channelPrefs.mode)?channelPrefs.mode:'even') as DistributionMode,allowImageReuse=Boolean(channelPrefs.allowImageReuse);
  const setProjectCount=(v:number|((n:number)=>number))=>patchChannelProductionPrefs(channelId,{projectCount:clamp(typeof v==='function'?v(projectCount):v,1,10000)});
  const setTracksPerProject=(v:number)=>patchChannelProductionPrefs(channelId,{tracksPerProject:clamp(v,1,100)});
  const setMode=(v:DistributionMode)=>patchChannelProductionPrefs(channelId,{mode:v});
  const setAllowImageReuse=(v:boolean)=>patchChannelProductionPrefs(channelId,{allowImageReuse:v});
  const selectedProjectIds=channelPrefs.selectedProjectIds||[];
  const [session,setSession]=useState<ImportSession|null>(null);
  const [music,setMusic]=useState<MusicSummary|null>(null);
  const [batches,setBatches]=useState<BatchSummary[]>([]);
  const [busy,setBusy]=useState('');
  const [progress,setProgress]=useState<{completed:number;total:number;stage:string}|null>(null);
  const [result,setResult]=useState<BuildResult|null>(null);
  const [validation,setValidation]=useState<Validation|null>(null);
  const [importError,setImportError]=useState('');
  const [batchStatus,setBatchStatus]=useState<BatchStatus|null>(null);
  const [storageStatus,setStorageStatus]=useState<ProductionStorageStatus|null>(null);

  const channel=channels.find(c=>c.id===channelId);
  const workspace=settings.workspace||'';
  const productionRoot=(channelPrefs.productionRoot||prefs.productionRoot||workspace).trim();
  const customProductionRoot=Boolean(channelPrefs.productionRoot||prefs.productionRoot);
  const endlumePath=settings.endlumePath||'';
  const collected=session?.collected.length||0;
  const requiredTracks=projectCount*tracksPerProject;

  useEffect(()=>{if(!prefs.selectedChannelId&&channels[0])patchPrefs({selectedChannelId:channels[0].id})},[prefs.selectedChannelId,channels.length]);

  async function refreshState(){
    if(!workspace||!channelId){setSession(null);setMusic(null);setBatches([]);return}
    let base:BatchSummary[]=[];
    try{
      const state:ChannelProductionState=await productionManagerApi.state(workspace,channelId);
      setSession(state.importSession||null);setMusic(state.music||null);base=state.batches||[];
    }catch{
      try{base=await productionManagerApi.batches(workspace,channelId)}catch{}
    }
    if(productionRoot&&productionRoot!==workspace){try{base=[...base,...await productionManagerApi.batches(productionRoot,channelId)]}catch{}}
    const merged=[...new Map(base.map(b=>[b.batchId,b])).values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));setBatches(merged);
  }

  useEffect(()=>{void refreshState();setResult(null);setValidation(null);setBatchStatus(null)},[workspace,productionRoot,channelId]);
  useEffect(()=>{let live=true;if(!productionRoot){setStorageStatus(null);return}productionManagerApi.storageStatus(productionRoot).then(s=>{if(live)setStorageStatus(s)}).catch(e=>{if(live)setStorageStatus({path:productionRoot,exists:false,writable:false,external:productionRoot.startsWith('/Volumes/'),freeBytes:null,error:String(e)})});return()=>{live=false}},[productionRoot]);
  useEffect(()=>{if(result?.batch){productionManagerApi.status(result.batch.manifestPath).then(setBatchStatus).catch(()=>setBatchStatus(null));return}const last=channelPrefs.lastBatchId&&batches.find(b=>b.batchId===channelPrefs.lastBatchId);if(last)setResult({status:'ready',availableImages:collected,requestedProjects:last.projectCount,batch:last})},[batches,result?.batch?.batchId,channelPrefs.lastBatchId]);
  useEffect(()=>{const batch=result?.batch;if(!batch||!batchStatus?.projects?.length)return;for(const row of batchStatus.projects){if(row.renderStatus!=='Completed'||!row.outputFile)continue;const key=`${batch.batchId}:${row.projectId}`,base={projectId:row.projectId,jobId:row.jobId||undefined,projectPath:`${batch.rootPath}/${row.projectId}`,renderPath:row.outputFile,status:'RENDERED' as const,renderExists:true,updatedAt:new Date().toISOString()};patchProjectLifecycle(key,nextProjectLifecycle(base,uploadHistory));if(row.jobId){const j=useApp.getState().jobs.find(x=>x.id===row.jobId);if(j&&!j.finalPath)useApp.getState().patchJob(j.id,{finalPath:row.outputFile,storageLifecycle:'NEW'})}}},[result?.batch?.batchId,batchStatus?.updatedAt,uploadHistory.length]);

  useEffect(()=>{
    let live=true;
    const offs:Promise<()=>void>[]=[];
    offs.push(productionManagerApi.onImportProgress(p=>{if(live&&p.channelId===channelId)void refreshState()}));
    offs.push(productionManagerApi.onImportError(p=>{if(live&&p.channelId===channelId)setImportError(p.message||'Ошибка сбора изображений')}));
    offs.push(productionManagerApi.onBatchProgress(p=>{
      if(!live)return;
      setProgress({completed:p.completed,total:p.total,stage:p.stage});
      if(p.total>0&&p.completed>=p.total)void refreshState();
    }));
    return()=>{live=false;offs.forEach(p=>p.then(fn=>fn()).catch(()=>{}))}
  },[workspace,channelId]);

  useEffect(()=>{
    if(!workspace||!channelId||!session?.active)return;
    const timer=window.setInterval(()=>{productionManagerApi.importStatus(workspace,channelId).then(next=>{setSession(next);if(!next.active)setImportError('')}).catch(e=>setImportError(String(e)))},1200);
    return()=>window.clearInterval(timer);
  },[workspace,channelId,session?.active]);

  const jobLinks=useMemo(()=>jobs.filter(j=>j.channelId===channelId).sort((a,b)=>a.number-b.number),[jobs,channelId]);

  async function toggleImport(){
    if(!workspace||!channel){toast('Сначала выберите канал и рабочую папку VYRON YT PEISOV');return}
    setBusy('import');
    setImportError('');
    try{
      const next=session?.active?await productionManagerApi.stopImport(workspace,channel.id):await productionManagerApi.startImport(workspace,channel.id,channel.name);
      setSession(next);
      if(next.active)notifyInfo('Сбор изображений запущен','Скачивайте изображения в Downloads.',{operationId:`collector-start:${next.sessionId}`});else notifySuccess('Изображения собраны',`Собрано ${next.collected.length.toLocaleString('ru-RU')} файлов.`,{operationId:`collector-stop:${next.sessionId}:${next.collected.length}`});
    }catch(e){toast(String(e))}finally{setBusy('')}
  }

  async function chooseMusic(){
    if(!workspace||!channel)return;
    const path=await productionManagerApi.chooseMusicFolder(music?.libraryPath||undefined);if(!path)return;
    setBusy('music');
    try{
      await productionManagerApi.setMusicLibrary(workspace,channel.id,channel.name,path);
      const indexed=await productionManagerApi.indexMusic(workspace,channel.id);
      setMusic(indexed);notifySuccess('Музыкальная библиотека обновлена',`${indexed.tracks.toLocaleString('ru-RU')} треков доступно.`,{operationId:`music-index:${channel.id}:${indexed.indexedAt}`});
    }catch(e){toast(String(e))}finally{setBusy('')}
  }

  async function reindexMusic(){
    if(!workspace||!channelId)return;
    setBusy('music');
    try{const indexed=await productionManagerApi.indexMusic(workspace,channelId);setMusic(indexed);notifySuccess('Музыкальная библиотека обновлена',`${indexed.tracks.toLocaleString('ru-RU')} треков доступно.`,{operationId:`music-reindex:${channelId}:${indexed.indexedAt}`})}
    catch(e){toast(String(e))}finally{setBusy('')}
  }

  function ensureJobLinks(){
    if(!channel)return [] as typeof jobLinks;
    const current=useApp.getState().jobs;
    const existing=current.filter(j=>j.channelId===channel.id).sort((a,b)=>a.number-b.number);
    if(existing.length>=projectCount)return existing.slice(0,projectCount);
    const created=createJobsCount(channel,current,projectCount-existing.length);
    const next=[...current,...created];
    setJobs(next);
    return [...existing,...created].sort((a,b)=>a.number-b.number).slice(0,projectCount);
  }

  async function buildBatch(reuse=allowImageReuse){
    if(!workspace||!channel){toast('Нет рабочей папки или канала');return}
    if(!music?.tracks){toast('Сначала выберите и проиндексируйте музыкальную библиотеку');return}
    if(collected<projectCount&&!reuse){
      setResult({status:'insufficient_images',availableImages:collected,requestedProjects:projectCount,message:'Недостаточно изображений'});
      return;
    }
    const links=ensureJobLinks();
    setBusy('build');setProgress({completed:0,total:projectCount,stage:'Подготовка'});setValidation(null);
    try{
      const built=await productionManagerApi.build({requestId:crypto.randomUUID(),workspace,outputWorkspace:productionRoot||workspace,channelId:channel.id,channelName:channel.name,projectCount,tracksPerProject,mode,allowImageReuse:reuse,jobLinks:links.map(j=>({jobId:j.id,number:j.number}))});
      setResult(built);
      if(built.batch){
        setBatches(prev=>[built.batch!,...prev.filter(x=>x.batchId!==built.batch!.batchId)]);patchChannelProductionPrefs(channel.id,{lastBatchId:built.batch.batchId,selectedProjectIds:[]});
        notifySuccess('Проекты созданы',`${built.batch.projectCount.toLocaleString('ru-RU')} проектов готовы для ENDLUME.`,{operationId:`batch-built:${built.batch.batchId}`});
        if(endlumePath){try{setValidation(await productionManagerApi.validate(built.batch.manifestPath,endlumePath))}catch{}}
      }
    }catch(e){toast(String(e));setProgress(null)}finally{setBusy('')}
  }

  async function validateBatch(batch=result?.batch||null){
    if(!batch)return;if(!endlumePath){toast('Укажите путь к ENDLUME в настройках VYRON YT PEISOV');return}
    setBusy('validate');
    try{setValidation(await productionManagerApi.validate(batch.manifestPath,endlumePath))}
    catch(e){toast(String(e))}finally{setBusy('')}
  }

  async function waitForHandoff(requestPath:string){for(let i=0;i<40;i++){if(await productionManagerApi.handoffConsumed(requestPath))return true;await new Promise(r=>window.setTimeout(r,500))}return false}
  async function openEndlume(batch=result?.batch||null,forceResend=false){
    if(!batch)return;if(!endlumePath){toast('Укажите путь к ENDLUME в настройках VYRON YT PEISOV');return}
    const available=batchStatus?.projects.map(p=>p.projectId)||[];const ids=selectedProjectIds.filter(id=>available.includes(id));
    if(!ids.length){toast('Выберите хотя бы один проект для ENDLUME');return}
    setBusy('endlume');
    try{
      const checked=await productionManagerApi.validateProjects(batch.manifestPath,endlumePath,ids);setValidation(checked);
      if(checked.errors>0){toast(`Передача остановлена: ошибок ${checked.errors}`);return}
      let receipt;try{receipt=await productionManagerApi.openInEndlume(endlumePath,batch.manifestPath,ids,forceResend)}catch(e){const msg=String(e);if(msg.includes('ENDLUME_ALREADY_SENT:')&&!forceResend){const repeated=msg.split('ENDLUME_ALREADY_SENT:')[1]?.trim()||'';if(confirm(`${repeated} уже отправлен(ы) в ENDLUME. Отправить повторно?`)){setBusy('');await openEndlume(batch,true);return}}throw e}
      const consumed=await waitForHandoff(receipt.requestPath);
      if(!consumed){toast('ENDLUME открыт, но выбранные проекты не были приняты. Проверьте установленную версию ENDLUME.');return}
      notifySuccess('Передано в ENDLUME',`${receipt.selectedProjectIds.length.toLocaleString('ru-RU')} из ${batch.projectCount.toLocaleString('ru-RU')} проектов отправлено на рендер.`,{operationId:`endlume-handoff:${receipt.batchId}:${Date.now()}`});setSelectedProjects([]);await refreshState();setBatchStatus(await productionManagerApi.status(batch.manifestPath));
    }catch(e){toast(`Не удалось передать выбранные проекты в ENDLUME: ${String(e)}`)}finally{setBusy('')}
  }
  const setSelectedProjects=(ids:string[])=>patchChannelProductionPrefs(channelId,{selectedProjectIds:[...new Set(ids)]});
  const toggleProject=(id:string)=>setSelectedProjects(selectedProjectIds.includes(id)?selectedProjectIds.filter(x=>x!==id):[...selectedProjectIds,id]);
  async function deleteBatchProjects(ids:string[],all=false){
    const batch=result?.batch;if(!batch||!ids.length)return;if(!confirm(all?'Удалить все проекты этого batch?':'Удалить выбранные проекты?'))return;
    setBusy('delete');try{const r=await productionManagerApi.deleteBatchProjects(batch.manifestPath,ids);if(r.deletedJobIds.length)setJobs(useApp.getState().jobs.filter(j=>!r.deletedJobIds.includes(j.id)));setSelectedProjects([]);await refreshState();if(r.batch){setResult({status:'ready',availableImages:collected,requestedProjects:r.batch.projectCount,batch:r.batch});patchChannelProductionPrefs(channelId,{lastBatchId:r.batch.batchId});setBatchStatus(await productionManagerApi.status(r.batch.manifestPath))}else{setResult(null);setBatchStatus(null);patchChannelProductionPrefs(channelId,{lastBatchId:undefined})}toast(`Удалено проектов: ${r.deletedProjectIds.length}`)}catch(e){toast(`Не удалось удалить проекты: ${String(e)}`)}finally{setBusy('')}
  }

  async function archiveRenderedVideos(){
    const batch=result?.batch;if(!batch){toast('Сначала откройте batch');return}const archiveRoot=await productionManagerApi.chooseArchiveRoot();if(!archiveRoot)return;
    if(!window.confirm(`Скопировать все завершённые MP4 batch ${batch.batchId} в безопасный архив? Исходные видео останутся на месте и автоматически не удаляются.`))return;
    setBusy('archive');try{const r=await productionManagerApi.archiveRenderedVideos(batch.manifestPath,archiveRoot);notifySuccess('MP4 скопированы в архив',`${r.copiedFiles} файлов • ${bytesLabel(r.copiedBytes)} • исходные видео сохранены • пропущено ${r.skippedFiles}.`,{operationId:`archive-rendered:${batch.batchId}:${Date.now()}`});await productionManagerApi.openFolder(r.archivePath)}catch(e){toast(`Не удалось архивировать MP4: ${String(e)}`)}finally{setBusy('')}
  }
  async function cleanupAllRenderedProjectAssets(){
    if(!batches.length)return;
    if(!window.confirm(`Очистить исходники ВСЕХ завершённых проектов канала ${channel?.name||''}? Будут удалены только копии изображений и музыки внутри VYRON project folders. Готовые MP4 в Rendered НЕ удаляются.`))return;
    if(!window.confirm('ВТОРОЕ ПОДТВЕРЖДЕНИЕ. Точно удалить изображения и музыкальные копии завершённых проектов? Восстановить эти project assets можно будет только повторной сборкой. Готовые MP4 останутся.'))return;
    setBusy('cleanup-all');let projects=0,files=0,bytes=0,skipped=0;
    try{for(const batch of batches){const x=await productionManagerApi.cleanupCompletedAssets(batch.manifestPath);projects+=x.cleanedProjects;files+=x.removedFiles;bytes+=x.freedBytes;skipped+=x.skippedProjects}await refreshState();notifySuccess('Project assets очищены',`${projects} завершённых проектов • удалено файлов: ${files} • освобождено ${bytesLabel(bytes)} • пропущено незавершённых: ${skipped}. Готовые MP4 сохранены. YouTube API: 0.`,{operationId:`cleanup-project-assets:${channelId}:${Date.now()}`})}catch(e){toast(`Не удалось очистить project assets: ${String(e)}`)}finally{setBusy('')}
  }

  async function resume(batch:BatchSummary){
    setBusy(batch.batchId);
    try{
      const resumed=await productionManagerApi.resume(batch.manifestPath);
      setResult({status:'ready',availableImages:collected,requestedProjects:resumed.projectCount,batch:resumed});patchChannelProductionPrefs(channelId,{lastBatchId:resumed.batchId});
      await refreshState();setBatchStatus(await productionManagerApi.status(resumed.manifestPath));toast(`Batch восстановлен: ${resumed.completedProjects}/${resumed.projectCount}`);
    }catch(e){toast(String(e))}finally{setBusy('')}
  }

  async function chooseProductionRoot(scope:'global'|'channel'){
    const initial=scope==='channel'?(channelPrefs.productionRoot||productionRoot):(prefs.productionRoot||workspace||productionRoot);
    const requested=await productionManagerApi.chooseProductionRoot(initial||undefined);if(!requested)return;
    const status=await productionManagerApi.storageStatus(requested);if(!status.exists||!status.writable){toast(status.error||'Папка проектов недоступна для записи');return}
    const path=status.path||requested;
    if(scope==='global')patchPrefs({productionRoot:path});else patchChannelProductionPrefs(channelId,{productionRoot:path});setStorageStatus(status);notifySuccess('Папка проектов изменена',path,{operationId:`storage:${scope}:${channelId}:${path}`});
  }
  function resetChannelProductionRoot(){patchChannelProductionPrefs(channelId,{productionRoot:undefined});toast('Канал снова использует основное хранилище Production')}

  if(!channels.length)return <div className="panel emptyManager"><div><b>Нет подключённых каналов</b><p>Production Manager использует существующий список каналов VYRON YT PEISOV.</p></div></div>;

  return <div className="productionManager">
    <section className="panel pmHero"><div><small>ПОДГОТОВКА ДЛЯ ENDLUME</small><h2>Материалы и сборка проектов</h2><p>Соберите изображения и музыку, затем создайте готовые папки проектов для ENDLUME.</p></div><div className="pmChannelBadge"><small>ТЕКУЩИЙ КАНАЛ</small><b>{channel?.name||'—'}</b><span>Берётся из общего Production workspace</span></div></section>
    {view!=='builder'&&<div className="pmGrid">
      <section className="panel pmCard"><div className="pmCardHead"><span><small>01</small><h3>Изображения</h3></span><b className={session?.active&&!importError?'live':''}>{importError?'● ОШИБКА':session?.active?(collected?'● СБОР ИДЁТ':'● ЖДУ ФАЙЛЫ'):'ГОТОВО'}</b></div><p>VYRON YT PEISOV следит за Downloads только во время активной import-сессии выбранного канала и создаёт собственную нумерацию.</p><div className="pmFileCount"><b>{collected.toLocaleString('ru-RU')}</b><span>файлов собрано</span></div>{importError&&<div className="pmShortage"><div><b>Проблема со сбором изображений</b><span>{importError}</span></div></div>}<div className="pmActions"><button className="primary" disabled={busy==='import'} onClick={toggleImport}>{session?.active?'ЗАВЕРШИТЬ СБОР':'НАЧАТЬ СБОР'}</button></div><small className="pmHint">{session?.active?`Слежу: ${shortPath(session.downloadsPath)} • Копии: ${shortPath(session.importPath)}`:session?.importPath?shortPath(session.importPath):'После запуска скачивайте изображения из ChatGPT как обычно.'}</small></section>
      <section className="panel pmCard"><div className="pmCardHead"><span><small>02</small><h3>Музыкальная библиотека</h3></span><b>{(music?.tracks||0).toLocaleString('ru-RU')} треков</b></div><p>Оригинальная библиотека не изменяется. В batch копируются только назначенные треки.</p><code className="pmPath">{shortPath(music?.libraryPath)}</code><div className="pmActions"><button className="primary" disabled={busy==='music'} onClick={chooseMusic}>ВЫБРАТЬ ПАПКУ</button><button disabled={busy==='music'||!music?.libraryPath} onClick={reindexMusic}>ОБНОВИТЬ БИБЛИОТЕКУ</button></div><small className="pmHint">Добавленные и удалённые треки учитываются после переиндексации.</small></section>
    </div>}

    {view!=='materials'&&<><section className="panel pmBuilder"><div className="pmBuilderHead"><div><small>03</small><h3>Собрать проекты для ENDLUME</h3><p>Укажите количество проектов и песен. В каждой папке будет одно изображение и выбранная музыка.</p></div><div className="pmFormula"><b>{projectCount}</b><span>×</span><b>{tracksPerProject}</b><span>=</span><strong>{requiredTracks}</strong><small>назначений</small></div></div>
      <div className="pmControls"><label>Количество проектов<div className="pmStepper"><button onClick={()=>setProjectCount(v=>clamp(v-1,1,10000))}>−</button><input type="number" min="1" max="10000" value={projectCount} onChange={e=>setProjectCount(clamp(+e.target.value,1,10000))}/><button onClick={()=>setProjectCount(v=>clamp(v+1,1,10000))}>+</button></div></label><label>Песен на проект<div className="pmPresetLine">{[10,15,20,30].map(n=><button key={n} className={tracksPerProject===n?'active':''} onClick={()=>setTracksPerProject(n)}>{n}</button>)}</div><div className="pmRangeLine"><input aria-label="Песен на проект" type="range" min="1" max="100" value={tracksPerProject} onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}/><input type="number" min="1" max="100" value={tracksPerProject} onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}/></div></label><label className="pmReuse"><input type="checkbox" checked={allowImageReuse} onChange={e=>setAllowImageReuse(e.target.checked)}/><span><b>Разрешить повтор изображений</b><small>По умолчанию выключено. Используется только если изображений меньше проектов.</small></span></label></div>
      <div className="pmModes">{MODES.map(m=><button key={m.id} className={mode===m.id?'active':''} onClick={()=>setMode(m.id)}><i>{mode===m.id?'●':'○'}</i><span><b>{m.title}</b><small>{m.hint}</small></span></button>)}</div>
      <div className="pmReadiness"><span className={collected>=projectCount?'ok':'warn'}>Изображения<b>{collected} / {projectCount}</b></span><span className={music?.tracks?'ok':'warn'}>Музыка<b>{music?.tracks||0} треков</b></span><span className={productionRoot?'ok':'warn'}>Папка проектов<b>{productionRoot?'готова':'не выбрана'}</b></span><span className={endlumePath?'ok':'warn'}>ENDLUME<b>{endlumePath?'настроен':'путь не задан'}</b></span></div>
      {result?.status==='insufficient_images'&&<div className="pmShortage"><div><b>Недостаточно изображений</b><span>Доступно {result.availableImages}, запрошено {result.requestedProjects}.</span></div><button onClick={()=>setProjectCount(result.availableImages||1)}>СОБРАТЬ ТОЛЬКО {result.availableImages}</button><button className="primary" onClick={()=>{setAllowImageReuse(true);void buildBatch(true)}}>РАЗРЕШИТЬ ПОВТОР</button></div>}
      {progress&&<div className="pmBuildProgress"><div><span>{progress.stage}</span><b>{progress.completed} / {progress.total}</b></div><i><em style={{width:`${progress.total?Math.min(100,progress.completed/progress.total*100):0}%`}}/></i><small>Файловые операции выполняются native backend и не блокируют UI.</small></div>}
      <div className="pmActions"><button className="primary pmBuildButton" disabled={!!busy||!workspace||!channel||!music?.tracks||Boolean(customProductionRoot&&storageStatus&&(!storageStatus.exists||!storageStatus.writable))} onClick={()=>void buildBatch()}>{busy==='build'?'СОЗДАЮ…':`СОЗДАТЬ ${projectCount} ПРОЕКТОВ`}</button></div>
    </section>

    {result?.batch&&<section className="panel pmResult"><div className="pmResultHead"><div><small>ГОТОВО ДЛЯ ENDLUME</small><h3>{batchLabel(result.batch)}</h3><p>{result.batch.projectCount} проектов • {result.batch.tracksAssigned} музыкальных назначений • manifest готов</p><code className="pmPath">Batch: {result.batch.rootPath}</code><div className="pmActions"><button onClick={()=>void productionManagerApi.openFolder(result.batch!.rootPath)}>ОТКРЫТЬ ПАПКУ BATCH</button></div></div>{validation&&<div className={`pmValidation ${validation.errors?'bad':'good'}`}>{validation.errors?`ОШИБОК ${validation.errors}`:`ГОТОВО ${validation.ready}/${result.batch.projectCount}`}</div>}</div><div className="pmChecklist"><span>Папки<b>{result.batch.projectCount}</b></span><span>Изображения<b>{result.batch.projectCount}</b></span><span>Музыка<b>{result.batch.tracksAssigned}</b></span><span>Manifest<b>готов</b></span><span>ENDLUME<b>{validation?.endlumeExists?'найден':endlumePath?'проверить':'не задан'}</b></span></div>{validation&&validation.errors>0&&<div className="pmErrors">{validation.items.filter(x=>!x.ok).slice(0,8).map(x=><div key={x.projectId}><b>{x.projectId}</b><span>{x.error||'Ошибка проверки'}</span></div>)}</div>}{batchStatus?.projects?.length?<div className="pmProjectSelection"><div className="pmBulkBar"><span>Проекты batch • выбрано <b>{selectedProjectIds.filter(id=>batchStatus.projects.some(p=>p.projectId===id)).length}</b> / {batchStatus.projects.length}</span><button onClick={()=>setSelectedProjects(batchStatus.projects.map(p=>p.projectId))}>Выбрать всё</button><button onClick={()=>setSelectedProjects([])}>Снять выделение</button><button className="danger" disabled={!selectedProjectIds.length||busy==='delete'} onClick={()=>void deleteBatchProjects(selectedProjectIds,false)}>Удалить выбранные</button><button className="danger" disabled={busy==='delete'} onClick={()=>void deleteBatchProjects(batchStatus.projects.map(p=>p.projectId),true)}>Удалить все</button></div><div className="pmProjectRows">{batchStatus.projects.map(p=><label key={p.projectId}><input type="checkbox" checked={selectedProjectIds.includes(p.projectId)} onChange={()=>toggleProject(p.projectId)}/><b>{p.projectId}</b><span>{p.renderStatus==='Waiting'&&p.handoffStatus==='SENT'?'SENT':p.renderStatus}{typeof p.progress==='number'?` • ${Math.round(p.progress)}%`:''}</span><small>{p.outputFile?'MP4 готов':p.error||(p.handoffStatus==='SENT'?'передано в ENDLUME':'готов к ENDLUME')}</small></label>)}</div></div>:null}<div className="pmActions resultActions"><button disabled={busy==='archive'} onClick={()=>void archiveRenderedVideos()}>{busy==='archive'?'АРХИВИРУЮ…':'АРХИВ MP4'}</button><button disabled={busy==='validate'} onClick={()=>void validateBatch()}>ПРОВЕРИТЬ</button><button className="primary" disabled={busy==='endlume'||!selectedProjectIds.length} onClick={()=>void openEndlume()}>ОТПРАВИТЬ В ENDLUME ({selectedProjectIds.length})</button></div></section>}

    <section className="panel pmHistory"><div className="pmHistoryHead"><div><small>ИСТОРИЯ СБОРОК</small><h3>{channel?.name||'Канал'}</h3></div><div className="pmActions"><button className="danger" disabled={busy==='cleanup-all'||!batches.length} onClick={()=>void cleanupAllRenderedProjectAssets()}>{busy==='cleanup-all'?'ОЧИЩАЮ…':'УДАЛИТЬ ВСЕ PROJECT ASSETS'}</button><button onClick={()=>void refreshState()}>↻ ОБНОВИТЬ</button></div></div><p className="pmHint">Очистка удаляет только копии изображений и музыки в завершённых проектах. Rendered MP4 не удаляются. Требуется два подтверждения.</p>{batches.length?<div className="pmBatchRows">{batches.slice(0,20).map(batch=><button key={batch.batchId} className={result?.batch?.batchId===batch.batchId?'active':''} onClick={()=>{setResult({status:'ready',availableImages:collected,requestedProjects:batch.projectCount,batch});patchChannelProductionPrefs(channelId,{lastBatchId:batch.batchId,selectedProjectIds:[]});void productionManagerApi.status(batch.manifestPath).then(setBatchStatus).catch(()=>setBatchStatus(null))}}><span><b>{batch.batchId}</b><small>{new Date(batch.createdAt).toLocaleString('ru-RU')}</small></span><em>{batch.projectCount} проектов</em><em>{batch.completedProjects}/{batch.projectCount}</em><small>{batch.status}</small><strong onClick={e=>{e.stopPropagation();void resume(batch)}}>{busy===batch.batchId?'…':'ОТКРЫТЬ'}</strong></button>)}</div>:<div className="pmEmpty">Для этого канала ещё нет Production batches.</div>}</section></>}
  </div>
}
