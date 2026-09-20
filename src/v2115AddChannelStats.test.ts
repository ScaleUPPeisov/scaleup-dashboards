import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 2.1.15 RC1 Add Channel and channel statistics regression',()=>{
  it('never opens Finder from the Add Channel handler itself',()=>{
    const ui=read('src/AccountsPage.tsx');
    const start=ui.indexOf('async function askBrowser');
    const end=ui.indexOf('async function connect',start);
    expect(start).toBeGreaterThan(-1);
    const block=ui.slice(start,end);
    expect(block).toContain('setOauthSetupOpen(true)');
    expect(block).toContain('youtubeOauthBrowsers');
    expect(block).not.toContain('file.current?.click()');
    expect(ui).toContain('Импортировать credentials.json');
  });

  it('keeps credentials import and browser OAuth as separate explicit flows',()=>{
    const ui=read('src/AccountsPage.tsx');
    expect(ui).toContain('Google OAuth Client ещё не настроен');
    expect(ui).toContain('Выберите браузер для Google авторизации');
    expect(ui).toContain("onClick={()=>file.current?.click()}");
    expect(ui).toContain("onClick={()=>void askBrowser('')}");
  });

  it('keeps metadata presence separate from operational OAuth readiness',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const security=read('src-tauri/src/security.rs');
    expect(y).toContain('c.client_secret_present=c.client_secret_present||inline_client_secret||canonical_accounts.iter().any');
    expect(security).toContain('skip_authenticated_items(true)');
    expect(y).toContain('google_config_operational_status_value');
    expect(y).toContain('"oauthReady":configured&&operational');
    expect(y).toContain('NEEDS_SECURE_STORAGE_REPAIR');
    expect(y).toContain('load_or_migrate_google_config');
  });

  it('Google OAuth has installed-browser selection account selection PKCE state and bounded callback timeout',()=>{
    const y=read('src-tauri/src/youtube.rs');
    expect(y).toContain('("chrome", "Google Chrome", "Google Chrome")');
    expect(y).toContain('("brave", "Brave", "Brave Browser")');
    expect(y).toContain('Path::new(base).join(format!("{app}.app")).exists()');
    expect(y).toContain('urlencoding::encode("select_account consent")');
    expect(y).toContain('code_challenge_method=S256');
    expect(y).toContain('OAUTH_STATE_MISMATCH');
    expect(y).toContain('OAUTH_CALLBACK_TIMEOUT');
    expect(y.match(/wait_for_oauth_code\(listener,expected_state\)/g)?.length||0).toBeGreaterThanOrEqual(2);
  });

  it('preserves the old canonical refresh token when reconnect does not return a replacement',()=>{
    const y=read('src-tauri/src/youtube.rs');
    expect(y).toContain('fn reconnect_refresh_token(');
    expect(y).toContain('existing_refresh=security::canonical_get_secret_cached');
    expect(y).toContain('reconnect_refresh_token(');
    expect(y).not.toContain('fn reconnect_required_refresh_token(');
  });

  it('new Add Channel flow blocks duplicate Channel ID and offers explicit reconnect instead',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const ui=read('src/AccountsPage.tsx');
    expect(y).toContain('YOUTUBE_CHANNEL_ALREADY_CONNECTED');
    expect(ui).toContain("message.includes('YOUTUBE_CHANNEL_ALREADY_CONNECTED')");
    expect(ui).toContain('Этот YouTube-канал уже подключён');
    expect(ui).toContain('Переподключить</button>');
  });

  it('refreshes all known channel statistics through a quota-efficient batch up to 50 IDs',()=>{
    const y=read('src-tauri/src/youtube.rs');
    const api=read('src/api.ts');
    const runtime=read('src/youtubeChannelStatsRuntime.ts');
    expect(y).toContain('pub async fn youtube_channel_statistics_batch');
    expect(y).toContain('if ids.len()>=50');
    expect(y).toContain('emit_youtube_api_request(&app,"channels.list",None)');
    expect(api).toContain("'youtube_channel_statistics_batch'");
    expect(api).toContain('youtubeChannelStatisticsBatch');
    expect(runtime).toContain('offset+=50');
    expect(runtime).toContain('youtubeChannelStatisticsBatch');
  });

  it('runs the background stale-statistics scheduler at the shared ten-minute TTL',()=>{
    const stats=read('src/youtubeChannelStats.ts');
    const scheduler=read('src/ChannelStatisticsScheduler.tsx');
    const app=read('src/App.tsx');
    expect(stats).toContain('CHANNEL_STATS_TTL_MS=10*60*1000');
    expect(scheduler).toContain('setInterval(run,CHANNEL_STATS_TTL_MS)');
    expect(scheduler).toContain('refreshYoutubeChannelStatistics(false)');
    expect(app).toContain('<ChannelStatisticsScheduler/>');
  });

  it('offers manual per-channel and all-channel real API refresh with visible progress',()=>{
    const ui=read('src/AccountsPage.tsx');
    const bar=read('src/YouTubeChannelBar.tsx');
    expect(ui).toContain("'↻ Обновить все'");
    expect(ui).toContain('refreshYoutubeChannelStatistics(force');
    expect(ui).toContain('allStats.done');
    expect(ui).toContain('allStats.total');
    expect(bar).toContain("refreshActive(true)");
    expect(bar).toContain("refreshYoutubeProfileStatistics(profile)");
  });

  it('keeps cached values in Zustand and live-updates UI without page reload',()=>{
    const runtime=read('src/youtubeChannelStatsRuntime.ts');
    const store=read('src/store.ts');
    expect(runtime).toContain('useApp.getState().updateChannel');
    expect(store).toContain('channels:s.channels');
    expect(runtime).toContain('preserveChannelStatisticsOnError');
  });

  it('shows subscribers total channel views and video count prominently in active and account UIs',()=>{
    const bar=read('src/YouTubeChannelBar.tsx');
    const accounts=read('src/AccountsPage.tsx');
    const css=read('src/styles.css');
    expect(bar).toContain('Подписчики');
    expect(bar).toContain('Всего просмотров');
    expect(bar).toContain('Видео');
    expect(accounts).toContain('👥 Подписчики');
    expect(accounts).toContain('👁 Всего просмотров');
    expect(accounts).toContain('🎬 Видео');
    expect(css).toContain('.youtubeChannelBarV215 .youtubeChannelStats b{font-size:16px');
  });

  it('counts channels.list once through the request-event quota ledger and avoids compatibility double counting',()=>{
    const api=read('src/api.ts');
    const quota=read('src/youtubeQuota.ts');
    expect(api).toContain("'youtube_channel_statistics_batch'");
    expect(api).toContain('METHOD_LEDGER_COMMANDS');
    expect(quota).toContain("'channels.list':{bucket:'general',cost:1");
  });
});
