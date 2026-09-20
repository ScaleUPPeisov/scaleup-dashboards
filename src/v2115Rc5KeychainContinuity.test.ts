import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Channel,YoutubeProfile} from './types';
import {api} from './api';
import {humanizeError} from './errorCenter';
import {classifyYoutubeChannels} from './youtubeStatisticsCenter';
import {planStatisticsBatchDrivers,requestBatchWithDriverRotation} from './youtubeChannelStatsRuntime';
import fs from 'node:fs';

const channel=(n:number):Channel=>({
 id:'c'+n,name:'Channel '+n,slug:'channel-'+n,cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
 youtubeProfileId:'p'+n,youtubeChannelId:'UC'+String(n).padStart(4,'0'),seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}
});
const profile=(n:number,status:YoutubeProfile['credentialStatus']):YoutubeProfile=>({id:'p'+n,channelId:'UC'+String(n).padStart(4,'0'),channelTitle:'Channel '+n,credentialStatus:status});

describe('VYRON 2.1.15 RC5 Keychain / profile continuity',()=>{
 afterEach(()=>vi.restoreAllMocks());

 it('13 profiles: 5 usable + 8 blocked still plans all 13 basic channel IDs with only 5 OAuth driver candidates',()=>{
  const channels=Array.from({length:13},(_,i)=>channel(i+1));
  const profiles=Array.from({length:13},(_,i)=>profile(i+1,i<5?'READY':'KEYCHAIN_BLOCKED'));
  const rows=classifyYoutubeChannels(channels,profiles).eligible;
  const plan=planStatisticsBatchDrivers(rows);
  expect(plan.channelIds).toHaveLength(13);
  expect(plan.candidates).toHaveLength(5);
  expect(plan.blocked).toHaveLength(8);
 });

 it('all 13 blocked performs zero YouTube statistics requests and returns factual credential failures',async()=>{
  const channels=Array.from({length:13},(_,i)=>channel(i+1));
  const profiles=Array.from({length:13},(_,i)=>profile(i+1,'KEYCHAIN_BLOCKED'));
  const rows=classifyYoutubeChannels(channels,profiles).eligible;
  const spy=vi.spyOn(api,'youtubeChannelStatisticsBatch');
  const result=await requestBatchWithDriverRotation(rows,'stats-all-blocked');
  expect(spy).not.toHaveBeenCalled();
  expect(result.batch.apiRequests).toBe(0);
  expect(result.credentialFailures).toHaveLength(13);
  expect(result.driverProfileId).toBeUndefined();
 });

 it('one usable OAuth driver can batch basic stats for channels whose own profile token is blocked',async()=>{
  const channels=Array.from({length:13},(_,i)=>channel(i+1));
  const profiles=Array.from({length:13},(_,i)=>profile(i+1,i===0?'READY':'KEYCHAIN_BLOCKED'));
  const rows=classifyYoutubeChannels(channels,profiles).eligible;
  const spy=vi.spyOn(api,'youtubeChannelStatisticsBatch').mockResolvedValue({items:[],requested:13,found:0,missingChannelIds:[],apiRequests:1});
  const result=await requestBatchWithDriverRotation(rows,'stats-one-driver');
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith('p1',expect.arrayContaining(channels.map(x=>x.youtubeChannelId!)),'stats-one-driver');
  expect(result.credentialFailures).toHaveLength(12);
  expect(result.driverProfileId).toBe('p1');
 });

 it('Keychain cached denial is never presented as a YouTube rejection',()=>{
  const h=humanizeError('KEYCHAIN_ACCESS_DENIED_CACHED: canonical account=oauth.p1.refresh_token; originalCode=KEYCHAIN_INTERACTION_REQUIRED; originalOsstatus=-25308','youtube');
  expect(h.code).toBe('KEYCHAIN_ACCESS_DENIED');
  expect(h.title).toContain('OAuth-токен');
  expect(h.message).toContain('Запрос к YouTube не выполнялся');
  expect(h.title).not.toContain('YouTube отклонил');
  expect(h.action).toBe('safe-oauth-retry');
 });

 it('safe profile retry path never imports credentials.json or opens Google browser',()=>{
  const accounts=fs.readFileSync('src/AccountsPage.tsx','utf8');
  const safe=accounts.split('async function safeRetryProfile').at(1)!.split('async function checkAll')[0];
  const bulk=accounts.split('async function checkAll').at(1)!.split('const oauthReady')[0];
  for(const block of [safe,bulk]){
   expect(block).toContain('youtubeOauth');
   expect(block).not.toContain('youtubeImportGoogleConfig');
   expect(block).not.toContain('file.current');
   expect(block).not.toContain('askBrowser');
   expect(block).not.toContain('youtubeReconnectExisting');
  }
 });

 it('backend preflight happens before YouTube API emission and reconnect preserves profile identity',()=>{
  const yt=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
  const valid=yt.split('async fn valid_access_token').at(1)!.split('pub(crate) async fn access_token_and_scopes')[0];
  expect(valid.indexOf('require_canonical_refresh')).toBeGreaterThanOrEqual(0);
  expect(valid).not.toContain('emit_youtube_api_request');
  const reconnect=yt.split('fn reconnect_apply_validated_accounts_with').at(1)!.split('fn reconnect_apply_validated_with')[0];
  expect(reconnect).toContain('reconnect_authorized_channel_matches');
  expect(reconnect).toContain('reconnect_write_readback_accounts_with');
  const metadata=yt.split('fn reconnect_apply_profile_metadata').at(1)!.split('fn reconnect_apply_validated_accounts_with')[0];
  expect(metadata).toContain('before_ids');
  expect(metadata).toContain('OAUTH_PROFILE_MUTATION_GUARD');
 });

 it('canonical secure storage keeps plaintext OAuth secrets out of metadata and uses no-UI WhenUnlocked policy',()=>{
  const sec=fs.readFileSync('src-tauri/src/security.rs','utf8');
  const yt=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
  expect(sec).toContain('kSecUseAuthenticationUISkip');
  expect(sec).toContain('kSecAttrAccessibleWhenUnlocked');
  expect(sec).not.toContain('kSecAccessControlUserPresence');
  expect(yt).toMatch(/#\[serde\(default, skip_serializing\)\]\r?\n\s+refresh_token: String/);
  expect(yt).toMatch(/#\[serde\(default, skip_serializing\)\]\r?\n\s+access_token: String/);
  expect(yt).toMatch(/#\[serde\(default, skip_serializing\)\]\r?\n\s+client_secret: String/);
 });
});
