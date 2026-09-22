import fs from 'node:fs';import {describe,expect,it} from 'vitest';
const prod=fs.readFileSync('src-tauri/src/production_manager.rs','utf8');
const prodUi=fs.readFileSync('src/ProductionOS.tsx','utf8');
describe('VYRON real-Mac production cleanup follow-up contracts',()=>{
 it('cleanup eligibility is render-based and upload-independent',()=>{const a=prod.indexOf('fn validate_cleanup_candidate');const b=prod.indexOf('pub fn archive_production_rendered_videos',a);const x=prod.slice(a,b);expect(x).toContain('render_status != "Completed"');expect(x).toContain('validate_render_media');expect(x).toContain('CLEANUP_OUTPUT_INSIDE_PROJECT');expect(x).not.toContain('verified_jobs');expect(x).not.toContain('NOT_UPLOADED')});
 it('cleanup preserves job/lifecycle state and global preview exposes structured skip reasons',()=>{expect(prodUi).not.toContain('r.deletedJobIds.length)setJobs');expect(prod).toContain('skip_reasons: HashMap<String, usize>');expect(prodUi).toContain('skipReasons?.NOT_COMPLETED');expect(prodUi).toContain('skipReasons?.OUTPUT_INVALID');const a=prod.indexOf('fn collect_global_cleanup');const b=prod.indexOf('pub fn preview_global_production_project_cleanup',a);expect(prod.slice(a,b)).not.toContain('join("Rendered")')});
});
