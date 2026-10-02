import {startTransition,useEffect,useState} from 'react';

const STABLE_ROUTE_DWELL_MS=80;

/**
 * Mount secondary route content only after the user has actually remained on the route.
 * Rapid navigation cancels this work instead of paying DOM/layout/derived-data cost for a
 * screen the user has already left. Once stable, work is scheduled in an idle slice when
 * available. No probe/metric semantics are consulted here.
 */
export function useStableRouteContent(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let disposed=false;
  let idleHandle:number|undefined;
  const reveal=()=>{if(disposed)return;startTransition(()=>setReady(true))};
  const timer=window.setTimeout(()=>{
   if(disposed)return;
   const w=window as typeof window&{
    requestIdleCallback?:(cb:()=>void,opts?:{timeout:number})=>number;
    cancelIdleCallback?:(id:number)=>void;
   };
   if(typeof w.requestIdleCallback==='function')idleHandle=w.requestIdleCallback(reveal,{timeout:120});
   else reveal();
  },STABLE_ROUTE_DWELL_MS);
  return()=>{
   disposed=true;
   window.clearTimeout(timer);
   const w=window as typeof window&{cancelIdleCallback?:(id:number)=>void};
   if(idleHandle!==undefined&&typeof w.cancelIdleCallback==='function')w.cancelIdleCallback(idleHandle);
  }
 },[]);
 return ready
}
