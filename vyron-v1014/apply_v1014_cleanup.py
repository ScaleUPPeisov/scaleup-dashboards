#!/usr/bin/env python3
from pathlib import Path
import re

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.14 cleanup: '+msg)

# -----------------------------------------------------------------------------
# 3/1 regression: if 16 Sep is already a scheduled video, auto-continuation
# starts on the next valid slot (17 Sep). The calendar anchor does NOT move,
# therefore 18 Sep remains the pause day.
# -----------------------------------------------------------------------------
p=Path('src/channelSchedule.test.ts');s=p.read_text()
old="const g=generatePatternSchedule(c,4);"
must(old in s,'occupied-slot fixture marker missing')
s=s.replace(old,"const g=generatePatternSchedule(c,rows,4);",1)
old_dates="toEqual(['2026-09-15','2026-09-17','2026-09-19','2026-09-20'])"
must(old_dates in s,'occupied-slot expected dates marker missing')
s=s.replace(old_dates,"toEqual(['2026-09-17','2026-09-19','2026-09-20','2026-09-21'])",1)
old_busy="expect(g.calendar.find(x=>x.date==='2026-09-16')?.kind).toBe('occupied');"
must(old_busy in s,'occupied-slot old calendar assertion missing')
s=s.replace(old_busy,"expect(g.calendar.some(x=>x.date==='2026-09-16')).toBe(false);",1)
p.write_text(s)

# -----------------------------------------------------------------------------
# One reusable A→Z helper for CHANNEL SELECTION DROPDOWNS only.
# It returns a copy and never mutates Zustand/shared channel state.
# Command Center / Runway priority lists are intentionally untouched.
# -----------------------------------------------------------------------------
Path('src/channelSort.ts').write_text(r'''export function sortChannelsAlphabetically<T extends {name:string}>(channels:readonly T[]):T[]{
  return [...channels].sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base',numeric:true}));
}
''')
Path('src/channelSort.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';
import {sortChannelsAlphabetically} from './channelSort';

describe('channel dropdown A-Z sorting',()=>{
  it('sorts English names case-insensitively without mutating source order',()=>{
    const source=[
      {id:'1',name:'Lost Highway FM'},
      {id:'2',name:'Midnight in Paris'},
      {id:'3',name:'ELARA'},
      {id:'4',name:'Silent Black Room'},
      {id:'5',name:'Electric Maestro'},
      {id:'6',name:'i lost her'},
      {id:'7',name:'Dolce Vita Nights'},
      {id:'8',name:'Neon Drive FM'},
      {id:'9',name:'Riviera Sax Club'},
      {id:'10',name:'Shadow Note Lounge'},
      {id:'11',name:'Rainy Cat Jazz'},
      {id:'12',name:'Glass City Lovers'},
      {id:'13',name:'Mafia 1947 Lounge'},
    ];
    const original=source.map(x=>x.id);
    expect(sortChannelsAlphabetically(source).map(x=>x.name)).toEqual([
      'Dolce Vita Nights','ELARA','Electric Maestro','Glass City Lovers','i lost her','Lost Highway FM','Mafia 1947 Lounge','Midnight in Paris','Neon Drive FM','Rainy Cat Jazz','Riviera Sax Club','Shadow Note Lounge','Silent Black Room'
    ]);
    expect(source.map(x=>x.id)).toEqual(original);
  });
  it('uses numeric ordering inside names',()=>{
    expect(sortChannelsAlphabetically([{name:'Channel 10'},{name:'Channel 2'}]).map(x=>x.name)).toEqual(['Channel 2','Channel 10']);
  });
});
''')

modified=[]
for file in Path('src').glob('*.tsx'):
    text=file.read_text()
    # Only option rendering inside channel dropdowns. Never replace ordinary
    # channels.map() lists because their domain ordering may be meaningful.
    next_text=re.sub(r'\{channels\.map\(([A-Za-z_$][\w$]*)=><option',r'{sortChannelsAlphabetically(channels).map(\1=><option',text)
    if next_text==text:
        continue
    if "from './channelSort'" not in next_text:
        m=re.match(r'((?:import[^\n]+\n)+)',next_text)
        must(m is not None,f'import block missing in {file}')
        next_text=next_text[:m.end()]+"import {sortChannelsAlphabetically} from './channelSort';\n"+next_text[m.end():]
    file.write_text(next_text)
    modified.append(file.name)

must('MetadataPage.tsx' in modified,'Metadata channel dropdown was not patched')
must('ExistingVideos.tsx' in modified,'Existing Videos channel dropdown was not patched')
must('PublisherOS.tsx' in modified,'Publisher queue channel dropdown was not patched')
must('ProductionOS.tsx' in modified,'Production channel dropdown was not patched')
must('YouTubeDataTools.tsx' in modified,'YouTube Data channel dropdown was not patched')
print('A-Z channel dropdowns patched:',', '.join(modified))
print('VYRON 1.0.14 cleanup applied')
