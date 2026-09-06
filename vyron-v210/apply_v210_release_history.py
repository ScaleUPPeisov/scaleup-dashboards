#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
settings_path=ROOT/'src/SettingsOS.tsx'
s=settings_path.read_text()

# Preserve the updater implementation byte-for-byte. This patch only wraps the
# existing Updates card and appends an isolated history component below it.
check_start=s.index(' async function checkForUpdate()')
check_end=s.index(' const tabs:',check_start)
updater_logic_before=s[check_start:check_end]

component=r'''import React,{useEffect,useState} from 'react';

export type VyronRelease={version:string;date:string;title:string;items:string[]};

export const VYRON_RELEASES:VyronRelease[]=[
 {version:'2.0.10',date:'06.09.2026',title:'История обновлений • подробности • видео-обзор',items:[
  'В «Настройки → Обновления» добавлена полная история VYRON с датами и всеми опубликованными версиями.',
  'Каждая версия раскрывается по нажатию и показывает подробный список того, что было сделано в релизе.',
  'Для каждой версии добавлен встроенный видео-обзор: изменения проигрываются по шагам от первого до последнего с прогрессом, паузой и ручной навигацией.',
  'Видео-обзор работает локально и не использует YouTube API, браузер, внешний видеохостинг или дополнительные разрешения.',
  'Существующий signed updater, проверка обновлений и «Установить и перезапустить» не переделывались.',
  'Security Layer 2.0.9, Production, Downloads, ENDLUME, Publisher и Future Channels оставлены без функциональных изменений.'
 ]},
 {version:'2.0.9',date:'06.09.2026',title:'Security Hardening',items:[
  'YouTube OAuth access token, refresh token и client secret перенесены из plaintext JSON в macOS Keychain.',
  'Google client secret, YouTube API key и другие секретные API-настройки хранятся в Keychain и возвращаются только в runtime-память.',
  'Старая конфигурация мигрирует fail-safe: исходные credentials не очищаются, пока запись в Keychain не завершилась успешно.',
  'Чувствительные state/config/backup-файлы получают owner-only права 0600; старый state.bak очищается от plaintext-секретов после успешной миграции.',
  'Логи и уведомления маскируют bearer tokens, OAuth secrets, Google API keys и OpenAI-style secrets.',
  'Production, Downloads, ENDLUME, Publisher, Future Channels и shortcut 2.0.8 прошли полный regression gate без изменения рабочего сценария.'
 ]},
 {version:'2.0.8',date:'06.09.2026',title:'Production Future Channel Shortcut',items:[
  'В «Производство → Материалы» рядом с выбором канала добавлена кнопка «+ Будущий канал».',
  'Название будущего канала можно написать вручную прямо из Production.',
  'Новый локальный канал сразу становится текущим и готов для изображений, музыки, проектов и ENDLUME.',
  'Логика Future Channels 2.0.7, последующая OAuth-привязка, Downloads, Publisher и ENDLUME не изменялись.'
 ]},
 {version:'2.0.7',date:'06.09.2026',title:'Future Channels',items:[
  'Канал можно создать локально до того, как реальный YouTube-канал существует или подключён через OAuth.',
  'Будущий канал получает стабильный локальный UUID: под ним заранее готовятся музыка, изображения, VIDEO-проекты, batches и renders.',
  'После появления YouTube-канала VYRON безопасно сопоставляет единственный канал по нормализованному точному названию и сохраняет прежний local Channel.id.',
  'Дубликаты и неоднозначные совпадения по имени не привязываются автоматически.',
  'Название локального production-канала больше не перезаписывается поздним YouTube title/analytics.',
  'Будущий канал без OAuth не считается сломанным и не блокирует Autopilot подключённых каналов.',
  'Загрузка на YouTube физически не запускается, пока у канала нет youtubeProfileId.'
 ]},
 {version:'2.0.6',date:'06.09.2026',title:'Publisher Scheduling & Quota',items:[
  'Обложки по умолчанию не меняются; без выбранной картинки thumbnails.set не вызывается.',
  'Добавлен отдельный живой счётчик Video Uploads, основанный на фактических videos.insert.',
  'DOCX/SEO pack сопоставляется с VIDEO автоматически и локально без отдельного metadata API-запроса.',
  'title, description, tags и publishAt отправляются сразу в первоначальном videos.insert.',
  'Добавлены режимы расписания: из файла, каждый день, 2/2 и 3/1; расчёт времени — Asia/Krasnoyarsk.',
  'READY_UPLOAD отображается как «В ОЧЕРЕДИ».',
  'Добавлено безопасное локальное удаление: только из VYRON или из VYRON и с диска, без удаления YouTube-видео.',
  'Сохранены resumable recovery, workspace persistence, quota guards и исправление Select All.'
 ]},
 {version:'2.0.5',date:'05.09.2026',title:'Updater Discovery Fix',items:[
  'Исправлено обнаружение новой версии встроенным updater после публикации релиза.',
  'Проверка версии использует подписанный updater feed и не расходует YouTube Data API quota.',
  'Сохранена проверка подписи updater-пакета перед установкой.',
  'Рабочие функции Production, YouTube, Analytics и локальное состояние не переделывались этим hotfix.'
 ]},
 {version:'2.0.4',date:'05.09.2026',title:'Select All Stability Fix',items:[
  'Исправлен crash/нестабильность массового выбора VIDEO в Publisher.',
  'Select All работает с большой партией без повреждения выбранного набора и состояния workspace.',
  'Сохранены существующие preflight, quota и upload guards.',
  'Hotfix не меняет формат исходных VIDEO и не выполняет дополнительных YouTube API-запросов.'
 ]},
 {version:'2.0.3',date:'05.09.2026',title:'OAuth Video Discovery',items:[
  'Обнаружение видео и связанного YouTube-профиля переведено на корректную OAuth-идентичность канала.',
  'Убраны ложные совпадения между локальным каналом и чужим YouTube-профилем.',
  'Синхронизация использует уже подключённые OAuth-профили и сохраняет локальную структуру каналов.',
  'Production остаётся локальной зоной и не начинает скрытые YouTube API-вызовы.'
 ]},
 {version:'2.0.2',date:'05.09.2026',title:'Studio Draft Bridge',items:[
  'Добавлен bridge между подготовленными VYRON draft/VIDEO и рабочим YouTube Studio-процессом.',
  'Подготовленные локальные данные сохраняются до явного пользовательского действия на публикацию.',
  'Метаданные и выбранные файлы не должны теряться при переходе между рабочими экранами.',
  'Интеграция сделана без переноса Production-логики в YouTube API.'
 ]},
 {version:'2.0.1',date:'04.09.2026',title:'YouTube Sync Hotfix',items:[
  'Исправлена синхронизация VYRON с подключёнными YouTube-профилями после перехода на 2.0.0.',
  'Сопоставление локальных каналов и OAuth-профилей стабилизировано без пересоздания пользовательского workspace.',
  'Hotfix сохраняет updater identity, storage и существующие production-данные.',
  'YouTube-синхронизация остаётся явным действием и не должна расходовать quota при простом открытии Settings.'
 ]},
 {version:'2.0.0',date:'03.09.2026',title:'Final • Autonomous YouTube OS foundation',items:[
  'Publish Workspace сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.',
  'YouTube resumable upload session и offset сохраняются между перезапусками; после обрыва загрузка продолжается без второго videos.insert.',
  'Recovery блокируется, если исходный MP4 исчез или изменился.',
  'Добавлены понятные Google/network/Tauri ошибки и persisted freshness layer для YouTube cache.',
  'Analytics сравнивает последние 7 дней с предыдущими 7; Views, retention, CTR, RPM и лучшие видео основаны только на сохранённых реальных данных.',
  'Opportunity Radar использует velocity, cadence, similarity и темы заголовков без выдуманных revenue/RPM/CTR.',
  'Dashboard показывает cached Views/Revenue/trend, а Attention Center учитывает uploads, quota, OAuth, Production и ENDLUME.',
  'Опциональная YouTube-автопубликация OFF по умолчанию; для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit.'
 ]},
 {version:'1.2.0',date:'03.09.2026',title:'Full Master',items:[
  'Собрана полная стабильная master-база VYRON перед переходом на линейку 2.0.x.',
  'Зафиксированы Production, YouTube Center, Analytics, Competitors, Settings, updater и локальный workspace.',
  'Эта версия стала SHA-проверенной исходной базой, поверх которой строятся релизы 2.0.x.',
  'Bundle identity, updater channel и пользовательские данные сохранены для совместимых обновлений.'
 ]},
 {version:'1.1.0',date:'03.09.2026',title:'Exact YouTube Quota + Selective ENDLUME Handoff',items:[
  'Добавлен точный учёт известных YouTube API operations вместо условного общего счётчика.',
  'Передача в ENDLUME стала выборочной: в рендер отправляются именно выбранные проекты.',
  'Production и ENDLUME handoff разделены от YouTube-публикации.',
  'Сохранён локальный workflow без лишних YouTube API-запросов.'
 ]},
 {version:'1.0.0',date:'01.09.2026',title:'Zero Quota Production',items:[
  'Сформирован VYRON как локальный Production workflow, который не расходует YouTube quota при подготовке материалов и проектов.',
  'YouTube API отделён от локальной подготовки контента и вызывается только в соответствующих пользовательских сценариях.',
  'Добавлены базовые каналы, Production, ENDLUME handoff, YouTube Center, Analytics и Settings.',
  'Запущен подписанный macOS Apple Silicon release/update channel.'
 ]}
];

function Walkthrough({release}:{release:VyronRelease}){
 const [step,setStep]=useState(0),[playing,setPlaying]=useState(false);
 const total=release.items.length;
 useEffect(()=>{if(!playing)return;const id=window.setInterval(()=>setStep(x=>{if(x>=total-1){setPlaying(false);return total-1}return x+1}),3200);return()=>window.clearInterval(id)},[playing,total]);
 useEffect(()=>{setStep(0);setPlaying(false)},[release.version]);
 const pct=total<=1?100:((step+1)/total)*100;
 return <div style={{marginTop:12,border:'1px solid #244557',borderRadius:12,overflow:'hidden',background:'#06131d'}}>
  <div style={{aspectRatio:'16 / 6',minHeight:180,padding:'24px',display:'flex',flexDirection:'column',justifyContent:'space-between',background:'radial-gradient(circle at 80% 15%,rgba(74,224,232,.14),transparent 38%),linear-gradient(145deg,#071722,#09111c)'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><span style={{fontSize:9,letterSpacing:'1.3px',color:'#65dce6',fontWeight:800}}>VYRON • ВИДЕО-ОБЗОР {release.version}</span><span style={{fontSize:9,color:'#6f8798'}}>ОФЛАЙН • БЕЗ YOUTUBE API</span></div>
   <div><div style={{fontSize:11,color:'#6f8798',marginBottom:8}}>ШАГ {step+1} / {total}</div><strong style={{display:'block',fontSize:18,lineHeight:1.35,color:'#eefaff',maxWidth:920}}>{release.items[step]}</strong></div>
   <div><div style={{height:5,borderRadius:999,background:'#122b38',overflow:'hidden',marginBottom:12}}><i style={{display:'block',height:'100%',width:`${pct}%`,background:'linear-gradient(90deg,#58dbe8,#73efc2)',transition:'width .25s ease'}}/></div><div style={{display:'flex',gap:8,alignItems:'center'}}><button type="button" className="settingsAction" disabled={step===0} onClick={()=>{setPlaying(false);setStep(x=>Math.max(0,x-1))}}>‹ Назад</button><button type="button" className="primary" onClick={()=>{if(step>=total-1)setStep(0);setPlaying(x=>!x)}}>{playing?'❚❚ Пауза':'▶ Смотреть от и до'}</button><button type="button" className="settingsAction" disabled={step>=total-1} onClick={()=>{setPlaying(false);setStep(x=>Math.min(total-1,x+1))}}>Дальше ›</button></div></div>
  </div>
 </div>
}

function ReleaseCard({release,current}:{release:VyronRelease;current:boolean}){
 const [showVideo,setShowVideo]=useState(false);
 return <details open={current} style={{border:'1px solid #183346',borderRadius:12,background:'#071722',overflow:'hidden'}}>
  <summary style={{cursor:'pointer',listStyle:'none',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'14px 16px',userSelect:'none'}}>
   <span style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}><strong style={{fontSize:12,color:'#effcff'}}>{release.version}</strong>{current&&<em style={{fontStyle:'normal',fontSize:8,color:'#71efc8',border:'1px solid #276b5b',borderRadius:999,padding:'3px 7px',fontWeight:800}}>ТЕКУЩАЯ</em>}<span style={{fontSize:10,color:'#7893a5',whiteSpace:'nowrap'}}>{release.date}</span><span style={{fontSize:11,color:'#a9bdc9',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{release.title}</span></span>
   <span style={{fontSize:9,color:'#62dce7',fontWeight:800,whiteSpace:'nowrap'}}>ПОКАЗАТЬ ▾</span>
  </summary>
  <div style={{padding:'0 16px 16px',borderTop:'1px solid #142d3b'}}>
   <b style={{display:'block',fontSize:11,marginTop:14,color:'#dff8ff',letterSpacing:'.45px'}}>ЧТО СДЕЛАНО • ОТ И ДО</b>
   <ul style={{margin:'10px 0 0',paddingLeft:20,color:'#8da8b8',fontSize:11,lineHeight:1.58}}>{release.items.map(item=><li key={item} style={{margin:'6px 0'}}>{item}</li>)}</ul>
   <button type="button" className="settingsAction" style={{marginTop:8}} onClick={e=>{e.preventDefault();setShowVideo(x=>!x)}}>{showVideo?'Скрыть видео-обзор':'▶ Видео-обзор обновления'}</button>
   {showVideo&&<Walkthrough release={release}/>} 
  </div>
 </details>
}

export function VyronReleaseHistory({currentVersion}:{currentVersion:string}){
 return <section className="settingsCard" style={{marginTop:0}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:14}}><div><small>RELEASE HISTORY</small><h3 style={{marginBottom:5}}>История обновлений</h3><p style={{margin:0}}>Все опубликованные релизы VYRON. Нажмите на версию — увидите дату, полный список изменений и видео-обзор.</p></div><span style={{fontSize:9,color:'#82a1b2',border:'1px solid #244355',borderRadius:999,padding:'6px 9px',whiteSpace:'nowrap'}}>{VYRON_RELEASES.length} версий</span></div>
  <div style={{display:'grid',gap:8}}>{VYRON_RELEASES.map((release,index)=><ReleaseCard key={release.version} release={release} current={release.version===currentVersion||(index===0&&!currentVersion)}/>)}</div>
 </section>
}
'''
(ROOT/'src/VyronReleaseHistory.tsx').write_text(component)

# Small data-contract test: dates/order/history must not silently regress.
(ROOT/'src/VyronReleaseHistory.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';import {VYRON_RELEASES} from './VyronReleaseHistory';
describe('VYRON release history',()=>{
 it('contains complete published history and current release',()=>{const versions=VYRON_RELEASES.map(x=>x.version);expect(versions[0]).toBe('2.0.10');for(const v of ['2.0.9','2.0.8','2.0.7','2.0.6','2.0.5','2.0.4','2.0.3','2.0.2','2.0.1','2.0.0','1.2.0','1.1.0','1.0.0'])expect(versions).toContain(v);expect(new Set(versions).size).toBe(versions.length)});
 it('has dates and detailed walkthrough steps',()=>{for(const x of VYRON_RELEASES){expect(x.date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);expect(x.title.length).toBeGreaterThan(3);expect(x.items.length).toBeGreaterThanOrEqual(4)}});
});
''')

import_anchor="import {VYRON_BUILD_DATE,VYRON_PRODUCT_NAME,VYRON_PRODUCT_SUBTITLE} from './buildInfo';"
if import_anchor not in s: raise SystemExit('v210 Settings import anchor missing')
if "from './VyronReleaseHistory'" not in s:
    s=s.replace(import_anchor,import_anchor+"\nimport {VyronReleaseHistory} from './VyronReleaseHistory';",1)

start=s.index(" {tab==='updates'&&<section className=\"settingsCard updateMasterCard\">")
end=s.index("\n {tab==='license'",start)
old_block=s[start:end]
prefix=" {tab==='updates'&&"
if not old_block.startswith(prefix) or not old_block.endswith('}'):
    raise SystemExit('v210 Updates block shape changed')
inner=old_block[len(prefix):-1]
new_block=prefix+'<div className="settingsStack">'+inner+"<VyronReleaseHistory currentVersion={installedVersion||'2.0.10'}/></div>}"
s=s[:start]+new_block+s[end:]

# Hard compatibility assertion: update check/install implementation itself must be unchanged.
check_start_after=s.index(' async function checkForUpdate()')
check_end_after=s.index(' const tabs:',check_start_after)
if s[check_start_after:check_end_after] != updater_logic_before:
    raise SystemExit('v210 attempted to modify existing updater logic')

settings_path.write_text(s)
print('VYRON 2.0.10 isolated release history applied; updater logic unchanged')
