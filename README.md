# Session Work Status

**English** | [日本語](README.ja.md)

A Hermes Desktop UI plugin for manually labeling sessions as **Working, On hold, or Done**. Left-click the small mark at the end of an existing session row to assign a status directly. Manage only registered conversations in the **Work management (作業管理)** dialog. There is no dedicated pane or tab, and the existing right-click and ⋯ menus are unchanged. This is not a CLI or Web Dashboard plugin.

**“Working” is a label you assign, not an indication that the AI is running.** Labels do not change when the AI finishes responding or you resume a conversation. Marking a session as Done or removing its status does not stop, delete, or archive the conversation.

The shipped UI is in Japanese. The English names below are translations; the original labels identify the controls.

| Mark | Status (UI label) | Meaning |
|---|---|---|
| ◇ | Not registered | No status label; click to assign one |
| ● | Working (作業中) | Work you are currently working on |
| Ⅱ | On hold (保留) | Work you intend to return to later |
| ✓ | Done (完了) | Work you consider finished for now |

## Compatibility and verification status

- Version: `0.1.0`. Plugin ID: `session-work-status`.
- Target: [Hermes Desktop](https://hermes-agent.nousresearch.com/docs/user-guide/desktop), with the public SDK's `SESSION_ROW_AREAS.trailing`, `host.profileRoutes()`, dialog/contribution APIs, and `host.openSession()`.
- Recent-activity retrieval also explicitly depends on Desktop's existing preload bridge, **`window.hermesDesktop.api`**. This is not a public-SDK-only implementation. The installed SDK's `listPersistedSessions()` is fixed to creation order and is not used for this read.
- The contract was checked against Hermes source revision `3ebbaf524344f93943169e63854cb952541563f9`. No changes or rebuild of Hermes itself are required. The minimum supported release has not been established.
- The current implementation passed independent rereview after an owner-refresh fix. Recorded checks include 14 Node tests, 9 Chromium harness paths, 5 owner-refresh regressions, and 6 focused independent rereview paths; browser page/console errors were zero. **Native Electron loading, the real bridge/HTTP API, remote authentication, production CSS/layout/watch, and macOS/Windows operation remain unverified.** The plugin has not been installed in its development environment.

See [Verification status (Japanese)](docs/verification.md) for scope and limitations. Earlier badge-and-pane or core-extension implementations are not the current release.

## Installation

Copy only [`plugin.js`](plugin.js) from this repository's root. It is a prebuilt, single-file plain ESM bundle; Node.js, npm, and Python are not required to use it. Desktop supplies the Hermes SDK and React. A Python-side plugin, `manifest.json`, and additions to `config.yaml` are not needed.

Place the file under the home directory Desktop uses at startup:

```text
<Desktop home>/desktop-plugins/session-work-status/plugin.js
```

The usual home is `~/.hermes`; if Desktop starts with a different `HERMES_HOME`, use that directory. This is an **app-wide location**, not the home of the backend profile selected in a window. Do not install a copy per profile/connection or on a remote Gateway.

In a macOS/Linux shell, from the repository root, adjust `DESKTOP_HOME` to match Desktop's actual home:

```sh
DESKTOP_HOME="$HOME/.hermes"
mkdir -p "$DESKTOP_HOME/desktop-plugins/session-work-status"
cp plugin.js "$DESKTOP_HOME/desktop-plugins/session-work-status/plugin.js"
```

On Windows, create the same directory structure using a file manager. Placement instructions do not imply verified Windows operation. Replace `plugin.js` to update; first back up a locally modified version.

The official SDK supports automatic loading and hot reload. If the plugin does not appear, run **Reload desktop plugins** from Cmd/Ctrl+K, then check **Session Work Status** under **Capabilities → Plugins**. Check the destination and SDK compatibility if an import error appears. No Gateway restart or Hermes rebuild is required. Publication did not perform installation or restart.

## Usage

1. Left-click **◇** at the end of a session row and select **● 作業中 / Ⅱ 保留 / ✓ 完了**. This directly creates the registration; there is no separate “register first” step.
2. Open **Work management (作業管理)** from the titlebar, command palette, or assignable keybinding (unassigned by default).
3. Search registered sessions, filter by status, change a status, or choose **Remove status (状態を解除)**. Select a conversation and press **Open session (セッションを開く)** to open the exact owner in the same workspace. Up/Down selects, Enter opens, and Esc closes; search receives initial focus.

The row mark is a non-focusable pointer-only span inside Desktop's native row button, not a nested button or independent Tab stop. Use the dialog's status buttons for keyboard changes. The row's usual selection, Enter/Space, right-click, and ⋯ behavior is preserved; clicking the mark does not open the conversation.

### Sorting and owner freshness

The default is **Recent activity (最近の活動)**: descending `last_active`, falling back to `started_at`. **Created (作成日時)** and **Title (タイトル)** are also available; the choice is saved locally. Changing status or completing a background read does not reorder the dialog while you work. Choosing a sort, refreshing, or reopening the dialog sorts it again. Search/filter changes and removing a status can reduce the visible list. Desktop's native list sort is unaffected.

Only identity order is frozen, not owner information. Displayed owner information follows the latest catalog. Immediately before opening, the plugin resolves the exact identity again. Loading, missing, or unconfirmed owners cannot open; saved registrations can still change status or be removed. Opening is asynchronous, with duplicate-open suppression and failure notification.

## Storage and data handling

Desktop renderer localStorage uses the plugin namespace:

- `hermes.plugin.session-work-status.work-status-v1`: `[connectionId,targetProfile,persistentSessionId]`, status, and optional saved details (title, route, timestamps).
- `hermes.plugin.session-work-status.work-status-sort-v1`: dialog sort preference.

Conversation text and credentials are not stored. Routing `profile` and backend `targetProfile` are distinct. Compaction retains a label when the persistent ID remains the same; forked and new sessions have separate registrations. Old `unclassified` entries are ignored as unregistered. Downgrade compatibility with older plugin versions is not guaranteed.

There is no server-side storage or device synchronization. Unknown schemas and malformed JSON are not overwritten. Writes are read back; failures are reported. Other-window storage events trigger a reread, but simultaneous writes have no transaction guarantee. Clearing Desktop app data/localStorage removes registrations. Removing a status deletes only its registration/details, not the conversation.

## Session retrieval and owner-resolution limits

The public row slot supplies only the persistent ID, not its owner. The plugin reverses the catalog from `host.profileRoutes()` rather than treating the focused profile as the owner. Row registration/change requires a unique ID and sufficiently complete reads. ID collisions, failed/unread sources, any page with **500 or more rows**, or an ID outside the fetched window disable row changes and show the reason plus a management entry point. Exactly 500 rows is conservatively blocked, as is 501+ after pinned-session backfill. A short page's hidden-inclusive `total` does not alone block changes.

One read-only bridge adapter issues `GET /api/profiles/sessions?profile=targetProfile&order=recent` with the exact `connectionId`, a 500-row limit, hidden/archived exclusion, and `passive:true`. It does not start a cold backend or fall back to local/creation-order data on failure. Open the connection first, then refresh if it was unavailable. Missing bridge support is reported.

This covers each enumerated owner's recent 500 sessions plus pinned backfill, not all history or unenumerated sources. Retrieval uses at most 3 concurrent requests, shared in-flight reads, a 30-second row-action cache, no periodic polling, and refresh on dialog opening, explicit update, or profile/connection changes. Disposal stops queued reads and stale UI updates, not the at-most-3 already running reads.

Out-of-window registrations remain visible as **Saved information (取得範囲外（保存情報）)**. Their saved title/timestamps may be stale. Status changes/removal remain available, but opening requires a currently confirmed route. Known timestamps are preserved only for the same identity; unknown timestamps stay zero. Deleting/archiving a conversation does not automatically remove its registration.

## Disabling or removing the plugin

Disable it under **Capabilities → Plugins**, or remove the installed `plugin.js`. Neither action erases localStorage registrations.

## Build and development checks

Normal use does not require a build. With Node.js/npm, from the repository root:

```sh
npm ci --ignore-scripts
npm run build       # Generate plugin.js from src/plugin.js
npm run check       # Build and run Node tests
node --check plugin.js
git diff --check
```

The publication build was checked with Node.js `26.7.0` / npm `11.19.0`; other versions are not verified. `src/core.js` owns identity/storage/catalog logic, `src/controller.js` retrieval/disposal, `src/recent-reader.js` the bridge adapter, and `src/plugin.js` the UI. The generated `plugin.js` is tracked for direct copying. `private: true` in `package.json` prevents accidental npm publication, not GitHub visibility.

See [Development verification instructions (Japanese)](docs/development.md) for environment-variable-based owner/UI checks. The public tree excludes local operational records and raw evidence.

## License

Licensed under the [MIT License](LICENSE). Use, modification, redistribution, and commercial use are permitted. Include the copyright and permission notices in copies or substantial portions. The software is provided without warranty. The Hermes SDK, React, and development dependencies retain their respective licenses.

## References

- [Hermes Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)
- [Verification status, compatibility, and sources (Japanese)](docs/verification.md)
- [Development verification instructions (Japanese)](docs/development.md)
