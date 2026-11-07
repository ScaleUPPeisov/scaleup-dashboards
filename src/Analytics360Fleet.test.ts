import {describe,it,expect} from 'vitest';
import {buildFleetRows} from './Analytics360Fleet';
import type {Channel,VideoJob,YoutubeProfile,UploadHistoryRecord} from './types';

const channel=(id:string,name:string,yt:string,profile:string):Channel=>({
 id,name,slug:name.toLowerCase(),enabled:true,
 youtubeChannelId:yt,youtubeProfileId:profile,
 cadenceDays:3,targetBufferDays:30,publishHour:18,publishMinute:0,
 language:'EN',genre:'Music',country:'US',
 minTracks:10,targetDurationMin:120,
 seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}
});
const job=(id:string,channelId:string,status:VideoJob['status'],publishAt?:string):VideoJob=>({
 id,channelId,status,publishAt,number:1,folder:'',createdAt:'2026-01-01T00:00:00Z',
 tracksCount:10,minTracks:10,title:'',description:'',tags:[]
});
describe('Analytics 360 Fleet uses only existing state',()=>{
 it('keeps OAuth and Analytics metrics separated by exact channel and profile',()=>{
  const one=channel('local-1','Ambient','UC1234567890123456789012','p1');
  const two=channel('local-2','Jazz','UC2222222222222222222222','p2');
  const profiles:YoutubeProfile[]=[
   {id:'p1',channelId:one.youtubeChannelId,credentialStatus:'READY'},
   {id:'p2',channelId:'UCbad',credentialStatus:'READY'}
  ];
  const jobs=[
   job('a','local-1','READY_UPLOAD'),job('b','local-1','READY_UPLOAD'),
   job('c','local-1','SCHEDULED','2026-11-20T16:00:00Z'),
   job('e','local-2','ERROR')
  ];
  const data=[{channelId:one.youtubeChannelId!,status:'AVAILABLE' as const,
   growth28:{changePercent:51},updatedAt:'2026-11-04T00:00:00Z'}];
  const rows=buildFleetRows([one,two],profiles,jobs,[],data,Date.parse('2026-11-07T00:00:00Z'));
  expect(rows[0].oauth).toBe('READY');
  expect(rows[0].ready).toBe(2);
  expect(rows[0].scheduled).toBe(1);
  expect(rows[0].growth28).toBe(51);
  expect(rows[0].localRunwayDays).toBeGreaterThan(0);
  expect(rows[1].oauth).toBe('NOT_LINKED');
  expect(rows[1].errors).toBe(1);
  expect(rows[1].growth28).toBeNull();
  expect(rows[1].attention).toBeGreaterThan(0);
 });
 it('shows no fabricated remote runway when no local scheduled jobs exist',()=>{
  const one=channel('local-3','Archive','UC3333333333333333333333','p3');
  const rows=buildFleetRows([one],[{id:'p3',channelId:one.youtubeChannelId}],[],[],[],Date.parse('2026-11-07T00:00:00Z'));
  expect(rows[0].localRunwayDays).toBeNull();
  expect(rows[0].nextPublication).toBeNull();
  expect(rows[0].growth28).toBeNull();
  expect(rows[0].warnings).toContain('Нет готовых или запланированных локальных видео');
 });
 it('uses the latest local upload timestamp without writing to upload history',()=>{
  const one=channel('local-4','House','UC4444444444444444444444','p4');
  const uploads=[
   {channelId:one.id,uploadedAt:'2026-11-01T10:00:00Z'},
   {channelId:one.id,uploadedAt:'2026-11-03T10:00:00Z'}
  ] as UploadHistoryRecord[];
  const unchanged=JSON.stringify(uploads);
  const rows=buildFleetRows([one],[{id:'p4',channelId:one.youtubeChannelId}],[],uploads,[]);
  expect(rows[0].lastUpload).toBe('2026-11-03T10:00:00Z');
  expect(JSON.stringify(uploads)).toBe(unchanged);
 });
});
