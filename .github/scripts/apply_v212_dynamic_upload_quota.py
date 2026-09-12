#!/usr/bin/env python3
from __future__ import annotations

import base64
import gzip
import hashlib
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
repo = Path(__file__).resolve().parents[2]
snap = repo / '.github' / 'vyron-v212-dynamic'

EXPECTED = {
    'src/youtubeQuota.ts': 'eb957c73e4be55849340f69bf895e07608ed11f70c2ec6f5ee46623b892d4199',
    'src/api.ts': 'f330004ef063b16ab17f5c7345144348b7645e6f2b2ea3c137e2326c8df6ab49',
    'src/PublisherOS.tsx': '13fcfe32368312dc907b7c1c2a04727ed14e6df3c3933b102ee6c41655593c98',
    'src/SettingsOS.tsx': '2d007578886fb58601f0bc7c04a587a3842e4b447b7290c592a1968b4ae573da',
    'src/publisherQuota.ts': 'b208e2e74c7e26551cba3e3b0e239f1ad9e336fa28c1cdde8055f45820b955f9',
    'src/publisherQuota.test.ts': '92da17850867597ea8ace89ef91887be199068e6bc229a9705cd9e9fab4d3280',
    'src/dynamicUploadQuota.test.ts': '8c5486708ec49da90c64017263f3053de6f98491f06d5cc27860609149d08b45',
}


def read_b64(name: str) -> bytes:
    p = snap / f'{name}.gz.b64'
    return base64.b64decode(''.join(p.read_text().split()))


def read_chunks(prefix: str) -> bytes:
    parts = sorted(snap.glob(f'{prefix}.gz.b64.part*'))
    if not parts:
        raise SystemExit(f'no snapshot chunks for {prefix}')
    encoded = ''.join(''.join(p.read_text().split()) for p in parts)
    return base64.b64decode(encoded)


def install(rel: str, compressed: bytes) -> None:
    data = gzip.decompress(compressed)
    actual = hashlib.sha256(data).hexdigest()
    expected = EXPECTED[rel]
    if actual != expected:
        raise SystemExit(f'{rel}: snapshot sha256 mismatch: {actual} != {expected}')
    out = root / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    print(f'{rel}: dynamic upload quota snapshot applied ({actual[:12]})')


install('src/youtubeQuota.ts', read_b64('youtubeQuota.ts'))
install('src/api.ts', read_b64('api.ts'))
install('src/PublisherOS.tsx', read_chunks('PublisherOS.tsx'))
install('src/SettingsOS.tsx', read_b64('SettingsOS.tsx'))
install('src/publisherQuota.ts', read_b64('publisherQuota.ts'))
install('src/publisherQuota.test.ts', read_b64('publisherQuota.test.ts'))
install('src/dynamicUploadQuota.test.ts', read_b64('dynamicUploadQuota.test.ts'))

print('VYRON 2.1.2 dynamic upload quota overlay: APPLIED')
