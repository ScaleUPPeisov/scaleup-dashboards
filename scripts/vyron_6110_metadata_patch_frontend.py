from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_GUARD_FAIL:{label}:expected=1:actual={count}")
    return text.replace(old, new, 1)


Path("src/metadataPatch.ts").write_text("""import type {ImportedMetadata} from './metadata';
import type {YoutubeExistingVideo} from './types';

export type YoutubeExistingMutationPatch={
  title?:string;
  description?:string;
  tags?:string[];
  publishAt?:string;
  privacyStatus?:'private'|'public'|'unlisted';
  categoryId?:string;
};

export function buildExistingMetadataPatch(
  video:YoutubeExistingVideo,
  row:ImportedMetadata,
  options:{scheduleEditEnabled:boolean;publishAt?:string}
):YoutubeExistingMutationPatch{
  const patch:YoutubeExistingMutationPatch={};
  if(row.title&&row.title!==video.title)patch.title=row.title;
  if(row.description&&row.description!==video.description)patch.description=row.description;
  if(row.tags?.length&&JSON.stringify(row.tags)!==JSON.stringify(video.tags))patch.tags=row.tags;
  if(options.scheduleEditEnabled&&options.publishAt&&(options.publishAt||'')!==(video.publishAt||''))patch.publishAt=options.publishAt;
  return patch
}
""",encoding="utf-8")

Path("src/vyron6110MetadataPatch.test.ts").write_text("""import {describe,expect,it} from 'vitest';
import {buildExistingMetadataPatch} from './metadataPatch';
import type {YoutubeExistingVideo} from './types';

const video=(privacyStatus:'private'|'public'|'unlisted'='private',publishAt?:string):YoutubeExistingVideo=>({
  id:'VID',title:'Old title',description:'Old description',tags:['old','tag'],privacyStatus,publishAt,categoryId:'10',selected:true
} as YoutubeExistingVideo);

describe('VYRON 6.1.10 exact metadata PATCH contract',()=>{
  it('A PRIVATE title-only emits title and no schedule/privacy fields',()=>{
    const patch=buildExistingMetadataPatch(video('private'),{title:'New title'} as any,{scheduleEditEnabled:false});
    expect(patch).toEqual({title:'New title'});
    expect(patch).not.toHaveProperty('publishAt');
    expect(patch).not.toHaveProperty('privacyStatus');
  });
  it('B existing future publishAt stays absent for title-only',()=>{
    const patch=buildExistingMetadataPatch(video('private','2026-11-01T18:00:00+07:00'),{title:'New title'} as any,{scheduleEditEnabled:false,publishAt:'2026-12-01T18:00:00+07:00'});
    expect(patch).toEqual({title:'New title'});
  });
  it('C UNLISTED description-only emits description only',()=>{
    expect(buildExistingMetadataPatch(video('unlisted'),{description:'New description'} as any,{scheduleEditEnabled:false})).toEqual({description:'New description'});
  });
  it('D PUBLIC tags-only emits tags only',()=>{
    expect(buildExistingMetadataPatch(video('public'),{tags:['new','tags']} as any,{scheduleEditEnabled:false})).toEqual({tags:['new','tags']});
  });
  it('E explicit schedule opt-in may emit publishAt',()=>{
    const publishAt='2026-12-01T18:00:00+07:00';
    expect(buildExistingMetadataPatch(video('private','2026-11-01T18:00:00+07:00'),{} as any,{scheduleEditEnabled:true,publishAt})).toEqual({publishAt});
  });
  it('F batch of 9 PRIVATE title-only rows needs no schedule payload',()=>{
    const patches=Array.from({length:9},(_,i)=>buildExistingMetadataPatch({...video('private',`2026-11-${String(i+1).padStart(2,'0')}T18:00:00+07:00`),id:`V${i}`} as YoutubeExistingVideo,{title:`New ${i}`} as any,{scheduleEditEnabled:false}));
    expect(patches).toHaveLength(9);
    patches.forEach((patch,i)=>expect(patch).toEqual({title:`New ${i}`}));
  });
});
""",encoding="utf-8")

p=Path("src/api.ts")
s=p.read_text(encoding="utf-8")
s=replace_once(s,
"export type AiMetadata={title:string;description:string;tags:string[]};",
"export type AiMetadata={title:string;description:string;tags:string[]};\nexport type YoutubeExistingMutationPatch={title?:string;description?:string;tags?:string[];publishAt?:string;privacyStatus?:'private'|'public'|'unlisted';categoryId?:string};",
"api-patch-type")
old="youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string,privacyStatus?:string,categoryId?:string,operationId?:string)=>ytInvoke<{id:string;verified:boolean;metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;verificationError?:string|null;mismatches?:string[];skipped?:boolean;appliedTags?:number;actual?:{title?:string;description?:string;tags?:string[];publishAt?:string|null;privacyStatus?:string;categoryId?:string}}>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt,privacyStatus,categoryId,operationId}),"
new="youtubeUpdateExisting:(profileId:string,videoId:string,patch:YoutubeExistingMutationPatch,operationId?:string)=>ytInvoke<{id:string;verified:boolean;metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;verificationError?:string|null;mismatches?:string[];skipped?:boolean;appliedTags?:number;actual?:{title?:string;description?:string;tags?:string[];publishAt?:string|null;privacyStatus?:string;categoryId?:string}}>('youtube_update_existing_video',{profileId,videoId,...patch,operationId}),"
s=replace_once(s,old,new,"api-exact-patch-spread")
p.write_text(s,encoding="utf-8")

p=Path("src/MetadataPage.tsx")
s=p.read_text(encoding="utf-8")
s=replace_once(s,"import {MetadataQueuePanel} from './MetadataQueuePanel';","import {MetadataQueuePanel} from './MetadataQueuePanel';\nimport {buildExistingMetadataPatch} from './metadataPatch';","metadata-patch-import")
s=replace_once(s,"[scheduleMode,setScheduleMode]=useState<'auto'|'manual'>('auto'),[customPattern,setCustomPattern]=useState(false)","[scheduleMode,setScheduleMode]=useState<'auto'|'manual'>('auto'),[changeSchedule,setChangeSchedule]=useState(false),[customPattern,setCustomPattern]=useState(false)","metadata-schedule-opt-in-state")
s=replace_once(s,"setCadence(d?.cadence||channel?.cadenceDays||2);setScheduleMode(d?.scheduleMode||'auto');setTarget(d?.target||'youtube');","setCadence(d?.cadence||channel?.cadenceDays||2);setScheduleMode(d?.scheduleMode||'auto');setChangeSchedule(false);setTarget(d?.target||'youtube');","metadata-opt-in-reset")
s=replace_once(s,"const schedulePairs=useMemo(()=>selectedYt.map((v,i)=>({v,row:rows[i]})).filter(x=>scheduleMode==='manual'||!x.v.publishAt),[selectedYt,rows,scheduleMode]);","const schedulePairs=useMemo(()=>changeSchedule?selectedYt.map((v,i)=>({v,row:rows[i]})).filter(x=>scheduleMode==='manual'||!x.v.publishAt):[],[changeSchedule,selectedYt,rows,scheduleMode]);","metadata-schedule-pairs-gate")
old_loop="""const basePublishAt=scheduleById.get(v.id)||v.publishAt;const publishAt=v.privacyStatus==='private'?resolveKratPublishAt(r.publishAt,basePublishAt):v.publishAt;
      const title=r.title||v.title,description=r.description||v.description,tags=r.tags?.length?r.tags:v.tags;const candidateFields:MetadataChangedField[]=[];if(title!==v.title)candidateFields.push('title');if(description!==v.description)candidateFields.push('description');if(JSON.stringify(tags)!==JSON.stringify(v.tags))candidateFields.push('tags');if((publishAt||'')!==(v.publishAt||''))candidateFields.push('publish date/time');const result=await api.youtubeUpdateExisting(profileId,v.id,title,description,tags,publishAt,v.privacyStatus,v.categoryId,operationId);"""
new_loop="""const basePublishAt=scheduleById.get(v.id)||v.publishAt;const requestedPublishAt=changeSchedule&&v.privacyStatus==='private'?resolveKratPublishAt(r.publishAt,basePublishAt):undefined;
      const patch=buildExistingMetadataPatch(v,r,{scheduleEditEnabled:changeSchedule,publishAt:requestedPublishAt});const title=patch.title??v.title,description=patch.description??v.description,tags=patch.tags??v.tags,publishAt=patch.publishAt??v.publishAt;const candidateFields:MetadataChangedField[]=[];if('title' in patch)candidateFields.push('title');if('description' in patch)candidateFields.push('description');if('tags' in patch)candidateFields.push('tags');if('publishAt' in patch)candidateFields.push('publish date/time');const result=await api.youtubeUpdateExisting(profileId,v.id,patch,operationId);"""
s=replace_once(s,old_loop,new_loop,"metadata-exact-patch-call")
s=replace_once(s,"<div className=\"headerActions\"><button className=\"primary\"","<div className=\"headerActions\">{target==='youtube'&&<label className=\"metadataScheduleOptIn\"><input type=\"checkbox\" checked={changeSchedule} onChange={e=>setChangeSchedule(e.target.checked)}/> Изменить дату и время публикации</label>}<button className=\"primary\"","metadata-opt-in-control")
s=replace_once(s,"<div className=\"scheduleMini scheduleSmart\">","{changeSchedule&&<div className=\"scheduleMini scheduleSmart\">","metadata-hide-schedule-controls-open")
s=replace_once(s,"<small>Если DOCX содержит PUBLISH TIME, для конкретного видео используется его время. Даты продолжают расписание текущего канала.</small></div></section>}","<small>Если DOCX содержит PUBLISH TIME, для конкретного видео используется его время. Даты продолжают расписание текущего канала.</small></div>}</section>}","metadata-hide-schedule-controls-close")
s=replace_once(s,"const matched=useMemo(()=>matches.reduce((n,m)=>n+Number(Boolean(target==='future'?m.job:m.video)),0),[matches,target]);","const matched=useMemo(()=>matches.reduce((n,m)=>n+Number(Boolean(target==='future'?m.job:m.video)),0),[matches,target]);\n const metadataApplySummary=useMemo(()=>matches.reduce((a,m)=>{const v=m.video,r=m.row;if(!v)return a;if(r.title&&r.title!==v.title)a.title++;if(r.description&&r.description!==v.description)a.description++;if(r.tags?.length&&JSON.stringify(r.tags)!==JSON.stringify(v.tags))a.tags++;return a},{title:0,description:0,tags:0}),[matches]);","metadata-apply-summary-model")
summary_panel="{target==='youtube'&&selectedYt.length>0&&<section className=\"panel metadataMutationSummary\"><div className=\"panelHead\"><div><small>ТОЧНЫЙ ПЛАН ИЗМЕНЕНИЙ</small><h3>Будет изменено</h3></div><span>{selectedYt.length} видео</span></div><div className=\"metadataDraftFacts\">{metadataApplySummary.title>0&&<span><b>{metadataApplySummary.title}</b><small>Название</small></span>}{metadataApplySummary.description>0&&<span><b>{metadataApplySummary.description}</b><small>Описание</small></span>}{metadataApplySummary.tags>0&&<span><b>{metadataApplySummary.tags}</b><small>Теги</small></span>}{changeSchedule&&<span><b>{schedulePairs.length}</b><small>Дата / время</small></span>}</div><p><b>Без изменений:</b> статус доступа{!changeSchedule?' • дата публикации • время публикации • расписание':''}</p></section>}\n  "
s=replace_once(s,"{history.length>0&&<details className=\"panel metadataHistory\">",summary_panel+"{history.length>0&&<details className=\"panel metadataHistory\">","metadata-apply-summary-ui")
p.write_text(s,encoding="utf-8")

Path("src/vyron6110MetadataScheduleOptIn.test.ts").write_text("""import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

describe('VYRON 6.1.10 metadata schedule opt-in wiring',()=>{
  const page=fs.readFileSync(new URL('./MetadataPage.tsx',import.meta.url),'utf8');
  const api=fs.readFileSync(new URL('./api.ts',import.meta.url),'utf8');
  const native=fs.readFileSync(new URL('../src-tauri/src/youtube.rs',import.meta.url),'utf8');
  it('defaults schedule edit OFF and removes schedule pairs while off',()=>{
    expect(page).toContain("[changeSchedule,setChangeSchedule]=useState(false)");
    expect(page).toContain("changeSchedule?selectedYt.map");
    expect(page).toContain('Изменить дату и время публикации');
  });
  it('sends an exact patch object instead of full existing state',()=>{
    expect(page).toContain('api.youtubeUpdateExisting(profileId,v.id,patch,operationId)');
    expect(api).toContain('{profileId,videoId,...patch,operationId}');
  });
  it('native missing publishAt is not inferred as a schedule edit',()=>{
    expect(native).toContain('title: Option<String>');
    expect(native).toContain('description: Option<String>');
    expect(native).toContain('tags: Option<Vec<String>>');
    expect(native).toContain('let publish_changed = publish_requested && !same_publish_time(publish, old_publish);');
    expect(native).toContain('let schedule_requested = publish_changed || privacy_changed;');
  });
});
""",encoding="utf-8")

print('FRONTEND_METADATA_PATCH=APPLIED')
