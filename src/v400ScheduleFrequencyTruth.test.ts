import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {Channel} from './types';
import {configuredScheduleAverageIntervalDays,scheduleFrequencyTruthLabel} from './channelSchedule';

const channel=(patch:Partial<Channel>={}):Channel=>({
  id:'c1',name:'Clover Gramophone',slug:'clover',cadenceDays:2,targetBufferDays:60,
  publishHour:18,publishMinute:0,language:'EN',genre:'Jazz',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
  seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]},...patch
});

describe('VYRON 4.0.0 schedule frequency truth',()=>{
  it('actual daily YouTube schedule wins over stale cadenceDays=2',()=>{
    const c=channel({cadenceDays:2,publishIntervalDays:2});
    expect(scheduleFrequencyTruthLabel(c,{lastScheduleSync:'2026-09-28T00:00:00Z',scheduledVideoCount:7,averagePublishIntervalDays:1})).toBe('Каждый день • YouTube')
  });

  it('actual non-daily cadence is presented as observed YouTube cadence',()=>{
    expect(scheduleFrequencyTruthLabel(channel(),{lastScheduleSync:'2026-09-28T00:00:00Z',scheduledVideoCount:6,averagePublishIntervalDays:2})).toBe('≈ каждые 2 дн. • YouTube')
  });

  it('saved explicit VYRON daily and pattern schedules are valid fallback truth',()=>{
    expect(scheduleFrequencyTruthLabel(channel({publishIntervalDays:1}))).toBe('Каждый день • VYRON');
    expect(scheduleFrequencyTruthLabel(channel({scheduleMode:'pattern',publishDays:2,pauseDays:2,patternAnchorDate:'2026-09-28'}))).toBe('2/2 • VYRON');
    expect(configuredScheduleAverageIntervalDays(channel({publishIntervalDays:1}))).toBe(1)
  });

  it('legacy cadenceDays alone is not enough to invent a frequency',()=>{
    expect(scheduleFrequencyTruthLabel(channel({cadenceDays:2,publishIntervalDays:undefined,scheduleMode:undefined}))).toBe('Нет данных');
    expect(configuredScheduleAverageIntervalDays(channel({cadenceDays:2,publishIntervalDays:undefined,scheduleMode:undefined}))).toBeUndefined()
  });

  it('Publisher persists a chosen schedule mode only after a batch is actually queued',()=>{
    const source=fs.readFileSync('src/PublisherOS.tsx','utf8');
    expect(source).toContain("if(queued.length){persistQueuedScheduleMode()");
    expect(source).toContain("scheduleMode:'interval',publishIntervalDays:1,cadenceDays:1");
    expect(source).toContain("scheduleMode:'pattern',publishDays:2,pauseDays:2");
    expect(source).toContain("scheduleMode:'pattern',publishDays:3,pauseDays:1")
  });

  it('runway UI uses schedule truth label and monetization does not fake unavailable criteria',()=>{
    const runway=fs.readFileSync('src/ChannelRunway.tsx','utf8');
    const dashboard=fs.readFileSync('src/DashboardOS.tsx','utf8');
    expect(runway).toContain('scheduleFrequencyTruthLabel(channel,record)');
    expect(runway).not.toContain('scheduleDescription(channel)');
    expect(dashboard).toContain('Public watch hours: нет данных');
    expect(dashboard).toContain('Shorts views: нет данных')
  });
});
