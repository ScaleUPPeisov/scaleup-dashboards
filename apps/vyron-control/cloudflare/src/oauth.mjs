// VYRON CONTROL: independent read-only Google OAuth. This module NEVER touches
// VYRON/ENDLUME macOS credentials or publishing scopes.
const GOOGLE_AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN='https://oauth2.googleapis.com/token';
const SCOPES=[
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
];
const VALID_CHANNEL=/^UC[A-Za-z0-9_-]{22}$/;
const enc=new TextEncoder(),dec=new TextDecoder();

function b64(bytes) {
  let s='';for(const v of bytes)s+=String.fromCharCode(v);
  return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function unb64(str) {
  const raw=atob(str.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-str.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function toHex(bytes){return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
function randomUrlSafe(length=32){const b=new Uint8Array(length);crypto.getRandomValues(b);return b64(b);}
async function digest(value) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));
}
function origin(env) {
  const value=String(env.APP_ORIGIN||'').replace(/\/$/,'');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)
    throw new Error('APP_ORIGIN must be the deployed HTTPS origin only');
  return url.origin;
}
async function aesKey(env) {
  const key=String(env.OAUTH_ENCRYPTION_KEY||'');
  if(!/^[a-fA-F0-9]{64}$/.test(key))throw new Error('OAuth encryption key is not configured');
  return crypto.subtle.importKey('raw',Uint8Array.from(key.match(/.{2}/g),h=>parseInt(h,16)),
    'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptSecret(value,env) {
  const iv=new Uint8Array(12);crypto.getRandomValues(iv);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},
    await aesKey(env),enc.encode(value)));
  const joined=new Uint8Array(iv.length+ciphertext.length);
  joined.set(iv);joined.set(ciphertext,iv.length);
  return b64(joined);
}
export async function decryptSecret(encoded,env) {
  const bytes=unb64(encoded);
  if(bytes.length<29)throw new Error('Invalid encrypted credential');
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},
    await aesKey(env),bytes.slice(12));
  return dec.decode(raw);
}
function requiresGoogleConfiguration(env) {
  if(!env.GOOGLE_OAUTH_CLIENT_ID||!env.GOOGLE_OAUTH_CLIENT_SECRET)
    throw new Error('Google OAuth client secrets are not configured');
  origin(env); // Validate redirect before creating any state.
}
function stateCookie(state) {
  return `vyron_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/api/oauth/callback`;
}
function clearCookie() {
  return 'vyron_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/api/oauth/callback';
}
function cookieValue(request) {
  const raw=request.headers.get('Cookie')||'';
  const match=raw.match(/(?:^|;\s*)vyron_oauth_state=([A-Za-z0-9_-]+)/);
  return match?.[1]||'';
}
function safeRedirect(url) {
  return new Response(null,{status:302,headers:{
    Location:url,'Set-Cookie':clearCookie(),'Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer'
  }});
}
async function googleTokenExchange(env,body,fetchImpl,credentials=null) {
  const clientId=credentials?.clientId||env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret=credentials?.clientSecret||env.GOOGLE_OAUTH_CLIENT_SECRET;
  const reply=await fetchImpl(GOOGLE_TOKEN,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
    body:new URLSearchParams({
      client_id:clientId,client_secret:clientSecret,...body
    })
  });
  if(!reply.ok)throw new Error('Google OAuth token exchange failed');
  return reply.json();
}
export async function startOAuth(request,env) {
  requiresGoogleConfiguration(env);
  await aesKey(env);
  if(new URL(request.url).origin!==origin(env))throw new Error('Incorrect OAuth callback origin');
  const state=randomUrlSafe(32),verifier=randomUrlSafe(48);
  const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(verifier))));
  const at=new Date(),expires=new Date(at.getTime()+600_000);
  await env.DB.prepare(
    'INSERT INTO google_oauth_sessions(state_hash,verifier_cipher,created_at,expires_at) VALUES (?,?,?,?)'
  ).bind(await digest(state),await encryptSecret(verifier,env),
    at.toISOString(),expires.toISOString()).run();
  const query=new URLSearchParams({
    client_id:env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri:origin(env)+'/api/oauth/callback',
    response_type:'code',scope:SCOPES.join(' '),
    state,code_challenge:challenge,code_challenge_method:'S256',
    access_type:'offline',prompt:'consent'
  });
  return new Response(JSON.stringify({authorizationUrl:GOOGLE_AUTH+'?'+query}),{
    headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':stateCookie(state)}
  });
}
export async function callbackOAuth(request,env,fetchImpl=fetch) {
  requiresGoogleConfiguration(env);
  const url=new URL(request.url);
  if(url.origin!==origin(env))throw new Error('OAuth callback origin mismatch');
  const code=url.searchParams.get('code')||'',state=url.searchParams.get('state')||'';
  const cookie=cookieValue(request);
  if(url.searchParams.has('error'))return safeRedirect(origin(env)+'/?oauth=denied');
  if(!/^[A-Za-z0-9_-]{10,400}$/.test(code)||!state||!cookie||cookie!==state)
    throw new Error('OAuth session mismatch');
  const key=await digest(state);
  const session=await env.DB.prepare(
    'SELECT verifier_cipher,expires_at FROM google_oauth_sessions WHERE state_hash=?'
  ).bind(key).first();
  if(!session||Date.parse(session.expires_at)<Date.now())
    throw new Error('OAuth session expired');
  // Consume the state once; even a failing token request cannot be replayed.
  const deleted=await env.DB.prepare('DELETE FROM google_oauth_sessions WHERE state_hash=?')
    .bind(key).run();
  if(Number(deleted.meta?.changes)!==1)throw new Error('OAuth state already consumed');
  const verifier=await decryptSecret(session.verifier_cipher,env);
  const token=await googleTokenExchange(env,{
    code,code_verifier:verifier,grant_type:'authorization_code',
    redirect_uri:origin(env)+'/api/oauth/callback'
  },fetchImpl);
  if(!token.access_token||!token.refresh_token)
    throw new Error('Google consent did not provide offline access');
  const scopes=new Set(String(token.scope||'').split(' '));
  if(!SCOPES.every(scope=>scopes.has(scope)))
    throw new Error('Google consent lacks read-only YouTube Analytics scopes');
  const answer=await fetchImpl(
    'https://www.googleapis.com/youtube/v3/channels?'+new URLSearchParams({
      part:'snippet',mine:'true',maxResults:'50'
    }),{headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'}}
  );
  if(!answer.ok)throw new Error('Google authorized channel verification failed');
  const channelData=await answer.json();
  const items=(Array.isArray(channelData.items)?channelData.items:[]).filter(ch=>
    VALID_CHANNEL.test(ch.id));
  if(!items.length)throw new Error('No authorized YouTube channels returned');
  const cipher=await encryptSecret(token.refresh_token,env);
  const at=new Date().toISOString();
  const scopeList=SCOPES.join(' ');
  for(const item of items){
    const id=item.id,name=String(item.snippet?.title||id).slice(0,120);
    await env.DB.prepare(`
      INSERT INTO google_oauth_profiles
        (channel_id,channel_name,refresh_token_cipher,granted_scope,connected_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(channel_id) DO UPDATE SET channel_name=excluded.channel_name,
        refresh_token_cipher=excluded.refresh_token_cipher,
        granted_scope=excluded.granted_scope,connected_at=excluded.connected_at,last_error=NULL
    `).bind(id,name,cipher,scopeList,at).run();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO channels(id,name) VALUES (?,?)'
    ).bind(id,name).run();
    await env.DB.prepare(
      'INSERT INTO channel_analytics_queue(channel_id,queued_at) VALUES (?,?) ON CONFLICT(channel_id) DO UPDATE SET queued_at=excluded.queued_at,attempts=0,last_attempt_at=NULL,last_error=NULL,completed_at=NULL'
    ).bind(id,at).run();
  }
  // Never put access/refresh tokens or one-time code in the response URL.
  return safeRedirect(origin(env)+'/?oauth=connected');
}
export async function authorizedProfiles(env) {
  const found=await env.DB.prepare(`
    SELECT channel_id,channel_name,connected_at,last_success_at,last_error
    FROM google_oauth_profiles ORDER BY channel_name LIMIT 100
  `).all();
  return {profiles:found.results||[],
    configured:Boolean(env.GOOGLE_OAUTH_CLIENT_ID&&env.GOOGLE_OAUTH_CLIENT_SECRET&&env.OAUTH_ENCRYPTION_KEY)};
}
export async function disconnectProfile(request,env) {
  const body=await request.json();
  const id=String(body?.channelId||'');
  if(!VALID_CHANNEL.test(id))throw new Error('Invalid channel ID');
  const removed=await env.DB.prepare('DELETE FROM google_oauth_profiles WHERE channel_id=?')
    .bind(id).run();
  await env.DB.prepare(`
    UPDATE channel_analytics_queue SET completed_at=?,last_error='OAUTH_DISCONNECTED'
    WHERE channel_id=? AND completed_at IS NULL
  `).bind(new Date().toISOString(),id).run();
  return {disconnected:Number(removed.meta?.changes)===1};
}
export async function refreshAccessToken(profile,env,fetchImpl=fetch) {
  const refreshToken=await decryptSecret(profile.refresh_token_cipher,env);
  let credentials=null;
  if(profile.client_id_cipher&&profile.client_secret_cipher)credentials={
    clientId:await decryptSecret(profile.client_id_cipher,env),
    clientSecret:await decryptSecret(profile.client_secret_cipher,env)
  };
  if(!credentials)requiresGoogleConfiguration(env);
  const token=await googleTokenExchange(env,{
    refresh_token:refreshToken,grant_type:'refresh_token'
  },fetchImpl,credentials);
  if(!token.access_token)throw new Error('Google refresh failed');
  return token.access_token;
}
