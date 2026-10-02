import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api';
import type {ImportedMetadata} from './metadata';
import {metadataQueueInput,metadataQueueLowStockThreshold,type MetadataQueuePage,type MetadataQueueSummary} from './metadataQueue';
import {notifyError,notifyInfo,notifySuccess} from './notificationCenter';
import {notifyMetadataQueueChanged} from './MetadataQueueAssignmentBridge';

const PAGE_SIZE=50;

export function MetadataQueuePanel({channelId,channelName,dailyTarget,rows,sourceName,sourceHash}:{channelId:string;channelName:string;dailyTarget?:number;rows:ImportedMetadata[];sourceName:string;sourceHash:string}){
  const [summary,setSummary]=useState<MetadataQueueSummary|null>(null);
  const [page,setPage]=useState<MetadataQueuePage|null>(null);
  const [offset,setOffset]=useState(0);
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [offerCleanup,setOfferCleanup]=useState(()=>{try{return localStorage.getItem('vyron:metadata-queue:offer-cleanup:v1')!=='0'}catch{return true}});

  const refresh=useCallback(async(nextOffset=offset,nextStatus=status)=>{
    if(!channelId)return;
    const [s,p]=await Promise.all([
      api.metadataQueueSummary(channelId,channelName),
      api.metadataQueuePage(channelId,channelName,nextOffset,PAGE_SIZE,nextStatus||undefined),
    ]);
    setSummary(s);setPage(p);
  },[channelId,channelName,offset,status]);

  const refreshChannelRef=useRef(''),refreshKeyRef=useRef('');
  useEffect(()=>{
    if(!channelId)return;
    const channelChanged=refreshChannelRef.current!==channelId;
    if(channelChanged){refreshChannelRef.current=channelId;if(offset!==0)setOffset(0)}
    const nextOffset=channelChanged?0:offset,key=channelId+'|'+nextOffset+'|'+status;
    if(refreshKeyRef.current===key)return;
    refreshKeyRef.current=key;
    void refresh(nextOffset,status).catch(()=>{setSummary(null);setPage(null)})
  },[channelId,offset,status,refresh]);

  const threshold=metadataQueueLowStockThreshold(dailyTarget);
  const low=Boolean(summary&&summary.available>0&&summary.available<=threshold);
  const empty=Boolean(summary&&summary.activeTotal>0&&summary.available===0&&summary.reserved===0&&summary.applying===0&&summary.error===0);
  const pages=page?Math.max(1,Math.ceil(page.totalMatching/PAGE_SIZE)):1,currentPage=Math.floor(offset/PAGE_SIZE)+1;
  const sourceLabel=sourceName||rows[0]?.source||'metadata-import';

  async function importCurrent(){
    if(!channelId||!rows.length)return;
    setBusy(true);
    try{
      const result=await api.metadataQueueImport(channelId,channelName,sourceLabel,sourceHash,rows.map(metadataQueueInput));
      setSummary(result.summary);setOffset(0);setStatus('');notifyMetadataQueueChanged();
      await refresh(0,'');
      if(result.duplicate)notifyInfo('Этот SEO Pack уже импортирован','Existing: '+result.existing+' • New: 0');
      else notifySuccess('SEO Queue пополнена','Добавлено '+result.added+' metadata records • '+channelName);
    }catch(e){notifyError('Не удалось импортировать SEO Queue',String(e))}
    finally{setBusy(false)}
  }

  async function purge(packId:string){
    if(!window.confirm('Удалить использованный payload этого SEO Pack? Компактный ledger с record hash / jobId / YouTube ID останется. Исходный DOCX вне VYRON не удаляется.'))return;
    setBusy(true);
    try{
      const s=await api.metadataQueuePurgePack(channelId,packId);setSummary(s);notifyMetadataQueueChanged();await refresh(0,status);notifySuccess('Использованный SEO Pack очищен','Payload перемещён в Корзину. Compact ledger сохранён.')
    }catch(e){notifyError('Не удалось очистить SEO Pack',String(e))}
    finally{setBusy(false)}
  }

  const rowsShown=page?.rows||[];
  const nextLabel=summary?.nextSequence?'#'+summary.nextSequence:'—';
  return <section className="panel metadataQueuePanel">
    <div className="panelHead"><div><small>SEO QUEUE • ПОСТОЯННОЕ ХРАНИЛИЩЕ</small><h3>Metadata Queue</h3><p>{channelName||channelId} • очередь хранится на диске и не зависит от текущего черновика.</p></div><button className="primary" disabled={busy||!rows.length} onClick={()=>void importCurrent()}>{busy?'РАБОТАЮ…':'ИМПОРТИРОВАТЬ В SEO QUEUE'}</button></div>
    <div className="metadataQueueFacts">
      <span><small>Всего</small><b>{summary?.activeTotal??0}</b></span>
      <span><small>Доступно</small><b>{summary?.available??0}</b></span>
      <span><small>Зарезервировано</small><b>{(summary?.reserved??0)+(summary?.applying??0)}</b></span>
      <span><small>Использовано</small><b>{summary?.applied??0}</b></span>
      <span><small>Ошибки</small><b>{summary?.error??0}</b></span>
      <span><small>Следующая запись</small><b>{nextLabel}</b></span>
    </div>
    <div className="metadataQueueImportHint"><b>Текущий источник: {sourceLabel}</b><span>{rows.length?String(rows.length)+' распознанных записей готовы к импорту. Лимита 50/100/1000 нет.':'Сначала загрузите DOCX / JSON / TXT / CSV или разберите текст GPT.'}</span></div>
    {low&&<div className="publishCheck warn"><b>⚠ METADATA QUEUE • осталось {summary?.available}</b><span>При текущем темпе скоро потребуются новые metadata. Порог предупреждения: {threshold}.</span></div>}
    {empty&&<div className="publishCheck good"><b>SEO PACK ПОЛНОСТЬЮ ИСПОЛЬЗОВАН</b><span>AVAILABLE 0 • RESERVED 0 • ERROR 0. Старые payload можно очистить.</span></div>}
    {offerCleanup&&Boolean(summary?.completePackIds.length)&&<div className="metadataQueueCleanup"><div><b>Использованные pack: {summary!.completePackIds.length}</b><span>Удаляется только payload внутри VYRON; ledger остаётся.</span></div><button className="danger" disabled={busy} onClick={()=>void purge(summary!.completePackIds[0])}>УДАЛИТЬ ИСПОЛЬЗОВАННЫЙ PACK</button><button disabled={busy} onClick={()=>notifyInfo('Pack оставлен','Данные не удалены.')}>ОСТАВИТЬ</button></div>}
    <label className="checkLine"><input type="checkbox" checked={offerCleanup} onChange={e=>{setOfferCleanup(e.target.checked);try{localStorage.setItem('vyron:metadata-queue:offer-cleanup:v1',e.target.checked?'1':'0')}catch{}}}/>Предлагать очистку после полного использования</label>
    <div className="metadataQueueToolbar"><label>Статус<select value={status} onChange={e=>{setOffset(0);setStatus(e.target.value)}}><option value="">Все активные</option><option value="AVAILABLE">AVAILABLE</option><option value="RESERVED">RESERVED</option><option value="APPLYING">APPLYING</option><option value="APPLIED">APPLIED</option><option value="ERROR">ERROR</option></select></label><span>Страница {currentPage} / {pages} • показано {rowsShown.length} из {page?.totalMatching??0}</span><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-PAGE_SIZE))}>←</button><button disabled={!page||offset+PAGE_SIZE>=page.totalMatching} onClick={()=>setOffset(offset+PAGE_SIZE)}>→</button></div>
    <div className="metadataQueueRows">{rowsShown.map(r=><div key={r.id} className="metadataQueueRow"><span><b>#{r.sequence} • {r.status}</b><small>{r.packId}</small></span><strong>{r.title||'Название не задано'}</strong><em>{r.reservedVideoNumber?'VIDEO_'+String(r.reservedVideoNumber).padStart(3,'0'):r.sourceNumber?'source #'+r.sourceNumber:'—'}</em></div>)}</div>
  </section>
}
