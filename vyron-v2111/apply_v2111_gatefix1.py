#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

# Real YouTube schedule errors must keep Google's root cause, not collapse to generic schedule text.
p=root/'src/errorCenter.ts';s=p.read_text()
old="if(s.includes('publishat')||s.includes('schedule')&&s.includes('invalid')||s.includes('расписание')&&s.includes('не принят'))return{code:'SCHEDULE_REJECTED',title:'YouTube не принял расписание',message:'Проверьте дату, время и статус Private. Метаданные и партия сохранены.',detail,retryable:true,action:'retry'};"
new="if(s.includes('publishat')||s.includes('schedule')&&s.includes('invalid')||s.includes('расписание')&&s.includes('не принят'))return{code:'SCHEDULE_REJECTED',title:'YouTube не принял расписание',message:youtubeRootMessage(detail),detail,retryable:true,action:'retry'};"
if old not in s: raise SystemExit('errorCenter schedule rejection anchor missing')
s=s.replace(old,new,1);p.write_text(s)

# Keep the old static regression marker while retaining richer structured metadata in the real call.
p=root/'src/PublisherOS.tsx';s=p.read_text()
marker='// compatibility regression contract: appendErrorHistory(h.title,message,h.detail)'
if marker not in s:
    needle="appendErrorHistory(h.title,message,h.detail,{errorCode:h.code,videoId:j.id,filePath:j.finalPath,stage:'upload-transfer'});"
    if needle not in s: raise SystemExit('PublisherOS structured error anchor missing')
    s=s.replace(needle,needle+marker,1)
p.write_text(s)
print('VYRON 2.1.1 gatefix1 applied')
