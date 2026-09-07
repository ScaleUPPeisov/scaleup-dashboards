#!/usr/bin/env python3
from pathlib import Path
import json,re,sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')

# productionManagerApi: second folder picker + one-shot recursive import.
p=ROOT/'src/productionManagerApi.ts';s=p.read_text()
a="export type ProductionStorageStatus={path:string;exists:boolean;writable:boolean;external:boolean;freeBytes?:number|null;error?:string|null};"
b=a+"\nexport type ImageFolderImportResult={session:ImportSession;sourcePath:string;added:number;skipped:number;total:number};"
if a not in s: raise SystemExit('productionManagerApi type anchor missing')
s=s.replace(a,b,1)
a="  chooseMusicFolder:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка музыкальной библиотеки канала',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},"
b="  chooseImageFolder:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка с изображениями для текущего канала',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},\n"+a
if a not in s: raise SystemExit('productionManagerApi picker anchor missing')
s=s.replace(a,b,1)
a="  importStatus:(workspace:string,channelId:string)=>invoke<ImportSession>('production_import_status',{workspace,channelId}),"
b=a+"\n  importImageFolder:(workspace:string,channelId:string,channelName:string,sourcePath:string)=>invoke<ImageFolderImportResult>('import_production_image_folder',{workspace,channelId,channelName,sourcePath}),"
if a not in s: raise SystemExit('productionManagerApi import anchor missing')
s=s.replace(a,b,1);p.write_text(s)

# Production Manager UI: add a second button beside the existing Downloads collector.
p=ROOT/'src/ProductionManager.tsx';s=p.read_text()
a="  async function chooseMusic(){"
folder_fn="""  async function importImageFolder(){
    if(!workspace||!channel){toast('Сначала выберите канал и рабочую папку VYRON YT PEISOV');return}
    if(session?.active){toast('Сначала завершите активный сбор из Downloads, затем импортируйте папку');return}
    const sourcePath=await productionManagerApi.chooseImageFolder();if(!sourcePath)return;
    setBusy('image-folder');setImportError('');
    try{
      const result=await productionManagerApi.importImageFolder(workspace,channel.id,channel.name,sourcePath);
      setSession(result.session);
      notifySuccess('Папка изображений импортирована',`Добавлено ${result.added.toLocaleString('ru-RU')} • всего ${result.total.toLocaleString('ru-RU')} • пропущено ${result.skipped.toLocaleString('ru-RU')}`,{operationId:`image-folder:${channel.id}:${sourcePath}:${result.total}`});
    }catch(e){toast(String(e))}finally{setBusy('')}
  }

"""
if a not in s: raise SystemExit('ProductionManager chooseMusic anchor missing')
s=s.replace(a,folder_fn+a,1)
a='<section className="panel pmCard"><div className="pmCardHead"><span><small>01</small><h3>Изображения</h3></span><b className={session?.active&&!importError?\'live\':\'\'}>{importError?\'● ОШИБКА\':session?.active?(collected?\'● СБОР ИДЁТ\':\'● ЖДУ ФАЙЛЫ\'):\'ГОТОВО\'}</b></div><p>VYRON YT PEISOV следит за Downloads только во время активной import-сессии выбранного канала и создаёт собственную нумерацию.</p>'
b='<section className="panel pmCard"><div className="pmCardHead"><span><small>01</small><h3>Изображения</h3></span><b className={session?.active&&!importError?\'live\':\'\'}>{importError?\'● ОШИБКА\':session?.active?(collected?\'● СБОР ИДЁТ\':\'● ЖДУ ФАЙЛЫ\'):\'ГОТОВО\'}</b></div><p>Можно собирать автоматически из Downloads или добавить готовую папку изображений. Папка импортируется рекурсивно в материалы текущего канала и не требует заранее созданных проектов.</p>'
if a not in s: raise SystemExit('ProductionManager image description anchor missing')
s=s.replace(a,b,1)
a='<div className="pmActions"><button className="primary" disabled={busy===\'import\'} onClick={toggleImport}>{session?.active?\'ЗАВЕРШИТЬ СБОР\':\'НАЧАТЬ СБОР\'}</button></div><small className="pmHint">'
b='<div className="pmActions"><button className="primary" disabled={busy===\'import\'||busy===\'image-folder\'} onClick={toggleImport}>{session?.active?\'ЗАВЕРШИТЬ СБОР\':\'НАЧАТЬ СБОР\'}</button><button disabled={!!session?.active||busy===\'image-folder\'||busy===\'import\'} onClick={()=>void importImageFolder()}>{busy===\'image-folder\'?\'ИМПОРТИРУЮ…\':\'ИМПОРТ ИЗ ПАПКИ\'}</button></div><small className="pmHint">'
if a not in s: raise SystemExit('ProductionManager image buttons anchor missing')
s=s.replace(a,b,1);p.write_text(s)

# Native backend: recursive, persistent, duplicate-safe import into the SAME channel image pool.
p=ROOT/'src-tauri/src/production_manager.rs';s=p.read_text()
a='pub struct ChannelState { pub settings:ChannelSettings,pub import_session:ImportSession,pub music:Option<MusicSummary>,pub batches:Vec<BatchSummary> }'
b=a+'''\n#[derive(Clone,Debug,Serialize,Deserialize,Default)]\n#[serde(rename_all="camelCase")]\npub struct ImageFolderImportResult { pub session:ImportSession,pub source_path:String,pub added:usize,pub skipped:usize,pub total:usize }'''
if a not in s: raise SystemExit('Rust ChannelState anchor missing')
s=s.replace(a,b,1)

# Preserve an existing image pool when Downloads collection is started again.
a='''    let (session,baseline)=if old.active && !old.session_id.is_empty() && Path::new(&old.import_path).is_dir() {
        (old,image_snapshot(&downloads))
    } else {
        let sid=Uuid::new_v4().to_string(); let import_dir=croot.join("Imports").join(&sid); fs::create_dir_all(&import_dir).map_err(|e|e.to_string())?;
        (ImportSession{schema_version:SCHEMA_VERSION,session_id:sid,channel_id:channel_id.clone(),channel_name,active:true,started_at:Utc::now().to_rfc3339(),stopped_at:None,downloads_path:downloads.to_string_lossy().into_owned(),import_path:import_dir.to_string_lossy().into_owned(),collected:Vec::new()},image_snapshot(&downloads))
    };'''
b='''    let (session,baseline)=if !old.session_id.is_empty() && Path::new(&old.import_path).is_dir() {
        let mut resumed=old;
        resumed.session_id=Uuid::new_v4().to_string();
        resumed.channel_name=channel_name;
        resumed.active=true;
        resumed.started_at=Utc::now().to_rfc3339();
        resumed.stopped_at=None;
        resumed.downloads_path=downloads.to_string_lossy().into_owned();
        (resumed,image_snapshot(&downloads))
    } else {
        let sid=Uuid::new_v4().to_string(); let import_dir=croot.join("Imports").join(&sid); fs::create_dir_all(&import_dir).map_err(|e|e.to_string())?;
        (ImportSession{schema_version:SCHEMA_VERSION,session_id:sid,channel_id:channel_id.clone(),channel_name,active:true,started_at:Utc::now().to_rfc3339(),stopped_at:None,downloads_path:downloads.to_string_lossy().into_owned(),import_path:import_dir.to_string_lossy().into_owned(),collected:Vec::new()},image_snapshot(&downloads))
    };'''
if a not in s: raise SystemExit('Rust start import session anchor missing')
s=s.replace(a,b,1)

anchor='''#[tauri::command]
pub fn production_import_status(workspace:String,channel_id:String)->Result<ImportSession,String>{let s:ImportSession=read_json(&session_path(&workspace,&channel_id)?);Ok(normalize_import_runtime(&workspace,&channel_id,s))}
'''
func='''#[tauri::command]
pub fn import_production_image_folder(workspace:String,channel_id:String,channel_name:String,source_path:String)->Result<ImageFolderImportResult,String>{
    if let Ok(map)=import_stops().lock(){if map.get(&channel_id).map(|x|!x.load(Ordering::SeqCst)).unwrap_or(false){return Err("Сначала завершите активный сбор изображений из Downloads".into());}}
    let source=PathBuf::from(source_path).canonicalize().map_err(|e|format!("Папка изображений недоступна: {e}"))?;
    if !source.is_dir(){return Err("Выбранный путь должен быть папкой".into());}
    let croot=channel_root(&workspace,&channel_id)?;
    if source.starts_with(&croot){return Err("Нельзя импортировать папку из внутреннего хранилища материалов VYRON".into());}
    let files=recursive_images(&source)?;
    let sp=session_path(&workspace,&channel_id)?;
    let mut session:ImportSession=read_json(&sp);
    if session.session_id.is_empty() || session.import_path.is_empty() || !Path::new(&session.import_path).is_dir(){
        let sid=Uuid::new_v4().to_string();let import_dir=croot.join("Imports").join(&sid);fs::create_dir_all(&import_dir).map_err(|e|format!("Не удалось создать хранилище изображений: {e}"))?;
        session=ImportSession{schema_version:SCHEMA_VERSION,session_id:sid,channel_id:channel_id.clone(),channel_name:channel_name.clone(),active:false,started_at:Utc::now().to_rfc3339(),stopped_at:Some(Utc::now().to_rfc3339()),downloads_path:source.to_string_lossy().into_owned(),import_path:import_dir.to_string_lossy().into_owned(),collected:Vec::new()};
    }else{
        session.channel_name=channel_name;session.active=false;session.stopped_at=Some(Utc::now().to_rfc3339());session.downloads_path=source.to_string_lossy().into_owned();
    }
    let import_dir=PathBuf::from(&session.import_path);fs::create_dir_all(&import_dir).map_err(|e|format!("Хранилище изображений недоступно: {e}"))?;
    let mut seen=session.collected.iter().filter_map(|x|PathBuf::from(&x.source_path).canonicalize().ok()).map(|p|p.to_string_lossy().into_owned()).collect::<HashSet<_>>();
    let mut next_no=session.collected.iter().map(|x|x.number).max().unwrap_or(0).saturating_add(1);let mut added=0usize;let mut skipped=0usize;
    for raw in files{
        let src=match raw.canonicalize(){Ok(x)=>x,Err(_)=>{skipped+=1;continue}};let key=src.to_string_lossy().into_owned();if seen.contains(&key){skipped+=1;continue}
        let before=match fs::metadata(&src){Ok(x) if x.len()>0=>x,_=>{skipped+=1;continue}};let size=before.len();let modified=modified_ms(&before);let extension=ext(&src);
        let dst=import_dir.join(format!("{:03}.{}",next_no,extension));let tmp=import_dir.join(format!(".{:03}.{}.partial",next_no,extension));let _=fs::remove_file(&tmp);
        fs::copy(&src,&tmp).map_err(|e|format!("Не удалось скопировать {}: {e}",src.display()))?;
        let after=fs::metadata(&src).map_err(|e|format!("Исходное изображение изменилось во время импорта: {e}"))?;let copied=fs::metadata(&tmp).map(|m|m.len()).unwrap_or(0);
        if after.len()!=size || modified_ms(&after)!=modified || copied!=size{let _=fs::remove_file(&tmp);return Err(format!("Изображение изменилось во время импорта: {}",src.display()));}
        fs::rename(&tmp,&dst).map_err(|e|{let _=fs::remove_file(&tmp);format!("Не удалось сохранить изображение в VYRON: {e}")})?;
        session.collected.push(CollectedImage{id:Uuid::new_v4().to_string(),number:next_no,path:dst.to_string_lossy().into_owned(),source_path:key.clone(),captured_at:Utc::now().to_rfc3339()});seen.insert(key);next_no=next_no.saturating_add(1);added+=1;
    }
    atomic_json(&sp,&session)?;let total=session.collected.len();Ok(ImageFolderImportResult{session,source_path:source.to_string_lossy().into_owned(),added,skipped,total})
}
'''
if anchor not in s: raise SystemExit('Rust import status anchor missing')
s=s.replace(anchor,anchor+func,1);p.write_text(s)

# Register the native command.
p=ROOT/'src-tauri/src/lib.rs';s=p.read_text()
a='production_manager::production_storage_status,production_manager::start_production_import,production_manager::stop_production_import,production_manager::production_import_status,'
b='production_manager::production_storage_status,production_manager::start_production_import,production_manager::stop_production_import,production_manager::production_import_status,production_manager::import_production_image_folder,'
if a not in s: raise SystemExit('lib production command anchor missing')
s=s.replace(a,b,1);p.write_text(s)

# Regression tests: recursive import, repeated-folder dedup, no project prerequisite, persistence.
p=ROOT/'src-tauri/src/production_manager_tests.rs';s=p.read_text()
extra=r'''

#[test]
fn acceptance_folder_import_recurses_and_persists_without_projects(){
    let root=std::env::temp_dir().join(format!("vyron-folder-import-{}",Uuid::new_v4()));let ws=root.join("workspace");let src=root.join("images/NEON/nested");fs::create_dir_all(&src).unwrap();
    fs::write(src.join("a.jpg"),b"a-image").unwrap();fs::write(src.join("b.png"),b"b-image").unwrap();fs::write(src.join("skip.txt"),b"no").unwrap();
    let r=import_production_image_folder(ws.to_string_lossy().into_owned(),"channel-neon".into(),"NEON".into(),root.join("images").to_string_lossy().into_owned()).unwrap();
    assert_eq!(r.added,2);assert_eq!(r.total,2);assert_eq!(r.session.collected.len(),2);assert!(r.session.collected.iter().all(|x|Path::new(&x.path).is_file()));
    let persisted:ImportSession=read_json(&session_path(&ws.to_string_lossy(),"channel-neon").unwrap());assert_eq!(persisted.collected.len(),2);assert!(!persisted.active);let _=fs::remove_dir_all(root);
}

#[test]
fn acceptance_folder_import_same_folder_twice_is_duplicate_safe(){
    let root=std::env::temp_dir().join(format!("vyron-folder-dedup-{}",Uuid::new_v4()));let ws=root.join("workspace");let src=root.join("images");fs::create_dir_all(&src).unwrap();fs::write(src.join("a.webp"),b"image").unwrap();
    let one=import_production_image_folder(ws.to_string_lossy().into_owned(),"c".into(),"C".into(),src.to_string_lossy().into_owned()).unwrap();let two=import_production_image_folder(ws.to_string_lossy().into_owned(),"c".into(),"C".into(),src.to_string_lossy().into_owned()).unwrap();
    assert_eq!(one.added,1);assert_eq!(two.added,0);assert_eq!(two.skipped,1);assert_eq!(two.total,1);let _=fs::remove_dir_all(root);
}

#[test]
fn acceptance_folder_import_multiple_folders_accumulates_for_later_build(){
    let root=std::env::temp_dir().join(format!("vyron-folder-multi-{}",Uuid::new_v4()));let ws=root.join("workspace");let a=root.join("channel-images-a");let b=root.join("channel-images-b");fs::create_dir_all(&a).unwrap();fs::create_dir_all(&b).unwrap();
    fs::write(a.join("01.jpg"),b"one").unwrap();fs::write(a.join("02.jpg"),b"two").unwrap();fs::write(b.join("03.jpg"),b"three").unwrap();
    let r1=import_production_image_folder(ws.to_string_lossy().into_owned(),"c".into(),"C".into(),a.to_string_lossy().into_owned()).unwrap();let r2=import_production_image_folder(ws.to_string_lossy().into_owned(),"c".into(),"C".into(),b.to_string_lossy().into_owned()).unwrap();
    assert_eq!(r1.total,2);assert_eq!(r2.total,3);assert_eq!(r2.session.collected.iter().map(|x|x.number).collect::<Vec<_>>(),vec![1,2,3]);let _=fs::remove_dir_all(root);
}
'''
if 'acceptance_folder_import_recurses_and_persists_without_projects' not in s:s+=extra
p.write_text(s)

# Frontend contract test: second button exists without replacing Downloads collector.
p=ROOT/'src/imageFolderImport.test.ts';p.write_text("""import {describe,it,expect} from 'vitest';import {readFileSync} from 'node:fs';\ndescribe('image folder import',()=>{it('keeps Downloads collector and adds a second folder button',()=>{const s=readFileSync('src/ProductionManager.tsx','utf8');expect(s).toContain('НАЧАТЬ СБОР');expect(s).toContain('ИМПОРТ ИЗ ПАПКИ');expect(s).toContain('chooseImageFolder');expect(s).toContain('importImageFolder')});it('uses the existing production image pool instead of jobs',()=>{const r=readFileSync('src-tauri/src/production_manager.rs','utf8');expect(r).toContain('import_production_image_folder');expect(r).toContain('session.collected.push');expect(r).toContain('recursive_images(&source)');expect(r).not.toContain('import_production_image_folder(app:AppHandle')})});\n""")
print('VYRON 2.0.12 image-folder import patch: PASS')
