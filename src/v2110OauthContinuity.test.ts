import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 2.1.10 OAuth truth and update continuity contracts',()=>{
 it('Settings never derives CONNECTED from raw inventory presence',()=>{
  const core=read('src/authRecoveryFinalCore.ts');
  const ui=read('src/AuthRecoveryCenter.tsx');
  expect(core).not.toContain("read==='PASS'||read==='NOT_RUN'");
  expect(core).not.toContain('refresh_token_account');
  expect(ui).toContain('youtubeOauthCredentialStates');
  expect(ui).not.toContain('security_oauth_inventory');
  expect(ui).not.toContain('refresh_token_account');
 });
 it('credential ABI is version-independent and stable',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const sec=read('src-tauri/src/security.rs');
  const tauri=JSON.parse(read('src-tauri/tauri.conf.json'));
  expect(tauri.identifier).toBe('studio.channelflow.desktop');
  expect(sec).toContain('pub const CANONICAL_SERVICE:&str="com.scaleup.vyron.security.v2"');
  expect(y).toContain('const CREDENTIAL_SCHEMA_VERSION:u32=2;');
  expect(y).toContain('format!("oauth.{id}.{kind}")');
  expect(y).not.toContain('com.scaleup.vyron.security.2.1.9');
  expect(y).not.toContain('com.scaleup.vyron.security.2.1.10');
 });
 it('authoritative resolver is local-only and secret-free',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const api=read('src/api.ts');
  expect(y).toContain('pub fn youtube_oauth_credential_states');
  expect(y).toContain('"secretValuesIncluded":false');
  expect(y).toContain('"youtubeApiRequests":0');
  expect(y).toContain('"keychainSecretReads":0');
  expect(api).toContain("invoke<OAuthCredentialStatesResponse>('youtube_oauth_credential_states')");
 });
 it('legacy-only profile cannot be CONNECTED',()=>{
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('if legacy_present||migration_state==MIGRATION_RECONNECT_REQUIRED');
  expect(y).toContain('return("RECONNECT_REQUIRED"');
  expect(y).toContain('CANONICAL_PRESENT_UNVERIFIED');
 });
 it('refresh tokens remain non-plaintext and canonical-only',()=>{
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('#[serde(default, skip_serializing)]\n    refresh_token: String');
  expect(y).toContain('security::canonical_set_secret');
  expect(y).not.toContain('security::legacy_get_secret_once');
 });
 it('app version bumps do not change the credential namespace',()=>{
  const packageVersion=JSON.parse(read('package.json')).version;
  const tauriVersion=JSON.parse(read('src-tauri/tauri.conf.json')).version;
  const cargo=read('src-tauri/Cargo.toml');
  expect(tauriVersion).toBe(packageVersion);
  expect(cargo).toContain(`version = "${packageVersion}"`);
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('keychain-migration-v2.json');
  expect(y).toContain('validations:HashMap<String,CredentialValidationV2State>');
  expect(y).toContain('oauth_key("P1","client_secret")');
 });
});
