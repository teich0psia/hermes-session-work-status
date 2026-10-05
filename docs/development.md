# 開発用検証手順

[README](../README.md)のインストールでは不要な、開発者向けの手順です。通常のNode試験はこのリポジトリだけで実行できます。UI試験には、別途Hermesのソースとその既存の`node_modules`が必要です。この手順はHermes本体の依存をインストール・変更しません。

## Chromiumハーネス

リポジトリ直下で、[READMEのビルド準備](../README.md)を済ませてから実行します。`HERMES_SOURCE`には検証するHermesソースの絶対パスを設定します。通常のソース配置なら次の例になります。異なる場所にある場合は変更してください。未指定ならハーネスビルドはエラーで停止します。

```sh
export HERMES_SOURCE="$HOME/.hermes/hermes-agent"
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright" .venv/bin/python -m playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright" npm run test:ui
```

既存のChromiumを使う場合は、ブラウザーのダウンロードに代えて`UI_CHROMIUM`にその実行ファイルの絶対パスを設定します。

```sh
: "${HERMES_SOURCE:?検証するHermesソースを指定してください}"
: "${UI_CHROMIUM:?既存Chromiumの実行ファイルを指定してください}"
npm run test:ui
```

`test:ui`は`.venv/bin/python`を使うため、このコマンド例はmacOS/Linux向けです。Windowsでの開発手順・動作は未検証です。Hermesソースの依存が不足している場合はビルドが失敗します。本体の自動修復や本体への依存追加は行いません。

ハーネスはHermesソースの実`RowButton`・`Button`・`DropdownMenu`とReact・nanostoresを使い、host API・登録機構・行ハンドラーはfixtureに置き換えます。Desktopの本番CSSやレイアウト、Electron、Gatewayは使いません。runnerはloopbackの空きポートでサーバーを起動し、対象をHTTPで確認してから試験し、終了時に閉じます。

UI試験は`evidence/`へ結果JSONと画像を書き出します。これは開発用の生成物で、公開用ブランチではGitの追跡対象にしません。実行した試験の画像を本番Desktopのスクリーンショットとして扱わないでください。

## 隔離バックエンド試験

既存のHermes runtime PythonとHermesソースを使います。`HERMES_PYTHON`は必要な依存があるPythonの絶対パス、`TMPDIR`は書込み可能なscratchディレクトリの絶対パスに設定します。通常のPythonで依存が足りない場合も、この手順では本体へ追加インストールしません。

```sh
: "${HERMES_PYTHON:?既存Hermes runtimeのPythonを指定してください}"
: "${HERMES_SOURCE:?検証するHermesソースを指定してください}"
: "${TMPDIR:?scratchディレクトリを指定してください}"
scratch=$(mktemp -d "$TMPDIR/work-status-backend-XXXXXX")
HERMES_HOME="$scratch/home" PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$HERMES_SOURCE" \
  "$HERMES_PYTHON" tests/backend_fixture.py > "$scratch/pages.json"
```

`tests/backend_fixture.py`は、新規scratchホームであることを確認してから実routerとSessionDBを直接呼びます。実ユーザーのDBは使いません。次をassertします。

- visible 1件とhidden 1件で`total=2`、取得行数1件。
- 作成日時順の取得枠500件に、枠外の古いピン留めが追加されて取得行数501件。

出力の`hidden_short`が、追跡済みの`tests/fixtures/hidden-short.json`に使ったresponseです。fixtureのIDはgeneratorが作った`visible`というテスト用IDで、実ユーザーのセッションではありません。試験はElectron bridgeやHTTP APIを通していません。出力を更新する場合は、内容と回帰試験への影響を確認してからfixtureへ反映してください。

## 生成物と構文の確認

`scripts/build.mjs`の設定で生成した`plugin.js`をコミットします。ランタイムの外部インポートは`@hermes/plugin-sdk`、`react`、`react/jsx-runtime`のみです。

```sh
npm run build
node --check plugin.js
node --check src/core.js
node --check src/controller.js
node --check src/plugin.js
git diff --check
```

ハーネスの合格をnative受入と読み替えないでください。未検証項目は[検証状況](verification.md)を参照してください。
