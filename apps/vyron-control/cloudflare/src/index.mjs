import { acceptedCommand, pacificDay, safeEvent, validatedChannelList } from './core.mjs';
import { manualSlot, runCountersSync, scheduledSync } from './sync.mjs';

const REQUIRED_TOKEN_LENGTH = 32;

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
async function authenticate(request,env,role) {
  const supplied = request.headers.get('Authorization');
  const candidate = supplied?.startsWith('Bearer ') ? supplied.slice(7) : '';
  if (role==='agent') return sameToken(candidate,env.AGENT_TOKEN);
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

async function fetchStatus(env) {
  const db = env.DB;
  const now = new Date();
  const day = pacificDay(now);
  const [c,e,q,s,d,cmd]=await Promise.all([
    db.prepare('SELECT id,name,subscribers,views,videos,hidden_subscribers,previous_subscribers,updated_at FROM channels ORDER BY name LIMIT 120').all(),
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
    updatedAt:row.updated_at
  }));
  const sum=key=>({
    value:channels.reduce((s,ch)=>s+(ch[key]??0),0),
    covered:channels.filter(ch=>ch[key]!==null).length,total:channels.length
  });
  const events=(e.results||[]).map(row=>{
    const payload=JSON.parse(row.payload_json||'{}');
    return {
      id:row.id,type:row.kind,channelId:row.channel_id,name:row.title,
      title:row.title,milestone:row.kind==='subscriber_milestone'?payload.milestone:null,
      detectedAt:row.received_at,occurredAt:row.occurred_at,approximate:payload.approximate===true
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
    events, devices:(d.results||[]).map(x=>{
      let status={};try{status=JSON.parse(x.status_json||'{}');}catch{}
      return {id:x.id,label:x.label,lastSeenAt:x.last_seen_at,status};
    }),
    commands:cmd.results||[]
  };
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
    'rendersActive','uploadsQueued','uploadsCompleted','lastError','syncCursor'];
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
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      return new Response(response.body,{status:response.status,headers});
    }
    if(url.pathname==='/api/health'&&request.method==='GET') return json({ok:true});
    if(!originMatch(request)) return errorReply('Origin not allowed',403);
    const agentRoute=url.pathname.startsWith('/api/agent/');
    if(!await authenticate(request,env,agentRoute?'agent':'control'))
      return errorReply('Unauthorized',401);
    try {
      if (url.pathname==='/api/status'&&request.method==='GET')
        return json(await fetchStatus(env));
      if (url.pathname==='/api/refresh'&&request.method==='POST') {
        const outcome=await runCountersSync(env,{
          source:'manual',slot:manualSlot(),date:new Date()
        });
        return json({...outcome,status:await fetchStatus(env)});
      }
      if (url.pathname==='/api/channels'&&request.method==='POST')
        return enrollChannels(env,request);
      if (url.pathname==='/api/commands'&&request.method==='POST')
        return createCommand(env,request);
      if (url.pathname==='/api/agent/channels'&&request.method==='POST')
        return enrollChannels(env,request);
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
        /Invalid|Unexpected|not configured|No channels|Unsupported|too large/.test(message)?400:500;
      if(status===500)console.error('VYRON CONTROL request:',message);
      return errorReply(status===500?'Internal service error':message,status);
    }
  },
  async scheduled(controller,env,ctx) {
    ctx.waitUntil(scheduledSync(controller,env).catch(error=>{
      console.error('VYRON CONTROL scheduled sync failed:',String(error.message||error));
    }));
  }
};
