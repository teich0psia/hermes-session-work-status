# 検証状況・互換性・出典

## 現在地

バージョン`0.1.0`、ID`session-work-status`の現行成果物は、本体無改造・行末左クリック＋登録済み限定Dialog版です。owner情報更新の修正後、独立再レビューを通過し、コード成果物として受け入れ済みです。作成元環境への配置、native Desktop受入は未実施です。旧バッジ＋pane版・旧Core拡張版の合格を現行版へ流用していません。

公開用履歴は、ローカルの開発・運用履歴とは別の親なしコミットを起点に継続しています。公開するのはソース、単一ファイル配布物、テスト、ビルドファイル、MIT LICENSE、英語READMEと既存日本語README、公開向け文書です。運用記録・生evidence・画像・ローカル開発履歴は含めません。

## 受入前の検証記録

以下は受入版の既存記録を確認してまとめた結果です。公開工程で全機能試験を再実行したという意味ではありません。

| 確認項目 | 記録された結果 | 範囲 |
|---|---|---|
| Node試験 | 14/14合格 | identity/storage/catalog、500/501境界、日時保持、登録済み・窓外、sort、cache、dispose/epoch |
| owner probe | 成功 | 無改造production routing/tag helpers＋実plugin reader/catalog、controlled IO |
| Chromiumハーネス | 9/9合格、page/console error 0 | 実row slot/button/menus/registry/Dialogとfixture host・owner・bridge IO |
| owner更新回帰 | 5/5合格、page/console error 0 | retarget・loading・fresh alias・再描画前Enter・ownerなしの保存状態変更/解除 |
| 独立再レビュー | focused Chromium 6経路成功、page/console error 0 | owner更新修正の解決、重要退行なし、SDK exports・source/bundle一致 |
| 配布物 | in-memory buildとのbyte一致 | plain ESM、外部ランタイム依存はSDK/Reactのみ |

初回独立レビューは、Dialogが操作中の順序だけでなく古いownerrouteも保持する問題を再現し、受入を止めました。修正ではidentity順序だけを固定し、表示は最新catalogへ追従、openは直前のstateからexact ownerを再照合します。loadingやowner不在ではrow/footer/Enterのopenを拒否しますが、保存済み登録の状態変更・解除は維持します。初回合格だった既存9経路だけでは検出できなかった問題で、初回レビューを合格へ読み替えていません。

## 公開パッケージの検査

受入版のsourceと`plugin.js`を公開用履歴へ選別反映し、環境変数形式の試験手順を維持します。個人パスfallbackはありません。`scripts/check-artifact.mjs`でSDK named exportsとin-memory source/bundle byte一致を確認できます。本体フルbuild/typecheckの代替ではありません。構文・相対リンク・privacy pattern・配布物hash・公開tree/READMEの読戻しは公開工程で確認し、フルNode/UIや実機の受入とは区別します。

## 未検証の境界

- native Electronのロード、自動ロード・hot reload、実row全体のstate/handler、本番CSS/layout/watch。
- 実preload bridge・HTTP API・remote認証や到達性を経由した一覧取得。
- 実際の複数接続、接続先・履歴が同時に変化する環境。
- macOS・Windows動作。Linuxのブラウザーハーネス成功もnative受入を意味しません。
- 最低対応リリース、他のHermes revision・Node/npmバージョンでの互換性。

owner catalogは列挙sourceのrecent500件＋pin追加分のみで、全履歴・未列挙sourceの一意性は保証しません。満杯page、同ID衝突、未読・失敗sourceや窓外では行から登録しません。登録済み情報は窓外でも残し、状態変更・解除は可能ですが、openには現在確認できるownerrouteが必要です。

最大3本の進行中readはcancelできません。`passive:true`でcold backendを起動せず、失敗時のlocal/created fallbackはありません。保存はrendererローカルのみで、他端末同期・複数窓同時writeのtransaction保証はなく、保存タイトル・日時が古い場合があります。Gateway再起動、本体変更、稼働配置は公開工程に含みません。

## API契約の照合先

[公式Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)と、Hermesソース`3ebbaf524344f93943169e63854cb952541563f9`を照合しています。このSHAは契約参照先で、全機能保証や最低対応版の宣言ではありません。最近活動順は公開SDKだけではなく既存`window.hermesDesktop.api`への明示依存です。

- [Desktopプラグインのアプリ共通ルート](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/electron/desktop-plugins-root.ts)
- [SDKのprofileRoutes・created固定listPersistedSessions](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/src/sdk/index.ts)
- [durable IDを渡す行スロット](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/src/lib/session-row-slots.ts)
- [plugin namespace](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/src/contrib/plugin.ts)と[localStorage](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/apps/desktop/src/lib/storage.ts)
- [一覧取得backend](https://github.com/NousResearch/hermes-agent/blob/3ebbaf524344f93943169e63854cb952541563f9/hermes_cli/web_routers/profiles.py)

## 出典とライセンス

配布物は本projectのsourceから生成し、Desktopが提供するSDKとReactは外部importします。本体コードは`plugin.js`へ同梱しません。ハーネスは別checkoutの実部品を参照し、生成bundleは公開しません。backend fixtureは同梱generatorが作った合成セッションのresponseです。最新revisionの隔離DB試験は再実行しておらず、実HTTPの検証でもありません。

権利者が選択した[MIT License](../LICENSE)を保持しています。著作権表示・許諾文の保持が必要で、無保証です。SDK・React・`esbuild`・`@tabler/icons-react`には各ライセンスが適用され、本projectのLICENSEで再ライセンスしません。
