import React,{useMemo,useState} from 'react';
import {useApp} from './store';
import type {ActivityEvent,ActivityEventType,ActivityStatus} from './types';
import './history-apex.css';

// Opening the local journal never starts network requests or filesystem scans.
const labels:Record<ActivityEventType,string>={
 RENDER_COMPLETED:'Рендер завершён',RENDER_DISCOVERED_LEGACY:'Найден предыдущий рендер',RENDER_FOLDER_SCANNED:'Папка рендера проверена',LOCAL_VIDEO_DISCOVERED:'Найдено локальное видео',
 UPLOAD_QUEUED:'Загрузка в очереди',UPLOAD_STARTED:'Загрузка началась',UPLOAD_PROGRESS:'Ход загрузки',UPLOAD_ACCEPTED:'Загрузка принята',UPLOAD_BLOCKED_DUPLICATE_GUARD:'Повторная загрузка остановлена',
 REMOTE_VIDEO_VERIFIED:'Видео на YouTube подтверждено',REMOTE_VIDEO_MISSING:'Видео на YouTube не найдено',REMOTE_LINK_CLEARED:'Связь с видео удалена',RECONCILIATION_COMPLETED:'Сверка завершена',
 YOUTUBE_PROCESSING:'YouTube обрабатывает видео',YOUTUBE_READY:'Видео готово на YouTube',UPLOAD_FAILED:'Ошибка загрузки',
 METADATA_UPDATE_STARTED:'Обновление метаданных началось',METADATA_UPDATE_SUCCEEDED:'Метаданные обновлены',METADATA_UPDATE_FAILED:'Ошибка обновления метаданных',TITLE_UPDATED:'Название обновлено',DESCRIPTION_UPDATED:'Описание обновлено',TAGS_UPDATED:'Теги обновлены',SCHEDULE_UPDATED:'Расписание обновлено',PRIVACY_UPDATED:'Доступ обновлён',THUMBNAIL_UPDATED:'Обложка обновлена',
 INVENTORY_SYNC_STARTED:'Проверка видео началась',INVENTORY_SYNC_COMPLETED:'Проверка видео завершена',INVENTORY_SYNC_PARTIAL:'Проверка видео завершена частично',
 SOURCE_TRASH_REQUESTED:'Запрошено перемещение файла в корзину',SOURCE_TRASHED:'Файл перемещён в корзину',SOURCE_MISSING:'Исходный файл не найден',SOURCE_RECOVERED:'Исходный файл восстановлен',
 OAUTH_KEYCHAIN_ACCESS_DENIED:'Нет доступа к связке ключей',OAUTH_KEYCHAIN_ACCESS_RECOVERED:'Доступ к связке ключей восстановлен',OAUTH_PROFILE_RECONNECT_REQUIRED:'Требуется повторное подключение аккаунта',OAUTH_PROFILE_RECONNECTED:'Аккаунт подключён повторно',OAUTH_CREDENTIAL_ROTATED:'Учётные данные обновлены',OAUTH_VALIDATION_PASS:'Авторизация проверена',OAUTH_RECONNECT:'Повторное подключение авторизации',CHANNEL_REBOUND:'Привязка канала обновлена',
 STATS_REFRESH_BATCH:'Обновление статистики каналов',CHANNEL_STATS_REFRESH:'Обновление статистики канала',RECOVERY_SESSION_DETECTED:'Найдена сессия восстановления',RECOVERY_STARTED:'Восстановление началось',RECOVERY_COMPLETED:'Восстановление завершено',RECOVERY_WAITING:'Восстановление ожидает продолжения',RECOVERY_ABANDONED:'Восстановление остановлено',
 PRODUCTION_BUILD_STARTED:'Сборка проектов началась',PRODUCTION_BUILD_COMPLETED:'Сборка проектов завершена',PRODUCTION_BUILD_FAILED:'Ошибка сборки проектов',ANALYTICS_EXPORT_COMPLETED:'Экспорт аналитики завершён',ANALYTICS_EXPORT_FAILED:'Ошибка экспорта аналитики'
};
const statusLabels:Record<ActivityStatus,string>={SUCCESS:'Успешно',FAILED:'Ошибка',PARTIAL:'Частично',STARTED:'Запущено',INFO:'Информация'};
const eventLabel=(event:ActivityEvent)=>labels[event.eventType]||event.eventType.replaceAll('_',' ');

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
      return [eventLabel(e),statusLabels[e.status]||e.status,e.eventType,e.status,e.channelName||channelNames.get(e.channelId||'')||'',
        e.batchId||'',e.jobId||'',e.errorCode||'',e.operationId||'']
        .some(v=>v.toLocaleLowerCase().includes(search));
    });
    result.sort((a,b)=>oldestFirst?a.timestamp.localeCompare(b.timestamp):b.timestamp.localeCompare(a.timestamp));
    return result;
  },[events,query,status,channelId,oldestFirst,channelNames]);
  return <div className="historyApex">
    <header className="historyApexHeader"><div><small>ЖУРНАЛ СОБЫТИЙ</small><h1>История</h1><p>Сборка, публикации и другие операции VYRON</p></div>
      <div className="historyApexTotal"><span>Всего событий</span><strong>{events.length.toLocaleString('ru-RU')}</strong></div>
    </header>
    <section className="historyApexWorkspace" aria-labelledby="history-list-title">
      <div className="historyApexFilters" aria-label="Фильтры истории">
        <label className="historyApexSearch"><span>Поиск</span><input placeholder="Событие, канал или ошибка" value={query} onChange={e=>{setQuery(e.target.value);setLimit(100)}}/></label>
        <label><span>Статус</span><select value={status} onChange={e=>{setStatus(e.target.value);setLimit(100)}}>
          <option value="all">Все статусы</option><option value="SUCCESS">Успешные</option><option value="FAILED">Ошибки</option>
          <option value="PARTIAL">Частичные</option><option value="STARTED">Запущенные</option><option value="INFO">Информация</option>
        </select></label>
        <label><span>Канал</span><select value={channelId} onChange={e=>{setChannelId(e.target.value);setLimit(100)}}>
          <option value="all">Все каналы</option>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <button className="historyApexOrder" onClick={()=>setOldestFirst(x=>!x)} aria-label={'Порядок: '+(oldestFirst?'сначала старые':'сначала новые')}>{oldestFirst?'Сначала старые':'Сначала новые'}</button>
      </div>
      <div className="historyApexListHeading"><h2 id="history-list-title">События</h2><p role="status">Найдено {filtered.length.toLocaleString('ru-RU')} · показано {Math.min(filtered.length,limit).toLocaleString('ru-RU')}</p></div>
      {filtered.length?<ol className="historyApexList">{filtered.slice(0,limit).map(e=><li key={e.eventId} className={'historyApexEvent historyApexEvent-'+e.status.toLowerCase()}>
        <div className="historyApexEventMain"><div><h3>{eventLabel(e)}</h3><p>{e.channelName||channelNames.get(e.channelId||'')||'Все каналы'}</p></div><div className="historyApexEventMeta"><span>{statusLabels[e.status]||e.status}</span><time dateTime={e.timestamp}>{new Date(e.timestamp).toLocaleString('ru-RU')}</time></div></div>
        {(e.batchId||e.jobId||e.errorCode)&&<p className="historyApexIdentifiers">{e.batchId&&<span>Пакет: {e.batchId}</span>}{e.jobId&&<span>Задача: {e.jobId}</span>}{e.errorCode&&<span>Код ошибки: {e.errorCode}</span>}</p>}
        <details className="historyApexTechnical"><summary>Технические сведения</summary><p>Код события: {e.eventType}{e.operationId&&<> · Операция: {e.operationId}</>}</p></details>
      </li>)}</ol>:<div className="historyApexEmpty"><strong>Событий не найдено</strong><p>{events.length?'Измените поиск или фильтры.':'Записи появятся после операций в VYRON.'}</p></div>}
      {filtered.length>limit&&<button className="historyApexMore" onClick={()=>setLimit(x=>x+100)}>Показать ещё 100</button>}
    </section>
  </div>;
}
