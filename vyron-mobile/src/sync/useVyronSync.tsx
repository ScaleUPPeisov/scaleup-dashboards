import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { EMPTY_SNAPSHOT, getOrCreateDeviceId, loadSnapshot, saveSnapshot } from "./cache";
import type {
  ChannelStatRow, DeviceRow, EndlumeJobRow, InventoryRow, MobileChannelRow,
  MobileSnapshot, NotificationRow, ProjectRow, PublisherJobRow, SyncStatus, VyronSyncModel,
} from "./types";

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

async function serverSnapshot(userId: string): Promise<MobileSnapshot> {
  if (!supabase) throw new Error("VYRON_MOBILE_SUPABASE_CONFIG_MISSING");
  const [
    channels, stats, projects, inventory, publisherJobs, endlumeJobs, devices, notifications,
  ] = await Promise.all([
    supabase.from("vyron_mobile_channels").select("*").eq("owner_id", userId).is("deleted_at", null).order("name"),
    supabase.from("vyron_mobile_channel_stats").select("*").eq("owner_id", userId).order("timestamp", { ascending: false }).limit(5000),
    supabase.from("vyron_mobile_projects").select("*").eq("owner_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(500),
    supabase.from("vyron_mobile_content_inventory").select("*").eq("owner_id", userId),
    supabase.from("vyron_mobile_publisher_jobs").select("*").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(500),
    supabase.from("vyron_mobile_endlume_jobs").select("*").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(200),
    supabase.from("vyron_mobile_devices").select("*").eq("owner_id", userId).order("last_seen_at", { ascending: false }),
    supabase.from("vyron_mobile_notifications").select("*").eq("owner_id", userId).order("occurred_at", { ascending: false }).limit(100),
  ]);
  const result = [channels, stats, projects, inventory, publisherJobs, endlumeJobs, devices, notifications];
  const failed = result.find(x => x.error);
  if (failed?.error) throw failed.error;
  return {
    channels: (channels.data ?? []) as MobileChannelRow[],
    stats: (stats.data ?? []) as ChannelStatRow[],
    projects: (projects.data ?? []) as ProjectRow[],
    inventory: (inventory.data ?? []) as InventoryRow[],
    publisherJobs: (publisherJobs.data ?? []) as PublisherJobRow[],
    endlumeJobs: (endlumeJobs.data ?? []) as EndlumeJobRow[],
    devices: (devices.data ?? []) as DeviceRow[],
    notifications: (notifications.data ?? []) as NotificationRow[],
    lastSuccessfulSyncAt: new Date().toISOString(),
  };
}

function safeError(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  return raw.replace(/(token|secret|password|authorization)[^\s]*/gi, "$1=[redacted]").slice(0, 300);
}

export function useVyronSync(): VyronSyncModel {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<MobileSnapshot>(EMPTY_SNAPSHOT);
  const [dataLoading, setDataLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(supabaseConfigured ? "offline" : "unconfigured");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [mobileDeviceId, setMobileDeviceId] = useState<string | null>(null);
  const hydratedUser = useRef<string | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setSyncStatus("unconfigured");
      return;
    }
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!live) return;
      setSession(next);
      setAuthLoading(false);
    });
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const registerMobileDevice = useCallback(async (userId: string) => {
    if (!supabase) return null;
    const localId = await getOrCreateDeviceId();
    setMobileDeviceId(localId);
    const { data: existing } = await supabase.from("vyron_mobile_devices")
      .select("*").eq("owner_id", userId).eq("device_id", localId).maybeSingle();
    const now = new Date().toISOString();
    if (existing) {
      const { data, error } = await supabase.from("vyron_mobile_devices")
        .update({ name: Platform.OS === "ios" ? "iPhone" : "Mobile", app_version: "0.1.0", last_seen_at: now, updated_at: now })
        .eq("id", existing.id).select("*").single();
      if (error) throw error;
      return data as DeviceRow;
    }
    const { data, error } = await supabase.from("vyron_mobile_devices").insert({
      owner_id: userId,
      device_id: localId,
      name: Platform.OS === "ios" ? "iPhone" : "Mobile",
      platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown",
      app_version: "0.1.0",
      architecture: null,
      device_kind: "mobile",
      last_seen_at: now,
      updated_at: now,
    }).select("*").single();
    if (error) throw error;
    return data as DeviceRow;
  }, []);

  const refresh = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId || !supabase) return;
    setDataLoading(true);
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      const next = await serverSnapshot(userId);
      setSnapshot(next);
      await saveSnapshot(userId, next);
      setSyncStatus("online");
    } catch (e) {
      setSyncError(safeError(e));
      setSyncStatus("offline");
    } finally {
      setDataLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !supabase) {
      if (!userId) {
        hydratedUser.current = null;
        setSnapshot(EMPTY_SNAPSHOT);
      }
      return;
    }

    let live = true;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let mobileDeviceRecordId: string | null = null;
    setDataLoading(true);
    setSyncStatus("syncing");
    setSyncError(null);

    const recordReceipt = (eventId: string | null | undefined) => {
      if (!eventId) return;
      const receivedAt = new Date().toISOString();
      void supabase!.from("vyron_mobile_sync_events").update({
        mobile_receive_at: receivedAt,
        mobile_device_id: mobileDeviceRecordId,
      }).eq("event_id", eventId).is("mobile_receive_at", null);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        void supabase!.from("vyron_mobile_sync_events").update({
          mobile_paint_at: new Date().toISOString(),
          mobile_device_id: mobileDeviceRecordId,
        }).eq("event_id", eventId).is("mobile_paint_at", null);
      }));
    };

    const apply = (table: string, payload: any) => {
      if (!live) return;
      const row = payload.new as any;
      const old = payload.old as any;
      const eventId = row?.last_event_id ?? row?.source_event_id ?? null;
      recordReceipt(eventId);
      setSnapshot(prev => {
        let next = prev;
        if (table === "vyron_mobile_channels") {
          const channels = row?.deleted_at || payload.eventType === "DELETE"
            ? removeBy(prev.channels, row?.id ? row : old, "id")
            : replaceBy(prev.channels, row, "id");
          next = { ...prev, channels, lastSuccessfulSyncAt: new Date().toISOString() };
        } else if (table === "vyron_mobile_channel_stats") {
          const stats = payload.eventType === "DELETE" ? removeBy(prev.stats, old, "id") : replaceBy(prev.stats, row, "id");
          next = { ...prev, stats: stats.slice(0, 5000), lastSuccessfulSyncAt: new Date().toISOString() };
        } else if (table === "vyron_mobile_projects") {
          const projects = row?.deleted_at || payload.eventType === "DELETE"
            ? removeBy(prev.projects, row?.id ? row : old, "id")
            : replaceBy(prev.projects, row, "id");
          next = { ...prev, projects, lastSuccessfulSyncAt: new Date().toISOString() };
        } else if (table === "vyron_mobile_content_inventory") {
          next = { ...prev, inventory: replaceBy(prev.inventory, row, "channel_id"), lastSuccessfulSyncAt: new Date().toISOString() };
        } else if (table === "vyron_mobile_publisher_jobs") {
          next = { ...prev, publisherJobs: replaceBy(prev.publisherJobs, row, "id"), lastSuccessfulSyncAt: new Date().toISOString() };
        } else if (table === "vyron_mobile_endlume_jobs") {
          next = { ...prev, endlumeJobs: replaceBy(prev.endlumeJobs, row, "id"), lastSuccessfulSyncAt: new Date().toISOString() };
        } else if (table === "vyron_mobile_devices") {
          next = { ...prev, devices: replaceBy(prev.devices, row, "id"), lastSuccessfulSyncAt: new Date().toISOString() };
        } else if (table === "vyron_mobile_notifications") {
          next = { ...prev, notifications: replaceBy(prev.notifications, row, "id").slice(0, 100), lastSuccessfulSyncAt: new Date().toISOString() };
        }
        return next;
      });
    };

    const boot = async () => {
      const cached = await loadSnapshot(userId);
      if (!live) return;
      if (cached) setSnapshot(cached);
      hydratedUser.current = userId;

      let device: DeviceRow | null = null;
      try {
        device = await registerMobileDevice(userId);
        mobileDeviceRecordId = device?.id ?? null;
      } catch (e) {
        setSyncError(safeError(e));
      }
      if (!live) return;

      try {
        const next = await serverSnapshot(userId);
        if (!live) return;
        setSnapshot(next);
        await saveSnapshot(userId, next);
        setSyncStatus("online");
      } catch (e) {
        if (!live) return;
        setSyncError(safeError(e));
        setSyncStatus("offline");
      } finally {
        if (live) setDataLoading(false);
      }

      let realtime = supabase!.channel(`vyron-mobile:${userId}`);
      for (const table of [
        "vyron_mobile_channels",
        "vyron_mobile_channel_stats",
        "vyron_mobile_projects",
        "vyron_mobile_content_inventory",
        "vyron_mobile_publisher_jobs",
        "vyron_mobile_endlume_jobs",
        "vyron_mobile_devices",
        "vyron_mobile_notifications",
      ]) {
        realtime = realtime.on("postgres_changes", { event: "*", schema: "public", table, filter: `owner_id=eq.${userId}` }, payload => apply(table, payload));
      }
      channelRef.current = realtime;
      realtime.subscribe(status => {
        if (!live) return;
        if (status === "SUBSCRIBED") {
          setSyncStatus("online");
          setSyncError(null);
          // Close the small snapshot -> subscription race window without reloading on every event.
          void serverSnapshot(userId).then(next => {
            if (!live) return;
            setSnapshot(next);
            void saveSnapshot(userId, next);
          }).catch(() => undefined);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSyncStatus("error");
        } else if (status === "CLOSED") {
          setSyncStatus("offline");
        }
      });

      heartbeat = setInterval(() => {
        if (!device?.id) return;
        const now = new Date().toISOString();
        void supabase!.from("vyron_mobile_devices").update({ last_seen_at: now, updated_at: now }).eq("id", device.id);
      }, 20_000);
    };

    void boot();
    return () => {
      live = false;
      if (heartbeat) clearInterval(heartbeat);
      if (channelRef.current) {
        void supabase!.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [session?.user.id, registerMobileDevice]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || hydratedUser.current !== userId || snapshot === EMPTY_SNAPSHOT) return;
    const id = setTimeout(() => { void saveSnapshot(userId, snapshot); }, 250);
    return () => clearTimeout(id);
  }, [session?.user.id, snapshot]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { ok: false, error: "VYRON Mobile backend не настроен" };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const createPairingCode = useCallback(async () => {
    if (!supabase || !session) return { ok: false, error: "Требуется вход в VYRON Mobile" };
    try {
      const { data, error } = await supabase.functions.invoke("vyron-mobile-sync-ingest", {
        body: { action: "create_pairing_code" },
      });
      if (error) return { ok: false, error: safeError(error) };
      if (!data?.ok || !data?.pairingCode) return { ok: false, error: String(data?.code || "Не удалось создать код") };
      return { ok: true, code: String(data.pairingCode), expiresAt: String(data.expiresAt || "") };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  }, [session]);

  return useMemo(() => ({
    ...snapshot, session, authLoading, dataLoading, syncStatus, syncError, mobileDeviceId, signIn, signOut, refresh, createPairingCode,
  }), [snapshot, session, authLoading, dataLoading, syncStatus, syncError, mobileDeviceId, signIn, signOut, refresh, createPairingCode]);
}

const SyncContext = createContext<VyronSyncModel | null>(null);

export function VyronSyncProvider({ children }: { children: React.ReactNode }) {
  const value = useVyronSync();
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useVyronSyncContext() {
  const value = useContext(SyncContext);
  if (!value) throw new Error("VyronSyncProvider missing");
  return value;
}
