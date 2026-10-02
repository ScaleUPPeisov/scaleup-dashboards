import {useEffect} from 'react';
import {useApp} from './store';

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
};

function captureYoutubeDom(){
  const selectors=['.youtubeCenterHead','.youtubeChannelBar','.youtubeMasterTabs','.youtubeChannelContext'];
  const nodes=new Set<Element>();
  for(const selector of selectors){
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
    const audit:PassiveAudit={enabled:true,youtubeEntries:0,youtubeExits:0};
    (window as any).__VYRON_M1_PARITY_PASSIVE__=audit;
    const unsubscribe=useApp.subscribe((state,previous)=>{
      if(state.page==='youtube'&&previous.page!=='youtube'){
        audit.youtubeEntries++;
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
    return()=>unsubscribe();
  },[]);
  return null;
}
