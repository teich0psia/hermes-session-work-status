import {
  host, atom, useValue, Button, DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownMenuItem, SESSION_ROW_AREAS, PANES_AREA
} from '@hermes/plugin-sdk';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { STATES, PLUGIN_ID, identityKey, resolveRow, filterItems } from './core.js';
import { createController } from './controller.js';

const quiet = { color: 'var(--ui-text-secondary)', fontSize: '11px' };
const stop = event => event.stopPropagation();
const cancel = event => { event.stopPropagation(); event.preventDefault(); };
const isolate = { onClick: stop, onPointerDown: stop, onMouseDown: stop, onDoubleClick: cancel, onAuxClick: cancel, onContextMenu: cancel, onKeyDown: stop, onKeyUp: stop };
const marks = { unclassified: '○', working: '●', paused: 'Ⅱ', done: '✓' };

// The row slot is inside a native button. No nested button, role=button or
// tabindex: pointer-only here; the pane keeps a real keyboard-operable Button.
const RowTrigger = forwardRef(function RowTrigger({ type, disabled, ...props }, ref) {
  return jsx('span', { ...props, ref, 'aria-disabled': disabled, 'data-work-status': true });
});

function StatusMenu({ controller, item, reason = '', fromRow = false }) {
  const triggerRef = useRef(null);
  const data = useValue(controller.state);
  const state = item ? data.entries[identityKey(item)] ?? 'unclassified' : null;
  const blocked = reason || data.storageIssue || (data.loading ? '一覧を更新中です。' : '');
  const text = state ? `${marks[state]} ${STATES[state]}` : '状態未確認';
  return jsx('span', { ...isolate, title: blocked || '手動の作業状態を変更', style: { display: 'inline-flex', flexShrink: 0 }, children:
    jsxs(DropdownMenu, { onOpenChange: open => { if (open) void controller.refresh(); }, children: [
      jsx(DropdownMenuTrigger, { asChild: true, disabled: Boolean(blocked), children: jsx(fromRow ? RowTrigger : Button, {
        ref: triggerRef, type: 'button', ...(fromRow ? {} : { size: 'xs', variant: 'chip' }), disabled: Boolean(blocked), title: blocked || '手動の作業状態を変更（会話の稼働状態とは別）',
        ...(fromRow ? {} : { 'aria-label': `作業状態: ${text}${blocked ? ` (${blocked})` : ''}` }),
        style: { fontSize: '10px', padding: '1px 4px', cursor: blocked ? 'default' : 'pointer', color: state === 'working' ? 'var(--ui-accent)' : 'var(--ui-text-secondary)' }, children: text
      }) }),
      jsxs(DropdownMenuContent, { ...isolate, align: 'end', onCloseAutoFocus: fromRow ? event => {
        event.preventDefault();
        triggerRef.current?.closest('button')?.focus();
      } : undefined, style: { minWidth: '180px' }, children: [
        jsx('div', { style: { ...quiet, padding: '4px 8px' }, children: '自分の作業状態（手動）' }),
        ...Object.entries(STATES).map(([value, label]) => jsx(DropdownMenuItem, {
          disabled: Boolean(blocked), onSelect: () => { if (item) controller.setStatus(item, value, fromRow); },
          children: `${marks[value]} ${label}${state === value ? '（現在）' : ''}`
        }, value))
      ] })
    ] })
  });
}
function RowBadge({ controller, sessionId }) {
  const data = useValue(controller.state);
  useEffect(() => controller.ensure(), [controller]);
  const resolved = resolveRow(data.catalog, sessionId);
  return jsx(StatusMenu, { controller, ...resolved, fromRow: true });
}
function WorkPane({ controller }) {
  const data = useValue(controller.state);
  const [filter, setFilter] = useState('working');
  const [owner, setOwner] = useState('all');
  useEffect(() => controller.ensure(), [controller]);
  const ownerOf = item => JSON.stringify([item.route.connectionId, item.route.targetProfile]);
  const owners = [...new Map(data.catalog.items.map(item => [ownerOf(item), `${item.route.connectionId} / ${item.route.targetProfile}`])).entries()];
  const scoped = data.catalog.items.filter(item => owner === 'all' || ownerOf(item) === owner);
  const items = filterItems(scoped, data.entries, filter);
  return jsxs('section', {
    'aria-label': '作業セッション', style: { height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', color: 'var(--ui-text-primary)', fontSize: '12px', boxSizing: 'border-box' }, children: [
      jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }, children: [
        jsx('strong', { children: '作業セッション' }),
        jsx(Button, { size: 'xs', variant: 'outline', type: 'button', disabled: data.loading, onClick: () => void controller.refresh(), children: data.loading ? '更新中…' : '一覧を更新' })
      ] }),
      jsx('div', { style: quiet, children: '手動の目印です。完了にしても会話は停止・削除・アーカイブしません。' }),
      jsx('div', { role: 'group', 'aria-label': '状態で絞り込み', style: { display: 'flex', flexWrap: 'wrap', gap: '4px' }, children:
        Object.entries({ all: 'すべて', ...STATES }).map(([value, label]) => jsx(Button, {
          type: 'button', size: 'xs', variant: filter === value ? 'secondary' : 'ghost', 'aria-pressed': filter === value,
          onClick: () => setFilter(value), children: `${label} ${filterItems(scoped, data.entries, value).length}`
        }, value))
      }),
      jsx('label', { style: quiet, children: jsxs('span', { children: ['所有者 ', jsx('select', {
        'aria-label': '所有者', value: owner, onChange: event => setOwner(event.target.value),
        style: { width: '100%', maxWidth: '100%', background: 'var(--ui-bg-secondary)', color: 'var(--ui-text-primary)', border: '1px solid var(--ui-stroke-secondary)', padding: '4px' },
        children: [jsx('option', { value: 'all', children: 'すべての取得済み所有者' }, 'all'), ...owners.map(([value, label]) => jsx('option', { value, children: label }, value))]
      })] }) }),
      ...[data.storageIssue, data.message, ...data.catalog.issues].filter(Boolean).map((message, index) => jsx('div', { role: 'alert', style: { ...quiet, overflowWrap: 'anywhere' }, children: message }, `issue-${index}`)),
      jsx('div', { style: quiet, children: `取得済み ${data.catalog.items.length}件 / 表示 ${items.length}件。各所有者の最新作成500件＋backendのpin追加分・アーカイブ対象外。` }),
      jsx('div', { style: { flex: 1, overflowY: 'auto', minHeight: 0 }, children: items.length ? items.map(item => jsxs('article', {
        style: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0', borderBottom: '1px solid var(--ui-stroke-secondary)' }, children: [
          jsx('div', { title: item.title, style: { overflowWrap: 'anywhere', fontWeight: 500 }, children: item.title }),
          jsx('div', { style: { ...quiet, overflowWrap: 'anywhere' }, children: `${item.route.connectionId} / ${item.route.targetProfile}` }),
          jsx('div', { title: item.sessionId, style: { ...quiet, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }, children: item.sessionId }),
          jsx('div', { children: jsx(StatusMenu, { controller, item }) })
        ]
      }, identityKey(item))) : jsx('p', { style: quiet, children: data.loading ? '一覧を読み込み中…' : 'この条件のセッションはありません。' }) })
    ]
  });
}
export default {
  id: PLUGIN_ID,
  name: 'Session Work Status',
  description: 'セッションの手動作業状態をローカル管理。会話の稼働・アーカイブとは独立。',
  register(ctx) {
    const controller = createController(ctx, host, atom, { getItem: key => window.localStorage.getItem(key) });
    ctx.register({ id: 'row-status', area: SESSION_ROW_AREAS.trailing, order: 50, data: { render: props => jsx(RowBadge, { controller, ...props }) } });
    ctx.register({ id: 'work-sessions', area: PANES_AREA, title: '作業セッション', data: { placement: 'left', width: '300px' }, render: () => jsx(WorkPane, { controller }) });
  }
};
