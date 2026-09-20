import {beforeEach,describe,expect,it} from 'vitest';
import {existingSyncIncompleteSummary,mergeInventoryRowsPreservingCached,readExistingCache,reconcileExistingSyncAfterTargetedRetry,replaceExistingCacheFromSync,targetedExistingRetryIds} from './channelSchedule';
import {youtubeCommandUsesMethodLedger} from './api';
import {youtubeQuotaCost} from './youtubeQuota';
import type {YoutubeExistingVideo} from './types';

const mem=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>mem.has(k)?mem.get(k)!:null,
 setItem:(k:string,v:string)=>{mem.set(k,String(v))},
 removeItem:(k:string)=>{mem.delete(k)},
 clear:()=>mem.clear(),
 key:(i:number)=>[...mem.keys()][i]??null,
 get length(){return mem.size}
}});
if(typeof globalThis.window==='undefined')Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>true,addEventListener:()=>{},removeEventListener:()=>{}}});
if(typeof globalThis.CustomEvent==='undefined')Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:class{detail:any;constructor(_name:string,init?:any){this.detail=init?.detail}}});

const mk=(n:number,privacyStatus='public',publishAt?:string):YoutubeExistingVideo=>({
 id:`v${n}`,position:n,title:`Video ${n}`,description:'',tags:[],categoryId:'10',
 privacyStatus,publishAt,publishedAt:'2026-01-01T00:00:00Z',selected:false
});
const full203=()=>Array.from({length:203},(_,i)=>i<66?mk(i,'private',`2099-01-${String(i%28+1).padStart(2,'0')}T00:00:00Z`):mk(i,'public'));

describe('VYRON 2.1.15 RC2 schedule sync hotfix',()=>{
 beforeEach(()=>mem.clear());

 it('treats factual 203/203 snapshot as complete and keeps all rows',()=>{
  const rows=full203();
  const info={complete:true,syncComplete:true,scheduleComplete:true,youtubeFound:203,inventoryExpected:203,uniqueVideoIds:203,videosHydrated:203,missingHydrationCount:0,incompleteReasons:[]};
  replaceExistingCacheFromSync('A',rows,info);
  const cache=readExistingCache('A')!;
  expect(cache.videos).toHaveLength(203);
  expect(cache.baseline && Object.keys(cache.baseline)).toHaveLength(203);
  expect(cache.syncInfo.scheduleComplete).toBe(true);
  expect(cache.lastCompleteAt).toBeTruthy();
 });

 it('partial 202/203 refresh preserves prior 203 cached rows and exposes exact retry id',()=>{
  const rows=full203();
  replaceExistingCacheFromSync('A',rows,{complete:true,syncComplete:true,scheduleComplete:true,uniqueVideoIds:203,videosHydrated:203});
  const partial=rows.slice(0,202);
  const info={complete:false,syncComplete:false,scheduleComplete:false,inventoryExpected:203,uniqueVideoIds:203,videosHydrated:202,missingHydrationCount:1,missingHydrationIds:['v202'],failedHydrationIds:['v202'],incompleteReasons:['MISSING_VIDEO_HYDRATION'],inventoryIncompleteReasons:['MISSING_VIDEO_HYDRATION']};
  replaceExistingCacheFromSync('A',partial,info);
  expect(readExistingCache('A')?.videos).toHaveLength(203);
  expect(targetedExistingRetryIds(info)).toEqual(['v202']);
  expect(existingSyncIncompleteSummary(info).join(' ')).toContain('1 видео');
 });

 it('successful targeted retry upgrades completeness without rereading the playlist',()=>{
  const rows=full203(),partial=rows.slice(0,202);
  const info={complete:false,syncComplete:false,scheduleComplete:false,inventoryExpected:203,uniqueVideoIds:203,videosHydrated:202,missingHydrationCount:1,missingHydrationIds:['v202'],failedHydrationIds:['v202'],incompleteReasons:['MISSING_VIDEO_HYDRATION'],inventoryIncompleteReasons:['MISSING_VIDEO_HYDRATION']};
  const retry={videos:[rows[202]],missingHydrationIds:[],scheduleIncompleteIds:[],hydrationErrors:[]};
  const out=reconcileExistingSyncAfterTargetedRetry(info,partial,retry);
  expect(out.videos).toHaveLength(203);
  expect(out.syncInfo.syncComplete).toBe(true);
  expect(out.syncInfo.scheduleComplete).toBe(true);
  expect(targetedExistingRetryIds(out.syncInfo)).toEqual([]);
 });

 it('merge keeps cached rows while replacing newly verified rows by id',()=>{
  const old=[mk(1),mk(2)],fresh={...mk(2),title:'verified'};
  const merged=mergeInventoryRowsPreservingCached(old,[fresh]);
  expect(merged).toHaveLength(2);
  expect(merged.find(x=>x.id==='v2')?.title).toBe('verified');
 });

 it('truncation and hydration failures produce concrete reasons',()=>{
  const info={scheduleComplete:false,requested:1000,missingHydrationCount:1,playlistUnresolvedCount:0,scheduleDataIncompleteCount:0,hydrationErrors:['batch 4: timeout'],incompleteReasons:['LIMIT_TRUNCATED','MISSING_VIDEO_HYDRATION','HYDRATION_BATCH_FAILED']};
  const text=existingSyncIncompleteSummary(info).join(' | ');
  expect(text).toContain('Лимит 1000');
  expect(text).toContain('1 видео');
  expect(text).toContain('batch 4');
 });

 it('full inventory and targeted retry are method-ledger commands, so compatibility estimator is not double-debited',()=>{
  expect(youtubeQuotaCost('youtube_list_existing_videos',{maxResults:203},{received:203})).toBe(11);
  expect(youtubeCommandUsesMethodLedger('youtube_list_existing_videos')).toBe(true);
  expect(youtubeCommandUsesMethodLedger('youtube_retry_existing_video_hydration')).toBe(true);
 });
});
