import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cloud from '../src/index.mjs';
import { cronSlot, crossedMilestones, pacificDay, safeEvent, acceptedCommand } from '../src/core.mjs';
import { manualSlot, reserveQuota, scheduledSync } from '../src/sync.mjs';
import { startOAuth,callbackOAuth,authorizedProfiles,decryptSecret } from '../src/oauth.mjs';
import { runAnalyticsBatch,nextAnalyticsSlot,parseDailyReport } from '../src/google-analytics.mjs';
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

test('authorization, origin guard, static asset CSP and immutable endpoint behavior',async()=>{
  const e=env();
  assert.equal((await cloud.fetch(req('/api/status','invalid'),e)).status,401);
  const good=await cloud.fetch(req('/api/status',control),e);
  assert.equal(good.status,200);
  assert.equal((await good.json()).channels.length,0);
  const blocked=await cloud.fetch(req('/api/channels',control,'POST',[{id:id(1)}],'https://attacker.invalid'),e);
  assert.equal(blocked.status,403);
  const asset=await cloud.fetch(new Request('https://vyron-control.example/'),e);
  assert.match(asset.headers.get('Content-Security-Policy'),/frame-ancestors/);
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

test('authorized private Analytics can update while Mac sleeps, with 10-channel cron batches',async()=>{
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
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:25:00Z')}).offset,40);
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:00:00Z')}),null);
  assert.equal(nextAnalyticsSlot({scheduledTime:Date.parse('2026-11-13T00:01:00Z')}),null);
  const mockFetch=async(url,opts)=>{
    if(url.includes('oauth2.googleapis.com/token')) {
      assert.equal(new URLSearchParams(opts.body).get('refresh_token'),'PRIVATE_REFRESH_TOKEN');
      return new Response(JSON.stringify({access_token:'SHORT_LIVED_TOKEN'}),{status:200});
    }
    if(url.includes('youtubeanalytics.googleapis.com')) {
      assert.equal(opts.headers.Authorization,'Bearer SHORT_LIVED_TOKEN');
      assert.match(url,/ids=channel%3D%3D/);
      return new Response(JSON.stringify({
        columnHeaders:['day','views','estimatedMinutesWatched',
          'averageViewDuration','averageViewPercentage',
          'subscribersGained','subscribersLost'].map(name=>({name})),
        rows:[['2026-11-11',200,1000,160,62,9,1]]
      }),{status:200});
    }
    throw new Error('unexpected endpoint');
  };
  const outcome=await runAnalyticsBatch(e,
    {scheduledTime:Date.parse('2026-11-13T00:05:00Z')},mockFetch);
  assert.equal(outcome.updated,1);
  const stored=e.DB.native.prepare(
    'SELECT source,views,watch_minutes FROM channel_analytics WHERE channel_id=?'
  ).get(channelId);
  assert.equal(stored.source,'GOOGLE_ANALYTICS_API');
  assert.equal(stored.views,200);
  assert.equal(stored.watch_minutes,1000);
  const second=await runAnalyticsBatch(e,
    {scheduledTime:Date.parse('2026-11-13T00:05:00Z')},mockFetch);
  assert.equal(second.skipped,true);
});

test('full event history supports stable pagination and category filters',async()=>{
  const e=env(),now=new Date().toISOString();
  const events=[
    {id:'render_event_000001',kind:'render_completed',title:'Rendered',occurredAt:now},
    {id:'upload_event_000002',kind:'upload_started',title:'Upload',occurredAt:now},
    {id:'upload_event_000003',kind:'upload_failed',title:'Upload failed',occurredAt:now},
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
