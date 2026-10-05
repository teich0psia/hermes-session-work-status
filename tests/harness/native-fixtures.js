// Only native-menu IO/stores are fixtures; menu components and registry are real.
import { atom } from 'nanostores';
const forbidden = () => { throw new Error('Native IO forbidden in isolated harness'); };
export const useI18n = () => ({ t: { common: { close: '閉じる', cancel: 'Cancel', save: 'Save', delete: 'Delete' },
  errors: { genericFailure: 'Failure' }, sidebar: { row: {
    openInNewTab: 'Open in new tab', branchFrom: 'Branch from here', hideTabBar: 'Hide tab bar', sessionActions: 'Session actions', rename: 'Rename', pin: 'Pin', unpin: 'Unpin', archive: 'Archive', unarchive: 'Unarchive',
    copyId: 'Copy ID', export: 'Export', markRead: 'Mark read', markUnread: 'Mark unread', deleteTitle: 'Delete session',
    deleteDesc: title => title, renameTitle: 'Rename', delete: 'Delete'
  }, projects: { moveToProject: 'Move to project', menuAppearance: 'Appearance', noColor: 'No color', moveNoProjects: 'None' } },
  zones: { closeAll: 'Close all', closeOthers: 'Close others', closeToRight: 'Close right' } } });
export const $activeSessionId = atom(null), $connection = atom({ mode: 'local' }), $selectedStoredSessionId = atom(null),
  $sessions = atom([]), $unreadFinishedSessionIds = atom([]), $sessionColorOverrides = atom({}), $sessionTiles = atom([]),
  $sessionStates = atom({}), $projectTree = atom([]);
export const sessionPinId = session => session._lineage_root_id || session.id;
export const sessionMatchesStoredId = (session, id) => sessionPinId(session) === id;
export const activeGateway = () => null;
export const canOpenSessionInTerminal = () => false, canOpenSessionWindow = () => false;
export const treeTabCloseTargets = () => null, projectIdForCwd = () => null, projectRootCwd = () => '';
export const triggerHaptic = () => {};
export const PROFILE_SWATCHES = [];
export const openSession = forbidden, renameSession = forbidden, exportSession = forbidden,
  openSessionInTerminal = forbidden, moveSessionToProject = forbidden, setSessionColorOverride = forbidden,
  closeAllOpenSessionTiles = forbidden, ackStoredSessionId = forbidden, markSessionRead = forbidden,
  closeAllTreeTabs = forbidden, closeOtherTreeTabs = forbidden, closeTreeTabsToRight = forbidden, reloadTreePane = forbidden,
  requestSendDiagnostics = forbidden, applySessionTitle = forbidden, applyRenamedSessionTitle = forbidden;
export const notify = forbidden, notifyError = forbidden;
