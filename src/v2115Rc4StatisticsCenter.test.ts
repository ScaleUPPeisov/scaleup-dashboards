import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import type {Channel,ChannelStatisticsHistory,YoutubeProfile} from './types';
import {appendStatisticsSnapshot,classifyYoutubeChannels,latestStatisticsSnapshot,makeStatisticsSnapshot,migrateStatisticsBaselines,monthlyStatisticsSummary,statisticsDelta} from './youtubeStatisticsCenter';

const channel=(n:number,linked=true):Channel=>({
 id:'c'+n,name:'Channel '+n,slug:'channel-'+n,cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
 youtubeProfileId:linked?'p'+n:undefined,youtubeChannelId:linked?'UC'+String(n).padStart(4,'0'):undefined,
 seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}
});
const profile=(n:number):YoutubeProfile=>({id:'p'+n,channelId:'UC'+String(n).padStart(4,'0'),channelTitle:'Channel '+n,credentialStatus:'CHECK_ON_USE'});

describe('VYRON 2.1.15 RC4 multi-channel statistics center',()=>{
 it('31 local / 17 linked produces exactly 17 unique refresh targets',()=>{
  const channels=[...Array.from({length:17},(_,i)=>channel(i+1,true)),...Array.from({length:14},(_,i)=>channel(i+18,false))];
  const profiles=Array.from({length:17},(_,i)=>profile(i+1));
  const c=classifyYoutubeChannels(channels,profiles);
  expect(channels).toHaveLength(31);expect(c.eligible).toHaveLength(17);expect(c.unlinked).toHaveLength(14);
 });

 it('unlinked and new local channels never become statistics targets',()=>{
  const channels=[channel(1,true),channel(2,false),{...channel(3,false),name:'New Channel 32'}],profiles=[profile(1)];
  const c=classifyYoutubeChannels(channels,profiles);
  expect(c.eligible.map(x=>x.channel.id)).toEqual(['c1']);
  expect(c.unlinked.map(x=>x.id)).toEqual(['c2','c3']);
 });

 it('newly OAuth-linked channel becomes eligible automatically',()=>{
  const local=channel(18,false),before=classifyYoutubeChannels([local],[]);
  expect(before.eligible).toHaveLength(0);
  const linked={...local,youtubeProfileId:'p18',youtubeChannelId:'UC0018'};
  expect(classifyYoutubeChannels([linked],[profile(18)]).eligible.map(x=>x.channel.id)).toEqual(['c18']);
 });

 it('orphan and channel mismatch are excluded',()=>{
  const orphan=channel(1,true),mismatch={...channel(2,true),youtubeChannelId:'UC-WRONG'};
  const c=classifyYoutubeChannels([orphan,mismatch],[profile(2)]);
  expect(c.eligible).toHaveLength(0);expect(c.orphans.map(x=>x.id)).toEqual(['c1']);expect(c.mismatched.map(x=>x.id)).toEqual(['c2']);
 });

 it('duplicate Channel ID is queried once and reported as anomaly',()=>{
  const a=channel(1,true),b={...channel(2,true),youtubeChannelId:a.youtubeChannelId},p1=profile(1),p2={...profile(2),channelId:a.youtubeChannelId};
  const c=classifyYoutubeChannels([a,b],[p1,p2]);
  expect(c.linked).toHaveLength(2);expect(c.eligible).toHaveLength(1);expect(c.duplicates).toHaveLength(1);expect(c.duplicates[0].youtubeChannelId).toBe(a.youtubeChannelId);
 });

 it('successful current stats become persistent raw-number snapshots',()=>{
  const c=channel(1,true),p=profile(1),s=makeStatisticsSnapshot(c,p,{channelId:p.channelId,subscriberCount:199,viewCount:36249,videoCount:137,hiddenSubscriberCount:false,statisticsUpdatedAt:'2026-09-20T09:42:00Z'});
  expect(s.subscriberCount).toBe(199);expect(s.viewCount).toBe(36249);expect(s.videoCount).toBe(137);expect(s.capturedAt).toBe('2026-09-20T09:42:00.000Z');
 });

 it('hidden subscribers remain hidden, never converted to zero',()=>{
  const s=makeStatisticsSnapshot(channel(1,true),profile(1),{subscriberCount:0,viewCount:10,videoCount:1,hiddenSubscriberCount:true,statisticsUpdatedAt:'2026-09-20T00:00:00Z'});
  expect(s.hiddenSubscriberCount).toBe(true);expect(s.subscriberCount).toBeUndefined();
 });

 it('identical refreshes compact within a day but keep a later daily anchor',()=>{
  const c=channel(1,true),p=profile(1),base={subscriberCount:10,viewCount:100,videoCount:5,hiddenSubscriberCount:false};
  let h:ChannelStatisticsHistory={};
  h=appendStatisticsSnapshot(h,makeStatisticsSnapshot(c,p,{...base,statisticsUpdatedAt:'2026-09-20T08:00:00Z'}));
  h=appendStatisticsSnapshot(h,makeStatisticsSnapshot(c,p,{...base,statisticsUpdatedAt:'2026-09-20T16:00:00Z'}));
  expect(h.c1).toHaveLength(1);
  h=appendStatisticsSnapshot(h,makeStatisticsSnapshot(c,p,{...base,statisticsUpdatedAt:'2026-09-21T08:00:00Z'}));
  expect(h.c1).toHaveLength(2);
 });

 it('24h / 7d / 30d deltas use snapshot at or before deterministic target',()=>{
  const c=channel(1,true),p=profile(1);
  const rows=[
   makeStatisticsSnapshot(c,p,{subscriberCount:100,viewCount:1000,videoCount:10,statisticsUpdatedAt:'2026-08-20T12:00:00Z'}),
   makeStatisticsSnapshot(c,p,{subscriberCount:110,viewCount:2000,videoCount:11,statisticsUpdatedAt:'2026-09-13T12:00:00Z'}),
   makeStatisticsSnapshot(c,p,{subscriberCount:120,viewCount:3000,videoCount:12,statisticsUpdatedAt:'2026-09-19T12:00:00Z'}),
  ];
  const current=makeStatisticsSnapshot(c,p,{subscriberCount:123,viewCount:3400,videoCount:13,statisticsUpdatedAt:'2026-09-20T12:00:00Z'});
  expect(statisticsDelta(rows,current,86400000).subscriberDelta).toBe(3);
  expect(statisticsDelta(rows,current,7*86400000).subscriberDelta).toBe(13);
  expect(statisticsDelta(rows,current,30*86400000).subscriberDelta).toBe(23);
 });

 it('insufficient history is explicit, not zero',()=>{
  const current=makeStatisticsSnapshot(channel(1,true),profile(1),{subscriberCount:199,viewCount:36249,videoCount:137,statisticsUpdatedAt:'2026-09-20T12:00:00Z'});
  const d=statisticsDelta([],current,86400000);expect(d.insufficient).toBe(true);expect(d.subscriberDelta).toBeUndefined();expect(d.viewDelta).toBeUndefined();
 });

 it('monthly summary reports partial coverage rather than claiming a full month',()=>{
  const c=channel(1,true),p=profile(1),rows=[
   makeStatisticsSnapshot(c,p,{subscriberCount:100,viewCount:1000,videoCount:10,statisticsUpdatedAt:'2026-09-20T00:00:00Z'}),
   makeStatisticsSnapshot(c,p,{subscriberCount:110,viewCount:1800,videoCount:12,statisticsUpdatedAt:'2026-09-30T20:00:00Z'})
  ];
  const m=monthlyStatisticsSummary(rows,2026,8)!;
  expect(m.subscriberChange).toBe(10);expect(m.viewChange).toBe(800);expect(m.videoChange).toBe(2);expect(m.completeMonth).toBe(false);
 });

 it('existing cached statistics migrate once as an idempotent baseline',()=>{
  const c={...channel(1,true),stats:{subscriberCount:199,viewCount:36249,videoCount:137,statisticsUpdatedAt:'2026-09-20T09:00:00Z'}},p=profile(1);
  const first=migrateStatisticsBaselines([c],[p],{});expect(first.added).toBe(1);expect(first.history.c1).toHaveLength(1);expect(first.history.c1[0].source).toBe('MIGRATED_BASELINE');
  const second=migrateStatisticsBaselines([c],[p],first.history);expect(second.added).toBe(0);expect(second.history.c1).toHaveLength(1);
 });

 it('runtime refresh targets exact classification, batches up to 50 and never iterates all local channels into API calls',()=>{
  const runtime=fs.readFileSync('src/youtubeChannelStatsRuntime.ts','utf8'),backend=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
  expect(runtime).toContain('classification.eligible.filter');
  expect(runtime).toContain('offset+=50');
  expect(runtime).toContain('requestBatchWithDriverRotation');
  expect(runtime).not.toContain('channels.map(async');
  expect(backend).toContain('if ids.len()>=50');
  expect(backend).toContain('operation_id.as_deref()');
 });

 it('Refresh All is single-flight and one failed channel preserves its cache',()=>{
  const runtime=fs.readFileSync('src/youtubeChannelStatsRuntime.ts','utf8');
  expect(runtime).toContain('if(allRun)return allRun');
  expect(runtime).toContain('preserveChannelStatisticsOnError');
  expect(runtime).toContain('preserveLinked(row,error)');
 });

 it('quota is factual method-ledger accounting with no compatibility double debit',()=>{
  const api=fs.readFileSync('src/api.ts','utf8'),runtime=fs.readFileSync('src/youtubeChannelStatsRuntime.ts','utf8'),quota=fs.readFileSync('src/youtubeQuota.ts','utf8');
  expect(api).toContain("'youtube_channel_statistics_batch'");
  expect(api).toContain('operationId');
  expect(runtime).toContain('youtubeOperationActualCost(operationId)');
  expect(quota).toContain("'channels.list':{bucket:'general',cost:1");
  expect(quota).toContain("if(!METHOD_LEDGER_COMMANDS.has(command))recordYoutubeCommand");
 });

 it('Statistics UI never imports credentials, opens Finder, or starts OAuth reconnect',()=>{
  const ui=fs.readFileSync('src/StatisticsCenter.tsx','utf8'),runtime=fs.readFileSync('src/youtubeChannelStatsRuntime.ts','utf8');
  for(const forbidden of ['youtubeImportGoogleConfig','youtubeReconnectExisting','youtubeConnectGlobal','file.current','credentials.json']){expect(ui).not.toContain(forbidden);expect(runtime).not.toContain(forbidden)}
 });

 it('Activity Journal has batch and one-channel statistics events',()=>{
  const runtime=fs.readFileSync('src/youtubeChannelStatsRuntime.ts','utf8'),core=fs.readFileSync('src/activityJournalCore.ts','utf8');
  expect(runtime).toContain("eventType:'STATS_REFRESH_BATCH'");
  expect(runtime).toContain("eventType:'CHANNEL_STATS_REFRESH'");
  expect(core).toContain("'STATS_REFRESH_BATCH'");
  expect(core).toContain("'CHANNEL_STATS_REFRESH'");
 });

 it('background statistics cadence is controlled and linked-only runtime performs targeting',()=>{
  const scheduler=fs.readFileSync('src/ChannelStatisticsScheduler.tsx','utf8'),runtime=fs.readFileSync('src/youtubeChannelStatsRuntime.ts','utf8');
  expect(scheduler).toContain('BACKGROUND_CHANNEL_STATS_TTL_MS');
  expect(runtime).toContain('45*60*1000');
  expect(runtime).toContain('classifyYoutubeChannels');
 });

 it('extended Analytics uses existing authorization only and does not force reconnect',()=>{
  const ui=fs.readFileSync('src/StatisticsCenter.tsx','utf8'),backend=fs.readFileSync('src-tauri/src/youtube_intelligence.rs','utf8');
  expect(ui).toContain('detail.profile.analyticsAuthorized');
  expect(ui).toContain('api.youtubeAnalytics');
  expect(ui).toContain('VYRON не запускает OAuth reconnect автоматически');
  for(const metric of ['views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares'])expect(backend).toContain(metric);
 });
});
