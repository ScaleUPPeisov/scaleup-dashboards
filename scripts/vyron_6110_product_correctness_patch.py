from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_GUARD_FAIL:{label}:expected=1:actual={count}")
    return text.replace(old, new, 1)


# VYRON 6.1.10 metadata-only correction.
# Inventory correction is committed separately; this patcher intentionally
# touches only MetadataPage + its focused regression guard.
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

print("VYRON_6110_METADATA_PATCH=APPLIED")
print("TOUCHED=src/MetadataPage.tsx,src/vyron6110MetadataScheduleOptIn.test.ts")
