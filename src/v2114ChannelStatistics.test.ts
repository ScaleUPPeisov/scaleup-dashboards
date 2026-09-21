import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON 2.1.14 RC2 channel statistics contract',()=>{
 it('OAuth discovery piggybacks snippet plus statistics on the existing channels.list',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const connect=y.split('pub async fn youtube_oauth_connect(',2)[1]?.split('pub fn youtube_oauth_select_new_channel',2)[0]||'';
  expect(connect).toContain('https://www.googleapis.com/youtube/v3/channels');
  expect(connect).toContain('("part","snippet,statistics")');
  expect(connect).toContain('("mine","true")');
  expect(connect).toContain('("maxResults","50")');
  expect(y).toContain('youtube_channel_statistics_value(item)');
 });
 it('profile-bound refresh uses OAuth token and the real Channel ID',()=>{
  const y=read('src-tauri/src/youtube.rs');
  const block=y.split('pub async fn youtube_channel_statistics(',2)[1]?.split('#[tauri::command]',2)[0]||'';
  expect(block).toContain('valid_access_token(&app,&profile_id)');
  expect(block).toContain('("part","snippet,statistics")');
  expect(block).toContain('("id",expected)');
  expect(block).toContain('emit_youtube_api_request(&app,"channels.list",operation_id.as_deref())');
  expect(block).toContain('CHANNEL_MISMATCH');
 });
 it('quota ledger receives method-level channels.list without compatibility double count',()=>{
  const api=read('src/api.ts');
  expect(api).toContain("'youtube_channel_statistics'");
  expect(api).toContain("youtubeChannelStatistics:(profileId:string,operationId?:string)=>channelStatsSingleFlight");
  const quota=read('src/youtubeQuota.ts');
  expect(quota).toContain("'channels.list':{bucket:'general',cost:1");
 });
 it('statistics are persisted in Channel state and survive restart hydration',()=>{
  const types=read('src/types.ts');
  const store=read('src/store.ts');
  expect(types).toContain('stats?:YoutubeChannelStatistics');
  expect(types).toContain('statisticsUpdatedAt?:string');
  expect(store).toContain('channels:s.channels');
  expect(store).toContain('channels:(s.channels||[]).filter(Boolean).map(normalizeChannel)');
 });
 it('accounts page uses shared stale-cache runtime and preserves last values on errors',()=>{
  const ui=read('src/AccountsPage.tsx');
  const runtime=read('src/youtubeChannelStatsRuntime.ts');
  expect(runtime).toContain('isChannelStatsStale(x.channel.stats,Date.now(),BACKGROUND_CHANNEL_STATS_TTL_MS)');expect(runtime).toContain('classifyYoutubeChannels');
  expect(runtime).toContain('preserveChannelStatisticsOnError');
  expect(ui).toContain('↻ Обновить');
  expect(ui).toContain('Последняя синхронизация');
  expect(ui).toContain('Подписчики');
  expect(ui).toContain('Всего просмотров');
  expect(ui).toContain('Видео');
 });
 it('active channel center shows real total channel stats from cache',()=>{
  const ui=read('src/YouTubeChannelBar.tsx');
  expect(ui).toContain('Всего просмотров');
  expect(ui).toContain('subscriberStatLabel(stats)');
  expect(ui).toContain('stats?.viewCount??stats?.views');
  expect(ui).toContain('stats?.videoCount??stats?.videos');
  expect(ui).toContain('isChannelStatsStale(current.stats)');
 });
});
