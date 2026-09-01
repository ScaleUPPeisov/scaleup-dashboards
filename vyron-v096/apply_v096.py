from __future__ import annotations
from pathlib import Path
import base64,hashlib,tarfile,json
ROOT=Path('.vyron-v051')
PART=Path('vyron-v096')
VERSION='0.9.6'
EXPECTED_LEN=139856
EXPECTED_SHA='f8f416b0e2f424c56d407c95a5ef085b68f8d257e0637fbfc8285fb0584cc95c'
def fail(m): raise SystemExit(m)
def main():
    if not ROOT.is_dir(): fail('VYRON source root missing')
    payload=PART/'payload.b64'
    if not payload.is_file(): fail('Missing VYRON 0.9.6 payload')
    encoded=payload.read_text().strip()
    if len(encoded)!=EXPECTED_LEN: fail(f'payload length {len(encoded)} != {EXPECTED_LEN}')
    raw=base64.b64decode(encoded,validate=True)
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=EXPECTED_SHA: fail(f'payload sha {digest} != {EXPECTED_SHA}')
    archive=Path('/tmp/vyron-v096.tar.gz');archive.write_bytes(raw);root=ROOT.resolve()
    with tarfile.open(archive,'r:gz') as tf:
        for member in tf.getmembers():
            target=(ROOT/member.name).resolve()
            if target!=root and root not in target.parents: fail(f'unsafe payload path: {member.name}')
        tf.extractall(ROOT)
    pkg=json.loads((ROOT/'package.json').read_text())
    if pkg.get('version')!=VERSION: fail('package version is not 0.9.6')
    checks={
      'src/MetadataPage.tsx':['metadataVerified','scheduleError','applyReport','Применяю ${applyProgress'],
      'src/api.ts':['metadataVerified:boolean','scheduleVerified:boolean'],
      'src-tauri/src/youtube.rs':['Phase 1: metadata only','Phase 2: privacy/schedule','youtube_sanitize_tags','youtube_truncate_utf8_bytes','METADATA:'],
    }
    for rel,marks in checks.items():
        text=(ROOT/rel).read_text()
        for mark in marks:
            if mark not in text: fail(f'missing marker {mark} in {rel}')
    print(f'VYRON {VERSION} metadata-write fix applied; sha256={EXPECTED_SHA}')
if __name__=='__main__': main()
