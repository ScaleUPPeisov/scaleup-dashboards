import {describe,expect,it} from 'vitest';
import type {Channel,YoutubeExistingVideo} from './types';
import {aggregateOwnerInventories,ownerInventoryFromVideos} from './youtubeOwnerInventory';

const video=(id:string,privacyStatus:string,patch:Partial<YoutubeExistingVideo>={}):YoutubeExistingVideo=>({
  id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus,selected:false,...patch
});
const channel=(id:string):Channel=>({
 id,name:id,slug:id,cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
 seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}
});

describe('VYRON 4.0.0 owner-visible YouTube inventory',()=>{
 it('separates private, scheduled, public and unlisted using real YouTube state only',()=>{
   const now=Date.parse('2026-09-28T07:00:00Z');
   const rows=[
     video('private','private'),
     video('scheduled','private',{publishAt:'2026-09-29T07:00:00Z'}),
     video('public','public',{publishedAt:'2026-09-28T06:00:00Z'}),
     video('unlisted','unlisted')
   ];
   const x=ownerInventoryFromVideos('c1',rows,'2026-09-28T07:00:00Z',{scheduleComplete:true},now);
   expect(x.total).toBe(4);expect(x.private).toBe(1);expect(x.scheduled).toBe(1);expect(x.public).toBe(1);expect(x.unlisted).toBe(1);
   expect(x.published).toBe(2);expect(x.complete).toBe(true);expect(x.nextScheduledAt).toBe('2026-09-29T07:00:00Z')
 });
 it('does not invent scheduled videos from local stock or queue',()=>{
   const x=ownerInventoryFromVideos('c1',[video('private','private')],undefined,{scheduleComplete:true},Date.parse('2026-09-28T07:00:00Z'));
   expect(x.scheduled).toBe(0);expect(x.private).toBe(1)
 });
 it('marks incomplete YouTube inventory as partial instead of pretending certainty',()=>{
   const x=ownerInventoryFromVideos('c1',[video('private','private')],undefined,{scheduleComplete:false},Date.parse('2026-09-28T07:00:00Z'));
   expect(x.complete).toBe(false)
 });
});
