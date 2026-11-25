use super::*;

fn wav_bytes(seed: u8) -> Vec<u8> {
    let data = vec![seed; 32];
    let mut b = Vec::new();
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&(36u32 + data.len() as u32).to_le_bytes());
    b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&16u32.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&8000u32.to_le_bytes());
    b.extend_from_slice(&16000u32.to_le_bytes());
    b.extend_from_slice(&2u16.to_le_bytes());
    b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&(data.len() as u32).to_le_bytes());
    b.extend_from_slice(&data);
    b
}
fn fixture(images: usize, tracks: usize) -> (PathBuf, String, String) {
    let root = std::env::temp_dir().join(format!("vyron-pm-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let workspace = root.join("workspace");
    fs::create_dir_all(&workspace).unwrap();
    let cid = "channel-test".to_string();
    let cname = "NEON".to_string();
    let music = root.join("music");
    fs::create_dir_all(&music).unwrap();
    for i in 0..tracks {
        fs::write(
            music.join(format!("track_{i:03}.wav")),
            wav_bytes((i % 251) as u8 + 1),
        )
        .unwrap();
    }
    set_production_music_library(
        workspace.to_string_lossy().into_owned(),
        cid.clone(),
        cname.clone(),
        music.to_string_lossy().into_owned(),
    )
    .unwrap();
    let imp = root.join("imports");
    fs::create_dir_all(&imp).unwrap();
    let mut collected = Vec::new();
    for i in 0..images {
        let p = imp.join(format!("{:03}.jpg", i + 1));
        fs::write(&p, format!("image-{i}").as_bytes()).unwrap();
        collected.push(CollectedImage {
            id: Uuid::new_v4().to_string(),
            number: (i + 1) as u32,
            path: p.to_string_lossy().into_owned(),
            source_path: p.to_string_lossy().into_owned(),
            captured_at: Utc::now().to_rfc3339(),
        });
    }
    let session = ImportSession {
        schema_version: SCHEMA_VERSION,
        session_id: Uuid::new_v4().to_string(),
        channel_id: cid.clone(),
        channel_name: cname.clone(),
        active: false,
        started_at: Utc::now().to_rfc3339(),
        stopped_at: Some(Utc::now().to_rfc3339()),
        downloads_path: root.join("Downloads").to_string_lossy().into_owned(),
        import_path: imp.to_string_lossy().into_owned(),
        collected,
    };
    atomic_json(
        &session_path(&workspace.to_string_lossy(), &cid).unwrap(),
        &session,
    )
    .unwrap();
    (workspace, cid, cname)
}
fn request(
    workspace: &Path,
    cid: &str,
    cname: &str,
    count: usize,
    tpp: usize,
    mode: &str,
    reuse: bool,
) -> BuildRequest {
    BuildRequest {
        request_id: "test-request".into(),
        workspace: workspace.to_string_lossy().into_owned(),
        output_workspace: None,
        channel_id: cid.into(),
        channel_name: cname.into(),
        project_count: count,
        tracks_per_project: tpp,
        mode: mode.into(),
        allow_image_reuse: reuse,
        job_links: (0..count)
            .map(|i| JobLink {
                job_id: format!("job-{i}"),
                number: (i + 1) as u32,
            })
            .collect(),
        recovery_ui_context: None,
    }
}
fn cleanup(workspace: &Path) {
    if let Some(root) = workspace.parent() {
        let _ = fs::remove_dir_all(root);
    }
}

#[test]
fn acceptance_30_images_500_tracks_30x15_flat_450() {
    let (ws, cid, name) = fixture(30, 500);
    let req = request(&ws, &cid, &name, 30, 15, "even", false);
    let plan = plan_build(&req).unwrap();
    let summary = execute_plan(None, &plan).unwrap();
    assert_eq!(summary.project_count, 30);
    assert_eq!(summary.tracks_assigned, 450);
    let (m, _) = load_manifest(&summary.manifest_path).unwrap();
    assert_eq!(m.projects.len(), 30);
    let mut seq = HashSet::new();
    for p in &m.projects {
        let dir = Path::new(&p.folder_path);
        let entries = fs::read_dir(dir)
            .unwrap()
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        assert_eq!(entries.len(), 16);
        assert!(entries.iter().all(|e| e.file_type().unwrap().is_file()));
        assert_eq!(p.tracks.len(), 15);
        assert!(seq.insert(p.sequence_fingerprint.clone()));
    }
    let fake = ws.parent().unwrap().join("ENDLUME Studio.app");
    fs::create_dir_all(&fake).unwrap();
    let v = tauri::async_runtime::block_on(validate_production_batch(summary.manifest_path, fake.to_string_lossy().into_owned()))
        .unwrap();
    assert_eq!(v.ready, 30);
    assert_eq!(v.errors, 0);
    assert!(v.endlume_exists);
    cleanup(&ws);
}

#[test]
fn acceptance_insufficient_images_requires_explicit_reuse() {
    let (ws, cid, name) = fixture(30, 80);
    let err = plan_build(&request(&ws, &cid, &name, 50, 15, "even", false)).unwrap_err();
    assert!(err.starts_with("INSUFFICIENT_IMAGES:30:50"));
    let plan = plan_build(&request(&ws, &cid, &name, 50, 15, "even", true)).unwrap();
    assert_eq!(plan.projects.len(), 50);
    assert_eq!(
        plan.projects[0].image_source,
        plan.projects[30].image_source
    );
    cleanup(&ws);
}

#[test]
fn acceptance_100_tracks_450_assignments_repeat_but_sequences_differ() {
    let (ws, cid, name) = fixture(30, 100);
    let plan = plan_build(&request(&ws, &cid, &name, 30, 15, "no-repeat", false)).unwrap();
    let mut seq = HashSet::new();
    let mut use_count = HashMap::<String, usize>::new();
    for p in &plan.projects {
        assert!(seq.insert(p.sequence_fingerprint.clone()));
        let mut local = HashSet::new();
        for t in &p.tracks {
            assert!(local.insert(t.track_id.clone()));
            *use_count.entry(t.track_id.clone()).or_insert(0) += 1;
        }
    }
    assert_eq!(seq.len(), 30);
    assert_eq!(use_count.values().sum::<usize>(), 450);
    assert!(use_count.values().any(|n| *n > 1));
    cleanup(&ws);
}

#[test]
fn acceptance_execute_twice_is_idempotent_and_history_not_doubled() {
    let (ws, cid, name) = fixture(6, 40);
    let plan = plan_build(&request(&ws, &cid, &name, 6, 10, "even", false)).unwrap();
    let first = execute_plan(None, &plan).unwrap();
    let h1: MusicHistory = read_json(&history_path(&ws.to_string_lossy(), &cid).unwrap());
    let uses1 = h1.tracks.values().map(|x| x.times_used).sum::<u64>();
    let second = execute_plan(None, &plan).unwrap();
    let h2: MusicHistory = read_json(&history_path(&ws.to_string_lossy(), &cid).unwrap());
    let uses2 = h2.tracks.values().map(|x| x.times_used).sum::<u64>();
    assert_eq!(first.batch_id, second.batch_id);
    assert_eq!(uses1, 60);
    assert_eq!(uses2, 60);
    assert_eq!(
        fs::read_dir(&plan.batch_root)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false)
                && e.file_name()
                    .to_string_lossy()
                    .chars()
                    .all(|c| c.is_ascii_digit()))
            .count(),
        6
    );
    cleanup(&ws);
}

#[test]
fn acceptance_partial_batch_resumes_without_restarting() {
    let (ws, cid, name) = fixture(8, 50);
    let plan = plan_build(&request(&ws, &cid, &name, 8, 10, "random", false)).unwrap();
    let first = &plan.projects[0];
    let d = PathBuf::from(&plan.batch_root).join(&first.project_id);
    fs::create_dir_all(&d).unwrap();
    fs::copy(&first.image_source, d.join(&first.image_name)).unwrap();
    for t in &first.tracks {
        fs::copy(&t.source, d.join(&t.dest_name)).unwrap();
    }
    assert!(project_ready(first, &d));
    let summary = execute_plan(None, &plan).unwrap();
    assert_eq!(summary.project_count, 8);
    for p in &plan.projects {
        assert!(project_ready(
            p,
            &PathBuf::from(&plan.batch_root).join(&p.project_id)
        ));
    }
    cleanup(&ws);
}

#[test]
fn acceptance_import_candidate_retries_zero_byte_until_stable() {
    let root = std::env::temp_dir().join(format!("vyron-import-race-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let image = root.join("download.png");
    fs::write(&image, Vec::<u8>::new()).unwrap();
    let mut pending = HashMap::<String, ImportProbe>::new();
    assert!(!import_candidate_ready(&image, &mut pending));
    fs::write(&image, vec![7u8; 4096]).unwrap();
    assert!(!import_candidate_ready(&image, &mut pending));
    assert!(import_candidate_ready(&image, &mut pending));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn acceptance_persisted_active_import_is_not_reported_alive_without_runtime_watcher() {
    let (ws, cid, _) = fixture(1, 2);
    let path = session_path(&ws.to_string_lossy(), &cid).unwrap();
    let mut s: ImportSession = read_json(&path);
    s.active = true;
    s.stopped_at = None;
    atomic_json(&path, &s).unwrap();
    if let Ok(mut map) = import_stops().lock() {
        map.remove(&cid);
    }
    let normalized = normalize_import_runtime(&ws.to_string_lossy(), &cid, s);
    assert!(!normalized.active);
    assert!(normalized.stopped_at.is_some());
    cleanup(&ws);
}

#[test]
fn acceptance_recursive_downloads_collects_nested_images() {
    let root = std::env::temp_dir().join(format!("vyron-recursive-{}", Uuid::new_v4()));
    let sub = root.join("GPT/NEON");
    fs::create_dir_all(&sub).unwrap();
    fs::write(sub.join("image.jpg"), b"image").unwrap();
    fs::write(sub.join(".hidden.png"), b"hidden").unwrap();
    fs::write(root.join("part.crdownload"), b"tmp").unwrap();
    let rows = recursive_images(&root).unwrap();
    assert_eq!(rows.len(), 1);
    assert!(rows[0].ends_with("image.jpg"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn acceptance_alphabetical_mode_continues_and_sequences_differ() {
    let (ws, cid, name) = fixture(8, 40);
    let plan = plan_build(&request(&ws, &cid, &name, 8, 10, "alphabetical", false)).unwrap();
    let mut seq = HashSet::new();
    for p in &plan.projects {
        assert_eq!(p.tracks.len(), 10);
        assert!(seq.insert(p.sequence_fingerprint.clone()));
    }
    assert_eq!(seq.len(), 8);
    cleanup(&ws);
}

#[test]
fn acceptance_delete_selected_and_delete_all_batch_projects() {
    let (ws, cid, name) = fixture(10, 50);
    let plan = plan_build(&request(&ws, &cid, &name, 10, 10, "even", false)).unwrap();
    let summary = execute_plan(None, &plan).unwrap();
    let (m, _) = load_manifest(&summary.manifest_path).unwrap();
    let status_path = PathBuf::from(&m.status_path);
    let mut st: BatchStatus = read_json(&status_path);
    fs::create_dir_all(&m.output_dir).unwrap();
    for row in &mut st.projects {
        let output = PathBuf::from(&m.output_dir).join(format!("{}.mp4", row.project_id));
        fs::write(&output, b"render must survive manual project delete").unwrap();
        row.render_status = "Completed".into();
        row.output_file = Some(output.to_string_lossy().into_owned());
    }
    atomic_json(&status_path, &st).unwrap();

    // Explicit manual delete must not require YouTube upload proof.
    let first = delete_production_batch_projects_inner(
        summary.manifest_path.clone(),
        vec!["001".into()],
    ).unwrap();
    assert_eq!(first.deleted_project_ids, vec!["001".to_string()]);
    assert!(!Path::new(&m.projects[0].folder_path).exists());
    assert_eq!(first.batch.as_ref().unwrap().project_count, 9);

    let r = delete_production_batch_projects_inner(
        summary.manifest_path.clone(),
        vec!["002".into(), "003".into()],
    ).unwrap();
    assert_eq!(r.deleted_project_ids.len(), 2);
    let b = r.batch.unwrap();
    assert_eq!(b.project_count, 7);
    let (m2, _) = load_manifest(&b.manifest_path).unwrap();
    assert_eq!(m2.projects.len(), 7);

    let ids = m2.projects.iter().map(|p| p.project_id.clone()).collect::<Vec<_>>();
    let r2 = delete_production_batch_projects_inner(b.manifest_path.clone(), ids).unwrap();
    assert!(r2.batch.is_none());
    let (final_manifest, _) = load_manifest(&b.manifest_path).unwrap();
    assert!(final_manifest.projects.is_empty());

    // Manual delete never touches Render output.
    assert!(Path::new(&m.output_dir).is_dir());
    for row in st.projects {
        let output = row.output_file.unwrap();
        assert!(Path::new(&output).exists());
    }
    cleanup(&ws);
}

#[test]
fn acceptance_existing_downloads_are_collectible_on_start() {
    let (ws, cid, _) = fixture(1, 2);
    let path = session_path(&ws.to_string_lossy(), &cid).unwrap();
    let mut session: ImportSession = read_json(&path);
    session.collected.clear();
    let existing = std::env::temp_dir()
        .join("ChatGPT Image 3 сент. 18_54 (7) — копия 2.png")
        .to_string_lossy()
        .into_owned();
    let seen = collector_seen_at_start(&session);
    assert!(
        !seen.contains(&existing),
        "pre-existing Downloads images remain collectible"
    );
    cleanup(&ws);
}

#[test]
fn import_reservation_blocks_duplicate_start_until_watcher_finishes() {
    let channel_id = format!("fixture-{}", Uuid::new_v4());
    let first = reserve_import(&channel_id).unwrap();
    assert!(reserve_import(&channel_id).is_err());
    first.store(true, Ordering::SeqCst);
    assert!(reserve_import(&channel_id).is_err());
    release_import(&channel_id, &first);
    let next = reserve_import(&channel_id).unwrap();
    release_import(&channel_id, &first);
    assert!(reserve_import(&channel_id).is_err());
    release_import(&channel_id, &next);
}

#[test]
fn acceptance_separate_output_workspace_preserves_source_state() {
    let (ws, cid, name) = fixture(4, 30);
    let source_root = ws.clone();
    let external = ws.parent().unwrap().join("external-production");
    fs::create_dir_all(&external).unwrap();
    let mut req = request(&ws, &cid, &name, 4, 5, "even", false);
    req.output_workspace = Some(external.to_string_lossy().into_owned());
    let plan = plan_build(&req).unwrap();
    assert!(Path::new(&plan.batch_root).starts_with(&external));
    let summary = execute_plan(None, &plan).unwrap();
    assert!(Path::new(&summary.root_path).starts_with(&external));
    assert!(session_path(&source_root.to_string_lossy(), &cid)
        .unwrap()
        .is_file());
    assert!(history_path(&source_root.to_string_lossy(), &cid)
        .unwrap()
        .is_file());
    let (m, _) = load_manifest(&summary.manifest_path).unwrap();
    assert!(Path::new(&m.output_dir).starts_with(&external));
    assert_eq!(m.projects.len(), 4);
    cleanup(&ws);
}

#[test]
fn acceptance_missing_external_output_never_falls_back_to_internal_workspace() {
    let (ws, cid, name) = fixture(2, 20);
    let missing = ws.parent().unwrap().join("disconnected-external-drive");
    let mut req = request(&ws, &cid, &name, 2, 5, "even", false);
    req.output_workspace = Some(missing.to_string_lossy().into_owned());
    let err = plan_build(&req).unwrap_err();
    assert!(err.contains("недоступ") || err.contains("доступ"));
    assert!(!missing.exists());
    let internal_parent = batch_root_parent(&ws.to_string_lossy(), &cid).unwrap();
    let internal_batches = fs::read_dir(internal_parent)
        .ok()
        .map(|rd| {
            rd.filter_map(Result::ok)
                .filter(|e| e.path().is_dir())
                .count()
        })
        .unwrap_or(0);
    assert_eq!(internal_batches, 0);
    cleanup(&ws);
}

#[test]
fn acceptance_output_workspace_none_keeps_legacy_batch_location() {
    let (ws, cid, name) = fixture(2, 20);
    let req = request(&ws, &cid, &name, 2, 5, "even", false);
    let plan = plan_build(&req).unwrap();
    assert!(Path::new(&plan.batch_root).starts_with(root(&ws.to_string_lossy()).unwrap()));
    cleanup(&ws);
}

#[test]
fn acceptance_power_loss_checkpoint_is_detected_and_resumes_without_duplicates() {
    let (ws, cid, name) = fixture(6, 50);
    let plan = plan_build(&request(&ws, &cid, &name, 6, 10, "even", false)).unwrap();
    let root = PathBuf::from(&plan.batch_root);
    let first = &plan.projects[0];
    let d = root.join(&first.project_id);
    fs::create_dir_all(&d).unwrap();
    fs::copy(&first.image_source, d.join(&first.image_name)).unwrap();
    for t in &first.tracks {
        fs::copy(&t.source, d.join(&t.dest_name)).unwrap();
    }
    let cp_path = root.join("checkpoint.json");
    let mut cp: Checkpoint = read_json(&cp_path);
    cp.completed_projects = 1;
    cp.updated_at = Utc::now().to_rfc3339();
    atomic_json(&cp_path, &cp).unwrap();
    let partial = root.join(".002.tmp");
    fs::create_dir_all(&partial).unwrap();
    fs::write(partial.join("broken.mp3"), b"partial").unwrap();
    let rows = find_production_recovery_sync(vec![ws.to_string_lossy().into_owned()]).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].completed_projects, 1);
    assert_eq!(rows[0].current_project, "002");
    let done = execute_plan(None, &plan).unwrap();
    assert_eq!(done.project_count, 6);
    assert!(!partial.exists());
    assert!(project_ready(first, &d));
    assert!(
        find_production_recovery_sync(vec![ws.to_string_lossy().into_owned()])
            .unwrap()
            .is_empty()
    );
    cleanup(&ws);
}

#[test]
fn acceptance_recovery_scan_never_creates_missing_external_mount() {
    let missing = std::env::temp_dir()
        .join(format!("vyron-missing-recovery-{}", Uuid::new_v4()))
        .join("not-mounted");
    assert!(!missing.exists());
    let rows = find_production_recovery_sync(vec![missing.to_string_lossy().into_owned()]).unwrap();
    assert!(rows.is_empty());
    assert!(!missing.exists());
}


#[test]
fn acceptance_double_power_loss_recovery_finishes_exactly_ten_without_duplicates() {
    let (ws,cid,name)=fixture(10,80);
    let plan=plan_build(&request(&ws,&cid,&name,10,6,"even",false)).unwrap();
    let root=PathBuf::from(&plan.batch_root);
    let mut original_hashes=Vec::new();
    for p in plan.projects.iter().take(4){
        let d=root.join(&p.project_id);fs::create_dir_all(&d).unwrap();
        fs::copy(&p.image_source,d.join(&p.image_name)).unwrap();
        for t in &p.tracks{fs::copy(&t.source,d.join(&t.dest_name)).unwrap();}
        assert!(project_ready(p,&d));
        original_hashes.push(hash_file(&d.join(&p.image_name)).unwrap());
    }
    let fifth=&plan.projects[4];
    let partial=root.join(format!(".{}.vyron-partial",fifth.project_id));
    fs::create_dir_all(&partial).unwrap();
    fs::copy(&fifth.image_source,partial.join(&fifth.image_name)).unwrap();
    let cp_path=root.join("checkpoint.json");let mut cp:Checkpoint=read_json(&cp_path);
    cp.completed_projects=4;cp.current_project=fifth.project_id.clone();cp.current_phase="PROJECT_STAGING".into();cp.updated_at=Utc::now().to_rfc3339();atomic_json(&cp_path,&cp).unwrap();

    let first_recovery=execute_plan(None,&plan).unwrap();
    assert_eq!(first_recovery.project_count,10);
    // Re-run the exact same persisted plan: this models a second crash/restart after recovery began.
    let second_recovery=execute_plan(None,&plan).unwrap();
    assert_eq!(second_recovery.batch_id,first_recovery.batch_id);
    let numeric=fs::read_dir(&root).unwrap().filter_map(Result::ok).filter(|e|e.file_type().map(|t|t.is_dir()).unwrap_or(false)&&e.file_name().to_string_lossy().chars().all(|ch|ch.is_ascii_digit())).count();
    assert_eq!(numeric,10);
    assert!(!partial.exists());
    for (i,p) in plan.projects.iter().take(4).enumerate(){
        assert_eq!(hash_file(&root.join(&p.project_id).join(&p.image_name)).unwrap(),original_hashes[i]);
    }
    for p in &plan.projects{assert!(project_ready(p,&root.join(&p.project_id)))}
    let history:MusicHistory=read_json(&history_path(&ws.to_string_lossy(),&cid).unwrap());
    assert_eq!(history.tracks.values().map(|x|x.times_used).sum::<u64>(),60);
    cleanup(&ws);
}

#[test]
fn acceptance_transactional_commit_leaves_no_partial_and_writes_verified_marker() {
    let (ws,cid,name)=fixture(2,20);
    let plan=plan_build(&request(&ws,&cid,&name,2,5,"even",false)).unwrap();
    execute_plan(None,&plan).unwrap();
    let root=PathBuf::from(&plan.batch_root);
    assert!(!root.join(".001.vyron-partial").exists());
    assert!(!root.join(".002.vyron-partial").exists());
    assert!(root.join(".vyron-committed/001.json").is_file());
    assert!(root.join(".vyron-committed/002.json").is_file());
    cleanup(&ws);
}


#[test]
fn acceptance_power_loss_after_history_commit_does_not_double_usage() {
    let (ws,cid,name)=fixture(4,30);
    let plan=plan_build(&request(&ws,&cid,&name,4,5,"even",false)).unwrap();
    execute_plan(None,&plan).unwrap();
    let hp=history_path(&ws.to_string_lossy(),&cid).unwrap();
    let before:MusicHistory=read_json(&hp);
    let uses_before=before.tracks.values().map(|x|x.times_used).sum::<u64>();
    assert_eq!(uses_before,20);

    // Simulate power loss after history.json atomic commit but before checkpoint persisted it.
    let cp_path=PathBuf::from(&plan.batch_root).join("checkpoint.json");
    let mut cp:Checkpoint=read_json(&cp_path);
    cp.history_applied=false;cp.status="Подготовка".into();cp.current_phase="MANIFEST_WRITTEN".into();
    atomic_json(&cp_path,&cp).unwrap();

    execute_plan(None,&plan).unwrap();
    let after:MusicHistory=read_json(&hp);
    let uses_after=after.tracks.values().map(|x|x.times_used).sum::<u64>();
    assert_eq!(uses_after,uses_before);
    cleanup(&ws);
}


#[test]
fn acceptance_endlume_handoff_request_is_durable_and_has_full_bridge_contract() {
    let root = std::env::temp_dir().join(format!("vyron-handoff-{}", Uuid::new_v4()));
    let inbox = root.join("VYRON Inbox");
    let batch = root.join("batch");
    fs::create_dir_all(&batch).unwrap();
    let subset = batch.join(".vyron-handoff-test.json");
    fs::write(&subset, b"{}").unwrap();
    let ids = vec!["001".to_string(), "003".to_string()];
    let request = write_endlume_handoff_request(
        &inbox,
        "BATCH-01",
        "handoff-test",
        &subset,
        batch.join("batch.json").to_string_lossy().as_ref(),
        &ids,
        "2026-09-30T12:00:00Z",
    )
    .unwrap();

    assert!(request.is_file());
    assert!(!production_endlume_handoff_consumed(request.to_string_lossy().into_owned()).unwrap());

    let value: Value = serde_json::from_slice(&fs::read(&request).unwrap()).unwrap();
    assert_eq!(value["schemaVersion"], 1);
    assert_eq!(value["batchId"], "BATCH-01");
    assert_eq!(value["handoffId"], "handoff-test");
    assert_eq!(value["manifestPath"], subset.to_string_lossy().as_ref());
    assert_eq!(value["selectedProjectIds"][0], "001");
    assert_eq!(value["selectedProjectIds"][1], "003");
    assert!(value["sourceManifestPath"].as_str().unwrap().ends_with("batch.json"));

    fs::remove_file(&request).unwrap();
    assert!(production_endlume_handoff_consumed(request.to_string_lossy().into_owned()).unwrap());
    let _ = fs::remove_dir_all(root);
}

#[cfg(target_os = "windows")]
#[test]
fn acceptance_windows_endlume_inbox_matches_tauri_app_data_contract() {
    let expected = PathBuf::from(std::env::var_os("APPDATA").expect("APPDATA"))
        .join("studio.endlume.desktop")
        .join("VYRON Inbox");
    assert_eq!(endlume_inbox_dir().unwrap(), expected);
}

#[cfg(target_os = "macos")]
#[test]
fn acceptance_macos_endlume_inbox_matches_tauri_app_data_contract() {
    let expected = PathBuf::from(std::env::var_os("HOME").expect("HOME"))
        .join("Library/Application Support")
        .join("studio.endlume.desktop")
        .join("VYRON Inbox");
    assert_eq!(endlume_inbox_dir().unwrap(), expected);
}


fn manual_fixture() -> (PathBuf, ManualBuildRequest, Vec<PathBuf>, Vec<PathBuf>) {
    let root = std::env::temp_dir().join(format!("vyron-manual-{}", Uuid::new_v4()));
    let workspace = root.join("workspace");
    let input = root.join("input");
    fs::create_dir_all(&workspace).unwrap();
    fs::create_dir_all(&input).unwrap();

    let images = (0..3)
        .map(|i| {
            let p = input.join(format!("cover-{i}.jpg"));
            fs::write(&p, format!("image-{i}").as_bytes()).unwrap();
            p
        })
        .collect::<Vec<_>>();
    let tracks = (0..6)
        .map(|i| {
            let p = input.join(format!("track-{i}.mp3"));
            fs::write(&p, format!("audio-{i}").as_bytes()).unwrap();
            p
        })
        .collect::<Vec<_>>();

    let req = ManualBuildRequest {
        request_id: Uuid::new_v4().to_string(),
        workspace: workspace.to_string_lossy().into_owned(),
        output_workspace: None,
        channel_id: "channel-aegean".into(),
        channel_name: "Aegean Afterglow".into(),
        images: images
            .iter()
            .map(|x| x.to_string_lossy().into_owned())
            .collect(),
        audio_files: tracks
            .iter()
            .map(|x| x.to_string_lossy().into_owned())
            .collect(),
        tracks_per_project: 2,
        job_links: vec![
            ManualJobLink { job_id: "job-071".into(), number: 71, channel_id: "channel-aegean".into() },
            ManualJobLink { job_id: "job-072".into(), number: 72, channel_id: "channel-aegean".into() },
            ManualJobLink { job_id: "job-073".into(), number: 73, channel_id: "channel-aegean".into() },
        ],
        recovery_ui_context: None,
    };
    (workspace, req, images, tracks)
}

#[test]
fn acceptance_manual_assembly_creates_video_folders_cover_tracks_and_manifest() {
    let (workspace, req, images, tracks) = manual_fixture();
    let plan = plan_manual_build(&req).unwrap();
    assert_eq!(plan.request.mode, "manual");
    assert_eq!(plan.request.channel_id, "channel-aegean");
    assert_eq!(plan.projects[0].project_id, "VIDEO_071");
    assert_eq!(plan.projects[2].project_id, "VIDEO_073");
    assert_eq!(plan.projects[0].tracks[0].dest_name, "tracks/01.mp3");
    assert_eq!(plan.projects[0].tracks[1].dest_name, "tracks/02.mp3");

    let summary = execute_plan(None, &plan).unwrap();
    assert_eq!(summary.project_count, 3);
    assert_eq!(summary.tracks_assigned, 6);

    let (manifest, _) = load_manifest(&summary.manifest_path).unwrap();
    assert_eq!(manifest.channel_id, "channel-aegean");
    assert_eq!(manifest.channel_name, "Aegean Afterglow");
    assert!(manifest.projects.iter().all(|p| p.job_id.is_some()));

    for (index, project) in manifest.projects.iter().enumerate() {
        let folder = PathBuf::from(&project.folder_path);
        assert!(folder.is_dir());
        assert!(folder.join("manifest.json").is_file());
        assert!(PathBuf::from(&project.image_path).is_file());
        assert_eq!(project.tracks.len(), 2);
        assert!(project.tracks.iter().all(|t| PathBuf::from(&t.path).is_file()));
        assert!(folder.join("tracks").is_dir());
        assert!(folder.file_name().unwrap().to_string_lossy().starts_with("VIDEO_"));
        assert_eq!(project.video_number, Some(71 + index as u32));
    }

    // Manual assembly copies selected source files; it never moves or deletes originals.
    assert!(images.iter().all(|x| x.is_file()));
    assert!(tracks.iter().all(|x| x.is_file()));
    cleanup(&workspace);
}

#[test]
fn acceptance_manual_assembly_blocks_cross_channel_job_mapping() {
    let (workspace, mut req, _, _) = manual_fixture();
    req.job_links[1].channel_id = "channel-neon-drive".into();
    let err = plan_manual_build(&req).unwrap_err();
    assert!(err.contains("project.channelId != selectedChannelId"));
    cleanup(&workspace);
}

#[test]
fn acceptance_manual_music_folder_scan_is_recursive_and_audio_only() {
    let root = std::env::temp_dir().join(format!("vyron-manual-music-{}", Uuid::new_v4()));
    let nested = root.join("album");
    fs::create_dir_all(&nested).unwrap();
    fs::write(root.join("a.mp3"), b"a").unwrap();
    fs::write(nested.join("b.flac"), b"b").unwrap();
    fs::write(nested.join("ignore.txt"), b"x").unwrap();
    let rows = recursive_audio(&root);
    assert_eq!(rows.len(), 2);
    assert!(rows.iter().all(|x| is_audio(x)));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn acceptance_manual_plan_does_not_touch_materials_library_assignment() {
    let (workspace, req, _, _) = manual_fixture();
    let plan = plan_manual_build(&req).unwrap();
    assert!(plan.projects.iter().all(|p| p.image_asset_id.is_none()));
    assert_eq!(materials_manager::image_summary(&req.workspace, &req.channel_id).unwrap().total, 0);
    execute_plan(None, &plan).unwrap();
    assert_eq!(materials_manager::image_summary(&req.workspace, &req.channel_id).unwrap().total, 0);
    cleanup(&workspace);
}


#[test]
fn v603_direct_material_import_is_visible_to_builder() {
    let (ws, cid, name) = fixture(0, 80);
    let src_root = ws.parent().unwrap().join("direct-images");
    fs::create_dir_all(&src_root).unwrap();
    let mut files = Vec::new();
    for i in 0..30 {
        let p = src_root.join(format!("direct-{i:02}.jpg"));
        fs::write(&p, format!("direct-image-{i}").as_bytes()).unwrap();
        files.push(p.to_string_lossy().into_owned());
    }
    let imported = materials_manager::import_images(
        &ws.to_string_lossy(),
        &cid,
        &name,
        files,
    ).unwrap();
    assert_eq!(imported.added, 30);
    assert_eq!(resolve_production_images(&ws.to_string_lossy(), &cid).unwrap().len(), 30);
    let plan = plan_build(&request(&ws, &cid, &name, 30, 10, "even", false)).unwrap();
    assert_eq!(plan.projects.len(), 30);
    cleanup(&ws);
}

#[test]
fn v603_mixed_image_sources_are_sha_deduplicated() {
    let (ws, cid, name) = fixture(10, 80);
    let session: ImportSession = read_json(&session_path(&ws.to_string_lossy(), &cid).unwrap());
    let src_root = ws.parent().unwrap().join("mixed-materials");
    fs::create_dir_all(&src_root).unwrap();
    let duplicate = src_root.join("duplicate.jpg");
    fs::copy(&session.collected[0].path, &duplicate).unwrap();
    let mut files = vec![duplicate.to_string_lossy().into_owned()];
    for i in 0..4 {
        let p = src_root.join(format!("material-{i}.jpg"));
        fs::write(&p, format!("material-unique-{i}").as_bytes()).unwrap();
        files.push(p.to_string_lossy().into_owned());
    }
    let imported = materials_manager::import_images(
        &ws.to_string_lossy(),
        &cid,
        &name,
        files,
    ).unwrap();
    assert_eq!(imported.added, 5);
    let resolved = resolve_production_images(&ws.to_string_lossy(), &cid).unwrap();
    assert_eq!(resolved.len(), 14);
    let plan = plan_build(&request(&ws, &cid, &name, 14, 10, "even", false)).unwrap();
    assert_eq!(plan.projects.len(), 14);
    cleanup(&ws);
}

#[test]
fn v603_material_images_can_be_reused_for_more_projects() {
    let (ws, cid, name) = fixture(0, 80);
    let src_root = ws.parent().unwrap().join("reuse-materials");
    fs::create_dir_all(&src_root).unwrap();
    let mut files = Vec::new();
    for i in 0..5 {
        let p = src_root.join(format!("reuse-{i}.jpg"));
        fs::write(&p, format!("reuse-image-{i}").as_bytes()).unwrap();
        files.push(p.to_string_lossy().into_owned());
    }
    materials_manager::import_images(&ws.to_string_lossy(), &cid, &name, files).unwrap();
    let err = plan_build(&request(&ws, &cid, &name, 30, 10, "even", false)).unwrap_err();
    assert!(err.starts_with("INSUFFICIENT_IMAGES:5:30"));
    let plan = plan_build(&request(&ws, &cid, &name, 30, 10, "even", true)).unwrap();
    assert_eq!(plan.projects.len(), 30);
    assert_eq!(plan.projects[0].image_source, plan.projects[5].image_source);
    cleanup(&ws);
}

#[test]
fn v603_manual_batch_delete_does_not_require_youtube_upload_proof() {
    let (ws, cid, name) = fixture(1, 20);
    let plan = plan_build(&request(&ws, &cid, &name, 1, 10, "even", false)).unwrap();
    let summary = execute_plan(None, &plan).unwrap();
    let project_dir = PathBuf::from(&plan.batch_root).join("001");
    assert!(project_dir.is_dir());
    let deleted = delete_production_batch_projects_inner(
        summary.manifest_path.clone(),
        vec!["001".into()],
    ).unwrap();
    assert_eq!(deleted.deleted_project_ids, vec!["001".to_string()]);
    assert_eq!(deleted.deleted_job_ids, vec!["job-0".to_string()]);
    assert!(deleted.batch.is_none());
    assert!(!project_dir.exists());
    cleanup(&ws);
}

#[test]
fn v603_automatic_cleanup_still_requires_completed_render() {
    let (ws, cid, name) = fixture(1, 20);
    let plan = plan_build(&request(&ws, &cid, &name, 1, 10, "even", false)).unwrap();
    let summary = execute_plan(None, &plan).unwrap();
    let expected = preview_completed_production_projects_sync(summary.manifest_path.clone()).unwrap();
    let eligible = tauri::async_runtime::block_on(preview_completed_production_projects(summary.manifest_path)).unwrap();
    assert_eq!(eligible, expected);
    assert!(eligible.is_empty());
    cleanup(&ws);
}


#[test]
fn acceptance_render_output_routes_to_channel_render_root() {
    let (ws, cid, name) = fixture(1, 2);
    let plan = plan_build(&request(&ws, &cid, &name, 1, 1, "even", false)).unwrap();
    let summary = execute_plan(None, &plan).unwrap();
    let (manifest, _) = load_manifest(&summary.manifest_path).unwrap();
    let expected = ws.join("Render").join(&name).canonicalize().unwrap();
    assert_eq!(PathBuf::from(&manifest.output_dir), expected);
    assert!(expected.is_dir());
    assert!(!is_production_batches_path(&expected));
    assert!(PathBuf::from(&manifest.root_path)
        .starts_with(ws.join("ProductionManager").join("Batches")));
    cleanup(&ws);
}

#[test]
fn acceptance_final_render_destination_rejects_batches_tree() {
    let forbidden = PathBuf::from(
        "/Volumes/TOSHIBA EXT/ВАЙРОН/ProductionManager/Batches/channel/batch/Rendered",
    );
    assert_eq!(
        validate_final_render_destination(&forbidden).unwrap_err(),
        INVALID_FINAL_RENDER_DESTINATION
    );
}

#[test]
fn acceptance_render_output_is_channel_isolated() {
    let root = std::env::temp_dir().join(format!("vyron-render-routing-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let first = render_output_dir(&root.to_string_lossy(), "Channel Alpha").unwrap();
    let second = render_output_dir(&root.to_string_lossy(), "Channel Beta").unwrap();
    assert_eq!(
        first,
        root.join("Render")
            .join("Channel Alpha")
            .canonicalize()
            .unwrap()
    );
    assert_eq!(
        second,
        root.join("Render")
            .join("Channel Beta")
            .canonicalize()
            .unwrap()
    );
    assert_ne!(first, second);
    assert!(!is_production_batches_path(&first));
    assert!(!is_production_batches_path(&second));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn batch_listing_reports_unreadable_directory_instead_of_empty_success() {
    let root = std::env::temp_dir().join(format!("vyron-batch-list-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    assert!(list_production_batches_at(&root).unwrap().is_empty());
    let not_a_directory = root.join("file");
    fs::write(&not_a_directory, b"fixture").unwrap();
    let error = list_production_batches_at(&not_a_directory).unwrap_err();
    assert!(error.contains("PRODUCTION_BATCH_LIST_FAILED"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn batch_list_worker_runs_off_async_executor_and_preserves_contract() {
    let root = std::env::temp_dir().join(format!("vyron-batch-async-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let workspace = root.to_string_lossy().into_owned();
    let channel = "fixture-channel".to_string();
    let parent = batch_root_parent(&workspace, &channel).unwrap();
    let batch = parent.join("one");
    fs::create_dir_all(&batch).unwrap();
    let status_path = batch.join("status.json");
    let manifest = BatchManifest {
        batch_id: "batch-one".into(),
        channel_id: channel.clone(),
        root_path: batch.to_string_lossy().into_owned(),
        status_path: status_path.to_string_lossy().into_owned(),
        ..Default::default()
    };
    atomic_json(&batch.join("batch.json"), &manifest).unwrap();
    atomic_json(&status_path, &BatchStatus { status: "Rendering".into(), ..Default::default() }).unwrap();
    let direct = list_production_batches_sync(workspace.clone(), channel.clone()).unwrap();
    let (worker_thread, caller_thread, actual) = tauri::async_runtime::block_on(async {
        let caller_thread = std::thread::current().id();
        let worker_thread = run_production_worker(|| Ok(std::thread::current().id())).await.unwrap();
        let actual = list_production_batches(workspace, channel).await.unwrap();
        (worker_thread, caller_thread, actual)
    });
    assert_ne!(worker_thread, caller_thread);
    assert_eq!(serde_json::to_value(actual).unwrap(), serde_json::to_value(direct).unwrap());
    assert!(tauri::async_runtime::block_on(list_production_batches(String::new(), "x".into())).is_err());
    let manifest_path = batch.join("batch.json").to_string_lossy().into_owned();
    let direct_status = read_production_batch_status_sync(manifest_path.clone()).unwrap();
    let async_status = tauri::async_runtime::block_on(read_production_batch_status(manifest_path)).unwrap();
    assert_eq!(serde_json::to_value(async_status).unwrap(), serde_json::to_value(direct_status).unwrap());
    assert!(tauri::async_runtime::block_on(read_production_batch_status("missing-fixture".into())).is_err());
    let missing = root.join("missing-batch.json").to_string_lossy().into_owned();
    let direct_error = preview_completed_production_projects_sync(missing.clone()).unwrap_err();
    let async_error = tauri::async_runtime::block_on(preview_completed_production_projects(missing)).unwrap_err();
    assert_eq!(async_error, direct_error);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn production_build_preparation_resolves_images_once_and_reuses_snapshot() {
    let (ws, cid, name) = fixture(3, 3);
    let req = request(&ws, &cid, &name, 3, 2, "even", false);
    let expected = resolve_production_images(&req.workspace, &req.channel_id).unwrap()
        .into_iter().map(|image| image.path).collect::<Vec<_>>();
    let mut calls = 0;
    let prepared = prepare_production_build(&req, |workspace, channel_id| {
        calls += 1;
        resolve_production_images(workspace, channel_id)
    }).unwrap();
    let (available, plan) = match prepared {
        BuildPreparation::Plan { available, plan, .. } => (available, plan),
        BuildPreparation::Ready(_) => panic!("expected a new build plan"),
    };
    assert_eq!(calls, 1);
    assert_eq!(available, 3);
    assert_eq!(plan.projects.iter().map(|project| project.image_source.clone()).collect::<Vec<_>>(), expected);
    assert!(plan.projects.iter().all(|project| project.tracks.len() == 2));

    let insufficient = request(&ws, &cid, &name, 4, 2, "even", false);
    let mut checks = 0;
    let result = prepare_production_build(&insufficient, |workspace, channel_id| {
        checks += 1;
        resolve_production_images(workspace, channel_id)
    }).unwrap();
    match result {
        BuildPreparation::Ready(result) => {
            assert_eq!(result.status, "insufficient_images");
            assert_eq!(result.available_images, 3);
        }
        BuildPreparation::Plan { .. } => panic!("insufficient images must not create a plan"),
    }
    assert_eq!(checks, 1);
    cleanup(&ws);
}

#[test]
fn production_storage_worker_preserves_status_and_missing_path_behavior() {
    let root = std::env::temp_dir().join(format!("vyron-storage-worker-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let path = root.to_string_lossy().into_owned();
    let sync = production_storage_status_sync(path.clone());
    let actual = tauri::async_runtime::block_on(production_storage_status(path));
    assert_eq!(actual.path, sync.path);
    assert_eq!(actual.exists, sync.exists);
    assert_eq!(actual.writable, sync.writable);
    assert_eq!(actual.external, sync.external);
    assert_eq!(actual.error, sync.error);
    assert!(actual.exists && actual.writable);
    assert!(!fs::read_dir(&root).unwrap().any(|entry| entry.unwrap().file_name().to_string_lossy().starts_with(".vyron-write-probe-")));

    let missing = root.join("absent").to_string_lossy().into_owned();
    let sync_missing = production_storage_status_sync(missing.clone());
    let async_missing = tauri::async_runtime::block_on(production_storage_status(missing));
    assert_eq!(serde_json::to_value(async_missing).unwrap(), serde_json::to_value(sync_missing).unwrap());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn manual_music_worker_preserves_scan_order_and_errors() {
    let root = std::env::temp_dir().join(format!("vyron-music-worker-{}", Uuid::new_v4()));
    let nested = root.join("nested");
    fs::create_dir_all(&nested).unwrap();
    fs::write(root.join("b.mp3"), b"fixture").unwrap();
    fs::write(nested.join("a.wav"), b"fixture").unwrap();
    fs::write(nested.join("ignored.txt"), b"fixture").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&nested, root.join("alias")).unwrap();
    let path = root.to_string_lossy().into_owned();
    let direct = scan_manual_production_music_sync(path.clone()).unwrap();
    let actual = tauri::async_runtime::block_on(scan_manual_production_music(path)).unwrap();
    assert_eq!(actual, direct);
    assert_eq!(actual.len(), 2);
    let missing = root.join("absent").to_string_lossy().into_owned();
    assert_eq!(tauri::async_runtime::block_on(scan_manual_production_music(missing)).unwrap_err(), "Выбранная музыкальная папка недоступна");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn even_candidate_selection_matches_full_stable_sort_with_ties() {
    // Repeatable ties exercise the same original-order tie break as stable sort.
    for size in [0usize, 1, 2, 13, 100, 1000] {
        let rows: Vec<(u64, u64, usize)> = (0..size)
            .map(|i| (((i * 17 + 3) % 11) as u64, ((i * 7 + 2) % 5) as u64, i))
            .collect();
        for count in [0, 1, 5, 10, 100, size, size + 1] {
            let mut expected = rows.clone();
            expected.sort_by_key(|x| (x.0, x.1));
            let expected: Vec<usize> = expected.into_iter().take(count).map(|x| x.2).collect();
            assert_eq!(select_even_candidates(rows.clone(), count), expected, "size={size}, count={count}");
        }
    }
}

#[test]
fn even_track_selection_skips_uncompetitive_hashes_without_changing_order() {
    for size in [0usize, 1, 2, 13, 100, 1000] {
        let tracks = (0..size).map(|i| TrackIndex {
            track_id: format!("track-{}", i % 73), ..Default::default()
        }).collect::<Vec<_>>();
        for distribution in 0..4 {
            let mut history = MusicHistory::default();
            let mut planned = HashMap::new();
            for (i, track) in tracks.iter().enumerate() {
                let used = if distribution == 0 { 0 } else { ((i * 17 + distribution) % 11) as u64 };
                history.tracks.insert(track.track_id.clone(), TrackUsage { times_used: used, ..Default::default() });
                planned.insert(track.track_id.clone(), ((i * 7 + distribution) % 3) as u64);
            }
            for count in [0, 1, 5, 10, size, size + 1] {
                let salt = format!("batch:{size}:{distribution}");
                let mut expected = tracks.iter().enumerate().map(|(i, track)| {
                    let used = history.tracks[&track.track_id].times_used + planned[&track.track_id];
                    (used, seed64(&format!("{salt}:{}", track.track_id)), i)
                }).collect::<Vec<_>>();
                expected.sort_by_key(|row| (row.0, row.1));
                let expected = expected.into_iter().take(count).map(|row| row.2).collect::<Vec<_>>();
                let mut calls = 0;
                let actual = select_even_tracks(&tracks, &history, &planned, count, |id| {
                    calls += 1;
                    seed64(&format!("{salt}:{id}"))
                });
                assert_eq!(actual, expected, "size={size}, distribution={distribution}, count={count}");
                if count == 0 { assert_eq!(calls, 0); }
                if size == 1000 && distribution > 0 && count == 10 {
                    assert!(calls < size / 2, "uncompetitive tracks should not be hashed: {calls}");
                }
            }
        }
    }
}

#[test]
fn image_collector_skips_seen_metadata_but_keeps_unseen_order() {
    let root = std::env::temp_dir().join(format!("vyron-unseen-images-{}", Uuid::new_v4()));
    fs::create_dir_all(root.join("nested")).unwrap();
    let paths = [root.join("first.jpg"), root.join("nested/second.png"), root.join("third.webp")];
    for path in &paths { fs::write(path, b"fixture").unwrap(); }
    fs::write(root.join("not-image.txt"), b"fixture").unwrap();
    fs::write(root.join(".hidden.jpg"), b"fixture").unwrap();
    let modified = |path: &PathBuf| match path.file_name().unwrap().to_str().unwrap() {
        "first.jpg" => UNIX_EPOCH + Duration::from_secs(3),
        "second.png" => UNIX_EPOCH + Duration::from_secs(1),
        "third.webp" => UNIX_EPOCH + Duration::from_secs(2),
        _ => unreachable!(),
    };
    let all = recursive_images_matching(&root, |_| true, modified).unwrap();
    assert_eq!(all.len(), 3);
    for seen in [HashSet::new(), HashSet::from([paths[0].to_string_lossy().into_owned()]),
        paths.iter().map(|p| p.to_string_lossy().into_owned()).collect()] {
        let expected = all.iter().filter(|p| !seen.contains(p.to_string_lossy().as_ref())).cloned().collect::<Vec<_>>();
        let mut metadata_calls = 0;
        let actual = recursive_images_matching(&root, |p| !seen.contains(p.to_string_lossy().as_ref()), |p| {
            metadata_calls += 1;
            modified(p)
        }).unwrap();
        assert_eq!(actual, expected);
        assert_eq!(metadata_calls, expected.len());
        // Pending/unseen files must remain eligible on subsequent scans.
        assert_eq!(recursive_unseen_images(&root, &seen).unwrap().len(), expected.len());
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn cached_music_name_sort_matches_original_comparator_and_stable_ties() {
    let paths = [
        "/m/Zeta.MP3", "/m/a/Трек.mp3", "/m/b/трек.MP3", "/m/a/Трек.mp3",
        "/m/Alpha.mp3", "/m/Beta.mp3", "/m/İ.mp3", "/m/i.mp3", "/", "",
    ];
    for size in [0usize, 1, 2, 13, 100, 1000] {
        let mut tracks = (0..size).map(|i| TrackIndex {
            track_id: format!("fixture-{i}"),
            path: paths[(i * 17 + size) % paths.len()].to_string(),
            ..Default::default()
        }).collect::<Vec<_>>();
        let mut expected = tracks.clone();
        expected.sort_by(|a, b| {
            let name = |t: &TrackIndex| Path::new(&t.path).file_name()
                .and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            name(a).cmp(&name(b)).then_with(|| a.path.cmp(&b.path))
        });
        sort_music_tracks_by_name(&mut tracks);
        assert_eq!(tracks.iter().map(|t| (&t.track_id, &t.path)).collect::<Vec<_>>(),
            expected.iter().map(|t| (&t.track_id, &t.path)).collect::<Vec<_>>(), "size={size}");
    }
}

#[test]
fn production_validation_worker_matches_sync_results_and_preserves_files() {
    let caller = std::thread::current().id();
    let worker = tauri::async_runtime::block_on(run_production_worker(|| Ok(std::thread::current().id()))).unwrap();
    assert_ne!(caller, worker);
    let root = std::env::temp_dir().join(format!("vyron-validation-worker-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let image = root.join("cover.jpg");
    let audio = root.join("audio.mp3");
    fs::write(&image, b"image-fixture").unwrap();
    fs::write(&audio, b"audio-fixture").unwrap();
    let manifest = BatchManifest {
        batch_id: "batch".into(), tracks_per_project: 1,
        projects: vec![
            ManifestProject { project_id: "good".into(), folder_path: root.to_string_lossy().into_owned(),
                image_path: image.to_string_lossy().into_owned(), sequence_fingerprint: "good".into(),
                tracks: vec![ManifestTrack { path: audio.to_string_lossy().into_owned(), ..Default::default() }],
                ..Default::default() },
            ManifestProject { project_id: "bad".into(), folder_path: root.join("missing").to_string_lossy().into_owned(),
                image_path: root.join("missing.jpg").to_string_lossy().into_owned(), sequence_fingerprint: "bad".into(),
                ..Default::default() },
        ], ..Default::default()
    };
    let path = root.join("batch.json");
    atomic_json(&path, &manifest).unwrap();
    let manifest_path = path.to_string_lossy().into_owned();
    let endlume = root.join("fixture-endlume").to_string_lossy().into_owned();
    let sync = validate_production_batch_sync(manifest_path.clone(), endlume.clone()).unwrap();
    let actual = tauri::async_runtime::block_on(validate_production_batch(manifest_path.clone(), endlume.clone())).unwrap();
    assert_eq!(serde_json::to_value(actual).unwrap(), serde_json::to_value(sync).unwrap());
    let selected = vec!["good".to_string()];
    let sync = validate_production_projects_sync(manifest_path.clone(), endlume.clone(), selected.clone()).unwrap();
    let actual = tauri::async_runtime::block_on(validate_production_projects(manifest_path.clone(), endlume.clone(), selected)).unwrap();
    assert_eq!(serde_json::to_value(actual).unwrap(), serde_json::to_value(sync).unwrap());
    let missing = vec!["absent".to_string()];
    let sync_err = validate_production_projects_sync(manifest_path.clone(), endlume.clone(), missing.clone()).unwrap_err();
    let async_err = tauri::async_runtime::block_on(validate_production_projects(manifest_path, endlume, missing)).unwrap_err();
    assert_eq!(async_err, sync_err);
    assert_eq!(fs::read(image).unwrap(), b"image-fixture");
    assert_eq!(fs::read(audio).unwrap(), b"audio-fixture");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn project_ready_file_check_accepts_only_nonempty_regular_files() {
    let root = std::env::temp_dir().join(format!("vyron-ready-file-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let file = root.join("image.jpg");
    assert!(!nonempty_regular_file(&file));
    fs::write(&file, b"").unwrap();
    assert!(!nonempty_regular_file(&file));
    fs::write(&file, b"fixture").unwrap();
    assert!(nonempty_regular_file(&file));
    assert!(!nonempty_regular_file(&root));
    #[cfg(unix)] {
        let link = root.join("image-link.jpg");
        std::os::unix::fs::symlink(&file, &link).unwrap();
        assert!(nonempty_regular_file(&link));
    }
    fs::remove_dir_all(root).unwrap();
}
