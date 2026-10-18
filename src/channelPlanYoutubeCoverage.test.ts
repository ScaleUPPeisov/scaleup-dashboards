import {describe,expect,it} from 'vitest';
import type {Channel} from './types';
import type {ChannelRunwayRecord} from './channelRunwayCore';
import {buildContentRunway,confirmedScheduledRunwaySnapshot} from './contentRunway';

const channel:Channel={id:'c1',name:'Aether Riff',slug:'aether-riff',cadenceDays:1,targetBufferDays:45,publishHour:18,publishMinute:0,language:'en',genre:'deep house',country:'US',minTracks:1,targetDurationMin:60,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}};
const record:ChannelRunwayRecord={channelId:'c1',channelName:'Aether Riff',scheduledUntil:'2026-11-07',scheduledVideoCount:20,runwayDays:20,lastScheduleSync:'2026-10-18T00:00:00.000Z',lastLocalCalculation:'2026-10-18T00:00:00.000Z',priority:'high',status:'prepare'};
const now=new Date('2026-10-18T00:00:00.000Z');

describe('Channel Plan YouTube coverage',()=>{
 it('keeps На YouTube до fixed to authoritative remote scheduledUntil when local files extend production runway',()=>{
  const base=buildContentRunway(channel,record,[],[],{}, {},now);
  const snapshot=confirmedScheduledRunwaySnapshot(channel,base,record,20,now);
  expect(snapshot.scheduledThrough).toBe('2026-11-07');
  expect(snapshot.remoteScheduledDays).toBe(20);
  expect(snapshot.readyVideoCount).toBe(20);
  expect(snapshot.localReadyDays).toBe(20);
  expect(snapshot.projectedRunwayEnd).toBe('2026-11-27');
  expect(snapshot.contentRunwayDays).toBe(40);
 });
 it('shows no future YouTube date when remote state has none even if local READY exists',()=>{
  const noRemote:ChannelRunwayRecord={...record,scheduledUntil:undefined,scheduledVideoCount:0,runwayDays:0,status:'ended'};
  const base=buildContentRunway(channel,noRemote,[],[],{}, {},now);
  const snapshot=confirmedScheduledRunwaySnapshot(channel,base,noRemote,5,now);
  expect(snapshot.scheduledThrough).toBeUndefined();
  expect(snapshot.remoteScheduledDays).toBe(0);
  expect(snapshot.readyVideoCount).toBe(5);
  expect(snapshot.contentRunwayDays).toBeGreaterThan(0);
 });
});
