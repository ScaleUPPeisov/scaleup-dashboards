// VYRON CONTROL Web Push: encrypted RFC 8291 + VAPID RFC 8292.
// Sends only allowlisted event names, never user credentials or private files.
import { buildPushPayload } from '@block65/webcrypto-web-push';

export const PUSH_CRON='2,7,12,17,22,27,32,37,42,47,52,57 * * * *';
const PUSH_KINDS=new Set([
  'subscriber_milestone','render_completed','render_failed','upload_completed',
  'upload_failed','disk_offline','quota_warning','agent_error'
]);
const sha=async value=>{
  const data=new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
};
function endpointAllowed(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return false;
    const host=url.hostname.toLowerCase();
    return host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||
      host==='notify.windows.com'||host.endsWith('.notify.windows.com')||
      host==='push.apple.com'||host.endsWith('.push.apple.com');
  }catch{return false;}
}
export function validSubscription(raw) {
  if(!raw||typeof raw!=='object'||typeof raw.endpoint!=='string'||
    raw.endpoint.length>2048||!endpointAllowed(raw.endpoint))throw new Error('Invalid push endpoint');
  const p256dh=raw.keys?.p256dh,auth=raw.keys?.auth;
  if(typeof p256dh!=='string'||typeof auth!=='string'||
    !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh)||
    !/^[A-Za-z0-9_-]{20,40}$/.test(auth))
    throw new Error('Invalid push encryption keys');
  return {endpoint:raw.endpoint,expirationTime:null,keys:{p256dh,auth}};
}
export function vapidPublic(env) {
  const key=String(env.VAPID_PUBLIC_KEY||'');
  if(!/^[A-Za-z0-9_-]{85,100}$/.test(key))return null;
  return key;
}
export async function registerPush(env,request) {
  const body=await request.text();
  if(body.length>5500)throw new Error('Push subscription too large');
  const subscription=validSubscription(JSON.parse(body));
  const id=await sha(subscription.endpoint);
  const at=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO push_subscriptions
      (endpoint_hash,subscription_json,created_at,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(endpoint_hash) DO UPDATE SET
      subscription_json=excluded.subscription_json,updated_at=excluded.updated_at
  `).bind(id,JSON.stringify(subscription),at,at).run();
  return {subscribed:true};
}
export async function unregisterPush(env,request) {
  const body=await request.json();
  const endpoint=String(body.endpoint||'');
  if(!endpointAllowed(endpoint))throw new Error('Invalid push endpoint');
  const id=await sha(endpoint);
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint_hash=?')
    .bind(id).run();
  return {unsubscribed:true};
}
function notification(e) {
  let title='VYRON CONTROL',body=String(e.title||'Новое событие').slice(0,150);
  if(e.kind==='subscriber_milestone'){
    title='🎉 Новый рубеж подписчиков';
  }else if(e.kind==='upload_completed'){
    title='✅ Загрузка видео завершена';
  }else if(e.kind==='render_completed'){
    title='🎬 Рендер завершён';
  }else if(e.kind==='render_failed'||e.kind==='upload_failed'||e.kind==='agent_error'){
    title='⚠️ Ошибка VYRON';
  }
  return JSON.stringify({title,body,tag:e.id});
}
export async function dispatchPush(env,fetchImpl=fetch,buildPayload=buildPushPayload) {
  if(!env.VAPID_PRIVATE_KEY||!vapidPublic(env)||!env.VAPID_SUBJECT)
    return {skipped:true,reason:'vapid_not_configured'};
  const now=new Date().toISOString();
  const retryBefore=new Date(Date.now()-5*60_000).toISOString();
  const {results=[]}=await env.DB.prepare(`
    SELECT p.endpoint_hash,p.subscription_json,e.id,e.kind,e.title,
      e.received_at,d.attempts
    FROM events e
    JOIN push_subscriptions p ON e.received_at > p.created_at
    LEFT JOIN push_deliveries d
      ON d.endpoint_hash=p.endpoint_hash AND d.event_id=e.id
    WHERE e.kind IN ('subscriber_milestone','render_completed','render_failed',
      'upload_completed','upload_failed','disk_offline','quota_warning','agent_error')
      AND (d.event_id IS NULL OR
        (d.status IN ('retry','sending') AND d.attempts < 3
          AND d.updated_at < ?))
    ORDER BY e.received_at ASC,e.id ASC LIMIT 8
  `).bind(retryBefore).all();
  let sent=0,failed=0;
  for(const row of results) {
    const subscription=JSON.parse(row.subscription_json);
    const nowAt=new Date().toISOString();
    const inserted=await env.DB.prepare(`
      INSERT OR IGNORE INTO push_deliveries
        (endpoint_hash,event_id,status,attempts,updated_at)
      VALUES (?,?,'retry',0,?)
    `).bind(row.endpoint_hash,row.id,nowAt).run();
    const claim=await env.DB.prepare(`
      UPDATE push_deliveries
      SET status='sending',attempts=attempts+1,last_attempt_at=?,updated_at=?
      WHERE endpoint_hash=? AND event_id=? AND attempts < 3
        AND (status='retry' OR (status='sending' AND updated_at < ?))
    `).bind(nowAt,nowAt,row.endpoint_hash,row.id,retryBefore).run();
    if(Number(claim.meta?.changes)!==1)continue;
    try {
      const payload=await buildPayload({
        data:notification(row),options:{ttl:3600}
      },subscription,{
        subject:env.VAPID_SUBJECT,
        publicKey:env.VAPID_PUBLIC_KEY,
        privateKey:env.VAPID_PRIVATE_KEY
      });
      const reply=await fetchImpl(subscription.endpoint,payload);
      if(reply.ok) {
        await env.DB.prepare(`
          UPDATE push_deliveries SET status='sent',updated_at=?
          WHERE endpoint_hash=? AND event_id=?
        `).bind(new Date().toISOString(),row.endpoint_hash,row.id).run();
        sent++;
      }else{
        const permanent=reply.status===404||reply.status===410;
        await env.DB.prepare(`
          UPDATE push_deliveries SET status=?,updated_at=?
          WHERE endpoint_hash=? AND event_id=?
        `).bind(permanent?'failed':'retry',new Date().toISOString(),
          row.endpoint_hash,row.id).run();
        if(permanent)await env.DB.prepare(
          'DELETE FROM push_subscriptions WHERE endpoint_hash=?'
        ).bind(row.endpoint_hash).run();
        failed++;
      }
    }catch{
      // Fail closed: no secrets and no raw push endpoint printed to logs.
      await env.DB.prepare(`
        UPDATE push_deliveries SET status='retry',updated_at=?
        WHERE endpoint_hash=? AND event_id=?
      `).bind(new Date().toISOString(),row.endpoint_hash,row.id).run();
      failed++;
    }
  }
  return {sent,failed,attempted:sent+failed};
}
