from pathlib import Path
import sys

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()

def file_path(path: str) -> Path:
    return ROOT / path

def replace_exact(path: str, old: str, new: str, expected: int = 1):
    p = file_path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {count}: {old[:160]!r}")
    p.write_text(text.replace(old, new))

# Existing per-channel workspace model: additive field + backward-compatible load default.
replace_exact('src/publishWorkspaceState.ts',
    "export type PublishScheduleMode='file'|'daily'|'2/2'|'3/1';",
    "export type PublishScheduleMode='file'|'daily'|'2/2'|'3/1'|'every_n_days';")
replace_exact('src/publishWorkspaceState.ts',
    "scheduleStartDate:string;scheduleTime:string;updatedAt:string};",
    "scheduleStartDate:string;scheduleTime:string;intervalDays:number;updatedAt:string};")
replace_exact('src/publishWorkspaceState.ts',
    "scheduleStartDate:'',scheduleTime:'',updatedAt:new Date(0).toISOString()",
    "scheduleStartDate:'',scheduleTime:'',intervalDays:3,updatedAt:new Date(0).toISOString()")
replace_exact('src/publishWorkspaceState.ts',
    "(['daily','2/2','3/1'].includes(String(x.scheduleMode))?String(x.scheduleMode):'file')",
    "(['daily','2/2','3/1','every_n_days'].includes(String(x.scheduleMode))?String(x.scheduleMode):'file')")
replace_exact('src/publishWorkspaceState.ts',
    "scheduleTime:String(x.scheduleTime||''),updatedAt:x.updatedAt||new Date(0).toISOString()",
    "scheduleTime:String(x.scheduleTime||''),intervalDays:Number.isFinite(+x.intervalDays)&&Math.floor(+x.intervalDays)>=1?Math.floor(+x.intervalDays):3,updatedAt:x.updatedAt||new Date(0).toISOString()")

# Calendar scheduler: old branches stay intact; only the new mode is inserted.
replace_exact('src/publisherSchedule.ts',
    "export function publisherScheduleDateKeys(mode:PublishScheduleMode,startDate:string,count:number){",
    "export function publisherScheduleDateKeys(mode:PublishScheduleMode,startDate:string,count:number,intervalDays=3){")
replace_exact('src/publisherSchedule.ts',
    " if(mode==='daily'){while(out.length<wanted&&guard++<20000){out.push(key);key=addCalendarDays(key,1)}return out}\n const pattern=mode==='2/2'?{publishDays:2,pauseDays:2,anchorDate:startDate}:{publishDays:3,pauseDays:1,anchorDate:startDate};",
    " if(mode==='daily'){while(out.length<wanted&&guard++<20000){out.push(key);key=addCalendarDays(key,1)}return out}\n if(mode==='every_n_days'){const step=Math.max(1,Math.floor(Number.isFinite(intervalDays)?intervalDays:3));while(out.length<wanted&&guard++<20000){out.push(key);key=addCalendarDays(key,step)}return out}\n const pattern=mode==='2/2'?{publishDays:2,pauseDays:2,anchorDate:startDate}:{publishDays:3,pauseDays:1,anchorDate:startDate};")
replace_exact('src/publisherSchedule.ts',
    "export function publisherScheduleDates(mode:PublishScheduleMode,startDate:string,time:string,count:number){\n if(!TIME.test(time))return[] as string[];\n return publisherScheduleDateKeys(mode,startDate,count).map(day=>publisherKrasnoyarskIso(day,time)).filter(Boolean)\n}",
    "export function publisherScheduleDates(mode:PublishScheduleMode,startDate:string,time:string,count:number,intervalDays=3){\n if(!TIME.test(time))return[] as string[];\n return publisherScheduleDateKeys(mode,startDate,count,intervalDays).map(day=>publisherKrasnoyarskIso(day,time)).filter(Boolean)\n}")
replace_exact('src/publisherSchedule.ts',
    "export function publisherSchedulePreview(mode:PublishScheduleMode,startDate:string,time:string,count:number){const dates=publisherScheduleDates(mode,startDate,time,count);return{count:dates.length,first:dates[0],last:dates[dates.length-1],dates}}",
    "export function publisherSchedulePreview(mode:PublishScheduleMode,startDate:string,time:string,count:number,intervalDays=3){const dates=publisherScheduleDates(mode,startDate,time,count,intervalDays);return{count:dates.length,first:dates[0],last:dates[dates.length-1],dates}}")

# Continuation + batch resolution. Existing file fallback interval stays independent.
replace_exact('src/scheduleContinuation.ts',
    "export function recommendScheduleContinuation(videos:YoutubeScheduleLike[],mode:PublishScheduleMode,time:string,now=new Date()){",
    "export function recommendScheduleContinuation(videos:YoutubeScheduleLike[],mode:PublishScheduleMode,time:string,now=new Date(),intervalDays=3){")
replace_exact('src/scheduleContinuation.ts',
    " if(lastPublishAt){const lastDate=localParts(lastPublishAt).date;date=addCalendarDays(lastDate,mode==='2/2'?2:1)}",
    " if(lastPublishAt){const lastDate=localParts(lastPublishAt).date,step=mode==='2/2'?2:mode==='every_n_days'?Math.max(1,Math.floor(Number.isFinite(intervalDays)?intervalDays:3)):1;date=addCalendarDays(lastDate,step)}")
replace_exact('src/scheduleContinuation.ts',
    "occupied?:string[];now?:Date;fallbackIntervalDays?:number};",
    "occupied?:string[];now?:Date;intervalDays?:number;fallbackIntervalDays?:number};")
replace_exact('src/scheduleContinuation.ts',
    "publisherScheduleDates(opts.mode,opts.startDate,opts.time,Math.max(count*8,count+256))",
    "publisherScheduleDates(opts.mode,opts.startDate,opts.time,Math.max(count*8,count+256),opts.intervalDays)")
replace_exact('src/scheduleContinuation.ts',
    "publisherScheduleDateKeys(opts.mode,opts.startDate,Math.max(count*16,count+512))",
    "publisherScheduleDateKeys(opts.mode,opts.startDate,Math.max(count*16,count+512),opts.intervalDays)")

# Existing Publisher UI: same DATES row + compact inline configuration, TIME untouched.
replace_exact('src/PublisherOS.tsx',
    "fallbackIntervalDays:Math.max(1,channel?.publishIntervalDays||channel?.cadenceDays||1)}",
    "intervalDays:draft.intervalDays,fallbackIntervalDays:Math.max(1,channel?.publishIntervalDays||channel?.cadenceDays||1)}",
    expected=2)
replace_exact('src/PublisherOS.tsx',
    "[batchActive,draft.scheduleMode,draft.scheduleTimeSource,scheduleStart,effectiveScheduleTime,selectedKey,scheduleRowsKey,scheduleSync.state,scheduleSync.youtubeTime,scheduleSync.occupied.join('|'),channel?.publishIntervalDays,channel?.cadenceDays]",
    "[batchActive,draft.scheduleMode,draft.intervalDays,draft.scheduleTimeSource,scheduleStart,effectiveScheduleTime,selectedKey,scheduleRowsKey,scheduleSync.state,scheduleSync.youtubeTime,scheduleSync.occupied.join('|'),channel?.publishIntervalDays,channel?.cadenceDays]")
replace_exact('src/PublisherOS.tsx',
    "[selected.map(j=>j.id).join('|'),JSON.stringify(draft.rows),draft.scheduleMode,draft.scheduleTimeSource,scheduleStart,scheduleTime,scheduleSync.youtubeTime]",
    "[selected.map(j=>j.id).join('|'),JSON.stringify(draft.rows),draft.scheduleMode,draft.intervalDays,draft.scheduleTimeSource,scheduleStart,scheduleTime,scheduleSync.youtubeTime]")
replace_exact('src/PublisherOS.tsx',
    "recommendScheduleContinuation(source,draft.scheduleMode,planningTime,now)",
    "recommendScheduleContinuation(source,draft.scheduleMode,planningTime,now,draft.intervalDays)")
replace_exact('src/PublisherOS.tsx',
    "([['file','Из файла'],['daily','Каждый день'],['2/2','2/2'],['3/1','3/1']] as Array<[PublishScheduleMode,string]>)",
    "([['file','Из файла'],['daily','Каждый день'],['2/2','2/2'],['3/1','3/1'],['every_n_days','Каждые N дней']] as Array<[PublishScheduleMode,string]>)")
replace_exact('src/PublisherOS.tsx',
    "</button>)}</div><span>{draft.scheduleMode==='file'?'Календарные даты берутся из metadata каждого VIDEO. Время выбирается отдельно.':'Даты строятся выбранным календарным графиком.'}</span></div>",
    "</button>)}</div>{draft.scheduleMode==='every_n_days'&&<label style={{display:'flex',alignItems:'center',gap:8,marginTop:10}}><span>Интервал публикации:</span><input aria-label=\"Интервал публикации\" type=\"number\" min={1} step={1} value={draft.intervalDays} onChange={e=>{const intervalDays=Math.max(1,Math.floor(Number(e.target.value)||1));setScheduleSync(x=>({...x,state:'idle',note:'Интервал изменён'}));setDraftPatch({intervalDays})}} style={{width:72}}/><span>дня</span></label>}<span>{draft.scheduleMode==='file'?'Календарные даты берутся из metadata каждого VIDEO. Время выбирается отдельно.':'Даты строятся выбранным календарным графиком.'}</span></div>")

# Focused interval date tests.
replace_exact('src/publisherSchedule.test.ts',
    "import {publisherKrasnoyarskIso,publisherScheduleDates,publisherSchedulePreview} from './publisherSchedule';",
    "import {publisherKrasnoyarskIso,publisherScheduleDateKeys,publisherScheduleDates,publisherSchedulePreview} from './publisherSchedule';")
p = file_path('src/publisherSchedule.test.ts')
text = p.read_text()
marker = "\nimport {repairPastPublishAt} from './publisherSchedule';"
if text.count(marker) != 1:
    raise SystemExit('publisherSchedule.test.ts: insertion marker mismatch')
block = """

describe('EVERY_N_DAYS calendar intervals',()=>{
 it('every 3 days is 01 -> 04 -> 07 -> 10 -> 13',()=>{expect(publisherScheduleDateKeys('every_n_days','2026-11-01',5,3)).toEqual(['2026-11-01','2026-11-04','2026-11-07','2026-11-10','2026-11-13'])});
 it('every 2 days is 01 -> 03 -> 05 -> 07',()=>{expect(publisherScheduleDateKeys('every_n_days','2026-11-01',4,2)).toEqual(['2026-11-01','2026-11-03','2026-11-05','2026-11-07'])});
 it('every 1 day is 01 -> 02 -> 03 -> 04',()=>{expect(publisherScheduleDateKeys('every_n_days','2026-11-01',4,1)).toEqual(['2026-11-01','2026-11-02','2026-11-03','2026-11-04'])});
 it('crosses month boundary with calendar arithmetic',()=>{expect(publisherScheduleDateKeys('every_n_days','2026-10-30',3,3)).toEqual(['2026-10-30','2026-11-02','2026-11-05'])});
 it('crosses year boundary with calendar arithmetic',()=>{expect(publisherScheduleDateKeys('every_n_days','2026-12-29',3,3)).toEqual(['2026-12-29','2027-01-01','2027-01-04'])});
});
"""
p.write_text(text.replace(marker, block + marker))

# Continuation + per-video file time for the new date mode.
p = file_path('src/scheduleContinuation.test.ts')
text = p.read_text()
block = """

describe('EVERY_N_DAYS continuation and time-source independence',()=>{
 it('continues 3 calendar days after the last scheduled publication',()=>{
  const videos=[{privacyStatus:'private',publishAt:'2026-11-03T07:00:00.000Z'}];
  const r=recommendScheduleContinuation(videos,'every_n_days','14:00',new Date('2026-10-31T00:00:00.000Z'),3);
  expect(r.recommendedStart).toBe('2026-11-06');
  const next=resolvePublisherBatchSchedule({mode:'every_n_days',startDate:r.recommendedStart,time:'14:00',count:3,intervalDays:3,now:new Date('2026-11-01T00:00:00.000Z')});
  expect(next.items.map(x=>x.publishAt?.slice(0,10))).toEqual(['2026-11-06','2026-11-09','2026-11-12']);
 });
 it('changes dates only while preserving each VIDEO time from file',()=>{
  const rows=[{number:1,publishTime:'07:00',source:'docx'},{number:2,publishTime:'08:30',source:'docx'},{number:3,publishTime:'10:00',source:'docx'}];
  const r=resolvePublisherBatchSchedule({mode:'every_n_days',startDate:'2026-11-01',time:'18:00',count:3,intervalDays:3,timeSource:'file',fileTimeRows:rows,now:new Date('2026-10-31T00:00:00.000Z')});
  expect(r.items.map(x=>x.publishAt)).toEqual(['2026-11-01T00:00:00.000Z','2026-11-04T01:30:00.000Z','2026-11-07T03:00:00.000Z']);
 });
});
"""
p.write_text(text + block)

# Per-channel isolation + persistence/restart compatibility.
file_path('src/publishWorkspaceState.interval.test.ts').write_text("""import {beforeEach,describe,expect,it} from 'vitest';
import {loadPublishWorkspace,savePublishWorkspace} from './publishWorkspaceState';

const memory=new Map<string,string>();
const storage={
 getItem:(key:string)=>memory.has(key)?memory.get(key)!:null,
 setItem:(key:string,value:string)=>{memory.set(key,String(value))},
 removeItem:(key:string)=>{memory.delete(key)},
 clear:()=>memory.clear(),
 key:(index:number)=>[...memory.keys()][index]??null,
 get length(){return memory.size}
} as Storage;
Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});

beforeEach(()=>memory.clear());

describe('EVERY_N_DAYS per-channel persistence',()=>{
 it('keeps schedule modes and intervals isolated by channel',()=>{
  savePublishWorkspace('A',{scheduleMode:'2/2'});
  savePublishWorkspace('B',{scheduleMode:'every_n_days',intervalDays:3});
  savePublishWorkspace('C',{scheduleMode:'3/1'});
  expect(loadPublishWorkspace('A').scheduleMode).toBe('2/2');
  expect(loadPublishWorkspace('B')).toMatchObject({scheduleMode:'every_n_days',intervalDays:3});
  expect(loadPublishWorkspace('C').scheduleMode).toBe('3/1');
 });
 it('survives save then reload with interval 3',()=>{
  savePublishWorkspace('B',{scheduleMode:'every_n_days',intervalDays:3});
  expect(loadPublishWorkspace('B')).toMatchObject({scheduleMode:'every_n_days',intervalDays:3});
 });
 it('defaults old persisted workspaces without intervalDays to 3',()=>{
  memory.set('vyron:youtube-publish-workspaces:v2',JSON.stringify({legacy:{channelId:'legacy',selectedIds:[],rows:[],docx:false,thumbs:[],allowMissingThumbs:false,allowDuplicate:false,scheduleMode:'daily',scheduleTimeSource:'common',scheduleStartDate:'',scheduleTime:'18:00',updatedAt:'2026-01-01T00:00:00.000Z'}}));
  expect(loadPublishWorkspace('legacy')).toMatchObject({scheduleMode:'daily',intervalDays:3});
 });
});
""")

print('EVERY_N_DAYS_PATCH_APPLIED=YES')
