export type NotificationType='success'|'info'|'warning'|'error';
export type NotificationAction={label:string;onClick:()=>void;closeAfter?:boolean};
export type AppNotification={id:string;operationId?:string;type:NotificationType;title:string;message?:string;durationMs:number|null;actions:NotificationAction[];createdAt:number};
export type NotificationOptions={operationId?:string;durationMs?:number|null;actions?:NotificationAction[]};
const EVENT='vyron:notification-center';
const seen=new Map<string,number>();
const defaults:Record<NotificationType,number|null>={success:5000,info:7000,warning:9000,error:null};
function cleanSeen(now:number){for(const[k,t]of seen)if(now-t>60*60_000)seen.delete(k);if(seen.size>500){for(const k of [...seen.keys()].slice(0,seen.size-400))seen.delete(k)}}
export function notify(type:NotificationType,title:string,message='',options:NotificationOptions={}){
  const now=Date.now();cleanSeen(now);
  if(options.operationId){if(seen.has(options.operationId))return;seen.set(options.operationId,now)}
  const detail:AppNotification={id:crypto.randomUUID(),operationId:options.operationId,type,title,message,durationMs:options.durationMs===undefined?defaults[type]:options.durationMs,actions:options.actions||[],createdAt:now};
  window.dispatchEvent(new CustomEvent<AppNotification>(EVENT,{detail}));
}
export const notifySuccess=(title:string,message='',options:NotificationOptions={})=>notify('success',title,message,options);
export const notifyInfo=(title:string,message='',options:NotificationOptions={})=>notify('info',title,message,options);
export const notifyWarning=(title:string,message='',options:NotificationOptions={})=>notify('warning',title,message,options);
export const notifyError=(title:string,message='',options:NotificationOptions={})=>notify('error',title,message,options);
export function notifyLegacy(message:string){
  const m=String(message||'').trim();if(!m)return;
  const lower=m.toLocaleLowerCase('ru-RU');
  if(m.startsWith('✓'))return notifySuccess(m.replace(/^✓\s*/,''));
  if(m.startsWith('⚠')||m.startsWith('⏸')||lower.includes('недостаточно')||lower.includes('квота'))return notifyWarning(m.replace(/^[⚠⏸]\s*/,''));
  if(m.startsWith('✕')||lower.includes('не удалось')||lower.includes('ошиб')||lower.includes('недоступ'))return notifyError(m.replace(/^✕\s*/,''));
  notifyInfo(m);
}
export function subscribeNotifications(cb:(n:AppNotification)=>void){const fn=(e:Event)=>cb((e as CustomEvent<AppNotification>).detail);window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)}
