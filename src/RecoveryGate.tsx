import React,{useEffect,useMemo,useRef,useState} from 'react';
import {productionManagerApi,type RecoveryCandidate,type RecoveryState} from './productionManagerApi';
import {patchChannelProductionPrefs,patchProductionPrefs,readProductionPrefs,type ProductionTab} from './productionPrefs';
import {useApp} from './store';
import {notifyError,notifySuccess} from './notificationCenter';
import {attentionTask,cancelTask,completeTask,ensureTask,startTask,updateTask} from './taskEngine';
import {journal} from './activityJournalRuntime';

const OPEN_EVENT='vyron:recovery-open';
export function openRecoveryFlow(){window.dispatchEvent(new Event(OPEN_EVENT))}
const legacyDismissKey=(batchId:string)=>'vyron:recovery-dismissed:'+batchId;
function legacyCandidate(x:RecoveryState):RecoveryCandidate{
  return{recoverySchemaVersion:0,recoverySessionId:'legacy:'+x.batchId,operationType:'PRODUCTION_BATCH_LEGACY',state:'ACTIVE',batchId:x.batchId,channelId:x.channelId,channelName:x.channelName,rootPath:x.rootPath,resolvedRootPath:x.rootPath,completedProjects:x.completedProjects,totalProjects:x.totalProjects,progress:x.totalProjects?x.completedProjects/x.totalProjects*100:0,lastCheckpoint:x.status||x.currentProject,updatedAt:x.updatedAt,safeToResume:x.recoverable,waitReason:null,requiredVolumeName:null,dismissed:false,previousSessionEndedCleanly:false,schemaCompatible:true,uiContext:null}
}
function waitText(r:RecoveryCandidate){
  if(!r.schemaCompatible)return'Эта recovery-сессия создана более новой версией VYRON. Автоматические изменения заблокированы.';
  if(r.waitReason==='DRIVE_MISSING')return'Ожидаем '+(r.requiredVolumeName||'внешний диск')+'. Подключите тот же физический диск — VYRON проверит UUID и продолжит.';
  if(r.waitReason==='WRONG_VOLUME')return'Подключён другой физический том. VYRON не будет писать данные на него, даже если имя папки совпадает.';
  if(r.waitReason==='SOURCE_CHANGED')return'Исходные файлы изменились после checkpoint. Автоматическое продолжение остановлено до ручной проверки.';
  if(r.waitReason==='SOURCE_MISSING')return'Не найден один из исходных файлов. VYRON ничего не перезаписывает.';
  if(r.waitReason==='DESTINATION_MISSING')return'Папка незавершённой работы недоступна. '+(r.requiredVolumeName?'Подключите '+r.requiredVolumeName+'.':'');
  return r.waitReason?'Восстановление ожидает: '+r.waitReason:'Восстановление требует безопасной проверки.';
}
function taskId(r:RecoveryCandidate){return'recovery:'+r.recoverySessionId}

export function RecoveryGate(){
  const booted=useApp(s=>s.booted),workspace=useApp(s=>s.settings.workspace),channels=useApp(s=>s.channels),setPage=useApp(s=>s.setPage);
  const [recovery,setRecovery]=useState<RecoveryCandidate|null>(null),[deadline,setDeadline]=useState<number|null>(null),[now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[details,setDetails]=useState(false);
  const checked=useRef(false),decided=useRef(false);
  const roots=useMemo(()=>{const p=readProductionPrefs();return [...new Set([workspace,p.productionRoot,...Object.values(p.byChannel||{}).map(x=>x.productionRoot)].filter(Boolean) as string[])]},[workspace,channels.length]);

  async function scan(includeDismissed=false){
    try{
      const durable=await productionManagerApi.recoveryCandidates(includeDismissed);
      let first=durable[0]||null;
      if(!first&&roots.length){
        const legacy=await productionManagerApi.findRecovery(roots);
        const found=legacy.find(x=>x.recoverable&&(includeDismissed||localStorage.getItem(legacyDismissKey(x.batchId))!=='1'));
        if(found)first=legacyCandidate(found);
      }
      if(!first){setRecovery(null);return}
      decided.current=false;setRecovery(first);setBusy(false);setDetails(false);setDeadline(Date.now()+30_000);setNow(Date.now());
      ensureTask({taskId:taskId(first),type:'PRODUCTION_RECOVERY',state:first.safeToResume?'QUEUED':'ATTENTION_REQUIRED',channelId:first.channelId,channelName:first.channelName,label:'Batch '+first.batchId,detail:first.safeToResume?'Найдена незавершённая работа':waitText(first),progress:first.progress,completed:first.completedProjects,total:first.totalProjects,recoveryStatus:first.safeToResume?undefined:first.waitReason==='DRIVE_MISSING'?'Ожидает диск':'Требует внимания',resourceKey:'production-recovery:'+first.batchId});
      journal({eventId:'recovery-detected:'+first.recoverySessionId+':'+first.updatedAt,eventType:'RECOVERY_SESSION_DETECTED',status:'INFO',source:'LIVE_OPERATION',timestamp:new Date().toISOString(),batchId:first.batchId,channelId:first.channelId,channelName:first.channelName,details:{completed:first.completedProjects,total:first.totalProjects,checkpoint:first.lastCheckpoint,safe:first.safeToResume,waitReason:first.waitReason||''}});
    }catch(e){notifyError('Не удалось проверить восстановление',String(e),{operationId:'recovery-scan-error'})}
  }

  useEffect(()=>{if(!booted||checked.current)return;checked.current=true;void scan(false)},[booted,roots.join('|')]);
  useEffect(()=>{const fn=()=>void scan(true);window.addEventListener(OPEN_EVENT,fn);return()=>window.removeEventListener(OPEN_EVENT,fn)},[roots.join('|')]);

  useEffect(()=>{
    if(!recovery||recovery.recoverySessionId.startsWith('legacy:')||busy)return;
    const id=window.setInterval(()=>{void productionManagerApi.refreshRecoveryCandidate(recovery.recoverySessionId).then(next=>{
      setRecovery(prev=>prev?.recoverySessionId===next.recoverySessionId?next:prev);
      updateTask(taskId(next),{progress:next.progress,completed:next.completedProjects,total:next.totalProjects,detail:next.safeToResume?'Готово к безопасному продолжению':waitText(next),recoveryStatus:next.safeToResume?undefined:next.waitReason==='DRIVE_MISSING'?'Ожидает диск':'Требует внимания'});
      if(next.safeToResume&&deadline!==null&&Date.now()>=deadline&&!decided.current)void resumeNow(next);
    }).catch(()=>{})},2000);
    return()=>window.clearInterval(id)
  },[recovery?.recoverySessionId,busy,deadline]);

  useEffect(()=>{
    if(!recovery||deadline===null||busy)return;
    const tick=()=>{const t=Date.now();setNow(t);if(t>=deadline&&recovery.safeToResume&&!decided.current)void resumeNow(recovery)};
    tick();const id=window.setInterval(tick,250);return()=>window.clearInterval(id)
  },[recovery?.recoverySessionId,recovery?.safeToResume,deadline,busy]);

  useEffect(()=>{
    if(!recovery||!busy)return;
    let off:(()=>void)|undefined;
    void productionManagerApi.onBatchProgress(p=>{if(p.batchId!==recovery.batchId)return;const pct=p.total?Math.round(p.completed/p.total*100):recovery.progress;updateTask(taskId(recovery),{progress:pct,completed:p.completed,total:p.total,detail:'Продолжение с checkpoint • '+p.completed+'/'+p.total,recoveryStatus:'Продолжено'});setRecovery(x=>x&&x.batchId===p.batchId?{...x,completedProjects:p.completed,totalProjects:p.total,progress:pct,lastCheckpoint:'Проект '+p.completed+'/'+p.total}:x)}).then(x=>off=x);
    return()=>off?.()
  },[recovery?.batchId,busy]);

  const seconds=deadline===null?0:Math.max(0,Math.ceil((deadline-now)/1000));

  function restoreUiContext(r:RecoveryCandidate){
    const ctx=r.uiContext;
    const tab=(ctx?.productionTab==='materials'||ctx?.productionTab==='manager'||ctx?.productionTab==='queue'?ctx.productionTab:'manager') as ProductionTab;
    patchProductionPrefs(p=>({...p,selectedChannelId:ctx?.channelId||r.channelId,tab}));
    if(ctx?.selectedBatchId||ctx?.selectedProjectIds?.length)patchChannelProductionPrefs(ctx.channelId||r.channelId,{lastBatchId:ctx.selectedBatchId||r.batchId,selectedProjectIds:ctx.selectedProjectIds||[]});
    setPage('production');
  }
  async function resumeNow(candidate=recovery){
    if(!candidate||decided.current||!candidate.safeToResume)return;
    decided.current=true;setBusy(true);setDeadline(null);
    startTask(taskId(candidate),'Восстановление с последнего подтверждённого checkpoint');
    updateTask(taskId(candidate),{recoveryStatus:'Восстанавливается'});
    journal({eventId:'recovery-started:'+candidate.recoverySessionId+':'+Date.now(),eventType:'RECOVERY_STARTED',status:'STARTED',source:'LIVE_OPERATION',timestamp:new Date().toISOString(),batchId:candidate.batchId,channelId:candidate.channelId,channelName:candidate.channelName,details:{completed:candidate.completedProjects,total:candidate.totalProjects,checkpoint:candidate.lastCheckpoint}});
    try{
      const done=candidate.recoverySessionId.startsWith('legacy:')?await productionManagerApi.resume(candidate.rootPath):await productionManagerApi.resumeRecovery(candidate.recoverySessionId);
      completeTask(taskId(candidate),'Работа восстановлена');updateTask(taskId(candidate),{recoveryStatus:'Готово',completed:done.projectCount,total:done.projectCount});
      journal({eventId:'recovery-completed:'+candidate.recoverySessionId+':'+Date.now(),eventType:'RECOVERY_COMPLETED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:new Date().toISOString(),batchId:done.batchId,channelId:done.channelId,channelName:done.channelName,details:{projects:done.projectCount,resumedFrom:candidate.completedProjects}});
      notifySuccess('Работа восстановлена',done.projectCount+' проектов продолжены с последней сохранённой точки.',{operationId:'recovery-completed:'+candidate.recoverySessionId,durationMs:8000});
      restoreUiContext({...candidate,batchId:done.batchId});setRecovery(null);setBusy(false);
    }catch(e){
      decided.current=false;setBusy(false);
      const message=String(e),disk=/DRIVE_MISSING|DESTINATION_MISSING/.test(message);
      attentionTask(taskId(candidate),message);updateTask(taskId(candidate),{recoveryStatus:disk?'Ожидает диск':'Требует внимания'});
      journal({eventId:'recovery-waiting:'+candidate.recoverySessionId+':'+Date.now(),eventType:'RECOVERY_WAITING',status:'PARTIAL',source:'LIVE_OPERATION',timestamp:new Date().toISOString(),batchId:candidate.batchId,channelId:candidate.channelId,channelName:candidate.channelName,details:{reason:message}});
      if(!disk)notifyError('Восстановление остановлено',message,{operationId:'recovery-error:'+candidate.recoverySessionId});
      if(!candidate.recoverySessionId.startsWith('legacy:'))void productionManagerApi.refreshRecoveryCandidate(candidate.recoverySessionId).then(setRecovery).catch(()=>{});
    }
  }
  async function dismiss(){
    if(!recovery||busy)return;decided.current=true;setDeadline(null);
    try{
      if(recovery.recoverySessionId.startsWith('legacy:'))localStorage.setItem(legacyDismissKey(recovery.batchId),'1');else await productionManagerApi.dismissRecovery(recovery.recoverySessionId);
      cancelTask(taskId(recovery),'Автоматическое восстановление отключено. Файлы сохранены.');
      journal({eventId:'recovery-abandoned:'+recovery.recoverySessionId+':'+Date.now(),eventType:'RECOVERY_ABANDONED',status:'INFO',source:'LIVE_OPERATION',timestamp:new Date().toISOString(),batchId:recovery.batchId,channelId:recovery.channelId,channelName:recovery.channelName,details:{filesDeleted:false,manualRecoveryAvailable:true}});
      setRecovery(null);
    }catch(e){decided.current=false;notifyError('Не удалось сохранить решение',String(e),{operationId:'recovery-dismiss:'+recovery.recoverySessionId})}
  }

  if(!recovery)return null;
  const waiting=!recovery.safeToResume,ts=Date.parse(recovery.updatedAt);
  return <div className="recoveryOverlay"><section className="recoveryDialog recoveryDialogV320">
    <div className="recoveryMark">↻</div><small>VYRON CRASH RECOVERY</small><h2>Найдена незавершённая работа</h2><p className="recoveryLead">{waiting?waitText(recovery):'VYRON восстановит рабочую сессию с последней подтверждённой точки.'}</p>
    <div className="recoveryFacts recoveryFactsV320"><span><small>Операция</small><b>Production</b></span><span><small>Канал</small><b>{recovery.channelName||'—'}</b></span><span><small>Проекты</small><b>{recovery.completedProjects} / {recovery.totalProjects}</b></span><span><small>Checkpoint</small><b>{recovery.lastCheckpoint||'—'}</b></span></div>
    <div className={'recoveryCountdown '+(waiting?'waiting':'')}><small>{waiting?'Автопродолжение приостановлено':'Автоматическое восстановление через'}</small>{!waiting&&<><b>{seconds}</b><span>сек.</span></>}{waiting&&<b>{recovery.requiredVolumeName?'Ожидаем '+recovery.requiredVolumeName:'Требуется проверка'}</b>}</div>
    {details&&<div className="recoveryDetails"><span>Batch: <b>{recovery.batchId}</b></span><span>Последняя запись: <b>{Number.isFinite(ts)?new Date(ts).toLocaleString('ru-RU'):'—'}</b></span><span>Recovery schema: <b>{recovery.recoverySchemaVersion}</b></span><span>Стратегия: <b>verify checkpoint → resume</b></span>{recovery.waitReason&&<span>Причина ожидания: <b>{recovery.waitReason}</b></span>}</div>}
    <footer><button className="primary" disabled={busy||waiting} onClick={()=>void resumeNow()}>{busy?'ВОССТАНАВЛИВАЮ…':'Восстановить сейчас'}</button><button disabled={busy} onClick={()=>void dismiss()}>Не восстанавливать</button><button className="ghost" disabled={busy} onClick={()=>setDetails(x=>!x)}>{details?'Скрыть':'Подробнее'}</button></footer>
  </section></div>
}