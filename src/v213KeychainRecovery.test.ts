import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {humanizeError} from './errorCenter';
import {testFilePath} from './testFilePath';
const read=(p:string)=>readFileSync(testFilePath(p,import.meta.url),'utf8');

describe('VYRON 2.1.9 RC7 per-query no-UI Keychain recovery contracts',()=>{
 it('maps Keychain authentication failures to an actionable error',()=>{
  const h=humanizeError('KEYCHAIN_AUTH_FAILED: osstatus=-25293','storage');
  expect(h.code).toBe('KEYCHAIN_AUTH_FAILED');
  expect(h.title).toContain('Keychain');
  expect(h.message).toContain('переподключение Google');
  expect(h.action).toBe('reconnect');
 });
 it('maps canceled and interaction-required Keychain states separately',()=>{
  const canceled=humanizeError('KEYCHAIN_USER_CANCELED: osstatus=-128','storage');
  const blocked=humanizeError('KEYCHAIN_INTERACTION_REQUIRED: osstatus=-25308','storage');
  expect(canceled.code).toBe('KEYCHAIN_CANCELED');
  expect(canceled.action).toBe('reconnect');
  expect(blocked.code).toBe('KEYCHAIN_INTERACTION_BLOCKED');
  expect(blocked.action).toBe('reconnect');
  expect(blocked.message).toContain('не показывает системный запрос пароля');
 });
 it('connects Diagnostics UI to a registered Tauri Keychain probe',()=>{
  const api=read('./api.ts'),ui=read('./SettingsOS.tsx'),rust=read('../src-tauri/src/security.rs'),lib=read('../src-tauri/src/lib.rs');
  expect(api).toContain("invoke<KeychainDiagnostic>('security_keychain_diagnostics')");
  expect(ui).toContain('runKeychainDiagnostics');
  expect(ui).toContain('Проверить Keychain');
  expect(ui).toContain('Пассивная проверка NO-UI policy');
  expect(ui).not.toContain('macOS может показать системный запрос пароля');
  expect(rust).toContain('pub fn security_keychain_diagnostics');
  const start=lib.indexOf('tauri::generate_handler!['),end=lib.indexOf('])',start),handler=lib.slice(start,end);
  expect(handler).toContain('security::security_keychain_diagnostics');
  expect((handler.match(/security::security_keychain_diagnostics/g)||[]).length).toBe(1);
 });
 it('keeps state autosave non-secret and best-effort when Keychain is unavailable',()=>{
  const storage=read('../src-tauri/src/storage.rs'),store=read('./store.ts');
  expect(storage).toContain('secure_state_for_disk_best_effort');
  expect(storage).toContain('securityWarning');
  expect(storage).toContain('canonical_set_secret');
  expect(storage).not.toContain('security::set_secret_for_autosave');
  expect(storage).not.toContain('security::set_secret(account');
  expect(storage).toContain('sanitized_state_for_disk');
  expect(store).toContain("operationId:'keychain-autosave-warning'");
  expect(store).toContain('notifyWarning');
  const security=read('../src-tauri/src/security.rs');
  expect(security).toContain('KEYCHAIN_ACCESS_BLOCKED');
  expect(security).toContain('SecKeychain::disable_user_interaction()');
  expect(security).toContain('kSecUseAuthenticationUISkip');
  expect(security).toContain('skip_authenticated_items(true)');
  expect(security).not.toContain('get_generic_password(');
  expect(security).not.toContain('set_generic_password(');
  expect(security).toContain('INTERACTIVE_UI_REQUESTS_BLOCKED');
 });
});
