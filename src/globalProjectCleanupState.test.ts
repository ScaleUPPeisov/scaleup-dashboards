import {describe,expect,it} from 'vitest';
import type {VideoJob} from './types';
import {clearDeletedProjectWorkspaces} from './globalProjectCleanupState';

function job(id:string,overrides:Partial<VideoJob>={}):VideoJob{return{id,channelId:'channel',number:1,folder:'/VYRON/ProductionManager/Batches/channel/batch/'+id,status:'RENDERING',createdAt:'2026-10-21T00:00:00Z',coverPath:'/project/cover.jpg',tracksCount:10,minTracks:10,title:'Title',description:'Description',tags:['tag'],renderQueuedAt:'2026-10-21T00:00:00Z',...overrides}}

describe('global project cleanup in-memory reconciliation',()=>{
 it('clears only deleted workspace state and removes stale rendering status',()=>{
  const kept=job('kept',{status:'READY_RENDER'});
  const [cleared,untouched]=clearDeletedProjectWorkspaces([job('deleted'),kept],['deleted']);
  expect(cleared).toMatchObject({id:'deleted',folder:'',tracksCount:0,status:'NEED_IMAGE'});
  expect(cleared.coverPath).toBeUndefined();
  expect(cleared.renderQueuedAt).toBeUndefined();
  expect(untouched).toBe(kept);
 });

 it('preserves rendered output, upload identity, metadata, and schedule',()=>{
  const scheduled=job('scheduled',{status:'SCHEDULED',finalPath:'/Render/channel/video.mp4',youtubeVideoId:'youtube-id',publishAt:'2026-11-01T12:00:00Z'});
  const [cleared]=clearDeletedProjectWorkspaces([scheduled],['scheduled']);
  expect(cleared).toMatchObject({folder:'',status:'SCHEDULED',finalPath:'/Render/channel/video.mp4',youtubeVideoId:'youtube-id',publishAt:'2026-11-01T12:00:00Z',title:'Title',description:'Description',tags:['tag']});
 });
});
