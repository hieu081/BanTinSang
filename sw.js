// sw.js — Service Worker: Network-First khi có mạng (luôn nhận bản mới trên iPhone), fallback Cache khi offline
const CACHE_NAME = 'mmh-shell-v16';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/utils.js',
  './js/storage.js',
  './js/telemetry.js',
  './js/feeds.js',
  './js/tts.js',
  './js/notes.js',
  './js/settings.js',
  './js/tools.js',
  './js/data/sparks.js',
  './js/data/pinouts.js',
  './js/data/parts.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Chỉ cache tài nguyên cùng origin (App Shell), bỏ qua /api/*
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
