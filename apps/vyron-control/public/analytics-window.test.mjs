import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsDateWindow,analyticsWindowCoverage} from './analytics-window.mjs';
test('daily windows use calendar dates ending two UTC days before now',()=>{
 const now=new Date('2026-11-18T10:00:00Z');
 assert.deepEqual(analyticsDateWindow(7,now),{
  start:'2026-11-10',end:'2026-11-16',days:7,
  source:'YOUTUBE_ANALYTICS_API_DAILY',reportDelayDays:2});
 assert.equal(analyticsDateWindow(28,now).start,'2026-10-20');
 assert.equal(analyticsDateWindow(90,now).end,'2026-11-16');
});
test('incomplete channel/day coverage is not misrepresented as full period',()=>{
 const now=new Date('2026-11-18T10:00:00Z'),window=analyticsDateWindow(7,now);
 const channels=[{analytics:{source:'GOOGLE_ANALYTICS_API',daily:[
  {date:'2026-11-10',views:1},{date:'2026-11-16',views:5}
 ]}}];
 assert.deepEqual(analyticsWindowCoverage(channels,window),{complete:0,withRows:1,total:1});
 assert.equal(analyticsWindowCoverage([],window).complete,0);
});
