#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

# The base cleanup patch writes API/Rust/registration before touching ProductionOS.
# Refuse to finish UI if any backend contract is absent; this prevents masking an earlier failure.
checks={
 root/'src/productionManagerApi.ts':['previewGlobalProjectCleanup','executeGlobalProjectCleanup'],
 root/'src-tauri/src/production_manager.rs':['pub struct GlobalProjectCleanupPreview','preview_global_production_project_cleanup','execute_global_production_project_cleanup','trash::delete(path)'],
 root/'src-tauri/src/lib.rs':['production_manager::preview_global_production_project_cleanup','production_manager::execute_global_production_project_cleanup'],
}
for path,needles in checks.items():
    text=path.read_text()
    for needle in needles:
        if needle not in text: raise SystemExit(f'global cleanup prerequisite missing in {path.name}: {needle}')

p=root/'src/ProductionOS.tsx';s=p.read_text()
old="import {productionManagerApi,type ProductionStorageStatus} from './productionManagerApi';"
new="import {productionManagerApi,type ProductionStorageStatus,type GlobalProjectCleanupPreview} from './productionManagerApi';\nimport {notifyError,notifySuccess} from './notificationCenter';"
if 'type GlobalProjectCleanupPreview' not in s:
    if old not in s: raise SystemExit('ProductionOS api import anchor missing')
    s=s.replace(old,new,1)
anchor='const [projectStorage,setProjectStorage]=useState<ProductionStorageStatus|null>(null);'
insert=anchor+"const [cleanupPreview,setCleanupPreview]=useState<GlobalProjectCleanupPreview|null>(null),[cleanupPhase,setCleanupPhase]=useState<0|1|2>(0),[cleanupConfirmed,setCleanupConfirmed]=useState(false),[cleanupBusy,setCleanupBusy]=useState(false);"
if 'cleanupPreview,setCleanupPreview' not in s:
    if anchor not in s: raise SystemExit('ProductionOS state anchor missing')
    s=s.replace(anchor,insert,1)
func=r'''
 const globalCleanupRoots=()=>[settings.workspace,prefs.productionRoot,...Object.values(prefs.byChannel||{}).map(x=>x.productionRoot)].map(x=>(x||'').trim()).filter((x,i,a)=>Boolean(x)&&a.indexOf(x)===i);
 async function beginGlobalProjectCleanup(){const roots=globalCleanupRoots();if(!roots.length){toast('Нет настроенных Production workspace для очистки');return}setCleanupBusy(true);try{const preview=await productionManagerApi.previewGlobalProjectCleanup(roots);if(!preview.eligibleProjects){toast(`PROJECT-папок для безопасного удаления нет • пропущено ${preview.skippedProjects}`);return}setCleanupPreview(preview);setCleanupConfirmed(false);setCleanupPhase(1)}catch(e){notifyError('Не удалось проверить PROJECT-папки',String(e),{operationId:`global-project-cleanup-preview:${Date.now()}`})}finally{setCleanupBusy(false)}}
 async function executeGlobalProjectCleanup(){if(!cleanupPreview||!cleanupConfirmed)return;const roots=globalCleanupRoots();setCleanupBusy(true);try{const r=await productionManagerApi.executeGlobalProjectCleanup(roots,true);if(r.deletedJobIds.length)setJobs(useApp.getState().jobs.filter(j=>!r.deletedJobIds.includes(j.id)));setCleanupPhase(0);setCleanupPreview(null);setCleanupConfirmed(false);notifySuccess('PROJECT-папки очищены',`Все каналы • удалено ${r.deletedProjects} • освобождено ${(r.bytesFreed/1024/1024/1024).toFixed(2)} GB • готовые рендеры защищены: ${r.protectedRenders}.`,{operationId:`global-project-cleanup:${Date.now()}`});if(r.errors.length)notifyError('Не все PROJECT-папки удалены',`${r.failedProjects} ошибок. ${r.errors.slice(0,12).join(' | ')}`,{operationId:`global-project-cleanup-errors:${Date.now()}`})}catch(e){notifyError('Глобальная очистка PROJECT-папок не выполнена',String(e),{operationId:`global-project-cleanup-failed:${Date.now()}`})}finally{setCleanupBusy(false)}}
'''
if 'beginGlobalProjectCleanup' not in s:
    anchor=' return <>\n'
    if anchor not in s: raise SystemExit('ProductionOS return anchor missing')
    s=s.replace(anchor,func+anchor,1)
old="<div className=\"headerActions\"><button disabled={busy} onClick={refreshAll}>{busy?'Проверяю…':'↻ Обновить статусы'}</button><button onClick={maintainBuffer}>Поддержать буфер</button><button className=\"primary compactAction\" onClick={()=>setPlanOpen(true)}>+ Создать проекты</button></div>"
new="<div className=\"headerActions\"><button disabled={busy} onClick={refreshAll}>{busy?'Проверяю…':'↻ Обновить статусы'}</button><button onClick={maintainBuffer}>Поддержать буфер</button><button className=\"danger\" disabled={cleanupBusy} onClick={()=>void beginGlobalProjectCleanup()}>{cleanupBusy?'ПРОВЕРЯЮ…':'ОЧИСТИТЬ PROJECT-ПАПКИ ВСЕХ КАНАЛОВ'}</button><button className=\"primary compactAction\" onClick={()=>setPlanOpen(true)}>+ Создать проекты</button></div>"
if 'ОЧИСТИТЬ PROJECT-ПАПКИ ВСЕХ КАНАЛОВ' not in s:
    if old not in s: raise SystemExit('ProductionOS header actions anchor missing')
    s=s.replace(old,new,1)
modal=r'''
   {cleanupPreview&&cleanupPhase===1&&<div className="modalBackdrop" onMouseDown={()=>setCleanupPhase(0)}><section className="confirmModal" onMouseDown={e=>e.stopPropagation()}><small>GLOBAL PROJECT CLEANUP • PREVIEW</small><h2>Очистить PROJECT-папки всех каналов?</h2><p>VYRON нашёл только manifest-подтверждённые рабочие PROJECT-папки, у которых готовый render уже существует отдельно в папке Rendered.</p><div className="pmChecklist"><span>Каналов<b>{cleanupPreview.scannedChannels}</b></span><span>Найдено проектов<b>{cleanupPreview.foundProjects}</b></span><span>К удалению<b>{cleanupPreview.eligibleProjects}</b></span><span>Пропущено<b>{cleanupPreview.skippedProjects}</b></span><span>Рендеров защищено<b>{cleanupPreview.protectedRenders}</b></span></div><div className="cacheNotice"><b>БУДЕТ ОСВОБОЖДЕНО</b><span>{(cleanupPreview.estimatedBytes/1024/1024/1024).toFixed(2)} GB</span></div><div className="cacheNotice"><b>ГОТОВЫЕ ВИДЕО НЕ УДАЛЯЮТСЯ</b><span>Rendered, Ready Videos, Shorts, исходники, музыка, metadata, OAuth и настройки не входят в очистку.</span></div><footer><button onClick={()=>{setCleanupPhase(0);setCleanupPreview(null)}}>ОТМЕНА</button><button className="primary" onClick={()=>{setCleanupConfirmed(false);setCleanupPhase(2)}}>ПРОДОЛЖИТЬ</button></footer></section></div>}
   {cleanupPreview&&cleanupPhase===2&&<div className="modalBackdrop" onMouseDown={()=>setCleanupPhase(1)}><section className="confirmModal" onMouseDown={e=>e.stopPropagation()}><small>FINAL CONFIRMATION</small><h2>Подтвердить удаление PROJECT-папок?</h2><p>Будет перемещено в Корзину: <b>{cleanupPreview.eligibleProjects}</b> проектных папок. Готовые рендеры сохраняются.</p><label className="pmJobCheck"><input type="checkbox" checked={cleanupConfirmed} onChange={e=>setCleanupConfirmed(e.target.checked)}/><span>Я понимаю, что проектные папки будут удалены.</span></label><footer><button disabled={cleanupBusy} onClick={()=>setCleanupPhase(1)}>НАЗАД</button><button className="danger" disabled={!cleanupConfirmed||cleanupBusy} onClick={()=>void executeGlobalProjectCleanup()}>{cleanupBusy?'УДАЛЯЮ…':'УДАЛИТЬ PROJECT-ПАПКИ'}</button></footer></section></div>}
'''
if 'GLOBAL PROJECT CLEANUP • PREVIEW' not in s:
    anchor='{futureOpen&&'
    idx=s.find(anchor)
    if idx<0: raise SystemExit('ProductionOS future modal semantic anchor missing')
    s=s[:idx]+modal+s[idx:]
p.write_text(s)

p=root/'src/v2111GlobalCleanup.test.ts';p.write_text(r'''import fs from 'node:fs';import {describe,expect,it} from 'vitest';
describe('VYRON 2.1.1 global project cleanup contracts',()=>{
 const ui=fs.readFileSync('src/ProductionOS.tsx','utf8'),api=fs.readFileSync('src/productionManagerApi.ts','utf8'),rust=fs.readFileSync('src-tauri/src/production_manager.rs','utf8'),lib=fs.readFileSync('src-tauri/src/lib.rs','utf8');
 it('is global and does not depend on active channel',()=>{expect(ui).toContain('ОЧИСТИТЬ PROJECT-ПАПКИ ВСЕХ КАНАЛОВ');expect(ui).toContain('Object.values(prefs.byChannel||{})');expect(api).toContain("preview_global_production_project_cleanup");expect(api).toContain("execute_global_production_project_cleanup")});
 it('requires two UI phases plus explicit checkbox and backend confirmation',()=>{expect(ui).toContain('cleanupPhase===1');expect(ui).toContain('cleanupPhase===2');expect(ui).toContain('cleanupConfirmed');expect(ui).toContain('Я понимаю, что проектные папки будут удалены');expect(rust).toContain('Требуется явное подтверждение удаления PROJECT-папок')});
 it('protects Rendered output and moves only manifest-known project folder to Trash',()=>{expect(rust).toContain('let rendered=batch_root.join("Rendered")');expect(rust).toContain('under_rendered');expect(rust).toContain('separate_render');expect(rust).toContain('trash::delete(path)');expect(rust).not.toContain('trash::delete(&batch_root)')});
 it('commands are registered exactly in the existing Tauri handler',()=>{expect(lib).toContain('production_manager::preview_global_production_project_cleanup');expect(lib).toContain('production_manager::execute_global_production_project_cleanup')});
});
''')
print('VYRON 2.1.1 global PROJECT cleanup UI finish applied')
