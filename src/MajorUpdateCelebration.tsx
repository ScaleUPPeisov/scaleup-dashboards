import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {useApp} from './store';
import {VYRON_4_ARTWORK,VYRON_LAST_CELEBRATED_KEY,VYRON_MAJOR_UPGRADE_TARGET_KEY,VYRON_MAJOR_VERSION} from './vyronBrand';
import {SafeArtwork} from './SafeArtwork';

type CelebrationMode='upgrade'|'fresh';

export function MajorUpdateCelebration(){
  const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),uploadHistory=useApp(s=>s.uploadHistory);
  const [visible,setVisible]=useState(false),[mode,setMode]=useState<CelebrationMode>('upgrade'),[details,setDetails]=useState(false);
  const existingState=useMemo(()=>channels.length>0||jobs.length>0||uploadHistory.length>0,[channels.length,jobs.length,uploadHistory.length]);

  useEffect(()=>{
    let live=true;
    void api.appVersion().then(version=>{
      if(!live||version!==VYRON_MAJOR_VERSION)return;
      if(localStorage.getItem(VYRON_LAST_CELEBRATED_KEY)===version)return;
      const explicitUpgrade=localStorage.getItem(VYRON_MAJOR_UPGRADE_TARGET_KEY)===version;
      setMode(explicitUpgrade||existingState?'upgrade':'fresh');
      setVisible(true)
    }).catch(()=>{});
    return()=>{live=false}
  },[existingState]);

  if(!visible)return null;
  const finish=()=>{
    localStorage.setItem(VYRON_LAST_CELEBRATED_KEY,VYRON_MAJOR_VERSION);
    localStorage.removeItem(VYRON_MAJOR_UPGRADE_TARGET_KEY);
    setVisible(false)
  };

  return <div className="majorCelebrationBackdrop" role="dialog" aria-modal="true" aria-labelledby="majorCelebrationTitle">
    <div className="majorCelebrationFx" aria-hidden="true">
      {Array.from({length:14},(_,i)=><i key={i} style={{'--i':i} as React.CSSProperties}/>)}
    </div>
    <section className="majorCelebrationCard">
      <div className="majorCelebrationHalo" aria-hidden="true"/>
      <SafeArtwork className="majorCelebrationArtwork" src={VYRON_4_ARTWORK} alt="VYRON YT PEISOV" fallback="V"/>
      <small>UPDATE • VYRON {VYRON_MAJOR_VERSION}</small>
      <h1 id="majorCelebrationTitle">{mode==='upgrade'?'ПОЗДРАВЛЯЕМ!':'Добро пожаловать в VYRON {VYRON_MAJOR_VERSION}'}</h1>
      <h2>{mode==='upgrade'?'Обновление VYRON 4.0.1 установлено':'Autonomous Content Operating System'}</h2>
      <p>{mode==='upgrade'?'Каналы, OAuth, локальные папки, история и настройки сохранены.':'Новая архитектура разделяет локальный запас, очередь, YouTube uploads и реальное расписание.'}</p>

      {details&&<div className="majorWhatsNew">
        <b>Что нового</b>
        <div>
          <span><strong>Owner YouTube inventory</strong><em>Public / Private / Scheduled считаются отдельно по authenticated данным.</em></span>
          <span><strong>Реальный schedule</strong><em>Локальные Render-файлы больше не превращаются в YouTube Scheduled.</em></span>
          <span><strong>Command Overview</strong><em>Главная показывает каналы, подписчиков, просмотры, owner-видео, локальный запас и внимание.</em></span>
          <span><strong>Upload safety</strong><em>YouTube API quota и локальный дневной upload-limit VYRON разделены.</em></span>
        </div>
      </div>}

      <footer>
        <button className="secondary" onClick={()=>setDetails(x=>!x)}>{details?'Скрыть':'Что нового'}</button>
        <button className="primary" onClick={finish}>Начать работу</button>
      </footer>
    </section>
  </div>
}
