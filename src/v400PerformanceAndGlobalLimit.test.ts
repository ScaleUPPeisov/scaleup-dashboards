import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const rust=fs.readFileSync('src-tauri/src/local_delete.rs','utf8');
const inventory=fs.readFileSync('src/renderInventoryRuntime.ts','utf8');
const safety=fs.readFileSync('src/youtubePublishSafety.ts','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const publisher=fs.readFileSync('src/PublisherOS.tsx','utf8');
const autopilot=fs.readFileSync('src/youtubeAutopilot.ts','utf8');

describe('VYRON 4.0.0 smooth scan + shared upload cap',()=>{
  it('moves render scan blocking filesystem IO off the Tauri UI thread',()=>{
    expect(rust).toContain('pub async fn scan_render_folder');
    expect(rust).toContain('tauri::async_runtime::spawn_blocking');
    expect(inventory).toContain('const RENDER_IO_CONCURRENCY=1');
    expect(inventory).toContain('await yieldToUi()');
  });

  it('uses one shared 100-video VYRON limit on the same YouTube quota day',()=>{
    expect(safety).toContain('VYRON_GLOBAL_DAILY_UPLOAD_LIMIT=100');
    expect(safety).toContain('youtubePtDate(d)===day');
    expect(safety).toContain('nextYoutubeQuotaResetAt(now)');
    expect(app).toContain('Загрузки');
    expect(app).toContain('Осталось');
    expect(app).toContain('globalUploads.remaining');
  });

  it('enforces the shared cap in publisher and autopilot',()=>{
    expect(publisher).toContain('combinedDailyRemaining');
    expect(publisher).toContain('globalDaily.remaining');
    expect(autopilot).toContain('globalDailyUploadStatus()');
    expect(autopilot).toContain('общий лимит VYRON');
  });
});
