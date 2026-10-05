import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
export { Button } from '@native/components/ui/button';
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@native/components/ui/dropdown-menu';
export { atom };
export const useValue = useStore;
export const SESSION_ROW_AREAS = { trailing: 'sessionRow.trailing' };
export const PANES_AREA = 'panes';
const local = { connectionId: 'local', mode: 'local', profile: 'route-a', targetProfile: 'backend-a' };
const remote = { connectionId: 'nas', mode: 'remote', profile: 'route-b', targetProfile: 'backend-b' };
export const fixtures = { routes: [local, remote], pages: {
  local: [ { id: 'rotated-live', _lineage_root_id: 'root', profile: 'backend-a', title: '設計を進める' }, { id: 'branch', parent_session_id: 'root', profile: 'backend-a', title: 'ブランチの調査' }, { id: 'collision', profile: 'backend-a', title: '同じID・ローカル' } ],
  nas: [ { id: 'other', profile: 'backend-b', title: '別プロファイルの作業' }, { id: 'collision', profile: 'backend-b', title: '同じID・NAS' } ]
}, failWrite: false, failRead: false, truncated: false, delay: 0, calls: 0, notifications: [] };
export const host = {
  state: { profile: atom('route-a'), connectionId: atom('local') },
  profileRoutes: async () => fixtures.routes,
  listPersistedSessions: async (route, options) => {
    fixtures.calls++;
    if (options.profile !== route.targetProfile) throw new Error('wrong backend profile');
    if (fixtures.delay) await new Promise(resolve => setTimeout(resolve, fixtures.delay));
    if (fixtures.failRead) throw new Error('テスト: 接続不可');
    const rows = fixtures.pages[route.connectionId];
    const sessions = fixtures.truncated ? Array.from({ length: 500 }, (_, i) => rows[i % rows.length]) : rows;
    return { sessions, total: fixtures.truncated ? 700 : sessions.length, offset: 0, errors: [] };
  },
  notify: message => fixtures.notifications.push(message),
  // Any forbidden operation is a hard test failure, not a silent stub.
  request: () => { throw new Error('Gateway RPC forbidden in this harness'); },
  restartGateway: () => { throw new Error('Gateway restart forbidden'); }
};
