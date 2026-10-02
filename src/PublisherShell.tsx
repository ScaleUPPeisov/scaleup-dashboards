import React from 'react';
import {YoutubePaintProfiler} from './youtubePaintDiagnosticRuntime';
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
 return <YoutubePaintProfiler id="PublisherShell"><>
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
  <div className="publishToolbar publishDemandActions">
   <span><b>{p.selectedCount}</b> выбрано</span>
   <button onClick={p.onFolders}>{p.folderReady?'Папки ✓':'Папки ⚠'}</button>
   <button onClick={p.onRecovery}>{'Recovery'+(p.recoveryCount?' '+p.recoveryCount:'')}</button>
   <button onClick={p.onMetadata}>Метаданные</button>
   <button onClick={p.onThumbs}>Обложки</button>
   <button onClick={p.onSchedule}>Расписание</button>
   <button onClick={p.onCleanup}>Очистка</button>
  </div>
 </></YoutubePaintProfiler>;
});
