export const UPDATER_ENDPOINTS=[
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


export function compareUpdaterVersions(left:string,right:string){
  const parse=(value:string)=>{
    const [core,pre='']=value.replace(/^v/,'').split('-',2);
    const nums=core.split('.').map(x=>Number(x));
    return {nums:[nums[0]||0,nums[1]||0,nums[2]||0],pre:pre?pre.split('.'):[]};
  };
  const a=parse(left),b=parse(right);
  for(let i=0;i<3;i++){if(a.nums[i]!==b.nums[i])return a.nums[i]<b.nums[i]?-1:1}
  if(!a.pre.length&&!b.pre.length)return 0;
  if(!a.pre.length)return 1;
  if(!b.pre.length)return -1;
  const length=Math.max(a.pre.length,b.pre.length);
  for(let i=0;i<length;i++){
    const x=a.pre[i],y=b.pre[i];
    if(x===undefined)return -1;if(y===undefined)return 1;if(x===y)continue;
    const xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    if(xn&&yn)return Number(x)<Number(y)?-1:1;
    if(xn!==yn)return xn?-1:1;
    return x<y?-1:1;
  }
  return 0;
}

export function updaterVersionStatus(current:string,latest:string){
  return current===latest?'current == latest':`current ${current} -> latest ${latest}`;
}

export function classifyUpdaterError(error:unknown,stage:UpdaterStage){
  const detail=String(error??'');
  const s=detail.toLowerCase();
  if(s.includes('running_from_dmg')||s.includes('запущен из установочного образа'))return{code:'RUNNING_FROM_DMG',detail};
  if(s.includes('app_not_replaceable')||s.includes('bundle не найден')||s.includes('нет записи на том'))return{code:'APP_NOT_REPLACEABLE',detail};
  if(s.includes('signature')||s.includes('minisign')||s.includes('public key'))return{code:'UPDATER_SIGNATURE_INVALID',detail};
  if(s.includes('platform')||s.includes('darwin-aarch64')&&s.includes('not found'))return{code:'UPDATER_PLATFORM_NOT_FOUND',detail};
  if(stage==='check')return{code:'UPDATER_MANIFEST_FETCH_FAILED',detail};
  if(stage==='download')return{code:'UPDATER_ARCHIVE_DOWNLOAD_FAILED',detail};
  if(stage==='relaunch')return{code:'UPDATER_RESTART_FAILED',detail};
  return{code:'UPDATER_INSTALL_FAILED',detail};
}

export function updaterFailureMessage(code:string,detail:string){
  if(code==='RUNNING_FROM_DMG')return 'VYRON запущен из установочного образа. Переместите VYRON в Applications один раз и повторите обновление.';
  if(code==='APP_NOT_REPLACEABLE')return `Установленный VYRON.app нельзя безопасно заменить. Проверьте, что приложение находится в Applications и доступно для записи. ${detail}`;
  if(code==='UPDATER_ARCHIVE_DOWNLOAD_FAILED')return `Не удалось скачать файл обновления с GitHub. ${detail}`;
  if(code==='UPDATER_MANIFEST_FETCH_FAILED')return `Не удалось проверить обновление. ${detail}`;
  if(code==='UPDATER_SIGNATURE_INVALID')return `Проверка подписи обновления не пройдена. ${detail}`;
  if(code==='UPDATER_PLATFORM_NOT_FOUND')return `В manifest нет совместимой сборки darwin-aarch64. ${detail}`;
  if(code==='UPDATER_RESTART_FAILED')return `Обновление установлено, но VYRON не удалось перезапустить автоматически. ${detail}`;
  return `Не удалось установить обновление. ${detail}`;
}
