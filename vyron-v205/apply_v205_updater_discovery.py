#!/usr/bin/env python3
from pathlib import Path
import json,sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')

# Manual and automatic updater checks must explicitly bypass intermediary caches.
p=ROOT/'src/api.ts'
s=p.read_text()
anchor="import { check } from '@tauri-apps/plugin-updater';"
assert anchor in s, 'updater import missing'
if "import {UPDATER_CHECK_OPTIONS} from './updaterPolicy';" not in s:
    s=s.replace(anchor,anchor+"\nimport {UPDATER_CHECK_OPTIONS} from './updaterPolicy';",1)
old='const update=await check();'
new='const update=await check(UPDATER_CHECK_OPTIONS);'
assert old in s, 'plain updater check anchor missing'
s=s.replace(old,new,1)
p.write_text(s)

(ROOT/'src/updaterPolicy.ts').write_text("""export const UPDATER_CHECK_OPTIONS={
  timeout:30_000,
  headers:{
    'Cache-Control':'no-cache, no-store, max-age=0',
    'Pragma':'no-cache'
  }
} as const;
""")

(ROOT/'src/updaterPolicy.test.ts').write_text("""import {describe,expect,it} from 'vitest';
import {UPDATER_CHECK_OPTIONS} from './updaterPolicy';

describe('VYRON updater discovery policy',()=>{
  it('forces every updater check to bypass stale HTTP caches',()=>{
    expect(UPDATER_CHECK_OPTIONS.timeout).toBe(30_000);
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-cache');
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-store');
    expect(UPDATER_CHECK_OPTIONS.headers.Pragma).toBe('no-cache');
  });
});
""")

# Primary endpoint uses the newest published release asset. Keep the old raw endpoint
# as a fallback so the updater no longer has a single CDN/cache dependency.
p=ROOT/'src-tauri/tauri.conf.json'
c=json.loads(p.read_text())
updater=c.setdefault('plugins',{}).setdefault('updater',{})
updater['endpoints']=[
  'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json',
  'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json'
]
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')

print('VYRON 2.0.5 updater discovery hardening applied')
