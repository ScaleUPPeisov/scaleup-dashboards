import React,{useEffect,useRef,useState} from 'react';
import {ModalPortal} from './ModalPortal';
import {clearNotificationHistory,readNotificationHistory,subscribeNotificationHistory,subscribeNotifications,type AppNotification,type NotificationHistoryItem,type NotificationType} from './notificationCenter';
import {createNotificationToastQueue} from './notificationToastQueue';

const LAST_SEEN_KEY='vyron:notification-last-seen:v1';
const levelLabel:Record<NotificationType,string>={error:'Ошибка',warning:'Внимание',success:'Готово',info:'Информация'};
function lastSeenValue(){try{return Number(localStorage.getItem(LAST_SEEN_KEY)||0)||0}catch{return 0}}
function projectCount(count:number){const last=count%10,lastTwo=count%100;return `${count} ${last===1&&lastTwo!==11?'проект':last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?'проекта':'проектов'}`}

function ToastCard({item,onClose}:{item:AppNotification;onClose:()=>void}){
  const timer=useRef<number|undefined>(undefined),remaining=useRef(item.durationMs??0),started=useRef(0);
  const start=()=>{if(item.durationMs===null||remaining.current<=0)return;started.current=Date.now();timer.current=window.setTimeout(onClose,remaining.current)};
  const pause=()=>{if(timer.current!==undefined){window.clearTimeout(timer.current);timer.current=undefined;remaining.current=Math.max(0,remaining.current-(Date.now()-started.current))}};
  useEffect(()=>{start();return()=>{if(timer.current!==undefined)window.clearTimeout(timer.current)}},[]);
  const grouped=(item.groupEntries||0)>1;
  const renderGroup=item.groupKey?.startsWith('render-safe-clean:')||item.groupKey?.startsWith('render-completed:');
  const title=grouped?(renderGroup?`Рендер готов: ${projectCount(item.groupCount!)}`:`${item.title} · ${item.groupCount}`):item.title;
  return <article className={`vyronNotice ${item.type}`} onMouseEnter={pause} onMouseLeave={start}>
    <i className="vyronNoticeIcon">{item.type==='success'?'✓':item.type==='warning'?'⚠':item.type==='error'?'✕':'ℹ'}</i>
    <div className="vyronNoticeText"><b>{title}</b>{grouped?<p>{item.groupLabel?`${item.groupLabel} • `:''}Подробности в истории уведомлений.</p>:item.message&&<p>{item.message}</p>}{item.actions.length>0&&<div className="vyronNoticeActions">{item.actions.map((a,i)=><button key={i} onClick={()=>{a.onClick();if(a.closeAfter!==false)onClose()}}>{a.label}</button>)}</div>}</div>
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
  const [visible,setVisible]=useState<AppNotification[]>([]),[waitingCount,setWaitingCount]=useState(0),[history,setHistory]=useState<NotificationHistoryItem[]>(()=>readNotificationHistory()),[historyOpen,setHistoryOpen]=useState(false),[lastSeen,setLastSeen]=useState(()=>lastSeenValue());
  const queue=useRef<ReturnType<typeof createNotificationToastQueue>|null>(null);
  useEffect(()=>{const current=createNotificationToastQueue((rows,count)=>{setVisible(rows);setWaitingCount(count)});queue.current=current;const off=subscribeNotifications(current.enqueue);return()=>{off();current.dispose();if(queue.current===current)queue.current=null}},[]);
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;let pending:NotificationHistoryItem[]|undefined;const off=subscribeNotificationHistory(rows=>{pending=rows;if(timer!==undefined)return;timer=setTimeout(()=>{timer=undefined;if(pending)setHistory(pending)},100)});return()=>{off();if(timer!==undefined)clearTimeout(timer)}},[]);
  const close=(id:string)=>queue.current?.close(id);
  const unread=history.filter(x=>x.createdAt>lastSeen).length;
  const openHistory=()=>{const now=Date.now();setLastSeen(now);setHistory(readNotificationHistory());try{localStorage.setItem(LAST_SEEN_KEY,String(now))}catch{}setHistoryOpen(true)};
  return <>
   <button className="notificationBellButton" onClick={openHistory} aria-label="Уведомления" title="Уведомления"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9"/><path d="M10 20h4"/></svg>{unread>0&&<b>{unread>99?'99+':unread}</b>}</button>
   <aside className="vyronNotificationCenter" aria-live="polite">{visible.map(x=><ToastCard key={x.id} item={x} onClose={()=>close(x.id)}/>)}{waitingCount>0&&<button type="button" onClick={openHistory}>Ещё уведомлений: {waitingCount} · Открыть историю</button>}</aside>
   {historyOpen&&<ModalPortal onClose={()=>setHistoryOpen(false)}><section className="confirmModal notificationHistoryModal" onMouseDown={e=>e.stopPropagation()}>
    <div className="panelHead"><div><h2>Уведомления</h2></div><button onClick={()=>setHistoryOpen(false)} aria-label="Закрыть">×</button></div>
    <div className="notificationHistoryLegend"><span>Ошибка</span><span>Внимание</span><span>Готово</span><span>Информация</span></div>
    <div className="notificationHistoryRows">{history.length?history.map(x=><HistoryRow key={x.id} item={x}/>):<div className="empty compactEmpty"><h3>Уведомлений пока нет</h3><p>Здесь появятся ошибки, предупреждения и значимые успешные операции.</p></div>}</div>
    <footer><button disabled={!history.length} onClick={()=>{clearNotificationHistory();setHistory([])}}>Очистить историю</button><button className="primary" onClick={()=>setHistoryOpen(false)}>Закрыть</button></footer>
   </section></ModalPortal>}
  </>
}
