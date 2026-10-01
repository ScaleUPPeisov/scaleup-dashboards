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
    let v = validate_production_batch(summary.manifest_path, fake.to_string_lossy().into_owned())
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
        fs::write(&output, b"verified render").unwrap();
        row.render_status = "Completed".into();
        row.output_file = Some(output.to_string_lossy().into_owned());
    }
    atomic_json(&status_path, &st).unwrap();
    let verified = m
        .projects
        .iter()
        .filter_map(|p| p.job_id.clone())
        .collect::<HashSet<_>>();

    let blocked = delete_production_batch_projects_inner(
        &HashSet::new(),
        summary.manifest_path.clone(),
        vec!["001".into()],
    )
    .unwrap_err();
    assert!(blocked.contains("verified YouTube upload proof"));
    assert!(Path::new(&m.projects[0].folder_path).exists());

    let r = delete_production_batch_projects_inner(
        &verified,
        summary.manifest_path.clone(),
        vec!["001".into(), "002".into(), "003".into()],
    )
    .unwrap();
    assert_eq!(r.deleted_project_ids.len(), 3);
    let b = r.batch.unwrap();
    assert_eq!(b.project_count, 7);
    let (m2, _) = load_manifest(&b.manifest_path).unwrap();
    assert_eq!(m2.projects.len(), 7);
    let ids = m2
        .projects
        .iter()
        .map(|p| p.project_id.clone())
        .collect::<Vec<_>>();
    let r2 =
        delete_production_batch_projects_inner(&verified, b.manifest_path.clone(), ids).unwrap();
    let final_batch = r2.batch.unwrap();
    assert_eq!(final_batch.project_count, 0);
    let (final_manifest, _) = load_manifest(&final_batch.manifest_path).unwrap();
    assert!(final_manifest.projects.is_empty());
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
    let mut startup = HashSet::new();
    startup.insert(existing.clone());
    let seen = collector_seen_at_start(&session, &startup);
    assert!(
        !seen.contains(&existing),
        "startup Downloads snapshot must not suppress pre-existing images"
    );
    cleanup(&ws);
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
    let rows = find_production_recovery(vec![ws.to_string_lossy().into_owned()]).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].completed_projects, 1);
    assert_eq!(rows[0].current_project, "002");
    let done = execute_plan(None, &plan).unwrap();
    assert_eq!(done.project_count, 6);
    assert!(!partial.exists());
    assert!(project_ready(first, &d));
    assert!(
        find_production_recovery(vec![ws.to_string_lossy().into_owned()])
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
    let rows = find_production_recovery(vec![missing.to_string_lossy().into_owned()]).unwrap();
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
    let eligible = preview_completed_production_projects(summary.manifest_path).unwrap();
    assert!(eligible.is_empty());
    cleanup(&ws);
}
