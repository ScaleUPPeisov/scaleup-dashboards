import {describe,expect,it} from 'vitest';
import type {Channel,YoutubeExistingVideo} from './types';
import {
  calendarDaysBetween,
  deriveRunwayRecord,
  krasnoyarskClock,
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
  it('persists scheduledUntil across restart-like reload',()=>{
    const storage=new MemoryStorage();
    const now=new Date('2026-09-02T08:00:00Z');
    upsertChannelRunwayFromYoutube(channel(),[scheduled('2026-12-01T04:00:00+07:00')],now,storage as any);
    const loaded=loadChannelRunwayStore(storage as any);
    expect(loaded.channels.neon.scheduledUntil).toBe('2026-12-01');
    const recalculated=recalculateChannelRunway([channel()],new Date('2026-09-03T08:00:00Z'),false,storage as any);
    expect(recalculated.channels.neon.scheduledUntil).toBe('2026-12-01');
    expect(recalculated.channels.neon.runwayDays).toBe(89);
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
    expect(result.channels.neon.runwayDays).toBe(29);
  });

  it('explicit Channel Runway YouTube sync stays authoritative over opaque Existing Videos cache',()=>{
    const storage=new MemoryStorage();
    const now=new Date('2026-09-02T08:00:00Z');
    upsertChannelRunwayFromYoutube(channel(),[scheduled('2026-12-01T04:00:00+07:00')],now,storage as any);
    const stale=scheduled('2026-10-01T04:00:00+07:00');
    storage.setItem('vyron:existing-cache:v1:neon',JSON.stringify({version:1,videos:[stale],baseline:{[stale.id]:stale},syncInfo:{complete:true}}));
    const result=recalculateChannelRunway([channel()],new Date('2026-09-03T08:00:00Z'),false,storage as any);
    expect(result.channels.neon.scheduledUntil).toBe('2026-12-01');
    expect(result.channels.neon.runwayDays).toBe(89);
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
