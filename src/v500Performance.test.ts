import {describe,expect,it} from 'vitest';
import {buildDailyOperations} from './dailyOperations';
import {buildProductionPipeline} from './productionPipeline';
import type {Channel,UploadHistoryRecord,VideoJob} from './types';
import type {ChannelInventorySnapshot} from './renderInventoryRuntime';

function channel(i:number):Channel{return {id:'c'+i,name:'Channel '+i,slug:'c'+i,cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,renderFolderPath:'/Render/c'+i,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}} as Channel}
function snapshot(i:number,ready:number):ChannelInventorySnapshot{return {channelId:'c'+i,channelName:'Channel '+i,renderFolderPath:'/Render/c'+i,folderState:'ONLINE',stale:false,physicalFiles:ready,readyVideos:ready,uploadingVideos:0,uploadedLocalCopies:0,newCandidates:ready,newGenerations:0,knownReady:0,verifyRequired:0,invalid:0,runwayDays:ready,level:ready?'NORMAL':'EMPTY'}}
function upload(i:number,channelId:string,at:string):UploadHistoryRecord{return {id:'u'+i,jobId:'j'+i,channelId,youtubeVideoId:'yt'+i,localFilePath:'/Render/'+channelId+'/'+i+'.mp4',originalFilename:i+'.mp4',uploadedAt:at,fileSize:100,sha256:String(i).padStart(64,'0').slice(-64),status:'UPLOADED'}}
function job(i:number,channelId:string):VideoJob{
 const state=i%9;
 const base:VideoJob={id:'j'+i,channelId,number:i+1,folder:'/P/'+i,status:'NEED_IMAGE',createdAt:'2026-09-29T00:00:00Z',tracksCount:0,minTracks:10,title:'',description:'',tags:[]};
 if(state===0)return base;
 if(state===1)return {...base,status:'READY_RENDER',coverPath:'/i.jpg',tracksCount:10};
 if(state===2)return {...base,status:'RENDERING',coverPath:'/i.jpg',tracksCount:10};
 if(state===3)return {...base,status:'READY_UPLOAD',finalPath:'/R/'+i+'.mp4'};
 if(state===4)return {...base,status:'READY_UPLOAD',finalPath:'/R/'+i+'.mp4',title:'t',description:'d',tags:['x']};
 if(state===5)return {...base,status:'READY_UPLOAD',finalPath:'/R/'+i+'.mp4',title:'t',description:'d',tags:['x'],publishAt:'2026-09-30T10:00:00+07:00'};
 if(state===6)return {...base,status:'UPLOADING',finalPath:'/R/'+i+'.mp4'};
 if(state===7)return {...base,status:'SCHEDULED',youtubeVideoId:'ytj'+i,processingState:'YOUTUBE_PROCESSING',publishAt:'2026-09-30T10:00:00+07:00'};
 return {...base,status:'SCHEDULED',youtubeVideoId:'ytj'+i,processingState:'READY',remotePrivacyStatus:'public',publishAt:'2026-09-28T10:00:00+07:00'};
}

describe('VYRON 5 owner-scale performance contracts',()=>{
 it('handles 32 channels / 397 local / 5000 history without per-channel history scans',()=>{
  const channels=Array.from({length:32},(_,i)=>channel(i)),snapshots:Record<string,ChannelInventorySnapshot>={};
  for(let i=0;i<32;i++)snapshots['c'+i]=snapshot(i,i<13?13:12);
  const at='2026-09-29T06:00:00+07:00';
  const history=Array.from({length:5000},(_,i)=>upload(i,'c'+(i%32),i<18?at:'2026-09-28T06:00:00+07:00'));
  const t=performance.now(),result=buildDailyOperations(channels,history,snapshots,new Date('2026-09-29T07:00:00+07:00')),elapsed=performance.now()-t;
  expect(result.localReady).toBe(397);
  expect(result.uploadedToday).toBe(18);
  expect(result.processedChannels).toBe(18);
  expect(result.unprocessedChannels).toBe(14);
  expect(elapsed).toBeLessThan(1000);
 });
 it('handles 100 channels / 1000 local / 20000 events within a bounded pure-data pass',()=>{
  const channels=Array.from({length:100},(_,i)=>channel(i)),snapshots:Record<string,ChannelInventorySnapshot>={};
  for(let i=0;i<100;i++)snapshots['c'+i]=snapshot(i,10);
  const history=Array.from({length:20000},(_,i)=>upload(i,'c'+(i%100),'2026-09-28T06:00:00+07:00'));
  const t=performance.now(),result=buildDailyOperations(channels,history,snapshots,new Date('2026-09-29T07:00:00+07:00')),elapsed=performance.now()-t;
  expect(result.rows).toHaveLength(100);expect(result.localReady).toBe(1000);expect(elapsed).toBeLessThan(1500);
 });
 it('classifies 1000 pipeline jobs in one mutually-exclusive pass',()=>{
  const jobs=Array.from({length:1000},(_,i)=>job(i,'c'+(i%100)));
  const t=performance.now(),result=buildProductionPipeline(jobs,[],new Date('2026-09-29T07:00:00+07:00')),elapsed=performance.now()-t;
  const accounted=Object.values(result.counts).reduce((a,b)=>a+b,0);
  expect(accounted).toBe(1000);expect(elapsed).toBeLessThan(1000);
 });
});
