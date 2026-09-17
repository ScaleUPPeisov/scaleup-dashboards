import {useEffect,useState} from 'react';
import type {DistributionMode} from './productionManagerApi';

export type ProductionTab='queue'|'materials'|'manager';
export type ChannelProductionPrefs={projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;lastBatchId?:string;selectedProjectIds:string[];productionRoot?:string};
export type ProductionPrefs={version:2;selectedChannelId?:string;tab:ProductionTab;byChannel:Record<string,ChannelProductionPrefs>;selectedJobIds:string[];productionRoot?:string};
const KEY='vyron:production-manager:v2';
const EVENT='vyron-production-prefs-changed';
const defaults=():ProductionPrefs=>({version:2,tab:'queue',byChannel:{},selectedJobIds:[]});
export const defaultChannelProductionPrefs=():ChannelProductionPrefs=>({projectCount:30,tracksPerProject:15,mode:'even',allowImageReuse:false,selectedProjectIds:[]});

export function readProductionPrefs():ProductionPrefs{
  try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x?.version===2)return{...defaults(),...x,byChannel:x.byChannel||{},selectedJobIds:Array.isArray(x.selectedJobIds)?x.selectedJobIds:[]}}catch{}
  const next=defaults();
  try{const old=JSON.parse(localStorage.getItem('vyron:production-workspace:v1')||'null');if(old?.selectedChannelId)next.selectedChannelId=String(old.selectedChannelId)}catch{}
  try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}
  return next;
}
function emit(next:ProductionPrefs){try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}window.dispatchEvent(new CustomEvent(EVENT,{detail:next}))}
export function resolveProductionRootFromPrefs(prefs:ProductionPrefs,channelId:string|undefined,fallback:string):string{
  const channelRoot=channelId?prefs.byChannel[channelId]?.productionRoot:undefined;
  return (channelRoot||prefs.productionRoot||fallback||'').trim();
}
export function resolveProductionRoot(channelId:string|undefined,fallback:string):string{
  return resolveProductionRootFromPrefs(readProductionPrefs(),channelId,fallback);
}

export function patchProductionPrefs(p:Partial<ProductionPrefs>|((s:ProductionPrefs)=>ProductionPrefs)){
  const prev=readProductionPrefs();const next=typeof p==='function'?p(prev):{...prev,...p,version:2 as const};emit(next);return next;
}
export function patchChannelProductionPrefs(channelId:string,p:Partial<ChannelProductionPrefs>){
  return patchProductionPrefs(s=>({...s,byChannel:{...s.byChannel,[channelId]:{...defaultChannelProductionPrefs(),...(s.byChannel[channelId]||{}),...p}}}));
}
export function useProductionPrefs():[ProductionPrefs,(p:Partial<ProductionPrefs>|((s:ProductionPrefs)=>ProductionPrefs))=>void]{
  const [state,setState]=useState<ProductionPrefs>(()=>readProductionPrefs());
  useEffect(()=>{const fn=(e:Event)=>setState((e as CustomEvent<ProductionPrefs>).detail||readProductionPrefs());window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)},[]);
  return[state,p=>{const next=patchProductionPrefs(p);setState(next)}];
}
