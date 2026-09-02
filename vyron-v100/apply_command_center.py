from __future__ import annotations
from pathlib import Path
import hashlib,json,re,shutil,sys

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.vyron-v103')
HERE=Path('vyron-v100')
VERSION='1.0.3'

PROTECTED=[
    'src/MetadataPage.tsx','src/ExistingVideos.tsx','src/QuotaMeter.tsx','src/youtubeQuota.ts',
    'src/ProductionOS.tsx','src/ProductionWorkspace.tsx','src/AccountsPage.tsx','src/SettingsOS.tsx',
    'src/autopilotRuntime.ts','src/api.ts','src/store.ts','src-tauri/src/youtube.rs',
    'src/channelRunwayCore.ts','src/channelRunwayStore.ts','src/ChannelRunwayScheduler.tsx','src/ChannelRunway.tsx'
]

def fail(msg:str): raise SystemExit(msg)
def digest(path:Path): return hashlib.sha256(path.read_bytes()).hexdigest()
def copy(src_name:str,dst_name:str|None=None):
    src=HERE/src_name;dst=ROOT/'src'/(dst_name or src_name)
    if not src.exists(): fail(f'Command Center overlay missing: {src}')
    shutil.copyfile(src,dst)

def main():
    pkg_path=ROOT/'package.json'
    conf_path=ROOT/'src-tauri/tauri.conf.json'
    if not pkg_path.exists() or not conf_path.exists(): fail('VYRON 1.0.2 source root missing')
    pkg=json.loads(pkg_path.read_text())
    if pkg.get('version')!='1.0.2': fail(f"Command Center requires exact VYRON 1.0.2 source, got {pkg.get('version')}")

    protected_before={rel:digest(ROOT/rel) for rel in PROTECTED}
    conf_before=json.loads(conf_path.read_text())
    trust_before=(
        conf_before.get('identifier'),
        json.dumps(conf_before.get('plugins',{}).get('updater',{}).get('endpoints'),sort_keys=True),
        conf_before.get('plugins',{}).get('updater',{}).get('pubkey')
    )

    for name in ['commandCenterCore.ts','commandCenterStore.ts','CommandCenter.tsx','commandCenter.test.ts']:
        copy(name)
    copy('YouTubeCenter.command-center.tsx','YouTubeCenter.tsx')

    css_path=ROOT/'src/styles.css';addon=(HERE/'command-center.css').read_text();css=css_path.read_text()
    if 'VYRON Command Center 1.0.3' not in css: css_path.write_text(css+addon)

    app=ROOT/'src/App.tsx';s=app.read_text();before=s
    s=s.replace('VYRON 1.0.2 • macOS Apple Silicon',f'VYRON {VERSION} • macOS Apple Silicon')
    s=s.replace('VYRON 1.0.2</span>',f'VYRON {VERSION}</span>')
    app.write_text(s)

    pkg['version']=VERSION;pkg_path.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')
    conf=json.loads(conf_path.read_text());conf['version']=VERSION;conf_path.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
    cargo=ROOT/'src-tauri/Cargo.toml';cs=cargo.read_text();cs,n=re.subn(r'(?m)^version = "1\.0\.2"$',f'version = "{VERSION}"',cs,count=1)
    if n!=1: fail('Cargo 1.0.2 version marker missing')
    cargo.write_text(cs)

    for rel,before_hash in protected_before.items():
        if digest(ROOT/rel)!=before_hash: fail(f'Protected VYRON 1.0.2 file changed by Command Center overlay: {rel}')

    conf_after=json.loads(conf_path.read_text())
    trust_after=(
        conf_after.get('identifier'),
        json.dumps(conf_after.get('plugins',{}).get('updater',{}).get('endpoints'),sort_keys=True),
        conf_after.get('plugins',{}).get('updater',{}).get('pubkey')
    )
    if trust_after!=trust_before: fail('Updater identifier/endpoint/public key changed')

    local_files=['src/commandCenterCore.ts','src/commandCenterStore.ts','src/CommandCenter.tsx']
    for rel in local_files:
        text=(ROOT/rel).read_text()
        for forbidden in ["from './api'",'api.','youtubeListExisting','youtubeProfileHealth','youtubeAnalytics(','youtubeDiscoverCompetitors','youtubeUpdateExisting','youtubeUpload']:
            if forbidden in text: fail(f'Command Center local-only violation {forbidden} in {rel}')

    yt=(ROOT/'src/YouTubeCenter.tsx').read_text()
    if "import {CommandCenter} from './CommandCenter';" not in yt: fail('Command Center import missing')
    if "['command','Командный центр']" not in yt or "tab==='command'&&<CommandCenter/>" not in yt: fail('Command Center tab missing')
    if 'ChannelRunway' not in yt: fail('Existing Channel Runway tab was lost')
    if 'vyron:command-center:v1' not in (ROOT/'src/commandCenterCore.ts').read_text(): fail('Command Center storage key missing')
    if conf_after.get('version')!=VERSION or json.loads(pkg_path.read_text()).get('version')!=VERSION: fail('1.0.3 version preparation failed')
    if before==s: print('App had no visible 1.0.2 version marker; package/Tauri version still bumped safely')

    print('Command Center overlay: PASS')
    print('Protected 1.0.2 systems unchanged:',len(PROTECTED))
    print('Prepared version:',VERSION)

if __name__=='__main__': main()
