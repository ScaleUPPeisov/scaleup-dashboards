import React,{useEffect,useRef,useState} from 'react';
import type {VideoJob} from './types';
import {baseName} from './publishCenterCore';
import type {PublisherVideoRowFact} from './publisherDerivedRuntime';
import {recordYoutubeRouteEvent} from './youtubeRouteDiagnostics';

export type PublisherVideoPickerProps={
 jobs:VideoJob[];
 selectedIds:string[];
 selectableIds:Set<string>;
 busy:boolean;
 rowFacts:Map<string,PublisherVideoRowFact>;
 recoveryIds:Set<string>;
 windowKey:string;
 onToggle:(id:string)=>void;
 onRemove:(job:VideoJob)=>void;
 onClearRemoteMissing:(job:VideoJob)=>void;
};

export const PublisherVideoPicker=React.memo(function PublisherVideoPicker(p:PublisherVideoPickerProps){
 const [limit,setLimit]=useState(24),previousWindowKey=useRef(p.windowKey);
 useEffect(()=>{
  if(previousWindowKey.current===p.windowKey)return;
  previousWindowKey.current=p.windowKey;
  if(limit!==24){recordYoutubeRouteEvent('PublisherVideoPicker','limit-reset');setLimit(24)}
 },[p.windowKey,limit]);
 const rows=p.jobs.slice(0,limit);
 if(!p.jobs.length)return <div className="publishVideoRows"><p>Для выбранного фильтра видео нет.</p></div>;
 return <>
  <div className="publishVideoRows">
   {rows.map(j=>{
    const fact=p.rowFacts.get(j.id),st=fact?.state||'VERIFY_REQUIRED';
    const videoId=j.youtubeVideoId||fact?.latestYoutubeVideoId;
    const recovery=p.recoveryIds.has(j.id);
    const fresh=fact?.selectable??p.selectableIds.has(j.id);
    const disabledReason=recovery?'Старая запись сканирования — требуется проверка':st==='READY'?'Уже загружено на YouTube':st==='UPLOAD_ACCEPTED'?'YouTube уже принял видео':st==='YOUTUBE_PROCESSING'?'Видео обрабатывается YouTube':st==='VERIFY_REQUIRED'?'Историческая запись — не текущий физический файл':st==='REMOTE_MISSING'?'Связь YouTube требует проверки':st==='UPLOAD_FAILED'||st==='PROCESSING_FAILED'||st==='REJECTED'?'Ошибка — откройте действия':!j.finalPath?'Файл не найден':'Недоступно для новой загрузки';
    const label=recovery?'НЕВЕРНАЯ ПРИВЯЗКА':st==='NEW'?'НОВОЕ':st==='UPLOAD_ACCEPTED'?'НА YOUTUBE':st==='READY'?'READY':st==='YOUTUBE_PROCESSING'?'ОБРАБОТКА YOUTUBE':st==='VERIFY_REQUIRED'?'ИСТОРИЯ':st==='REMOTE_MISSING'?'YOUTUBE: НЕ НАЙДЕНО':st;
    return <div key={j.id} className={'publishVideoRow '+(p.selectedIds.includes(j.id)?'selected ':'')+(!fresh?'uploaded':'')}>
     <label className="publishVideoSelect">
      <input type="checkbox" disabled={!fresh||p.busy} checked={fresh&&p.selectedIds.includes(j.id)} onChange={()=>fresh&&p.onToggle(j.id)}/>
      <span>
       <b>{'VIDEO_'+String(j.number).padStart(3,'0')}</b>
       <small>{baseName(j.finalPath||'')+' • '+label+(videoId?' • YouTube ID: '+videoId:'')+(fact?.latestUploadedAt?' • '+new Date(fact.latestUploadedAt).toLocaleDateString('ru-RU'):'')+(!fresh?' • '+disabledReason:'')}</small>
      </span>
      {j.uploadProgress!=null&&j.status==='UPLOADING'&&<em>{j.uploadProgress.toFixed(0)}%</em>}
     </label>
     {st==='REMOTE_MISSING'&&<button className="mini" disabled={p.busy} onClick={()=>p.onClearRemoteMissing(j)}>Очистить связь</button>}
     <button className="mini" disabled={p.busy||j.status==='UPLOADING'} onClick={()=>p.onRemove(j)}>Действия</button>
    </div>
   })}
  </div>
  {p.jobs.length>limit&&<button className="compact publisherMoreRows" onClick={()=>setLimit(x=>Math.min(p.jobs.length,x+24))}>{'Показать ещё ('+(p.jobs.length-limit)+')'}</button>}
 </>;
});
