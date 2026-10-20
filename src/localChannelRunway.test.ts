import {describe,expect,it} from 'vitest';
import {calculateLocalChannelRunway,formatLocalCalendarDate} from './localChannelRunway';

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
