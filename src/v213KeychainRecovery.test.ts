import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {humanizeError} from './errorCenter';
const read=(p:string)=>readFileSync(decodeURIComponent(new URL(p,import.meta.url).pathname),'utf8');

describe('VYRON 2.0.13 Keychain recovery contracts',()=>{
 it('maps Keychain authentication failures to an actionable error',()=>{
  const h=humanizeError('KEYCHAIN_AUTH_FAILED: osstatus=-25293','storage');
  expect(h.code).toBe('KEYCHAIN_AUTH_FAILED');
  expect(h.title).toContain('Связке ключей');
  expect(h.message).toContain('Настройки → Диагностика');
 });
 it('maps canceled and interaction-required Keychain states separately',()=>{
  expect(humanizeError('KEYCHAIN_USER_CANCELED: osstatus=-128','storage').code).toBe('KEYCHAIN_CANCELED');
  expect(humanizeError('KEYCHAIN_INTERACTION_REQUIRED: osstatus=-25308','storage').code).toBe('KEYCHAIN_LOCKED');
 });
 it('connects Diagnostics UI to a registered Tauri Keychain probe',()=>{
  const api=read('./api.ts'),ui=read('./SettingsOS.tsx'),rust=read('../src-tauri/src/security.rs'),lib=read('../src-tauri/src/lib.rs');
  expect(api).toContain("invoke<KeychainDiagnostic>('security_keychain_diagnostics')");
  expect(ui).toContain('runKeychainDiagnostics');
  expect(ui).toContain('Проверить Keychain');
  expect(rust).toContain('pub fn security_keychain_diagnostics');
  const start=lib.indexOf('tauri::generate_handler!['),end=lib.indexOf('])',start),handler=lib.slice(start,end);
  expect(handler).toContain('security::security_keychain_diagnostics');
  expect((handler.match(/security::security_keychain_diagnostics/g)||[]).length).toBe(1);
 });
 it('keeps state autosave non-secret and best-effort when Keychain is unavailable',()=>{
  const storage=read('../src-tauri/src/storage.rs'),store=read('./store.ts');
  expect(storage).toContain('secure_state_for_disk_best_effort');
  expect(storage).toContain('securityWarning');
  expect(storage).toContain('set_secret_for_autosave');
  expect(storage).toContain('sanitized_state_for_disk');
  expect(store).toContain("operationId:'keychain-autosave-warning'");
  expect(store).toContain('notifyWarning');
  const security=read('../src-tauri/src/security.rs');
  expect(security).toContain('KEYCHAIN_ACCESS_BLOCKED');
  expect(security).toContain('KEYCHAIN_AUTOSAVE_PAUSED');
 });
});
