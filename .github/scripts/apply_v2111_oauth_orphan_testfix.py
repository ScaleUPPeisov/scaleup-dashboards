#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'src-tauri/src/youtube.rs'
s=p.read_text()
old='sec.ranks.borrow_mut().insert(oauth_key(id,"refresh_token"),rank.into())}let cur='
new='sec.ranks.borrow_mut().insert(oauth_key(id,"refresh_token"),rank.into());}let cur='
if old not in s:
    raise SystemExit('orphan test C semicolon anchor missing')
p.write_text(s.replace(old,new,1))
print('VYRON orphan targeted test compile fix applied')
