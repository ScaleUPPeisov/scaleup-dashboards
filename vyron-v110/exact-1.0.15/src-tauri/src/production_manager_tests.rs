use super::*;

fn wav_bytes(seed:u8)->Vec<u8>{
    let data=vec![seed;32];let mut b=Vec::new();b.extend_from_slice(b"RIFF");b.extend_from_slice(&(36u32+data.len() as u32).to_le_bytes());b.extend_from_slice(b"WAVEfmt ");b.extend_from_slice(&16u32.to_le_bytes());b.extend_from_slice(&1u16.to_le_bytes());b.extend_from_slice(&1u16.to_le_bytes());b.extend_from_slice(&8000u32.to_le_bytes());b.extend_from_slice(&16000u32.to_le_bytes());b.extend_from_slice(&2u16.to_le_bytes());b.extend_from_slice(&16u16.to_le_bytes());b.extend_from_slice(b"data");b.extend_from_slice(&(data.len() as u32).to_le_bytes());b.extend_from_slice(&data);b
}
fn fixture(images:usize,tracks:usize)->(PathBuf,String,String){
    let root=std::env::temp_dir().join(format!("vyron-pm-{}",Uuid::new_v4()));fs::create_dir_all(&root).unwrap();
    let workspace=root.join("workspace");fs::create_dir_all(&workspace).unwrap();let cid="channel-test".to_string();let cname="NEON".to_string();
    let music=root.join("music");fs::create_dir_all(&music).unwrap();
    for i in 0..tracks{fs::write(music.join(format!("track_{i:03}.wav")),wav_bytes((i%251) as u8+1)).unwrap();}
    set_production_music_library(workspace.to_string_lossy().into_owned(),cid.clone(),cname.clone(),music.to_string_lossy().into_owned()).unwrap();
    let imp=root.join("imports");fs::create_dir_all(&imp).unwrap();let mut collected=Vec::new();
    for i in 0..images{let p=imp.join(format!("{:03}.jpg",i+1));fs::write(&p,format!("image-{i}").as_bytes()).unwrap();collected.push(CollectedImage{id:Uuid::new_v4().to_string(),number:(i+1) as u32,path:p.to_string_lossy().into_owned(),source_path:p.to_string_lossy().into_owned(),captured_at:Utc::now().to_rfc3339()});}
    let session=ImportSession{schema_version:SCHEMA_VERSION,session_id:Uuid::new_v4().to_string(),channel_id:cid.clone(),channel_name:cname.clone(),active:false,started_at:Utc::now().to_rfc3339(),stopped_at:Some(Utc::now().to_rfc3339()),downloads_path:root.join("Downloads").to_string_lossy().into_owned(),import_path:imp.to_string_lossy().into_owned(),collected};
    atomic_json(&session_path(&workspace.to_string_lossy(),&cid).unwrap(),&session).unwrap();
    (workspace,cid,cname)
}
fn request(workspace:&Path,cid:&str,cname:&str,count:usize,tpp:usize,mode:&str,reuse:bool)->BuildRequest{
    BuildRequest{request_id:"test-request".into(),workspace:workspace.to_string_lossy().into_owned(),output_workspace:None,channel_id:cid.into(),channel_name:cname.into(),project_count:count,tracks_per_project:tpp,mode:mode.into(),allow_image_reuse:reuse,job_links:(0..count).map(|i|JobLink{job_id:format!("job-{i}"),number:(i+1) as u32}).collect()}
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


#[test]
fn acceptance_recursive_downloads_collects_nested_images(){let root=std::env::temp_dir().join(format!("vyron-recursive-{}",Uuid::new_v4()));let sub=root.join("GPT/NEON");fs::create_dir_all(&sub).unwrap();fs::write(sub.join("image.jpg"),b"image").unwrap();fs::write(sub.join(".hidden.png"),b"hidden").unwrap();fs::write(root.join("part.crdownload"),b"tmp").unwrap();let rows=recursive_images(&root).unwrap();assert_eq!(rows.len(),1);assert!(rows[0].ends_with("image.jpg"));fs::remove_dir_all(root).unwrap();}

#[test]
fn acceptance_alphabetical_mode_continues_and_sequences_differ(){let(ws,cid,name)=fixture(8,40);let plan=plan_build(&request(&ws,&cid,&name,8,10,"alphabetical",false)).unwrap();let mut seq=HashSet::new();for p in &plan.projects{assert_eq!(p.tracks.len(),10);assert!(seq.insert(p.sequence_fingerprint.clone()));}assert_eq!(seq.len(),8);cleanup(&ws);}

#[test]
fn acceptance_delete_selected_and_delete_all_batch_projects(){let(ws,cid,name)=fixture(10,50);let plan=plan_build(&request(&ws,&cid,&name,10,10,"even",false)).unwrap();let summary=execute_plan(None,&plan).unwrap();let r=delete_production_batch_projects(summary.manifest_path.clone(),vec!["001".into(),"002".into(),"003".into()]).unwrap();assert_eq!(r.deleted_project_ids.len(),3);let b=r.batch.unwrap();assert_eq!(b.project_count,7);let(m,_)=load_manifest(&b.manifest_path).unwrap();assert_eq!(m.projects.len(),7);let ids=m.projects.iter().map(|p|p.project_id.clone()).collect::<Vec<_>>();let r2=delete_production_batch_projects(b.manifest_path.clone(),ids).unwrap();assert!(r2.batch.is_none());assert!(!Path::new(&plan.batch_root).exists());cleanup(&ws);}


#[test]
fn acceptance_existing_downloads_are_collectible_on_start(){
    let(ws,cid,_)=fixture(1,2);
    let path=session_path(&ws.to_string_lossy(),&cid).unwrap();
    let mut session:ImportSession=read_json(&path);
    session.collected.clear();
    let existing=std::env::temp_dir().join("ChatGPT Image 3 сент. 18_54 (7) — копия 2.png").to_string_lossy().into_owned();
    let mut startup=HashSet::new();startup.insert(existing.clone());
    let seen=collector_seen_at_start(&session,&startup);
    assert!(!seen.contains(&existing),"startup Downloads snapshot must not suppress pre-existing images");
    cleanup(&ws);
}


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


#[test]
fn acceptance_power_loss_checkpoint_is_detected_and_resumes_without_duplicates(){
    let(ws,cid,name)=fixture(6,50);let plan=plan_build(&request(&ws,&cid,&name,6,10,"even",false)).unwrap();let root=PathBuf::from(&plan.batch_root);
    let first=&plan.projects[0];let d=root.join(&first.project_id);fs::create_dir_all(&d).unwrap();fs::copy(&first.image_source,d.join(&first.image_name)).unwrap();for t in &first.tracks{fs::copy(&t.source,d.join(&t.dest_name)).unwrap();}
    let cp_path=root.join("checkpoint.json");let mut cp:Checkpoint=read_json(&cp_path);cp.completed_projects=1;cp.updated_at=Utc::now().to_rfc3339();atomic_json(&cp_path,&cp).unwrap();
    let partial=root.join(".002.tmp");fs::create_dir_all(&partial).unwrap();fs::write(partial.join("broken.mp3"),b"partial").unwrap();
    let rows=find_production_recovery(vec![ws.to_string_lossy().into_owned()]).unwrap();assert_eq!(rows.len(),1);assert_eq!(rows[0].completed_projects,1);assert_eq!(rows[0].current_project,"002");
    let done=execute_plan(None,&plan).unwrap();assert_eq!(done.project_count,6);assert!(!partial.exists());assert!(project_ready(first,&d));
    assert!(find_production_recovery(vec![ws.to_string_lossy().into_owned()]).unwrap().is_empty());cleanup(&ws);
}

#[test]
fn acceptance_recovery_scan_never_creates_missing_external_mount(){
    let missing=std::env::temp_dir().join(format!("vyron-missing-recovery-{}",Uuid::new_v4())).join("not-mounted");assert!(!missing.exists());
    let rows=find_production_recovery(vec![missing.to_string_lossy().into_owned()]).unwrap();assert!(rows.is_empty());assert!(!missing.exists());
}
