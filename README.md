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

稼働環境（開発・本番）を切り替える際は、以下の項目を必ず更新してください。

- `config.js` の `REMOTE_ENDPOINT` 行（検索キーワード: `const REMOTE_ENDPOINT`）
  - 開発 → 本番: `REMOTE_ENDPOINT` を本番APIのエンドポイントに差し替える。
  - 本番 → 開発: `REMOTE_ENDPOINT` を開発APIのエンドポイントに戻す。
- `index.html` の Content-Security-Policy の `connect-src` 行（検索キーワード: `connect-src`）
  - 開発 → 本番: `connect-src` に指定しているドメインを本番APIのドメインに変更する。
  - 本番 → 開発: `connect-src` に開発用APIドメインを設定し直す。
- `index.html` 内の表示文言「在席確認表【開発用】」4か所（検索キーワード: `在席確認表`）
  - 開発 → 本番: 文言から「【開発用】」を除き、本番向けの表示にする。
  - 本番 → 開発: 必要に応じて「【開発用】」を付与し、開発用である旨を明示する。
