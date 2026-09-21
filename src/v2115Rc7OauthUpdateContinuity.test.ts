import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 2.1.15 RC7 OAuth update continuity',()=>{
  it('keeps immutable credential identity across normal updates',()=>{
    const conf=JSON.parse(read('src-tauri/tauri.conf.json'));
    const sec=read('src-tauri/src/security.rs');
    expect(conf.identifier).toBe('studio.channelflow.desktop');
    expect(sec).toContain('com.scaleup.vyron.security.v2');
  });
  it('normal refresh reads resolve the active pointer before touching Keychain',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const req=y.split('fn require_canonical_refresh').at(1)!.split('fn canonical_global_client_secret')[0];
    expect(req).toContain('profile_refresh_token_account(app,profile_id)?');
    expect(req).toContain('canonical_get_secret_cached(&active_account)');
    expect(req).not.toContain('canonical_get_secret_cached(&oauth_key(');
  });
  it('local credential health resolves active accounts and consumes zero YouTube quota',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const block=y.split('fn resolve_oauth_credential_states_local').at(1)!.split('fn oauth_profiles_value')[0];
    expect(block).toContain('profile_refresh_token_account_from_state(&state,&profile.id)');
    expect(y).toContain('"youtubeApiRequests":0');
  });
  it('reconnect fallback uses active rotated account, never fixed RC5 account',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const reconnect=y.split('pub async fn youtube_oauth_reconnect_existing').at(1)!.split('#[cfg(test)]')[0];
    const fallback=reconnect.split('let google_returned_new_refresh').at(1)!.split('let refresh=reconnect_refresh_token')[0];
    expect(fallback).toContain('profile_refresh_token_account(&app,&profile_id)?');
    expect(fallback).not.toContain('canonical_get_secret_cached(&oauth_key(&profile_id,"refresh_token"))');
  });
  it('startup recovery UI may refresh saved tokens but never auto-launches browser or credentials picker',()=>{
    const ui=read('src/AuthRecoveryCenter.tsx');
    const effect=ui.match(/useEffect\(\(\)=>\{.*?\},\[\]\);/s)?.[0]||'';
    const automatic=ui.split('async function runAutomaticRecovery').at(1)?.split('async function reconnect')[0]||'';
    expect(effect).toContain('load()');
    expect(effect).toContain('runAutomaticRecovery(true)');
    expect(automatic).toContain('youtubeOauthRecoverExistingProfiles');
    expect(automatic).not.toContain('youtubeOauthBrowsers');
    expect(automatic).not.toContain('youtubeReconnectExisting');
    expect(automatic).not.toContain('.click()');
  });
  it('contains explicit 13-profile and 50-profile pointer continuity fixtures',()=>{
    const y=read('src-tauri/src/youtube.rs');
    expect(y).toContain('thirteen_profiles_resolve_independent_active_accounts');
    expect(y).toContain('rc7_fifty_profile_update_continuity_changes_no_uuid_or_active_pointer');
    expect(y).toContain('rc7_update_roundtrip_prefers_rotated_pointer_over_blocked_legacy');
  });
});
