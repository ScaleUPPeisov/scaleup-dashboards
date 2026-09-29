import {describe,expect,it} from 'vitest';
import {buildProductionPipeline,productionPipelineStage,PRODUCTION_PIPELINE_ORDER} from './productionPipeline';
import type {VideoJob} from './types';

const base=(id:string,patch:any={}):VideoJob=>({id,channelId:'c',number:1,folder:'/p/'+id,status:'NEED_IMAGE',createdAt:'2026-09-29T00:00:00Z',tracksCount:0,minTracks:10,title:'',description:'',tags:[],...patch});
describe('VYRON 5 production pipeline',()=>{
 it('assigns every job to exactly one conveyor stage',()=>{
  const now=new Date('2026-09-29T07:00:00+07:00');
  const jobs=[
   base('source'),base('ready',{status:'READY_RENDER'}),base('rendering',{status:'RENDERING'}),
   base('rendered',{status:'READY_UPLOAD',finalPath:'/r/1.mp4'}),base('metadata',{finalPath:'/r/2.mp4',title:'t',description:'d',tags:['x']}),
   base('upload',{status:'UPLOADING',finalPath:'/r/3.mp4'}),base('processing',{youtubeVideoId:'yt1',processingState:'YOUTUBE_PROCESSING'}),
   base('scheduled',{status:'SCHEDULED',youtubeVideoId:'yt2',processingState:'READY',publishAt:'2026-09-30T10:00:00+07:00'}),
   base('published',{status:'SCHEDULED',youtubeVideoId:'yt3',processingState:'READY',remotePrivacyStatus:'public',publishAt:'2026-09-28T10:00:00+07:00'}),
   base('error',{status:'ERROR',error:'x'})
  ];
  const snap=buildProductionPipeline(jobs,[],now);
  const accounted=PRODUCTION_PIPELINE_ORDER.reduce((n,s)=>n+snap.counts[s],0)+snap.counts.ERROR;
  expect(accounted).toBe(jobs.length);
 });
 it('marks a ready upload backlog with no active publisher as bottleneck',()=>{
  const jobs=Array.from({length:8},(_,i)=>base(String(i),{status:'READY_UPLOAD',finalPath:'/r/'+i+'.mp4',title:'t',description:'d',tags:['x'],publishAt:'2026-09-30T10:00:00+07:00'}));
  expect(buildProductionPipeline(jobs,[],new Date('2026-09-29T07:00:00+07:00')).bottleneck.title).toBe('Publisher остановлен');
 });
 it('keeps classification factual for public vs future scheduled',()=>{
  const now=new Date('2026-09-29T07:00:00+07:00');
  expect(productionPipelineStage(base('a',{youtubeVideoId:'1',processingState:'READY',remotePrivacyStatus:'public'}),now)).toBe('PUBLISHED');
  expect(productionPipelineStage(base('b',{youtubeVideoId:'2',processingState:'READY',status:'SCHEDULED',publishAt:'2026-09-30T10:00:00+07:00'}),now)).toBe('SCHEDULED');
 });
});
