import {describe,expect,it} from 'vitest';
import type {Channel} from './types';
import type {ExistingVideoSyncResult} from './api';
import {ownerInventoryIsFresh,ownerInventorySnapshotFromSync,ownerInventoryTotals} from './youtubeOwnerInventory';

const channel=(patch:Partial<Channel>={}):Channel=>({
 id:'c1',name:'Clover Gramophone',slug:'clover',cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,
 language:'EN',genre:'Jazz',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
 youtubeProfileId:'p1',youtubeChannelId:'UC_OWNER',seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]},...patch
});
const result=(patch:Partial<ExistingVideoSyncResult>={}):ExistingVideoSyncResult=>({
 channelId:'UC_OWNER',channelTitle:'Clover Gramophone',youtubeFound:18,received:18,requested:5000,
 privateCount:8,publicCount:0,scheduledCount:10,unlistedCount:0,complete:true,syncComplete:true,scheduleComplete:true,
 fullSyncApiRequests:3,fullSyncEstimatedQuotaCost:3,videos:[],...patch
});

describe('VYRON 4 owner-authorized YouTube inventory',()=>{
 it('counts private and scheduled owner-visible videos instead of public videoCount',()=>{
   const x=ownerInventorySnapshotFromSync(channel(),result(),'2026-09-28T08:00:00Z');
   expect(x.total).toBe(18);
   expect(x.publicCount).toBe(0);
   expect(x.privateCount).toBe(8);
   expect(x.scheduledCount).toBe(10)
 });
 it('scheduled is exclusive from plain private and latest schedule comes only from YouTube publishAt',()=>{
   const x=ownerInventorySnapshotFromSync(channel(),result({videos:[
     {id:'a',position:0,title:'A',description:'',tags:[],categoryId:'10',privacyStatus:'private',publishAt:'2026-10-08T18:00:00Z',selected:false},
     {id:'b',position:1,title:'B',description:'',tags:[],categoryId:'10',privacyStatus:'private',selected:false},
     {id:'c',position:2,title:'C',description:'',tags:[],categoryId:'10',privacyStatus:'private',publishAt:'2026-10-02T18:00:00Z',selected:false},
   ]}));
   expect(x.latestScheduledAt).toBe('2026-10-08T18:00:00.000Z')
 });
 it('does not invent completeness when hydration is incomplete',()=>{
   const x=ownerInventorySnapshotFromSync(channel(),result({complete:false,syncComplete:false,scheduleComplete:false,inventoryIncompleteReasons:['MISSING_HYDRATION']}));
   expect(x.complete).toBe(false);
   expect(x.incompleteReasons).toContain('MISSING_HYDRATION')
 });
 it('uses a freshness TTL so reopening UI does not repeatedly burn quota',()=>{
   const x=ownerInventorySnapshotFromSync(channel(),result(),'2026-09-28T08:00:00Z');
   expect(ownerInventoryIsFresh(x,Date.parse('2026-09-28T08:10:00Z'))).toBe(true);
   expect(ownerInventoryIsFresh(x,Date.parse('2026-09-28T08:31:00Z'))).toBe(false)
 });
 it('aggregates owner inventory without local Render/jobs data',()=>{
   const a=ownerInventorySnapshotFromSync(channel(),result());
   const b=ownerInventorySnapshotFromSync(channel({id:'c2',youtubeProfileId:'p2',youtubeChannelId:'UC2'}),result({channelId:'UC2',publicCount:4,privateCount:2,scheduledCount:3,unlistedCount:1}));
   const t=ownerInventoryTotals([channel(),channel({id:'c2',youtubeProfileId:'p2',youtubeChannelId:'UC2'})],{c1:a,c2:b});
   expect(t.ownerVisible).toBe(28);
   expect(t.scheduledCount).toBe(13);
   expect(t.allComplete).toBe(true)
 })
});
