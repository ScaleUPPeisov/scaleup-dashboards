#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}: {old!r}')
    path.write_text(text.replace(old, new, 1))
    print(f'{label}: patched')

# Storage Lifecycle: production trash implementation moved into the inner helper;
# assert the implementation body rather than the public Tauri wrapper.
replace_once(
    root / 'src/storageLifecycle.test.ts',
    "const three=section(prod,'pub fn delete_production_batch_projects','pub fn open_production_batch_in_endlume');",
    "const three=section(prod,'fn delete_production_batch_projects_inner','pub fn open_production_batch_in_endlume');",
    'storageLifecycle cleanup helper contract',
)

# v2.1.1 cleanup test was formatting-sensitive. Keep the semantic Rendered-root contract.
replace_once(
    root / 'src/v2111GlobalCleanup.test.ts',
    "expect(rust).toContain('let rendered=batch_root.join(\"Rendered\")')",
    "expect(rust).toContain('batch_root.join(\"Rendered\")')",
    'v2111 cleanup Rendered contract',
)

# Legacy v2.0.12 registration test is formatting/implementation-sensitive. Preserve
# the behavior contract while accepting the current rustfmt output and system-Trash cleanup.
p = root / 'src/v212CleanupCommandRegistration.test.ts'
text = p.read_text()
replacements = {
    "render_status!=\"Completed\"": "render_status != \"Completed\"",
    "let rendered=batch_root.join(\"Rendered\").canonicalize().ok();": "let rendered = batch_root.join(\"Rendered\").canonicalize().ok();",
    "fs::remove_file(&canon)": "trash::delete(&folder_canon)",
}
changed = 0
for old, new in replacements.items():
    if old in text:
        text = text.replace(old, new)
        changed += 1
if changed == 0:
    raise SystemExit('v212 cleanup registration: no stale contract anchors found')
p.write_text(text)
print(f'v212 cleanup registration contracts: patched {changed} stale anchor(s)')

schedule_patch = Path(__file__).with_name('apply_v212_schedule_continuation.py')
subprocess.run([sys.executable, str(schedule_patch), str(root)], check=True)

# The schedule continuation patch replaces the old generic sync control with an
# explicit unsynced action. Apply the legacy recovery-test contract after that
# production patch so the assertion follows the actual assembled UI.
replace_once(
    root / 'src/v2100PublishRecovery.test.ts',
    "Синхронизировать с YouTube",
    "Получить актуальное расписание канала",
    'publish recovery schedule sync UI contract',
)

quota_patch = Path(__file__).with_name('apply_v212_dynamic_upload_quota.py')
subprocess.run([sys.executable, str(quota_patch), str(root)], check=True)

# Dynamic per-project quota adds two read-only Tauri calls before the upload in
# api.youtubeUpload. The legacy integration test must still prove exactly one
# youtube_upload_video invocation and its exact payload, without treating quota
# identity reads as duplicate uploads.
(root / 'src/v2111TauriInvoke.test.ts').write_text(r'''import {beforeEach,describe,expect,it,vi} from 'vitest';
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
''')
print('v2111 Tauri upload invoke contract: patched for quota identity reads')
