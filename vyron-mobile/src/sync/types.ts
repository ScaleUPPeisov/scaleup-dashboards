import type { Session } from "@supabase/supabase-js";

export type SyncStatus = "online" | "syncing" | "offline" | "error" | "unconfigured";

export type MobileChannelRow = {
  id: string;
  owner_id: string;
  desktop_channel_id: string;
  youtube_channel_id: string | null;
  name: string;
  avatar_url: string | null;
  status: string;
  source_created_at: string | null;
  source_updated_at: string | null;
  last_sync_at: string;
  device_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  last_event_id: string | null;
};

export type ChannelStatRow = {
  id: number;
  owner_id: string;
  channel_id: string;
  source_event_id: string | null;
  timestamp: string;
  period_days: 7 | 28 | 90;
  subscriber_count: number | null;
  subscriber_delta_today: number | null;
  subscriber_delta_7d: number | null;
  subscriber_delta_28d: number | null;
  subscriber_delta_period: number | null;
  views_total: number | null;
  views_today: number | null;
  views_7d: number | null;
  views_28d: number | null;
  views_period: number | null;
  video_count: number | null;
  watch_time: number | null;
  ctr: number | null;
  average_view_duration: number | null;
  last_published_at: string | null;
  daily_points: Array<Record<string, unknown>>;
  traffic_sources: Array<Record<string, unknown>>;
  created_at: string;
};

export type ProjectRow = {
  id: string;
  owner_id: string;
  desktop_project_id: string;
  channel_id: string | null;
  project_name: string;
  status: "READY_RENDER" | "RENDERING" | "COMPLETED" | "ERROR" | "QUEUED";
  progress: number | null;
  track_count: number | null;
  duration_seconds: number | null;
  machine: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  error_message: string | null;
  last_sync_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  last_event_id: string | null;
};

export type InventoryRow = {
  channel_id: string;
  owner_id: string;
  ready_video_count: number;
  scheduled_video_count: number;
  published_video_count: number;
  remaining_content_days: number | null;
  last_local_inventory_scan: string | null;
  next_scheduled_publication: string | null;
  folder_state: string | null;
  stale: boolean;
  source_updated_at: string | null;
  updated_at: string;
  last_event_id: string | null;
};

export type PublisherJobRow = {
  id: string;
  owner_id: string;
  desktop_job_id: string;
  channel_id: string | null;
  status: string;
  progress: number | null;
  scheduled_at: string | null;
  youtube_video_id: string | null;
  error_message: string | null;
  source_updated_at: string | null;
  updated_at: string;
  last_event_id: string | null;
};

export type EndlumeJobRow = {
  id: string;
  owner_id: string;
  desktop_job_id: string;
  project_id: string | null;
  state: "connected" | "disconnected" | "idle" | "rendering" | "completed" | "failed";
  current_project: string | null;
  progress: number | null;
  last_activity: string | null;
  machine_name: string | null;
  error_message: string | null;
  source_updated_at: string | null;
  updated_at: string;
  last_event_id: string | null;
};

export type DeviceRow = {
  id: string;
  owner_id: string;
  device_id: string;
  name: string;
  platform: string;
  app_version: string;
  architecture: string | null;
  device_kind: "desktop" | "mobile";
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  owner_id: string;
  event_type: string;
  dedup_key: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_key: string | null;
  occurred_at: string;
  read_at: string | null;
  created_at: string;
  source_event_id: string | null;
};

export type SyncEventRow = {
  event_id: string;
  owner_id: string;
  device_id: string | null;
  event_type: string;
  entity_type: string;
  entity_key: string | null;
  desktop_event_at: string;
  server_write_at: string;
  mobile_receive_at: string | null;
  mobile_paint_at: string | null;
  mobile_device_id: string | null;
};

export type MobileSnapshot = {
  channels: MobileChannelRow[];
  stats: ChannelStatRow[];
  projects: ProjectRow[];
  inventory: InventoryRow[];
  publisherJobs: PublisherJobRow[];
  endlumeJobs: EndlumeJobRow[];
  devices: DeviceRow[];
  notifications: NotificationRow[];
  lastSuccessfulSyncAt: string | null;
};

export type VyronSyncModel = MobileSnapshot & {
  session: Session | null;
  authLoading: boolean;
  dataLoading: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  mobileDeviceId: string | null;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  createPairingCode: () => Promise<{ ok: boolean; code?: string; expiresAt?: string; error?: string }>;
};
