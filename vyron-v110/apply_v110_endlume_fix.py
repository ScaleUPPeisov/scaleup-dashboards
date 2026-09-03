#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'src/ProductionStatusBridge.tsx'
s=p.read_text()
s=s.replace('loadProductionPrefs,resolveProductionRootFromPrefs','readProductionPrefs,resolveProductionRootFromPrefs')
s=s.replace('const prefs=loadProductionPrefs();','const prefs=readProductionPrefs();')
p.write_text(s)
print('ENDLUME status bridge prefs reader fixed')
