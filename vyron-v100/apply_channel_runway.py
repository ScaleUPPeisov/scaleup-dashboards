from __future__ import annotations
from pathlib import Path
import shutil,sys

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.vyron-v100')
HERE=Path('vyron-v100')

def fail(msg:str): raise SystemExit(msg)
def copy(name:str):
    src=HERE/name;dst=ROOT/'src'/name
    if not src.exists(): fail(f'runway override missing: {src}')
    shutil.copyfile(src,dst)

def main():
    if not (ROOT/'package.json').exists(): fail('VYRON source root missing')
    # This patch is intentionally isolated from apply_v100.py and public release workflow.
    for name in ['channelRunway.ts','ChannelRunway.tsx','ChannelRunwayRuntime.tsx','channelRunway.test.ts']:
        copy(name)

    app=ROOT/'src/App.tsx';s=app.read_text()
    import_anchor="import { YouTubeCenter } from './YouTubeCenter';\n"
    if "import {ChannelRunwayRuntime} from './ChannelRunwayRuntime';" not in s:
        if import_anchor not in s: fail('App YouTubeCenter import marker missing')
        s=s.replace(import_anchor,import_anchor+"import {ChannelRunwayRuntime} from './ChannelRunwayRuntime';\n",1)
    return_anchor='return <div className="appShell"><Sidebar page={page} setPage={setPage}/>'
    if '<ChannelRunwayRuntime/>' not in s:
        if return_anchor not in s: fail('App shell marker missing')
        s=s.replace(return_anchor,'return <div className="appShell"><ChannelRunwayRuntime/><Sidebar page={page} setPage={setPage}/>',1)
    app.write_text(s)

    checks={
      'src/channelRunway.ts':['vyron:channel-runway:v1','Asia/Krasnoyarsk','nextKrasnoyarskSixAt','ESTIMATED_VIDEO_WRITE_UNITS'],
      'src/ChannelRunway.tsx':['CHANNEL RUNWAY','0 API units','Открыть синхронизацию'],
      'src/ChannelRunwayRuntime.tsx':['shouldRunDailyChannelRunway','nextKrasnoyarskSixAt'],
      'src/YouTubeCenter.tsx':['ChannelRunway','План каналов'],
      'src/App.tsx':['ChannelRunwayRuntime'],
    }
    for rel,marks in checks.items():
        text=(ROOT/rel).read_text()
        for mark in marks:
            if mark not in text: fail(f'Channel Runway contract missing {mark} in {rel}')
    forbidden=['youtubeListExisting','youtubeUpdateExisting','youtubeProfileHealth','refreshChannelAnalytics','youtubeDiscoverCompetitors','api.','invoke(']
    joined='\n'.join((ROOT/'src'/n).read_text() for n in ['channelRunway.ts','ChannelRunway.tsx','ChannelRunwayRuntime.tsx'])
    for mark in forbidden:
        if mark in joined: fail(f'Channel Runway must remain local-only: {mark}')
    print('VYRON Channel Runway isolated patch applied: local-only / no release')

if __name__=='__main__': main()
