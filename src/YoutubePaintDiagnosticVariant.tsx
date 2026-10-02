import React from 'react';
import {useApp} from './store';
import {YouTubeChannelBar} from './YouTubeChannelBar';
import {PublisherShell} from './PublisherShell';
import {PublisherVideoPicker} from './PublisherVideoPicker';
import {EMPTY_PUBLISHER_DERIVED,usePublisherDerived} from './publisherDerivedRuntime';
import {YoutubePaintProfiler,type YoutubePaintVariant} from './youtubePaintDiagnosticRuntime';

const noOp=()=>{};
function HeaderTabs(){
 const tabs=['Публикация','Метаданные','Расписание','Загруженные','Командный центр','План каналов','Статистика','История','Аккаунты'];
 return <><div className="youtubeCenterHead"><div><small>VYRON • YOUTUBE</small><h1>YouTube</h1><p>Публикация, метаданные, расписание и управление каналом в одном рабочем пространстве.</p></div><button className="compact">Квота</button></div><div className="youtubeTabs youtubeMasterTabs">{tabs.map((x,i)=><button key={x} className={i===0?'active':''}>{x}</button>)}</div></>
}
function ExtraSelect(){
 const channels=useApp(s=>s.channels);
 return <div className="headerActions youtubePaintExtraSelect"><select defaultValue={channels[0]?.id}>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
}
export function YoutubePaintDiagnosticVariant({variant}:{variant:YoutubePaintVariant}){
 const channels=useApp(s=>s.channels),channelId=channels[0]?.id||'',channel=channels[0];
 const derived=usePublisherDerived(s=>s.byChannel[channelId]||EMPTY_PUBLISHER_DERIVED);
 const rows=variant==='picker6'?6:variant==='picker12'?12:variant==='picker24'?24:0;
 const pickerJobs=derived.jobs.slice(0,rows);
 const pickerFacts=new Map([...derived.rowFactsById].filter(([id])=>pickerJobs.some(j=>j.id===id)));
 const ids=new Set(pickerJobs.map(j=>j.id));
 const showBar=!['shell'].includes(variant);
 const showShell=['publisher-shell','picker0','picker6','picker12','picker24'].includes(variant);
 const showPicker=['picker0','picker6','picker12','picker24'].includes(variant);
 const selectMode=variant==='select1'||variant==='select2';
 return <div className="youtubePaintVariantRoot">
  <HeaderTabs/>
  {showBar&&<YoutubePaintProfiler id="ChannelBar"><YouTubeChannelBar active/></YoutubePaintProfiler>}
  {selectMode&&variant==='select2'&&<ExtraSelect/>}
  {!selectMode&&variant!=='channelbar'&&variant!=='shell'&&<div className="youtubeChannelContext">
   {showShell&&<YoutubePaintProfiler id="PublisherShell"><PublisherShell channels={channels} channelId={channelId} selectedCount={0} newCount={rows} uploadedCount={0} processingCount={0} errorCount={0} folderReady={Boolean(channel?.renderFolderPath)} recoveryCount={0} onChannel={noOp} onClear={noOp} onFolders={noOp} onRecovery={noOp} onMetadata={noOp} onThumbs={noOp} onSchedule={noOp} onCleanup={noOp}/></YoutubePaintProfiler>}
   {showPicker&&<YoutubePaintProfiler id="PublisherVideoPicker"><PublisherVideoPicker jobs={pickerJobs} selectedIds={[]} selectableIds={ids} busy={false} rowFacts={pickerFacts} recoveryIds={new Set()} windowKey={'diag:'+variant} onToggle={noOp} onRemove={noOp} onClearRemoteMissing={noOp}/></YoutubePaintProfiler>}
  </div>}
 </div>
}
