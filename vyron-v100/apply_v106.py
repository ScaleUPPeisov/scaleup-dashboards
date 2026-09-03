#!/usr/bin/env python3
from pathlib import Path
import json,re,sys

VERSION='1.0.6'
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def need(rel):
    p=ROOT/rel
    if not p.is_file(): raise SystemExit(f'VYRON 1.0.6: missing {rel}')
    return p

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.6: '+msg)

def write(rel,text):
    p=ROOT/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')

# -----------------------------------------------------------------------------
# Shared Production v2 preferences. This is the single source of truth for the
# selected Production channel/tab and per-channel Autobuild UI preferences.
# Existing native Production Manager files remain the source of truth for
# sessions, music indexes, batches and manifests.
# -----------------------------------------------------------------------------
write('src/productionPrefs.ts',r'''import {useEffect,useState} from 'react';
import type {DistributionMode} from './productionManagerApi';

export type ProductionTab='queue'|'materials'|'manager';
export type ChannelProductionPrefs={projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;lastBatchId?:string;selectedProjectIds:string[]};
export type ProductionPrefs={version:2;selectedChannelId?:string;tab:ProductionTab;byChannel:Record<string,ChannelProductionPrefs>;selectedJobIds:string[]};
const KEY='vyron:production-manager:v2';
const EVENT='vyron-production-prefs-changed';
const defaults=():ProductionPrefs=>({version:2,tab:'queue',byChannel:{},selectedJobIds:[]});
export const defaultChannelProductionPrefs=():ChannelProductionPrefs=>({projectCount:30,tracksPerProject:15,mode:'even',allowImageReuse:false,selectedProjectIds:[]});

export function readProductionPrefs():ProductionPrefs{
  try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x?.version===2)return{...defaults(),...x,byChannel:x.byChannel||{},selectedJobIds:Array.isArray(x.selectedJobIds)?x.selectedJobIds:[]}}catch{}
  const next=defaults();
  try{const old=JSON.parse(localStorage.getItem('vyron:production-workspace:v1')||'null');if(old?.selectedChannelId)next.selectedChannelId=String(old.selectedChannelId)}catch{}
  try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}
  return next;
}
function emit(next:ProductionPrefs){try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}window.dispatchEvent(new CustomEvent(EVENT,{detail:next}))}
export function patchProductionPrefs(p:Partial<ProductionPrefs>|((s:ProductionPrefs)=>ProductionPrefs)){
  const prev=readProductionPrefs();const next=typeof p==='function'?p(prev):{...prev,...p,version:2};emit(next);return next;
}
export function patchChannelProductionPrefs(channelId:string,p:Partial<ChannelProductionPrefs>){
  return patchProductionPrefs(s=>({...s,byChannel:{...s.byChannel,[channelId]:{...defaultChannelProductionPrefs(),...(s.byChannel[channelId]||{}),...p}}}));
}
export function useProductionPrefs():[ProductionPrefs,(p:Partial<ProductionPrefs>|((s:ProductionPrefs)=>ProductionPrefs))=>void]{
  const [state,setState]=useState<ProductionPrefs>(()=>readProductionPrefs());
  useEffect(()=>{const fn=(e:Event)=>setState((e as CustomEvent<ProductionPrefs>).detail||readProductionPrefs());window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)},[]);
  return[state,p=>{const next=patchProductionPrefs(p);setState(next)}];
}
''')

# -----------------------------------------------------------------------------
# ProductionOS: keep existing flow/buttons, but use one persisted Production
# channel and tab. Add safe bulk project removal without touching store.ts.
# -----------------------------------------------------------------------------
p=need('src/ProductionOS.tsx');s=p.read_text(encoding='utf-8')
must("import {ProductionManager} from './ProductionManager';" in s,'ProductionOS manager import missing')
s=s.replace("import {ProductionManager} from './ProductionManager';", "import {ProductionManager} from './ProductionManager';\nimport {productionManagerApi} from './productionManagerApi';\nimport {useProductionPrefs} from './productionPrefs';",1)
old="export function ProductionOS(){\n const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),setJobs=useApp(s=>s.setJobs),patchJob=useApp(s=>s.patchJob),settings=useApp(s=>s.settings),toast=useApp(s=>s.toast),setPage=useApp(s=>s.setPage);const [tab,setTab]=useState<Tab>('queue'),[filter,setFilter]=useState('all'),[busy,setBusy]=useState(false),[channelId,setChannelId]=useState(channels[0]?.id||''),[inbox,setInbox]=useState<any>(),[planOpen,setPlanOpen]=useState(false),[planCount,setPlanCount]=useState(30),[planScope,setPlanScope]=useState<'one'|'all'>('one');const filtered=jobs.filter(j=>filter==='all'||j.channelId===filter||j.status===filter).sort((a,b)=>a.number-b.number);const c=channels.find(x=>x.id===channelId);\n useEffect(()=>{if(!channelId&&channels[0])setChannelId(channels[0].id)},[channels.length]);"
new="""export function ProductionOS(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),setJobs=useApp(s=>s.setJobs),patchJob=useApp(s=>s.patchJob),settings=useApp(s=>s.settings),toast=useApp(s=>s.toast),setPage=useApp(s=>s.setPage);const [prefs,patchPrefs]=useProductionPrefs();const tab=(prefs.tab||'queue') as Tab;const channelId=(prefs.selectedChannelId&&channels.some(c=>c.id===prefs.selectedChannelId)?prefs.selectedChannelId:channels[0]?.id)||'';const setTab=(v:Tab)=>patchPrefs({tab:v});const setChannelId=(id:string)=>patchPrefs({selectedChannelId:id});const [filter,setFilter]=useState('all'),[busy,setBusy]=useState(false),[inbox,setInbox]=useState<any>(),[planOpen,setPlanOpen]=useState(false),[planCount,setPlanCount]=useState(30),[planScope,setPlanScope]=useState<'one'|'all'>('one');const filtered=jobs.filter(j=>filter==='all'||j.channelId===filter||j.status===filter).sort((a,b)=>a.number-b.number);const c=channels.find(x=>x.id===channelId);const selectedJobIds=(prefs.selectedJobIds||[]).filter(id=>jobs.some(j=>j.id===id));
 useEffect(()=>{if(!prefs.selectedChannelId&&channels[0])patchPrefs({selectedChannelId:channels[0].id})},[channels.length,prefs.selectedChannelId]);
 const toggleJob=(id:string)=>patchPrefs({selectedJobIds:selectedJobIds.includes(id)?selectedJobIds.filter(x=>x!==id):[...selectedJobIds,id]});
 const visibleJobIds=filtered.map(j=>j.id);
 async function deleteJobs(ids:string[],label:string){const unique=[...new Set(ids)].filter(id=>useApp.getState().jobs.some(j=>j.id===id));if(!unique.length)return;if(!confirm(label))return;setBusy(true);try{const rows=useApp.getState().jobs.filter(j=>unique.includes(j.id));for(const j of rows){if(j.folder)await productionManagerApi.deleteJobFolder(settings.workspace,j.folder)}setJobs(useApp.getState().jobs.filter(j=>!unique.includes(j.id)));patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!unique.includes(id))});toast(`Удалено проектов: ${unique.length}`)}catch(e){toast(`Не удалось удалить проекты: ${String(e)}`)}finally{setBusy(false)}}"""
must(old in s,'ProductionOS state block changed unexpectedly')
s=s.replace(old,new,1)
# Insert queue bulk toolbar immediately before job list rendering in queue branch.
needle="{filtered.length===0?<div className=\"empty\"><b>Нет задач в этом фильтре</b><p>Создай точное число проектов или включи поддержание буфера.</p><button className=\"primary\" onClick={()=>setPlanOpen(true)}>Создать проекты</button></div>:<div className=\"jobs virtualReady\">"
replacement="{filtered.length===0?<div className=\"empty\"><b>Нет задач в этом фильтре</b><p>Создай точное число проектов или включи поддержание буфера.</p><button className=\"primary\" onClick={()=>setPlanOpen(true)}>Создать проекты</button></div>:<><div className=\"pmBulkBar\"><span>Выбрано <b>{selectedJobIds.filter(id=>visibleJobIds.includes(id)).length}</b> / {visibleJobIds.length}</span><button onClick={()=>patchPrefs({selectedJobIds:[...new Set([...selectedJobIds,...visibleJobIds])]})}>Выбрать всё</button><button onClick={()=>patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!visibleJobIds.includes(id))})}>Снять выделение</button><button className=\"danger\" disabled={!selectedJobIds.some(id=>visibleJobIds.includes(id))} onClick={()=>void deleteJobs(selectedJobIds.filter(id=>visibleJobIds.includes(id)),'Удалить выбранные проекты?')}>Удалить выбранные</button><button className=\"danger\" onClick={()=>void deleteJobs(visibleJobIds,'Удалить все проекты в текущем списке?')}>Удалить все</button></div><div className=\"jobs virtualReady\">"
must(needle in s,'ProductionOS queue list marker missing')
s=s.replace(needle,replacement,1)
# Add checkbox to each job and close fragment after jobs div.
needle="return <article className=\"job productionJob\" key={j.id}><div className={`jobStatus"
must(needle in s,'ProductionOS job article marker missing')
s=s.replace(needle,"return <article className=\"job productionJob\" key={j.id}><label className=\"pmJobCheck\"><input type=\"checkbox\" checked={selectedJobIds.includes(j.id)} onChange={()=>toggleJob(j.id)}/></label><div className={`jobStatus",1)
# Existing expression ends with </div>}</>} — convert first matching queue close.
needle="</div>}</>}\n   {tab==='materials'"
must(needle in s,'ProductionOS queue close marker missing')
s=s.replace(needle,"</div></>}</>}\n   {tab==='materials'",1)
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# ProductionWorkspace: keep its existing v1 project/target/reviewed data, but
# selected channel is now driven by the shared v2 Production preference.
# -----------------------------------------------------------------------------
p=need('src/ProductionWorkspace.tsx');s=p.read_text(encoding='utf-8')
s=s.replace("import {useApp} from './store';","import {useApp} from './store';\nimport {useProductionPrefs} from './productionPrefs';",1)
old=" const [state,setState]=useState<State>(()=>read());\n const selected=channels.find(c=>c.id===state.selectedChannelId)||channels[0];"
new=" const [state,setState]=useState<State>(()=>read());\n const [prefs,patchPrefs]=useProductionPrefs();\n const selected=channels.find(c=>c.id===prefs.selectedChannelId)||channels.find(c=>c.id===state.selectedChannelId)||channels[0];"
must(old in s,'ProductionWorkspace state marker missing')
s=s.replace(old,new,1)
# Keep old key in sync for backwards compatibility, but v2 is authoritative.
old="useEffect(()=>{if(!selected)return;if(state.selectedChannelId===selected.id&&state.byChannel[selected.id])return;const next:State={...state,selectedChannelId:selected.id,byChannel:{...state.byChannel,[selected.id]:state.byChannel[selected.id]||{project:month(),target:30,reviewed:false,updatedAt:new Date().toISOString()}}};setState(next);write(next)},[selected?.id]);"
new="useEffect(()=>{if(!selected)return;if(prefs.selectedChannelId!==selected.id)patchPrefs({selectedChannelId:selected.id});if(state.selectedChannelId===selected.id&&state.byChannel[selected.id])return;const next:State={...state,selectedChannelId:selected.id,byChannel:{...state.byChannel,[selected.id]:state.byChannel[selected.id]||{project:month(),target:30,reviewed:false,updatedAt:new Date().toISOString()}}};setState(next);write(next)},[selected?.id]);"
must(old in s,'ProductionWorkspace sync effect missing')
s=s.replace(old,new,1)
old="onChange={e=>{const id=e.target.value;const next:State={...state,selectedChannelId:id,byChannel:{...state.byChannel,[id]:state.byChannel[id]||{project:month(),target:30,reviewed:false,updatedAt:new Date().toISOString()}}};setState(next);write(next)}}"
new="onChange={e=>{const id=e.target.value;patchPrefs({selectedChannelId:id});const next:State={...state,selectedChannelId:id,byChannel:{...state.byChannel,[id]:state.byChannel[id]||{project:month(),target:30,reviewed:false,updatedAt:new Date().toISOString()}}};setState(next);write(next)}}"
must(old in s,'ProductionWorkspace channel select marker missing')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# Production Manager API: add alphabetical mode, deletion and handoff receipt.
# -----------------------------------------------------------------------------
p=need('src/productionManagerApi.ts');s=p.read_text(encoding='utf-8')
s=s.replace("export type DistributionMode='even'|'random'|'no-repeat';","export type DistributionMode='even'|'random'|'alphabetical'|'no-repeat';",1)
insert="""export type DeleteResult={deletedProjectIds:string[];deletedJobIds:string[];batch?:BatchSummary|null};
export type HandoffReceipt={batchId:string;manifestPath:string;requestPath:string};
"""
anchor="export type BatchStatus={batchId:string;status:string;updatedAt?:string;projects:{projectId:string;jobId?:string|null;videoNumber?:number|null;renderStatus:string;outputFile?:string|null;duration?:number|null;fileSize?:number|null;error?:string|null}[]};\n"
must(anchor in s,'productionManagerApi type anchor missing')
s=s.replace(anchor,anchor+insert,1)
anchor="  status:(manifestPath:string)=>invoke<BatchStatus>('read_production_batch_status',{manifestPath}),\n"
api="""  deleteBatchProjects:(manifestPath:string,projectIds:string[])=>invoke<DeleteResult>('delete_production_batch_projects',{manifestPath,projectIds}),
  deleteJobFolder:(workspace:string,folder:string)=>invoke<void>('delete_production_job_folder',{workspace,folder}),
  openInEndlume:(endlumePath:string,manifestPath:string)=>invoke<HandoffReceipt>('open_production_batch_in_endlume',{endlumePath,manifestPath}),
  handoffConsumed:(requestPath:string)=>invoke<boolean>('production_endlume_handoff_consumed',{requestPath}),
"""
# Replace old openInEndlume line and inject new commands before status.
old="  openInEndlume:(endlumePath:string,manifestPath:string)=>invoke<void>('open_production_batch_in_endlume',{endlumePath,manifestPath}),\n"
must(old in s,'old openInEndlume API marker missing')
s=s.replace(old,'',1)
s=s.replace(anchor,api+anchor,1)
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# ProductionManager UI: single shared channel, v2 UI persistence, slider + 30,
# alphabetical mode, batch project selection/delete, and ENDLUME acknowledgement.
# -----------------------------------------------------------------------------
p=need('src/ProductionManager.tsx');s=p.read_text(encoding='utf-8')
s=s.replace("import {productionManagerApi,type BatchSummary,type BuildResult,type ChannelProductionState,type DistributionMode,type ImportSession,type MusicSummary,type Validation} from './productionManagerApi';","import {productionManagerApi,type BatchStatus,type BatchSummary,type BuildResult,type ChannelProductionState,type DistributionMode,type ImportSession,type MusicSummary,type Validation} from './productionManagerApi';\nimport {defaultChannelProductionPrefs,patchChannelProductionPrefs,useProductionPrefs} from './productionPrefs';",1)
s=s.replace("  {id:'random',title:'Случайно',hint:'Случайные комбинации без дубля одного трека внутри проекта.'},\n  {id:'no-repeat'", "  {id:'random',title:'Случайно',hint:'Случайные комбинации без дубля одного трека внутри проекта.'},\n  {id:'alphabetical',title:'По алфавиту',hint:'Треки идут A→Z / А→Я и следующий проект продолжает последовательность.'},\n  {id:'no-repeat'",1)
# Replace independent channel + builder settings with shared prefs.
old="""  const [channelId,setChannelId]=useState(channels[0]?.id||'');
  const [session,setSession]=useState<ImportSession|null>(null);
  const [music,setMusic]=useState<MusicSummary|null>(null);
  const [batches,setBatches]=useState<BatchSummary[]>([]);
  const [projectCount,setProjectCount]=useState(30);
  const [tracksPerProject,setTracksPerProject]=useState(15);
  const [mode,setMode]=useState<DistributionMode>('even');
  const [allowImageReuse,setAllowImageReuse]=useState(false);
"""
new="""  const [prefs,patchPrefs]=useProductionPrefs();
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
"""
must(old in s,'ProductionManager independent channel/settings block missing')
s=s.replace(old,new,1)
# Add batch status state.
anchor="  const [importError,setImportError]=useState('');\n"
s=s.replace(anchor,anchor+"  const [batchStatus,setBatchStatus]=useState<BatchStatus|null>(null);\n",1)
# Replace old channel bootstrap effect.
old="  useEffect(()=>{if(!channelId&&channels[0])setChannelId(channels[0].id)},[channelId,channels]);\n"
new="  useEffect(()=>{if(!prefs.selectedChannelId&&channels[0])patchPrefs({selectedChannelId:channels[0].id})},[prefs.selectedChannelId,channels.length]);\n"
must(old in s,'ProductionManager channel bootstrap missing')
s=s.replace(old,new,1)
# Add batch restore/status effect after refresh effect.
anchor="  useEffect(()=>{void refreshState()},[workspace,channelId]);\n"
extra="""  useEffect(()=>{void refreshState();setResult(null);setValidation(null);setBatchStatus(null)},[workspace,channelId]);
  useEffect(()=>{if(result?.batch){productionManagerApi.status(result.batch.manifestPath).then(setBatchStatus).catch(()=>setBatchStatus(null));return}const last=channelPrefs.lastBatchId&&batches.find(b=>b.batchId===channelPrefs.lastBatchId);if(last)setResult({status:'ready',availableImages:collected,requestedProjects:last.projectCount,batch:last})},[batches,result?.batch?.batchId,channelPrefs.lastBatchId]);
"""
must(anchor in s,'ProductionManager refresh effect missing')
s=s.replace(anchor,extra,1)
# On built batch persist last batch.
old="        setBatches(prev=>[built.batch!,...prev.filter(x=>x.batchId!==built.batch!.batchId)]);\n        toast(`Batch готов: ${built.batch.projectCount} проектов • ${built.batch.tracksAssigned} музыкальных назначений`);"
new="        setBatches(prev=>[built.batch!,...prev.filter(x=>x.batchId!==built.batch!.batchId)]);patchChannelProductionPrefs(channel.id,{lastBatchId:built.batch.batchId,selectedProjectIds:[]});\n        toast(`Batch готов: ${built.batch.projectCount} проектов • ${built.batch.tracksAssigned} музыкальных назначений`);"
must(old in s,'ProductionManager built batch marker missing')
s=s.replace(old,new,1)
# Replace openEndlume with acknowledgement and add deletion helpers.
start=s.index('  async function openEndlume(')
end=s.index('\n  async function resume(',start)
newblock=r'''  async function waitForHandoff(requestPath:string){for(let i=0;i<40;i++){if(await productionManagerApi.handoffConsumed(requestPath))return true;await new Promise(r=>window.setTimeout(r,500))}return false}
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
'''
s=s[:start]+newblock+s[end:]
# Resume persists batch.
old="      setResult({status:'ready',availableImages:collected,requestedProjects:resumed.projectCount,batch:resumed});\n      await refreshState();toast(`Batch восстановлен: ${resumed.completedProjects}/${resumed.projectCount}`);"
new="      setResult({status:'ready',availableImages:collected,requestedProjects:resumed.projectCount,batch:resumed});patchChannelProductionPrefs(channelId,{lastBatchId:resumed.batchId});\n      await refreshState();setBatchStatus(await productionManagerApi.status(resumed.manifestPath));toast(`Batch восстановлен: ${resumed.completedProjects}/${resumed.projectCount}`);"
must(old in s,'ProductionManager resume marker missing')
s=s.replace(old,new,1)
# Hero channel selector -> shared channel badge.
old="<section className=\"panel pmHero\"><div><small>LOCAL PRODUCTION • 0 YOUTUBE API</small><h2>Автономная подготовка для ENDLUME</h2><p>Изображения → плоские папки проектов → музыка → manifest → ENDLUME. YouTube API здесь не вызывается.</p></div><label>Канал<select value={channelId} onChange={e=>{setChannelId(e.target.value);setResult(null);setValidation(null)}}>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></section>"
new="<section className=\"panel pmHero\"><div><small>LOCAL PRODUCTION • 0 YOUTUBE API</small><h2>Автономная подготовка для ENDLUME</h2><p>Изображения → плоские папки проектов → музыка → manifest → ENDLUME. YouTube API здесь не вызывается.</p></div><div className=\"pmChannelBadge\"><small>ТЕКУЩИЙ КАНАЛ</small><b>{channel?.name||'—'}</b><span>Берётся из общего Production workspace</span></div></section>"
must(old in s,'ProductionManager hero selector marker missing')
s=s.replace(old,new,1)
# Better active label.
s=s.replace("{importError?'● ОШИБКА':session?.active?'● СБОР ИДЁТ':'ГОТОВО'}","{importError?'● ОШИБКА':session?.active?(collected?'● СБОР ИДЁТ':'● ЖДУ ФАЙЛЫ'):'ГОТОВО'}",1)
# Replace track controls with presets + range + number.
old="<label>Песен на проект<div className=\"pmPresetLine\">{[10,15,20].map(n=><button key={n} className={tracksPerProject===n?'active':''} onClick={()=>setTracksPerProject(n)}>{n}</button>)}<input type=\"number\" min=\"1\" max=\"100\" value={tracksPerProject} onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}/></div></label>"
new="<label>Песен на проект<div className=\"pmPresetLine\">{[10,15,20,30].map(n=><button key={n} className={tracksPerProject===n?'active':''} onClick={()=>setTracksPerProject(n)}>{n}</button>)}</div><div className=\"pmRangeLine\"><input aria-label=\"Песен на проект\" type=\"range\" min=\"1\" max=\"100\" value={tracksPerProject} onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}/><input type=\"number\" min=\"1\" max=\"100\" value={tracksPerProject} onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}/></div></label>"
must(old in s,'ProductionManager tracks control marker missing')
s=s.replace(old,new,1)
# Result: inject project selection table before actions.
marker="<div className=\"pmActions resultActions\"><button disabled={busy==='validate'}"
projects_ui="""{batchStatus?.projects?.length?<div className=\"pmProjectSelection\"><div className=\"pmBulkBar\"><span>Проекты batch • выбрано <b>{selectedProjectIds.filter(id=>batchStatus.projects.some(p=>p.projectId===id)).length}</b> / {batchStatus.projects.length}</span><button onClick={()=>setSelectedProjects(batchStatus.projects.map(p=>p.projectId))}>Выбрать всё</button><button onClick={()=>setSelectedProjects([])}>Снять выделение</button><button className=\"danger\" disabled={!selectedProjectIds.length||busy==='delete'} onClick={()=>void deleteBatchProjects(selectedProjectIds,false)}>Удалить выбранные</button><button className=\"danger\" disabled={busy==='delete'} onClick={()=>void deleteBatchProjects(batchStatus.projects.map(p=>p.projectId),true)}>Удалить все</button></div><div className=\"pmProjectRows\">{batchStatus.projects.map(p=><label key={p.projectId}><input type=\"checkbox\" checked={selectedProjectIds.includes(p.projectId)} onChange={()=>toggleProject(p.projectId)}/><b>{p.projectId}</b><span>{p.renderStatus}</span><small>{p.outputFile?'MP4 готов':p.error||'ожидает'}</small></label>)}</div></div>:null}"""
must(marker in s,'ProductionManager result actions marker missing')
s=s.replace(marker,projects_ui+marker,1)
# Batch history click persists and loads status.
old="onClick={()=>setResult({status:'ready',availableImages:collected,requestedProjects:batch.projectCount,batch})}"
new="onClick={()=>{setResult({status:'ready',availableImages:collected,requestedProjects:batch.projectCount,batch});patchChannelProductionPrefs(channelId,{lastBatchId:batch.batchId,selectedProjectIds:[]});void productionManagerApi.status(batch.manifestPath).then(setBatchStatus).catch(()=>setBatchStatus(null))}}"
must(old in s,'ProductionManager history click marker missing')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# Native Production Manager: recursive Downloads, alphabetical allocation,
# safe deletion, ENDLUME handoff receipt/consumption. No network/YouTube code.
# -----------------------------------------------------------------------------
p=need('src-tauri/src/production_manager.rs');s=p.read_text(encoding='utf-8')
# recursive image scanner replaces top-level scanner
old=r'''fn top_images(dir:&Path)->HashSet<String> {
    fs::read_dir(dir).ok().into_iter().flatten().filter_map(Result::ok).map(|e|e.path())
        .filter(|p|p.is_file()&&is_image(p))
        .map(|p|p.to_string_lossy().into_owned()).collect()
}'''
new=r'''fn recursive_images(root:&Path)->Result<Vec<PathBuf>,String>{
    let mut out=Vec::new();let mut stack=vec![root.to_path_buf()];
    while let Some(dir)=stack.pop(){
        let rd=fs::read_dir(&dir).map_err(|e|if dir==root{format!("VYRON не может читать папку Downloads: {e}")}else{format!("Не удалось прочитать {}: {e}",dir.display())})?;
        for e in rd.filter_map(Result::ok){let p=e.path();let ft=match e.file_type(){Ok(x)=>x,Err(_)=>continue};if ft.is_symlink(){continue}let name=e.file_name().to_string_lossy().to_string();if name.starts_with('.') {continue}if ft.is_dir(){stack.push(p)}else if ft.is_file()&&is_image(&p){out.push(p)}}
    }
    out.sort_by_key(|p|fs::metadata(p).ok().and_then(|m|m.modified().ok()).unwrap_or(UNIX_EPOCH));Ok(out)
}
fn image_snapshot(dir:&Path)->HashSet<String>{recursive_images(dir).unwrap_or_default().into_iter().map(|p|p.to_string_lossy().into_owned()).collect()}
'''
must(old in s,'native top_images marker missing')
s=s.replace(old,new,1)
# watcher read_dir top-level -> recursive scan
old="""            let rd=match fs::read_dir(&downloads){
                Ok(rd)=>{last_error=None;rd}
                Err(e)=>{
                    let message=format!("VYRON не может читать папку Downloads: {e}. Разрешите VYRON доступ к Downloads в настройках macOS «Конфиденциальность и безопасность → Файлы и папки».");
                    if last_error.as_deref()!=Some(message.as_str()){
                        let _=app.emit("production-import-error",json!({"channelId":channel_id,"sessionId":session.session_id,"message":message}));
                        last_error=Some(message);
                    }
                    thread::sleep(Duration::from_millis(650));
                    continue;
                }
            };
            let mut files=rd.filter_map(Result::ok).map(|e|e.path()).filter(|p|p.is_file()&&is_image(p)).collect::<Vec<_>>();
            files.sort_by_key(|p| fs::metadata(p).ok().and_then(|m|m.modified().ok()).unwrap_or(UNIX_EPOCH));
"""
new="""            let files=match recursive_images(&downloads){
                Ok(files)=>{last_error=None;files}
                Err(e)=>{let message=format!("{e}. Разрешите VYRON доступ к Downloads в настройках macOS «Конфиденциальность и безопасность → Файлы и папки».");if last_error.as_deref()!=Some(message.as_str()){let _=app.emit("production-import-error",json!({"channelId":channel_id,"sessionId":session.session_id,"message":message}));last_error=Some(message);}thread::sleep(Duration::from_millis(650));continue;}
            };
"""
must(old in s,'native watcher top-level read marker missing')
s=s.replace(old,new,1)
s=s.replace('(old,top_images(&downloads))','(old,image_snapshot(&downloads))',1).replace('},top_images(&downloads))','},image_snapshot(&downloads))',1)
# Alphabetical mode allowed and deterministic cyclic continuation.
s=s.replace('if !matches!(req.mode.as_str(),"even"|"random"|"no-repeat")','if !matches!(req.mode.as_str(),"even"|"random"|"alphabetical"|"no-repeat")',1)
# Insert alphabetical branch before no-repeat.
needle='''            "no-repeat" => {
                let mut local=HashSet::new();'''
branch='''            "alphabetical" => {
                let mut local=HashSet::new();while picked.len()<count{if *cursor>=tracks.len(){*cursor=0;}let i=*cursor;*cursor+=1;if local.insert(i){picked.push(i);}}
            },
            "no-repeat" => {
                let mut local=HashSet::new();'''
must(needle in s,'native no-repeat mode marker missing')
s=s.replace(needle,branch,1)
# Do not random-shuffle alphabetical order; if same sequence was seen, rotate cyclically.
old='''        shuffle(&mut picked,seed64(&format!("{salt}:order")));
        let ids=picked.iter().map(|i|tracks[*i].track_id.clone()).collect::<Vec<_>>();
        if !seen.contains(&seq_hash(&ids)){return Ok(picked);}'''
new='''        if mode!="alphabetical"{shuffle(&mut picked,seed64(&format!("{salt}:order")));}
        let mut ids=picked.iter().map(|i|tracks[*i].track_id.clone()).collect::<Vec<_>>();
        if mode=="alphabetical"&&seen.contains(&seq_hash(&ids))&&picked.len()>1{picked.rotate_left((project_no+attempt+1)%picked.len());ids=picked.iter().map(|i|tracks[*i].track_id.clone()).collect();}
        if !seen.contains(&seq_hash(&ids)){return Ok(picked);}'''
must(old in s,'native sequence shuffle marker missing')
s=s.replace(old,new,1)
# Ensure music index alphabetical by file name (then full path tie-breaker).
old='    tracks.sort_by(|a,b|a.path.cmp(&b.path));\n'
new='    tracks.sort_by(|a,b|{let an=Path::new(&a.path).file_name().and_then(|x|x.to_str()).unwrap_or("").to_lowercase();let bn=Path::new(&b.path).file_name().and_then(|x|x.to_str()).unwrap_or("").to_lowercase();an.cmp(&bn).then_with(||a.path.cmp(&b.path))});\n'
must(old in s,'native music sort marker missing')
s=s.replace(old,new,1)
# New structs after Validation.
anchor='pub struct Validation { pub batch_id:String,pub ready:usize,pub errors:usize,pub endlume_exists:bool,pub items:Vec<ValidationItem> }\n'
extra='''#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct DeleteResult { pub deleted_project_ids:Vec<String>,pub deleted_job_ids:Vec<String>,pub batch:Option<BatchSummary> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct HandoffReceipt { pub batch_id:String,pub manifest_path:String,pub request_path:String }
'''
must(anchor in s,'native Validation struct anchor missing')
s=s.replace(anchor,anchor+extra,1)
# Replace handoff command and insert deletion helpers before tests.
start=s.index('#[tauri::command]\npub fn open_production_batch_in_endlume')
end=s.index('\n#[cfg(test)]',start)
new_native=r'''fn canonical_under(root:&Path,path:&Path)->Result<PathBuf,String>{let r=root.canonicalize().map_err(|_|"Workspace недоступен".to_string())?;let p=path.canonicalize().map_err(|_|format!("Путь не найден: {}",path.display()))?;if !p.starts_with(&r){return Err("Отказано: путь проекта находится вне workspace VYRON".into())}Ok(p)}
#[tauri::command]
pub fn delete_production_job_folder(workspace:String,folder:String)->Result<(),String>{if folder.trim().is_empty(){return Ok(())}let root=PathBuf::from(workspace);let p=PathBuf::from(folder);if !p.exists(){return Ok(())}let safe=canonical_under(&root,&p)?;if safe==root.canonicalize().map_err(|e|e.to_string())?{return Err("Нельзя удалить корень workspace".into())}fs::remove_dir_all(safe).map_err(|e|format!("Не удалось удалить папку проекта: {e}"))}

#[tauri::command]
pub fn delete_production_batch_projects(manifest_path:String,project_ids:Vec<String>)->Result<DeleteResult,String>{
    let(mut m,mp)=load_manifest(&manifest_path)?;let wanted=project_ids.into_iter().collect::<HashSet<_>>();if wanted.is_empty(){return Ok(DeleteResult{deleted_project_ids:Vec::new(),deleted_job_ids:Vec::new(),batch:Some(summary_from(&m,&read_json(Path::new(&m.status_path))))})}
    let selected=m.projects.iter().filter(|p|wanted.contains(&p.project_id)).cloned().collect::<Vec<_>>();if selected.is_empty(){return Err("Выбранные проекты не найдены в batch".into())}
    let deleted_project_ids=selected.iter().map(|p|p.project_id.clone()).collect::<Vec<_>>();let deleted_job_ids=selected.iter().filter_map(|p|p.job_id.clone()).collect::<Vec<_>>();for p in &selected{let dir=PathBuf::from(&p.folder_path);if dir.exists(){let root=PathBuf::from(&m.root_path).canonicalize().map_err(|e|e.to_string())?;let safe=dir.canonicalize().map_err(|e|e.to_string())?;if safe.starts_with(&root)&&safe!=root{fs::remove_dir_all(safe).map_err(|e|format!("Не удалось удалить проект {}: {e}",p.project_id))?}}}
    m.projects.retain(|p|!wanted.contains(&p.project_id));m.project_count=m.projects.len();
    let status_path=PathBuf::from(&m.status_path);let mut st:BatchStatus=read_json(&status_path);st.projects.retain(|p|!wanted.contains(&p.project_id));st.status=if st.projects.is_empty(){"Удалён".into()}else{"Готово".into()};st.updated_at=Utc::now().to_rfc3339();
    let broot=PathBuf::from(&m.root_path);let plan_path=broot.join("plan.json");if plan_path.exists(){let mut plan:BuildPlan=read_json(&plan_path);plan.projects.retain(|p|!wanted.contains(&p.project_id));plan.request.project_count=plan.projects.len();atomic_json(&plan_path,&plan)?;let cp_path=broot.join("checkpoint.json");let mut cp:Checkpoint=read_json(&cp_path);cp.total_projects=plan.projects.len();cp.completed_projects=cp.completed_projects.min(cp.total_projects);cp.updated_at=Utc::now().to_rfc3339();atomic_json(&cp_path,&cp)?;}
    if m.projects.is_empty(){fs::remove_dir_all(&broot).map_err(|e|format!("Не удалось удалить batch: {e}"))?;return Ok(DeleteResult{deleted_project_ids,deleted_job_ids,batch:None})}
    atomic_json(&mp,&m)?;atomic_json(&status_path,&st)?;let summary=summary_from(&m,&st);Ok(DeleteResult{deleted_project_ids,deleted_job_ids,batch:Some(summary)})
}

#[tauri::command]
pub fn open_production_batch_in_endlume(endlume_path:String,manifest_path:String)->Result<HandoffReceipt,String>{
    let(m,_)=load_manifest(&manifest_path)?;let app=PathBuf::from(&endlume_path);if !app.exists(){return Err("ENDLUME Studio не найден".into());}
    #[cfg(target_os="macos")]
    {
        let home=std::env::var("HOME").map_err(|_|"HOME не найден".to_string())?;let inbox=PathBuf::from(home).join("Library/Application Support/studio.endlume.desktop/VYRON Inbox");fs::create_dir_all(&inbox).map_err(|e|e.to_string())?;
        let request=inbox.join(format!("{}.json",safe_component(&m.batch_id)));atomic_json(&request,&json!({"schemaVersion":1,"batchId":m.batch_id,"manifestPath":manifest_path,"requestedAt":Utc::now().to_rfc3339()}))?;
        if !request.is_file(){return Err("Не удалось создать inbox-запрос ENDLUME".into())}Command::new("open").arg(&app).spawn().map_err(|e|format!("Не удалось открыть ENDLUME: {e}"))?;
        return Ok(HandoffReceipt{batch_id:m.batch_id,manifest_path,request_path:request.to_string_lossy().into_owned()});
    }
    #[cfg(not(target_os="macos"))]
    {Command::new(&app).spawn().map_err(|e|e.to_string())?;Ok(HandoffReceipt{batch_id:m.batch_id,manifest_path,request_path:String::new()})}
}
#[tauri::command]
pub fn production_endlume_handoff_consumed(request_path:String)->Result<bool,String>{if request_path.is_empty(){return Ok(true)}Ok(!Path::new(&request_path).exists())}
'''
s=s[:start]+new_native+s[end:]
p.write_text(s,encoding='utf-8')

# Register only the new local Production commands in lib.rs.
p=need('src-tauri/src/lib.rs');s=p.read_text(encoding='utf-8')
old='production_manager::validate_production_batch,production_manager::open_production_batch_in_endlume,'
new='production_manager::validate_production_batch,production_manager::delete_production_batch_projects,production_manager::delete_production_job_folder,production_manager::open_production_batch_in_endlume,production_manager::production_endlume_handoff_consumed,'
must(old in s,'lib production handler marker missing')
s=s.replace(old,new,1);p.write_text(s,encoding='utf-8')

# Extend Rust acceptance tests with recursive Downloads, alphabetical and delete.
p=need('src-tauri/src/production_manager_tests.rs');t=p.read_text(encoding='utf-8')
if 'acceptance_recursive_downloads_collects_nested_images' not in t:
    t+=r'''

#[test]
fn acceptance_recursive_downloads_collects_nested_images(){let root=std::env::temp_dir().join(format!("vyron-recursive-{}",Uuid::new_v4()));let sub=root.join("GPT/NEON");fs::create_dir_all(&sub).unwrap();fs::write(sub.join("image.jpg"),b"image").unwrap();fs::write(sub.join(".hidden.png"),b"hidden").unwrap();fs::write(root.join("part.crdownload"),b"tmp").unwrap();let rows=recursive_images(&root).unwrap();assert_eq!(rows.len(),1);assert!(rows[0].ends_with("image.jpg"));fs::remove_dir_all(root).unwrap();}

#[test]
fn acceptance_alphabetical_mode_continues_and_sequences_differ(){let(ws,cid,name)=fixture(8,40);let plan=plan_build(&request(&ws,&cid,&name,8,10,"alphabetical",false)).unwrap();let mut seq=HashSet::new();for p in &plan.projects{assert_eq!(p.tracks.len(),10);assert!(seq.insert(p.sequence_fingerprint.clone()));}assert_eq!(seq.len(),8);cleanup(&ws);}

#[test]
fn acceptance_delete_selected_and_delete_all_batch_projects(){let(ws,cid,name)=fixture(10,50);let plan=plan_build(&request(&ws,&cid,&name,10,10,"even",false)).unwrap();let summary=execute_plan(None,&plan).unwrap();let r=delete_production_batch_projects(summary.manifest_path.clone(),vec!["001".into(),"002".into(),"003".into()]).unwrap();assert_eq!(r.deleted_project_ids.len(),3);let b=r.batch.unwrap();assert_eq!(b.project_count,7);let(m,_)=load_manifest(&b.manifest_path).unwrap();assert_eq!(m.projects.len(),7);let ids=m.projects.iter().map(|p|p.project_id.clone()).collect::<Vec<_>>();let r2=delete_production_batch_projects(b.manifest_path.clone(),ids).unwrap();assert!(r2.batch.is_none());assert!(!Path::new(&plan.batch_root).exists());cleanup(&ws);}
'''
p.write_text(t,encoding='utf-8')

# -----------------------------------------------------------------------------
# CSS: append scoped Production-only styles to the stylesheet that already owns
# the Production Manager rules. No global redesign.
# -----------------------------------------------------------------------------
css=None
for q in (ROOT/'src').glob('*.css'):
    txt=q.read_text(encoding='utf-8')
    if '.productionManager' in txt or '.pmGrid' in txt: css=q;break
if css:
    txt=css.read_text(encoding='utf-8')
    if '/* VYRON 1.0.6 Production-only */' not in txt:
        txt+='''\n/* VYRON 1.0.6 Production-only */\n.pmBulkBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0}.pmBulkBar span{margin-right:auto;color:var(--muted,#8094a8)}.pmJobCheck{display:flex;align-items:center;padding:0 4px}.pmChannelBadge{min-width:220px;padding:12px 14px;border:1px solid var(--line,#18354a);border-radius:12px;display:flex;flex-direction:column;gap:3px}.pmChannelBadge small,.pmChannelBadge span{color:var(--muted,#8094a8)}.pmRangeLine{display:grid;grid-template-columns:1fr 88px;gap:10px;align-items:center;margin-top:8px}.pmRangeLine input[type=range]{width:100%}.pmProjectSelection{margin-top:14px}.pmProjectRows{display:grid;gap:6px;max-height:280px;overflow:auto}.pmProjectRows label{display:grid;grid-template-columns:24px 70px 120px 1fr;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--line,#18354a);border-radius:9px}.pmProjectRows small{color:var(--muted,#8094a8)}\n'''
        css.write_text(txt,encoding='utf-8')

# -----------------------------------------------------------------------------
# Release identity only. Preserve Tauri identifier, updater key and endpoint.
# -----------------------------------------------------------------------------
p=need('package.json');x=json.loads(p.read_text());must(x.get('version')=='1.0.5','expected package 1.0.5 baseline');x['version']=VERSION;p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
p=need('src-tauri/tauri.conf.json');x=json.loads(p.read_text());must(x.get('version')=='1.0.5','expected tauri 1.0.5 baseline');x['version']=VERSION;p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
p=need('src-tauri/Cargo.toml');s=p.read_text();s=s.replace('version = "1.0.5"','version = "1.0.6"',1);p.write_text(s)
p=need('src/App.tsx');s=p.read_text();s=s.replace('VYRON 1.0.5 • macOS Apple Silicon','VYRON 1.0.6 • macOS Apple Silicon').replace('<span className="crumb">VYRON 1.0.4</span>','<span className="crumb">VYRON 1.0.6</span>');p.write_text(s)

# Strict static guarantees.
for rel in ['src/ProductionOS.tsx','src/ProductionWorkspace.tsx','src/ProductionManager.tsx','src/productionManagerApi.ts','src/productionPrefs.ts','src-tauri/src/production_manager.rs']:
    low=(ROOT/rel).read_text(encoding='utf-8').lower()
    for bad in ['youtube_upload_video','youtube_list_existing_videos','youtube_update_existing_video','youtube_channel_analytics','youtube_channel_stats','youtube_oauth_profile_health','googleapis.com']:
        must(bad not in low,f'Zero Quota violation {rel}: {bad}')

nr=(ROOT/'src-tauri/src/production_manager.rs').read_text()
must('recursive_images(&downloads)' in nr,'recursive Downloads watcher missing')
must('"alphabetical"' in nr,'alphabetical allocation missing')
must('delete_production_batch_projects' in nr,'batch delete missing')
must('production_endlume_handoff_consumed' in nr,'ENDLUME handoff acknowledgement missing')
ui=(ROOT/'src/ProductionManager.tsx').read_text()
for marker in ['[10,15,20,30]','type="range"','По алфавиту','Удалить выбранные','Удалить все','ENDLUME принял batch']:
    must(marker in ui,'UI marker missing: '+marker)
print('VYRON 1.0.6 Production Autobuild applied: PASS')
