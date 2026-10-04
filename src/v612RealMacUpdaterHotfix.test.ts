import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 6.1.2 real mac updater hotfix',()=>{
  const bridge=read('src-tauri/src/updater_bridge.rs');
  const api=read('src/api.ts');
  const runtime=read('src/updaterRuntime.ts');
  const app=read('src/App.tsx');
  const lib=read('src-tauri/src/lib.rs');
  const conf=JSON.parse(read('src-tauri/tauri.conf.json'));

  it('detects exact running bundle, executable hash, duplicates and DMG',()=>{
    for(const token of ['currentExecutableCanonicalPath','currentExecutableSha256','currentAppBundleCanonicalPath','bundleParentDirectory','volumeDevice','parentVolumeDevice','runningLocation','duplicateAppCopies','duplicateCopies'])expect(bridge).toContain(token);
    expect(bridge).toContain('/Applications/VYRON.app');
    expect(bridge).toContain('Applications/VYRON.app');
    expect(bridge).toContain('mounted-dmg');
    expect(bridge).toContain('VYRON запущен из DMG. Переместите VYRON.app в Applications.');
  });

  it('proves directory rename capability instead of only writing a parent probe file',()=>{
    expect(bridge).toContain('safe_sibling_replace_probe');
    expect(bridge).toContain('fs::rename(&first,&second)');
    expect(bridge).toContain('fs::rename(&second,&first)');
  });

  it('verifies installed bundle version id changed executable hash and codesign before relaunch',()=>{
    expect(bridge).toContain('APP_REPLACEMENT_NOT_APPLIED');
    expect(bridge).toContain('CFBundleShortVersionString');
    expect(bridge).toContain('CFBundleIdentifier');
    expect(bridge).toContain('studio.channelflow.desktop');
    expect(bridge).toContain('executable SHA256 unchanged');
    expect(bridge).toContain('/usr/bin/codesign');
    expect(bridge).toContain('"--verify","--deep","--strict"');
    expect(bridge.indexOf('update.install(&staged.bytes)')).toBeLessThan(bridge.indexOf('verify_installed_bundle(Path::new(&staged.current_app_bundle_path)'));
  });

  it('relaunches exact current bundle path and never by display name',()=>{
    expect(bridge).toContain('updater_relaunch_exact');
    expect(bridge).toContain('canonical_text(&current_bundle)!=canonical_text(&requested)');
    expect(bridge).toContain('Command::new("/usr/bin/open").arg("-n").arg(&requested)');
    expect(bridge).not.toContain('Command::new("open").arg("VYRON")');
  });

  it('uses staged verified Rust updater on stable mac and leaves Windows generic updater path available',()=>{
    expect(api).toContain("identity.targetPlatform?.startsWith('darwin')");
    expect(api).toContain("invoke<StableUpdaterDownload>('updater_stable_download')");
    expect(api).toContain("invoke<UpdaterInstalledTarget>('updater_stable_install'");
    expect(api).toContain("invoke<void>('updater_relaunch_exact'");
    expect(api).toContain('await update.install()');
    expect(api).toContain('await relaunch()');
  });

  it('persists exact target identity and keeps diagnostics on install/relaunch failure',()=>{
    expect(runtime).toContain('expectedAppBundlePath');
    expect(runtime).toContain('expectedAppBundleCanonicalPath');
    expect(runtime).toContain('previousExecutableSha256');
    expect(runtime).toContain('installedExecutableSha256');
    expect(runtime).toContain('installFailure:String(error)');
    expect(runtime).toContain('relaunchFailure:String(error)');
    const installFailure=runtime.split("installFailure:String(error)").at(1)?.slice(0,500)||'';
    expect(installFailure).not.toContain("removeItem('vyron:update-installing-target')");
  });

  it('clears pending marker only after version path and hash confirmation',()=>{
    expect(app).toContain('const pathOk=Boolean(expectedCanonical&&runtimePath&&expectedCanonical===runtimePath)');
    expect(app).toContain("const shaOk=Boolean(installedSha&&runtimeSha&&installedSha.toLowerCase()===runtimeSha.toLowerCase())");
    const success=app.indexOf('if(versionOk&&revisionOk&&pathOk&&shaOk)');
    const clear=app.indexOf("localStorage.removeItem('vyron:update-installing-target')",success);
    const mismatch=app.indexOf('POST_UPDATE_IDENTITY_MISMATCH',success);
    expect(success).toBeGreaterThan(-1);expect(clear).toBeGreaterThan(success);expect(clear).toBeLessThan(mismatch);
    expect(app.slice(mismatch,mismatch+1800)).not.toContain("removeItem('vyron:update-installing-target')");
  });

  it('registers every real-path updater command',()=>{
    for(const cmd of ['updater_runtime_diagnostics','updater_stable_check','updater_stable_download','updater_stable_install','updater_verify_installed_target','updater_relaunch_exact'])expect(lib).toContain(cmd);
  });

  it('keeps updater identity and signing endpoints unchanged while version is 6.1.3',()=>{
    expect(conf.version).toBe('6.1.3');
    expect(conf.identifier).toBe('studio.channelflow.desktop');
    expect(conf.plugins.updater.pubkey).toBe('dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEREODQ1NDdERTI1MEYxQzAKUldUQThWRGlmVlNFM1RHdW5WQnE2eG9BYTBnQlNmbUtmVU84UHJQMUNvZWZ4Qmo0L2hYcUd4UDEK');
    expect(conf.plugins.updater.endpoints).toEqual([
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json',
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json'
    ]);
  });
});
