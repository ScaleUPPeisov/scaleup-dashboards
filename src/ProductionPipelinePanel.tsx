import React,{useMemo} from 'react';
import {useApp} from './store';
import {buildProductionPipelineFromCounts,PRODUCTION_PIPELINE_ORDER,type ProductionPipelineStage} from './productionPipeline';

const labels:Record<ProductionPipelineStage,string>={
 SOURCE:'SOURCE',READY:'READY',RENDERING:'RENDERING',RENDERED:'RENDERED',METADATA:'METADATA',READY_UPLOAD:'READY TO UPLOAD',UPLOADING:'UPLOADING',PROCESSING:'PROCESSING',SCHEDULED:'SCHEDULED',PUBLISHED:'PUBLISHED',ERROR:'ERROR'
};
export function ProductionPipelinePanel(){
 const counts=useApp(s=>s.jobSummary.pipelineCounts),total=useApp(s=>s.jobSummary.total),history=useApp(s=>s.uploadHistory);
 const snapshot=useMemo(()=>buildProductionPipelineFromCounts(counts,total,history,new Date()),[counts,total,history]);
 return <section className="panel productionPipelineV5">
  <div className="panelHead"><div><small>PRODUCTION PIPELINE</small><h3>Конвейер производства</h3><p>Каждая задача учитывается ровно в одном этапе. Published today считается отдельно по подтверждённому uploadHistory.</p></div><span>{snapshot.total} задач</span></div>
  <div className="pipelineConveyor">{PRODUCTION_PIPELINE_ORDER.map((stage,i)=><React.Fragment key={stage}><div className={'pipelineStage stage-'+stage.toLowerCase()}><small>{labels[stage]}</small><b>{snapshot.counts[stage]}</b></div>{i<PRODUCTION_PIPELINE_ORDER.length-1&&<i className="pipelineArrow">→</i>}</React.Fragment>)}</div>
  <div className={'pipelineBottleneck '+snapshot.bottleneck.tone}><span><small>BOTTLENECK ENGINE</small><b>{snapshot.bottleneck.title}</b><p>{snapshot.bottleneck.detail}</p></span><em>Загружено сегодня: {snapshot.publishedToday}</em>{snapshot.counts.ERROR>0&&<strong>Ошибки: {snapshot.counts.ERROR}</strong>}</div>
 </section>
}
