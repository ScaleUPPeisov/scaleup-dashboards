import React,{useEffect,useMemo,useState} from 'react';
import {clearCompletedTasks,snapshotTasks,subscribeTasks,type PersistentTask,type TaskSnapshot} from './taskEngine';

const UI_EVENT='vyron:task-center-ui';
let openState=false;
export function openTaskCenter(){openState=true;try{window.dispatchEvent(new CustomEvent(UI_EVENT,{detail:true}))}catch{}}
export function closeTaskCenter(){openState=false;try{window.dispatchEvent(new CustomEvent(UI_EVENT,{detail:false}))}catch{}}
function subscribeUi(cb:(open:boolean)=>void){const fn=(e:Event)=>cb(Boolean((e as CustomEvent<boolean>).detail));window.addEventListener(UI_EVENT,fn);cb(openState);return()=>window.removeEventListener(UI_EVENT,fn)}
const taskTitle:Record<PersistentTask['type'],string>={UPLOAD:'Загрузка YouTube',METADATA_UPDATE:'Метаданные',TITLE_UPDATE:'Название',DESCRIPTION_UPDATE:'Описание',TAGS_UPDATE:'Теги',SCHEDULE_UPDATE:'Расписание',THUMBNAIL_UPDATE:'Обложка',STATISTICS_REFRESH:'Статистика',RENDER_SCAN:'Скан Render',FINGERPRINT:'Fingerprint',OAUTH_RECOVERY:'OAuth recovery',CLEANUP:'Очистка',UPDATER:'Обновление'};
const stateLabel:Record<PersistentTask['state'],string>={QUEUED:'В очереди',RUNNING:'Выполняется',SUCCEEDED:'Готово',FAILED:'Ошибка',ATTENTION_REQUIRED:'Требует внимания',CANCELLED:'Отменено'};
const fmtBytes=(n?:number)=>n==null?'—':n>=1024**3?(n/1024**3).toFixed(2)+' GB':(n/1024**2).toFixed(n>=100*1024**2?0:1)+' MB';
const fmtSpeed=(n?:number)=>n&&n>0?(n/1024/1024).toFixed(n>=10*1024*1024?1:2)+' MB/s':'—';
const fmtEta=(s?:number)=>{if(s==null||!Number.isFinite(s)||s<0)return'—';const v=Math.round(s),m=Math.floor(v/60),sec=v%60;return m>=60?Math.floor(m/60)+':'+String(m%60).padStart(2,'0')+':'+String(sec).padStart(2,'0'):m+':'+String(sec).padStart(2,'0')};
function useTasks(){const[s,setS]=useState<TaskSnapshot>(()=>snapshotTasks());useEffect(()=>subscribeTasks(setS),[]);return s.tasks}
function progressText(t:PersistentTask){
 if(t.bytesTotal&&t.bytesCompleted!=null)return fmtBytes(t.bytesCompleted)+' / '+fmtBytes(t.bytesTotal);
 if(t.total!=null&&t.completed!=null)return t.completed+' / '+t.total;
 return t.progress!=null?Math.round(t.progress)+'%':'';
}
export function GlobalTaskIndicator(){
 const tasks=useTasks(),active=tasks.filter(t=>t.state==='RUNNING'||t.state==='QUEUED'),attention=tasks.filter(t=>t.state==='FAILED'||t.state==='ATTENTION_REQUIRED').length;
 const known=active.filter(t=>typeof t.progress==='number'),percent=known.length?Math.round(known.reduce((n,t)=>n+(t.progress||0),0)/known.length):undefined;
 if(!active.length&&!attention)return null;
 const label=active.length?active.length+' задач'+(percent!=null?' • '+percent+'%':''):'⚠ '+attention;
 return <button className={'globalTaskIndicator '+(attention?'warn':'')} onClick={openTaskCenter} title="Открыть центр задач"><span>{label}</span>{percent!=null&&<i><em style={{width:percent+'%'}}/></i>}</button>
}
export function GlobalTaskCenter(){
 const[open,setOpen]=useState(openState);useEffect(()=>subscribeUi(setOpen),[]);if(!open)return null;return <TaskCenterModal/>
}
function TaskCenterModal(){
 const tasks=useTasks(),[filter,setFilter]=useState<'active'|'queued'|'completed'|'failed'|'attention'|'all'>('active');
 const rows=useMemo(()=>tasks.filter(t=>filter==='all'?true:filter==='active'?t.state==='RUNNING'||t.state==='QUEUED':filter==='queued'?t.state==='QUEUED':filter==='completed'?t.state==='SUCCEEDED'||t.state==='CANCELLED':filter==='failed'?t.state==='FAILED':t.state==='ATTENTION_REQUIRED'),[tasks,filter]);
 const counts={active:tasks.filter(t=>t.state==='RUNNING'||t.state==='QUEUED').length,queued:tasks.filter(t=>t.state==='QUEUED').length,completed:tasks.filter(t=>t.state==='SUCCEEDED'||t.state==='CANCELLED').length,failed:tasks.filter(t=>t.state==='FAILED').length,attention:tasks.filter(t=>t.state==='ATTENTION_REQUIRED').length};
 return <div className="modalBackdrop taskCenterBackdrop" onMouseDown={closeTaskCenter}><section className="taskCenterModal" onMouseDown={e=>e.stopPropagation()}>
  <div className="panelHead taskCenterHead"><div><small>GLOBAL TASK CENTER</small><h2>Задачи VYRON</h2><p>Очереди и прогресс не зависят от открытой страницы или канала. После перезапуска незавершённые remote-операции требуют безопасной сверки, а не слепого повтора.</p></div><button onClick={closeTaskCenter}>×</button></div>
  <div className="taskCenterTabs">
   <button className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>Активные {counts.active}</button>
   <button className={filter==='queued'?'active':''} onClick={()=>setFilter('queued')}>Очередь {counts.queued}</button>
   <button className={filter==='attention'?'active':''} onClick={()=>setFilter('attention')}>Внимание {counts.attention}</button>
   <button className={filter==='failed'?'active':''} onClick={()=>setFilter('failed')}>Ошибки {counts.failed}</button>
   <button className={filter==='completed'?'active':''} onClick={()=>setFilter('completed')}>Готово {counts.completed}</button>
   <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Все {tasks.length}</button>
  </div>
  <div className="taskCenterRows">{rows.length?rows.map(t=><article key={t.taskId} className={'taskCenterRow '+t.state.toLowerCase()}>
   <div className="taskIdentity"><small>{t.channelName||t.channelId||'VYRON'} • {taskTitle[t.type]}</small><b>{t.label}</b>{t.detail&&<span>{t.detail}</span>}</div>
   <div className="taskProgress">{t.progress!=null?<><div className="taskProgressBar"><i style={{width:t.progress+'%'}}/></div><div><b>{Math.round(t.progress)}%</b><span>{progressText(t)}</span></div></>:<div className="taskIndeterminate"><i/><span>{stateLabel[t.state]}</span></div>}{t.type==='UPLOAD'&&<small>{fmtSpeed(t.speedBps)}{t.etaSeconds!=null?' • ETA '+fmtEta(t.etaSeconds):''}</small>}</div>
   <div className="taskState"><b>{stateLabel[t.state]}</b><small>{new Date(t.updatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</small>{t.error&&<details><summary>Ошибка</summary><p>{t.error}</p></details>}</div>
  </article>):<div className="empty compactEmpty"><i>✓</i><h3>Здесь задач нет</h3><p>Текущий фильтр пуст.</p></div>}</div>
  <footer><button disabled={!counts.completed} onClick={clearCompletedTasks}>Очистить завершённые</button><button className="primary" onClick={closeTaskCenter}>Закрыть</button></footer>
 </section></div>
}
