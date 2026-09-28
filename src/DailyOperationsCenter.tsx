import React,{useMemo,useState} from 'react';
import {useApp} from './store';
import type {ChannelInventorySnapshot} from './renderInventoryRuntime';
import {buildDailyOperations} from './dailyOperations';
import {ownerInventoryForChannel} from './youtubeOwnerInventory';
import {saveActivePublishChannel} from './publishWorkspaceState';

type Filter='ALL'|'UNPROCESSED'|'PROCESSED'|'EMPTY'|'NO_FOLDER'|'ERRORS';

const time=(iso?:string)=>iso?new Date(iso).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'—';
const date=(iso?:string)=>iso?new Date(iso).toLocaleDateString('ru-RU'):'—';

export function DailyOperationsCenter({snapshots,onChooseRender}:{snapshots:Record<string,ChannelInventorySnapshot>;onChooseRender:(channelId:string)=>void}){
  const channels=useApp(s=>s.channels),history=useApp(s=>s.uploadHistory),updateChannel=useApp(s=>s.updateChannel),setPage=useApp(s=>s.setPage);
  const [filter,setFilter]=useState<Filter>('ALL'),[detailChannel,setDetailChannel]=useState<string>();
  const summary=useMemo(()=>buildDailyOperations(channels,history,snapshots,new Date()),[channels,history,snapshots]);
  const rows=useMemo(()=>summary.rows.filter(row=>{
    if(filter==='UNPROCESSED')return !row.processedToday;
    if(filter==='PROCESSED')return row.processedToday;
    if(filter==='EMPTY')return row.folderState==='AVAILABLE'&&row.localReady===0;
    if(filter==='NO_FOLDER')return row.folderState==='NOT_CONFIGURED';
    if(filter==='ERRORS')return row.folderState==='ERROR'||row.folderState==='UNAVAILABLE';
    return true
  }),[summary,filter]);
  const detail=summary.rows.find(x=>x.channelId===detailChannel);
  const openUpload=(channelId:string)=>{saveActivePublishChannel(channelId);setPage('publisher')};
  const setTarget=(channelId:string,value:string)=>{
    const n=Number(value);
    updateChannel(channelId,{dailyUploadTarget:Number.isFinite(n)&&n>0?Math.floor(n):undefined});
    void useApp.getState().persist().catch(()=>{});
  };
  const act=(row:(typeof summary.rows)[number])=>{
    if(row.folderState==='NOT_CONFIGURED')return onChooseRender(row.channelId);
    if(row.folderState==='UNAVAILABLE'||row.folderState==='ERROR')return onChooseRender(row.channelId);
    if(row.localReady===0)return onChooseRender(row.channelId);
    openUpload(row.channelId)
  };
  return <section className="panel dailyOpsCenter">
    <div className="panelHead dailyOpsHead">
      <div><small>СЕГОДНЯ • LOCAL FACTS • 0 YOUTUBE API</small><h3>Ежедневная работа</h3><p>Здесь видно, что VYRON реально загрузил сегодня, какие каналы уже обработаны и что делать дальше.</p></div>
      <span>{summary.processedChannels} / {summary.rows.length} каналов</span>
    </div>
    <div className="dailyOpsKpis">
      <span><small>ЗАГРУЖЕНО</small><b>{summary.uploadedToday}</b></span>
      <span><small>ОБРАБОТАНО</small><b>{summary.processedChannels} / {summary.rows.length}</b></span>
      <span><small>НЕ ОБРАБОТАНО</small><b>{summary.unprocessedChannels}</b></span>
      <span><small>ЛОКАЛЬНО ГОТОВО</small><b>{summary.localReady}</b></span>
      <span><small>ПУСТЫХ</small><b>{summary.emptyChannels}</b></span>
      <span><small>ОШИБОК / НЕДОСТУПНО</small><b>{summary.errors}</b></span>
      <span><small>ПОСЛЕДНЯЯ ЗАГРУЗКА</small><b>{time(summary.lastUploadAt)}</b></span>
    </div>
    <div className="dailyOpsFilters">
      {([
        ['ALL','Все '+summary.rows.length],
        ['UNPROCESSED','Не обработано '+summary.unprocessedChannels],
        ['PROCESSED','Обработано '+summary.processedChannels],
        ['EMPTY','Нет видео '+summary.emptyChannels],
        ['NO_FOLDER','Нет папки '+summary.rows.filter(x=>x.folderState==='NOT_CONFIGURED').length],
        ['ERRORS','Ошибки '+summary.errors]
      ] as Array<[Filter,string]>).map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}
    </div>
    <div className="dailyOpsTable">
      <div className="dailyOpsRow head"><span>Канал</span><span>Сегодня / цель</span><span>Локально</span><span>Запас</span><span>YouTube до</span><span>Последняя</span><span>Следующее действие</span></div>
      {rows.map(row=>{
        const yt=ownerInventoryForChannel(row.channelId);
        return <div className={'dailyOpsRow '+(row.processedToday?'processed':'pending')} key={row.channelId}>
          <span><b>{row.channelName}</b><small>{row.processedToday?'✓ обработан сегодня':'ещё не обработан'}</small></span>
          <span className="dailyToday" role="button" tabIndex={0} onClick={()=>row.uploadedToday&&setDetailChannel(row.channelId)} onKeyDown={e=>{if(e.key==='Enter'&&row.uploadedToday)setDetailChannel(row.channelId)}}>
            <b>{row.uploadedToday}{row.dailyTarget!==undefined?' / '+row.dailyTarget:''}</b>
            <select aria-label={'Дневная цель '+row.channelName} value={row.dailyTarget||0} onChange={e=>setTarget(row.channelId,e.target.value)} onClick={e=>e.stopPropagation()}>
              <option value="0">Без цели</option><option value="1">1/день</option><option value="5">5/день</option><option value="10">10/день</option>
            </select>
          </span>
          <span><b>{row.localReady==null?'—':row.localReady}</b><small>{row.folderState==='UNAVAILABLE'?'последний подтверждённый запас':row.folderState==='NOT_CONFIGURED'?'Render не выбран':'готово к загрузке'}</small></span>
          <span><b>{row.runwayDays==null?'Нет данных':row.runwayDays+' дн.'}</b></span>
          <span><b>{yt.available&&yt.lastScheduledAt?date(yt.lastScheduledAt):'Нет данных'}</b><small>{yt.available?(yt.complete?'cached complete':'cached partial'):'нет cached YouTube snapshot'}</small></span>
          <span><b>{time(row.lastUploadAt)}</b></span>
          <span className="dailyAction"><b>{row.nextAction}</b>{row.nextAction!=='Не требуется'&&<button className="mini" onClick={()=>act(row)}>Открыть</button>}</span>
        </div>
      })}
      {!rows.length&&<div className="dailyOpsEmpty">По этому фильтру каналов нет.</div>}
    </div>
    {detail&&<div className="dailyOpsDetail">
      <header><div><small>ЗАГРУЖЕНО СЕГОДНЯ</small><h4>{detail.channelName}</h4></div><button onClick={()=>setDetailChannel(undefined)}>×</button></header>
      <div>{detail.events.map(event=><article key={event.id}><time>{time(event.uploadedAt)}</time><b>{event.originalFilename||event.localFilePath.split(/[\\/]/).at(-1)||event.jobId}</b><span>✓ загружено</span><small>{event.publishAt?'Публикация: '+new Date(event.publishAt).toLocaleString('ru-RU'):''}</small></article>)}</div>
      <footer><b>Итого: {detail.uploadedToday} успешно загружено</b><span>Локально осталось: {detail.localReady==null?'—':detail.localReady}</span></footer>
    </div>}
  </section>
}
