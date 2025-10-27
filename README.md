# ビルド・デプロイ手順

## 設定ファイル

環境ごとの設定値は `config.js` にまとめています。`REMOTE_ENDPOINT` やポーリング間隔はこのファイルで調整してください。

本番や開発など複数環境を切り替える場合は、環境別の設定ファイルを用意し、デプロイ前に目的の設定を `config.js` として配置します。

```sh
# 開発環境の例
cp config.dev.js config.js

# 本番環境の例
cp config.prod.js config.js
```

`index.html` の Content-Security-Policy (`connect-src`) も `REMOTE_ENDPOINT` に合わせて書き換えてください。

## 周知スクリプトの運用と差分共有

`tools/update_notice_assignments.js` は、`main.js` 内の周知更新処理を自動的に `applyCurrentNotice(...)` 形式へそろえるための補助ツールです。今後同様の修正が必要になった場合は、以下の手順で対応してください。

1. 作業ブランチで `node tools/update_notice_assignments.js` を実行します。
2. スクリプトが置換した件数を表示するので、終了メッセージを確認します（該当が無い場合は "already normalized" が表示されます）。
3. `git status` や `git diff` で変更内容を確認し、問題が無ければそのままコミットします。

これにより、従来のように `ApplyPatch.yml` や貼り付け用パッチ断片をやり取りする必要はありません。差分を共有する場合は、通常の Git の差分（`git diff` や Pull Request 上の diff）を提示してください。他リポジトリで同様の改修が必要な場合も、まずは専用スクリプトや既存の自動化ツールの有無を確認し、必要に応じて同様の方法で差分を生成します。

手元の環境でスクリプトが利用できない場合や追加の調整が必要なときは、従来通り変更後のファイル全体や前後差分を共有して調整してください。
