#!/usr/bin/env python3
from pathlib import Path
import subprocess,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

p=root/'src/PublisherOS.tsx';s=p.read_text()
old='hasThumbnail:selectedThumbnail'
new='hasThumbnail:j=>Boolean(selectedThumbnail(j))'
if old not in s: raise SystemExit('PublisherOS hasThumbnail anchor missing')
p.write_text(s.replace(old,new,1))

p=root/'src/v2111PublisherWiring.test.ts';s=p.read_text()
s=s.replace("fs.readFileSync(new URL('./PublisherOS.tsx',import.meta.url),'utf8')","fs.readFileSync('src/PublisherOS.tsx','utf8')")
s=s.replace("fs.readFileSync(new URL('./api.ts',import.meta.url),'utf8')","fs.readFileSync('src/api.ts','utf8')")
p.write_text(s)
subprocess.run([sys.executable,str(Path(__file__).with_name('apply_v2111_gatefix4.py')),str(root)],check=True)
print('VYRON 2.1.1 gatefix3 applied')
