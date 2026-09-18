import {beforeEach,describe,expect,it} from 'vitest';
import {countBuckets,matchesExistingFilter} from './youtubeWorkflow';
import {getChannelScheduleState,readAuthoritativeExistingInventory,readExistingCache,replaceExistingCacheFromSync} from './channelSchedule';
import type {Channel,YoutubeExistingVideo} from './types';

const mem=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>mem.has(k)?mem.get(k)!:null,
 setItem:(k:string,v:string)=>{mem.set(k,String(v))},
 removeItem:(k:string)=>{mem.delete(k)},
 clear:()=>mem.clear(),
 key:(i:number)=>[...mem.keys()][i]??null,
 get length(){return mem.size}
}});
if(typeof globalThis.window==='undefined')Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>true}});
if(typeof globalThis.CustomEvent==='undefined')Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:class{detail:any;constructor(_name:string,init?:any){this.detail=init?.detail}}});

const mk=(id:string,privacyStatus:string,publishAt?:string,selected=false):YoutubeExistingVideo=>({
 id,position:Number(id.replace(/\D/g,''))||0,title:id,description:'',tags:[],categoryId:'10',
 privacyStatus,publishAt,publishedAt:'2026-01-01T00:00:00Z',selected
});
const channel=(id:string):Channel=>({id,name:id,slug:id,cadenceDays:1,targetBufferDays:60,publishHour:4,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}});

function inventory166(){
 const rows:YoutubeExistingVideo[]=[];
 for(let i=0;i<14;i++)rows.push(mk('priv'+i,'private'));
 for(let i=0;i<5;i++)rows.push(mk('sched'+i,'private',`2099-01-${String(i+1).padStart(2,'0')}T00:00:00Z`));
 for(let i=0;i<140;i++)rows.push(mk('pub'+i,'public'));
 for(let i=0;i<7;i++)rows.push(mk('unl'+i,'unlisted'));
 return rows;
}

describe('RC4 authoritative YouTube inventory',()=>{
 beforeEach(()=>mem.clear());

 it('keeps full counts independent from six selected rows',()=>{
  const rows=inventory166().map((v,i)=>({...v,selected:i<6}));
  expect(rows).toHaveLength(166);
  expect(rows.filter(v=>v.selected)).toHaveLength(6);
  expect(countBuckets(rows)).toEqual({private:14,scheduled:5,public:140,unlisted:7});
  expect(rows.filter(v=>matchesExistingFilter(v,'private'))).toHaveLength(14);
 });

 it('partial 152/166 sync never overwrites the previous 166 authoritative baseline',()=>{
  const full=inventory166();
  replaceExistingCacheFromSync('A',full,{complete:true,syncComplete:true,scheduleComplete:true,uniqueVideoIds:166,videosHydrated:166});
  expect(readAuthoritativeExistingInventory('A')).toHaveLength(166);

  const partial=full.slice(0,152);
  replaceExistingCacheFromSync('A',partial,{complete:false,syncComplete:false,scheduleComplete:false,uniqueVideoIds:166,videosHydrated:152});
  expect(readExistingCache('A')?.videos).toHaveLength(152);
  expect(readAuthoritativeExistingInventory('A')).toHaveLength(166);
  expect(readExistingCache('A')?.syncInfo?.syncComplete).toBe(false);
 });

 it('schedule derives latest future publishAt from full baseline, not current subset',()=>{
  const full=inventory166();
  replaceExistingCacheFromSync('A',full,{complete:true,syncComplete:true,scheduleComplete:true});
  // simulate a six-row UI editing subset after a full authoritative sync
  const raw=readExistingCache('A')!;
  localStorage.setItem('vyron:existing-cache:v1:A',JSON.stringify({...raw,videos:full.slice(0,6)}));
  const state=getChannelScheduleState('A',channel('A'),[],Date.parse('2026-09-18T00:00:00Z'));
  expect(state.scheduledCount).toBe(5);
  expect(state.lastScheduledAt).toBe('2099-01-05T00:00:00Z');
  expect(state.syncTruth).toBe('complete');
 });

 it('keeps channel inventories isolated across restart-style cache reload',()=>{
  const a=inventory166(),b=[mk('only-b','private')];
  replaceExistingCacheFromSync('A',a,{complete:true,syncComplete:true,scheduleComplete:true});
  replaceExistingCacheFromSync('B',b,{complete:true,syncComplete:true,scheduleComplete:true});
  expect(readAuthoritativeExistingInventory('A')).toHaveLength(166);
  expect(readAuthoritativeExistingInventory('B').map(v=>v.id)).toEqual(['only-b']);
 });
});
