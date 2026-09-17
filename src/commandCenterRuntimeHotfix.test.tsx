import React from 'react';
import {beforeEach,afterEach,describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CommandCenter} from './CommandCenter';
import {CHANNEL_RUNWAY_STORAGE_KEY,compareRunwayRecords} from './channelRunwayCore';
import {loadChannelRunwayStore} from './channelRunwayStore';
import {existingCacheKey,getChannelScheduleState,readExistingCache} from './channelSchedule';
import {EMPTY_STATE,useApp} from './store';
import type {Channel} from './types';

class MemoryStorage{
  private map=new Map<string,string>();
  getItem(key:string){return this.map.get(key)??null}
  setItem(key:string,value:string){this.map.set(key,String(value))}
  removeItem(key:string){this.map.delete(key)}
  clear(){this.map.clear()}
  key(index:number){return [...this.map.keys()][index]??null}
  get length(){return this.map.size}
}

const realStorage=(globalThis as any).localStorage;
let storage:MemoryStorage;

function legacyRunway(count:number){
  return {
    version:1,
    channels:Object.fromEntries(Array.from({length:count},(_,i)=>{
      const id=`channel-${i+1}`;
      return[id,{
        channelId:id,
        scheduledVideoCount:i%3===0?undefined:0,
        lastLocalCalculation:i%4===0?undefined:'2026-09-01T00:00:00.000Z',
        priority:i%5===0?undefined:'unknown',
        status:i%6===0?undefined:'no-data'
      }]
    }))
  };
}

function channels31():Channel[]{
  return Array.from({length:31},(_,i)=>({
    id:`channel-${i+1}`,name:`Channel ${String(i+1).padStart(2,'0')}`,slug:`channel-${i+1}`,
    cadenceDays:4,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
    youtubeProfileId:`profile-${i+1}`,youtubeChannelId:`youtube-${i+1}`,
    seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:['music'],banned:[]}
  }));
}

const malformedCaches:unknown[]=[
  {version:1,updatedAt:'2026-09-01T00:00:00.000Z'},
  {version:1,videos:null,baseline:null,lastUndo:null},
  {version:1,videos:{},baseline:'legacy',lastUndo:{}},
  {version:1,videos:'legacy',baseline:[],lastUndo:'legacy'},
  {version:1,videos:[null],baseline:{bad:null},lastUndo:[null]},
  {version:1,videos:[{partial:'legacy'}],baseline:{bad:{partial:'legacy'}},lastUndo:[{partial:'legacy'}]},
  {version:1,videos:[{id:'ok-1',publishAt:'2026-10-01T11:00:00.000Z',privacyStatus:'private'}],baseline:{'ok-1':{id:'ok-1',privacyStatus:'private'}},lastUndo:[{id:'ok-1'}],syncInfo:'legacy'}
];

beforeEach(()=>{
  storage=new MemoryStorage();
  (globalThis as any).localStorage=storage;
  useApp.getState().hydrate({...EMPTY_STATE,channels:channels31(),jobs:[]});
  useApp.getState().setPage('dashboard');
});

afterEach(()=>{
  if(realStorage===undefined)delete (globalThis as any).localStorage;
  else (globalThis as any).localStorage=realStorage;
});

describe('Command Center production black-screen regression',()=>{
  it('normalizes 31 malformed legacy runway records before Command Center sorting can call localeCompare',()=>{
    storage.setItem(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify(legacyRunway(31)));
    const loaded=loadChannelRunwayStore(storage as any);
    const rows=Object.values(loaded.channels);
    expect(rows).toHaveLength(31);
    expect(rows.every(x=>typeof x.channelName==='string'&&x.channelName.length>0)).toBe(true);
    expect(rows.every(x=>Number.isFinite(x.scheduledVideoCount))).toBe(true);
    expect(()=>rows.sort(compareRunwayRecords)).not.toThrow();
  });

  it('normalizes exact legacy existing-cache shapes and never exposes malformed videos/baseline/lastUndo',()=>{
    const channels=channels31();
    channels.forEach((channel,i)=>storage.setItem(existingCacheKey(channel.id),JSON.stringify(malformedCaches[i%malformedCaches.length])));
    for(const channel of channels){
      const cache=readExistingCache(channel.id);
      expect(cache).toBeDefined();
      expect(Array.isArray(cache!.videos)).toBe(true);
      expect(Array.isArray(cache!.lastUndo)).toBe(true);
      expect(cache!.baseline&&typeof cache!.baseline==='object'&&!Array.isArray(cache!.baseline)).toBe(true);
      expect(cache!.videos.every(v=>typeof v.id==='string'&&Array.isArray(v.tags))).toBe(true);
    }
  });

  it('derives all 31 channel schedule rows safely from mixed malformed legacy caches',()=>{
    storage.setItem(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify(legacyRunway(31)));
    storage.setItem('vyron:production-manager:v2',JSON.stringify({version:2,selectedChannelId:7,tab:'legacy',selectedJobIds:'bad',byChannel:{'channel-1':null,'channel-2':'legacy','channel-3':{projectCount:'30',tracksPerProject:null,selectedProjectIds:'bad',mode:'legacy'}}}));
    const channels=channels31();
    channels.forEach((channel,i)=>storage.setItem(existingCacheKey(channel.id),JSON.stringify(malformedCaches[i%malformedCaches.length])));
    const states=channels.map(channel=>getChannelScheduleState(channel.id,channel));
    expect(states).toHaveLength(31);
    expect(states.every(x=>x.channelId&&Number.isFinite(x.scheduledCount))).toBe(true);
    expect(states.every(x=>x.scheduledCount>=0)).toBe(true);
  });

  it('keeps the real application page state stable through ten reopen cycles and route returns',()=>{
    for(let i=0;i<10;i++){
      useApp.getState().setPage('dashboard');
      expect(useApp.getState().page).toBe('dashboard');
      useApp.getState().setPage('autopilot');
      expect(useApp.getState().page).toBe('autopilot');
    }
    useApp.getState().setPage('channels');
    expect(useApp.getState().page).toBe('channels');
    useApp.getState().setPage('autopilot');
    expect(useApp.getState().page).toBe('autopilot');
    useApp.getState().setPage('production');
    expect(useApp.getState().page).toBe('production');
    useApp.getState().setPage('autopilot');
    expect(useApp.getState().page).toBe('autopilot');
  });

  it('keeps direct CommandCenter safe with empty persisted state',()=>{
    storage.setItem(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify({version:1,channels:{}}));
    useApp.getState().hydrate({...EMPTY_STATE,channels:[],jobs:[]});
    const html=renderToStaticMarkup(<CommandCenter/>);
    expect(html).toContain('КОМАНДНЫЙ ЦЕНТР');
    expect(html).toContain('Нет активных каналов');
  });
});
