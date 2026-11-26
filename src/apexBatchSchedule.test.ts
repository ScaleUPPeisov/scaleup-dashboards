import {describe,expect,it} from 'vitest';
import {continuationPlan} from './apexBatchSchedule';
import type {Channel,VideoJob} from './types';
const now=Date.parse('2026-11-26T00:00:00Z');
const c={id:'c',youtubeChannelId:'yt',publishHour:12,publishMinute:30,publishIntervalDays:3} as Channel;
const jobs=[{id:'a',channelId:'c'},{id:'b',channelId:'c'}] as VideoJob[];
const evidence={complete:true,youtubeChannelId:'yt',updatedAt:new Date(now).toISOString(),occupied:['2026-12-01T05:30:00Z']};
describe('APEX batch continuation',()=>{
 it('continues three-day cadence after remote and local reservations',()=>{
  const result=continuationPlan(c,jobs,evidence,['2026-12-04T05:30:00Z'],now);
  expect([...result.dates.values()]).toEqual(['2026-12-07T05:30:00.000Z','2026-12-10T05:30:00.000Z']);
 });
 it('rejects stale, partial, future-dated or wrong-channel evidence',()=>{
  for(const patch of [{complete:false},{youtubeChannelId:'other'},{updatedAt:new Date(now-6*3600000).toISOString()},{updatedAt:new Date(now+1).toISOString()}])expect(continuationPlan(c,jobs,{...evidence,...patch},[],now).dates.size).toBe(0);
 });
 it('uses the existing pattern anchor instead of restarting the cycle',()=>{
  const result=continuationPlan({...c,scheduleMode:'pattern',publishDays:2,pauseDays:2,patternAnchorDate:'2026-12-01'},jobs,evidence,[],now);
  expect([...result.dates.values()]).toEqual(['2026-12-02T05:30:00.000Z','2026-12-05T05:30:00.000Z']);
 });
 it('starts a verified empty schedule in the future and never assumes an invalid time',()=>{
  expect([...continuationPlan(c,jobs,{...evidence,occupied:[]},[],now).dates.values()][0]).toBe('2026-11-26T05:30:00.000Z');
  expect(continuationPlan({...c,publishHour:99},jobs,evidence,[],now).dates.size).toBe(0);
 });
});
