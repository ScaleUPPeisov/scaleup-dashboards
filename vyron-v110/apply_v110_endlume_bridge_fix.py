#!/usr/bin/env python3
from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'src/ProductionStatusBridge.tsx'
p.write_text("""import React,{useEffect,useRef} from 'react';
import {productionManagerApi} from './productionManagerApi';
import {api} from './api';
import {notifySuccess} from './notificationCenter';
import {readProductionPrefs,resolveProductionRootFromPrefs} from './productionPrefs';
import {useApp} from './store';

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
        const prefs=readProductionPrefs();
        for(const channel of useApp.getState().channels){
          let batches=[] as Awaited<ReturnType<typeof productionManagerApi.batches>>;
          const roots=[workspace,resolveProductionRootFromPrefs(prefs,channel.id,workspace)].filter((x,i,a)=>Boolean(x)&&a.indexOf(x)===i);
          for(const root of roots){
            try{batches.push(...await productionManagerApi.batches(root,channel.id))}catch{}
          }
          batches=[...new Map(batches.map(b=>[b.batchId,b])).values()];
          for(const batch of batches.slice(0,6)){
            if(['Completed','Завершено'].includes(batch.status)&&batch.completedProjects>=batch.projectCount)continue;
            let status;
            try{status=await productionManagerApi.status(batch.manifestPath)}catch{continue}
            for(const row of status.projects){
              if(!row.jobId)continue;
              const job=useApp.getState().jobs.find(j=>j.id===row.jobId);
              if(!job)continue;
              if(row.renderStatus==='Rendering'&&job.status!=='RENDERING'){
                useApp.getState().patchJob(job.id,{status:'RENDERING',error:undefined});
              }else if(row.renderStatus==='Completed'&&row.outputFile&&(job.finalPath!==row.outputFile||job.status!=='READY_UPLOAD')){
                useApp.getState().patchJob(job.id,{status:'READY_UPLOAD',finalPath:row.outputFile,error:undefined});
                const key=`${batch.batchId}:${row.projectId}:${row.outputFile}`;
                if(!announced.current.has(key)){
                  announced.current.add(key);
                  notifySuccess('Видео готово',`VIDEO_${String(row.videoNumber||job.number).padStart(3,'0')} • ENDLUME завершил рендер.`,{
                    operationId:`endlume-complete:${key}`,
                    actions:[{label:'Открыть файл',onClick:()=>{void api.openLocal(row.outputFile!)}}]
                  });
                }
              }else if(row.renderStatus==='Error'&&job.status!=='ERROR'){
                useApp.getState().patchJob(job.id,{status:'ERROR',error:row.error||'ENDLUME: ошибка рендера'});
              }
            }
          }
        }
      }finally{running=false}
    };
    void run();
    const id=window.setInterval(()=>void run(),7000);
    return()=>{live=false;window.clearInterval(id)};
  },[booted,workspace,channels.map(c=>c.id).join('|')]);
  return null;
}
""")
print('VYRON 1.1.0 ProductionStatusBridge rebuilt')
