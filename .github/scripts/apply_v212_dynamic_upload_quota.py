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

PUBLISHER_V2_PREFIX = 'PublisherOS.v2.tsx'
PUBLISHER_V2_PARTS = [f'PublisherOS.v2.tsx.gz.b64.part{i:02d}' for i in range(9)]


def read_b64(name: str) -> bytes:
    p = snap / f'{name}.gz.b64'
    if not p.is_file():
        raise SystemExit(f'missing snapshot: {p.name}')
    return base64.b64decode(''.join(p.read_text().split()), validate=True)


def read_publisher_v2_chunks() -> bytes:
    # Fail closed: production assembly uses the canonical v2 payload only.
    # Legacy PublisherOS.tsx.gz.b64(.part*) files may remain for forensics,
    # but they are never read here and can never be used as a fallback.
    actual = sorted(p.name for p in snap.glob(f'{PUBLISHER_V2_PREFIX}.gz.b64.part*'))
    if actual != PUBLISHER_V2_PARTS:
        missing = sorted(set(PUBLISHER_V2_PARTS) - set(actual))
        extra = sorted(set(actual) - set(PUBLISHER_V2_PARTS))
        raise SystemExit(f'PublisherOS v2 transport mismatch; missing={missing}, extra={extra}')
    encoded = ''.join(''.join((snap / name).read_text().split()) for name in PUBLISHER_V2_PARTS)
    try:
        return base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise SystemExit(f'PublisherOS v2 base64 decode failed: {exc}') from exc


def install(rel: str, compressed: bytes) -> None:
    try:
        data = gzip.decompress(compressed)
    except Exception as exc:
        raise SystemExit(f'{rel}: gzip decompress failed: {exc}') from exc
    actual = hashlib.sha256(data).hexdigest()
    expected = EXPECTED[rel]
    if actual != expected:
        raise SystemExit(f'{rel}: snapshot sha256 mismatch: {actual} != {expected}')
    try:
        data.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise SystemExit(f'{rel}: snapshot is not valid UTF-8: {exc}') from exc
    out = root / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    print(f'{rel}: dynamic upload quota snapshot applied ({actual[:12]})')


install('src/youtubeQuota.ts', read_b64('youtubeQuota.ts'))
install('src/api.ts', read_b64('api.ts'))
install('src/PublisherOS.tsx', read_publisher_v2_chunks())
install('src/SettingsOS.tsx', read_b64('SettingsOS.tsx'))
install('src/publisherQuota.ts', read_b64('publisherQuota.ts'))
install('src/publisherQuota.test.ts', read_b64('publisherQuota.test.ts'))
install('src/dynamicUploadQuota.test.ts', read_b64('dynamicUploadQuota.test.ts'))

publisher = (root / 'src/PublisherOS.tsx').read_text()
for contract in ('youtubeQuotaProjectKey', 'youtubeUploadQuotaSnapshot', 'uploadQuotaCapacity'):
    if contract not in publisher:
        raise SystemExit(f'PublisherOS v2 contract missing: {contract}')
print('PublisherOS transport contract: NEW V2 PAYLOAD ONLY')
print('VYRON 2.1.2 dynamic upload quota overlay: APPLIED')
