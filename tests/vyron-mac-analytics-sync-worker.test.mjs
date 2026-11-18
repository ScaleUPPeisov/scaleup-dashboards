import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

// Structural gate for the macOS-only sync path. Rust compilation and runtime
// storage tests run separately in macOS ARM64 Actions.
const source=readFileSync(new URL('../src-tauri/src/analytics_ai_export.rs',import.meta.url),'utf8');
const start=source.indexOf('pub async fn youtube_ai_sync(');
const sync=source.slice(start);
describe('VYRON Analytics 360 on-demand sync responsiveness',()=>{
 it('persists on blocking worker without cloning full-channel observations',()=>{
  expect(start).toBeGreaterThanOrEqual(0);
  expect(sync).toContain('spawn_blocking(move||{');
  expect(sync).toContain('analytics360_cache::persist(&saving_folder,&r.summary,&r.coverage,');
  expect(sync).not.toMatch(/\br\.clone\(\)/);
  expect(sync).toContain('ANALYTICS_SYNC_STORAGE_WORKER_FAILED');
  expect(sync).toContain('Ok(Err(e))');
  expect(sync).toContain('Ok(Ok(()))');
 });
});
