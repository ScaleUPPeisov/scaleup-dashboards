import test from 'node:test';
import assert from 'node:assert/strict';
import {
  zonedParts, quotaDay, dueSlots, subscriberMilestones, batches, normalizeChannels
} from './core.mjs';
import { initialState } from './store.mjs';
import { SyncEngine } from './sync.mjs';

test('Krasnoyarsk 07:00 and 22:00 are independent of server time zone', () => {
  const morning = new Date('2026-11-13T00:00:00Z');
  const evening = new Date('2026-11-13T15:00:00Z');
  assert.deepEqual(zonedParts(morning, 'Asia/Krasnoyarsk'), { day: '2026-11-13', hour: 7, minute: 0 });
  assert.deepEqual(dueSlots(morning, []).map(x => x.key), ['2026-11-13@07:00']);
  assert.deepEqual(dueSlots(evening, []).map(x => x.key), ['2026-11-13@22:00']);
  assert.deepEqual(dueSlots(new Date('2026-11-13T00:16:00Z'), []), []);
  assert.deepEqual(dueSlots(morning, ['2026-11-13@07:00']), []);
});

test('quota accounting reset follows Pacific Time rather than Krasnoyarsk', () => {
  assert.equal(quotaDay(new Date('2026-11-13T07:59:59Z')), '2026-11-12');
  assert.equal(quotaDay(new Date('2026-11-13T08:00:00Z')), '2026-11-13');
});

test('subscriber milestones do not notify historic thresholds or repeat previously reached ones', () => {
  assert.deepEqual(subscriberMilestones(null, 900), []);
  assert.deepEqual(subscriberMilestones(100, 310), [200, 300]);
  assert.deepEqual(subscriberMilestones(300, 295), []);
  assert.deepEqual(subscriberMilestones(300, 310), []);
});

test('channel validation rejects duplicate or invalid IDs and batches up to 50', () => {
  assert.throws(() => normalizeChannels([{ id: 'not-id' }]));
  const ids = Array.from({ length: 101 }, (_, i) => ({ id: 'UC' + String(i).padStart(22, '0'), name: 'Channel ' + i }));
  assert.equal(normalizeChannels(ids).length, 101);
  assert.deepEqual(batches(ids).map(x => x.length), [50, 50, 1]);
  assert.throws(() => normalizeChannels([ids[0], ids[0]]));
});

function mockedEngine(count, subscriber = 190) {
  const channels = Array.from({ length: count }, (_, i) => ({ id: 'UC' + String(i).padStart(22, '0'), name: 'Test ' + i }));
  const data = initialState();
  const store = { data, save: async () => undefined };
  let calls = 0;
  let subscriberCount = subscriber;
  let clock = new Date('2026-11-13T00:00:00Z');
  const engine = new SyncEngine({
    store, channels, apiKey: 'TEST_KEY', quotaBudget: 10,
    now: () => clock,
    fetchImpl: async url => {
      calls++;
      const ids = new URL(url).searchParams.get('id').split(',');
      return { ok: true, json: async () => ({
        items: ids.map(id => ({
          id, snippet: { title: 'Channel ' + id },
          statistics: { subscriberCount: String(subscriberCount),
            hiddenSubscriberCount: false, videoCount: '15', viewCount: '5000' }
        }))
      }) };
    }
  });
  return { engine, data,
    get calls() { return calls; },
    setSubscribers: count => { subscriberCount = count; },
    setTime: date => { clock = new Date(date); }
  };
}

test('33 channels use one API call per refresh and milestones are idempotent', async () => {
  const fixture = mockedEngine(33);
  await fixture.engine.refresh('schedule', '2026-11-13@07:00');
  assert.equal(fixture.calls, 1);
  assert.equal(fixture.data.events.length, 0); // first snapshot is a baseline
  assert.equal(fixture.engine.publicStatus().totalSubscribers.value, 33 * 190);
  await fixture.engine.tick();
  assert.equal(fixture.calls, 1); // 07:00 slot cannot run twice
  fixture.setSubscribers(310);
  fixture.setTime('2026-11-13T15:00:00Z');
  await fixture.engine.tick();
  assert.equal(fixture.calls, 2);
  assert.equal(fixture.data.events.length, 66); // 200 and 300 for each channel
  assert.deepEqual([...new Set(fixture.data.events.map(e => e.milestone))], [200, 300]);
  await fixture.engine.tick();
  assert.equal(fixture.calls, 2);
  // The 07:00 and 22:00 Krasnoyarsk runs straddle the Pacific quota-day reset.\n  assert.equal(fixture.engine.publicStatus().quota.spent, 1);
  fixture.setTime('2026-11-13T15:06:00Z');
  await fixture.engine.refresh('manual');
  assert.equal(fixture.data.events.length, 66); // no duplicate notifications
});

test('manual refresh is throttled to avoid accidental quota burn', async () => {
  const fixture = mockedEngine(1);
  await fixture.engine.refresh('manual');
  await assert.rejects(() => fixture.engine.refresh('manual'), { status: 429 });
  assert.equal(fixture.calls, 1);
});

test('small local budget blocks API calls before they are sent', async () => {
  const fixture = mockedEngine(51);
  fixture.engine.quotaBudget = 1;
  await assert.rejects(() => fixture.engine.refresh('manual'), { status: 429 });
  assert.equal(fixture.calls, 1);
  assert.equal(fixture.engine.publicStatus().lastSuccessAt, null);
});
