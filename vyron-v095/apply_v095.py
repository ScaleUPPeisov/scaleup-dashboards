from __future__ import annotations

from pathlib import Path
import base64
import hashlib
import json
import re
import tarfile

ROOT = Path('.vyron-v051')
PART_DIR = Path('vyron-v095')
VERSION = '0.9.5'
EXPECTED_ENCODED_LEN = 103568
EXPECTED_GZIP_SHA256 = 'afcd45c4590eab2df5ee95d564c39f767262fbb45149be94d6d0e8dae7dae39c'
EXPECTED_PARTS = [f'payload.part{i:02d}' for i in range(15)]


def fail(message: str) -> None:
    raise SystemExit(message)


def load_verified_payload() -> bytes:
    files = [PART_DIR / name for name in EXPECTED_PARTS]
    missing = [p.name for p in files if not p.is_file()]
    if missing:
        fail(f'Missing VYRON 0.9.5 payload parts: {missing}')

    encoded = ''.join(p.read_text(encoding='utf-8').strip() for p in files)
    if len(encoded) != EXPECTED_ENCODED_LEN:
        fail(f'VYRON 0.9.5 payload length mismatch: {len(encoded)} != {EXPECTED_ENCODED_LEN}')

    try:
        raw = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        fail(f'VYRON 0.9.5 payload is not valid base64: {exc}')

    digest = hashlib.sha256(raw).hexdigest()
    if digest != EXPECTED_GZIP_SHA256:
        fail(f'VYRON 0.9.5 payload SHA256 mismatch: {digest} != {EXPECTED_GZIP_SHA256}')
    return raw


def safe_extract(raw: bytes) -> list[str]:
    archive = Path('/tmp/vyron-v095-payload.tar.gz')
    archive.write_bytes(raw)
    root_resolved = ROOT.resolve()
    with tarfile.open(archive, 'r:gz') as tf:
        members = tf.getmembers()
        for member in members:
            target = (ROOT / member.name).resolve()
            if target != root_resolved and root_resolved not in target.parents:
                fail(f'Unsafe path in VYRON payload: {member.name}')
        tf.extractall(ROOT)
        return [m.name for m in members]


def bump_versions() -> None:
    package = ROOT / 'package.json'
    data = json.loads(package.read_text(encoding='utf-8'))
    data['version'] = VERSION
    package.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    lock = ROOT / 'package-lock.json'
    if lock.exists():
        data = json.loads(lock.read_text(encoding='utf-8'))
        data['version'] = VERSION
        packages = data.get('packages') or {}
        if '' in packages:
            packages['']['version'] = VERSION
        lock.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    tauri_conf = ROOT / 'src-tauri' / 'tauri.conf.json'
    data = json.loads(tauri_conf.read_text(encoding='utf-8'))
    data['version'] = VERSION
    tauri_conf.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    cargo = ROOT / 'src-tauri' / 'Cargo.toml'
    text = cargo.read_text(encoding='utf-8')
    text, count = re.subn(r'(?m)^version = "0\.9\.4"$', f'version = "{VERSION}"', text, count=1)
    if count != 1 and f'version = "{VERSION}"' not in text:
        fail('Could not bump VYRON Cargo.toml version')
    cargo.write_text(text, encoding='utf-8')

    for rel in ('src/App.tsx', 'src/SettingsOS.tsx'):
        path = ROOT / rel
        if path.exists():
            path.write_text(path.read_text(encoding='utf-8').replace('0.9.4', VERSION), encoding='utf-8')


def verify_markers() -> None:
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    if package.get('version') != VERSION:
        fail('package.json version is not 0.9.5')

    sources = '\n'.join(
        p.read_text(encoding='utf-8', errors='ignore')
        for p in (ROOT / 'src').rglob('*') if p.is_file()
    )
    for marker in ('Выбрать все', 'Последние 30 Private', 'ОЦЕНКА', 'PRIVATE', 'SCHEDULED', 'PUBLIC'):
        if marker not in sources:
            fail(f'Missing VYRON 0.9.5 operational marker: {marker}')


def main() -> None:
    if not ROOT.is_dir():
        fail(f'VYRON source root missing: {ROOT}')
    raw = load_verified_payload()
    names = safe_extract(raw)
    bump_versions()
    verify_markers()
    print(f'VYRON {VERSION} overlay verified: {len(raw)} bytes, {len(names)} files')
    print(f'payload sha256={EXPECTED_GZIP_SHA256}')


if __name__ == '__main__':
    main()
