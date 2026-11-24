import {describe,expect,it} from 'vitest';
import {dashboardLocalInventory,dashboardLocalInventoryTotal} from './dashboardLocalInventory';
import type {ChannelInventorySnapshot} from './renderInventoryRuntime';
import type {Channel} from './types';

const channel=(id:string,enabled=true)=>({id,enabled}) as Channel;
const snapshot=(patch:Partial<ChannelInventorySnapshot>={}):ChannelInventorySnapshot=>({
 channelId:'a',channelName:'A',renderFolderPath:'/render',folderState:'ONLINE',stale:false,
 physicalFiles:0,readyVideos:0,uploadingVideos:0,uploadedLocalCopies:0,newCandidates:0,
 newGenerations:0,knownReady:0,verifyRequired:0,invalid:0,runwayDays:0,level:'EMPTY',
 lastConfirmedAt:'2026-11-24T00:00:00Z',...patch
});

describe('dashboard local stock truth',()=>{
 it('distinguishes no scan and offline placeholder from a confirmed empty folder',()=>{
  expect(dashboardLocalInventory()).toMatchObject({ready:null,runwayDays:null,state:'unknown'});
  expect(dashboardLocalInventory(snapshot({folderState:'OFFLINE',stale:true,lastConfirmedAt:undefined}))).toMatchObject({ready:null,runwayDays:null,state:'unknown'});
  expect(dashboardLocalInventory(snapshot())).toMatchObject({ready:0,runwayDays:0,state:'current'});
 });
 it('retains last confirmed values but marks offline and scanning snapshots stale',()=>{
  expect(dashboardLocalInventory(snapshot({folderState:'OFFLINE',stale:true,readyVideos:7,runwayDays:7}))).toMatchObject({ready:7,runwayDays:7,state:'stale'});
  expect(dashboardLocalInventory(snapshot({folderState:'SCANNING',readyVideos:4,runwayDays:4}))).toMatchObject({ready:4,runwayDays:4,state:'stale'});
 });
 it('labels partially known and stale totals without inventing zero for missing channels',()=>{
  const channels=[channel('a'),channel('b'),channel('c'),channel('d',false)];
  const snapshots={a:snapshot({channelId:'a',readyVideos:3}),b:snapshot({channelId:'b',folderState:'OFFLINE',stale:true,readyVideos:2}),d:snapshot({channelId:'d',readyVideos:99})};
  expect(dashboardLocalInventoryTotal(channels,snapshots)).toEqual({ready:5,known:2,missing:1,stale:1,total:3});
  expect(dashboardLocalInventoryTotal([channel('a')],{})).toEqual({ready:null,known:0,missing:1,stale:0,total:1});
  expect(dashboardLocalInventoryTotal([],{})).toEqual({ready:0,known:0,missing:0,stale:0,total:0});
 });
});
