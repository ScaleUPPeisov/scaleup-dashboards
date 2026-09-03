import React,{useEffect,useMemo,useState} from 'react';
import {createJobsCount} from './autopilotCore';
import {productionManagerApi,type BatchStatus,type BatchSummary,type BuildResult,type ChannelProductionState,type DistributionMode,type ImportSession,type MusicSummary,type ProductionStorageStatus,type Validation} from './productionManagerApi';
import {defaultChannelProductionPrefs,patchChannelProductionPrefs,useProductionPrefs} from './productionPrefs';
import {useApp} from './store';

const MODES:Array<{id:DistributionMode;title:string;hint:string}>=[
  {id:'even',title:'Равномерно',hint:'Сначала используются треки с наименьшим числом использований.'},
  {id:'random',title:'Случайно',hint:'Случайные комбинации без дубля одного трека внутри проекта.'},
  {id:'alphabetical',title:'По алфавиту',hint:'Треки идут A→Z / А→Я и следующий проект продолжает последовательность.'},
  {id:'no-repeat',title:'Без повторов в партии',hint:'Сначала проходит вся библиотека, затем начинается новый цикл.'},
];

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,Math.floor(value||min)))}
function shortPath(value?:string){if(!value)return 'Не выбрана';return value.length>72?'…'+value.slice(-71):value}
function batchLabel(batch:BatchSummary){return `${batch.channelName} • ${batch.batchId}`}
function bytesLabel(value?:number|null){if(!value&&value!==0)return '—';const gb=value/1024/1024/1024;return gb>=1?`${gb.toFixed(gb>=100?0:1)} GB`:`${(value/1024/1024).toFixed(0)} MB`}

export function ProductionManager(){
  const channels=useApp(s=>s.channels);
  const jobs=useApp(s=>s.jobs);
  const setJobs=useApp(s=>s.setJobs);
  const settings=useApp(s=>s.settings);
  const toast=useApp(s=>s.toast);

  const [prefs,patchPrefs]=useProductionPrefs();
  const channelId=(prefs.selectedChannelId&&channels.some(c=>c.id===prefs.selectedChannelId)?prefs.selectedChannelId:channels[0]?.id)||'';
  const channelPrefs={...defaultChannelProductionPrefs(),...(prefs.byChannel[channelId]||{})};
  const projectCount=clamp(channelPrefs.projectCount,1,1000),tracksPerProject=clamp(channelPrefs.tracksPerProject,1,100),mode=channelPrefs.mode as DistributionMode,allowImageReuse=Boolean(channelPrefs.allowImageReuse);
  const setProjectCount=(v:number|((n:number)=>number))=>patchChannelProductionPrefs(channelId,{projectCount:clamp(typeof v==='function'?v(projectCount):v,1,1000)});
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
    if(!workspace||!channel){toast('Сначала выберите канал и рабочую папку VYRON');return}
    setBusy('import');
    setImportError('');
    try{
      const next=session?.active?await productionManagerApi.stopImport(workspace,channel.id):await productionManagerApi.startImport(workspace,channel.id,channel.name);
      setSession(next);
      toast(next.active?'Сбор изображений запущен. Скачивайте изображения в Downloads.':`Сбор завершён: ${next.collected.length} изображений`);
    }catch(e){toast(String(e))}finally{setBusy('')}
  }

  async function chooseMusic(){
    if(!workspace||!channel)return;
    const path=await productionManagerApi.chooseMusicFolder();if(!path)return;
    setBusy('music');
    try{
      await productionManagerApi.setMusicLibrary(workspace,channel.id,channel.name,path);
      const indexed=await productionManagerApi.indexMusic(workspace,channel.id);
      setMusic(indexed);toast(`Музыкальная библиотека: ${indexed.tracks} треков`);
    }catch(e){toast(String(e))}finally{setBusy('')}
  }

  async function reindexMusic(){
    if(!workspace||!channelId)return;
    setBusy('music');
    try{const indexed=await productionManagerApi.indexMusic(workspace,channelId);setMusic(indexed);toast(`Переиндексировано: ${indexed.tracks} треков`)}
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
        toast(`Batch готов: ${built.batch.projectCount} проектов • ${built.batch.tracksAssigned} музыкальных назначений`);
        if(endlumePath){try{setValidation(await productionManagerApi.validate(built.batch.manifestPath,endlumePath))}catch{}}
      }
    }catch(e){toast(String(e));setProgress(null)}finally{setBusy('')}
  }

  async function validateBatch(batch=result?.batch||null){
    if(!batch)return;if(!endlumePath){toast('Укажите путь к ENDLUME в настройках VYRON');return}
    setBusy('validate');
    try{setValidation(await productionManagerApi.validate(batch.manifestPath,endlumePath))}
    catch(e){toast(String(e))}finally{setBusy('')}
  }

  async function waitForHandoff(requestPath:string){for(let i=0;i<40;i++){if(await productionManagerApi.handoffConsumed(requestPath))return true;await new Promise(r=>window.setTimeout(r,500))}return false}
  async function openEndlume(batch=result?.batch||null){
    if(!batch)return;if(!endlumePath){toast('Укажите путь к ENDLUME в настройках VYRON');return}
    setBusy('endlume');
    try{
      const checked=await productionManagerApi.validate(batch.manifestPath,endlumePath);setValidation(checked);
      if(checked.errors>0){toast(`Передача остановлена: ошибок ${checked.errors}`);return}
      const receipt=await productionManagerApi.openInEndlume(endlumePath,batch.manifestPath);
      const consumed=await waitForHandoff(receipt.requestPath);
      if(!consumed){toast('ENDLUME открыт, но batch не был принят. Проверьте, что установлен ENDLUME 1.0.0-alpha.8.44 или новее.');return}
      toast(`ENDLUME принял batch ${receipt.batchId}`);await refreshState();setBatchStatus(await productionManagerApi.status(batch.manifestPath));
    }catch(e){toast(`Не удалось передать batch в ENDLUME: ${String(e)}`)}finally{setBusy('')}
  }
  const setSelectedProjects=(ids:string[])=>patchChannelProductionPrefs(channelId,{selectedProjectIds:[...new Set(ids)]});
  const toggleProject=(id:string)=>setSelectedProjects(selectedProjectIds.includes(id)?selectedProjectIds.filter(x=>x!==id):[...selectedProjectIds,id]);
  async function deleteBatchProjects(ids:string[],all=false){
    const batch=result?.batch;if(!batch||!ids.length)return;if(!confirm(all?'Удалить все проекты этого batch?':'Удалить выбранные проекты?'))return;
    setBusy('delete');try{const r=await productionManagerApi.deleteBatchProjects(batch.manifestPath,ids);if(r.deletedJobIds.length)setJobs(useApp.getState().jobs.filter(j=>!r.deletedJobIds.includes(j.id)));setSelectedProjects([]);await refreshState();if(r.batch){setResult({status:'ready',availableImages:collected,requestedProjects:r.batch.projectCount,batch:r.batch});patchChannelProductionPrefs(channelId,{lastBatchId:r.batch.batchId});setBatchStatus(await productionManagerApi.status(r.batch.manifestPath))}else{setResult(null);setBatchStatus(null);patchChannelProductionPrefs(channelId,{lastBatchId:undefined})}toast(`Удалено проектов: ${r.deletedProjectIds.length}`)}catch(e){toast(`Не удалось удалить проекты: ${String(e)}`)}finally{setBusy('')}
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
    const path=await productionManagerApi.chooseProductionRoot();if(!path)return;
    const status=await productionManagerApi.storageStatus(path);if(!status.exists||!status.writable){toast(status.error||'Папка Production недоступна для записи');return}
    if(scope==='global')patchPrefs({productionRoot:path});else patchChannelProductionPrefs(channelId,{productionRoot:path});setStorageStatus(status);toast(scope==='global'?'Основное хранилище Production сохранено':'Хранилище текущего канала сохранено');
  }
  function resetChannelProductionRoot(){patchChannelProductionPrefs(channelId,{productionRoot:undefined});toast('Канал снова использует основное хранилище Production')}

  if(!channels.length)return <div className="panel emptyManager"><div><b>Нет подключённых каналов</b><p>Production Manager использует существующий список каналов VYRON.</p></div></div>;

  return <div className="productionManager">
    <section className="panel pmHero"><div><small>LOCAL PRODUCTION • 0 YOUTUBE API</small><h2>Автономная подготовка для ENDLUME</h2><p>Изображения → плоские папки проектов → музыка → manifest → ENDLUME. YouTube API здесь не вызывается.</p></div><div className="pmChannelBadge"><small>ТЕКУЩИЙ КАНАЛ</small><b>{channel?.name||'—'}</b><span>Берётся из общего Production workspace</span></div></section>
    <section className="panel pmCard pmStorage"><div className="pmCardHead"><span><small>STORAGE</small><h3>Хранилище проектов</h3></span><b className={storageStatus?.exists&&storageStatus?.writable?'live':''}>{storageStatus?.exists&&storageStatus?.writable?'● ДОСТУПНО':'● ПРОВЕРИТЬ'}</b></div><p>Сюда создаются только НОВЫЕ batch-папки. Уже собранные изображения, музыкальный индекс и старые batch не перемещаются.</p><code className="pmPath">{productionRoot||'Не выбрано'}</code><div className="pmReadiness"><span className={storageStatus?.exists?'ok':'warn'}>Диск<b>{storageStatus?.external?'внешний':'локальный'}</b></span><span className={storageStatus?.writable?'ok':'warn'}>Запись<b>{storageStatus?.writable?'доступна':'нет доступа'}</b></span><span className="ok">Свободно<b>{bytesLabel(storageStatus?.freeBytes)}</b></span><span className="ok">Режим<b>{channelPrefs.productionRoot?'для канала':prefs.productionRoot?'основной':'workspace VYRON'}</b></span></div>{storageStatus?.error&&<div className="pmShortage"><div><b>Production Workspace недоступен</b><span>{storageStatus.error}</span></div></div>}<div className="pmActions"><button className="primary" onClick={()=>void chooseProductionRoot('global')}>ВЫБРАТЬ ОСНОВНУЮ ПАПКУ</button><button onClick={()=>void chooseProductionRoot('channel')}>ДЛЯ ЭТОГО КАНАЛА</button>{channelPrefs.productionRoot&&<button onClick={resetChannelProductionRoot}>СБРОСИТЬ ДЛЯ КАНАЛА</button>}<button disabled={!productionRoot||!storageStatus?.exists} onClick={()=>void productionManagerApi.openFolder(productionRoot)}>ОТКРЫТЬ В FINDER</button></div><small className="pmHint">Если внешний диск отключён, VYRON остановит сборку batch и НЕ переключится молча на SSD Mac.</small></section>

    <div className="pmGrid">
      <section className="panel pmCard"><div className="pmCardHead"><span><small>01</small><h3>Изображения</h3></span><b className={session?.active&&!importError?'live':''}>{importError?'● ОШИБКА':session?.active?(collected?'● СБОР ИДЁТ':'● ЖДУ ФАЙЛЫ'):'ГОТОВО'}</b></div><p>VYRON следит за Downloads только во время активной import-сессии выбранного канала и создаёт собственную нумерацию.</p><div className="pmBigNumber">{collected}<small>изображений собрано</small></div>{importError&&<div className="pmShortage"><div><b>Проблема со сбором изображений</b><span>{importError}</span></div></div>}<div className="pmActions"><button className="primary" disabled={busy==='import'} onClick={toggleImport}>{session?.active?'ЗАВЕРШИТЬ СБОР':'НАЧАТЬ СБОР'}</button></div><small className="pmHint">{session?.active?`Слежу: ${shortPath(session.downloadsPath)} • Копии: ${shortPath(session.importPath)}`:session?.importPath?shortPath(session.importPath):'После запуска скачивайте изображения из ChatGPT как обычно.'}</small></section>
      <section className="panel pmCard"><div className="pmCardHead"><span><small>02</small><h3>Музыка канала</h3></span><b>{music?.tracks||0} ТРЕКОВ</b></div><p>Оригинальная библиотека не изменяется. В batch копируются только назначенные треки.</p><code className="pmPath">{shortPath(music?.libraryPath)}</code><div className="pmActions"><button className="primary" disabled={busy==='music'} onClick={chooseMusic}>ВЫБРАТЬ ПАПКУ</button><button disabled={busy==='music'||!music?.libraryPath} onClick={reindexMusic}>ПЕРЕИНДЕКСИРОВАТЬ</button></div><small className="pmHint">Добавленные и удалённые треки учитываются после переиндексации.</small></section>
    </div>

    <section className="panel pmBuilder"><div className="pmBuilderHead"><div><small>03 • BATCH BUILDER</small><h3>Собрать проекты</h3><p>В каждой папке будет ровно 1 изображение и выбранное количество песен — без вложенных папок.</p></div><div className="pmFormula"><b>{projectCount}</b><span>×</span><b>{tracksPerProject}</b><span>=</span><strong>{requiredTracks}</strong><small>назначений</small></div></div>
      <div className="pmControls"><label>Количество проектов<div className="pmStepper"><button onClick={()=>setProjectCount(v=>clamp(v-1,1,1000))}>−</button><input type="number" min="1" max="1000" value={projectCount} onChange={e=>setProjectCount(clamp(+e.target.value,1,1000))}/><button onClick={()=>setProjectCount(v=>clamp(v+1,1,1000))}>+</button></div></label><label>Песен на проект<div className="pmPresetLine">{[10,15,20,30].map(n=><button key={n} className={tracksPerProject===n?'active':''} onClick={()=>setTracksPerProject(n)}>{n}</button>)}</div><div className="pmRangeLine"><input aria-label="Песен на проект" type="range" min="1" max="100" value={tracksPerProject} onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}/><input type="number" min="1" max="100" value={tracksPerProject} onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}/></div></label><label className="pmReuse"><input type="checkbox" checked={allowImageReuse} onChange={e=>setAllowImageReuse(e.target.checked)}/><span><b>Разрешить повтор изображений</b><small>По умолчанию выключено. Используется только если изображений меньше проектов.</small></span></label></div>
      <div className="pmModes">{MODES.map(m=><button key={m.id} className={mode===m.id?'active':''} onClick={()=>setMode(m.id)}><i>{mode===m.id?'●':'○'}</i><span><b>{m.title}</b><small>{m.hint}</small></span></button>)}</div>
      <div className="pmReadiness"><span className={collected>=projectCount?'ok':'warn'}>Изображения<b>{collected} / {projectCount}</b></span><span className={music?.tracks?'ok':'warn'}>Музыка<b>{music?.tracks||0} треков</b></span><span className={workspace?'ok':'warn'}>Workspace<b>{workspace?'готов':'не задан'}</b></span><span className={endlumePath?'ok':'warn'}>ENDLUME<b>{endlumePath?'настроен':'путь не задан'}</b></span></div>
      {result?.status==='insufficient_images'&&<div className="pmShortage"><div><b>Недостаточно изображений</b><span>Доступно {result.availableImages}, запрошено {result.requestedProjects}.</span></div><button onClick={()=>setProjectCount(result.availableImages||1)}>СОБРАТЬ ТОЛЬКО {result.availableImages}</button><button className="primary" onClick={()=>{setAllowImageReuse(true);void buildBatch(true)}}>РАЗРЕШИТЬ ПОВТОР</button></div>}
      {progress&&<div className="pmBuildProgress"><div><span>{progress.stage}</span><b>{progress.completed} / {progress.total}</b></div><i><em style={{width:`${progress.total?Math.min(100,progress.completed/progress.total*100):0}%`}}/></i><small>Файловые операции выполняются native backend и не блокируют UI.</small></div>}
      <div className="pmActions"><button className="primary pmBuildButton" disabled={!!busy||!workspace||!channel||!music?.tracks||Boolean(customProductionRoot&&storageStatus&&(!storageStatus.exists||!storageStatus.writable))} onClick={()=>void buildBatch()}>{busy==='build'?'СОБИРАЮ…':`СОБРАТЬ ${projectCount} ПРОЕКТОВ`}</button></div>
    </section>

    {result?.batch&&<section className="panel pmResult"><div className="pmResultHead"><div><small>04 • ENDLUME PACKAGE</small><h3>{batchLabel(result.batch)}</h3><p>{result.batch.projectCount} проектов • {result.batch.tracksAssigned} музыкальных назначений • manifest готов</p><code className="pmPath">Batch: {result.batch.rootPath}</code><div className="pmActions"><button onClick={()=>void productionManagerApi.openFolder(result.batch!.rootPath)}>ОТКРЫТЬ ПАПКУ BATCH</button></div></div>{validation&&<div className={`pmValidation ${validation.errors?'bad':'good'}`}>{validation.errors?`ОШИБОК ${validation.errors}`:`ГОТОВО ${validation.ready}/${result.batch.projectCount}`}</div>}</div><div className="pmChecklist"><span>Папки<b>{result.batch.projectCount}</b></span><span>Изображения<b>{result.batch.projectCount}</b></span><span>Музыка<b>{result.batch.tracksAssigned}</b></span><span>Manifest<b>готов</b></span><span>ENDLUME<b>{validation?.endlumeExists?'найден':endlumePath?'проверить':'не задан'}</b></span></div>{validation&&validation.errors>0&&<div className="pmErrors">{validation.items.filter(x=>!x.ok).slice(0,8).map(x=><div key={x.projectId}><b>{x.projectId}</b><span>{x.error||'Ошибка проверки'}</span></div>)}</div>}{batchStatus?.projects?.length?<div className="pmProjectSelection"><div className="pmBulkBar"><span>Проекты batch • выбрано <b>{selectedProjectIds.filter(id=>batchStatus.projects.some(p=>p.projectId===id)).length}</b> / {batchStatus.projects.length}</span><button onClick={()=>setSelectedProjects(batchStatus.projects.map(p=>p.projectId))}>Выбрать всё</button><button onClick={()=>setSelectedProjects([])}>Снять выделение</button><button className="danger" disabled={!selectedProjectIds.length||busy==='delete'} onClick={()=>void deleteBatchProjects(selectedProjectIds,false)}>Удалить выбранные</button><button className="danger" disabled={busy==='delete'} onClick={()=>void deleteBatchProjects(batchStatus.projects.map(p=>p.projectId),true)}>Удалить все</button></div><div className="pmProjectRows">{batchStatus.projects.map(p=><label key={p.projectId}><input type="checkbox" checked={selectedProjectIds.includes(p.projectId)} onChange={()=>toggleProject(p.projectId)}/><b>{p.projectId}</b><span>{p.renderStatus}</span><small>{p.outputFile?'MP4 готов':p.error||'ожидает'}</small></label>)}</div></div>:null}<div className="pmActions resultActions"><button disabled={busy==='validate'} onClick={()=>void validateBatch()}>ПРОВЕРИТЬ</button><button className="primary" disabled={busy==='endlume'||!!validation?.errors} onClick={()=>void openEndlume()}>ОТКРЫТЬ В ENDLUME</button></div></section>}

    <section className="panel pmHistory"><div className="pmHistoryHead"><div><small>ИСТОРИЯ BATCH</small><h3>{channel?.name||'Канал'}</h3></div><button onClick={()=>void refreshState()}>↻ ОБНОВИТЬ</button></div>{batches.length?<div className="pmBatchRows">{batches.slice(0,20).map(batch=><button key={batch.batchId} className={result?.batch?.batchId===batch.batchId?'active':''} onClick={()=>{setResult({status:'ready',availableImages:collected,requestedProjects:batch.projectCount,batch});patchChannelProductionPrefs(channelId,{lastBatchId:batch.batchId,selectedProjectIds:[]});void productionManagerApi.status(batch.manifestPath).then(setBatchStatus).catch(()=>setBatchStatus(null))}}><span><b>{batch.batchId}</b><small>{new Date(batch.createdAt).toLocaleString('ru-RU')}</small></span><em>{batch.projectCount} проектов</em><em>{batch.completedProjects}/{batch.projectCount}</em><small>{batch.status}</small><strong onClick={e=>{e.stopPropagation();void resume(batch)}}>{busy===batch.batchId?'…':'ОТКРЫТЬ'}</strong></button>)}</div>:<div className="pmEmpty">Для этого канала ещё нет Production batches.</div>}</section>
  </div>
}
