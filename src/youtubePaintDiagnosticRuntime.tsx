import React,{Profiler} from 'react';

export type YoutubePaintVariant=
  'production'|'production-minimal'|'shell'|'channelbar'|'publisher-shell'|
  'picker0'|'picker6'|'picker12'|'picker24'|'select1'|'select2';

export type YoutubePaintProfileRow={
  id:string;phase:'mount'|'update'|'nested-update';
  actualDuration:number;baseDuration:number;startTime:number;commitTime:number
};

let variant:YoutubePaintVariant='production';
let rows:YoutubePaintProfileRow[]=[];

export function youtubePaintDiagnosticEnabled(){
  return Boolean((import.meta as any).env?.VITE_YT_PAINT_DIAG==='1')
}
export function setYoutubePaintVariant(next:YoutubePaintVariant){variant=next}
export function youtubePaintVariant(){return variant}
export function clearYoutubePaintProfiles(){rows=[]}
export function youtubePaintProfiles(){return rows.slice()}
export function recordYoutubePaintProfile(id:string,phase:'mount'|'update'|'nested-update',actualDuration:number,baseDuration:number,startTime:number,commitTime:number){
  rows.push({id,phase,actualDuration,baseDuration,startTime,commitTime})
}
export function YoutubePaintProfiler({id,children}:{id:string;children:React.ReactNode}){
  if(!youtubePaintDiagnosticEnabled())return <>{children}</>;
  return <Profiler id={id} onRender={(pid,phase,actualDuration,baseDuration,startTime,commitTime)=>recordYoutubePaintProfile(pid,phase,actualDuration,baseDuration,startTime,commitTime)}>{children}</Profiler>
}
