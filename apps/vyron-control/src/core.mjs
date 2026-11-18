export const KRASNOYARSK_TZ = 'Asia/Krasnoyarsk';
export const QUOTA_TZ = 'America/Los_Angeles';
export const SYNC_HOURS = [7, 22];
export const SUBSCRIBER_STEP = 100;

export function zonedParts(date, timeZone) {
  const fields = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const p = Object.fromEntries(fields.map(({ type, value }) => [type, value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute)
  };
}

export function quotaDay(date) {
  return zonedParts(date, QUOTA_TZ).day;
}

// Only run close to the intended wall-clock slot. A restarted server must not
// silently issue a stale morning refresh later that evening.
export function dueSlots(date, alreadyCompleted = [], graceMinutes = 15) {
  const { day, hour, minute } = zonedParts(date, KRASNOYARSK_TZ);
  const currentMinute = hour * 60 + minute;
  return SYNC_HOURS.map(slot => ({
    slot, key: `${day}@${String(slot).padStart(2, '0')}:00`
  })).filter(({ slot, key }) =>
    currentMinute >= slot * 60 &&
    currentMinute < slot * 60 + graceMinutes &&
    !alreadyCompleted.includes(key)
  );
}

export function subscriberMilestones(previousMax, current, step = SUBSCRIBER_STEP) {
  if (!Number.isSafeInteger(current) || current < 0) return [];
  if (previousMax === null || previousMax === undefined) return [];
  if (!Number.isSafeInteger(previousMax) || previousMax < 0) return [];
  const last = Math.floor(current / step) * step;
  if (last <= previousMax) return [];
  const result = [];
  for (let n = Math.floor(previousMax / step) * step + step; n <= last; n += step) {
    result.push(n);
    if (result.length >= 100) break; // safety cap for corrupt or huge jumps
  }
  if (result.length === 100 && last > result[result.length - 1]) {
    result.push(last);
  }
  return result;
}

export function batches(items, size = 50) {
  if (!Number.isInteger(size) || size < 1 || size > 50) throw new Error('Invalid batch size');
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export function normalizeChannels(raw) {
  if (!Array.isArray(raw)) throw new Error('Channels must be an array');
  const seen = new Set();
  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid channel entry');
    const id = String(entry.id || '').trim();
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(id)) throw new Error('Invalid YouTube channel ID');
    if (seen.has(id)) throw new Error('Duplicate YouTube channel ID');
    seen.add(id);
    return { id, name: String(entry.name || id).slice(0, 120) };
  });
}

export function safeNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
