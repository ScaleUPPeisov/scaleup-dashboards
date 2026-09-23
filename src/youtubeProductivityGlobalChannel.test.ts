import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Channel} from './types';

const __storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return __storage.size},clear(){__storage.clear()},getItem(k:string){return __storage.has(k)?__storage.get(k)!:null},key(i:number){return Array.from(__storage.keys())[i]??null},removeItem(k:string){__storage.delete(k)},setItem(k:string,v:string){__storage.set(k,String(v))}}});
const storeFixture=vi.hoisted(()=>({channels:[] as Channel[],jobs:[] as any[]}));
vi.mock('./store',()=>({useApp:Object.assign((selector:(state:typeof storeFixture)=>unknown)=>selector(storeFixture),{getState:()=>storeFixture})}));
import {filterYoutubeChannels,resolveYoutubeActiveChannel,YouTubeChannelBar} from './YouTubeChannelBar';
import {loadActivePublishChannel,loadRecentPublishChannels,saveActivePublishChannel} from './publishWorkspaceState';

const channel=(id:string,name:string):Channel=>({id,name,slug:name.toLowerCase().replace(/\s+/g,'-'),cadenceDays:2,targetBufferDays:60,publishHour:4,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,youtubeProfileId:`profile-${id}`,youtubeChannelId:`UC-${id}`,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}});

describe('VYRON 3.1 global YouTube channel context bar',()=>{
 beforeEach(()=>{localStorage.clear();storeFixture.channels=[];storeFixture.jobs=[]});
 it('TEST 1/2 — global selector exists and exposes all 31 connected channels',()=>{storeFixture.channels=Array.from({length:31},(_,i)=>channel(`c${i+1}`,i===7?'ELARA':`Channel ${i+1}`));saveActivePublishChannel('c8');const html=renderToStaticMarkup(React.createElement(YouTubeChannelBar));expect(html).toContain('aria-label="Активный YouTube-канал"');expect((html.match(/<option/g)||[]).length).toBe(32);expect(html).toContain('ELARA')});
 it('TEST 3 — search ELA resolves ELARA by name without losing channel identity',()=>{const channels=[channel('lost','Lost Highway FM'),channel('elara','ELARA')];expect(filterYoutubeChannels(channels,'ELA').map(x=>x.id)).toEqual(['elara']);expect(filterYoutubeChannels(channels,'uc-elara').map(x=>x.id)).toEqual(['elara'])});
 it('TEST 4/5/6/7 — one persisted active channel is the same source of truth for every remount/tab context',()=>{const channels=[channel('lost','Lost Highway FM'),channel('elara','ELARA')];saveActivePublishChannel('elara');expect(loadActivePublishChannel()).toBe('elara');for(const _tab of ['metadata','schedule','uploaded','calendar'])expect(resolveYoutubeActiveChannel(channels,loadActivePublishChannel())).toBe('elara');expect(resolveYoutubeActiveChannel(channels,loadActivePublishChannel())).toBe('elara')});
 it('TEST 8 — recent channels are safe IDs only, de-duplicated and capped at five',()=>{for(const id of ['a','b','c','d','e','f','c'])saveActivePublishChannel(id);expect(loadRecentPublishChannels()).toEqual(['c','f','e','d','b']);const payload=localStorage.getItem('vyron:youtube-recent-channels:v1')||'';expect(payload).not.toContain('token');expect(payload).not.toContain('secret')});
 it('invalid persisted id falls back to the first real channel',()=>{const channels=[channel('a','A'),channel('b','B')];expect(resolveYoutubeActiveChannel(channels,'missing')).toBe('a')});
});
