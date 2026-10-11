from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_GUARD_FAIL:{label}:expected=1:actual={count}")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# Metadata: schedule is explicit opt-in for existing YouTube videos.
# -----------------------------------------------------------------------------
p = Path("src/MetadataPage.tsx")
s = p.read_text(encoding="utf-8")

s = replace_once(
    s,
    "[scheduleMode,setScheduleMode]=useState<'auto'|'manual'>('auto'),[customPattern,setCustomPattern]=useState(false)",
    "[scheduleMode,setScheduleMode]=useState<'auto'|'manual'>('auto'),[changeSchedule,setChangeSchedule]=useState(false),[customPattern,setCustomPattern]=useState(false)",
    "metadata-schedule-opt-in-state",
)

s = replace_once(
    s,
    "const schedulePairs=useMemo(()=>selectedYt.map((v,i)=>({v,row:rows[i]})).filter(x=>scheduleMode==='manual'||!x.v.publishAt),[selectedYt,rows,scheduleMode]);",
    "const schedulePairs=useMemo(()=>changeSchedule?selectedYt.map((v,i)=>({v,row:rows[i]})).filter(x=>scheduleMode==='manual'||!x.v.publishAt):[],[changeSchedule,selectedYt,rows,scheduleMode]);",
    "metadata-schedule-pairs-gate",
)

s = replace_once(
    s,
    "const basePublishAt=scheduleById.get(v.id)||v.publishAt;const publishAt=v.privacyStatus==='private'?resolveKratPublishAt(r.publishAt,basePublishAt):v.publishAt;",
    "const basePublishAt=scheduleById.get(v.id)||v.publishAt;const publishAt=changeSchedule&&v.privacyStatus==='private'?resolveKratPublishAt(r.publishAt,basePublishAt):v.publishAt;",
    "metadata-publish-at-gate",
)

s = replace_once(
    s,
    "<div className=\"headerActions\"><button className=\"primary\"",
    "<div className=\"headerActions\">{target==='youtube'&&<label className=\"metadataScheduleOptIn\"><input type=\"checkbox\" checked={changeSchedule} onChange={e=>setChangeSchedule(e.target.checked)}/> Изменить дату и время публикации</label>}<button className=\"primary\"",
    "metadata-opt-in-control",
)

s = replace_once(
    s,
    "<div className=\"scheduleMini scheduleSmart\">",
    "{changeSchedule&&<div className=\"scheduleMini scheduleSmart\">",
    "metadata-hide-schedule-controls-open",
)

s = replace_once(
    s,
    "<small>Если DOCX содержит PUBLISH TIME, для конкретного видео используется его время. Даты продолжают расписание текущего канала.</small></div></section>}",
    "<small>Если DOCX содержит PUBLISH TIME, для конкретного видео используется его время. Даты продолжают расписание текущего канала.</small></div>}</section>}",
    "metadata-hide-schedule-controls-close",
)

s = replace_once(
    s,
    "const matched=useMemo(()=>matches.reduce((n,m)=>n+Number(Boolean(target==='future'?m.job:m.video)),0),[matches,target]);",
    "const matched=useMemo(()=>matches.reduce((n,m)=>n+Number(Boolean(target==='future'?m.job:m.video)),0),[matches,target]);\n const metadataApplySummary=useMemo(()=>matches.reduce((a,m)=>{const v=m.video,r=m.row;if(!v)return a;if(r.title&&r.title!==v.title)a.title++;if(r.description&&r.description!==v.description)a.description++;if(r.tags?.length&&JSON.stringify(r.tags)!==JSON.stringify(v.tags))a.tags++;return a},{title:0,description:0,tags:0}),[matches]);",
    "metadata-apply-summary-model",
)

summary_panel = "{target==='youtube'&&selectedYt.length>0&&<section className=\"panel metadataMutationSummary\"><div className=\"panelHead\"><div><small>ТОЧНЫЙ ПЛАН ИЗМЕНЕНИЙ</small><h3>Будет изменено</h3></div><span>{selectedYt.length} видео</span></div><div className=\"metadataDraftFacts\">{metadataApplySummary.title>0&&<span><b>{metadataApplySummary.title}</b><small>Название</small></span>}{metadataApplySummary.description>0&&<span><b>{metadataApplySummary.description}</b><small>Описание</small></span>}{metadataApplySummary.tags>0&&<span><b>{metadataApplySummary.tags}</b><small>Теги</small></span>}{changeSchedule&&<span><b>{schedulePairs.length}</b><small>Дата / время</small></span>}</div><p><b>Без изменений:</b> статус доступа{!changeSchedule?' • дата публикации • время публикации • расписание':''}</p></section>}\n  "
s = replace_once(
    s,
    "{history.length>0&&<details className=\"panel metadataHistory\">",
    summary_panel + "{history.length>0&&<details className=\"panel metadataHistory\">",
    "metadata-apply-summary-ui",
)

p.write_text(s, encoding="utf-8")


# -----------------------------------------------------------------------------
# Inventory: disconnected storage is not a true product error.
# Keep the existing row-state contract for compatibility; split owner counters.
# -----------------------------------------------------------------------------
p = Path("src/dailyOperations.ts")
s = p.read_text(encoding="utf-8")

s = replace_once(
    s,
    "uploadedToday:number;processedChannels:number;unprocessedChannels:number;localReady:number;emptyChannels:number;errors:number;lastUploadAt?:string;rows:DailyChannelOperation[];",
    "uploadedToday:number;processedChannels:number;unprocessedChannels:number;localReady:number;emptyChannels:number;onlineChannels:number;offlineChannels:number;attentionChannels:number;errors:number;lastUploadAt?:string;rows:DailyChannelOperation[];",
    "inventory-summary-shape",
)

s = replace_once(
    s,
    "emptyChannels:rows.filter(x=>x.folderState==='AVAILABLE'&&x.localReady===0).length,\n    errors:rows.filter(x=>x.folderState==='ERROR'||x.folderState==='UNAVAILABLE').length,",
    "emptyChannels:rows.filter(x=>x.folderState==='AVAILABLE'&&x.localReady===0).length,\n    onlineChannels:rows.filter(x=>x.folderState==='AVAILABLE').length,\n    offlineChannels:rows.filter(x=>x.folderState==='UNAVAILABLE').length,\n    attentionChannels:rows.filter(x=>x.folderState==='NOT_CONFIGURED'||x.folderState==='UNKNOWN').length,\n    errors:rows.filter(x=>x.folderState==='ERROR').length,",
    "inventory-offline-not-error",
)

p.write_text(s, encoding="utf-8")


# -----------------------------------------------------------------------------
# Daily Operations UI: owner-facing separate counters and filters.
# -----------------------------------------------------------------------------
p = Path("src/DailyOperationsCenter.tsx")
s = p.read_text(encoding="utf-8")

s = replace_once(
    s,
    "type Filter='ALL'|'UNPROCESSED'|'PROCESSED'|'EMPTY'|'NO_FOLDER'|'ERRORS';",
    "type Filter='ALL'|'UNPROCESSED'|'PROCESSED'|'EMPTY'|'OFFLINE'|'NO_FOLDER'|'ERRORS';",
    "inventory-filter-type",
)

s = replace_once(
    s,
    "if(filter==='EMPTY')return row.folderState==='AVAILABLE'&&row.localReady===0;\n    if(filter==='NO_FOLDER')return row.folderState==='NOT_CONFIGURED';\n    if(filter==='ERRORS')return row.folderState==='ERROR'||row.folderState==='UNAVAILABLE';",
    "if(filter==='EMPTY')return row.folderState==='AVAILABLE'&&row.localReady===0;\n    if(filter==='OFFLINE')return row.folderState==='UNAVAILABLE';\n    if(filter==='NO_FOLDER')return row.folderState==='NOT_CONFIGURED';\n    if(filter==='ERRORS')return row.folderState==='ERROR';",
    "inventory-filter-logic",
)

s = replace_once(
    s,
    "<span><small>ОШИБОК / НЕДОСТУПНО</small><b>{summary.errors}</b></span>",
    "<span><small>ОНЛАЙН</small><b>{summary.onlineChannels}</b></span>\n      <span><small>ДИСКИ ОТКЛЮЧЕНЫ</small><b>{summary.offlineChannels}</b></span>\n      <span><small>ТРЕБУЮТ ВНИМАНИЯ</small><b>{summary.attentionChannels}</b></span>\n      <span><small>ОШИБКИ</small><b>{summary.errors}</b></span>",
    "inventory-kpis",
)

s = replace_once(
    s,
    "['EMPTY','Нет видео '+summary.emptyChannels],\n        ['NO_FOLDER','Нет папки '+summary.rows.filter(x=>x.folderState==='NOT_CONFIGURED').length],\n        ['ERRORS','Ошибки '+summary.errors]",
    "['EMPTY','Нет видео '+summary.emptyChannels],\n        ['OFFLINE','Диски отключены '+summary.offlineChannels],\n        ['NO_FOLDER','Нет папки '+summary.rows.filter(x=>x.folderState==='NOT_CONFIGURED').length],\n        ['ERRORS','Ошибки '+summary.errors]",
    "inventory-filter-buttons",
)

s = replace_once(
    s,
    "<span><b>{row.localReady==null?'—':row.localReady}</b><small>{row.folderState==='UNAVAILABLE'?'последний подтверждённый запас':row.folderState==='NOT_CONFIGURED'?'Render не выбран':'готово к загрузке'}</small></span>",
    "<span><b>{row.localReady==null?'—':row.localReady}</b><small>{row.folderState==='UNAVAILABLE'?'Диск отключён • последний подтверждённый запас':row.folderState==='NOT_CONFIGURED'?'Render не выбран':row.folderState==='ERROR'?'Ошибка чтения Render':'готово к загрузке'}</small></span>",
    "inventory-owner-copy",
)

p.write_text(s, encoding="utf-8")


# -----------------------------------------------------------------------------
# Regression tests: OFFLINE/UNAVAILABLE must never inflate true errors.
# -----------------------------------------------------------------------------
p = Path("src/dailyOperations.test.ts")
s = p.read_text(encoding="utf-8")

needle = "\n});\n"
idx = s.rfind(needle)
if idx < 0:
    raise SystemExit("PATCH_GUARD_FAIL:daily-operations-test-tail")

test = r'''
 it('separates disconnected storage from true errors and retains cached stock',()=>{
   const now=new Date(2026,9,11,12,0,0);
   const offline={...snapshot('a',10),folderState:'OFFLINE' as const,stale:true,lastSuccessAt:'2026-10-10T10:00:00.000Z'};
   const result=buildDailyOperations([channel()],[],{a:offline},now);
   expect(result.offlineChannels).toBe(1);
   expect(result.errors).toBe(0);
   expect(result.localReady).toBe(10);
   expect(result.rows[0].folderState).toBe('UNAVAILABLE');
   expect(result.rows[0].localReady).toBe(10);
 });
 it('counts only reachable scan/read failures as errors',()=>{
   const now=new Date(2026,9,11,12,0,0);
   const broken={...snapshot('a',0),folderState:'ERROR' as const,stale:false,error:'permission denied'};
   const result=buildDailyOperations([channel()],[],{a:broken},now);
   expect(result.errors).toBe(1);
   expect(result.offlineChannels).toBe(0);
 });
'''
s = s[:idx] + test + s[idx:]
p.write_text(s, encoding="utf-8")


# -----------------------------------------------------------------------------
# Source guard: metadata-only must not enter schedule path by default.
# -----------------------------------------------------------------------------
Path("src/vyron6110MetadataScheduleOptIn.test.ts").write_text(r'''import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

describe('VYRON 6.1.10 metadata schedule opt-in guard',()=>{
  const source=fs.readFileSync(new URL('./MetadataPage.tsx',import.meta.url),'utf8');
  it('defaults schedule mutation to OFF',()=>{
    expect(source).toContain("[changeSchedule,setChangeSchedule]=useState(false)");
    expect(source).toContain("changeSchedule?selectedYt.map");
  });
  it('preserves publishAt for metadata-only operations',()=>{
    expect(source).toContain("const publishAt=changeSchedule&&v.privacyStatus==='private'?resolveKratPublishAt(r.publishAt,basePublishAt):v.publishAt");
  });
  it('exposes an explicit schedule opt-in and hides schedule controls while off',()=>{
    expect(source).toContain('Изменить дату и время публикации');
    expect(source).toContain('{changeSchedule&&<div className="scheduleMini scheduleSmart">');
  });
});
''', encoding="utf-8")

print("VYRON_6110_PRODUCT_CORRECTNESS_PATCH=APPLIED")
print("TOUCHED=src/MetadataPage.tsx,src/dailyOperations.ts,src/DailyOperationsCenter.tsx,src/dailyOperations.test.ts,src/vyron6110MetadataScheduleOptIn.test.ts")
