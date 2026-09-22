import {beforeEach,describe,expect,it} from 'vitest';
import {attentionTask,clearFailedTasks,clearTaskHistory,completeTask,ensureTask,failTask,reconcileUploadTasks,reloadTaskEngineFromStorageForTests,resetTaskEngineForTests,snapshotTasks,startTask,updateTask} from './taskEngine';

const mem=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>mem.has(k)?mem.get(k)!:null,setItem:(k:string,v:string)=>void mem.set(k,String(v)),
 removeItem:(k:string)=>void mem.delete(k),clear:()=>mem.clear(),key:(i:number)=>[...mem.keys()][i]??null,get length(){return mem.size}
}});
if(typeof globalThis.window==='undefined')Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>true,addEventListener:()=>{},removeEventListener:()=>{}}});
if(typeof globalThis.CustomEvent==='undefined')Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:class{detail:any;constructor(_n:string,i?:any){this.detail=i?.detail}}});

describe('VYRON persistent task engine',()=>{
 beforeEach(()=>{mem.clear();resetTaskEngineForTests()});
 it('persists factual upload progress and completion independent of page state',()=>{
  ensureTask({taskId:'upload:j1',type:'UPLOAD',state:'QUEUED',channelId:'glass',channelName:'Glass',jobId:'j1',label:'VIDEO_001',bytesTotal:500,progress:0,resourceKey:'upload:glass:j1'});
  startTask('upload:j1');
  updateTask('upload:j1',{bytesCompleted:250,bytesTotal:500,progress:50,speedBps:10,etaSeconds:25});
  let t=snapshotTasks().tasks[0];expect(t.state).toBe('RUNNING');expect(t.progress).toBe(50);expect(t.bytesCompleted).toBe(250);expect(t.speedBps).toBe(10);
  completeTask('upload:j1','YouTube ID: X');t=snapshotTasks().tasks[0];expect(t.state).toBe('SUCCEEDED');expect(t.progress).toBe(100);
 });
 it('restart never blindly resumes an unresolved remote task',()=>{
  ensureTask({taskId:'upload:j1',type:'UPLOAD',state:'QUEUED',channelId:'glass',jobId:'j1',label:'VIDEO_001'});
  startTask('upload:j1');
  const reloaded=reloadTaskEngineFromStorageForTests().tasks[0];
  expect(reloaded.state).toBe('ATTENTION_REQUIRED');
  expect(reloaded.retryState).toBe('RECONCILE_REQUIRED');
 });
 it('backend active upload facts restore RUNNING without creating another task identity',()=>{
  ensureTask({taskId:'upload:j1',type:'UPLOAD',state:'QUEUED',channelId:'glass',jobId:'j1',label:'VIDEO_001'});
  reloadTaskEngineFromStorageForTests();
  reconcileUploadTasks(new Set(['j1']));
  const tasks=snapshotTasks().tasks;expect(tasks).toHaveLength(1);expect(tasks[0].state).toBe('RUNNING');expect(tasks[0].taskId).toBe('upload:j1');
 });
 it('missing runtime upload remains attention-required instead of becoming queued again',()=>{
  ensureTask({taskId:'upload:j1',type:'UPLOAD',state:'RUNNING',channelId:'glass',jobId:'j1',label:'VIDEO_001'});
  reconcileUploadTasks(new Set());
  expect(snapshotTasks().tasks[0].state).toBe('ATTENTION_REQUIRED');
 });
 it('deduplicates repeated failed Render scans by logical resource and resolves on successful retry',()=>{
  const resourceKey='render-scan:glass';
  for(let n=1;n<=4;n++){
   const id=`render-scan-attempt-${n}`;
   ensureTask({taskId:id,type:'RENDER_SCAN',state:'QUEUED',channelId:'glass',label:'Скан Render',resourceKey});
   startTask(id);failTask(id,'disk unavailable');
  }
  let tasks=snapshotTasks().tasks;
  expect(tasks.filter(x=>x.state==='FAILED')).toHaveLength(1);
  expect(tasks.filter(x=>x.state==='CANCELLED')).toHaveLength(3);
  ensureTask({taskId:'render-scan-attempt-5',type:'RENDER_SCAN',state:'QUEUED',channelId:'glass',label:'Скан Render',resourceKey});
  startTask('render-scan-attempt-5');completeTask('render-scan-attempt-5','30 файлов');
  tasks=snapshotTasks().tasks;
  expect(tasks.filter(x=>x.state==='FAILED'||x.state==='ATTENTION_REQUIRED')).toHaveLength(0);
  expect(tasks.find(x=>x.taskId==='render-scan-attempt-5')?.state).toBe('SUCCEEDED');
 });
 it('clears failed task records persistently and does not resurrect them after reload',()=>{
  ensureTask({taskId:'render-scan:glass',type:'RENDER_SCAN',state:'QUEUED',channelId:'glass',label:'Скан Render',resourceKey:'render-scan:glass'});
  startTask('render-scan:glass');failTask('render-scan:glass','scan failed');
  expect(snapshotTasks().tasks.filter(x=>x.state==='FAILED')).toHaveLength(1);
  clearFailedTasks();
  expect(snapshotTasks().tasks.filter(x=>x.state==='FAILED'||x.state==='ATTENTION_REQUIRED')).toHaveLength(0);
  expect(reloadTaskEngineFromStorageForTests().tasks.filter(x=>x.state==='FAILED'||x.state==='ATTENTION_REQUIRED')).toHaveLength(0);
 });
 it('clear history preserves real running work but removes terminal task records across reload',()=>{
  ensureTask({taskId:'upload:live',type:'UPLOAD',state:'QUEUED',channelId:'glass',jobId:'live',label:'VIDEO_001'});
  startTask('upload:live');
  ensureTask({taskId:'old:success',type:'RENDER_SCAN',state:'SUCCEEDED',channelId:'glass',label:'Скан Render'});
  ensureTask({taskId:'old:failed',type:'RENDER_SCAN',state:'FAILED',channelId:'glass',label:'Скан Render'});
  clearTaskHistory();
  const rows=reloadTaskEngineFromStorageForTests().tasks;
  expect(rows.map(x=>x.taskId)).toEqual(['upload:live']);
  expect(rows[0].state).toBe('ATTENTION_REQUIRED');
 });

 it('non-upload tasks can report mathematically meaningful item progress',()=>{
  ensureTask({taskId:'render:glass',type:'RENDER_SCAN',state:'QUEUED',channelId:'glass',label:'Скан Render',completed:0,total:30,progress:0});
  startTask('render:glass');updateTask('render:glass',{completed:18,total:30,progress:60});
  const t=snapshotTasks().tasks[0];expect(t.completed).toBe(18);expect(t.total).toBe(30);expect(t.progress).toBe(60);
  attentionTask('render:glass','disk unavailable');expect(snapshotTasks().tasks[0].state).toBe('ATTENTION_REQUIRED');
 });
});
