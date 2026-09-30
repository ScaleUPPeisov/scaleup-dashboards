import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const ui=fs.readFileSync('src/MaterialsManager.tsx','utf8');
const api=fs.readFileSync('src/productionManagerApi.ts','utf8');
const rust=fs.readFileSync('src-tauri/src/production_manager.rs','utf8');
const lib=fs.readFileSync('src-tauri/src/lib.rs','utf8');
const css=fs.readFileSync('src/production-manager.css','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const tauri=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));

describe('VYRON 5.1.2 manual assembly additive contract',()=>{
  it('keeps 5.1.2 identity and existing updater endpoints',()=>{
    expect(pkg.version).toBe('5.1.2');
    expect(tauri.version).toBe('5.1.2');
    expect(tauri.identifier).toBe('studio.channelflow.desktop');
    expect(tauri.plugins.updater.endpoints).toEqual([
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json',
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json'
    ]);
  });

  it('adds manual assembly without removing the current Materials controls',()=>{
    expect(ui).toContain('+ РУЧНАЯ СБОРКА');
    expect(ui).toContain('+ ИЗОБРАЖЕНИЯ');
    expect(ui).toContain("row?.musicLibraryPath?'МУЗЫКА':'+ МУЗЫКА'");
    expect(ui).toContain('ПАПКА');
    expect(ui).toContain('РУЧНАЯ СБОРКА ПРОЕКТОВ');
    expect(css).toContain('.manualAssemblyModal');
  });

  it('keeps channel selection explicit and resets picked media when channel changes',()=>{
    expect(ui).toContain('changeManualChannel');
    expect(ui).toContain('setManualImages([])');
    expect(ui).toContain('setManualMusic([])');
    expect(ui).toContain('channelId:manualChannel.id');
    expect(ui).toContain('channelId:j.channelId');
    expect(rust).toContain('BLOCK: project.channelId != selectedChannelId');
    expect(rust).toContain('x.channel_id != req.channel_id');
  });

  it('uses direct file pickers and does not import manual selections into Materials libraries',()=>{
    expect(api).toContain('chooseManualMusicFiles');
    expect(api).toContain('chooseManualMusicFolder');
    expect(api).toContain('scan_manual_production_music');
    expect(api).toContain('build_manual_production_batch');
    expect(ui).toContain('chooseMaterialImages');
    expect(ui).not.toContain('importMaterialImages(workspace,manualChannel');
    const manualSection=rust.slice(rust.indexOf('pub async fn build_manual_production_batch'),rust.indexOf('pub async fn resume_production_batch'));
    expect(manualSection).not.toContain('materials_manager::mark_assigned');
    expect(manualSection).not.toContain('youtube_');
    expect(manualSection).not.toContain('oauth');
  });

  it('creates VIDEO_XXX projects with cover, tracks folder and project manifest',()=>{
    expect(rust).toContain('project_id: format!("VIDEO_{:03}", link.number)');
    expect(rust).toContain('image_name: format!("cover.{}"');
    expect(rust).toContain('dest_name: format!("tracks/{:02}.{}"');
    expect(rust).toContain('final_dir.join("manifest.json")');
    expect(rust).toContain('"VYRON Manual Assembly"');
  });

  it('reuses the existing batch, ENDLUME and SAFE_TO_CLEAN pipeline',()=>{
    expect(rust).toContain('register_plan_recovery(&app2, &mut plan)');
    expect(rust).toContain('execute_plan(Some(&app2), &plan)');
    expect(rust).toContain('open_production_batch_in_endlume');
    expect(rust).toContain('preview_completed_production_projects');
    expect(rust).toContain('cleanup_completed_production_projects');
    expect(lib).toContain('production_manager::build_manual_production_batch');
    expect(lib).toContain('production_manager::open_production_batch_in_endlume');
  });

  it('never deletes source images or source music in manual assembly',()=>{
    expect(rust).toContain('copy_and_sync(Path::new(&p.image_source)');
    expect(rust).toContain('copy_and_sync(Path::new(&t.source)');
    const planning=rust.slice(rust.indexOf('fn plan_manual_build'),rust.indexOf('fn plan_build'));
    expect(planning).not.toContain('remove_file');
    expect(planning).not.toContain('remove_dir_all');
    expect(planning).not.toContain('trash::delete');
  });
});
