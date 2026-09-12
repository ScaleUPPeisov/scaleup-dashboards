#!/usr/bin/env python3
from pathlib import Path
import re, sys

root = Path(sys.argv[1])
local_delete = root / 'src-tauri/src/local_delete.rs'
pm = root / 'src-tauri/src/production_manager.rs'
pm_tests = root / 'src-tauri/src/production_manager_tests.rs'

# Fix only the known missing semicolon in the local_delete test cleanup.
s = local_delete.read_text()
old = 'let _=fs::remove_dir_all(root)}'
new = 'let _=fs::remove_dir_all(root);}'
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('local_delete semicolon target not found')
local_delete.write_text(s)

# Keep the Tauri AppHandle command as the security boundary. Move its already-safe
# business logic into an internal helper so unit tests can provide verified proof
# without constructing a Tauri runtime/AppHandle.
s = pm.read_text()
start = s.find('#[tauri::command]\npub fn delete_production_batch_projects(')
end = s.find('\n\n#[tauri::command]\npub fn open_production_batch_in_endlume', start)
if start < 0 or end < 0:
    raise SystemExit('delete_production_batch_projects block not found')
block = s[start:end]
if 'verified_uploaded_job_ids(&app)' not in block or 'trash::delete(&safe)' not in block:
    raise SystemExit('safe delete contract changed unexpectedly')
replacement = r'''fn delete_production_batch_projects_inner(verified:&HashSet<String>,manifest_path:String,project_ids:Vec<String>)->Result<DeleteResult,String>{
    let(mut m,mp)=load_manifest(&manifest_path)?;let wanted=project_ids.into_iter().collect::<HashSet<_>>();if wanted.is_empty(){return Ok(DeleteResult{deleted_project_ids:Vec::new(),deleted_job_ids:Vec::new(),batch:Some(summary_from(&m,&read_json(Path::new(&m.status_path))))})}
    let selected=m.projects.iter().filter(|p|wanted.contains(&p.project_id)).cloned().collect::<Vec<_>>();if selected.is_empty(){return Err("Выбранные проекты не найдены в batch".into())}
    let status_now:BatchStatus=read_json(Path::new(&m.status_path));for p in &selected{let Some(job)=p.job_id.as_deref()else{return Err(format!("BLOCK: {} не имеет job mapping",p.project_id))};if !verified.contains(job){return Err(format!("BLOCK: {} не имеет verified YouTube upload proof",p.project_id))}let row=status_now.projects.iter().find(|x|x.project_id==p.project_id).ok_or_else(||format!("BLOCK: status {} не найден",p.project_id))?;if row.render_status!="Completed"{return Err(format!("BLOCK: {} не SAFE_TO_CLEAN",p.project_id))}let Some(output)=row.output_file.as_deref().filter(|x|!x.trim().is_empty())else{return Err(format!("BLOCK: {} не SAFE_TO_CLEAN",p.project_id))};let output_path=PathBuf::from(output);if !output_path.is_file()||fs::metadata(&output_path).map(|x|x.len()==0).unwrap_or(true){return Err(format!("BLOCK: {} render отсутствует",p.project_id))}let rendered=PathBuf::from(&m.root_path).join("Rendered").canonicalize().map_err(|_|format!("BLOCK: {} Rendered недоступен",p.project_id))?;let output_canon=output_path.canonicalize().map_err(|_|format!("BLOCK: {} render недоступен",p.project_id))?;if !output_canon.starts_with(&rendered){return Err(format!("BLOCK: {} render вне Rendered",p.project_id))}}
    let deleted_project_ids=selected.iter().map(|p|p.project_id.clone()).collect::<Vec<_>>();let deleted_job_ids=selected.iter().filter_map(|p|p.job_id.clone()).collect::<Vec<_>>();for p in &selected{let dir=PathBuf::from(&p.folder_path);if dir.exists(){let root=safe_cleanup_root(Path::new(&m.root_path))?;let safe=canonical_under(&root,&dir)?;trash::delete(&safe).map_err(|e|format!("Не удалось переместить проект {} в Корзину: {e}",p.project_id))?}}
    m.projects.retain(|p|!wanted.contains(&p.project_id));m.project_count=m.projects.len();
    let status_path=PathBuf::from(&m.status_path);let mut st:BatchStatus=read_json(&status_path);st.projects.retain(|p|!wanted.contains(&p.project_id));st.status=if st.projects.is_empty(){"Удалён".into()}else{"Готово".into()};st.updated_at=Utc::now().to_rfc3339();
    let broot=PathBuf::from(&m.root_path);let plan_path=broot.join("plan.json");if plan_path.exists(){let mut plan:BuildPlan=read_json(&plan_path);plan.projects.retain(|p|!wanted.contains(&p.project_id));plan.request.project_count=plan.projects.len();atomic_json(&plan_path,&plan)?;let cp_path=broot.join("checkpoint.json");let mut cp:Checkpoint=read_json(&cp_path);cp.total_projects=plan.projects.len();cp.completed_projects=cp.completed_projects.min(cp.total_projects);cp.updated_at=Utc::now().to_rfc3339();atomic_json(&cp_path,&cp)?;}
    if m.projects.is_empty(){atomic_json(&mp,&m)?;atomic_json(&status_path,&st)?;return Ok(DeleteResult{deleted_project_ids,deleted_job_ids,batch:Some(summary_from(&m,&st))})}
    atomic_json(&mp,&m)?;atomic_json(&status_path,&st)?;let summary=summary_from(&m,&st);Ok(DeleteResult{deleted_project_ids,deleted_job_ids,batch:Some(summary)})
}

#[tauri::command]
pub fn delete_production_batch_projects(app:AppHandle,manifest_path:String,project_ids:Vec<String>)->Result<DeleteResult,String>{
    let verified=verified_uploaded_job_ids(&app);
    delete_production_batch_projects_inner(&verified,manifest_path,project_ids)
}'''
s = s[:start] + replacement + s[end:]
pm.write_text(s)

# Adapt the stale acceptance test to the new safe contract. It creates real
# non-empty Rendered files, proves an unverified project is blocked, then uses
# verified job ids and verifies only project folders are moved away while renders survive.
s = pm_tests.read_text()
pat = re.compile(r'#\[test\]\nfn acceptance_delete_selected_and_delete_all_batch_projects\(\)\{.*?\}\n\n', re.S)
m = pat.search(s)
if not m:
    raise SystemExit('stale production_manager delete test not found')
test = r'''#[test]
fn acceptance_delete_selected_and_delete_all_batch_projects(){
    let(ws,cid,name)=fixture(10,50);
    let plan=plan_build(&request(&ws,&cid,&name,10,10,"even",false)).unwrap();
    let summary=execute_plan(None,&plan).unwrap();
    let(m,_)=load_manifest(&summary.manifest_path).unwrap();
    let status_path=PathBuf::from(&m.status_path);
    let mut st:BatchStatus=read_json(&status_path);
    fs::create_dir_all(&m.output_dir).unwrap();
    for row in &mut st.projects{
        let output=PathBuf::from(&m.output_dir).join(format!("{}.mp4",row.project_id));
        fs::write(&output,b"verified render").unwrap();
        row.render_status="Completed".into();
        row.output_file=Some(output.to_string_lossy().into_owned());
    }
    atomic_json(&status_path,&st).unwrap();
    let verified=m.projects.iter().filter_map(|p|p.job_id.clone()).collect::<HashSet<_>>();

    let blocked=delete_production_batch_projects_inner(&HashSet::new(),summary.manifest_path.clone(),vec!["001".into()]).unwrap_err();
    assert!(blocked.contains("verified YouTube upload proof"));
    assert!(Path::new(&m.projects[0].folder_path).exists());

    let r=delete_production_batch_projects_inner(&verified,summary.manifest_path.clone(),vec!["001".into(),"002".into(),"003".into()]).unwrap();
    assert_eq!(r.deleted_project_ids.len(),3);
    let b=r.batch.unwrap();
    assert_eq!(b.project_count,7);
    let(m2,_)=load_manifest(&b.manifest_path).unwrap();
    assert_eq!(m2.projects.len(),7);
    let ids=m2.projects.iter().map(|p|p.project_id.clone()).collect::<Vec<_>>();
    let r2=delete_production_batch_projects_inner(&verified,b.manifest_path.clone(),ids).unwrap();
    let final_batch=r2.batch.unwrap();
    assert_eq!(final_batch.project_count,0);
    let(final_manifest,_)=load_manifest(&final_batch.manifest_path).unwrap();
    assert!(final_manifest.projects.is_empty());
    assert!(Path::new(&m.output_dir).is_dir());
    for row in st.projects{let output=row.output_file.unwrap();assert!(Path::new(&output).exists());}
    cleanup(&ws);
}

'''
s = s[:m.start()] + test + s[m.end():]
pm_tests.write_text(s)

# Fail closed if any required production safety edge was lost during the refactor.
pm_text=pm.read_text()
assert 'pub fn delete_production_batch_projects(app:AppHandle' in pm_text
assert 'let verified=verified_uploaded_job_ids(&app);' in pm_text
assert 'delete_production_batch_projects_inner(&verified' in pm_text
assert 'if !verified.contains(job)' in pm_text
assert 'youtubeVideoId' in pm_text
assert 'render_status!="Completed"' in pm_text
assert 'output_path.is_file()' in pm_text
assert 'trash::delete(&safe)' in pm_text
print('storage rust blockers fixed without weakening verified-upload/render/Trash safety')
