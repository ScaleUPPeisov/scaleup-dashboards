import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const materials=readFileSync(new URL('../src/MaterialsManager.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/productionManagerApi.ts',import.meta.url),'utf8');
const rustMaterials=readFileSync(new URL('../src-tauri/src/materials_manager.rs',import.meta.url),'utf8');
const rustProduction=readFileSync(new URL('../src-tauri/src/production_manager.rs',import.meta.url),'utf8');
const tauri=readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8');

describe('VYRON 6.0.2 Materials freeze regression gates',()=>{
  it('does not run global cleanup from Materials mount path',()=>{
    expect(materials).toContain('async function previewCleanup()');
    expect(materials.match(/previewGlobalProjectCleanup\(/g)?.length).toBe(1);
    expect(materials).not.toContain("useEffect(()=>{void refresh()},[workspace,channels.map(x=>x.id).join('|'),jobs.length");
  });

  it('does not use N x serial materialsSummary IPC',()=>{
    expect(materials).toContain('productionManagerApi.materialsSummaries(workspace,channelIds)');
    expect(api).toContain("'production_materials_summaries'");
    expect(materials).not.toMatch(/for\s*\([^)]*channels[^)]*\)[\s\S]{0,220}?await\s+productionManagerApi\.materialsSummary/);
  });

  it('paints shell before starting Materials filesystem IPC',()=>{
    expect(materials).toContain('requestAnimationFrame(()=>{second=requestAnimationFrame');
    expect(materials).toContain('Данные читаются в фоне');
  });

  it('keeps heavy filesystem work off the UI-sensitive command path',()=>{
    expect(rustMaterials).toContain('pub async fn production_materials_summaries');
    expect(rustMaterials).toContain('tokio::task::spawn_blocking');
    expect(rustProduction).toContain('pub async fn preview_global_production_project_cleanup');
    expect(rustProduction).toContain('pub async fn execute_global_production_project_cleanup');
  });

  it('keeps jobs changes local to React counters instead of filesystem invalidation',()=>{
    expect(materials).toContain('jobCountersByChannel');
    expect(materials).toContain('},[jobs]);');
    expect(materials).not.toContain('jobs.length,cleanupRoots.join');
  });

  it('does not introduce Google, OAuth or YouTube calls into Materials UI',()=>{
    expect(materials).not.toMatch(/oauth|client_secret|refresh_token|youtube_/i);
  });

  it('preserves application identity and updater endpoints',()=>{
    expect(tauri).toContain('"identifier": "studio.channelflow.desktop"');
    expect(tauri).toContain('ScaleUPPeisov/vyron-releases/main/updates/latest.json');
    expect(tauri).toContain('ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json');
  });
});
