from __future__ import annotations
from pathlib import Path
import hashlib,json,re,shutil,sys

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.vyron-v100')
HERE=Path('vyron-v100')
VERSION='1.0.2'

PROTECTED=[
    'src/MetadataPage.tsx','src/ExistingVideos.tsx','src/QuotaMeter.tsx','src/youtubeQuota.ts',
    'src/ProductionOS.tsx','src/ProductionWorkspace.tsx','src/AccountsPage.tsx','src/SettingsOS.tsx',
    'src/autopilotRuntime.ts','src/api.ts','src/store.ts','src-tauri/src/youtube.rs'
]

def fail(msg:str): raise SystemExit(msg)
def digest(path:Path): return hashlib.sha256(path.read_bytes()).hexdigest()
def copy(src_name:str,dst_name:str|None=None):
    src=HERE/src_name; dst=ROOT/'src'/(dst_name or src_name)
    if not src.exists(): fail(f'Channel Runway overlay missing: {src}')
    shutil.copyfile(src,dst)

def main():
    pkg_path=ROOT/'package.json'
    if not pkg_path.exists(): fail('VYRON source root missing')
    pkg=json.loads(pkg_path.read_text())
    if pkg.get('version')!='1.0.1': fail(f"Channel Runway requires verified VYRON 1.0.1 overlay, got {pkg.get('version')}")

    protected_before={rel:digest(ROOT/rel) for rel in PROTECTED}
    conf_path=ROOT/'src-tauri/tauri.conf.json'
    conf_before=json.loads(conf_path.read_text())
    trust_before=(
        conf_before.get('identifier'),
        json.dumps(conf_before.get('plugins',{}).get('updater',{}).get('endpoints'),sort_keys=True),
        conf_before.get('plugins',{}).get('updater',{}).get('pubkey')
    )

    for name in ['channelRunwayCore.ts','channelRunwayStore.ts','ChannelRunwayScheduler.tsx','ChannelRunway.tsx','channelRunway.test.ts']:
        copy(name)
    copy('YouTubeCenter.runway.tsx','YouTubeCenter.tsx')

    app=ROOT/'src/App.tsx'
    s=app.read_text()
    import_anchor="import { YouTubeCenter } from './YouTubeCenter';\n"
    scheduler_import="import { ChannelRunwayScheduler } from './ChannelRunwayScheduler';\n"
    if scheduler_import not in s:
        if import_anchor not in s: fail('App YouTubeCenter import anchor missing')
        s=s.replace(import_anchor,import_anchor+scheduler_import,1)
    shell='return <div className="appShell"><Sidebar'
    if '<ChannelRunwayScheduler/>' not in s:
        if shell not in s: fail('App shell anchor missing')
        s=s.replace(shell,'return <div className="appShell"><ChannelRunwayScheduler/><Sidebar',1)
    s=s.replace('VYRON 1.0.1 • macOS Apple Silicon',f'VYRON {VERSION} • macOS Apple Silicon')
    s=s.replace('VYRON 1.0.1</span>',f'VYRON {VERSION}</span>')
    app.write_text(s)

    css_path=ROOT/'src/styles.css'; addon=(HERE/'channel-runway.css').read_text()
    css=css_path.read_text()
    if 'Channel Runway — additive only' not in css: css_path.write_text(css+addon)

    pkg['version']=VERSION;pkg_path.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')
    conf=json.loads(conf_path.read_text());conf['version']=VERSION;conf_path.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
    cargo=ROOT/'src-tauri/Cargo.toml';cs=cargo.read_text();cs,n=re.subn(r'(?m)^version = "1\.0\.1"$',f'version = "{VERSION}"',cs,count=1)
    if n!=1: fail('Cargo 1.0.1 version marker missing')
    cargo.write_text(cs)

    for rel,before in protected_before.items():
        after=digest(ROOT/rel)
        if after!=before: fail(f'Protected VYRON 1.0.1 file changed by Channel Runway overlay: {rel}')

    conf_after=json.loads(conf_path.read_text())
    trust_after=(
        conf_after.get('identifier'),
        json.dumps(conf_after.get('plugins',{}).get('updater',{}).get('endpoints'),sort_keys=True),
        conf_after.get('plugins',{}).get('updater',{}).get('pubkey')
    )
    if trust_after!=trust_before: fail('Updater identifier/endpoint/public key changed')

    local_files=['src/channelRunwayCore.ts','src/channelRunwayStore.ts','src/ChannelRunwayScheduler.tsx']
    for rel in local_files:
        text=(ROOT/rel).read_text()
        for forbidden in ["from './api'",'api.','youtubeListExisting','youtubeProfileHealth','youtubeAnalytics(','youtubeDiscoverCompetitors','youtubeUpdateExisting']:
            if forbidden in text: fail(f'Channel Runway local-only violation {forbidden} in {rel}')

    ui=(ROOT/'src/ChannelRunway.tsx').read_text()
    if ui.count('api.youtubeListExisting')!=1: fail('Channel Runway must have exactly one explicit YouTube schedule sync call')
    if 'onClick={()=>void syncChannel(channel)}' not in ui: fail('Channel Runway YouTube sync is not bound to explicit click')
    if re.search(r'useEffect\([^)]*youtubeListExisting',ui,re.S): fail('Hidden YouTube sync detected in Channel Runway effect')
    if 'vyron:channel-runway:v1' not in (ROOT/'src/channelRunwayCore.ts').read_text(): fail('Channel Runway versioned storage key missing')
    if 'Asia/Krasnoyarsk' not in (ROOT/'src/channelRunwayCore.ts').read_text(): fail('Krasnoyarsk timezone contract missing')
    if 'ChannelRunwayScheduler' not in (ROOT/'src/App.tsx').read_text(): fail('Global local scheduler mount missing')
    if 'ChannelRunway' not in (ROOT/'src/YouTubeCenter.tsx').read_text(): fail('YouTube Channel Runway tab missing')
    if conf_after.get('version')!=VERSION or json.loads(pkg_path.read_text()).get('version')!=VERSION: fail('1.0.2 version preparation failed')

    print('Channel Runway overlay: PASS')
    print('Protected 1.0.1 systems unchanged:',len(PROTECTED))
    print('Prepared version:',VERSION,'(development only, not published)')

if __name__=='__main__': main()
