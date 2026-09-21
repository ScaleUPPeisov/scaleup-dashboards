import {beforeEach,describe,expect,it} from 'vitest';
import {attentionTask,completeTask,ensureTask,reconcileUploadTasks,reloadTaskEngineFromStorageForTests,resetTaskEngineForTests,snapshotTasks,startTask,updateTask} from './taskEngine';

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
 it('non-upload tasks can report mathematically meaningful item progress',()=>{
  ensureTask({taskId:'render:glass',type:'RENDER_SCAN',state:'QUEUED',channelId:'glass',label:'Скан Render',completed:0,total:30,progress:0});
  startTask('render:glass');updateTask('render:glass',{completed:18,total:30,progress:60});
  const t=snapshotTasks().tasks[0];expect(t.completed).toBe(18);expect(t.total).toBe(30);expect(t.progress).toBe(60);
  attentionTask('render:glass','disk unavailable');expect(snapshotTasks().tasks[0].state).toBe('ATTENTION_REQUIRED');
 });
});
