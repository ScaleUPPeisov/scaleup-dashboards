/** Keep presentation clocks asleep while their window is hidden. */
export function startVisibleTicker(
 documentLike:Pick<Document,'visibilityState'|'addEventListener'|'removeEventListener'>,
 timers:Pick<Window,'setInterval'|'clearInterval'>,
 tick:()=>void,
 intervalMs:number,
){
 let timer:number|undefined;
 const update=()=>{
  if(timer!==undefined){timers.clearInterval(timer);timer=undefined}
  if(documentLike.visibilityState==='hidden')return;
  tick();
  timer=timers.setInterval(tick,intervalMs);
 };
 documentLike.addEventListener('visibilitychange',update);
 update();
 return()=>{if(timer!==undefined)timers.clearInterval(timer);documentLike.removeEventListener('visibilitychange',update)};
}
