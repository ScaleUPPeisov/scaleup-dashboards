from pathlib import Path
import json,re,shutil

ROOT=Path('.vyron-v051')
PATCH=Path('vyron-v094')
VERSION='0.9.4'

# Replace parser/scheduling helpers with the tested 0.9.4 implementations.
shutil.copyfile(PATCH/'metadata.ts',ROOT/'src/metadata.ts')
shutil.copyfile(PATCH/'youtubeExisting.ts',ROOT/'src/youtubeExisting.ts')
shutil.copyfile(PATCH/'metadata_v094.test.ts',ROOT/'tests/metadata_v094.test.ts')

p=ROOT/'src/ExistingVideos.tsx'
s=p.read_text()

s=s.replace("import React,{useEffect,useMemo,useRef,useState} from 'react';",
            "import React,{useEffect,useMemo,useRef,useState} from 'react';\nimport * as mammoth from 'mammoth';",1)
s=s.replace("import {parseMetadataFile,type ImportedMetadata} from './metadata';",
            "import {parseMetadataFile,validateSequentialMetadata,type ImportedMetadata} from './metadata';",1)
s=s.replace("import {buildExistingSchedule,orderedExistingVideos,overlayExistingMetadata} from './youtubeExisting';",
            "import {buildExistingScheduleFromLocal,orderedExistingVideos,overlayExistingMetadata} from './youtubeExisting';",1)

old_eff="useEffect(()=>{const c=channels.find(x=>x.id===channelId);if(c){setProfileId(c.youtubeProfileId||'');setCadence(c.cadenceDays||2)}setVideos([]);setBaseline({});setLastUndo([]);setSyncInfo(null);setThumbs({});},[channelId]);"
new_eff="useEffect(()=>{const c=channels.find(x=>x.id===channelId);if(c){setProfileId(c.youtubeProfileId||'');setCadence(c.cadenceDays||2)}setVideos([]);setBaseline({});setLastUndo([]);setSyncInfo(null);setThumbs({});setMeta([]);},[channelId]);"
if old_eff not in s: raise SystemExit('channel effect anchor missing')
s=s.replace(old_eff,new_eff,1)

old=''' function schedule(){
  if(!start)return;
  const targets=videos.filter(v=>v.selected);
  if(!targets.length){toast('Выбери видео, которым нужно расставить даты');return}
  const scheduled=buildExistingSchedule(orderedExistingVideos(targets,order),new Date(start).toISOString(),cadence);
  const byId=new Map(scheduled.map(v=>[v.id,v]));
  setVideos(prev=>prev.map(v=>byId.has(v.id)?{...v,publishAt:byId.get(v.id)!.publishAt}:v));
  toast(`Даты расставлены: ${targets.length} видео`)
}
 async function read(files:FileList|null){
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
}'''
new=''' function schedule(){
  if(!start)return;
  const targets=orderedExistingVideos(videos.filter(v=>v.selected),order);
  if(!targets.length){toast('Выбери видео, которым нужно расставить даты');return}
  const scheduled=buildExistingScheduleFromLocal(targets,start,cadence,meta);
  const byId=new Map(scheduled.map(v=>[v.id,v]));
  setVideos(prev=>prev.map(v=>byId.has(v.id)?{...v,publishAt:byId.get(v.id)!.publishAt}:v));
  const timed=meta.filter(x=>x.publishTime).length;
  toast(timed?`Даты расставлены: ${targets.length} • время взято из SEO pack`:`Даты расставлены: ${targets.length} видео`)
}
 async function read(files:FileList|null){
  if(!files?.length)return;
  const selectedNow=videos.filter(v=>v.selected);
  if(!selectedNow.length){toast('Сначала выбери видео для SEO pack');return}
  const rows:ImportedMetadata[]=[];
  let hasDocx=false;
  for(const f of Array.from(files)){
    const docx=f.name.toLowerCase().endsWith('.docx');
    hasDocx=hasDocx||docx;
    const text=docx?(await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value:await f.text();
    rows.push(...parseMetadataFile(f.name,text));
  }
  rows.sort((a,b)=>(a.number??Number.MAX_SAFE_INTEGER)-(b.number??Number.MAX_SAFE_INTEGER));
  if(hasDocx){
    const check=validateSequentialMetadata(rows,selectedNow.length);
    if(!check.ok){
      const details=[rows.length!==selectedNow.length?`в DOCX ${rows.length}, выбрано ${selectedNow.length}`:'',check.missing.length?`нет VIDEO ${check.missing.join(', ')}`:'',check.duplicates.length?`дубли VIDEO ${check.duplicates.join(', ')}`:''].filter(Boolean).join(' • ');
      toast(`SEO DOCX не применён: ${details}`);return
    }
    const incomplete=rows.filter(x=>!x.title||!x.description||!x.tags?.length);
    if(incomplete.length){toast(`SEO DOCX не применён: неполные блоки VIDEO ${incomplete.map(x=>x.number).join(', ')}`);return}
  }
  setMeta(rows);
  const firstTime=rows[0]?.publishTime;
  if(firstTime&&rows.every(x=>x.publishTime===firstTime))setStart(prev=>prev?`${prev.slice(0,10)}T${firstTime}`:prev);
  setVideos(prev=>{
    const targets=orderedExistingVideos(prev.filter(v=>v.selected),order);
    const overlaid=overlayExistingMetadata(targets,rows);
    const byId=new Map(overlaid.map(v=>[v.id,v]));
    return prev.map(v=>byId.has(v.id)?{...byId.get(v.id)!,selected:true}:v)
  });
  const zone=rows.find(x=>x.publishTime)?.publishTimezone;
  toast(hasDocx?`✓ SEO DOCX: ${rows.length}/${selectedNow.length} видео заполнено автоматически${firstTime?` • ${firstTime}${zone?` ${zone}`:''}`:''}`:`Метаданные применены: ${Math.min(rows.length,selectedNow.length)} из ${selectedNow.length}`)
}'''
if old not in s: raise SystemExit('schedule/read anchor missing')
s=s.replace(old,new,1)

s=s.replace('accept=".json,.txt,.csv"','accept=".docx,.json,.txt,.csv"',1)
s=s.replace('<label>Порядок<select','<label>SEO порядок<select',1)
s=s.replace('>✦ Метаданные GPT • {selected.length}</button>','>⬆ Загрузить SEO DOCX • {selected.length}</button>',1)
old_notice='<b>Metadata Inbox</b><p>Импортировано {meta.length} записей. Проверь соответствие роликов перед отправкой.</p>'
new_notice='<b>SEO Pack • {meta.length} видео</b><p>Название, описание и теги уже подставлены автоматически. {meta.some(x=>x.publishTime)&&<>Время публикации из файла: <b>{meta[0]?.publishTime} {meta[0]?.publishTimezone||\'\'}</b>. Оно будет использовано при «Расставить даты».</>}</p>'
if old_notice not in s: raise SystemExit('metadata notice anchor missing')
s=s.replace(old_notice,new_notice,1)
p.write_text(s)

# Package / updater version and DOCX dependency.
p=ROOT/'package.json';d=json.loads(p.read_text());d['version']=VERSION;d.setdefault('dependencies',{})['mammoth']='1.12.2';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'package-lock.json';d=json.loads(p.read_text());d['version']=VERSION;root_pkg=d.setdefault('packages',{}).setdefault('',{});root_pkg['version']=VERSION;root_pkg.setdefault('dependencies',{})['mammoth']='1.12.2';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'src-tauri/tauri.conf.json';d=json.loads(p.read_text());d['version']=VERSION;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'src-tauri/Cargo.toml';s=p.read_text();s,n=re.subn(r'^version = "0\.9\.3"$',f'version = "{VERSION}"',s,count=1,flags=re.M)
if n!=1: raise SystemExit('Cargo.toml 0.9.3 marker missing')
p.write_text(s)
for rel in ['src/App.tsx','src/SettingsOS.tsx']:
    p=ROOT/rel
    if p.exists():p.write_text(p.read_text().replace('0.9.3',VERSION))

print('VYRON 0.9.4 DOCX SEO pack patch applied')
