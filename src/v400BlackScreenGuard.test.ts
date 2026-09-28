import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const boundary=fs.readFileSync('src/UiErrorBoundary.tsx','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const youtube=fs.readFileSync('src/YouTubeCenter.tsx','utf8');
const runway=fs.readFileSync('src/ChannelRunway.tsx','utf8');
const scheduler=fs.readFileSync('src/ChannelRunwayScheduler.tsx','utf8');
const store=fs.readFileSync('src/channelRunwayStore.ts','utf8');

describe('VYRON 4.0.0 black-screen regression guard',()=>{
  it('keeps the app shell alive when a page throws',()=>{
    expect(boundary).toContain('class UiErrorBoundary');
    expect(boundary).toContain('getDerivedStateFromError');
    expect(boundary).toContain('componentDidCatch');
    expect(boundary).toContain('Каналы, OAuth, Google credentials');
    expect(app).toContain('<UiErrorBoundary scope={String(page)}');
  });

  it('contains Plan Channels / YouTube tab crashes locally',()=>{
    expect(youtube).toContain("['runway','План каналов']");
    expect(youtube).toContain('<UiErrorBoundary scope={tabLabel}');
    expect(youtube).toContain("tab==='runway'?<ChannelRunway/>");
  });

  it('isolates malformed runway rows instead of crashing the whole tab',()=>{
    expect(runway).toContain('let failures=0');
    expect(runway).toContain('catch{failures++;return null}');
    expect(runway).toContain('rowFailures>0');
    expect(runway).toContain('вместо падения всего интерфейса');
  });

  it('makes runway background persistence failures non-fatal',()=>{
    expect(scheduler).toContain('CHANNEL_RUNWAY_SCHEDULER_ERROR');
    expect(scheduler).toContain('try{void maybeRunDailyChannelRunway');
    expect(store).toContain('try{if(storage)storage.setItem');
    expect(store).toContain('catch{}');
  });

  it('does not add destructive auth recovery to the crash path',()=>{
    for(const forbidden of ['youtubeDisconnect(','localStorage.clear(','removeChannel(','revoke','refresh_token=','client_secret=']){
      expect(boundary).not.toContain(forbidden);
    }
  });
});
