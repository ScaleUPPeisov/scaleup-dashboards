#!/usr/bin/env python3
from pathlib import Path

p=Path('tests/autopilot.test.ts')
s=p.read_text(encoding='utf-8')
variants=[('toHaveLength(1000)','toHaveLength(5000)'),('.toBe(1000)','.toBe(5000)')]
hits=sum(s.count(a) for a,_ in variants)
if hits!=1:
    raise SystemExit(f'VYRON 1.0.12: expected exactly one legacy 1000-project cap assertion, found {hits}')
for a,b in variants:
    s=s.replace(a,b)
p.write_text(s,encoding='utf-8')
print('VYRON 1.0.12: legacy 1000-project test cap updated to 5000-project regression')
