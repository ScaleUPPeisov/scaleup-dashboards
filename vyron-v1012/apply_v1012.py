#!/usr/bin/env python3
from pathlib import Path
import json,re

VERSION='1.0.12'

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.12: '+msg)

# -----------------------------------------------------------------------------
# Version — exact 1.0.11 release is the only accepted input.
# -----------------------------------------------------------------------------
p=Path('package.json'); package=json.loads(p.read_text()); must(package.get('version')=='1.0.11','expected package 1.0.11'); package['version']=VERSION; p.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/tauri.conf.json'); conf=json.loads(p.read_text()); must(conf.get('version')=='1.0.11','expected tauri 1.0.11'); conf['version']=VERSION; p.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/Cargo.toml'); cargo=p.read_text(); must('version = "1.0.11"' in cargo,'expected Cargo 1.0.11'); p.write_text(cargo.replace('version = "1.0.11"','version = "1.0.12"',1))
p=Path('package-lock.json')
if p.exists():
    lock=json.loads(p.read_text())
    if lock.get('version')=='1.0.11': lock['version']=VERSION
    if isinstance(lock.get('packages'),dict) and isinstance(lock['packages'].get(''),dict) and lock['packages'][''].get('version')=='1.0.11': lock['packages']['']['version']=VERSION
    p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')

# -----------------------------------------------------------------------------
# One Finder/open implementation + picker opens from the current real path.
# -----------------------------------------------------------------------------
p=Path('src/productionManagerApi.ts'); s=p.read_text()
s=s.replace("import {openPath} from '@tauri-apps/plugin-opener';\n",'')
old="""  chooseMusicFolder:async()=>{const p=await open({directory:true,multiple:false,title:'Папка музыкальной библиотеки канала'});return typeof p==='string'?p:'';},
  chooseProductionRoot:async()=>{const p=await open({directory:true,multiple:false,title:'Production Workspace — папка для новых проектов'});return typeof p==='string'?p:'';},
  storageStatus:(path:string)=>invoke<ProductionStorageStatus>('production_storage_status',{path}),
  openFolder:(path:string)=>openPath(path),"""
new="""  chooseMusicFolder:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка музыкальной библиотеки канала',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},
  chooseProductionRoot:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка для проектов VYRON',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},
  storageStatus:(path:string)=>invoke<ProductionStorageStatus>('production_storage_status',{path}),
  openFolder:(path:string)=>invoke<void>('reveal_path',{path}),"""
must(old in s,'productionManagerApi picker/open block missing');s=s.replace(old,new,1);p.write_text(s)

p=Path('src-tauri/src/files.rs'); s=p.read_text()
pat=re.compile(r"#\[tauri::command\]\npub fn reveal_path\(path: String\) -> Result<\(\), String> \{.*?\n\}\n\n#\[tauri::command\]\npub fn open_endlume",re.S)
m=pat.search(s);must(m is not None,'reveal_path block missing')
new_reveal=r'''#[cfg(target_os = "macos")]
fn finder_open_args(path: &Path, is_dir: bool) -> Vec<std::ffi::OsString> {
    if is_dir { vec![path.as_os_str().to_os_string()] }
    else { vec![std::ffi::OsString::from("-R"), path.as_os_str().to_os_string()] }
}

#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let raw = PathBuf::from(path.trim());
    if !raw.exists() { return Err(format!("Папка или файл больше не существует: {}", raw.display())); }
    let p = raw.canonicalize().map_err(|e| format!("Не удалось определить точный путь {}: {e}", raw.display()))?;
    #[cfg(target_os = "macos")]
    let mut c = {
        let mut x = Command::new("open");
        x.args(finder_open_args(&p, p.is_dir()));
        x
    };
    #[cfg(target_os = "windows")]
    let mut c = {
        let mut x = Command::new("explorer");
        if p.is_dir(){ x.arg(&p); } else { x.arg(format!("/select,{}", p.display())); }
        x
    };
    #[cfg(target_os = "linux")]
    let mut c = {
        let mut x = Command::new("xdg-open");
        x.arg(if p.is_dir(){p.as_path()}else{p.parent().unwrap_or(Path::new("."))});
        x
    };
    c.spawn().map_err(|e| format!("Не удалось открыть {}: {e}", p.display()))?;
    Ok(())
}

#[cfg(all(test,target_os="macos"))]
mod v1012_finder_tests {
    use super::*;
    #[test]
    fn directory_is_opened_directly_not_revealed_in_parent(){
        let dir=std::env::temp_dir().join(format!("vyron-open-dir-{}",Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let args=finder_open_args(&dir,true);
        assert_eq!(args.len(),1);assert_eq!(args[0],dir.as_os_str());
        let _=fs::remove_dir_all(dir);
    }
    #[test]
    fn file_is_revealed_with_dash_r(){
        let file=PathBuf::from("/tmp/vyron-test-file.txt");let args=finder_open_args(&file,false);
        assert_eq!(args.len(),2);assert_eq!(args[0],std::ffi::OsString::from("-R"));assert_eq!(args[1],file.as_os_str());
    }
}

#[tauri::command]
pub fn open_endlume'''
s=pat.sub(new_reveal,s,count=1);p.write_text(s)

# Canonical backend storage path is what the UI persists/displays.
p=Path('src-tauri/src/production_manager.rs'); s=p.read_text()
old='pub fn production_storage_status(path:String)->ProductionStorageStatus{storage_probe(Path::new(path.trim()))}'
new='pub fn production_storage_status(path:String)->ProductionStorageStatus{let raw=PathBuf::from(path.trim());let exact=raw.canonicalize().unwrap_or(raw);storage_probe(&exact)}'
must(old in s,'production_storage_status marker missing');s=s.replace(old,new,1);p.write_text(s)

# User-facing project planning is no longer artificially shaped around 30/1000.
p=Path('src/autopilotCore.ts'); s=p.read_text();must('Math.min(1000,Math.floor(count))' in s,'autopilot project cap marker missing');s=s.replace('Math.min(1000,Math.floor(count))','Math.min(10000,Math.floor(count))',1);p.write_text(s)

# -----------------------------------------------------------------------------
# Production Manager: dynamic counts, plain Russian labels, one storage card only.
# -----------------------------------------------------------------------------
p=Path('src/ProductionManager.tsx'); s=p.read_text()
s=s.replace("  {id:'alphabetical',title:'По алфавиту',hint:'Треки идут A→Z / А→Я и следующий проект продолжает последовательность.'},\n  {id:'no-repeat',title:'Без повторов в партии',hint:'Сначала проходит вся библиотека, затем начинается новый цикл.'},","  {id:'alphabetical',title:'По порядку',hint:'Песни берутся по порядку из музыкальной библиотеки.'},",1)
s=s.replace('export function ProductionManager(){',"export function ProductionManager({view='all'}:{view?:'all'|'materials'|'builder'}){",1)
s=s.replace('const projectCount=clamp(channelPrefs.projectCount,1,1000),tracksPerProject=clamp(channelPrefs.tracksPerProject,1,100),mode=channelPrefs.mode as DistributionMode,allowImageReuse=Boolean(channelPrefs.allowImageReuse);',"const projectCount=clamp(channelPrefs.projectCount,1,10000),tracksPerProject=clamp(channelPrefs.tracksPerProject,1,100),mode=(['even','random','alphabetical'].includes(channelPrefs.mode)?channelPrefs.mode:'even') as DistributionMode,allowImageReuse=Boolean(channelPrefs.allowImageReuse);",1)
s=s.replace("projectCount:clamp(typeof v==='function'?v(projectCount):v,1,1000)","projectCount:clamp(typeof v==='function'?v(projectCount):v,1,10000)",1)
s=s.replace('const path=await productionManagerApi.chooseMusicFolder();if(!path)return;','const path=await productionManagerApi.chooseMusicFolder(music?.libraryPath||undefined);if(!path)return;',1)
s=s.replace('toast(`Переиндексировано: ${indexed.tracks} треков`)','toast(`Библиотека обновлена: ${indexed.tracks} треков`)',1)
old="""  async function chooseProductionRoot(scope:'global'|'channel'){
    const path=await productionManagerApi.chooseProductionRoot();if(!path)return;
    const status=await productionManagerApi.storageStatus(path);if(!status.exists||!status.writable){toast(status.error||'Папка Production недоступна для записи');return}
    if(scope==='global')patchPrefs({productionRoot:path});else patchChannelProductionPrefs(channelId,{productionRoot:path});setStorageStatus(status);toast(scope==='global'?'Основное хранилище Production сохранено':'Хранилище текущего канала сохранено');
  }"""
new="""  async function chooseProductionRoot(scope:'global'|'channel'){
    const initial=scope==='channel'?(channelPrefs.productionRoot||productionRoot):(prefs.productionRoot||workspace||productionRoot);
    const requested=await productionManagerApi.chooseProductionRoot(initial||undefined);if(!requested)return;
    const status=await productionManagerApi.storageStatus(requested);if(!status.exists||!status.writable){toast(status.error||'Папка проектов недоступна для записи');return}
    const path=status.path||requested;
    if(scope==='global')patchPrefs({productionRoot:path});else patchChannelProductionPrefs(channelId,{productionRoot:path});setStorageStatus(status);toast(scope==='global'?'Основная папка проектов сохранена':'Отдельная папка канала сохранена');
  }"""
must(old in s,'ProductionManager choose root block missing');s=s.replace(old,new,1)
# Remove duplicate storage card; the single canonical storage card lives in ProductionOS.
s,n=re.subn(r'\n    <section className="panel pmCard pmStorage">.*?</section>\n\n    <div className="pmGrid">','\n    <div className="pmGrid">',s,count=1,flags=re.S);must(n==1,'duplicate storage section missing')
s=s.replace('<div><small>LOCAL PRODUCTION • 0 YOUTUBE API</small><h2>Автономная подготовка для ENDLUME</h2><p>Изображения → плоские папки проектов → музыка → manifest → ENDLUME. YouTube API здесь не вызывается.</p></div>','<div><small>ПОДГОТОВКА ДЛЯ ENDLUME</small><h2>Материалы и сборка проектов</h2><p>Соберите изображения и музыку, затем создайте готовые папки проектов для ENDLUME.</p></div>',1)
s=s.replace('<div className="pmBigNumber">{collected}<small>изображений собрано</small></div>','<div className="pmFileCount"><b>{collected.toLocaleString(\'ru-RU\')}</b><span>файлов собрано</span></div>',1)
s=s.replace('<h3>Музыка канала</h3></span><b>{music?.tracks||0} ТРЕКОВ</b>','<h3>Музыкальная библиотека</h3></span><b>{(music?.tracks||0).toLocaleString(\'ru-RU\')} треков</b>',1)
s=s.replace('>ПЕРЕИНДЕКСИРОВАТЬ</button>','>ОБНОВИТЬ БИБЛИОТЕКУ</button>',1)
s=s.replace('<small>03 • BATCH BUILDER</small><h3>Собрать проекты</h3><p>В каждой папке будет ровно 1 изображение и выбранное количество песен — без вложенных папок.</p>','<small>03</small><h3>Собрать проекты для ENDLUME</h3><p>Укажите количество проектов и песен. В каждой папке будет одно изображение и выбранная музыка.</p>',1)
s=s.replace('clamp(v-1,1,1000)','clamp(v-1,1,10000)').replace('min="1" max="1000" value={projectCount}','min="1" max="10000" value={projectCount}').replace('clamp(+e.target.value,1,1000)','clamp(+e.target.value,1,10000)').replace('clamp(v+1,1,1000)','clamp(v+1,1,10000)')
s=s.replace("<span className={workspace?'ok':'warn'}>Workspace<b>{workspace?'готов':'не задан'}</b></span>","<span className={productionRoot?'ok':'warn'}>Папка проектов<b>{productionRoot?'готова':'не выбрана'}</b></span>",1)
s=s.replace("{busy==='build'?'СОБИРАЮ…':`СОБРАТЬ ${projectCount} ПРОЕКТОВ`}","{busy==='build'?'СОЗДАЮ…':`СОЗДАТЬ ${projectCount} ПРОЕКТОВ`}",1)
s=s.replace('<small>04 • ENDLUME PACKAGE</small>','<small>ГОТОВО ДЛЯ ENDLUME</small>',1)
s=s.replace('<small>ИСТОРИЯ BATCH</small>','<small>ИСТОРИЯ СБОРОК</small>',1)
# Materials view and Builder view reuse the same proven logic without a second backend pipeline.
must('    <div className="pmGrid">' in s,'pmGrid missing');s=s.replace('    <div className="pmGrid">','    {view!==\'builder\'&&<div className="pmGrid">',1)
must('    </div>\n\n    <section className="panel pmBuilder">' in s,'pmGrid closing marker missing');s=s.replace('    </div>\n\n    <section className="panel pmBuilder">','    </div>}\n\n    {view!==\'materials\'&&<><section className="panel pmBuilder">',1)
end_marker='    <section className="panel pmHistory"><div className="pmHistoryHead">'
must(end_marker in s,'history marker missing')
# Close builder-only fragment after history, before component root closes.
last='</section>\n  </div>\n}'
must(last in s,'ProductionManager tail missing');s=s.replace(last,'</section></>}\n  </div>\n}',1)
p.write_text(s)

# -----------------------------------------------------------------------------
# Production overview: actual counts are counts, target is a separate user setting.
# -----------------------------------------------------------------------------
Path('src/ProductionWorkspace.tsx').write_text(r'''import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {useProductionPrefs} from './productionPrefs';

type Pref={project:string;target:number;reviewed:boolean;updatedAt:string};
type State={version:1;selectedChannelId?:string;byChannel:Record<string,Pref>};
const KEY='vyron:production-workspace:v1';
const month=()=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(new Date());
function read():State{try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x?.version===1)return x}catch{}return{version:1,byChannel:{}}}
function write(s:State){try{localStorage.setItem(KEY,JSON.stringify(s))}catch{}}

export function ProductionWorkspace(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs);
 const [state,setState]=useState<State>(()=>read());const [prefs,patchPrefs]=useProductionPrefs();
 const selected=channels.find(c=>c.id===prefs.selectedChannelId)||channels.find(c=>c.id===state.selectedChannelId)||channels[0];
 useEffect(()=>{if(!selected)return;if(prefs.selectedChannelId!==selected.id)patchPrefs({selectedChannelId:selected.id});if(state.selectedChannelId===selected.id&&state.byChannel[selected.id])return;const next:State={...state,selectedChannelId:selected.id,byChannel:{...state.byChannel,[selected.id]:state.byChannel[selected.id]||{project:month(),target:30,reviewed:false,updatedAt:new Date().toISOString()}}};setState(next);write(next)},[selected?.id]);
 const pref:Pref|undefined=selected?state.byChannel[selected.id]:undefined;const rows=useMemo(()=>selected?jobs.filter(j=>j.channelId===selected.id):[],[jobs,selected?.id]);
 if(!selected||!pref)return <section className="panel productionWorkspace"><div className="empty"><b>Нет каналов</b><p>Добавьте канал, чтобы начать производство.</p></div></section>;
 const target=Math.max(1,pref.target||30),images=rows.filter(j=>Boolean(j.coverPath)).length,music=rows.filter(j=>j.tracksCount>=j.minTracks).length,videos=rows.filter(j=>Boolean(j.finalPath)).length,seo=rows.filter(j=>Boolean(j.title&&j.description&&j.tags?.length)).length,schedule=rows.filter(j=>Boolean(j.publishAt)).length,sent=rows.filter(j=>Boolean(j.youtubeVideoId)||j.status==='SCHEDULED').length,errors=rows.filter(j=>j.status==='ERROR').length;
 const ready=[images,music,videos,seo,schedule].every(n=>n>=target)&&pref.reviewed&&!errors;
 const patch=(p:Partial<Pref>)=>{const next:State={...state,selectedChannelId:selected.id,byChannel:{...state.byChannel,[selected.id]:{...pref,...p,updatedAt:new Date().toISOString()}}};setState(next);write(next)};
 const metric=(label:string,n:number)=><div><small>{label}</small><b>{n.toLocaleString('ru-RU')}</b></div>;
 return <section className="panel productionWorkspace simpleProductionOverview">
  <div className="workspaceHead"><div><small>ОБЗОР ПРОИЗВОДСТВА</small><h3>{selected.name}</h3><p>Здесь показано фактическое количество материалов и готовых файлов. Числа не ограничены размером текущего плана.</p></div><div className={`workspaceStatus ${ready?'good':'work'}`}>{ready?'ГОТОВО':'В РАБОТЕ'}</div></div>
  <div className="workspaceControls"><label>Канал<select value={selected.id} onChange={e=>{const id=e.target.value;patchPrefs({selectedChannelId:id});const next:State={...state,selectedChannelId:id,byChannel:{...state.byChannel,[id]:state.byChannel[id]||{project:month(),target:30,reviewed:false,updatedAt:new Date().toISOString()}}};setState(next);write(next)}}>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Период<input value={pref.project} onChange={e=>patch({project:e.target.value})}/></label><label>План проектов<input type="number" min="1" max="10000" value={target} onChange={e=>patch({target:Math.max(1,Math.min(10000,+e.target.value||1)),reviewed:false})}/></label></div>
  <div className="actualProductionCounts">{metric('Изображения',images)}{metric('Музыка готова',music)}{metric('Видео',videos)}{metric('SEO',seo)}{metric('Расписание',schedule)}</div>
  <div className="simpleFlow"><span className={images&&music?'done':''}>Материалы</span><i>→</i><span className={videos?'done':''}>ENDLUME / Рендер</span><i>→</i><span className={seo?'done':''}>SEO</span><i>→</i><button className={pref.reviewed?'done':''} onClick={()=>patch({reviewed:!pref.reviewed})}>{pref.reviewed?'Проверено ✓':'Проверить'}</button><i>→</i><span className={ready?'done':''}>Можно публиковать</span></div>
  <div className="workspacePaths"><span>План: <b>{target.toLocaleString('ru-RU')} проектов</b></span><span>Отправлено в YouTube: <b>{sent.toLocaleString('ru-RU')}</b>{errors?` • Ошибок: ${errors}`:''}</span></div>
 </section>
}
''')

# -----------------------------------------------------------------------------
# Command Center: three user questions, no quota/runway/units jargon in the UI.
# -----------------------------------------------------------------------------
Path('src/CommandCenter.tsx').write_text(r'''import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {compareRunwayRecords,type ChannelRunwayRecord} from './channelRunwayCore';
import {loadChannelRunwayStore,subscribeChannelRunway} from './channelRunwayStore';
import {productionForecast,productionReadiness} from './commandCenterCore';
import {defaultChannelProductionPrefs,useProductionPrefs} from './productionPrefs';

const dateLabel=(key?:string)=>{if(!key)return'—';const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:'—'};
const statusLabel=(status:ChannelRunwayRecord['status'])=>status==='large'?'Запас есть':status==='plan'?'В план':status==='prepare'?'Пора готовить':status==='urgent'?'Срочно':status==='ended'?'Запас закончился':'Нет данных';

export function CommandCenter(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),setPage=useApp(s=>s.setPage);const [runway,setRunway]=useState(()=>loadChannelRunwayStore());const [prefs,patchPrefs]=useProductionPrefs();
 useEffect(()=>subscribeChannelRunway(()=>setRunway(loadChannelRunwayStore())),[]);
 const active=useMemo(()=>channels.filter(c=>c.enabled),[channels]);
 const targetFor=(id:string)=>Math.max(1,prefs.byChannel[id]?.projectCount||defaultChannelProductionPrefs().projectCount);
 const rows=useMemo(()=>active.map(channel=>({channel,record:runway.channels[channel.id]})).sort((a,b)=>{if(a.record&&b.record)return compareRunwayRecords(a.record,b.record);if(a.record)return-1;if(b.record)return 1;return a.channel.name.localeCompare(b.channel.name,'ru')}),[active,runway]);
 const forecast=productionForecast(active,runway.channels,jobs,Math.max(1,...active.map(c=>targetFor(c.id))),new Date());
 const next=rows.find(x=>x.record?.runwayDays!==undefined&&Number(x.record.runwayDays)<=45)||rows[0];
 const nextReady=next?productionReadiness(next.channel,jobs,targetFor(next.channel.id)):null;
 const totalReady=active.reduce((n,c)=>n+productionReadiness(c,jobs,targetFor(c.id)).readyToYoutube,0);
 function openProduction(channelId?:string){if(channelId)patchPrefs({selectedChannelId:channelId});setPage('production')}
 return <section className="panel commandCenter commandCenterSimple">
  <div className="commandCenterHead"><div><small>КОМАНДНЫЙ ЦЕНТР</small><h3>Что делать дальше</h3><p>Показывает, какой канал нужно готовить следующим, сколько контента осталось и что уже готово.</p></div></div>
  {next?<div className="commandToday"><div><small>СЕГОДНЯ</small><h4>{next.channel.name}</h4><p>{next.record?.runwayDays===undefined?'Нет свежих данных о запасе публикаций.':`Видео в запасе примерно на ${next.record.runwayDays} дн.`}</p></div><div className="commandTodayFacts"><span>Запас<b>{next.record?.runwayDays===undefined?'—':`${next.record.runwayDays} дней`}</b></span><span>Готовность<b>{nextReady?`${nextReady.videos} из ${nextReady.target}`:'—'}</b></span><span>Рекомендация<b>{next.record?.runwayDays!==undefined&&next.record.runwayDays<=14?'Готовить в первую очередь':next.record?.runwayDays!==undefined&&next.record.runwayDays<=45?'Продолжить производство':'Запас пока достаточный'}</b></span></div><button className="primary" onClick={()=>openProduction(next.channel.id)}>Открыть производство</button></div>:<div className="commandEmpty"><b>Нет активных каналов</b><span>Включите канал, чтобы VYRON мог показать производственный приоритет.</span></div>}
  <div className="commandSimpleSummary"><span><small>Активных каналов</small><b>{active.length}</b></span><span><small>Пора готовить</small><b>{forecast.dueNow}</b></span><span><small>Критически мало запаса</small><b>{forecast.critical}</b></span><span><small>Готово к публикации</small><b>{totalReady}</b></span></div>
  <div className="commandBlock networkPlan"><div className="commandBlockHead"><div><small>КАНАЛЫ</small><h4>Очередь производства</h4></div><span>{rows.length}</span></div><div className="commandTable"><div className="commandRow commandTh"><span>Канал</span><span>Запас видео</span><span>Следующее производство</span><span>Готовность</span><span>Статус</span></div>{rows.map(({channel,record})=>{const ready=productionReadiness(channel,jobs,targetFor(channel.id));const runwayDays=record?.runwayDays;const status:ChannelRunwayRecord['status']=record?.status||'no-data';return <button className="commandRow commandChannelRow" key={channel.id} onClick={()=>openProduction(channel.id)}><span><b>{channel.name}</b><small>{record?.scheduledUntil?`Запланировано до ${dateLabel(record.scheduledUntil)}`:'Расписание ещё не подтверждено'}</small></span><span className={`commandRunway ${status}`}>{runwayDays===undefined?'—':`${runwayDays} дн.`}</span><span>{runwayDays===undefined?'—':runwayDays<=45?'Сейчас':dateLabel(record?.nextProductionDate)}</span><span><b>{ready.videos} из {ready.target}</b><small>{ready.readyToYoutube} полностью готовы</small></span><span>{statusLabel(status)}</span></button>})}</div></div>
  <div className="commandFootNote">Данные этого экрана берутся из локально сохранённого расписания и Production. Переход на экран сам по себе не запускает синхронизацию YouTube.</div>
 </section>
}
''')

# -----------------------------------------------------------------------------
# ProductionOS: one storage card, five understandable navigation choices.
# -----------------------------------------------------------------------------
p=Path('src/ProductionOS.tsx'); s=p.read_text()
s=s.replace("import {productionManagerApi} from './productionManagerApi';","import {productionManagerApi,type ProductionStorageStatus} from './productionManagerApi';",1)
old="const [filter,setFilter]=useState('all'),[busy,setBusy]=useState(false),[inbox,setInbox]=useState<any>(),[planOpen,setPlanOpen]=useState(false),[planCount,setPlanCount]=useState(30),[planScope,setPlanScope]=useState<'one'|'all'>('one');const filtered=jobs.filter(j=>filter==='all'||j.channelId===filter||j.status===filter).sort((a,b)=>a.number-b.number);"
new="const [filter,setFilter]=useState('all'),[busy,setBusy]=useState(false),[inbox,setInbox]=useState<any>(),[planOpen,setPlanOpen]=useState(false),[planCount,setPlanCount]=useState(30),[planScope,setPlanScope]=useState<'one'|'all'>('one');const [section,setSection]=useState<'overview'|'materials'|'builder'|'render'|'publish'>(()=>tab==='materials'?'materials':tab==='manager'?'builder':'overview');const scopedJobs=section==='render'?jobs.filter(j=>['READY_RENDER','RENDERING','ERROR'].includes(j.status)):section==='publish'?jobs.filter(j=>['READY_UPLOAD','UPLOADING','SCHEDULED','ERROR'].includes(j.status)):jobs;const filtered=scopedJobs.filter(j=>filter==='all'||j.channelId===filter||j.status===filter).sort((a,b)=>a.number-b.number);"
must(old in s,'ProductionOS filter state marker missing');s=s.replace(old,new,1)
old='const selectedJobIds=(prefs.selectedJobIds||[]).filter(id=>jobs.some(j=>j.id===id));const projectRoot=resolveProductionRootFromPrefs(prefs,channelId,settings.workspace);'
new=old+'const [projectStorage,setProjectStorage]=useState<ProductionStorageStatus|null>(null);'
must(old in s,'ProductionOS projectRoot marker missing');s=s.replace(old,new,1)
old=" async function chooseProjectRoot(scope:'global'|'channel'){const path=await productionManagerApi.chooseProductionRoot();if(!path)return;const st=await productionManagerApi.storageStatus(path);if(!st.exists||!st.writable){toast(st.error||'Выбранная папка проектов недоступна для записи');return}if(scope==='channel'&&c){patchChannelProductionPrefs(c.id,{productionRoot:path});toast(`Папка проектов для ${c.name} сохранена`)}else{patchPrefs({productionRoot:path});toast('Основная папка проектов сохранена')}}"
new=" async function chooseProjectRoot(scope:'global'|'channel'){const initial=scope==='channel'?(c?prefs.byChannel[c.id]?.productionRoot:undefined)||projectRoot:(prefs.productionRoot||settings.workspace||projectRoot);const requested=await productionManagerApi.chooseProductionRoot(initial||undefined);if(!requested)return;const st=await productionManagerApi.storageStatus(requested);if(!st.exists||!st.writable){toast(st.error||'Выбранная папка проектов недоступна для записи');return}const path=st.path||requested;if(scope==='channel'&&c){patchChannelProductionPrefs(c.id,{productionRoot:path});toast(`Отдельная папка для ${c.name} сохранена`)}else{patchPrefs({productionRoot:path});toast('Основная папка проектов сохранена')}setProjectStorage(st)}"
must(old in s,'ProductionOS chooseProjectRoot marker missing');s=s.replace(old,new,1)
# storage status effect
marker=" useEffect(()=>{if(!prefs.selectedChannelId&&channels[0])patchPrefs({selectedChannelId:channels[0].id})},[channels.length,prefs.selectedChannelId]);"
must(marker in s,'ProductionOS initial effect marker missing');s=s.replace(marker,marker+"\n useEffect(()=>{let live=true;if(!projectRoot){setProjectStorage(null);return}productionManagerApi.storageStatus(projectRoot).then(x=>{if(live)setProjectStorage(x)}).catch(e=>{if(live)setProjectStorage({path:projectRoot,exists:false,writable:false,external:projectRoot.startsWith('/Volumes/'),freeBytes:null,error:String(e)})});return()=>{live=false}},[projectRoot]);",1)
# no permanently duplicated overview/storage
s=s.replace('  <ProductionWorkspace/>\n','',1)
old_storage=re.compile(r'  <section className="panel materialToolbar"><div className="jobMain" style=\{\{minWidth:0,flex:1\}\}><small>ХРАНИЛИЩЕ ФАЙЛОВ ПРОЕКТОВ</small>.*?</section>\n',re.S)
s,n=old_storage.subn("""  <section className=\"panel pmStorageUnified\"><div className=\"pmStorageUnifiedMain\"><small>ХРАНИЛИЩЕ ПРОЕКТОВ</small><h3>{projectRoot||'Папка не выбрана'}</h3><p>{projectStorage?.external?'Внешний диск':'Внутренний диск'} • {projectStorage?.writable?'запись доступна':'нужно проверить доступ'}{typeof projectStorage?.freeBytes==='number'?` • свободно ${(projectStorage.freeBytes/1024/1024/1024).toFixed(1)} GB`:''}</p></div><div className=\"pmActions\"><button className=\"primary\" onClick={()=>void chooseProjectRoot('global')}>ИЗМЕНИТЬ ПАПКУ</button>{c&&<button onClick={()=>void chooseProjectRoot('channel')}>ОТДЕЛЬНАЯ ПАПКА ДЛЯ КАНАЛА</button>}{projectRoot&&<button onClick={()=>void productionManagerApi.openFolder(projectRoot)}>ОТКРЫТЬ В FINDER</button>}</div>{projectStorage?.error&&<div className=\"pmStorageError\">{projectStorage.error}</div>}</section>\n""",s,count=1);must(n==1,'ProductionOS duplicate storage toolbar missing')
old_tabs='<div className="youtubeTabs productionTabs"><button className={tab===\'queue\'?\'active\':\'\'} onClick={()=>setTab(\'queue\')}>Pipeline</button><button className={tab===\'materials\'?\'active\':\'\'} onClick={()=>setTab(\'materials\')}>Материалы</button><button className={tab===\'manager\'?\'active\':\'\'} onClick={()=>setTab(\'manager\')}>Автосборка</button></div>'
new_tabs="""<div className=\"youtubeTabs productionTabs productionNavFive\"><button className={section==='overview'?'active':''} onClick={()=>{setSection('overview');setTab('queue');setFilter('all')}}>Обзор</button><button className={section==='materials'?'active':''} onClick={()=>{setSection('materials');setTab('materials')}}>Материалы</button><button className={section==='builder'?'active':''} onClick={()=>{setSection('builder');setTab('manager')}}>Сборка проектов</button><button className={section==='render'?'active':''} onClick={()=>{setSection('render');setTab('queue');setFilter('all')}}>Рендер</button><button className={section==='publish'?'active':''} onClick={()=>{setSection('publish');setTab('queue');setFilter('all')}}>Публикация</button></div>"""
must(old_tabs in s,'ProductionOS tabs marker missing');s=s.replace(old_tabs,new_tabs,1)
# Overview card only on Overview section.
must("{tab==='queue'&&<><div className=\"productionPipeline\">" in s,'queue section marker missing');s=s.replace("{tab==='queue'&&<><div className=\"productionPipeline\">","{tab==='queue'&&<>{section==='overview'&&<ProductionWorkspace/>}<div className=\"productionPipeline\">",1)
# Materials keeps manual import, plus the proven collector/music component in materials-only mode.
pat=re.compile(r"  \{tab==='materials'&&<>.*?</>\}\n  \{tab==='manager'&&<ProductionManager/>\}",re.S)
m=pat.search(s);must(m is not None,'ProductionOS materials/manager block missing')
materials="""  {tab==='materials'&&<><section className=\"panel materialToolbar\"><select value={channelId} onChange={e=>{setChannelId(e.target.value);setInbox(undefined)}}><option value=\"\">— канал —</option>{channels.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><button className=\"primary\" disabled={!c} onClick={importImages}>+ Импортировать изображения</button></section><ProductionManager view=\"materials\"/>{inbox&&<div className=\"panel\"><b>Папка материалов готова</b><p>{inbox.root}</p></div>}</>}\n  {tab==='manager'&&<ProductionManager view=\"builder\"/>}"""
s=pat.sub(materials,s,count=1)
p.write_text(s)

# Hide quota-policy engineering banner specifically while the user is in Command Center.
p=Path('src/YouTubeCenter.tsx');s=p.read_text();old='<div className="youtubePolicyNotice"><b>ZERO HIDDEN QUOTA</b><span>Нет startup sync, polling, background refresh или API-запросов при возврате на вкладку.</span></div>';must(old in s,'YouTube policy notice marker missing');s=s.replace(old,"{tab!=='command'&&<div className=\"youtubePolicyNotice\"><b>ZERO HIDDEN QUOTA</b><span>Нет startup sync, polling, background refresh или API-запросов при возврате на вкладку.</span></div>}",1);p.write_text(s)

# -----------------------------------------------------------------------------
# Additive CSS only — global visual language is preserved.
# -----------------------------------------------------------------------------
p=Path('src/production-manager.css');s=p.read_text();s+='''\n/* VYRON 1.0.12 Production UX */\n.pmFileCount{display:flex;align-items:baseline;gap:8px;margin:auto 0 15px}.pmFileCount b{font-size:28px;color:#dff7ff}.pmFileCount span{font-size:9px;color:#66869b}.pmStorageUnified{display:flex;align-items:center;gap:18px;justify-content:space-between;padding:16px 18px}.pmStorageUnifiedMain{min-width:0;flex:1}.pmStorageUnifiedMain small{color:var(--cyan);font-size:8px;font-weight:900;letter-spacing:1px}.pmStorageUnifiedMain h3{font-size:12px;margin:5px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pmStorageUnifiedMain p{margin:0;color:#66859a;font-size:8px}.pmStorageError{width:100%;color:#ff8999;font-size:8px}.productionNavFive{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.productionNavFive button{text-align:center}.actualProductionCounts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:14px 0}.actualProductionCounts>div{border:1px solid #17364b;background:#071723;border-radius:10px;padding:12px}.actualProductionCounts small{display:block;color:#67869b;font-size:8px}.actualProductionCounts b{display:block;margin-top:5px;font-size:20px;color:#dff7ff}.simpleFlow{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:12px 0}.simpleFlow span,.simpleFlow button{border:1px solid #17364b;background:#081723;border-radius:9px;padding:9px 11px;color:#7795a8;font-size:8px;font-weight:800}.simpleFlow .done{border-color:rgba(60,224,173,.28);color:#6ee1bf}.simpleFlow i{font-style:normal;color:#496b82}@media(max-width:1000px){.pmStorageUnified{align-items:flex-start;flex-direction:column}.productionNavFive{grid-template-columns:repeat(3,minmax(0,1fr))}.actualProductionCounts{grid-template-columns:repeat(2,minmax(0,1fr))}}\n''';p.write_text(s)

p=Path('src/styles.css');s=p.read_text();s+='''\n/* VYRON 1.0.12 Command Center — human-first */\n.commandCenterSimple{gap:14px}.commandToday{display:grid;grid-template-columns:minmax(220px,1.1fr) 2fr auto;gap:14px;align-items:center;border:1px solid rgba(67,216,255,.2);background:linear-gradient(135deg,rgba(67,216,255,.055),rgba(60,224,173,.025));border-radius:15px;padding:18px}.commandToday small{color:var(--cyan);font-size:9px;letter-spacing:.12em;font-weight:800}.commandToday h4{margin:5px 0;font-size:20px}.commandToday p{margin:0;color:#7894a8;font-size:11px}.commandTodayFacts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.commandTodayFacts span{padding:10px 11px;border-radius:10px;background:rgba(255,255,255,.025);color:#6f899c;font-size:9px}.commandTodayFacts b{display:block;color:#dceef7;font-size:12px;margin-top:4px}.commandSimpleSummary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.commandSimpleSummary span{padding:13px;border:1px solid var(--border);background:rgba(255,255,255,.018);border-radius:12px}.commandSimpleSummary small{display:block;color:#71889b;font-size:9px}.commandSimpleSummary b{display:block;margin-top:5px;font-size:22px}.commandCenterSimple .commandRow{grid-template-columns:1.35fr .75fr 1fr 1fr .85fr}.commandChannelRow{width:100%;border-left:0;border-right:0;border-bottom:0;background:transparent;color:inherit;text-align:left;border-radius:0}.commandChannelRow:hover{background:rgba(67,216,255,.035);transform:none}.commandFootNote{font-size:9px;color:#637d91;padding:2px 4px}@media(max-width:1050px){.commandToday{grid-template-columns:1fr}.commandTodayFacts{grid-template-columns:repeat(3,1fr)}.commandSimpleSummary{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.commandTodayFacts{grid-template-columns:1fr}.commandCenterSimple .commandRow{grid-template-columns:1.3fr .8fr}.commandCenterSimple .commandRow>span:nth-child(3),.commandCenterSimple .commandRow>span:nth-child(4),.commandCenterSimple .commandRow>span:nth-child(5){display:none}}\n''';p.write_text(s)

# Source-level regression tests for the exact user-visible contracts.
Path('tests/v1012_ux_storage.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('VYRON 1.0.12 UX/storage contracts',()=>{
 it('opens production folders through the single native reveal command',()=>{const s=read('src/productionManagerApi.ts');expect(s).toContain("invoke<void>('reveal_path',{path})");expect(s).toContain('defaultPath:defaultPath||undefined')});
 it('Finder opens a directory itself instead of revealing its parent',()=>{const s=read('src-tauri/src/files.rs');expect(s).toContain('if is_dir { vec![path.as_os_str().to_os_string()] }');expect(s).toContain('p.is_dir()')});
 it('project creation is not shaped around a 30 item UI cap',()=>{expect(read('src/autopilotCore.ts')).toContain('Math.min(10000,Math.floor(count))');expect(read('src/ProductionManager.tsx')).toContain('max="10000"')});
 it('Command Center contains no quota or units UI',()=>{const s=read('src/CommandCenter.tsx');expect(s).not.toContain('youtubeQuota');expect(s).not.toContain('units');expect(s).not.toContain('runway ≤');expect(s).toContain('Что делать дальше')});
 it('Production has human navigation labels',()=>{const s=read('src/ProductionOS.tsx');for(const x of ['Обзор','Материалы','Сборка проектов','Рендер','Публикация'])expect(s).toContain(x)});
});
''')

print('VYRON 1.0.12 UX + storage + Command Center patch applied')
