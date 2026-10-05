import { createRecentReader } from './recent-reader.js';
export const STATES = Object.freeze({ unclassified: '状態を解除', working: '作業中', paused: '保留', done: '完了' });
export const STORAGE_KEY = 'work-status-v1';
export const PLUGIN_ID = 'session-work-status';
export const RAW_KEY = `hermes.plugin.${PLUGIN_ID}.${STORAGE_KEY}`;
const nonempty = value => typeof value === 'string' && value.length > 0 && value === value.trim();
export const ownerKey = route => JSON.stringify([route.connectionId, route.targetProfile]);
export const identityKey = item => JSON.stringify([item.route.connectionId, item.route.targetProfile, item.sessionId]);
export function validRoute(route) {
  return route && nonempty(route.connectionId) && nonempty(route.profile) && nonempty(route.targetProfile)
    && ['local', 'remote'].includes(route.mode);
}
export function decode(value) {
  if (value === null) return { version: 1, entries: {} };
  if (!value || value.version !== 1 || Object.keys(value).some(key => !['version', 'entries', 'details'].includes(key))
    || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) {
    throw new Error('保存データの形式が不明です。上書きせず停止しました。');
  }
  for (const [key, state] of Object.entries(value.entries)) {
    let identity;
    try { identity = JSON.parse(key); } catch { throw new Error('保存された識別子が不正です。'); }
    if (!Array.isArray(identity) || identity.length !== 3 || !identity.every(nonempty)
      || JSON.stringify(identity) !== key || !Object.hasOwn(STATES, state)) {
      throw new Error('保存データに未知の状態または識別子があります。');
    }
  }
  if (value.details != null) {
    if (typeof value.details !== 'object' || Array.isArray(value.details)) throw new Error('保存された表示情報が不正です。');
    for (const [key, item] of Object.entries(value.details)) {
      if (!item || !validRoute(item.route) || !nonempty(item.sessionId) || identityKey(item) !== key
        || typeof item.title !== 'string') throw new Error('保存された所有者情報が不正です。');
    }
  }
  return value;
}
export function readStatuses(storage, rawStorage) {
  // SDK get() swallows malformed JSON and unavailable storage; check raw presence
  // without writing outside our exact plugin namespace.
  const raw = rawStorage.getItem(RAW_KEY);
  const value = storage.get(STORAGE_KEY, null);
  if (raw !== null && value === null) throw new Error('保存データを読み取れません。上書きせず停止しました。');
  return decode(value);
}
export function saveStatus(storage, rawStorage, item, state) {
  if (!Object.hasOwn(STATES, state) || !nonempty(item.route?.connectionId) || !nonempty(item.route?.targetProfile) || !nonempty(item.sessionId)) throw new Error('状態または所有者が不正です。');
  const current = readStatuses(storage, rawStorage);
  const entries = { ...current.entries };
  const key = identityKey(item);
  // Legacy registrations can be changed/reset by their saved identity even
  // while disconnected. Never invent a local route for missing saved details.
  if (!validRoute(item.route) && !Object.hasOwn(entries, key)) throw new Error('所有者を確認できません。');
  if (state === 'unclassified') delete entries[key]; else entries[key] = state;
  const details = { ...current.details };
  if (state === 'unclassified') delete details[key];
  else if (validRoute(item.route)) details[key] = { sessionId: item.sessionId, route: { ...item.route }, title: item.title || item.sessionId,
    last_active: item.last_active || current.details?.[key]?.last_active || 0,
    started_at: item.started_at || current.details?.[key]?.started_at || 0 };
  const next = { version: 1, entries, details };
  storage.set(STORAGE_KEY, next);
  // SDK writeKey is best-effort and silently ignores quota/permission errors.
  if (JSON.stringify(storage.get(STORAGE_KEY, null)) !== JSON.stringify(next)) {
    throw new Error('保存できませんでした。状態は変更していません。');
  }
  return next;
}
export async function readCatalog(host, isCurrent = () => true, readPage = createRecentReader()) {
  if (typeof host.profileRoutes !== 'function') {
    throw new Error('このDesktopは必要なSDKに未対応です。');
  }
  const routes = await host.profileRoutes();
  if (!Array.isArray(routes) || routes.length === 0 || routes.some(route => !validRoute(route))) {
    throw new Error('接続・プロファイルの所有者一覧を確定できません。');
  }
  const unique = [...new Map(routes.map(route => [ownerKey(route), { ...route }])).values()];
  const items = new Map();
  const issues = [];
  // Bounded concurrency: no polling, no gateway RPC, no cold profile socket.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, unique.length) }, async () => {
    while (isCurrent() && cursor < unique.length) {
      const route = unique[cursor++];
      const label = `${route.connectionId} / ${route.targetProfile}`;
      try {
        const page = await readPage(route);
        if (!page || !Array.isArray(page.sessions) || !Number.isInteger(page.total) || page.total < 0 || page.offset !== 0) {
          throw new Error('一覧の形式が不正です');
        }
        if (page.errors?.length || Object.keys(page.storage ?? {}).length) throw new Error('履歴DBの一部を読み取れません');
        // Backend total includes hidden rows that the list excludes. Pins may
        // back-fill beyond 500; a full window cannot prove owner completeness.
        if (page.sessions.length >= 500) issues.push(`${label}: 取得上限500件に達しています（pin追加分を含む）。全履歴を確認できません。`);
        for (const session of page.sessions) {
          const sessionId = session._lineage_root_id ?? session.id;
          if (!nonempty(session.id) || !nonempty(sessionId)
            || (session.profile != null && session.profile !== route.targetProfile)
            || (session.connection_id != null && session.connection_id !== route.connectionId)) {
            throw new Error('セッション所有者またはIDが不明です');
          }
          if (session.hidden || session.archived) continue;
          const item = { route, sessionId, liveId: session.id, title: session.title || session.preview || sessionId, last_active: session.last_active || 0, started_at: session.started_at || 0 };
          items.set(identityKey(item), item);
        }
      } catch (error) {
        issues.push(`${label}: ${error.message}`);
        // Never retain a partial page with contradictory owner metadata.
        for (const [key, item] of items) if (ownerKey(item.route) === ownerKey(route)) items.delete(key);
      }
    }
  }));
  return { items: [...items.values()], routes: unique, issues, complete: issues.length === 0 };
}
// A slot supplies only a durable id. Never substitute the focused owner.
export function resolveRow(catalog, sessionId) {
  const candidates = catalog.items.filter(item => item.sessionId === sessionId);
  if (candidates.length > 1) return { issue: '同じIDが複数の所有者にあります。行からは変更できません。' };
  if (!catalog.complete) return { issue: '一覧の読取が未完了です。所有者を確定できません。' };
  if (candidates.length !== 1) return { issue: '取得範囲内にこの会話がありません。登録済みなら作業管理で操作できます。' };
  return { item: candidates[0] };
}
export function registeredItems(catalog, entries, details = {}) {
  const items = new Map(catalog.items.map(item => {
    const key = identityKey(item);
    return [key, { ...item, last_active: item.last_active || details[key]?.last_active || 0,
      started_at: item.started_at || details[key]?.started_at || 0, available: true }];
  }));
  for (const [key, state] of Object.entries(entries)) {
    if (state === 'unclassified' || items.has(key)) continue;
    const [connectionId, targetProfile, sessionId] = JSON.parse(key);
    const route = catalog.routes?.find(route => route.connectionId === connectionId && route.targetProfile === targetProfile);
    const saved = details[key];
    items.set(key, { ...saved, sessionId,
      route: route || saved?.route || { connectionId, targetProfile },
      title: saved?.title || sessionId, available: Boolean(route), outsideWindow: true });
  }
  return filterItems([...items.values()], entries, 'all');
}
export function sortItems(items, sort) {
  return [...items].sort((a, b) => {
    const delta = sort === 'title' ? a.title.localeCompare(b.title, 'ja')
      : sort === 'created' ? (b.started_at || 0) - (a.started_at || 0)
      : (b.last_active || b.started_at || 0) - (a.last_active || a.started_at || 0);
    return delta || identityKey(a).localeCompare(identityKey(b));
  });
}
export function filterItems(items, entries, filter) {
  return items.filter(item => entries[identityKey(item)] && entries[identityKey(item)] !== 'unclassified'
    && (filter === 'all' || entries[identityKey(item)] === filter));
}
