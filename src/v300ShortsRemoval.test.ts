import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

const production=fs.readFileSync('src/ProductionOS.tsx','utf8');
const quota=fs.readFileSync('src/QuotaMeter.tsx','utf8');
const api=fs.readFileSync('src/api.ts','utf8');
const tauri=fs.readFileSync('src-tauri/src/lib.rs','utf8');
const productionBackend=fs.readFileSync('src-tauri/src/production_manager.rs','utf8');
const store=fs.readFileSync('src/store.ts','utf8');

describe('VYRON 3.0.0 Shorts feature removal',()=>{
 it('has no Shorts navigation, action, quota card or active API/runtime command',()=>{
  for(const source of [production,quota,api,tauri]){
   expect(source).not.toMatch(/short-upload|shortsCore|ShortsFactory|ShortsMetadata|shorts_scan_folder|shorts_render_segment|СОЗДАТЬ SHORTS|>SHORTS</i);
  }
  expect(production).not.toContain("section==='shorts'");
  expect(quota).not.toContain('<small>Shorts</small>');
 });
 it('normal long-video Publisher and videos.insert infrastructure remain registered',()=>{
  expect(api).toContain('youtubeUpload:');
  expect(api).toContain('youtubeResumeUpload:');
  expect(tauri).toContain('youtube::youtube_upload');
  expect(tauri).toContain('youtube::youtube_resume_upload');
  expect(productionBackend).toContain('media_tools::validate_render_media');
 });
 it('shared production media helpers no longer depend on the retired Shorts module',()=>{
  expect(tauri).toContain('mod media_tools;');
  expect(tauri).not.toContain('mod shorts_factory;');
  expect(productionBackend).not.toContain('shorts_factory');
 });
 it('legacy unknown state remains tolerated by hydrate rather than requiring owner cleanup',()=>{
  expect(store).toContain('...s');
  expect(store).not.toMatch(/throw.*shorts/i);
 });
});
