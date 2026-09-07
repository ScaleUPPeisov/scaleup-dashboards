#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=ROOT/'src/ProductionManager.tsx'
s=p.read_text()

# Bulk cleanup deliberately reuses the existing per-batch deletion API. It never
# removes the channel root, so imported images/session, music and settings survive.
if 'async function deleteAllChannelProjects()' not in s:
    anchor='  async function resume(batch:BatchSummary){'
    fn="""  async function deleteAllChannelProjects(){
    if(!channel||!batches.length)return;
    const total=batches.reduce((sum,b)=>sum+b.projectCount,0);
    const confirmed=window.confirm(`Удалить ВСЕ ${total.toLocaleString('ru-RU')} проектов канала «${channel.name}»?\\n\\nИзображения, музыкальная библиотека и настройки канала останутся.`);
    if(!confirmed)return;
    setBusy('delete-all-projects');
    const deletedJobIds=new Set<string>();
    const failures:string[]=[];
    let deleted=0;
    try{
      for(const batch of batches){
        try{
          const status=await productionManagerApi.status(batch.manifestPath);
          const ids=status.projects.map(p=>p.projectId);
          if(!ids.length)continue;
          const result=await productionManagerApi.deleteBatchProjects(batch.manifestPath,ids);
          deleted+=result.deletedProjectIds.length;
          result.deletedJobIds.forEach(id=>deletedJobIds.add(id));
        }catch(e){failures.push(`${batch.batchId}: ${String(e)}`)}
      }
      if(deletedJobIds.size)setJobs(useApp.getState().jobs.filter(j=>!deletedJobIds.has(j.id)));
      setSelectedProjects([]);
      setResult(null);
      setBatchStatus(null);
      setValidation(null);
      patchChannelProductionPrefs(channelId,{lastBatchId:undefined,selectedProjectIds:[]});
      await refreshState();
      if(failures.length){toast(`Удалено проектов: ${deleted}. Не удалось очистить batch: ${failures.length}. ${failures[0]}`);return}
      notifySuccess('Все проекты удалены',`Удалено ${deleted.toLocaleString('ru-RU')} проектов. Изображения и музыка сохранены.`,{operationId:`delete-all-projects:${channel.id}:${deleted}`});
    }finally{setBusy('')}
  }

"""
    if anchor not in s:raise SystemExit('ProductionManager resume anchor missing')
    s=s.replace(anchor,fn+anchor,1)

old='<section className="panel pmHistory"><div className="pmHistoryHead"><div><small>ИСТОРИЯ СБОРОК</small><h3>{channel?.name||\'Канал\'}</h3></div><button onClick={()=>void refreshState()}>↻ ОБНОВИТЬ</button></div>'
new='<section className="panel pmHistory"><div className="pmHistoryHead"><div><small>ИСТОРИЯ СБОРОК</small><h3>{channel?.name||\'Канал\'}</h3></div><button className="danger" disabled={!batches.length||!!busy} onClick={()=>void deleteAllChannelProjects()}>{busy===\'delete-all-projects\'?\'УДАЛЯЮ…\':\'УДАЛИТЬ ВСЕ ПРОЕКТЫ\'}</button><button onClick={()=>void refreshState()}>↻ ОБНОВИТЬ</button></div>'
if 'УДАЛИТЬ ВСЕ ПРОЕКТЫ' not in s:
    if old not in s:raise SystemExit('ProductionManager history header anchor missing')
    s=s.replace(old,new,1)
p.write_text(s)

# Native regression: the existing delete API removes the batch/project tree only;
# channel material state and indexed music must remain after deleting every project.
tests=ROOT/'src-tauri/src/production_manager_tests.rs'
x=tests.read_text()
extra=r'''

#[test]
fn acceptance_delete_all_projects_preserves_images_music_and_channel_state(){
    let(ws,cid,name)=fixture(4,20);
    let session_file=session_path(&ws.to_string_lossy(),&cid).unwrap();
    let index_file=index_path(&ws.to_string_lossy(),&cid).unwrap();
    let before_session:ImportSession=read_json(&session_file);
    let before_music:MusicIndex=read_json(&index_file);
    assert_eq!(before_session.collected.len(),4);assert_eq!(before_music.tracks.len(),20);
    let plan=plan_build(&request(&ws,&cid,&name,4,5,"even",false)).unwrap();
    let summary=execute_plan(None,&plan).unwrap();
    let(m,_)=load_manifest(&summary.manifest_path).unwrap();let ids=m.projects.iter().map(|p|p.project_id.clone()).collect::<Vec<_>>();
    let deleted=delete_production_batch_projects(summary.manifest_path,ids).unwrap();
    assert_eq!(deleted.deleted_project_ids.len(),4);assert!(deleted.batch.is_none());assert!(!Path::new(&plan.batch_root).exists());
    assert!(session_file.is_file());assert!(index_file.is_file());
    let after_session:ImportSession=read_json(&session_file);let after_music:MusicIndex=read_json(&index_file);
    assert_eq!(after_session.collected.len(),4);assert_eq!(after_music.tracks.len(),20);
    let state=production_channel_state(ws.to_string_lossy().into_owned(),cid.clone()).unwrap();assert_eq!(state.import_session.collected.len(),4);assert_eq!(state.music.unwrap().tracks,20);
    cleanup(&ws);
}
'''
if 'acceptance_delete_all_projects_preserves_images_music_and_channel_state' not in x:x+=extra
tests.write_text(x)

# Frontend regression contract: one current-channel destructive action, explicit
# confirmation, all batches traversed, and only the existing safe batch API used.
t=ROOT/'src/deleteAllProjects.test.ts'
t.write_text("""import {describe,it,expect} from 'vitest';import {readFileSync} from 'node:fs';
describe('delete all production projects',()=>{
  it('shows the current-channel destructive action with confirmation',()=>{const s=readFileSync('src/ProductionManager.tsx','utf8');expect(s).toContain('УДАЛИТЬ ВСЕ ПРОЕКТЫ');expect(s).toContain('deleteAllChannelProjects');expect(s).toContain('window.confirm');expect(s).toContain('Изображения, музыкальная библиотека и настройки канала останутся')});
  it('walks all batches through the existing safe delete API',()=>{const s=readFileSync('src/ProductionManager.tsx','utf8');const block=s.slice(s.indexOf('async function deleteAllChannelProjects()'),s.indexOf('async function resume(batch:BatchSummary)'));expect(block).toContain('for(const batch of batches)');expect(block).toContain('productionManagerApi.status(batch.manifestPath)');expect(block).toContain('productionManagerApi.deleteBatchProjects(batch.manifestPath,ids)');expect(block).not.toContain('deleteJobFolder');expect(block).not.toContain('stopImport');expect(block).not.toContain('setMusicLibrary')});
});
""")
print('VYRON 2.0.12 delete-all-projects patch: PASS')
