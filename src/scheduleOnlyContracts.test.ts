import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const ui=readFileSync(fileURLToPath(new URL('./ScheduleOS.tsx',import.meta.url)),'utf8');
const api=readFileSync(fileURLToPath(new URL('./api.ts',import.meta.url)),'utf8');
const rust=readFileSync(fileURLToPath(new URL('../src-tauri/src/youtube.rs',import.meta.url)),'utf8');
const lib=readFileSync(fileURLToPath(new URL('../src-tauri/src/lib.rs',import.meta.url)),'utf8');
describe('schedule-only zero-metadata write architecture',()=>{
 it('does not import or call Metadata parser, mammoth, GPT or SEO pack state',()=>{expect(ui).not.toContain("from './metadata'");expect(ui).not.toContain('mammoth');expect(ui).not.toContain('parseMetadataFile');expect(ui).not.toContain('ai_generate_metadata');expect(ui).not.toContain('seoPackLoaded')});
 it('uses a dedicated schedule command rather than metadata updater',()=>{expect(api).toContain("youtubeUpdateExistingSchedule");expect(api).toContain("'youtube_update_existing_schedule'");expect(lib).toContain('youtube::youtube_update_existing_schedule')});
 it('backend write is status-only and reports zero snippet/thumbnail/playlist/videos.insert writes',()=>{const start=rust.indexOf('pub async fn youtube_update_existing_schedule');const end=rust.indexOf('pub async fn youtube_list_playlists',start);const body=rust.slice(start,end);expect(body).toContain('.query(&[("part", "status")])');expect(body).toContain('youtube_schedule_status_payload');expect(body).not.toContain('"snippet,status",\n            json!');expect(body).toContain('"snippetWrites":0');expect(body).toContain('"thumbnailWrites":0');expect(body).toContain('"playlistWrites":0');expect(body).toContain('"videosInsert":0')});
 it('takes owner-authorized pre/post snapshots and verifies metadata preservation',()=>{const start=rust.indexOf('pub async fn youtube_update_existing_schedule');const end=rust.indexOf('pub async fn youtube_list_playlists',start);const body=rust.slice(start,end);expect(body.match(/emit_youtube_api_request\(&app, "videos\.list"/g)?.length).toBe(2);expect(body.match(/emit_youtube_api_request\(&app, "videos\.update"/g)?.length).toBe(1);expect(body).toContain('metadata_preserved');expect(body).toContain('status_preserved')});
 it('UI confirmation explicitly plans 0 metadata fields and 0 videos.insert',()=>{expect(ui).toContain('Metadata writes <b>0</b>');expect(ui).toContain('Thumbnail writes <b>0</b>');expect(ui).toContain('Playlist writes <b>0</b>');expect(ui).toContain('videos.insert <b>0</b>');expect(ui).not.toContain('Загрузить SEO DOCX')});
});
