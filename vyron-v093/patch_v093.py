from pathlib import Path
import re

root=Path('.vyron-v051')
p=root/'src/ExistingVideos.tsx'
s=p.read_text()

# 1) Never auto-select all private videos after sync.
s=s.replace("const next=(r.videos||[]).map((x:any)=>({...x,selected:x.privacyStatus==='private',applyState:'idle'}));",
            "const next=(r.videos||[]).map((x:any)=>({...x,selected:false,applyState:'idle'}));")

# 2) Scope scheduling to selected videos only.
s=s.replace("function schedule(){if(!start)return;setVideos(buildExistingSchedule(orderedExistingVideos(videos,order),new Date(start).toISOString(),cadence));}",
"""function schedule(){
  if(!start)return;
  const targets=videos.filter(v=>v.selected);
  if(!targets.length){toast('Выбери видео, которым нужно расставить даты');return}
  const scheduled=buildExistingSchedule(orderedExistingVideos(targets,order),new Date(start).toISOString(),cadence);
  const byId=new Map(scheduled.map(v=>[v.id,v]));
  setVideos(prev=>prev.map(v=>byId.has(v.id)?{...v,publishAt:byId.get(v.id)!.publishAt}:v));
  toast(`Даты расставлены: ${targets.length} видео`)
}""")

# 3) Scope imported metadata to selected videos only.
old="async function read(files:FileList|null){if(!files?.length)return;const rows:ImportedMetadata[]=[];for(const f of Array.from(files))rows.push(...parseMetadataFile(f.name,await f.text()));setMeta(rows);setVideos(v=>overlayExistingMetadata(orderedExistingVideos(v,order),rows));toast(`Метаданные: ${rows.length}`)}"
new="""async function read(files:FileList|null){
  if(!files?.length)return;
  const rows:ImportedMetadata[]=[];
  for(const f of Array.from(files))rows.push(...parseMetadataFile(f.name,await f.text()));
  const selectedNow=videos.filter(v=>v.selected);
  if(!selectedNow.length){toast('Сначала выбери видео для метаданных');return}
  setMeta(rows);
  setVideos(prev=>{
    const targets=orderedExistingVideos(prev.filter(v=>v.selected),order);
    const overlaid=overlayExistingMetadata(targets,rows);
    const byId=new Map(overlaid.map(v=>[v.id,v]));
    return prev.map(v=>byId.has(v.id)?{...byId.get(v.id)!,selected:true}:v)
  });
  toast(`Метаданные применены к выбранной группе: ${Math.min(rows.length,selectedNow.length)} из ${selectedNow.length}`)
}"""
if old not in s: raise SystemExit('read() anchor not found')
s=s.replace(old,new)

# 4) Helpers for safe batch selection.
anchor="const selected=useMemo(()=>videos.filter(v=>v.selected),[videos]);"
insert="""const selected=useMemo(()=>videos.filter(v=>v.selected),[videos]);
 const selectNone=()=>setVideos(x=>x.map(v=>({...v,selected:false})));
 const selectAllPrivate=()=>setVideos(x=>x.map(v=>({...v,selected:v.privacyStatus==='private'})));
 const selectLatestPrivate=(count:number)=>setVideos(x=>{
   const newest=[...x].filter(v=>v.privacyStatus==='private').sort((a,b)=>{
     const ta=Date.parse(a.publishedAt||a.publishAt||'')||0,tb=Date.parse(b.publishedAt||b.publishAt||'')||0;
     return tb-ta
   }).slice(0,count);
   const ids=new Set(newest.map(v=>v.id));
   return x.map(v=>({...v,selected:ids.has(v.id)}))
 });"""
if anchor not in s: raise SystemExit('selected anchor not found')
s=s.replace(anchor,insert)

# 5) Clear old channel selection/list when channel changes before a new sync.
old_eff="useEffect(()=>{const c=channels.find(x=>x.id===channelId);if(c){setProfileId(c.youtubeProfileId||'');setCadence(c.cadenceDays||2)}},[channelId]);"
new_eff="useEffect(()=>{const c=channels.find(x=>x.id===channelId);if(c){setProfileId(c.youtubeProfileId||'');setCadence(c.cadenceDays||2)}setVideos([]);setBaseline({});setLastUndo([]);setSyncInfo(null);setThumbs({});},[channelId]);"
if old_eff not in s: raise SystemExit('channel effect anchor not found')
s=s.replace(old_eff,new_eff)

# 6) Replace quick selection controls with explicit safe scope controls.
old_quick="<div><button onClick={()=>setVideos(x=>x.map(v=>({...v,selected:v.privacyStatus==='private'})))}>Выбрать Private</button><button onClick={()=>setVideos(x=>x.map(v=>({...v,selected:false})))}>Снять все</button></div>"
new_quick="""<div className=\"batchScopeActions\"><span className=\"selectionCount\">Выбрано <b>{selected.length}</b></span><button onClick={()=>selectLatestPrivate(30)}>Последние 30 Private</button><button onClick={selectAllPrivate}>Все Private</button><button onClick={selectNone}>Снять все</button></div>"""
if old_quick not in s: raise SystemExit('quick controls anchor not found')
s=s.replace(old_quick,new_quick)

# 7) Clarify scoped action buttons.
s=s.replace("<button onClick={schedule}>Расставить даты</button><button onClick={()=>file.current?.click()}>✦ Метаданные GPT</button>",
            "<button disabled={!selected.length} onClick={schedule}>Расставить даты • {selected.length}</button><button disabled={!selected.length} onClick={()=>file.current?.click()}>✦ Метаданные GPT • {selected.length}</button>")

# 8) Selection status banner before list.
needle="{meta.length>0&&<div className=\"publisherNotice\"><b>Metadata Inbox</b>"
banner="""{videos.length>0&&<div className=\"publisherNotice selectionNotice\"><b>Область изменений: {selected.length?`${selected.length} выбранных видео`:'ничего не выбрано'}</b><p>Название, описание, теги, даты и отправка в YouTube применяются только к отмеченным роликам. Для всей приватной библиотеки используй «Все Private», для свежей партии — «Последние 30 Private».</p></div>}
  """+needle
if needle not in s: raise SystemExit('notice anchor not found')
s=s.replace(needle,banner)

# 9) Version display/package metadata.
for fp in [root/'package.json', root/'src-tauri/tauri.conf.json']:
    t=fp.read_text()
    t=t.replace('"version": "0.9.2"','"version": "0.9.3"')
    fp.write_text(t)

cargo=root/'src-tauri/Cargo.toml'
t=cargo.read_text().replace('version = "0.9.2"','version = "0.9.3"')
cargo.write_text(t)

# Visible app version where present.
for fp in [root/'src/App.tsx',root/'src/SettingsOS.tsx']:
    if fp.exists():
        t=fp.read_text().replace('0.9.2','0.9.3')
        fp.write_text(t)

p.write_text(s)
print('VYRON 0.9.3 scoped selection patch applied')
