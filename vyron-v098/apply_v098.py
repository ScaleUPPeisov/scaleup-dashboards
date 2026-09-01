from __future__ import annotations

from pathlib import Path
import base64
import gzip
import hashlib
import json
import subprocess

ROOT=Path('.vyron-v051')
VERSION='0.9.8'
EXPECTED_B64_SHA256='05188747ad7a6c13b150eb74764cb63dc1152b652972f698b75cd11a43529447'
EXPECTED_PATCH_SHA256='a9a552507239c08706f6c88c7488b0af756bc49585a72c306b59cee68b85b874'
PARTS=[
 ('patch.part00','ac1c00b576b03db710089d60b347cc09ee89d12a596dbd9551b0931ef8b6c341'),
 ('patch.part01','34df67e1a1f3217f7d9ccda0ded7b2aeb746d3e35a97db66aa6db80e09f8a94e'),
 ('patch.part02','5d47fc64a62176ac0e22be13b59fea5b66b83819d08f6b5853473ddb3cd713af'),
 ('patch.part03','b431c00c143c2431749749caa4088b1c70487e298798ba3019434c45033fac55'),
 ('patch.part04','a83c7cc35e98dc3d537e69df173e953f7796953712c0e3a2b107a987d9e34ca2'),
 ('patch.part05','e50a0d8f8dcfcbae08ad6d715b2a195c9fa8916950c2511738768ab3e1f78dea'),
 ('patch.part06','cdade00727c62793cc1b5c1481ee39e8242cefa9c670bfb3a5e4749c9929100b'),
]

def fail(msg:str)->None: raise SystemExit(msg)

def main()->None:
    if not ROOT.is_dir(): fail('VYRON source root missing')
    pkg=json.loads((ROOT/'package.json').read_text())
    if pkg.get('version')!='0.9.7': fail(f"Expected VYRON 0.9.7 base, got {pkg.get('version')}")

    chunks=[]
    for name,expected_sha in PARTS:
        p=Path('vyron-v098')/name
        if not p.is_file(): fail(f'Missing VYRON 0.9.8 payload part: {name}')
        data=p.read_bytes().strip()
        actual=hashlib.sha256(data).hexdigest()
        if actual!=expected_sha: fail(f'VYRON 0.9.8 payload part SHA mismatch: {name}')
        chunks.append(data)
    raw_b64=b''.join(chunks)
    if hashlib.sha256(raw_b64).hexdigest()!=EXPECTED_B64_SHA256: fail('VYRON 0.9.8 combined base64 SHA mismatch')
    try: patch=gzip.decompress(base64.b64decode(raw_b64,validate=True))
    except Exception as exc: fail(f'VYRON 0.9.8 payload decode failed: {exc}')
    if hashlib.sha256(patch).hexdigest()!=EXPECTED_PATCH_SHA256: fail('VYRON 0.9.8 decoded patch SHA mismatch')

    patch_file=Path('/tmp/vyron-v098.patch');patch_file.write_bytes(patch)
    dry=subprocess.run(['patch','-p2','--dry-run','-d',str(ROOT),'-i',str(patch_file)],capture_output=True,text=True)
    if dry.returncode!=0: fail('VYRON 0.9.8 dry-run failed:\n'+dry.stdout+'\n'+dry.stderr)
    run=subprocess.run(['patch','-p2','-d',str(ROOT),'-i',str(patch_file)],capture_output=True,text=True)
    if run.returncode!=0: fail('VYRON 0.9.8 patch failed:\n'+run.stdout+'\n'+run.stderr)

    pkg=json.loads((ROOT/'package.json').read_text())
    if pkg.get('version')!=VERSION: fail('package.json version is not 0.9.8')
    checks={
      'src/youtubeQuota.ts':['quotaExceeded','America/Los_Angeles','youtubeGuardedCall'],
      'src/MetadataPage.tsx':['metadata-draft:v1','Черновик сохраняется автоматически','pausedByQuota','scheduleAccepted'],
      'src/App.tsx':['quotaGuardBanner','YouTube API — дневная квота исчерпана'],
      'src-tauri/src/youtube.rs':['metadata_needed','schedule_needed','snippet,status','scheduleAccepted','skipped'],
    }
    for rel,marks in checks.items():
        text=(ROOT/rel).read_text()
        for mark in marks:
            if mark not in text: fail(f'Missing VYRON 0.9.8 marker {mark} in {rel}')
    print(f'VYRON {VERSION} quota/session patch applied: {len(patch)} bytes')
    print(f'patch sha256={EXPECTED_PATCH_SHA256}')

if __name__=='__main__': main()
