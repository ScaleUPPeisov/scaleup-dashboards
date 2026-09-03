import React,{useEffect} from 'react';
import {productionManagerApi} from './productionManagerApi';
import {useApp} from './store';

export function ProductionStatusBridge(){
  const booted=useApp(s=>s.booted),workspace=useApp(s=>s.settings.workspace),channels=useApp(s=>s.channels);
  useEffect(()=>{
    if(!booted||!workspace||!channels.length)return;
    let live=true,running=false;
    const run=async()=>{
      if(running||!live)return;running=true;
      try{
        for(const channel of useApp.getState().channels){
          let batches=[] as Awaited<ReturnType<typeof productionManagerApi.batches>>;
          try{batches=await productionManagerApi.batches(workspace,channel.id)}catch{continue}
          for(const batch of batches.slice(0,6)){
            if(['Completed','Завершено'].includes(batch.status)&&batch.completedProjects>=batch.projectCount)continue;
            let status;try{status=await productionManagerApi.status(batch.manifestPath)}catch{continue}
            for(const p of status.projects){
              if(!p.jobId)continue;
              const job=useApp.getState().jobs.find(j=>j.id===p.jobId);if(!job)continue;
              if(p.renderStatus==='Rendering'&&job.status!=='RENDERING')useApp.getState().patchJob(job.id,{status:'RENDERING',error:undefined});
              else if(p.renderStatus==='Completed'&&p.outputFile&&(job.finalPath!==p.outputFile||job.status!=='READY_UPLOAD'))useApp.getState().patchJob(job.id,{status:'READY_UPLOAD',finalPath:p.outputFile,error:undefined});
              else if(p.renderStatus==='Error'&&job.status!=='ERROR')useApp.getState().patchJob(job.id,{status:'ERROR',error:p.error||'ENDLUME: ошибка рендера'});
            }
          }
        }
      }finally{running=false}
    };
    void run();const id=window.setInterval(()=>void run(),7000);return()=>{live=false;window.clearInterval(id)};
  },[booted,workspace,channels.map(c=>c.id).join('|')]);
  return null;
}
