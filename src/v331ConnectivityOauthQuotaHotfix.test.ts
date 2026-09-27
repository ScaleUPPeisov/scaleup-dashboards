import {beforeEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import {countConnectedYoutubeBindings,notifyYoutubeOauthStateChanged,YOUTUBE_OAUTH_STATE_CHANGED_EVENT} from './youtubeOauthState';
import {planStatisticsBatchDrivers,planStatisticsProjectBatches} from './youtubeChannelStatsRuntime';
import {bindYoutubeQuotaOperationProject,recordYoutubeApiRequest,youtubeOperationActualCost} from './youtubeQuota';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>storage.get(k)??null,
 setItem:(k:string,v:string)=>storage.set(k,String(v)),
 removeItem:(k:string)=>storage.delete(k),
 clear:()=>storage.clear(),
 key:(i:number)=>Array.from(storage.keys())[i]??null,
 get length(){return storage.size}
}});

const channel=(i:number,bound=true)=>({
 id:`c${i}`,name:`Fixture ${i}`,
 youtubeProfileId:bound?`p${i}`:undefined,
 youtubeChannelId:bound?`UC${i}`:undefined
} as any);
const profile=(i:number,status='NOT_CHECKED',clientIdMasked?:string)=>({
 id:`p${i}`,channelId:`UC${i}`,credentialStatus:status,clientIdMasked
} as any);
const linked=(i:number,status='READY',clientIdMasked?:string)=>({
 channel:channel(i,true),profile:profile(i,status,clientIdMasked),youtubeChannelId:`UC${i}`
} as any);

describe('VYRON 3.3.1 connectivity / OAuth / quota hotfix',()=>{
 beforeEach(()=>localStorage.clear());

 it('TEST 1 — connected count uses saved channel/profile bindings, not READY health',()=>{
  const channels=Array.from({length:31},(_,idx)=>channel(idx+1,idx<5));
  const profiles=[profile(1,'READY'),profile(2),profile(3),profile(4),profile(5)];
  expect(countConnectedYoutubeBindings(channels,profiles)).toBe(5);
  channels[5]={...channel(6,true)} as any;
  profiles.push(profile(6,'NOT_CHECKED'));
  expect(countConnectedYoutubeBindings(channels,profiles)).toBe(6);
 });

 it('TEST 2 — mutation event recomputes connected count immediately without reload/focus',()=>{
  const channels=Array.from({length:31},(_,idx)=>channel(idx+1,idx<5));
  let profiles=[profile(1,'READY'),profile(2),profile(3),profile(4),profile(5)];
  let displayed=countConnectedYoutubeBindings(channels,profiles);
  const target=new EventTarget();
  const oldWindow=(globalThis as any).window;
  Object.defineProperty(globalThis,'window',{configurable:true,value:target});
  target.addEventListener(YOUTUBE_OAUTH_STATE_CHANGED_EVENT,()=>{displayed=countConnectedYoutubeBindings(channels,profiles)});
  channels[5]={...channel(6,true)} as any;profiles=[...profiles,profile(6,'READY')];
  notifyYoutubeOauthStateChanged();
  expect(displayed).toBe(6);
  Object.defineProperty(globalThis,'window',{configurable:true,value:oldWindow});
 });

 it('TEST 3/4 — successful new OAuth/reconnect validation resolves to READY without changing identity',()=>{
  const backend=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
  expect(backend).toContain('record_profile_credential_validation(app,&profile.id,"PASS",Some(&channel_id),Some(&channel_id))?;');
  expect(backend).toContain('else if canonical_present{');
  expect(backend).toContain('else if validated_ready||base_credential_state=="CONNECTED"{"READY"}');
  const reconnectStart=backend.indexOf('pub async fn youtube_oauth_reconnect_existing');
  expect(reconnectStart).toBeGreaterThan(0);
  const reconnect=backend.slice(reconnectStart,reconnectStart+24000);
  expect(reconnect).toContain('profileUuidPreserved');
  expect(reconnect).not.toContain('remove_profile');
  expect(reconnect).not.toContain('youtube_oauth_disconnect');
 });

 it('TEST 5 — statistics batches are isolated by Google/OAuth project and unknown projects stay isolated',()=>{
  const config={projectId:'Project-A',clientIdMasked:'clientA12…aaaaaa'};
  const rows=[
   linked(1,'READY','clientA12…aaaaaa'),linked(2,'NOT_CHECKED','clientA12…aaaaaa'),
   linked(3,'READY','clientB34…bbbbbb'),linked(4,'NOT_CHECKED','clientB34…bbbbbb'),
   linked(5,'READY','clientC56…cccccc')
  ];
  const batches=planStatisticsProjectBatches(rows,config);
  expect(batches).toHaveLength(3);
  expect(batches.map(x=>x.entries.map(r=>r.youtubeChannelId))).toEqual([
   ['UC1','UC2'],['UC3','UC4'],['UC5']
  ]);
  expect(batches[0].projectKey).toBe('gcp:Project-A');
  expect(batches[1].projectKey).toContain('oauth-client:clientB34');
  expect(batches[2].projectKey).toContain('oauth-client:clientC56');

  const unknown=planStatisticsProjectBatches([linked(6,'NOT_CHECKED'),linked(7,'NOT_CHECKED')],null);
  expect(unknown).toHaveLength(2);
  expect(unknown.every(x=>x.entries.length===1&&x.projectKey===null)).toBe(true);
 });

 it('TEST 5 quota attribution — child operations retain independent project ownership',()=>{
  bindYoutubeQuotaOperationProject('stats:A','gcp:A');
  bindYoutubeQuotaOperationProject('stats:B','gcp:B');
  recordYoutubeApiRequest({method:'channels.list',operationId:'stats:A'});
  recordYoutubeApiRequest({method:'channels.list',operationId:'stats:B'});
  expect(youtubeOperationActualCost('stats:A').projectKey).toBe('gcp:A');
  expect(youtubeOperationActualCost('stats:B').projectKey).toBe('gcp:B');
  expect(youtubeOperationActualCost('stats:A').methods['channels.list'].calls).toBe(1);
  expect(youtubeOperationActualCost('stats:B').methods['channels.list'].calls).toBe(1);
 });

 it('TEST 6 — NOT_CHECKED is connected/use-time-validatable, not recovery-required',()=>{
  const plan=planStatisticsBatchDrivers([
   linked(1,'READY','clientA…aaaaaa'),
   linked(2,'NOT_CHECKED','clientA…aaaaaa')
  ]);
  expect(plan.candidates.map(x=>x.profile.id)).toEqual(['p1','p2']);
  expect(plan.blocked).toHaveLength(0);
 });

 it('TEST 7 — real blocked credential states remain blocked and never become drivers',()=>{
  const plan=planStatisticsBatchDrivers([
   linked(1,'KEYCHAIN_BLOCKED'),linked(2,'RECONNECT_REQUIRED'),linked(3,'MISSING'),linked(4,'WRONG_CHANNEL')
  ]);
  expect(plan.candidates).toHaveLength(0);
  expect(plan.blocked.map(x=>x.profileId).sort()).toEqual(['p1','p2','p3','p4']);
  const runtime=fs.readFileSync('src/youtubeChannelStatsRuntime.ts','utf8');
  expect(runtime).not.toContain('youtubeReconnectExisting');
  expect(runtime).not.toContain('youtubeConnectGlobal');
 });
});
