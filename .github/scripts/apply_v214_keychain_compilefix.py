#!/usr/bin/env python3
import pathlib,sys
root=pathlib.Path(sys.argv[1]).resolve()

def read(rel): return (root/rel).read_text()
def write(rel,s): (root/rel).write_text(s)
def replace_once(rel,old,new):
    s=read(rel); n=s.count(old)
    if n != 1: raise SystemExit(f'{rel}: anchor count={n}: {old[:120]!r}')
    write(rel,s.replace(old,new,1))

replace_once('src-tauri/src/security.rs',
'''  let (read_status,read_osstatus,read_error)=("NOT_RUN".to_string(),None,None);''',
'''  let (read_status,read_osstatus,read_error):(String,Option<i32>,Option<String>)=("NOT_RUN".to_string(),None,None);''')

replace_once('src-tauri/src/youtube.rs',
'''    let old = load_google_config_for_secret_operation(&app).unwrap_or_default();
    let c = GoogleConfig {''',
'''    let old = load_google_config_for_secret_operation(&app).unwrap_or_default();
    let client_secret_present=old.client_secret_present||!client_secret.is_empty();
    let c = GoogleConfig {''')
replace_once('src-tauri/src/youtube.rs',
'''        client_secret_present:old.client_secret_present||!client_secret.is_empty(),''',
'''        client_secret_present,''')
replace_once('src-tauri/src/youtube.rs',
'''security::get_secret(&oauth_key(&profile.id,"refresh_token"))''',
'''security::get_secret_cached(&oauth_key(&profile.id,"refresh_token"))''')
replace_once('src-tauri/src/youtube.rs',
'''security::get_secret(&oauth_key(&profile_id, "refresh_token"))''',
'''security::get_secret_cached(&oauth_key(&profile_id, "refresh_token"))''')

replace_once('src/keychainPassiveArchitecture.test.ts',
'''import fs from 'node:fs';
const rust=fs.readFileSync(new URL('../src-tauri/src/youtube.rs',import.meta.url),'utf8');
const storage=fs.readFileSync(new URL('../src-tauri/src/storage.rs',import.meta.url),'utf8');
const security=fs.readFileSync(new URL('../src-tauri/src/security.rs',import.meta.url),'utf8');''',
'''import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const rust=fs.readFileSync(fileURLToPath(new URL('../src-tauri/src/youtube.rs',import.meta.url)),'utf8');
const storage=fs.readFileSync(fileURLToPath(new URL('../src-tauri/src/storage.rs',import.meta.url)),'utf8');
const security=fs.readFileSync(fileURLToPath(new URL('../src-tauri/src/security.rs',import.meta.url)),'utf8');''')

sec=read('src-tauri/src/security.rs')
anchor=''' #[test]\n fn denial_guard_blocks_retry_loop(){'''
test=''' #[test]\n fn post_save_verification_uses_session_cache(){\n  use std::sync::atomic::{AtomicUsize,Ordering as AO};\n  static READS:AtomicUsize=AtomicUsize::new(0);let account="test.cache.post-save";invalidate_secret_cache(account);READS.store(0,AO::SeqCst);\n  // set_secret() calls remember_secret() after a successful native write. Model that successful write here without touching the real Keychain.\n  remember_secret(account,"saved-secret");\n  let verified=get_secret_cached_with(account,|_|{READS.fetch_add(1,AO::SeqCst);Ok(Some("backend-should-not-run".into()))}).unwrap();\n  assert_eq!(verified.as_deref(),Some("saved-secret"));assert_eq!(READS.load(AO::SeqCst),0);invalidate_secret_cache(account);\n }\n'''
if sec.count(anchor)!=1: raise SystemExit('security.rs: denial test anchor mismatch')
write('src-tauri/src/security.rs',sec.replace(anchor,test+anchor,1))

y=read('src-tauri/src/youtube.rs')
if 'security::get_secret(' in y: raise SystemExit('youtube.rs still contains direct security::get_secret readback')
if y.count('security::get_secret_cached(&oauth_key(') < 2: raise SystemExit('youtube.rs cached verification paths missing')
if 'post_save_verification_uses_session_cache' not in read('src-tauri/src/security.rs'): raise SystemExit('cache verification test missing')
print('VYRON 2.1.4 Keychain compile/readback fix applied')
