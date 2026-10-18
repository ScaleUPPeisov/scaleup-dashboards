import {describe,expect,it} from 'vitest';
import type {Channel,YoutubeProfile} from './types';
import {buildRpmCoverage,estimateRevenueFromRpm} from './rpmCoverage';

function channel(id:string,views:number|undefined,extra:Partial<Channel>={}):Channel{
 return{id,name:id,slug:id,cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,language:'en',genre:'x',country:'US',minTracks:1,targetDurationMin:60,enabled:true,youtubeProfileId:'p-'+id,youtubeChannelId:'yt-'+id,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]},analytics:views===undefined?undefined:{periodDays:28,updatedAt:'2026-10-18T12:00:00.000Z',views,watchMinutes:0,averageViewDuration:0,averageViewPercentage:0,subscribersGained:0,subscribersLost:0,likes:0,comments:0,shares:0,daily:[],topVideos:[],trafficSources:[],countries:[]},...extra};
}
function profile(id:string,authorized=true):YoutubeProfile{return{id:'p-'+id,channelId:'yt-'+id,analyticsAuthorized:authorized}}

describe('global RPM coverage',()=>{
 it('counts valid zero separately and never turns unknown into zero',()=>{
  const channels=[channel('a',500),channel('b',1000),channel('c',0),channel('d',undefined)];
  const coverage=buildRpmCoverage(channels,[profile('a'),profile('b'),profile('c'),profile('d')]);
  expect(coverage.validChannels).toBe(3);
  expect(coverage.zeroViewChannels).toBe(1);
  expect(coverage.noData).toBe(1);
  expect(coverage.totalViews).toBe(1500);
  expect(estimateRevenueFromRpm(coverage.totalViews,5)).toBe(7.5);
 });
 it('distinguishes no analytics access and not connected',()=>{
  const disconnected=channel('x',undefined,{youtubeChannelId:'wrong'});
  const coverage=buildRpmCoverage([channel('a',0),channel('b',undefined),disconnected],[profile('a'),profile('b',false),profile('x')]);
  expect(coverage.validChannels).toBe(1);
  expect(coverage.noAnalyticsAccess).toBe(1);
  expect(coverage.notConnected).toBe(1);
 });
 it('is independent from any selected channel because selection is not an input',()=>{
  const channels=[channel('a',500),channel('b',1000)];
  const profiles=[profile('a'),profile('b')];
  expect(buildRpmCoverage(channels,profiles).totalViews).toBe(1500);
  expect(buildRpmCoverage(channels,profiles).totalViews).toBe(1500);
 });
});
