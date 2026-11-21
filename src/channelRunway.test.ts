import {describe,expect,it} from 'vitest';
import type {Channel,YoutubeExistingVideo} from './types';
import {
  calendarDaysBetween,
  compareYoutubeOnlyRunwayPriority,
  deriveRunwayRecord,
  krasnoyarskClock,
  runwayDisplayEvidence,
  quotaRiskCount,
  recommendedProductionIntervalDays,
  subtractCalendarDays
} from './channelRunwayCore';
import {
  loadChannelRunwayStore,
  maybeRunDailyChannelRunway,
  recalculateChannelRunway,
  saveChannelRunwayStore,
  shouldRunDailyChannelRunway,
  upsertChannelRunwayFromYoutube
} from './channelRunwayStore';

class MemoryStorage{
  private map=new Map<string,string>();
  getItem(key:string){return this.map.get(key)??null}
  setItem(key:string,value:string){this.map.set(key,String(value))}
}

const channel=(overrides:Partial<Channel>={}):Channel=>({
  id:'neon',name:'NEON',slug:'neon',cadenceDays:2,targetBufferDays:60,publishHour:4,publishMinute:0,
  language:'en',genre:'deep house',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
  seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]},
  ...overrides
});

const scheduled=(iso:string):YoutubeExistingVideo=>({
  id:iso,position:1,title:'x',description:'',tags:[],categoryId:'10',privacyStatus:'private',publishAt:iso,selected:false
});

describe('Channel Runway core',()=>{
  it('NEON 01.12.2026 from 02.09.2026 is 90 days',()=>{
    expect(calendarDaysBetween('2026-09-02','2026-12-01')).toBe(90);
    const record=deriveRunwayRecord(channel(),[scheduled('2026-12-01T04:00:00+07:00')],new Date('2026-09-02T08:00:00Z'),'2026-09-02T08:00:00Z',true);
    expect(record.scheduledUntil).toBe('2026-12-01');
    expect(record.runwayDays).toBe(90);
    expect(record.nextProductionDate).toBe('2026-10-17');
    expect(record.status).toBe('large');
  });

  it('retains Lumière historical date/count when confirmed cache expires',()=>{
    const now=new Date('2026-11-21T03:00:00Z');
    const record={
      ...deriveRunwayRecord(channel({id:'lumiere',name:'Lumière de Minuit'}),
        Array.from({length:15},()=>scheduled('2027-01-04T18:00:00+07:00')),
        new Date('2026-11-20T16:39:16Z'),'2026-11-20T16:39:16Z',true),
      dataState:'STALE_CACHE' as const,status:'no-data' as const,runwayDays:undefined
    };
    const evidence=runwayDisplayEvidence(record,now);
    expect(evidence.kind).toBe('HISTORICAL');
    expect(evidence.scheduledCount).toBe(15);
    expect(evidence.scheduledUntil).toBe('2027-01-04');
    expect(evidence.daysRemaining).toBe(44);
    expect(evidence.lastVerifiedAt).toBe('2026-11-20T16:39:16Z');
  });

  it('keeps Afterglow historical 11 Scheduled after API failure; does not fabricate a live result',()=>{
    const now=new Date('2026-11-21T03:00:00Z');
    const record={
      ...deriveRunwayRecord(channel({id:'afterglow',name:'Afterglow Highway'}),
        Array.from({length:11},()=>scheduled('2026-12-16T18:00:00+07:00')),
        new Date('2026-11-18T10:00:00Z'),'2026-11-18T10:00:00Z',true),
      dataState:'API_FAILED' as const,status:'no-data' as const,runwayDays:undefined,
      lastRefreshError:'OWNER_INVENTORY_CHANNELS_LIST_HTTP_403_INSUFFICIENT_PERMISSIONS'
    };
    const display=runwayDisplayEvidence(record,now);
    expect(display.kind).toBe('HISTORICAL');
    expect(display.scheduledCount).toBe(11);
    expect(display.daysRemaining).toBeGreaterThan(0);
  });

  it('shows an owner-verified partial minimum without replacing the full historic baseline',()=>{
    const now=new Date('2026-11-21T03:00:00Z');
    const rec={
      ...deriveRunwayRecord(channel(),[scheduled('2026-12-12T18:00:00+07:00')],
        new Date('2026-11-18T00:00:00Z'),'2026-11-18T00:00:00Z',true),
      scheduledVideoCount:23,dataState:'PARTIAL_DATA' as const,status:'no-data' as const,runwayDays:undefined,
      lastObservedAt:'2026-11-21T02:00:00Z',lastObservedScheduledCount:22,
      lastObservedScheduledUntil:'2026-12-12'
    };
    const shown=runwayDisplayEvidence(rec,now);
    expect(shown.kind).toBe('OBSERVED_PARTIAL');
    expect(shown.scheduledCount).toBe(22);
    expect(rec.scheduledVideoCount).toBe(23);
    expect(rec.lastScheduleSync).toBe('2026-11-18T00:00:00Z');
  });

  it('never promotes a legacy zero, missing proof, or an expired historical date to a live zero',()=>{
    const now=new Date('2026-11-21T03:00:00Z');
    const legacy={...deriveRunwayRecord(channel(),[],now,now.toISOString(),false),
      dataState:'API_FAILED' as const,runwayDays:undefined,status:'no-data' as const};
    expect(runwayDisplayEvidence(legacy,now).kind).toBe('UNKNOWN');
    const expired={...legacy,scheduledVideoCount:5,scheduledUntil:'2026-11-01',
      lastScheduleSync:'2026-10-18T10:00:00Z',dataState:'STALE_CACHE' as const};
    const historical=runwayDisplayEvidence(expired,now);
    expect(historical.kind).toBe('HISTORICAL');
    expect(historical.daysRemaining).toBe(0);
    expect(historical.scheduledCount).toBe(5);
  });

  it('keeps 33 independent channel evidence rows across mixed states and deterministic priority',()=>{
    const now=new Date('2026-11-21T03:00:00Z');
    const records=Array.from({length:33},(_,i)=>{
      const name='channel-'+i;
      const base=deriveRunwayRecord(channel({id:name,name}),[scheduled('2027-01-04T18:00:00+07:00')],
        new Date('2026-11-21T02:00:00Z'),'2026-11-21T02:00:00Z',true);
      if(i===1)return {...base,dataState:'API_FAILED' as const,status:'no-data' as const,runwayDays:undefined};
      if(i===2)return {...base,dataState:'PARTIAL_DATA' as const,status:'no-data' as const,runwayDays:undefined,
        lastObservedAt:'2026-11-21T02:00:00Z',lastObservedScheduledCount:1,lastObservedScheduledUntil:'2026-11-25'};
      if(i===3)return {...base,dataState:'STALE_CACHE' as const,status:'no-data' as const,runwayDays:undefined};
      return base;
    });
    const before=records.map(r=>r.scheduledUntil);
    const evidence=records.map(r=>runwayDisplayEvidence(r,now));
    expect(evidence).toHaveLength(33);
    expect(evidence.map(x=>x.kind).slice(0,4)).toEqual(['CURRENT','HISTORICAL','OBSERVED_PARTIAL','HISTORICAL']);
    expect(records.map(r=>r.scheduledUntil)).toEqual(before);
    expect(evidence.every((v,i)=>v.kind!=='UNKNOWN'&&records[i].channelId==='channel-'+i)).toBe(true);
  });

  it('sorts by YouTube-only runway, ignores local reserve, and puts unconfirmed channels last',()=>{
    const rows=[
      {channelName:'Channel B',remoteScheduledDays:20,scheduledUntil:'2026-11-09',known:true,localReadyVideos:0},
      {channelName:'Channel A',remoteScheduledDays:5,scheduledUntil:'2026-10-25',known:true,localReadyVideos:30},
      {channelName:'No future schedule',remoteScheduledDays:0,known:true,localReadyVideos:50},
      {channelName:'Unknown',remoteScheduledDays:0,known:false,localReadyVideos:80}
    ].sort(compareYoutubeOnlyRunwayPriority);
    expect(rows.map(x=>x.channelName)).toEqual(['No future schedule','Channel A','Channel B','Unknown']);
  });

  it('sorts by the visible days ascending, including explicitly historical partial evidence',()=>{
    const rows=[
      {channelName:'Green confirmed',remoteScheduledDays:49,known:true},
      {channelName:'Unknown',remoteScheduledDays:0,known:false},
      {channelName:'Historical 2',remoteScheduledDays:0,known:false,historicalScheduledDays:2},
      {channelName:'Red confirmed',remoteScheduledDays:8,known:true},
      {channelName:'Historical 21',remoteScheduledDays:0,known:false,historicalScheduledDays:21},
      {channelName:'Confirmed 2',remoteScheduledDays:2,known:true},
    ].sort(compareYoutubeOnlyRunwayPriority);
    expect(rows.map(x=>x.channelName)).toEqual([
      'Confirmed 2','Historical 2','Red confirmed','Historical 21','Green confirmed','Unknown'
    ]);
    expect(rows.at(-1)?.channelName).toBe('Unknown');
  });

  it('uses schedule end date and channel name as deterministic tie-breakers',()=>{
    const rows=[
      {channelName:'Zulu',remoteScheduledDays:10,scheduledUntil:'2026-11-01',known:true},
      {channelName:'Beta',remoteScheduledDays:10,scheduledUntil:'2026-10-30',known:true},
      {channelName:'Alpha',remoteScheduledDays:10,scheduledUntil:'2026-10-30',known:true}
    ].sort(compareYoutubeOnlyRunwayPriority);
    expect(rows.map(x=>x.channelName)).toEqual(['Alpha','Beta','Zulu']);
  });
  it('counts only true YouTube Scheduled private + future publishAt',()=>{
    const now=new Date('2026-09-02T08:00:00Z');
    const good=scheduled('2026-10-01T04:00:00+07:00');
    const malformedPublic={...scheduled('2026-12-01T04:00:00+07:00'),id:'public',privacyStatus:'public' as const};
    const malformedUnlisted={...scheduled('2026-11-01T04:00:00+07:00'),id:'unlisted',privacyStatus:'unlisted' as const};
    const past=scheduled('2026-09-01T04:00:00+07:00');
    const record=deriveRunwayRecord(channel(),[good,malformedPublic,malformedUnlisted,past],now,now.toISOString(),true);
    expect(record.scheduledVideoCount).toBe(1);
    expect(record.scheduledUntil).toBe('2026-10-01');
    expect(record.runwayDays).toBe(29);
  });

  it('status dates use Krasnoyarsk calendar regardless of system timezone',()=>{
    expect(krasnoyarskClock(new Date('2026-09-01T17:30:00Z')).dateKey).toBe('2026-09-02');
    expect(subtractCalendarDays('2026-12-01',45)).toBe('2026-10-17');
  });

  it('20 channels and a 60 day batch means one channel every 3 days',()=>{
    expect(recommendedProductionIntervalDays(20,60)).toBe(3);
  });

  it('quota risk is calculated from local capacity only',()=>{
    const now=new Date('2026-09-02T08:00:00Z');
    const rows=[
      deriveRunwayRecord(channel({id:'a',name:'A'}),[scheduled('2026-09-03T04:00:00+07:00')],now,now.toISOString(),true),
      deriveRunwayRecord(channel({id:'b',name:'B'}),[scheduled('2026-09-04T04:00:00+07:00')],now,now.toISOString(),true),
      deriveRunwayRecord(channel({id:'c',name:'C'}),[scheduled('2026-09-20T04:00:00+07:00')],now,now.toISOString(),true)
    ];
    expect(quotaRiskCount(rows,0,1)).toBe(2);
  });
});

describe('Channel Runway persistence and 06:00 KRAT scheduler',()=>{
  it('targeted recalculation of one channel never deletes the other 32 owner snapshots',()=>{
    const storage=new MemoryStorage(),now=new Date('2026-11-21T03:00:00Z');
    const channels=Array.from({length:33},(_,i)=>channel({id:'channel-'+i,name:'Channel '+i}));
    for(const c of channels)upsertChannelRunwayFromYoutube(c,[scheduled('2027-01-04T18:00:00+07:00')],now,storage as any);
    const before=loadChannelRunwayStore(storage as any);
    expect(Object.keys(before.channels)).toHaveLength(33);
    const one=recalculateChannelRunway([channels[0]],new Date('2026-11-21T04:00:00Z'),false,storage as any);
    expect(Object.keys(one.channels)).toHaveLength(33);
    for(const c of channels.slice(1)){
      expect(one.channels[c.id]).toEqual(before.channels[c.id]);
      expect(one.channels[c.id].scheduledUntil).toBe('2027-01-04');
      expect(one.channels[c.id].scheduledVideoCount).toBe(1);
    }
    expect(Object.keys(loadChannelRunwayStore(storage as any).channels)).toHaveLength(33);
  });

  it('persists scheduledUntil across restart-like reload',()=>{
    const storage=new MemoryStorage();
    const now=new Date('2026-09-02T08:00:00Z');
    upsertChannelRunwayFromYoutube(channel(),[scheduled('2026-12-01T04:00:00+07:00')],now,storage as any);
    const loaded=loadChannelRunwayStore(storage as any);
    expect(loaded.channels.neon.scheduledUntil).toBe('2026-12-01');
    const recalculated=recalculateChannelRunway([channel()],new Date('2026-09-03T08:00:00Z'),false,storage as any);
    expect(recalculated.channels.neon.scheduledUntil).toBe('2026-12-01');
    expect(recalculated.channels.neon.dataState).toBe('STALE_CACHE');
    expect(recalculated.channels.neon.runwayDays).toBeUndefined();
    expect(recalculated.channels.neon.status).toBe('no-data');
  });

  it('empty Existing Videos cache is no-data, not falsely ended',()=>{
    const storage=new MemoryStorage();
    storage.setItem('vyron:existing-cache:v1:neon',JSON.stringify({version:1,updatedAt:'2026-09-02T08:00:00Z',videos:[],baseline:{},syncInfo:null}));
    const result=recalculateChannelRunway([channel()],new Date('2026-09-02T08:00:00Z'),false,storage as any);
    expect(result.channels.neon.status).toBe('no-data');
    expect(result.channels.neon.runwayDays).toBeUndefined();
    expect(result.channels.neon.scheduledUntil).toBeUndefined();
  });

  it('uses Existing Videos baseline instead of unsaved local draft dates',()=>{
    const storage=new MemoryStorage();
    const baseline=scheduled('2026-10-01T04:00:00+07:00');
    const draft=scheduled('2026-12-01T04:00:00+07:00');
    storage.setItem('vyron:existing-cache:v1:neon',JSON.stringify({
      version:1,updatedAt:'2026-09-02T08:00:00Z',videos:[draft],baseline:{[baseline.id]:baseline},syncInfo:{complete:true}
    }));
    const result=recalculateChannelRunway([channel()],new Date('2026-09-02T08:00:00Z'),false,storage as any);
    expect(result.channels.neon.scheduledUntil).toBe('2026-10-01');
    expect(result.channels.neon.scheduledVideoCount).toBe(1);
    expect(result.channels.neon.dataState).toBe('PARTIAL_DATA');
    expect(result.channels.neon.runwayDays).toBeUndefined(); // Legacy positive is historical until owner Search proves coverage
  });

  it('explicit Channel Runway YouTube sync stays authoritative over opaque Existing Videos cache',()=>{
    const storage=new MemoryStorage();
    const now=new Date('2026-09-02T08:00:00Z');
    upsertChannelRunwayFromYoutube(channel(),[scheduled('2026-12-01T04:00:00+07:00')],now,storage as any);
    const stale=scheduled('2026-10-01T04:00:00+07:00');
    storage.setItem('vyron:existing-cache:v1:neon',JSON.stringify({version:1,videos:[stale],baseline:{[stale.id]:stale},syncInfo:{complete:true}}));
    const result=recalculateChannelRunway([channel()],new Date('2026-09-03T08:00:00Z'),false,storage as any);
    expect(result.channels.neon.scheduledUntil).toBe('2026-12-01');
    expect(result.channels.neon.dataState).toBe('STALE_CACHE');
    expect(result.channels.neon.runwayDays).toBeUndefined();
  });

  it('does not run before 06:00 Krasnoyarsk and runs at 06:00',()=>{
    const storage=new MemoryStorage();
    const before=new Date('2026-09-01T22:59:00Z');
    const atSix=new Date('2026-09-01T23:00:00Z');
    const initial=loadChannelRunwayStore(storage as any);
    expect(shouldRunDailyChannelRunway(initial,before)).toBe(false);
    expect(maybeRunDailyChannelRunway([channel()],before,storage as any)).toBe(false);
    expect(maybeRunDailyChannelRunway([channel()],atSix,storage as any)).toBe(true);
    const after=loadChannelRunwayStore(storage as any);
    expect(after.lastKrasnoyarskDate).toBe('2026-09-02');
    expect(shouldRunDailyChannelRunway(after,new Date('2026-09-02T08:00:00Z'))).toBe(false);
  });

  it('after a missed 06:00 run, next launch calculation runs locally once',()=>{
    const storage=new MemoryStorage();
    saveChannelRunwayStore({version:1,lastKrasnoyarskDate:'2026-09-01',channels:{}},storage as any);
    const launch=new Date('2026-09-02T02:00:00Z');
    expect(maybeRunDailyChannelRunway([channel()],launch,storage as any)).toBe(true);
    expect(maybeRunDailyChannelRunway([channel()],launch,storage as any)).toBe(false);
  });
});
