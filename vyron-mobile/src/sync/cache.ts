import Storage from "expo-sqlite/kv-store";
import type { MobileSnapshot } from "./types";
import { decodeCachedSnapshot, EMPTY_MOBILE_SNAPSHOT } from "./cacheCodec";

const SNAPSHOT_PREFIX = "vyron-mobile:snapshot:v1:";
const DEVICE_ID_KEY = "vyron-mobile:device-id:v1";

export const EMPTY_SNAPSHOT: MobileSnapshot = EMPTY_MOBILE_SNAPSHOT;

export async function loadSnapshot(userId: string): Promise<MobileSnapshot | null> {
  try {
    const raw = await Storage.getItem(SNAPSHOT_PREFIX + userId);
    if (!raw) return null;
    return decodeCachedSnapshot(raw);
  } catch {
    return null;
  }
}

export async function saveSnapshot(userId: string, snapshot: MobileSnapshot) {
  await Storage.setItem(SNAPSHOT_PREFIX + userId, JSON.stringify(snapshot));
}

function looseUuid() {
  const p = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return p.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getOrCreateDeviceId() {
  const existing = await Storage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = globalThis.crypto?.randomUUID?.() ?? looseUuid();
  await Storage.setItem(DEVICE_ID_KEY, id);
  return id;
}
