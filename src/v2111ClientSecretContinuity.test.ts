import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildFinalRecoveryRows,reconnectFailure} from './authRecoveryFinalCore';
import {humanizeError} from './errorCenter';

describe('VYRON 2.1.11 OAuth client secret continuity',()=>{
 it('physical 2.1.10 case becomes CLIENT SECRET REQUIRED before reconnect',()=>{
  const rows=buildFinalRecoveryRows(
   [{id:'c1',name:'A',youtubeProfileId:'P1',youtubeChannelId:'UC1'}],
   [{id:'P1',channelId:'UC1'}],
   [{profileUuid:'P1',credentialState:'RECONNECT_REQUIRED',canonicalRefreshPresent:false,legacyRefreshPresent:true,migrationState:'RECONNECT_REQUIRED',clientSecretState:'MISSING',clientSecretPresent:false}]
  );
  expect(rows[0].status).toBe('CLIENT SECRET REQUIRED');
  expect(rows[0].detail).toContain('credentials.json');
 });
 it('profile with exact client secret remains reconnectable without new UUID',()=>{
  const rows=buildFinalRecoveryRows(
   [{id:'c1',name:'A',youtubeProfileId:'P1',youtubeChannelId:'UC1'}],
   [{id:'P1',channelId:'UC1'}],
   [{profileUuid:'P1',credentialState:'RECONNECT_REQUIRED',canonicalRefreshPresent:false,legacyRefreshPresent:true,migrationState:'RECONNECT_REQUIRED',clientSecretState:'PROFILE_CANONICAL',clientSecretPresent:true}]
  );
  expect(rows[0].status).toBe('RECONNECT REQUIRED');
  expect(rows[0].profileId).toBe('P1');
 });
 it('humanizes missing secret instead of raw Google error',()=>{
  const h=humanizeError('OAUTH_CLIENT_SECRET_REQUIRED: exact client_secret for client_id is missing','oauth');
  expect(h.code).toBe('OAUTH_CLIENT_SECRET_REQUIRED');
  expect(h.title).toContain('OAuth Client');
  expect(h.message).toContain('credentials.json');
  expect(reconnectFailure('client_secret is missing').status).toBe('CLIENT SECRET REQUIRED');
 });
 it('recovery UI exposes secure import and never reads credentials text in React',()=>{
  const ui=readFileSync('src/AuthRecoveryCenter.tsx','utf8');
  const api=readFileSync('src/api.ts','utf8');
  expect(ui).toContain('Импортировать credentials.json');
  expect(ui).toContain('youtubeImportProfileCredentials');
  expect(api).toContain('youtube_oauth_import_profile_credentials_file');
  expect(api).not.toContain('readTextFile');
 });
 it('callback wording does not claim final connection success',()=>{
  const y=readFileSync('src-tauri/src/youtube.rs','utf8');
  expect(y).toContain('Google передал код авторизации ✅');
  expect(y).not.toContain('Google подтвердил доступ ✅');
 });
});
