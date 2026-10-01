import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const materials=fs.readFileSync('src/MaterialsManager.tsx','utf8');
const manager=fs.readFileSync('src/ProductionManager.tsx','utf8');
const api=fs.readFileSync('src/productionManagerApi.ts','utf8');
const rust=fs.readFileSync('src-tauri/src/production_manager.rs','utf8');
const recovery=fs.readFileSync('src-tauri/src/recovery.rs','utf8');
const css=fs.readFileSync('src/production-manager.css','utf8');

describe('VYRON 6.0.0 macOS production/manual isolated hotfix',()=>{
  it('accepts missing selectedProjectIds in manual recovery context by schema default',()=>{
    expect(materials).toContain("recoveryUiContext:{page:'production',channelId:manualChannel.id,productionTab:'manager'}");
    expect(recovery).toMatch(/#\[serde\(default\)\]\s+pub selected_project_ids:Vec<String>/);
    expect(api).toContain("manualBuild:(request:ManualBuildRequest)");
  });

  it('dedupes SAFE_TO_CLEAN notification by stable render identity',()=>{
    expect(manager).toContain("readNotificationHistory().some(x=>x.operationId===operationId)");
    expect(manager).toContain("row.outputFile||''");
    expect(manager).toContain("row.fileSize||0");
    expect(manager).toContain("row.duration||0");
    expect(manager).toContain("if(!alreadyNotified)notifyInfo('РЕНДЕР ГОТОВ'");
  });

  it('keeps strict automatic cleanup while allowing explicit owner local deletion',()=>{
    expect(rust).toContain('confirmed_owner_delete: bool');
    expect(rust).toContain('if confirmed_owner_delete');
    expect(rust).toContain('verified YouTube upload proof');
    expect(rust).toContain('BLOCK_ACTIVE_RENDER');
    expect(api).toContain("confirmedOwnerDelete=false");
    expect(manager).toContain("deleteBatchProjects(batch.manifestPath,pending.ids,true)");
    expect(manager).toContain('УДАЛИТЬ ЛОКАЛЬНО');
    expect(manager).toContain('Без подтверждения публикации YouTube');
  });

  it('does not allow explicit delete of an active ENDLUME render',()=>{
    expect(manager).toContain("['rendering','processing','active']");
    expect(manager).toContain('Проект сейчас используется ENDLUME');
    expect(rust).toContain('status.contains("rendering")');
    expect(rust).toContain('status.contains("processing")');
  });

  it('keeps source material libraries outside owner project deletion',()=>{
    const block=rust.slice(rust.indexOf('fn delete_production_batch_projects_inner'),rust.indexOf('fn endlume_inbox_dir'));
    expect(block).toContain('trash::delete(&safe)');
    expect(block).not.toContain('materials_manager');
    expect(block).not.toContain('music_library');
    expect(block).not.toContain('image_library');
  });

  it('replaces vertical CLEAN action with horizontal local-delete action',()=>{
    expect(manager).not.toContain("?'…':'ОЧИСТИТЬ'");
    expect(manager).toContain("'Удалить локально'");
    expect(css).toContain('grid-template-columns:24px 70px 120px minmax(140px,1fr) auto');
    expect(css).toContain('.pmProjectDelete{white-space:nowrap!important;min-width:118px');
  });

  it('does not touch OAuth migration or Windows codepaths',()=>{
    for(const src of [manager,api,recovery]){
      expect(src).not.toContain('TAURI_SIGNING_PRIVATE_KEY');
      expect(src).not.toContain('windows-latest');
    }
  });
});
