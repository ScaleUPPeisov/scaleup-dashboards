import React,{useEffect,useRef,useState} from 'react';
import {ModalPortal} from './ModalPortal';
import {clearNotificationHistory,readNotificationHistory,subscribeNotificationHistory,subscribeNotifications,type AppNotification,type NotificationHistoryItem,type NotificationType} from './notificationCenter';

const MAX_VISIBLE=4;
const LAST_SEEN_KEY='vyron:notification-last-seen:v1';
const levelLabel:Record<NotificationType,string>={error:'CRITICAL',warning:'WARNING',success:'SUCCESS',info:'INFO'};
function lastSeenValue(){try{return Number(localStorage.getItem(LAST_SEEN_KEY)||0)||0}catch{return 0}}

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

function HistoryRow({item}:{item:NotificationHistoryItem}){
 return <article className={`notificationHistoryRow ${item.type}`}>
  <span className="notificationHistoryLevel">{levelLabel[item.type]}</span>
  <div><b>{item.title}</b>{item.message&&<p>{item.message}</p>}<small>{new Date(item.createdAt).toLocaleString('ru-RU')}</small></div>
 </article>
}

export function NotificationCenter(){
  const [visible,setVisible]=useState<AppNotification[]>([]),[history,setHistory]=useState<NotificationHistoryItem[]>(()=>readNotificationHistory()),[historyOpen,setHistoryOpen]=useState(false),[lastSeen,setLastSeen]=useState(()=>lastSeenValue());
  const queue=useRef<AppNotification[]>([]);
  const fill=(rows:AppNotification[])=>{const next=[...rows];while(next.length<MAX_VISIBLE&&queue.current.length)next.push(queue.current.shift()!);return next};
  useEffect(()=>subscribeNotifications(n=>setVisible(rows=>{if(n.operationId){const index=rows.findIndex(x=>x.operationId===n.operationId);if(index>=0){const next=[...rows];next[index]=n;return next}const queued=queue.current.findIndex(x=>x.operationId===n.operationId);if(queued>=0){queue.current[queued]=n;return rows}}if(rows.length<MAX_VISIBLE)return[...rows,n];queue.current.push(n);return rows})),[]);
  useEffect(()=>subscribeNotificationHistory(setHistory),[]);
  const close=(id:string)=>setVisible(rows=>fill(rows.filter(x=>x.id!==id)));
  const unread=history.filter(x=>x.createdAt>lastSeen).length;
  const openHistory=()=>{const now=Date.now();setLastSeen(now);try{localStorage.setItem(LAST_SEEN_KEY,String(now))}catch{}setHistoryOpen(true)};
  return <>
   <button className="notificationBellButton" onClick={openHistory} aria-label="Notification Center" title="Notification Center"><span>🔔</span>{unread>0&&<b>{unread>99?'99+':unread}</b>}</button>
   <aside className="vyronNotificationCenter" aria-live="polite">{visible.map(x=><ToastCard key={x.id} item={x} onClose={()=>close(x.id)}/>)}</aside>
   {historyOpen&&<ModalPortal onClose={()=>setHistoryOpen(false)}><section className="confirmModal notificationHistoryModal" onMouseDown={e=>e.stopPropagation()}>
    <div className="panelHead"><div><small>NOTIFICATION CENTER</small><h2>Уведомления VYRON</h2><p>Только полезные события. Фоновые API-запросы сами по себе уведомления не создают.</p></div><button onClick={()=>setHistoryOpen(false)}>×</button></div>
    <div className="notificationHistoryLegend"><span>CRITICAL</span><span>WARNING</span><span>SUCCESS</span><span>INFO</span></div>
    <div className="notificationHistoryRows">{history.length?history.map(x=><HistoryRow key={x.id} item={x}/>):<div className="empty compactEmpty"><h3>Уведомлений пока нет</h3><p>Здесь появятся ошибки, предупреждения и значимые успешные операции.</p></div>}</div>
    <footer><button disabled={!history.length} onClick={()=>{clearNotificationHistory();setHistory([])}}>Очистить историю</button><button className="primary" onClick={()=>setHistoryOpen(false)}>Закрыть</button></footer>
   </section></ModalPortal>}
  </>
}
