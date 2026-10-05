export const STATES = Object.freeze({ unclassified: '未分類', working: '作業中', paused: '保留', done: '完了' });
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
  if (!value || value.version !== 1 || Object.keys(value).some(key => !['version', 'entries'].includes(key))
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
  if (!Object.hasOwn(STATES, state) || !validRoute(item.route) || !nonempty(item.sessionId)) throw new Error('状態または所有者が不正です。');
  const current = readStatuses(storage, rawStorage);
  const entries = { ...current.entries };
  const key = identityKey(item);
  if (state === 'unclassified') delete entries[key]; else entries[key] = state;
  const next = { version: 1, entries };
  storage.set(STORAGE_KEY, next);
  // SDK writeKey is best-effort and silently ignores quota/permission errors.
  if (JSON.stringify(storage.get(STORAGE_KEY, null)) !== JSON.stringify(next)) {
    throw new Error('保存できませんでした。状態は変更していません。');
  }
  return next;
}
export async function readCatalog(host, isCurrent = () => true) {
  if (typeof host.profileRoutes !== 'function' || typeof host.listPersistedSessions !== 'function') {
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
        const page = await host.listPersistedSessions(route, { profile: route.targetProfile, limit: 500 });
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
          const item = { route, sessionId, liveId: session.id, title: session.title || session.preview || sessionId };
          items.set(identityKey(item), item);
        }
      } catch (error) {
        issues.push(`${label}: ${error.message}`);
        // Never retain a partial page with contradictory owner metadata.
        for (const [key, item] of items) if (ownerKey(item.route) === ownerKey(route)) items.delete(key);
      }
    }
  }));
  return { items: [...items.values()].sort((a, b) => a.title.localeCompare(b.title, 'ja')), issues, complete: issues.length === 0 };
}
export function resolveRow(catalog, sessionId) {
  if (!catalog.complete) return { reason: '所有者一覧が未完了です。作業セッションで更新・確認してください。' };
  const matches = catalog.items.filter(item => item.sessionId === sessionId);
  if (matches.length !== 1) return { reason: matches.length ? '複数の所有者に同じIDがあります。作業セッションで所有者を選んでください。' : '所有者未確認です。作業セッションで一覧を更新してください。' };
  return { item: matches[0] };
}
export function filterItems(items, entries, filter) {
  return filter === 'all' ? items : items.filter(item => (entries[identityKey(item)] ?? 'unclassified') === filter);
}
