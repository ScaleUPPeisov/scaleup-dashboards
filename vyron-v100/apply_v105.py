#!/usr/bin/env python3
import json,re,sys
from pathlib import Path

VERSION='1.0.5'
TARGET=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def need(rel:str)->Path:
    p=TARGET/rel
    if not p.is_file(): raise SystemExit(f'VYRON 1.0.5: missing {rel}')
    return p

def must(cond:bool,msg:str):
    if not cond: raise SystemExit('VYRON 1.0.5: '+msg)

# Native fix only: Downloads watcher reliability, permission visibility and stale-session recovery.
p=need('src-tauri/src/production_manager.rs')
s=p.read_text(encoding='utf-8')
must('pub fn start_production_import' in s,'Production Manager import command missing')
must('if seen.contains(&key){continue;} seen.insert(key.clone());' in s,'expected 1.0.4 eager-seen bug marker missing')

helper=r'''#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]
struct ImportProbe { size:u64, modified_ms:u64, stable_cycles:u8 }

fn import_runtime_active(channel_id:&str)->bool{
    import_stops().lock().ok().and_then(|m|m.get(channel_id).cloned()).map(|flag|!flag.load(Ordering::SeqCst)).unwrap_or(false)
}
fn normalize_import_runtime(workspace:&str,channel_id:&str,mut session:ImportSession)->ImportSession{
    if session.active && !import_runtime_active(channel_id){
        session.active=false;
        if session.stopped_at.is_none(){session.stopped_at=Some(Utc::now().to_rfc3339());}
        if let Ok(path)=session_path(workspace,channel_id){let _=atomic_json(&path,&session);}
    }
    session
}
fn import_candidate_ready(src:&Path,pending:&mut HashMap<String,ImportProbe>)->bool{
    let key=src.to_string_lossy().into_owned();
    let meta=match fs::metadata(src){Ok(m)=>m,Err(_)=>{pending.remove(&key);return false;}};
    if meta.len()==0{pending.remove(&key);return false;}
    let now=ImportProbe{size:meta.len(),modified_ms:modified_ms(&meta),stable_cycles:0};
    match pending.get_mut(&key){
        Some(prev) if prev.size==now.size && prev.modified_ms==now.modified_ms=>{
            prev.stable_cycles=prev.stable_cycles.saturating_add(1);
            prev.stable_cycles>=1
        }
        _=>{pending.insert(key,now);false}
    }
}

'''
marker='fn spawn_import_watcher(app:AppHandle, workspace:String, channel_id:String, mut session:ImportSession, baseline:HashSet<String>) -> Result<(),String> {'
must(marker in s,'watcher marker missing')
if 'struct ImportProbe' not in s:
    s=s.replace(marker,helper+marker,1)

start=s.index(marker)
end=s.index('\n#[tauri::command]\npub fn start_production_import',start)
new_watcher=r'''fn spawn_import_watcher(app:AppHandle, workspace:String, channel_id:String, mut session:ImportSession, baseline:HashSet<String>) -> Result<(),String> {
    let stop=Arc::new(AtomicBool::new(false));
    import_stops().lock().map_err(|_|"Import lock".to_string())?.insert(channel_id.clone(),stop.clone());
    let state_path=session_path(&workspace,&channel_id)?;
    let downloads=PathBuf::from(&session.downloads_path);
    let import_dir=PathBuf::from(&session.import_path);
    thread::spawn(move || {
        let mut seen=baseline;
        let mut pending=HashMap::<String,ImportProbe>::new();
        let mut last_error:Option<String>=None;
        for x in &session.collected { seen.insert(x.source_path.clone()); }
        while !stop.load(Ordering::SeqCst) {
            let rd=match fs::read_dir(&downloads){
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
            for src in files {
                let key=src.to_string_lossy().into_owned();
                if seen.contains(&key){continue;}
                if !import_candidate_ready(&src,&mut pending){continue;}
                let before=match fs::metadata(&src){Ok(x) if x.len()>0=>x,_=>continue};
                let before_size=before.len();
                let before_modified=modified_ms(&before);
                let no=(session.collected.len()+1) as u32;
                let extension=ext(&src);
                let dst=import_dir.join(format!("{:03}.{}",no,extension));
                let tmp=import_dir.join(format!(".{:03}.{}.partial",no,extension));
                let _=fs::remove_file(&tmp);
                if let Err(e)=fs::copy(&src,&tmp){
                    let _=app.emit("production-import-error",json!({"channelId":channel_id,"sessionId":session.session_id,"message":format!("Не удалось скопировать изображение: {e}")}));
                    continue;
                }
                let after=match fs::metadata(&src){Ok(x)=>x,Err(_)=>{let _=fs::remove_file(&tmp);continue;}};
                let copied=fs::metadata(&tmp).map(|m|m.len()).unwrap_or(0);
                if after.len()!=before_size || modified_ms(&after)!=before_modified || copied!=before_size{
                    let _=fs::remove_file(&tmp);
                    pending.insert(key.clone(),ImportProbe{size:after.len(),modified_ms:modified_ms(&after),stable_cycles:0});
                    continue;
                }
                if let Err(e)=fs::rename(&tmp,&dst){
                    let _=fs::remove_file(&tmp);
                    let _=app.emit("production-import-error",json!({"channelId":channel_id,"sessionId":session.session_id,"message":format!("Не удалось сохранить изображение в VYRON: {e}")}));
                    continue;
                }
                seen.insert(key.clone());
                pending.remove(&key);
                let item=CollectedImage{id:Uuid::new_v4().to_string(),number:no,path:dst.to_string_lossy().into_owned(),source_path:key,captured_at:Utc::now().to_rfc3339()};
                session.collected.push(item);
                let _=atomic_json(&state_path,&session);
                let _=app.emit("production-import-progress",json!({"channelId":channel_id,"sessionId":session.session_id,"collected":session.collected.len(),"bytes":before_size}));
            }
            thread::sleep(Duration::from_millis(650));
        }
        session.active=false;
        session.stopped_at=Some(Utc::now().to_rfc3339());
        let _=atomic_json(&state_path,&session);
        if let Ok(mut map)=import_stops().lock(){map.remove(&channel_id);}
    });
    Ok(())
}
'''
s=s[:start]+new_watcher+s[end:]

# Fail immediately when Downloads exists but macOS denies read access. 1.0.4 only checked is_dir().
needle='    let downloads=downloads_dir()?;\n'
must(needle in s,'start import downloads marker missing')
access_guard='    let downloads=downloads_dir()?;\n    fs::read_dir(&downloads).map_err(|e|format!("VYRON не может читать папку Downloads: {e}. Разрешите VYRON доступ к Downloads в настройках macOS «Конфиденциальность и безопасность → Файлы и папки»."))?;\n'
s=s.replace(needle,access_guard,1)

# Never display a persisted active=true after app restart when the in-process watcher no longer exists.
old='pub fn production_import_status(workspace:String,channel_id:String)->Result<ImportSession,String>{Ok(read_json(&session_path(&workspace,&channel_id)?))}'
new='pub fn production_import_status(workspace:String,channel_id:String)->Result<ImportSession,String>{let s:ImportSession=read_json(&session_path(&workspace,&channel_id)?);Ok(normalize_import_runtime(&workspace,&channel_id,s))}'
must(old in s,'import status marker missing')
s=s.replace(old,new,1)
old_state='let settings:ChannelSettings=read_json(&settings_path(&workspace,&channel_id)?);let import_session:ImportSession=read_json(&session_path(&workspace,&channel_id)?);let idx:MusicIndex=read_json(&index_path(&workspace,&channel_id)?);'
new_state='let settings:ChannelSettings=read_json(&settings_path(&workspace,&channel_id)?);let import_session:ImportSession=normalize_import_runtime(&workspace,&channel_id,read_json(&session_path(&workspace,&channel_id)?));let idx:MusicIndex=read_json(&index_path(&workspace,&channel_id)?);'
must(old_state in s,'channel state import marker missing')
s=s.replace(old_state,new_state,1)

must('if seen.contains(&key){continue;} seen.insert(key.clone());' not in s,'eager seen marker survived')
must(s.index('if !import_candidate_ready(&src,&mut pending){continue;}') < s.index('seen.insert(key.clone());'),'seen is still recorded before stability/copy')
must('production-import-error' in s,'import error event missing')
must('normalize_import_runtime' in s,'stale-session recovery missing')
p.write_text(s,encoding='utf-8')

# Add regression tests for the exact race and stale-session state.
p=need('src-tauri/src/production_manager_tests.rs')
t=p.read_text(encoding='utf-8')
if 'acceptance_import_candidate_retries_zero_byte_until_stable' not in t:
    t+=r'''

#[test]
fn acceptance_import_candidate_retries_zero_byte_until_stable(){
    let root=std::env::temp_dir().join(format!("vyron-import-race-{}",Uuid::new_v4()));fs::create_dir_all(&root).unwrap();
    let image=root.join("download.png");fs::write(&image,Vec::<u8>::new()).unwrap();let mut pending=HashMap::<String,ImportProbe>::new();
    assert!(!import_candidate_ready(&image,&mut pending));
    fs::write(&image,vec![7u8;4096]).unwrap();
    assert!(!import_candidate_ready(&image,&mut pending));
    assert!(import_candidate_ready(&image,&mut pending));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn acceptance_persisted_active_import_is_not_reported_alive_without_runtime_watcher(){
    let(ws,cid,_)=fixture(1,2);let path=session_path(&ws.to_string_lossy(),&cid).unwrap();let mut s:ImportSession=read_json(&path);s.active=true;s.stopped_at=None;atomic_json(&path,&s).unwrap();
    if let Ok(mut map)=import_stops().lock(){map.remove(&cid);}
    let normalized=normalize_import_runtime(&ws.to_string_lossy(),&cid,s);assert!(!normalized.active);assert!(normalized.stopped_at.is_some());cleanup(&ws);
}
'''
p.write_text(t,encoding='utf-8')

# Frontend: surface watcher errors and poll local import state while active so the counter cannot visually freeze after a missed event.
p=need('src/productionManagerApi.ts')
a=p.read_text(encoding='utf-8')
needle="  onImportProgress:(cb:(p:{channelId:string;collected:number;sessionId:string})=>void):Promise<UnlistenFn>=>listen('production-import-progress',e=>cb(e.payload as any)),\n"
must(needle in a,'onImportProgress API marker missing')
if 'onImportError:' not in a:
    a=a.replace(needle,needle+"  onImportError:(cb:(p:{channelId:string;sessionId:string;message:string})=>void):Promise<UnlistenFn>=>listen('production-import-error',e=>cb(e.payload as any)),\n",1)
p.write_text(a,encoding='utf-8')

p=need('src/ProductionManager.tsx')
u=p.read_text(encoding='utf-8')
state_marker="  const [validation,setValidation]=useState<Validation|null>(null);\n"
must(state_marker in u,'ProductionManager state marker missing')
if 'const [importError,setImportError]' not in u:
    u=u.replace(state_marker,state_marker+"  const [importError,setImportError]=useState('');\n",1)

listener="    offs.push(productionManagerApi.onImportProgress(p=>{if(live&&p.channelId===channelId)void refreshState()}));\n"
must(listener in u,'import progress listener marker missing')
if 'onImportError' not in u:
    u=u.replace(listener,listener+"    offs.push(productionManagerApi.onImportError(p=>{if(live&&p.channelId===channelId)setImportError(p.message||'Ошибка сбора изображений')}));\n",1)

# Local polling is intentionally API-free: it only reads import-session.json through Tauri.
poll_anchor="  const jobLinks=useMemo(()=>jobs.filter(j=>j.channelId===channelId).sort((a,b)=>a.number-b.number),[jobs,channelId]);\n"
must(poll_anchor in u,'jobLinks anchor missing')
if 'productionManagerApi.importStatus(workspace,channelId)' not in u:
    poll=r'''  useEffect(()=>{
    if(!workspace||!channelId||!session?.active)return;
    const timer=window.setInterval(()=>{productionManagerApi.importStatus(workspace,channelId).then(next=>{setSession(next);if(!next.active)setImportError('')}).catch(e=>setImportError(String(e)))},1200);
    return()=>window.clearInterval(timer);
  },[workspace,channelId,session?.active]);

'''
    u=u.replace(poll_anchor,poll+poll_anchor,1)

u=u.replace("    setBusy('import');\n    try{","    setBusy('import');\n    setImportError('');\n    try{",1)
old_card='<section className="panel pmCard"><div className="pmCardHead"><span><small>01</small><h3>Изображения</h3></span><b className={session?.active?\'live\':\'\'}>{session?.active?\'● СБОР ИДЁТ\':\'ГОТОВО\'}</b></div><p>VYRON следит за Downloads только во время активной import-сессии выбранного канала и создаёт собственную нумерацию.</p><div className="pmBigNumber">{collected}<small>изображений собрано</small></div><div className="pmActions"><button className="primary" disabled={busy===\'import\'} onClick={toggleImport}>{session?.active?\'ЗАВЕРШИТЬ СБОР\':\'НАЧАТЬ СБОР\'}</button></div><small className="pmHint">{session?.importPath?shortPath(session.importPath):\'После запуска скачивайте изображения из ChatGPT как обычно.\'}</small></section>'
new_card='<section className="panel pmCard"><div className="pmCardHead"><span><small>01</small><h3>Изображения</h3></span><b className={session?.active&&!importError?\'live\':\'\'}>{importError?\'● ОШИБКА\':session?.active?\'● СБОР ИДЁТ\':\'ГОТОВО\'}</b></div><p>VYRON следит за Downloads только во время активной import-сессии выбранного канала и создаёт собственную нумерацию.</p><div className="pmBigNumber">{collected}<small>изображений собрано</small></div>{importError&&<div className="pmShortage"><div><b>Проблема со сбором изображений</b><span>{importError}</span></div></div>}<div className="pmActions"><button className="primary" disabled={busy===\'import\'} onClick={toggleImport}>{session?.active?\'ЗАВЕРШИТЬ СБОР\':\'НАЧАТЬ СБОР\'}</button></div><small className="pmHint">{session?.active?`Слежу: ${shortPath(session.downloadsPath)} • Копии: ${shortPath(session.importPath)}`:session?.importPath?shortPath(session.importPath):\'После запуска скачивайте изображения из ChatGPT как обычно.\'}</small></section>'
must(old_card in u,'image card marker missing')
u=u.replace(old_card,new_card,1)
p.write_text(u,encoding='utf-8')

# Version only. No unrelated architecture/UI changes.
p=need('package.json');pkg=json.loads(p.read_text());must(pkg.get('version')=='1.0.4','expected released package 1.0.4');pkg['version']=VERSION;p.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')
pl=TARGET/'package-lock.json'
if pl.is_file():
    d=json.loads(pl.read_text());d['version']=VERSION
    if isinstance(d.get('packages'),dict) and isinstance(d['packages'].get(''),dict):d['packages']['']['version']=VERSION
    pl.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=need('src-tauri/Cargo.toml');c=p.read_text();c2=re.sub(r'(?m)^version\s*=\s*"1\.0\.4"\s*$',f'version = "{VERSION}"',c,count=1);must(c2!=c,'Cargo version 1.0.4 marker missing');p.write_text(c2)
p=need('src-tauri/tauri.conf.json');cfg=json.loads(p.read_text());must(cfg.get('version')=='1.0.4','Tauri version 1.0.4 marker missing');cfg['version']=VERSION;p.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n')
p=need('src/App.tsx');app=p.read_text();must('VYRON 1.0.4' in app,'App version label missing');p.write_text(app.replace('VYRON 1.0.4','VYRON 1.0.5',1))

# Final hard guards.
for rel in ['src/ProductionManager.tsx','src/productionManagerApi.ts','src-tauri/src/production_manager.rs']:
    text=(TARGET/rel).read_text(errors='ignore')
    forbidden=['youtube_upload_video','youtube_list_existing_videos','youtube_update_existing_video','youtube_channel_analytics','youtube_channel_stats','youtube_oauth_profile_health','ytInvoke','googleapis.com']
    hit=[x for x in forbidden if x in text]
    if hit: raise SystemExit(f'ZERO QUOTA VIOLATION {rel}: {hit}')
must('production-import-error' in (TARGET/'src-tauri/src/production_manager.rs').read_text(),'native error event absent')
must("listen('production-import-error'" in (TARGET/'src/productionManagerApi.ts').read_text(),'frontend error listener absent')
print('VYRON 1.0.5 image-import reliability patch applied: PASS')
