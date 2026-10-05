import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import plugin from '../../plugin.js';
import { fixtures, host } from './sdk.js';
import { RowButton } from '@native/components/ui/row-button';
import { SessionContextMenu, SessionActionsMenu } from '@native/app/chat/sidebar/session-actions-menu';
import { SessionRowSlot } from '@native/app/chat/sidebar/session-row-slots';
import { registry } from '@native/contrib/registry';
import { useContributions } from '@native/contrib/react/use-contributions';
let disposers = [], storageListeners = 0, rowClicks = 0;
const namespace = `hermes.plugin.${plugin.id}.`;
const storage = {
  get(key, fallback) { try { const raw = localStorage.getItem(namespace + key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; } },
  set(key, value) { if (!fixtures.failWrite) localStorage.setItem(namespace + key, JSON.stringify(value)); }
};
window.hermesDesktop = { getProfileRoutes: async () => fixtures.routes, api: request => host.readRecentPage(request) };
function load() {
  plugin.register({ storage, register(c) { const dispose = registry.register({ ...c, id: `${plugin.id}:${c.id}`, source: `plugin:${plugin.id}` }); disposers.push(dispose); return dispose; },
    onDispose(fn) { disposers.push(fn); }, addEventListener(target, type, listener) {
      storageListeners++; target.addEventListener(type, listener);
      disposers.push(() => { storageListeners--; target.removeEventListener(type, listener); });
    }
  });
}
function unload() { disposers.splice(0).forEach(fn => fn()); }
load();
let rerender;
const rows = [
  { sessionId: 'root', title: '設計を進める', route: fixtures.routes[0] },
  { sessionId: 'branch', title: 'ブランチの調査', route: fixtures.routes[0] },
  { sessionId: 'other', title: '別プロファイルの作業', route: fixtures.routes[1] },
  { sessionId: 'old', title: '取得窓の外の会話', route: fixtures.routes[0] },
  { sessionId: 'root', title: '同じID・NAS', route: fixtures.routes[1] }
];
function App() {
  const [version, setVersion] = useState(0);
  rerender = () => setVersion(v => v + 1);
  const chrome = useContributions('titleBar.right');
  return React.createElement('main', { key: version },
    React.createElement('aside', { 'aria-label': 'Native row fixture' }, React.createElement('h2', null, 'Hermes · セッション'), ...rows.filter(item => !(fixtures.hideCollisionRow && item.route.connectionId === 'nas' && item.sessionId === 'root')).map((item, index) => {
      const actions = { sessionId: `live-${item.sessionId}`, title: item.title, profile: item.route.targetProfile,
        onPin: () => {}, onArchive: () => {}, onDelete: () => {} };
      return React.createElement('div', { key: index },
        React.createElement(SessionContextMenu, actions, React.createElement(RowButton, { 'data-row': `${item.route.connectionId}-${item.sessionId}`, onClick: () => rowClicks++ }, item.title,
          React.createElement(SessionRowSlot, { area: 'sessionRow.trailing', sessionId: item.sessionId }))),
        React.createElement(SessionActionsMenu, actions, React.createElement('button', { 'aria-label': `More ${index}` }, '…')));
    })),
    ...chrome.map(c => React.createElement(React.Fragment, { key: c.id }, c.render()))
  );
}
createRoot(document.getElementById('root')).render(React.createElement(App));
window.testHarness = { fixtures, host,
  metrics: () => ({ rowClicks, storageListeners, menus: registry.getArea('sessionMenu.actions').length,
    panes: registry.getArea('panes').length, rowSlots: registry.getArea('sessionRow.trailing').length,
    profileListeners: host.state.profile.lc, connectionListeners: host.state.connectionId.lc }),
  disable: () => { unload(); rerender(); }, hotReload: () => { unload(); load(); rerender(); },
  palette: () => registry.getArea('palette')[0].data.run(),
  keybind: () => registry.getArea('keybinds')[0].data.run(), rerender: () => rerender()
};
