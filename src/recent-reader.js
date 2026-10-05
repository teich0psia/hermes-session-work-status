// Deliberate, read-only dependency on the existing Electron preload bridge.
// Installed SDK listPersistedSessions fixes order=created; it cannot supply recent.
export function createRecentReader(getDesktop = () => globalThis.window?.hermesDesktop) {
  return async route => {
    const desktop = getDesktop();
    if (typeof desktop?.api !== 'function') throw new Error('最近の活動を取得するDesktop通信APIがありません。');
    if (!route || !['connectionId', 'profile', 'targetProfile'].every(key =>
      typeof route[key] === 'string' && route[key].length > 0 && route[key] === route[key].trim())) {
      throw new Error('読取先の所有者を確認できません。');
    }
    const query = new URLSearchParams({ limit: '500', offset: '0', min_messages: '0',
      archived: 'exclude', order: 'recent', profile: route.targetProfile });
    // No profile-routed or local fallback. Reads target the exact source primary;
    // passive fails if it is not warm, rather than cold-starting a backend.
    return desktop.api({ connectionId: route.connectionId, method: 'GET',
      path: `/api/profiles/sessions?${query}`, timeoutMs: 60_000, passive: true });
  };
}
