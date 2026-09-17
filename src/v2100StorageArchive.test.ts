import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
describe('VYRON 2.1 safe storage archive',()=>{
  it('is copy-only for rendered source video',()=>{
    const r=readFileSync('src-tauri/src/production_manager.rs','utf8');
    const a=readFileSync('src/productionManagerApi.ts','utf8');
    const u=readFileSync('src/ProductionManager.tsx','utf8');
    const l=readFileSync('src-tauri/src/lib.rs','utf8');
    const start=r.indexOf('pub fn archive_production_rendered_videos');
    const fn=r.slice(start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(fn).toContain('fs::copy');
    expect(fn).not.toContain('remove_file(&canon)');
    expect(fn).not.toContain('remove_dir_all(&canon)');
    expect(fn).toContain('source rendered MP4 is COPY-ONLY');
    expect(a).toContain("archiveRenderedVideos:(manifestPath:string,archiveRoot:string)");
    expect(u).toContain('АРХИВ MP4');
    expect(u).toContain('Исходные видео останутся на месте');
    expect(l).toContain('production_manager::archive_production_rendered_videos');
  });
});
