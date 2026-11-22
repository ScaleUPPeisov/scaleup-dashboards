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
  youtubeQuotaBucketUsage:vi.fn(()=>({available:100,used:0,limit:100,reserved:0})),
  youtubeQuotaUsage:vi.fn(()=>({used:0,limit:10000}))
}));
vi.mock('./youtubeCache',()=>({markYoutubeCache:vi.fn()}));

import {api} from './api';
import {existingCacheKey,loadExistingCache,replaceExistingCacheFromSync,scheduleSyncTruthFromInfo,independentScheduleCoverageFromInfo} from './channelSchedule';
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
    privateCount:0,publicCount:5,scheduledCount:15,scheduleComplete:true,syncComplete:true,complete:true,scheduledCoverageVerified:true,fullSyncApiRequests:3,fullSyncEstimatedQuotaCost:3,videos}
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
    // A full owner read with incomplete Scheduled coverage is PARTIAL_DATA,
    // not a network/API failure, and it must not erase the last verified runway.
    expect(second.rows[0].status).toBe('PARTIAL_DATA');
    const retained=loadChannelRunwayStore().channels.lumiere;
    expect(retained.scheduledVideoCount).toBe(prior.scheduledVideoCount);
    expect(retained.scheduledUntil).toBe(prior.scheduledUntil);
    expect(retained.dataState).toBe('PARTIAL_DATA');
    expect(retained.runwayDays).toBeUndefined();
    expect(retained.status).toBe('no-data');
    }finally{vi.useRealTimers()}
  });

  it('Neon-shaped owner response never claims confirmed zero or API failure when only scheduled coverage is unverified',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T05:00:00Z'));
    try{
      fixture.responses.set(profile.id,{
        ...response(),
        videos:Array.from({length:190},(_,i)=>editable('published-'+i,'public',undefined,'2026-10-01T00:00:00Z')),
        youtubeFound:190,uniqueVideoIds:190,videosHydrated:190,
        privateCount:0,scheduledCount:0,publicCount:190,
        syncComplete:true,complete:true,scheduleComplete:false,
        incompleteReasons:['SCHEDULE_EMPTY_NOT_INDEPENDENTLY_VERIFIED'],
        searchUsed:true,searchExhausted:true
      });
      const result=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
      expect(result.rows[0].status).toBe('PARTIAL_DATA');
      expect(result.rows[0].diagnosticReasons).toContain('SCHEDULE_EMPTY_NOT_INDEPENDENTLY_VERIFIED');
      expect(result.rows[0].observedScheduled).toBe(0);
      // The refresh remains unconfirmed even though classification is no longer API_FAILED.
      expect(result.failed).toBe(1);
      expect(fixture.inventoryFiles.has('lumiere')).toBe(false);
      const runway=loadChannelRunwayStore().channels.lumiere;
      expect(runway.dataState).toBe('PARTIAL_DATA');
      expect(runway.runwayDays).toBeUndefined();
      expect(runway.status).toBe('no-data');
    }finally{vi.useRealTimers()}
  });

  it('recovers historical positive Scheduled count from native owner snapshot after newer failed refresh, without claiming fresh runway',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T05:00:00Z'));
    try{
      const ch=channel('historical-positive');
      const future=editable('future-Dec12','private','2026-12-12T20:00:00+07:00');
      const persisted=await replaceExistingCacheFromSync(ch.id,[future],{
        channelId:'UC-LUMIERE',syncComplete:true,scheduleComplete:true
      });
      expect(persisted.persisted).toBe(true);
      storage.seed(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify({version:1,channels:{
        [ch.id]:{
          channelId:ch.id,channelName:ch.name,
          scheduledVideoCount:0,dataState:'PARTIAL_DATA',
          lastRefreshAttemptAt:'2026-11-18T05:01:00Z',
          lastRefreshError:'AUTHORITATIVE_INVENTORY_INCOMPLETE',
          lastLocalCalculation:'2026-11-18T05:01:00Z',
          status:'no-data',priority:'unknown'
        }
      }}));
      const r=recalculateChannelRunway([ch],new Date(),false,storage as any).channels[ch.id];
      expect(r.scheduledVideoCount).toBe(1);
      expect(r.scheduledUntil).toBe('2026-12-12');
      expect(r.dataState).toBe('PARTIAL_DATA');
      expect(r.status).toBe('no-data');
      expect(r.runwayDays).toBeUndefined();
      expect(r.lastRefreshError).toBe('AUTHORITATIVE_INVENTORY_INCOMPLETE');
      expect(r.lastObservedAt).toBeTruthy();
      expect(r.lastScheduleSync).toBeUndefined(); // Unproven uploads-only cache is historical, not a full owner sync
    }finally{vi.useRealTimers()}
  });

  it('historical partial evidence is labeled as cache, not current confirmed YouTube schedule',()=>{
    const screen=readFileSync('src/ChannelRunway.tsx','utf8');
    expect(screen).toContain('последняя проверенная дата • данные устарели');
    expect(screen).toContain('Исторический запас; актуальность неизвестна');
    expect(screen).toContain('(кэш)*');
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
      const stored=await replaceExistingCacheFromSync(c.id,[future],{scheduleComplete:true,syncComplete:true,scheduledCoverageVerified:true,channelId:'UC-LUMIERE'});
      expect(stored.persisted).toBe(true);
      const r=recalculateChannelRunway([c],new Date(),false,storage as any).channels[c.id];
      expect(r.scheduledUntil).toBe('2026-12-12');
      expect(r.scheduledVideoCount).toBe(1);
      expect(r.runwayDays).toBe(24);
      expect(r.dataState).toBe('CONFIRMED_SCHEDULE');
    }finally{vi.useRealTimers()}
  });


  it('P0 6.1.26 treats uploads-only positive schedules as partial, even if scheduleComplete=true',()=>{
    const uploadsOnly={scheduleComplete:true,syncComplete:true,complete:true,searchUsed:false,searchExhausted:false};
    expect(independentScheduleCoverageFromInfo(uploadsOnly)).toBe(false);
    expect(scheduleSyncTruthFromInfo(uploadsOnly)).toBe('incomplete');
    expect(scheduleSyncTruthFromInfo({...uploadsOnly,searchUsed:true,searchExhausted:false})).toBe('incomplete');
    expect(scheduleSyncTruthFromInfo({...uploadsOnly,searchUsed:true,searchExhausted:true,searchError:'OWNER_SEARCH_FAILED'})).toBe('incomplete');
    expect(scheduleSyncTruthFromInfo({...uploadsOnly,searchUsed:true,searchExhausted:true,supplementalMissingCount:1})).toBe('incomplete');
    expect(scheduleSyncTruthFromInfo({...uploadsOnly,searchUsed:true,searchExhausted:true,knownScheduledIdsTruncated:true})).toBe('incomplete');
    expect(scheduleSyncTruthFromInfo({...uploadsOnly,searchUsed:true,searchExhausted:true,searchLimitReached:true,supplementalMissingCount:0})).toBe('incomplete');
    expect(scheduleSyncTruthFromInfo({...uploadsOnly,searchUsed:true,searchExhausted:true,supplementalMissingCount:0,historyOnlyScheduledOutsideSearchCount:1})).toBe('incomplete');
    expect(scheduleSyncTruthFromInfo({...uploadsOnly,searchUsed:true,searchExhausted:true,supplementalMissingCount:0,historyOnlyScheduledOutsideSearchCount:0})).toBe('complete');
    expect(scheduleSyncTruthFromInfo({...uploadsOnly,scheduledCoverageVerified:true})).toBe('complete');
  });

  it('P0 6.1.26 demotes a historical false CONFIRMED_SCHEDULE after restart but retains its 16 videos and date',()=>{
    const c=channel('proof-required');
    storage.seed(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify({version:1,channels:{[c.id]:{
      channelId:c.id,channelName:c.name,scheduledVideoCount:16,scheduledUntil:'2027-01-06',
      dataState:'CONFIRMED_SCHEDULE',inventoryEvidenceVersion:2,independentScheduleEvidenceVersion:3,
      lastScheduleSync:'2026-11-21T12:10:42Z',lastLocalCalculation:'2026-11-21T12:10:42Z',
      runwayDays:46,priority:'low',status:'large'
    }}}));
    const loaded=loadChannelRunwayStore(storage as any).channels[c.id];
    expect(loaded.dataState).toBe('PARTIAL_DATA');
    expect(loaded.scheduledVideoCount).toBe(16);
    expect(loaded.scheduledUntil).toBe('2027-01-06');
    expect(loaded.runwayDays).toBeUndefined();
    expect(loaded.status).toBe('no-data');
    const again=recalculateChannelRunway([c],new Date('2026-11-21T13:00:00Z'),false,storage as any).channels[c.id];
    expect(again.dataState).toBe('PARTIAL_DATA');
    expect(again.scheduledVideoCount).toBe(16);
  });

  it('P0 6.1.26 restores only a proved native schedule despite a newer legacy lastRefreshAttemptAt',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-21T12:10:25.100Z'));
    try{
      const ch=channel('migration-verified');
      const vids=[editable('future-P0','private','2027-02-05T20:00:00+07:00')];
      expect((await replaceExistingCacheFromSync(ch.id,vids,{
        scheduleComplete:true,syncComplete:true,searchUsed:true,searchExhausted:true,
        supplementalMissingCount:0,knownScheduledIdsTruncated:false,scheduledCoverageVerified:true
      })).persisted).toBe(true);
      storage.seed(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify({version:1,channels:{[ch.id]:{
        channelId:ch.id,channelName:ch.name,scheduledVideoCount:1,scheduledUntil:'2027-02-05',
        dataState:'CONFIRMED_SCHEDULE',inventoryEvidenceVersion:2,
        lastScheduleSync:'2026-11-21T12:10:25.100Z',
        lastRefreshAttemptAt:'2026-11-21T12:10:25.120Z',
        lastLocalCalculation:'2026-11-21T12:10:25.120Z',
        runwayDays:76,priority:'low',status:'large'
      }}}));
      const result=recalculateChannelRunway([ch],new Date('2026-11-21T13:00:00Z'),false,storage as any).channels[ch.id];
      expect(result.dataState).toBe('CONFIRMED_SCHEDULE');
      expect(result.independentScheduleEvidenceVersion).toBe(4);
      expect(result.scheduledVideoCount).toBe(1);
      expect(result.scheduledUntil).toBe('2027-02-05');
    }finally{vi.useRealTimers()}
  });

  it('P0 6.1.26 native cache ready reconciles Runway even after daily scheduler marker exists',()=>{
    const bridge=readFileSync('src/ExistingInventoryMigrationBridge.tsx','utf8');
    const scheduler=readFileSync('src/ChannelRunwayScheduler.tsx','utf8');
    expect(bridge).toContain('EXISTING_INVENTORY_NATIVE_READY_EVENT');
    expect(scheduler).toContain('window.addEventListener(EXISTING_INVENTORY_NATIVE_READY_EVENT,nativeReady)');
    expect(scheduler).toContain('recalculateChannelRunway(useApp.getState().channels,new Date(),false)');
    expect(scheduler).toContain('window.removeEventListener(EXISTING_INVENTORY_NATIVE_READY_EVENT,nativeReady)');
  });

  it('P0 6.1.26 preserves 0-to-33 startup channel changes during native migration',()=>{
    const src=readFileSync('src/ExistingInventoryMigrationBridge.tsx','utf8');
    expect(src).toContain('pendingIds.current=channels.map(c=>c.id)');
    expect(src).toContain('while(pendingIds.current!==null)');
    expect(src).toContain('if(pendingIds.current!==null)continue');
    expect(src).toContain('EXISTING_INVENTORY_NATIVE_READY_EVENT');
  });

  it('uploads-only completed zero is NOT confirmed empty even when backend marks complete',()=>{
    expect(scheduledCoverageEstablished({syncComplete:true,scheduleComplete:true,videos:[]},Date.parse('2026-11-18T05:00:00Z'))).toBe(false);
    expect(scheduledCoverageEstablished({syncComplete:true,scheduleComplete:false,videos:[editable('s','private','2026-12-12T10:00:00Z')]},Date.parse('2026-11-18T05:00:00Z'))).toBe(false);
    expect(scheduledCoverageEstablished({syncComplete:true,scheduleComplete:true,videos:[editable('s','private','2026-12-12T10:00:00Z')]},Date.parse('2026-11-18T05:00:00Z'))).toBe(false);
    const completedLegacy={syncComplete:true,scheduleComplete:true,searchUsed:true,searchExhausted:true,searchError:null,supplementalMissingCount:0,knownScheduledIdsTruncated:false,historyOnlyScheduledOutsideSearchCount:0,videos:[editable('s','private','2026-12-12T10:00:00Z')]};
    expect(scheduledCoverageEstablished(completedLegacy,Date.parse('2026-11-18T05:00:00Z'))).toBe(true);
    expect(scheduledCoverageEstablished({...completedLegacy,searchLimitReached:true})).toBe(false);
    expect(scheduledCoverageEstablished({...completedLegacy,supplementalMissingCount:1})).toBe(false);
    expect(scheduledCoverageEstablished({...completedLegacy,knownScheduledIdsTruncated:true})).toBe(false);
    expect(scheduledCoverageEstablished({...completedLegacy,historyOnlyScheduledOutsideSearchCount:1})).toBe(false);
    expect(scheduledCoverageEstablished({syncComplete:true,scheduleComplete:true,scheduledCoverageVerified:true,videos:[editable('s','private','2026-12-12T10:00:00Z')]},Date.parse('2026-11-18T05:00:00Z'))).toBe(true);
  });


  it('never promotes a 20-to-7 drop when historical future Video IDs are absent from the owner response',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    try{
      const oldVideos=[
        editable('PREVID00001','private','2026-12-12T10:00:00Z'),
        editable('PREVID00002','private','2026-12-15T10:00:00Z')
      ];
      await replaceExistingCacheFromSync('lumiere',oldVideos,{
        channelId:'UC-LUMIERE',syncComplete:true,scheduleComplete:true
      });
      fixture.responses.set(profile.id,{
        ...response(),videos:[oldVideos[0]],scheduledCoverageVerified:true
      });
      const result=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
      expect(result.rows[0].status).toBe('PARTIAL_DATA');
      expect(result.rows[0].diagnosticReasons).toContain('PREVIOUS_SCHEDULED_IDS_NOT_RECONCILED');
      expect((api.youtubeListExisting as any).mock.calls[0][4]).toContain('PREVID00002');
      expect((await loadExistingCache('lumiere'))?.baseline['PREVID00002']).toBeDefined();
      expect(loadChannelRunwayStore().channels.lumiere.dataState).not.toBe('CONFIRMED_SCHEDULE');
    }finally{vi.useRealTimers()}
  });

  it('accepts a real decrease only after the former Scheduled ID is returned with a changed owner status',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    try{
      const oldVideos=[
        editable('PREVID00001','private','2026-12-12T10:00:00Z'),
        editable('PREVID00002','private','2026-12-15T10:00:00Z')
      ];
      await replaceExistingCacheFromSync('lumiere',oldVideos,{
        channelId:'UC-LUMIERE',syncComplete:true,scheduleComplete:true
      });
      fixture.responses.set(profile.id,{
        ...response(),videos:[
          oldVideos[0],
          editable('PREVID00002','public',undefined,'2026-11-21T10:00:00Z')
        ],scheduledCoverageVerified:true
      });
      const result=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
      expect(result.rows[0].status).toBe('UPDATED');
      expect(loadChannelRunwayStore().channels.lumiere.scheduledVideoCount).toBe(1);
    }finally{vi.useRealTimers()}
  });

  it('owner search discovers private Scheduled absent uploads without corrupting last verified inventory',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T05:00:00Z'));
    try{
      const isolatedChannel=channel('owner-search-supplement');
      const firstFuture=editable('first','private','2026-12-05T10:00:00Z');
      fixture.responses.set(profile.id,{...response(),videos:[firstFuture],scheduledCount:1,uniqueVideoIds:1,videosHydrated:1});
      expect((await refreshOwnerInventoriesAuthoritative([isolatedChannel],true,[profile])).rows[0].status).toBe('UPDATED');
      const saved=structuredClone(fixture.inventoryFiles.get(isolatedChannel.id));
      fixture.responses.set(profile.id,{...response(),videos:[editable('not-in-uploads','private','2026-12-12T10:00:00Z')],
        scheduledCount:1,uniqueVideoIds:0,videosHydrated:0,searchUsed:true,searchSupplementCount:1,
        syncComplete:true,scheduleComplete:false,incompleteReasons:['UPLOADS_PLAYLIST_SCHEDULE_COVERAGE_MISMATCH']});
      const second=await refreshOwnerInventoriesAuthoritative([isolatedChannel],true,[profile]);
      expect(second.rows[0].status).toBe('PARTIAL_DATA');
      expect(second.rows[0].observedScheduled).toBe(1);
      expect(second.rows[0].observedThrough).toBe('2026-12-12T10:00:00Z');
      expect(second.rows[0].diagnosticReasons).toContain('UPLOADS_PLAYLIST_SCHEDULE_COVERAGE_MISMATCH');
      expect(fixture.inventoryFiles.get(isolatedChannel.id)).toEqual(saved);
      const r=loadChannelRunwayStore().channels[isolatedChannel.id];
      expect(r.dataState).toBe('PARTIAL_DATA');
      expect(r.status).toBe('no-data');
      expect(r.runwayDays).toBeUndefined();
      expect(r.scheduledUntil).toBe('2026-12-12');
      const afterReload=recalculateChannelRunway([isolatedChannel],new Date(),false,storage as any).channels[isolatedChannel.id];
      expect(afterReload.dataState).toBe('PARTIAL_DATA');
      expect(afterReload.runwayDays).toBeUndefined();
      expect(afterReload.scheduledUntil).toBe('2026-12-12');
    }finally{vi.useRealTimers()}
  });

  it('owner search page limit with verified Scheduled is PARTIAL_DATA, not a false zero or API failure',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T05:00:00Z'));
    try{
      fixture.responses.set(profile.id,{...response(),videos:[editable('video-dec12','private','2026-12-12T20:00:00+07:00')],
        scheduledCount:1,uniqueVideoIds:90,videosHydrated:90,searchUsed:true,searchExhausted:false,
        searchPagesFetched:2,searchError:null,syncComplete:true,scheduleComplete:false,
        incompleteReasons:['OWNER_SEARCH_PAGE_LIMIT','OWNER_SEARCH_NOT_EXHAUSTED']});
      const result=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
      expect(result.rows[0].status).toBe('PARTIAL_DATA');
      expect(result.rows[0].observedScheduled).toBe(1);
      expect(result.rows[0].diagnosticReasons).toContain('OWNER_SEARCH_PAGE_LIMIT');
      const runway=loadChannelRunwayStore().channels.lumiere;
      expect(runway.dataState).toBe('PARTIAL_DATA');
      expect(runway.scheduledUntil).toBe('2026-12-12');
      expect(runway.scheduledVideoCount).toBe(1);
      expect(runway.runwayDays).toBeUndefined();
      expect(runway.lastScheduleSync).toBeUndefined();
      expect(fixture.inventoryFiles.has('lumiere')).toBe(false);
    }finally{vi.useRealTimers()}
  });

  it('unowned video rows never become even partial Scheduled proof',async()=>{
    fixture.responses.set(profile.id,{...response(),videos:[{...editable('other-owner','private','2099-12-12T10:00:00Z'),channelId:'UC_OTHER'}],
      scheduledCount:1,syncComplete:true,scheduleComplete:false,
      incompleteReasons:['OWNER_SEARCH_PAGE_LIMIT']});
    const result=await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
    expect(result.rows[0].status).toBe('API_FAILED');
    expect(result.rows[0].error).toBe('AUTHORITATIVE_VIDEO_CHANNEL_MISMATCH');
    expect(result.rows[0].observedScheduled).toBe(0);
    expect(loadChannelRunwayStore().channels.lumiere.dataState).not.toBe('CONFIRMED_SCHEDULE');
  });

  it('only explicit one-channel refresh enables bounded owner search, bulk does not',async()=>{
    // Preserve the legacy automatic/background bulk safety contract: a
    // scheduled 33-channel scan must never invoke search.list. New explicit
    // manual bulk reconciliation is tested separately below.
    const b={...channel('bulk-background'),id:'bulk-background',slug:'bulk-background',name:'B',youtubeProfileId:'p-b',youtubeChannelId:'UC-B'} as Channel;
    const profiles=[profile,{...profile,id:'p-b',channelId:'UC-B'}];
    fixture.responses.set('p-b',{...response(),channelId:'UC-B',channelTitle:'B'});
    await refreshOwnerInventoriesAuthoritative([channel(),b],false,profiles);
    // Non-forced background sync may skip a channel still under its TTL.
    // Every native request it *does* make must leave owner search disabled.
    const backgroundCalls=(api.youtubeListExisting as any).mock.calls as any[][];
    expect(backgroundCalls.length).toBeGreaterThan(0);
    expect(backgroundCalls.length).toBeLessThanOrEqual(2);
    expect(backgroundCalls.every(args=>args[3]===false)).toBe(true);
  });

  it('both single-channel and explicit bulk refresh can deep-check incomplete owner schedules',async()=>{
    await refreshOwnerInventoriesAuthoritative([channel()],true,[profile]);
    const call=(api.youtubeListExisting as any).mock.calls[0];
    expect(call[3]).toBe(true);
    const b={...channel('bulk-b'),id:'bulk-b',slug:'bulk-b',name:'B',youtubeProfileId:'p-b',youtubeChannelId:'UC-B'} as Channel;
    const profiles=[profile,{...profile,id:'p-b',channelId:'UC-B'}];
    fixture.responses.set('p-b',{...response(),channelId:'UC-B',channelTitle:'B'});
    vi.mocked(api.youtubeListExisting).mockClear();
    await refreshOwnerInventoriesAuthoritative([channel(),b],true,profiles);
    expect((api.youtubeListExisting as any).mock.calls).toHaveLength(2);
    expect((api.youtubeListExisting as any).mock.calls.every((args:any[])=>args[3]===true)).toBe(true);
  });

  it('manual owner refresh passes local Scheduled upload IDs for videos.list hydration without requiring owner search',async()=>{
    const id='nEON1234aBc';
    await refreshOwnerInventoriesAuthoritative([channel()],true,[profile],{lumiere:[id]});
    const args=(api.youtubeListExisting as any).mock.calls[0];
    expect(args[4]).toContain(id);
    expect(args[3]).toBe(true);
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
  it('partial owner inventory UI never calls an unverified zero an actual schedule count',()=>{
    const screen=readFileSync('src/ChannelRunway.tsx','utf8');
    expect(screen).toContain('количество Scheduled неизвестно');
    expect(screen).toContain('полнота НЕ подтверждена');
    expect(screen).not.toContain('найдено минимум ${row.observedScheduled||0} Scheduled');
  });

});
