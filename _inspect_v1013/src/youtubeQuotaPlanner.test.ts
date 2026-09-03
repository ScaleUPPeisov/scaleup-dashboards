import {describe,it,expect} from 'vitest';
import {buildYoutubeQuotaPlan,youtubeQuotaCost} from './youtubeQuota';

describe('YouTube quota planner',()=>{
 it('prices one combined metadata+schedule write conservatively',()=>{
  expect(youtubeQuotaCost('youtube_update_existing_video',{}, {metadataAccepted:true,scheduleRequested:true,scheduleAccepted:true,skipped:false})).toBe(51);
  expect(youtubeQuotaCost('youtube_update_existing_video',{}, {skipped:true})).toBe(1);
 });
 it('splits 100 channels by the remaining daily quota',()=>{
  const plan=buildYoutubeQuotaPlan(100,30,{ptDate:'2026-09-01',limit:10000,used:0,calls:0});
  expect(plan.perChannel).toBe(1563);
  expect(plan.todayChannels).toBe(6);
  expect(plan.days).toBe(17);
  expect(plan.rows[0].channels).toBe(6);
 });
 it('shows zero capacity after quota is exhausted',()=>{
  const plan=buildYoutubeQuotaPlan(30,30,{ptDate:'2026-09-01',limit:10000,used:10000,calls:1});
  expect(plan.remaining).toBe(0);
  expect(plan.todayChannels).toBe(0);
 });
});
