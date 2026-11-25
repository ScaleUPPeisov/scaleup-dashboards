import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ActivityEvent, VideoJob} from './types';
import {MAX_EVENTS,activityEvent,appendJournalEvent,appendJournalEvents} from './activityJournalCore';
import {createProductionScanLookup} from './productionScanLookup';
import {EMPTY_STATE,useApp} from './store';

const job=(id:string,status:VideoJob['status'],extra:Partial<VideoJob>={})=>({id,channelId:'fixture',number:1,status,tracksCount:0,minTracks:1,tags:[],...extra} as VideoJob);
const event=(eventId:string)=>activityEvent({eventId,eventType:'RENDER_COMPLETED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:'2026-01-01T00:00:00Z'});

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});

describe('production scan batched lookups',()=>{
 it('does not index jobs or the journal for an empty scan',()=>{
  let jobReads=0,eventReads=0;
  const jobs=[{get id(){jobReads++;return 'a'}} as VideoJob];
  const activityJournal=[{get eventId(){eventReads++;return 'event'}} as ActivityEvent];
  const lookup=createProductionScanLookup({jobs,activityJournal});
  expect(lookup.patches()).toEqual([]);expect(lookup.events()).toEqual([]);
  expect(jobReads).toBe(0);expect(eventReads).toBe(0);
  expect(lookup.job('a')).toBe(jobs[0]);expect(jobReads).toBeGreaterThan(0);expect(eventReads).toBe(0);
  expect(lookup.hasEvent('event')).toBe(true);expect(eventReads).toBeGreaterThan(0);
 });
 it('preserves the first matching job and applies later observations to its local state',()=>{
  const first=job('a','READY_RENDER'),duplicate=job('a','ERROR');
  const lookup=createProductionScanLookup({jobs:[first,duplicate],activityJournal:[]});
  expect(lookup.job('a')).toBe(first);
  expect(lookup.job('missing')).toBeUndefined();
  lookup.patchJob('a',{status:'RENDERING',error:undefined});
  expect(lookup.job('a')?.status).toBe('RENDERING');
  lookup.patchJob('a',{status:'READY_UPLOAD',finalPath:'/fixture/video.mp4'});
  expect(lookup.patches()).toEqual([{id:'a',patch:{status:'READY_UPLOAD',error:undefined,finalPath:'/fixture/video.mp4'}}]);
 });
 it('tracks duplicate journal IDs and oldest eviction exactly as sequential append',()=>{
  let reference=[event('duplicate'),event('duplicate'),...Array.from({length:MAX_EVENTS-2},(_,i)=>event(`old-${i}`))];
  const lookup=createProductionScanLookup({jobs:[],activityJournal:reference});
  for(const id of ['new-1','new-2','duplicate','old-0','new-3']){
   expect(lookup.hasEvent(id)).toBe(reference.some(e=>e.eventId===id));
   if(!lookup.hasEvent(id)){const entry=event(id);lookup.considerEvent(id,()=>entry);reference=appendJournalEvent(reference,entry)}
  }
  for(const id of ['duplicate','old-0','old-1','new-1','new-3'])expect(lookup.hasEvent(id)).toBe(reference.some(e=>e.eventId===id));
  expect(lookup.events().reduce(appendJournalEvent,[event('duplicate'),event('duplicate'),...Array.from({length:MAX_EVENTS-2},(_,i)=>event(`old-${i}`))])).toEqual(reference);
 });
 it('matches sequential state for repeated and duplicate job IDs while notifying job subscribers once',()=>{
  vi.useFakeTimers();vi.stubGlobal('window',{setTimeout,clearTimeout});
  const initial=[job('a','READY_RENDER'),job('a','ERROR',{error:'old'}),job('b','RENDERING'),job('c','SCHEDULED',{youtubeVideoId:'remote'})];
  const changes=[{id:'a',patch:{status:'RENDERING',error:undefined}},{id:'a',patch:{status:'READY_UPLOAD',finalPath:'/fixture/a.mp4'}},{id:'b',patch:{status:'ERROR',error:'fixture error'}},{id:'c',patch:{finalPath:'/fixture/c.mp4'}}] as Array<{id:string;patch:Partial<VideoJob>}>;
  const activities=[event('event-1'),event('event-2')];
  useApp.setState({...EMPTY_STATE,jobs:initial,activityJournal:[]});
  let writes=0;const unsubscribe=useApp.subscribe((next,previous)=>{if(next.jobs!==previous.jobs)writes++});
  for(const change of changes)useApp.getState().patchJob(change.id,change.patch);
  for(const entry of activities)useApp.getState().appendActivity(entry);
  const expectedJobs=useApp.getState().jobs,expectedJournal=useApp.getState().activityJournal,individualWrites=writes;
  unsubscribe();
  useApp.setState({...EMPTY_STATE,jobs:initial,activityJournal:[]});writes=0;
  const off=useApp.subscribe((next,previous)=>{if(next.jobs!==previous.jobs)writes++});
  const lookup=createProductionScanLookup(useApp.getState());
  for(const change of changes)lookup.patchJob(change.id,change.patch);
  for(const entry of activities)lookup.considerEvent(entry.eventId,()=>entry);
  useApp.getState().patchJobsBatch(lookup.patches());useApp.getState().appendActivities(lookup.events());
  expect(useApp.getState().jobs).toEqual(expectedJobs);
  expect(useApp.getState().activityJournal).toEqual(expectedJournal);
  expect(individualWrites).toBe(changes.length);expect(writes).toBe(1);
  off();
 });
 it('preserves events added by a synchronous job subscriber when the batch is flushed',()=>{
  vi.useFakeTimers();vi.stubGlobal('window',{setTimeout,clearTimeout});
  useApp.setState({...EMPTY_STATE,jobs:[job('a','READY_RENDER')],activityJournal:[]});
  let added=false;
  const off=useApp.subscribe((next,previous)=>{if(next.jobs!==previous.jobs&&!added){added=true;useApp.getState().appendActivity(event('subscriber'))}});
  const lookup=createProductionScanLookup(useApp.getState());
  lookup.patchJob('a',{status:'READY_UPLOAD',finalPath:'/fixture/a.mp4'});lookup.considerEvent('render',()=>event('render'));
  useApp.getState().patchJobsBatch(lookup.patches());useApp.getState().appendActivities(lookup.events(useApp.getState().activityJournal));
  expect(useApp.getState().activityJournal.map(x=>x.eventId)).toEqual(['subscriber','render']);
  off();
 });
 it('does not overwrite a same-ID event inserted by a synchronous subscriber',()=>{
  const lookup=createProductionScanLookup({jobs:[],activityJournal:[]});
  lookup.considerEvent('render',()=>event('render'));
  const subscriber={...event('render'),details:{owner:'subscriber'}};
  expect(lookup.events([subscriber])).toEqual([]);
 });
 it('rechecks previously present events after subscriber-driven eviction',()=>{
  const original=[event('old'),...Array.from({length:MAX_EVENTS-1},(_,i)=>event(`keep-${i}`))];
  const lookup=createProductionScanLookup({jobs:[],activityJournal:original});
  lookup.considerEvent('old',()=>event('old'));
  expect(lookup.events()).toEqual([]);
  const current=appendJournalEvent(original,event('subscriber'));
  expect(lookup.events(current).map(x=>x.eventId)).toEqual(['old']);
 });
 it('batch journal append matches sequential normalization, replacement and eviction',()=>{
  const initial=[event('same'),event('same'),...Array.from({length:MAX_EVENTS-2},(_,i)=>event(`old-${i}`))];
  const incoming=[event('new-1'),event('new-2'),event('same'),event('old-0'),event('new-3'),event('new-1')];
  expect(appendJournalEvents(initial,incoming)).toEqual(incoming.reduce(appendJournalEvent,initial));
  const invalid={eventId:'bad',eventType:'INVALID'} as unknown as ActivityEvent;
  expect(appendJournalEvents(initial,[invalid])).toBe(initial);
  for(let scenario=0;scenario<30;scenario++){
   const start=Array.from({length:15},(_,i)=>event(`id-${(i*7+scenario)%9}`));
   const more=Array.from({length:40},(_,i)=>event(`id-${(i*11+scenario)%19}`));
   expect(appendJournalEvents(start,more)).toEqual(more.reduce(appendJournalEvent,start));
  }
 });
});
