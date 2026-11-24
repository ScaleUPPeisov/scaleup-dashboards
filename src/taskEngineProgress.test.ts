import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {completeTask,ensureTask,failTask,flushPendingTaskProgress,reloadTaskEngineFromStorageForTests,resetTaskEngineForTests,snapshotTasks,subscribeTasks,updateTask} from './taskEngine';

const values=new Map<string,string>();
const storage={getItem:(key:string)=>values.get(key)??null,setItem:vi.fn((key:string,value:string)=>{values.set(key,String(value))}),removeItem:(key:string)=>{values.delete(key)}};
const testWindow=new EventTarget();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
Object.defineProperty(globalThis,'window',{configurable:true,value:testWindow});
if(typeof globalThis.CustomEvent==='undefined'){
 Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:class<T> extends Event{detail:T|undefined;constructor(name:string,options?:{detail?:T}){super(name);this.detail=options?.detail}}});
}

const task=(id:string)=>ensureTask({taskId:id,type:'UPLOAD',state:'RUNNING',jobId:id,label:id});

describe('coalesced upload progress',()=>{
 beforeEach(()=>{vi.useFakeTimers();values.clear();resetTaskEngineForTests();storage.setItem.mockClear()});
 afterEach(()=>{resetTaskEngineForTests();vi.useRealTimers()});
 it('keeps two current snapshots in memory while batching writes and subscriber events',()=>{
  task('one');task('two');
  const listener=vi.fn();const unsubscribe=subscribeTasks(listener);
  storage.setItem.mockClear();listener.mockClear();
  for(let i=1;i<=100;i++){
   updateTask('one',{progress:i,bytesCompleted:i});
   updateTask('two',{progress:i/2,bytesCompleted:i*2});
  }
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
  expect(snapshotTasks().tasks.find(t=>t.taskId==='one')?.bytesCompleted).toBe(100);
  expect(snapshotTasks().tasks.find(t=>t.taskId==='two')?.bytesCompleted).toBe(200);
  vi.advanceTimersByTime(249);expect(storage.setItem).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);expect(storage.setItem).toHaveBeenCalledTimes(1);expect(listener).toHaveBeenCalledTimes(1);
  const persisted=JSON.parse(values.get('vyron:task-engine:v1')!);
  expect(persisted.tasks.find((t:{taskId:string})=>t.taskId==='one').bytesCompleted).toBe(100);
  expect(persisted.tasks.find((t:{taskId:string})=>t.taskId==='two').bytesCompleted).toBe(200);
  unsubscribe();
 });
 it('persists completion and failure synchronously with the latest progress and does not replay a timer',()=>{
  task('one');task('two');storage.setItem.mockClear();
  updateTask('one',{bytesCompleted:123,progress:33});
  updateTask('two',{bytesCompleted:99,progress:20});
  completeTask('one');failTask('two','failed');
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  const rows=reloadTaskEngineFromStorageForTests().tasks;
  expect(rows.find(t=>t.taskId==='one')).toMatchObject({state:'SUCCEEDED',progress:100,bytesCompleted:123});
  expect(rows.find(t=>t.taskId==='two')).toMatchObject({state:'FAILED',bytesCompleted:99,error:'failed'});
  const count=storage.setItem.mock.calls.length;
  vi.advanceTimersByTime(1_000);expect(storage.setItem).toHaveBeenCalledTimes(count);
 });
 it('flushes the last value at page hide or explicit listener cleanup',()=>{
  task('one');storage.setItem.mockClear();
  updateTask('one',{progress:25});
  testWindow.dispatchEvent(new Event('pagehide'));
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  updateTask('one',{progress:35});flushPendingTaskProgress();
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(JSON.parse(values.get('vyron:task-engine:v1')!).tasks[0].progress).toBe(35);
  vi.advanceTimersByTime(250);expect(storage.setItem).toHaveBeenCalledTimes(2);
 });
 it('keeps non-progress changes synchronous',()=>{
  task('one');storage.setItem.mockClear();
  updateTask('one',{label:'new label'});
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(JSON.parse(values.get('vyron:task-engine:v1')!).tasks[0].label).toBe('new label');
 });
});
