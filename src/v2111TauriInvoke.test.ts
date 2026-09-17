import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@tauri-apps/api/app',()=>({getVersion:vi.fn(async()=> '2.1.2')}));
vi.mock('@tauri-apps/api/event',()=>({listen:vi.fn(async()=>()=>{})}));
vi.mock('@tauri-apps/plugin-dialog',()=>({open:vi.fn()}));
vi.mock('@tauri-apps/plugin-opener',()=>({openPath:vi.fn(),openUrl:vi.fn()}));
vi.mock('@tauri-apps/plugin-updater',()=>({check:vi.fn()}));
vi.mock('@tauri-apps/plugin-process',()=>({relaunch:vi.fn()}));
vi.mock('./youtubeQuota',()=>({
 bindYoutubeQuotaOperationProject:vi.fn(),
 recordYoutubeApiRequest:vi.fn(),
 recordYoutubeCommand:vi.fn(),
 registerYoutubeUploadProject:vi.fn(),
 youtubeQuotaProjectIdentity:vi.fn(()=>({projectKey:'project:test',source:'oauth-client'})),
 youtubeGuardedCall:(fn:()=>unknown)=>fn()
}));
vi.mock('./shortsCore',()=>({mutateShortsState:vi.fn(),recordShortUploadAttempt:vi.fn()}));
import {api} from './api';

describe('VYRON 2.1.2 YouTube frontend → Tauri invoke',()=>{
 beforeEach(()=>{
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async(command:string)=>{
   if(command==='youtube_oauth_profiles')return [{id:'profile-1',channelId:'UC_TEST',name:'Test'}];
   if(command==='youtube_google_config_status')return {configured:true,projectId:'project-test',clientIdMasked:'client',hasSecret:true,hasApiKey:true};
   if(command==='youtube_upload_video')return {videoId:'yt-test-1',scheduled:true,verified:true};
   throw new Error(`Unexpected Tauri command in upload contract test: ${command}`);
  });
 });
 it('youtubeUpload invokes existing Rust command exactly once with exact selected video payload',async()=>{
  const result=await api.youtubeUpload('profile-1','job-005','/tmp/Ready Videos.mov','Title 005','Description 005',['tag1','tag2'],'2030-09-20T11:00:00.000Z','10','publish:test');
  expect(result).toMatchObject({videoId:'yt-test-1',verified:true});
  expect(mocks.invoke.mock.calls.filter(([command])=>command==='youtube_oauth_profiles')).toHaveLength(1);
  expect(mocks.invoke.mock.calls.filter(([command])=>command==='youtube_google_config_status')).toHaveLength(1);
  const uploadCalls=mocks.invoke.mock.calls.filter(([command])=>command==='youtube_upload_video');
  expect(uploadCalls).toHaveLength(1);
  expect(uploadCalls[0]).toEqual(['youtube_upload_video',{
   profileId:'profile-1',jobId:'job-005',filePath:'/tmp/Ready Videos.mov',title:'Title 005',description:'Description 005',tags:['tag1','tag2'],publishAt:'2030-09-20T11:00:00.000Z',categoryId:'10',operationId:'publish:test'
  }]);
 });
});
