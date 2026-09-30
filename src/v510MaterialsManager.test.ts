import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const materialsRust=fs.readFileSync('src-tauri/src/materials_manager.rs','utf8');
const materialsRuntime=materialsRust.split('#[cfg(test)]')[0];
const productionRust=fs.readFileSync('src-tauri/src/production_manager.rs','utf8');
const materialsUi=fs.readFileSync('src/MaterialsManager.tsx','utf8');
const managerUi=fs.readFileSync('src/ProductionManager.tsx','utf8');
const api=fs.readFileSync('src/productionManagerApi.ts','utf8');
const lib=fs.readFileSync('src-tauri/src/lib.rs','utf8');
const tauri=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

describe('VYRON 6.0.0 Materials Manager contract',()=>{
  it('uses one 6.0.0 application identity without changing updater endpoints',()=>{
    expect(pkg.version).toBe('6.0.0');
    expect(tauri.version).toBe('6.0.0');
    expect(tauri.identifier).toBe('studio.channelflow.desktop');
    expect(tauri.plugins.updater.endpoints).toEqual([
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json',
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json'
    ]);
  });

  it('keeps Materials Manager local-only and out of YouTube/OAuth codepaths',()=>{
    expect(materialsRust).not.toContain('youtube_');
    expect(materialsRust).not.toContain('oauth');
    expect(materialsRust).not.toContain('reqwest');
    expect(materialsUi).not.toContain('youtubeChannelStats');
    expect(materialsUi).not.toContain('youtubeVideoProcessingStatus');
    expect(materialsUi).not.toContain('youtubeListExisting');
    expect(api).toContain("production_materials_summary");
    expect(lib).toContain('materials_manager::import_production_material_images');
  });

  it('binds image assets to channelId and deduplicates by SHA-256',()=>{
    expect(materialsRust).toContain('pub channel_id: String');
    expect(materialsRust).toContain('pub sha256: String');
    expect(materialsRust).toContain('hash_file(&src)');
    expect(materialsRust).toContain('x.channel_id == channel_id && x.sha256 == sha');
    expect(materialsRust).toContain('BLOCK: imageAsset.channelId != project.channelId');
    expect(materialsRust).toContain('same_bytes_are_isolated_between_channels');
    expect(materialsRust).toContain('duplicate_import_is_idempotent_per_channel');
  });

  it('uses AVAILABLE -> ASSIGNED -> USED and creates only project copies',()=>{
    expect(materialsRust).toContain('x.status == "AVAILABLE"');
    expect(materialsRust).toContain('asset.status = "ASSIGNED"');
    expect(materialsRust).toContain('asset.status = "USED"');
    expect(productionRust).toContain('image_asset_id');
    expect(productionRust).toContain('image_name: format!("cover.{}"');
    expect(productionRust).toContain('materials_manager::mark_assigned');
    expect(productionRust).toContain('materials_manager::mark_rendered_used');
  });

  it('keeps the source Music Library read-only for project cleanup',()=>{
    expect(productionRust).toContain('original_path: t.source.clone()');
    expect(productionRust).toContain('copy_and_sync(Path::new(&t.source)');
    expect(productionRust).not.toContain('remove_file(&t.source)');
    expect(productionRust).not.toContain('trash::delete(Path::new(&t.source)');
  });

  it('requires Completed render, valid media and exact project mapping before cleanup',()=>{
    expect(productionRust).toContain('row.project_id != project.project_id');
    expect(productionRust).toContain('row.job_id != project.job_id');
    expect(productionRust).toContain('row.video_number != project.video_number');
    expect(productionRust).toContain('row.render_status != "Completed"');
    expect(productionRust).toContain('validate_render_media(&output_can, true)');
    expect(productionRust).toContain('output_can.starts_with(&folder_can)');
  });

  it('exposes prompt, never, 3-day and after-upload cleanup policies without YouTube API calls',()=>{
    for(const value of ['prompt','never','auto3d','afterUpload'])expect(materialsUi).toContain('value="'+value+'"');
    expect(productionRust).toContain('apply_production_cleanup_policy');
    expect(productionRust).toContain('3 * 24 * 60 * 60');
    expect(managerUi).toContain('uploadedJobIds');
    expect(managerUi).not.toContain('youtubeVideoProcessingStatus');
    expect(managerUi).not.toContain('youtubeListExisting');
  });

  it('preserves legacy imports as fallback without migrating or deleting existing projects',()=>{
    expect(productionRust).toContain('Legacy Import Session keeps its old allowImageReuse behavior');
    expect(productionRust).toContain('if use_material_library');
    expect(productionRust).not.toContain('remove_dir_all(&session.import_path');
    expect(materialsRuntime).not.toContain('remove_dir_all');
  });
});
