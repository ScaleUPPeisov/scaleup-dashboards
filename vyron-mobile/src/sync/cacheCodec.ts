import type { MobileSnapshot } from "./types";

export const EMPTY_MOBILE_SNAPSHOT: MobileSnapshot = {
  channels: [],
  stats: [],
  projects: [],
  inventory: [],
  publisherJobs: [],
  endlumeJobs: [],
  devices: [],
  notifications: [],
  lastSuccessfulSyncAt: null,
};

export function decodeCachedSnapshot(raw: string | null): MobileSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MobileSnapshot>;
    if (!parsed || !Array.isArray(parsed.channels) || !Array.isArray(parsed.projects)) return null;
    return { ...EMPTY_MOBILE_SNAPSHOT, ...parsed } as MobileSnapshot;
  } catch {
    return null;
  }
}
