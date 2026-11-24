#!/usr/bin/env python3
"""Isolated Seatbelt feasibility probe. Never launches VYRON or accesses user media."""
import json, os, pathlib, subprocess, sys, tempfile
if sys.platform != 'darwin':
    raise SystemExit('This probe requires macOS')
with tempfile.TemporaryDirectory(prefix='vyron-apex-seatbelt-', dir='/private/tmp') as tmp:
    base=pathlib.Path(tmp); inside=base/'inside'; outside=base/'outside'
    inside.mkdir(); outside.mkdir(); (outside/'sentinel').write_text('original')
    (inside/'outside-link').symlink_to(outside, target_is_directory=True)
    profile=base/'probe.sb'
    profile.write_text('''(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* (subpath (param "ROOT")))\n(deny network*)\n(deny mach-lookup (global-name "com.apple.securityd"))\n''')
    code=r'''import errno,json,os,pathlib,socket,subprocess,sys
inside=pathlib.Path(sys.argv[1]); outside=pathlib.Path(sys.argv[2]); results={}
try:
 (inside/'allowed').write_text('test'); results['inside_write_allowed']=True
except OSError: results['inside_write_allowed']=False
for name,op in {
 'outside_write_denied': lambda: (outside/'new').write_text('bad'),
 'outside_delete_denied': lambda: (outside/'sentinel').unlink(),
 'symlink_escape_denied': lambda: (inside/'outside-link'/'new').write_text('bad'),
 'outside_rename_denied': lambda: (inside/'allowed').rename(outside/'moved'),
}.items():
 try: op(); results[name]=False
 except OSError as e: results[name]=e.errno in (errno.EPERM,errno.EACCES)
try:
 proc=subprocess.run(['/usr/bin/touch',str(outside/'from-child')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 results['child_creation_or_write_denied']=proc.returncode!=0 and not (outside/'from-child').exists()
except OSError as e: results['child_creation_or_write_denied']=e.errno in (errno.EPERM,errno.EACCES)
try:
 s=socket.socket(); s.settimeout(.4); s.connect(('127.0.0.1',1)); results['network_denied']=False
except OSError as e: results['network_denied']=e.errno in (errno.EPERM,errno.EACCES)
finally: s.close()
print(json.dumps(results,sort_keys=True)); sys.exit(0 if all(results.values()) else 1)
'''
    cmd=['/usr/bin/sandbox-exec','-f',str(profile),'-D',f'ROOT={inside}','/usr/bin/python3','-I','-c',code,str(inside),str(outside)]
    run=subprocess.run(cmd,capture_output=True,text=True,timeout=20)
    print(run.stdout.strip())
    if run.stderr: print(run.stderr.strip(),file=sys.stderr)
    if (outside/'sentinel').read_text()!='original': raise SystemExit('Outside sentinel changed')
    raise SystemExit(run.returncode)
