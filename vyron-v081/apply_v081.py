from pathlib import Path
import json,re

root=Path('.vyron-v051')

# Existing Videos: independent visual sorting by scheduled/published date.
p=root/'src/ExistingVideos.tsx'
s=p.read_text()

old="[expanded,setExpanded]=useState<Set<string>>(new Set()),[filter,setFilter]=useState<'all'|'private'|'public'>('all');"
new="[expanded,setExpanded]=useState<Set<string>>(new Set()),[filter,setFilter]=useState<'all'|'private'|'public'>('all'),[sortMode,setSortMode]=useState<'dateAsc'|'dateDesc'|'youtubeOldest'|'youtubeNewest'|'privateFirst'>('dateAsc');"
if old not in s: raise SystemExit('state marker missing')
s=s.replace(old,new,1)

old="<label>Порядок<select value={order} onChange={e=>setOrder(e.target.value as any)}><option value=\"oldest\">старые → новые</option><option value=\"newest\">новые → старые</option></select></label><label>Первая дата"
new="<label>Порядок<select value={order} onChange={e=>setOrder(e.target.value as any)}><option value=\"oldest\">старые → новые</option><option value=\"newest\">новые → старые</option></select></label><label>Сортировка списка<select value={sortMode} onChange={e=>setSortMode(e.target.value as any)}><option value=\"dateAsc\">дата ↑</option><option value=\"dateDesc\">дата ↓</option><option value=\"youtubeOldest\">YouTube: старые → новые</option><option value=\"youtubeNewest\">YouTube: новые → старые</option><option value=\"privateFirst\">сначала Private</option></select></label><label>Первая дата"
if old not in s: raise SystemExit('toolbar marker missing')
s=s.replace(old,new,1)

old="const shown=videos.filter(v=>filter==='all'||v.privacyStatus===filter);const toggle="
new="const displayDate=(v:YoutubeExistingVideo)=>v.publishAt||v.publishedAt||'';const timeOf=(v:YoutubeExistingVideo)=>{const t=Date.parse(displayDate(v));return Number.isFinite(t)?t:Number.POSITIVE_INFINITY};const youtubeTime=(v:YoutubeExistingVideo)=>{const t=Date.parse(v.publishedAt||v.publishAt||'');return Number.isFinite(t)?t:Number.POSITIVE_INFINITY};const shown=[...videos.filter(v=>filter==='all'||v.privacyStatus===filter)].sort((a,b)=>{if(sortMode==='dateAsc')return timeOf(a)-timeOf(b);if(sortMode==='dateDesc'){const ta=timeOf(a),tb=timeOf(b);if(!Number.isFinite(ta)&&!Number.isFinite(tb))return 0;if(!Number.isFinite(ta))return 1;if(!Number.isFinite(tb))return -1;return tb-ta}if(sortMode==='youtubeOldest')return youtubeTime(a)-youtubeTime(b);if(sortMode==='youtubeNewest'){const ta=youtubeTime(a),tb=youtubeTime(b);if(!Number.isFinite(ta)&&!Number.isFinite(tb))return 0;if(!Number.isFinite(ta))return 1;if(!Number.isFinite(tb))return -1;return tb-ta}const pa=a.privacyStatus==='private'?0:1,pb=b.privacyStatus==='private'?0:1;return pa-pb||timeOf(a)-timeOf(b)});const dateCounts=shown.reduce<Record<string,number>>((acc,v)=>{const k=displayDate(v);if(k)acc[k]=(acc[k]||0)+1;return acc},{});const toggle="
if old not in s: raise SystemExit('shown marker missing')
s=s.replace(old,new,1)

old="<article className={`existingCard compact ${open?'open':''} ${v.applyState||''}`} key={v.id}>"
new="<article className={`existingCard compact ${open?'open':''} ${v.applyState||''} ${dateCounts[displayDate(v)]>1?'dateConflictCard':''}`} key={v.id}>"
if old not in s: raise SystemExit('article marker missing')
s=s.replace(old,new,1)

old="<div className=\"existingSchedule\"><input type=\"datetime-local\" value={local(v.publishAt)}"
new="<div className=\"existingSchedule\"><input type=\"datetime-local\" value={local(v.publishAt)}"
# marker retained intentionally; conflict chip is inserted before apply-state label.
if old not in s: raise SystemExit('schedule marker missing')

old="/><b className={v.applyState==='error'?'bad':v.applyState==='done'?'ok':''}>{v.applyState==='done'?'✓ Готово':v.applyState==='saving'?'Сохраняю…':v.applyState==='error'?'Ошибка':'К изменению'}</b>"
new="/>{dateCounts[displayDate(v)]>1&&<span className=\"dateConflict\">⚠ Совпадает дата</span>}<b className={v.applyState==='error'?'bad':v.applyState==='done'?'ok':''}>{v.applyState==='done'?'✓ Готово':v.applyState==='saving'?'Сохраняю…':v.applyState==='error'?'Ошибка':'К изменению'}</b>"
if old not in s: raise SystemExit('apply-state marker missing')
s=s.replace(old,new,1)

# Explain the two different order controls without changing scheduling behavior.
s=s.replace('Превью кэшируются локально с fallback. Public-ролики после синхронизации не выбираются автоматически.','Превью кэшируются локально с fallback. Сортировка списка меняет только отображение — график и порядок расстановки дат не меняются. Public-ролики не выбираются автоматически.',1)
p.write_text(s)

# Add compact visual layer.
p=root/'src/main.tsx'
s=p.read_text()
if "./v081.css" not in s:
    s=s.replace("import './v080.css';","import './v080.css';\nimport './v081.css';")
p.write_text(s)
(root/'src/v081.css').write_text(Path('vyron-v081/v081.css').read_text())

# Bump application version to 0.8.1.
p=root/'package.json'; data=json.loads(p.read_text()); data['version']='0.8.1'; p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
pl=root/'package-lock.json'
if pl.exists():
    try:
        d=json.loads(pl.read_text()); d['version']='0.8.1';
        if isinstance(d.get('packages'),dict) and '' in d['packages']: d['packages']['']['version']='0.8.1'
        pl.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
    except Exception: pass
p=root/'src-tauri/tauri.conf.json'; data=json.loads(p.read_text()); data['version']='0.8.1'; p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
p=root/'src-tauri/Cargo.toml'; s=p.read_text(); s=re.sub(r'(?ms)(\[package\].*?\nversion\s*=\s*)"[^"]+"',r'\g<1>"0.8.1"',s,count=1); p.write_text(s)
for rel in ['src/App.tsx','src/api.ts']:
    p=root/rel; s=p.read_text().replace('0.8.0','0.8.1'); p.write_text(s)

print('VYRON 0.8.1 date sorting patch applied')
