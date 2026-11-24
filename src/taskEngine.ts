export type TaskType='UPLOAD'|'METADATA_UPDATE'|'TITLE_UPDATE'|'DESCRIPTION_UPDATE'|'TAGS_UPDATE'|'SCHEDULE_UPDATE'|'THUMBNAIL_UPDATE'|'STATISTICS_REFRESH'|'RENDER_SCAN'|'FINGERPRINT'|'OAUTH_RECOVERY'|'CLEANUP'|'UPDATER'|'PRODUCTION_RECOVERY';
export type TaskState='QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'ATTENTION_REQUIRED'|'CANCELLED';
export type TaskRetryState='NONE'|'RETRY_AVAILABLE'|'RECONCILE_REQUIRED';
export type PersistentTask={
 taskId:string;
 channelId?:string;
 channelName?:string;
 profileId?:string;
 jobId?:string;
 type:TaskType;
 state:TaskState;
 progress?:number;
 completed?:number;
 total?:number;
 bytesCompleted?:number;
 bytesTotal?:number;
 speedBps?:number;
 etaSeconds?:number;
 label:string;
 detail?:string;
 resourceKey?:string;
 createdAt:string;
 startedAt?:string;
 completedAt?:string;
 error?:string;
 retryState:TaskRetryState;
 recoveryStatus?:'Восстанавливается'|'Продолжено'|'Ожидает диск'|'Требует внимания'|'Готово';
 updatedAt:string;
};
export type TaskSnapshot={version:1;tasks:PersistentTask[]};

const STORAGE_KEY='vyron:task-engine:v1';
const EVENT='vyron:task-engine';
const MAX_TASKS=500;
const UPLOAD_PROGRESS_FLUSH_MS=250;
let memory:TaskSnapshot|undefined;
let progressTimer:ReturnType<typeof setTimeout>|undefined;
let progressPending=false;

function onProgressVisibilityChange(){
 if(typeof document!=='undefined'&&document.visibilityState==='hidden')flushPendingTaskProgress();
}
function removeProgressFlushListeners(){
 if(typeof window!=='undefined'){
  window.removeEventListener('pagehide',flushPendingTaskProgress);
  window.removeEventListener('beforeunload',flushPendingTaskProgress);
 }
 if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onProgressVisibilityChange);
}
function cancelPendingProgress(){
 if(progressTimer!==undefined)clearTimeout(progressTimer);
 progressTimer=undefined;progressPending=false;removeProgressFlushListeners();
}
/** Flush the latest buffered upload progress before the host listener unmounts. */
export function flushPendingTaskProgress(){
 if(!progressPending)return;
 emit();
}
function scheduleProgressFlush(){
 if(progressPending)return;
 progressPending=true;
 if(typeof window!=='undefined'){
  window.addEventListener('pagehide',flushPendingTaskProgress);
  window.addEventListener('beforeunload',flushPendingTaskProgress);
 }
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',onProgressVisibilityChange);
 progressTimer=setTimeout(flushPendingTaskProgress,UPLOAD_PROGRESS_FLUSH_MS);
}

const now=()=>new Date().toISOString();
const clamp=(value:number|undefined)=>value==null||!Number.isFinite(value)?undefined:Math.max(0,Math.min(100,value));
function readRaw():TaskSnapshot{
 if(memory)return memory;
 try{
  const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null') as TaskSnapshot|null;
  const rows=Array.isArray(parsed?.tasks)?parsed!.tasks.filter(Boolean):[];
  memory={version:1,tasks:rows.slice(-MAX_TASKS).map(t=>t.state==='RUNNING'?{...t,state:'ATTENTION_REQUIRED' as const,retryState:'RECONCILE_REQUIRED' as const,error:t.error||'Приложение было перезапущено во время операции. Требуется безопасная сверка состояния.',updatedAt:now()}:t)};
 }catch{memory={version:1,tasks:[]}}
 persist();
 return memory!;
}
function persist(){
 if(!memory)return;
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(memory))}catch{}
}
function emit(){
 cancelPendingProgress();
 persist();
 try{window.dispatchEvent(new CustomEvent(EVENT,{detail:snapshotTasks()}))}catch{}
}
function replace(task:PersistentTask,deferProgress=false){
 const state=readRaw(),i=state.tasks.findIndex(x=>x.taskId===task.taskId);
 const tasks=state.tasks.slice();
 if(i>=0)tasks[i]=task;else tasks.push(task);
 memory={version:1,tasks:tasks.length>MAX_TASKS?tasks.slice(-MAX_TASKS):tasks};
 if(deferProgress)scheduleProgressFlush();else emit();
 return task;
}
export function snapshotTasks():TaskSnapshot{
 const state=readRaw();
 return{version:1,tasks:[...state.tasks].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};
}
export function subscribeTasks(cb:(snapshot:TaskSnapshot)=>void){
 const fn=(e:Event)=>cb((e as CustomEvent<TaskSnapshot>).detail);
 window.addEventListener(EVENT,fn);cb(snapshotTasks());return()=>window.removeEventListener(EVENT,fn);
}
export function ensureTask(input:Omit<PersistentTask,'createdAt'|'updatedAt'|'retryState'|'state'> & {state?:TaskState;retryState?:TaskRetryState;createdAt?:string}){
 const state=readRaw(),stamp=now();
 if(input.resourceKey){
  let changed=false;
  const tasks=state.tasks.map(x=>{
   if(x.taskId===input.taskId||x.resourceKey!==input.resourceKey||!['FAILED','ATTENTION_REQUIRED'].includes(x.state))return x;
   changed=true;
   return{...x,state:'CANCELLED' as const,error:undefined,retryState:'NONE' as const,detail:'Предыдущая ошибка закрыта новой попыткой.',completedAt:stamp,updatedAt:stamp}
  });
  if(changed){memory={version:1,tasks};emit()}
 }
 const existing=readRaw().tasks.find(x=>x.taskId===input.taskId);
 return replace({...existing,...input,state:input.state||existing?.state||'QUEUED',retryState:input.retryState||existing?.retryState||'NONE',progress:clamp(input.progress??existing?.progress),createdAt:existing?.createdAt||input.createdAt||stamp,updatedAt:stamp} as PersistentTask);
}
export function startTask(taskId:string,detail?:string){
 const existing=readRaw().tasks.find(x=>x.taskId===taskId);if(!existing)return;
 return replace({...existing,state:'RUNNING',startedAt:existing.startedAt||now(),detail:detail??existing.detail,error:undefined,retryState:'NONE',updatedAt:now()});
}
export function updateTask(taskId:string,patch:Partial<Pick<PersistentTask,'progress'|'completed'|'total'|'bytesCompleted'|'bytesTotal'|'speedBps'|'etaSeconds'|'detail'|'label'|'channelName'|'recoveryStatus'>>){
 const existing=readRaw().tasks.find(x=>x.taskId===taskId);if(!existing)return;
 // High-frequency upload progress remains immediately readable in memory.
 // Lifecycle and identity changes retain synchronous persistence/notification.
 const deferProgress=existing.type==='UPLOAD'&&existing.state==='RUNNING'&&patch.label===undefined&&patch.channelName===undefined&&patch.recoveryStatus===undefined;
 return replace({...existing,...patch,progress:clamp(patch.progress??existing.progress),updatedAt:now()},deferProgress);
}
export function completeTask(taskId:string,detail?:string){
 const existing=readRaw().tasks.find(x=>x.taskId===taskId);if(!existing)return;
 return replace({...existing,state:'SUCCEEDED',progress:100,detail:detail??existing.detail,error:undefined,retryState:'NONE',completedAt:now(),updatedAt:now()});
}
export function failTask(taskId:string,error:string,retryState:TaskRetryState='RETRY_AVAILABLE'){
 const existing=readRaw().tasks.find(x=>x.taskId===taskId);if(!existing)return;
 return replace({...existing,state:'FAILED',error:String(error),retryState,completedAt:now(),updatedAt:now()});
}
export function attentionTask(taskId:string,error:string){
 const existing=readRaw().tasks.find(x=>x.taskId===taskId);if(!existing)return;
 return replace({...existing,state:'ATTENTION_REQUIRED',error:String(error),retryState:'RECONCILE_REQUIRED',updatedAt:now()});
}
export function cancelTask(taskId:string,detail?:string){
 const existing=readRaw().tasks.find(x=>x.taskId===taskId);if(!existing)return;
 return replace({...existing,state:'CANCELLED',detail:detail??existing.detail,retryState:'NONE',completedAt:now(),updatedAt:now()});
}
export function removeTask(taskId:string){
 const state=readRaw();memory={version:1,tasks:state.tasks.filter(x=>x.taskId!==taskId)};emit();
}
export function clearCompletedTasks(){
 const state=readRaw();memory={version:1,tasks:state.tasks.filter(x=>!['SUCCEEDED','CANCELLED'].includes(x.state))};emit();
}
export function clearFailedTasks(){
 const state=readRaw();memory={version:1,tasks:state.tasks.filter(x=>!['FAILED','ATTENTION_REQUIRED'].includes(x.state))};emit();
}
export function clearTaskHistory(){
 const state=readRaw();memory={version:1,tasks:state.tasks.filter(x=>['QUEUED','RUNNING'].includes(x.state))};emit();
}
export function activeTaskForResource(resourceKey:string){
 return readRaw().tasks.find(x=>x.resourceKey===resourceKey&&['QUEUED','RUNNING'].includes(x.state));
}
export function reconcileUploadTasks(activeUploadIds:Set<string>,queuedUploadIds:Set<string>=new Set()){
 const state=readRaw();let changed=false;
 const tasks=state.tasks.map(t=>{
  if(t.type!=='UPLOAD'||!t.jobId)return t;
  if(activeUploadIds.has(t.jobId)){if(t.state==='RUNNING')return t;changed=true;return{...t,state:'RUNNING' as const,retryState:'NONE' as const,error:undefined,startedAt:t.startedAt||now(),updatedAt:now()}}
  if(queuedUploadIds.has(t.jobId)){if(t.state==='QUEUED')return t;changed=true;return{...t,state:'QUEUED' as const,retryState:'NONE' as const,error:undefined,updatedAt:now()}}
  if(t.state==='RUNNING'||t.state==='QUEUED'){changed=true;return{...t,state:'ATTENTION_REQUIRED' as const,retryState:'RECONCILE_REQUIRED' as const,error:'Операция отсутствует в активном runtime. Требуется сверка upload session / YouTube state перед повтором.',updatedAt:now()}}
  return t;
 });
 if(changed){memory={version:1,tasks};emit()}
}
export function resetTaskEngineForTests(){cancelPendingProgress();memory={version:1,tasks:[]};try{localStorage.removeItem(STORAGE_KEY)}catch{}}
export function reloadTaskEngineFromStorageForTests(){cancelPendingProgress();memory=undefined;return snapshotTasks()}
