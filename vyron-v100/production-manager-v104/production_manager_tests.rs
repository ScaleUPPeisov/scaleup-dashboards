use super::*;

fn fixture(images:usize,tracks:usize)->(PathBuf,String,String){
    let root=std::env::temp_dir().join(format!("vyron-pm-{}",Uuid::new_v4()));fs::create_dir_all(&root).unwrap();
    let workspace=root.join("workspace");fs::create_dir_all(&workspace).unwrap();let cid="channel-test".to_string();let cname="NEON".to_string();
    let music=root.join("music");fs::create_dir_all(&music).unwrap();
    for i in 0..tracks{fs::write(music.join(format!("track_{i:03}.mp3")),format!("audio-{i}-{}",Uuid::new_v4()).as_bytes()).unwrap();}
    set_production_music_library(workspace.to_string_lossy().into_owned(),cid.clone(),cname.clone(),music.to_string_lossy().into_owned()).unwrap();
    let imp=root.join("imports");fs::create_dir_all(&imp).unwrap();let mut collected=Vec::new();
    for i in 0..images{let p=imp.join(format!("{:03}.jpg",i+1));fs::write(&p,format!("image-{i}").as_bytes()).unwrap();collected.push(CollectedImage{id:Uuid::new_v4().to_string(),number:(i+1) as u32,path:p.to_string_lossy().into_owned(),source_path:p.to_string_lossy().into_owned(),captured_at:Utc::now().to_rfc3339()});}
    let session=ImportSession{schema_version:SCHEMA_VERSION,session_id:Uuid::new_v4().to_string(),channel_id:cid.clone(),channel_name:cname.clone(),active:false,started_at:Utc::now().to_rfc3339(),stopped_at:Some(Utc::now().to_rfc3339()),downloads_path:root.join("Downloads").to_string_lossy().into_owned(),import_path:imp.to_string_lossy().into_owned(),collected};
    atomic_json(&session_path(&workspace.to_string_lossy(),&cid).unwrap(),&session).unwrap();
    (workspace,cid,cname)
}
fn request(workspace:&Path,cid:&str,cname:&str,count:usize,tpp:usize,mode:&str,reuse:bool)->BuildRequest{
    BuildRequest{request_id:"test-request".into(),workspace:workspace.to_string_lossy().into_owned(),channel_id:cid.into(),channel_name:cname.into(),project_count:count,tracks_per_project:tpp,mode:mode.into(),allow_image_reuse:reuse,job_links:(0..count).map(|i|JobLink{job_id:format!("job-{i}"),number:(i+1) as u32}).collect()}
}
fn cleanup(workspace:&Path){if let Some(root)=workspace.parent(){let _=fs::remove_dir_all(root);}}

#[test]
fn acceptance_30_images_500_tracks_30x15_flat_450(){
    let(ws,cid,name)=fixture(30,500);let req=request(&ws,&cid,&name,30,15,"even",false);let plan=plan_build(&req).unwrap();let summary=execute_plan(None,&plan).unwrap();
    assert_eq!(summary.project_count,30);assert_eq!(summary.tracks_assigned,450);let(m,_)=load_manifest(&summary.manifest_path).unwrap();assert_eq!(m.projects.len(),30);
    let mut seq=HashSet::new();for p in &m.projects{let dir=Path::new(&p.folder_path);let entries=fs::read_dir(dir).unwrap().filter_map(Result::ok).collect::<Vec<_>>();assert_eq!(entries.len(),16);assert!(entries.iter().all(|e|e.file_type().unwrap().is_file()));assert_eq!(p.tracks.len(),15);assert!(seq.insert(p.sequence_fingerprint.clone()));}
    let fake=ws.parent().unwrap().join("ENDLUME Studio.app");fs::create_dir_all(&fake).unwrap();let v=validate_production_batch(summary.manifest_path,fake.to_string_lossy().into_owned()).unwrap();assert_eq!(v.ready,30);assert_eq!(v.errors,0);assert!(v.endlume_exists);cleanup(&ws);
}

#[test]
fn acceptance_insufficient_images_requires_explicit_reuse(){
    let(ws,cid,name)=fixture(30,80);let err=plan_build(&request(&ws,&cid,&name,50,15,"even",false)).unwrap_err();assert!(err.starts_with("INSUFFICIENT_IMAGES:30:50"));
    let plan=plan_build(&request(&ws,&cid,&name,50,15,"even",true)).unwrap();assert_eq!(plan.projects.len(),50);assert_eq!(plan.projects[0].image_source,plan.projects[30].image_source);cleanup(&ws);
}

#[test]
fn acceptance_100_tracks_450_assignments_repeat_but_sequences_differ(){
    let(ws,cid,name)=fixture(30,100);let plan=plan_build(&request(&ws,&cid,&name,30,15,"no-repeat",false)).unwrap();let mut seq=HashSet::new();let mut use_count=HashMap::<String,usize>::new();
    for p in &plan.projects{assert!(seq.insert(p.sequence_fingerprint.clone()));let mut local=HashSet::new();for t in &p.tracks{assert!(local.insert(t.track_id.clone()));*use_count.entry(t.track_id.clone()).or_insert(0)+=1;}}
    assert_eq!(seq.len(),30);assert_eq!(use_count.values().sum::<usize>(),450);assert!(use_count.values().any(|n|*n>1));cleanup(&ws);
}

#[test]
fn acceptance_execute_twice_is_idempotent_and_history_not_doubled(){
    let(ws,cid,name)=fixture(6,40);let plan=plan_build(&request(&ws,&cid,&name,6,10,"even",false)).unwrap();let first=execute_plan(None,&plan).unwrap();let h1:MusicHistory=read_json(&history_path(&ws.to_string_lossy(),&cid).unwrap());let uses1=h1.tracks.values().map(|x|x.times_used).sum::<u64>();
    let second=execute_plan(None,&plan).unwrap();let h2:MusicHistory=read_json(&history_path(&ws.to_string_lossy(),&cid).unwrap());let uses2=h2.tracks.values().map(|x|x.times_used).sum::<u64>();assert_eq!(first.batch_id,second.batch_id);assert_eq!(uses1,60);assert_eq!(uses2,60);assert_eq!(fs::read_dir(&plan.batch_root).unwrap().filter_map(Result::ok).filter(|e|e.file_type().map(|t|t.is_dir()).unwrap_or(false)&&e.file_name().to_string_lossy().chars().all(|c|c.is_ascii_digit())).count(),6);cleanup(&ws);
}

#[test]
fn acceptance_partial_batch_resumes_without_restarting(){
    let(ws,cid,name)=fixture(8,50);let plan=plan_build(&request(&ws,&cid,&name,8,10,"random",false)).unwrap();
    let first=&plan.projects[0];let d=PathBuf::from(&plan.batch_root).join(&first.project_id);fs::create_dir_all(&d).unwrap();fs::copy(&first.image_source,d.join(&first.image_name)).unwrap();for t in &first.tracks{fs::copy(&t.source,d.join(&t.dest_name)).unwrap();}assert!(project_ready(first,&d));
    let summary=execute_plan(None,&plan).unwrap();assert_eq!(summary.project_count,8);for p in &plan.projects{assert!(project_ready(p,&PathBuf::from(&plan.batch_root).join(&p.project_id)));}cleanup(&ws);
}
