import {describe,expect,it} from 'vitest';
import type {Channel,VideoJob} from './types';
import type {ChannelRunwayRecord} from './channelRunwayCore';
import {
  addCalendarDays,
  buildAttentionItems,
  buildLocalBatchPlan,
  productionForecast,
  productionReadiness,
  recommendedWeeklyLoad
} from './commandCenterCore';
import {loadCommandCenterStore,saveBatchPlan} from './commandCenterStore';

class MemoryStorage{
  private map=new Map<string,string>();
  getItem(key:string){return this.map.get(key)??null}
  setItem(key:string,value:string){this.map.set(key,String(value))}
  removeItem(key:string){this.map.delete(key)}
}

const channel=(overrides:Partial<Channel>={}):Channel=>({
  id:'neon',name:'NEON',slug:'neon',cadenceDays:2,targetBufferDays:60,publishHour:4,publishMinute:0,
  language:'en',genre:'deep house',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
  seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]},
  ...overrides
});

const job=(n:number,overrides:Partial<VideoJob>={}):VideoJob=>({
  id:`job-${n}`,channelId:'neon',number:n,folder:`VIDEO_${String(n).padStart(3,'0')}`,status:'READY_UPLOAD',createdAt:'2026-09-02T00:00:00Z',
  tracksCount:10,minTracks:10,title:`Title ${n}`,description:'Description',tags:['deep house'],
  coverPath:`/covers/${n}.jpg`,finalPath:`/videos/${n}.mp4`,publishAt:`2026-09-${String(10+n).padStart(2,'0')}T04:00:00+07:00`,
  ...overrides
});

const runway=(days:number):ChannelRunwayRecord=>({
  channelId:'neon',channelName:'NEON',scheduledUntil:'2026-12-01',scheduledVideoCount:30,averagePublishIntervalDays:2,
  lastScheduleSync:'2026-09-02T08:00:00Z',lastLocalCalculation:'2026-09-02T08:00:00Z',runwayDays:days,nextProductionDate:'2026-10-17',
  priority:days<=14?'critical':'low',status:days<=14?'urgent':'large'
});

describe('Command Center local planning',()=>{
  it('creates 30-video batch after existing runway without API data',()=>{
    const plan=buildLocalBatchPlan(channel(),30,'2026-12-01',new Date('2026-09-02T08:00:00Z'));
    expect(plan.count).toBe(30);
    expect(plan.items[0].label).toBe('VIDEO_001');
    expect(plan.items[0].publishDate).toBe('2026-12-03');
    expect(plan.items[0].publishAt).toBe('2026-12-03T04:00:00+07:00');
    expect(plan.items[29].label).toBe('VIDEO_030');
    expect(plan.items[29].publishDate).toBe('2027-01-30');
  });

  it('calendar addition crosses month and year safely',()=>{
    expect(addCalendarDays('2026-12-31',2)).toBe('2027-01-02');
  });

  it('calculates local production readiness',()=>{
    const jobs=[job(1),job(2,{tags:[]}),job(3,{status:'ERROR'})];
    const ready=productionReadiness(channel(),jobs,3);
    expect(ready.videos).toBe(3);
    expect(ready.seo).toBe(2);
    expect(ready.readyToYoutube).toBe(1);
    expect(ready.errors).toBe(1);
  });

  it('builds attention from cached runway and local jobs',()=>{
    const items=buildAttentionItems([channel()],{neon:runway(10)},[job(1),job(2,{tags:[]})],30);
    expect(items.some(x=>x.severity==='critical'&&x.title.includes('10'))).toBe(true);
    expect(items.some(x=>x.title.includes('SEO не готово'))).toBe(true);
  });

  it('forecast is derived entirely from local state',()=>{
    const result=productionForecast([channel()],{neon:runway(10)},[job(1)],30,new Date('2026-09-02T08:00:00Z'));
    expect(result.channels).toBe(1);
    expect(result.dueNow).toBe(1);
    expect(result.critical).toBe(1);
    expect(result.readyToYoutube).toBe(1);
  });

  it('one channel every 3 days is about 2.3 channels per week',()=>{
    expect(recommendedWeeklyLoad(3)).toBe(2.3);
  });
});

describe('Command Center persistence',()=>{
  it('persists Smart Batch Builder plan in its own versioned store',()=>{
    const storage=new MemoryStorage();
    const plan=buildLocalBatchPlan(channel(),15,'2026-12-01',new Date('2026-09-02T08:00:00Z'));
    saveBatchPlan(plan,storage as any);
    const loaded=loadCommandCenterStore(storage as any);
    expect(loaded.version).toBe(1);
    expect(loaded.batchPlans.neon.count).toBe(15);
    expect(loaded.batchPlans.neon.items[14].label).toBe('VIDEO_015');
  });
});
