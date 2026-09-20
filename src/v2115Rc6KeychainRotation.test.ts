import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {humanizeError} from './errorCenter';
const read=(p:string)=>fs.readFileSync(p,'utf8');

describe('VYRON 2.1.15 RC6 Keychain AuthFailed rotation',()=>{
 it('stores backward-compatible active account pointers without secret values',()=>{
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('refresh_token_accounts:HashMap<String,String>');
  expect(y).toContain('profile_refresh_token_account_from_state');
  expect(y).toContain('oauth.{profile_id}.{kind}.v2.{generation}');
  expect(y).toContain('credential_rotated_at');
 });
 it('reconnect validates first then uses account-aware rotation and pointer commit',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const body=y.split('pub async fn youtube_oauth_reconnect_existing').at(1)!.split('#[cfg(test)]')[0];
  expect(body).toContain('reconnect_refresh_smoke');
  expect(body).toContain('reconnect_authorized_channel_matches');
  expect(body).toContain('reconnect_apply_validated_accounts_with');
  expect(body).toContain('apply_reconnect_pointer_metadata');
  expect(body).toContain('write_keychain_migration_v2(&app,&pointer_next)');
  expect(body).toContain('canonical_verify_secret(&persisted_refresh_account');
  expect(body).not.toContain('reconnect_apply_validated_with(\n        &secrets,&mut next_store');
 });
 it('new channel requires genuine backend readback before metadata save',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const body=y.split('pub async fn youtube_oauth_connect(').at(1)!.split('fn reconnect_profile_id')[0];
  expect(body).toContain('canonical_verify_secret(&refresh_account,&refresh)');
  expect(body.indexOf('canonical_verify_secret(&refresh_account,&refresh)')).toBeLessThan(body.indexOf('write_oauth_metadata(&store_path(&app)?,&s)'));
  expect(body).toContain('NEW_ITEM_READBACK_AUTH_FAILED');
 });
 it('fresh-item AuthFailed is a hard stop rather than a YouTube rejection',()=>{
  const h=humanizeError('NEW_ITEM_READBACK_AUTH_FAILED: stage=NEW_SECRET_READBACK; osstatus=-25293','oauth');
  expect(h.code).toBe('KEYCHAIN_NEW_ITEM_AUTH_FAILED');
  expect(h.title).toContain('Новая OAuth-запись');
  expect(h.message).toContain('остановил rotation');
  expect(h.title).not.toContain('YouTube отклонил');
 });
 it('old AuthFailed explains targeted secure rotation without password UI',()=>{
  const h=humanizeError('KEYCHAIN_AUTH_FAILED: account=oauth.p.refresh_token; osstatus=-25293','oauth');
  expect(h.code).toBe('KEYCHAIN_AUTH_FAILED');
  expect(h.title).toContain('старой OAuth-записи');
  expect(h.message).toContain('новую защищённую запись');
  expect(h.action).toBe('reconnect');
  const sec=read('src-tauri/src/security.rs');
  expect(sec).toContain('kSecUseAuthenticationUISkip');
 });
 it('rotation is journaled with a dedicated safe event',()=>{
  const types=read('src/types.ts'),core=read('src/activityJournalCore.ts'),ui=read('src/AccountsPage.tsx');
  expect(types).toContain("'OAUTH_CREDENTIAL_ROTATED'");
  expect(core).toContain("'OAUTH_CREDENTIAL_ROTATED'");
  expect(ui).toContain("eventType:'OAUTH_CREDENTIAL_ROTATED'");
  expect(ui).toContain('oldAccount:result.oldRefreshAccount');
  expect(ui).not.toContain('oldToken:');
  expect(ui).not.toContain('newToken:');
 });
});
