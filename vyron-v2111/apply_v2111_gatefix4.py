#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

p=root/'src-tauri/src/youtube.rs';s=p.read_text()
old='verify_uploaded_video(&app,&client,&token,&video_id,&profile.channel_id,operation_id.as_deref())'
new='verify_uploaded_video(&app,&client,&token,&video_id,profile.channel_id.as_deref().unwrap_or(""),operation_id.as_deref())'
if old not in s: raise SystemExit('initial upload verification channel anchor missing')
s=s.replace(old,new,1)
old='verify_uploaded_video(&app,&client,&token,&video_id,&profile.channel_id,session.operation_id.as_deref())'
new='verify_uploaded_video(&app,&client,&token,&video_id,profile.channel_id.as_deref().unwrap_or(""),session.operation_id.as_deref())'
if old not in s: raise SystemExit('resume verification channel anchor missing')
s=s.replace(old,new,1);p.write_text(s)

# Real frontend API/Tauri integration test: exact command and payload, not a static grep.
p=root/'src/v2111TauriInvoke.test.ts';p.write_text(r'''import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@tauri-apps/api/app',()=>({getVersion:vi.fn(async()=> '2.1.1')}));
vi.mock('@tauri-apps/api/event',()=>({listen:vi.fn(async()=>()=>{})}));
vi.mock('@tauri-apps/plugin-dialog',()=>({open:vi.fn()}));
vi.mock('@tauri-apps/plugin-opener',()=>({openPath:vi.fn(),openUrl:vi.fn()}));
vi.mock('@tauri-apps/plugin-updater',()=>({check:vi.fn()}));
vi.mock('@tauri-apps/plugin-process',()=>({relaunch:vi.fn()}));
vi.mock('./youtubeQuota',()=>({
 recordYoutubeApiRequest:vi.fn(),recordYoutubeCommand:vi.fn(),
 youtubeGuardedCall:(fn:()=>unknown)=>fn()
}));
vi.mock('./shortsCore',()=>({mutateShortsState:vi.fn(),recordShortUploadAttempt:vi.fn()}));
import {api} from './api';

describe('VYRON 2.1.1 YouTube frontend → Tauri invoke',()=>{
 beforeEach(()=>mocks.invoke.mockReset());
 it('youtubeUpload invokes existing Rust command with exact selected video payload',async()=>{
  mocks.invoke.mockResolvedValue({videoId:'yt-test-1',scheduled:true,verified:true});
  const result=await api.youtubeUpload('profile-1','job-005','/tmp/Ready Videos.mov','Title 005','Description 005',['tag1','tag2'],'2030-09-20T11:00:00.000Z','10','publish:test');
  expect(result).toMatchObject({videoId:'yt-test-1',verified:true});
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  expect(mocks.invoke).toHaveBeenCalledWith('youtube_upload_video',{
   profileId:'profile-1',jobId:'job-005',filePath:'/tmp/Ready Videos.mov',title:'Title 005',description:'Description 005',tags:['tag1','tag2'],publishAt:'2030-09-20T11:00:00.000Z',categoryId:'10',operationId:'publish:test'
  });
 });
 it('youtubeUpload propagates the real Tauri backend failure',async()=>{
  mocks.invoke.mockRejectedValue(new Error('YOUTUBE_UPLOAD_INIT 400: invalidPublishAt'));
  await expect(api.youtubeUpload('p','j','/tmp/a.mov','T','D',[],'2030-01-01T00:00:00Z','10','op')).rejects.toThrow('invalidPublishAt');
 });
});
''')
print('VYRON 2.1.1 gatefix4 applied')
