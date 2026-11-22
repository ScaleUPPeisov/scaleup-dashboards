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
 responses:new Map<string,{videos:YoutubeExistingVideo[];syncComplete:boolean;complete:boolean;scheduleComplete:boolean;channelId:string;fullSyncApiRequests?:number;fullSyncEstimatedQuotaCost?:number;searchCalls?:number;searchUsed?:boolean;searchExhausted?:boolean;searchError?:string|null;searchErrorCode?:string|null;scheduledCoverageVerified?:boolean;incompleteReasons?:string[]}>(),
 inventoryFiles:new Map<string,any>(),
 retries:new Map<string,any>(),
 searchAvailable:100
}));
vi.mock('./api',()=>({
 api:{
  youtubeProfiles:vi.fn(async()=>fixture.profiles),
  youtubeListExisting:vi.fn(async(profileId:string)=>fixture.responses.get(profileId)||{videos:[],syncComplete:false,complete:false,scheduleComplete:false,channelId:''}),
  youtubeRetryExistingHydration:vi.fn(async(profileId:string)=>fixture.retries.get(profileId)||{videos:[],apiRequests:1,missingHydrationIds:[]}),
  youtubeInventoryRead:vi.fn(async(channelId:string)=>fixture.inventoryFiles.has(channelId)?{found:true,schemaVersion:2,channelId,path:'native',payload:fixture.inventoryFiles.get(channelId)}:{found:false,schemaVersion:2,channelId,path:'native'}),
  youtubeInventoryWrite:vi.fn(async(channelId:string,payload:any)=>{fixture.inventoryFiles.set(channelId,structuredClone(payload));return{ok:true,verified:true,schemaVersion:2,channelId,path:'native',bytes:JSON.stringify(payload).length}}),
  youtubeInventoryDelete:vi.fn(async(channelId:string)=>{fixture.inventoryFiles.delete(channelId);return{ok:true,channelId,deleted:true}})
 }
}));
vi.mock('./youtubeQuota',()=>({
 bindYoutubeQuotaTraceContext:vi.fn(),
 youtubeOperationActualCost:vi.fn(()=>({methods:{'playlistItems.list':{calls:1}},buckets:{general:1}})),
 youtubeQuotaState:vi.fn(()=>({blocked:false})),
 youtubeQuotaBucketUsage:vi.fn((bucket:string)=>({available:bucket==='general'?1000:fixture.searchAvailable,used:0,limit:bucket==='general'?10000:100,reserved:0})),
 youtubeQuotaUsage:vi.fn(()=>({used:0,limit:10000}))
}));
vi.mock('./youtubeCache',()=>({markYoutubeCache:vi.fn()}));

import {api} from './api';
import {knownOwnerVideoIdsFromUploadHistory,refreshOwnerInventoriesAuthoritative,safeOwnerInventoryFailureCode,runP0OwnerKnownIdsReadOnly} from './youtubeOwnerInventory';
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
function setResponse(profileId:string,count:number){fixture.responses.set(profileId,{channelId:'UC'+profileId.slice(1),videos:Array.from({length:count},(_,i)=>scheduled(profileId+'-'+i,i+1)),scheduleComplete:true,syncComplete:true,complete:true,scheduledCoverageVerified:count>0})}

describe('VYRON 6.1 authoritative fleet runway refresh',()=>{
 beforeEach(()=>{
  fixture.profiles=[];fixture.responses.clear();fixture.inventoryFiles.clear();fixture.retries.clear();fixture.searchAvailable=100;vi.clearAllMocks();
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

  it('explains zero owner Search attempts when the separate local search reserve is exhausted',async()=>{
  const ch=channel('skip',{youtubeProfileId:'pskip',youtubeChannelId:'UCskip'});
  fixture.profiles=[profile('pskip','UCskip')];
  fixture.responses.set('pskip',{
    channelId:'UCskip',videos:[],scheduleComplete:false,syncComplete:true,complete:true,
    searchUsed:false,searchCalls:0
  });
  fixture.searchAvailable=12; // <= reserve means no independent Search request
  const result=await refreshOwnerInventoriesAuthoritative([ch],true,fixture.profiles);
  expect(result.rows[0].status).toBe('PARTIAL_DATA');
  expect(result.searchSkips).toEqual({LOCAL_SEARCH_BUDGET_RESERVE:1});
  expect(result.searchCalls||0).toBe(0);
  expect((api.youtubeListExisting as any).mock.calls[0][3]).toBe(false);
 });

 it('P0 owner verifier checks only known IDs in exact OAuth profile and preserves history as PARTIAL',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    try{
      const ch=channel('p0-glass',{name:'Glass City Lovers',youtubeProfileId:'p0-glass',youtubeChannelId:'UC-P0-GLASS'});
      const pf=profile('p0-glass','UC-P0-GLASS');
      fixture.profiles=[pf];
      const id='ABCDEFGHIJK';
      fixture.retries.set(pf.id,{videos:[{...scheduled(id,20),channelId:'UC-P0-GLASS'}],apiRequests:1,missingHydrationIds:[]});
      const history=[{channelId:ch.id,status:'UPLOADED',youtubeVideoId:id,youtubeChannelId:'UC-P0-GLASS',profileId:pf.id,publishAt:'2099-01-20T18:00:00Z'}];
      const rows=await runP0OwnerKnownIdsReadOnly([ch],fixture.profiles,history);
      expect(rows).toHaveLength(1);
      expect(rows[0].confirmedFutureScheduled).toBe(1);
      expect(rows[0].coverage).toBe('KNOWN_IDS_ONLY');
      expect(rows[0].searchCalls).toBe(0);
      expect(rows[0].transitions).toEqual([{videoId:id,transition:'STILL_SCHEDULED',currentPublishAt:'2099-01-20T18:00:00+07:00'}]);
      expect(api.youtubeRetryExistingHydration).toHaveBeenCalledTimes(1);
      expect((api.youtubeRetryExistingHydration as any).mock.calls[0][1]).toEqual([id]);
      expect(api.youtubeListExisting).not.toHaveBeenCalled();
      expect(loadChannelRunwayStore().channels[ch.id].dataState).toBe('PARTIAL_DATA');
      expect(loadChannelRunwayStore().channels[ch.id].lastObservedScheduledCount).toBe(1);
      const again=await runP0OwnerKnownIdsReadOnly([ch],fixture.profiles,history);
      expect(again).toHaveLength(1);
      expect(api.youtubeRetryExistingHydration).toHaveBeenCalledTimes(1);
    }finally{vi.useRealTimers()}
  });

  it('P0 verifier refuses mismatched owner OAuth and makes no API calls',async()=>{
    const ch=channel('p0-nope',{name:'Glass City Lovers',youtubeProfileId:'p-nope',youtubeChannelId:'UC-EXPECTED'});
    const pf=profile('p-nope','UC-OTHER');
    const history=[{channelId:ch.id,status:'UPLOADED',youtubeVideoId:'ABCDEFGHIJK',profileId:pf.id}];
    const rows=await runP0OwnerKnownIdsReadOnly([ch],[pf],history);
    expect(rows).toEqual([]);
    expect(api.youtubeRetryExistingHydration).not.toHaveBeenCalled();
    expect(api.youtubeListExisting).not.toHaveBeenCalled();
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
   searchUsed:true,searchExhausted:true,searchError:null,
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
  expect(calls.every(args=>args[5]===4)).toBe(true); // fleet Search budget per channel
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
  expect((api.youtubeListExisting as any).mock.calls[0][5]).toBe(12); // one-channel deep audit
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

 it('real HTTP 400 Google owner-search reason is preserved as safe actionable code, not a false zero',async()=>{
   const ch=channel('owner-400',{youtubeProfileId:'p-owner-400',youtubeChannelId:'UC-owner-400'});
   fixture.profiles=[profile('p-owner-400','UC-owner-400')];
   fixture.responses.set('p-owner-400',{
     channelId:'UC-owner-400',videos:[],syncComplete:true,complete:true,scheduleComplete:false,
     searchUsed:true,searchExhausted:false,
     searchError:'OWNER_SEARCH_HTTP_400_INVALID_SEARCH_FILTER',
     searchErrorCode:'OWNER_SEARCH_HTTP_400_INVALID_SEARCH_FILTER',
     incompleteReasons:['PLAYLIST_TOTAL_METADATA_MISMATCH','OWNER_SEARCH_FAILED','OWNER_SEARCH_HTTP_400_INVALID_SEARCH_FILTER'],
     searchCalls:1,fullSyncApiRequests:5,fullSyncEstimatedQuotaCost:4
   });
   const result=await refreshOwnerInventoriesAuthoritative([ch],true,fixture.profiles);
   expect(result.rows[0].status).toBe('PARTIAL_DATA');
   expect(result.counts.API_FAILED).toBe(0);
   expect(result.deepSearchChannels).toBe(1);
   expect(result.deepSearchFailedChannels).toBe(1);
   expect(result.deepSearchExhaustedChannels||0).toBe(0);
   expect(result.deepSearchPageLimitedChannels||0).toBe(0);
   expect(result.searchCalls).toBe(1);
   expect(result.quotaUnits).toBe(4);
   const rec=loadChannelRunwayStore().channels['owner-400'];
   expect(rec.lastRefreshError).toContain('OWNER_SEARCH_HTTP_400_INVALID_SEARCH_FILTER');
   expect(rec.dataState).toBe('PARTIAL_DATA');
   expect(rec.runwayDays).toBeUndefined();
   expect(rec.scheduledVideoCount).toBe(0);
 });

 it('exhausted Search is not automatically proof of full Scheduled coverage',async()=>{
   const ch=channel('search-exhausted',{youtubeProfileId:'p-search-exhausted',youtubeChannelId:'UC-search-exhausted'});
   fixture.profiles=[profile('p-search-exhausted','UC-search-exhausted')];
   fixture.responses.set('p-search-exhausted',{
     channelId:'UC-search-exhausted',videos:[],syncComplete:true,complete:true,scheduleComplete:true,
     searchUsed:true,searchExhausted:true,searchError:null,
     incompleteReasons:['PLAYLIST_TOTAL_METADATA_MISMATCH','SCHEDULE_EMPTY_NOT_INDEPENDENTLY_VERIFIED'],
     fullSyncApiRequests:5,fullSyncEstimatedQuotaCost:4,searchCalls:1
   });
   const result=await refreshOwnerInventoriesAuthoritative([ch],true,fixture.profiles);
   expect(result.deepSearchChannels).toBe(1);
   expect(result.deepSearchFailedChannels||0).toBe(0);
   expect(result.deepSearchExhaustedChannels).toBe(1);
   expect(result.deepSearchPageLimitedChannels||0).toBe(0);
   expect(result.counts.PARTIAL_DATA).toBe(1);
   expect(loadChannelRunwayStore().channels['search-exhausted'].dataState).toBe('PARTIAL_DATA');
 });

 it('fleet UI makes no claim that attempted Search equals verified Search',()=>{
   const s=readFileSync('src/ChannelRunway.tsx','utf8');
   expect(s).toContain('Search попыток {fleetAudit.searches}');
   expect(s).toContain('ошибок {fleetAudit.searchFailures}');
   expect(s).toContain('до конца {fleetAudit.searchExhausted}');
   expect(s).toContain('лимит страниц {fleetAudit.searchPageLimited}');
   expect(s).toContain('title={evidenceHint}');
   expect(s).toContain('Search не запускался — причины в подсказке');
 });

 it('a Search page cap is not reported as completed or as a transport failure',async()=>{
   const ch=channel('search-limited',{youtubeProfileId:'p-search-limited',youtubeChannelId:'UC-search-limited'});
   fixture.profiles=[profile('p-search-limited','UC-search-limited')];
   fixture.responses.set('p-search-limited',{
     channelId:'UC-search-limited',videos:[],syncComplete:true,complete:true,scheduleComplete:false,
     searchUsed:true,searchExhausted:false,searchError:null,searchCalls:4,
     incompleteReasons:['OWNER_SEARCH_NOT_EXHAUSTED','OWNER_SEARCH_PAGE_LIMIT'],
     fullSyncApiRequests:10,fullSyncEstimatedQuotaCost:6
   });
   const result=await refreshOwnerInventoriesAuthoritative([ch],true,fixture.profiles);
   expect(result.counts.PARTIAL_DATA).toBe(1);
   expect(result.deepSearchChannels).toBe(1);
   expect(result.deepSearchPageLimitedChannels).toBe(1);
   expect(result.deepSearchFailedChannels||0).toBe(0);
   expect(result.deepSearchExhaustedChannels||0).toBe(0);
   expect(result.searchCalls).toBe(4);
   expect(loadChannelRunwayStore().channels['search-limited'].runwayDays).toBeUndefined();
 });

 it('turns provider errors into stable method + status diagnostics without leaking account data',()=>{
   expect(safeOwnerInventoryFailureCode(new Error('OWNER_INVENTORY_CHANNELS_LIST_HTTP_403_INSUFFICIENT_PERMISSIONS: private@example.com')))
     .toBe('OWNER_INVENTORY_CHANNELS_LIST_HTTP_403_INSUFFICIENT_PERMISSIONS');
   expect(safeOwnerInventoryFailureCode('OWNER_INVENTORY_PLAYLIST_ITEMS_LIST_NETWORK_ERROR')).toBe('OWNER_INVENTORY_PLAYLIST_ITEMS_LIST_NETWORK_ERROR');
   expect(safeOwnerInventoryFailureCode('OWNER_INVENTORY_AUTH_INVALID_GRANT leaked-refresh-token')).toBe('OWNER_INVENTORY_AUTH_INVALID_GRANT');
   expect(safeOwnerInventoryFailureCode('OWNER_CHANNEL_MISMATCH: private channel')).toBe('OWNER_CHANNEL_MISMATCH');
   expect(safeOwnerInventoryFailureCode('Provider error: private@example.com token=secret')).toBe('OWNER_INVENTORY_UNCLASSIFIED_ERROR');
   expect(safeOwnerInventoryFailureCode('OWNER_INVENTORY_VIDEOS_LIST_HTTP_429_RATE_LIMIT_EXCEEDED')).toBe('OWNER_INVENTORY_VIDEOS_LIST_HTTP_429_RATE_LIMIT_EXCEEDED');
 });

 it('an owner API failure preserves historical Scheduled while persisting only the safe error code',async()=>{
   const ch=channel('afterglow',{youtubeProfileId:'p-afterglow',youtubeChannelId:'UC-afterglow'});
   fixture.profiles=[profile('p-afterglow','UC-afterglow')];
   upsertChannelRunwayFromYoutube(ch,[scheduled('verified-old',21)],new Date('2026-11-18T10:00:00Z'));
   vi.mocked(api.youtubeListExisting).mockRejectedValueOnce(new Error('OWNER_INVENTORY_CHANNELS_LIST_HTTP_403_INSUFFICIENT_PERMISSIONS; Google private@example.com token=secret'));
   const result=await refreshOwnerInventoriesAuthoritative([ch],true,fixture.profiles);
   expect(result.counts.API_FAILED).toBe(1);
   expect(result.rows[0].error).toBe('OWNER_INVENTORY_CHANNELS_LIST_HTTP_403_INSUFFICIENT_PERMISSIONS');
   const rec=loadChannelRunwayStore().channels.afterglow;
   expect(rec.scheduledVideoCount).toBe(1);
   expect(rec.scheduledUntil).toBe('2099-01-21');
   expect(rec.lastRefreshError).toBe('OWNER_INVENTORY_CHANNELS_LIST_HTTP_403_INSUFFICIENT_PERMISSIONS');
   expect(rec.lastRefreshError).not.toContain('private@example.com');
   expect(rec.lastRefreshError).not.toContain('token=secret');
 });

 it('a failed channels.list before search cannot count as a deep owner Search',async()=>{
   const ch=channel('early-error',{youtubeProfileId:'p-early-error',youtubeChannelId:'UC-early-error'});
   fixture.profiles=[profile('p-early-error','UC-early-error')];
   vi.mocked(api.youtubeListExisting).mockRejectedValueOnce(new Error('PRE_SEARCH_CHANNELS_LIST_FAILED'));
   const result=await refreshOwnerInventoriesAuthoritative([ch],true,fixture.profiles);
   expect(result.rows[0].status).toBe('API_FAILED');
   expect(result.deepSearchChannels||0).toBe(0);
   expect(result.searchCalls||0).toBe(0);
   expect(result.deepSearchFailedChannels||0).toBe(0);
   expect(result.deepSearchExhaustedChannels||0).toBe(0);
   expect(result.counts.API_FAILED).toBe(1);
 });

 it('first systemic Google 400 rejects owner Search template once, never repeats for 32 peers',async()=>{
   const channels=['alpha','beta','gamma'].map(id=>channel(id,{youtubeProfileId:'p-'+id,youtubeChannelId:'UC-'+id}));
   fixture.profiles=channels.map(ch=>profile(ch.youtubeProfileId!,ch.youtubeChannelId!));
   fixture.responses.set('p-alpha',{
     channelId:'UC-alpha',videos:[],syncComplete:true,complete:true,scheduleComplete:false,
     searchUsed:true,searchExhausted:false,searchCalls:1,
     searchError:'OWNER_SEARCH_HTTP_400_INVALID_SEARCH_FILTER',
     searchErrorCode:'OWNER_SEARCH_HTTP_400_INVALID_SEARCH_FILTER',
     incompleteReasons:['OWNER_SEARCH_FAILED','PLAYLIST_TOTAL_METADATA_MISMATCH'],
     fullSyncApiRequests:4,fullSyncEstimatedQuotaCost:3
   });
   for(const id of ['beta','gamma'])fixture.responses.set('p-'+id,{
     channelId:'UC-'+id,videos:[],syncComplete:true,complete:true,scheduleComplete:false,
     searchUsed:false,searchExhausted:false,searchCalls:0,searchError:null,
     incompleteReasons:['PLAYLIST_TOTAL_METADATA_MISMATCH'],
     fullSyncApiRequests:3,fullSyncEstimatedQuotaCost:3
   });
   const result=await refreshOwnerInventoriesAuthoritative(channels,true,fixture.profiles);
   const calls=(api.youtubeListExisting as any).mock.calls as any[][];
   expect(calls).toHaveLength(3);
   expect(calls.map(args=>args[3])).toEqual([true,false,false]);
   expect(result.deepSearchChannels).toBe(1);
   expect(result.deepSearchFailedChannels).toBe(1);
   expect(result.deepSearchSystemicStopCode).toBe('OWNER_SEARCH_HTTP_400_INVALID_SEARCH_FILTER');
   expect(result.searchCalls).toBe(1);
   expect(result.rows.map(row=>row.status)).toEqual(['PARTIAL_DATA','PARTIAL_DATA','PARTIAL_DATA']);
   for(const ch of channels)expect(loadChannelRunwayStore().channels[ch.id].runwayDays).toBeUndefined();
 });

 it('Search error on one owner profile does not block other channels for a non-systemic 403',async()=>{
   const channels=['p1','p2'].map(id=>channel(id,{youtubeProfileId:id,youtubeChannelId:'UC-'+id}));
   fixture.profiles=channels.map(ch=>profile(ch.youtubeProfileId!,ch.youtubeChannelId!));
   fixture.responses.set('p1',{
     channelId:'UC-p1',videos:[],syncComplete:true,complete:true,scheduleComplete:false,
     searchUsed:true,searchExhausted:false,searchCalls:1,
     searchError:'OWNER_SEARCH_HTTP_403_INSUFFICIENT_PERMISSIONS',
     searchErrorCode:'OWNER_SEARCH_HTTP_403_INSUFFICIENT_PERMISSIONS',
     incompleteReasons:['OWNER_SEARCH_FAILED'],
     fullSyncApiRequests:4,fullSyncEstimatedQuotaCost:3
   });
   fixture.responses.set('p2',{
     channelId:'UC-p2',videos:[],syncComplete:true,complete:true,scheduleComplete:false,
     searchUsed:true,searchExhausted:false,searchCalls:1,searchError:null,
     incompleteReasons:['OWNER_SEARCH_NOT_EXHAUSTED'],
     fullSyncApiRequests:4,fullSyncEstimatedQuotaCost:3
   });
   const result=await refreshOwnerInventoriesAuthoritative(channels,true,fixture.profiles);
   const calls=(api.youtubeListExisting as any).mock.calls as any[][];
   expect(calls.map(x=>x[3])).toEqual([true,true]);
   expect(result.deepSearchSystemicStopCode).toBeUndefined();
   expect(result.deepSearchChannels).toBe(2);
   expect(result.deepSearchFailedChannels).toBe(1);
   expect(result.deepSearchPageLimitedChannels).toBe(1);
 });

 it('recovers owner uploads without publishAt so an absent uploads-playlist Scheduled can be rehydrated',()=>{
   const ch=channel('neon',{youtubeProfileId:'p-neon',youtubeChannelId:'UC-neon'});
   const history=[
     {channelId:'neon',youtubeChannelId:'UC-neon',profileId:'p-neon',status:'UPLOADED',youtubeVideoId:'N0000000001'},
     {channelId:'neon',youtubeChannelId:'UC-neon',profileId:'p-neon',status:'UPLOADED',youtubeVideoId:'N0000000002',publishAt:'2099-12-12T18:00:00Z'},
     {channelId:'neon',youtubeChannelId:'UC-neon',profileId:'p-neon',status:'UPLOADED',youtubeVideoId:'N0000000003',publishAt:'2099-11-12T18:00:00Z'},
     {channelId:'neon',youtubeChannelId:'UC-neon',profileId:'p-neon',status:'UPLOADED',youtubeVideoId:'N0000000004'},
     {channelId:'wrong',youtubeChannelId:'UC-neon',profileId:'p-neon',status:'UPLOADED',youtubeVideoId:'N0000000005'},
     {channelId:'neon',youtubeChannelId:'UC-other',profileId:'p-neon',status:'UPLOADED',youtubeVideoId:'N0000000006'},
     {channelId:'neon',youtubeChannelId:'UC-neon',profileId:'p-other',status:'UPLOADED',youtubeVideoId:'N0000000007'},
     {channelId:'neon',youtubeChannelId:'UC-neon',profileId:'p-neon',status:'FAILED',youtubeVideoId:'N0000000008'},
     {channelId:'neon',youtubeChannelId:'UC-neon',profileId:'p-neon',status:'UPLOADED',youtubeVideoId:'not-video-id'},
   ];
   const ids=knownOwnerVideoIdsFromUploadHistory(history,ch,Date.parse('2026-11-19T00:00:00Z'));
   expect(ids).toEqual(['N0000000002','N0000000003','N0000000004','N0000000001']);
   // No historical ID itself establishes remote Scheduled until videos.list.
   expect(ids).not.toContain('N0000000005');
   expect(ids).not.toContain('N0000000006');
   expect(ids).not.toContain('N0000000007');
 });

 it('owner history recovery preserves IDs beyond 50 with Scheduled first',()=>{
   const ch=channel('c',{youtubeProfileId:'p',youtubeChannelId:'UC-c'});
   const history:Array<{
     channelId:string;youtubeChannelId:string;profileId:string;status:string;youtubeVideoId:string;publishAt?:string
   }>=Array.from({length:75},(_,i)=>({
      channelId:'c',youtubeChannelId:'UC-c',profileId:'p',status:'UPLOADED',
      youtubeVideoId:'VID'+String(i).padStart(8,'0'),
   }));
   history.push({channelId:'c',youtubeChannelId:'UC-c',profileId:'p',status:'UPLOADED',
      youtubeVideoId:'SPECIAL0001',publishAt:'2099-01-25T00:00:00Z'});
   const ids=knownOwnerVideoIdsFromUploadHistory(history,ch,Date.parse('2026-11-19T00:00:00Z'));
   expect(ids).toHaveLength(76);
   expect(ids[0]).toBe('SPECIAL0001');
   expect(ids).toContain('VID00000074');
   expect(ids).toContain('VID00000000');
   expect(new Set(ids).size).toBe(76);
 });

 it('owner history forwards all IDs to native so playlist duplicates do not hide later Scheduled',()=>{
   const ch=channel('c',{youtubeProfileId:'p',youtubeChannelId:'UC-c'});
   const history=Array.from({length:550},(_,i)=>({
     channelId:'c',youtubeChannelId:'UC-c',profileId:'p',status:'UPLOADED',
     youtubeVideoId:'VID'+String(i).padStart(8,'0'),
   }));
   const ids=knownOwnerVideoIdsFromUploadHistory(history,ch);
   expect(ids).toHaveLength(550);
   expect(new Set(ids).size).toBe(550);
   expect(ids).toContain('VID00000549');
   // Native checks which IDs were already in playlist/Search before applying
   // its 500 additional-ID hydration cap. Excess novel IDs remain PARTIAL.
 });

 it('both fleet and individual owner refreshes use the same missing-publishAt recovery',()=>{
   const fleet=readFileSync('src/fullChannelRefresh.ts','utf8');
   const row=readFileSync('src/ChannelRunway.tsx','utf8');
   expect(fleet).toContain('knownOwnerVideoIdsFromUploadHistory(history,channel)');
   expect(row).toContain('knownOwnerVideoIdsFromUploadHistory(uploadHistory,channel)');
 });

 it('master topbar separates exact OAuth connections from failures of YouTube Scheduled and task queue',()=>{
   const app=readFileSync('src/App.tsx','utf8');
   expect(app).toContain('Подключено {connectedCount}');
   expect(app).toContain('scheduleSummary.apiFailed');
   expect(app).toContain('scheduleSummary.partial');
   expect(app).toContain('scheduleSummary.unknown');
   expect(app).toContain('subscribeChannelRunway');
   expect(app).toContain('ошибок очереди нет');
   expect(app).not.toContain(":'✓ ошибок нет'");
 });

});
