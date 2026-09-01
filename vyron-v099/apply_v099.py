from __future__ import annotations
from pathlib import Path
import base64,gzip,hashlib,json,subprocess

ROOT=Path('.vyron-v051')
VERSION='0.9.9'
PARTS=[
 ('patch.part00','d4e2004b65818016fcee6ede89bd2ac639126a61741ee9ac4f78f1118ed0995d'),
 ('patch.part01','6cacd30725259a9bb200b2608cb401ad97be9be5b48fa2f87cce52a1d0f50209'),
 ('patch.part02','a99eb2e622228e1116e8c7cab29eb1ae4914d1db17d146e4d703e7c54dc5a81f'),
 ('patch.part03','4fd63f62510c5303d8f130ea175a88f8de2569eaa73f19e66564979f49f20ee9'),
 ('patch.part04','7139d73cc1b540003b6c9421f57bdf9fd40fa13995dcb846ca888f7a8293ca66'),
 ('patch.part05','2d38db2b995d5abf04902af5ab7b673c1e7e3a20492c87a9ef5d432a93497f98'),
]
EXPECTED_PATCH_SHA256='e3819de9a0c0c37ec8bed7f0181ecb24e7d8af7c6da74736d0ebaee42c3e76ea'

def fail(msg:str)->None: raise SystemExit(msg)

def main()->None:
    if not ROOT.is_dir(): fail('VYRON source root missing')
    pkg=json.loads((ROOT/'package.json').read_text())
    if pkg.get('version')!='0.9.8': fail(f"Expected VYRON 0.9.8 base, got {pkg.get('version')}")
    chunks=[]
    for name,sha in PARTS:
        p=Path('vyron-v099')/name
        if not p.exists(): fail(f'Missing payload part: {name}')
        raw=p.read_bytes().strip()
        if hashlib.sha256(raw).hexdigest()!=sha: fail(f'Payload part SHA mismatch: {name}')
        chunks.append(raw)
    raw_b64=b''.join(chunks)
    try: patch=gzip.decompress(base64.b64decode(raw_b64,validate=True))
    except Exception as exc: fail(f'VYRON 0.9.9 payload decode failed: {exc}')
    if hashlib.sha256(patch).hexdigest()!=EXPECTED_PATCH_SHA256: fail('VYRON 0.9.9 decoded patch SHA mismatch')
    patch_file=Path('/tmp/vyron-v099.patch');patch_file.write_bytes(patch)
    dry=subprocess.run(['patch','-p1','--dry-run','-d',str(ROOT),'-i',str(patch_file)],capture_output=True,text=True)
    if dry.returncode!=0: fail('VYRON 0.9.9 dry-run failed:\n'+dry.stdout+'\n'+dry.stderr)
    run=subprocess.run(['patch','-p1','-d',str(ROOT),'-i',str(patch_file)],capture_output=True,text=True)
    if run.returncode!=0: fail('VYRON 0.9.9 patch failed:\n'+run.stdout+'\n'+run.stderr)

    quota_meter=ROOT/'src/QuotaMeter.tsx'
    quota_text=quota_meter.read_text()
    old='saveYoutubeQuotaPlan({channels,videos});'
    new='saveYoutubeQuotaPlan({channels,videosPerChannel:videos});'
    if old not in quota_text: fail('VYRON 0.9.9 quota planner TypeScript postfix target not found')
    quota_meter.write_text(quota_text.replace(old,new,1))

    pkg=json.loads((ROOT/'package.json').read_text())
    if pkg.get('version')!=VERSION: fail('package.json version is not 0.9.9')
    checks={
      'src/QuotaMeter.tsx':['YOUTUBE API QUOTA','Live estimate','Сохранить план','Google Cloud Monitoring','videosPerChannel'],
      'src/youtubeQuota.ts':['youtubeQuotaUsage','recordYoutubeCommand','buildYoutubeQuotaPlan','ESTIMATED_VIDEO_WRITE_UNITS'],
      'src/api.ts':['getVersion','appVersion','recordYoutubeCommand'],
      'src/YouTubeCenter.tsx':['QuotaMeter'],
      'src/SettingsOS.tsx':['installedVersion','QuotaMeter'],
      'src/youtubeQuotaPlanner.test.ts':['100 channels','todayChannels'],
    }
    for rel,marks in checks.items():
        text=(ROOT/rel).read_text()
        for mark in marks:
            if mark not in text: fail(f'Missing VYRON 0.9.9 marker {mark} in {rel}')
    print(f'VYRON {VERSION} quota planner patch applied: {len(patch)} bytes')
    print('VYRON 0.9.9 quota planner TypeScript fix applied')
    print(f'patch sha256={EXPECTED_PATCH_SHA256}')

if __name__=='__main__': main()
