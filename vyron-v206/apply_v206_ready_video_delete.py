#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p): return (ROOT/p).read_text()
def w(p,s):
    q=ROOT/p
    q.parent.mkdir(parents=True,exist_ok=True)
    q.write_text(s)
def rep(p,a,b,count=1):
    s=r(p)
    if a not in s: raise SystemExit(f'v206 ready-delete missing anchor {p}: {a[:220]!r}')
    w(p,s.replace(a,b,count))

# Pure, testable workspace repair. Metadata rows are positionally mapped to the
# currently selected VIDEO order, so deleting one selected VIDEO must delete the
# corresponding row rather than silently shifting another video's SEO onto it.
w('src/publishRemoval.ts',r'''import type {ImportedMetadata} from './metadata';

export type PublishRemovalRepair={selectedIds:string[];rows:ImportedMetadata[]};
export function removeSelectedPublishItems(selectedIds:string[],selectedOrder:string[],rows:ImportedMetadata[],removedIds:string[]):PublishRemovalRepair{
 const removed=new Set(removedIds),indices=new Set<number>();
 selectedOrder.forEach((id,i)=>{if(removed.has(id))indices.add(i)});
 return {
  selectedIds:selectedIds.filter(id=>!removed.has(id)),
  rows:rows.filter((_,i)=>!indices.has(i)),
 };
}
''')

w('src/publishRemoval.test.ts',r'''import {describe,expect,it} from 'vitest';
import {removeSelectedPublishItems} from './publishRemoval';

const row=(n:number)=>({number:n,title:`TITLE ${n}`,description:`DESC ${n}`,tags:[`tag${n}`]});
describe('publisher ready-video removal repair',()=>{
 it('removes one selected VIDEO and its mapped DOCX row',()=>{const x=removeSelectedPublishItems(['a','b','c'],['a','b','c'],[row(1),row(2),row(3)],['b']);expect(x.selectedIds).toEqual(['a','c']);expect(x.rows.map(r=>r.number)).toEqual([1,3])});
 it('removes a bulk selection without shifting surviving metadata',()=>{const x=removeSelectedPublishItems(['a','b','c','d'],['a','b','c','d'],[row(1),row(2),row(3),row(4)],['a','d']);expect(x.selectedIds).toEqual(['b','c']);expect(x.rows.map(r=>r.number)).toEqual([2,3])});
 it('does not touch DOCX rows when an unselected VIDEO is removed',()=>{const x=removeSelectedPublishItems(['a','b'],['a','b'],[row(1),row(2)],['z']);expect(x.selectedIds).toEqual(['a','b']);expect(x.rows.map(r=>r.number)).toEqual([1,2])});
 it('handles incomplete metadata without inventing rows',()=>{const x=removeSelectedPublishItems(['a','b','c'],['a','b','c'],[row(1),row(2)],['c']);expect(x.selectedIds).toEqual(['a','b']);expect(x.rows.map(r=>r.number)).toEqual([1,2])});
 it('handles stale ids idempotently',()=>{const x=removeSelectedPublishItems(['a'],['a'],[row(1)],['missing','missing']);expect(x.selectedIds).toEqual(['a']);expect(x.rows).toHaveLength(1)});
 it('keeps the correct 37 survivors from a 40-video batch',()=>{const ids=Array.from({length:40},(_,i)=>`v${i+1}`),rows=ids.map((_,i)=>row(i+1));const x=removeSelectedPublishItems(ids,ids,rows,['v4','v17','v40']);expect(x.selectedIds).toHaveLength(37);expect(x.selectedIds).not.toContain('v4');expect(x.selectedIds).not.toContain('v17');expect(x.selectedIds).not.toContain('v40');expect(x.rows.map(r=>r.number)).not.toContain(4);expect(x.rows.map(r=>r.number)).not.toContain(17);expect(x.rows.map(r=>r.number)).not.toContain(40)});
});
''')

# Native local-only Trash command. It can only move an MP4 file to the OS Trash;
# it cannot call YouTube and it never recursively removes folders.
w('src-tauri/src/local_delete.rs',r'''use serde::Serialize;
use std::path::{Path,PathBuf};

#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct TrashLocalFileResult{pub trashed:bool,pub missing:bool}

fn is_mp4(path:&Path)->bool{path.extension().and_then(|x|x.to_str()).map(|x|x.eq_ignore_ascii_case("mp4")).unwrap_or(false)}

pub fn trash_local_file_impl(path:&str)->Result<TrashLocalFileResult,String>{
 let value=path.trim();if value.is_empty(){return Err("Путь MP4 пуст".into())}
 let p=PathBuf::from(value);if !is_mp4(&p){return Err("В Корзину можно переместить только MP4".into())}
 if !p.exists(){return Ok(TrashLocalFileResult{trashed:false,missing:true})}
 if !p.is_file(){return Err("Удаление разрешено только для файла".into())}
 trash::delete(&p).map_err(|e|format!("Не удалось переместить MP4 в Корзину: {e}"))?;
 Ok(TrashLocalFileResult{trashed:true,missing:false})
}

#[tauri::command]
pub fn trash_local_file(path:String)->Result<TrashLocalFileResult,String>{trash_local_file_impl(&path)}

#[cfg(test)]
mod tests{
 use super::*;use std::fs;
 fn temp(name:&str)->PathBuf{std::env::temp_dir().join(format!("vyron-ready-delete-{}-{name}",uuid::Uuid::new_v4()))}
 #[test]fn missing_mp4_is_a_clean_success(){let p=temp("missing.mp4");let r=trash_local_file_impl(p.to_str().unwrap()).unwrap();assert!(!r.missing||r.trashed)}
 #[test]fn directory_is_never_recursively_deleted(){let p=temp("folder.mp4");fs::create_dir_all(&p).unwrap();let e=trash_local_file_impl(p.to_str().unwrap()).unwrap_err();assert!(e.contains("только для файла"));assert!(p.is_dir());fs::remove_dir_all(p).unwrap()}
 #[test]fn non_mp4_is_rejected(){let p=temp("note.txt");fs::write(&p,b"x").unwrap();let e=trash_local_file_impl(p.to_str().unwrap()).unwrap_err();assert!(e.contains("только MP4"));assert!(p.exists());fs::remove_file(p).unwrap()}
 #[test]fn real_mp4_moves_out_of_original_location(){let p=temp("video.mp4");fs::write(&p,b"test mp4 placeholder").unwrap();let r=trash_local_file_impl(p.to_str().unwrap()).unwrap();assert!(r.trashed&&!r.missing);assert!(!p.exists())}
}
''')

# Rust wiring + dependency.
rep('src-tauri/src/lib.rs','mod production_manager;','mod production_manager;\nmod local_delete;')
rep('src-tauri/src/lib.rs','files::write_job_metadata,files::enqueue_render,files::reveal_path,files::open_endlume,','files::write_job_metadata,files::enqueue_render,files::reveal_path,files::open_endlume,local_delete::trash_local_file,')
rep('src-tauri/Cargo.toml','urlencoding = "2"','urlencoding = "2"\ntrash = "5"')

# Frontend API is local-only and deliberately separate from youtube_* operations.
rep('src/api.ts',"youtubeCancelUploadSession:(jobId:string)=>invoke<void>('youtube_cancel_upload_session',{jobId}),","trashLocalFile:(path:string)=>invoke<{trashed:boolean;missing:boolean}>('trash_local_file',{path}),\n  youtubeCancelUploadSession:(jobId:string)=>invoke<void>('youtube_cancel_upload_session',{jobId}),")

p='src/PublisherOS.tsx';s=r(p)
s=s.replace("import {humanizeError} from './errorCenter';","import {humanizeError} from './errorCenter';\nimport {removeSelectedPublishItems} from './publishRemoval';",1)
s=s.replace("const scheduleDateTimeLabel=(iso?:string)=>iso?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Krasnoyarsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'—';","const scheduleDateTimeLabel=(iso?:string)=>iso?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Krasnoyarsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'—';\ntype RemoveRequest={ids:string[];label:string};",1)
old=" const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),patchJob=useApp(s=>s.patchJob),updateChannel=useApp(s=>s.updateChannel),settings=useApp(s=>s.settings),log=useApp(s=>s.log);"
new=" const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),setJobs=useApp(s=>s.setJobs),patchJob=useApp(s=>s.patchJob),updateChannel=useApp(s=>s.updateChannel),settings=useApp(s=>s.settings),log=useApp(s=>s.log);"
if old not in s: raise SystemExit('v206 ready-delete Publisher store anchor missing')
s=s.replace(old,new,1)
old=" const [channelId,setChannelId]=useState(first),[draft,setDraft]=useState<PublishWorkspaceDraft>(()=>loadPublishWorkspace(first)),[busy,setBusy]=useState(false),[fingerprints,setFingerprints]=useState<Record<string,{fingerprint:string;size:number}>>({}),[sessions,setSessions]=useState<YoutubeUploadSession[]>([]),[quotaRev,setQuotaRev]=useState(0),[clock,setClock]=useState(()=>youtubeQuotaClockSnapshot());"
new=" const [channelId,setChannelId]=useState(first),[draft,setDraft]=useState<PublishWorkspaceDraft>(()=>loadPublishWorkspace(first)),[busy,setBusy]=useState(false),[fingerprints,setFingerprints]=useState<Record<string,{fingerprint:string;size:number}>>({}),[sessions,setSessions]=useState<YoutubeUploadSession[]>([]),[quotaRev,setQuotaRev]=useState(0),[clock,setClock]=useState(()=>youtubeQuotaClockSnapshot()),[removeRequest,setRemoveRequest]=useState<RemoveRequest|null>(null);"
if old not in s: raise SystemExit('v206 ready-delete Publisher state anchor missing')
s=s.replace(old,new,1)

# A scheduled upload must always carry publishAt in its original videos.insert.
old="if(settings.youtubePublishSafeMode&&batch.some(j=>!j.title.trim()||!effectivePublishAt(j))){notifyWarning('Pre-flight не пройден','Для Safe Mode нужны название и расписание у каждого выбранного видео.');return}"
new="if(batch.some(j=>!effectivePublishAt(j))){notifyWarning('Pre-flight не пройден','У каждого выбранного видео должна быть дата публикации: publishAt передаётся сразу в первоначальном videos.insert.');return}if(settings.youtubePublishSafeMode&&batch.some(j=>!j.title.trim())){notifyWarning('Pre-flight не пройден','Для Safe Mode нужно название у каждого выбранного видео.');return}"
if old not in s: raise SystemExit('v206 ready-delete upload preflight anchor missing')
s=s.replace(old,new,1)
old="const publishAt=effectivePublishAt(j);if(publishAt&&publishAt!==j.publishAt)patchJob(j.id,{publishAt});const uploaded=await api.youtubeUpload(profileId,j.id,j.finalPath,j.title,j.description,j.tags,publishAt,settings.youtubeCategoryId,operationId);"
new="const publishAt=effectivePublishAt(j);if(!publishAt)throw new Error('PUBLISH_AT_REQUIRED: дата публикации отсутствует');if(publishAt!==j.publishAt)patchJob(j.id,{publishAt});const uploaded=await api.youtubeUpload(profileId,j.id,j.finalPath,j.title,j.description,j.tags,publishAt,settings.youtubeCategoryId,operationId);"
if old not in s: raise SystemExit('v206 ready-delete publishAt insert anchor missing')
s=s.replace(old,new,1)
old="preflightBlocked=!selected.length||!profileId||!quotaPlan.affordable||(settings.youtubePublishSafeMode&&(missingMetadata>0||missingSchedule>0||duplicates.length>0||locked))||"
new="preflightBlocked=!selected.length||!profileId||!quotaPlan.affordable||missingSchedule>0||(settings.youtubePublishSafeMode&&(missingMetadata>0||duplicates.length>0||locked))||"
if old not in s: raise SystemExit('v206 ready-delete preflightBlocked anchor missing')
s=s.replace(old,new,1)

# Local removal implementation. The only optional destructive operation is the
# native Trash command. youtubeCancelUploadSession only clears VYRON's local
# resumable-session record; it does not issue a YouTube Data API request.
anchor=' async function resumeUpload(session:YoutubeUploadSession)'
if anchor not in s: raise SystemExit('v206 ready-delete resume anchor missing')
remove_fn=r''' async function removeReady(ids:string[],deleteFromDisk:boolean){
  const wanted=[...new Set(ids)],all=useApp.getState().jobs;
  const targets=all.filter(j=>wanted.includes(j.id)&&j.channelId===channelId&&!j.youtubeVideoId&&j.status!=='UPLOADING');
  if(!targets.length){setRemoveRequest(null);notifyInfo('Удалять нечего','Загружающееся или уже опубликованное видео не удаляется этим действием.');return}
  setBusy(true);const removed:string[]=[],errors:string[]=[];
  try{
   for(const j of targets){try{if(deleteFromDisk&&j.finalPath)await api.trashLocalFile(j.finalPath);await api.youtubeCancelUploadSession(j.id).catch(()=>undefined);removed.push(j.id)}catch(e){errors.push(`VIDEO_${String(j.number).padStart(3,'0')}: ${String(e)}`)}}
   if(removed.length){const repaired=removeSelectedPublishItems(draft.selectedIds,selected.map(x=>x.id),draft.rows,removed);setDraftPatch({selectedIds:repaired.selectedIds,rows:repaired.rows});setJobs(all.filter(j=>!removed.includes(j.id)));setFingerprints(prev=>{const next={...prev};for(const id of removed)delete next[id];return next});notifySuccess(deleteFromDisk?'Видео перемещены в Корзину':'Видео убраны из VYRON',`${removed.length} видео • YouTube API: 0${deleteFromDisk?' • MP4 удалены только через macOS Корзину':' • MP4 на диске сохранены'}`)}
   if(errors.length)notifyWarning('Часть видео не удалена',errors.join(' • '));
  }finally{setRemoveRequest(null);setBusy(false);void refreshSessions()}
 }
'''
s=s.replace(anchor,remove_fn+anchor,1)

old_toolbar='<div className="publishToolbar"><button onClick={()=>setDraftPatch({selectedIds:channelJobs.filter(j=>j.status!==\'UPLOADING\').map(j=>j.id)})}>Выбрать все</button><button onClick={()=>setDraftPatch({selectedIds:[]})}>Снять выбор</button></div>'
new_toolbar='<div className="publishToolbar"><button onClick={()=>setDraftPatch({selectedIds:channelJobs.filter(j=>j.status!==\'UPLOADING\').map(j=>j.id)})}>Выбрать все</button><button onClick={()=>setDraftPatch({selectedIds:[]})}>Снять выбор</button><button className="danger" disabled={busy||!selected.some(j=>j.status!==\'UPLOADING\')} onClick={()=>setRemoveRequest({ids:selected.filter(j=>j.status!==\'UPLOADING\').map(j=>j.id),label:`Удалить выбранные: ${selected.filter(j=>j.status!==\'UPLOADING\').length}`})}>Удалить выбранные</button></div>'
if old_toolbar not in s: raise SystemExit('v206 ready-delete toolbar anchor missing')
s=s.replace(old_toolbar,new_toolbar,1)

old_rows='<div className="publishVideoRows">{channelJobs.length?channelJobs.map(j=><label key={j.id} className={draft.selectedIds.includes(j.id)?\'selected\':\'\'}><input type="checkbox" disabled={j.status===\'UPLOADING\'} checked={draft.selectedIds.includes(j.id)} onChange={()=>setDraftPatch({selectedIds:draft.selectedIds.includes(j.id)?draft.selectedIds.filter(x=>x!==j.id):[...draft.selectedIds,j.id]})}/><span><b>VIDEO_{String(j.number).padStart(3,\'0\')}</b><small>{baseName(j.finalPath||\'\')} • {status(j)}</small></span>{j.uploadProgress!=null&&j.status===\'UPLOADING\'&&<em>{j.uploadProgress.toFixed(0)}%</em>}</label>):<p>ENDLUME ещё не подготовил MP4 для этого канала.</p>}</div>'
new_rows='<div className="publishVideoRows">{channelJobs.length?channelJobs.map(j=><div key={j.id} className={`publishVideoRow ${draft.selectedIds.includes(j.id)?\'selected\':\'\'}`}><label className="publishVideoSelect"><input type="checkbox" disabled={j.status===\'UPLOADING\'} checked={draft.selectedIds.includes(j.id)} onChange={()=>setDraftPatch({selectedIds:draft.selectedIds.includes(j.id)?draft.selectedIds.filter(x=>x!==j.id):[...draft.selectedIds,j.id]})}/><span><b>VIDEO_{String(j.number).padStart(3,\'0\')}</b><small>{baseName(j.finalPath||\'\')} • {status(j)}</small></span>{j.uploadProgress!=null&&j.status===\'UPLOADING\'&&<em>{j.uploadProgress.toFixed(0)}%</em>}</label><button className="danger mini" disabled={busy||j.status===\'UPLOADING\'} onClick={()=>setRemoveRequest({ids:[j.id],label:`VIDEO_${String(j.number).padStart(3,\'0\')}`})}>Удалить</button></div>):<p>ENDLUME ещё не подготовил MP4 для этого канала.</p>}</div>'
if old_rows not in s: raise SystemExit('v206 ready-delete video rows anchor missing')
s=s.replace(old_rows,new_rows,1)

modal=r'''  {removeRequest&&<div className="modalBackdrop" onMouseDown={()=>!busy&&setRemoveRequest(null)}><section className="confirmModal" onMouseDown={e=>e.stopPropagation()}><small>LOCAL VIDEO REMOVAL</small><h2>{removeRequest.label}</h2><p>Это локальное действие. Видео на YouTube не удаляется и YouTube API не вызывается. Выберите, что сделать с MP4.</p><footer><button disabled={busy} onClick={()=>setRemoveRequest(null)}>Отмена</button><button disabled={busy} onClick={()=>void removeReady(removeRequest.ids,false)}>Убрать только из VYRON</button><button className="danger" disabled={busy} onClick={()=>void removeReady(removeRequest.ids,true)}>Удалить из VYRON и с диска</button></footer></section></div>}
'''
end=' </>\n}'
idx=s.rfind(end)
if idx<0: raise SystemExit('v206 ready-delete Publisher closing anchor missing')
s=s[:idx]+modal+s[idx:]
w(p,s)

# Layout override for row-level delete action while preserving the established UI.
p='src/styles.css';s=r(p)
s+='''\n/* VYRON 2.0.6 ready-video local removal */\n.publishVideoRows .publishVideoRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px;border:1px solid rgba(255,255,255,.07);border-radius:12px}.publishVideoRows .publishVideoRow.selected{border-color:rgba(82,214,255,.3);background:rgba(54,174,224,.06)}.publishVideoRows .publishVideoSelect{display:flex;align-items:center;gap:10px;padding:0!important;border:0!important;background:transparent!important;min-width:0}.publishVideoRows .publishVideoSelect span{display:flex;flex:1;min-width:0;flex-direction:column}.publishVideoRows .publishVideoSelect small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.62}\n'''
w(p,s)

print('VYRON 2.0.6 ready-video removal patch: PASS')
