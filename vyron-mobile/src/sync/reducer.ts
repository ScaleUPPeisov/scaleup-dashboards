import type { MobileSnapshot, SyncStatus } from "./types";

function replaceBy<T extends Record<string, any>>(rows: T[], row: T, key: keyof T) {
  const value = row[key];
  const i = rows.findIndex(x => x[key] === value);
  if (i < 0) return [row, ...rows];
  const next = rows.slice();
  next[i] = row;
  return next;
}
function removeBy<T extends Record<string, any>>(rows: T[], row: T, key: keyof T) {
  const value = row[key];
  return rows.filter(x => x[key] !== value);
}

export function applyRealtimeChange(
  prev: MobileSnapshot,
  table: string,
  eventType: string,
  row: any,
  old: any,
  receivedAt = new Date().toISOString(),
): MobileSnapshot {
  if (table === "vyron_mobile_channels") {
    const channels = row?.deleted_at || eventType === "DELETE"
      ? removeBy(prev.channels, row?.id ? row : old, "id")
      : replaceBy(prev.channels, row, "id");
    return { ...prev, channels, lastSuccessfulSyncAt: receivedAt };
  }
  if (table === "vyron_mobile_channel_stats") {
    const stats = eventType === "DELETE" ? removeBy(prev.stats, old, "id") : replaceBy(prev.stats, row, "id");
    return { ...prev, stats: stats.slice(0, 5000), lastSuccessfulSyncAt: receivedAt };
  }
  if (table === "vyron_mobile_projects") {
    const projects = row?.deleted_at || eventType === "DELETE"
      ? removeBy(prev.projects, row?.id ? row : old, "id")
      : replaceBy(prev.projects, row, "id");
    return { ...prev, projects, lastSuccessfulSyncAt: receivedAt };
  }
  if (table === "vyron_mobile_content_inventory") {
    return { ...prev, inventory: replaceBy(prev.inventory, row, "channel_id"), lastSuccessfulSyncAt: receivedAt };
  }
  if (table === "vyron_mobile_publisher_jobs") {
    return { ...prev, publisherJobs: replaceBy(prev.publisherJobs, row, "id"), lastSuccessfulSyncAt: receivedAt };
  }
  if (table === "vyron_mobile_endlume_jobs") {
    return { ...prev, endlumeJobs: replaceBy(prev.endlumeJobs, row, "id"), lastSuccessfulSyncAt: receivedAt };
  }
  if (table === "vyron_mobile_devices") {
    return { ...prev, devices: replaceBy(prev.devices, row, "id"), lastSuccessfulSyncAt: receivedAt };
  }
  if (table === "vyron_mobile_notifications") {
    return { ...prev, notifications: replaceBy(prev.notifications, row, "id").slice(0, 100), lastSuccessfulSyncAt: receivedAt };
  }
  return prev;
}

export function realtimeTransportStatus(status: string, current: SyncStatus): SyncStatus {
  if (status === "SUBSCRIBED") return "online";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") return "error";
  if (status === "CLOSED") return "offline";
  return current;
}
