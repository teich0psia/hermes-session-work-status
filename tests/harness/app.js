import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import plugin from '../../plugin.js';
import { fixtures, host } from './sdk.js';
import { RowButton } from '@native/components/ui/row-button';

let contributions = [];
let disposers = [];
let storageListeners = 0;
let rowClicks = 0;
let rowPointers = 0;
let rowKeys = 0;
const namespace = `hermes.plugin.${plugin.id}.`;
const storage = {
  get(key, fallback) { try { const value = localStorage.getItem(namespace + key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } },
  set(key, value) { if (!fixtures.failWrite) localStorage.setItem(namespace + key, JSON.stringify(value)); }
};
function load() {
  plugin.register({
    storage,
    register(contribution) { contributions.push(contribution); return () => {}; },
    onDispose(dispose) { disposers.push(dispose); },
    addEventListener(target, type, listener) {
      storageListeners++;
      target.addEventListener(type, listener);
      disposers.push(() => { storageListeners--; target.removeEventListener(type, listener); });
    }
  });
}
function unload() { disposers.forEach(fn => fn()); disposers = []; contributions = []; }
load();
let rerender;
function App() {
  const [version, setVersion] = useState(0);
  rerender = () => setVersion(v => v + 1);
  const row = contributions.find(c => c.area === 'sessionRow.trailing');
  const pane = contributions.find(c => c.area === 'panes');
  return React.createElement('main', { key: version },
    React.createElement('aside', { 'aria-label': '既存セッションリスト' },
      React.createElement('h2', {}, 'SDKテスト用セッションリスト'),
      ...['root', 'branch', 'collision', 'missing'].map(id => React.createElement(RowButton, {
        key: id, 'data-row': id, tabIndex: 0,
        onClick: () => rowClicks++, onPointerDown: () => rowPointers++, onKeyDown: () => rowKeys++
      }, React.createElement('span', {}, id), row ? row.data.render({ sessionId: id }) : null))
    ),
    pane ? React.createElement('div', { id: 'pane' }, pane.render()) : React.createElement('p', {}, 'Plugin disabled')
  );
}
createRoot(document.getElementById('root')).render(React.createElement(App));
window.testHarness = {
  fixtures, host,
  metrics: () => ({ rowClicks, rowPointers, rowKeys, storageListeners, contributions: contributions.length, profileListeners: host.state.profile.lc, connectionListeners: host.state.connectionId.lc }),
  disable: () => { unload(); rerender(); },
  hotReload: () => { unload(); load(); rerender(); },
  switchProfile: () => host.state.profile.set(host.state.profile.get() === 'route-a' ? 'route-b' : 'route-a'),
  rotate: () => { fixtures.pages.local[0].id = 'new-live-tip'; },
  branch: () => { fixtures.pages.local.push({ id: 'new-branch', profile: 'backend-a', title: '新しい分岐' }); },
  addCollision: () => { fixtures.pages.nas.push({ id: 'root', profile: 'backend-b', title: 'root collision' }); }
};
