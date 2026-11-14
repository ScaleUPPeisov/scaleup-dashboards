import {argon2id} from 'hash-wasm';
import {xchacha20poly1305} from '@noble/ciphers/chacha';

const AAD=new TextEncoder().encode('VYRON-MIGRATION-BUNDLE-v2');
const VALID_CHANNEL=/^UC[A-Za-z0-9_-]{22}$/;
const VALID_CLIENT=/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;

function decode64(value) {
  const raw=atob(String(value||''));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function canonicalPassphrase(value) {
  const source=String(value||'').replace(/^\uFEFF/,'');
  return source.replace(/[\r\n]+$/,'');
}
async function payloadHash(payload,withQueue) {
  // serde_json::Map uses lexical key order without preserve_order. Rebuild the
  // root object in that same order so the native VYRON SHA-256 remains valid.
  const core={
    browserState:payload.browserState,
    googleConfig:payload.googleConfig,
    integrationSecrets:payload.integrationSecrets
  };
  if(withQueue)core.metadataQueue=payload.metadataQueue;
  core.oauthVault=payload.oauthVault;
  core.state=payload.state;
  core.youtubeMetadata=payload.youtubeMetadata;
  const digest=await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(core)));
  return hex(new Uint8Array(digest));
}

export async function decryptVyronMigration(arrayBuffer,passphrase) {
  if(!(arrayBuffer instanceof ArrayBuffer)||arrayBuffer.byteLength<100||arrayBuffer.byteLength>20_000_000)
    throw new Error('Неверный размер пакета VYRON.');
  const password=canonicalPassphrase(passphrase);
  if(Array.from(password).length<10)throw new Error('Пароль пакета должен содержать минимум 10 символов.');
  let envelope;
  try {envelope=JSON.parse(new TextDecoder().decode(arrayBuffer));}
  catch {throw new Error('Файл не является пакетом миграции VYRON.');}
  if(envelope?.schemaVersion!==2||!envelope.bundleUuid)
    throw new Error('Поддерживается только зашифрованный пакет VYRON schema 2.');
  const salt=decode64(envelope.salt),nonce=decode64(envelope.nonce),ciphertext=decode64(envelope.ciphertext);
  if(salt.length!==16||nonce.length!==24||ciphertext.length<17)
    throw new Error('Повреждён контейнер пакета VYRON.');
  const key=await argon2id({password,salt,parallelism:1,iterations:3,
    memorySize:65536,hashLength:32,outputType:'binary'});
  let plain;
  try {plain=xchacha20poly1305(key,nonce,AAD).decrypt(ciphertext);}
  catch {key.fill(0);throw new Error('Неверный пароль или пакет повреждён.');}
  key.fill(0);
  let payload;
  try {payload=JSON.parse(new TextDecoder().decode(plain));}
  catch {plain.fill(0);throw new Error('Расшифрованный пакет повреждён.');}
  plain.fill(0);
  if(payload?.schemaVersion!==2||payload.bundleUuid!==envelope.bundleUuid)
    throw new Error('Манифест пакета VYRON не совпадает.');
  const current=await payloadHash(payload,true);
  const legacy=current===payload.payloadSha256?current:await payloadHash(payload,false);
  if(legacy!==payload.payloadSha256)throw new Error('Контрольная сумма пакета VYRON не совпадает.');
  const vault=payload.oauthVault||{},clientId=String(vault.globalClientId||'').trim();
  const globalSecret=String(vault.globalClientSecret||'').trim();
  if(!VALID_CLIENT.test(clientId)||!globalSecret)
    throw new Error('В пакете нет переносимого OAuth-клиента VYRON.');
  const stateChannels=Array.isArray(payload.state?.channels)?payload.state.channels:[];
  const channels=new Map(stateChannels
    .map(row=>[String(row.youtubeChannelId||''),String(row.name||row.title||row.youtubeChannelId||'')]));
  // Some healthy VYRON profiles predate expectedChannelId in the encrypted vault.
  // Their canonical binding still exists in state.channels via youtubeProfileId.
  // One Google OAuth profile can own/manage multiple YouTube channels.
  // Keep every channel binding; a Map<string,string> silently overwrites all
  // but the final channel for shared profile UUIDs.
  const channelByProfile=new Map();
  for(const row of stateChannels) {
    const profileId=String(row?.youtubeProfileId||'').trim();
    const channelId=String(row?.youtubeChannelId||'').trim();
    if(!profileId||!VALID_CHANNEL.test(channelId))continue;
    const mapped=channelByProfile.get(profileId)||[];
    if(!mapped.includes(channelId))mapped.push(channelId);
    channelByProfile.set(profileId,mapped);
  }
  const profiles=[];
  for(const [id,value] of Object.entries(vault.profiles||{})) {
    const profileUuid=String(value?.profileUuid||id).trim();
    const expectedChannelId=String(value?.expectedChannelId||'').trim();
    const mapped=channelByProfile.get(profileUuid)||channelByProfile.get(id)||[];
    const channelIds=new Set(mapped);
    if(VALID_CHANNEL.test(expectedChannelId))channelIds.add(expectedChannelId);
    const refreshToken=String(value?.refreshToken||'').trim();
    const clientSecret=String(value?.clientSecret||globalSecret).trim();
    if(!refreshToken||!clientSecret||!profileUuid)continue;
    for(const channelId of channelIds) {
      if(!VALID_CHANNEL.test(channelId))continue;
      profiles.push({profileUuid,channelId,
        channelName:channels.get(channelId)||channelId,refreshToken,clientId,clientSecret});
    }
  }
  if(!profiles.length)throw new Error('В пакете нет OAuth-профилей с refresh token.');
  if(profiles.length>100)throw new Error('Пакет содержит слишком много OAuth-профилей.');
  return {bundleUuid:String(envelope.bundleUuid),profiles};
}
