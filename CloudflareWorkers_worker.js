// 【ここに貼る】Cloudflare Worker（presence-proxy）: index.js（全置換）
// ・GAS（ウェブアプリURL）へ POST プロキシ
// ・CORS: takahiyo.github.io からのみ許可https://presence-proxy-test.taka-hiyo.workers.dev/
// ・レスポンスは no-store。login/renewの role/office/officeName をそのまま転送
export default {
  async fetch(req, env, ctx) {
    const GAS_ENDPOINT = env.GAS_ENDPOINT || "https://script.google.com/macros/s/AKfycbztl-BbrdrpwW7C686wRIib9cReu2sRALZk5HG0CEn66zcH5B7ra4yiDStqgEXqdTQw/exec";
    const origin = req.headers.get('origin') || '';
    // CORS 許可元
    const ALLOW_ORIGINS = new Set([
      'https://takahiyo.github.io'
    ]);
    const allowOrigin = ALLOW_ORIGINS.has(origin) ? origin : '';

    // Preflight
    if (req.method === 'OPTIONS') {
      if (!allowOrigin) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (!allowOrigin) {
      return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
        status: 403,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

    // 受け取った application/x-www-form-urlencoded をそのままGASへ
    const body = await req.text();

    // GASへ転送
    const r = await fetch(GAS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      // Cloudflare 側のキャッシュ抑止
      cf: { cacheTtl: 0, cacheEverything: false }
    });

    // JSON以外はエラー扱い
    const ct = r.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('application/json')) {
      return new Response(JSON.stringify({ error: 'upstream_bad_content_type' }), {
        status: 502,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': allowOrigin,
          'cache-control': 'no-store'
        }
      });
    }

    const json = await r.json();

    // 常に no-store + CORS ヘッダ
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': allowOrigin,
        'cache-control': 'no-store'
      }
    });
  }
};
