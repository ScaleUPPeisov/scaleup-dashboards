import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import cloud from '../src/index.mjs';
import { cronSlot, crossedMilestones, pacificDay, safeEvent, acceptedCommand } from '../src/core.mjs';
import { manualSlot, reserveQuota, scheduledSync } from '../src/sync.mjs';
import { startOAuth,callbackOAuth,authorizedProfiles,decryptSecret } from '../src/oauth.mjs';
import { importVyronProfiles } from '../src/oauth-import.mjs';
import { runAnalyticsBatch,runManualAnalyticsBatch,nextAnalyticsSlot,parseDailyReport } from '../src/google-analytics.mjs';
import { PUSH_CRON } from '../src/push.mjs';
import { validSubscription,registerPush,dispatchPush } from '../src/push.mjs';

class D1Query {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  run(){
    const r=this.db.native.prepare(this.sql).run(...this.args);
    return Promise.resolve({meta:{changes:Number(r.changes)}});
  }
  first(){
    const v=this.db.native.prepare(this.sql).get(...this.args);
    return Promise.resolve(v??null);
  }
  all(){
    const results=this.db.native.prepare(this.sql).all(...this.args);
    return Promise.resolve({results});
  }
}
class MockD1 {
  constructor(){
    this.native=new DatabaseSync(':memory:');
    this.native.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
    this.native.exec(readFileSync(new URL('../migrations/0002_analytics.sql',import.meta.url),'utf8'));
    this.native.exec(readFileSync(new URL('../migrations/0003_google_oauth.sql',import.meta.url),'utf8'));
    this.native.exec(readFileSync(new URL('../migrations/0004_webpush.sql',import.meta.url),'utf8'));
    this.native.exec(readFileSync(new URL('../migrations/0005_vyron_oauth_import.sql',import.meta.url),'utf8'));
    this.native.exec(readFileSync(new URL('../migrations/0006_analytics_reports.sql',import.meta.url),'utf8'));
  }
  prepare(sql){return new D1Query(this,sql);}
  async batch(stmts){
    this.native.exec('BEGIN');
    try {const result=[];for(const stmt of stmts) result.push(await stmt.run());
      this.native.exec('COMMIT');return result;
    }catch(e){this.native.exec('ROLLBACK');throw e;}
  }
}
const control='C'.repeat(50),agent='A'.repeat(50);
function env(){
  return { DB:new MockD1(),CONTROL_TOKEN:control,AGENT_TOKEN:agent,
    YOUTUBE_API_KEY:'MOCK_ONLY_API_KEY',QUOTA_DAILY_BUDGET:'200',
    ASSETS:{fetch:async()=>new Response('<html>OK</html>',{headers:{'Content-Type':'text/html'}})}
  };
}
function req(path,token,method='GET',body=undefined,origin=null){
  const headers={Authorization:'Bearer '+token};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(origin)headers.Origin=origin;
  return new Request('https://vyron-control.example'+path,{method,headers,
    body:body===undefined?undefined:JSON.stringify(body)});
}
const id=i=>'UC'+String(i).padStart(22,'0');

test('cron times use Krasnoyarsk but Google quota resets in Pacific',()=>{
  assert.equal(cronSlot('0 0 * * *',new Date('2026-11-13T00:00:00Z')),'2026-11-13@07:00');
  assert.equal(cronSlot('0 15 * * *',new Date('2026-11-13T15:00:00Z')),'2026-11-13@22:00');
  assert.equal(cronSlot('0 0 * * *',new Date('2026-11-13T00:01:00Z')),null);
  assert.equal(pacificDay(new Date('2026-11-13T00:00:00Z')),'2026-11-12');
  assert.equal(pacificDay(new Date('2026-11-13T15:00:00Z')),'2026-11-13');
  assert.deepEqual(crossedMilestones(null,330),[]);
  assert.deepEqual(crossedMilestones(100,330),[200,300]);
  assert.deepEqual(crossedMilestones(300,298),[]);
  assert.match(manualSlot(new Date('2026-11-13T15:00:00Z')),/^manual:/);
});

test('authenticated D1 bootstrap fills missing application tables idempotently',async()=>{
  const e=env();
  e.DB.native.exec('DROP TABLE push_deliveries');
  const denied=await cloud.fetch(new Request('https://vyron-control.example/api/admin/bootstrap',{
    method:'POST'
  }),e);
  assert.equal(denied.status,401);
  const first=await cloud.fetch(req('/api/admin/bootstrap',control,'POST',{}),e);
  assert.equal(first.status,200);
  const firstBody=await first.json();
  assert.equal(firstBody.ok,true);
  assert.deepEqual(firstBody.createdTables,['push_deliveries']);
  assert.equal(firstBody.presentTables,15);
  const second=await cloud.fetch(req('/api/admin/bootstrap',control,'POST',{}),e);
  assert.equal(second.status,200);
  const secondBody=await second.json();
  assert.equal(secondBody.ok,true);
  assert.equal(secondBody.created,false);
  const health=await cloud.fetch(new Request('https://vyron-control.example/api/health'),e);
  assert.equal(health.status,200);
});

test('owner can derive a Mac-only bridge token without adding another Cloudflare secret',async()=>{
  const e=env();
  delete e.AGENT_TOKEN;
  const issued=await cloud.fetch(req('/api/mac/agent-token',control,'POST',{}),e);
  assert.equal(issued.status,200);
  const payload=await issued.json();
  assert.match(payload.agentToken,/^[a-f0-9]{64}$/);
  assert.equal(payload.scope,'mac-telemetry-only');
  assert.notEqual(payload.agentToken,control);
  const heartbeat=await cloud.fetch(req('/api/agent/heartbeat',payload.agentToken,'POST',{
    deviceId:'macbook_m1',label:'MacBook M1',status:{macAwake:true}
  }),e);
  assert.equal(heartbeat.status,200);
  assert.equal((await cloud.fetch(req('/api/status',payload.agentToken),e)).status,401);
  const repeated=await cloud.fetch(req('/api/mac/agent-token',control,'POST',{}),e);
  assert.equal((await repeated.json()).agentToken,payload.agentToken);
  const denied=await cloud.fetch(req('/api/mac/agent-token','wrong-token','POST',{}),e);
  assert.equal(denied.status,401);
});

test('authorization, origin guard, static asset CSP and immutable endpoint behavior',async()=>{
  const e=env();
  const health=await cloud.fetch(new Request('https://vyron-control.example/api/health'),e);
  assert.equal(health.status,200);
  const healthBody=await health.json();
  assert.equal(healthBody.app,'vyron-control');
  assert.deepEqual(healthBody.d1,{bound:true,schema:true,expectedTables:15,presentTables:15});
  assert.equal((await cloud.fetch(req('/api/status','invalid'),e)).status,401);
  const good=await cloud.fetch(req('/api/status',control),e);
  assert.equal(good.status,200);
  const goodBody=await good.json();
  assert.equal(goodBody.channels.length,0);
  assert.equal(goodBody.integrations.youtubeDataApi,true);
  assert.equal(goodBody.integrations.googleOAuth,false);
  assert.equal((await cloud.fetch(new Request('https://vyron-control.example/api/health'),
    {...e,DB:null})).status,503);
  const blocked=await cloud.fetch(req('/api/channels',control,'POST',[{id:id(1)}],'https://attacker.invalid'),e);
  assert.equal(blocked.status,403);
  const asset=await cloud.fetch(new Request('https://vyron-control.example/'),e);
  const csp=asset.headers.get('Content-Security-Policy');
  assert.match(csp,/frame-ancestors/);
  assert.match(csp,/script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp,/(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
});

test('33 channels batched, scheduled milestones, no duplicate runs, local quota',async()=>{
  const e=env(),list=Array.from({length:33},(_,i)=>({id:id(i),name:'Network '+i}));
  const enrolled=await cloud.fetch(req('/api/channels',control,'POST',list),e);
  assert.equal(enrolled.status,200);
  let subscribers=190,callCount=0;
  const fakeFetch=async url=>{
    callCount++;
    const ids=new URL(url).searchParams.get('id').split(',');
    assert.equal(ids.length,33);
    return {ok:true,json:async()=>({items:ids.map(x=>({
      id:x,snippet:{title:'Remote '+x},
      statistics:{subscriberCount:String(subscribers),viewCount:'5400',videoCount:'18',hiddenSubscriberCount:false}
    }))})};
  };
  const morning={cron:'0 0 * * *',scheduledTime:Date.parse('2026-11-13T00:00:00Z')};
  await scheduledSync(morning,e,fakeFetch);
  assert.equal(callCount,1);
  await scheduledSync(morning,e,fakeFetch);
  assert.equal(callCount,1);
  subscribers=310;
  await scheduledSync({cron:'0 15 * * *',scheduledTime:Date.parse('2026-11-13T15:00:00Z')},e,fakeFetch);
  assert.equal(callCount,2);
  const res=await cloud.fetch(req('/api/status',control),e);
  const out=await res.json();
  assert.equal(out.totalSubscribers.value,33*310);
  assert.equal(out.totalSubscribers.covered,33);
  assert.equal(out.events.length,66);
  assert.deepEqual([...new Set(out.events.map(x=>x.milestone))].sort(),[200,300]);
  assert.equal(out.quota.scope,'vyron-control-local-only');
  assert.equal(e.DB.native.prepare("SELECT count(*) AS count FROM channel_snapshots").get().count,66);
});

test('manual channel refresh reports partial coverage instead of false success',async()=>{
  const e=env(),list=Array.from({length:33},(_,i)=>({id:id(i+100),name:'Network '+i}));
  await cloud.fetch(req('/api/channels',control,'POST',list),e);
  const partialFetch=async url=>{
    const requested=new URL(url).searchParams.get('id').split(',');
    return {ok:true,json:async()=>({items:requested.slice(0,31).map(x=>({
      id:x,snippet:{title:'Remote '+x},
      statistics:{subscriberCount:'10',viewCount:'100',videoCount:'2',hiddenSubscriberCount:false}
    }))})};
  };
  await assert.rejects(()=>runCountersSync(e,{
    source:'manual',slot:'manual:partial-coverage',date:new Date('2026-11-14T10:00:00Z'),
    fetchImpl:partialFetch
  }),/YOUTUBE_CHANNELS_INCOMPLETE: updated 31\/33; missing 2/);
  const run=e.DB.native.prepare(
    "SELECT status,updated_channels,error FROM sync_runs WHERE slot='manual:partial-coverage'"
  ).get();
  assert.equal(run.status,'error');
  assert.equal(run.updated_channels,31);
  assert.match(run.error,/missing 2/);
  assert.equal(e.DB.native.prepare('SELECT count(*) AS n FROM channel_snapshots').get().n,31);
});

test('quota guard blocks before sending requests',async()=>{
  const e=env();
  await reserveQuota(e.DB,new Date('2026-11-13T00:00:00Z'),1);
  await assert.rejects(()=>reserveQuota(e.DB,new Date('2026-11-13T00:00:00Z'),1),/exhausted/);
  assert.equal(e.DB.native.prepare('SELECT sum(spent) AS n FROM quota_buckets').get().n,1);
});

test('Mac event ingress is authenticated, deduped; commands await real Mac ACK',async()=>{
  const e=env(),eventId='render_event_0000001';
  const data={deviceId:'macbook_m1',events:[{
    id:eventId,kind:'render_completed',title:'Render completed',
    occurredAt:new Date().toISOString(),payload:{channel:'test'}
  }]};
  assert.equal((await cloud.fetch(req('/api/agent/events',control,'POST',data),e)).status,401);
  assert.equal((await cloud.fetch(req('/api/agent/events',agent,'POST',data),e)).status,200);
  assert.equal((await cloud.fetch(req('/api/agent/events',agent,'POST',data),e)).status,200);
  assert.equal(e.DB.native.prepare('SELECT count(*) AS n FROM events').get().n,1);
  const hb=await cloud.fetch(req('/api/agent/heartbeat',agent,'POST',{
    deviceId:'macbook_m1',label:'MacBook M1',
    status:{macAwake:true,rendersActive:2,oauthToken:'DO_NOT_STORE'}
  }),e);
  assert.equal(hb.status,200);
  const status=await (await cloud.fetch(req('/api/status',control),e)).json();
  assert.equal(status.devices.length,1);
  assert.equal(status.devices[0].status.oauthToken,undefined);
  const cid='mac_status_req_001';
  const cmd=await cloud.fetch(req('/api/commands',control,'POST',{
    id:cid,kind:'request_status',targetDevice:'macbook_m1'
  }),e);
  assert.equal(cmd.status,202);
  const queued=await (await cloud.fetch(req('/api/agent/commands?device=macbook_m1',agent),e)).json();
  assert.equal(queued.commands.length,1);
  assert.equal(queued.commands[0].id,cid);
  assert.equal((await cloud.fetch(req('/api/agent/commands/'+cid+'/ack',agent,'POST',{
    deviceId:'macbook_m1',state:'completed',message:'Status reported'
  }),e)).status,200);
  const after=await (await cloud.fetch(req('/api/agent/commands?device=macbook_m1',agent),e)).json();
  assert.equal(after.commands.length,0);
  const cancelId='mac_status_req_002';
  await cloud.fetch(req('/api/commands',control,'POST',{
    id:cancelId,kind:'request_status',targetDevice:'macbook_m1'
  }),e);
  const cancelled=await cloud.fetch(req('/api/commands/'+cancelId+'/cancel',control,'POST',{}),e);
  assert.deepEqual(await cancelled.json(),{
    id:cancelId,cancelled:true,
    note:'Only a command that had not been acknowledged by the Mac can be cancelled.'
  });
  assert.equal((await cloud.fetch(req('/api/commands/'+cancelId+'/cancel',control,'POST',{}),e)).status,200);
  assert.equal(e.DB.native.prepare('SELECT state FROM commands WHERE id=?').get(cancelId).state,'cancelled');
  assert.throws(()=>acceptedCommand({id:cid,targetDevice:'macbook_m1',kind:'publish_video'}));
  assert.throws(()=>safeEvent({id:'bad',kind:'arbitrary',title:'No',occurredAt:new Date().toISOString()}));
});

test('Mac Analytics 360 mirror snapshots are accepted without OAuth secrets',async()=>{
  const e=env(),channelId=id(1);
  await cloud.fetch(req('/api/channels',control,'POST',[{id:channelId,name:'Channel'}]),e);
  const snap=[{
    channelId,periodDays:28,views:5000,watchMinutes:12000,
    avgViewSeconds:200,avgViewPercentage:65,
    subscribersGained:100,subscribersLost:10,
    impressions:9000,impressionCtr:4.5,
    monetaryAuthorized:false,estimatedRevenue:999,
    capturedAt:new Date().toISOString(),
    daily:[{date:'2026-11-12',views:200,watchMinutes:400,
      subscribersGained:1,subscribersLost:0}]
  }];
  const url='/api/agent/analytics';
  assert.equal((await cloud.fetch(req(url,control,'POST',snap),e)).status,401);
  assert.equal((await cloud.fetch(req(url,agent,'POST',snap),e)).status,200);
  const status=await (await cloud.fetch(req('/api/status',control),e)).json();
  assert.equal(status.channels[0].analytics.views,5000);
  assert.equal(status.channels[0].analytics.watchMinutes,12000);
  assert.equal(status.channels[0].analytics.estimatedRevenue,null);
  assert.equal(status.channels[0].analytics.source,'VYRON_MAC_CACHE');
  assert.equal(status.analyticsSummary.covered,1);
  assert.equal(status.analyticsSummary.watchMinutes,12000);
  assert.equal(e.DB.native.prepare('SELECT length(daily_json) AS size FROM channel_analytics').get().size>2,true);
  await e.DB.prepare(
    "UPDATE channel_analytics SET source='GOOGLE_ANALYTICS_API',captured_at=? WHERE channel_id=?"
  ).bind(new Date(Date.now()+60000).toISOString(),channelId).run();
  const newerMacSnapshot={...snap[0],views:999999,capturedAt:new Date(Date.now()+120000).toISOString()};
  assert.equal((await cloud.fetch(req(url,agent,'POST',[newerMacSnapshot]),e)).status,200);
  const protectedRow=e.DB.native.prepare(
    'SELECT source,views FROM channel_analytics WHERE channel_id=?'
  ).get(channelId);
  assert.equal(protectedRow.source,'GOOGLE_ANALYTICS_API');
  assert.equal(protectedRow.views,5000);
  assert.equal((await cloud.fetch(req(url,agent,'POST',[{...snap[0],channelId:'BAD'}]),e)).status,400);
});

test('Google OAuth is PKCE protected, offline read-only and encrypted at rest',async()=>{
  const e=env(),channelId=id(2);
  Object.assign(e,{
    APP_ORIGIN:'https://vyron-control.example',
    GOOGLE_OAUTH_CLIENT_ID:'TEST_CLIENT_ID',
    GOOGLE_OAUTH_CLIENT_SECRET:'TEST_CLIENT_SECRET',
    OAUTH_ENCRYPTION_KEY:'a'.repeat(64)
  });
  const started=await startOAuth(
    req('/api/oauth/start',control,'POST',{}),e);
  assert.equal(started.status,200);
  const link=(await started.json()).authorizationUrl;
  assert.equal(new URL(link).searchParams.get('access_type'),'offline');
  assert.equal(new URL(link).searchParams.get('code_challenge_method'),'S256');
  const scopes=new URL(link).searchParams.get('scope');
  assert.match(scopes,/yt-analytics.readonly/);
  assert.doesNotMatch(scopes,/youtube.upload/);
  const state=new URL(link).searchParams.get('state');
  assert.equal(typeof state,'string');
  const cookie=started.headers.get('Set-Cookie').split(';')[0];
  assert.equal(cookie,'vyron_oauth_state='+state);
  const query=new URLSearchParams({state,code:'GOOGLE_CODE_TEST_VALID_1234'});
  const callback=new Request('https://vyron-control.example/api/oauth/callback?'+query,{
    headers:{Cookie:cookie}
  });
  const googleFetch=async(url,opts)=>{
    if(url.includes('oauth2.googleapis.com/token')) {
      const body=new URLSearchParams(opts.body);
      assert.equal(body.get('client_secret'),'TEST_CLIENT_SECRET');
      return new Response(JSON.stringify({
        access_token:'ACCESS_TOKEN_DO_NOT_LOG',
        refresh_token:'REFRESH_TOKEN_PRIVATE',
        scope:'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly'
      }),{status:200});
    }
    if(url.includes('youtube/v3/channels')) {
      assert.equal(opts.headers.Authorization,'Bearer ACCESS_TOKEN_DO_NOT_LOG');
      return new Response(JSON.stringify({
        items:[{id:channelId,snippet:{title:'Authorized channel'}}]
      }),{status:200});
    }
    throw new Error('Unexpected OAuth mock URL');
  };
  const result=await callbackOAuth(callback,e,googleFetch);
  assert.equal(result.status,302);
  assert.equal(result.headers.get('Location'),'https://vyron-control.example/?oauth=connected');
  const row=e.DB.native.prepare(
    'SELECT refresh_token_cipher FROM google_oauth_profiles WHERE channel_id=?'
  ).get(channelId);
  assert.ok(row.refresh_token_cipher);
  assert.equal(row.refresh_token_cipher.includes('REFRESH_TOKEN_PRIVATE'),false);
  assert.equal(await decryptSecret(row.refresh_token_cipher,e),'REFRESH_TOKEN_PRIVATE');
  const summary=await authorizedProfiles(e);
  assert.equal(summary.profiles.length,1);
  assert.equal(JSON.stringify(summary).includes('REFRESH_TOKEN_PRIVATE'),false);
  await assert.rejects(()=>callbackOAuth(callback,e,googleFetch),/expired/);
});

test('encrypted VYRON migration profiles import idempotently with their original OAuth client',async()=>{
  const e=env(),channelId=id(7);
  Object.assign(e,{OAUTH_ENCRYPTION_KEY:'b'.repeat(64),
    GOOGLE_OAUTH_CLIENT_ID:'WEB_CLIENT',GOOGLE_OAUTH_CLIENT_SECRET:'WEB_SECRET'});
  const clientId='471814393352-portableclient.apps.googleusercontent.com';
  const clientSecret='PORTABLE_CLIENT_SECRET';
  const refreshToken='PORTABLE_REFRESH_TOKEN_1234567890';
  const fetchMock=async(url,opts)=>{
    if(url.includes('oauth2.googleapis.com/token')){
      const body=new URLSearchParams(opts.body);
      assert.equal(body.get('client_id'),clientId);
      assert.equal(body.get('client_secret'),clientSecret);
      assert.equal(body.get('refresh_token'),refreshToken);
      return new Response(JSON.stringify({access_token:'PORTABLE_ACCESS'}),{status:200});
    }
    if(url.includes('youtube/v3/channels'))return new Response(JSON.stringify({
      items:[{id:channelId,snippet:{title:'Portable channel'}}]
    }),{status:200});
    if(url.includes('youtubeanalytics.googleapis.com'))return new Response(JSON.stringify({
      columnHeaders:['day','views','estimatedMinutesWatched','averageViewDuration',
        'averageViewPercentage','subscribersGained','subscribersLost'].map(name=>({name})),
      rows:[['2026-11-11',77,880,120,55,4,1]]
    }),{status:200});
    throw new Error('unexpected endpoint');
  };
  const data={bundleUuid:'bundle-uuid-001',profiles:[{
    profileUuid:'profile-uuid-001',channelId,channelName:'Portable channel',
    refreshToken,clientId,clientSecret
  }]};
  const first=await importVyronProfiles(data,e,fetchMock);
  const second=await importVyronProfiles(data,e,fetchMock);
  assert.equal(first.imported,1);assert.equal(second.imported,1);
  assert.equal(e.DB.native.prepare('SELECT count(*) AS n FROM google_oauth_profiles').get().n,1);
  const stored=e.DB.native.prepare(`SELECT p.refresh_token_cipher,c.client_id_cipher,
    c.client_secret_cipher,c.profile_uuid FROM google_oauth_profiles p
    JOIN google_oauth_client_credentials c ON c.channel_id=p.channel_id`).get();
  assert.equal(stored.profile_uuid,'profile-uuid-001');
  assert.equal(await decryptSecret(stored.refresh_token_cipher,e),refreshToken);
  assert.equal(await decryptSecret(stored.client_id_cipher,e),clientId);
  assert.equal(await decryptSecret(stored.client_secret_cipher,e),clientSecret);
  assert.equal(JSON.stringify(stored).includes(refreshToken),false);
  const analytics=await runAnalyticsBatch(e,
    {scheduledTime:Date.parse('2026-11-13T00:05:00Z')},fetchMock);
  assert.equal(analytics.updated,1);
  assert.equal(e.DB.native.prepare(
    'SELECT views FROM channel_analytics WHERE channel_id=?').get(channelId).views,77);
});

test('one imported Google profile can bind multiple YouTube channels without dropping either',async()=>{
  const e=env(),firstChannel=id(21),secondChannel=id(22);
  Object.assign(e,{OAUTH_ENCRYPTION_KEY:'c'.repeat(64),
    GOOGLE_OAUTH_CLIENT_ID:'WEB_CLIENT',GOOGLE_OAUTH_CLIENT_SECRET:'WEB_SECRET'});
  const clientId='471814393352-sharedclient.apps.googleusercontent.com';
  const clientSecret='SHARED_CLIENT_SECRET';
  const refreshToken='SHARED_REFRESH_TOKEN_1234567890';
  const fetchMock=async(url,opts)=>{
    if(url.includes('oauth2.googleapis.com/token')){
      const body=new URLSearchParams(opts.body);
      assert.equal(body.get('client_id'),clientId);
      assert.equal(body.get('client_secret'),clientSecret);
      assert.equal(body.get('refresh_token'),refreshToken);
      return new Response(JSON.stringify({access_token:'SHARED_ACCESS'}),{status:200});
    }
    if(url.includes('youtube/v3/channels'))return new Response(JSON.stringify({
      items:[
        {id:firstChannel,snippet:{title:'First channel'}},
        {id:secondChannel,snippet:{title:'Second channel'}}
      ]
    }),{status:200});
    throw new Error('unexpected endpoint');
  };
  const data={bundleUuid:'bundle-shared-001',profiles:[
    {profileUuid:'same-google-profile',channelId:firstChannel,channelName:'First channel',
      refreshToken,clientId,clientSecret},
    {profileUuid:'same-google-profile',channelId:secondChannel,channelName:'Second channel',
      refreshToken,clientId,clientSecret}
  ]};
  const result=await importVyronProfiles(data,e,fetchMock);
  assert.equal(result.received,2);
  assert.equal(result.imported,2);
  assert.equal(result.failed,0);
  assert.deepEqual(result.results.map(x=>x.channelId).sort(),[firstChannel,secondChannel].sort());
  assert.equal(e.DB.native.prepare('SELECT count(*) AS n FROM google_oauth_profiles').get().n,2);
  assert.equal(e.DB.native.prepare(
    "SELECT count(*) AS n FROM google_oauth_client_credentials WHERE profile_uuid='same-google-profile'"
  ).get().n,2);
});

test('authorized private Analytics syncs 90-day trends and channel breakdowns in four-profile batches',async()=>{
  const e=env(),channelId=id(5);
  Object.assign(e,{
    APP_ORIGIN:'https://vyron-control.example',
    GOOGLE_OAUTH_CLIENT_ID:'TEST_CLIENT_ID',
    GOOGLE_OAUTH_CLIENT_SECRET:'TEST_CLIENT_SECRET',
    OAUTH_ENCRYPTION_KEY:'f'.repeat(64)
  });
  const {encryptSecret}=await import('../src/oauth.mjs');
  const encrypted=await encryptSecret('PRIVATE_REFRESH_TOKEN',e);
  await e.DB.prepare(
    'INSERT INTO google_oauth_profiles(channel_id,channel_name,refresh_token_cipher,granted_scope,connected_at) VALUES (?,?,?,?,?)'
  ).bind(channelId,'Test',encrypted,'read-only',new Date().toISOString()).run();
  await e.DB.prepare('INSERT INTO channels(id,name) VALUES (?,?)').bind(channelId,'Test').run();
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:05:00Z')}).offset,0);
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:25:00Z')}).offset,12);
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:45:00Z')}).offset,24);
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:55:00Z')}).offset,30);
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:00:00Z')}),null);
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:01:00Z')}),null);
  let analyticsAttempts=0,coreAttempts=0;
  const mockFetch=async(url,opts)=>{
    if(url.includes('oauth2.googleapis.com/token')) {
      assert.equal(new URLSearchParams(opts.body).get('refresh_token'),'PRIVATE_REFRESH_TOKEN');
      return new Response(JSON.stringify({access_token:'SHORT_LIVED_TOKEN'}),{status:200});
    }
    if(url.includes('youtubeanalytics.googleapis.com')) {
      assert.equal(opts.headers.Authorization,'Bearer SHORT_LIVED_TOKEN');
      const params=new URL(url).searchParams;
      assert.equal(params.get('ids'),'channel==MINE');
      const dimensions=params.get('dimensions');
      analyticsAttempts++;
      if(dimensions==='day') {
        coreAttempts++;
        if(coreAttempts===1)return new Response('temporary',{status:503});
        return new Response(JSON.stringify({
          columnHeaders:['day','views','engagedViews','estimatedMinutesWatched','averageViewDuration',
            'averageViewPercentage','subscribersGained','subscribersLost','likes','dislikes','comments','shares']
            .map(name=>({name})),
          rows:[['2026-11-11',200,150,1000,160,62,9,1,18,3,4,2]]
        }),{status:200});
      }
      const fixtures={
        'video,creatorContentType':{
          columnHeaders:['video','creatorContentType','views','engagedViews','estimatedMinutesWatched',
            'averageViewDuration','averageViewPercentage','likes','dislikes','comments','shares'],
          rows:[['VID12345678','SHORTS',120,90,400,110,65,12,2,3,1]]
        },
        'insightTrafficSourceType':{
          columnHeaders:['insightTrafficSourceType','views','estimatedMinutesWatched'],
          rows:[['RELATED_VIDEO',90,500],['YT_SEARCH',40,200]]
        },
        'deviceType':{
          columnHeaders:['deviceType','views','estimatedMinutesWatched'],
          rows:[['MOBILE',130,600],['TV',70,400]]
        },
        'country':{
          columnHeaders:['country','views','estimatedMinutesWatched'],
          rows:[['US',100,500],['GB',50,250]]
        },
        'ageGroup,gender':{
          columnHeaders:['ageGroup','gender','viewerPercentage'],
          rows:[['25-34','FEMALE',35],['25-34','MALE',40]]
        },
        sharingService:{
          columnHeaders:['sharingService','shares'],rows:[['COPY_TO_CLIPBOARD',8],['WHATSAPP',2]]
        },
        insightPlaybackLocationType:{
          columnHeaders:['insightPlaybackLocationType','views','estimatedMinutesWatched'],
          rows:[['WATCH',140,700],['EMBEDDED',60,300]]
        },
        operatingSystem:{
          columnHeaders:['operatingSystem','views','estimatedMinutesWatched'],
          rows:[['ANDROID',100,500],['IOS',100,500]]
        },
        liveOrOnDemand:{
          columnHeaders:['liveOrOnDemand','views','engagedViews','estimatedMinutesWatched','averageViewDuration'],
          rows:[['LIVE',20,10,100,60],['ON_DEMAND',180,140,900,160]]
        },
        elapsedVideoTimeRatio:{
          columnHeaders:['elapsedVideoTimeRatio','audienceWatchRatio','relativeRetentionPerformance'],
          rows:[['0.0',1.0,0.2],['0.5',0.65,0.1],['1.0',0.2,-0.1]]
        }
      };
      return new Response(JSON.stringify(fixtures[dimensions]||{columnHeaders:[],rows:[]}),{status:200});
    }
    throw new Error('unexpected endpoint');
  };
  const outcome=await runAnalyticsBatch(e,
    {scheduledTime:Date.parse('2026-11-13T00:05:00Z')},mockFetch);
  assert.equal(outcome.updated,1);
  assert.equal(outcome.failed,0);
  assert.equal(outcome.periodDays,90);
  assert.equal(analyticsAttempts,12);
  const stored=e.DB.native.prepare(
    'SELECT source,views,watch_minutes,daily_json FROM channel_analytics WHERE channel_id=?'
  ).get(channelId);
  assert.equal(stored.source,'GOOGLE_ANALYTICS_API');
  assert.equal(stored.views,200);
  assert.equal(stored.watch_minutes,1000);
  const daily=JSON.parse(stored.daily_json);
  assert.equal(daily[0].likes,18);
  assert.equal(daily[0].engagedViews,150);
  assert.equal(daily[0].dislikes,3);
  assert.equal(daily[0].comments,4);
  const reports=JSON.parse(e.DB.native.prepare(
    'SELECT reports_json FROM channel_analytics_reports WHERE channel_id=?'
  ).get(channelId).reports_json);
  assert.equal(reports.topVideos[0].videoId,'VID12345678');
  assert.equal(reports.trafficSources[0].source,'RELATED_VIDEO');
  assert.equal(reports.devices[0].deviceType,'MOBILE');
  assert.equal(reports.countries[0].country,'US');
  assert.equal(reports.demographics.length,2);
  assert.equal(reports.demographics[0].viewerPercentage,35);
  assert.equal(reports.sharingServices[0].sharingService,'COPY_TO_CLIPBOARD');
  assert.equal(reports.playbackLocations[0].playbackLocation,'WATCH');
  assert.equal(reports.operatingSystems[0].operatingSystem,'ANDROID');
  assert.equal(reports.liveOrOnDemand[0].liveOrOnDemand,'LIVE');
  assert.equal(reports.audienceRetention.length,3);
  const second=await runAnalyticsBatch(e,
    {scheduledTime:Date.parse('2026-11-13T00:05:00Z')},mockFetch);
  assert.equal(second.skipped,true);
});

test('manual refresh API processes every authorized channel in safe four-profile batches',async()=>{
  const e=env();
  Object.assign(e,{
    GOOGLE_OAUTH_CLIENT_ID:'MANUAL_CLIENT',
    GOOGLE_OAUTH_CLIENT_SECRET:'MANUAL_SECRET',
    OAUTH_ENCRYPTION_KEY:'d'.repeat(64)
  });
  const {encryptSecret}=await import('../src/oauth.mjs');
  for(let index=0;index<5;index++){
    const channelId=id(40+index);
    const encrypted=await encryptSecret('MANUAL_REFRESH_'+index,e);
    await e.DB.prepare(
      'INSERT INTO google_oauth_profiles(channel_id,channel_name,refresh_token_cipher,granted_scope,connected_at) VALUES (?,?,?,?,?)'
    ).bind(channelId,'Manual '+index,encrypted,'read-only',new Date().toISOString()).run();
  }
  const mockFetch=async(url,opts)=>{
    if(url.includes('oauth2.googleapis.com/token'))
      return new Response(JSON.stringify({access_token:'MANUAL_ACCESS'}),{status:200});
    if(url.includes('youtubeanalytics.googleapis.com')){
      const dimensions=new URL(url).searchParams.get('dimensions');
      const fixtures={
        day:{columnHeaders:['day','views','engagedViews','estimatedMinutesWatched','averageViewDuration',
          'averageViewPercentage','subscribersGained','subscribersLost','likes','dislikes','comments','shares'],
          rows:[['2026-11-11',20,15,100,30,50,2,1,3,0,1,1]]},
        'video,creatorContentType':{columnHeaders:['video','creatorContentType','views','engagedViews',
          'estimatedMinutesWatched','averageViewDuration','averageViewPercentage','likes','dislikes','comments','shares'],
          rows:[['MANUALVID001','VIDEOS',10,7,50,30,50,2,0,1,0]]},
        insightTrafficSourceType:{columnHeaders:['insightTrafficSourceType','views','estimatedMinutesWatched'],
          rows:[['YT_SEARCH',10,50]]},
        deviceType:{columnHeaders:['deviceType','views','estimatedMinutesWatched'],
          rows:[['MOBILE',10,50]]},
        country:{columnHeaders:['country','views','estimatedMinutesWatched'],
          rows:[['US',10,50]]},
        'ageGroup,gender':{columnHeaders:['ageGroup','gender','viewerPercentage'],
          rows:[['25-34','FEMALE',50]]},
        sharingService:{columnHeaders:['sharingService','shares'],rows:[['COPY_TO_CLIPBOARD',1]]},
        insightPlaybackLocationType:{columnHeaders:['insightPlaybackLocationType','views','estimatedMinutesWatched'],
          rows:[['WATCH',10,50]]},
        operatingSystem:{columnHeaders:['operatingSystem','views','estimatedMinutesWatched'],
          rows:[['ANDROID',10,50]]},
        liveOrOnDemand:{columnHeaders:['liveOrOnDemand','views','engagedViews','estimatedMinutesWatched','averageViewDuration'],
          rows:[['ON_DEMAND',10,7,50,30]]},
        elapsedVideoTimeRatio:{columnHeaders:['elapsedVideoTimeRatio','audienceWatchRatio','relativeRetentionPerformance'],
          rows:[['0.0',1,0.2],['1.0',0.3,-0.1]]}
      };
      const report=fixtures[dimensions];
      return new Response(JSON.stringify({
        columnHeaders:report.columnHeaders.map(name=>({name})),rows:report.rows
      }),{status:200});
    }
    throw new Error('unexpected manual analytics endpoint');
  };
  e.FETCH_IMPL=mockFetch;
  const requestId='manualbatchrequest001';
  const first=await cloud.fetch(req('/api/analytics/refresh',control,'POST',{
    requestId,offset:0
  }),e);
  assert.equal(first.status,200);
  const firstBody=await first.json();
  assert.equal(firstBody.updated,3);
  const second=await cloud.fetch(req('/api/analytics/refresh',control,'POST',{
    requestId,offset:3
  }),e);
  assert.equal(second.status,200);
  const secondBody=await second.json();
  assert.equal(secondBody.updated,2);
  const duplicate=await cloud.fetch(req('/api/analytics/refresh',control,'POST',{
    requestId,offset:3
  }),e);
  assert.equal((await duplicate.json()).skipped,true);
  assert.equal(e.DB.native.prepare('SELECT count(*) AS n FROM channel_analytics_reports').get().n,5);
});

test('full event history supports stable pagination and category filters',async()=>{
  const e=env(),now=new Date().toISOString();
  const events=[
    {id:'render_event_000001',kind:'render_completed',title:'Rendered',occurredAt:now},
    {id:'upload_event_000002',kind:'upload_started',title:'Upload',occurredAt:now},
    {id:'upload_event_000003',kind:'upload_failed',title:'Upload failed',occurredAt:now,
      payload:{projectId:'project_job_123456',errorCode:'YOUTUBE_RUNTIME',percent:42,
        privatePath:'/must/not/be/returned'}},
    {id:'quota_event_000004',kind:'quota_warning',title:'Quota warning',occurredAt:now},
    {id:'render_event_000005',kind:'render_failed',title:'Render failed',occurredAt:now}
  ];
  const saved=await cloud.fetch(req('/api/agent/events',agent,'POST',{
    deviceId:'macbook_m1',events
  }),e);
  assert.equal(saved.status,200);
  const first=await (await cloud.fetch(req('/api/events?limit=2',control),e)).json();
  assert.equal(first.events.length,2);
  assert.ok(first.nextCursor);
  const next=new URLSearchParams({
    limit:'2',beforeAt:first.nextCursor.beforeAt,beforeId:first.nextCursor.beforeId
  });
  const second=await (await cloud.fetch(req('/api/events?'+next,control),e)).json();
  assert.equal(second.events.length,2);
  assert.equal(new Set([...first.events,...second.events].map(x=>x.id)).size,4);
  const filtered=await (await cloud.fetch(req('/api/events?category=errors',control),e)).json();
  assert.equal(filtered.events.length,3);
  const failed=filtered.events.find(x=>x.id==='upload_event_000003');
  assert.equal(failed.projectId,'project_job_123456');
  assert.equal(failed.errorCode,'YOUTUBE_RUNTIME');
  assert.equal(failed.percent,42);
  assert.equal(failed.privatePath,undefined);
  assert.equal((await cloud.fetch(req('/api/events?category=unknown',control),e)).status,400);
});

test('iPhone Web Push subscriptions require valid Apple/Google HTTPS endpoints',async()=>{
  const e=env();
  const subscription={
    endpoint:'https://webpush.push.apple.com/valid/test_sub_0001',
    expirationTime:null,
    keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}
  };
  assert.equal(validSubscription(subscription).endpoint,subscription.endpoint);
  assert.throws(()=>validSubscription({...subscription,endpoint:'https://127.0.0.1/private'}));
  assert.throws(()=>validSubscription({...subscription,endpoint:'http://webpush.push.apple.com/private'}));
  assert.throws(()=>validSubscription({...subscription,endpoint:'https://example.com/private'}));
  const request=new Request('https://vyron-control.example/api/push/subscribe',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(subscription)
  });
  assert.deepEqual(await registerPush(e,request),{subscribed:true});
  assert.equal(e.DB.native.prepare('SELECT count(*) n FROM push_subscriptions').get().n,1);
  const present=e.DB.native.prepare('SELECT subscription_json FROM push_subscriptions').get();
  assert.ok(JSON.parse(present.subscription_json).keys.p256dh);
});

test('Web Push notifications use encrypted VAPID payload builder and deduplicate deliveries',async()=>{
  const e=env();
  Object.assign(e,{VAPID_PUBLIC_KEY:'A'.repeat(87),VAPID_PRIVATE_KEY:'PRIVATE_TEST',
    VAPID_SUBJECT:'mailto:owner@example.test'});
  const sub={
    endpoint:'https://webpush.push.apple.com/test_device_subscription',
    keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}
  };
  await registerPush(e,new Request('https://vyron-control.example/api/push/subscribe',{
    method:'POST',body:JSON.stringify(sub)
  }));
  await e.DB.prepare("UPDATE push_subscriptions SET created_at='2020-01-01T00:00:00.000Z'").run();
  const when=new Date().toISOString();
  await e.DB.prepare(`
    INSERT INTO events (id,kind,channel_id,title,occurred_at,received_at)
    VALUES (?,?,?,?,?,?)
  `).bind('milestone_2026_001','subscriber_milestone',null,
    'Neon Drive FM: 200 подписчиков',when,when).run();
  let fetchCount=0,builderCalls=0;
  const sender=async(url,opts)=>{
    assert.match(url,/webpush.push.apple.com/);
    assert.equal(opts.method,'POST');
    fetchCount++;
    return {ok:true,status:201};
  };
  const builder=async(message,subscription,vapid)=>{
    builderCalls++;
    assert.match(message.data,/200 подписчиков/);
    assert.equal(vapid.subject,'mailto:owner@example.test');
    return {method:'POST',body:'test_encrypted'};
  };
  const first=await dispatchPush(e,sender,builder);
  assert.equal(first.sent,1);
  assert.equal(fetchCount,1);
  assert.equal(builderCalls,1);
  const second=await dispatchPush(e,sender,builder);
  assert.equal(second.attempted,0);
  assert.equal(fetchCount,1);
  assert.equal(e.DB.native.prepare("SELECT status FROM push_deliveries").get().status,'sent');
});


test('Mac installer is valid shell and keeps agent token out of command history',()=>{
  const script=readFileSync(new URL('../../public/install-mac-agent.sh',import.meta.url),'utf8');
  execFileSync('bash',['-n'],{input:script});
  assert.match(script,/read -r -s -p .*AGENT_TOKEN <\/dev\/tty/);
  assert.match(script,/if \(\( \$\{#AGENT_TOKEN\} < 32 \)\); then/);
  assert.doesNotMatch(script,/\\\\\$\{#AGENT_TOKEN\}/);
  assert.match(script,/npm run agent:install/);
  assert.match(script,/chmod 700/);
  assert.doesNotMatch(script,/set -x/);
});

test('free-tier cron schedules never run public counters, private Analytics and Web Push together',()=>{
  const cfg=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  const crons=cfg.triggers.crons;
  assert.ok(crons.includes(PUSH_CRON));
  assert.ok(crons.includes('0 0 * * *'));
  assert.ok(crons.includes('0 15 * * *'));
  assert.ok(crons.includes('5,10,15,20,25 0,15 * * *'));
  assert.notEqual(PUSH_CRON,'*/5 * * * *');
  const pushMinutes=PUSH_CRON.split(' ')[0].split(',').map(Number);
  assert.equal(pushMinutes.length,12);
  for(const minute of pushMinutes)assert.equal(minute%5,2);
  for(const minute of [0,5,10,15,20,25])
    assert.equal(pushMinutes.includes(minute),false);
  // Analytics must never run at the exact 07:00/22:00 public-counter tick.
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:00:00Z')}),null);
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T15:00:00Z')}),null);
});

test('Web Push retries abandoned sending claims without losing notifications',async()=>{
  const e=env();
  Object.assign(e,{
    VAPID_PUBLIC_KEY:'A'.repeat(87),VAPID_PRIVATE_KEY:'TEST_PRIVATE',
    VAPID_SUBJECT:'mailto:owner@example.test'
  });
  const sub={
    endpoint:'https://webpush.push.apple.com/stale_lease_test',
    keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}
  };
  await registerPush(e,new Request('https://vyron-control.example/api/push/subscribe',{
    method:'POST',body:JSON.stringify(sub)
  }));
  await e.DB.prepare("UPDATE push_subscriptions SET created_at='2020-01-01T00:00:00.000Z'").run();
  const eventTime=new Date().toISOString();
  await e.DB.prepare(
    "INSERT INTO events (id,kind,channel_id,title,occurred_at,received_at) VALUES (?,?,?,?,?,?)"
  ).bind('stale_push_000001','upload_completed',null,
    'Видео загружено',eventTime,eventTime).run();
  const hash=e.DB.native.prepare('SELECT endpoint_hash FROM push_subscriptions').get().endpoint_hash;
  await e.DB.prepare(
    "INSERT INTO push_deliveries(endpoint_hash,event_id,status,attempts,updated_at) VALUES (?,?,'sending',1,?)"
  ).bind(hash,'stale_push_000001','2020-01-01T00:00:00.000Z').run();
  let sent=0;
  const outcome=await dispatchPush(e,async()=>{sent++;return {ok:true,status:201}},
    async()=>({method:'POST',body:'encrypted'}));
  assert.equal(outcome.sent,1);
  assert.equal(sent,1);
  const result=e.DB.native.prepare(
    'SELECT status,attempts FROM push_deliveries WHERE endpoint_hash=?'
  ).get(hash);
  assert.equal(result.status,'sent');
  assert.equal(result.attempts,2);
  const again=await dispatchPush(e,async()=>{throw new Error('duplicate')},
    async()=>({method:'POST'}));
  assert.equal(again.attempted,0);
});
