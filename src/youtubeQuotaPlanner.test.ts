import {describe,it,expect} from 'vitest';
import {ESTIMATED_VIDEO_WRITE_UNITS,nextYoutubeQuotaResetAt,planYoutubeQuota,youtubeQuotaClockSnapshot,youtubeQuotaCosts} from './youtubeQuota';

describe('VYRON 1.1 YouTubeQuotaPlanner',()=>{
 it('centralizes current method costs and separate upload bucket',()=>{
  expect(youtubeQuotaCosts['videos.update']).toEqual(expect.objectContaining({bucket:'general',cost:50}));
  expect(youtubeQuotaCosts['thumbnails.set']).toEqual(expect.objectContaining({bucket:'general',cost:50}));
  expect(youtubeQuotaCosts['videos.insert']).toEqual(expect.objectContaining({bucket:'videoUploads',cost:1}));
  expect(ESTIMATED_VIDEO_WRITE_UNITS).toBe(52);
 });
 it('counts one combined videos.update per video, not one request per changed field',()=>{
  const p=planYoutubeQuota([{method:'videos.list',count:30,label:'pre-read'},{method:'videos.update',count:30},{method:'videos.list',count:30,label:'post-write verify'}]);
  expect(p.operations.find(x=>x.method==='videos.update')?.count).toBe(30);
  expect(p.buckets.general.required).toBe(30+30*50+30);
 });
 it('keeps videos.insert outside the 10k general bucket',()=>{
  const p=planYoutubeQuota([{method:'videos.insert',count:15},{method:'thumbnails.set',count:15}]);
  expect(p.buckets.videoUploads.required).toBe(15);
  expect(p.buckets.general.required).toBe(750);
 });
 it('computes next midnight in Pacific Time across DST',()=>{
  const winter=nextYoutubeQuotaResetAt(new Date('2026-01-15T12:00:00Z'));
  const summer=nextYoutubeQuotaResetAt(new Date('2026-07-15T12:00:00Z'));
  expect(winter.toISOString()).toBe('2026-01-16T08:00:00.000Z');
  expect(summer.toISOString()).toBe('2026-07-16T07:00:00.000Z');
 });
 it('countdown is local math only and decreases with time',()=>{
  const a=youtubeQuotaClockSnapshot(new Date('2026-09-03T12:00:00Z'));
  const b=youtubeQuotaClockSnapshot(new Date('2026-09-03T12:00:01Z'));
  expect(b.remainingMs).toBe(a.remainingMs-1000);
 });
});
