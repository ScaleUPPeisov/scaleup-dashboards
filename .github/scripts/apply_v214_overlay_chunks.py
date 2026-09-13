#!/usr/bin/env python3
import base64, hashlib, json, pathlib, subprocess, sys, tempfile, zlib

def sha_file(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit('usage: apply_v214_overlay_chunks.py <source-root> <overlay-dir>')
    root = pathlib.Path(sys.argv[1]).resolve()
    overlay = pathlib.Path(sys.argv[2]).resolve()
    manifest_path = overlay / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    chunks = sorted(overlay.glob('[0-9][0-9][0-9].b64'))
    if not chunks:
        raise SystemExit(f'{overlay}: no overlay chunks')
    encoded = ''.join(p.read_text(encoding='utf-8') for p in chunks)
    patch = zlib.decompress(base64.b64decode(encoded))
    actual_patch_sha = hashlib.sha256(patch).hexdigest()
    expected_patch_sha = manifest['patch_sha256']
    if actual_patch_sha != expected_patch_sha:
        raise SystemExit(f'{manifest["name"]}: patch SHA mismatch {actual_patch_sha} != {expected_patch_sha}')
    for rel, expected in manifest['before'].items():
        p = root / rel
        if not p.is_file():
            raise SystemExit(f'{manifest["name"]}: missing baseline file {rel}')
        actual = sha_file(p)
        if actual != expected:
            raise SystemExit(f'{manifest["name"]}: baseline SHA mismatch {rel}: {actual} != {expected}')
    with tempfile.NamedTemporaryFile(prefix=f'vyron-{manifest["name"]}-', suffix='.patch', delete=False) as f:
        f.write(patch)
        patch_path = pathlib.Path(f.name)
    try:
        subprocess.run(['patch', '-p1', '--batch', '--forward', '-i', str(patch_path)], cwd=root, check=True)
    finally:
        patch_path.unlink(missing_ok=True)
    for rel, expected in manifest['after'].items():
        p = root / rel
        actual = sha_file(p)
        if actual != expected:
            raise SystemExit(f'{manifest["name"]}: patched SHA mismatch {rel}: {actual} != {expected}')
        print(f'{manifest["name"]}: verified {rel} -> {expected}')
    print(f'{manifest["name"]}: PATCH_SHA256={actual_patch_sha}')

if __name__ == '__main__':
    main()
