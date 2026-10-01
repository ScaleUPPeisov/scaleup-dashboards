import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {VYRON_CURRENT_RELEASE} from './releaseHistory';

const read=(p:string)=>fs.readFileSync(p,'utf8');
const main=read('src-tauri/src/main.rs');
const settings=read('src/SettingsOS.tsx');
const store=read('src/store.ts');
const brand=read('src/vyronBrand.ts');
const styles=read('src/styles.css');
const migration=read('src-tauri/src/migration.rs');
const conf=JSON.parse(read('src-tauri/tauri.conf.json'));

describe('VYRON 6.0.1 Windows migration/UI hotfix contracts',()=>{
  it('uses Windows GUI subsystem in release builds without hiding debug console',()=>{
    expect(main).toContain('cfg_attr(not(debug_assertions), windows_subsystem = "windows")');
  });

  it('packages the existing official Windows icon and production-safe VYRON artwork',()=>{
    expect(conf.bundle.icon).toContain('icons/icon.ico');
    expect(brand).toContain("VYRON_MAJOR_VERSION='6.0.0'");
    expect(brand).toContain('data:image/webp;base64,');
  });

  it('anchors owner and LOCAL CORE as one sidebar footer group',()=>{
    expect(styles).toContain('.sidebar .sidebarFooter');
    expect(styles).toMatch(/\.sidebar \.sidebarFooter\s*\{[^}]*margin-top:auto[^}]*flex-direction:column/s);
    expect(styles).toContain('.sidebar .sidebarFooter .sideFoot');
  });

  it('keeps FPS HUD off by default and exposes its toggle only in Diagnostics',()=>{
    expect(store).toContain('fpsMonitor:false');
    const diag=settings.indexOf("tab==='diagnostics'");
    const toggle=settings.indexOf('value={s.fpsMonitor}');
    expect(diag).toBeGreaterThanOrEqual(0);
    expect(toggle).toBeGreaterThan(diag);
    expect(settings.match(/value=\{s\.fpsMonitor\}/g)?.length).toBe(1);
    expect(settings).toContain('Показывать FPS / Performance HUD');
  });

  it('shows actual runtime version in the history while retaining canonical history',()=>{
    expect(VYRON_CURRENT_RELEASE.version).toBe('6.0.2');
    expect(settings).toContain('<ReleaseHistoryTimeline currentVersion={updaterCurrent||undefined}/>');
  });

  it('uses one portable migration crypto implementation with legacy-compatible raw-first decrypt',()=>{
    expect(migration).toContain('Argon2::new(Algorithm::Argon2id');
    expect(migration).toContain('XChaCha20Poly1305');
    expect(migration).toContain('canonical_passphrase');
    expect(migration).toContain('match decrypt_with(passphrase)');
    expect(migration).toContain('trim_end_matches');
  });
});
