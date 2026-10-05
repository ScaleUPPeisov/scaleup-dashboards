import React from 'react';
import type {Channel} from './types';

export type PublisherShellProps={
 channels:Pick<Channel,'id'|'name'>[];
 channelId:string;
 selectedCount:number;
 newCount:number;
 uploadedCount:number;
 processingCount:number;
 errorCount:number;
 folderReady:boolean;
 recoveryCount:number;
 onChannel:(id:string)=>void;
 onClear:()=>void;
 onFolders:()=>void;
 onRecovery:()=>void;
 onMetadata:()=>void;
 onThumbs:()=>void;
 onSchedule:()=>void;
 onCleanup:()=>void;
};

export const PublisherShell=React.memo(function PublisherShell(p:PublisherShellProps){
 const activeName=p.channels.find(c=>c.id===p.channelId)?.name||'Канал не выбран';
 const controls=[
  {key:'folders',label:p.folderReady?'Папки ✓':'Папки ⚠',hint:'Видео и проекты',onClick:p.onFolders},
  {key:'recovery',label:'Recovery'+(p.recoveryCount?' '+p.recoveryCount:''),hint:'Незавершённые загрузки',onClick:p.onRecovery},
  {key:'metadata',label:'Метаданные',hint:'Название, описание, теги',onClick:p.onMetadata},
  {key:'thumbs',label:'Обложки',hint:'Thumbnail mapping',onClick:p.onThumbs},
  {key:'schedule',label:'Расписание',hint:'Дата и время публикации',onClick:p.onSchedule},
  {key:'cleanup',label:'Очистка',hint:'Только подтверждённые файлы',onClick:p.onCleanup},
 ];
 return <>
  <div className="pageHeader publishMasterHead">
   <div>
    <small>YOUTUBE • ПУБЛИКАЦИЯ</small>
    <h2>Публикация на YouTube</h2>
    <p>{p.newCount} новых · {p.uploadedCount} на YouTube · {p.processingCount} обрабатываются · {p.errorCount} ошибок</p>
   </div>
   <div className="headerActions">
    <span className="publisherActiveChannel" title="Канал меняется в верхней панели">{activeName}</span>
    <button onClick={p.onClear}>Очистить черновик</button>
   </div>
  </div>
  <div className="publishToolbar publishDemandActions publisherPermanentControlDock" data-publisher-controls="always-visible">
   <span className="publisherSelectedCount"><b>{p.selectedCount}</b> выбрано</span>
   <div className="publisherPermanentControlGrid">
    {controls.map(control=><button key={control.key} data-publisher-control={control.key} onClick={control.onClick}><b>{control.label}</b><small>{control.hint}</small></button>)}
   </div>
  </div>
 </>;
});
