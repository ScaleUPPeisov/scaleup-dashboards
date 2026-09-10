#!/usr/bin/env python3
from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

# Error Center semantics: "Очистить историю" is the user's explicit presentation reset.
# It clears persisted history + displayed job.error payloads, but NEVER changes job status.
p=root/'src/App.tsx'
s=p.read_text()
old="<button onClick={()=>{clearErrorHistory();setHistory([])}} disabled={!history.length}>Очистить историю</button>"
new="<button onClick={()=>{jobErrors.forEach(j=>patchJob(j.id,{error:undefined}));clearErrorHistory();setHistory([])}} disabled={!errorCount}>Очистить историю</button>"
if old not in s:
    raise SystemExit('App clear-history anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# A small pure policy module makes the presentation/task-status separation testable.
(root/'src/errorPresentationPolicy.ts').write_text(r'''export type ErrorTaskLike={id:string;status:string;error?:string};
export type ErrorHistoryLike={id:string};
export function clearErrorPresentation<T extends ErrorTaskLike>(jobs:T[]){
 return jobs.map(j=>j.error?{...j,error:undefined}:j);
}
export function errorPresentationCount(jobs:ErrorTaskLike[],history:ErrorHistoryLike[]){
 return jobs.filter(j=>Boolean(j.error)).length+history.length;
}
export type BatchFailure={id:string;message:string;technicalDetail?:string};
export function batchFailureToast(failures:BatchFailure[]){
 if(!failures.length)return undefined;
 if(failures.length===1)return{title:'Операция не выполнена',message:failures[0].message};
 return{title:`Не удалось обработать ${failures.length} видео`,message:'Остальные задачи продолжены. Подробности сохранены в Error Center.'};
}
''')

# Error notifications may be presentation-only when each root cause was already persisted.
p=root/'src/notificationCenter.ts'
s=p.read_text()
old="export type NotificationOptions={operationId?:string;durationMs?:number|null;actions?:NotificationAction[];technicalDetail?:string};"
new="export type NotificationOptions={operationId?:string;durationMs?:number|null;actions?:NotificationAction[];technicalDetail?:string;persistError?:boolean};"
if old not in s:
    raise SystemExit('notification options anchor missing')
s=s.replace(old,new,1)
old="if(type==='error')appendErrorHistory(detail.title,detail.message||'',detail.technicalDetail||'');"
new="if(type==='error'&&options.persistError!==false)appendErrorHistory(detail.title,detail.message||'',detail.technicalDetail||'');"
if old not in s:
    raise SystemExit('notification persistence anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Wire batch policy into the real PublisherOS upload loop.
p=root/'src/PublisherOS.tsx'
s=p.read_text()
anchor="import {removeSelectedPublishItems} from './publishRemoval';"
if anchor not in s:
    raise SystemExit('PublisherOS import anchor missing')
s=s.replace(anchor,anchor+"\nimport {appendErrorHistory} from './errorHistory';\nimport {batchFailureToast,type BatchFailure} from './errorPresentationPolicy';",1)
old="setBusy(true);let completed=0,stopped=false;try{for(const j of batch){"
new="setBusy(true);let completed=0,stopped=false;const batchFailures:BatchFailure[]=[];try{for(const j of batch){"
if old not in s:
    raise SystemExit('PublisherOS batch state anchor missing')
s=s.replace(old,new,1)
old=r"""{const h=humanizeError(e,'upload');patchJob(j.id,{status:'ERROR',error:h.message});notifyError(h.title,`VIDEO_${String(j.number).padStart(3,'0')}: ${h.message}`,{technicalDetail:h.detail})}"""
new=r"""{const h=humanizeError(e,'upload'),message=`VIDEO_${String(j.number).padStart(3,'0')}: ${h.message}`;patchJob(j.id,{status:'ERROR',error:h.message});appendErrorHistory(h.title,message,h.detail);batchFailures.push({id:j.id,message,technicalDetail:h.detail})}"""
if old not in s:
    raise SystemExit('PublisherOS per-item generic error anchor missing')
s=s.replace(old,new,1)
old="if(completed){const dg=quotaDelta(plan.buckets.general.required,actual.buckets.general)"
new="const failureToast=batchFailureToast(batchFailures);if(failureToast)notifyError(failureToast.title,failureToast.message,{operationId:`publish-failures:${operationId}`,persistError:false});if(completed){const dg=quotaDelta(plan.buckets.general.required,actual.buckets.general)"
if old not in s:
    raise SystemExit('PublisherOS aggregate failure toast anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

(root/'src/v2100ErrorCenterSemantics.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';
import {batchFailureToast,clearErrorPresentation,errorPresentationCount} from './errorPresentationPolicy';
import {readFileSync} from 'node:fs';

describe('VYRON 2.1 Error Center semantics',()=>{
 it('clear presentation removes 5 displayed errors and counter while retaining ERROR task status',()=>{
  const jobs=Array.from({length:5},(_,i)=>({id:String(i),status:'ERROR',error:`boom-${i}`}));
  const history=Array.from({length:5},(_,i)=>({id:`h${i}`}));
  expect(errorPresentationCount(jobs,history)).toBe(10);
  const cleared=clearErrorPresentation(jobs);
  expect(cleared.every(j=>j.status==='ERROR')).toBe(true);
  expect(errorPresentationCount(cleared,[])).toBe(0);
 });
 it('an ERROR task can create a new presented error after a clear/retry',()=>{
  const [cleared]=clearErrorPresentation([{id:'1',status:'ERROR',error:'old'}]);
  const retried={...cleared,error:'new root cause'};
  expect(retried.status).toBe('ERROR');expect(retried.error).toBe('new root cause');expect(errorPresentationCount([retried],[])).toBe(1);
 });
 it('50 batch failures yield one aggregate toast policy while retaining all 50 failure records',()=>{
  const failures=Array.from({length:50},(_,i)=>({id:String(i),message:`root-${i}`,technicalDetail:`detail-${i}`}));
  expect(failures).toHaveLength(50);
  expect(batchFailureToast(failures)).toEqual({title:'Не удалось обработать 50 видео',message:'Остальные задачи продолжены. Подробности сохранены в Error Center.'});
 });
 it('one standalone failure keeps a normal toast',()=>expect(batchFailureToast([{id:'1',message:'real reason'}])).toEqual({title:'Операция не выполнена',message:'real reason'}));
 it('UI clear-history clears job presentation + persisted history without mutating status',()=>{
  const app=readFileSync('src/App.tsx','utf8');
  const marker='>Очистить историю</button>';
  const at=app.indexOf(marker);expect(at).toBeGreaterThan(0);
  const section=app.slice(Math.max(0,at-300),at+marker.length);
  expect(section).toContain("patchJob(j.id,{error:undefined})");
  expect(section).toContain('clearErrorHistory()');
  expect(section).not.toContain("status:'SUCCESS'");
 });
 it('real PublisherOS persists every generic batch failure but emits one aggregate error toast',()=>{
  const pub=readFileSync('src/PublisherOS.tsx','utf8'),notify=readFileSync('src/notificationCenter.ts','utf8');
  expect(pub).toContain("import {appendErrorHistory} from './errorHistory'");
  expect(pub).toContain("import {batchFailureToast,type BatchFailure} from './errorPresentationPolicy'");
  expect(pub).toContain('const batchFailures:BatchFailure[]=[]');
  expect(pub).toContain('appendErrorHistory(h.title,message,h.detail)');
  expect(pub).toContain('batchFailures.push({id:j.id,message,technicalDetail:h.detail})');
  expect(pub).toContain('const failureToast=batchFailureToast(batchFailures)');
  expect(pub).toContain('persistError:false');
  expect(notify).toContain('persistError?:boolean');
  expect(notify).toContain("type==='error'&&options.persistError!==false");
 });
});
''')

print('VYRON 2.1.0 Error Center hardening applied: clear semantics + real batch aggregation wiring')
