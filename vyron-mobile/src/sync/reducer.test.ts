import {describe,expect,it} from "vitest";
import {applyRealtimeChange,realtimeTransportStatus} from "./reducer";
import type {MobileChannelRow,MobileSnapshot,ProjectRow} from "./types";

const channel=(overrides:Partial<MobileChannelRow>={}):MobileChannelRow=>({
  id:"c1",owner_id:"u1",desktop_channel_id:"desktop-c1",youtube_channel_id:"UC1",name:"Channel 1",
  avatar_url:null,status:"active",source_created_at:null,source_updated_at:null,last_sync_at:"2026-10-04T08:00:00Z",
  device_id:null,deleted_at:null,created_at:"2026-10-04T08:00:00Z",updated_at:"2026-10-04T08:00:00Z",last_event_id:"e1",...overrides
});
const project=(overrides:Partial<ProjectRow>={}):ProjectRow=>({
  id:"p1",owner_id:"u1",desktop_project_id:"job-1",channel_id:"c1",project_name:"VIDEO_001",
  status:"QUEUED",progress:null,track_count:10,duration_seconds:null,machine:"MacBook Air M1",
  source_created_at:"2026-10-04T08:00:00Z",source_updated_at:"2026-10-04T08:00:00Z",error_message:null,
  last_sync_at:"2026-10-04T08:00:00Z",deleted_at:null,created_at:"2026-10-04T08:00:00Z",
  updated_at:"2026-10-04T08:00:00Z",last_event_id:"e2",...overrides
});
const EMPTY:MobileSnapshot={channels:[],stats:[],projects:[],inventory:[],publisherJobs:[],endlumeJobs:[],devices:[],notifications:[],lastSuccessfulSyncAt:null};
const snapshot=(patch:Partial<MobileSnapshot>={}):MobileSnapshot=>({...EMPTY,...patch});

describe("VYRON Mobile realtime reducer",()=>{
  it("inserts a new desktop channel without replacing the rest of the app",()=>{
    const before=snapshot({channels:[channel({id:"existing",desktop_channel_id:"existing"})]});
    const next=applyRealtimeChange(before,"vyron_mobile_channels","INSERT",channel(),null,"2026-10-04T08:00:01Z");
    expect(next.channels.map(x=>x.id)).toEqual(["c1","existing"]);
    expect(next.projects).toBe(before.projects);
  });

  it("updates only the affected channel card",()=>{
    const before=snapshot({channels:[channel(),channel({id:"c2",desktop_channel_id:"desktop-c2",name:"Keep"})]});
    const next=applyRealtimeChange(before,"vyron_mobile_channels","UPDATE",channel({name:"Renamed",last_event_id:"e3"}),channel(), "2026-10-04T08:00:02Z");
    expect(next.channels.find(x=>x.id==="c1")?.name).toBe("Renamed");
    expect(next.channels.find(x=>x.id==="c2")?.name).toBe("Keep");
  });

  it("removes soft-deleted and hard-deleted channels from mobile",()=>{
    const before=snapshot({channels:[channel()]});
    expect(applyRealtimeChange(before,"vyron_mobile_channels","UPDATE",channel({deleted_at:"2026-10-04T08:00:03Z"}),channel()).channels).toHaveLength(0);
    expect(applyRealtimeChange(before,"vyron_mobile_channels","DELETE",{},channel()).channels).toHaveLength(0);
  });

  it("applies rendering progress without reopening the screen",()=>{
    const before=snapshot({projects:[project()]});
    const rendering=project({status:"RENDERING",progress:37,last_event_id:"e4"});
    const next=applyRealtimeChange(before,"vyron_mobile_projects","UPDATE",rendering,project());
    expect(next.projects[0].status).toBe("RENDERING");
    expect(next.projects[0].progress).toBe(37);
  });

  it("applies project completion and error transitions",()=>{
    const before=snapshot({projects:[project({status:"RENDERING",progress:92})]});
    const done=applyRealtimeChange(before,"vyron_mobile_projects","UPDATE",project({status:"COMPLETED",progress:100}),before.projects[0]);
    expect(done.projects[0].status).toBe("COMPLETED");
    const failed=applyRealtimeChange(done,"vyron_mobile_projects","UPDATE",project({status:"ERROR",progress:null,error_message:"render failed"}),done.projects[0]);
    expect(failed.projects[0].status).toBe("ERROR");
    expect(failed.projects[0].error_message).toBe("render failed");
  });

  it("maps realtime reconnect states deterministically",()=>{
    expect(realtimeTransportStatus("SUBSCRIBED","syncing")).toBe("online");
    expect(realtimeTransportStatus("CHANNEL_ERROR","online")).toBe("error");
    expect(realtimeTransportStatus("TIMED_OUT","online")).toBe("error");
    expect(realtimeTransportStatus("CLOSED","online")).toBe("offline");
  });
});
