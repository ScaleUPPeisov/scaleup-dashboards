import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

const read=(p:string)=>fs.readFileSync(p,'utf8');

describe('VYRON RC4 statistics OAuth continuity contracts',()=>{
 it('GLOBAL credentials JSON is import-only input, never a runtime file dependency',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const start=y.indexOf('pub fn youtube_google_config_import'),end=y.indexOf('pub async fn youtube_oauth_connect_global',start),block=y.slice(start,end);
  expect(block).toContain('json_text: String');
  expect(block).toContain('parse_google_credentials_json(&json_text)');
  expect(block).toContain('canonical_set_secret(&new_account,&client_secret)');
  expect(block).toContain('canonical_verify_secret(&new_account,&client_secret)');
  expect(block).toContain('client_secret:String::new()');
  expect(block).toContain('client_secret_account:new_account.clone()');
  expect(block).not.toContain('file_path');
  expect(block).not.toContain('read_to_string');
 });

 it('normal OAuth reconnect/runtime loads secure config rather than original JSON',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const start=y.indexOf('pub async fn youtube_oauth_connect_global'),end=y.indexOf('fn youtube_channel_statistics_value',start),block=y.slice(start,end);
  expect(block).toContain('load_or_migrate_google_config(&app)');
  expect(block).not.toContain('credentials.json read');
  expect(block).not.toContain('file_path');
 });

 it('statistics operations never invoke Finder, credentials import, OAuth connect, or mass reconnect',()=>{
  for(const path of ['src/StatisticsCenter.tsx','src/youtubeChannelStatsRuntime.ts','src/ChannelStatisticsScheduler.tsx']){
   const s=read(path);
   for(const x of ['youtubeImportGoogleConfig','youtubeImportProfileCredentials','youtubeConnectGlobal','youtubeReconnectExisting','open({','file.current'])expect(s).not.toContain(x);
  }
 });

 it('file picker remains explicitly owned by Accounts UI import/repair controls',()=>{
  const accounts=read('src/AccountsPage.tsx');
  expect(accounts).toContain('type="file"');
  expect(accounts).toContain("onClick={()=>file.current?.click()}");
  expect(accounts).toContain('Импортировать credentials.json');
  expect(accounts).toContain('Восстановить OAuth Client');
  const stats=read('src/StatisticsCenter.tsx');
  expect(stats).not.toContain('credentials.json');
 });

 it('operational OAuth READY still requires a readable secure secret',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const a=y.indexOf('fn google_config_operational_status_value'),b=y.indexOf('#[derive(Debug, Clone, Deserialize, Default)]',a),block=y.slice(a,b);
  expect(block).toContain('oauthReady":configured&&operational');
  expect(block).toContain('secretOperational":operational');
  expect(block).toContain('repairRequired":configured&&!operational');
  expect(block).toContain('NEEDS_SECURE_STORAGE_REPAIR');
 });

 it('passive profile metadata remains visible without bulk secret reads',()=>{
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('thirty_one_profiles_passive_enumeration_zero_secret_reads');
  expect(y).toContain('hundred_passive_navigation_models_zero_secret_reads');
  expect(y).toContain('selected_profile_hydration_reads_only_selected_secret');
 });

 it('canonical Keychain access keeps password UI disabled',()=>{
  const security=read('src-tauri/src/security.rs');
  expect(security).toContain('SecKeychain::disable_user_interaction()');
  expect(security).toContain('kSecUseAuthenticationUI');
  expect(security).toContain('Skip');
 });

 it('bundle identity and updater endpoints stay unchanged by Statistics Center',()=>{
  const conf=JSON.parse(read('src-tauri/tauri.conf.json'));
  expect(conf.identifier).toBe('studio.channelflow.desktop');
  expect(conf.plugins.updater.endpoints).toEqual([
   'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json',
   'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json'
  ]);
 });

 it('one broken profile is isolated instead of invalidating global config',()=>{
  const runtime=read('src/youtubeChannelStatsRuntime.ts');
  expect(runtime).toContain("BLOCKED_STATS_CREDENTIAL_STATES");
  expect(runtime).toContain("'KEYCHAIN_BLOCKED'");
  expect(runtime).toContain("'RECONNECT_REQUIRED'");
  expect(runtime).toContain('planStatisticsBatchDrivers');
  expect(runtime).toContain('credentialFailures.push');
  expect(runtime).toContain('for(const driver of plan.candidates)');
  expect(runtime).not.toContain('youtubeDisconnect');
 });

 it('restart continuity is modeled by canonical refresh-token lookup, not browser login',()=>{
  const y=read('src-tauri/src/youtube.rs');
  expect(y).toContain('canonical_refresh_restart_model_never_enumerates_legacy');
  expect(y).toContain('refresh_token');
  expect(y).toContain('canonical_get_secret_cached');
 });
});
