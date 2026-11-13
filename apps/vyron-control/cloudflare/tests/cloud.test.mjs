import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cloud from '../src/index.mjs';
import { cronSlot, crossedMilestones, pacificDay, safeEvent, acceptedCommand } from '../src/core.mjs';
import { manualSlot, reserveQuota, scheduledSync } from '../src/sync.mjs';

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
