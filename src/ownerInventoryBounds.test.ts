import {describe,expect,it,vi} from 'vitest';
import type {YoutubeExistingVideo} from './types';
import {ownerInventoryFromVideos} from './youtubeOwnerInventory';

const row=(id:string,privacyStatus:string,publishAt?:string,publishedAt?:string)=>({id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus,selected:false,publishAt,publishedAt} as YoutubeExistingVideo);

describe('owner inventory scheduled bounds',()=>{
 it('matches stable chronological sorting with equal timestamps, offsets and invalid dates',()=>{
  const now=Date.parse('2026-01-01T00:00:00Z');
  const values=['invalid','2026-02-01T00:00:00Z','2026-02-01T07:00:00+07:00','2025-12-31T00:00:00Z',undefined,'2026-03-01T00:00:00Z','2026-03-01T07:00:00+07:00'];
  const rows=[...values.map((value,index)=>row(String(index),'private',value)),row('public','public',undefined,'2026-01-01T01:00:00Z'),row('unlisted','unlisted')];
  const expected=values.filter((value):value is string=>Boolean(value)&&Number.isFinite(Date.parse(value!))&&Date.parse(value!)>now).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const result=ownerInventoryFromVideos('fixture',rows,'snapshot',{scheduleComplete:true},now);
  expect(result).toMatchObject({available:true,complete:true,updatedAt:'snapshot',total:rows.length,scheduled:expected.length,private:values.length-expected.length,public:1,unlisted:1,published:2,nextScheduledAt:expected[0],lastScheduledAt:expected.at(-1)});
  expect(result.nextScheduledAt).toBe('2026-02-01T00:00:00Z');
  expect(result.lastScheduledAt).toBe('2026-03-01T07:00:00+07:00');
  expect(values[0]).toBe('invalid');
 });
 it('processes a large schedule in linear date parsing while preserving exact endpoints',()=>{
  const now=Date.parse('2026-01-01T00:00:00Z');
  const rows=Array.from({length:6000},(_,i)=>row(String(i),'private',new Date(now+((i*7919)%6000+1)*86400000).toISOString()));
  const expected=rows.map(x=>x.publishAt!).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const parse=vi.spyOn(Date,'parse');
  try{
   const result=ownerInventoryFromVideos('fixture',rows,undefined,{scheduleComplete:false},now);
   expect(result.scheduled).toBe(rows.length);expect(result.complete).toBe(false);
   expect(result.nextScheduledAt).toBe(expected[0]);expect(result.lastScheduledAt).toBe(expected.at(-1));
   expect(parse.mock.calls.length).toBeLessThanOrEqual(rows.length+2);
  }finally{parse.mockRestore()}
 });
});
