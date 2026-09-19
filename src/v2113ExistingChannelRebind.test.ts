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
 it('existing profile has direct browser-first reconnect action',()=>{
  const ui=read('src/AccountsPage.tsx');
  expect(ui).toContain('Переподключить');
  expect(ui).toContain('youtubeReconnectExisting(reconnectId,browser)');
  expect(ui).toContain('Выберите браузер для переподключения');
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
 it('new-channel path never falls back to legacy migration and duplicate channels require explicit reconnect',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const connect=y.split('async fn youtube_oauth_connect(',2)[1]?.split('fn reconnect_profile_id',2)[0]||'';
  expect(connect).not.toContain('migrate_profile_refresh_to_canonical');
  expect(connect).toContain('YOUTUBE_CHANNEL_ALREADY_CONNECTED');
  expect(connect).toContain('OAUTH_REFRESH_TOKEN_REQUIRED');
  expect(y).toContain('existing_refresh=security::canonical_get_secret_cached');
 });
});
