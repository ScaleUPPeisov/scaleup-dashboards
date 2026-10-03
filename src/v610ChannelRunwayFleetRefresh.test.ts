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
 responses:new Map<string,{videos:YoutubeExistingVideo[];syncComplete:boolean;complete:boolean}>(),
 inventoryFiles:new Map<string,any>()
}));
vi.mock('./api',()=>({
 api:{
  youtubeProfiles:vi.fn(async()=>fixture.profiles),
  youtubeListExisting:vi.fn(async(profileId:string)=>fixture.responses.get(profileId)||{videos:[],syncComplete:true,complete:true})
 }
}));
vi.mock('./youtubeQuota',()=>({
 bindYoutubeQuotaTraceContext:vi.fn(),
 youtubeOperationActualCost:vi.fn(()=>({methods:{'playlistItems.list':{calls:1}},buckets:{general:1}})),
 youtubeQuotaState:vi.fn(()=>({blocked:false})),
 youtubeQuotaUsage:vi.fn(()=>({used:0,limit:10000}))
}));
vi.mock('./youtubeCache',()=>({markYoutubeCache:vi.fn()}));

import {api} from './api';
import {refreshOwnerInventoriesAuthoritative} from './youtubeOwnerInventory';
import {loadChannelRunwayStore} from './channelRunwayStore';

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
function setResponse(profileId:string,count:number){fixture.responses.set(profileId,{videos:Array.from({length:count},(_,i)=>scheduled(profileId+'-'+i,i+1)),syncComplete:true,complete:true})}

describe('VYRON 6.1 authoritative fleet runway refresh',()=>{
 beforeEach(()=>{
  fixture.profiles=[];fixture.responses.clear();vi.clearAllMocks();
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
  expect(result.counts.UPDATED).toBe(30);
  expect(result.counts.UNLINKED).toBe(2);
  expect(result.counts.MISMATCH).toBe(1);
  expect(result.counts.DUPLICATE).toBe(1);
  expect(result.counts.OAUTH_BLOCKED).toBe(1);
  expect(result.counts.API_FAILED).toBe(0);
  expect(result.counts.QUOTA_STOPPED).toBe(0);
  expect(api.youtubeListExisting).toHaveBeenCalledTimes(30);
  expect(result.apiRequests).toBe(30);
  expect(result.quotaUnits).toBe(30);
 });
 it('wires one full fleet action through stats + authoritative owner inventory + zero-quota local scan',()=>{
  const full=readFileSync('src/fullChannelRefresh.ts','utf8'),runway=readFileSync('src/ChannelRunway.tsx','utf8');
  expect(full).toContain("scanAllInventories('manual-all')");
  expect(full).toContain('refreshYoutubeChannelStatisticsSelection(channelIds,true)');
  expect(full).toContain('refreshOwnerInventoriesAuthoritative(requested,true)');
  expect(full).toContain('recalculateChannelRunway(enabled,new Date(),false)');
  expect(runway).toContain('refreshAllChannelData(active.map(c=>c.id))');
  expect(runway).toContain('↻ ОБНОВИТЬ ВСЕ КАНАЛЫ');
  expect(runway).toContain('LOCAL READY • ZERO API');
 });

});
