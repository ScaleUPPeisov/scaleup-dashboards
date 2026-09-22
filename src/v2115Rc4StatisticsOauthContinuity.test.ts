import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import {planStatisticsBatchDrivers} from './youtubeChannelStatsRuntime';

const read=(p:string)=>fs.readFileSync(p,'utf8');
const linked=(id:string,state:string)=>({
 channel:{id:'local-'+id,name:'Channel '+id,youtubeProfileId:'profile-'+id,youtubeChannelId:'UC-'+id},
 profile:{id:'profile-'+id,channelId:'UC-'+id,credentialStatus:state},
 youtubeChannelId:'UC-'+id
} as any);

describe('VYRON statistics/OAuth continuity behavior',()=>{
 it('credentials import persists the global client into the encrypted vault before reporting READY',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const start=y.indexOf('pub fn youtube_google_config_import'),end=y.indexOf('pub async fn youtube_oauth_connect_global',start),block=y.slice(start,end);
  expect(block).toContain('oauth_vault::set_global_client');
  expect(block).toContain('oauth_vault::global_client_secret');
  expect(block).toContain('OAUTH_VAULT_READBACK_FAILED');
  expect(block).not.toContain('file_path');
 });

 it('normal OAuth reconnect/runtime loads saved secure config rather than the original credentials file',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const start=y.indexOf('pub async fn youtube_oauth_connect_global'),end=y.indexOf('fn youtube_channel_statistics_value',start),block=y.slice(start,end);
  expect(block).toContain('load_or_migrate_google_config(&app)');
  expect(block).not.toContain('read_to_string');
 });

 it('manual credentials import remains available only from account/recovery UI',()=>{
  const api=read('src/api.ts'),accounts=read('src/AccountsPage.tsx'),recovery=read('src/AuthRecoveryCenter.tsx');
  expect(api).toContain('youtubeImportGoogleConfig');
  expect(accounts).toContain('type="file"');
  expect(recovery).toContain('type="file"');
  for(const path of ['src/StatisticsCenter.tsx','src/youtubeChannelStatsRuntime.ts','src/ChannelStatisticsScheduler.tsx']){
   const s=read(path);
   expect(s).not.toContain('youtubeImportGoogleConfig');
   expect(s).not.toContain('youtubeReconnectExisting');
  }
 });

 it('statistics does not use NOT_CHECKED or recoverable credentials as API drivers',()=>{
  const plan=planStatisticsBatchDrivers([
   linked('ready','READY'),
   linked('unchecked','NOT_CHECKED'),
   linked('recoverable','RECOVERABLE_KEYCHAIN_BLOCKED'),
   linked('login','RECONNECT_REQUIRED')
  ]);
  expect(plan.candidates.map(x=>x.profile.id)).toEqual(['profile-ready']);
  expect(plan.blocked.map(x=>x.profileId).sort()).toEqual([
   'profile-login','profile-recoverable','profile-unchecked'
  ]);
 });

 it('all non-operational credentials result in zero statistics API drivers',()=>{
  const plan=planStatisticsBatchDrivers([
   linked('a','NOT_CHECKED'),
   linked('b','KEYCHAIN_BLOCKED'),
   linked('c','MISSING')
  ]);
  expect(plan.candidates).toHaveLength(0);
  expect(plan.blocked).toHaveLength(3);
  expect(plan.channelIds).toHaveLength(3);
 });

 it('statistics source never invokes Finder, OAuth connect, or mass reconnect',()=>{
  for(const path of ['src/StatisticsCenter.tsx','src/youtubeChannelStatsRuntime.ts','src/ChannelStatisticsScheduler.tsx']){
   const s=read(path);
   for(const x of ['youtubeImportProfileCredentials','youtubeConnectGlobal','youtubeReconnectExisting','open({','file.current'])expect(s).not.toContain(x);
  }
 });

 it('bundle identity and stable updater endpoints remain unchanged',()=>{
  const conf=JSON.parse(read('src-tauri/tauri.conf.json'));
  expect(conf.identifier).toBe('studio.channelflow.desktop');
  expect(conf.plugins.updater.endpoints).toEqual([
   'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json',
   'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json'
  ]);
 });
});
