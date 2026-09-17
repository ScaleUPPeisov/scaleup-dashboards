import { describe,it,expect } from 'vitest';
import { deficit,generateMetadata,nextPublishSlots,priorityFor,requiredVideos,slugify } from '../src/core';
import type { Channel,VideoJob } from '../src/types';
const c:Channel={id:'c1',name:'NEON',slug:'neon',cadenceDays:4,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Deep House',country:'France',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:['{topic} — Mix {number}'],descriptionTemplate:'{title} / {genre}',tags:['deep house','night drive'],banned:['bad']}};
const job=(n:number):VideoJob=>({id:String(n),channelId:'c1',number:n,folder:'',status:'NEED_IMAGE',createdAt:new Date().toISOString(),tracksCount:0,minTracks:10,title:'',description:'',tags:[]});
describe('planner',()=>{
  it('calculates 15 videos for 60 days at every 4 days',()=>expect(requiredVideos(c)).toBe(15));
  it('calculates exact deficit',()=>expect(deficit(c,[job(1),job(2)])).toBe(13));
  it('never returns negative deficit',()=>expect(deficit(c,Array.from({length:20},(_,i)=>job(i+1)))).toBe(0));
  it('assigns priority bands',()=>{expect(priorityFor(0)).toBe('red');expect(priorityFor(14)).toBe('orange');expect(priorityFor(30)).toBe('yellow');expect(priorityFor(45)).toBe('green')});
  it('creates cadence slots',()=>{const slots=nextPublishSlots(c,[],3,new Date('2026-08-27T10:00:00Z'));expect(slots).toHaveLength(3);expect((new Date(slots[1]).getTime()-new Date(slots[0]).getTime())/86400000).toBe(4)});
});
describe('metadata',()=>{
  it('uses channel template and filters banned tags',()=>{const x=generateMetadata({...c,seo:{...c.seo,tags:['deep house','bad keyword']}},31,'Midnight Drive');expect(x.title).toContain('Midnight Drive');expect(x.title).toContain('031');expect(x.tags.join(' ')).not.toContain('bad')});
  it('slugifies unsafe names',()=>expect(slugify('  Neon / Night !!! ')).toBe('neon-night'));
});
