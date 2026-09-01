from __future__ import annotations

from pathlib import Path
import base64
import gzip
import hashlib
import json
import subprocess

ROOT=Path('.vyron-v051')
PAYLOAD=Path('vyron-v098/patch.gz.b64')
VERSION='0.9.8'
EXPECTED_B64_SHA256='05188747ad7a6c13b150eb74764cb63dc1152b652972f698b75cd11a43529447'
EXPECTED_PATCH_SHA256='a9a552507239c08706f6c88c7488b0af756bc49585a72c306b59cee68b85b874'

def fail(msg:str)->None: raise SystemExit(msg)

def main()->None:
    if not ROOT.is_dir(): fail('VYRON source root missing')
    pkg=json.loads((ROOT/'package.json').read_text())
    if pkg.get('version')!='0.9.7': fail(f"Expected VYRON 0.9.7 base, got {pkg.get('version')}")
    raw_b64=PAYLOAD.read_bytes().strip()
    if hashlib.sha256(raw_b64).hexdigest()!=EXPECTED_B64_SHA256: fail('VYRON 0.9.8 payload base64 SHA mismatch')
    try: patch=gzip.decompress(base64.b64decode(raw_b64,validate=True))
    except Exception as exc: fail(f'VYRON 0.9.8 payload decode failed: {exc}')
    if hashlib.sha256(patch).hexdigest()!=EXPECTED_PATCH_SHA256: fail('VYRON 0.9.8 patch SHA mismatch')
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
