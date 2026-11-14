export const KRASNOYARSK_TIMEZONE = 'Asia/Krasnoyarsk';
export const PACIFIC_TIMEZONE = 'America/Los_Angeles';
export const CRON_BY_HOUR = Object.freeze({ '0 0 * * *': '07:00', '0 15 * * *': '22:00' });
export const DEFAULT_DAILY_BUDGET = 200;
export const VIDEO_ID_PREFIX = /^UC[A-Za-z0-9_-]{22}$/;
const TIME_FIELDS = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };

export function zonedClock(date, timezone = KRASNOYARSK_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...TIME_FIELDS }).formatToParts(date);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}
export function cronSlot(cron, date) {
  const time = CRON_BY_HOUR[cron];
  if (!time) return null;
  const local = zonedClock(date);
  if (`${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}` !== time) return null;
  return `${local.date}@${time}`;
}
export function pacificDay(date) { return zonedClock(date, PACIFIC_TIMEZONE).date; }
export function chunk(items, size = 50) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 50) throw new Error('Invalid chunk size');
  const all = [];
  for (let i = 0; i < items.length; i += size) all.push(items.slice(i, i + size));
  return all;
}
export function validatedChannelList(input) {
  if (!Array.isArray(input) || input.length > 100) throw new Error('Invalid list or more than 100 channels');
  const seen = new Set();
  return input.map(item => {
    const id = String(item?.id || '');
    const name = String(item?.name || id).slice(0,120);
    if (!VIDEO_ID_PREFIX.test(id) || seen.has(id)) throw new Error('Invalid or duplicate channel ID');
    seen.add(id);
    return { id, name };
  });
}
export function publicCount(value) {
  if (value == null || value === '') return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}
export function crossedMilestones(previousMax, current, cap = 20) {
  if (previousMax == null || current == null || current <= previousMax) return [];
  if (!Number.isSafeInteger(previousMax) || !Number.isSafeInteger(current) || current < 0) return [];
  const result = [];
  let first = (Math.floor(previousMax / 100) + 1) * 100;
  const end = Math.floor(current / 100) * 100;
  for (let n = first; n <= end && result.length < cap; n += 100) result.push(n);
  if (result.length === cap && end > result.at(-1)) result.push(end);
  return result;
}
export function baselineMilestone(value) {
  return value == null ? null : Math.floor(value / 100) * 100;
}
export function safeEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid event');
  const id = String(input.id || '');
  const kind = String(input.kind || '');
  const validKinds = new Set([
    'render_started','render_progress','render_completed','render_failed',
    'upload_queued','upload_started','upload_progress','upload_completed','upload_failed',
    'schedule_changed','disk_offline','disk_online','quota_warning','channel_sync',
    'agent_error','agent_info'
  ]);
  const occurredAt = new Date(input.occurredAt).toISOString();
  const channelId = input.channelId == null ? null : String(input.channelId);
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(id) || !validKinds.has(kind) ||
      (channelId != null && !VIDEO_ID_PREFIX.test(channelId))) throw new Error('Invalid event identifier or kind');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new Error('Invalid event title');
  const payload = input.payload ?? {};
  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length > 4000) throw new Error('Event payload too large');
  if (Math.abs(Date.now() - Date.parse(occurredAt)) > 365*86400000) throw new Error('Event timestamp out of accepted range');
  return { id, kind, channelId, title: input.title.trim(), payloadJson, occurredAt };
}
export function acceptedCommand(input) {
  const target = String(input?.targetDevice || '');
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(target)) throw new Error('Invalid target device');
  // Safe commands only in MVP. NEVER allow publisher/resume/update commands here
  // until the real Mac owner has validated them and an authorization audit passes.
  if (input.kind !== 'request_status') throw new Error('Unsupported remote command');
  const id = String(input.id || '');
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(id)) throw new Error('Invalid idempotency ID');
  return { id, target, kind: 'request_status', payloadJson: '{}' };
}
