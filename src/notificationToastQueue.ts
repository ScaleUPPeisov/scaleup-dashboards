import type {AppNotification} from './notificationCenter';

const MAX_VISIBLE=2;
const PRESENT_INTERVAL_MS=350;
const UPDATE_COALESCE_MS=100;
type Item={notice:AppNotification;members:Map<string,number>};

/** Presentation queue only. Individual notifications remain in the durable history. */
export function createNotificationToastQueue(onChange:(visible:AppNotification[],waitingCount:number)=>void){
 let visible:Item[]=[],waiting:Item[]=[],lastPresented=-Infinity,disposed=false;
 let presentTimer:ReturnType<typeof setTimeout>|undefined,updateTimer:ReturnType<typeof setTimeout>|undefined;
 const items=()=>[...visible,...waiting];
 const publish=()=>{
  if(disposed||updateTimer!==undefined)return;
  updateTimer=setTimeout(()=>{updateTimer=undefined;if(!disposed)onChange(visible.map(x=>x.notice),waiting.length)},UPDATE_COALESCE_MS);
 };
 const present=()=>{
  if(disposed||presentTimer!==undefined||visible.length>=MAX_VISIBLE||!waiting.length)return;
  const delay=Math.max(0,lastPresented+PRESENT_INTERVAL_MS-Date.now());
  if(delay){presentTimer=setTimeout(()=>{presentTimer=undefined;present()},delay);return}
  const next=waiting.shift();if(!next)return;
  visible.push(next);lastPresented=Date.now();publish();present();
 };
 const enqueue=(notice:AppNotification)=>{
  if(disposed)return;
  // An operation update replaces its own toast and does not inflate a group.
  if(notice.operationId){
   const existing=items().find(x=>x.members.has(notice.operationId!)&&x.notice.type===notice.type&&notice.type!=='error'&&notice.type!=='warning'&&x.notice.actions.length===0&&notice.actions.length===0);
   if(existing){
    if(existing.members.size===1)existing.notice=notice;
    publish();return;
   }
  }
  // Group only explicitly opted-in, noncritical events with no individual
  // actions: an aggregated toast must not discard a specific action.
  const canGroup=Boolean(notice.groupKey)&&notice.actions.length===0&&(notice.type==='info'||notice.type==='success');
  const group=canGroup?items().find(x=>x.notice.groupKey===notice.groupKey&&x.notice.type===notice.type&&x.notice.actions.length===0):undefined;
  if(group){
   group.members.set(notice.operationId||notice.id,notice.groupCount||1);
   group.notice={...group.notice,groupCount:[...group.members.values()].reduce((sum,count)=>sum+count,0),groupEntries:group.members.size};
   publish();return;
  }
  const item:Item={notice,members:new Map([[notice.operationId||notice.id,notice.groupCount||1]])};
  // Errors are never collapsed or discarded and appear ahead of queued
  // noncritical notifications. Already visible toasts remain stable.
  if(notice.type==='error'){
   const index=waiting.findIndex(x=>x.notice.type!=='error');
   if(index<0)waiting.push(item);else waiting.splice(index,0,item);
  }else waiting.push(item);
  present();publish();
 };
 const close=(id:string)=>{
  if(disposed)return;
  const previous=visible.length;visible=visible.filter(x=>x.notice.id!==id);
  if(previous!==visible.length){publish();present()}
 };
 const dispose=()=>{
  disposed=true;
  if(presentTimer!==undefined)clearTimeout(presentTimer);
  if(updateTimer!==undefined)clearTimeout(updateTimer);
  visible=[];waiting=[];
 };
 return{enqueue,close,dispose};
}
