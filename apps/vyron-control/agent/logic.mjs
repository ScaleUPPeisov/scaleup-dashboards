import { createHash } from 'node:crypto';

export const VALID_EVENT_KINDS = new Set([
  'render_started','render_progress','render_completed','render_failed',
  'upload_queued','upload_started','upload_progress','upload_completed','upload_failed',
  'schedule_changed','disk_offline','disk_online','quota_warning','channel_sync',
  'agent_error','agent_info'
]);
const PAYLOAD_FIELDS = new Set([
  'projectId','videoId','stage','percent','remaining','queueSize',
  'durationSeconds','errorCode','source','status','attempt','bytesProcessed'
]);

export function cleanStatus(source) {
  const obj = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const status = {};
  for (const key of [
    'vyronVersion','endlumeVersion','macOSVersion','macModel','architecture',
    'uptimeSeconds','memoryTotalBytes','memoryFreeBytes','rootDiskTotalBytes',
    'rootDiskFreeBytes','macAwake','diskOnline',
    'rendersActive','uploadsQueued','uploadsCompleted','uploadsToday',
    'rendersCompletedToday','uploadFailuresToday','jobsReadyUpload',
    'channelsTotal','channelsBound','lastError','syncCursor'
  ]) {
    const value = obj[key];
    if (typeof value === 'boolean' || (Number.isSafeInteger(value) && value >= 0) ||
        (typeof value === 'string' && value.length <= 150)) status[key] = value;
  }
  status.macAwake = true; // a running bridge proves the process is awake right now
  return status;
}
export function cleanEvent(source, device, offset) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  if (!VALID_EVENT_KINDS.has(source.kind)) return null;
  const at = new Date(source.occurredAt);
  if (!Number.isFinite(at.getTime())) return null;
  const title = String(source.title || source.kind).trim().slice(0,200);
  if (!title) return null;
  const payload = {};
  const input = source.payload && typeof source.payload === 'object' ? source.payload : {};
  for (const [key,value] of Object.entries(input)) {
    if (!PAYLOAD_FIELDS.has(key)) continue;
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length < 160)) payload[key] = value;
  }
  const digest = createHash('sha256').update(JSON.stringify(source)).digest('hex').slice(0,24);
  const id = String(source.id || `evt_${device}_${offset}_${digest}`).slice(0,120);
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(id)) return null;
  const channelId = source.channelId == null ? undefined : String(source.channelId);
  if (channelId && !/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) return null;
  return { id,kind:source.kind,title,occurredAt:at.toISOString(),channelId,payload };
}
export function checkRemoteCommand(command) {
  // No remote publishing, remote updater, file delete or executable commands.
  if (command?.kind !== 'request_status') return { supported:false };
  return { supported:true };
}
