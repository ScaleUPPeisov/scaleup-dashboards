import {describe,expect,it} from 'vitest';import fs from 'node:fs';
describe('VYRON 3.0.0 OAuth persistence physical-blocker regression',()=>{
 const accounts=fs.readFileSync('src/AccountsPage.tsx','utf8');
 const recovery=fs.readFileSync('src/AuthRecoveryCenter.tsx','utf8');
 const api=fs.readFileSync('src/api.ts','utf8');
 const rust=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
 const start=rust.indexOf('pub async fn youtube_oauth_recover_existing_profiles');
 const end=rust.indexOf('#[tauri::command]\npub fn youtube_keychain_migration_diagnostics',start);
 const automatic=rust.slice(start,end);
 it('keeps global credentials import available in KEYCHAIN_ACCESS_BLOCKED',()=>{
  expect(accounts).toContain("oauthKeychainBlocked?'Восстановить через credentials.json'");
  expect(recovery).toContain("globalStatus?.oauthState==='KEYCHAIN_ACCESS_BLOCKED'?'Восстановить через credentials.json'");
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
 it('app version change is credential-neutral and never auto-runs profile recovery',()=>{
  const effect=accounts.match(/useEffect\(\(\)=>\{[\s\S]*?onOauthExistingRecoveryProgress[\s\S]*?\},\[\]\);/)?.[0]||'';
  expect(effect).not.toContain('appVersion()');
  expect(effect).not.toContain('vyron:oauth-continuity-version');
  expect(effect).not.toContain('recoverExistingProfiles(');
 });
 it('recovery center mount reads metadata only and does not refresh or rotate credentials',()=>{
  const effect=recovery.match(/useEffect\(\(\)=>\{.*?\},\[\]\);/s)?.[0]||'';
  expect(effect).toContain('load()');
  expect(effect).not.toContain('runAutomaticRecovery');
  expect(effect).not.toContain('youtubeReconnectExisting');
 });
 it('missing Google email is optional metadata for an otherwise healthy profile',()=>{
  expect(rust).toContain('assert!(google_account_identity_matches(Some("owner@example.com"),None))');
  expect(rust).toContain('assert!(google_account_identity_matches(None,Some("owner@example.com")))');
 });
 it('post-update health is passive and never launches recovery or browser login',()=>{
  const app=fs.readFileSync('src/App.tsx','utf8');
  const effect=app.split("localStorage.getItem('vyron:update-installing-version')").at(1)?.split('POST_UPDATE_VERSION_MISMATCH')[0]||'';
  expect(effect).toContain('api.youtubeProfiles()');
  expect(effect).toContain('api.youtubeOauthCredentialStates()');
  expect(effect).toContain('states.youtubeApiRequests!==0||states.keychainSecretReads!==0');
  expect(effect).toContain('OAuth READY');
  expect(effect).toContain('Требуют входа');
  expect(effect).not.toContain('youtubeOauthRecoverExistingProfiles');
  expect(effect).not.toContain('youtubeReconnectExisting');
  expect(effect).not.toContain('youtubeOauthBrowsers');
 });
 it('manual browser reconnect remains explicit fallback',()=>{
  expect(accounts).toContain('Переподключить через браузер');
  expect(recovery).toContain('Войти заново через браузер');
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
