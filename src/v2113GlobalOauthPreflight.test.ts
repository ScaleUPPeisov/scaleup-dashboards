import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 2.1.13 global OAuth preflight',()=>{
 it('physical 2.1.12 bug: client id without global secret must not open browser',()=>{
  const accounts=read('src/AccountsPage.tsx');
  expect(accounts).toContain("if(!config?.readyForOAuth)");
  expect(accounts).toContain("file.current?.click()");
  const guard=accounts.indexOf("if(!config?.readyForOAuth)");
  const browsers=accounts.indexOf("api.youtubeOauthBrowsers()");
  expect(guard).toBeGreaterThan(-1);
  expect(browsers).toBeGreaterThan(guard);
 });
 it('backend global connect blocks missing secret before oauth connect',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const block=y.split('pub async fn youtube_oauth_connect_global(',2)[1]?.split('#[tauri::command]',2)[0]||'';
  expect(block).toContain('if c.client_secret.trim().is_empty()');
  expect(block).toContain('OAUTH_CLIENT_SETUP_REQUIRED');
  expect(block.indexOf('if c.client_secret.trim().is_empty()')).toBeLessThan(block.indexOf('youtube_oauth_connect(app'));
 });
 it('OAuth readiness requires both client id and client secret metadata',()=>{
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('let ready_for_oauth=configured&&c.client_secret_present;');
  const api=read('src/api.ts');
  expect(api).toContain('readyForOAuth:boolean');
 });
 it('credentials are one global setup, not one file per channel',()=>{
  const accounts=read('src/AccountsPage.tsx');
  const recovery=read('src/AuthRecoveryCenter.tsx');
  expect(accounts).toContain('credentials.json нужен один раз для самого VYRON OAuth Client');
  expect(recovery).toContain('GLOBAL GOOGLE CONFIG один раз');
  expect(recovery).not.toContain('youtubeImportProfileCredentials(r.profileId)');
 });
 it('successful add-channel path keeps channel based profile reuse contract',()=>{
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain("find(|p|p.channel_id.as_deref()==Some(channel_id.as_str()))");
  expect(y).toContain('let profile_id=reconnect_profile_id(existing.as_ref());');
  expect(y).toContain('set_profile_migration_state(&app,&profile.id,MIGRATION_MIGRATED)');
  expect(y).toContain('record_profile_credential_validation(&app,&profile.id,"PASS"');
 });
});
