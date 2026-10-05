# 検証状況・互換性・出典

## 現在地

バージョン`0.1.0`、ID`session-work-status`のコード成果物は、修正と独立再レビューを完了しています。作成元環境へのインストール、native Desktop受入は未実施です。この公開準備では、リモート作成・pushも行っていません。

公開用ブランチは、既存のローカル開発履歴とは別の親なしコミットから始めます。元の履歴・運用記録・生の証拠はローカルに保持し、公開用にはソース、単一ファイルの配布物、テスト、ビルド用ファイル、このREADMEと公開向けの文書だけを含めます。

## 既存の検証記録

以下は公開準備より前の実装検証記録を確認してまとめた結果です。公開準備でフル試験を再実行したという意味ではありません。

| 確認項目 | 記録された結果 | 範囲 |
|---|---|---|
| Node試験 | 10/10合格 | 保存、識別、所有者判定、500/501件境界、取得キューの破棄 |
| Chromiumハーネス | 15/15合格、page/console error 0 | Chromium `148.0.7778.96`。実UI部品とfixture host |
| 独立・対象を絞った再レビュー | Node 4/4、Chromium 6/6合格、page/console error 0 | 初回指摘3件の解消と退行確認 |
| 隔離バックエンド | hidden差とpin追加をassert | 実router/SessionDBを新規scratch DBへ直接適用 |
| 単一ファイル生成物 | in-memory buildとのbyte一致 | SDK/React以外の外部ランタイム依存なし |

初回レビューでは、hiddenを含む`total`との差による誤判定、native行ボタン内のbutton入れ子、無効化後に未開始の取得を続ける問題を確認しました。現コードはそれぞれ取得行数に基づく保守的な判定、非focusのspanバッジとペインでのキーボード操作、破棄・世代チェックで対処しています。

## 公開準備での確認

`npm run build`、`plugin.js`とハーネスビルドscriptの構文検査、`HERMES_SOURCE`を指定したハーネスビルド、`git diff --check`は成功しました。`HERMES_SOURCE`未指定時は明示的なエラーで停止することを確認しています。in-memory esbuild結果と`plugin.js`はbyte一致し、ランタイム実装・試験・配布物は受け入れ済みの版から変更していません。フル試験やインストール、native実行は追加していません。

## 未検証の境界

- native Electronによるロード、自動ロード・ホットリロード、実レイアウト、本番CSS。
- 実SDKのElectron bridge/HTTP APIを経由した一覧取得。
- 実際の複数接続、接続先や履歴が同時に変化する環境。
- macOS・Windowsでの動作。Linux上のブラウザーハーネス成功も、Linuxのnative Desktop受入を意味しません。
- 最低対応リリース番号、他のHermesリビジョンや他のNode/npmバージョンでの互換性。

SDKのキャンセル手段がない進行中の読取りは、無効化後も最大3件が完了を待ちます。保存はDesktopローカルのみで、複数端末同期や同時書込みのトランザクションは提供しません。全履歴・アーカイブ管理も対象外です。

## API契約の照合先

[公式Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)と、Hermesソース`3ebbaf524344f93943169e63854cb952541563f9`の実装を照合しています。このSHAは契約の参照先であり、全機能の動作保証や最低対応版の宣言ではありません。

- [Desktopプラグインのアプリ共通ルート](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/electron/desktop-plugins-root.ts)
- [SDKのprofileRoutes・listPersistedSessions](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/src/sdk/index.ts)
- [永続セッションIDを渡す行スロット](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/src/lib/session-row-slots.ts)
- [プラグインのstorage namespace](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/src/contrib/plugin.ts)と[localStorageの実装](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/src/lib/storage.ts)
- [一覧取得のバックエンド](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/hermes_cli/web_routers/profiles.py)

## 出典とライセンス

このプラグインは、このプロジェクトのソースから生成した成果物です。実行時にはDesktopが提供するSDKとReactをインポートし、それらの本体コードを`plugin.js`へ同梱しません。UIハーネスもHermesの実部品を別チェックアウトから参照し、生成したbundleは公開ファイルに含めません。保存済みbackend fixtureは、同梱generatorが作った合成セッションのresponseです。

公開準備時にはライセンス未設定でしたが、その後、権利者の指示により[MIT License](../LICENSE)を採用しました。著作権表示と許諾文の保持が必要で、無保証です。Hermes SDK・React・開発依存`esbuild`と`@tabler/icons-react`には、それぞれのライセンスが適用され、このプロジェクトのLICENSEで再ライセンスしません。
