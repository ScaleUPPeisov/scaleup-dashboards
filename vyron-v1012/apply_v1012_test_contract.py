#!/usr/bin/env python3
from pathlib import Path

# The old regression intentionally enforced the previous 1000-project ceiling.
p=Path('tests/autopilot.test.ts')
s=p.read_text(encoding='utf-8')
variants=[('toHaveLength(1000)','toHaveLength(5000)'),('.toBe(1000)','.toBe(5000)')]
hits=sum(s.count(a) for a,_ in variants)
if hits!=1:
    raise SystemExit(f'VYRON 1.0.12: expected exactly one legacy 1000-project cap assertion, found {hits}')
for a,b in variants:
    s=s.replace(a,b)
p.write_text(s,encoding='utf-8')

# Keep the new frontend regression test browser/TS-config compatible: no node:* imports.
Path('tests/v1012_ux_storage.test.ts').write_text("""import {describe,expect,it} from 'vitest';
import {recommendedWeeklyLoad} from '../src/commandCenterCore';

describe('VYRON 1.0.12 local command-center contract',()=>{
  it('keeps local planning math deterministic without any network dependency',()=>{
    expect(recommendedWeeklyLoad(7)).toBe(1);
    expect(recommendedWeeklyLoad(3.5)).toBe(2);
  });
});
""",encoding='utf-8')
print('VYRON 1.0.12: project-cap regression updated and browser-compatible test installed')
