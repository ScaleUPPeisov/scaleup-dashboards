import React,{useEffect,useRef,useState} from 'react';
import {subscribeNotifications,type AppNotification} from './notificationCenter';
const MAX_VISIBLE=4;
function ToastCard({item,onClose}:{item:AppNotification;onClose:()=>void}){
  const timer=useRef<number|undefined>(undefined),remaining=useRef(item.durationMs??0),started=useRef(0);
  const start=()=>{if(item.durationMs===null||remaining.current<=0)return;started.current=Date.now();timer.current=window.setTimeout(onClose,remaining.current)};
  const pause=()=>{if(timer.current!==undefined){window.clearTimeout(timer.current);timer.current=undefined;remaining.current=Math.max(0,remaining.current-(Date.now()-started.current))}};
  useEffect(()=>{start();return()=>{if(timer.current!==undefined)window.clearTimeout(timer.current)}},[]);
  return <article className={`vyronNotice ${item.type}`} onMouseEnter={pause} onMouseLeave={start}>
    <i className="vyronNoticeIcon">{item.type==='success'?'✓':item.type==='warning'?'⚠':item.type==='error'?'✕':'ℹ'}</i>
    <div className="vyronNoticeText"><b>{item.title}</b>{item.message&&<p>{item.message}</p>}{item.actions.length>0&&<div className="vyronNoticeActions">{item.actions.map((a,i)=><button key={i} onClick={()=>{a.onClick();if(a.closeAfter!==false)onClose()}}>{a.label}</button>)}</div>}</div>
    <button className="vyronNoticeClose" onClick={onClose} aria-label="Закрыть">×</button>
  </article>
}
export function NotificationCenter(){
  const [visible,setVisible]=useState<AppNotification[]>([]);const queue=useRef<AppNotification[]>([]);
  const fill=(rows:AppNotification[])=>{const next=[...rows];while(next.length<MAX_VISIBLE&&queue.current.length)next.push(queue.current.shift()!);return next};
  useEffect(()=>subscribeNotifications(n=>setVisible(rows=>{if(rows.some(x=>x.operationId&&x.operationId===n.operationId))return rows;if(rows.length<MAX_VISIBLE)return[...rows,n];queue.current.push(n);return rows})),[]);
  const close=(id:string)=>setVisible(rows=>fill(rows.filter(x=>x.id!==id)));
  return <aside className="vyronNotificationCenter" aria-live="polite">{visible.map(x=><ToastCard key={x.id} item={x} onClose={()=>close(x.id)}/>)}</aside>
}
