import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

describe('VYRON 3.0.0 final physical stabilization contracts',()=>{
 const security=fs.readFileSync('src-tauri/src/security.rs','utf8');
 const youtube=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
 const auth=fs.readFileSync('src/AuthRecoveryCenter.tsx','utf8');
 const settings=fs.readFileSync('src/SettingsOS.tsx','utf8');
 const channels=fs.readFileSync('src/ChannelsOS.tsx','utf8');
 const tauri=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
 const updater=fs.readFileSync('src/updaterRuntime.ts','utf8');
 const policy=fs.readFileSync('src/updaterPolicy.ts','utf8');
 const app=fs.readFileSync('src/App.tsx','utf8');
 const workflow=fs.readFileSync('.github/workflows/vyron-300-physical-candidate.yml','utf8');

 it('keeps automatic Keychain reads NO-UI and exposes interactive access only behind explicit recovery',()=>{
  expect(security).toContain('fn secitem_no_ui_base_query');
  expect(security).toContain('kSecUseAuthenticationUISkip');
  expect(security).toContain('canonical_interactive_recover_secret');
  const interactive=security.split('fn secitem_interactive_get').at(1)?.split('fn secitem_no_ui_set')[0]||'';
  expect(interactive).not.toContain('kSecUseAuthenticationUISkip');
  expect(youtube).toContain('youtube_oauth_interactive_recover_blocked_profiles');
  expect(auth).toContain('Восстановить сохранённые подключения');
  expect(auth).toContain('macOS может запросить разрешение');
 });

 it('safe matrix diagnoses blocked profiles without returning secret values',()=>{
  expect(youtube).toContain('youtube_oauth_keychain_matrix');
  expect(youtube).toContain('ITEM_EXISTS_INTERACTION_REQUIRED');
  expect(youtube).toContain('LEGACY_POINTER_ONLY');
  expect(youtube).toContain('STALE_POINTER');
  expect(youtube).toContain('"secretReads":0');
  expect(settings).toContain('OAuth / Keychain matrix');
  expect(settings).toContain('Secret values');
 });

 it('interactive recovery rotates forward before pointer commit and never deletes historical item',()=>{
  const body=youtube.split('pub async fn youtube_oauth_interactive_recover_blocked_profiles').at(1)?.split('pub fn youtube_keychain_migration_diagnostics')[0]||'';
  expect(body).toContain('rotate_recovered_refresh_with');
  expect(body).toContain('commit_recovered_refresh_pointer');
  expect(body).toContain('refresh_access_token_http');
  expect(body).not.toContain('open_browser(');
  expect(body).not.toContain('youtube_oauth_reconnect_existing');
  expect(body).not.toContain('canonical_delete_secret(&old_account)');
  expect(body).toContain('"browserLaunches":0');
  expect(body).toContain('"youtubeApiRequests":0');
 });

 it('credential rotation is generation based, not application-version based',()=>{
  const rotate=youtube.split('fn rotated_profile_secret_account').at(1)?.split('fn record_profile_credential_validation')[0]||'';
  expect(rotate).toContain('generation');
  expect(rotate).not.toContain('package_info');
  expect(rotate).not.toContain('3.0.0');
 });

 it('channel OAuth badge comes from credentialState rather than stale mapping metadata',()=>{
  expect(channels).toContain("state==='READY'?'OAuth ✓'");
  expect(channels).toContain("state==='KEYCHAIN_BLOCKED'?'OAuth: доступ заблокирован'");
  expect(channels).toContain("'OAuth: требуется вход'");
  expect(channels).toContain("'OAuth: выбран другой канал'");
  expect(channels).not.toContain("c.youtubeProfileId?'YouTube подключён'");
 });

 it('main desktop window starts maximized while remaining resizable with minimum size',()=>{
  const win=tauri.app.windows.find((x:any)=>x.label==='main');
  expect(win.maximized).toBe(true);
  expect(win.resizable).toBe(true);
  expect(win.minWidth).toBeGreaterThanOrEqual(980);
  expect(win.minHeight).toBeGreaterThanOrEqual(700);
 });

 it('updater rejects DMG execution, checks replaceability and proves runtime target after relaunch',()=>{
  expect(policy).toContain('RUNNING_FROM_DMG');
  expect(policy).toContain('APP_NOT_REPLACEABLE');
  expect(updater).toContain('ensureUpdaterInstallable');
  expect(updater).toContain("localStorage.setItem('vyron:update-installing-version',target)");
  expect(app).toContain('POST_UPDATE_VERSION_MISMATCH');
  expect(app).toContain('expected===v');
 });

 it('updater artifact remains signed app archive rather than DMG manifest payload',()=>{
  expect(tauri.bundle.createUpdaterArtifacts).toBe(true);
  expect(tauri.plugins.updater.pubkey).toBeTruthy();
  expect(workflow).toContain('VYRON.app.tar.gz');
  expect(workflow).toContain('VYRON.app.tar.gz.sig');
 });

 it('wrong-channel safety remains present during final stabilization',()=>{
  expect(youtube).toContain('"status":"WRONG_CHANNEL"');
  expect(youtube).toContain('"credentialsCommitted":false');
  expect(youtube).toContain('find_expected_channel_item');
 });
});
