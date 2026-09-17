import {useEffect,useState} from 'react';
import type {DistributionMode} from './productionManagerApi';

export type ProductionTab='queue'|'materials'|'manager';
export type ChannelProductionPrefs={projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;lastBatchId?:string;selectedProjectIds:string[];productionRoot?:string};
export type ProductionPrefs={version:2;selectedChannelId?:string;tab:ProductionTab;byChannel:Record<string,ChannelProductionPrefs>;selectedJobIds:string[];productionRoot?:string};
const KEY='vyron:production-manager:v2';
const EVENT='vyron-production-prefs-changed';
const defaults=():ProductionPrefs=>({version:2,tab:'queue',byChannel:{},selectedJobIds:[]});
export const defaultChannelProductionPrefs=():ChannelProductionPrefs=>({projectCount:30,tracksPerProject:15,mode:'even',allowImageReuse:false,selectedProjectIds:[]});
const VALID_TABS=new Set<ProductionTab>(['queue','materials','manager']);
const VALID_MODES=new Set<DistributionMode>(['even','random','alphabetical','no-repeat']);

const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const safeString=(value:unknown)=>typeof value==='string'&&value.trim()?value:undefined;
const safeStringArray=(value:unknown)=>Array.isArray(value)?value.filter((x):x is string=>typeof x==='string').map(x=>x.trim()).filter(Boolean):[];
function safePositiveInt(value:unknown,fallback:number,max=1000){
  const n=typeof value==='number'?value:Number.NaN;
  return Number.isFinite(n)&&n>0?Math.min(max,Math.max(1,Math.floor(n))):fallback;
}
function normalizeChannelPrefs(value:unknown):ChannelProductionPrefs{
  const d=defaultChannelProductionPrefs(),raw=isRecord(value)?value:{};
  return{
    projectCount:safePositiveInt(raw.projectCount,d.projectCount,300),
    tracksPerProject:safePositiveInt(raw.tracksPerProject,d.tracksPerProject,500),
    mode:VALID_MODES.has(raw.mode as DistributionMode)?raw.mode as DistributionMode:d.mode,
    allowImageReuse:raw.allowImageReuse===true,
    lastBatchId:safeString(raw.lastBatchId),
    selectedProjectIds:safeStringArray(raw.selectedProjectIds),
    productionRoot:safeString(raw.productionRoot)
  };
}
function normalizeProductionPrefs(value:unknown):ProductionPrefs{
  const d=defaults(),raw=isRecord(value)?value:{};
  const byChannel:Record<string,ChannelProductionPrefs>={};
  if(isRecord(raw.byChannel))for(const [id,prefs] of Object.entries(raw.byChannel))if(id.trim())byChannel[id]=normalizeChannelPrefs(prefs);
  return{
    version:2,
    selectedChannelId:safeString(raw.selectedChannelId),
    tab:VALID_TABS.has(raw.tab as ProductionTab)?raw.tab as ProductionTab:d.tab,
    byChannel,
    selectedJobIds:safeStringArray(raw.selectedJobIds),
    productionRoot:safeString(raw.productionRoot)
  };
}

export function readProductionPrefs():ProductionPrefs{
  try{
    const x=JSON.parse(localStorage.getItem(KEY)||'null');
    if(isRecord(x)&&x.version===2)return normalizeProductionPrefs(x);
  }catch{}
  const next=defaults();
  try{
    const old=JSON.parse(localStorage.getItem('vyron:production-workspace:v1')||'null');
    if(isRecord(old)){const selected=safeString(old.selectedChannelId);if(selected)next.selectedChannelId=selected}
  }catch{}
  try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}
  return next;
}
function emit(next:ProductionPrefs){const safe=normalizeProductionPrefs(next);try{localStorage.setItem(KEY,JSON.stringify(safe))}catch{}window.dispatchEvent(new CustomEvent(EVENT,{detail:safe}));return safe}
export function resolveProductionRootFromPrefs(prefs:ProductionPrefs,channelId:string|undefined,fallback:string):string{
  const safe=normalizeProductionPrefs(prefs);
  const channelRoot=channelId?safe.byChannel[channelId]?.productionRoot:undefined;
  return String(channelRoot||safe.productionRoot||fallback||'').trim();
}
export function resolveProductionRoot(channelId:string|undefined,fallback:string):string{
  return resolveProductionRootFromPrefs(readProductionPrefs(),channelId,fallback);
}

export function patchProductionPrefs(p:Partial<ProductionPrefs>|((s:ProductionPrefs)=>ProductionPrefs)){
  const prev=readProductionPrefs();
  const candidate=typeof p==='function'?p(prev):{...prev,...p,version:2 as const};
  return emit(normalizeProductionPrefs(candidate));
}
export function patchChannelProductionPrefs(channelId:string,p:Partial<ChannelProductionPrefs>){
  return patchProductionPrefs(s=>({...s,byChannel:{...s.byChannel,[channelId]:normalizeChannelPrefs({...defaultChannelProductionPrefs(),...(s.byChannel[channelId]||{}),...p})}}));
}
export function useProductionPrefs():[ProductionPrefs,(p:Partial<ProductionPrefs>|((s:ProductionPrefs)=>ProductionPrefs))=>void]{
  const [state,setState]=useState<ProductionPrefs>(()=>readProductionPrefs());
  useEffect(()=>{const fn=(e:Event)=>setState(normalizeProductionPrefs((e as CustomEvent<ProductionPrefs>).detail||readProductionPrefs()));window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)},[]);
  return[state,p=>{const next=patchProductionPrefs(p);setState(next)}];
}
