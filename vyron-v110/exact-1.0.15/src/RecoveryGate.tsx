import React,{useEffect,useMemo,useRef,useState} from 'react';
import {productionManagerApi,type RecoveryState} from './productionManagerApi';
import {readProductionPrefs} from './productionPrefs';
import {useApp} from './store';
import {notifyError,notifyInfo,notifySuccess} from './notificationCenter';

export function RecoveryGate(){
  const booted=useApp(s=>s.booted),workspace=useApp(s=>s.settings.workspace),channels=useApp(s=>s.channels),setPage=useApp(s=>s.setPage);
  const [recovery,setRecovery]=useState<RecoveryState|null>(null),[deadline,setDeadline]=useState<number|null>(null),[now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[confirmRestart,setConfirmRestart]=useState(false);
  const checked=useRef(false),decided=useRef(false);
  const roots=useMemo(()=>{const p=readProductionPrefs();return [...new Set([workspace,p.productionRoot,...Object.values(p.byChannel||{}).map(x=>x.productionRoot)].filter(Boolean) as string[])]},[workspace,channels.length]);
  useEffect(()=>{if(!booted||checked.current||!roots.length)return;checked.current=true;productionManagerApi.findRecovery(roots).then(rows=>{const first=rows.find(x=>x.recoverable);if(first){decided.current=false;setRecovery(first);setDeadline(Date.now()+60_000);notifyInfo('Предыдущая работа была прервана',`${first.channelName}: готово ${first.completedProjects} / ${first.totalProjects}.`,{operationId:`recovery-found:${first.batchId}`,durationMs:8000})}}).catch(e=>notifyError('Не удалось проверить восстановление',String(e),{operationId:'recovery-scan-error'}))},[booted,roots.join('|')]);
  useEffect(()=>{if(!recovery||deadline===null||confirmRestart)return;const tick=()=>{const t=Date.now();setNow(t);if(t>=deadline&&!decided.current)void resumeNow()};tick();const id=window.setInterval(tick,250);return()=>window.clearInterval(id)},[recovery?.batchId,deadline,confirmRestart]);
  const seconds=deadline===null?0:Math.max(0,Math.ceil((deadline-now)/1000));
  async function resumeNow(){if(!recovery||decided.current)return;decided.current=true;setBusy(true);setDeadline(null);try{const done=await productionManagerApi.resume(recovery.rootPath);notifySuccess('Производство восстановлено',`${done.channelName}: ${done.projectCount} проектов готовы.`,{operationId:`recovery-resumed:${done.batchId}`});setRecovery(null);setPage('production')}catch(e){decided.current=false;setBusy(false);notifyError('Не удалось продолжить производство',String(e),{operationId:`recovery-resume-error:${recovery.batchId}`})}}
  function requestRestart(){if(!recovery||busy)return;setDeadline(null);setConfirmRestart(true)}
  async function restartNow(){if(!recovery||busy)return;decided.current=true;setBusy(true);try{const done=await productionManagerApi.restartRecovery(recovery.rootPath);notifySuccess('Новая сборка создана',`${done.channelName}: ${done.projectCount} проектов. Старая незавершённая сборка сохранена.`,{operationId:`recovery-restarted:${done.batchId}`});setRecovery(null);setPage('production')}catch(e){decided.current=false;setBusy(false);notifyError('Не удалось начать новую сборку',String(e),{operationId:`recovery-restart-error:${recovery.batchId}`})}}
  if(!recovery)return null;
  return <div className="recoveryOverlay"><section className="recoveryDialog">
    <small>ВОССТАНОВЛЕНИЕ VYRON</small><h2>Производство было прервано</h2><h3>{recovery.channelName}</h3>
    <div className="recoveryFacts"><span>Уже готово<b>{recovery.completedProjects} / {recovery.totalProjects}</b></span><span>Текущий проект<b>{recovery.currentProject==='Финализация'?recovery.currentProject:`VIDEO_${recovery.currentProject}`}</b></span></div>
    {!confirmRestart?<><p>Можно продолжить с последнего подтверждённого checkpoint. Готовые проекты не будут пересоздаваться.</p><div className="recoveryCountdown"><small>Автоматическое продолжение через</small><b>{seconds}</b><span>сек.</span></div><footer><button className="primary" disabled={busy} onClick={()=>void resumeNow()}>{busy?'ВОССТАНАВЛИВАЮ…':'ПРОДОЛЖИТЬ'}</button><button disabled={busy} onClick={requestRestart}>НАЧАТЬ ЗАНОВО</button></footer></>:<><div className="recoveryWarning"><b>Начать новую сборку?</b><p>Уже создано {recovery.completedProjects} проектов. Они не будут удалены. VYRON создаст новый batchId и сохранит старую незавершённую сборку.</p></div><footer><button className="danger" disabled={busy} onClick={()=>void restartNow()}>{busy?'СОЗДАЮ…':'НАЧАТЬ НОВУЮ СБОРКУ'}</button><button disabled={busy} onClick={()=>{setConfirmRestart(false);decided.current=false;setDeadline(Date.now()+60_000)}}>ОТМЕНА</button></footer></>}
  </section></div>
}
