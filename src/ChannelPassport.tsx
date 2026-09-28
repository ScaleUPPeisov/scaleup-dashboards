import React,{useMemo} from 'react';
import {ModalPortal} from './ModalPortal';
import {useApp} from './store';
import {useLiveInventory} from './renderInventoryRuntime';
import {ownerInventoryForChannel} from './youtubeOwnerInventory';
import {buildDailyOperations} from './dailyOperations';
import {saveActivePublishChannel} from './publishWorkspaceState';
import {api} from './api';
import type {Channel,YoutubeProfile} from './types';

const dt=(iso?:string)=>iso?new Date(iso).toLocaleString('ru-RU'):'Нет данных';
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ru-RU'):'Нет данных';

export function ChannelPassport({channel,profile,oauthState,onClose}:{channel:Channel;profile?:YoutubeProfile;oauthState?:string;onClose:()=>void}){
 const jobs=useApp(s=>s.jobs),history=useApp(s=>s.uploadHistory),settings=useApp(s=>s.settings),setPage=useApp(s=>s.setPage),snapshots=useLiveInventory(s=>s.snapshots);
 const snapshot=snapshots[channel.id],owner=ownerInventoryForChannel(channel.id);
 const daily=useMemo(()=>buildDailyOperations([channel],history,snapshots,new Date()).rows[0],[channel,history,snapshots]);
 const channelJobs=jobs.filter(j=>j.channelId===channel.id),queue=channelJobs.filter(j=>j.status==='READY_UPLOAD'||j.status==='UPLOADING').length,errors=channelJobs.filter(j=>j.status==='ERROR').length;
 const analytics=channel.analytics;
 const open=(page:'publisher'|'analytics'|'metadata'|'youtube'|'inventory')=>{saveActivePublishChannel(channel.id);setPage(page);onClose()};
 const oauthOk=['READY','WORKING','CONNECTED'].includes(String(oauthState||profile?.credentialStatus||''));
 const folderOk=Boolean(channel.renderFolderPath&&snapshot?.folderState==='ONLINE');
 const metadataErrors=channelJobs.filter(j=>!j.title?.trim()||!j.description?.trim()).length;
 const scheduleOk=owner.available?Boolean(owner.scheduled||owner.nextScheduledAt):channelJobs.some(j=>Boolean(j.publishAt));
 return <ModalPortal onClose={onClose}><section className="channelPassport" onMouseDown={e=>e.stopPropagation()}>
  <header><div><small>CHANNEL PASSPORT</small><h2>{channel.name}</h2><p>{channel.stats?.handle||channel.youtubeChannelId||'Локальный канал'}</p></div><button onClick={onClose}>×</button></header>
  <div className="passportGrid">
   <section><small>YOUTUBE</small><h3>Подключение</h3><dl>
    <div><dt>Статус</dt><dd>{channel.youtubeProfileId?'Подключён':'Не подключён'}</dd></div>
    <div><dt>Channel ID</dt><dd>{channel.youtubeChannelId||'Нет данных'}</dd></div>
    <div><dt>Handle</dt><dd>{channel.stats?.handle||'Нет данных'}</dd></div>
    <div><dt>OAuth profile</dt><dd>{profile?.googleEmail||channel.youtubeProfileId||'Нет данных'}</dd></div>
    <div><dt>OAuth health</dt><dd>{oauthState||profile?.credentialStatus||'Нет данных'}</dd></div>
    <div><dt>Country</dt><dd>{channel.stats?.country||channel.country||'Нет данных'}</dd></div>
   </dl></section>
   <section><small>PRODUCTION</small><h3>Локальный контент</h3><dl>
    <div><dt>Render folder</dt><dd>{channel.renderFolderPath||'Не выбрана'}</dd></div>
    <div><dt>Projects folder</dt><dd>{channel.projectsFolderPath||'Не выбрана'}</dd></div>
    <div><dt>Локально готово</dt><dd>{snapshot?.readyVideos??'Нет данных'}</dd></div>
    <div><dt>Coverage</dt><dd>{snapshot?String(snapshot.runwayDays)+' дн.':'Нет данных'}</dd></div>
    <div><dt>ENDLUME</dt><dd>{settings.endlumePath?'Настроен':'Нет данных'}</dd></div>
    <div><dt>Последняя проверка</dt><dd>{dt(snapshot?.lastScanAt||snapshot?.lastConfirmedAt)}</dd></div>
   </dl></section>
   <section><small>PUBLISHING</small><h3>Публикация</h3><dl>
    <div><dt>Сегодня</dt><dd>{daily?.uploadedToday??0}{daily?.dailyTarget?' / '+daily.dailyTarget:''}</dd></div>
    <div><dt>Queue / Upload</dt><dd>{queue}</dd></div>
    <div><dt>Private</dt><dd>{owner.available?owner.private:'Нет данных'}</dd></div>
    <div><dt>Scheduled</dt><dd>{owner.available?owner.scheduled:'Нет данных'}</dd></div>
    <div><dt>Published</dt><dd>{owner.available?owner.public:'Нет данных'}</dd></div>
    <div><dt>Последняя загрузка</dt><dd>{dt(daily?.lastUploadAt||channel.lastUploadAt)}</dd></div>
   </dl></section>
   <section><small>ANALYTICS</small><h3>Сохранённый снимок</h3><dl>
    <div><dt>Период</dt><dd>{analytics?analytics.periodDays+' дней':'Нет данных'}</dd></div>
    <div><dt>Views</dt><dd>{num(analytics?.views)}</dd></div>
    <div><dt>Watch time</dt><dd>{analytics?Math.round(analytics.watchMinutes/60).toLocaleString('ru-RU')+' ч':'Нет данных'}</dd></div>
    <div><dt>Average duration</dt><dd>{analytics?Math.round(analytics.averageViewDuration)+' сек':'Нет данных'}</dd></div>
    <div><dt>Subscribers</dt><dd>{num(channel.stats?.subscriberCount??channel.stats?.subscribers)}</dd></div>
    <div><dt>Обновлено</dt><dd>{dt(analytics?.updatedAt)}</dd></div>
   </dl></section>
  </div>
  <section className="passportHealth"><small>HEALTH</small><div>
   <span className={oauthOk?'good':'warn'}>OAuth {oauthOk?'🟢':'🟡'}</span>
   <span className={folderOk?'good':'warn'}>Render {folderOk?'🟢':'🟡'}</span>
   <span className={metadataErrors?'warn':'good'}>Metadata {metadataErrors?'🟡 '+metadataErrors:'🟢'}</span>
   <span className={scheduleOk?'good':'warn'}>Schedule {scheduleOk?'🟢':'🟡'}</span>
   <span className={errors?'warn':'good'}>Uploads {errors?'🔴 '+errors:'🟢'}</span>
  </div></section>
  <footer>
   <button className="primary" onClick={()=>open('publisher')}>Загрузить</button>
   {channel.youtubeChannelId&&<button onClick={()=>void api.openWeb('https://www.youtube.com/channel/'+channel.youtubeChannelId)}>Открыть YouTube</button>}
   <button onClick={()=>channel.renderFolderPath?void api.reveal(channel.renderFolderPath):open('inventory')}>Открыть Render</button>
   <button onClick={()=>open('analytics')}>Analytics</button>
   <button onClick={()=>open('metadata')}>Metadata</button>
   <button onClick={()=>open('youtube')}>Schedule / История</button>
   <button className="secondary" onClick={()=>open('youtube')}>Проверить OAuth</button>
  </footer>
 </section></ModalPortal>
}
