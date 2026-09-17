import React,{useEffect,useRef} from 'react';
import {api} from './api';
import {notifySuccess} from './notificationCenter';
import {useApp} from './store';
import {scanFactualRenderRuntime} from './renderRuntimeEvidence';
import {replaceFactualActiveRenders} from './activeOperationFacts';
import {applyStaleOperationPatches,buildStaleOperationPatches} from './staleOperationReconciliation';

export function ProductionStatusBridge(){
  const booted=useApp(s=>s.booted),workspace=useApp(s=>s.settings.workspace),channels=useApp(s=>s.channels);
  const announced=useRef(new Set<string>());
  useEffect(()=>{
    if(!booted||!workspace||!channels.length)return;
    let live=true,running=false;
    const run=async()=>{
      if(running||!live)return;
      running=true;
      try{
        const evidence=await scanFactualRenderRuntime(workspace,useApp.getState().channels);
        for(const item of evidence.rows){
          const {batchId,row}=item;if(!row.jobId)continue;
          const job=useApp.getState().jobs.find(j=>j.id===row.jobId);if(!job)continue;
          if(row.renderStatus==='Rendering'&&job.status!=='RENDERING')useApp.getState().patchJob(job.id,{status:'RENDERING',error:undefined});
          else if(row.renderStatus==='Completed'&&row.outputFile&&(job.finalPath!==row.outputFile||job.status!=='READY_UPLOAD')){
            useApp.getState().patchJob(job.id,{status:'READY_UPLOAD',finalPath:row.outputFile,error:undefined});
            const key=`${batchId}:${row.projectId}:${row.outputFile}`;
            if(!announced.current.has(key)){announced.current.add(key);notifySuccess('Видео готово',`VIDEO_${String(row.videoNumber||job.number).padStart(3,'0')} • ENDLUME завершил рендер.`,{operationId:`endlume-complete:${key}`,actions:[{label:'Открыть файл',onClick:()=>{void api.openLocal(row.outputFile!)}}]})}
          }else if(row.renderStatus==='Error'&&job.status!=='ERROR')useApp.getState().patchJob(job.id,{status:'ERROR',error:row.error||'ENDLUME: ошибка рендера'});
        }
        if(evidence.reliable){
          replaceFactualActiveRenders(evidence.activeJobIds,evidence.observedAtMs);
          const patches=buildStaleOperationPatches(useApp.getState().jobs,{uploadsKnown:false,rendersKnown:true,activeUploadIds:new Set(),activeRenderIds:evidence.activeJobIds,uploadSessionIds:new Set(),now:new Date(evidence.observedAtMs).toISOString()});
          applyStaleOperationPatches(patches,useApp.getState().patchJob);
        }
      }finally{running=false}
    };
    void run();
    const id=window.setInterval(()=>void run(),7000);
    return()=>{live=false;window.clearInterval(id)};
  },[booted,workspace,channels.map(c=>c.id).join('|')]);
  return null;
}
