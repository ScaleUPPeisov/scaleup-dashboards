// This script must NEVER run against production. E2E fixtures are confined to an ephemeral D1.
import assert from 'node:assert/strict';
const base=process.env.VYRON_PREVIEW_URL,owner=process.env.PREVIEW_CONTROL_TOKEN,
  agent=process.env.PREVIEW_AGENT_TOKEN;
if(!base?.startsWith('https://vyron-control-pr55-') ||
   !base.includes('.workers.dev') || !owner || !agent || owner===agent)
  throw Error('Refusing unverified/non-isolated preview target or missing secrets');
const id=n=>'UC'+String(n).padStart(22,'0');
const headers=token=>({'Authorization':'Bearer '+token,'Content-Type':'application/json'});
async function call(path,method='GET',body=undefined,token=owner){
  const response=await fetch(base+path,{method,headers:headers(token),
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));
  return {status:response.status,data};
}
const health=await call('/api/health','GET',undefined,'');
assert.equal(health.status,200);
assert.equal(health.data.d1.presentTables,20);
assert.equal((await call('/api/status','GET',undefined,'')).status,401);
assert.equal((await call('/api/status','GET',undefined,agent)).status,401);
const before=await call('/api/status');
assert.equal(before.status,200);
assert.equal(before.data.channels.length,33); // all fixtures only in ephemeral preview D1
const at=new Date().toISOString();
const beat=await call('/api/agent/heartbeat','POST',{
  deviceId:'mac_test_preview',label:'Isolated QA Mac',
  status:{macAwake:true,agentVersion:'preview-qa',rendersActive:1,
    agentStateSource:'MIRROR',agentLastError:'STATE_NOT_READY'}
},agent);
assert.equal(beat.status,200);
const status=await call('/api/status');
assert.equal(status.data.devices.length,1);
assert.equal(status.data.devices[0].status.agentVersion,'preview-qa');
const job={id:'job_'+'a'.repeat(32),channelId:id(0),status:'RENDERING',
  title:'Fixture — synthetic isolated job',progress:25,
  plannedPublishAt:null,createdAt:at,scheduleSource:'MAC_LOCAL_UNVERIFIED'};
const packet=items=>({source:'VYRON_MAC',generatedAt:new Date().toISOString(),
  deviceId:'mac_test_preview',items,truncated:false});
const p1=await call('/api/agent/production','POST',packet([job]),agent);
assert.equal(p1.status,200);
assert.equal(p1.data.accepted,1);
const p2=await call('/api/agent/production','POST',packet([{...job,progress:70}]),agent);
assert.equal(p2.status,200);
const view=await call('/api/status');
assert.equal(view.data.production.items.length,1);
assert.equal(view.data.production.items[0].progress,70);
assert.equal(view.data.production.items[0].scheduleSource,'MAC_LOCAL_UNVERIFIED');
const bad=await call('/api/agent/production','POST',packet([
  job,{...job,id:'job_'+'b'.repeat(32),channelId:id(999)}
]),agent);
assert.equal(bad.status,400);
assert.equal((await call('/api/status')).data.production.items.length,1);
const pref={critical:false,production:true,analytics:true,system:true,milestones:false};
assert.equal((await call('/api/notifications/preferences','POST',pref)).status,200);
assert.deepEqual((await call('/api/notifications')).data.categories,pref);
const eventId='evt_preview_'+Date.now();
assert.equal((await call('/api/agent/events','POST',{
  deviceId:'mac_test_preview',events:[{id:eventId,kind:'render_completed',
    title:'Preview job completed',occurredAt:new Date().toISOString(),
    channelId:id(0),payload:{percent:100}}]},agent)).status,200);
assert.equal((await call('/api/notifications/read','POST',
  {eventIds:[eventId,'does_not_exist']})).status,200);
assert.ok((await call('/api/notifications')).data.readIds.includes(eventId));
assert.equal((await call('/api/push/test','POST',{})).status,409);
const last=await call('/api/agent/production','POST',packet([]),agent);
assert.equal(last.status,200);
assert.equal((await call('/api/status')).data.production.items.length,0);
console.log('PASS: remote preview (20 D1 tables), 33 isolated channels, auth, heartbeat, job UPSERT/idempotence, unknown-ID guard, events, owner notifications, read receipts, Push without VAPID blocked, archive.');
console.log('All 33 channel IDs and jobs above are isolated QA fixtures; no production/owner data accessed.');
