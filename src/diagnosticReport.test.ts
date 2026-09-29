import {describe,expect,it} from 'vitest';
import {buildSafeDiagnosticReport} from './diagnosticReport';

describe('VYRON 5 safe diagnostic report',()=>{
 it('contains operational counts but never serializes secrets/passwords/tokens',()=>{
  const secret='sk-SUPER_SECRET_VALUE_123456789';
  const report=buildSafeDiagnosticReport({
   appVersion:'5.0.0',platform:'darwin',updateChannel:'stable',updaterStatus:'UP_TO_DATE',
   state:{
    channels:[{id:'c',name:'A',slug:'a',cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,youtubeProfileId:'profile',youtubeChannelId:'UC1',renderFolderPath:'/Render/A',seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}} as any],
    jobs:[],uploadHistory:[],activityJournal:[],statisticsHistory:{},projectLifecycle:{}
   },
   snapshots:{},quota:{used:42,limit:10000,calls:9,ptDate:'2026-09-29'},
   globalUploads:{used:3,limit:100,remaining:97,quotaDay:'2026-09-29'},
   core:{ok:false,workspaceWritable:true,workspaceExists:true,dataDir:'/x',platform:'darwin',appVersion:'5.0.0',notes:['access_token='+secret,'client_secret='+secret,'normal note']}
  });
  expect(report).toContain('"version": "5.0.0"');
  expect(report).toContain('"channels": 1');
  expect(report).toContain('"used": 42');
  expect(report).not.toContain(secret);
  expect(report).not.toContain('access_token='+secret);
  expect(report).not.toContain('client_secret='+secret);
  expect(report).not.toContain('youtubeApiKey');
  expect(report).not.toContain('openaiApiKey');
 });
});
