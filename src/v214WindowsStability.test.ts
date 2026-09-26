import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {testFilePath} from './testFilePath';
const read=(p:string)=>readFileSync(testFilePath(p,import.meta.url),'utf8');

describe('VYRON 2.1.14 Windows stability regressions',()=>{
  it('keeps state replacement crash-safe and never deletes the primary before replace',()=>{
    const rust=read('../src-tauri/src/storage.rs');
    const start=rust.indexOf('fn atomic_write('),end=rust.indexOf('fn load_state_from_path',start);
    expect(start).toBeGreaterThanOrEqual(0);expect(end).toBeGreaterThan(start);
    const block=rust.slice(start,end);
    expect(block).toContain('durable_write(&tmp');
    expect(block).toContain('replace_file_atomic(&tmp, path)');
    expect(block).not.toContain('remove_file(path)');
    expect(rust).toContain('MoveFileExW');
    expect(rust).toContain('STATE_RECOVERY_FAILED');
    expect(rust).toContain('"status":"RECOVERED"');
    expect(rust).toContain('archive_corrupt(&bak, "state.bak")');
  });

  it('marks ENDLUME SENT only after a successful process spawn',()=>{
    const rust=read('../src-tauri/src/production_manager.rs');
    const start=rust.indexOf('pub fn open_production_batch_in_endlume('),end=rust.indexOf('pub fn production_endlume_handoff_consumed',start);
    expect(start).toBeGreaterThanOrEqual(0);expect(end).toBeGreaterThan(start);
    const block=rust.slice(start,end);
    const firstSpawn=block.indexOf('.spawn()');
    const firstMark=block.indexOf('mark_handoff_sent');
    expect(firstSpawn).toBeGreaterThanOrEqual(0);
    expect(firstMark).toBeGreaterThan(firstSpawn);
    expect(block).toContain('ENDLUME_INBOX_NOT_WRITABLE');
    expect(block).toContain('ENDLUME_PATH_INVALID');
    expect(block).toContain('validate_manifest_projects(&m, &endlume_path, Some(&idset))');
    expect(block).toContain('ENDLUME_VALIDATION_FAILED');
    expect(block).toContain('let _ = fs::remove_file(&request)');
  });

  it('uses real ENDLUME and updater diagnostics instead of optimistic labels',()=>{
    const settings=read('./SettingsOS.tsx'),api=read('./api.ts'),system=read('../src-tauri/src/system.rs'),lib=read('../src-tauri/src/lib.rs');
    expect(settings).toContain('api.endlumeDiagnostics(s.endlumePath)');
    expect(settings).toContain('api.updaterManifestDiagnostics(UPDATER_ENDPOINTS[0])');
    expect(settings).not.toContain("status:'Signed updater подключён'");
    expect(system).toContain('pub fn endlume_diagnostics');
    expect(system).toContain('"INBOX_NOT_WRITABLE"');
    expect(system).toContain('pub async fn updater_manifest_diagnostics');
    expect(system).toContain('"platformKey":"windows-x86_64"');
    expect(system).toContain('"signaturePresent":signature_present');
    expect(system).toContain('"installerDownloaded":false');
    expect(api).toContain("invoke<EndlumeDiagnostic>('endlume_diagnostics'");
    expect(api).toContain("invoke<UpdaterManifestDiagnostic>('updater_manifest_diagnostics'");
    expect(lib).toContain('system::endlume_diagnostics');
    expect(lib).toContain('system::updater_manifest_diagnostics');
  });

  it('renders Windows-native labels and keeps the legacy Settings implementation removed',()=>{
    const settings=read('./SettingsOS.tsx'),app=read('./App.tsx'),api=read('./api.ts');
    expect(settings).toContain("'Windows 10/11 • x64'");
    expect(settings).toContain("'Windows Credential Manager'");
    expect(settings).toContain("'ENDLUME Studio.exe'");
    expect(api).toContain("title:'Выберите ENDLUME'");
    expect(app).not.toContain('function Settings({license,setLicense}');
    expect(app).not.toContain('Версия 2.0.11');
    expect(app).not.toContain('DMG-сборка');
    expect(app).not.toContain('Apple-notarized');
  });

  it('keeps Windows OAuth and secure-storage UI free of macOS-only labels',()=>{
    const inventory=read('./OAuthInventoryPanel.tsx'),recovery=read('./AuthRecoveryCenter.tsx'),errors=read('./errorCenter.ts'),production=read('./ProductionOS.tsx');
    expect(inventory).toContain("'WINDOWS CREDENTIAL MANAGER'");
    expect(inventory).not.toContain('KEYCHAIN SERVICE:');
    expect(inventory).not.toContain('LOCAL MAC • NO YOUTUBE API');
    expect(recovery).toContain('SECURE_STORAGE_READBACK_FAILED_AFTER_RECONNECT');
    expect(errors).toContain("secureStorageName=()=>windowsUi()?'Windows Credential Manager':'macOS Keychain'");
    expect(errors).toContain('Windows Credential Manager не отдал OAuth credential');
    expect(production).toContain("'ОТКРЫТЬ В ПРОВОДНИКЕ'");
    expect(production).not.toContain('>ОТКРЫТЬ В FINDER</button>');
  });

  it('keeps shared OAuth recovery errors platform-neutral on Windows',()=>{
    const rust=read('../src-tauri/src/youtube.rs');
    expect(rust).toContain('canonical credential requires secure-storage interaction');
    expect(rust).toContain('historical OAuth credential exists but secure storage denied access');
    expect(rust).toContain('current, secure storage и historical JSON locations');
    expect(rust).not.toContain('historical OAuth credential exists but macOS denied access');
  });

  it('does not invalidate last-known-good license cache for transient failures',()=>{
    const rust=read('../src-tauri/src/license.rs');
    expect(rust).toContain('LICENSE_TRANSIENT: HTTP');
    expect(rust).toContain('invalid JSON response');
    expect(rust).toContain('offline_grace_eligible_at');
    expect(rust).toContain('"cachePreserved":true');
    expect(rust).toContain('LICENSE_SESSION_LOCAL_MISSING');
    expect(rust).toContain('LICENSE_REMOTE_ERROR:');
    expect(rust).toContain('"device_blocked"');
    expect(rust).toContain('"session_expired"');
    const security=read('../src-tauri/src/security.rs');
    expect(security).toContain('MOVEFILE_REPLACE_EXISTING');
    expect(security).toContain('replace_private_atomic(&tmp,path)');
  });
});
