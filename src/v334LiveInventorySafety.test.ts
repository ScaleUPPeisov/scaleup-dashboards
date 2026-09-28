import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {classifyChannelRenderFiles,summarizeRenderScan} from './renderScanClassifier';
import type {RenderFolderVideoFile} from './api';
import type {UploadHistoryRecord} from './types';

const runtime=fs.readFileSync('src/renderInventoryRuntime.ts','utf8');
const bridge=fs.readFileSync('src/LiveInventoryBridge.tsx','utf8');
const page=fs.readFileSync('src/LiveContentInventory.tsx','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const backend=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
const baseConfig=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
const windowsConfig=JSON.parse(fs.readFileSync('src-tauri/tauri.windows.conf.json','utf8'));
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

describe('VYRON 3.3.4 live inventory safety contracts',()=>{
 it('is read-only with zero YouTube API calls during local inventory scan',()=>{
  expect(runtime).toContain('api.scanRenderFolder');
  expect(runtime).toContain('api.localSourceStatus');
  expect(runtime).toContain('api.youtubeFileFingerprint');
  for(const forbidden of ['youtubeUpload(','youtubeListExisting(','youtubeProfiles(','youtubeOauth','youtubeChannelStatistics(','youtubeVideoProcessingStatus(','youtubeSetThumbnail('])expect(runtime).not.toContain(forbidden);
  for(const destructive of ['replaceUploadHistory(','localStorage.clear(','youtubeDisconnect(','removeChannel(','clearStaleUploadLink(','trashLocalFile(','patchJob('])expect(runtime).not.toContain(destructive);
  expect(page).toContain('YouTube API requests: 0')
 });
 it('uses one shared inventory runtime from watcher, Publisher, Dashboard and Production',()=>{
  expect(bridge).toContain("scanInventoryChannel(channelId,'watcher')");
  const publisher=fs.readFileSync('src/PublisherOS.tsx','utf8');
  expect(publisher).toContain("from './renderInventoryRuntime'");
  expect(publisher).toContain('scanInventoryChannel(');
  expect(fs.readFileSync('src/DashboardOS.tsx','utf8')).toContain("useLiveInventory");
  expect(fs.readFileSync('src/ProductionOS.tsx','utf8')).toContain("useLiveInventory")
 });
 it('sidebar keeps Запас видео before YouTube, exposes History, and shows the inventory badge',()=>{
  const production=app.indexOf("id:'production',page:'production'");
  const inventory=app.indexOf("id:'inventory',page:'inventory'");
  const history=app.indexOf("id:'history',page:'youtube'");
  const youtube=app.indexOf("id:'youtube',page:'youtube'");
  expect(production).toBeGreaterThanOrEqual(0);
  expect(inventory).toBeGreaterThan(production);
  expect(history).toBeGreaterThan(inventory);
  expect(youtube).toBeGreaterThan(history);
  expect(app).toContain("n.page==='inventory'");
  expect(app).toContain('<LiveInventoryBridge/>')
 });
 it('watcher is per-channel, debounced and periodic reconciliation is lightweight',()=>{
  expect(bridge).toContain('WATCH_DEBOUNCE_MS=1500');
  expect(bridge).toContain('SAFETY_RECONCILE_MS=60_000');
  expect(bridge).toContain("scanInventoryChannel(channelId,'watcher')");
  expect(runtime).toContain('const RENDER_IO_CONCURRENCY=1');
  expect(runtime).toContain('length:Math.min(RENDER_IO_CONCURRENCY');
 });
 it('preserves macOS 3.3.3 DOCX schedule surface and Windows 3.3.2 OAuth launcher/routing',()=>{
  const metadata=fs.readFileSync('src/metadata.ts','utf8'),schedule=fs.readFileSync('src/scheduleContinuation.ts','utf8');
  expect(metadata).toContain("m=t.match(/^PUBLISH");
  expect(schedule).toContain("timeSource?:PublishTimeSource");
  const open=backend.slice(backend.indexOf('fn open_browser'),backend.indexOf('fn wait_for_oauth_code'));
  const win=open.split('#[cfg(target_os = "windows")]')[1]?.split('#[cfg(target_os = "linux")]')[0]||'';
  expect(win).toContain('tauri_plugin_opener::open_url(url, None::<&str>)');
  expect(win).not.toContain('Command::new("cmd")');
  expect(windowsConfig.plugins.updater.endpoints[0]).toContain('/updates/windows-latest.json')
 });
 it('keeps version, bundle identity and platform updater routing while dev CI remains read-only',()=>{
  expect(baseConfig.version).toBe(packageJson.version);
  expect(baseConfig.identifier).toBe('studio.channelflow.desktop');
  expect(baseConfig.plugins.updater.endpoints).toEqual([
    'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json',
    'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json'
  ]);
  expect(windowsConfig.plugins.updater.endpoints).toEqual([
    'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json',
    'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json'
  ]);
  const devGate=fs.readFileSync('.github/workflows/vyron-334-live-inventory-dev-gate.yml','utf8');
  expect(devGate).toContain('MAC_PRODUCTION_FEED=3.3.3');
  expect(devGate).toContain('WINDOWS_PRODUCTION_FEED=3.3.2');
  expect(devGate).toContain('RELEASE_MUTATION=NO');
  for(const mutation of ['gh release create','gh release upload','git tag ','git push --tags','contents: write'])expect(devGate).not.toContain(mutation)
 });
 it('same logical fixture classifies the same on macOS and Windows path syntax',()=>{
  const hist=(path:string):UploadHistoryRecord=>({id:'h1',jobId:'old',channelId:'c1',youtubeVideoId:'yt1',localFilePath:path,originalFilename:'001.mov',uploadedAt:'2026-09-20T00:00:00Z',fileSize:100,sha256:'a'.repeat(64),status:'UPLOADED',fingerprintProofSource:'UPLOAD_TIME'});
  const mac:RenderFolderVideoFile={path:'/Volumes/TOSHIBA EXT/Render/Aether/001.mov',name:'001.mov',size:100,modifiedAt:10,fingerprint:'b'.repeat(64)};
  const win:RenderFolderVideoFile={path:'D:\\Render\\Aether\\001.mov',name:'001.mov',size:100,modifiedAt:10,fingerprint:'b'.repeat(64)};
  const m=classifyChannelRenderFiles([mac],[],[hist(mac.path)],'c1','/Volumes/TOSHIBA EXT/Render/Aether');
  const w=classifyChannelRenderFiles([win],[],[hist(win.path)],'c1','D:\\Render\\Aether');
  expect(m[0].classification).toBe('NEW_GENERATION');expect(w[0].classification).toBe('NEW_GENERATION');
  expect(summarizeRenderScan(m).NEW_GENERATION).toBe(summarizeRenderScan(w).NEW_GENERATION)
 });
});
