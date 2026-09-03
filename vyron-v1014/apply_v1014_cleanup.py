#!/usr/bin/env python3
from pathlib import Path

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.14 cleanup: '+msg)

p=Path('src/channelSchedule.test.ts');s=p.read_text()
old="const g=generatePatternSchedule(c,4);"
must(old in s,'occupied-slot fixture marker missing')
s=s.replace(old,"const g=generatePatternSchedule(c,rows,4);",1);p.write_text(s)
print('VYRON 1.0.14 cleanup applied')
