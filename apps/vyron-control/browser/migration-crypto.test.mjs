import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {argon2id} from 'hash-wasm';
import {xchacha20poly1305} from '@noble/ciphers/chacha';
import {decryptVyronMigration} from './migration-crypto-entry.mjs';

const enc=new TextEncoder();
const b64=value=>Buffer.from(value).toString('base64');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function fixture(password='temporary migration password') {
  const channelId='UC1234567890123456789012';
  const payload={
    schemaVersion:2,appVersion:'6.1.17',sourceOs:'macos',createdAt:'2026-11-14T00:00:00Z',
    bundleUuid:'bundle-test-001',
    state:{channels:[{id:'local-1',youtubeChannelId:channelId,name:'Test channel'}]},
    oauthVault:{globalClientId:'471814393352-testclient.apps.googleusercontent.com',
      globalClientSecret:'TEST_GLOBAL_SECRET',profiles:{'profile-1':{
        profileUuid:'profile-1',expectedChannelId:channelId,
        refreshToken:'REFRESH_TOKEN_12345678901234567890',clientSecret:'',
        googleEmail:'owner@example.test'
      }}},
    youtubeMetadata:{},googleConfig:{},integrationSecrets:{},browserState:{},metadataQueue:{}
  };
  payload.payloadSha256=digest({browserState:payload.browserState,googleConfig:payload.googleConfig,
    integrationSecrets:payload.integrationSecrets,metadataQueue:payload.metadataQueue,
    oauthVault:payload.oauthVault,state:payload.state,youtubeMetadata:payload.youtubeMetadata});
  const salt=Uint8Array.from({length:16},(_,i)=>i+1);
  const nonce=Uint8Array.from({length:24},(_,i)=>i+20);
  const key=await argon2id({password,salt,parallelism:1,iterations:3,memorySize:65536,
    hashLength:32,outputType:'binary'});
  const ciphertext=xchacha20poly1305(key,nonce,enc.encode('VYRON-MIGRATION-BUNDLE-v2'))
    .encrypt(enc.encode(JSON.stringify(payload)));
  const envelope={schemaVersion:2,appVersion:'6.1.17',sourceOs:'macos',
    createdAt:payload.createdAt,bundleUuid:payload.bundleUuid,
    kdf:'argon2id:m=65536,t=3,p=1 + XChaCha20-Poly1305',
    salt:b64(salt),nonce:b64(nonce),ciphertext:b64(ciphertext)};
  return {bytes:enc.encode(JSON.stringify(envelope)).buffer,channelId};
}

test('browser decrypts native VYRON migration without sending its password',async()=>{
  const password='temporary migration password';
  const {bytes,channelId}=await fixture(password);
  const result=await decryptVyronMigration(bytes,password);
  assert.equal(result.bundleUuid,'bundle-test-001');
  assert.equal(result.profiles.length,1);
  assert.equal(result.profiles[0].channelId,channelId);
  assert.equal(result.profiles[0].clientSecret,'TEST_GLOBAL_SECRET');
  await assert.rejects(()=>decryptVyronMigration(bytes,'wrong password value'),/Неверный пароль/);
});
