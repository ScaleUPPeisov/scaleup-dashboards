import {startTransition,useEffect,useState} from 'react';

export type RouteMountDiagnostic={label:string;stage:number;frameMs:number;overBudget:boolean;at:number};
const BUDGET_MS=25;
const MAX_SAMPLES=120;
const samples:RouteMountDiagnostic[]=[];

export function readRouteMountDiagnostics(){return [...samples]}
export function resetRouteMountDiagnostics(){samples.splice(0,samples.length)}

function record(label:string,stage:number,frameMs:number){
 const sample={label,stage,frameMs,overBudget:frameMs>BUDGET_MS,at:Date.now()};
 samples.push(sample);
 if(samples.length>MAX_SAMPLES)samples.splice(0,samples.length-MAX_SAMPLES);
 if(sample.overBudget)console.warn('[VYRON_ROUTE_MOUNT_BUDGET]',sample)
}

/**
 * Progressive real-UI mounting: one structural chunk per animation frame.
 * This is route-agnostic production behavior; it never reads performance-probe flags
 * and it never changes measurement semantics or thresholds.
 */
export function useProgressiveRouteContent(label:string,maxStage:number,active=true){
 const [stage,setStage]=useState(0);
 useEffect(()=>{
  let cancelled=false,raf=0,nextStage=0,previous=performance.now();
  setStage(0);
  if(!active||maxStage<=0)return()=>{};
  const advance=(now:number)=>{
   if(cancelled)return;
   if(nextStage>0)record(label,nextStage,now-previous);
   if(nextStage>=maxStage)return;
   nextStage++;
   previous=now;
   startTransition(()=>setStage(nextStage));
   raf=requestAnimationFrame(advance);
  };
  raf=requestAnimationFrame(advance);
  return()=>{cancelled=true;if(raf)cancelAnimationFrame(raf)}
 },[label,maxStage,active]);
 return active?stage:0
}
