import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manager=read('src/ProductionManager.tsx');
const backend=read('src-tauri/src/production_manager.rs');
const api=read('src/productionManagerApi.ts');
const productionOS=read('src/ProductionOS.tsx');
const tauri=read('src-tauri/tauri.conf.json');

describe('VYRON 6.0.3 critical Production hotfix',()=>{
  it('does not mask collector images behind historical Materials total',()=>{
    expect(manager).not.toContain('images&&images.total>0?images.available');
    expect(manager).toContain('const collected=resolvedImagesAvailable');
    expect(manager).toContain('setCollectorCollected(p.collected)');
    expect(manager).not.toContain('onImportProgress(p=>{if(live&&p.channelId===channelId)void refreshState()');
  });

  it('uses one SHA-deduplicated resolved image inventory in state, preflight and plan',()=>{
    expect(backend).toContain('fn resolve_production_images(workspace: &str, channel_id: &str)');
    expect(backend).toContain('let mut seen = HashSet::<String>::new()');
    expect(backend).toContain('let available = resolve_production_images(&request.workspace, &request.channel_id)?.len()');
    expect(backend).toContain('let resolved_images = resolve_production_images(&req.workspace, &req.channel_id)?');
    expect(backend).not.toContain('let use_material_library = material_summary.total > 0');
    expect(api).toContain('resolvedImagesAvailable:number');
  });

  it('keeps direct selected-channel import connected to immediate refresh',()=>{
    expect(productionOS).toContain('importMaterialImages(workspace,c.id,c.name,files)');
    expect(productionOS).toContain("vyron:production-materials-changed");
    expect(manager).toContain("window.addEventListener('vyron:production-materials-changed'");
  });

  it('waits for collector final flush and reports explicit final result',()=>{
    expect(backend).toContain('let mut final_flush_cycles = 0u8');
    expect(backend).toContain('for _ in 0..160');
    expect(manager).toContain('Сбор изображений завершён');
    expect(manager).toContain('● СБОР АКТИВЕН');
  });

  it('manual delete does not require YouTube upload proof while automatic cleanup remains gated',()=>{
    const manualStart=backend.indexOf('fn delete_production_batch_projects_inner');
    const manualEnd=backend.indexOf('fn endlume_inbox_dir',manualStart);
    const manual=backend.slice(manualStart,manualEnd);
    expect(manual).not.toContain('verified_uploaded_job_ids');
    expect(manual).not.toContain('if !verified.contains');
    expect(manual).toContain('trash::delete(&safe)');
    expect(manual).toContain('canonical_under(&root, &dir)');
    expect(backend).toContain('fn evaluate_cleanup_candidate');
    expect(backend).toContain('CLEANUP_OUTPUT_MISSING');
    expect(backend).toContain('CLEANUP_OUTPUT_INVALID');
  });

  it('requires two UI confirmations for destructive project delete',()=>{
    expect(manager).toContain("Удалить выбранные проекты?");
    expect(manager).toContain('Проекты будут перемещены в Корзину. Render / Music Library / Image Library не будут удалены.');
  });

  it('does not reuse already-folder-bound old jobs for a new batch',()=>{
    expect(manager).toContain("j.channelId===channel.id&&!j.folder&&j.status==='NEED_IMAGE'");
  });

  it('preserves identity and updater endpoints',()=>{
    expect(tauri).toContain('"identifier": "studio.channelflow.desktop"');
    expect(tauri).toContain('ScaleUPPeisov/vyron-releases/main/updates/latest.json');
    expect(tauri).toContain('ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json');
  });
});
