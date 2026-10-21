import type { ChannelStatRow, MobileChannelRow, MobileSnapshot } from "./types";

export function latestStats(stats: ChannelStatRow[], periodDays: 7 | 28 | 90 = 28) {
  const out = new Map<string, ChannelStatRow>();
  for (const row of stats) {
    if (row.period_days !== periodDays) continue;
    const prev = out.get(row.channel_id);
    if (!prev || Date.parse(row.timestamp) > Date.parse(prev.timestamp)) out.set(row.channel_id, row);
  }
  return out;
}

export function channelSparkline(stats: ChannelStatRow[], channelId: string, periodDays: 7 | 28 | 90 = 28) {
  const latest = latestStats(stats, periodDays).get(channelId);
  const daily = Array.isArray(latest?.daily_points) ? latest!.daily_points : [];
  const values = daily
    .map(x => Number((x as any).views))
    .filter(Number.isFinite)
    .slice(-14);
  if (values.length >= 2) return values;
  return stats
    .filter(x => x.channel_id === channelId && x.views_total != null)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-14)
    .map(x => Number(x.views_total))
    .filter(Number.isFinite);
}

export function viewsForPeriod(row: ChannelStatRow | undefined, period: 7 | 28 | 90) {
  if (!row) return null;
  if (row.views_period != null && row.period_days === period) return row.views_period;
  if (period === 7) return row.views_7d;
  if (period === 28) return row.views_28d;
  return null;
}

export function subscribersForPeriod(row: ChannelStatRow | undefined, period: 7 | 28 | 90) {
  if (!row) return null;
  if (row.subscriber_delta_period != null && row.period_days === period) return row.subscriber_delta_period;
  if (period === 7) return row.subscriber_delta_7d;
  if (period === 28) return row.subscriber_delta_28d;
  return null;
}

export function aggregateAnalytics(snapshot: MobileSnapshot, period: 7 | 28 | 90) {
  const byChannel = latestStats(snapshot.stats, period);
  const rows = [...byChannel.values()];
  const views = rows.reduce((n, x) => n + (viewsForPeriod(x, period) ?? 0), 0);
  const subscribers = rows.reduce((n, x) => n + (subscribersForPeriod(x, period) ?? 0), 0);
  const watchRows = rows.filter(x => x.watch_time != null);
  const ctrRows = rows.filter(x => x.ctr != null);
  const watchTime = watchRows.length ? watchRows.reduce((n, x) => n + Number(x.watch_time ?? 0), 0) : null;
  const ctr = ctrRows.length ? ctrRows.reduce((n, x) => n + Number(x.ctr ?? 0), 0) / ctrRows.length : null;

  const daily = new Map<string, number>();
  for (const row of rows) {
    for (const p of row.daily_points ?? []) {
      const d = String((p as any).date ?? "");
      const v = Number((p as any).views);
      if (d && Number.isFinite(v)) daily.set(d, (daily.get(d) ?? 0) + v);
    }
  }

  const traffic = new Map<string, number>();
  for (const row of rows) {
    for (const p of row.traffic_sources ?? []) {
      const key = String((p as any).key ?? (p as any).source ?? "");
      const v = Number((p as any).views);
      if (key && Number.isFinite(v)) traffic.set(key, (traffic.get(key) ?? 0) + v);
    }
  }

  const topChannels = snapshot.channels
    .filter(c => !c.deleted_at)
    .map(channel => ({ channel, stat: byChannel.get(channel.id), views: viewsForPeriod(byChannel.get(channel.id), period) }))
    .filter(x => x.views != null)
    .sort((a, b) => Number(b.views) - Number(a.views));

  return {
    available: rows.length > 0,
    views: rows.length ? views : null,
    subscribers: rows.length ? subscribers : null,
    watchTime,
    ctr,
    daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
    traffic: [...traffic.entries()].sort((a, b) => b[1] - a[1]),
    topChannels,
  };
}

export function channelState(channel: MobileChannelRow, snapshot: MobileSnapshot) {
  const inventory = snapshot.inventory.find(x => x.channel_id === channel.id);
  if (/error|failed/i.test(channel.status)) return { label: "Ошибка загрузки", tone: "red" as const };
  if (inventory?.folder_state === "OFFLINE" || inventory?.stale) return { label: "Нет подключения", tone: "amber" as const };
  const days = inventory?.remaining_content_days;
  if (days != null && days <= 0) return { label: "Нужно добавить видео", tone: "red" as const };
  if (days != null && days <= 6) return { label: "Нужно добавить видео", tone: "amber" as const };
  const next = inventory?.next_scheduled_publication ? new Date(inventory.next_scheduled_publication) : null;
  if (next && next.toDateString() === new Date().toDateString()) return { label: "Публикация сегодня", tone: "blue" as const };
  return { label: "Всё нормально", tone: "green" as const };
}

export function formatMetric(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(Number(value));
}

export function relativeSyncTime(value: string | null) {
  if (!value) return "Нет подтверждённой синхронизации";
  const delta = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Данные обновлены только что";
  if (minutes < 60) return `Данные обновлены ${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  return `Данные обновлены ${hours} ч назад`;
}
