import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STATES, RAW_KEY, STORAGE_KEY, decode, identityKey, filterItems, readCatalog as readRealCatalog, resolveRow, saveStatus } from '../src/core.js';
import { createController } from '../src/controller.js';
// Controlled catalog IO, not a claim about SDK order support.
const readPage = host => route => host.listPersistedSessions(route, { profile: route.targetProfile, limit: 500, order: 'recent' });
const readCatalog = (host, isCurrent) => readRealCatalog(host, isCurrent, readPage(host));
const route = { connectionId: 'local', mode: 'local', profile: 'desktop-route', targetProfile: 'backend' };
const item = { route, sessionId: 'root' };
const row = { id: 'rotated', _lineage_root_id: 'root', profile: 'backend', title: '作業' };
const page = sessions => ({ sessions, total: sessions.length, offset: 0, errors: [] });
function storageFixture(initial = null) {
  let raw = initial === null ? null : JSON.stringify(initial);
  let fail = false;
  return {
    raw: { getItem: key => { assert.equal(key, RAW_KEY); return raw; } },
    storage: {
      get: (key, fallback) => { assert.equal(key, STORAGE_KEY); try { return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; } },
      set: (key, value) => { assert.equal(key, STORAGE_KEY); if (!fail) raw = JSON.stringify(value); }
    },
    corrupt: value => { raw = value; }, fail: () => { fail = true; }
  };
}
function atom(value) {
  const listeners = new Set();
  return { get: () => value, set: next => { value = next; listeners.forEach(fn => fn(value)); }, listen: fn => { listeners.add(fn); return () => listeners.delete(fn); }, count: () => listeners.size };
}
function setup(read = async () => page([row]), initial = null) {
  const f = storageFixture(initial);
  const cleanup = [];
  let calls = 0;
  const profile = atom('desktop-route');
  const connectionId = atom('local');
  const host = { state: { profile, connectionId }, profileRoutes: async () => [route], listPersistedSessions: async (...args) => { calls++; return read(...args); }, notify: () => {} };
  const ctx = { storage: f.storage, onDispose: fn => cleanup.push(fn), addEventListener: () => {} };
  const controller = createController(ctx, host, atom, f.raw, readPage(host));
  return { f, host, controller, calls: () => calls, dispose: () => cleanup.forEach(fn => fn()) };
}
test('four manual states, reset unclassified, persistence and owner separation', () => {
  const f = storageFixture();
  for (const value of Object.keys(STATES)) {
    const result = saveStatus(f.storage, f.raw, item, value);
    assert.equal(result.entries[identityKey(item)] ?? 'unclassified', value);
  }
  saveStatus(f.storage, f.raw, item, 'done');
  const other = { ...item, route: { ...route, connectionId: 'remote' } };
  const result = saveStatus(f.storage, f.raw, other, 'paused');
  assert.equal(result.entries[identityKey(item)], 'done');
  assert.equal(result.entries[identityKey(other)], 'paused');
  assert.equal(filterItems([item, other], result.entries, 'done').length, 1);
});
test('unknown schema, state, noncanonical identity and malformed JSON never overwrite', () => {
  for (const value of [{ version: 2, entries: {} }, { version: 1, entries: { [identityKey(item)]: 'unknown' } }, { version: 1, entries: { '["a", "b", "c"]': 'done' } }]) assert.throws(() => decode(value));
  const f = storageFixture(); f.corrupt('{broken');
  assert.throws(() => saveStatus(f.storage, f.raw, item, 'done'), /読み取れません/);
  assert.equal(f.raw.getItem(RAW_KEY), '{broken');
});
test('swallowed SDK write failure is detected without optimistic state', () => {
  const f = storageFixture(); f.fail();
  assert.throws(() => saveStatus(f.storage, f.raw, item, 'done'), /保存できません/);
  assert.equal(f.storage.get(STORAGE_KEY, null), null);
});
test('catalog uses backend profile, durable lineage and dedupes route aliases', async () => {
  let calls = 0;
  const catalog = await readCatalog({ profileRoutes: async () => [route, { ...route, profile: 'alias' }], listPersistedSessions: async (r, options) => {
    calls++; assert.equal(options.profile, 'backend'); assert.equal(options.limit, 500); assert.equal(options.order, 'recent'); return page([row, { id: 'branch', parent_session_id: 'root', profile: 'backend' }, { id: 'new', _reset_from: 'root', profile: 'backend' }]);
  } });
  assert.equal(calls, 1); assert.equal(catalog.items.length, 3);
  assert.ok(catalog.items.some(item => item.sessionId === 'root'));
  assert.ok(!catalog.items.some(item => item.sessionId === 'rotated'));
  assert.notEqual(identityKey(catalog.items.find(x => x.sessionId === 'branch')), identityKey(item));
});
test('catalog keeps separate owners and discloses full windows or failed reads', async () => {
  const remote = { ...route, connectionId: 'remote' };
  const catalog = await readCatalog({ profileRoutes: async () => [route, remote], listPersistedSessions: async () => page([row]) });
  assert.equal(catalog.items.filter(item => item.sessionId === 'root').length, 2);
  for (const response of [page(Array.from({ length: 500 }, (_, i) => ({ ...row, id: `row-${i}` }))), page(Array.from({ length: 501 }, (_, i) => ({ ...row, id: `pin-${i}`, pinned: true }))), { ...page([row]), errors: [{ profile: 'backend', error: 'DB locked' }] }, page([{ ...row, profile: 'wrong' }])]) {
    const partial = await readCatalog({ profileRoutes: async () => [route], listPersistedSessions: async () => response });
    assert.equal(partial.complete, false); assert.ok(partial.issues.length);
    assert.equal(resolveRow(partial, 'root').item, undefined);
  }
});
test('real backend short page with hidden total remains editable', async () => {
  const response = JSON.parse(await readFile(new URL('./fixtures/hidden-short.json', import.meta.url), 'utf8'));
  assert.equal(response.total, 2); assert.equal(response.sessions.length, 1);
  const backendRoute = { ...route, targetProfile: 'default' };
  const catalog = await readCatalog({ profileRoutes: async () => [backendRoute], listPersistedSessions: async () => response });
  assert.equal(catalog.complete, true); assert.deepEqual(catalog.issues, []);
  assert.equal(catalog.items.find(item => item.sessionId === 'visible').route.targetProfile, 'default');
  assert.equal(resolveRow(catalog, 'visible').item.sessionId, 'visible');
});
test('dispose stops queued owner reads while uncancellable requests finish', async () => {
  const releases = [];
  const s = setup(() => new Promise(resolve => releases.push(() => resolve(page([row])))));
  s.host.profileRoutes = async () => Array.from({ length: 7 }, (_, i) => ({ ...route, connectionId: `r${i}` }));
  const task = s.controller.refresh();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.calls(), 3);
  s.dispose(); const frozen = s.controller.state.get();
  releases.splice(0).forEach(release => release());
  await new Promise(resolve => setImmediate(resolve));
  const callsAfterDispose = s.calls();
  // Drain the buggy implementation too so the RED test never leaves pending work.
  while (releases.length) {
    releases.splice(0).forEach(release => release());
    await new Promise(resolve => setImmediate(resolve));
  }
  await task;
  assert.equal(callsAfterDispose, 3); assert.equal(s.calls(), 3);
  assert.equal(s.controller.state.get(), frozen);
});
test('cache/dedupe; resume/runtime busy never auto-changes manual status', async () => {
  const s = setup();
  await Promise.all([s.controller.refresh(), s.controller.refresh()]);
  assert.equal(s.calls(), 1);
  s.controller.ensure(); assert.equal(s.calls(), 1);
  s.controller.setRowStatus(s.controller.state.get().catalog.items[0], 'done');
  await s.controller.refresh();
  assert.equal(s.controller.state.get().entries[identityKey(item)], 'done');
  const reloaded = createController({ storage: s.f.storage, onDispose: () => {}, addEventListener: () => {} }, s.host, atom, s.f.raw);
  assert.equal(reloaded.state.get().entries[identityKey(item)], 'done');
  s.dispose();
});
test('row owner ambiguity rejects stale slot action without namespace write', async () => {
  const s = setup();
  await s.controller.refresh();
  const staleItem = s.controller.state.get().catalog.items[0];
  s.host.profileRoutes = async () => [route, { ...route, connectionId: 'remote' }];
  await s.controller.refresh();
  s.controller.setRowStatus(staleItem, 'done');
  assert.equal(s.controller.state.get().entries[identityKey(staleItem)], undefined);
  assert.match(s.controller.state.get().message, /複数/);
  s.dispose();
});

test('profile change invalidates immediately, in-flight results retry, dispose prevents late updates', async () => {
  let release;
  let reads = 0;
  const releases = [];
  const s = setup(async () => { reads++; if (reads <= 3) await new Promise(resolve => releases.push(resolve)); return page([row]); });
  s.host.profileRoutes = async () => s.host.state.profile.get() === 'another'
    ? [{ ...route, connectionId: 'fresh' }]
    : Array.from({ length: 7 }, (_, i) => ({ ...route, connectionId: `old-${i}` }));
  const pending = s.controller.refresh();
  await new Promise(resolve => setImmediate(resolve));
  s.host.state.profile.set('another');
  assert.equal(s.controller.state.get().catalog.complete, false);
  assert.equal(reads, 3);
  releases.forEach(resolve => resolve()); await pending; assert.equal(reads, 4);
  assert.deepEqual(s.controller.state.get().catalog.items.map(item => item.route.connectionId), ['fresh']);
  assert.equal(s.host.state.profile.count(), 1);
  s.dispose(); assert.equal(s.host.state.profile.count(), 0); assert.equal(s.host.state.connectionId.count(), 0);
  const before = s.controller.state.get(); await s.controller.refresh(); s.controller.setStatus(item, 'working');
  assert.equal(s.controller.state.get(), before);
  const delayed = setup(() => new Promise(resolve => { release = resolve; }));
  const task = delayed.controller.refresh(); await new Promise(resolve => setImmediate(resolve));
  delayed.dispose(); const frozen = delayed.controller.state.get(); release(page([row])); await task;
  assert.equal(delayed.controller.state.get(), frozen);
});
