# Session Work Status

**English** | [日本語](README.ja.md)

A UI plugin for manually labeling Hermes Desktop sessions as Unclassified, Working, On hold, or Done. It adds status badges to existing session rows and a Work sessions pane for filtering by status and owner. It is not a plugin for the CLI or Web Dashboard.

**“Working” is a label you assign, not an indication that the AI is running.** Labels do not change when the AI finishes responding or you resume a conversation. Marking a session as Done does not stop, delete, or archive the conversation.

The shipped plugin UI is in Japanese. The English names below are translations; the original labels are included so you can find the controls.

| Mark | Status (UI label) | Purpose |
|---|---|---|
| ○ | Unclassified (未分類) | Not yet classified; the default for existing and new sessions |
| ● | Working (作業中) | Work you are currently working on |
| Ⅱ | On hold (保留) | Work you intend to return to later |
| ✓ | Done (完了) | Work you consider finished for now |

## Compatibility and verification status

- Version: `0.1.0`. Plugin ID: `session-work-status`.
- Target: [Hermes Desktop](https://hermes-agent.nousresearch.com/docs/user-guide/desktop). The Desktop SDK must provide `SESSION_ROW_AREAS`, `host.profileRoutes()`, and `host.listPersistedSessions()`.
- The API contract was checked against Hermes source revision `3ebbaf524344f93943169e63854cb952541563f9`. The minimum supported release has not been established. Older Desktop versions may fail to import the plugin or fetch session lists.
- The plugin has not been installed in the environment where it was developed. Existing verification records report 10 passing Node tests and 15 passing Chromium harness tests, but **loading and rendering in native Electron, the real SDK bridge/API, and actual multiple connections remain unverified**. Operation on macOS and Windows has not been tested either.

See [Verification status (Japanese)](docs/verification.md) for the scope and limitations of verification.

## Installation

Copy only [`plugin.js`](plugin.js) from the root of this repository. It is a prebuilt, single-file ESM bundle; Node.js, npm, and Python are not required to use it. Desktop supplies the Hermes SDK and React. You do not need a Python-side plugin, a `manifest.json`, or any additions to `config.yaml`.

### 1. Locate Desktop's plugin directory

Place the file under the home directory the Desktop app uses at startup:

```text
<Desktop home>/desktop-plugins/session-work-status/plugin.js
```

The usual home is `~/.hermes`. If Desktop starts with a different `HERMES_HOME`, use that directory instead. This is an **app-wide installation location**, not the home of the backend profile selected in a window. You do not need a copy for each profile or connection, nor do you need to install it on a remote Gateway.

### 2. Copy the file

In a macOS/Linux shell, run the following from the repository root. Change `DESKTOP_HOME` to match Desktop's actual home. The destination is explicit because your shell's `HERMES_HOME` may differ from Desktop's.

```sh
DESKTOP_HOME="$HOME/.hermes"
mkdir -p "$DESKTOP_HOME/desktop-plugins/session-work-status"
cp plugin.js "$DESKTOP_HOME/desktop-plugins/session-work-status/plugin.js"
```

On Windows, use a file manager to create the same directory structure and copy `plugin.js` into it. These are placement instructions, not a claim that Windows operation has been verified. To update the plugin, replace the existing `plugin.js`. Back up any locally modified version first.

### 3. Load it in Desktop

The official SDK provides automatic loading after the file is saved and hot reload. If the plugin does not appear, open the command palette with Cmd/Ctrl+K and run **Reload desktop plugins**, then check that **Session Work Status** is enabled under **Capabilities → Plugins**. If a loading error is reported, check the destination, filename, and Desktop's SDK compatibility.

No Gateway restart or changes to Hermes itself are required. No installation or restart was performed while preparing this repository.

## Usage

1. Click the status badge on a row in the original session list.
2. Select Unclassified (未分類), Working (作業中), On hold (保留), or Done (完了) from the menu. Opening the menu refreshes the owner list; selection is disabled while the refresh is in progress.
3. In the Work sessions (作業セッション) pane, filter the list with the status buttons and the Owner (所有者) selector. Owners are shown as `connection ID / backend profile name`.

The pane initially shows only Working (作業中) sessions. When using it for the first time, select All (すべて) or Unclassified (未分類). Changing a status may remove the session from the current filtered view. Select All (すべて) to keep classifying sessions without that happening. These filters do not affect the original session list.

For keyboard access, use the status buttons and menus in the pane. The row badge sits inside Desktop's own row button, so it is a pointer-only control without its own Tab stop. The row's normal Enter/Space behavior for opening a conversation is preserved. Clicking the badge does not propagate to the parent row or open the conversation.

The pane is only for classification. Use the original session list to open conversations. If you cannot find a session, such as a newly created one, click **Refresh list (一覧を更新)** in the pane.

## Storage and data handling

Statuses are stored in Desktop's renderer localStorage under this key:

```text
hermes.plugin.session-work-status.work-status-v1
```

Each stored entry consists of `connection ID + backend targetProfile + persistent session ID` and its status. Conversation content and titles are not stored. Titles and other display information are fetched from the connected backend. Storage is separated using this combination rather than relying on the SDK to isolate profiles automatically. Desktop's routing `profile` is distinct from the storage identity's `targetProfile`.

- If compaction changes the live session ID, the label is retained as long as the persistent ID stays the same. Forked and new sessions have separate labels.
- There is no server-side storage or synchronization with other devices. Clearing Desktop's app data or localStorage removes the labels.
- Unknown storage formats and malformed JSON are not overwritten. The plugin blocks changes and displays the reason. Writes are verified by reading them back; a failed write is not presented as a success. There is no automatic repair or bulk deletion.
- Storage events from other windows trigger a reread, but concurrent writes have no transactional guarantee.

## Session listing and owner-resolution limits

For each owner the SDK can enumerate, the plugin fetches the latest 500 sessions by creation time, plus any pinned sessions added by the backend. Hidden and archived sessions are excluded. This does not cover the full history, connections that were not enumerated, or remote history that changes during retrieval.

The SDK's row slot provides only the persistent session ID, not the owner. The plugin therefore checks the fetched list rather than assuming a row belongs to the currently selected connection or profile. Changes from row badges are blocked when:

- The same persistent ID appears under multiple owners, or is not found in the list.
- Retrieval fails for any part of the owner list.
- Any owner's fetched page contains 500 or more rows, so completeness cannot be confirmed. Exactly 500 rows also triggers this conservative block, as does a page of 501 or more rows due to additional pinned sessions.

The backend's `total` includes hidden sessions. A difference between `total` and the fetched row count on a short page does not, by itself, block changes. The reason for a block appears when you hover over the badge and in the pane. In the pane, you can check the explicit owner of a fetched session and change its status there.

Lists are fetched on initial display, when switching profiles or connections, on an explicit refresh, and when opening a status menu. There is no periodic polling or Gateway JSON-RPC, but the plugin does make read requests to connected backends' APIs through the SDK. At most 3 requests run concurrently. Disabling or reloading the plugin stops retrieval that has not yet started; the SDK provides no way to cancel requests already in progress.

## Disabling or removing the plugin

Disable it under **Capabilities → Plugins**. To remove the file, delete `plugin.js` from the installation location described above. Disabling the plugin or removing the file does not erase the labels in localStorage. Labels are independent of conversations and are not automatically removed when a conversation is deleted or archived.

## Build and development checks

These steps are not needed for normal use. To generate the bundle from source, install Node.js and npm, then run the following from the repository root. The build was checked during publication preparation with Node.js `26.7.0` / npm `11.19.0`. Compatibility with other versions has not been verified.

```sh
npm ci --ignore-scripts
npm run build       # Generate a single plugin.js from src/plugin.js
npm run check       # Build and run the Node tests
node --check plugin.js
git diff --check
```

`src/core.js` is the source of truth for identity, storage, and catalog validation; `src/controller.js` handles retrieval and disposal; `src/plugin.js` defines the UI. Although `plugin.js` is generated, it is tracked in Git so users can copy it directly. The `private: true` setting in `package.json` prevents accidental publication to npm; it does not control GitHub repository visibility.

Setup for the Chromium harness and isolated backend tests is covered in [Development verification instructions (Japanese)](docs/development.md).

## License

Licensed under the [MIT License](LICENSE). Use, modification, redistribution, and commercial use are permitted. The copyright notice and permission notice must be included in all copies or substantial portions of the software. The software is provided without warranty. The Hermes SDK, React, and development dependencies remain subject to their respective licenses.

## References

- [Hermes Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)
- [Verification status, compatibility, and sources (Japanese)](docs/verification.md)
- [Development verification instructions (Japanese)](docs/development.md)
