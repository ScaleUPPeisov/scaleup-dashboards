#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1])
p=root/'src-tauri/src/youtube.rs'
s=p.read_text()
old='const YOUTUBE_UPLOAD_CHUNK_BYTES:usize=32*1024*1024;'
new='''const YOUTUBE_UPLOAD_CHUNK_BYTES:usize=8*1024*1024;\nconst YOUTUBE_UPLOAD_CONNECT_TIMEOUT_SECS:u64=20;\nconst YOUTUBE_UPLOAD_REQUEST_TIMEOUT_SECS:u64=120;\nfn youtube_upload_client()->Result<reqwest::Client,String>{\n reqwest::Client::builder()\n  .connect_timeout(Duration::from_secs(YOUTUBE_UPLOAD_CONNECT_TIMEOUT_SECS))\n  .timeout(Duration::from_secs(YOUTUBE_UPLOAD_REQUEST_TIMEOUT_SECS))\n  .build().map_err(|e|format!("UPLOAD_CLIENT_BUILD_FAILED: {e}"))\n}'''
if old in s:
    s=s.replace(old,new,1)
elif 'const YOUTUBE_UPLOAD_CHUNK_BYTES:usize=8*1024*1024;' not in s:
    raise SystemExit('chunk constant anchor not found')
old_continue='let client=reqwest::Client::new();let mime=video_mime_for_path(&path);'
if old_continue in s:
    s=s.replace(old_continue,'let client=youtube_upload_client()?;let mime=video_mime_for_path(&path);',1)
elif 'let client=youtube_upload_client()?;let mime=video_mime_for_path(&path);' not in s:
    raise SystemExit('continue upload client anchor not found')
old_init='let client=reqwest::Client::new();emit_youtube_api_request(&app,"videos.insert",operation_id.as_deref());'
if old_init in s:
    s=s.replace(old_init,'let client=youtube_upload_client()?;emit_youtube_api_request(&app,"videos.insert",operation_id.as_deref());',1)
elif 'let client=youtube_upload_client()?;emit_youtube_api_request(&app,"videos.insert",operation_id.as_deref());' not in s:
    raise SystemExit('upload init client anchor not found')
old_test='mod v211_upload_transport_tests{use super::*;#[test]fn upload_chunk_is_32_mib(){assert_eq!(YOUTUBE_UPLOAD_CHUNK_BYTES,32*1024*1024);}}'
new_test='''mod v211_upload_transport_tests{use super::*;\n #[test]fn upload_chunk_is_8_mib(){assert_eq!(YOUTUBE_UPLOAD_CHUNK_BYTES,8*1024*1024);}\n #[test]fn upload_transport_has_finite_timeouts(){assert_eq!(YOUTUBE_UPLOAD_CONNECT_TIMEOUT_SECS,20);assert_eq!(YOUTUBE_UPLOAD_REQUEST_TIMEOUT_SECS,120);assert!(youtube_upload_client().is_ok());}\n}'''
if old_test in s:
    s=s.replace(old_test,new_test,1)
elif 'fn upload_chunk_is_8_mib()' not in s:
    raise SystemExit('transport test anchor not found')
p.write_text(s)
print('youtube upload transport watchdog fix applied')
