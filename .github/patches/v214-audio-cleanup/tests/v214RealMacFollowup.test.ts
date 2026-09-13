import fs from 'node:fs';import {describe,expect,it} from 'vitest';
const shorts=fs.readFileSync('src-tauri/src/shorts_factory.rs','utf8');
const shortsUi=fs.readFileSync('src/ShortsFactory.tsx','utf8');
const prod=fs.readFileSync('src-tauri/src/production_manager.rs','utf8');
const prodUi=fs.readFileSync('src/ProductionOS.tsx','utf8');
describe('VYRON 2.1.4 real-Mac follow-up contracts',()=>{
 it('Shorts selects an audible/default stream instead of hardcoding 0:a:0',()=>{expect(shorts).toContain('select_audible_audio_stream');expect(shorts).toContain('is_default');expect(shorts).toContain('volumedetect');expect(shorts).not.toContain('"0:a:0"')});
 it('Shorts normalizes audio/video timestamps and validates audible signal',()=>{expect(shorts).toContain('asetpts=PTS-STARTPTS');expect(shorts).toContain('setpts=PTS-STARTPTS');expect(shorts).toContain('AUDIBLE_MAX_DB_FLOOR');expect(shorts).toContain('SOURCE_AUDIO_SILENT')});
 it('render command is moved off the async command thread via spawn_blocking',()=>{expect(shorts).toContain('pub async fn shorts_render_segment');expect(shorts).toContain('spawn_blocking')});
 it('folder scan does not auto-select all and huge batches require confirmation',()=>{expect(shortsUi).toContain('setSelectedPaths([])');expect(shortsUi).toContain('total>=100');expect(shortsUi).toContain('window.confirm')});
 it('cleanup eligibility is render-based and upload-independent',()=>{const a=prod.indexOf('fn validate_cleanup_candidate');const b=prod.indexOf('pub fn archive_production_rendered_videos',a);const x=prod.slice(a,b);expect(x).toContain('render_status != "Completed"');expect(x).toContain('validate_render_media');expect(x).toContain('CLEANUP_OUTPUT_INSIDE_PROJECT');expect(x).not.toContain('verified_jobs');expect(x).not.toContain('NOT_UPLOADED')});
 it('cleanup preserves job/lifecycle state and global preview exposes structured skip reasons',()=>{expect(prodUi).not.toContain('r.deletedJobIds.length)setJobs');expect(prod).toContain('skip_reasons: HashMap<String, usize>');expect(prodUi).toContain('skipReasons?.NOT_COMPLETED');expect(prodUi).toContain('skipReasons?.OUTPUT_INVALID');const a=prod.indexOf('fn collect_global_cleanup');const b=prod.indexOf('pub fn preview_global_production_project_cleanup',a);expect(prod.slice(a,b)).not.toContain('join("Rendered")')});
});
