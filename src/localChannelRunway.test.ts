import {describe,expect,it} from 'vitest';
import {calculateLocalChannelRunway,compareLocalChannelRunwayPriority,formatLocalCalendarDate,type LocalChannelRunway} from './localChannelRunway';

const localDate=(year:number,month:number,day:number)=>new Date(year,month-1,day,12);
const label=(date:Date|null)=>date?formatLocalCalendarDate(date):null;

describe('local channel runway',()=>{
  const now=localDate(2026,10,20);

  it('extends a future YouTube schedule by one configured interval',()=>{
    const result=calculateLocalChannelRunway({now,youtubeScheduledThrough:localDate(2026,11,5),localVideoCount:1,publicationIntervalDays:3});
    expect(result.localStockDays).toBe(3);
    expect(label(result.coverageThrough)).toBe('08.11.2026');
    expect(result.totalRunwayDays).toBe(19)
  });

  it('extends a future YouTube schedule by every local video',()=>{
    const result=calculateLocalChannelRunway({now,youtubeScheduledThrough:localDate(2026,11,5),localVideoCount:2,publicationIntervalDays:2});
    expect(result.localStockDays).toBe(4);
    expect(label(result.coverageThrough)).toBe('09.11.2026');
    expect(result.totalRunwayDays).toBe(20)
  });

  it('starts local coverage today when YouTube has no future schedule',()=>{
    const result=calculateLocalChannelRunway({now,youtubeScheduledThrough:null,localVideoCount:5,publicationIntervalDays:3});
    expect(result.localStockDays).toBe(15);
    expect(label(result.coverageThrough)).toBe('04.11.2026');
    expect(result.totalRunwayDays).toBe(15)
  });

  it('keeps future YouTube coverage when local stock is zero',()=>{
    const result=calculateLocalChannelRunway({now,youtubeScheduledThrough:localDate(2026,11,8),localVideoCount:0,publicationIntervalDays:3});
    expect(result.localStockDays).toBe(0);
    expect(label(result.coverageThrough)).toBe('08.11.2026');
    expect(result.totalRunwayDays).toBe(19)
  });

  it('returns no coverage when both future YouTube and local stock are empty',()=>{
    const result=calculateLocalChannelRunway({now,youtubeScheduledThrough:null,localVideoCount:0,publicationIntervalDays:3});
    expect(result).toEqual({localStockDays:0,coverageThrough:null,totalRunwayDays:0})
  });

  it('never returns negative runway for an invalid local count',()=>{
    const result=calculateLocalChannelRunway({now,youtubeScheduledThrough:localDate(2026,10,19),localVideoCount:-4,publicationIntervalDays:3});
    expect(result).toEqual({localStockDays:0,coverageThrough:null,totalRunwayDays:0})
  });
});

describe('local channel runway priority',()=>{
  const now=localDate(2026,10,20);
  const row=(name:string,localRunway:LocalChannelRunway)=>({channel:{name},localRunway});
  const withRunway=(name:string,totalRunwayDays:number,coverageThrough:Date|null=null)=>row(name,{localStockDays:0,totalRunwayDays,coverageThrough});

  it('sorts total runway days in ascending order',()=>{
    const sorted=[19,3,45,0,17].map((days,index)=>withRunway(`Channel ${index}`,days)).sort(compareLocalChannelRunwayPriority);
    expect(sorted.map(item=>item.localRunway.totalRunwayDays)).toEqual([0,3,17,19,45])
  });

  it('prioritizes eight total days before nineteen regardless of runway source',()=>{
    const youtubeOnly=calculateLocalChannelRunway({now,youtubeScheduledThrough:localDate(2026,11,8),localVideoCount:0,publicationIntervalDays:1});
    const youtubePlusLocal=calculateLocalChannelRunway({now,youtubeScheduledThrough:localDate(2026,10,25),localVideoCount:1,publicationIntervalDays:3});
    const sorted=[row('A',youtubeOnly),row('B',youtubePlusLocal)].sort(compareLocalChannelRunwayPriority);
    expect(sorted.map(item=>[item.channel.name,item.localRunway.totalRunwayDays])).toEqual([['B',8],['A',19]])
  });

  it('uses coverage date then channel name as deterministic tie-breakers',()=>{
    const sorted=[
      withRunway('Zulu',10,localDate(2026,11,1)),
      withRunway('Beta',10,localDate(2026,10,30)),
      withRunway('Alpha',10,localDate(2026,10,30))
    ].sort(compareLocalChannelRunwayPriority);
    expect(sorted.map(item=>item.channel.name)).toEqual(['Alpha','Beta','Zulu'])
  });

  it('does not treat zero local videos with future YouTube coverage as zero runway',()=>{
    const futureYoutube=calculateLocalChannelRunway({now,youtubeScheduledThrough:localDate(2026,11,8),localVideoCount:0,publicationIntervalDays:3});
    const urgent=calculateLocalChannelRunway({now,youtubeScheduledThrough:localDate(2026,10,23),localVideoCount:0,publicationIntervalDays:3});
    const sorted=[row('Future YouTube',futureYoutube),row('Urgent',urgent)].sort(compareLocalChannelRunwayPriority);
    expect(sorted.map(item=>item.localRunway.totalRunwayDays)).toEqual([3,19])
  });

  it('puts a channel with no future YouTube or local stock first',()=>{
    const empty=calculateLocalChannelRunway({now,youtubeScheduledThrough:null,localVideoCount:0,publicationIntervalDays:3});
    const stocked=calculateLocalChannelRunway({now,youtubeScheduledThrough:null,localVideoCount:2,publicationIntervalDays:2});
    const sorted=[row('Stocked',stocked),row('Empty',empty)].sort(compareLocalChannelRunwayPriority);
    expect(sorted.map(item=>item.channel.name)).toEqual(['Empty','Stocked']);
    expect(sorted[0].localRunway.totalRunwayDays).toBe(0)
  });
});
