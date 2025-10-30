// 環境ごとの設定値
// REMOTE_ENDPOINT: APIのエンドポイント
// REMOTE_POLL_MS: 状態更新のポーリング間隔(ms)
// CONFIG_POLL_MS: 設定更新のポーリング間隔(ms)
// TOKEN_DEFAULT_TTL: トークンのデフォルト有効期限(ms)
const REMOTE_ENDPOINT = "https://presence-proxy-prod.taka-hiyo.workers.dev";
const REMOTE_POLL_MS = 10000;
const CONFIG_POLL_MS = 30000;
const TOKEN_DEFAULT_TTL = 3600000;

// publicListOffices が利用できない環境で使用する拠点一覧（id, name）
const PUBLIC_OFFICE_FALLBACKS = [
  { id: 'dev',  name: '開発用' },
  { id: 'prod', name: '稼働用' }
];