#!/usr/bin/env python3
from pathlib import Path
import json,re,sys

VERSION='1.0.7'
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def need(rel):
    p=ROOT/rel
    if not p.is_file(): raise SystemExit(f'VYRON 1.0.7: missing {rel}')
    return p

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.7: '+msg)

# Exact released 1.0.6 is the only allowed baseline.
pkg=need('package.json');pkg_data=json.loads(pkg.read_text(encoding='utf-8'))
confp=need('src-tauri/tauri.conf.json');conf=json.loads(confp.read_text(encoding='utf-8'))
must(pkg_data.get('version')=='1.0.6','expected package 1.0.6 baseline')
must(conf.get('version')=='1.0.6','expected Tauri 1.0.6 baseline')

# -----------------------------------------------------------------------------
# CRITICAL DOWNLOADS FIX
#
# 1.0.6 passed a snapshot of every image already present in Downloads into the
# watcher and initialized `seen` from that snapshot. That made every image that
# existed before pressing "НАЧАТЬ СБОР" permanently invisible to the collector.
#
# Keep the existing recursive scanner, stability checks, COPY behavior,
# persistence and per-channel session. Only change what is considered already
# processed: ONLY source paths persisted in this import session are `seen`.
# The startup Downloads snapshot is deliberately NOT a deduplication source.
# -----------------------------------------------------------------------------
p=need('src-tauri/src/production_manager.rs')
s=p.read_text(encoding='utf-8')
must('fn spawn_import_watcher' in s,'Downloads watcher missing')
must('recursive_images(&downloads)' in s,'1.0.6 recursive Downloads scanner missing')
must('image_snapshot(&downloads)' in s,'1.0.6 startup snapshot marker missing')
must('if !import_candidate_ready(&src,&mut pending){continue;}' in s,'file stability gate missing')
must('fs::copy(&src,&tmp)' in s,'COPY import path missing')

helper='''fn collector_seen_at_start(session:&ImportSession,_startup_snapshot:&HashSet<String>)->HashSet<String>{\n    // Only files already persisted by THIS session are duplicates.\n    // Images merely present in Downloads before Start remain valid candidates.\n    session.collected.iter().map(|x|x.source_path.clone()).collect()\n}\n\n'''
watcher='fn spawn_import_watcher(app:AppHandle, workspace:String, channel_id:String, mut session:ImportSession, baseline:HashSet<String>) -> Result<(),String> {'
if 'fn collector_seen_at_start(' not in s:
    must(watcher in s,'watcher signature changed unexpectedly')
    s=s.replace(watcher,helper+watcher,1)

pattern=re.compile(r'''(?P<indent>\s*)let mut seen=baseline;\n(?P=indent)let mut pending=HashMap::<String,ImportProbe>::new\(\);\n(?P=indent)let mut last_error:Option<String>=None;\n(?P=indent)for x in &session\.collected \{ seen\.insert\(x\.source_path\.clone\(\)\); \}''')
replacement='''\n        let mut seen=collector_seen_at_start(&session,&baseline);\n        let mut pending=HashMap::<String,ImportProbe>::new();\n        let mut last_error:Option<String>=None;'''
s2,n=pattern.subn(replacement,s,count=1)
must(n==1,'1.0.6 eager startup baseline block not found exactly once')
s=s2

# Add concise native diagnostics without changing UI/design.
start_log='''    eprintln!("[image-collector] session started channel={} session={} downloads={} restored={}",channel_id,session.session_id,downloads.display(),session.collected.len());\n'''
anchor='    let import_dir=PathBuf::from(&session.import_path);\n'
must(anchor in s,'watcher import-dir anchor missing')
if '[image-collector] session started' not in s:
    s=s.replace(anchor,anchor+start_log,1)

# `key` is moved into CollectedImage.source_path, so diagnostics read the source
# back from the persisted item instead of borrowing a moved String.
import_log='''                eprintln!("[image-collector] imported channel={} session={} count={} source={}",channel_id,session.session_id,session.collected.len(),session.collected.last().map(|x|x.source_path.as_str()).unwrap_or(""));\n'''
anchor='                session.collected.push(item);\n'
must(anchor in s,'collector persisted item anchor missing')
if '[image-collector] imported' not in s:
    s=s.replace(anchor,anchor+import_log,1)

# Existing recursive scanner must keep case-insensitive image support and hidden
# file filtering. We intentionally do not modify files.rs/manual import.
must("name.starts_with('.')" in s,'hidden-file guard missing')

# Regression test: a file present in the startup snapshot MUST remain collectible
# when it was not already persisted in the current import session.
tp=need('src-tauri/src/production_manager_tests.rs')
t=tp.read_text(encoding='utf-8')
if 'acceptance_existing_downloads_are_collectible_on_start' not in t:
    t+=r'''

#[test]
fn acceptance_existing_downloads_are_collectible_on_start(){
    let(ws,cid,_)=fixture(1,2);
    let path=session_path(&ws.to_string_lossy(),&cid).unwrap();
    let mut session:ImportSession=read_json(&path);
    session.collected.clear();
    let existing=std::env::temp_dir().join("ChatGPT Image 3 сент. 18_54 (7) — копия 2.png").to_string_lossy().into_owned();
    let mut startup=HashSet::new();startup.insert(existing.clone());
    let seen=collector_seen_at_start(&session,&startup);
    assert!(!seen.contains(&existing),"startup Downloads snapshot must not suppress pre-existing images");
    cleanup(&ws);
}
'''
tp.write_text(t,encoding='utf-8')

p.write_text(s,encoding='utf-8')

# Version bump only. Keep app identity/updater trust and every protected subsystem.
pkg_data['version']=VERSION
pkg.write_text(json.dumps(pkg_data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
conf['version']=VERSION
confp.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

cargo=need('src-tauri/Cargo.toml');cs=cargo.read_text(encoding='utf-8')
cs2,n=re.subn(r'(?m)^version\s*=\s*"1\.0\.6"\s*$',f'version = "{VERSION}"',cs,count=1)
must(n==1,'Cargo 1.0.6 version marker missing')
cargo.write_text(cs2,encoding='utf-8')

app=need('src/App.tsx');a=app.read_text(encoding='utf-8')
a=a.replace('VYRON 1.0.6 • macOS Apple Silicon','VYRON 1.0.7 • macOS Apple Silicon')
a=a.replace('<span className="crumb">VYRON 1.0.6</span>','<span className="crumb">VYRON 1.0.7</span>')
app.write_text(a,encoding='utf-8')

# Static release gates.
native=p.read_text(encoding='utf-8')
must('collector_seen_at_start(&session,&baseline)' in native,'session-only dedup not wired')
must('let mut seen=baseline;' not in native,'broken startup-baseline suppression survived')
must('recursive_images(&downloads)' in native,'recursive scanner lost')
must('import_candidate_ready' in native,'stability gate lost')
must('fs::copy(&src,&tmp)' in native,'COPY semantics lost')
for rel in ['src/ProductionManager.tsx','src/productionManagerApi.ts','src-tauri/src/production_manager.rs']:
    low=(ROOT/rel).read_text(encoding='utf-8').lower()
    for bad in ['youtube_upload_video','youtube_list_existing_videos','youtube_update_existing_video','youtube_channel_analytics','youtube_channel_stats','youtube_oauth_profile_health','googleapis.com']:
        must(bad not in low,f'Zero Quota violation {rel}: {bad}')

print('VYRON 1.0.7 Downloads hotfix applied: PASS')
