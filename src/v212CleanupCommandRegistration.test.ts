import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(decodeURIComponent(new URL(p,import.meta.url).pathname),'utf8');

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
    const end=rust.indexOf('pub fn delete_production_batch_projects');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block=rust.slice(start,end);
    expect(block).toContain('render_status != "Completed"');
    expect(block).toContain('validate_cleanup_candidate');
    expect(block).toContain('trash::delete(&candidate.folder)');
    expect(block).not.toContain('verified_jobs');
    expect(block).not.toContain('remove_dir_all');
  });
});
