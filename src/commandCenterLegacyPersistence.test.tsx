import React from 'react';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CommandCenter} from './CommandCenter';
import {CHANNEL_RUNWAY_STORAGE_KEY,deriveRunwayRecord} from './channelRunwayCore';
import {existingCacheKey,getChannelScheduleState,readExistingCache} from './channelSchedule';
import {readProductionPrefs} from './productionPrefs';
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

function channel(i:number):Channel{
  return{
    id:`channel-${i+1}`,
    name:`Channel ${String(i+1).padStart(2,'0')}`,
    slug:`channel-${i+1}`,
    cadenceDays:4,targetBufferDays:60,publishHour:18,publishMinute:0,
    language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
    seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:['music'],banned:[]}
  };
}

function seedLegacyCaches(channels:Channel[]){
  const variants:unknown[]=[
    {version:1},
    {version:1,videos:null,baseline:null,lastUndo:null},
    {version:1,videos:{bad:true},baseline:'legacy',lastUndo:{}},
    {version:1,videos:'legacy',baseline:[],lastUndo:'legacy'},
    {version:1,videos:[null],baseline:{broken:null},lastUndo:[null]},
    {version:1,videos:[{id:'legacy-partial'}],baseline:{'legacy-base':{id:'legacy-base'}},lastUndo:[{id:'undo-partial'}]},
    {version:1,videos:[undefined,3,false,{},'text',{id:'ok',publishAt:'2030-01-01T10:00:00Z',privacyStatus:'private'}],baseline:{ok:{id:'ok',privacyStatus:'private'}},lastUndo:[1,'bad']}
  ];
  channels.forEach((c,i)=>storage.setItem(existingCacheKey(c.id),JSON.stringify(variants[i%variants.length])));
  storage.setItem(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify({
    version:1,
    channels:Object.fromEntries(channels.map((c,i)=>[c.id,{channelId:c.id,channelName:i%3?undefined:null,scheduledVideoCount:i%4?0:undefined,status:i%5?'no-data':undefined,priority:'unknown'}]))
  }));
  storage.setItem('vyron:production-manager:v2',JSON.stringify({
    version:2,
    selectedChannelId:17,
    tab:'legacy-tab',
    byChannel:{
      [channels[0].id]:{projectCount:'many',tracksPerProject:null,mode:'legacy',selectedProjectIds:'bad',productionRoot:12},
      [channels[1].id]:null
    },
    selectedJobIds:'legacy',
    productionRoot:{bad:true}
  }));
}

beforeEach(()=>{
  storage=new MemoryStorage();
  (globalThis as any).localStorage=storage;
  const channels=Array.from({length:31},(_,i)=>channel(i));
  seedLegacyCaches(channels);
  useApp.setState({
    ...EMPTY_STATE,
    page:'autopilot',
    booted:true,
    channels,
    jobs:[
      {id:'legacy-job-1',channelId:channels[0].id,title:123,description:null,tags:{bad:true},tracksCount:'bad',minTracks:null,status:'READY_UPLOAD',publishAt:4,finalPath:9} as any,
      {id:'legacy-job-2',channelId:channels[1].id,title:'ok',description:'ok',tags:['music'],tracksCount:10,minTracks:10,status:'READY_UPLOAD',publishAt:'2030-01-01T10:00:00Z',finalPath:'/tmp/video.mp4'} as any
    ]
  } as any);
});

afterEach(()=>{
  if(realStorage===undefined)delete (globalThis as any).localStorage;
  else (globalThis as any).localStorage=realStorage;
  useApp.setState({...EMPTY_STATE,page:'dashboard',booted:false} as any);
});

describe('Command Center legacy persisted-data acceptance',()=>{
  it('normalizes every legacy existing-cache shape before schedule derivation',()=>{
    const channels=useApp.getState().channels;
    for(const c of channels){
      const cache=readExistingCache(c.id);
      expect(cache?.version).toBe(1);
      expect(Array.isArray(cache?.videos)).toBe(true);
      expect(Array.isArray(cache?.lastUndo)).toBe(true);
      expect(cache?.baseline&&typeof cache.baseline==='object'&&!Array.isArray(cache.baseline)).toBe(true);
      expect(()=>getChannelScheduleState(c.id,c)).not.toThrow();
    }
  });

  it('renders the real CommandCenter with all 31 channels and malformed legacy persisted state',()=>{
    const html=renderToStaticMarkup(<CommandCenter/>);
    expect(html).toContain('КОМАНДНЫЙ ЦЕНТР');
    expect((html.match(/commandChannelRow/g)||[])).toHaveLength(31);
    expect(html).not.toContain('Ошибка интерфейса');
  });

  it('normalizes partial production preferences used by Command Center',()=>{
    const prefs=readProductionPrefs();
    expect(prefs.version).toBe(2);
    expect(prefs.tab).toBe('queue');
    expect(prefs.selectedChannelId).toBeUndefined();
    expect(Array.isArray(prefs.selectedJobIds)).toBe(true);
    expect(prefs.byChannel['channel-1'].projectCount).toBe(30);
    expect(prefs.byChannel['channel-1'].tracksPerProject).toBe(15);
    expect(prefs.byChannel['channel-1'].mode).toBe('even');
    expect(prefs.byChannel['channel-1'].selectedProjectIds).toEqual([]);
  });

  it('ignores malformed runway video rows instead of throwing',()=>{
    const c=useApp.getState().channels[0];
    expect(()=>deriveRunwayRecord(c,[null,undefined,'legacy',3,{}, {privacyStatus:'private',publishAt:'2030-01-01T10:00:00Z'}] as any)).not.toThrow();
    const result=deriveRunwayRecord(c,[null,{privacyStatus:'private',publishAt:'2030-01-01T10:00:00Z'}] as any,new Date('2026-09-17T00:00:00Z'));
    expect(result.scheduledVideoCount).toBe(1);
  });
});
