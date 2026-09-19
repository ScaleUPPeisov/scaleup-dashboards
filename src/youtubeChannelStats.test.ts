import {describe,it,expect} from 'vitest';
import {compactChannelStat,exactChannelStat,isChannelStatsStale,normalizeChannelStatistics,preserveChannelStatisticsOnError,subscriberStatLabel} from './youtubeChannelStats';

describe('VYRON channel statistics cache',()=>{
 it('keeps exact numeric source values while formatting compact UI separately',()=>{
  const s=normalizeChannelStatistics({subscriberCount:254,viewCount:40382,videoCount:87,hiddenSubscriberCount:false,statisticsUpdatedAt:'2026-09-19T14:45:00Z'});
  expect(s.subscriberCount).toBe(254);
  expect(s.viewCount).toBe(40382);
  expect(s.videoCount).toBe(87);
  expect(exactChannelStat(s.viewCount)).toMatch(/40.?382/);
  expect(compactChannelStat(s.viewCount)).toMatch(/40.?382/);
 });
 it('formats millions compactly without changing stored number',()=>{
  expect(compactChannelStat(1_240_000)).toMatch(/1[,.]2.*млн/);
  expect(exactChannelStat(1_240_000)).toMatch(/1.?240.?000/);
 });
 it('never renders hidden subscriber count as fake zero',()=>{
  expect(subscriberStatLabel({hiddenSubscriberCount:true,subscriberCount:0})).toBe('скрыто');
  const s=normalizeChannelStatistics({hiddenSubscriberCount:true,subscriberCount:0,viewCount:100,videoCount:3});
  expect(s.subscriberCount).toBeUndefined();
 });
 it('preserves last known values on refresh error',()=>{
  const prev=normalizeChannelStatistics({subscriberCount:254,viewCount:40382,videoCount:87,statisticsUpdatedAt:'2026-09-19T14:45:00Z'});
  const failed=preserveChannelStatisticsOnError(prev,'network down','2026-09-19T15:00:00Z');
  expect(failed.viewCount).toBe(40382);
  expect(failed.statisticsUpdatedAt).toBe('2026-09-19T14:45:00Z');
  expect(failed.syncWarning).toContain('network down');
 });
 it('uses a controlled 10-minute stale cache',()=>{
  const now=Date.parse('2026-09-19T15:10:00Z');
  expect(isChannelStatsStale({statisticsUpdatedAt:'2026-09-19T15:00:01Z'},now)).toBe(false);
  expect(isChannelStatsStale({statisticsUpdatedAt:'2026-09-19T15:00:00Z'},now)).toBe(true);
 });
});
