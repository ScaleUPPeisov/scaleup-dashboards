#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}: {old!r}')
    path.write_text(text.replace(old, new, 1))
    print(f'{label}: patched')

# Storage Lifecycle: production trash implementation moved into the inner helper;
# assert the implementation body rather than the public Tauri wrapper.
replace_once(
    root / 'src/storageLifecycle.test.ts',
    "const three=section(prod,'pub fn delete_production_batch_projects','pub fn open_production_batch_in_endlume');",
    "const three=section(prod,'fn delete_production_batch_projects_inner','pub fn open_production_batch_in_endlume');",
    'storageLifecycle cleanup helper contract',
)

# v2.1.1 cleanup test was formatting-sensitive. Keep the semantic Rendered-root contract.
replace_once(
    root / 'src/v2111GlobalCleanup.test.ts',
    "expect(rust).toContain('let rendered=batch_root.join(\"Rendered\")')",
    "expect(rust).toContain('batch_root.join(\"Rendered\")')",
    'v2111 cleanup Rendered contract',
)

# Legacy v2.0.12 registration test is formatting/implementation-sensitive. Preserve
# the behavior contract while accepting the current rustfmt output and system-Trash cleanup.
p = root / 'src/v212CleanupCommandRegistration.test.ts'
text = p.read_text()
replacements = {
    "render_status!=\"Completed\"": "render_status != \"Completed\"",
    "let rendered=batch_root.join(\"Rendered\").canonicalize().ok();": "let rendered = batch_root.join(\"Rendered\").canonicalize().ok();",
    "fs::remove_file(&canon)": "trash::delete(&folder_canon)",
}
changed = 0
for old, new in replacements.items():
    if old in text:
        text = text.replace(old, new)
        changed += 1
if changed == 0:
    raise SystemExit('v212 cleanup registration: no stale contract anchors found')
p.write_text(text)
print(f'v212 cleanup registration contracts: patched {changed} stale anchor(s)')
