import {describe,it,expect} from "vitest";
import {resolveKratPublishAt} from "./MetadataPage";
describe("KRAT schedule",()=>{it("combines PUBLISH TIME with planned date",()=>{expect(resolveKratPublishAt("04:00 KRAT","2026-09-02T18:00:00+07:00")).toBe("2026-09-02T04:00:00+07:00")});it("keeps explicit RFC3339",()=>{expect(resolveKratPublishAt("2026-09-05T04:00:00+07:00","2026-09-02T18:00:00+07:00")).toBe("2026-09-05T04:00:00+07:00")})});
