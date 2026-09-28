import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {useApp} from './store';
import {
  VYRON_5_ARTWORK,
  VYRON_LAST_CELEBRATED_KEY,
  VYRON_MAJOR_UPGRADE_TARGET_KEY,
  VYRON_MAJOR_VERSION,
  VYRON_UPDATE_CELEBRATION_NOTES_KEY,
  VYRON_UPDATE_CELEBRATION_TARGET_KEY
} from './vyronBrand';
import {SafeArtwork} from './SafeArtwork';
import {LocalProfileMenu} from './LocalProfileMenu';

type CelebrationMode='upgrade'|'fresh';

const fallbackHighlights=[
  'Новый Owner Operations Center и deterministic Next Action.',
  '«Запас видео» показывает ежедневную работу без Finder и без YouTube API для today counters.',
  'Исправлено фоновое расходование YouTube API quota.',
  'Updater восстанавливает потерянный candidate перед установкой.',
  'OAuth, Google credentials, каналы, папки и история сохраняются при обновлении.'
];

function releaseHighlights(raw:string){
  const cleaned=String(raw||'')
    .split(/\r?\n/)
    .map(x=>x.trim())
    .filter(Boolean)
    .map(x=>x.replace(/^[-*+•]+\s*/,'').replace(/^#+\s*/,'').replace(/\*\*/g,'').trim())
    .filter(x=>x.length>2&&!/^https?:\/\//i.test(x));
  return (cleaned.length?cleaned:fallbackHighlights).slice(0,6)
}

export function MajorUpdateCelebration(){
  const channelCount=useApp(s=>s.channels.length),jobCount=useApp(s=>s.jobs.length),uploadHistoryCount=useApp(s=>s.uploadHistory.length);
  const [visible,setVisible]=useState(false),[mode,setMode]=useState<CelebrationMode>('upgrade'),[details,setDetails]=useState(false),[runtimeVersion,setRuntimeVersion]=useState(VYRON_MAJOR_VERSION),[notes,setNotes]=useState('');
  const existingState=channelCount>0||jobCount>0||uploadHistoryCount>0;
  const highlights=useMemo(()=>releaseHighlights(notes),[notes]);

  useEffect(()=>{
    let live=true;
    void api.appVersion().then(version=>{
      if(!live)return;
      setRuntimeVersion(version);
      if(localStorage.getItem(VYRON_LAST_CELEBRATED_KEY)===version)return;
      const genericTarget=localStorage.getItem(VYRON_UPDATE_CELEBRATION_TARGET_KEY);
      const legacyTarget=localStorage.getItem(VYRON_MAJOR_UPGRADE_TARGET_KEY);
      const explicitUpgrade=genericTarget===version||legacyTarget===version;
      const upgrade=explicitUpgrade||existingState;
      setMode(upgrade?'upgrade':'fresh');
      setNotes(upgrade?(localStorage.getItem(VYRON_UPDATE_CELEBRATION_NOTES_KEY)||''):'');
      setDetails(upgrade);
      setVisible(true)
    }).catch(()=>{});
    return()=>{live=false}
  },[existingState]);

  const finish=()=>{
    localStorage.setItem(VYRON_LAST_CELEBRATED_KEY,runtimeVersion);
    localStorage.removeItem(VYRON_UPDATE_CELEBRATION_TARGET_KEY);
    localStorage.removeItem(VYRON_UPDATE_CELEBRATION_NOTES_KEY);
    localStorage.removeItem(VYRON_MAJOR_UPGRADE_TARGET_KEY);
    setVisible(false)
  };

  return <><LocalProfileMenu/>{visible&&<div className="majorCelebrationBackdrop" role="dialog" aria-modal="true" aria-labelledby="majorCelebrationTitle">
    <div className="majorCelebrationFx" aria-hidden="true">
      {Array.from({length:14},(_,i)=><i key={i} style={{'--i':i} as React.CSSProperties}/>)}
    </div>
    <section className="majorCelebrationCard">
      <div className="majorCelebrationHalo" aria-hidden="true"/>
      <SafeArtwork className="majorCelebrationArtwork" src={VYRON_5_ARTWORK} alt="VYRON YT PEISOV" fallback="V"/>
      <small>{mode==='upgrade'?'UPDATE INSTALLED':'WELCOME'} • VYRON {runtimeVersion}</small>{/^\d+\.0\.0(?:$|-)/.test(runtimeVersion)&&<strong className="majorReleaseLabel">БОЛЬШОЕ ОБНОВЛЕНИЕ</strong>}
      <h1 id="majorCelebrationTitle">{mode==='upgrade'?'ПОЗДРАВЛЯЕМ!':`Добро пожаловать в VYRON ${runtimeVersion}`}</h1>
      <h2>{mode==='upgrade'?`Обновление VYRON ${runtimeVersion} установлено`:'Autonomous Content Operating System'}</h2>
      <p>{mode==='upgrade'?'Каналы, OAuth, локальные папки, история и настройки сохранены.':'VYRON готов к работе.'}</p>

      {details&&<div className="majorWhatsNew">
        <b>{mode==='upgrade'?'Что сделано в этом обновлении':'Что нового'}</b>
        <div>
          {highlights.map((item,i)=><span key={i}><strong>{String(i+1).padStart(2,'0')}</strong><em>{item}</em></span>)}
        </div>
      </div>}

      <footer>
        {mode==='upgrade'&&<button className="secondary" onClick={()=>setDetails(x=>!x)}>{details?'Скрыть изменения':'Что нового'}</button>}
        <button className="primary" onClick={finish}>Начать работу</button>
      </footer>
    </section>
  </div>}</>
}
