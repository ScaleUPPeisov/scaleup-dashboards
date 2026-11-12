import React,{useMemo,useState} from 'react';
import {useApp} from './store';
import type {ActivityEvent} from './types';

// This is the local VYRON-wide activity journal, not YouTube history.
// No OAuth, API requests or filesystem scans are triggered by opening it.
export function HistoryPage(){
  const events=useApp(s=>s.activityJournal);
  const channels=useApp(s=>s.channels);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const [channelId,setChannelId]=useState('all');
  const [oldestFirst,setOldestFirst]=useState(false);
  const [limit,setLimit]=useState(100);
  const channelNames=useMemo(()=>new Map(channels.map(c=>[c.id,c.name])),[channels]);
  const filtered=useMemo(()=>{
    const search=query.trim().toLocaleLowerCase();
    const result=events.filter((e:ActivityEvent)=>{
      if(status!=='all'&&e.status!==status)return false;
      if(channelId!=='all'&&e.channelId!==channelId)return false;
      if(!search)return true;
      return [e.eventType,e.status,e.channelName||channelNames.get(e.channelId||'')||'',
        e.batchId||'',e.jobId||'',e.errorCode||'',e.operationId||'']
        .some(v=>v.toLocaleLowerCase().includes(search));
    });
    result.sort((a,b)=>oldestFirst?a.timestamp.localeCompare(b.timestamp):b.timestamp.localeCompare(a.timestamp));
    return result;
  },[events,query,status,channelId,oldestFirst,channelNames]);
  return <div className="productionManager">
    <section className="panel pmHero"><div><small>VYRON • LOCAL AUDIT JOURNAL</small><h2>История VYRON</h2>
      <p>События сборки, восстановления, публикаций, ошибок и других операций, записанные в локальном журнале. Никакая синхронизация YouTube при открытии не выполняется.</p>
    </div><div className="pmChannelBadge"><small>ВСЕГО СОБЫТИЙ</small><b>{events.length.toLocaleString('ru-RU')}</b></div></section>
    <section className="panel">
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
        <input aria-label="Поиск по журналу" placeholder="Поиск: событие, batch, ошибка…" value={query}
          onChange={e=>{setQuery(e.target.value);setLimit(100)}} style={{flex:'1 1 220px',minWidth:160}}/>
        <select aria-label="Статус" value={status} onChange={e=>{setStatus(e.target.value);setLimit(100)}}>
          <option value="all">Все статусы</option>
          <option value="SUCCESS">Успешные</option><option value="FAILED">Ошибки</option>
          <option value="PARTIAL">Частичные</option><option value="STARTED">Запущенные</option>
          <option value="INFO">Информация</option>
        </select>
        <select aria-label="Канал" value={channelId} onChange={e=>{setChannelId(e.target.value);setLimit(100)}}>
          <option value="all">Все каналы</option>
          {channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={()=>setOldestFirst(x=>!x)}>{oldestFirst?'Сначала старые':'Сначала новые'}</button>
      </div>
      <p>Найдено: {filtered.length.toLocaleString('ru-RU')}. Отображено: {Math.min(filtered.length,limit).toLocaleString('ru-RU')}.</p>
      <div style={{display:'grid',gap:8}}>
        {filtered.slice(0,limit).map(e=><article key={e.eventId} style={{padding:'12px 14px',border:'1px solid var(--border, rgba(128,128,128,.25))',borderRadius:10}}>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'space-between',alignItems:'center'}}>
            <b>{e.eventType.replaceAll('_',' ')}</b>
            <small>{new Date(e.timestamp).toLocaleString('ru-RU')} · {e.status}</small>
          </div>
          <div style={{marginTop:5,opacity:.8,fontSize:13}}>
            {e.channelName||channelNames.get(e.channelId||'')||'Все каналы'}
            {e.batchId?' · Batch '+e.batchId:''}
            {e.jobId?' · Задача '+e.jobId:''}
            {e.errorCode?' · Ошибка '+e.errorCode:''}
          </div>
        </article>)}
      </div>
      {!filtered.length&&<p>Записей по выбранным фильтрам нет. Отсутствующие события не восстанавливаются из предположений.</p>}
      {filtered.length>limit&&<button style={{marginTop:16}} onClick={()=>setLimit(x=>x+100)}>Показать ещё 100</button>}
    </section>
  </div>;
}
