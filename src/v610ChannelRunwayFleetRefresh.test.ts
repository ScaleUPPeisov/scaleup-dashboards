import {readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Channel,YoutubeExistingVideo,YoutubeProfile} from './types';

class MemoryStorage{
 private m=new Map<string,string>();
 getItem(k:string){return this.m.get(k)??null}
 setItem(k:string,v:string){this.m.set(k,String(v))}
 removeItem(k:string){this.m.delete(k)}
 clear(){this.m.clear()}
 key(i:number){return[...this.m.keys()][i]??null}
 get length(){return this.m.size}
}
const storage=new MemoryStorage();
Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});

const fixture=vi.hoisted(()=>({
 profiles:[] as YoutubeProfile[],
 responses:new Map<string,{videos:YoutubeExistingVideo[];syncComplete:boolean;complete:boolean;scheduleComplete:boolean;channelId:string;fullSyncApiRequests?:number;fullSyncEstimatedQuotaCost?:number;searchCalls?:number;incompleteReasons?:string[]}>(),
 inventoryFiles:new Map<string,any>()
}));
vi.mock('./api',()=>({
 api:{
  youtubeProfiles:vi.fn(async()=>fixture.profiles),
  youtubeListExisting:vi.fn(async(profileId:string)=>fixture.responses.get(profileId)||{videos:[],syncComplete:false,complete:false,scheduleComplete:false,channelId:''}),
  youtubeInventoryRead:vi.fn(async(channelId:string)=>fixture.inventoryFiles.has(channelId)?{found:true,schemaVersion:2,channelId,path:'native',payload:fixture.inventoryFiles.get(channelId)}:{found:false,schemaVersion:2,channelId,path:'native'}),
  youtubeInventoryWrite:vi.fn(async(channelId:string,payload:any)=>{fixture.inventoryFiles.set(channelId,structuredClone(payload));return{ok:true,verified:true,schemaVersion:2,channelId,path:'native',bytes:JSON.stringify(payload).length}}),
  youtubeInventoryDelete:vi.fn(async(channelId:string)=>{fixture.inventoryFiles.delete(channelId);return{ok:true,channelId,deleted:true}})
 }
}));
vi.mock('./youtubeQuota',()=>({
 bindYoutubeQuotaTraceContext:vi.fn(),
 youtubeOperationActualCost:vi.fn(()=>({methods:{'playlistItems.list':{calls:1}},buckets:{general:1}})),
 youtubeQuotaState:vi.fn(()=>({blocked:false})),
 youtubeQuotaBucketUsage:vi.fn(()=>({available:100,used:0,limit:100,reserved:0})),
 youtubeQuotaUsage:vi.fn(()=>({used:0,limit:10000}))
}));
vi.mock('./youtubeCache',()=>({markYoutubeCache:vi.fn()}));

import {api} from './api';
import {refreshOwnerInventoriesAuthoritative} from './youtubeOwnerInventory';
import {loadChannelRunwayStore,upsertChannelRunwayFromYoutube} from './channelRunwayStore';
import {CHANNEL_RUNWAY_STORAGE_KEY} from './channelRunwayCore';

const channel=(id:string,patch:Partial<Channel>={}):Channel=>({
 id,name:id,slug:id,cadenceDays:1,publishIntervalDays:1,targetBufferDays:60,publishHour:18,publishMinute:0,
 language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
 seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]},...patch
});
const profile=(id:string,channelId:string,status:YoutubeProfile['credentialStatus']='READY'):YoutubeProfile=>({id,channelId,credentialStatus:status});
const scheduled=(id:string,day:number):YoutubeExistingVideo=>({
 id,position:day,title:id,description:'',tags:[],categoryId:'10',privacyStatus:'private',
 publishAt:`2099-01-${String(Math.max(1,Math.min(28,day))).padStart(2,'0')}T18:00:00+07:00`,selected:false
});
function setResponse(profileId:string,count:number){fixture.responses.set(profileId,{channelId:'UC'+profileId.slice(1),videos:Array.from({length:count},(_,i)=>scheduled(profileId+'-'+i,i+1)),scheduleComplete:true,syncComplete:true,complete:true})}

describe('VYRON 6.1 authoritative fleet runway refresh',()=>{
 beforeEach(()=>{
  fixture.profiles=[];fixture.responses.clear();fixture.inventoryFiles.clear();vi.clearAllMocks();
  try{localStorage.clear()}catch{}
 });

 it('one bulk refresh updates A/B/C/D runway from the same one-call-per-channel owner inventory result',async()=>{
  const channels=['A','B','C','D'].map(id=>channel(id,{youtubeProfileId:'p'+id,youtubeChannelId:'UC'+id}));
  fixture.profiles=channels.map(c=>profile('p'+c.id,'UC'+c.id));
  for(const [id,count] of [['A',10],['B',20],['C',4],['D',12]] as const)setResponse('p'+id,count);

  const result=await refreshOwnerInventoriesAuthoritative(channels,true,fixture.profiles);
  expect(result.updated).toBe(4);
  expect(result.rows.map(x=>x.status)).toEqual(['UPDATED','UPDATED','UPDATED','UPDATED']);
  expect(api.youtubeListExisting).toHaveBeenCalledTimes(4);
  for(const id of ['A','B','C','D'])expect((api.youtubeListExisting as any).mock.calls.filter((x:any[])=>x[0]==='p'+id)).toHaveLength(1);

  const store=loadChannelRunwayStore();
  expect(store.channels.A.scheduledVideoCount).toBe(10);
  expect(store.channels.B.scheduledVideoCount).toBe(20);
  expect(store.channels.C.scheduledVideoCount).toBe(4);
  expect(store.channels.D.scheduledVideoCount).toBe(12);
  expect(store.channels.A.scheduledUntil).toBe('2099-01-10');
  expect(store.channels.B.scheduledUntil).toBe('2099-01-20');
  expect(store.channels.C.scheduledUntil).toBe('2099-01-04');
  expect(store.channels.D.scheduledUntil).toBe('2099-01-12');
  expect(store.channels.A.runwayDays).toBeGreaterThan(0);
 });

 it('35-channel fleet classifies every enabled row and spends inventory quota only on actual eligible API calls',async()=>{
  const channels:Channel[]=[];
  const profiles:YoutubeProfile[]=[];
  for(let i=1;i<=30;i++){
   channels.push(channel('c'+i,{youtubeProfileId:'p'+i,youtubeChannelId:'UC'+i}));
   profiles.push(profile('p'+i,'UC'+i));
   setResponse('p'+i,0);
  }
  channels.push(channel('unlinked-1'),channel('unlinked-2'));
  channels.push(channel('mismatch',{youtubeProfileId:'pm',youtubeChannelId:'UC-M'}));profiles.push(profile('pm','UC-OTHER'));
  channels.push(channel('duplicate',{youtubeProfileId:'pd',youtubeChannelId:'UC1'}));profiles.push(profile('pd','UC1'));
  channels.push(channel('oauth-blocked',{youtubeProfileId:'pb',youtubeChannelId:'UC-B'}));profiles.push(profile('pb','UC-B','KEYCHAIN_BLOCKED'));
  fixture.profiles=profiles;

  const result=await refreshOwnerInventoriesAuthoritative(channels,true,profiles);
  expect(result.rows).toHaveLength(35);
  // All 30 API fixtures are empty: an exhausted uploads playlist no longer
  // proves a complete owner Scheduled inventory.
  expect(result.counts.UPDATED).toBe(0);
  // A complete owner upload scan without Scheduled coverage proof is partial, not an HTTP failure.
  expect(result.counts.PARTIAL_DATA).toBe(30);
  expect(result.counts.API_FAILED).toBe(0);
  expect(result.counts.UNLINKED).toBe(2);
  expect(result.counts.MISMATCH).toBe(1);
  expect(result.counts.DUPLICATE).toBe(1);
  expect(result.counts.OAUTH_BLOCKED).toBe(1);
  expect(result.counts.QUOTA_STOPPED).toBe(0);
  expect(api.youtubeListExisting).toHaveBeenCalledTimes(30);
  expect(result.apiRequests).toBe(30);
  expect(result.quotaUnits).toBe(30);
 });
 it('audits 33/33, deep-checks all 33 incomplete channels when separate search quota permits and reports every row',async()=>{
  const channels=Array.from({length:33},(_,i)=>channel('fleet'+(i+1),{youtubeProfileId:'p-fleet'+(i+1),youtubeChannelId:'UC-fleet'+(i+1)}));
  fixture.profiles=channels.map(c=>profile(c.youtubeProfileId!,c.youtubeChannelId!));
  for(const ch of channels)fixture.responses.set(ch.youtubeProfileId!,{
   channelId:ch.youtubeChannelId!,videos:[],scheduleComplete:true,syncComplete:true,complete:true,
   fullSyncApiRequests:2,fullSyncEstimatedQuotaCost:2
  });
  localStorage.setItem(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify({version:1,channels:Object.fromEntries(
   channels.map(ch=>[ch.id,{channelId:ch.id,channelName:ch.name,scheduledVideoCount:0,
    status:'no-data',dataState:'PARTIAL_DATA',priority:'unknown',inventoryEvidenceVersion:2}])
  )}));
  const progress:Array<{done:number;total:number;status:string}>=[];
  const result=await refreshOwnerInventoriesAuthoritative(channels,true,fixture.profiles,{'fleet1':['ABCDEFGHIJK']},p=>progress.push(p));
  expect(result.rows).toHaveLength(33);
  expect(progress.map(p=>p.done)).toEqual(Array.from({length:33},(_,i)=>i+1));
  expect(progress.every(p=>p.total===33)).toBe(true);
  expect(result.counts.PARTIAL_DATA).toBe(33);
  expect(result.deepSearchChannels).toBe(33);
  const calls=(api.youtubeListExisting as any).mock.calls as any[][];
  expect(calls).toHaveLength(33);
  expect(calls.filter(args=>args[3]===true)).toHaveLength(33);
  expect(calls.filter(args=>args[3]===false)).toHaveLength(0);
  expect(calls.find(args=>args[0]==='p-fleet1')?.[4]).toContain('ABCDEFGHIJK');
  expect(new Set(result.rows.map(row=>row.channelId)).size).toBe(33);
 });

 it('wires one full fleet action through stats + authoritative owner inventory + zero-quota local scan',()=>{
  const full=readFileSync('src/fullChannelRefresh.ts','utf8'),runway=readFileSync('src/ChannelRunway.tsx','utf8');
  expect(full).toContain("scanAllInventories('manual-all')");
  expect(full).toContain('refreshYoutubeChannelStatisticsSelection(channelIds,true)');
  expect(full).toContain('refreshOwnerInventoriesAuthoritative(requested,true,undefined,knownByChannel,onProgress)');
  expect(full).toContain('recalculateChannelRunway(enabled,new Date(),false)');
  expect(runway).toContain('refreshAllChannelData(active.map(c=>c.id),progress=>');
  expect(runway).toContain('↻ ОБНОВИТЬ ВСЕ КАНАЛЫ');
  expect(runway).toContain('LOCAL READY • ZERO API');
 });

 it('a successful owner response with zero Scheduled and incomplete coverage is PARTIAL, never a fabricated API failure or confirmed zero',async()=>{
  const ch=channel('neon',{youtubeProfileId:'p-neon',youtubeChannelId:'UC-neon'});
  fixture.profiles=[profile('p-neon','UC-neon')];
  fixture.responses.set('p-neon',{
   channelId:'UC-neon',videos:[],syncComplete:false,complete:false,scheduleComplete:false,
   incompleteReasons:['OWNER_SEARCH_PAGE_LIMIT','SCHEDULE_EMPTY_NOT_INDEPENDENTLY_VERIFIED'],
   fullSyncApiRequests:5,fullSyncEstimatedQuotaCost:3,searchCalls:2
  });
  const result=await refreshOwnerInventoriesAuthoritative([ch],true,fixture.profiles);
  expect(result.rows[0].status).toBe('PARTIAL_DATA');
  expect(result.counts.API_FAILED).toBe(0);
  expect(result.counts.PARTIAL_DATA).toBe(1);
  expect(result.searchCalls).toBe(2);
  expect(result.quotaUnits).toBe(3);
  const record=loadChannelRunwayStore().channels.neon;
  expect(record.dataState).toBe('PARTIAL_DATA');
  expect(record.runwayDays).toBeUndefined();
  expect(record.lastObservedScheduledCount).toBe(0);
  expect(record.lastObservedScheduledUntil).toBeUndefined();
  expect(record.lastRefreshError).toContain('OWNER_SEARCH_PAGE_LIMIT');
  expect(record.lastRefreshError).toContain('SCHEDULE_EMPTY_NOT_INDEPENDENTLY_VERIFIED');
 });

 it('fresh owner-observed partial Scheduled stays separate from the historical cached last date',async()=>{
  const ch=channel('history',{youtubeProfileId:'p-history',youtubeChannelId:'UC-history'});
  fixture.profiles=[profile('p-history','UC-history')];
  const oldTime=new Date('2026-11-18T10:00:00Z');
  upsertChannelRunwayFromYoutube(ch,[scheduled('old-owner-video',25)],oldTime);
  fixture.responses.set('p-history',{
   channelId:'UC-history',
   videos:[{...scheduled('fresh-owner-video',7),channelId:'UC-history'}],
   syncComplete:true,complete:true,scheduleComplete:false,
   incompleteReasons:['OWNER_SEARCH_NOT_EXHAUSTED','UPLOADS_PLAYLIST_SCHEDULE_COVERAGE_MISMATCH'],
   fullSyncApiRequests:3,fullSyncEstimatedQuotaCost:2,searchCalls:1
  });
  const result=await refreshOwnerInventoriesAuthoritative([ch],true,fixture.profiles);
  expect(result.rows[0].status).toBe('PARTIAL_DATA');
  const rec=loadChannelRunwayStore().channels.history;
  expect(rec.dataState).toBe('PARTIAL_DATA');
  expect(rec.scheduledUntil).toBe('2099-01-25');
  expect(rec.lastObservedScheduledCount).toBe(1);
  expect(rec.lastObservedScheduledUntil).toBe('2099-01-07');
  expect(rec.runwayDays).toBeUndefined();
  expect(rec.lastRefreshError).toContain('OWNER_SEARCH_NOT_EXHAUSTED');
  expect(rec.lastRefreshError).toContain('UPLOADS_PLAYLIST_SCHEDULE_COVERAGE_MISMATCH');
 });

 it('wrong-owner evidence is an actual failure and cannot become an owner Scheduled date',async()=>{
  const ch=channel('wrong',{youtubeProfileId:'p-wrong',youtubeChannelId:'UC-wrong'});
  fixture.profiles=[profile('p-wrong','UC-wrong')];
  fixture.responses.set('p-wrong',{
   channelId:'UC-wrong',
   videos:[{...scheduled('foreign',9),channelId:'UC-OTHER'}],
   syncComplete:true,complete:true,scheduleComplete:true
  });
  const result=await refreshOwnerInventoriesAuthoritative([ch],true,fixture.profiles);
  expect(result.rows[0].status).toBe('API_FAILED');
  expect(result.counts.API_FAILED).toBe(1);
  expect(loadChannelRunwayStore().channels.wrong?.runwayDays).toBeUndefined();
 });

});
