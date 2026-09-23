import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 3.0.0 local auth continuity',()=>{
 it('keeps all manual OAuth fallbacks permanently available',()=>{
  const accounts=read('src/AccountsPage.tsx');
  const recovery=read('src/AuthRecoveryCenter.tsx');
  expect(accounts).toContain('Восстановить сохранённый доступ');
  expect(accounts).toContain('Заменить credentials.json');
  expect(accounts).toContain('Загрузить credentials.json');
  expect(accounts).toContain("?'Войти заново':'Переподключить'");
  expect(accounts).toContain('Переподключить через браузер');
  expect(recovery).toContain('Восстановить сохранённый доступ');
  expect(recovery).toContain('Заменить credentials.json');
  expect(recovery).toContain('Загрузить credentials.json');
  expect(recovery).toContain('Переподключить через браузер');
 });
 it('credentials import copies parsed values instead of retaining original file dependency',()=>{
  const rust=read('src-tauri/src/youtube.rs');
  const block=rust.split('pub fn youtube_google_config_import(',2)[1]?.split('#[tauri::command]',2)[0]||'';
  expect(block).toContain('parse_google_credentials_json');
  expect(block).toContain('oauth_vault::set_global_client');
  expect(block).not.toContain('file_path');
 });
 it('normal profile resolution remains local-vault first before legacy Keychain fallback',()=>{
  const rust=read('src-tauri/src/youtube.rs');
  const block=rust.split('fn require_canonical_refresh').at(1)?.split('fn canonical_global_client_secret')[0]||'';
  expect(block.indexOf('oauth_vault::profile_refresh')).toBeGreaterThanOrEqual(0);
  expect(block.indexOf('oauth_vault::profile_refresh')).toBeLessThan(block.indexOf('security::canonical_get_secret_cached'));
 });
 it('frontend can inspect persistent local auth storage without exposing secret values',()=>{
  const api=read('src/api.ts');
  expect(api).toContain('youtubeOauthLocalStorageStatus');
  expect(api).toContain('keychainRequiredForNormalStartup');
  expect(api).toContain('secretValuesIncluded');
 });
});
