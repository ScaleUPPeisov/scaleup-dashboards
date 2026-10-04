import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vyron-session, x-vyron-sync-device",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const out = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: H });
const iso = () => new Date().toISOString();
const txt = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const int = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
const date = (v: unknown) => {
  const s = txt(v, 64);
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
async function hash(v: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function token() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function pairingCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const b = crypto.getRandomValues(new Uint8Array(10));
  let s = "";
  for (const x of b) s += alphabet[x % alphabet.length];
  return s.slice(0,5) + "-" + s.slice(5);
}
function normalizePairingCode(v: unknown) {
  return txt(v, 32).toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "");
}
function uuid(v: unknown) {
  const s = txt(v, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s) ? s : null;
}
function safeJsonArray(v: unknown, max = 200) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).map(x => {
    if (!x || typeof x !== "object") return x;
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(x as Record<string, unknown>)) {
      if (/token|secret|credential|oauth|keychain|password|authorization/i.test(k)) continue;
      if (typeof val === "string") clean[k] = val.slice(0, 1000);
      else if (typeof val === "number" || typeof val === "boolean" || val == null) clean[k] = val;
    }
    return clean;
  });
}
function hasForbiddenKey(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasForbiddenKey);
  if (!v || typeof v !== "object") return false;
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    const k = key.toLowerCase().replace(/[-_]/g, "");
    if (/(accesstoken|refreshtoken|clientsecret|clientidsecret|oauthcredential|keychain|credentialmanager|githubtoken|authorization|servicerole|password|privatekey)/.test(k)) return true;
    if (hasForbiddenKey(value)) return true;
  }
  return false;
}

async function authUser(req: Request) {
  const raw = req.headers.get("authorization") ?? "";
  const jwt = raw.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error ? null : data.user ?? null;
}

async function authDesktop(req: Request) {
  const rawDevice = req.headers.get("x-vyron-sync-device")?.trim() ?? "";
  if (rawDevice) {
    const th = await hash(rawDevice);
    const { data: cred } = await db.from("vyron_mobile_device_credentials")
      .select("device_id,owner_id,revoked_at").eq("token_hash", th).maybeSingle();
    if (!cred || cred.revoked_at) return { ok: false as const, code: "sync_device_invalid" };
    const { data: device } = await db.from("vyron_mobile_devices").select("*").eq("id", cred.device_id).maybeSingle();
    if (!device || device.device_kind !== "desktop") return { ok: false as const, code: "sync_device_binding_missing" };
    return { ok: true as const, ownerId: cred.owner_id as string, device };
  }

  const rawSession = req.headers.get("x-vyron-session")?.trim() ?? "";
  if (!rawSession) return { ok: false as const, code: "desktop_auth_missing" };
  const th = await hash(rawSession);
  const { data: s } = await db.from("vyron_sessions").select("*").eq("token_hash", th).maybeSingle();
  if (!s || s.revoked_at || Date.parse(s.expires_at) <= Date.now()) return { ok: false as const, code: "vyron_session_invalid" };
  const [{ data: license }, { data: legacyDevice }, { data: link }] = await Promise.all([
    db.from("vyron_licenses").select("id,status").eq("id", s.license_id).maybeSingle(),
    db.from("vyron_devices").select("*").eq("id", s.device_id).maybeSingle(),
    db.from("vyron_mobile_license_links").select("owner_id").eq("license_id", s.license_id).maybeSingle(),
  ]);
  if (!license || license.status !== "active" || !legacyDevice || !link) return { ok: false as const, code: link ? "desktop_not_allowed" : "license_not_linked" };
  const ownerId = link.owner_id as string;
  const deviceKey = txt(legacyDevice.device_id, 160);
  const { data: device, error } = await db.from("vyron_mobile_devices").upsert({
    owner_id: ownerId,
    device_id: deviceKey,
    name: txt(legacyDevice.device_name || "VYRON Desktop", 160),
    platform: ["macos","windows"].includes(String(legacyDevice.platform)) ? legacyDevice.platform : "unknown",
    app_version: txt(legacyDevice.app_version, 64),
    architecture: txt(legacyDevice.architecture, 64) || null,
    device_kind: "desktop",
    last_seen_at: iso(),
    updated_at: iso(),
  }, { onConflict: "owner_id,device_id" }).select("*").single();
  if (error || !device) return { ok: false as const, code: "device_register_failed" };
  return { ok: true as const, ownerId, device };
}


async function createPairingCode(req: Request) {
  const user = await authUser(req);
  if (!user) return out({ ok: false, code: "auth_required" }, 401);
  const raw = pairingCode();
  const normalized = normalizePairingCode(raw);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await db.from("vyron_mobile_pairing_codes").delete().eq("owner_id", user.id).is("claimed_at", null);
  const { error } = await db.from("vyron_mobile_pairing_codes").insert({
    owner_id: user.id,
    code_hash: await hash(normalized),
    expires_at: expiresAt,
  });
  if (error) return out({ ok: false, code: "pairing_create_failed" }, 500);
  return out({ ok: true, pairingCode: raw, expiresAt });
}

async function claimPairingCode(b: any) {
  const normalized = normalizePairingCode(b.pairing_code);
  const deviceId = txt(b.device_id, 160);
  const name = txt(b.name || "VYRON Desktop", 160);
  const platform = txt(b.platform, 24).toLowerCase();
  const appVersion = txt(b.app_version, 64);
  const architecture = txt(b.architecture, 64) || null;
  if (normalized.length !== 10 || !deviceId || !["macos","windows"].includes(platform)) {
    return out({ ok: false, code: "pairing_invalid" }, 400);
  }
  const codeHash = await hash(normalized);
  const { data: pair } = await db.from("vyron_mobile_pairing_codes").select("*").eq("code_hash", codeHash).maybeSingle();
  if (!pair || pair.claimed_at || Date.parse(pair.expires_at) <= Date.now()) {
    return out({ ok: false, code: "pairing_expired_or_invalid" }, 401);
  }
  const now = iso();
  const { data: device, error: de } = await db.from("vyron_mobile_devices").upsert({
    owner_id: pair.owner_id,
    device_id: deviceId,
    name,
    platform,
    app_version: appVersion,
    architecture,
    device_kind: "desktop",
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: "owner_id,device_id" }).select("*").single();
  if (de || !device) return out({ ok: false, code: "pairing_device_failed" }, 500);

  const raw = token();
  const tokenHash = await hash(raw);
  await db.from("vyron_mobile_device_credentials").delete().eq("device_id", device.id);
  const { error: ce } = await db.from("vyron_mobile_device_credentials").insert({
    device_id: device.id,
    owner_id: pair.owner_id,
    token_hash: tokenHash,
  });
  if (ce) return out({ ok: false, code: "pairing_credential_failed" }, 500);

  const { error: pe } = await db.from("vyron_mobile_pairing_codes").update({
    claimed_at: now,
    claimed_device_id: device.id,
  }).eq("id", pair.id).is("claimed_at", null);
  if (pe) {
    await db.from("vyron_mobile_device_credentials").delete().eq("device_id", device.id);
    return out({ ok: false, code: "pairing_claim_failed" }, 409);
  }
  return out({ ok: true, syncDeviceToken: raw, deviceId: device.id, ownerId: pair.owner_id });
}

async function provision(req: Request, b: any) {
  const user = await authUser(req);
  if (!user) return out({ ok: false, code: "auth_required" }, 401);
  const deviceId = txt(b.device_id, 160);
  const name = txt(b.name || "VYRON Desktop", 160);
  const platform = txt(b.platform, 24).toLowerCase();
  const appVersion = txt(b.app_version, 64);
  const architecture = txt(b.architecture, 64) || null;
  if (!deviceId || !["macos","windows"].includes(platform)) return out({ ok: false, code: "device_metadata" }, 400);

  await db.from("vyron_mobile_users").upsert({ id: user.id, display_name: txt(b.display_name, 160) || null, updated_at: iso() });
  const { data: device, error } = await db.from("vyron_mobile_devices").upsert({
    owner_id: user.id, device_id: deviceId, name, platform, app_version: appVersion,
    architecture, device_kind: "desktop", last_seen_at: iso(), updated_at: iso(),
  }, { onConflict: "owner_id,device_id" }).select("*").single();
  if (error || !device) return out({ ok: false, code: "device_register_failed" }, 500);

  const raw = token();
  const th = await hash(raw);
  await db.from("vyron_mobile_device_credentials").delete().eq("device_id", device.id);
  const { error: ce } = await db.from("vyron_mobile_device_credentials").insert({ device_id: device.id, owner_id: user.id, token_hash: th });
  if (ce) return out({ ok: false, code: "credential_create_failed" }, 500);
  return out({ ok: true, deviceId: device.id, syncDeviceToken: raw, createdAt: iso() });
}

async function resolveChannel(ownerId: string, desktopChannelId: string) {
  const { data } = await db.from("vyron_mobile_channels").select("id").eq("owner_id", ownerId).eq("desktop_channel_id", desktopChannelId).maybeSingle();
  return data?.id as string | undefined;
}
async function resolveProject(ownerId: string, desktopProjectId: string) {
  const { data } = await db.from("vyron_mobile_projects").select("id").eq("owner_id", ownerId).eq("desktop_project_id", desktopProjectId).maybeSingle();
  return data?.id as string | undefined;
}

const projectStates = new Set(["READY_RENDER","RENDERING","COMPLETED","ERROR","QUEUED"]);
const endlumeStates = new Set(["connected","disconnected","idle","rendering","completed","failed"]);
const notificationTypes = new Set(["render_completed","render_failed","upload_completed","upload_failed","content_runway_low","content_runway_critical","publisher_error","desktop_offline","endlume_disconnected"]);

async function applyEvent(ownerId: string, device: any, e: any) {
  const eventId = uuid(e.event_id);
  const eventType = txt(e.event_type, 64);
  const desktopEventAt = date(e.desktop_event_at);
  const payload = e.payload && typeof e.payload === "object" ? e.payload : {};
  if (!eventId || !eventType || !desktopEventAt) return { ok: false, code: "invalid_event" };
  if (hasForbiddenKey(payload)) return { ok: false, code: "secret_field_blocked" };

  let duplicate = false;
  const { error: eventError } = await db.from("vyron_mobile_sync_events").insert({
    event_id: eventId, owner_id: ownerId, device_id: device.id, event_type: eventType,
    entity_type: txt(e.entity_type || eventType.split("_")[0], 64),
    entity_key: txt(e.entity_key, 200) || null,
    desktop_event_at: desktopEventAt, payload_version: 1,
  });
  if (eventError) {
    if (eventError.code !== "23505") return { ok: false, code: "event_insert_failed" };
    const { data: existing } = await db.from("vyron_mobile_sync_events")
      .select("applied_at").eq("event_id", eventId).eq("owner_id", ownerId).maybeSingle();
    if (existing?.applied_at) return { ok: true, duplicate: true, eventId };
    duplicate = true;
  }

  const stamp = iso();
  if (eventType === "channel_upsert") {
    const desktopChannelId = txt(payload.desktop_channel_id, 200);
    const name = txt(payload.name, 300);
    if (!desktopChannelId || !name) return { ok: false, code: "channel_invalid" };
    const row = {
      owner_id: ownerId, desktop_channel_id: desktopChannelId,
      youtube_channel_id: txt(payload.youtube_channel_id, 200) || null,
      name, avatar_url: txt(payload.avatar_url, 1000) || null,
      status: txt(payload.status || "active", 64),
      source_created_at: date(payload.created_at), source_updated_at: date(payload.updated_at),
      last_sync_at: stamp, device_id: device.id, deleted_at: null, last_event_id: eventId, updated_at: stamp,
    };
    const { error } = await db.from("vyron_mobile_channels").upsert(row, { onConflict: "owner_id,desktop_channel_id" });
    if (error) return { ok: false, code: "channel_upsert_failed" };
  } else if (eventType === "channel_delete") {
    const desktopChannelId = txt(payload.desktop_channel_id, 200);
    const { error } = await db.from("vyron_mobile_channels").update({ deleted_at: stamp, last_sync_at: stamp, last_event_id: eventId, updated_at: stamp })
      .eq("owner_id", ownerId).eq("desktop_channel_id", desktopChannelId);
    if (error) return { ok: false, code: "channel_delete_failed" };
  } else if (eventType === "channel_stats") {
    const desktopChannelId = txt(payload.desktop_channel_id, 200);
    const channelId = await resolveChannel(ownerId, desktopChannelId);
    if (!channelId) return { ok: false, code: "channel_missing" };
    const requestedPeriod = int(payload.period_days);
    const periodDays = requestedPeriod === 7 || requestedPeriod === 28 || requestedPeriod === 90 ? requestedPeriod : 28;
    const { error } = await db.from("vyron_mobile_channel_stats").insert({
      owner_id: ownerId, channel_id: channelId, source_event_id: eventId,
      timestamp: date(payload.timestamp) || desktopEventAt,
      period_days: periodDays,
      subscriber_count: int(payload.subscriber_count),
      subscriber_delta_today: int(payload.subscriber_delta_today),
      subscriber_delta_7d: int(payload.subscriber_delta_7d),
      subscriber_delta_28d: int(payload.subscriber_delta_28d),
      subscriber_delta_period: int(payload.subscriber_delta_period),
      views_total: int(payload.views_total), views_today: int(payload.views_today),
      views_7d: int(payload.views_7d), views_28d: int(payload.views_28d),
      views_period: int(payload.views_period),
      video_count: int(payload.video_count), watch_time: num(payload.watch_time),
      ctr: num(payload.ctr), average_view_duration: num(payload.average_view_duration),
      last_published_at: date(payload.last_published_at),
      daily_points: safeJsonArray(payload.daily_points, 100),
      traffic_sources: safeJsonArray(payload.traffic_sources, 50),
    });
    if (error && error.code !== "23505") return { ok: false, code: "stats_insert_failed" };
  } else if (eventType === "project_upsert") {
    const desktopProjectId = txt(payload.desktop_project_id, 200);
    const state = txt(payload.status, 32).toUpperCase();
    const channelId = payload.desktop_channel_id ? await resolveChannel(ownerId, txt(payload.desktop_channel_id, 200)) : null;
    if (!desktopProjectId || !projectStates.has(state)) return { ok: false, code: "project_invalid" };
    const row = {
      owner_id: ownerId, desktop_project_id: desktopProjectId, channel_id: channelId,
      project_name: txt(payload.project_name || desktopProjectId, 300), status: state,
      progress: num(payload.progress), track_count: int(payload.track_count), duration_seconds: num(payload.duration_seconds),
      machine: txt(payload.machine, 160) || txt(device.name, 160) || null, source_created_at: date(payload.created_at),
      source_updated_at: date(payload.updated_at), error_message: txt(payload.error_message, 2000) || null,
      last_sync_at: stamp, deleted_at: null, last_event_id: eventId, updated_at: stamp,
    };
    const { error } = await db.from("vyron_mobile_projects").upsert(row, { onConflict: "owner_id,desktop_project_id" });
    if (error) return { ok: false, code: "project_upsert_failed" };
  } else if (eventType === "project_status") {
    const desktopProjectId = txt(payload.desktop_project_id, 200);
    const state = txt(payload.status, 32).toUpperCase();
    const projectId = await resolveProject(ownerId, desktopProjectId);
    if (!projectId) return { ok: false, code: "project_missing", eventId };
    if (!projectStates.has(state)) return { ok: false, code: "project_status_invalid", eventId };
    const progress = num(payload.progress);
    const errorMessage = txt(payload.error_message, 2000) || null;
    const { error } = await db.from("vyron_mobile_project_status").insert({
      owner_id: ownerId, project_id: projectId, source_event_id: eventId,
      status: state, progress, error_message: errorMessage, timestamp: date(payload.timestamp) || desktopEventAt,
    });
    if (error && error.code !== "23505") return { ok: false, code: "project_status_insert_failed" };
    await db.from("vyron_mobile_projects").update({ status: state, progress, error_message: errorMessage, source_updated_at: date(payload.timestamp) || desktopEventAt, last_sync_at: stamp, last_event_id: eventId, updated_at: stamp }).eq("id", projectId).eq("owner_id", ownerId);
  } else if (eventType === "inventory_upsert") {
    const channelId = await resolveChannel(ownerId, txt(payload.desktop_channel_id, 200));
    if (!channelId) return { ok: false, code: "inventory_channel_missing" };
    const { error } = await db.from("vyron_mobile_content_inventory").upsert({
      channel_id: channelId, owner_id: ownerId,
      ready_video_count: Math.max(0, int(payload.ready_video_count) ?? 0),
      scheduled_video_count: Math.max(0, int(payload.scheduled_video_count) ?? 0),
      published_video_count: Math.max(0, int(payload.published_video_count) ?? 0),
      remaining_content_days: num(payload.remaining_content_days),
      last_local_inventory_scan: date(payload.last_local_inventory_scan),
      next_scheduled_publication: date(payload.next_scheduled_publication),
      folder_state: txt(payload.folder_state, 32) || null, stale: Boolean(payload.stale),
      source_updated_at: date(payload.updated_at) || desktopEventAt, last_event_id: eventId, updated_at: stamp,
    }, { onConflict: "channel_id" });
    if (error) return { ok: false, code: "inventory_upsert_failed" };
  } else if (eventType === "publisher_upsert") {
    const desktopJobId = txt(payload.desktop_job_id, 200);
    const channelId = payload.desktop_channel_id ? await resolveChannel(ownerId, txt(payload.desktop_channel_id, 200)) : null;
    if (!desktopJobId) return { ok: false, code: "publisher_invalid" };
    const { error } = await db.from("vyron_mobile_publisher_jobs").upsert({
      owner_id: ownerId, desktop_job_id: desktopJobId, channel_id: channelId,
      status: txt(payload.status, 64), progress: num(payload.progress),
      scheduled_at: date(payload.scheduled_at), youtube_video_id: txt(payload.youtube_video_id, 200) || null,
      error_message: txt(payload.error_message, 2000) || null,
      source_updated_at: date(payload.updated_at) || desktopEventAt, last_event_id: eventId, updated_at: stamp,
    }, { onConflict: "owner_id,desktop_job_id" });
    if (error) return { ok: false, code: "publisher_upsert_failed" };
  } else if (eventType === "endlume_upsert") {
    const desktopJobId = txt(payload.desktop_job_id, 200);
    const state = txt(payload.state, 32).toLowerCase();
    const projectId = payload.desktop_project_id ? await resolveProject(ownerId, txt(payload.desktop_project_id, 200)) : null;
    if (!desktopJobId || !endlumeStates.has(state)) return { ok: false, code: "endlume_invalid" };
    const { error } = await db.from("vyron_mobile_endlume_jobs").upsert({
      owner_id: ownerId, desktop_job_id: desktopJobId, project_id: projectId, state,
      current_project: txt(payload.current_project, 300) || null, progress: num(payload.progress),
      last_activity: date(payload.last_activity) || desktopEventAt,
      machine_name: txt(payload.machine_name, 160) || txt(device.name, 160) || null,
      error_message: txt(payload.error_message, 2000) || null,
      source_updated_at: date(payload.updated_at) || desktopEventAt, last_event_id: eventId, updated_at: stamp,
    }, { onConflict: "owner_id,desktop_job_id" });
    if (error) return { ok: false, code: "endlume_upsert_failed" };
  } else if (eventType === "notification") {
    const kind = txt(payload.event_type, 64);
    if (!notificationTypes.has(kind)) return { ok: false, code: "notification_invalid" };
    const dedupKey = txt(payload.dedup_key, 300);
    if (!dedupKey) return { ok: false, code: "notification_dedup_missing" };
    const { error } = await db.from("vyron_mobile_notifications").upsert({
      owner_id: ownerId, event_type: kind, dedup_key: dedupKey,
      title: txt(payload.title, 300), body: txt(payload.body, 2000) || null,
      entity_type: txt(payload.entity_type, 64) || null, entity_key: txt(payload.entity_key, 200) || null,
      occurred_at: date(payload.occurred_at) || desktopEventAt, source_event_id: eventId,
    }, { onConflict: "owner_id,dedup_key", ignoreDuplicates: true });
    if (error) return { ok: false, code: "notification_failed" };
  } else {
    return { ok: false, code: "event_type_not_allowed" };
  }

  await db.from("vyron_mobile_sync_events").update({
    applied_at: iso(),
    apply_error: null,
  }).eq("event_id", eventId).eq("owner_id", ownerId);
  return { ok: true, duplicate, eventId };
}


async function heartbeat(req: Request, b: any) {
  const auth = await authDesktop(req);
  if (!auth.ok) return out({ ok: false, code: auth.code }, 401);
  const now = iso();
  const { error } = await db.from("vyron_mobile_devices").update({
    last_seen_at: now,
    updated_at: now,
    app_version: txt(b.app_version || auth.device.app_version, 64),
  }).eq("id", auth.device.id).eq("owner_id", auth.ownerId);
  if (error) return out({ ok: false, code: "heartbeat_failed" }, 500);
  return out({ ok: true, serverTime: now, deviceId: auth.device.id });
}

const permanentEventCodes = new Set([
  "invalid_event","secret_field_blocked","channel_invalid","project_invalid",
  "project_status_invalid","publisher_invalid","endlume_invalid",
  "notification_invalid","notification_dedup_missing","event_type_not_allowed"
]);

async function ingest(req: Request, b: any) {
  const auth = await authDesktop(req);
  if (!auth.ok) return out({ ok: false, code: auth.code }, 401);
  const events = Array.isArray(b.events) ? b.events : [b.event].filter(Boolean);
  if (!events.length || events.length > 100) return out({ ok: false, code: "events_invalid" }, 400);
  await db.from("vyron_mobile_devices").update({ last_seen_at: iso(), updated_at: iso(), app_version: txt(b.app_version || auth.device.app_version, 64) }).eq("id", auth.device.id);
  const results:any[] = [];
  for (const e of events) {
    const result:any = await applyEvent(auth.ownerId, auth.device, e);
    if (result.ok) {
      results.push(result);
      continue;
    }
    const eventId = result.eventId || uuid(e?.event_id);
    const retryable = !permanentEventCodes.has(String(result.code || ""));
    const enriched = { ...result, eventId, retryable };
    results.push(enriched);
    if (eventId) {
      await db.from("vyron_mobile_sync_events").update({
        apply_error: txt(result.code || "apply_failed", 200),
      }).eq("event_id", eventId).eq("owner_id", auth.ownerId).is("applied_at", null);
    }
    break;
  }
  return out({ ok: results.every((x: any) => x.ok), serverTime: iso(), results });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return out({ ok: false, code: "method" }, 405);
  if (Number(req.headers.get("content-length") ?? 0) > 1_000_000) return out({ ok: false, code: "payload_too_large" }, 413);
  let b: any;
  try { b = await req.json(); } catch { return out({ ok: false, code: "json" }, 400); }
  try {
    if (b.action === "create_pairing_code") return await createPairingCode(req);
    if (b.action === "claim_pairing_code") return await claimPairingCode(b);
    if (b.action === "provision_desktop_device") return await provision(req, b);
    if (b.action === "heartbeat") return await heartbeat(req, b);
    if (b.action === "ingest") return await ingest(req, b);
    return out({ ok: false, code: "action" }, 400);
  } catch (e) {
    console.error("vyron-mobile-sync-ingest", e instanceof Error ? e.message : "internal");
    return out({ ok: false, code: "internal" }, 500);
  }
});
