import {describe,expect,it} from 'vitest';
import {batchJobStillMatches,isFuturePublishAt,pendingSessionCheck} from './batchUploadSafety';
import type {Channel,VideoJob,YoutubeProfile} from './types';

const now=Date.parse('2026-11-26T00:00:00Z');
const job={id:'job-1',channelId:'channel-1',status:'READY_UPLOAD',finalPath:'/test/video.mp4',title:'Title',description:'Description',tags:['tag'],publishAt:'2026-11-27T00:00:00Z'} as VideoJob;
const channel={id:'channel-1',youtubeProfileId:'profile-1',youtubeChannelId:'yt-1'} as Channel;
const profile={id:'profile-1',channelId:'yt-1'} as YoutubeProfile;
const matches=(current:VideoJob=job,ch:Channel=channel,p:YoutubeProfile=profile,active=false)=>batchJobStillMatches(job,current,ch,p,active,now);

describe('batch upload safety',()=>{
 it('accepts only valid strictly future scheduled dates',()=>{
  expect(isFuturePublishAt(job.publishAt,now)).toBe(true);
  for(const value of [undefined,'','invalid','2026-11-26T00:00:00Z','2026-11-25T00:00:00Z'])expect(isFuturePublishAt(value,now)).toBe(false);
 });
 it('protects a matching persisted resumable session regardless of channel identity',()=>{
  expect(pendingSessionCheck([{jobId:'job-1',channelId:'wrong-channel',offset:123}],job.id)).toBe('RECOVERY_REQUIRED');
  expect(pendingSessionCheck([{jobId:'other',offset:0}],job.id)).toBe('CLEAR');
  expect(pendingSessionCheck([],job.id)).toBe('CLEAR');
 });
 it('fails closed on unknown session store responses',()=>{
  for(const sessions of [undefined,null,{},[null],[{}],[{jobId:''}]])expect(pendingSessionCheck(sessions,job.id)).toBe('UNAVAILABLE');
  expect(pendingSessionCheck([],'')).toBe('UNAVAILABLE');
  expect(pendingSessionCheck([{jobId:' job-1 '}],job.id)).toBe('UNAVAILABLE');
  expect(pendingSessionCheck([{jobId:'other '}],job.id)).toBe('UNAVAILABLE');
  expect(pendingSessionCheck([],' job-1 ')).toBe('UNAVAILABLE');
 });
 it('revalidates the exact job and all identity and metadata after awaiting',()=>{
  expect(matches()).toBe(true);
  for(const patch of [{id:'other'},{channelId:'other'},{status:'ERROR'},{finalPath:'/test/other.mp4'},{youtubeVideoId:'already-uploaded'},{title:'other'},{description:'other'},{tags:['other']},{publishAt:'2026-11-25T00:00:00Z'}])expect(matches({...job,...patch} as VideoJob)).toBe(false);
  expect(matches(job,{...channel,enabled:false})).toBe(false);
  expect(matches(job,{...channel,youtubeProfileId:'different'})).toBe(false);
  expect(matches(job,channel,{...profile,channelId:'different'})).toBe(false);
  expect(matches(job,channel,profile,true)).toBe(false);
  expect(batchJobStillMatches(job,job,channel,profile,false,Date.parse(job.publishAt!))).toBe(false);
 });
});
