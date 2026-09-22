import {describe,expect,it} from 'vitest';import fs from 'node:fs';
describe('VYRON 3.0.0 OAuth persistence physical-blocker regression',()=>{
 const accounts=fs.readFileSync('src/AccountsPage.tsx','utf8');
 const recovery=fs.readFileSync('src/AuthRecoveryCenter.tsx','utf8');
 const api=fs.readFileSync('src/api.ts','utf8');
 const rust=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
 const start=rust.indexOf('pub async fn youtube_oauth_recover_existing_profiles');
 const end=rust.indexOf('#[tauri::command]\npub fn youtube_keychain_migration_diagnostics',start);
 const automatic=rust.slice(start,end);
 it('uses saved local OAuth recovery before the manual credentials fallback',()=>{
  expect(api).toContain('youtubeRecoverSavedGoogleConfig');
  expect(accounts).toContain('api.youtubeRecoverSavedGoogleConfig()');
  expect(recovery).toContain('api.youtubeRecoverSavedGoogleConfig()');
  expect(api).toContain('youtubeImportGoogleConfig');
 });
 it('uses one global repair then automatic existing-profile recovery',()=>{
  expect(api).toContain('youtubeOauthRecoverExistingProfiles');
  expect(accounts).toContain('await recoverExistingProfiles(current.length,false)');
  expect(recovery).toContain('await api.youtubeOauthRecoverExistingProfiles()');
 });
 it('automatic recovery uses OAuth token refresh only and never opens browser or YouTube API',()=>{
  expect(automatic).toContain('refresh_access_token_http');
  expect(automatic).not.toContain('open_browser(');
  expect(automatic).not.toContain('emit_youtube_api_request');
  expect(automatic).toContain('"youtubeApiRequests":0');
  expect(automatic).toContain('"browserLaunches":0');
  expect(automatic).toContain('"videosInsert":0');
 });
 it('startup no longer blasts statistics for all profiles',()=>expect(accounts).not.toContain('void refreshAllStats(false)'));
 it('app version change is credential-neutral while launch recovery uses saved profiles without browser reconnect',()=>{
  const app=fs.readFileSync('src/App.tsx','utf8');
  expect(app).toContain('oauthBootRecoveryStarted');
  expect(app).toContain('api.youtubeGoogleConfig()');
  expect(app).toContain('api.youtubeOauthRecoverExistingProfiles()');
  expect(app).not.toContain('vyron:oauth-continuity-version');
 });
 it('recovery center automatically checks NOT_CHECKED saved profiles when GLOBAL OAuth is READY',()=>{
  expect(recovery).toContain("credentialState==='NOT_CHECKED'");
  expect(recovery).toContain("credentialState==='CANONICAL_PRESENT_UNVERIFIED'");
  expect(recovery).toContain('initial.global.oauthReady');
  expect(recovery).toContain('api.youtubeOauthRecoverExistingProfiles()');
  expect(recovery).not.toContain('manualQueue=keychainBlocked+reconnectRequired');
  expect(recovery).toContain('const manualQueue=reconnectRequired');
 });
 it('missing Google email is optional metadata for an otherwise healthy profile',()=>{
  expect(rust).toContain('assert!(google_account_identity_matches(Some("owner@example.com"),None))');
  expect(rust).toContain('assert!(google_account_identity_matches(None,Some("owner@example.com")))');
 });
 it('post-update health restores saved profiles before reporting OAuth state and never opens browser',()=>{
  const app=fs.readFileSync('src/App.tsx','utf8');
  const effect=app.split("localStorage.getItem('vyron:update-installing-version')").at(1)?.split('POST_UPDATE_BUILD_MISMATCH')[0]||'';
  expect(effect).toContain('api.youtubeGoogleConfig()');
  expect(effect).toContain('api.youtubeOauthRecoverExistingProfiles()');
  expect(effect).toContain('api.youtubeProfiles()');
  expect(effect).toContain('api.youtubeOauthCredentialStates()');
  expect(effect).toContain('OAuth READY');
  expect(effect).toContain('Требуют входа');
  expect(effect).not.toContain('youtubeReconnectExisting');
  expect(effect).not.toContain('youtubeOauthBrowsers');
 });
 it('manual browser reconnect remains explicit fallback after Keychain repair',()=>{
  expect(accounts).toContain('Переподключить через браузер');
  expect(recovery).toContain('Переподключить через браузер');
  expect(recovery).toContain('Восстановить доступ Keychain');
  expect(recovery).toContain('api.youtubeReconnectExisting(profileId,browser)');
 });
 it('automatic recovery does not create profiles or mutate channel mappings',()=>{
  expect(automatic).not.toContain('Uuid::new_v4');
  expect(automatic).not.toContain('youtube_oauth_connect');
  expect(automatic).not.toContain('write_oauth_metadata');
 });
 it('global exact-match secret outranks stale blocked per-profile secret',()=>expect(rust).toContain('v300_global_exact_secret_wins_over_blocked_profile_secret'));
 it('mixed 50-profile fixture limits manual attention to ten',()=>expect(rust).toContain('v300_mixed_fifty_profiles_only_ten_need_manual_attention'));
});
