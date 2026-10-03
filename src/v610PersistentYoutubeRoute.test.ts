import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(name:string)=>readFileSync(decodeURIComponent(new URL('./'+name,import.meta.url).pathname),'utf8');

describe('VYRON 6.1 persistent YouTube route production candidate',()=>{
  it('keeps YouTube mounted after the first activation and hides it without unmounting',()=>{
    const app=read('App.tsx');
    expect(app).toContain('const youtubeRouteMountedRef=useRef(false)');
    expect(app).toContain('if(youtubeSelected)youtubeRouteMountedRef.current=true');
    expect(app).toContain('youtubeRouteMountedRef.current&&<div data-youtube-persistent-host="true"');
    expect(app).toContain('aria-hidden={!youtubeSelected}');
    expect(app).toContain('inert={!youtubeSelected}');
    expect(app).toContain("visibility:'hidden'");
    expect(app).not.toContain('youtubeSelected?<UiErrorBoundary scope="youtube"');
  });

  it('reuses one CachedYouTubeRoute instance across sidebar round-trips',()=>{
    const app=read('App.tsx');
    expect(app.match(/<CachedYouTubeRoute/g)?.length).toBe(1);
    expect(app).toContain('<CachedYouTubeRoute routeTab={youtubeRouteTab} active={youtubeSelected}/>');
    expect(app).toContain('!youtubeSelected&&<UiErrorBoundary');
  });

  it('preserves active channel and tab state because YouTubeCenter content is not removed when inactive',()=>{
    const center=read('YouTubeCenter.tsx');
    expect(center).toContain('[tab,setTab]=useState');
    expect(center).toContain('[activeChannel,setActiveChannel]=useState');
    expect(center).toContain('<CachedYouTubeChannelBar active={active}/>');
    expect(center).toContain('<div key={tab+\':\'+activeChannel} className="youtubeChannelContext">');
    expect(center).not.toContain('{active&&<div key={tab+\':\'+activeChannel}');
  });

  it('keeps the current Publisher workspace mounted and passes explicit active state',()=>{
    const center=read('YouTubeCenter.tsx'),publisher=read('PublisherOS.tsx');
    expect(center).toContain('<CachedPublisher activityRef={routeActiveRef} active={active}/>');
    expect(publisher).toContain('active=true');
    expect(publisher).toContain("const routeIsActive=()=>active!==false&&activityRef?.current!==false");
  });

  it('does not start Publisher API/timer work merely while hidden',()=>{
    const publisher=read('PublisherOS.tsx');
    expect(publisher).toContain('if(!active||!batchActive)return;return subscribeGlobalDailyUploadStatus');
    expect(publisher).toContain('if(!active||!batchActive)return;const off=subscribeYoutubeQuota');
    expect(publisher).toContain('if(!active)return;let live=true;const check=async()=>');
    expect(publisher).toContain('if(!active||!profileId||!batchActive)return');
    expect(publisher).toContain('[active,profileId,batchActive]');
    expect(publisher).toContain('if(!active||!routeIsActive())return;let live=true;const targets=');
  });

  it('keeps YouTubeChannelBar and Metadata inactive guards effective while hidden',()=>{
    const center=read('YouTubeCenter.tsx'),bar=read('YouTubeChannelBar.tsx'),metadata=read('MetadataPage.tsx');
    expect(center).toContain('<CachedYouTubeChannelBar active={active}/>');
    expect(bar).toContain('if(!routeActive)return;return subscribeActivePublishChannel');
    expect(bar).toContain('if(!routeActive||!detailsOpen)return');
    expect(metadata).toContain('const activeRef=useRef(active);activeRef.current=active');
    expect(metadata).toContain('if(activeRef.current)setQuotaRevision');
  });

  it('does not modify OAuth, upload-counter or protected production modules',()=>{
    const app=read('App.tsx'),publisher=read('PublisherOS.tsx');
    expect(app).toContain('restorePublishLedgerFromUploadHistory(uploadHistory)');
    expect(publisher).toContain('beginPublishAttempt');
    expect(publisher).toContain('completePublishAttempt');
    expect(publisher).toContain('releaseChannelUploadLock');
    expect(publisher).not.toContain('youtubeOauthDisconnect');
  });

  it('keeps the exact M1 probe workload unchanged',()=>{
    const probe=read('M1PerformanceProbe.tsx');
    expect(probe).toContain("const route:Page[]=['dashboard','channels','production','youtube','analytics','settings']");
    expect(probe).toContain('navigationSwitchesPerRound:30');
    expect(probe).toContain('rounds:3');
    expect(probe).toContain('metadataRecords:5000');
    expect(probe).toContain('assignedJobs');
  });
});
