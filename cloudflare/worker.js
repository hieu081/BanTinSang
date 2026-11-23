// cloudflare/worker.js — Cloudflare Worker miễn phí (100.000 req/ngày)
// Dùng làm proxy /api/rss và /api/tts khi mở PWA trên GitHub Pages / iPhone từ xa.
// Cách cập nhật: vào Cloudflare Dashboard -> Worker mecha-hub-api -> Edit code -> dán đè -> Deploy.

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

// Cắt đoạn văn bản tiếng Việt dài thành các cụm <= 170 ký tự theo dấu câu để Google TTS đọc trọn vẹn
function splitChunks(text, maxLen = 170) {
  const chunks = [];
  let cur = '';
  const sentences = text.replace(/;/g, '.').split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const part = s.trim();
    if (!part) continue;
    if ((cur + ' ' + part).trim().length <= maxLen) {
      cur = (cur ? cur + ' ' : '') + part;
    } else {
      if (cur) chunks.push(cur);
      if (part.length <= maxLen) {
        cur = part;
      } else {
        let buf = '';
        for (const w of part.split(/\s+/)) {
          if ((buf + ' ' + w).trim().length <= maxLen) buf = (buf ? buf + ' ' : '') + w;
          else { if (buf) chunks.push(buf); buf = w; }
        }
        cur = buf;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks.slice(0, 6);
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const reqUrl = new URL(request.url);

    if (reqUrl.pathname === '/api/capabilities') {
      return jsonRes({
        rssProxy: true,
        cloudVoices: [
          { id: 'google:vi', label: '★ Google Tiếng Việt — Chuẩn (Nữ)' },
          { id: 'google:vi-slow', label: '★ Google Tiếng Việt — Đọc chậm, rõ' },
          { id: 'google:vi-fast', label: '★ Google Tiếng Việt — Điểm tin nhanh' },
        ],
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
      const text = (reqUrl.searchParams.get('text') || '').trim();
      if (!text) return jsonRes({ error: 'Thiếu text' }, 400);
      const chunks = splitChunks(text, 170);
      try {
        const buffers = await Promise.all(chunks.map(async (c) => {
          const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(c)}`;
          const r = await fetch(gUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!r.ok) throw new Error(`TTS HTTP ${r.status}`);
          return new Uint8Array(await r.arrayBuffer());
        }));
        const total = buffers.reduce((s, b) => s + b.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const b of buffers) { merged.set(b, offset); offset += b.length; }
        return new Response(merged, {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=3600', ...CORS },
        });
      } catch (e) {
        return jsonRes({ error: String(e) }, 502);
      }
    }

    return jsonRes({ ok: true, service: 'Mechatronics Morning Hub Worker', endpoints: ['/api/capabilities', '/api/rss?url=...', '/api/tts?text=...'] });
  },
};
