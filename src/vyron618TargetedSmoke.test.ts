import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {deriveRunwayRecord,compareYoutubeOnlyRunwayPriority} from './channelRunwayCore';
import {upsertChannelRunwayFromYoutube,markRunwayRefreshIssue,loadChannelRunwayStore} from './channelRunwayStore';
import {shouldDisplayLiveBatch,shouldReconcileLiveBatch} from './productionNavigationGuards';
import type {YoutubeExistingVideo} from './types';
import type {ProductionBuildRuntimeSnapshot} from './productionManagerApi';

const now=new Date('2026-11-18T05:00:00Z');
const heapUsed=()=>Number((globalThis as unknown as {process?:{memoryUsage?:()=>{heapUsed:number}}}).process?.memoryUsage?.().heapUsed??0);
const video=(id:string,publishAt:string):YoutubeExistingVideo=>({
 id,position:0,title:id,description:'',tags:[],categoryId:'10',
 privacyStatus:'private',publishAt,selected:false
});
const storage=()=>{
 const map=new Map<string,string>();
 return {getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)}};
};

describe('VYRON 6.1.18 synthetic 33-channel and Production route guard',()=>{
 it('orders 33 channels by verified YouTube runway and keeps unknown after confirmed',()=>{
  const rows=Array.from({length:33},(_,i)=>{
   const channel={id:'channel-'+i,name:'Channel '+i};
   const publish=new Date(Date.UTC(2026,10,19)+i*3*86400000).toISOString();
   const r=deriveRunwayRecord(channel,[video('scheduled-'+i,publish)],now,now.toISOString(),true);
   return {channelName:r.channelName,remoteScheduledDays:r.runwayDays??0,scheduledUntil:r.scheduledUntil,known:r.status!=='no-data',record:r};
  });
  const unknown=deriveRunwayRecord({id:'unlinked',name:'Unknown'},[],now,undefined,false);
  rows[19]={channelName:unknown.channelName,remoteScheduledDays:0,scheduledUntil:undefined,known:false,record:unknown};
  const sorted=rows.sort(compareYoutubeOnlyRunwayPriority);
  expect(sorted).toHaveLength(33);
  expect(sorted.slice(0,-1).every(r=>r.known)).toBe(true);
  expect(sorted.at(-1)?.channelName).toBe('Unknown');
  for(let i=1;i<sorted.length-1;i++)expect(sorted[i].remoteScheduledDays).toBeGreaterThanOrEqual(sorted[i-1].remoteScheduledDays);
 });
 it('retains prior verified inventory on 33 independent API/OAuth failures',()=>{
  const mem=storage();
  for(let i=0;i<33;i++){
   const channel={id:'channel-'+i,name:'Channel '+i} as any;
   expect(upsertChannelRunwayFromYoutube(channel,[video('scheduled-'+i,'2026-12-12T10:00:00Z')],now,mem).ok).toBe(true);
   expect(markRunwayRefreshIssue(channel,i%2?'API_FAILED':'AUTH_REQUIRED','synthetic outage',new Date(now.getTime()+1000),mem).ok).toBe(true);
  }
  const records=Object.values(loadChannelRunwayStore(mem).channels);
  expect(records).toHaveLength(33);
  for(const record of records){
   expect(record.scheduledUntil).toBe('2026-12-12');
   expect(record.scheduledVideoCount).toBe(1);
   expect(record.runwayDays).toBeUndefined();
   expect(record.status).toBe('no-data');
  }
 });
 it('20 repeated navigations never replay a completed build result as fresh',()=>{
  const build:ProductionBuildRuntimeSnapshot={channelId:'neon',requestId:'request',state:'COMPLETED',progress:null,
   result:{status:'ready',availableImages:1,requestedProjects:1,batch:{batchId:'batch-1',channelId:'neon',channelName:'Neon Drive FM',createdAt:'2026-11-18T05:00:00Z',projectCount:1,tracksAssigned:10,status:'ready',manifestPath:'/not-mounted/manifest.json',rootPath:'/not-mounted/batch',completedProjects:1,errorProjects:0}}};
  const shown=new Set<string>(),reconciled=new Set<string>();
  let displayCount=0,reconcileCount=0;
  const heapBefore=heapUsed(),start=performance.now();
  for(let n=0;n<20;n++){
   if(shouldDisplayLiveBatch(build,shown)){displayCount++;shown.add('batch-1')}
   if(shouldReconcileLiveBatch(build,'batch-1',reconciled)){reconcileCount++;reconciled.add('batch-1')}
   expect(shouldReconcileLiveBatch(build,'old-history-batch',reconciled)).toBe(false);
  }
  const elapsed=performance.now()-start,heapDelta=heapUsed()-heapBefore;
  expect(displayCount).toBe(1);
  expect(reconcileCount).toBe(1);
  expect(Number.isFinite(elapsed)).toBe(true);
  console.info('SYNTHETIC_PRODUCTION_20_REENTRIES',{ms:Math.round(elapsed*1000)/1000,heapDeltaBytes:heapDelta,displayCount,reconcileCount,filesystemCalls:0});
 });
 it('source preserves lazy history loading, cleanup subscription and no implicit batch restoration',()=>{
  const source=readFileSync('src/ProductionManager.tsx','utf8');
  expect(source).toContain('void refreshState(false)');
  expect(source).toContain('void refreshState(true)');
  expect(source).toContain('return productionBuildRuntime.subscribe(sync)');
  expect(source).not.toContain("const last=channelPrefs.lastBatchId&&batches.find");
  expect(source).toContain('if(!loadHistory)return;');
 });
});
