#!/usr/bin/env python3
from pathlib import Path
import json,re

VERSION='1.0.14'
def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.14 pattern: '+msg)

# Version bump from exact 1.0.13 release source.
p=Path('package.json');x=json.loads(p.read_text());must(x.get('version')=='1.0.13','expected package 1.0.13');x['version']=VERSION;p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/tauri.conf.json');x=json.loads(p.read_text());must(x.get('version')=='1.0.13','expected tauri 1.0.13');x['version']=VERSION;p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/Cargo.toml');s=p.read_text();must('version = "1.0.13"' in s,'expected Cargo 1.0.13');p.write_text(s.replace('version = "1.0.13"','version = "1.0.14"',1))
p=Path('package-lock.json')
if p.exists():
    x=json.loads(p.read_text())
    if x.get('version')=='1.0.13':x['version']=VERSION
    if isinstance(x.get('packages'),dict) and isinstance(x['packages'].get(''),dict) and x['packages'][''].get('version')=='1.0.13':x['packages']['']['version']=VERSION
    p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')

# Channel-level backward-compatible persistence fields.
p=Path('src/types.ts');s=p.read_text()
old='''  id:string; name:string; slug:string; cadenceDays:number; targetBufferDays:number;
  publishHour:number; publishMinute:number; language:string; genre:string; country:string;'''
new='''  id:string; name:string; slug:string; cadenceDays:number; targetBufferDays:number;
  scheduleMode?:'interval'|'pattern'; publishIntervalDays?:number; publishDays?:number; pauseDays?:number; patternAnchorDate?:string;
  publishHour:number; publishMinute:number; language:string; genre:string; country:string;'''
must(old in s,'Channel schedule field marker missing');s=s.replace(old,new,1);p.write_text(s)

# Replace the 1.0.13 schedule domain with a strategy-aware calendar engine.
Path('src/channelSchedule.ts').write_text(r'''import type {Channel,YoutubeExistingVideo} from './types';
export type ExistingCache={version:1;updatedAt:string;videos:YoutubeExistingVideo[];baseline:Record<string,YoutubeExistingVideo>;lastUndo:YoutubeExistingVideo[];syncInfo:any};
export type ScheduleMode='interval'|'pattern';
export type SchedulePattern={publishDays:number;pauseDays:number;anchorDate:string};
export type ChannelScheduleState={channelId:string;lastPublishedAt?:string;lastScheduledAt?:string;nextAvailableAt?:string;scheduledUntil?:string;scheduleMode:ScheduleMode;publishIntervalDays:number;publishDays:number;pauseDays:number;patternAnchorDate?:string;defaultPublishTime:string;scheduledCount:number;updatedAt?:string};
export type PatternCalendarDay={date:string;kind:'video'|'pause'|'occupied';publishSlot:boolean;occupied:boolean};
const EVENT='vyron-channel-schedule-changed';
export const existingCacheKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;
export function readExistingCache(channelId:string):ExistingCache|undefined{if(!channelId)return;try{const x=JSON.parse(localStorage.getItem(existingCacheKey(channelId))||'null');return x?.version===1?x:undefined}catch{return}}
export function writeExistingCache(channelId:string,x:ExistingCache){if(!channelId)return;try{localStorage.setItem(existingCacheKey(channelId),JSON.stringify(x));window.dispatchEvent(new CustomEvent(EVENT,{detail:{channelId,updatedAt:x.updatedAt}}))}catch{}}
const cloneVideo=(v:YoutubeExistingVideo)=>({...v,tags:[...(v.tags||[])]});
export function replaceExistingCacheFromSync(channelId:string,videos:YoutubeExistingVideo[],syncInfo:any){const rows=videos.map(cloneVideo),baseline=Object.fromEntries(rows.map(v=>[v.id,cloneVideo(v)]));writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:rows,baseline,lastUndo:[],syncInfo})}
export function mergeExistingCacheVideos(channelId:string,updates:YoutubeExistingVideo[]){const prev=readExistingCache(channelId);const map=new Map((prev?.videos||[]).map(v=>[v.id,cloneVideo(v)]));const base={...(prev?.baseline||{})};for(const u of updates){map.set(u.id,cloneVideo(u));base[u.id]=cloneVideo(u)}writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:[...map.values()],baseline:base,lastUndo:prev?.lastUndo||[],syncInfo:prev?.syncInfo||null})}
const pad=(n:number)=>String(n).padStart(2,'0');
function parts(iso:string){const d=new Date(iso);if(Number.isNaN(d.getTime()))return;const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);const get=(t:string)=>p.find(x=>x.type===t)?.value||'';return{date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}}
export function krasDateKey(iso?:string){return iso?parts(iso)?.date:undefined}
export function toKratLocalInput(iso?:string){const p=iso?parts(iso):undefined;return p?`${p.date}T${p.time}`:''}
export function scheduleDateLabel(iso?:string){if(!iso)return'—';const d=new Date(iso);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Krasnoyarsk',day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
export function dateKeyLabel(key?:string){if(!key)return'—';const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:'—'}
function parseKey(key:string){const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN}
export function addCalendarDays(key:string,days:number){const n=parseKey(key);if(!Number.isFinite(n))return key;const d=new Date(n);d.setUTCDate(d.getUTCDate()+days);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`}
function diffDays(anchor:string,key:string){const a=parseKey(anchor),b=parseKey(key);return Number.isFinite(a)&&Number.isFinite(b)?Math.floor((b-a)/86400000):0}
export function scheduleModeFor(channel:Channel):ScheduleMode{return channel.scheduleMode==='pattern'?'pattern':'interval'}
export function intervalDaysFor(channel:Channel){return Math.max(1,Math.floor(channel.publishIntervalDays||channel.cadenceDays||1))}
export function patternFor(channel:Channel):SchedulePattern|undefined{if(scheduleModeFor(channel)!=='pattern')return;const anchor=channel.patternAnchorDate;return anchor?{publishDays:Math.max(1,Math.floor(channel.publishDays||3)),pauseDays:Math.max(1,Math.floor(channel.pauseDays||1)),anchorDate:anchor}:undefined}
export function isPatternPublishDate(key:string,pattern:SchedulePattern){const cycle=Math.max(2,pattern.publishDays+pattern.pauseDays);const delta=diffDays(pattern.anchorDate,key);if(delta<0)return false;const pos=((delta%cycle)+cycle)%cycle;return pos<pattern.publishDays}
function toKratIso(date:string,time:string){return new Date(`${date}T${time}:00+07:00`).toISOString()}
function occupiedDates(videos:YoutubeExistingVideo[],excludeIds:string[]=[]){const excluded=new Set(excludeIds);return new Set(videos.filter(v=>!excluded.has(v.id)).map(v=>krasDateKey(v.publishAt)).filter(Boolean) as string[])}
export function deriveChannelScheduleState(channel:Channel,videos:YoutubeExistingVideo[],updatedAt?:string,excludeIds:string[]=[]):ChannelScheduleState{
  const mode=scheduleModeFor(channel),interval=intervalDaysFor(channel),publishDays=Math.max(1,Math.floor(channel.publishDays||3)),pauseDays=Math.max(1,Math.floor(channel.pauseDays||1));const defaultTime=`${pad(channel.publishHour||0)}:${pad(channel.publishMinute||0)}`;
  const excluded=new Set(excludeIds),visible=videos.filter(v=>!excluded.has(v.id));const scheduled=visible.map(v=>v.publishAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));const published=visible.map(v=>v.publishedAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const lastScheduledAt=scheduled.length?scheduled[scheduled.length-1]:undefined,lastPublishedAt=published.length?published[published.length-1]:undefined,scheduledUntil=krasDateKey(lastScheduledAt),occupied=occupiedDates(visible);
  let nextKey:string|undefined;
  if(mode==='pattern'){
    const anchor=channel.patternAnchorDate;
    if(anchor){let k=scheduledUntil?addCalendarDays(scheduledUntil,1):anchor;let guard=0;const pattern={publishDays,pauseDays,anchorDate:anchor};while(guard++<20000&&(!isPatternPublishDate(k,pattern)||occupied.has(k)))k=addCalendarDays(k,1);nextKey=k}
  }else if(scheduledUntil){let k=addCalendarDays(scheduledUntil,interval),guard=0;while(guard++<10000&&occupied.has(k))k=addCalendarDays(k,interval);nextKey=k}
  return{channelId:channel.id,lastPublishedAt,lastScheduledAt,nextAvailableAt:nextKey?toKratIso(nextKey,defaultTime):undefined,scheduledUntil,scheduleMode:mode,publishIntervalDays:interval,publishDays,pauseDays,patternAnchorDate:channel.patternAnchorDate,defaultPublishTime:defaultTime,scheduledCount:scheduled.length,updatedAt};
}
export function getChannelScheduleState(channelId:string,channel:Channel,excludeIds:string[]=[]){const cache=readExistingCache(channelId);return deriveChannelScheduleState(channel,cache?.videos||[],cache?.updatedAt,excludeIds)}
export function generatePatternSchedule(channel:Channel,videos:YoutubeExistingVideo[],count:number,excludeIds:string[]=[]){
  const pattern=patternFor(channel);if(!pattern)return{dates:[] as string[],calendar:[] as PatternCalendarDay[]};const cacheVideos=readExistingCache(channel.id)?.videos||videos,occupied=occupiedDates(cacheVideos,excludeIds),state=deriveChannelScheduleState(channel,cacheVideos,undefined,excludeIds),time=state.defaultPublishTime;let k=state.nextAvailableAt?krasDateKey(state.nextAvailableAt):pattern.anchorDate;if(!k)return{dates:[],calendar:[]};
  const dates:string[]=[],calendar:PatternCalendarDay[]=[];let guard=0;
  while(dates.length<count&&guard++<50000){const publishSlot=isPatternPublishDate(k,pattern),busy=occupied.has(k);calendar.push({date:k,kind:publishSlot?(busy?'occupied':'video'):'pause',publishSlot,occupied:busy});if(publishSlot&&!busy){dates.push(toKratIso(k,time));occupied.add(k)}k=addCalendarDays(k,1)}
  return{dates,calendar};
}
export function generateIntervalSchedule(channel:Channel,videos:YoutubeExistingVideo[],count:number,excludeIds:string[]=[]){const state=deriveChannelScheduleState(channel,videos,undefined,excludeIds);let k=state.nextAvailableAt?krasDateKey(state.nextAvailableAt):undefined;if(!k)return[];const occupied=occupiedDates(videos,excludeIds),days=intervalDaysFor(channel),time=state.defaultPublishTime,out:string[]=[];let guard=0;while(out.length<count&&guard++<20000){if(!occupied.has(k)){out.push(toKratIso(k,time));occupied.add(k)}k=addCalendarDays(k,days)}return out}
export function subscribeChannelSchedule(cb:(channelId:string)=>void){const fn=(e:Event)=>cb(String((e as CustomEvent<any>).detail?.channelId||''));window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)}
''')

# Strategy engine regression tests.
Path('src/channelSchedule.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';
import {deriveChannelScheduleState,generatePatternSchedule,isPatternPublishDate} from './channelSchedule';
import type {Channel,YoutubeExistingVideo} from './types';
const base:Channel={id:'c',name:'Channel',slug:'c',cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'FR',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}};
const v=(id:string,publishAt?:string):YoutubeExistingVideo=>({id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus:'private',publishAt,selected:false});
const pattern=(extra:Partial<Channel>={}):Channel=>({...base,scheduleMode:'pattern',publishDays:3,pauseDays:1,patternAnchorDate:'2026-09-15',...extra});
describe('VYRON calendar schedule strategies',()=>{
 it('keeps old cadence channels backward compatible as interval mode',()=>{const s=deriveChannelScheduleState(base,[v('x','2026-09-13T18:00:00+07:00')]);expect(s.scheduleMode).toBe('interval');expect(s.nextAvailableAt).toBe('2026-09-15T11:00:00.000Z')});
 it('3/1 calendar slots are deterministic from anchor',()=>{const p={publishDays:3,pauseDays:1,anchorDate:'2026-09-15'};expect(isPatternPublishDate('2026-09-15',p)).toBe(true);expect(isPatternPublishDate('2026-09-16',p)).toBe(true);expect(isPatternPublishDate('2026-09-17',p)).toBe(true);expect(isPatternPublishDate('2026-09-18',p)).toBe(false);expect(isPatternPublishDate('2026-09-19',p)).toBe(true)});
 it('preview shows pause days and creates exactly requested video dates',()=>{const c=pattern();const g=generatePatternSchedule(c,[],10);expect(g.dates).toHaveLength(10);expect(g.calendar.slice(0,5).map(x=>x.kind)).toEqual(['video','video','video','pause','video']);expect(g.dates[0]).toBe('2026-09-15T11:00:00.000Z');expect(g.dates[9]).toBe('2026-09-27T11:00:00.000Z')});
 it('continues in the middle of an existing 3/1 cycle',()=>{const c=pattern({patternAnchorDate:'2026-09-01'});const rows=[v('9','2026-09-09T18:00:00+07:00'),v('10','2026-09-10T18:00:00+07:00')];const g=generatePatternSchedule(c,rows,4);expect(g.dates.map(x=>x.slice(0,10))).toEqual(['2026-09-11','2026-09-13','2026-09-14','2026-09-15']);expect(g.calendar.some(x=>x.date==='2026-09-12'&&x.kind==='pause')).toBe(true)});
 it('occupied publish slot is skipped without moving pause day',()=>{const c=pattern();const rows=[v('busy','2026-09-16T18:00:00+07:00')];const g=generatePatternSchedule(c,4);expect(g.dates.map(x=>x.slice(0,10))).toEqual(['2026-09-15','2026-09-17','2026-09-19','2026-09-20']);expect(g.calendar.find(x=>x.date==='2026-09-16')?.kind).toBe('occupied');expect(g.calendar.find(x=>x.date==='2026-09-18')?.kind).toBe('pause')});
 it('34 videos produce 34 slots without duplicate dates',()=>{const g=generatePatternSchedule(pattern(),[],34);expect(g.dates).toHaveLength(34);expect(new Set(g.dates.map(x=>x.slice(0,10))).size).toBe(34)});
 it('different channels keep different strategies',()=>{expect(deriveChannelScheduleState(base,[]).scheduleMode).toBe('interval');expect(deriveChannelScheduleState(pattern(),[]).scheduleMode).toBe('pattern')});
});
''')

print('VYRON 1.0.14 schedule pattern engine applied')
