// Owner sessions: random 256-bit token in HttpOnly cookie, only its SHA-256 hash in D1.
// Idle limit 30 days; absolute limit 90 days. Unrelated Mac Bridge Bearer tokens unchanged.
const COOKIE='__Host-vyron-session';
const IDLE_MS=30*86400000, MAX_MS=90*86400000, REFRESH_MS=5*60000;
const enc=new TextEncoder();
function hex(buf){return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function hash(value){return hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));}
function randomToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function cookieToken(request){
 const found=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-vyron-session=([A-Za-z0-9_-]{43})(?:;|$)/);
 return found?.[1]||null;
}
export function sessionCookie(token){
 return COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000';
}
export function clearSessionCookie(){
 return COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}
export function setSessionCookie(response,cookie){
 const headers=new Headers(response.headers);
 headers.append('Set-Cookie',cookie);headers.set('Cache-Control','no-store');
 return new Response(response.body,{status:response.status,headers});
}
async function csrfValue(raw,env){
 const key=await crypto.subtle.importKey('raw',enc.encode(env.CONTROL_TOKEN),
   {name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,enc.encode('VYRON_DEVICE_CSRF_V1:'+raw)));
}
function deviceLabel(value){
 return String(value||'Unknown browser').replace(/[^\w .;/()\-]/g,'').slice(0,90)||'Browser';
}
export async function createDeviceSession(env,request){
 const now=Date.now(),raw=randomToken(),id=crypto.randomUUID();
 await env.DB.prepare('INSERT INTO device_sessions (id,token_hash,device_label,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?,?)')
  .bind(id,await hash(raw),deviceLabel(request.headers.get('User-Agent')),
   new Date(now).toISOString(),new Date(now).toISOString(),
   new Date(now+MAX_MS).toISOString()).run();
 return {cookie:sessionCookie(raw),csrfToken:await csrfValue(raw,env)};
}
export async function readDeviceSession(env,request){
 const raw=cookieToken(request);
 if(!raw)return null;
 const row=await env.DB.prepare(
  'SELECT id,token_hash,device_label,created_at,last_seen_at,expires_at FROM device_sessions WHERE token_hash=?'
 ).bind(await hash(raw)).first();
 if(!row)return null;
 const now=Date.now(),seen=Date.parse(row.last_seen_at),expires=Date.parse(row.expires_at);
 if(!Number.isFinite(seen)||!Number.isFinite(expires)||seen+IDLE_MS<=now||expires<=now)
   return null;
 if(now-seen>=REFRESH_MS)
   await env.DB.prepare('UPDATE device_sessions SET last_seen_at=? WHERE id=? AND token_hash=?')
    .bind(new Date(now).toISOString(),row.id,row.token_hash).run();
 return {...row,csrfToken:await csrfValue(raw,env),cookie:sessionCookie(raw)};
}
export function csrfValid(request,session){
 const supplied=request.headers.get('X-VYRON-CSRF');
 return typeof supplied==='string'&&/^[0-9a-f]{64}$/.test(supplied)&&
  supplied===session.csrfToken;
}
export async function revokeSession(env,session){
 await env.DB.prepare('DELETE FROM device_sessions WHERE id=? AND token_hash=?')
  .bind(session.id,session.token_hash).run();
}
export async function listDeviceSessions(env,currentId){
 const {results=[]}=await env.DB.prepare(
  'SELECT id,device_label,created_at,last_seen_at,expires_at FROM device_sessions ORDER BY last_seen_at DESC LIMIT 50'
 ).all();
 const now=Date.now();
 return results.filter(x=>Date.parse(x.expires_at)>now&&Date.parse(x.last_seen_at)+IDLE_MS>now)
  .map(x=>({id:x.id,label:x.device_label,createdAt:x.created_at,
   lastSeenAt:x.last_seen_at,expiresAt:x.expires_at,current:x.id===currentId}));
}
export async function revokeById(env,id,currentId){
 if(!/^[0-9a-f-]{36}$/i.test(id))return {revoked:false,current:false};
 const result=await env.DB.prepare('DELETE FROM device_sessions WHERE id=?').bind(id).run();
 return {revoked:Number(result.meta?.changes)===1,current:id===currentId};
}
