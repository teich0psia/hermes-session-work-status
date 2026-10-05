import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
export { Button } from '@native/components/ui/button';
export { Input } from '@native/components/ui/input';
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@native/components/ui/dialog';
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@native/components/ui/dropdown-menu';
export { SESSION_ROW_AREAS } from '@native/lib/session-row-slots';
export { atom };
export const useValue = useStore;
export const PALETTE_AREA = 'palette', KEYBINDS_AREA = 'keybinds', TITLEBAR_AREAS = { right: 'titleBar.right' };
const local = { connectionId: 'local', mode: 'local', profile: 'route-a', targetProfile: 'backend-a' };
const remote = { connectionId: 'nas', mode: 'remote', profile: 'route-b', targetProfile: 'backend-b' };
export const fixtures = { routes: [local, remote], pages: {
  local: [{ id: 'rotated-live', _lineage_root_id: 'root', profile: 'backend-a', title: '設計を進める', last_active: 100, started_at: 1 },
    { id: 'branch', profile: 'backend-a', title: 'ブランチの調査', last_active: 50, started_at: 5 }],
  nas: [{ id: 'other', profile: 'backend-b', title: '別プロファイルの作業', last_active: 80, started_at: 3 },
    { id: 'root', profile: 'backend-b', title: '同じID・NAS', last_active: 10, started_at: 2 }]
}, failWrite: false, failRead: false, delay: 0, calls: 0, notifications: [], opened: [] };
export const host = {
  state: { profile: atom('route-a'), connectionId: atom('local') },
  profileRoutes: async () => fixtures.routes,
  readRecentPage: async request => {
    fixtures.calls++;
    fixtures.requests ||= []; fixtures.requests.push(request);
    const query = new URL(request.path, 'http://fixture.invalid').searchParams;
    const route = fixtures.routes.find(r => r.connectionId === request.connectionId && r.targetProfile === query.get('profile'));
    if (!route || request.method !== 'GET' || request.passive !== true || query.get('order') !== 'recent') throw new Error('wrong bridge history query');
    if (fixtures.delay) await new Promise(resolve => setTimeout(resolve, fixtures.delay));
    if (fixtures.failRead) throw new Error('テスト: 接続不可');
    const sessions = fixtures.pages[request.connectionId] || [];
    return { sessions, total: sessions.length, offset: 0, errors: [] };
  },
  openSession: async (sessionId, options) => {
    fixtures.opened.push({ sessionId, ...options });
    if (fixtures.holdOpen) await new Promise((resolve, reject) => { fixtures.settleOpen = error => {
      fixtures.settleOpen = null;
      if (error) reject(new Error(error)); else resolve();
    }; });
  },
  notify: message => fixtures.notifications.push(message),
  request: () => { throw new Error('Gateway RPC forbidden'); },
  restartGateway: () => { throw new Error('Gateway restart forbidden'); }
};
