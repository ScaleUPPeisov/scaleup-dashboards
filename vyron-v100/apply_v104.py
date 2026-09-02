#!/usr/bin/env python3
import base64,gzip,hashlib,json,re,sys
from pathlib import Path

VERSION='1.0.4'
ROOT=Path(__file__).resolve().parent
BUNDLE=ROOT/'production-manager-v104'
TARGET=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def require(path):
    if not path.exists(): raise SystemExit(f'MISSING: {path}')
    return path

def decode_parts(names, expected_sha):
    encoded=''.join((BUNDLE/n).read_text().strip() for n in names)
    raw=gzip.decompress(base64.b64decode(encoded))
    got=hashlib.sha256(raw).hexdigest()
    if got!=expected_sha: raise SystemExit(f'SHA mismatch {names}: {got}')
    return raw

def patch(path, old, new, count=1):
    p=require(TARGET/path);s=p.read_text()
    if old not in s: raise SystemExit(f'PATCH ANCHOR MISSING {path}: {old[:90]!r}')
    s=s.replace(old,new,count)
    p.write_text(s)

def copy_text(src, dst):
    p=TARGET/dst;p.parent.mkdir(parents=True,exist_ok=True);p.write_text((BUNDLE/src).read_text())

# Final native source: immutable verified payload.
native=decode_parts(['production_manager.part00','production_manager.part01','production_manager.part02'],'28254d42041ab1fedf387c429818640207bd465fb39c9c7b6fc1fe4d71dc4c82')
(TARGET/'src-tauri/src/production_manager.rs').write_bytes(native)

# Final React manager payload.
ui=decode_parts(['ProductionManager.tsx.part00','ProductionManager.tsx.part01'],'66e53f2f477483e8a016059b2eab160a47b8f0d0207c076638685319c0c8cd05')
(TARGET/'src/ProductionManager.tsx').write_bytes(ui)
copy_text('productionManagerApi.ts','src/productionManagerApi.ts')
copy_text('ProductionStatusBridge.tsx','src/ProductionStatusBridge.tsx')
copy_text('production-manager.css','src/production-manager.css')

# Register native module and only new Tauri commands. Existing commands remain untouched.
lib=require(TARGET/'src-tauri/src/lib.rs');s=lib.read_text()
if 'mod production_manager;' not in s:
    if 'mod ai;' not in s: raise SystemExit('lib.rs module anchor missing')
    s=s.replace('mod ai;','mod ai;\nmod production_manager;',1)
commands='            production_manager::start_production_import,production_manager::stop_production_import,production_manager::production_import_status,production_manager::set_production_music_library,production_manager::index_production_music_library,production_manager::build_production_batch,production_manager::resume_production_batch,production_manager::read_production_batch_status,production_manager::list_production_batches,production_manager::production_channel_state,production_manager::validate_production_batch,production_manager::open_production_batch_in_endlume,\n'
if 'production_manager::start_production_import' not in s:
    anchor='            ai::ai_generate_metadata\n'
    if anchor not in s: raise SystemExit('lib.rs handler anchor missing')
    s=s.replace(anchor,commands+anchor,1)
lib.write_text(s)

# Extend existing Production screen; do not reorder or remove legacy Pipeline/Materials.
p=require(TARGET/'src/ProductionOS.tsx');s=p.read_text()
if "from './ProductionManager'" not in s:
    anchor="import {ProductionWorkspace} from './ProductionWorkspace';"
    if anchor not in s: raise SystemExit('ProductionOS ProductionWorkspace anchor missing')
    s=s.replace(anchor,anchor+"\nimport {ProductionManager} from './ProductionManager';",1)
s=s.replace("type Tab='queue'|'materials';","type Tab='queue'|'materials'|'manager';",1)
old='<div className="youtubeTabs productionTabs"><button className={tab===\'queue\'?\'active\':\'\'} onClick={()=>setTab(\'queue\')}>Pipeline</button><button className={tab===\'materials\'?\'active\':\'\'} onClick={()=>setTab(\'materials\')}>Материалы</button></div>'
new='<div className="youtubeTabs productionTabs"><button className={tab===\'queue\'?\'active\':\'\'} onClick={()=>setTab(\'queue\')}>Pipeline</button><button className={tab===\'materials\'?\'active\':\'\'} onClick={()=>setTab(\'materials\')}>Материалы</button><button className={tab===\'manager\'?\'active\':\'\'} onClick={()=>setTab(\'manager\')}>Автосборка</button></div>'
if old not in s: raise SystemExit('ProductionOS tabs anchor missing')
s=s.replace(old,new,1)
if "{tab==='manager'&&<ProductionManager/>}" not in s:
    anchor="  {planOpen&&<div className=\"modalBackdrop\""
    if anchor not in s: raise SystemExit('ProductionOS manager insert anchor missing')
    s=s.replace(anchor,"  {tab==='manager'&&<ProductionManager/>}\n"+anchor,1)
# New flat batch jobs have no legacy job folder; hide legacy single RenderQueue button for them.
s=s.replace("{j.status==='READY_RENDER'&&<button className=\"primary small\"","{j.status==='READY_RENDER'&&j.folder&&<button className=\"primary small\"",1)
p.write_text(s)

# Local status bridge is globally mounted but contains no YouTube calls.
p=require(TARGET/'src/App.tsx');s=p.read_text()
if "from './ProductionStatusBridge'" not in s:
    anchor="import { ChannelRunwayScheduler } from './ChannelRunwayScheduler';"
    if anchor not in s: raise SystemExit('App scheduler import anchor missing')
    s=s.replace(anchor,anchor+"\nimport { ProductionStatusBridge } from './ProductionStatusBridge';",1)
if '<ProductionStatusBridge/>' not in s:
    anchor='<ChannelRunwayScheduler/>'
    if anchor not in s: raise SystemExit('App scheduler render anchor missing')
    s=s.replace(anchor,anchor+'<ProductionStatusBridge/>',1)
s=s.replace('VYRON 1.0.3','VYRON 1.0.4')
s=s.replace('VYRON 1.0.3','VYRON 1.0.4')
p.write_text(s)

# Load isolated CSS last so the existing visual system remains the base.
p=require(TARGET/'src/main.tsx');s=p.read_text()
imp="import './production-manager.css';"
if imp not in s:
    lines=s.splitlines();idx=max((i for i,x in enumerate(lines) if x.startswith('import ')),default=-1);lines.insert(idx+1,imp);s='\n'.join(lines)+'\n'
p.write_text(s)

# Version bump only. Preserve package names, app identifier, updater endpoint and trust key.
pkg=require(TARGET/'package.json');data=json.loads(pkg.read_text());data['version']=VERSION;pkg.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
cargo=require(TARGET/'src-tauri/Cargo.toml');s=cargo.read_text();s=re.sub(r'(?m)^version\s*=\s*"1\.0\.3"\s*$',f'version = "{VERSION}"',s,count=1);cargo.write_text(s)
confp=require(TARGET/'src-tauri/tauri.conf.json');conf=json.loads(confp.read_text());conf['version']=VERSION;confp.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n')

# Guardrails: new module is local-only and protected YouTube writer/storage/legacy files are not edited by this script.
for f in ['src/ProductionManager.tsx','src/ProductionStatusBridge.tsx','src/productionManagerApi.ts','src-tauri/src/production_manager.rs']:
    text=(TARGET/f).read_text(errors='ignore')
    forbidden=['youtube_upload_video','youtube_list_existing_videos','youtube_update_existing_video','youtube_channel_analytics','youtube_channel_stats','youtube_oauth_profile_health','ytInvoke','googleapis.com']
    hit=[x for x in forbidden if x in text]
    if hit: raise SystemExit(f'ZERO QUOTA VIOLATION {f}: {hit}')
print(f'VYRON {VERSION} Production Manager overlay applied: PASS')
