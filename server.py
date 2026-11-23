#!/usr/bin/env python3
"""
server.py — Máy chủ cục bộ cho Mechatronics Morning Hub
- Phục vụ toàn bộ file tĩnh PWA (index.html, css, js, sw.js...)
- /api/rss?url=...  : Tải trực tiếp nguồn RSS (không lỗi CORS / 429)
- /api/tts?text=...&voice=...&rate=... : Sinh MP3 giọng đọc tiếng Việt Neural (Hoài My, Nam Minh) & Google Tiếng Việt
- /api/capabilities : Trả về danh sách tính năng & giọng Cloud sẵn có
"""
import asyncio
import json
import os
import re
import threading
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

try:
    import edge_tts
    HAS_EDGE_TTS = True
except ImportError:
    HAS_EDGE_TTS = False

PORT = int(os.environ.get("PORT", "5173"))
HOST = os.environ.get("HOST", "127.0.0.1")

# Cache MP3 tạm trong RAM (tối đa 80 đoạn gần nhất) để phát lại tức thì
TTS_CACHE = {}
TTS_LOCK = threading.Lock()


async def synth_edge_tts(text: str, voice: str, rate_pct: int) -> bytes:
    sign = "+" if rate_pct >= 0 else ""
    comm = edge_tts.Communicate(text, voice, rate=f"{sign}{rate_pct}%")
    chunks = []
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
    return b"".join(chunks)


def synth_google_tts(text: str) -> bytes:
    # Google Translate TTS giới hạn ~180 ký tự mỗi request → tự cắt theo câu/dấu phẩy rồi ghép MP3
    parts = []
    cur = ""
    for seg in text.replace(";", ".").split("."):
        seg = seg.strip()
        if not seg:
            continue
        if len(cur) + len(seg) + 2 <= 170:
            cur = f"{cur}. {seg}" if cur else seg
        else:
            if cur:
                parts.append(cur)
            if len(seg) <= 170:
                cur = seg
            else:
                words = seg.split()
                buf = ""
                for w in words:
                    if len(buf) + len(w) + 1 <= 170:
                        buf = f"{buf} {w}".strip()
                    else:
                        if buf:
                            parts.append(buf)
                        buf = w
                cur = buf
    if cur:
        parts.append(cur)

    audio = bytearray()
    for p in parts:
        u = "https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=" + urllib.parse.quote(p)
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            audio.extend(r.read())
    return bytes(audio)


class HubHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _send_json(self, obj, code=200):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api/capabilities":
            voices = []
            if HAS_EDGE_TTS:
                voices.append({"id": "edge:vi-VN-HoaiMyNeural", "label": "★ Hoài My Neural (Nữ — Tự nhiên)"})
                voices.append({"id": "edge:vi-VN-NamMinhNeural", "label": "★ Nam Minh Neural (Nam — Trầm ấm)"})
            voices.append({"id": "google:vi", "label": "★ Google Tiếng Việt (Nữ — Chuẩn)"})
            return self._send_json({"rssProxy": True, "articleProxy": True, "cloudVoices": voices})

        if parsed.path == "/api/article":
            url = (qs.get("url") or [""])[0].strip()
            if not url.startswith(("http://", "https://")):
                return self._send_json({"error": "URL không hợp lệ"}, 400)
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"},
                )
                with urllib.request.urlopen(req, timeout=12) as r:
                    html = r.read().decode("utf-8", errors="ignore")
                txt = re.sub(r"<(script|style|noscript|svg|iframe|nav|footer|aside|form)[\s\S]*?</\1>", " ", html, flags=re.I)
                txt = re.sub(r"<[^>]+>", " ", txt)
                txt = re.sub(r"\s+", " ", txt).strip()[:6500]
                return self._send_json({"ok": True, "text": txt})
            except Exception as e:
                return self._send_json({"error": str(e)}, 502)

        if parsed.path == "/api/rss":
            url = (qs.get("url") or [""])[0].strip()
            if not url.startswith(("http://", "https://")):
                return self._send_json({"error": "URL không hợp lệ"}, 400)
            try:
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
                        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
                    },
                )
                with urllib.request.urlopen(req, timeout=12) as r:
                    data = r.read()
                    ctype = r.headers.get("Content-Type") or "application/xml; charset=utf-8"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self._send_json({"error": str(e)}, 502)
            return

        if parsed.path == "/api/tts":
            text = (qs.get("text") or [""])[0].strip()
            voice = (qs.get("voice") or ["edge:vi-VN-HoaiMyNeural" if HAS_EDGE_TTS else "google:vi"])[0]
            try:
                rate = float((qs.get("rate") or ["1.0"])[0])
            except ValueError:
                rate = 1.0
            if not text:
                return self._send_json({"error": "Thiếu nội dung text"}, 400)

            rate_pct = max(-40, min(50, round((rate - 1.0) * 100)))
            cache_key = (voice, rate_pct, text)
            with TTS_LOCK:
                cached = TTS_CACHE.get(cache_key)
            if cached is None:
                try:
                    if voice.startswith("edge:") and HAS_EDGE_TTS:
                        vname = voice.split(":", 1)[1]
                        cached = asyncio.run(synth_edge_tts(text, vname, rate_pct))
                    else:
                        cached = synth_google_tts(text)
                    with TTS_LOCK:
                        if len(TTS_CACHE) > 80:
                            TTS_CACHE.clear()
                        TTS_CACHE[cache_key] = cached
                except Exception as e:
                    return self._send_json({"error": str(e)}, 502)

            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(cached)))
            self.end_headers()
            self.wfile.write(cached)
            return

        return super().do_GET()

    def log_message(self, fmt, *args):
        # Giữ log gọn
        pass


if __name__ == "__main__":
    srv = ThreadingHTTPServer((HOST, PORT), HubHandler)
    print(f"Mechatronics Morning Hub running at http://{HOST}:{PORT} (edge_tts={HAS_EDGE_TTS})", flush=True)
    srv.serve_forever()
