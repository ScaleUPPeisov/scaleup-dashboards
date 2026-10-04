import {describe,expect,it} from "vitest";
import {decodeCachedSnapshot} from "./cacheCodec";

describe("VYRON Mobile offline cache codec",()=>{
  it("restores last successful channel data while offline",()=>{
    const raw=JSON.stringify({channels:[{id:"c1",name:"Cached"}],projects:[],lastSuccessfulSyncAt:"2026-10-04T08:00:00Z"});
    const cached=decodeCachedSnapshot(raw);
    expect(cached?.channels).toHaveLength(1);
    expect((cached?.channels[0] as any).name).toBe("Cached");
    expect(cached?.lastSuccessfulSyncAt).toBe("2026-10-04T08:00:00Z");
  });
  it("does not turn corrupt cache into an empty fake production snapshot",()=>{
    expect(decodeCachedSnapshot("{broken")).toBeNull();
    expect(decodeCachedSnapshot(JSON.stringify({channels:"bad"}))).toBeNull();
  });
});
