import React,{useEffect,useState} from 'react';
import type {UploadHistoryRecord,VideoJob} from './types';
import {baseName} from './publishCenterCore';
import {classifyUploadState,latestUploadRecord,type CanonicalUploadState} from './storageLifecycle';

export type PublisherVideoPickerProps={
 jobs:VideoJob[];
 selectedIds:string[];
 selectableIds:Set<string>;
 busy:boolean;
 states:Map<string,CanonicalUploadState>;
 history:UploadHistoryRecord[];
 recoveryIds:Set<string>;
 windowKey:string;
 onToggle:(id:string)=>void;
 onRemove:(job:VideoJob)=>void;
 onClearRemoteMissing:(job:VideoJob)=>void;
};

export const PublisherVideoPicker=React.memo(function PublisherVideoPicker(p:PublisherVideoPickerProps){
 const [limit,setLimit]=useState(24);
 useEffect(()=>setLimit(24),[p.windowKey]);
 const rows=p.jobs.slice(0,limit);
 if(!p.jobs.length)return <div className="publishVideoRows"><p>Для выбранного фильтра видео нет.</p></div>;
 return <>
  <div className="publishVideoRows">
   {rows.map(j=>{
    const st=p.states.get(j.id)||classifyUploadState(j,p.history);
    const proof=latestUploadRecord(p.history,j.id);
    const videoId=j.youtubeVideoId||proof?.youtubeVideoId;
    const recovery=p.recoveryIds.has(j.id);
    const fresh=p.selectableIds.has(j.id);
    const disabledReason=recovery?'Старая запись сканирования — требуется проверка':st==='READY'?'Уже загружено на YouTube':st==='UPLOAD_ACCEPTED'?'YouTube уже принял видео':st==='YOUTUBE_PROCESSING'?'Видео обрабатывается YouTube':st==='VERIFY_REQUIRED'?'Историческая запись — не текущий физический файл':st==='REMOTE_MISSING'?'Связь YouTube требует проверки':st==='UPLOAD_FAILED'||st==='PROCESSING_FAILED'||st==='REJECTED'?'Ошибка — откройте действия':!j.finalPath?'Файл не найден':'Недоступно для новой загрузки';
    const label=recovery?'НЕВЕРНАЯ ПРИВЯЗКА':st==='NEW'?'НОВОЕ':st==='UPLOAD_ACCEPTED'?'НА YOUTUBE':st==='READY'?'READY':st==='YOUTUBE_PROCESSING'?'ОБРАБОТКА YOUTUBE':st==='VERIFY_REQUIRED'?'ИСТОРИЯ':st==='REMOTE_MISSING'?'YOUTUBE: НЕ НАЙДЕНО':st;
    return <div key={j.id} className={'publishVideoRow '+(p.selectedIds.includes(j.id)?'selected ':'')+(!fresh?'uploaded':'')}>
     <label className="publishVideoSelect">
      <input type="checkbox" disabled={!fresh||p.busy} checked={fresh&&p.selectedIds.includes(j.id)} onChange={()=>fresh&&p.onToggle(j.id)}/>
      <span>
       <b>{'VIDEO_'+String(j.number).padStart(3,'0')}</b>
       <small>{baseName(j.finalPath||'')+' • '+label+(videoId?' • YouTube ID: '+videoId:'')+(proof?.uploadedAt?' • '+new Date(proof.uploadedAt).toLocaleDateString('ru-RU'):'')+(!fresh?' • '+disabledReason:'')}</small>
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
