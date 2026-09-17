import React from 'react';
import {beforeEach,afterEach,describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {DashboardOS} from './DashboardOS';
import {CommandCenter} from './CommandCenter';
import {CHANNEL_RUNWAY_STORAGE_KEY,compareRunwayRecords} from './channelRunwayCore';
import {loadChannelRunwayStore} from './channelRunwayStore';
import {useApp} from './store';

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
        // channelName intentionally missing: this is the production crash fixture.
      }]
    }))
  };
}

beforeEach(()=>{
  storage=new MemoryStorage();
  (globalThis as any).localStorage=storage;
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
    expect(rows[0].channelName).toMatch(/^channel-/);
  });

  it('renders the actual CommandCenter component with a safe empty state instead of a blank screen',()=>{
    storage.setItem(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify({version:1,channels:{}}));
    const html=renderToStaticMarkup(<CommandCenter/>);
    expect(html).toContain('КОМАНДНЫЙ ЦЕНТР');
    expect(html).toContain('Нет активных каналов');
  });

  it('keeps the dashboard entry control and the autopilot route alias stable across five reopen cycles',()=>{
    const home=renderToStaticMarkup(<DashboardOS/>);
    expect(home).toContain('Командный центр');
    for(let i=0;i<5;i++){
      useApp.getState().setPage('autopilot');
      expect(useApp.getState().page).toBe('autopilot');
      useApp.getState().setPage('dashboard');
      expect(useApp.getState().page).toBe('dashboard');
    }
  });
});
