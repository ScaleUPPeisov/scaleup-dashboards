import {describe,expect,it,vi} from 'vitest';
import type {Channel,UploadHistoryRecord} from './types';
import {buildDailyOperations} from './dailyOperations';

const channel={id:'fixture',name:'Канал',enabled:true,renderFolderPath:'/fixture'} as Channel;
const upload=(id:string,uploadedAt:string,videoId=id)=>({id,jobId:id,channelId:'fixture',youtubeVideoId:videoId,localFilePath:'/fixture/'+id,originalFilename:id,uploadedAt,fileSize:1,sha256:'fixture',status:'UPLOADED'} as UploadHistoryRecord);

describe('daily operations latest upload',()=>{
 it('preserves the first equal instant and the ascending list after excluding invalid and duplicate records',()=>{
  const now=new Date(2026,8,28,22,0,0);
  const early=new Date(2026,8,28,9,0,0).toISOString();
  const latest=new Date(2026,8,28,20,0,0).toISOString();
  const equal=latest.replace('Z','+00:00');
  const history=[upload('invalid','invalid'),upload('first',latest,'same'),upload('early',early),upload('same-time',equal),upload('duplicate',latest,'same'),upload('yesterday',new Date(2026,8,27,20,0,0).toISOString())];
  const result=buildDailyOperations([channel],history,{},now);
  expect(result.uploadedToday).toBe(3);
  expect(result.lastUploadAt).toBe(latest);
  expect(result.rows[0].events.map(x=>x.id)).toEqual(['early','first','same-time']);
  expect(result.rows[0].lastUploadAt).toBe(equal);
 });
 it('avoids a second chronological sort for a large history',()=>{
  const now=new Date(2026,8,28,22,0,0),end=new Date(2026,8,28,20,0,0).getTime();
  const rows=Array.from({length:6000},(_,i)=>upload(String(i),new Date(end-i*1000).toISOString()));
  const parse=vi.spyOn(Date,'parse');
  try{
   const original=rows.slice().sort((a,b)=>Date.parse(a.uploadedAt)-Date.parse(b.uploadedAt));
   const expected=original.slice().sort((a,b)=>Date.parse(b.uploadedAt)-Date.parse(a.uploadedAt))[0].uploadedAt;
   const originalParseCount=parse.mock.calls.length;parse.mockClear();
   const result=buildDailyOperations([channel],rows,{},now);
   expect(result.uploadedToday).toBe(rows.length);expect(result.lastUploadAt).toBe(expected);
   expect(result.rows[0].events[0].id).toBe('5999');
   expect(result.rows[0].events.at(-1)?.id).toBe('0');
   expect(parse.mock.calls.length).toBeLessThan(originalParseCount);
  }finally{parse.mockRestore()}
 });
});
