import fs from 'node:fs';import {describe,expect,it} from 'vitest';
describe('VYRON 2.1.2 folder-based Shorts Factory contracts',()=>{
 const ui=fs.readFileSync('src/ShortsFactory.tsx','utf8'),api=fs.readFileSync('src/api.ts','utf8'),rust=fs.readFileSync('src-tauri/src/shorts_factory.rs','utf8'),lib=fs.readFileSync('src-tauri/src/lib.rs','utf8');
 it('uses a user-selected directory and no READY_UPLOAD Production source list',()=>{expect(ui).toContain('ВЫБРАТЬ ПАПКУ С ВИДЕО');expect(ui).toContain('api.shortsScanFolder');expect(ui).not.toContain("jobs.filter(j=>j.channelId===channelId&&j.status==='READY_UPLOAD'")});
 it('supports MP4 and MOV end to end',()=>{expect(api).toContain("invoke<ShortsSourceFile[]>('shorts_scan_folder'");expect(rust).toMatch(/Some\("mp4"\)\s*\|\s*Some\("mov"\)/);expect(rust).toContain('audible_aac_mov_if_enabled');expect(lib).toContain('shorts_factory::shorts_scan_folder')});
 it('writes Shorts outside the source file and never removes/renames source',()=>{expect(ui).toContain('/VYRON Shorts');const render=rust.slice(rust.indexOf('fn render_segment_sync'),rust.indexOf('#[cfg(test)]'));expect(render).not.toContain('remove_file(&source)');expect(render).not.toContain('rename(&source')});
 it('aggregates planning errors instead of one toast per source failure',()=>{expect(ui).toContain('const errors:string[]=[]');expect(ui).toContain('пропущено файлов ${errors.length}')});
});
