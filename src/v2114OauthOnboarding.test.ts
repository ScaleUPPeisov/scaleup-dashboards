import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 2.1.14 RC1 YouTube OAuth onboarding',()=>{
  it('uses passive Keychain presence only as metadata and requires an operational secret read for READY',()=>{
    const y=read('src-tauri/src/youtube.rs');
    expect(y).toContain('fn reconcile_google_config_presence');
    expect(y).toContain('security::list_canonical_secret_accounts("")');
    expect(y).toContain('canonical_accounts.iter().any(|a|a==&account)');
    expect(y).toContain('google_config_operational_status_value');
    expect(y).toContain('"oauthReady":configured&&operational');
    expect(y).toContain('NEEDS_SECURE_STORAGE_REPAIR');
  });

  it('Add Channel stays visible and readiness failure opens setup guidance, never Finder directly',()=>{
    const ui=read('src/AccountsPage.tsx');
    expect(ui).toContain('>+ Добавить канал</button>');
    expect(ui).toContain("if(!readiness.oauthReady)");
    expect(ui).toContain('setOauthSetupOpen(true)');
    const start=ui.indexOf("async function askBrowser");
    const end=ui.indexOf("async function connect",start);
    const addFlow=ui.slice(start,end);
    expect(addFlow).not.toContain("file.current?.click()");
    expect(ui).toContain('Импортировать credentials.json');
  });

  it('new-channel OAuth explicitly requests account selection and offline consent',()=>{
    const y=read('src-tauri/src/youtube.rs');
    expect(y).toContain('urlencoding::encode("select_account consent")');
    expect(y).toContain('access_type=offline');
    expect(y).toContain('include_granted_scopes=true');
    expect(y).toContain('let auth_url=oauth_authorization_url(');
  });

  it('localhost callback listener is created before the browser opens and state is validated',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const start=y.indexOf('async fn youtube_oauth_connect(');
    const end=y.indexOf('fn reconnect_profile_id',start);
    const connect=y.slice(start,end);
    expect(connect.indexOf('TcpListener::bind("127.0.0.1:0")')).toBeGreaterThan(-1);
    expect(connect.indexOf('open_browser(&auth_url')).toBeGreaterThan(connect.indexOf('TcpListener::bind("127.0.0.1:0")'));
    expect(connect).toContain('wait_for_oauth_code(listener,expected_state)');
    const callback=y.slice(y.indexOf('fn wait_for_oauth_code'),y.indexOf('fn oauth_profiles_value'));
    expect(callback).toContain('OAUTH_STATE_MISMATCH');
    expect(callback).toContain('OAUTH_CALLBACK_TIMEOUT');
  });

  it('new channels keep the one global OAuth client secret while preserving historical resolver compatibility',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const commit=y.split('fn commit_new_channel_oauth(',2)[1]?.split('#[tauri::command]\npub async fn youtube_oauth_connect(',2)[0]||'';
    const connect=y.split('pub async fn youtube_oauth_connect(',2)[1]?.split('pub fn youtube_oauth_select_new_channel',2)[0]||'';
    expect(commit).toContain('google_client_secret_account(&global_meta)');
    expect(commit).toContain('global_meta.client_id.trim()==client_id');
    expect(commit).toContain('client_secret:String::new()');
    expect(connect).toContain('CHANNEL_SELECTION_REQUIRED');
    expect(connect).not.toContain('write_oauth_metadata');
    expect(y).toContain('OAuthClientSecretSource::ProfileCanonical');
    expect(y).toContain('resolve_client_secret_for_profile');
  });

  it('browser picker exposes only backend-confirmed available browsers plus default fallback',()=>{
    const ui=read('src/AccountsPage.tsx');
    const y=read('src-tauri/src/youtube.rs');
    expect(ui).toContain('rows.filter(x=>x.available)');
    expect(ui).toContain("id:'default'");
    expect(y).toContain('("safari", "Safari", "Safari")');
    expect(y).toContain('("chrome", "Google Chrome", "Google Chrome")');
    expect(y).toContain('("firefox", "Firefox", "Firefox")');
    expect(y).toContain('Path::new(base).join(format!("{app}.app")).exists()');
  });

  it('public API key and project display metadata do not participate in OAuth readiness',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const start=y.indexOf('fn google_config_status_value');
    const end=y.indexOf('#[derive',start);
    const status=y.slice(start,end);
    expect(status).toContain('"oauthReady":configured&&operational');
    expect(status).toContain('secretOperational');
    expect(status).not.toContain('api_key_present&&');
    expect(status).not.toContain('project_id&&');
  });

  it('same YouTube Channel ID is blocked before new-profile commit and routed to explicit reconnect',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const commit=y.split('fn commit_new_channel_oauth(',2)[1]?.split('#[tauri::command]\npub async fn youtube_oauth_connect(',2)[0]||'';
    const connect=y.split('pub async fn youtube_oauth_connect(',2)[1]?.split('pub fn youtube_oauth_select_new_channel',2)[0]||'';
    expect(commit).toContain("find(|p|p.channel_id.as_deref()==Some(channel_id.as_str()))");
    expect(commit).toContain('YOUTUBE_CHANNEL_ALREADY_CONNECTED');
    expect(commit).toContain('let profile_id=reconnect_profile_id(None);');
    expect(connect).toContain('CHANNEL_SELECTION_REQUIRED');
    expect(connect).not.toContain('store.profiles.push');
  });
});
