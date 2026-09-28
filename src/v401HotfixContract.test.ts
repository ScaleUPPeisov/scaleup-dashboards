import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const app=fs.readFileSync('src/App.tsx','utf8');
const history=fs.readFileSync('src/ActivityHistory.tsx','utf8');
const youtube=fs.readFileSync('src/YouTubeCenter.tsx','utf8');
const profiles=fs.readFileSync('src/localProfiles.ts','utf8');
const profileUi=fs.readFileSync('src/LocalProfileMenu.tsx','utf8');
const nativeFiles=fs.readFileSync('src-tauri/src/files.rs','utf8');
const nativeLib=fs.readFileSync('src-tauri/src/lib.rs','utf8');
const inventory=fs.readFileSync('src/renderInventoryRuntime.ts','utf8');
const bridge=fs.readFileSync('src/LiveInventoryBridge.tsx','utf8');
const store=fs.readFileSync('src/store.ts','utf8');
const brand=fs.readFileSync('src/vyronBrand.ts','utf8');

describe('VYRON 4.0.1 hotfix contract',()=>{
  it('keeps the new History shortcut global and separate from OAuth state',()=>{
    expect(app).toContain("label:'История'");
    expect(app).toContain("detail:{global:true}");
    expect(youtube).toContain('globalView={historyGlobal}');
    expect(history).toContain('<option value="">Все каналы</option>');
    expect(history).toContain("globalView?'today':'30d'");
  });

  it('stores local user profiles and avatar files without touching Google credentials',()=>{
    expect(profiles).toContain("role:'OWNER'");
    expect(profiles).toContain("role:'USER'");
    expect(profileUi).toContain('chooseProfileAvatar');
    expect(profileUi).toContain('Google, OAuth, YouTube-каналы или credentials');
    expect(nativeFiles).toContain('pub fn store_profile_avatar');
    expect(nativeFiles).toContain('.app_data_dir()');
    expect(nativeFiles).toContain('.join("UserProfiles")');
    expect(nativeLib).toContain('files::store_profile_avatar');
    expect(profileUi).not.toContain('youtubeDisconnect');
    expect(profileUi).not.toContain('youtubeOauth');
  });

  it('keeps inventory work coalesced and throttled away from hot UI paths',()=>{
    expect(inventory).toContain('scheduleInventoryCachePersist');
    expect(inventory).toContain('RENDER_IO_CONCURRENCY=1');
    expect(bridge).toContain('FOCUS_RESCAN_MIN_MS=5*60_000');
    expect(bridge).toContain('INITIAL_SCAN_DELAY_MS=900');
    expect(store).toContain('saveTimer');
  });

  it('uses 4.0.1 as the hotfix runtime identity',()=>{
    expect(brand).toContain("VYRON_MAJOR_VERSION='4.0.1'");
  });
});
