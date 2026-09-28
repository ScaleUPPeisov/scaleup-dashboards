import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('VYRON 4.0 command overview source contracts',()=>{
  const dashboard=fs.readFileSync('src/DashboardOS.tsx','utf8');
  const bar=fs.readFileSync('src/YouTubeChannelBar.tsx','utf8');
  const channels=fs.readFileSync('src/ChannelsOS.tsx','utf8');
  const quota=fs.readFileSync('src/youtubeQuota.ts','utf8');
  const queue=fs.readFileSync('src/uploadQueueRuntime.ts','utf8');

  it('Home separates real YouTube schedule from local Render stock',()=>{
    expect(dashboard).toContain('ownerTotals.scheduledCount');
    expect(dashboard).toContain('liveTotals.ready');
    expect(dashboard).toContain('только real publishAt');
    expect(dashboard).toContain('Render • не YouTube');
    expect(dashboard).not.toContain('inventory.channels.reduce((n,x)=>n+x.scheduled')
  });

  it('channel surfaces use owner inventory rather than public videoCount for my videos',()=>{
    expect(bar).toContain('owner?.totalOwnerVisible');
    expect(bar).toContain('owner?.scheduledCount');
    expect(channels).toContain('owner?.totalOwnerVisible');
    expect(channels).toContain('owner?.scheduledCount');
  });

  it('never presents 100 videos as a provider-confirmed default upload allowance',()=>{
    expect(quota).toContain('DEFAULT_YOUTUBE_VIDEO_UPLOADS:number|null=null');
    expect(quota).not.toContain('DEFAULT_YOUTUBE_VIDEO_UPLOADS=100');
    expect(queue).toContain('local VYRON calendar-day limit reached')
  });

  it('Home revenue stays unavailable until RPM is explicitly configured',()=>{
    expect(dashboard).toContain("estimatedRevenue==null?'RPM не настроен'");
    expect(dashboard).toContain('settings.estimatedRpmUsd')
  });
});
