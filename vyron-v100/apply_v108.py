#!/usr/bin/env python3
from pathlib import Path
import json,plistlib,re,sys

VERSION='1.0.8'
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def need(rel):
    p=ROOT/rel
    if not p.is_file(): raise SystemExit(f'VYRON 1.0.8: missing {rel}')
    return p

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.8: '+msg)

pkg=need('package.json');pkg_data=json.loads(pkg.read_text(encoding='utf-8'))
confp=need('src-tauri/tauri.conf.json');conf=json.loads(confp.read_text(encoding='utf-8'))
must(pkg_data.get('version')=='1.0.7','expected package 1.0.7 baseline')
must(conf.get('version')=='1.0.7','expected Tauri 1.0.7 baseline')

# macOS TCC: explain why VYRON accesses ~/Downloads. Tauri merges src-tauri/Info.plist
# into the generated bundle Info.plist. Preserve every existing custom key.
info_path=ROOT/'src-tauri/Info.plist'
info={}
if info_path.is_file():
    with info_path.open('rb') as f: info=plistlib.load(f)
info['NSDownloadsFolderUsageDescription']='VYRON needs access to the Downloads folder to automatically collect images for Production.'
with info_path.open('wb') as f: plistlib.dump(info,f,fmt=plistlib.FMT_XML,sort_keys=False)

# If this exact application already uses App Sandbox, extend its existing
# entitlement set with read-only Downloads access. Never enable App Sandbox here:
# that would restrict unrelated VYRON workflows and is outside this hotfix.
mac=(conf.get('bundle') or {}).get('macOS') or {}
ent_ref=mac.get('entitlements')
if ent_ref:
    ent_path=(ROOT/'src-tauri'/ent_ref).resolve() if not Path(ent_ref).is_absolute() else Path(ent_ref)
    if not ent_path.is_file():
        # Tauri resolves relative entitlements from src-tauri; also tolerate paths
        # already containing src-tauri in old configs.
        ent_path=(ROOT/ent_ref).resolve()
    if ent_path.is_file():
        with ent_path.open('rb') as f: ent=plistlib.load(f)
        if ent.get('com.apple.security.app-sandbox') is True:
            ent['com.apple.security.files.downloads.read-only']=True
            with ent_path.open('wb') as f: plistlib.dump(ent,f,fmt=plistlib.FMT_XML,sort_keys=False)

# Version bump only; identity/updater trust must remain unchanged.
pkg_data['version']=VERSION
pkg.write_text(json.dumps(pkg_data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
conf['version']=VERSION
confp.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

cargo=need('src-tauri/Cargo.toml');cs=cargo.read_text(encoding='utf-8')
cs2,n=re.subn(r'(?m)^version\s*=\s*"1\.0\.7"\s*$',f'version = "{VERSION}"',cs,count=1)
must(n==1,'Cargo 1.0.7 version marker missing')
cargo.write_text(cs2,encoding='utf-8')

app=need('src/App.tsx');a=app.read_text(encoding='utf-8')
a=a.replace('VYRON 1.0.7 • macOS Apple Silicon','VYRON 1.0.8 • macOS Apple Silicon')
a=a.replace('<span className="crumb">VYRON 1.0.7</span>','<span className="crumb">VYRON 1.0.8</span>')
app.write_text(a,encoding='utf-8')

# Static guarantees: the 1.0.7 collector fix must survive untouched.
native=need('src-tauri/src/production_manager.rs').read_text(encoding='utf-8')
for marker in ['collector_seen_at_start(&session,&baseline)','recursive_images(&downloads)','import_candidate_ready','fs::copy(&src,&tmp)']:
    must(marker in native,'1.0.7 collector contract lost: '+marker)
must('let mut seen=baseline;' not in native,'broken 1.0.6 startup-baseline suppression returned')

# Permission metadata must exist in the source bundle.
with info_path.open('rb') as f: final_info=plistlib.load(f)
must(bool(final_info.get('NSDownloadsFolderUsageDescription')),'Downloads usage description missing')

for rel in ['src/ProductionManager.tsx','src/productionManagerApi.ts','src/productionPrefs.ts','src-tauri/src/production_manager.rs']:
    low=(ROOT/rel).read_text(encoding='utf-8').lower()
    for bad in ['youtube_upload_video','youtube_list_existing_videos','youtube_update_existing_video','youtube_channel_analytics','youtube_channel_stats','youtube_oauth_profile_health','googleapis.com']:
        must(bad not in low,f'Zero Quota violation {rel}: {bad}')

print('VYRON 1.0.8 Downloads permission hotfix applied: PASS')
