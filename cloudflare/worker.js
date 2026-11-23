// cloudflare/worker.js — Cloudflare Worker miễn phí (100.000 req/ngày)
// Dùng làm proxy /api/rss và /api/tts khi mở PWA trên iPhone từ xa (4G/Wi-Fi).
// Cách deploy: vào https://dash.cloudflare.com -> Workers & Pages -> Create Worker -> dán file này -> Deploy.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const reqUrl = new URL(request.url);

    if (reqUrl.pathname === '/api/capabilities') {
      return jsonRes({
        rssProxy: true,
        cloudVoices: [{ id: 'google:vi', label: '★ Google Tiếng Việt (Cloudfare Audio)' }],
      });
    }

    if (reqUrl.pathname === '/api/rss') {
      const target = (reqUrl.searchParams.get('url') || '').trim();
      if (!/^https?:\/\//i.test(target)) return jsonRes({ error: 'URL không hợp lệ' }, 400);
      try {
        const res = await fetch(target, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MechatronicsMorningHub/1.0)',
            Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          },
          cf: { cacheTtl: 300, cacheEverything: true },
        });
        const body = await res.arrayBuffer();
        return new Response(body, {
          status: res.status,
          headers: {
            'Content-Type': res.headers.get('Content-Type') || 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            ...CORS,
          },
        });
      } catch (e) {
        return jsonRes({ error: String(e) }, 502);
      }
    }

    if (reqUrl.pathname === '/api/tts') {
      const text = (reqUrl.searchParams.get('text') || '').trim().slice(0, 190);
      if (!text) return jsonRes({ error: 'Thiếu text' }, 400);
      const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
      try {
        const res = await fetch(gUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const mp3 = await res.arrayBuffer();
        return new Response(mp3, {
          status: res.status,
          headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=3600', ...CORS },
        });
      } catch (e) {
        return jsonRes({ error: String(e) }, 502);
      }
    }

    return jsonRes({ ok: true, service: 'Mechatronics Morning Hub Worker', endpoints: ['/api/capabilities', '/api/rss?url=...', '/api/tts?text=...'] });
  },
};
