import {describe,expect,it} from 'vitest';
import {deriveChannelScheduleState,toKratLocalInput} from './channelSchedule';
import {buildExistingScheduleFromLocal} from './youtubeExisting';
import type {Channel,YoutubeExistingVideo} from './types';
const channel:Channel={id:'riviera',name:'Riviera Sax Club',slug:'riviera',cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Sax',country:'FR',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}};
const v=(id:string,publishAt?:string):YoutubeExistingVideo=>({id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus:'private',publishAt,selected:false});
describe('channel schedule continuation',()=>{
 it('continues 13 Sep on 15 Sep for two-day cadence',()=>{const rows=['01','03','05','07','09','11','13'].map((d,i)=>v(String(i),`2026-09-${d}T18:00:00+07:00`));const s=deriveChannelScheduleState(channel,rows);expect(s.scheduledUntil).toBe('2026-09-13');expect(s.nextAvailableAt).toBe('2026-09-15T18:00:00+07:00')});
 it('respects an already occupied 15 Sep and continues on 17 Sep',()=>{const rows=[v('a','2026-09-13T18:00:00+07:00'),v('b','2026-09-15T18:00:00+07:00')];expect(deriveChannelScheduleState(channel,rows).nextAvailableAt).toBe('2026-09-17T18:00:00+07:00')});
 it('34 videos after 13 Sep end on 20 Nov',()=>{const state=deriveChannelScheduleState(channel,[v('old','2026-09-13T18:00:00+07:00')]);const videos=Array.from({length:34},(_,i)=>v(`n${i}`));const plan=buildExistingScheduleFromLocal(videos,toKratLocalInput(state.nextAvailableAt),2,[]);expect(plan[0].publishAt).toBe('2026-09-15T11:00:00.000Z');expect(plan[plan.length-1]?.publishAt).toBe('2026-11-20T11:00:00.000Z')});
 it('fallback time is KRAT even when Mac timezone differs',()=>{const plan=buildExistingScheduleFromLocal([v('x')],'2026-09-15T18:00',2,[]);expect(plan[0].publishAt).toBe('2026-09-15T11:00:00.000Z')});
});
