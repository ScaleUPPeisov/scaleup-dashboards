import {useEffect,useState} from 'react';
import type {DistributionMode} from './productionManagerApi';

export type ProductionTab='queue'|'materials'|'manager';
export type ChannelProductionPrefs={projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;lastBatchId?:string;selectedProjectIds:string[];productionRoot?:string};
export type ProductionPrefs={version:2;selectedChannelId?:string;tab:ProductionTab;byChannel:Record<string,ChannelProductionPrefs>;selectedJobIds:string[];productionRoot?:string};
const KEY='vyron:production-manager:v2';
const EVENT='vyron-production-prefs-changed';
const defaults=():ProductionPrefs=>({version:2,tab:'queue',byChannel:{},selectedJobIds:[]});
export const defaultChannelProductionPrefs=():ChannelProductionPrefs=>({projectCount:30,tracksPerProject:15,mode:'even',allowImageReuse:false,selectedProjectIds:[]});
const isRecord=(x:unknown):x is Record<string,unknown>=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const positiveInt=(x:unknown,fallback:number)=>Number.isFinite(Number(x))&&Number(x)>0?Math.max(1,Math.floor(Number(x))):fallback;
const validMode=(x:unknown):DistributionMode=>x==='random'?'random':x==='alphabetical'?'alphabetical':x==='no-repeat'?'no-repeat':'even';
const validTab=(x:unknown):ProductionTab=>x==='materials'||x==='manager'?x:'queue';
function normalizeChannelPrefs(value:unknown):ChannelProductionPrefs{
  const base=defaultChannelProductionPrefs();
  if(!isRecord(value))return base;
  return{
    projectCount:positiveInt(value.projectCount,base.projectCount),
    tracksPerProject:positiveInt(value.tracksPerProject,base.tracksPerProject),
    mode:validMode(value.mode),
    allowImageReuse:value.allowImageReuse===true,
    lastBatchId:typeof value.lastBatchId==='string'&&value.lastBatchId.trim()?value.lastBatchId:undefined,
    selectedProjectIds:Array.isArray(value.selectedProjectIds)?value.selectedProjectIds.filter((x):x is string=>typeof x==='string'):[],
    productionRoot:typeof value.productionRoot==='string'?value.productionRoot:undefined
  };
}
function normalizePrefs(value:unknown):ProductionPrefs|undefined{
  if(!isRecord(value)||value.version!==2)return;
  const byChannel:Record<string,ChannelProductionPrefs>={};
  if(isRecord(value.byChannel))for(const [id,row] of Object.entries(value.byChannel))if(id)byChannel[id]=normalizeChannelPrefs(row);
  return{
    version:2,
    selectedChannelId:typeof value.selectedChannelId==='string'&&value.selectedChannelId.trim()?value.selectedChannelId:undefined,
    tab:validTab(value.tab),
    byChannel,
    selectedJobIds:Array.isArray(value.selectedJobIds)?value.selectedJobIds.filter((x):x is string=>typeof x==='string'):[],
    productionRoot:typeof value.productionRoot==='string'?value.productionRoot:undefined
  };
}

export function readProductionPrefs():ProductionPrefs{
  try{const parsed=normalizePrefs(JSON.parse(localStorage.getItem(KEY)||'null'));if(parsed)return parsed}catch{}
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
  const prev=readProductionPrefs();const raw=typeof p==='function'?p(prev):{...prev,...p,version:2 as const};const next=normalizePrefs(raw)||prev;emit(next);return next;
}
export function patchChannelProductionPrefs(channelId:string,p:Partial<ChannelProductionPrefs>){
  return patchProductionPrefs(s=>({...s,byChannel:{...s.byChannel,[channelId]:normalizeChannelPrefs({...defaultChannelProductionPrefs(),...(s.byChannel[channelId]||{}),...p})}}));
}
export function useProductionPrefs():[ProductionPrefs,(p:Partial<ProductionPrefs>|((s:ProductionPrefs)=>ProductionPrefs))=>void]{
  const [state,setState]=useState<ProductionPrefs>(()=>readProductionPrefs());
  useEffect(()=>{const fn=(e:Event)=>setState(normalizePrefs((e as CustomEvent<ProductionPrefs>).detail)||readProductionPrefs());window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)},[]);
  return[state,p=>{const next=patchProductionPrefs(p);setState(next)}];
}
