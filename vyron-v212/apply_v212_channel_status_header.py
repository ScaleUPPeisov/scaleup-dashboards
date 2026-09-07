#!/usr/bin/env python3
from pathlib import Path
import re,sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')

# Find the existing global status/header component from the user-visible labels.
candidates=[]
for p in (ROOT/'src').rglob('*.tsx'):
    s=p.read_text()
    low=s.lower()
    if 'ручной режим' in low and 'ошиб' in low and 'канал' in low:
        candidates.append((p,s))
if len(candidates)!=1:
    found=', '.join(str(p.relative_to(ROOT)) for p,_ in candidates) or 'none'
    raise SystemExit(f'VYRON status header: expected exactly one component, found {len(candidates)}: {found}')

p,s=candidates[0]
original=s

# Split the previous total channel counter into API-connected vs channels without API.
# Keep it inline so no extra state/effects/API calls are introduced.
channel_re=re.compile(r'\{(?P<expr>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.length)\}\s*канал(?:ов|а)?',re.I)
m=channel_re.search(s)
if not m:
    i=s.lower().find('канал')
    context=s[max(0,i-500):i+500] if i>=0 else s[:1000]
    raise SystemExit('VYRON status header: channel counter anchor missing. Context:\n'+context)
base=m.group('expr')[:-len('.length')]
channel_label=(
    "{"+base+".filter((c:any)=>Boolean(c.youtubeProfileId)).length} API • "
    "{"+base+".filter((c:any)=>!c.youtubeProfileId).length} БЕЗ API"
)
s=s[:m.start()]+channel_label+s[m.end():]

# Make the existing error pill/button clickable and show the actual error payloads.
# No network/API action is performed: this is only a local UI inspection action.
error_tag_re=re.compile(
    r'<(?P<tag>span|div|button)(?P<attrs>[^>]*)>'
    r'(?P<body>[^<]{0,220}\{(?P<expr>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.length)\}[^<]{0,120}ошиб[^<]*)'
    r'</(?P=tag)>',re.I
)
em=error_tag_re.search(s)
if not em:
    i=s.lower().find('ошиб')
    context=s[max(0,i-700):i+700] if i>=0 else s[:1400]
    raise SystemExit('VYRON status header: error counter anchor missing. Context:\n'+context)
errors_base=em.group('expr')[:-len('.length')]
attrs=em.group('attrs')
if 'onClick=' in attrs:
    raise SystemExit('VYRON status header: error counter already has an onClick handler; refusing to overwrite it')
body=em.group('body')
click=(
    " onClick={()=>window.alert("+errors_base+".length?"
    +errors_base+".map((e:any,i:number)=>`${i+1}. ${String(e?.message??e?.title??e?.error??e?.detail??e)}`).join('\\n\\n'):'Ошибок нет')}"
)
replacement='<button type="button"'+attrs+click+'>'+body+'</button>'
s=s[:em.start()]+replacement+s[em.end():]

if s==original:
    raise SystemExit('VYRON status header: no changes applied')

# Static safety checks for exactly the requested UI-only behavior.
for token in (' API • ',' БЕЗ API','window.alert','youtubeProfileId','Ошибок нет'):
    if token not in s:
        raise SystemExit(f'VYRON status header: missing generated token {token!r}')
if s.count('window.alert')!=1:
    raise SystemExit('VYRON status header: expected exactly one local error-details click action')

p.write_text(s)
print(f'VYRON 2.0.12 STATUS HEADER PATCH: PASS — {p.relative_to(ROOT)}')
