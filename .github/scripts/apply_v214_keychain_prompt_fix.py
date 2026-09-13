#!/usr/bin/env python3
import base64,gzip,pathlib,subprocess,sys,tempfile
root=pathlib.Path(sys.argv[1]).resolve()
parts=pathlib.Path(__file__).resolve().with_name('v214_keychain_patch_parts')
payload=''.join((parts/f'part-{i:02d}.txt').read_text().strip() for i in range(6))
patch=gzip.decompress(base64.b64decode(payload))
with tempfile.NamedTemporaryFile(suffix='.patch',delete=False) as f:
    f.write(patch)
    name=f.name
subprocess.run(['git','apply','--check',name],cwd=root,check=True)
subprocess.run(['git','apply',name],cwd=root,check=True)
print('VYRON 2.1.4 Keychain passive-zero patch applied')
