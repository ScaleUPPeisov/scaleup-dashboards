export const WINDOWS_UPDATER_PLATFORM='windows-x86_64' as const;
export const MACOS_UPDATER_PLATFORM='darwin-aarch64' as const;

const WINDOWS_FEED='https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/windows-latest.json';
const SHARED_MAC_FEED='https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json';
const MAC_FALLBACK_FEED='https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json';

export function updaterEndpointsForUserAgent(userAgent:string){
  return /Windows/i.test(userAgent)
    ? [WINDOWS_FEED,SHARED_MAC_FEED] as const
    : [SHARED_MAC_FEED,MAC_FALLBACK_FEED] as const;
}
const runtimeUserAgent=typeof navigator!=='undefined'?navigator.userAgent:'Windows';
export const UPDATER_ENDPOINTS=updaterEndpointsForUserAgent(runtimeUserAgent);

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
  if(stage==='relaunch')return{code:'UPDATER_RESTART_FAILED',detail};
  return{code:'UPDATER_INSTALL_FAILED',detail};
}

export function updaterFailureMessage(code:string,detail:string){
  if(code==='UPDATER_ARCHIVE_DOWNLOAD_FAILED')return `Не удалось скачать файл обновления с GitHub. ${detail}`;
  if(code==='UPDATER_MANIFEST_FETCH_FAILED')return `Не удалось проверить обновление. ${detail}`;
  if(code==='UPDATER_SIGNATURE_INVALID')return `Проверка подписи обновления не пройдена. ${detail}`;
  if(code==='UPDATER_PLATFORM_NOT_FOUND')return `Для этой платформы обновление пока не опубликовано. ${detail}`;
  if(code==='UPDATER_RESTART_FAILED')return `Обновление установлено, но VYRON не удалось перезапустить автоматически. ${detail}`;
  return `Не удалось установить обновление. ${detail}`;
}
