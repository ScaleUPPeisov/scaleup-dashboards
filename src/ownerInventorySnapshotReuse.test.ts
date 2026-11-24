import {afterEach,describe,expect,it,vi} from 'vitest';
import * as channelSchedule from './channelSchedule';
import {aggregateOwnerInventories,ownerInventoryFromVideos} from './youtubeOwnerInventory';
import type {Channel,YoutubeExistingVideo} from './types';

const now=Date.parse('2026-09-28T07:00:00Z');
const channel=(id:string,enabled=true):Channel=>({
 id,name:id,slug:id,cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,
 language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled,
 seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}
});
const video=(id:string,privacyStatus:string,patch:Partial<YoutubeExistingVideo>={}):YoutubeExistingVideo=>({
 id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus,selected:false,...patch
});
const snapshot=(id:string,complete:boolean)=>ownerInventoryFromVideos(id,[
 video('public','public'),video('scheduled','private',{publishAt:'2026-09-29T07:00:00Z'}),video('private','private')
],undefined,{scheduleComplete:complete},now);

afterEach(()=>vi.restoreAllMocks());
describe('reuse of owner inventory snapshots',()=>{
 it.each([33,200])('preserves totals for %i channels without re-reading inventories',count=>{
  const read=vi.spyOn(channelSchedule,'readAuthoritativeExistingSnapshot').mockReturnValue(undefined);
  const channels=Array.from({length:count},(_,i)=>channel(`c${i}`));
  const snapshots=new Map(channels.map((c,i)=>[c.id,snapshot(c.id,i%2===0)]));
  const result=aggregateOwnerInventories(channels,now,snapshots);
  expect(read).not.toHaveBeenCalled();
  expect(result).toMatchObject({availableChannels:count,completeChannels:Math.ceil(count/2),partialChannels:Math.floor(count/2),
   total:count*3,public:count,private:count,scheduled:count,unlisted:0,published:count,nextScheduledAt:'2026-09-29T07:00:00Z'});
 });
 it('keeps unavailable and disabled channels out of totals and reads a missing snapshot',()=>{
  const read=vi.spyOn(channelSchedule,'readAuthoritativeExistingSnapshot').mockReturnValue(undefined);
  const channels=[channel('available'),channel('missing'),channel('disabled',false)];
  const snapshots=new Map([['available',snapshot('available',false)],['disabled',snapshot('disabled',true)]]);
  const result=aggregateOwnerInventories(channels,now,snapshots);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith('missing');
  expect(result).toMatchObject({availableChannels:1,completeChannels:0,partialChannels:1,total:3,scheduled:1});
 });
});
