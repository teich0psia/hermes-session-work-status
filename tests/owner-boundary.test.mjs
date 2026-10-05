// Unmodified installed routing helpers + production plugin reader/catalog.
// Controlled IO: this does NOT invoke Electron or a live HTTP backend.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { createRecentReader } from '../src/recent-reader.js';
import { readCatalog, resolveRow, identityKey, saveStatus, registeredItems } from '../src/core.js';
const source = process.env.HERMES_SOURCE;
if (!source) throw new Error('Set HERMES_SOURCE to the unmodified installed Hermes source');
const electron = resolve(source, 'apps/desktop/electron');
const built = await build({ stdin: { contents: `export { tagRegistrySessionResponse } from './profile-session-routing.ts'; export { buildRegistryProfileRoutes } from './plugin-profile-routes.ts';`, resolveDir: electron, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const modules = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const routes = modules.buildRegistryProfileRoutes({ sources: [
  { id: 'local', kind: 'local' }, { id: 'nas', kind: 'ssh', remoteProfile: 'backend' }, { id: 'nas2', kind: 'remote' }
], agents: [{ connectionId: 'local', profile: 'backend' }, { connectionId: 'nas', profile: 'default' }, { connectionId: 'nas2', profile: 'backend' }] });
assert.equal(routes.find(r => r.connectionId === 'nas').targetProfile, 'backend');
const calls = [];
const reader = createRecentReader(() => ({ api: async request => {
  calls.push(request);
  const query = new URL(request.path, 'http://fixture.invalid').searchParams;
  assert.equal(request.method, 'GET'); assert.equal(request.passive, true);
  assert.equal(request.timeoutMs, 60_000); assert.equal(query.get('profile'), 'backend');
  assert.equal(query.get('order'), 'recent'); assert.equal(query.get('offset'), '0');
  assert.equal(query.get('limit'), '500'); assert.equal(query.get('archived'), 'exclude');
  assert.equal(query.get('min_messages'), '0'); assert.equal(request.profile, undefined);
  return modules.tagRegistrySessionResponse(request.path, { sessions: [
    { id: 'live', _lineage_root_id: 'shared', profile: 'backend', title: request.connectionId, last_active: 90, started_at: 1 }
  ], total: 2, offset: 0 }, request.connectionId);
} }));
const catalog = await readCatalog({ profileRoutes: async () => [...routes, { ...routes[0], profile: 'alias' }] }, undefined, reader);
assert.equal(calls.length, 3); assert.equal(catalog.items.length, 3); assert.equal(catalog.complete, true);
assert.equal(new Set(catalog.items.map(identityKey)).size, 3);
assert.match(resolveRow(catalog, 'shared').issue, /複数/);
assert.deepEqual(calls.map(r => r.connectionId).sort(), ['local', 'nas', 'nas2']);
let raw = null;
const storage = { get: (_key, fallback) => raw === null ? fallback : JSON.parse(raw), set: (_key, value) => { raw = JSON.stringify(value); } };
const item = catalog.items.find(i => i.route.connectionId === 'nas');
const saved = saveStatus(storage, { getItem: () => raw }, item, 'working');
assert.equal(registeredItems({ items: [], routes }, saved.entries, saved.details)[0].route.connectionId, 'nas');
await assert.rejects(createRecentReader(() => ({}))(routes[0]), /通信API/);
const failed = await readCatalog({ profileRoutes: async () => routes }, undefined, createRecentReader(() => ({ api: async () => { throw new Error('source unavailable'); } })));
assert.equal(failed.complete, false); assert.equal(failed.items.length, 0);
assert.equal(failed.issues.length, 3); // no local fallback after remote rejection
const contradictory = await readCatalog({ profileRoutes: async () => [routes[0]] }, undefined, async () => ({ sessions: [{ id: 'id', profile: 'backend', connection_id: 'nas' }], total: 1, offset: 0 }));
assert.equal(contradictory.items.length, 0); assert.equal(contradictory.complete, false);
console.log(JSON.stringify({ kind: 'Unmodified installed registry/tag helpers + plugin bridge adapter; controlled IO, NOT Electron/API acceptance', routes, calls, identities: catalog.items.map(identityKey), checks: 'exact source/alias, recent query, dedupe, collision rejection, hidden short page, persistence, missing bridge/failed source/contradiction rejection' }, null, 2));
