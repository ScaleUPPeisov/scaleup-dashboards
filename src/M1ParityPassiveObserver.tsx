import {useEffect} from 'react';
import {api} from './api';
import {useApp} from './store';

type CssVariant='base'|'shadows'|'gradients'|'transitions'|'filters'|'opaque'|'pseudo'|'filters_opaque';
type PassiveAudit={
  enabled:boolean;
  youtubeEntries:number;
  youtubeExits:number;
  currentPageBeforeEnteringYoutube?:string;
  channels?:number;
  jobs?:number;
  assignedJobs?:number;
  fpsMonitorSetting?:boolean;
  activeYouTubeTab?:string;
  visibleYoutubeDomCount?:number;
  variantRequested?:CssVariant;
  variantApplied?:CssVariant;
  variantAppliedAt?:number;
  variantAppliedAtIso?:string;
  firstYoutubeNavigationAt?:number;
  variantAppliedBeforeFirstYoutube?:boolean;
  variantRuleCount?:number;
  variantError?:string;
};

const ROOTS=['.youtubeCenterHead','.youtubeChannelBar','.youtubeMasterTabs','.youtubeChannelContext'];
const TARGET=ROOTS.flatMap(root=>[root,root+' *']).join(',');

function cssForVariant(variant:CssVariant){
  if(variant==='base')return '';
  if(variant==='shadows')return TARGET+'{box-shadow:none!important;text-shadow:none!important}';
  if(variant==='gradients')return TARGET+'{background-image:none!important}';
  if(variant==='transitions')return TARGET+'{transition:none!important;animation:none!important}';
  if(variant==='filters')return TARGET+'{filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
  const opaqueCss=[
    '.youtubeChannelContext{--os-panel:rgb(9,22,35);--os-panel2:rgb(11,27,43)}',
    '.youtubeChannelBar{background-color:rgb(6,22,34)!important}',
    '.youtubeMasterTabs{background-color:rgb(4,13,23)!important}',
    '.youtubeMasterTabs button.active{background-color:rgb(14,37,45)!important}',
    '.youtubeChannelSearch,.youtubeRecentChannels button{background-color:rgb(10,19,29)!important}',
    '.youtubeChannelStats>span{background-color:rgb(8,29,42)!important}'
  ].join('\n');
  if(variant==='opaque')return opaqueCss;
  if(variant==='filters_opaque')return TARGET+'{filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}\n'+opaqueCss;
  // Current exact-workload census has zero decorative YouTube pseudo-elements.
  // Keep PSEUDO as an explicit no-op rather than removing semantic generated content.
  return '';
}

function ruleCount(css:string){return css?css.split('\n').filter(Boolean).length:0}

function captureYoutubeDom(){
  const nodes=new Set<Element>();
  for(const selector of ROOTS){
    for(const root of Array.from(document.querySelectorAll(selector))){
      nodes.add(root);
      for(const child of Array.from(root.querySelectorAll('*')))nodes.add(child);
    }
  }
  const active=document.querySelector<HTMLButtonElement>('.youtubeMasterTabs button.active');
  return{
    activeYouTubeTab:(active?.textContent||'').trim(),
    visibleYoutubeDomCount:nodes.size
  };
}

export function M1ParityPassiveObserver(){
  useEffect(()=>{
    let disposed=false;
    let style:HTMLStyleElement|undefined;
    const audit:PassiveAudit={enabled:true,youtubeEntries:0,youtubeExits:0};
    (window as any).__VYRON_M1_PARITY_PASSIVE__=audit;

    const unsubscribe=useApp.subscribe((state,previous)=>{
      if(state.page==='youtube'&&previous.page!=='youtube'){
        audit.youtubeEntries++;
        const now=performance.now();
        if(audit.firstYoutubeNavigationAt===undefined){
          audit.firstYoutubeNavigationAt=now;
          audit.variantAppliedBeforeFirstYoutube=
            audit.variantAppliedAt!==undefined&&audit.variantAppliedAt<=now;
        }
        if(!audit.currentPageBeforeEnteringYoutube)audit.currentPageBeforeEnteringYoutube=String(previous.page);
        audit.channels=state.channels.length;
        audit.jobs=state.jobs.length;
        audit.assignedJobs=state.jobs.filter(j=>j.metadataSource==='queue'&&j.metadataLocked).length;
        audit.fpsMonitorSetting=state.settings.fpsMonitor===true;
      }
      if(previous.page==='youtube'&&state.page!=='youtube'){
        audit.youtubeExits++;
        if(audit.visibleYoutubeDomCount===undefined){
          const dom=captureYoutubeDom();
          audit.activeYouTubeTab=dom.activeYouTubeTab;
          audit.visibleYoutubeDomCount=dom.visibleYoutubeDomCount;
        }
      }
    });

    void api.performanceProbeCssVariant().then(variant=>{
      if(disposed)return;
      audit.variantRequested=variant;
      const css=cssForVariant(variant);
      if(css){
        style=document.createElement('style');
        style.id='vyron-m1-exact-css-isolation';
        style.textContent=css;
        document.head.appendChild(style);
      }
      audit.variantApplied=variant;
      audit.variantRuleCount=ruleCount(css);
      audit.variantAppliedAt=performance.now();
      audit.variantAppliedAtIso=new Date().toISOString();
    }).catch(error=>{
      audit.variantError=String(error);
    });

    return()=>{
      disposed=true;
      unsubscribe();
      style?.remove();
    };
  },[]);
  return null;
}
