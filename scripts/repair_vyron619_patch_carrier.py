from pathlib import Path
import re

p=Path(__file__).with_name('apply_vyron619_hotfix.py')
s=p.read_text()
pattern=re.compile(r'old_shell="(?P<old><PublisherShell.*?/>)(?:\n)"\nnew_shell="(?P<new><PublisherShell.*?/>)(?:\n)"',re.S)
m=pattern.search(s)
if not m:
    raise SystemExit('carrier quoting block not found')
replacement="old_shell='''"+m.group('old')+"\n'''\nnew_shell='''"+m.group('new')+"\n'''"
s=s[:m.start()]+replacement+s[m.end():]
p.write_text(s)
print('VYRON_6_1_9_PATCH_CARRIER_QUOTING=REPAIRED')
