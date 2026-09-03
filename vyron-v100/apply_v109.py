#!/usr/bin/env python3
from pathlib import Path
import json,re

VERSION='1.0.9'

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.9: '+msg)

def rep(text,old,new,msg,count=1):
    must(old in text,msg)
    return text.replace(old,new,count)

# -----------------------------------------------------------------------------
# Production preferences: backward compatible. Keep v2 key/schema so all
# current selected channel/count/mode/history pointers survive the update.
# -----------------------------------------------------------------------------
p=Path('src/productionPrefs.ts'); s=p.read_text(encoding='utf-8')
s=rep(s,
"export type ChannelProductionPrefs={projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;lastBatchId?:string;selectedProjectIds:string[]};",
"export type ChannelProductionPrefs={projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;lastBatchId?:string;selectedProjectIds:string[];productionRoot?:string};",
'ChannelProductionPrefs shape changed')
s=rep(s,
"export type ProductionPrefs={version:2;selectedChannelId?:string;tab:ProductionTab;byChannel:Record<string,ChannelProductionPrefs>;selectedJobIds:string[]};",
"export type ProductionPrefs={version:2;selectedChannelId?:string;tab:ProductionTab;byChannel:Record<string,ChannelProductionPrefs>;selectedJobIds:string[];productionRoot?:string};",
'ProductionPrefs shape changed')
must("const KEY='vyron:production-manager:v2';" in s,'production prefs key changed')
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# Frontend/native bridge API
# -----------------------------------------------------------------------------
p=Path('src/productionManagerApi.ts'); s=p.read_text(encoding='utf-8')
s=rep(s,
"export type BuildRequest={requestId:string;workspace:string;channelId:string;channelName:string;projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;jobLinks:{jobId:string;number:number}[]};",
"export type BuildRequest={requestId:string;workspace:string;outputWorkspace?:string;channelId:string;channelName:string;projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;jobLinks:{jobId:string;number:number}[]};\nexport type ProductionStorageStatus={path:string;exists:boolean;writable:boolean;external:boolean;freeBytes?:number|null;error?:string|null};",
'BuildRequest shape changed')
s=rep(s,
"  chooseMusicFolder:async()=>{const p=await open({directory:true,multiple:false,title:'Папка музыкальной библиотеки канала'});return typeof p==='string'?p:'';},",
"  chooseMusicFolder:async()=>{const p=await open({directory:true,multiple:false,title:'Папка музыкальной библиотеки канала'});return typeof p==='string'?p:'';},\n  chooseProductionRoot:async()=>{const p=await open({directory:true,multiple:false,title:'Production Workspace — папка для новых проектов'});return typeof p==='string'?p:'';},\n  storageStatus:(path:string)=>invoke<ProductionStorageStatus>('production_storage_status',{path}),",
'chooseMusicFolder API marker changed')
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# Native production manager. Separate CONTROL workspace from OUTPUT workspace.
# Collector/music/history remain exactly in the current workspace; only NEW
# batch trees may be placed on a user-selected internal/external drive.
# -----------------------------------------------------------------------------
p=Path('src-tauri/src/production_manager.rs'); r=p.read_text(encoding='utf-8')
r=rep(r,
"    pub request_id:String,pub workspace:String,pub channel_id:String,pub channel_name:String,pub project_count:usize,\n    pub tracks_per_project:usize,pub mode:String,pub allow_image_reuse:bool,pub job_links:Vec<JobLink>",
"    pub request_id:String,pub workspace:String,pub output_workspace:Option<String>,pub channel_id:String,pub channel_name:String,pub project_count:usize,\n    pub tracks_per_project:usize,pub mode:String,pub allow_image_reuse:bool,pub job_links:Vec<JobLink>",
'Rust BuildRequest shape changed')

# Add storage status and strict selected-root validation before BuildPlan.
marker='''#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct BuildPlan { schema_version:u32,request:BuildRequest,batch_id:String,batch_root:String,created_at:String,projects:Vec<PlanProject> }
'''
must(marker in r,'BuildPlan marker changed')
insert='''#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ProductionStorageStatus { pub path:String,pub exists:bool,pub writable:bool,pub external:bool,pub free_bytes:Option<u64>,pub error:Option<String> }

fn storage_free_bytes(path:&Path)->Option<u64>{
    let out=std::process::Command::new("df").arg("-Pk").arg(path).output().ok()?;
    if !out.status.success(){return None;}
    let text=String::from_utf8_lossy(&out.stdout);let line=text.lines().filter(|x|!x.trim().is_empty()).last()?;
    let cols=line.split_whitespace().collect::<Vec<_>>();if cols.len()<4{return None;}
    cols.get(3)?.parse::<u64>().ok().map(|kb|kb.saturating_mul(1024))
}
fn storage_probe(path:&Path)->ProductionStorageStatus{
    let display=path.to_string_lossy().into_owned();let external=display.starts_with("/Volumes/");
    if !path.exists(){return ProductionStorageStatus{path:display,exists:false,writable:false,external,free_bytes:None,error:Some("Production-диск или папка недоступны".into())};}
    if !path.is_dir(){return ProductionStorageStatus{path:display,exists:true,writable:false,external,free_bytes:None,error:Some("Production Workspace должен быть папкой".into())};}
    let probe=path.join(format!(".vyron-write-probe-{}",Uuid::new_v4()));
    let writable=std::fs::OpenOptions::new().write(true).create_new(true).open(&probe).map(|_|{let _=fs::remove_file(&probe);true}).unwrap_or(false);
    ProductionStorageStatus{path:display,exists:true,writable,external,free_bytes:storage_free_bytes(path),error:if writable{None}else{Some("Нет доступа на запись в Production Workspace".into())}}
}
fn resolve_output_workspace(req:&BuildRequest)->Result<String,String>{
    let chosen=req.output_workspace.as_deref().map(str::trim).filter(|x|!x.is_empty()).unwrap_or(req.workspace.trim());
    if chosen.is_empty(){return Err("Production Workspace не выбран".into());}
    if chosen!=req.workspace.trim(){let st=storage_probe(Path::new(chosen));if !st.exists||!st.writable{return Err(st.error.unwrap_or_else(||format!("Production Workspace недоступен: {chosen}")));}}
    Ok(chosen.to_string())
}
#[tauri::command]
pub fn production_storage_status(path:String)->ProductionStorageStatus{storage_probe(Path::new(path.trim()))}

'''
r=r.replace(marker,insert+marker,1)

old='''    let history:MusicHistory=read_json(&history_path(&req.workspace,&req.channel_id)?);
    let parent=batch_root_parent(&req.workspace,&req.channel_id)?; let bid=next_batch_id(&parent,&req.channel_name); let broot=parent.join(&bid);'''
new='''    let history:MusicHistory=read_json(&history_path(&req.workspace,&req.channel_id)?);
    // Source/control state always remains in req.workspace. Only the NEW batch
    // destination may use output_workspace. This is the backwards-compatibility
    // boundary that keeps the working Downloads collector and music index intact.
    let output_workspace=resolve_output_workspace(req)?;
    let parent=batch_root_parent(&output_workspace,&req.channel_id)?; let bid=next_batch_id(&parent,&req.channel_name); let broot=parent.join(&bid);'''
r=rep(r,old,new,'plan_build parent marker changed')

# Unit-test request factory must populate the new optional field.
r=rep(r,
'''BuildRequest{request_id:"test-request".into(),workspace:workspace.to_string_lossy().into_owned(),channel_id:cid.into(),channel_name:cname.into(),project_count:count,tracks_per_project:tpp,mode:mode.into(),allow_image_reuse:reuse,job_links:''',
'''BuildRequest{request_id:"test-request".into(),workspace:workspace.to_string_lossy().into_owned(),output_workspace:None,channel_id:cid.into(),channel_name:cname.into(),project_count:count,tracks_per_project:tpp,mode:mode.into(),allow_image_reuse:reuse,job_links:''',
'Rust test request factory changed')

# Add regression acceptance tests before the existing included-test boundary/end.
append='''

#[test]
fn acceptance_separate_output_workspace_preserves_source_state(){
    let(ws,cid,name)=fixture(4,30);let source_root=ws.clone();let external=ws.parent().unwrap().join("external-production");fs::create_dir_all(&external).unwrap();
    let mut req=request(&ws,&cid,&name,4,5,"even",false);req.output_workspace=Some(external.to_string_lossy().into_owned());
    let plan=plan_build(&req).unwrap();assert!(Path::new(&plan.batch_root).starts_with(&external));
    let summary=execute_plan(None,&plan).unwrap();assert!(Path::new(&summary.root_path).starts_with(&external));
    assert!(session_path(&source_root.to_string_lossy(),&cid).unwrap().is_file());assert!(history_path(&source_root.to_string_lossy(),&cid).unwrap().is_file());
    let(m,_)=load_manifest(&summary.manifest_path).unwrap();assert!(Path::new(&m.output_dir).starts_with(&external));assert_eq!(m.projects.len(),4);cleanup(&ws);
}

#[test]
fn acceptance_missing_external_output_never_falls_back_to_internal_workspace(){
    let(ws,cid,name)=fixture(2,20);let missing=ws.parent().unwrap().join("disconnected-external-drive");let mut req=request(&ws,&cid,&name,2,5,"even",false);req.output_workspace=Some(missing.to_string_lossy().into_owned());
    let err=plan_build(&req).unwrap_err();assert!(err.contains("недоступ")||err.contains("доступ"));assert!(!missing.exists());
    let internal_parent=batch_root_parent(&ws.to_string_lossy(),&cid).unwrap();let internal_batches=fs::read_dir(internal_parent).ok().map(|rd|rd.filter_map(Result::ok).filter(|e|e.path().is_dir()).count()).unwrap_or(0);assert_eq!(internal_batches,0);cleanup(&ws);
}

#[test]
fn acceptance_output_workspace_none_keeps_legacy_batch_location(){
    let(ws,cid,name)=fixture(2,20);let req=request(&ws,&cid,&name,2,5,"even",false);let plan=plan_build(&req).unwrap();assert!(Path::new(&plan.batch_root).starts_with(root(&ws.to_string_lossy()).unwrap()));cleanup(&ws);
}
'''
# production_manager.rs in this project includes its tests from a sibling file,
# so append native tests to production_manager_tests.rs instead below.
p.write_text(r,encoding='utf-8')

tp=Path('src-tauri/src/production_manager_tests.rs'); t=tp.read_text(encoding='utf-8')
t=rep(t,
'''BuildRequest{request_id:"test-request".into(),workspace:workspace.to_string_lossy().into_owned(),channel_id:cid.into(),channel_name:cname.into(),project_count:count,tracks_per_project:tpp,mode:mode.into(),allow_image_reuse:reuse,job_links:''',
'''BuildRequest{request_id:"test-request".into(),workspace:workspace.to_string_lossy().into_owned(),output_workspace:None,channel_id:cid.into(),channel_name:cname.into(),project_count:count,tracks_per_project:tpp,mode:mode.into(),allow_image_reuse:reuse,job_links:''',
'test file BuildRequest factory changed') if 'output_workspace:None' not in t else t
if 'acceptance_separate_output_workspace_preserves_source_state' not in t:t+=append
tp.write_text(t,encoding='utf-8')

# Register storage status command.
p=Path('src-tauri/src/lib.rs'); l=p.read_text(encoding='utf-8')
l=rep(l,
'production_manager::start_production_import,production_manager::stop_production_import,',
'production_manager::production_storage_status,production_manager::start_production_import,production_manager::stop_production_import,',
'production command registration changed')
p.write_text(l,encoding='utf-8')

# -----------------------------------------------------------------------------
# Production UI. Keep collector/music paths on old workspace; show and select a
# separate destination for NEW batches. Merge old + external batch history.
# -----------------------------------------------------------------------------
p=Path('src/ProductionManager.tsx'); u=p.read_text(encoding='utf-8')
u=rep(u,
"import {productionManagerApi,type BatchStatus,type BatchSummary,type BuildResult,type ChannelProductionState,type DistributionMode,type ImportSession,type MusicSummary,type Validation} from './productionManagerApi';",
"import {productionManagerApi,type BatchStatus,type BatchSummary,type BuildResult,type ChannelProductionState,type DistributionMode,type ImportSession,type MusicSummary,type ProductionStorageStatus,type Validation} from './productionManagerApi';",
'ProductionManager API import changed')

u=rep(u,
"function batchLabel(batch:BatchSummary){return `${batch.channelName} • ${batch.batchId}`}\n",
"function batchLabel(batch:BatchSummary){return `${batch.channelName} • ${batch.batchId}`}\nfunction bytesLabel(value?:number|null){if(!value&&value!==0)return '—';const gb=value/1024/1024/1024;return gb>=1?`${gb.toFixed(gb>=100?0:1)} GB`:`${(value/1024/1024).toFixed(0)} MB`}\n",
'batchLabel helper changed')

u=rep(u,
"  const [batchStatus,setBatchStatus]=useState<BatchStatus|null>(null);",
"  const [batchStatus,setBatchStatus]=useState<BatchStatus|null>(null);\n  const [storageStatus,setStorageStatus]=useState<ProductionStorageStatus|null>(null);",
'batchStatus state changed')

u=rep(u,
"  const workspace=settings.workspace||'';\n  const endlumePath=settings.endlumePath||'';",
"  const workspace=settings.workspace||'';\n  const productionRoot=(channelPrefs.productionRoot||prefs.productionRoot||workspace).trim();\n  const customProductionRoot=Boolean(channelPrefs.productionRoot||prefs.productionRoot);\n  const endlumePath=settings.endlumePath||'';",
'workspace marker changed')

old='''  async function refreshState(){
    if(!workspace||!channelId){setSession(null);setMusic(null);setBatches([]);return}
    try{
      const state:ChannelProductionState=await productionManagerApi.state(workspace,channelId);
      setSession(state.importSession||null);setMusic(state.music||null);setBatches(state.batches||[]);
    }catch{
      try{const list=await productionManagerApi.batches(workspace,channelId);setBatches(list)}catch{}
    }
  }

  useEffect(()=>{void refreshState();setResult(null);setValidation(null);setBatchStatus(null)},[workspace,channelId]);'''
new='''  async function refreshState(){
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
  useEffect(()=>{let live=true;if(!productionRoot){setStorageStatus(null);return}productionManagerApi.storageStatus(productionRoot).then(s=>{if(live)setStorageStatus(s)}).catch(e=>{if(live)setStorageStatus({path:productionRoot,exists:false,writable:false,external:productionRoot.startsWith('/Volumes/'),freeBytes:null,error:String(e)})});return()=>{live=false}},[productionRoot]);'''
u=rep(u,old,new,'refreshState block changed')

# Build destination only. Source workspace remains current `workspace`.
u=rep(u,
"const built=await productionManagerApi.build({requestId:crypto.randomUUID(),workspace,channelId:channel.id,channelName:channel.name,projectCount,tracksPerProject,mode,allowImageReuse:reuse,jobLinks:links.map(j=>({jobId:j.id,number:j.number}))});",
"const built=await productionManagerApi.build({requestId:crypto.randomUUID(),workspace,outputWorkspace:productionRoot||workspace,channelId:channel.id,channelName:channel.name,projectCount,tracksPerProject,mode,allowImageReuse:reuse,jobLinks:links.map(j=>({jobId:j.id,number:j.number}))});",
'build request call changed')

# Storage actions before render return.
marker="  if(!channels.length)return <div className=\"panel emptyManager\"><div><b>Нет подключённых каналов</b><p>Production Manager использует существующий список каналов VYRON.</p></div></div>;"
must(marker in u,'channels empty marker changed')
actions='''  async function chooseProductionRoot(scope:'global'|'channel'){
    const path=await productionManagerApi.chooseProductionRoot();if(!path)return;
    const status=await productionManagerApi.storageStatus(path);if(!status.exists||!status.writable){toast(status.error||'Папка Production недоступна для записи');return}
    if(scope==='global')patchPrefs({productionRoot:path});else patchChannelProductionPrefs(channelId,{productionRoot:path});setStorageStatus(status);toast(scope==='global'?'Основное хранилище Production сохранено':'Хранилище текущего канала сохранено');
  }
  function resetChannelProductionRoot(){patchChannelProductionPrefs(channelId,{productionRoot:undefined});toast('Канал снова использует основное хранилище Production')}

'''
u=u.replace(marker,actions+marker,1)

hero='''    <section className="panel pmHero"><div><small>LOCAL PRODUCTION • 0 YOUTUBE API</small><h2>Автономная подготовка для ENDLUME</h2><p>Изображения → плоские папки проектов → музыка → manifest → ENDLUME. YouTube API здесь не вызывается.</p></div><div className="pmChannelBadge"><small>ТЕКУЩИЙ КАНАЛ</small><b>{channel?.name||'—'}</b><span>Берётся из общего Production workspace</span></div></section>
'''
storage='''    <section className="panel pmCard pmStorage"><div className="pmCardHead"><span><small>STORAGE</small><h3>Хранилище проектов</h3></span><b className={storageStatus?.exists&&storageStatus?.writable?'live':''}>{storageStatus?.exists&&storageStatus?.writable?'● ДОСТУПНО':'● ПРОВЕРИТЬ'}</b></div><p>Сюда создаются только НОВЫЕ batch-папки. Уже собранные изображения, музыкальный индекс и старые batch не перемещаются.</p><code className="pmPath">{productionRoot||'Не выбрано'}</code><div className="pmReadiness"><span className={storageStatus?.exists?'ok':'warn'}>Диск<b>{storageStatus?.external?'внешний':'локальный'}</b></span><span className={storageStatus?.writable?'ok':'warn'}>Запись<b>{storageStatus?.writable?'доступна':'нет доступа'}</b></span><span className="ok">Свободно<b>{bytesLabel(storageStatus?.freeBytes)}</b></span><span className="ok">Режим<b>{channelPrefs.productionRoot?'для канала':prefs.productionRoot?'основной':'workspace VYRON'}</b></span></div>{storageStatus?.error&&<div className="pmShortage"><div><b>Production Workspace недоступен</b><span>{storageStatus.error}</span></div></div>}<div className="pmActions"><button className="primary" onClick={()=>void chooseProductionRoot('global')}>ВЫБРАТЬ ОСНОВНУЮ ПАПКУ</button><button onClick={()=>void chooseProductionRoot('channel')}>ДЛЯ ЭТОГО КАНАЛА</button>{channelPrefs.productionRoot&&<button onClick={resetChannelProductionRoot}>СБРОСИТЬ ДЛЯ КАНАЛА</button>}<button disabled={!productionRoot||!storageStatus?.exists} onClick={()=>void productionManagerApi.openFolder(productionRoot)}>ОТКРЫТЬ В FINDER</button></div><small className="pmHint">Если внешний диск отключён, VYRON остановит сборку batch и НЕ переключится молча на SSD Mac.</small></section>
'''
u=rep(u,hero,hero+storage,'hero UI marker changed')

# Result now explicitly reveals actual physical batch/render paths.
needle="<p>{result.batch.projectCount} проектов • {result.batch.tracksAssigned} музыкальных назначений • manifest готов</p>"
replacement=needle+"<code className=\"pmPath\">Batch: {result.batch.rootPath}</code><div className=\"pmActions\"><button onClick={()=>void productionManagerApi.openFolder(result.batch!.rootPath)}>ОТКРЫТЬ ПАПКУ BATCH</button></div>"
u=rep(u,needle,replacement,'result path marker changed')

# Avoid starting a build when a selected external path is known unavailable.
u=rep(u,
"disabled={!!busy||!workspace||!channel||!music?.tracks}",
"disabled={!!busy||!workspace||!channel||!music?.tracks||Boolean(customProductionRoot&&storageStatus&&(!storageStatus.exists||!storageStatus.writable))}",
'build button disabled marker changed')

p.write_text(u,encoding='utf-8')

# Add opener call to productionManagerApi using already installed plugin.
p=Path('src/productionManagerApi.ts'); s=p.read_text(encoding='utf-8')
if "@tauri-apps/plugin-opener" not in s:
    s=s.replace("import {open} from '@tauri-apps/plugin-dialog';","import {open} from '@tauri-apps/plugin-dialog';\nimport {openPath} from '@tauri-apps/plugin-opener';",1)
s=rep(s,
"  storageStatus:(path:string)=>invoke<ProductionStorageStatus>('production_storage_status',{path}),",
"  storageStatus:(path:string)=>invoke<ProductionStorageStatus>('production_storage_status',{path}),\n  openFolder:(path:string)=>openPath(path),",
'storageStatus API marker changed')
p.write_text(s,encoding='utf-8')

# Version metadata only; identity/updater keys/endpoints must remain untouched.
for rel in ['package.json','src-tauri/tauri.conf.json']:
    p=Path(rel); d=json.loads(p.read_text()); d['version']=VERSION; p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/Cargo.toml'); c=p.read_text(); c,n=re.subn(r'(?m)^version\s*=\s*"[^"]+"',f'version = "{VERSION}"',c,count=1);must(n==1,'Cargo version missing');p.write_text(c)

# Static regression assertions.
must("const KEY='vyron:production-manager:v2';" in Path('src/productionPrefs.ts').read_text(),'prefs key migrated unexpectedly')
must('start_production_import(workspace' in Path('src/productionManagerApi.ts').read_text(),'collector API changed')
must('outputWorkspace:productionRoot||workspace' in Path('src/ProductionManager.tsx').read_text(),'separate output workspace not wired')
must('let output_workspace=resolve_output_workspace(req)?;' in Path('src-tauri/src/production_manager.rs').read_text(),'native output resolver missing')
must('history_path(&plan.request.workspace' in Path('src-tauri/src/production_manager.rs').read_text(),'music history moved from control workspace')
print('VYRON 1.0.9 Production Storage hotfix applied; collector/music/control workspace preserved')
