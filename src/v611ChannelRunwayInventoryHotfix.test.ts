import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {Channel,YoutubeExistingVideo,YoutubeProfile} from './types';

class MemoryStorage{
  private m=new Map<string,string>();
  failWrites=false;
  getItem(k:string){return this.m.get(k)??null}
  setItem(k:string,v:string){
    if(this.failWrites){const e:any=new Error('quota exceeded');e.name='QuotaExceededError';throw e}
    this.m.set(k,String(v))
  }
  seed(k:string,v:string){this.m.set(k,v)}
  removeItem(k:string){this.m.delete(k)}
  clear(){this.m.clear();this.failWrites=false}
  key(i:number){return[...this.m.keys()][i]??null}
  get length(){return this.m.size}
}
const storage=new MemoryStorage();
Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});
if(typeof (globalThis as any).window==='undefined')Object.defineProperty(globalThis,'window',{value:{dispatchEvent:vi.fn()},configurable:true});

const fixture=vi.hoisted(()=>({
  profiles:[] as YoutubeProfile[],
  responses:new Map<string,any>(),
  inventoryFiles:new Map<string,any>(),
  failNativeWrites:false
}));
vi.mock('./api',()=>({api:{
  youtubeProfiles:vi.fn(async()=>fixture.profiles),
  youtubeListExisting:vi.fn(async(profileId:string)=>fixture.responses.get(profileId)),
  youtubeInventoryRead:vi.fn(async(channelId:string)=>fixture.inventoryFiles.has(channelId)?{found:true,schemaVersion:2,channelId,path:'native',payload:fixture.inventoryFiles.get(channelId)}:{found:false,schemaVersion:2,channelId,path:'native'}),
  youtubeInventoryWrite:vi.fn(async(channelId:string,payload:any)=>{if(fixture.failNativeWrites)throw new Error('INVENTORY_STORAGE_WRITE_FAILED: forced');fixture.inventoryFiles.set(channelId,structuredClone(payload));return{ok:true,verified:true,schemaVersion:2,channelId,path:'native',bytes:JSON.stringify(payload).length}}),
  youtubeInventoryDelete:vi.fn(async(channelId:string)=>{fixture.inventoryFiles.delete(channelId);return{ok:true,channelId,deleted:true}})
}}));
vi.mock('./youtubeQuota',()=>({
  bindYoutubeQuotaTraceContext:vi.fn(),
  youtubeOperationActualCost:vi.fn(()=>({methods:{'playlistItems.list':{calls:99}},buckets:{general:99}})),
  youtubeQuotaState:vi.fn(()=>({blocked:false})),
  youtubeQuotaUsage:vi.fn(()=>({used:0,limit:10000}))
}));
vi.mock('./youtubeCache',()=>({markYoutubeCache:vi.fn()}));

import {api} from './api';
import {existingCacheKey,loadExistingCache,replaceExistingCacheFromSync} from './channelSchedule';
import {CHANNEL_RUNWAY_STORAGE_KEY} from './channelRunwayCore';
import {loadChannelRunwayStore,recalculateChannelRunway} from './channelRunwayStore';
import {ownerInventoryFromVideos,refreshOwnerInventoriesAuthoritative,scheduledCoverageEstablished} from './youtubeOwnerInventory';
import {youtubeOperationActualCost} from './youtubeQuota';

const channel=(id='lumiere'):Channel=>({
  id,name:'Lumière de Minuit',slug:id,cadenceDays:1,publishIntervalDays:1,targetBufferDays:60,publishHour:18,publishMinute:0,
  language:'FR',genre:'Music',country:'FR',minTracks:10,targetDurationMin:120,enabled:true,youtubeProfileId:'profile-lumiere',youtubeChannelId:'UC-LUMIERE',
  seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}
});
const profile:YoutubeProfile={id:'profile-lumiere',channelId:'UC-LUMIERE',credentialStatus:'READY'};
const editable=(id:string,privacyStatus:string,publishAt?:string,publishedAt?:string):YoutubeExistingVideo=>({
  id,position:0,title:'Title '+id,description:'Description '+id,tags:['deep','house'],categoryId:'10',privacyStatus,publishAt,publishedAt,
  thumbnail:'https://i.ytimg.com/vi/'+id+'/maxresdefault.jpg',duration:'PT2H',views:123,likes:4,comments:1,selected:false,channelId:'UC-LUMIERE'
});
function lumiereVideos(){
  const out:YoutubeExistingVideo[]=[
    editable('p-0929','public',undefined,'2026-09-29T12:00:00Z'),
    editable('p-0930','public',undefined,'2026-09-30T12:00:00Z'),
    editable('p-1001','public',undefined,'2026-10-01T12:00:00Z'),
    editable('p-1002','public',undefined,'2026-10-02T12:00:00Z'),
    editable('p-1003','public',undefined,'2026-10-03T00:00:00Z')
  ];
  for(let day=4;day<=18;day++)out.push(editable('s-'+day,'private','2026-10-'+String(day).padStart(2,'0')+'T18:00:00+07:00'));
  return out.map((x,i)=>({...x,position:i}))
}
function response(){
  const videos=lumiereVideos();
  return{channelId:'UC-LUMIERE',channelTitle:'Lumière de Minuit',youtubeFound:20,playlistReportedTotal:20,uniqueVideoIds:20,videosHydrated:20,
    privateCount:0,publicCount:5,scheduledCount:15,scheduleComplete:true,syncComplete:true,complete:true,fullSyncApiRequests:3,fullSyncEstimatedQuotaCost:3,videos}
}

describe('VYRON 6.1.1 Channel Runway inventory hotfix',()=>{
  beforeEach(()=>{storage.clear();fixture.profiles=[profile];fixture.responses.clear();fixture.responses.set(profile.id,response());fixture.inventoryFiles.clear();fixture.failNativeWrites=false;vi.clearAllMocks()});

  it('Lumière real-shape fixture has 20 total, 15 scheduled and scheduled-through 2026-10-18',async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
    try{
      const inv=ownerInventoryFromVideos('lumiere',lumiereVideos(),undefined,{scheduleComplete:true},Date.now());
      expect(inv.total).toBe(20);expect(inv.scheduled).toBe(15);expect(inv.lastScheduledAt).toContain('2026-10-18');
      const result=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
      expect(result.rows[0].status).toBe('UPDATED');
      const r=loadChannelRunwayStore().channels.lumiere;
      expect(r.scheduledVideoCount).toBe(15);
      expect(r.scheduledUntil).toBe('2026-10-18');
      expect(r.lastScheduleSync).toBeTruthy();
      expect(r.status).not.toBe('no-data');
    }finally{vi.useRealTimers()}
  });

  it('uses backend completed-operation API/quota count instead of racy event snapshot and does not double-count it',async()=>{
    const result=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
    expect(result.apiRequests).toBe(3);
    expect(result.quotaUnits).toBe(3);
    expect(result.rows[0].apiRequests).toBe(3);
    expect(youtubeOperationActualCost).not.toHaveBeenCalled();
  });

  it('persists canonical inventory natively without duplicating full baseline or heavy localStorage',async()=>{
    const r=response(),out=await replaceExistingCacheFromSync('lumiere',r.videos,r);
    expect(out.persisted).toBe(true);
    const native=fixture.inventoryFiles.get('lumiere');
    expect(native.videos).toHaveLength(20);
    expect(native.baselineDelta).toEqual({});
    expect(native.videos.find((v:any)=>v.id==='s-18').description).toBe('Description s-18');
    expect(localStorage.getItem(existingCacheKey('lumiere'))).toBeNull();
    expect((await loadExistingCache('lumiere'))?.videos).toHaveLength(20);
  });

  it('native write failure returns PERSISTENCE_FAILED and preserves previous runway truth',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
    try{
    const previous={version:1,lastLocalCalculation:'2026-10-02T00:00:00.000Z',channels:{lumiere:{channelId:'lumiere',channelName:'Lumière de Minuit',scheduledUntil:'2026-10-10',scheduledVideoCount:7,lastScheduleSync:'2026-10-02T00:00:00.000Z',lastLocalCalculation:'2026-10-02T00:00:00.000Z',runwayDays:8,priority:'critical',status:'urgent'}}};
    storage.seed(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify(previous));fixture.failNativeWrites=true;
    const result=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
    expect(result.rows[0].status).toBe('PERSISTENCE_FAILED');
    expect(result.updated).toBe(0);expect(result.failed).toBe(1);expect(result.rows[0].error).toContain('API повторно не запускайте');
    const persisted=loadChannelRunwayStore();expect(persisted.channels.lumiere.scheduledVideoCount).toBe(7);expect(persisted.channels.lumiere.scheduledUntil).toBe('2026-10-10');
    }finally{vi.useRealTimers()}
  });

  it('partial schedule hydration retains the verified future date instead of confirming empty',async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
    try{
    const first=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
    expect(first.rows[0].status).toBe('UPDATED');
    const prior=loadChannelRunwayStore().channels.lumiere;
    expect(prior.scheduledVideoCount).toBeGreaterThan(0);
    fixture.responses.set(profile.id,{
      ...response(),videos:[],scheduledCount:0,complete:true,syncComplete:true,
      scheduleComplete:false,scheduleDataIncompleteCount:1,
      incompleteReasons:['SCHEDULE_DATA_INCOMPLETE']
    });
    const second=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
    expect(second.rows[0].status).toBe('API_FAILED');
    const retained=loadChannelRunwayStore().channels.lumiere;
    expect(retained.scheduledVideoCount).toBe(prior.scheduledVideoCount);
    expect(retained.scheduledUntil).toBe(prior.scheduledUntil);
    expect(retained.dataState).toBe('PARTIAL_DATA');
    expect(retained.runwayDays).toBeUndefined();
    expect(retained.status).toBe('no-data');
    }finally{vi.useRealTimers()}
  });

  it('legacy confirmed zero without source coverage is UNKNOWN even with fresh lastScheduleSync',()=>{
    const c=channel('legacy-zero');
    storage.seed(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify({version:1,channels:{'legacy-zero':{
      channelId:c.id,channelName:c.name,scheduledVideoCount:0,dataState:'CONFIRMED_EMPTY',
      lastScheduleSync:'2026-11-18T04:00:00Z',lastLocalCalculation:'2026-11-18T04:00:00Z',
      runwayDays:0,priority:'critical',status:'ended'
    }}}));
    const r=recalculateChannelRunway([c],new Date('2026-11-18T05:00:00Z'),false,storage as any).channels[c.id];
    expect(r.status).toBe('no-data');
    expect(r.dataState).toBe('UNKNOWN');
    expect(r.runwayDays).toBeUndefined();
  });

  it('newer verified native inventory supersedes stored lastScheduleSync zero',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T05:00:00Z'));
    try{
      const c=channel('newer-native');
      storage.seed(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify({version:1,channels:{'newer-native':{
        channelId:c.id,channelName:c.name,scheduledVideoCount:0,dataState:'CONFIRMED_EMPTY',
        lastScheduleSync:'2026-11-18T04:00:00Z',lastLocalCalculation:'2026-11-18T04:00:00Z',
        runwayDays:0,priority:'critical',status:'ended'
      }}}));
      const future=editable('future-Dec12','private','2026-12-12T20:00:00+07:00');
      const stored=await replaceExistingCacheFromSync(c.id,[future],{scheduleComplete:true,syncComplete:true,channelId:'UC-LUMIERE'});
      expect(stored.persisted).toBe(true);
      const r=recalculateChannelRunway([c],new Date(),false,storage as any).channels[c.id];
      expect(r.scheduledUntil).toBe('2026-12-12');
      expect(r.scheduledVideoCount).toBe(1);
      expect(r.runwayDays).toBe(24);
      expect(r.dataState).toBe('CONFIRMED_SCHEDULE');
    }finally{vi.useRealTimers()}
  });

  it('uploads-only completed zero is NOT confirmed empty even when backend marks complete',()=>{
    expect(scheduledCoverageEstablished({syncComplete:true,scheduleComplete:true,videos:[]},Date.parse('2026-11-18T05:00:00Z'))).toBe(false);
    expect(scheduledCoverageEstablished({syncComplete:true,scheduleComplete:false,videos:[editable('s','private','2026-12-12T10:00:00Z')]},Date.parse('2026-11-18T05:00:00Z'))).toBe(false);
    expect(scheduledCoverageEstablished({syncComplete:true,scheduleComplete:true,videos:[editable('s','private','2026-12-12T10:00:00Z')]},Date.parse('2026-11-18T05:00:00Z'))).toBe(true);
  });

  it('owner search discovers private Scheduled absent uploads without corrupting last verified inventory',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T05:00:00Z'));
    try{
      const firstFuture=editable('first','private','2026-12-05T10:00:00Z');
      fixture.responses.set(profile.id,{...response(),videos:[firstFuture],scheduledCount:1,uniqueVideoIds:1,videosHydrated:1});
      expect((await refreshOwnerInventoriesAuthoritative([channel()],true,[profile])).rows[0].status).toBe('UPDATED');
      const saved=structuredClone(fixture.inventoryFiles.get('lumiere'));
      fixture.responses.set(profile.id,{...response(),videos:[editable('not-in-uploads','private','2026-12-12T10:00:00Z')],
        scheduledCount:1,uniqueVideoIds:0,videosHydrated:0,searchUsed:true,searchSupplementCount:1,
        syncComplete:true,scheduleComplete:false,incompleteReasons:['UPLOADS_PLAYLIST_SCHEDULE_COVERAGE_MISMATCH']});
      const second=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
      expect(second.rows[0].status).toBe('API_FAILED');
      expect(fixture.inventoryFiles.get('lumiere')).toEqual(saved);
      const r=loadChannelRunwayStore().channels.lumiere;
      expect(r.dataState).toBe('PARTIAL_DATA');
      expect(r.status).toBe('no-data');
      expect(r.runwayDays).toBeUndefined();
      expect(r.scheduledUntil).toBe('2026-12-12');
      const afterReload=recalculateChannelRunway([channel()],new Date(),false,storage as any).channels.lumiere;
      expect(afterReload.dataState).toBe('PARTIAL_DATA');
      expect(afterReload.runwayDays).toBeUndefined();
      expect(afterReload.scheduledUntil).toBe('2026-12-12');
    }finally{vi.useRealTimers()}
  });

  it('only explicit one-channel refresh enables bounded owner search, bulk does not',async()=>{
    await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
    const call=(api.youtubeListExisting as any).mock.calls[0];
    expect(call[3]).toBe(true);
    const b={...channel('bulk-b'),id:'bulk-b',slug:'bulk-b',name:'B',youtubeProfileId:'p-b',youtubeChannelId:'UC-B'} as Channel;
    const profiles=[profile,{...profile,id:'p-b',channelId:'UC-B'}];
    fixture.responses.set('p-b',{...response(),channelId:'UC-B',channelTitle:'B'});
    vi.mocked(api.youtubeListExisting).mockClear();
    await refreshOwnerInventoriesAuthoritative([channel(),b],true,profiles);
    expect((api.youtubeListExisting as any).mock.calls.every((args:any[])=>args[3]===false)).toBe(true);
  });

  it('single refresh makes exactly one authoritative inventory call',async()=>{
    await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
    expect(api.youtubeListExisting).toHaveBeenCalledTimes(1);
  });

  it('refresh all makes exactly one owner inventory call per eligible channel',async()=>{
    const a=channel('a');
    const b={...channel('b'),id:'b',slug:'b',name:'B',youtubeProfileId:'p-b',youtubeChannelId:'UC-B'} as Channel;
    const profiles=[profile,{...profile,id:'p-b',channelId:'UC-B'}];
    fixture.responses.set('p-b',{...response(),channelId:'UC-B',channelTitle:'B'});
    await refreshOwnerInventoriesAuthoritative([a,b],true,profiles);
    expect(api.youtubeListExisting).toHaveBeenCalledTimes(2);
    expect((api.youtubeListExisting as any).mock.calls.filter((x:any[])=>x[0]==='profile-lumiere')).toHaveLength(1);
    expect((api.youtubeListExisting as any).mock.calls.filter((x:any[])=>x[0]==='p-b')).toHaveLength(1);
  });

  it('does not mutate OAuth in owner inventory refresh',()=>{
    const src=readFileSync('src/youtubeOwnerInventory.ts','utf8');
    expect(src).not.toContain('youtubeDisconnect');
    expect(src).not.toContain('youtubeConnect');
    expect(src).not.toContain('oauth_disconnect');
    expect(src).not.toContain('oauth_connect');
  });

  it('backend contract exposes authoritative inventory counts and status.publishAt rule',()=>{
    const src=readFileSync('src-tauri/src/youtube.rs','utf8');
    for(const field of ['channelId','channelTitle','youtubeFound','playlistReportedTotal','uniqueVideoIds','videosHydrated','privateCount','publicCount','scheduledCount','scheduleComplete','syncComplete','fullSyncApiRequests','fullSyncEstimatedQuotaCost'])expect(src).toContain('"'+field+'"');
    expect(src).toContain('"privacyStatus":st.get("privacyStatus")');
    expect(src).toContain('"publishAt":st.get("publishAt")');
  });
});
