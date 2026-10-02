import React,{Profiler,type ReactNode} from 'react';

export type PaintProfilerEntry={
 id:string;
 phase:string;
 actualDuration:number;
 baseDuration:number;
 startTime:number;
 commitTime:number;
};

const enabled=import.meta.env.VITE_YT_PAINT_DIAG==='1';
let entries:PaintProfilerEntry[]=[];

export function YoutubePaintProfiler({id,children}:{id:string;children:ReactNode}){
 if(!enabled)return <>{children}</>;
 return <Profiler id={id} onRender={(profileId,phase,actualDuration,baseDuration,startTime,commitTime)=>{
  entries.push({id:profileId,phase:String(phase),actualDuration,baseDuration,startTime,commitTime});
 }}>{children}</Profiler>
}

export function resetYoutubePaintProfiler(){entries=[]}

export function youtubePaintProfilerSnapshot(){
 return entries.map(x=>({...x}))
}
