import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 2.1.14 RC1 YouTube OAuth onboarding',()=>{
  it('repairs OAuth readiness from canonical Keychain presence instead of stale metadata only',()=>{
    const y=read('src-tauri/src/youtube.rs');
    expect(y).toContain('fn reconcile_google_config_presence');
    expect(y).toContain('security::list_canonical_secret_accounts("")');
    expect(y).toContain('canonical_accounts.iter().any(|a|a.as_str()==GOOGLE_CLIENT_SECRET)');
    expect(y).toContain('let oauth_ready=configured&&c.client_secret_present;');
  });

  it('Add Channel stays visible but still routes through the real readiness gate',()=>{
    const ui=read('src/AccountsPage.tsx');
    expect(ui).toContain('>+ Добавить канал</button>');
    expect(ui).toContain("if(!profileId&&!config?.oauthReady)");
    expect(ui).toContain("file.current?.click()");
    expect(ui).not.toContain("oauthReady?'+ Добавить канал':'Настроить OAuth Client'");
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
    expect(connect).toContain('OAUTH_STATE_MISMATCH');
  });

  it('new channels keep the one global OAuth client secret while preserving historical resolver compatibility',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const start=y.indexOf('async fn youtube_oauth_connect(');
    const end=y.indexOf('fn reconnect_profile_id',start);
    const connect=y.slice(start,end);
    expect(connect).toContain('canonical_set_secret(GOOGLE_CLIENT_SECRET');
    expect(connect).toContain('client_secret: String::new()');
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
    expect(status).toContain('let oauth_ready=configured&&c.client_secret_present;');
    expect(status).not.toContain('api_key_present&&');
    expect(status).not.toContain('project_id&&');
  });

  it('same YouTube Channel ID reuses existing Profile UUID and duplicate profile creation is blocked by replacement',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const start=y.indexOf('async fn youtube_oauth_connect(');
    const end=y.indexOf('fn reconnect_profile_id',start);
    const connect=y.slice(start,end);
    expect(connect).toContain("find(|p|p.channel_id.as_deref()==Some(channel_id.as_str()))");
    expect(connect).toContain('let profile_id=reconnect_profile_id(existing.as_ref());');
    expect(connect).toContain('retain(|p| p.id != profile_id && p.channel_id.as_deref() != Some(channel_id.as_str()))');
  });
});
