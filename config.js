// 環境ごとの設定値
// REMOTE_ENDPOINT: APIのエンドポイント
// REMOTE_POLL_MS: 状態更新のポーリング間隔(ms)
// CONFIG_POLL_MS: 設定更新のポーリング間隔(ms)
// TOKEN_DEFAULT_TTL: トークンのデフォルト有効期限(ms)
const REMOTE_ENDPOINT = "https://presence-proxy-prod.taka-hiyo.workers.dev";
const REMOTE_POLL_MS = 2000;
const CONFIG_POLL_MS = 120000;
const TOKEN_DEFAULT_TTL = 3600000;
