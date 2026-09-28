import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const backend=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
const baseConfig=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
const windowsConfig=JSON.parse(fs.readFileSync('src-tauri/tauri.windows.conf.json','utf8'));

function section(start:string,end:string){
  const a=backend.indexOf(start);
  const b=backend.indexOf(end,a+start.length);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return backend.slice(a,b);
}

describe('VYRON 3.3.2 Windows OAuth launcher hotfix',()=>{
  it('TEST 1/3 — authorization URL keeps required OAuth + PKCE fields',()=>{
    const auth=section('fn oauth_authorization_url','fn google_account_identity_matches');
    for(const key of [
      'client_id=','redirect_uri=','response_type=code','scope=','access_type=offline',
      'prompt=','include_granted_scopes=true','code_challenge=','code_challenge_method=S256','state='
    ]) expect(auth).toContain(key);
  });

  it('TEST 2/3 — Windows OAuth launch contains zero shell execution and forwards url directly',()=>{
    const open=section('fn open_browser','fn wait_for_oauth_code');
    const windows=open.split('#[cfg(target_os = "windows")]')[1]?.split('#[cfg(target_os = "linux")]')[0]||'';
    expect(windows).toContain('tauri_plugin_opener::open_url(url, None::<&str>)');
    expect(windows).toContain('OAUTH_BROWSER_OPEN_FAILED');
    expect(windows).not.toContain('Command::new("cmd")');
    expect(windows).not.toContain('cmd.exe');
    expect(windows).not.toContain('"/C"');
    expect(windows).not.toContain('"start"');
    expect(windows.toLowerCase()).not.toContain('powershell');
    expect(windows).not.toContain('replace(');
    expect(windows).not.toContain('split(');
  });

  it('TEST 3/3 — callback/token/channel semantics and Windows-only updater routing stay intact',()=>{
    expect(backend).toContain('TcpListener::bind("127.0.0.1:0")');
    expect(backend).toContain('OAUTH_STATE_MISMATCH: callback state does not match request');
    expect(backend).toContain('("code_verifier".into(),verifier.into())');
    expect(backend).toContain('("grant_type".into(),"authorization_code".into())');
    expect(backend).toContain('("redirect_uri".into(),redirect.into())');
    expect(backend).toContain('fn commit_new_channel_oauth(');
    expect(backend).toContain('.query(&[("part", "snippet,statistics"), ("mine", "true")])');

    expect(baseConfig.version).toBe('3.3.4');
    expect(baseConfig.identifier).toBe('studio.channelflow.desktop');
    expect(baseConfig.plugins.updater.endpoints).toEqual([
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json',
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json'
    ]);
    expect(windowsConfig.plugins.updater.endpoints).toEqual([
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json',
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json'
    ]);
  });
});
