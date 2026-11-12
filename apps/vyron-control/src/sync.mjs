import { batches, dueSlots, quotaDay, safeNumber, subscriberMilestones } from './core.mjs';

export class SyncEngine {
  constructor({ store, channels, apiKey, quotaBudget = 200, fetchImpl = fetch, now = () => new Date() }) {
    this.store = store;
    this.channels = channels;
    this.apiKey = apiKey;
    this.quotaBudget = quotaBudget;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.running = false;
  }

  quota() {
    const current = quotaDay(this.now());
    const q = this.store.data.localQuota;
    if (q.day !== current) return { day: current, spent: 0, budget: this.quotaBudget };
    return { day: current, spent: q.spent, budget: this.quotaBudget };
  }

  publicStatus() {
    const state = this.store.data;
    const channelRows = this.channels.map(({ id, name }) => ({
      id,
      name: state.channels[id]?.name || name,
      subscribers: state.channels[id]?.subscribers ?? null,
      subscribersRounded: true,
      subscribersHidden: state.channels[id]?.subscribersHidden ?? null,
      views: state.channels[id]?.views ?? null,
      videos: state.channels[id]?.videos ?? null,
      updatedAt: state.channels[id]?.updatedAt ?? null,
      previousSubscribers: state.channels[id]?.previousSubscribers ?? null
    }));
    const sum = (field) => {
      const known = channelRows.filter(ch => ch[field] !== null);
      return {
        value: known.reduce((acc, ch) => acc + ch[field], 0),
        covered: known.length,
        total: channelRows.length
      };
    };
    return {
      timezone: 'Asia/Krasnoyarsk',
      schedule: ['07:00', '22:00'],
      quota: { ...this.quota(), scope: 'vyron-control-local-only', note: 'Other Mac/apps/API clients are NOT included' },
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError,
      lastSource: state.lastSource,
      syncing: this.running,
      configured: Boolean(this.apiKey && this.channels.length),
      channels: channelRows,
      totalSubscribers: sum('subscribers'),
      totalViews: sum('views'),
      totalVideos: sum('videos'),
      events: state.events.slice(-50).reverse()
    };
  }

  async tick() {
    const slots = dueSlots(this.now(), this.store.data.completedSlots);
    if (!slots.length || this.running) return;
    await this.refresh('schedule', slots[0].key);
  }

  async refresh(source = 'manual', slotKey = null) {
    if (this.running) throw Object.assign(new Error('Sync is already running'), { status: 409 });
    if (!this.apiKey || this.channels.length === 0)
      throw Object.assign(new Error('Configure VYRON_YOUTUBE_API_KEY and channel IDs'), { status: 503 });
    const state = this.store.data;
    if (slotKey && state.completedSlots.includes(slotKey)) return this.publicStatus();
    const now = this.now();
    if (source === 'manual' && state.lastAttemptAt &&
        now.getTime() - Date.parse(state.lastAttemptAt) < 5 * 60 * 1000)
      throw Object.assign(new Error('Manual refresh cooldown: 5 minutes'), { status: 429 });

    this.running = true;
    state.lastAttemptAt = now.toISOString();
    state.lastSource = source;
    state.lastError = null;
    if (slotKey) {
      // At-most-once per slot; no repeated API calls every minute after a failure.
      state.completedSlots = [...state.completedSlots, slotKey].slice(-100);
    }
    try {
      await this.store.save();
      let updated = 0;
      for (const group of batches(this.channels)) {
        const q = this.quota();
        if (q.spent + 1 > this.quotaBudget)
          throw Object.assign(new Error('Local API quota budget exhausted'), { status: 429 });
        state.localQuota = { day: q.day, spent: q.spent + 1 };
        // Reserve BEFORE sending the request. An ambiguous HTTP error can still cost quota.
        await this.store.save();
        const params = new URLSearchParams({
          part: 'snippet,statistics',
          id: group.map(ch => ch.id).join(','),
          key: this.apiKey,
          maxResults: '50'
        });
        const response = await this.fetchImpl(
          `https://www.googleapis.com/youtube/v3/channels?${params}`,
          { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } }
        );
        if (!response.ok) throw new Error(`YouTube API returned HTTP ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload.items)) throw new Error('Invalid YouTube API response');
        const ids = new Set(group.map(ch => ch.id));
        for (const item of payload.items) {
          if (!ids.has(item.id)) continue;
          const prev = state.channels[item.id];
          const hidden = item.statistics?.hiddenSubscriberCount === true;
          const subscribers = hidden ? null : safeNumber(item.statistics?.subscriberCount);
          const baseline = prev?.maxMilestone ??
            (prev?.subscribers === null || prev?.subscribers === undefined
              ? null : Math.floor(prev.subscribers / 100) * 100);
          const milestones = subscriberMilestones(baseline, subscribers);
          for (const milestone of milestones) {
            state.events.push({
              id: `${item.id}:${milestone}`,
              type: 'subscriber_milestone',
              channelId: item.id,
              name: item.snippet?.title || prev?.name || item.id,
              milestone,
              detectedAt: this.now().toISOString(),
              approximate: true
            });
          }
          const candidate = subscribers === null ? null : Math.floor(subscribers / 100) * 100;
          const maxMilestone = candidate === null
            ? (prev?.maxMilestone ?? null)
            : Math.max(candidate, prev?.maxMilestone ?? 0);
          state.channels[item.id] = {
            name: String(item.snippet?.title || prev?.name || item.id).slice(0, 120),
            subscribers, subscribersHidden: hidden,
            previousSubscribers: prev?.subscribers ?? null,
            views: safeNumber(item.statistics?.viewCount),
            videos: safeNumber(item.statistics?.videoCount),
            maxMilestone,
            updatedAt: this.now().toISOString(),
            history: [...(prev?.history || []), {
              at: this.now().toISOString(), subscribers,
              views: safeNumber(item.statistics?.viewCount),
              videos: safeNumber(item.statistics?.videoCount)
            }].slice(-400)
          };
          updated++;
        }
        state.events = state.events.slice(-1000);
        await this.store.save();
      }
      state.lastSuccessAt = this.now().toISOString();
      state.lastError = null;
      await this.store.save();
      return { updated, status: this.publicStatus() };
    } catch (error) {
      state.lastError = String(error.message || 'Unknown sync error').slice(0, 300);
      await this.store.save();
      throw error;
    } finally {
      this.running = false;
    }
  }
}
