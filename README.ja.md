# Session Work Status

[English](README.md) | **日本語**

Hermes Desktopの既存セッション行に小さなマークを追加し、**左クリックで作業中・保留・完了を直接設定**するUIプラグインです。状態を付けた会話だけを「作業管理」Dialogで管理します。登録してから状態を選ぶ手順や専用pane/tabはありません。既存の右クリック・⋯メニューは変更しません。CLIやWeb Dashboard向けではありません。

**「作業中」はユーザーが付ける状態であり、AIが実行中という意味ではありません。** AIの応答終了や会話再開でも自動変更しません。完了・状態解除は会話の停止、削除、アーカイブを呼びません。

| マーク | 状態 | 用途 |
|---|---|---|
| ◇ | 未設定 | 状態の登録なし。クリックして設定 |
| ● | 作業中 | 自分が取り組んでいる作業 |
| Ⅱ | 保留 | あとで戻る作業 |
| ✓ | 完了 | 自分として区切りが付いた作業 |

## 対応環境と検証状況

- バージョン`0.1.0`、ID`session-work-status`。対象は[Hermes Desktop](https://hermes-agent.nousresearch.com/docs/user-guide/desktop)です。
- 公開SDKの`SESSION_ROW_AREAS.trailing`、`host.profileRoutes()`、Dialog・contribution API、`host.openSession()`を使います。最近活動順の取得には、既存preload bridgeの**`window.hermesDesktop.api`にも明示的に依存**します。公開SDKだけで完結する実装ではありません。installed SDKの`listPersistedSessions()`は作成日時順固定のため、この読取りには使いません。
- API契約の照合先はHermesソース`3ebbaf524344f93943169e63854cb952541563f9`。本体の改造・再ビルドは不要です。最低対応リリース番号は未確定です。
- 現行の本体無改造版はowner更新の修正後、独立再レビューを通過しています。Node14件、Chromiumの既存9経路、owner更新回帰5経路、独立再レビュー6経路の合格記録があり、ブラウザーのpage/console errorは0でした。**実Electron、実bridge/HTTP/remote認証、本番CSS/layout/watch、macOS・Windows動作は未検証**です。作成元環境への配置も未実施です。

[検証状況](docs/verification.md)に範囲と制約を記載しています。旧バッジ＋pane版や旧Core拡張版は現行成果物ではありません。

## インストール

コピーするのは、このリポジトリ直下の単一plain ESM [`plugin.js`](plugin.js)だけです。利用時のNode.js・npm・Pythonは不要で、SDKとReactはDesktopから提供されます。Python側のプラグイン、`manifest.json`、`config.yaml`への追加は不要です。

配置先はDesktopアプリが起動時に使うホームです。

```text
<Desktopのホーム>/desktop-plugins/session-work-status/plugin.js
```

通常は`~/.hermes`です。Desktopを別の`HERMES_HOME`で起動している場合は、そのホームを使います。これはアプリ共通の配置先で、選択中バックエンドプロファイルのホームとは別です。プロファイル・接続ごとのコピーやリモートGatewayへの配置は不要です。

macOS/Linuxでは、リポジトリ直下から次を実行します。`DESKTOP_HOME`はDesktopの実際のホームに合わせて変更してください。

```sh
DESKTOP_HOME="$HOME/.hermes"
mkdir -p "$DESKTOP_HOME/desktop-plugins/session-work-status"
cp plugin.js "$DESKTOP_HOME/desktop-plugins/session-work-status/plugin.js"
```

Windowsではファイル管理ツールで同じ構成のフォルダーを作り、コピーします。配置方法の案内は動作確認済みという意味ではありません。更新時はファイルを置き換え、ローカルで変更した版がある場合は先にバックアップしてください。

公式SDKは保存後の自動ロード・ホットリロードを提供します。表示されない場合はCmd/Ctrl+Kから **Reload desktop plugins** を実行し、**Capabilities → Plugins** で有効状態を確認します。ロードエラー時は配置先・ファイル名・SDK対応を確認してください。Gateway再起動や本体変更は不要です。公開作業では配置も再起動も行っていません。

## 使い方

1. 行末の **◇** を左クリックし、**● 作業中 / Ⅱ 保留 / ✓ 完了** を選びます。その操作が登録になります。未設定の状態ラベルは表示しません。
2. タイトルバーの **作業管理** を押します。コマンドパレットの同名コマンド、割当可能なkeybindからも開けます。初期keybindは未割当です。
3. 登録済みの会話を検索・状態で絞り込み、状態変更や **状態を解除** を行います。会話を選択して **セッションを開く** を押すと、正しい所有者の会話を同じworkspaceで開きます。上下矢印で選択、Enterでopen、Escで閉じ、初期focusは検索欄です。

行末マークはnative親button内のポインター操作用spanで、button入れ子や独立したTab移動先を作りません。キーボードでの状態変更はDialogのボタンを使います。元の行選択・Enter/Space・右クリック・⋯は維持し、マークのクリックは会話を開きません。

### 並び順と所有者の更新

初期値は **最近の活動**（`last_active`、なければ`started_at`の降順）です。**作成日時**と**タイトル**も選べ、選択はローカルに保存します。状態変更や背景readでは操作中の順序を変えず、並び順選択・**一覧を更新**・開き直しで整列します。検索・絞り込み・状態解除で表示対象が減る場合はあります。元のnative一覧のsort設定は変更しません。

固定するのはidentityの順序だけで、表示するowner情報は最新catalogに追従します。open直前にもexact identityを再照合し、loading・owner不在・未確認routeでは開きません。保存済み登録の状態変更・解除は続けられます。openは非同期で、二重操作を抑止し、失敗を通知します。

## 保存とデータの扱い

Desktop renderer localStorageのplugin namespace内に保存します。

- `hermes.plugin.session-work-status.work-status-v1`: `[connectionId,targetProfile,durableSessionId]`と状態、任意details（タイトル・route・日時）。
- `hermes.plugin.session-work-status.work-status-sort-v1`: Dialogのsort。

会話本文・認証情報は保存しません。ルーティング用`profile`とバックエンドの`targetProfile`は区別します。圧縮後もdurable IDが同じなら状態を維持し、分岐・新規は別登録です。旧`unclassified` entryは未登録として無視します。旧pluginへのdowngrade互換は保証しません。

サーバー保存・他端末同期はありません。未知schema・不正JSONを上書きせず、書込readbackで失敗を通知します。別窓のstorageイベントで再読込みしますが、同時writeのtransaction保証はありません。Desktopのアプリデータ・localStorageを消すと登録も失われます。**状態を解除**は登録とdetailsだけを削除し、元の会話は残します。

## 取得と所有者判定の制限

公開SDKの行slotはdurable IDだけを渡し、ownerを渡しません。pluginは`host.profileRoutes()`とownerごとのcatalogから逆引きし、focused profileをownerに流用しません。一意性と読取の充分さを確認できた場合だけ行から登録・変更できます。同ID衝突、未読・失敗source、いずれかのpageが500件以上、取得窓外の場合は行操作を無効にし、理由と作業管理への入口を表示します。ちょうど500件やpin追加の501件以上も保守的に停止します。hiddenを含む`total`と短いpageの行数との差だけでは停止しません。

読取りadapter一箇所で、exact `connectionId`付の`GET /api/profiles/sessions?profile=targetProfile&order=recent`を使い、limit500・hidden/archived除外・`passive:true`を指定します。cold backendを起動せず、失敗時にlocalや作成日時順へfallbackしません。接続を開いてから管理Dialogを更新すると再確認できます。bridgeがない場合も理由を表示します。

対象は列挙ownerの最近活動500件＋pin追加分で、全履歴や未列挙sourceまでの一意性は保証しません。最大3並列・進行中read共有・行操作は30秒cache・poll無しです。Dialogを開く、明示更新、profile/connection切替でも再取得します。無効化後は未開始readと古いUI反映を止めますが、最大3本の進行中readはcancelできません。

取得窓外の登録は **取得範囲外（保存情報）** として残り、タイトル・日時が古い場合があります。状態変更・解除は可能ですが、openには現在確認できるrouteが必要です。日時は同identityの既知値だけを保持し、未知値は0のままです。会話の削除・アーカイブを理由に登録を自動削除しません。

## 無効化・削除

**Capabilities → Plugins** で無効化するか、配置した`plugin.js`を削除します。どちらもlocalStorageの登録を消去する操作ではありません。

## ビルドと開発用チェック

通常の利用では不要です。Node.jsとnpmを用意し、リポジトリ直下で実行します。

```sh
npm ci --ignore-scripts
npm run build
npm run check
node --check plugin.js
git diff --check
```

公開ビルド確認環境はNode.js `26.7.0` / npm `11.19.0`で、他バージョンは未確認です。`src/core.js`が識別・保存・catalog判定、`src/controller.js`が取得と破棄、`src/recent-reader.js`がbridge adapter、`src/plugin.js`がUIの正本です。生成物`plugin.js`はコピー配布のためGitで追跡します。`package.json`の`private: true`はnpmへの誤公開防止であり、GitHubの公開範囲を指定しません。

owner/UI試験の環境変数形式の手順は[開発用検証手順](docs/development.md)を参照してください。運用記録・生evidenceは公開treeに含めません。

## ライセンス・参照

[MIT License](LICENSE)です。利用・改変・再配布・商用利用が可能で、コピーまたは主要部分には著作権表示と許諾文を保持してください。無保証です。SDK・React・開発依存には各ライセンスが適用されます。

- [公式Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)
- [検証状況・互換性・出典](docs/verification.md)
- [開発用検証手順](docs/development.md)
