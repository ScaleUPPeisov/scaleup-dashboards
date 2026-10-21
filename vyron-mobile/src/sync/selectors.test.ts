import {describe,expect,it} from "vitest";
import {aggregateAnalytics,channelSparkline,formatMetric,latestStats,viewsForPeriod} from "./selectors";
import type {MobileSnapshot} from "./types";

const base:MobileSnapshot={
  channels:[{id:"c1",owner_id:"u",desktop_channel_id:"desktop-c1",youtube_channel_id:"UC1",name:"Neon",avatar_url:null,status:"active",source_created_at:null,source_updated_at:null,last_sync_at:"2026-10-04T00:00:00Z",device_id:null,deleted_at:null,created_at:"2026-10-04T00:00:00Z",updated_at:"2026-10-04T00:00:00Z",last_event_id:null}],
  stats:[
    {id:1,owner_id:"u",channel_id:"c1",source_event_id:"e1",timestamp:"2026-10-04T00:00:00Z",period_days:28,subscriber_count:100,subscriber_delta_today:2,subscriber_delta_7d:10,subscriber_delta_28d:30,subscriber_delta_period:30,views_total:1000,views_today:50,views_7d:300,views_28d:900,views_period:900,video_count:10,watch_time:600,ctr:6.2,average_view_duration:120,last_published_at:null,daily_points:[{date:"2026-10-03",views:40},{date:"2026-10-04",views:50}],traffic_sources:[{key:"Browse",views:70},{key:"Search",views:30}],created_at:"2026-10-04T00:00:00Z"}
  ],
  projects:[],inventory:[],publisherJobs:[],endlumeJobs:[],devices:[],notifications:[],lastSuccessfulSyncAt:null
};

describe("VYRON mobile selectors",()=>{
  it("uses real period snapshots without inventing 90d data",()=>{
    const latest=latestStats(base.stats,28).get("c1");
    expect(viewsForPeriod(latest,28)).toBe(900);
    expect(latestStats(base.stats,90).size).toBe(0);
    expect(aggregateAnalytics(base,90).views).toBeNull();
  });
  it("aggregates synchronized KPI and graph points",()=>{
    const a=aggregateAnalytics(base,28);
    expect(a.views).toBe(900);
    expect(a.subscribers).toBe(30);
    expect(a.watchTime).toBe(600);
    expect(a.ctr).toBe(6.2);
    expect(a.daily.map(x=>x.value)).toEqual([40,50]);
  });
  it("builds sparkline values only from stored stats",()=>expect(channelSparkline(base.stats,"c1",28)).toEqual([40,50]));
  it("renders unavailable metrics as dash",()=>expect(formatMetric(null)).toBe("—"));
});
