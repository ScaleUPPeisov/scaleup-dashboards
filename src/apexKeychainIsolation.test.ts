import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('APEX Keychain isolation',()=>{
 it('uses separate service names for current, legacy, and vault items',()=>{
  const source=readFileSync('src-tauri/src/security.rs','utf8');
  expect(source).toContain('const SERVICE:&str="com.scaleup.vyron.apex.security"');
  expect(source).toContain('pub const CANONICAL_SERVICE:&str="com.scaleup.vyron.apex.security.v2"');
  expect(source).toContain('pub const OAUTH_VAULT_SERVICE:&str="com.scaleup.vyron.apex.oauth-vault"');
  expect(source).not.toContain('const SERVICE:&str="com.scaleup.vyron.security"');
  expect(source).not.toContain('pub const OAUTH_VAULT_SERVICE:&str="com.scaleup.vyron.oauth-vault"');
 });
});
