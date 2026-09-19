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
  expect(ui).toContain("if(!profileId&&!config?.oauthReady)");
  expect(ui).toContain("file.current?.click()");
  expect(ui).toContain('>+ Добавить канал</button>');
  expect(ui).not.toContain("oauthReady?'+ Добавить канал':'Настроить OAuth Client'");
 });
 it('existing profile has direct browser-first reconnect action',()=>{
  const ui=read('src/AccountsPage.tsx');
  expect(ui).toContain('Переподключить');
  expect(ui).toContain('youtubeReconnectExisting(reconnectId,browser)');
  expect(ui).toContain('Через какой браузер переподключить этот канал?');
 });
 it('one credentials.json configures all channels, not one per profile',()=>{
  const accounts=read('src/AccountsPage.tsx');
  const recovery=read('src/AuthRecoveryCenter.tsx');
  expect(accounts).toContain('credentials.json нужен один раз на весь VYRON');
  expect(recovery).toContain('Настроить OAuth Client один раз');
  expect(recovery).not.toContain('youtubeImportProfileCredentials(profileId)');
 });
 it('backend blocks browser OAuth when global secret is absent',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const global=y.split('pub async fn youtube_oauth_connect_global(',2)[1]?.split('#[tauri::command]',2)[0]||'';
  expect(global).toContain('OAUTH_CLIENT_SETUP_REQUIRED');
  expect(global).toContain('c.client_secret.trim().is_empty()');
  expect(global.indexOf('c.client_secret.trim().is_empty()')).toBeLessThan(global.indexOf('youtube_oauth_connect('));
 });
 it('successful add/rebind path does not fall back to legacy migration after consent',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const connect=y.split('async fn youtube_oauth_connect(',2)[1]?.split('fn reconnect_profile_id',2)[0]||'';
  expect(connect).not.toContain('migrate_profile_refresh_to_canonical');
  expect(connect).toContain('canonical_get_secret_cached(&oauth_key(&profile_id,"refresh_token"))');
  expect(connect).toContain('OAUTH_REFRESH_TOKEN_REQUIRED');
 });
});
