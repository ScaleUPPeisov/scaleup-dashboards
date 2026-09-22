import type {VideoJob} from './types';
import {loadScheduleRecovery,type ScheduleOnlyRecovery} from './scheduleOnly';
import {factualActiveOperationCounts,type FactualActiveOperationCounts} from './activeOperationFacts';

export type UpdaterBlockerKind='UPLOADS'|'RENDERS'|'SCHEDULE';
export type UpdaterBlocker={kind:UpdaterBlockerKind;label:string;count:number};

export function collectUpdaterBlockers(_jobs:VideoJob[],recoveries:(ScheduleOnlyRecovery|undefined)[],factual:FactualActiveOperationCounts=factualActiveOperationCounts()){
  const blockers:UpdaterBlocker[]=[];
  const uploadCount=Math.max(0,factual.uploads);
  const renderCount=Math.max(0,factual.renders);
  const scheduleCount=recoveries.reduce((sum,x)=>sum+(x?.rows.filter(r=>r.status==='PENDING').length||0),0);
  if(uploadCount)blockers.push({kind:'UPLOADS',label:'Uploads',count:uploadCount});
  if(renderCount)blockers.push({kind:'RENDERS',label:'Render / ENDLUME',count:renderCount});
  if(scheduleCount)blockers.push({kind:'SCHEDULE',label:'Schedule',count:scheduleCount});
  return blockers;
}

export function currentUpdaterBlockers(jobs:VideoJob[],channelIds:string[]){return collectUpdaterBlockers(jobs,channelIds.map(id=>loadScheduleRecovery(id)),factualActiveOperationCounts())}

export function updaterBlockerText(rows:UpdaterBlocker[]){return rows.map(x=>`${x.label}: ${x.count}`).join('\n')}
