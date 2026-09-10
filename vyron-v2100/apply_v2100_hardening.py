#!/usr/bin/env python3
from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

def replace_once(path:Path,old:str,new:str,label:str):
    s=path.read_text()
    if old not in s:
        raise SystemExit(f'{label}: anchor missing')
    path.write_text(s.replace(old,new,1))

# -----------------------------------------------------------------------------
# 1. One canonical publication-slot engine in publisherSchedule.
#    It compares instants, never raw ISO strings, and never emits a slot at or
#    before the latest occupied YouTube/Long/Short publication instant.
# -----------------------------------------------------------------------------
p=root/'src/publisherSchedule.ts'
s=p.read_text()
if 'publisherUnifiedChannelSlots' not in s:
    s += r'''

export type PublisherUnifiedSlotOptions={startDate:string;times:string[];count:number;occupied?:string[];now?:Date};
export function publisherUnifiedChannelSlots(opts:PublisherUnifiedSlotOptions){
 const times=[...new Set((opts.times||[]).filter(t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort();
 if(!times.length)throw new Error('Добавьте хотя бы одно время публикации');
 const wanted=Math.max(0,Math.floor(Number.isFinite(opts.count)?opts.count:0)),now=opts.now||new Date(),nowMs=now.getTime();
 const occupiedInstants=(opts.occupied||[]).map(x=>Date.parse(x)).filter(Number.isFinite);
 const occupied=new Set(occupiedInstants);
 const floor=Math.max(nowMs,...occupiedInstants);
 let date=/^\d{4}-\d{2}-\d{2}$/.test(opts.startDate)?opts.startDate:todayKrasnoyarskDate(now),guard=0;
 const out:string[]=[];
 while(out.length<wanted&&guard++<20000){
  for(const time of times){
   const iso=publisherKrasnoyarskIso(date,time);if(!iso)continue;const ms=Date.parse(iso);
   if(!Number.isFinite(ms)||ms<=floor||occupied.has(ms))continue;
   out.push(iso);occupied.add(ms);if(out.length>=wanted)break;
  }
  date=addCalendarDays(date,1);
 }
 if(out.length!==wanted)throw new Error('Не удалось построить единое расписание канала');
 return out;
}
'''
    p.write_text(s)

# -----------------------------------------------------------------------------
# 2. Shorts no longer own a second scheduling algorithm.
#    Keep the old exported function only as a compatibility wrapper.
# -----------------------------------------------------------------------------
p=root/'src/shortsCore.ts'
s=p.read_text()
s=s.replace("import {addCalendarDays} from './channelSchedule';\n",'')
s=s.replace("import {publisherKrasnoyarskIso,todayKrasnoyarskDate} from './publisherSchedule';","import {publisherUnifiedChannelSlots} from './publisherSchedule';")
old="export function shortsScheduleSlots(opts:ShortScheduleOptions){const times=[...new Set(opts.times.filter(t=>/^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(t)))].sort();if(!times.length)throw new Error('Добавьте хотя бы одно время публикации');const wanted=Math.max(0,Math.floor(opts.count));const occupied=new Set((opts.occupied||[]).filter(Boolean));let date=/^\\d{4}-\\d{2}-\\d{2}$/.test(opts.startDate)?opts.startDate:todayKrasnoyarskDate(),guard=0;const out:string[]=[];while(out.length<wanted&&guard++<20000){for(const time of times){const iso=publisherKrasnoyarskIso(date,time);if(iso&&!occupied.has(iso)){out.push(iso);occupied.add(iso);if(out.length>=wanted)break}}date=addCalendarDays(date,1)}if(out.length!==wanted)throw new Error('Не удалось построить расписание Shorts');return out}"
new="export function shortsScheduleSlots(opts:ShortScheduleOptions){return publisherUnifiedChannelSlots({...opts,now:new Date()})}"
if old not in s:
    raise SystemExit('shortsCore independent scheduler anchor missing')
s=s.replace(old,new,1);p.write_text(s)

# -----------------------------------------------------------------------------
# 3. Shorts schedule assignment requires a fresh explicit YouTube sync.
#    The same response used to refresh status becomes the schedule source of truth.
# -----------------------------------------------------------------------------
p=root/'src/ShortsMetadata.tsx';s=p.read_text()
s=s.replace("import {readExistingCache} from './channelSchedule';\n",'')
state_anchor="[presetTags,setPresetTags]=useState('');const channel=channels.find(c=>c.id===channelId)"
if state_anchor not in s: raise SystemExit('ShortsMetadata state anchor missing')
s=s.replace(state_anchor,"[presetTags,setPresetTags]=useState(''),[youtubeScheduleRows,setYoutubeScheduleRows]=useState<Array<{publishAt?:string}>>([]),[scheduleSynced,setScheduleSynced]=useState(false);const channel=channels.find(c=>c.id===channelId)",1)
old="useEffect(()=>{setSelected([]);setPresetTitles((preset?.titleTemplates||[]).join('\\n'));setPresetDescription(preset?.descriptionTemplate||'');setPresetTags(tagsText(preset?.tags||[]))},[channelId,preset?.descriptionTemplate,preset?.tags,preset?.titleTemplates]);"
new="useEffect(()=>{setSelected([]);setYoutubeScheduleRows([]);setScheduleSynced(false);setPresetTitles((preset?.titleTemplates||[]).join('\\n'));setPresetDescription(preset?.descriptionTemplate||'');setPresetTags(tagsText(preset?.tags||[]))},[channelId,preset?.descriptionTemplate,preset?.tags,preset?.titleTemplates]);"
if old not in s: raise SystemExit('ShortsMetadata channel effect anchor missing')
s=s.replace(old,new,1)
old="const existing=(readExistingCache(channelId)?.videos||[]).map(v=>v.publishAt).filter(Boolean) as string[];const own=state.records.filter(r=>r.sourceChannelId===channelId&&!selected.includes(r.id)).map(r=>r.publishAt).filter(Boolean) as string[];try{const slots=shortsScheduleSlots({startDate,times:selectedTimes,count:target.length,occupied:[...existing,...own]});"
new="if(!scheduleSynced){toast('Сначала синхронизируйте Shorts с YouTube — YouTube является source of truth для publishAt');return}const existing=youtubeScheduleRows.map(v=>v.publishAt).filter(Boolean) as string[];const own=state.records.filter(r=>r.sourceChannelId===channelId&&!selected.includes(r.id)).map(r=>r.publishAt).filter(Boolean) as string[];try{const slots=shortsScheduleSlots({startDate,times:selectedTimes,count:target.length,occupied:[...existing,...own]});"
if old not in s: raise SystemExit('ShortsMetadata schedule source anchor missing')
s=s.replace(old,new,1)
old="const res=await api.youtubeListExisting(profileId,5000),map=new Map(res.videos.map(v=>[v.id,v]));for(const r of rows.filter(x=>x.youtubeVideoId)){"
new="const res=await api.youtubeListExisting(profileId,5000);setYoutubeScheduleRows((res.videos||[]).map(v=>({publishAt:v.publishAt})));setScheduleSynced(true);const map=new Map(res.videos.map(v=>[v.id,v]));for(const r of rows.filter(x=>x.youtubeVideoId)){"
if old not in s: raise SystemExit('ShortsMetadata sync source anchor missing')
s=s.replace(old,new,1)
s=s.replace("toast('Статусы Shorts синхронизированы вручную')","toast('Shorts синхронизированы с YouTube: статусы и реальный publishAt обновлены')",1)
p.write_text(s)

# -----------------------------------------------------------------------------
# 4. Regression tests for the user-specified schedule cases.
# -----------------------------------------------------------------------------
(root/'src/v2100UnifiedSchedule.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';
import {publisherUnifiedChannelSlots} from './publisherSchedule';
import {readFileSync} from 'node:fs';

describe('VYRON 2.1 unified Long + Shorts channel scheduler',()=>{
 it('10 Sep + YouTube latest 15 Dec daily => 16 Dec',()=>{
  const slots=publisherUnifiedChannelSlots({startDate:'2026-09-10',times:['18:00'],count:1,occupied:['2026-12-15T11:00:00.000Z'],now:new Date('2026-09-10T00:00:00.000Z')});
  expect(slots[0]).toBe('2026-12-16T11:00:00.000Z');
 });
 it('latest yesterday always yields a future valid slot',()=>{
  const now=new Date('2026-09-10T10:00:00.000Z');const [slot]=publisherUnifiedChannelSlots({startDate:'2026-09-09',times:['18:00'],count:1,occupied:['2026-09-09T11:00:00.000Z'],now});
  expect(Date.parse(slot)).toBeGreaterThan(now.getTime());
 });
 it('future latest blocks tomorrow and starts after it',()=>{
  const [slot]=publisherUnifiedChannelSlots({startDate:'2026-09-11',times:['18:00'],count:1,occupied:['2026-12-15T11:00:00.000Z'],now:new Date('2026-09-10T00:00:00.000Z')});
  expect(slot).toBe('2026-12-16T11:00:00.000Z');
 });
 it('normalizes timezone offsets by instant, not raw string',()=>{
  const slots=publisherUnifiedChannelSlots({startDate:'2026-09-10',times:['18:00','19:00'],count:1,occupied:['2026-09-10T18:00:00+07:00','2026-09-10T11:00:00Z'],now:new Date('2026-09-10T00:00:00Z')});
  expect(slots[0]).toBe('2026-09-10T12:00:00.000Z');
 });
 it('Shorts wrapper delegates to publisher scheduler and requires explicit YouTube sync',()=>{
  const core=readFileSync('src/shortsCore.ts','utf8'),ui=readFileSync('src/ShortsMetadata.tsx','utf8');
  expect(core).toContain('return publisherUnifiedChannelSlots');
  expect(core).not.toContain("date=addCalendarDays(date,1)");
  expect(ui).toContain('scheduleSynced');
  expect(ui).toContain('youtubeScheduleRows');
  expect(ui).toContain('YouTube является source of truth');
 });
});
''')

print('VYRON 2.1.0 hardening applied: unified scheduler + Shorts YouTube source of truth')
