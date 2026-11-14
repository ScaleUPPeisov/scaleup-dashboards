import {encryptSecret} from './oauth.mjs';

const TOKEN_URL='https://oauth2.googleapis.com/token';
const VALID_CHANNEL=/^UC[A-Za-z0-9_-]{22}$/;
const VALID_CLIENT=/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const VALID_PROFILE=/^[A-Za-z0-9._-]{1,160}$/;
const READ_SCOPES='https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly';

function text(value,max){const out=String(value||'').trim();return out.length<=max?out:'';}
function safeReason(error) {
  const value=String(error?.message||error||'IMPORT_FAILED');
  return /^[A-Z0-9_]{3,80}$/.test(value)?value:'IMPORT_FAILED';
}
async function verifyProfile(row,fetchImpl) {
  const tokenReply=await fetchImpl(TOKEN_URL,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
    body:new URLSearchParams({client_id:row.clientId,client_secret:row.clientSecret,
      refresh_token:row.refreshToken,grant_type:'refresh_token'})
  });
  if(!tokenReply.ok)throw new Error('REFRESH_TOKEN_REJECTED');
  const token=await tokenReply.json();
  if(!token.access_token)throw new Error('ACCESS_TOKEN_MISSING');
  const channelReply=await fetchImpl(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50',{
      headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'}
    });
  if(!channelReply.ok)throw new Error('CHANNEL_VERIFY_FAILED');
  const items=(await channelReply.json()).items||[];
  const channel=items.find(item=>item?.id===row.channelId);
  if(!channel)throw new Error(items.length?'CHANNEL_ID_MISMATCH':'NO_CHANNEL_FOR_PROFILE');
  return text(channel.snippet?.title,120)||row.channelName||row.channelId;
}

function normalize(row) {
  const profileUuid=text(row?.profileUuid,160),channelId=text(row?.channelId,40);
  const channelName=text(row?.channelName,120)||channelId;
  const refreshToken=text(row?.refreshToken,4096),clientId=text(row?.clientId,300);
  const clientSecret=text(row?.clientSecret,512);
  if(!VALID_PROFILE.test(profileUuid)||!VALID_CHANNEL.test(channelId)||
    !VALID_CLIENT.test(clientId)||refreshToken.length<20||clientSecret.length<8)
    throw new Error('INVALID_PROFILE');
  return {profileUuid,channelId,channelName,refreshToken,clientId,clientSecret};
}

export async function importVyronProfiles(data,env,fetchImpl=fetch) {
  const bundleUuid=text(data?.bundleUuid,160);
  if(!VALID_PROFILE.test(bundleUuid))throw new Error('INVALID_BUNDLE_ID');
  const input=Array.isArray(data?.profiles)?data.profiles:[];
  if(!input.length||input.length>8)throw new Error('INVALID_BATCH_SIZE');
  const results=[];
  for(const candidate of input) {
    let row;
    try {
      row=normalize(candidate);
      const channelName=await verifyProfile(row,fetchImpl);
      const [refreshCipher,clientIdCipher,clientSecretCipher]=await Promise.all([
        encryptSecret(row.refreshToken,env),encryptSecret(row.clientId,env),
        encryptSecret(row.clientSecret,env)
      ]);
      const now=new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO google_oauth_profiles
            (channel_id,channel_name,refresh_token_cipher,granted_scope,connected_at,last_error)
          VALUES (?,?,?,?,?,NULL)
          ON CONFLICT(channel_id) DO UPDATE SET
            channel_name=excluded.channel_name,
            refresh_token_cipher=excluded.refresh_token_cipher,
            granted_scope=excluded.granted_scope,
            connected_at=excluded.connected_at,last_error=NULL
        `).bind(row.channelId,channelName,refreshCipher,READ_SCOPES,now),
        env.DB.prepare(`
          INSERT INTO google_oauth_client_credentials
            (channel_id,profile_uuid,client_id_cipher,client_secret_cipher,source,bundle_uuid,imported_at)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(channel_id) DO UPDATE SET
            profile_uuid=excluded.profile_uuid,
            client_id_cipher=excluded.client_id_cipher,
            client_secret_cipher=excluded.client_secret_cipher,
            source=excluded.source,bundle_uuid=excluded.bundle_uuid,
            imported_at=excluded.imported_at
        `).bind(row.channelId,row.profileUuid,clientIdCipher,clientSecretCipher,
          'VYRON_MIGRATION',bundleUuid,now),
        env.DB.prepare('INSERT OR IGNORE INTO channels(id,name) VALUES (?,?)')
          .bind(row.channelId,channelName)
      ]);
      results.push({channelId:row.channelId,status:'imported'});
    }catch(error){results.push({channelId:row?.channelId||null,status:'failed',reason:safeReason(error)});}
  }
  return {received:input.length,imported:results.filter(x=>x.status==='imported').length,
    failed:results.filter(x=>x.status==='failed').length,results,idempotent:true};
}
