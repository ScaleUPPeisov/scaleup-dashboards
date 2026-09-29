import {describe,expect,it} from 'vitest';
import {buildDailyOperations} from './dailyOperations';
import type {Channel,UploadHistoryRecord} from './types';
import type {ChannelInventorySnapshot} from './renderInventoryRuntime';

const channel=(id='a'):Channel=>({id,name:id,slug:id,cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,renderFolderPath:'/Render/'+id,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}} as Channel);
const snapshot=(id='a',ready=30):ChannelInventorySnapshot=>({channelId:id,channelName:id,renderFolderPath:'/Render/'+id,folderState:'ONLINE',stale:false,physicalFiles:ready,readyVideos:ready,uploadingVideos:0,uploadedLocalCopies:0,newCandidates:ready,newGenerations:0,knownReady:0,verifyRequired:0,invalid:0,runwayDays:ready,level:ready?'NORMAL':'EMPTY'});
const upload=(id:string,at:string,videoId=id):UploadHistoryRecord=>({id,jobId:id,channelId:'a',youtubeVideoId:videoId,localFilePath:'/Render/a/'+id+'.mp4',originalFilename:id+'.mp4',uploadedAt:at,fileSize:1,sha256:'a'.repeat(64),status:'UPLOADED'});

describe('VYRON 5 daily operations truth',()=>{
 it('counts successful VYRON uploads, not local file disappearance',()=>{
   const now=new Date(2026,8,28,22,0,0);
   const noUpload=buildDailyOperations([channel()],[],{a:snapshot('a',30)},now);
   expect(noUpload.uploadedToday).toBe(0);expect(noUpload.rows[0].processedToday).toBe(false);expect(noUpload.localReady).toBe(30);
   const history=Array.from({length:10},(_,i)=>upload(String(i),new Date(2026,8,28,20,i,0).toISOString()));
   const done=buildDailyOperations([channel()],history,{a:snapshot('a',30)},now);
   expect(done.uploadedToday).toBe(10);expect(done.rows[0].processedToday).toBe(true);expect(done.localReady).toBe(30);
 });
 it('deduplicates repeated successful history for the same YouTube video',()=>{
   const now=new Date(2026,8,28,22,0,0),at=new Date(2026,8,28,20,0,0).toISOString();
   const result=buildDailyOperations([channel()],[upload('attempt1',at,'YT1'),upload('attempt2',at,'YT1')],{a:snapshot()},now);
   expect(result.uploadedToday).toBe(1);
 });
 it('uses local midnight, so yesterday remains history but not today',()=>{
   const now=new Date(2026,8,28,0,1,0),yesterday=new Date(2026,8,27,23,59,0).toISOString();
   expect(buildDailyOperations([channel()],[upload('old',yesterday)],{a:snapshot()},now).uploadedToday).toBe(0);
 });

 it('returns deterministic owner next actions from local facts',()=>{
   const now=new Date(2026,8,28,22,0,0);
   const noFolder=channel();delete (noFolder as any).renderFolderPath;
   expect(buildDailyOperations([noFolder],[],{},now).rows[0].nextAction).toBe('Выбрать Render-папку');
   expect(buildDailyOperations([channel()],[],{a:snapshot('a',0)},now).rows[0].nextAction).toBe('Добавить видео в Render');
   expect(buildDailyOperations([channel()],[],{a:snapshot('a',30)},now).rows[0].nextAction).toBe('Загрузить видео');
   const done=buildDailyOperations([channel()],[upload('ok',new Date(2026,8,28,20,0,0).toISOString())],{a:snapshot('a',30)},now);
   expect(done.rows[0].nextAction).toBe('Не требуется');
 });
});
