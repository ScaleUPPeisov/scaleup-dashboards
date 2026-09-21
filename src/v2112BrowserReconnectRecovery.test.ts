import {describe,it,expect} from 'vitest';
import {buildFinalRecoveryRows,reconnectQueue} from './authRecoveryFinalCore';
import {readFileSync} from 'node:fs';

describe('VYRON 2.1.12 browser reconnect recovery',()=>{
 it('physical 2.1.11 screen becomes reconnectable when current global OAuth client is ready',()=>{
  const rows=buildFinalRecoveryRows(
   [{id:'c1',name:'Channel A',youtubeProfileId:'P1',youtubeChannelId:'UC1'}],
   [{id:'P1',channelId:'UC1'}],
   [{
    profileUuid:'P1',
    credentialState:'RECONNECT_REQUIRED',
    canonicalRefreshPresent:false,
    legacyRefreshPresent:true,
    migrationState:'RECONNECT_REQUIRED',
    clientSecretState:'GLOBAL_CURRENT_READY',
    clientSecretPresent:true,
    lastValidationResult:'RECONNECT_REQUIRED'
   }]
  );
  expect(rows[0].status).toBe('RECONNECT REQUIRED');
  expect(rows[0].detail).toContain('Выберите браузер');
  expect(reconnectQueue(rows).map(x=>x.profileId)).toEqual(['P1']);
 });
 it('missing all OAuth client credentials still blocks before browser',()=>{
  const rows=buildFinalRecoveryRows(
   [{id:'c1',name:'Channel A',youtubeProfileId:'P1',youtubeChannelId:'UC1'}],
   [{id:'P1',channelId:'UC1'}],
   [{
    profileUuid:'P1',
    credentialState:'RECONNECT_REQUIRED',
    canonicalRefreshPresent:false,
    legacyRefreshPresent:true,
    migrationState:'RECONNECT_REQUIRED',
    clientSecretState:'MISSING',
    clientSecretPresent:false
   }]
  );
  expect(rows[0].status).toBe('CLIENT SECRET REQUIRED');
 });
 it('recovery UI keeps target guidance and explicit browser chooser for reconnectable profiles',()=>{
  const ui=readFileSync('src/AuthRecoveryCenter.tsx','utf8');
  expect(ui).toContain('ПЕРЕПОДКЛЮЧЕНИЕ СУЩЕСТВУЮЩЕГО ПРОФИЛЯ');
  expect(ui).toContain('prepareReconnect(r.profileId)');
  expect(ui).toContain('Выбрать браузер и продолжить');
  expect(ui).toContain('Через какой браузер открыть этот канал?');
  expect(ui).toContain('chooseBrowser(id)');
  expect(ui).toContain('Google/YouTube аккаунтом');
 });
 it('backend reconnect uses dedicated recovery resolver, not historical exact-only resolver',()=>{
  const y=readFileSync('src-tauri/src/youtube.rs','utf8');
  const reconnect=y.split('pub async fn youtube_oauth_reconnect_existing(',2)[1]||'';
  expect(reconnect).toContain('resolve_reconnect_oauth_client');
  expect(reconnect).not.toContain('resolve_client_secret_for_profile(&app,&profile_id,&client_id)');
  expect(y).toContain('GlobalCurrentMigration');
 });
});
