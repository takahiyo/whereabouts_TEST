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
