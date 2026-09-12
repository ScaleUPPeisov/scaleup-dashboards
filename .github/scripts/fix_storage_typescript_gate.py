#!/usr/bin/env python3
from pathlib import Path
import sys

root=Path(sys.argv[1])
p=root/'tests/stateMigration_v095.test.ts'
s=p.read_text()
old="""  useApp.getState().hydrate({\n   version:6,channels:[],jobs:[],competitors:[],logs:[],\n   settings:{workspace:'/Users/test/VYRON',endlumePath:'/Applications/ENDLUME Studio.app',tracksPerVideo:12,youtubeIntelligenceRefreshMin:180} as any\n  });"""
new="""  useApp.getState().hydrate({\n   version:6,channels:[],jobs:[],competitors:[],logs:[],uploadHistory:[],fingerprintCache:{},projectLifecycle:{},\n   settings:{workspace:'/Users/test/VYRON',endlumePath:'/Applications/ENDLUME Studio.app',tracksPerVideo:12,youtubeIntelligenceRefreshMin:180} as any\n  });"""
if old not in s:
    if new in s:
        print('state migration v8 fixture already normalized')
        raise SystemExit(0)
    raise SystemExit('stateMigration_v095 fixture target not found')
p.write_text(s.replace(old,new,1))
print('state migration TypeScript fixture normalized for required v8 fields')
