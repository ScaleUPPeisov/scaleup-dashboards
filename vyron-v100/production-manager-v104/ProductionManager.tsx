import React,{useEffect,useMemo,useState} from 'react';
import {createJobsCount} from './autopilotCore';
import {productionManagerApi,type BatchSummary,type BuildResult,type ChannelProductionState,type DistributionMode,type ImportSession,type MusicSummary,type Validation} from './productionManagerApi';
import {useApp} from './store';

const MODES:Array<{id:DistributionMode;title:string;hint:string}>=[
  {id:'even',title:'Равномерно',hint:'Сначала используются треки с наименьшим числом использований.'},
  {id:'random',title:'Случайно',hint:'Случайные комбинации без дубля одного трека внутри проекта.'},
  {id:'no-repeat',title:'Без повторов в партии',hint:'Сначала проходит вся библиотека, затем начинается новый цикл.'},
];

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,Math.floor(value||min)))}
function shortPath(value?:string){if(!value)return 'Не выбрана';return value.length>72?'…'+value.slice(-71):value}
function batchLabel(batch:BatchSummary){return `${batch.channelName} • ${batch.batchId}`}

export function ProductionManager(){
  const channels=useApp(s=>s.channels);
  const jobs=useApp(s=>s.jobs);
  const setJobs=useApp(s=>s.setJobs);
  const settings=useApp(s=>s.settings);
  const toast=useApp(s=>s.toast);

  const [channelId,setChannelId]=useState(channels[0]?.id||'');
  const [session,setSession]=useState<ImportSession|null>(null);
  const [music,setMusic]=useState<MusicSummary|null>(null);
  const [batches,setBatches]=useState<BatchSummary[]>([]);
  const [projectCount,setProjectCount]=useState(30);
  const [tracksPerProject,setTracksPerProject]=useState(15);
  const [mode,setMode]=useState<DistributionMode>('even');
  const [allowImageReuse,setAllowImageReuse]=useState(false);
  const [busy,setBusy]=useState('');
  const [progress,setProgress]=useState<{completed:number;total:number;stage:string}|null>(null);
  const [result,setResult]=useState<BuildResult|null>(null);
  const [validation,setValidation]=useState<Validation|null>(null);

  const channel=channels.find(c=>c.id===channelId);
  const workspace=settings.workspace||'';
  const endlumePath=settings.endlumePath||'';
  const collected=session?.collected.length||0;
  const requiredTracks=projectCount*tracksPerProject;

  useEffect(()=>{if(!channelId&&channels[0])setChannelId(channels[0].id)},[channelId,channels]);

  async function refreshState(){
    if(!workspace||!channelId){setSession(null);setMusic(null);setBatches([]);return}
    try{
      const state:ChannelProductionState=await productionManagerApi.state(workspace,channelId);
      setSession(state.importSession||null);setMusic(state.music||null);setBatches(state.batches||[]);
    }catch{
      try{const list=await productionManagerApi.batches(workspace,channelId);setBatches(list)}catch{}
    }
  }

  useEffect(()=>{void refreshState()},[workspace,channelId]);

  useEffect(()=>{
    let live=true;
    const offs:Promise<()=>void>[]=[];
    offs.push(productionManagerApi.onImportProgress(p=>{if(live&&p.channelId===channelId)void refreshState()}));
    offs.push(productionManagerApi.onBatchProgress(p=>{
      if(!live)return;
      setProgress({completed:p.completed,total:p.total,stage:p.stage});
      if(p.total>0&&p.completed>=p.total)void refreshState();
    }));
    return()=>{live=false;offs.forEach(p=>p.then(fn=>fn()).catch(()=>{}))}
  },[workspace,channelId]);

  const jobLinks=useMemo(()=>jobs.filter(j=>j.channelId===channelId).sort((a,b)=>a.number-b.number),[jobs,channelId]);

  async function toggleImport(){
    if(!workspace||!channel){toast('Сначала выберите канал и рабочую папку VYRON');return}
    setBusy('import');
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
      const built=await productionManagerApi.build({requestId:crypto.randomUUID(),workspace,channelId:channel.id,channelName:channel.name,projectCount,tracksPerProject,mode,allowImageReuse:reuse,jobLinks:links.map(j=>({jobId:j.id,number:j.number}))});
      setResult(built);
      if(built.batch){
        setBatches(prev=>[built.batch!,...prev.filter(x=>x.batchId!==built.batch!.batchId)]);
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

  async function openEndlume(batch=result?.batch||null){
    if(!batch)return;if(!endlumePath){toast('Укажите путь к ENDLUME в настройках VYRON');return}
    setBusy('endlume');
    try{
      const checked=await productionManagerApi.validate(batch.manifestPath,endlumePath);
      setValidation(checked);
      if(checked.errors>0){toast(`Передача остановлена: ошибок ${checked.errors}`);return}
      await productionManagerApi.openInEndlume(endlumePath,batch.manifestPath);
      toast('Batch передан в ENDLUME');
      await refreshState();
    }catch(e){toast(String(e))}finally{setBusy('')}
  }

  async function resume(batch:BatchSummary){
    setBusy(batch.batchId);
    try{
      const resumed=await productionManagerApi.resume(batch.manifestPath);
      setResult({status:'ready',availableImages:collected,requestedProjects:resumed.projectCount,batch:resumed});
      await refreshState();toast(`Batch восстановлен: ${resumed.completedProjects}/${resumed.projectCount}`);
    }catch(e){toast(String(e))}finally{setBusy('')}
  }

  if(!channels.length)return <div className="panel emptyManager"><div><b>Нет подключённых каналов</b><p>Production Manager использует существующий список каналов VYRON.</p></div></div>;

  return <div className="productionManager">
    <section className="panel pmHero"><div><small>LOCAL PRODUCTION • 0 YOUTUBE API</small><h2>Автономная подготовка для ENDLUME</h2><p>Изображения → плоские папки проектов → музыка → manifest → ENDLUME. YouTube API здесь не вызывается.</p></div><label>Канал<select value={channelId} onChange={e=>{setChannelId(e.target.value);setResult(null);setValidation(null)}}>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></section>

    <div className="pmGrid">
      <section className="panel pmCard"><div className="pmCardHead"><span><small>01</small><h3>Изображения</h3></span><b className={session?.active?'live':''}>{session?.active?'● СБОР ИДЁТ':'ГОТОВО'}</b></div><p>VYRON следит за Downloads только во время активной import-сессии выбранного канала и создаёт собственную нумерацию.</p><div className="pmBigNumber">{collected}<small>изображений собрано</small></div><div className="pmActions"><button className="primary" disabled={busy==='import'} onClick={toggleImport}>{session?.active?'ЗАВЕРШИТЬ СБОР':'НАЧАТЬ СБОР'}</button></div><small className="pmHint">{session?.importPath?shortPath(session.importPath):'После запуска скачивайте изображения из ChatGPT как обычно.'}</small></section>
      <section className="panel pmCard"><div className="pmCardHead"><span><small>02</small><h3>Музыка канала</h3></span><b>{music?.tracks||0} ТРЕКОВ</b></div><p>Оригинальная библиотека не изменяется. В batch копируются только назначенные треки.</p><code className="pmPath">{shortPath(music?.libraryPath)}</code><div className="pmActions"><button className="primary" disabled={busy==='music'} onClick={chooseMusic}>ВЫБРАТЬ ПАПКУ</button><button disabled={busy==='music'||!music?.libraryPath} onClick={reindexMusic}>ПЕРЕИНДЕКСИРОВАТЬ</button></div><small className="pmHint">Добавленные и удалённые треки учитываются после переиндексации.</small></section>
    </div>

    <section className="panel pmBuilder"><div className="pmBuilderHead"><div><small>03 • BATCH BUILDER</small><h3>Собрать проекты</h3><p>В каждой папке будет ровно 1 изображение и выбранное количество песен — без вложенных папок.</p></div><div className="pmFormula"><b>{projectCount}</b><span>×</span><b>{tracksPerProject}</b><span>=</span><strong>{requiredTracks}</strong><small>назначений</small></div></div>
      <div className="pmControls"><label>Количество проектов<div className="pmStepper"><button onClick={()=>setProjectCount(v=>clamp(v-1,1,1000))}>−</button><input type="number" min="1" max="1000" value={projectCount} onChange={e=>setProjectCount(clamp(+e.target.value,1,1000))}/><button onClick={()=>setProjectCount(v=>clamp(v+1,1,1000))}>+</button></div></label><label>Песен на проект<div className="pmPresetLine">{[10,15,20].map(n=><button key={n} className={tracksPerProject===n?'active':''} onClick={()=>setTracksPerProject(n)}>{n}</button>)}<input type="number" min="1" max="100" value={tracksPerProject} onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}/></div></label><label className="pmReuse"><input type="checkbox" checked={allowImageReuse} onChange={e=>setAllowImageReuse(e.target.checked)}/><span><b>Разрешить повтор изображений</b><small>По умолчанию выключено. Используется только если изображений меньше проектов.</small></span></label></div>
      <div className="pmModes">{MODES.map(m=><button key={m.id} className={mode===m.id?'active':''} onClick={()=>setMode(m.id)}><i>{mode===m.id?'●':'○'}</i><span><b>{m.title}</b><small>{m.hint}</small></span></button>)}</div>
      <div className="pmReadiness"><span className={collected>=projectCount?'ok':'warn'}>Изображения<b>{collected} / {projectCount}</b></span><span className={music?.tracks?'ok':'warn'}>Музыка<b>{music?.tracks||0} треков</b></span><span className={workspace?'ok':'warn'}>Workspace<b>{workspace?'готов':'не задан'}</b></span><span className={endlumePath?'ok':'warn'}>ENDLUME<b>{endlumePath?'настроен':'путь не задан'}</b></span></div>
      {result?.status==='insufficient_images'&&<div className="pmShortage"><div><b>Недостаточно изображений</b><span>Доступно {result.availableImages}, запрошено {result.requestedProjects}.</span></div><button onClick={()=>setProjectCount(result.availableImages||1)}>СОБРАТЬ ТОЛЬКО {result.availableImages}</button><button className="primary" onClick={()=>{setAllowImageReuse(true);void buildBatch(true)}}>РАЗРЕШИТЬ ПОВТОР</button></div>}
      {progress&&<div className="pmBuildProgress"><div><span>{progress.stage}</span><b>{progress.completed} / {progress.total}</b></div><i><em style={{width:`${progress.total?Math.min(100,progress.completed/progress.total*100):0}%`}}/></i><small>Файловые операции выполняются native backend и не блокируют UI.</small></div>}
      <div className="pmActions"><button className="primary pmBuildButton" disabled={!!busy||!workspace||!channel||!music?.tracks} onClick={()=>void buildBatch()}>{busy==='build'?'СОБИРАЮ…':`СОБРАТЬ ${projectCount} ПРОЕКТОВ`}</button></div>
    </section>

    {result?.batch&&<section className="panel pmResult"><div className="pmResultHead"><div><small>04 • ENDLUME PACKAGE</small><h3>{batchLabel(result.batch)}</h3><p>{result.batch.projectCount} проектов • {result.batch.tracksAssigned} музыкальных назначений • manifest готов</p></div>{validation&&<div className={`pmValidation ${validation.errors?'bad':'good'}`}>{validation.errors?`ОШИБОК ${validation.errors}`:`ГОТОВО ${validation.ready}/${result.batch.projectCount}`}</div>}</div><div className="pmChecklist"><span>Папки<b>{result.batch.projectCount}</b></span><span>Изображения<b>{result.batch.projectCount}</b></span><span>Музыка<b>{result.batch.tracksAssigned}</b></span><span>Manifest<b>готов</b></span><span>ENDLUME<b>{validation?.endlumeExists?'найден':endlumePath?'проверить':'не задан'}</b></span></div>{validation&&validation.errors>0&&<div className="pmErrors">{validation.items.filter(x=>!x.ok).slice(0,8).map(x=><div key={x.projectId}><b>{x.projectId}</b><span>{x.error||'Ошибка проверки'}</span></div>)}</div>}<div className="pmActions resultActions"><button disabled={busy==='validate'} onClick={()=>void validateBatch()}>ПРОВЕРИТЬ</button><button className="primary" disabled={busy==='endlume'||!!validation?.errors} onClick={()=>void openEndlume()}>ОТКРЫТЬ В ENDLUME</button></div></section>}

    <section className="panel pmHistory"><div className="pmHistoryHead"><div><small>ИСТОРИЯ BATCH</small><h3>{channel?.name||'Канал'}</h3></div><button onClick={()=>void refreshState()}>↻ ОБНОВИТЬ</button></div>{batches.length?<div className="pmBatchRows">{batches.slice(0,20).map(batch=><button key={batch.batchId} className={result?.batch?.batchId===batch.batchId?'active':''} onClick={()=>setResult({status:'ready',availableImages:collected,requestedProjects:batch.projectCount,batch})}><span><b>{batch.batchId}</b><small>{new Date(batch.createdAt).toLocaleString('ru-RU')}</small></span><em>{batch.projectCount} проектов</em><em>{batch.completedProjects}/{batch.projectCount}</em><small>{batch.status}</small><strong onClick={e=>{e.stopPropagation();void resume(batch)}}>{busy===batch.batchId?'…':'ОТКРЫТЬ'}</strong></button>)}</div>:<div className="pmEmpty">Для этого канала ещё нет Production batches.</div>}</section>
  </div>
}
