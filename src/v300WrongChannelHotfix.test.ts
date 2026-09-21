import {describe,expect,it} from 'vitest';import fs from 'node:fs';
describe('VYRON 3.0.0 WRONG_CHANNEL physical hotfix contracts',()=>{
 const rust=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
 const accounts=fs.readFileSync('src/AccountsPage.tsx','utf8');
 const recovery=fs.readFileSync('src/AuthRecoveryCenter.tsx','utf8');
 const api=fs.readFileSync('src/api.ts','utf8');
 const reconnect=rust.split('pub async fn youtube_oauth_reconnect_existing').at(1)?.split('#[cfg(test)]\nmod v2115_rc3_oauth_processing_tests')[0]||'';
 const connect=rust.split('pub async fn youtube_oauth_connect(').at(1)?.split('pub fn youtube_oauth_select_new_channel')[0]||'';
 it('existing reconnect finds exact expected identity across all returned rows',()=>{
  expect(reconnect).toContain('find_expected_channel_item(items,&expected_channel_id)');
  expect(reconnect).toContain('maxResults", "50');
 });
 it('wrong identity returns structured safe result before any credential write',()=>{
  const wrong=reconnect.split('return Ok(json!({').at(1)?.split('let authorized_channel_id')[0]||'';
  expect(wrong).toContain('"status":"WRONG_CHANNEL"');
  expect(wrong).toContain('"credentialsCommitted":false');
  expect(wrong).toContain('"refreshPointerChanged":false');
  expect(wrong).toContain('"clientSecretPointerChanged":false');
  expect(wrong).not.toContain('reconnect_apply_validated_accounts_with');
  expect(wrong).not.toContain('canonical_set_secret');
  expect(wrong).not.toContain('remember_access_token');
 });
 it('wrong-channel payload includes title handle thumbnail and duplicate profile information',()=>{
  expect(rust).toContain('fn channel_identity_value');
  expect(rust).toContain('"channelTitle":title');
  expect(rust).toContain('"handle":handle');
  expect(rust).toContain('"thumbnail":thumbnail');
  expect(rust).toContain('"existingProfileId"');
 });
 it('normal UI shows expected channel before OAuth and human-readable wrong-channel modal',()=>{
  expect(accounts).toContain('ПЕРЕПОДКЛЮЧЕНИЕ СУЩЕСТВУЮЩЕГО ПРОФИЛЯ');
  expect(accounts).toContain('Expected YouTube Channel ID');
  expect(accounts).toContain('Выбран другой YouTube-канал');
  expect(accounts).toContain('Попробовать ещё раз');
  expect(accounts).toContain('Выбрать другой браузер');
  expect(accounts).toContain('Открыть YouTube');
  expect(recovery).toContain('Выбран другой YouTube-канал');
 });
 it('open YouTube action does not start OAuth',()=>{
  expect(rust).toContain('pub fn youtube_oauth_open_youtube');
  expect(rust).toContain('open_browser("https://www.youtube.com/"');
  expect(rust).toContain('"oauthStarted":false');
 });
 it('new-channel connect never blindly commits items.first for multiple identities',()=>{
  expect(connect).not.toContain('.and_then(|a| a.first())');
  expect(connect).toContain('if items.len()==1');
  expect(connect).toContain('CHANNEL_SELECTION_REQUIRED');
  expect(connect).toContain('PendingNewOAuth');
  expect(connect).not.toContain('canonical_set_secret');
  expect(connect).not.toContain('write_oauth_metadata');
 });
 it('multi-identity pending transaction commits only after explicit channel selection',()=>{
  expect(rust).toContain('pub fn youtube_oauth_select_new_channel');
  expect(rust).toContain('OAUTH_CHANNEL_SELECTION_INVALID');
  expect(rust).toContain('pub fn youtube_oauth_cancel_new_channel_selection');
  expect(accounts).toContain('Какой YouTube-канал добавить?');
  expect(accounts).toContain('VYRON ничего не сохранил до вашего выбора');
  expect(api).toContain('youtubeSelectNewChannel');
 });
 it('OAuth still forces account choice and offline consent',()=>{
  expect(rust).toContain('select_account consent');
  expect(rust).toContain('access_type=offline');
  expect(rust).toContain('include_granted_scopes=true');
 });
});
