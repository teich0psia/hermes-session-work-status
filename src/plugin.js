import {
  host, atom, useValue, Button, Input, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownMenuItem, SESSION_ROW_AREAS, PALETTE_AREA, KEYBINDS_AREA, TITLEBAR_AREAS
} from '@hermes/plugin-sdk';
import { useEffect, useRef, useState } from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { STATES, PLUGIN_ID, identityKey, filterItems, registeredItems, resolveRow, sortItems } from './core.js';
import { createController } from './controller.js';

const quiet = { color: 'var(--ui-text-secondary)', fontSize: '11px' };
const marks = { working: '●', paused: 'Ⅱ', done: '✓' };
const states = Object.entries(STATES).filter(([value]) => value !== 'unclassified');
const SORT_KEY = 'work-status-sort-v1';
const sorts = { recent: '最近の活動', created: '作成日時', title: 'タイトル' };

// Freeze identity order only; routes/availability must never be snapshots.
function retainOrder(previous, fresh) {
  const present = new Set(fresh);
  const seen = new Set(previous);
  return [...previous.filter(key => present.has(key)), ...fresh.filter(key => !seen.has(key))];
}

const colors = { working: 'var(--ui-accent)', paused: 'var(--ui-yellow)', done: 'var(--ui-green)' };
function RowMark({ controller, sessionId, openManager }) {
  const data = useValue(controller.state);
  const [open, setOpen] = useState(false);
  const parent = useRef(null);
  useEffect(() => { void controller.ensure(); }, [controller]);
  const { item, issue } = resolveRow(data.catalog, sessionId);
  const current = item ? data.entries[identityKey(item)] : undefined;
  const blocked = data.loading || !item || Boolean(data.storageIssue);
  return jsxs(DropdownMenu, { open, onOpenChange: setOpen, children: [
    jsx(DropdownMenuTrigger, { asChild: true, children: jsx('span', {
      'data-work-status': sessionId, title: `作業状態${current ? `: ${STATES[current]}` : 'を設定（左クリック）'}`,
      // Pointer-only decoration inside the native RowButton, not a nested
      // button or independent keyboard stop. Keyboard status editing is in Dialog.
      style: { display: 'inline-flex', padding: '2px 5px', cursor: 'pointer', color: colors[current] || 'var(--ui-text-quaternary)', fontSize: '12px' },
      onPointerDown: event => { if (event.button === 0) { event.preventDefault(); event.stopPropagation(); } },
      onClick: event => {
        event.preventDefault(); event.stopPropagation();
        parent.current = event.currentTarget.closest('button');
        setOpen(value => !value); void controller.ensure();
      }, children: marks[current] || '◇'
    }) }),
    jsx(DropdownMenuContent, { align: 'end',
      onPointerDown: event => event.stopPropagation(), onClick: event => event.stopPropagation(),
      onKeyDown: event => event.stopPropagation(),
      onCloseAutoFocus: event => { event.preventDefault(); if (parent.current?.isConnected) parent.current.focus(); },
      children: [
        jsx('div', { style: { ...quiet, padding: '5px 8px' }, children: '作業状態' }, 'heading'),
        ...states.map(([value, label]) => jsx(DropdownMenuItem, { disabled: blocked,
          onSelect: () => controller.setRowStatus(item, value),
          children: jsxs('span', { children: [jsx('span', { style: { color: colors[value] }, children: `${marks[value]} ` }), label, current === value ? ' ✓' : ''] })
        }, value)),
        jsx(DropdownMenuItem, { disabled: blocked || !current || current === 'unclassified',
          onSelect: () => controller.setRowStatus(item, 'unclassified'), children: STATES.unclassified }, 'reset'),
        ...(blocked ? [jsx('div', { role: 'status', style: { ...quiet, maxWidth: '260px', padding: '6px 8px' },
          children: data.storageIssue || (data.loading ? '所有者を確認中…' : data.catalog.issues[0] || issue) }, 'issue'),
          jsx(DropdownMenuItem, { onSelect: openManager, children: '作業管理を開く' }, 'manager')] : [])
      ] })
  ] });
}
function StatusMenu({ controller, item }) {
  const data = useValue(controller.state);
  const current = data.entries[identityKey(item)];
  const blocked = Boolean(data.storageIssue);
  return jsxs(DropdownMenu, { children: [
    jsx(DropdownMenuTrigger, { asChild: true, children: jsx(Button, { size: 'xs', variant: 'chip',
      disabled: blocked, style: { color: colors[current] }, 'aria-label': `作業状態: ${STATES[current] || ''}`, children: `${marks[current] || ''} ${STATES[current] || ''}` }) }),
    jsx(DropdownMenuContent, { align: 'end', children: [
      ...states.map(([value, label]) => jsx(DropdownMenuItem, { disabled: blocked,
        onSelect: () => controller.setStatus(item, value), children: label }, value)),
      jsx(DropdownMenuItem, { disabled: blocked, onSelect: () => controller.setStatus(item, 'unclassified'), children: STATES.unclassified }, 'reset')
    ] })
  ] });
}
function WorkDialog({ ctx, controller, surface, openerRef }) {
  const data = useValue(controller.state);
  const open = useValue(surface);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState(() => {
    const saved = ctx.storage.get(SORT_KEY, 'recent');
    return Object.hasOwn(sorts, saved) ? saved : 'recent';
  });
  const [snapshot, setSnapshot] = useState([]);
  const [selected, setSelected] = useState('');
  const interaction = useRef(0);
  const pending = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const dispose = surface.listen(() => { generation.current++; });
    return () => { mounted.current = false; generation.current++; dispose(); };
  }, [surface]);
  const searchRef = useRef(null);
  const rowRefs = useRef(new Map());
  const readItems = () => {
    const current = controller.state.get();
    return registeredItems(current.catalog, current.entries, current.details);
  };
  useEffect(() => {
    if (!open) return;
    let current = true;
    const initialInteraction = interaction.current;
    setSearch(''); setFilter('all'); setSelected('');
    setSnapshot(sortItems(readItems(), sort).map(identityKey));
    void controller.refresh().then(() => {
      if (!current) return;
      const fresh = sortItems(readItems(), sort).map(identityKey);
      setSnapshot(previous => {
        if (interaction.current === initialInteraction || previous.length === 0) return fresh;
        return retainOrder(previous, fresh);
      });
    });
    return () => { current = false; };
  }, [open]);
  const liveItems = registeredItems(data.catalog, data.entries, data.details);
  const byKey = new Map(liveItems.map(item => [identityKey(item), item]));
  const keys = [...byKey.keys()];
  useEffect(() => {
    if (open) setSnapshot(previous => retainOrder(previous, keys));
  }, [open, data.catalog, data.entries, data.details]);
  const items = filterItems(retainOrder(snapshot, keys).map(key => byKey.get(key)), data.entries, filter).filter(item =>
    `${item.title} ${item.sessionId} ${item.route.connectionId} ${item.route.targetProfile}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const openItem = async item => {
    if (!item.route || pending.current) return;
    // Read imperatively: an invalidation may precede React's disabled render.
    const latest = controller.state.get();
    if (latest.loading || latest.storageIssue) return;
    const fresh = registeredItems(latest.catalog, latest.entries, latest.details).find(entry => identityKey(entry) === identityKey(item));
    if (!fresh?.available) return;
    pending.current = true; setOpening(true);
    const started = generation.current;
    const current = () => mounted.current && generation.current === started && surface.get();
    try {
      await host.openSession(fresh.sessionId, { route: fresh.route, intent: 'in-place' });
      if (current()) surface.set(false);
    } catch (error) {
      if (current()) host.notify({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      pending.current = false;
      if (mounted.current) setOpening(false);
    }
  };
  const move = (event, direction) => {
    if (!items.length) return;
    event.preventDefault();
    const index = items.findIndex(item => identityKey(item) === selected);
    const nextIndex = index < 0 ? (direction > 0 ? 0 : items.length - 1) : (index + direction + items.length) % items.length;
    const next = items[nextIndex];
    const key = identityKey(next);
    setSelected(key); rowRefs.current.get(key)?.focus();
  };
  return jsx(Dialog, { open, onOpenChange: value => surface.set(value), children:
    jsxs(DialogContent, { bodyClassName: 'overscroll-contain', style: { width: 'min(560px, 92vw)', maxHeight: '80vh' },
      onPointerDown: () => { interaction.current++; }, onKeyDown: () => { interaction.current++; },
      onCloseAutoFocus: event => { event.preventDefault(); openerRef.current?.focus(); },
      onOpenAutoFocus: event => { event.preventDefault(); searchRef.current?.focus(); }, children: [
      jsxs(DialogHeader, { children: [jsx(DialogTitle, { children: '作業管理' }),
        jsx(DialogDescription, { children: '状態を設定した会話だけを表示します。解除しても会話は残ります。' })] }),
      jsx(Input, { ref: searchRef, 'aria-label': '作業セッションを検索', placeholder: '登録済みセッションを検索…', value: search,
        onChange: event => { interaction.current++; setSearch(event.target.value); setSelected(''); }, onKeyDown: event => {
          if (event.key === 'ArrowDown') move(event, 1);
          if (event.key === 'ArrowUp') move(event, -1);
          if (event.key === 'Enter') openItem(items.find(item => identityKey(item) === selected) || items[0] || {});
        } }),
      jsxs('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }, children: [
        ...Object.entries({ all: 'すべて', ...Object.fromEntries(states) }).map(([value, label]) => jsx(Button, {
          size: 'xs', variant: filter === value ? 'secondary' : 'ghost', 'aria-pressed': filter === value,
          onClick: () => { interaction.current++; setFilter(value); setSelected(''); }, children: label
        }, value)),
        jsx('label', { children: jsxs('span', { children: ['並び順 ', jsx('select', { 'aria-label': '並び順', value: sort,
          style: { color: 'var(--ui-text-primary)', background: 'var(--ui-bg-secondary)' }, onChange: event => {
            interaction.current++;
            const value = event.target.value;
            ctx.storage.set(SORT_KEY, value);
            if (ctx.storage.get(SORT_KEY, null) !== value) { host.notify({ kind: 'error', message: '並び順を保存できませんでした。' }); return; }
            setSort(value); setSnapshot(sortItems(readItems(), value).map(identityKey)); setSelected('');
          }, children: Object.entries(sorts).map(([value, label]) => jsx('option', { value, children: label }, value)) })] }) }),
        jsx(Button, { size: 'xs', variant: 'outline', disabled: data.loading, onClick: async () => {
          const started = generation.current;
          const initialInteraction = interaction.current;
          await controller.refresh();
          if (mounted.current && surface.get() && generation.current === started && interaction.current === initialInteraction) setSnapshot(sortItems(readItems(), sort).map(identityKey));
        }, children: data.loading ? '更新中…' : '一覧を更新' })
      ] }),
      ...[data.storageIssue, data.message, ...data.catalog.issues].filter(Boolean).map((message, index) => jsx('div', {
        role: 'alert', style: quiet, children: message
      }, `issue-${index}`)),
      jsx('p', { style: quiet, children: '最近活動500件＋pin追加分／所有者と保存済み登録。取得範囲外は保存情報です。操作中は順序を固定します。' }),
      jsx('div', { 'aria-label': '登録済みセッション', children: items.length ? items.map(item => {
        const key = identityKey(item);
        return jsxs('article', { 'data-session': item.sessionId, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 4px', borderBottom: '1px solid var(--ui-stroke-secondary)', background: selected === key ? 'var(--ui-bg-card)' : 'transparent' }, children: [
          jsx('span', { 'aria-hidden': true, style: { color: colors[data.entries[key]] }, children: marks[data.entries[key]] }),
          jsxs('div', { style: { flex: 1, minWidth: 0 }, children: [
            jsx(Button, { ref: node => { if (node) rowRefs.current.set(key, node); else rowRefs.current.delete(key); },
              variant: 'ghost', style: { maxWidth: '100%', textAlign: 'left', whiteSpace: 'normal', overflowWrap: 'anywhere', justifyContent: 'flex-start' },
              disabled: opening || data.loading || !item.available || Boolean(data.storageIssue), 'aria-label': `会話を選択: ${item.title}`,
              onFocus: () => setSelected(key), onClick: () => setSelected(key), onKeyDown: event => {
                if (event.key === 'Enter') { event.preventDefault(); openItem(item); }
                if (event.key === 'ArrowDown') move(event, 1); if (event.key === 'ArrowUp') move(event, -1);
              }, children: item.title }),
            jsx('div', { style: quiet, children: `${item.route.connectionId} / ${item.route.targetProfile}${item.outsideWindow ? ' · 取得範囲外（保存情報）' : ''}${data.loading ? ' · 所有者を確認中…' : !item.available ? ' · 接続未確認' : ''}` })
          ] }), jsx(StatusMenu, { controller, item })
        ] }, key);
      }) : jsx('p', { style: quiet, children: data.loading ? '読み込み中…' : 'この条件の登録済みセッションはありません。' }) }),
      jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '12px' }, children: [
        jsx('span', { style: quiet, children: `${items.length}件の登録済みセッション` }),
        jsx(Button, { size: 'sm', disabled: opening || data.loading || !items.some(item => identityKey(item) === selected && item.available) || Boolean(data.storageIssue),
          onClick: () => openItem(items.find(item => identityKey(item) === selected) || {}), children: opening ? '開いています…' : 'セッションを開く' })
      ] })
    ] }) });
}
export default {
  id: PLUGIN_ID, name: 'Session Work Status',
  description: '行末マークの左クリックで手動状態を設定し、登録済みの会話をDialogで管理。',
  register(ctx) {
    const controller = createController(ctx, host, atom, { getItem: key => window.localStorage.getItem(key) });
    const surface = atom(false);
    const open = () => surface.set(true);
    ctx.register({ id: 'session-status-mark', area: SESSION_ROW_AREAS.trailing,
      data: { render: ({ sessionId }) => jsx(RowMark, { controller, sessionId, openManager: open }) } });
    function Manager() {
      const openerRef = useRef(null);
      return jsxs('div', { style: { WebkitAppRegion: 'no-drag' }, children: [
        jsx(Button, { ref: openerRef, size: 'xs', variant: 'ghost', onClick: open, children: '作業管理' }),
        jsx(WorkDialog, { ctx, controller, surface, openerRef })
      ] });
    }
    ctx.register({ id: 'manager', area: TITLEBAR_AREAS.right, order: 50, render: () => jsx(Manager, {}) });
    ctx.register({ id: 'open-manager', area: PALETTE_AREA, data: {
      id: `${PLUGIN_ID}.open-manager`, label: '作業管理', action: `${PLUGIN_ID}.open-manager`, run: open,
      keywords: ['work', 'status', '作業', '状態']
    } });
    ctx.register({ id: 'manager-keybind', area: KEYBINDS_AREA, data: {
      id: `${PLUGIN_ID}.open-manager`, label: '作業管理', category: 'view', defaults: [], run: open
    } });
  }
};
