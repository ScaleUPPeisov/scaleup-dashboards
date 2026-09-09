#!/usr/bin/env python3
from pathlib import Path
import json
import sys

root = Path(sys.argv[1]).resolve()

# 1) Register cleanup command in Tauri invoke handler.
lib = root / 'src-tauri/src/lib.rs'
s = lib.read_text()
needle = 'production_manager::delete_production_batch_projects,production_manager::delete_production_job_folder'
replacement = 'production_manager::delete_production_batch_projects,production_manager::cleanup_completed_production_assets,production_manager::delete_production_job_folder'
if 'production_manager::cleanup_completed_production_assets' not in s:
    if needle not in s:
        raise SystemExit('cleanup command registration anchor missing')
    s = s.replace(needle, replacement, 1)
lib.write_text(s)

# 2) Version bump.
for rel in ('package.json', 'src-tauri/tauri.conf.json'):
    p = root / rel
    obj = json.loads(p.read_text())
    if obj.get('version') not in ('2.0.11', '2.0.12'):
        raise SystemExit(f'unexpected version in {rel}: {obj.get("version")}')
    obj['version'] = '2.0.12'
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

p = root / 'package-lock.json'
obj = json.loads(p.read_text())
if obj.get('version') not in ('2.0.11', '2.0.12'):
    raise SystemExit('unexpected package-lock version')
obj['version'] = '2.0.12'
if '' in obj.get('packages', {}):
    obj['packages']['']['version'] = '2.0.12'
p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

p = root / 'src-tauri/Cargo.toml'
s = p.read_text()
if 'version = "2.0.12"' not in s:
    if 'version = "2.0.11"' not in s:
        raise SystemExit('unexpected Cargo.toml version')
    s = s.replace('version = "2.0.11"', 'version = "2.0.12"', 1)
p.write_text(s)

p = root / 'src-tauri/Cargo.lock'
s = p.read_text()
old = 'name = "channelflow"\nversion = "2.0.11"'
new = 'name = "channelflow"\nversion = "2.0.12"'
if new not in s:
    if old not in s:
        raise SystemExit('channelflow Cargo.lock package version not found')
    s = s.replace(old, new, 1)
p.write_text(s)

# 3) Dated update history entry.
history = root / 'src/releaseHistory.ts'
s = history.read_text()
if "version:'2.0.12'" not in s:
    anchor = 'export const VYRON_RELEASE_HISTORY:ReleaseHistoryEntry[]=['
    if anchor not in s:
        raise SystemExit('release history anchor missing')
    entry = "\n {date:'09.09.2026',version:'2.0.12',title:'Hotfix очистки project assets',items:['Исправлена регистрация Tauri-команды cleanup_completed_production_assets: кнопка очистки project assets теперь вызывает реальный backend вместо ошибки «Command not found».','Добавлен regression-тест цепочки UI invoke → Rust command → tauri::generate_handler registration.','Безопасная очистка сохранена: удаляются только image/music завершённых проектов с существующим готовым MP4; Rendered/*.mp4 не удаляются.']},"
    s = s.replace(anchor, anchor + entry, 1)
history.write_text(s)

# 4) Regression test that fails on the exact 2.0.11 bug.
test = root / 'src/v212CleanupCommandRegistration.test.ts'
test.write_text("""import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(decodeURIComponent(new URL(p,import.meta.url).pathname),'utf8');

describe('VYRON 2.0.12 cleanup command registration hotfix',()=>{
  it('keeps UI invoke, Rust command and Tauri registration connected',()=>{
    const api=read('./productionManagerApi.ts');
    const rust=read('../src-tauri/src/production_manager.rs');
    const lib=read('../src-tauri/src/lib.rs');
    expect(api).toContain(\"invoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath})\");
    expect(rust).toContain('pub fn cleanup_completed_production_assets');
    const start=lib.indexOf('tauri::generate_handler![');
    const end=lib.indexOf('])',start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const handler=lib.slice(start,end);
    expect(handler).toContain('production_manager::cleanup_completed_production_assets');
    expect((handler.match(/production_manager::cleanup_completed_production_assets/g)||[]).length).toBe(1);
  });
  it('cleanup still preserves rendered MP4 contract',()=>{
    const rust=read('../src-tauri/src/production_manager.rs');
    const start=rust.indexOf('fn cleanup_completed_assets');
    const end=rust.indexOf('pub fn delete_production_batch_projects');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block=rust.slice(start,end);
    expect(block).toContain('render_status!=\"Completed\"');
    expect(block).toContain('output_path.is_file()');
    expect(block).toContain('fs::remove_file(&canon)');
    expect(block).not.toContain('remove_dir_all');
  });
});
""")

print('VYRON 2.0.12 cleanup-command hotfix applied')
