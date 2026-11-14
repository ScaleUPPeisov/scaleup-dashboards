import { acceptedCommand, pacificDay, safeEvent, validatedChannelList } from './core.mjs';
import { manualSlot, runCountersSync, scheduledSync } from './sync.mjs';
import { saveAnalytics } from './analytics.mjs';
import { startOAuth,callbackOAuth,authorizedProfiles,disconnectProfile } from './oauth.mjs';
import { importVyronProfiles } from './oauth-import.mjs';
import { runAnalyticsBatch,runManualAnalyticsBatch } from './google-analytics.mjs';
import { registerPush,unregisterPush,vapidPublic,dispatchPush,PUSH_CRON } from './push.mjs';

const REQUIRED_TOKEN_LENGTH = 32;
const EXPECTED_TABLES = Object.freeze([
  'channels','channel_snapshots','events','sync_runs','quota_buckets','devices',
  'commands','channel_analytics','channel_analytics_reports','google_oauth_sessions','google_oauth_profiles',
  'google_oauth_client_credentials','cloud_analytics_runs','push_subscriptions','push_deliveries'
]);
const BOOTSTRAP_STATEMENTS = Object.freeze([
  "CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, subscribers INTEGER, views INTEGER, videos INTEGER, hidden_subscribers INTEGER DEFAULT 0, max_milestone INTEGER, previous_subscribers INTEGER, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS channel_snapshots (channel_id TEXT NOT NULL, observed_at TEXT NOT NULL, subscribers INTEGER, views INTEGER, videos INTEGER, PRIMARY KEY(channel_id, observed_at))",
  "CREATE INDEX IF NOT EXISTS idx_snapshots_at ON channel_snapshots(observed_at)",
  "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, channel_id TEXT, title TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL, received_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at DESC)",
  "CREATE TABLE IF NOT EXISTS sync_runs (slot TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL CHECK(status IN ('running','success','error')), source TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, error TEXT, updated_channels INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC)",
  "CREATE TABLE IF NOT EXISTS quota_buckets (day_pt TEXT PRIMARY KEY NOT NULL, spent INTEGER NOT NULL DEFAULT 0 CHECK(spent >= 0))",
  "CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL, last_seen_at TEXT, status_json TEXT NOT NULL DEFAULT '{}')",
  "CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY NOT NULL, target_device TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','accepted','completed','failed','cancelled')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, result_json TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_commands_pending ON commands(target_device,state,created_at)",
  "CREATE TABLE IF NOT EXISTS channel_analytics (channel_id TEXT PRIMARY KEY NOT NULL, period_days INTEGER NOT NULL, views INTEGER, watch_minutes REAL, avg_view_seconds REAL, avg_view_percentage REAL, subscribers_gained INTEGER, subscribers_lost INTEGER, impressions INTEGER, impression_ctr REAL, estimated_revenue REAL, currency TEXT, daily_json TEXT NOT NULL DEFAULT '[]', captured_at TEXT NOT NULL, received_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'VYRON_MAC_CACHE')",
  "CREATE INDEX IF NOT EXISTS idx_channel_analytics_received ON channel_analytics(received_at DESC)",
  "CREATE TABLE IF NOT EXISTS channel_analytics_reports (channel_id TEXT PRIMARY KEY NOT NULL, reports_json TEXT NOT NULL DEFAULT '{}', captured_at TEXT NOT NULL, received_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_channel_analytics_reports_captured ON channel_analytics_reports(captured_at DESC)",
  "CREATE TABLE IF NOT EXISTS google_oauth_sessions (state_hash TEXT PRIMARY KEY NOT NULL, verifier_cipher TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS google_oauth_profiles (channel_id TEXT PRIMARY KEY NOT NULL, channel_name TEXT NOT NULL, refresh_token_cipher TEXT NOT NULL, granted_scope TEXT NOT NULL, connected_at TEXT NOT NULL, last_success_at TEXT, last_error TEXT)",
  "CREATE TABLE IF NOT EXISTS google_oauth_client_credentials (channel_id TEXT PRIMARY KEY NOT NULL, profile_uuid TEXT NOT NULL, client_id_cipher TEXT NOT NULL, client_secret_cipher TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'VYRON_MIGRATION', bundle_uuid TEXT NOT NULL, imported_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS cloud_analytics_runs (slot TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL CHECK(status IN ('running','success','error')), started_at TEXT NOT NULL, ended_at TEXT, updated_channels INTEGER DEFAULT 0, error TEXT)",
  "CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint_hash TEXT PRIMARY KEY NOT NULL, subscription_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS push_deliveries (endpoint_hash TEXT NOT NULL, event_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'retry' CHECK(status IN ('retry','sending','sent','failed')), attempts INTEGER NOT NULL DEFAULT 0, last_attempt_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(endpoint_hash,event_id))",
  "CREATE INDEX IF NOT EXISTS idx_push_deliveries_retry ON push_deliveries(status,updated_at)"
]);

function json(body,status=200) {
  return new Response(JSON.stringify(body),{
    status,headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'}
  });
}
function errorReply(message,status=400) { return json({error:message},status); }

async function sameToken(provided, expected) {
  if (!provided || !expected || provided.length < REQUIRED_TOKEN_LENGTH ||
      expected.length < REQUIRED_TOKEN_LENGTH) return false;
  const encoder = new TextEncoder();
  const [a,b] = await Promise.all([
    crypto.subtle.digest('SHA-256',encoder.encode(provided)),
    crypto.subtle.digest('SHA-256',encoder.encode(expected))
  ]);
  const left = new Uint8Array(a),right = new Uint8Array(b);
  let diff = 0;
  for (let i=0;i<left.length;i++) diff |= left[i]^right[i];
  return diff === 0;
}
async function deriveAgentToken(controlToken) {
  if (typeof controlToken !== 'string' || controlToken.length < REQUIRED_TOKEN_LENGTH) return '';
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(controlToken),
    { name:'HMAC', hash:'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode('VYRON CONTROL / MAC AGENT / v1')
  );
  return Array.from(new Uint8Array(signature),
    byte => byte.toString(16).padStart(2,'0')).join('');
}
async function authenticate(request,env,role) {
  const supplied = request.headers.get('Authorization');
  const candidate = supplied?.startsWith('Bearer ') ? supplied.slice(7) : '';
  if (role==='agent') {
    const expected = env.AGENT_TOKEN || await deriveAgentToken(env.CONTROL_TOKEN);
    return sameToken(candidate,expected);
  }
  return sameToken(candidate,env.CONTROL_TOKEN);
}
function originMatch(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // native Mac agent sends no Origin
  try {return new URL(origin).origin === new URL(request.url).origin;}catch{return false;}
}
async function readJson(request, bytes=65536) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > bytes) throw new Error('Request is too large');
  const source = await request.text();
  if (source.length > bytes) throw new Error('Request is too large');
  return JSON.parse(source);
}
function number(value) { return value == null ? null : Number(value); }
function parsedJson(value,fallback) {
  try {const result=JSON.parse(value||'');return result&&typeof result==='object'?result:fallback;}
  catch {return fallback;}
}
function publicEventPayload(payload) {
  const projectId=typeof payload?.projectId==='string'&&
    /^[A-Za-z0-9_-]{1,150}$/.test(payload.projectId)?payload.projectId:null;
  const errorCode=typeof payload?.errorCode==='string'&&
    /^[A-Za-z0-9_-]{1,80}$/.test(payload.errorCode)?payload.errorCode:null;
  const percent=Number.isFinite(payload?.percent)&&payload.percent>=0&&payload.percent<=100
    ?Math.round(payload.percent):null;
  return {projectId,errorCode,percent};
}

async function health(env) {
  if (!env.DB) return json({
    ok:false,app:'vyron-control',d1:{bound:false,schema:false},
    error:'D1 binding missing'
  },503);
  try {
    const placeholders=EXPECTED_TABLES.map(()=>'?').join(',');
    const {results=[]}=await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`
    ).bind(...EXPECTED_TABLES).all();
    const present=new Set(results.map(row=>row.name));
    const missing=EXPECTED_TABLES.filter(name=>!present.has(name));
    const ok=missing.length===0;
    return json({
      ok,app:'vyron-control',
      d1:{bound:true,schema:ok,expectedTables:EXPECTED_TABLES.length,
        presentTables:EXPECTED_TABLES.length-missing.length,...(ok?{}:{missing})},
      schedule:{timezone:'Asia/Krasnoyarsk',local:['07:00','22:00'],utc:['00:00','15:00']}
    },ok?200:503);
  } catch {
    return json({
      ok:false,app:'vyron-control',d1:{bound:true,schema:false},
      error:'D1 health query failed'
    },503);
  }
}


async function bootstrapSchema(env) {
  if (!env.DB) return json({ok:false,error:'D1 binding missing'},503);
  try {
    const placeholders=EXPECTED_TABLES.map(()=>'?').join(',');
    const readTables=()=>env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`
    ).bind(...EXPECTED_TABLES).all();
    const {results:before=[]}=await readTables();
    const presentBefore=new Set(before.map(row=>row.name));
    const missingBefore=EXPECTED_TABLES.filter(name=>!presentBefore.has(name));
    if(missingBefore.length) {
      await env.DB.batch(BOOTSTRAP_STATEMENTS.map(statement=>env.DB.prepare(statement)));
    }
    const {results:after=[]}=await readTables();
    const presentAfter=new Set(after.map(row=>row.name));
    const missingAfter=EXPECTED_TABLES.filter(name=>!presentAfter.has(name));
    const ok=missingAfter.length===0;
    return json({
      ok,created:missingBefore.length>0,createdTables:missingBefore,
      expectedTables:EXPECTED_TABLES.length,
      presentTables:EXPECTED_TABLES.length-missingAfter.length,
      ...(ok?{}:{missing:missingAfter})
    },ok?200:503);
  } catch {
    return json({ok:false,error:'D1 schema bootstrap failed'},500);
  }
}

async function fetchStatus(env) {
  const db = env.DB;
  const now = new Date();
  const day = pacificDay(now);
  const [c,e,q,s,d,cmd]=await Promise.all([
    db.prepare(`SELECT c.id,c.name,c.subscribers,c.views,c.videos,c.hidden_subscribers,
      c.previous_subscribers,c.updated_at,
      a.period_days AS analytics_period_days,
      a.views AS analytics_views,
      a.watch_minutes AS analytics_watch_minutes,
      a.avg_view_seconds AS analytics_avg_view_seconds,
      a.avg_view_percentage AS analytics_avg_view_percentage,
      a.subscribers_gained AS analytics_subscribers_gained,
      a.subscribers_lost AS analytics_subscribers_lost,
      a.impressions AS analytics_impressions,
      a.impression_ctr AS analytics_impression_ctr,
      a.estimated_revenue AS analytics_revenue,
      a.currency AS analytics_currency,
      a.captured_at AS analytics_captured_at,
      a.source AS analytics_source,
      a.daily_json AS analytics_daily_json,
      r.reports_json AS analytics_reports_json
      FROM channels c LEFT JOIN channel_analytics a ON c.id=a.channel_id
      LEFT JOIN channel_analytics_reports r ON c.id=r.channel_id
      ORDER BY c.name LIMIT 120`).all(),
    db.prepare('SELECT id,kind,channel_id,title,payload_json,occurred_at,received_at FROM events ORDER BY received_at DESC LIMIT 80').all(),
    db.prepare('SELECT spent FROM quota_buckets WHERE day_pt=?').bind(day).first(),
    db.prepare('SELECT slot,status,source,started_at,ended_at,error,updated_channels FROM sync_runs ORDER BY started_at DESC LIMIT 1').first(),
    db.prepare('SELECT id,label,last_seen_at,status_json FROM devices ORDER BY id LIMIT 20').all(),
    db.prepare('SELECT id,target_device,kind,state,created_at,updated_at FROM commands ORDER BY created_at DESC LIMIT 25').all()
  ]);
  const channels=(c.results||[]).map(row=>({
    id:row.id,name:row.name,
    subscribers:number(row.subscribers),
    subscribersHidden:row.hidden_subscribers===1,
    subscribersRounded:true,
    views:number(row.views),videos:number(row.videos),
    previousSubscribers:number(row.previous_subscribers),
    updatedAt:row.updated_at,
    analytics:row.analytics_captured_at?{
      periodDays:row.analytics_period_days,
      views:number(row.analytics_views),
      watchMinutes:number(row.analytics_watch_minutes),
      averageViewDuration:number(row.analytics_avg_view_seconds),
      averageViewPercentage:number(row.analytics_avg_view_percentage),
      subscribersGained:number(row.analytics_subscribers_gained),
      subscribersLost:number(row.analytics_subscribers_lost),
      impressions:number(row.analytics_impressions),
      impressionCtr:number(row.analytics_impression_ctr),
      estimatedRevenue:number(row.analytics_revenue),
      currency:row.analytics_currency,
      updatedAt:row.analytics_captured_at,
      source:row.analytics_source||'VYRON_MAC_CACHE',
      daily:parsedJson(row.analytics_daily_json,[]),
      reports:parsedJson(row.analytics_reports_json,{})
    }:null
  }));
  const sum=key=>({
    value:channels.reduce((s,ch)=>s+(ch[key]??0),0),
    covered:channels.filter(ch=>ch[key]!==null).length,total:channels.length
  });
  const events=(e.results||[]).map(row=>{
    let payload={};try{payload=JSON.parse(row.payload_json||'{}');}catch{}
    return {
      id:row.id,type:row.kind,channelId:row.channel_id,name:row.title,
      title:row.title,milestone:row.kind==='subscriber_milestone'?payload.milestone:null,
      detectedAt:row.received_at,occurredAt:row.occurred_at,
      approximate:payload.approximate===true,...publicEventPayload(payload)
    };
  });
  const configured=Boolean(env.YOUTUBE_API_KEY)&&channels.length>0;
  const latestError=s?.status==='error'?s.error:null;
  const lastSuccess=await db.prepare(
    "SELECT ended_at FROM sync_runs WHERE status='success' ORDER BY ended_at DESC LIMIT 1"
  ).first();
  return {
    timezone:'Asia/Krasnoyarsk',schedule:['07:00','22:00'],
    quota:{ day,spent:q?.spent??0,
      budget:Number(env.QUOTA_DAILY_BUDGET||200),
      scope:'vyron-control-local-only',
      note:'This service tracks its own YouTube Data API requests, not other clients in Google Cloud.'
    },
    configured,lastAttemptAt:s?.started_at||null,lastSuccessAt:lastSuccess?.ended_at||null,
    lastError:latestError,lastSource:s?.source||null,
    syncing:s?.status==='running',
    channels,totalSubscribers:sum('subscribers'),totalViews:sum('views'),totalVideos:sum('videos'),
    analyticsSummary:(()=>{
      const available=channels.filter(ch=>ch.analytics);
      const views=available.reduce((sum,ch)=>sum+(ch.analytics.views??0),0);
      const daily=new Map();
      for(const channel of available)for(const row of channel.analytics.daily||[]){
        const item=daily.get(row.date)||{
          date:row.date,views:0,watchMinutes:0,subscribersGained:0,
          subscribersLost:0,likes:0,comments:0,shares:0
        };
        item.views+=row.views??0;item.watchMinutes+=row.watchMinutes??0;
        item.subscribersGained+=row.subscribersGained??0;
        item.subscribersLost+=row.subscribersLost??0;
        item.likes+=row.likes??0;item.comments+=row.comments??0;item.shares+=row.shares??0;
        daily.set(row.date,item);
      }
      return {
        views,watchMinutes:available.reduce((sum,ch)=>sum+(ch.analytics.watchMinutes??0),0),
        subscribersGained:available.reduce((sum,ch)=>sum+(ch.analytics.subscribersGained??0),0),
        subscribersLost:available.reduce((sum,ch)=>sum+(ch.analytics.subscribersLost??0),0),
        likes:available.reduce((sum,ch)=>sum+(ch.analytics.daily||[]).reduce((n,row)=>n+(row.likes??0),0),0),
        comments:available.reduce((sum,ch)=>sum+(ch.analytics.daily||[]).reduce((n,row)=>n+(row.comments??0),0),0),
        shares:available.reduce((sum,ch)=>sum+(ch.analytics.daily||[]).reduce((n,row)=>n+(row.shares??0),0),0),
        averageViewDuration:views?available.reduce((sum,ch)=>sum+
          (ch.analytics.avgViewSeconds??0)*(ch.analytics.views??0),0)/views:null,
        averageViewPercentage:views?available.reduce((sum,ch)=>sum+
          (ch.analytics.avgViewPercentage??0)*(ch.analytics.views??0),0)/views:null,
        daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),
        covered:available.length,total:channels.length,periodDays:90,
        note:'Авторизованные отчёты YouTube Analytics API. CTR миниатюр и доход без отдельных поддерживаемых прав не подменяются.'
      };
    })(),
    integrations:{
      youtubeDataApi:Boolean(env.YOUTUBE_API_KEY),
      macBridge:Boolean(env.AGENT_TOKEN||env.CONTROL_TOKEN),
      googleOAuth:Boolean(env.GOOGLE_OAUTH_CLIENT_ID&&env.GOOGLE_OAUTH_CLIENT_SECRET&&
        env.OAUTH_ENCRYPTION_KEY&&env.APP_ORIGIN),
      webPush:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT)
    },
    events, devices:(d.results||[]).map(x=>{
      let status={};try{status=JSON.parse(x.status_json||'{}');}catch{}
      return {id:x.id,label:x.label,lastSeenAt:x.last_seen_at,status};
    }),
    commands:cmd.results||[]
  };
}

async function eventHistory(env,request) {
  const params=new URL(request.url).searchParams;
  const limit=Math.min(100,Math.max(1,Number(params.get('limit')||50)||50));
  const category=params.get('category')||'all';
  const groups={
    all:null,
    subscribers:['subscriber_milestone'],
    renders:['render_started','render_progress','render_completed','render_failed'],
    uploads:['upload_queued','upload_started','upload_progress','upload_completed','upload_failed'],
    errors:['render_failed','upload_failed','agent_error','disk_offline','quota_warning']
  };
  if(!Object.prototype.hasOwnProperty.call(groups,category))
    return errorReply('Unknown event category',400);
  const beforeAt=params.get('beforeAt'),beforeId=params.get('beforeId');
  let sql='SELECT id,kind,channel_id,title,payload_json,occurred_at,received_at FROM events WHERE 1=1';
  const binds=[];
  if(beforeAt||beforeId){
    if(!beforeAt||!beforeId||!Number.isFinite(Date.parse(beforeAt))||
      !/^[A-Za-z0-9:_-]{1,120}$/.test(beforeId))
      return errorReply('Invalid event cursor',400);
    sql+=' AND (received_at < ? OR (received_at = ? AND id < ?))';
    binds.push(beforeAt,beforeAt,beforeId);
  }
  if(groups[category]) {
    const kinds=groups[category];
    sql+=' AND kind IN ('+kinds.map(()=>'?').join(',')+')';
    binds.push(...kinds);
  }
  sql+=' ORDER BY received_at DESC,id DESC LIMIT ?';
  binds.push(limit);
  const {results=[]}=await env.DB.prepare(sql).bind(...binds).all();
  const events=results.map(row=>{
    let payload={};
    try {payload=JSON.parse(row.payload_json||'{}');}catch{}
    return {id:row.id,type:row.kind,channelId:row.channel_id,
      name:row.title,title:row.title,
      milestone:row.kind==='subscriber_milestone'?payload.milestone:null,
      occurredAt:row.occurred_at,detectedAt:row.received_at,
      approximate:payload.approximate===true,...publicEventPayload(payload)};
  });
  const last=results.at(-1);
  return json({events,nextCursor:results.length===limit&&last?
    {beforeAt:last.received_at,beforeId:last.id}:null,category});
}

async function enrollChannels(env,request) {
  const items=validatedChannelList(await readJson(request,32000));
  if(!items.length) return errorReply('No channels to enroll',400);
  const payload=JSON.stringify(items);
  await env.DB.prepare(`
    INSERT INTO channels (id,name)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.name') FROM json_each(?) WHERE 1
    ON CONFLICT(id) DO UPDATE SET name=excluded.name
  `).bind(payload).run();
  return json({enrolled:items.length,existingChannelsPreserved:true});
}

async function ingestAgentEvents(env,request) {
  const input=await readJson(request);
  const deviceId=String(input.deviceId||'');
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(deviceId)) return errorReply('Invalid device ID');
  if (!Array.isArray(input.events) || input.events.length>100) return errorReply('Expected up to 100 events');
  const rows=input.events.map(safeEvent).map(e=>({...e,deviceId,receivedAt:new Date().toISOString()}));
  if (rows.length) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO events(id,kind,channel_id,title,payload_json,occurred_at,received_at)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),
        json_extract(value,'$.channelId'),json_extract(value,'$.title'),
        json_extract(value,'$.payloadJson'),json_extract(value,'$.occurredAt'),
        json_extract(value,'$.receivedAt')
      FROM json_each(?)
    `).bind(JSON.stringify(rows.map(x=>({
      id:x.id,kind:x.kind,channelId:x.channelId,title:x.title,
      payloadJson:x.payloadJson,occurredAt:x.occurredAt,receivedAt:x.receivedAt
    })))).run();
  }
  return json({received:rows.length,ids:rows.map(x=>x.id),idempotent:true});
}

async function heartbeat(env,request) {
  const data=await readJson(request,8000);
  const deviceId=String(data.deviceId||'');
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(deviceId)) return errorReply('Invalid device ID');
  const keys=['vyronVersion','endlumeVersion','macAwake','diskOnline',
    'rendersActive','uploadsQueued','uploadsCompleted','uploadsToday',
    'rendersCompletedToday','uploadFailuresToday','jobsReadyUpload',
    'channelsTotal','channelsBound','lastError','syncCursor'];
  const status={};
  for(const key of keys){
    const value=data.status?.[key];
    if(typeof value==='boolean'||(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)||
        (typeof value==='string'&&value.length<=150))status[key]=value;
  }
  const label=String(data.label||'VYRON Mac').slice(0,100);
  const seen=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO devices(id,label,last_seen_at,status_json) VALUES (?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET label=excluded.label,
      last_seen_at=excluded.last_seen_at,status_json=excluded.status_json
  `).bind(deviceId,label,seen,JSON.stringify(status)).run();
  return json({ok:true,acceptedAt:seen});
}

async function createCommand(env,request) {
  const data=acceptedCommand(await readJson(request,4000));
  const at=new Date().toISOString();
  const r=await env.DB.prepare(`
    INSERT OR IGNORE INTO commands
    (id,target_device,kind,payload_json,state,created_at,updated_at)
    VALUES (?,?,?,?,'queued',?,?)
  `).bind(data.id,data.target,data.kind,data.payloadJson,at,at).run();
  return json({id:data.id,queued:r.meta?.changes===1,
    note:'Queued command is NOT proof of execution by the Mac.'},202);
}

async function cancelCommand(env,id) {
  const at=new Date().toISOString();
  const result=await env.DB.prepare(`
    UPDATE commands SET state='cancelled',updated_at=?
    WHERE id=? AND state='queued'
  `).bind(at,id).run();
  return json({id,cancelled:Number(result.meta?.changes)===1,
    note:'Only a command that had not been acknowledged by the Mac can be cancelled.'});
}

async function pendingCommands(env,request) {
  const deviceId=new URL(request.url).searchParams.get('device');
  if(!/^[A-Za-z0-9_-]{3,50}$/.test(deviceId||'')) return errorReply('Invalid device ID');
  const rows=await env.DB.prepare(`
    SELECT id,kind,payload_json,created_at FROM commands
    WHERE target_device=? AND state='queued' ORDER BY created_at LIMIT 20
  `).bind(deviceId).all();
  return json({commands:(rows.results||[]).map(row=>({
    id:row.id,kind:row.kind,payload:JSON.parse(row.payload_json||'{}'),createdAt:row.created_at
  }))});
}

async function acknowledgeCommand(env,request,id) {
  const data=await readJson(request,2000);
  const deviceId=String(data.deviceId||'');
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(deviceId)) return errorReply('Invalid device ID');
  const state=data.state;
  if(!['completed','failed'].includes(state)) return errorReply('Invalid acknowledgement state');
  const at=new Date().toISOString();
  const result=await env.DB.prepare(`
    UPDATE commands SET state=?,updated_at=?,result_json=?
    WHERE id=? AND target_device=? AND state='queued'
  `).bind(state,at,JSON.stringify({
    message:String(data.message||'').slice(0,300)
  }),id,deviceId).run();
  return json({accepted:result.meta?.changes===1});
}

function isApi(path){return path.startsWith('/api/');}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(!isApi(url.pathname)) {
      const response=await env.ASSETS.fetch(request);
      const headers=new Headers(response.headers);
      headers.set('X-Content-Type-Options','nosniff');
      headers.set('X-Frame-Options','DENY');
      headers.set('Referrer-Policy','no-referrer');
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      return new Response(response.body,{status:response.status,headers});
    }
    if(url.pathname==='/api/health'&&request.method==='GET') return health(env);
    if(url.pathname==='/api/oauth/callback'&&request.method==='GET') {
      try {return await callbackOAuth(request,env);}
      catch(error) {
        console.error('OAuth callback failed (no token values):',String(error?.message||'Unknown').slice(0,120));
        const app=String(env.APP_ORIGIN||'');
        if(/^https:\/\//.test(app))return Response.redirect(app.replace(/\/$/,'')+'/?oauth=failed',302);
        return errorReply('OAuth connection failed',400);
      }
    }
    if(!originMatch(request)) return errorReply('Origin not allowed',403);
    const agentRoute=url.pathname.startsWith('/api/agent/');
    if(!await authenticate(request,env,agentRoute?'agent':'control'))
      return errorReply('Unauthorized',401);
    try {
      if (url.pathname==='/api/mac/agent-token'&&request.method==='POST') {
        if (env.AGENT_TOKEN)
          return errorReply('AGENT_TOKEN is already configured in Cloudflare; use that configured key.',409);
        return json({
          agentToken:await deriveAgentToken(env.CONTROL_TOKEN),
          scope:'mac-telemetry-only',
          method:'derived-control-token-v1'
        });
      }
      if (url.pathname==='/api/admin/bootstrap'&&request.method==='POST')
        return bootstrapSchema(env);
      if (url.pathname==='/api/oauth/start'&&request.method==='POST')
        return startOAuth(request,env);
      if (url.pathname==='/api/oauth/profiles'&&request.method==='GET')
        return json(await authorizedProfiles(env));
      if (url.pathname==='/api/oauth/import-vyron'&&request.method==='POST')
        return json(await importVyronProfiles(await readJson(request,262144),env));
      if (url.pathname==='/api/oauth/disconnect'&&request.method==='POST')
        return json(await disconnectProfile(request,env));
      if (url.pathname==='/api/events'&&request.method==='GET')
        return eventHistory(env,request);
      if (url.pathname==='/api/push/public-key'&&request.method==='GET')
        return json({supported:Boolean(vapidPublic(env)),publicKey:vapidPublic(env)});
      if (url.pathname==='/api/push/subscribe'&&request.method==='POST')
        return json(await registerPush(env,request));
      if (url.pathname==='/api/push/unsubscribe'&&request.method==='POST')
        return json(await unregisterPush(env,request));
      if (url.pathname==='/api/status'&&request.method==='GET')
        return json(await fetchStatus(env));
      if (url.pathname==='/api/refresh'&&request.method==='POST') {
        const outcome=await runCountersSync(env,{
          source:'manual',slot:manualSlot(),date:new Date()
        });
        return json({...outcome,status:await fetchStatus(env)});
      }
      if (url.pathname==='/api/analytics/refresh'&&request.method==='POST') {
        const body=await readJson(request,2000);
        return json(await runManualAnalyticsBatch(env,body));
      }
      if (url.pathname==='/api/channels'&&request.method==='POST')
        return enrollChannels(env,request);
      if (url.pathname==='/api/commands'&&request.method==='POST')
        return createCommand(env,request);
      if (url.pathname.startsWith('/api/commands/')&&
          url.pathname.endsWith('/cancel')&&request.method==='POST') {
        const id=url.pathname.split('/')[3];
        if(!/^[A-Za-z0-9_-]{16,80}$/.test(id||'')) return errorReply('Invalid command ID');
        return cancelCommand(env,id);
      }
      if (url.pathname==='/api/agent/channels'&&request.method==='POST')
        return enrollChannels(env,request);
      if (url.pathname==='/api/agent/analytics'&&request.method==='POST')
        return json(await saveAnalytics(env,request));
      if (url.pathname==='/api/agent/events'&&request.method==='POST')
        return ingestAgentEvents(env,request);
      if (url.pathname==='/api/agent/heartbeat'&&request.method==='POST')
        return heartbeat(env,request);
      if (url.pathname==='/api/agent/commands'&&request.method==='GET')
        return pendingCommands(env,request);
      if (url.pathname.startsWith('/api/agent/commands/')&&
          url.pathname.endsWith('/ack')&&request.method==='POST') {
        const id=url.pathname.split('/')[4];
        if(!/^[A-Za-z0-9_-]{16,80}$/.test(id||'')) return errorReply('Invalid command ID');
        return acknowledgeCommand(env,request,id);
      }
      return errorReply('Not found',404);
    } catch(e) {
      const message=String(e.message||'Unknown failure');
      const status=message.includes('budget exhausted')?429:
        message.includes('already')?409:
        message.startsWith('YOUTUBE_CHANNELS_INCOMPLETE')||
          message.startsWith('YouTube channels.list HTTP')||
          message.startsWith('YouTube response missing items')?502:
        /Invalid|^INVALID_|Unexpected|not configured|No channels|Unsupported|too large/.test(message)?400:500;
      if(status===500)console.error('VYRON CONTROL request:',message);
      return errorReply(status===500?'Internal service error':message,status);
    }
  },
  async scheduled(controller,env,ctx) {
    ctx.waitUntil(Promise.allSettled([
      scheduledSync(controller,env),
      runAnalyticsBatch(env,controller),
      ...(controller.cron===PUSH_CRON?[dispatchPush(env)]:[])
    ]).then(results=>{
      for (const result of results) if(result.status==='rejected')
        console.error('VYRON CONTROL scheduled task failed:',
          String(result.reason?.message||result.reason).slice(0,160));
    }));
  }
};
