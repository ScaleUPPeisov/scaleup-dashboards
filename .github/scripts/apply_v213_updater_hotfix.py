#!/usr/bin/env python3
import json, pathlib, re, sys
root=pathlib.Path(sys.argv[1]).resolve()

def read(rel): return (root/rel).read_text()
def write(rel,text): (root/rel).write_text(text)
def replace_once(rel, old, new):
    text=read(rel)
    if text.count(old)!=1:
        raise SystemExit(f'{rel}: expected exactly one anchor, found {text.count(old)}: {old[:120]}')
    write(rel,text.replace(old,new,1))

# Version manifests only.
pkg=json.loads(read('package.json')); assert pkg['version']=='2.1.2'; pkg['version']='2.1.3'; write('package.json',json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')
lock=json.loads(read('package-lock.json')); assert lock.get('version')=='2.1.2'; lock['version']='2.1.3'; rootpkg=lock.get('packages',{}).get('',{}); assert rootpkg.get('version')=='2.1.2'; rootpkg['version']='2.1.3'; write('package-lock.json',json.dumps(lock,ensure_ascii=False,indent=2)+'\n')
conf=json.loads(read('src-tauri/tauri.conf.json')); assert conf['version']=='2.1.2'; conf['version']='2.1.3'
up=conf['plugins']['updater']; old_eps=up['endpoints']; assert old_eps==[
  'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json',
  'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json'
]
up['endpoints']=[
  'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json',
  'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json'
]
write('src-tauri/tauri.conf.json',json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
replace_once('src-tauri/Cargo.toml','version = "2.1.2"','version = "2.1.3"')
# Only the root channelflow package version in lock.
cl=read('src-tauri/Cargo.lock')
pat=r'(name = \"channelflow\"\nversion = \")([^\"]+)(\")'
cl2,n=re.subn(pat,r'\g<1>2.1.3\3',cl,count=1)
if n!=1: raise SystemExit('src-tauri/Cargo.lock: channelflow package anchor missing')
write('src-tauri/Cargo.lock',cl2)

# Canonical updater policy + error classification, no business logic.
write('src/updaterPolicy.ts',"""export const UPDATER_ENDPOINTS=[
  'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json',
  'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json'
] as const;

export const UPDATER_CHECK_OPTIONS={
  timeout:30_000,
  headers:{
    'Cache-Control':'no-cache, no-store, max-age=0',
    'Pragma':'no-cache'
  }
} as const;

export type UpdaterStage='check'|'download'|'install'|'relaunch';
export type UpdaterStatus='CHECKING'|'AVAILABLE'|'DOWNLOADING'|'VERIFYING'|'INSTALLING'|'READY_TO_RESTART'|'UP_TO_DATE'|'ERROR';

export function updaterVersionStatus(current:string,latest:string){
  return current===latest?'current == latest':`current ${current} -> latest ${latest}`;
}

export function classifyUpdaterError(error:unknown,stage:UpdaterStage){
  const detail=String(error??'');
  const s=detail.toLowerCase();
  if(s.includes('signature')||s.includes('minisign')||s.includes('public key'))return{code:'UPDATER_SIGNATURE_INVALID',detail};
  if(s.includes('platform')||s.includes('darwin-aarch64')&&s.includes('not found'))return{code:'UPDATER_PLATFORM_NOT_FOUND',detail};
  if(stage==='check')return{code:'UPDATER_MANIFEST_FETCH_FAILED',detail};
  if(stage==='download')return{code:'UPDATER_ARCHIVE_DOWNLOAD_FAILED',detail};
  return{code:'UPDATER_INSTALL_FAILED',detail};
}

export function updaterFailureMessage(code:string,detail:string){
  if(code==='UPDATER_ARCHIVE_DOWNLOAD_FAILED')return `Не удалось скачать файл обновления с GitHub. ${detail}`;
  if(code==='UPDATER_MANIFEST_FETCH_FAILED')return `Не удалось проверить обновление. ${detail}`;
  if(code==='UPDATER_SIGNATURE_INVALID')return `Проверка подписи обновления не пройдена. ${detail}`;
  if(code==='UPDATER_PLATFORM_NOT_FOUND')return `В manifest нет совместимой сборки darwin-aarch64. ${detail}`;
  return `Не удалось установить обновление. ${detail}`;
}
""")

# API check/download/install: preserve existing behavior, add typed diagnostics only.
replace_once('src/api.ts',
"import {UPDATER_CHECK_OPTIONS} from './updaterPolicy';",
"import {classifyUpdaterError,UPDATER_CHECK_OPTIONS,UPDATER_ENDPOINTS,updaterFailureMessage,updaterVersionStatus} from './updaterPolicy';")
old="""  checkUpdate:async()=>{
    const current=await getVersion();
    const update=await check(UPDATER_CHECK_OPTIONS);
    if(!update)return {none:true,current} as any;
    let downloaded=0,total=0;
    return {version:update.version,date:update.date,body:update.body||'',current:update.currentVersion,install:async(onProgress?:(p:number)=>void)=>{
      await invoke<string>('prepare_updater_tempdir');
      await update.downloadAndInstall((event:any)=>{
        if(event.event==='Started'){total=Number(event.data?.contentLength||0);downloaded=0;onProgress?.(0)}
        if(event.event==='Progress'){downloaded+=Number(event.data?.chunkLength||0);if(total>0)onProgress?.(Math.min(100,downloaded/total*100))}
        if(event.event==='Finished')onProgress?.(100);
      });
      await relaunch();
    }};
  }
"""
new="""  checkUpdate:async()=>{
    const current=await getVersion();
    let update:any;
    try{update=await check(UPDATER_CHECK_OPTIONS)}catch(error){const x=classifyUpdaterError(error,'check');throw new Error(`${x.code}: ${updaterFailureMessage(x.code,x.detail)}`)}
    if(!update)return {none:true,current,latest:current,status:'UP_TO_DATE',endpoint:UPDATER_ENDPOINTS[0],versionComparison:updaterVersionStatus(current,current)} as any;
    let downloaded=0,total=0;
    return {version:update.version,date:update.date,body:update.body||'',current:update.currentVersion||current,latest:update.version,status:'AVAILABLE',endpoint:UPDATER_ENDPOINTS[0],versionComparison:updaterVersionStatus(update.currentVersion||current,update.version),install:async(onProgress?:(p:number)=>void,onStatus?:(s:string)=>void)=>{
      await invoke<string>('prepare_updater_tempdir');
      onStatus?.('DOWNLOADING');
      try{
        await update.downloadAndInstall((event:any)=>{
          if(event.event==='Started'){total=Number(event.data?.contentLength||0);downloaded=0;onProgress?.(0);onStatus?.('DOWNLOADING')}
          if(event.event==='Progress'){downloaded+=Number(event.data?.chunkLength||0);if(total>0)onProgress?.(Math.min(100,downloaded/total*100))}
          if(event.event==='Finished'){onProgress?.(100);onStatus?.('VERIFYING')}
        });
      }catch(error){const x=classifyUpdaterError(error,'download');throw new Error(`${x.code}: ${updaterFailureMessage(x.code,x.detail)}`)}
      onStatus?.('READY_TO_RESTART');
      try{await relaunch()}catch(error){const x=classifyUpdaterError(error,'relaunch');throw new Error(`${x.code}: ${updaterFailureMessage(x.code,x.detail)}`)}
    }};
  }
"""
replace_once('src/api.ts',old,new)

# App auto-check must never swallow updater errors; UpdateNotice writes Error Center detail.
replace_once('src/App.tsx',
"import {clearErrorHistory,readErrorHistory,removeErrorHistory,subscribeErrorHistory,type ErrorHistoryItem} from './errorHistory';",
"import {appendErrorHistory,clearErrorHistory,readErrorHistory,removeErrorHistory,subscribeErrorHistory,type ErrorHistoryItem} from './errorHistory';")
old_auto="useEffect(()=>{if(!booted||!settings.autoCheckUpdates)return;let live=true;const run=()=>api.checkUpdate().then(u=>{if(live&&u?.version){setUpdate(u);notifyInfo(`Доступно обновление VYRON YT PEISOV ${u.version}`,'Новая версия готова к установке.',{operationId:`update-available:${u.version}`});void notifyUpdateAvailable(String(u.version))}}).catch(()=>{});void run();const once=window.setTimeout(()=>void run(),30_000);const recurring=window.setInterval(()=>void run(),6*60*60_000);return()=>{live=false;window.clearTimeout(once);window.clearInterval(recurring)}},[booted,settings.autoCheckUpdates]);"
new_auto="useEffect(()=>{if(!booted||!settings.autoCheckUpdates)return;let live=true;const run=()=>api.checkUpdate().then(u=>{if(live&&u?.version){setUpdate(u);notifyInfo(`Доступно обновление VYRON YT PEISOV ${u.version}`,'Новая версия готова к установке.',{operationId:`update-available:${u.version}`});void notifyUpdateAvailable(String(u.version))}}).catch(e=>{const detail=String(e);appendErrorHistory('Updater: проверка обновлений не выполнена','Не удалось проверить или получить manifest обновления.',detail,{errorCode:detail.split(':')[0]||'UPDATER_MANIFEST_FETCH_FAILED'});notifyError('Не удалось проверить обновления',detail,{operationId:'updater-auto-check-error'})});void run();const once=window.setTimeout(()=>void run(),30_000);const recurring=window.setInterval(()=>void run(),6*60*60_000);return()=>{live=false;window.clearTimeout(once);window.clearInterval(recurring)}},[booted,settings.autoCheckUpdates]);"
replace_once('src/App.tsx',old_auto,new_auto)
old_notice="function UpdateNotice({update,onLater}:{update:any;onLater:()=>void}){const [progress,setProgress]=useState<number|null>(null),[error,setError]=useState('');return <aside className=\"updateNotice\"><div><i/><span><b>Новое обновление</b><small>VYRON YT PEISOV {update.version}</small></span></div><p>{String(update.body||'Доступна новая версия VYRON YT PEISOV.').split('\\n').slice(0,2).join(' • ')}</p>{progress!==null&&<div className=\"progress\"><i style={{width:`${progress}%`}}/><span>{progress.toFixed(0)}%</span></div>}{error&&<div className=\"errorBox\">{error}</div>}<footer><button disabled={progress!==null} onClick={onLater}>ПОЗЖЕ</button><button className=\"primary\" disabled={progress!==null} onClick={async()=>{setProgress(0);localStorage.setItem('vyron:update-installing-version',String(update.version));try{await update.install((p:number)=>setProgress(p))}catch(e){localStorage.removeItem('vyron:update-installing-version');setProgress(null);setError(String(e));notifyError('Не удалось установить обновление',String(e))}}}>ОБНОВИТЬ</button></footer></aside>}"
new_notice="function UpdateNotice({update,onLater}:{update:any;onLater:()=>void}){const [progress,setProgress]=useState<number|null>(null),[status,setStatus]=useState('AVAILABLE'),[error,setError]=useState('');return <aside className=\"updateNotice\"><div><i/><span><b>Новое обновление</b><small>VYRON YT PEISOV {update.version}</small></span></div><p>{String(update.body||'Доступна новая версия VYRON YT PEISOV.').split('\\n').slice(0,2).join(' • ')}</p><small>{status} • {update.endpoint||'updater endpoint'}</small>{progress!==null&&<div className=\"progress\"><i style={{width:`${progress}%`}}/><span>{progress.toFixed(0)}%</span></div>}{error&&<div className=\"errorBox\">{error}</div>}<footer><button disabled={progress!==null} onClick={onLater}>ПОЗЖЕ</button><button className=\"primary\" disabled={progress!==null} onClick={async()=>{setProgress(0);setStatus('DOWNLOADING');localStorage.setItem('vyron:update-installing-version',String(update.version));try{await update.install((p:number)=>setProgress(p),(s:string)=>setStatus(s))}catch(e){localStorage.removeItem('vyron:update-installing-version');setProgress(null);setStatus('ERROR');const detail=String(e);setError(detail);appendErrorHistory('Updater: обновление не установлено','Файл обновления не удалось скачать, проверить или установить.',detail,{errorCode:detail.split(':')[0]||'UPDATER_INSTALL_FAILED'});notifyError('Не удалось установить обновление',detail)}}}>ОБНОВИТЬ</button></footer></aside>}"
replace_once('src/App.tsx',old_notice,new_notice)

# Settings updater diagnostics and Error Center persistence.
replace_once('src/SettingsOS.tsx',
"import {humanizeError} from './errorCenter';",
"import {humanizeError} from './errorCenter';\nimport {appendErrorHistory} from './errorHistory';\nimport {UPDATER_ENDPOINTS} from './updaterPolicy';")
replace_once('src/SettingsOS.tsx',
"[update,setUpdate]=useState<any>(),[progress,setProgress]=useState<number|null>(null),[stage,setStage]=useState(''),",
"[update,setUpdate]=useState<any>(),[progress,setProgress]=useState<number|null>(null),[stage,setStage]=useState(''),[updaterStatus,setUpdaterStatus]=useState('UP_TO_DATE'),")
old_check="async function checkForUpdate(){try{const next=await api.checkUpdate();setUpdate(next);if(next?.none)notifySuccess('VYRON YT PEISOV обновлён',`Установлена актуальная версия ${next.current||installedVersion||'—'}.`,{operationId:`update-latest:${next.current||installedVersion}`});else if(next?.version)notifyInfo(`Доступно обновление VYRON YT PEISOV ${next.version}`,'Можно установить и перезапустить приложение.',{operationId:`settings-update:${next.version}`})}catch(e){const h=humanizeError(e,'update');setUpdate({error:h.detail});notifyError(h.title,h.message)}}"
new_check="async function checkForUpdate(){setUpdaterStatus('CHECKING');try{const next=await api.checkUpdate();setUpdate(next);if(next?.none){setUpdaterStatus('UP_TO_DATE');notifySuccess('VYRON YT PEISOV обновлён',`Установлена актуальная версия ${next.current||installedVersion||'—'}.`,{operationId:`update-latest:${next.current||installedVersion}`})}else if(next?.version){setUpdaterStatus('AVAILABLE');notifyInfo(`Доступно обновление VYRON YT PEISOV ${next.version}`,'Можно установить и перезапустить приложение.',{operationId:`settings-update:${next.version}`})}}catch(e){const h=humanizeError(e,'update'),detail=String(e);setUpdaterStatus('ERROR');setUpdate({error:h.detail});appendErrorHistory('Updater: проверка обновлений не выполнена',h.message,detail,{errorCode:detail.split(':')[0]||'UPDATER_MANIFEST_FETCH_FAILED'});notifyError(h.title,h.message)}}"
replace_once('src/SettingsOS.tsx',old_check,new_check)
old_install="async function installUpdate(){setProgress(0);setStage('Загрузка');localStorage.setItem('vyron:update-installing-version',String(update.version||''));try{await update.install((p:number)=>{setProgress(p);if(p>=100)setStage('Проверка подписи и установка')})}catch(e){localStorage.removeItem('vyron:update-installing-version');setProgress(null);setStage('Обновление не установлено. Текущая версия сохранена.');{const h=humanizeError(e,'update');notifyError(h.title,h.message)}}}"
new_install="async function installUpdate(){setProgress(0);setStage('Загрузка');setUpdaterStatus('DOWNLOADING');localStorage.setItem('vyron:update-installing-version',String(update.version||''));try{await update.install((p:number)=>{setProgress(p);if(p>=100){setStage('Проверка подписи и установка');setUpdaterStatus('VERIFYING')}},(s:string)=>setUpdaterStatus(s))}catch(e){localStorage.removeItem('vyron:update-installing-version');setProgress(null);setUpdaterStatus('ERROR');setStage('Обновление не установлено. Текущая версия сохранена.');const h=humanizeError(e,'update'),detail=String(e);appendErrorHistory('Updater: обновление не установлено',h.message,detail,{errorCode:detail.split(':')[0]||'UPDATER_INSTALL_FAILED'});notifyError(h.title,h.message)}}"
replace_once('src/SettingsOS.tsx',old_install,new_install)
old_ui="<div className=\"settingsInfoGrid\"><span><small>Текущая версия</small><b>{installedVersion||'—'}</b></span><span><small>Автопроверка</small><b>{s.autoCheckUpdates?'ON':'OFF'}</b></span></div>"
new_ui="<div className=\"settingsInfoGrid\"><span><small>Текущая версия</small><b>{installedVersion||'—'}</b></span><span><small>Последняя версия</small><b>{update?.latest||update?.version||update?.current||'—'}</b></span><span><small>Status</small><b>{updaterStatus}</b></span><span><small>Update endpoint</small><b>{UPDATER_ENDPOINTS[0].replace('https://','')}</b></span><span><small>Сравнение версий</small><b>{update?.versionComparison||'—'}</b></span><span><small>Автопроверка</small><b>{s.autoCheckUpdates?'ON':'OFF'}</b></span></div>"
replace_once('src/SettingsOS.tsx',old_ui,new_ui)

# Targeted tests for updater-only hotfix contracts.
write('src/updaterHotfix.test.ts',"""import {describe,expect,it} from 'vitest';
import {classifyUpdaterError,UPDATER_ENDPOINTS,updaterFailureMessage,updaterVersionStatus} from './updaterPolicy';

describe('VYRON 2.1.3 updater hotfix',()=>{
  it('uses canonical raw feed first and release latest as fallback',()=>{
    expect(UPDATER_ENDPOINTS[0]).toBe('https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json');
    expect(UPDATER_ENDPOINTS[1]).toBe('https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json');
  });
  it('reports same-version semantics explicitly',()=>expect(updaterVersionStatus('2.1.2','2.1.2')).toBe('current == latest'));
  it('classifies manifest fetch failures',()=>expect(classifyUpdaterError('network timeout','check').code).toBe('UPDATER_MANIFEST_FETCH_FAILED'));
  it('classifies archive download failures',()=>expect(classifyUpdaterError('connection reset','download').code).toBe('UPDATER_ARCHIVE_DOWNLOAD_FAILED'));
  it('rejects signature failures distinctly',()=>expect(classifyUpdaterError('signature verification failed','download').code).toBe('UPDATER_SIGNATURE_INVALID'));
  it('shows a concrete GitHub download failure message',()=>expect(updaterFailureMessage('UPDATER_ARCHIVE_DOWNLOAD_FAILED','HTTP 503')).toContain('GitHub'));
});
""")
print('VYRON 2.1.3 updater hotfix applied')
