import { identityKey, readCatalog, readStatuses, resolveRow, saveStatus } from './core.js';

export function createController(ctx, host, makeAtom, rawStorage) {
  const state = makeAtom({ entries: {}, storageIssue: '', message: '', catalog: { items: [], issues: [], complete: false }, loading: false });
  let disposed = false;
  let inFlight = null;
  let epoch = 0;
  let loaded = false;
  const update = patch => { if (!disposed) state.set({ ...state.get(), ...patch }); };
  function reloadStorage() {
    try { update({ entries: readStatuses(ctx.storage, rawStorage).entries, storageIssue: '' }); }
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
          const catalog = await readCatalog(host, () => !disposed && generation === epoch);
          if (generation === epoch) { loaded = true; update({ catalog }); }
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
      if (current.loading || !current.catalog.items.some(entry => identityKey(entry) === identityKey(item))) throw new Error('一覧を更新してから変更してください。');
      if (fromRow) {
        const resolved = resolveRow(current.catalog, item.sessionId);
        if (!resolved.item || identityKey(resolved.item) !== identityKey(item)) throw new Error(resolved.reason || '所有者が変わりました。');
      }
      const saved = saveStatus(ctx.storage, rawStorage, item, next);
      update({ entries: saved.entries, storageIssue: '', message: '' });
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
  return { state, refresh, setStatus, ensure: () => { if (!loaded) void refresh(); } };
}
