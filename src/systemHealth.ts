import type {Channel,VideoJob,YoutubeProfile} from './types';
import type {ChannelInventorySnapshot} from './renderInventoryRuntime';

export type HealthState='GREEN'|'YELLOW'|'RED'|'GRAY';
export type HealthItem={id:string;label:string;state:HealthState;detail:string;weight:number};
export type SystemHealthSnapshot={score:number;items:HealthItem[]};

const oauthHealthy=new Set(['READY','WORKING','CONNECTED']);
const oauthBad=new Set(['RECONNECT_REQUIRED','MISSING','WRONG_CHANNEL','FAILED','KEYCHAIN_ERROR','KEYCHAIN_BLOCKED']);

export function buildSystemHealth(input:{
 channels:Channel[];profiles:YoutubeProfile[];snapshots:Record<string,ChannelInventorySnapshot>;jobs:VideoJob[];
 updaterStatus:string;quotaUsed?:number;quotaLimit?:number;workspace?:string;endlumePath?:string;booted:boolean;
}):SystemHealthSnapshot{
 const enabled=input.channels.filter(c=>c.enabled!==false),profilesById=new Map(input.profiles.map(p=>[p.id,p]));
 const linked=enabled.filter(c=>c.youtubeProfileId),oauthRows=linked.map(c=>profilesById.get(c.youtubeProfileId!)).filter(Boolean) as YoutubeProfile[];
 const oauthRed=oauthRows.filter(p=>oauthBad.has(String(p.credentialStatus||''))).length;
 const oauthGreen=oauthRows.filter(p=>oauthHealthy.has(String(p.credentialStatus||''))).length;
 const oauthState:HealthState=!linked.length?'GRAY':oauthRed?'RED':oauthGreen===linked.length?'GREEN':'YELLOW';
 const renderConfigured=enabled.filter(c=>Boolean(c.renderFolderPath)).length;
 const renderUnavailable=enabled.filter(c=>{const x=input.snapshots[c.id];return Boolean(c.renderFolderPath)&&x&&(x.folderState==='OFFLINE'||x.folderState==='ERROR')}).length;
 const renderState:HealthState=!enabled.length?'GRAY':renderUnavailable?'RED':renderConfigured===enabled.length?'GREEN':'YELLOW';
 const jobErrors=input.jobs.filter(j=>j.status==='ERROR').length;
 const uploadState:HealthState=jobErrors?'RED':'GREEN';
 const updaterState:HealthState=input.updaterStatus==='ERROR'?'RED':['AVAILABLE','DOWNLOADING','VERIFYING','READY_TO_INSTALL'].includes(input.updaterStatus)?'YELLOW':input.updaterStatus?'GREEN':'GRAY';
 const quotaKnown=Number.isFinite(input.quotaUsed)&&Number.isFinite(input.quotaLimit)&&Number(input.quotaLimit)>0;
 const quotaPct=quotaKnown?Number(input.quotaUsed)/Number(input.quotaLimit):undefined;
 const quotaState:HealthState=quotaPct==null?'GRAY':quotaPct>=.9?'RED':quotaPct>=.68?'YELLOW':'GREEN';
 const items:HealthItem[]=[
  {id:'oauth',label:'YouTube OAuth',state:oauthState,detail:linked.length?(oauthGreen+' / '+linked.length+' подтверждено'):'Нет подключённых каналов',weight:20},
  {id:'storage',label:'Local storage',state:input.workspace?'GREEN':'YELLOW',detail:input.workspace?'Workspace настроен':'Workspace не настроен',weight:15},
  {id:'render',label:'Render folders',state:renderState,detail:(renderConfigured+' / '+enabled.length+' настроено'+(renderUnavailable?' • недоступно '+renderUnavailable:'')),weight:15},
  {id:'uploads',label:'Upload queue',state:uploadState,detail:jobErrors?('Активных ошибок: '+jobErrors):'Активных job-ошибок нет',weight:15},
  {id:'updater',label:'Updater',state:updaterState,detail:input.updaterStatus||'Нет данных',weight:10},
  {id:'persistence',label:'Database / persistence',state:input.booted?'GREEN':'GRAY',detail:input.booted?'State загружен':'State ещё не загружен',weight:10},
  {id:'quota',label:'YouTube API',state:quotaState,detail:quotaKnown?(String(input.quotaUsed)+' / '+String(input.quotaLimit)):'Нет данных',weight:10},
  {id:'endlume',label:'ENDLUME',state:input.endlumePath?'GREEN':'GRAY',detail:input.endlumePath?'Путь настроен':'Нет данных',weight:5}
 ];
 const factor=(s:HealthState)=>s==='GREEN'?1:s==='YELLOW'?0.55:s==='RED'?0:0.25;
 const score=Math.round(items.reduce((n,x)=>n+x.weight*factor(x.state),0));
 return{score,items}
}
