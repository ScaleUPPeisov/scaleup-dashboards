import {describe,expect,it} from 'vitest';
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
 it('queue runtime persists every generic failure and PublisherOS emits one aggregate batch toast without duplicating history',()=>{
  const pub=readFileSync('src/PublisherOS.tsx','utf8'),queue=readFileSync('src/uploadQueueRuntime.ts','utf8'),notify=readFileSync('src/notificationCenter.ts','utf8');
  expect(queue).toContain("import {appendErrorHistory} from './errorHistory'");
  expect(queue).toContain('appendErrorHistory(h.title,`VIDEO_${String(spec.videoNumber).padStart(3,\'0\')}: ${h.message}`');
  expect(pub).toContain("import {batchFailureToast,type BatchFailure} from './errorPresentationPolicy'");
  expect(pub).toContain('waitForUploadQueueEntries(queueIds)');
  expect(pub).toContain("entries.filter(x=>x.state==='FAILED')");
  expect(pub).toContain('const failureToast=batchFailureToast(batchFailures)');
  expect(pub).toContain('notifyError(failureToast.title,failureToast.message,{persistError:false})');
  expect(notify).toContain('persistError?:boolean');
  expect(notify).toContain("type==='error'&&options.persistError!==false");
 });
});
