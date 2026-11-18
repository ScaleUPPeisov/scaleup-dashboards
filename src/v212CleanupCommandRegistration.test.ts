import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const urlPath=(u:URL)=>{let p=decodeURIComponent(u.pathname);if(/^\/[A-Za-z]:\//.test(p))p=p.slice(1);return p};
const read=(p:string)=>readFileSync(urlPath(new URL(p,import.meta.url)),'utf8');

describe('VYRON 2.0.12 cleanup command registration hotfix',()=>{
  it('keeps UI invoke, Rust command and Tauri registration connected',()=>{
    const api=read('./productionManagerApi.ts');
    const rust=read('../src-tauri/src/production_manager.rs');
    const lib=read('../src-tauri/src/lib.rs');
    expect(api).toContain("invoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath})");
    expect(rust).toContain('pub fn cleanup_completed_production_assets');
    const start=lib.indexOf('tauri::generate_handler![');
    const end=lib.indexOf('])',start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const handler=lib.slice(start,end);
    expect(handler).toContain('production_manager::cleanup_completed_production_assets');
    expect((handler.match(/production_manager::cleanup_completed_production_assets/g)||[]).length).toBe(1);
  });
  it('cleanup still preserves rendered MP4 contract',()=>{
    const rust=read('../src-tauri/src/production_manager.rs');
    const start=rust.indexOf('fn cleanup_completed_assets');
    const end=rust.indexOf('pub async fn delete_production_batch_projects')>=0
      ?rust.indexOf('pub async fn delete_production_batch_projects')
      :rust.indexOf('pub fn delete_production_batch_projects');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block=rust.slice(start,end);
    expect(block).toContain('render_status != "Completed"');
    expect(block).toContain('validate_cleanup_candidate');
    expect(block).toContain('trash::delete(&candidate.folder)');
    expect(block).not.toContain('verified_jobs');
    expect(block).not.toContain('remove_dir_all');
  });
  it('manual and batch Trash operate off Tauri main handler without relaxing path validation',()=>{
    const local=read('../src-tauri/src/local_delete.rs');
    const production=read('../src-tauri/src/production_manager.rs');
    expect(local).toContain('pub async fn trash_local_file(');
    expect(local).toContain('spawn_blocking(move || trash_local_file_impl(&path, &allowed_roots))');
    expect(local).toContain('validate_trash_path(&p, allowed_roots)?');
    expect(production).toContain('pub async fn delete_production_batch_projects(');
    expect(production).toContain('delete_production_batch_projects_inner(manifest_path, project_ids)');
    expect(production).toContain('pub async fn delete_production_job_folder(');
    expect(production).toContain('delete_production_job_folder_impl(workspace, folder, job_id)');
    expect(production).toContain('canonical_under(&root, &p)?');
    expect(production).toContain('canonical_under(&root, &dir)?');
  });
});
