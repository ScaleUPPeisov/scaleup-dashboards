#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
p = ROOT / 'src/SettingsOS.tsx'
s = p.read_text()
old = "import {notifyError,notifyInfo,notifySuccess} from './notificationCenter';"
new = "import {notifyError,notifyInfo,notifySuccess,notifyWarning} from './notificationCenter';"

if new in s:
    print('VYRON 2.0 SettingsOS notifyWarning import already present')
elif old in s:
    p.write_text(s.replace(old, new, 1))
    print('VYRON 2.0 SettingsOS notifyWarning import applied')
else:
    raise SystemExit('SettingsOS notification import anchor missing')
