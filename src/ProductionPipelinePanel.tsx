import React from 'react';
import {PRODUCTION_PIPELINE_ORDER,type ProductionPipelineStage} from './productionPipeline';
import {useJobDerived} from './jobDerivedRuntime';

const labels:Record<ProductionPipelineStage,string>={
 SOURCE:'Материалы',READY:'Готово к рендеру',RENDERING:'Рендер',RENDERED:'Рендер готов',METADATA:'Метаданные',READY_UPLOAD:'Готово к загрузке',UPLOADING:'Загрузка',PROCESSING:'Обработка',SCHEDULED:'Запланировано',PUBLISHED:'Опубликовано',ERROR:'Ошибка'
};
export function ProductionPipelinePanel(){
 const snapshot=useJobDerived(s=>s.pipeline);
 const groups:ReadonlyArray<{label:string;stages:ProductionPipelineStage[]}>=[{label:'Материалы',stages:['SOURCE']},{label:'Сборка',stages:['READY']},{label:'Рендер',stages:['RENDERING']},{label:'Проверка',stages:['RENDERED','METADATA','READY_UPLOAD']},{label:'Публикация',stages:['UPLOADING','PROCESSING','SCHEDULED','PUBLISHED']}];
 return <section className="panel productionPipelineV5">
  <div className="panelHead"><div><h3>Конвейер производства</h3><p>Каждая задача учитывается ровно в одном этапе. Загруженные сегодня считаются отдельно по подтверждённой истории.</p></div><span>{snapshot.total} задач</span></div>
  <div className="apexProductionStages">{groups.map((group,i)=><div key={group.label}><span className="apexProductionStageNumber">{i+1}</span><span><b>{group.label}</b><small>{group.stages.reduce((sum,stage)=>sum+snapshot.counts[stage],0)}</small></span></div>)}</div><details className="apexProductionStageDetails"><summary>Все этапы и статусы</summary><div className="pipelineConveyor">{PRODUCTION_PIPELINE_ORDER.map((stage,i)=><React.Fragment key={stage}><div className={'pipelineStage stage-'+stage.toLowerCase()}><small>{labels[stage]}</small><b>{snapshot.counts[stage]}</b></div>{i<PRODUCTION_PIPELINE_ORDER.length-1&&<i className="pipelineArrow">→</i>}</React.Fragment>)}</div></details>
  <div className={'pipelineBottleneck '+snapshot.bottleneck.tone}><span><small>Узкое место</small><b>{snapshot.bottleneck.title}</b><p>{snapshot.bottleneck.detail}</p></span><em>Загружено сегодня: {snapshot.publishedToday}</em>{snapshot.counts.ERROR>0&&<strong>Ошибки: {snapshot.counts.ERROR}</strong>}</div>
 </section>
}
