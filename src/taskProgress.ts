import type {PersistentTask} from './taskEngine';
export type AggregatedTaskProgress={percent?:number;completedUnits:number;totalUnits:number;measurable:number;indeterminate:number};
function units(t:PersistentTask):[number,number]|undefined{
 if(Number.isFinite(t.bytesTotal)&&Number(t.bytesTotal)>0&&Number.isFinite(t.bytesCompleted))return[Math.max(0,Math.min(Number(t.bytesTotal),Number(t.bytesCompleted))),Number(t.bytesTotal)];
 if(Number.isFinite(t.total)&&Number(t.total)>0&&Number.isFinite(t.completed))return[Math.max(0,Math.min(Number(t.total),Number(t.completed))),Number(t.total)];
 if(t.state==='RUNNING'&&Number.isFinite(t.progress))return[Math.max(0,Math.min(100,Number(t.progress))),100];
 if(t.state==='QUEUED'&&Number.isFinite(t.total)&&Number(t.total)>0)return[0,Number(t.total)];
 return;
}
export function aggregateActiveTaskProgress(tasks:PersistentTask[]):AggregatedTaskProgress{
 const active=tasks.filter(t=>t.state==='RUNNING'||t.state==='QUEUED');let completedUnits=0,totalUnits=0,measurable=0,indeterminate=0;
 for(const task of active){const u=units(task);if(!u){indeterminate++;continue}completedUnits+=u[0];totalUnits+=u[1];measurable++}
 const percent=totalUnits>0?Math.max(0,Math.min(100,Math.round(completedUnits/totalUnits*100))):undefined;
 return{percent,completedUnits,totalUnits,measurable,indeterminate};
}
