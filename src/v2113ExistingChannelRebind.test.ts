import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 2.1.13 existing channel rebind',()=>{
 it('accounts page does not call a profile count connected',()=>{
  const ui=read('src/AccountsPage.tsx');
  expect(ui).toContain('OAuth profiles');
  expect(ui).not.toContain("${profiles.length} подключено");
 });
 it('new channel OAuth is gated by complete GLOBAL OAuth config without hiding Add Channel',()=>{
  const ui=read('src/AccountsPage.tsx');
  expect(ui).toContain("if(!readiness.oauthReady)");
  expect(ui).toContain('setOauthSetupOpen(true)');
  const start=ui.indexOf('async function askBrowser');
  const end=ui.indexOf('async function connect',start);
  expect(ui.slice(start,end)).not.toContain("file.current?.click()");
  expect(ui).toContain('>+ Добавить канал</button>');
  expect(ui).not.toContain("oauthReady?'+ Добавить канал':'Настроить OAuth Client'");
 });
 it('existing profile reconnect shows target identity before explicit browser OAuth',()=>{
  const ui=read('src/AccountsPage.tsx');
  expect(ui).toContain('Переподключить через браузер');
  expect(ui).toContain('setPreReconnectProfileId(profileId)');
  expect(ui).toContain('Expected YouTube Channel ID');
  expect(ui).toContain('Выбрать браузер и продолжить');
  expect(ui).toContain('youtubeReconnectExisting(profileId,browserChoice)');
 });
 it('one global OAuth client config is reused while saved profiles recover automatically',()=>{
  const accounts=read('src/AccountsPage.tsx');
  const recovery=read('src/AuthRecoveryCenter.tsx');
  expect(accounts).toContain('credentials.json нужен один раз на весь VYRON');
  expect(recovery).toContain('api.youtubeGoogleConfig()');
  expect(recovery).toContain('api.youtubeOauthRecoverExistingProfiles()');
  expect(recovery).not.toContain('youtubeImportProfileCredentials(profileId)');
 });
 it('backend blocks browser OAuth when global secret is absent',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const global=y.split('pub async fn youtube_oauth_connect_global(',2)[1]?.split('#[tauri::command]',2)[0]||'';
  expect(global).toContain('OAUTH_CLIENT_SETUP_REQUIRED');
  expect(global).toContain('c.client_secret.trim().is_empty()');
  expect(global.indexOf('c.client_secret.trim().is_empty()')).toBeLessThan(global.indexOf('youtube_oauth_connect('));
 });
 it('new-channel path never falls back to legacy migration and duplicate channels require explicit reconnect',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const connect=y.split('async fn youtube_oauth_connect(',2)[1]?.split('pub fn youtube_oauth_select_new_channel',2)[0]||'';
  const commit=y.split('fn commit_new_channel_oauth(',2)[1]?.split('#[tauri::command]\npub async fn youtube_oauth_connect(',2)[0]||'';
  expect(connect).not.toContain('migrate_profile_refresh_to_canonical');
  expect(connect).toContain('OAUTH_REFRESH_TOKEN_REQUIRED');
  expect(connect).toContain('CHANNEL_SELECTION_REQUIRED');
  expect(commit).toContain('YOUTUBE_CHANNEL_ALREADY_CONNECTED');
  expect(commit).toContain('let profile_id=reconnect_profile_id(None);');
  const reconnect=y.split('pub async fn youtube_oauth_reconnect_existing').at(1)!.split('#[cfg(test)]')[0];
  const fallback=reconnect.split('let response_refresh=tv.get("refresh_token").and_then(Value::as_str);').at(1)!.split('let refresh=reconnect_refresh_token(response_refresh,existing_refresh.as_deref())')[0];
  expect(reconnect).toContain('let response_refresh=tv.get("refresh_token").and_then(Value::as_str);');
  expect(reconnect).toContain('let google_returned_new_refresh=response_refresh.map(str::trim).filter(|x|!x.is_empty()).is_some();');
  expect(reconnect).toContain('let existing_refresh=if google_returned_new_refresh');
  expect(fallback).toContain('let active_refresh_account=profile_refresh_token_account(&app,&profile_id)?;');
  expect(fallback).toContain('security::canonical_get_secret_cached(&active_refresh_account)');
  expect(fallback).not.toContain('canonical_get_secret_cached(&oauth_key(&profile_id,"refresh_token"))');
  expect(reconnect).toContain('let refresh=reconnect_refresh_token(response_refresh,existing_refresh.as_deref())');
 });
});
