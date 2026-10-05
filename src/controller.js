import { identityKey, readCatalog, readStatuses, registeredItems, resolveRow, saveStatus, validRoute } from './core.js';

export function createController(ctx, host, makeAtom, rawStorage, readPage) {
  const state = makeAtom({ entries: {}, details: {}, storageIssue: '', message: '', catalog: { items: [], issues: [], complete: false }, loading: false });
  let disposed = false;
  let inFlight = null;
  let epoch = 0;
  let loaded = false;
  let loadedAt = 0;
  const update = patch => { if (!disposed) state.set({ ...state.get(), ...patch }); };
  function reloadStorage() {
    try { const saved = readStatuses(ctx.storage, rawStorage); update({ entries: saved.entries, details: saved.details || {}, storageIssue: '' }); }
    catch (error) { update({ storageIssue: error.message }); }
  }
  reloadStorage();
  async function refresh() {
    if (disposed) return;
    if (inFlight) return inFlight;
    update({ loading: true, catalog: { ...state.get().catalog, complete: false }, message: '' });
    inFlight = (async () => {
      let generation;
      do {
        generation = epoch;
        try {
          const catalog = await readCatalog(host, () => !disposed && generation === epoch, readPage);
          if (generation === epoch) { loaded = true; loadedAt = Date.now(); update({ catalog }); }
        } catch (error) {
          if (generation === epoch) update({ catalog: { items: [], issues: [error.message], complete: false } });
        }
      } while (!disposed && generation !== epoch);
    })().finally(() => { inFlight = null; update({ loading: false }); });
    return inFlight;
  }
  function invalidate() {
    if (disposed) return;
    epoch++;
    loaded = false;
    update({ catalog: { items: [], issues: [], complete: false } });
    void refresh();
  }
  function setStatus(item, next, fromRow = false) {
    if (disposed) return;
    try {
      const current = state.get();
      if (!validRoute(item.route) && (fromRow || !Object.hasOwn(current.entries, identityKey(item)))) throw new Error('所有者を確認できません。');
      if (fromRow) {
        const resolved = resolveRow(current.catalog, item.sessionId);
        if (current.loading || !resolved.item || identityKey(resolved.item) !== identityKey(item)) throw new Error(resolved.issue || '所有者が変更されました。メニューを開き直してください。');
        item = resolved.item;
      } else if (!registeredItems(current.catalog, current.entries, current.details).some(entry => identityKey(entry) === identityKey(item))) throw new Error('登録済みの状態を確認してください。');
      // Retain dates only for this exact owner/durable id.
      const catalogItem = current.catalog.items.find(entry => identityKey(entry) === identityKey(item));
      const saved = saveStatus(ctx.storage, rawStorage, { ...item,
        last_active: catalogItem?.last_active || item.last_active,
        started_at: catalogItem?.started_at || item.started_at
      }, next);
      update({ entries: saved.entries, details: saved.details || {}, storageIssue: '', message: '' });
    } catch (error) {
      reloadStorage();
      update({ message: error.message });
      host.notify({ kind: 'error', message: error.message });
    }
  }
  ctx.onDispose(() => { disposed = true; epoch++; });
  for (const source of [host.state?.profile, host.state?.connectionId]) {
    if (source?.listen) ctx.onDispose(source.listen(invalidate));
  }
  if (typeof window !== 'undefined') {
    ctx.addEventListener(window, 'storage', event => {
      if (event.key === null || event.key === 'hermes.plugin.session-work-status.work-status-v1') reloadStorage();
    });
  }
  const ensure = () => !loaded || Date.now() - loadedAt >= 30_000 ? refresh() : Promise.resolve();
  return { state, refresh, ensure,
    setStatus: (item, next) => setStatus(item, next),
    setRowStatus: (item, next) => setStatus(item, next, true) };
}
