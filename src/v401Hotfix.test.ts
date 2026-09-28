import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(p:string)=>fs.readFileSync(p,'utf8');

describe('VYRON 4.0.1 hotfix contract',()=>{
  it('has one consistent 4.0.1 runtime identity',()=>{
    expect(JSON.parse(read('package.json')).version).toBe('4.0.1');
    const lock=JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe('4.0.1');
    expect(lock.packages[''].version).toBe('4.0.1');
    expect(JSON.parse(read('src-tauri/tauri.conf.json')).version).toBe('4.0.1');
    expect(read('src-tauri/Cargo.toml')).toContain('version = "4.0.1"');
    expect(read('src-tauri/Cargo.lock')).toMatch(/name = "channelflow"\nversion = "4\.0\.1"/);
  });

  it('removes render scan state-write storms and blocking state saves',()=>{
    const inventory=read('src/renderInventoryRuntime.ts');
    const store=read('src/store.ts');
    const storage=read('src-tauri/src/storage.rs');
    const bridge=read('src/LiveInventoryBridge.tsx');
    expect(inventory).toContain('pendingCache');
    expect(inventory).toContain('cacheFingerprints(pendingCache)');
    expect(inventory).not.toContain('useApp.getState().cacheFingerprint(file.path');
    expect(store).toContain('persistInFlight');
    expect(store).toContain('SAVE_DEBOUNCE_MS=550');
    expect(store).toContain('cacheFingerprints:entries');
    expect(storage).toContain('spawn_blocking');
    expect(storage).toContain('STATE_WRITE_LOCK');
    expect(bridge).toContain('SAFETY_RECONCILE_MS=15*60_000');
  });

  it('keeps global History as a real journal, not a second fake store',()=>{
    const app=read('src/App.tsx');
    const center=read('src/YouTubeCenter.tsx');
    const history=read('src/ActivityHistory.tsx');
    expect(app).toContain("label:'История'");
    expect(app).toContain("detail:{global:true}");
    expect(center).toContain('<ActivityHistory globalView={historyGlobal}/>');
    expect(history).toContain('СЕГОДНЯ • ВСЕ КАНАЛЫ');
    expect(history).toContain('dailySummary(journalRows,channel.id)');
    expect(history).toContain("x.source!=='LIVE_OPERATION'");
  });

  it('uses resilient real channel avatars across primary channel surfaces',()=>{
    const avatar=read('src/ChannelAvatar.tsx');
    expect(avatar).toContain("channel.analytics?.channelThumbnail||channel.stats?.thumbnail");
    expect(avatar).toContain('onError');
    for(const p of ['src/ChannelsOS.tsx','src/YouTubeChannelBar.tsx','src/ChannelRunway.tsx','src/DashboardOS.tsx','src/StatisticsCenter.tsx']){
      expect(read(p),p).toContain('ChannelAvatar')
    }
  });

  it('has a persisted local owner profile with native image import',()=>{
    const types=read('src/types.ts'),api=read('src/api.ts'),profile=read('src/OwnerProfile.tsx'),rust=read('src-tauri/src/profile.rs'),lib=read('src-tauri/src/lib.rs');
    expect(types).toContain('localProfileName?:string');
    expect(types).toContain('localProfileAvatarPath?:string');
    expect(api).toContain('chooseProfileAvatar');
    expect(api).toContain('profileImportAvatar');
    expect(profile).toContain("DEFAULT_NAME='Кирилл'");
    expect(profile).toContain("DEFAULT_COMPANY='VYRON / ScaleUP'");
    expect(rust).toContain('profile_import_avatar');
    expect(rust).toContain('PROFILE_AVATAR_OUTSIDE_PRIVATE_DIR');
    expect(lib).toContain('profile::profile_import_avatar');
  });

  it('keeps the 4.0 artwork safe when its image cannot load',()=>{
    expect(read('src/SafeArtwork.tsx')).toContain('safeArtworkFallback');
    expect(read('src/App.tsx')).toContain('<SafeArtwork className="sidebarBrandArtwork"');
    expect(read('src/MajorUpdateCelebration.tsx')).toContain('<SafeArtwork className="majorCelebrationArtwork"');
  });
});
