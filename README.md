# 在席確認表 - 開発者向けドキュメント

## プロジェクト構成

```
webapp/
├── index.html                    # メインHTML（タイトル・CSP設定含む）
├── config.js                     # 環境設定（エンドポイント・ポーリング間隔）
├── main.js                       # アプリケーション起動処理
├── styles.css                    # スタイル定義
├── sw.js                         # Service Worker（キャッシュ制御）
├── js/
│   ├── globals.js               # グローバル変数・要素参照
│   ├── utils.js                 # ユーティリティ関数
│   ├── layout.js                # レイアウト制御
│   ├── filters.js               # 検索・絞り込み機能
│   ├── board.js                 # 画面描画・入力制御
│   ├── offices.js               # 拠点管理
│   ├── auth.js                  # 認証処理
│   ├── sync.js                  # メニュー設定・データ同期
│   └── admin.js                 # 管理パネル機能
├── CloudflareWorkers_worker.js  # Cloudflare Workerコード
├── GAS_コード.gs                # Google Apps Scriptメインコード
└── GAS_admin_super.gs           # GAS管理者用スクリプト
```

## 開発環境 → 本番環境への切り替え手順

本番環境へデプロイする際は、以下の項目を**必ず全て**変更してください。

### 1. Cloudflare Worker のデプロイと設定

#### 1-1. Worker のデプロイ
```bash
# Cloudflare Workers のプロジェクトをデプロイ
npx wrangler deploy
```

#### 1-2. Worker名の変更（-test → -prod）
- Cloudflare ダッシュボードで Worker名を変更
  - 開発: `presence-proxy-test`
  - 本番: `presence-proxy` または `presence-proxy-prod`

#### 1-3. 環境変数 `GAS_ENDPOINT` の設定
Cloudflare Workers の環境変数に GAS のウェブアプリURL を設定：

```bash
# wrangler CLI で設定
npx wrangler secret put GAS_ENDPOINT
# または Cloudflare ダッシュボードから設定
```

**重要**: GAS のウェブアプリをデプロイして取得したURLを設定してください。  
例: `https://script.google.com/macros/s/[デプロイID]/exec`

参考: `CloudflareWorkers_worker.js` 7行目のデフォルトURL

### 2. `config.js` の変更

**ファイル**: `config.js`

```javascript
// 変更前（開発環境）
const REMOTE_ENDPOINT = "https://presence-proxy-test.taka-hiyo.workers.dev";

// 変更後（本番環境）
const REMOTE_ENDPOINT = "https://presence-proxy.taka-hiyo.workers.dev";
// または
const REMOTE_ENDPOINT = "https://presence-proxy-prod.taka-hiyo.workers.dev";
```

**検索キーワード**: `const REMOTE_ENDPOINT`

### 3. `index.html` の変更（2箇所）

**ファイル**: `index.html`

#### 3-1. CSP (Content Security Policy) の変更

**行番号**: 17行目付近  
**検索キーワード**: `connect-src`

```html
<!-- 変更前（開発環境） -->
connect-src 'self' https://presence-proxy-test.taka-hiyo.workers.dev;

<!-- 変更後（本番環境） -->
connect-src 'self' https://presence-proxy.taka-hiyo.workers.dev;
```

#### 3-2. タイトル・表示文言の変更（4箇所）

**検索キーワード**: `在席確認表【開発用】`

| 行番号 | 場所 | 変更内容 |
|--------|------|----------|
| 6行目 | `<title>` タグ | `在席確認表【開発用】` → `在席確認表` |
| 27行目 | ヘッダーボタン初期値 | `在席確認表【開発用】` → `在席確認表` |
| 100行目 | マニュアル内の見出し | `在席確認表【開発用】` → `在席確認表` |
| 128行目 | ログイン画面の見出し | `在席確認表【開発用】` → `在席確認表` |

**注意**: `main.js` 内（24行目・72行目）でタイトルが動的に上書きされるため、実行時は拠点名が反映されます。

### 4. `sw.js` の変更

**ファイル**: `sw.js`  
**行番号**: 2行目  
**検索キーワード**: `CACHE_NAME`

```javascript
// 変更前（開発環境）
const CACHE_NAME = 'presence-pages-cache-test-v1';

// 変更後（本番環境）
const CACHE_NAME = 'presence-pages-cache-prod-v1';
```

**目的**: キャッシュ名を変更することで、開発版と本番版のキャッシュを明確に分離します。

### 5. GAS (Google Apps Script) のデプロイ

#### 5-1. GAS プロジェクトへのコード配置
1. Google Apps Script プロジェクトを作成
2. `GAS_コード.gs` の内容をコピー＆ペースト
3. 管理者機能が必要な場合は `GAS_admin_super.gs` も追加

#### 5-2. ウェブアプリとしてデプロイ
1. GAS エディタで「デプロイ」→「新しいデプロイ」
2. デプロイタイプ: 「ウェブアプリ」を選択
3. 実行ユーザー: 自分
4. アクセス権限: 「全員」
5. デプロイ → **ウェブアプリURL をコピー**

#### 5-3. デプロイURLの反映
取得したウェブアプリURLを以下に設定：
- **Cloudflare Workers の環境変数** `GAS_ENDPOINT`（必須）
- `CloudflareWorkers_worker.js` 7行目のデフォルト値（任意・フォールバック用）

### 6. GitHub Pages へのデプロイ

#### 6-1. リポジトリ設定
```bash
# 変更をコミット
git add .
git commit -m "chore: 本番環境用に設定を変更"
git push origin main
```

#### 6-2. GitHub Pages 設定
1. GitHub リポジトリの Settings → Pages
2. Source: `main` ブランチの `/` (root) または `/docs` を選択
3. Save

#### 6-3. カスタムドメインの設定（任意）
- Settings → Pages → Custom domain で設定
- 必要に応じて `index.html` の CSP を追加更新

## 環境別設定ファイルの管理（推奨）

複数環境を管理する場合、設定ファイルを分けて管理することを推奨します。

```bash
# 設定ファイルを環境別に作成
cp config.js config.dev.js
cp config.js config.prod.js

# 環境に応じて切り替え
# 開発環境
cp config.dev.js config.js

# 本番環境
cp config.prod.js config.js
```

**注意**: `config.dev.js` と `config.prod.js` は `.gitignore` に追加するか、別途管理してください。

## 変更チェックリスト

本番デプロイ前に以下を確認してください：

- [ ] **GAS**: ウェブアプリとしてデプロイ済み、URLを取得
- [ ] **Cloudflare Worker**: 環境変数 `GAS_ENDPOINT` に GAS の URL を設定
- [ ] **Cloudflare Worker**: Worker 名を `-test` から `-prod` に変更
- [ ] **config.js**: `REMOTE_ENDPOINT` を本番 Worker URL に変更
- [ ] **index.html**: CSP の `connect-src` を本番 Worker URL に変更
- [ ] **index.html**: タイトル「在席確認表【開発用】」→「在席確認表」に変更（4箇所）
- [ ] **sw.js**: `CACHE_NAME` を `...-prod-...` に変更
- [ ] **GitHub Pages**: デプロイ設定完了、URL確認
- [ ] **動作確認**: 本番環境でログイン・データ更新・同期をテスト

## 開発・デバッグ

### ローカル開発サーバー

```bash
# Python 3 の場合
python3 -m http.server 8000

# Node.js の場合
npx http-server -p 8000
```

ブラウザで `http://localhost:8000` にアクセス

### ブラウザキャッシュのクリア

開発中に古いキャッシュが残る場合：
1. ブラウザの開発者ツール（F12）を開く
2. Application → Service Workers → Unregister
3. Application → Storage → Clear site data
4. ページをリロード（Ctrl+Shift+R / Cmd+Shift+R）

### デバッグログ

`js/utils.js` の `diagAdd()` 関数がデバッグログを画面下部に出力します。  
本番環境では必要に応じて無効化を検討してください。

## データ構造

### メニュー設定 (`MENUS`)

管理パネルから JSON で編集可能：

```json
{
  "statuses": [
    { "value": "在席", "class": "st-here", "clearOnSet": true },
    { "value": "外出", "requireTime": true, "class": "st-out" },
    { "value": "会議", "requireTime": true, "class": "st-meeting" },
    { "value": "テレワーク", "class": "st-remote", "clearOnSet": true },
    { "value": "休み", "class": "st-off", "clearOnSet": true }
  ],
  "noteOptions": ["直出", "直帰", "直出・直帰"],
  "businessHours": [
    "07:00-15:30",
    "07:30-16:00",
    "08:00-16:30",
    "08:30-17:00",
    "09:00-17:30",
    "09:30-18:00",
    "10:00-18:30",
    "10:30-19:00",
    "11:00-19:30",
    "11:30-20:00",
    "12:00-20:30"
  ],
  "timeStepMinutes": 30
}
```

**注意**: 業務時間の空白時プレースホルダーは `js/board.js` で `'09:00-17:30'` に固定されています。

### CSV フォーマット

**エクスポート・インポート共通**:
```
グループ番号,グループ名,表示順,id,氏名,内線,業務時間,ステータス,戻り時間,備考
```

## トラブルシューティング

### 「通信エラー」が表示される

1. `config.js` の `REMOTE_ENDPOINT` が正しいか確認
2. `index.html` の CSP `connect-src` に Worker URL が含まれているか確認
3. Cloudflare Worker が正常に動作しているか確認
4. Worker の環境変数 `GAS_ENDPOINT` が正しい GAS URL か確認

### GAS のウェブアプリ URL を変更した場合

1. Cloudflare Workers の環境変数 `GAS_ENDPOINT` を新しい URL に更新
2. Worker を再デプロイまたは再起動
3. キャッシュをクリアしてテスト

### Service Worker がキャッシュを更新しない

1. ブラウザの開発者ツールで Service Worker を Unregister
2. `sw.js` の `CACHE_NAME` のバージョン番号を上げる（例: `v1` → `v2`）
3. 強制リロード（Ctrl+Shift+R）

### 「拠点またはパスワードが違います」エラー

1. GAS でスクリプトプロパティが正しく設定されているか確認
2. 拠点ID・パスワードが正しいか確認
3. GAS のログを確認（Apps Script エディタの実行ログ）

## セキュリティに関する注意事項

- **CORS設定**: Cloudflare Worker の `ALLOW_ORIGINS` を適切に設定
- **CSP設定**: `index.html` の CSP を必要最小限に制限
- **パスワード管理**: GAS のスクリプトプロパティで管理（平文保存のため強力なパスワードを使用）
- **認証トークン**: セッションストレージに保存、有効期限は1時間（デフォルト）

## ライセンス・サポート

このプロジェクトは開発者による内部利用を想定しています。  
商用利用する場合は、適切なライセンスを設定してください。
