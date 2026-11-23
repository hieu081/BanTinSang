// storage.js — localStorage, cache Stale-While-Revalidate, cài đặt, Export/Import, trạng thái đồng bộ
const PREFIX = 'mmh:';
export const APP_ID = 'mechatronics-morning-hub';

export const store = {
  get(key, def = null) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v === null ? def : JSON.parse(v);
    } catch (_) {
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.warn('[storage] Không ghi được (đầy bộ nhớ?)', key, e);
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (_) { /* ignore */ }
  },
  keys() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
    return out;
  },
};

/* ---------- Cache SWR ---------- */
export const cacheGet = (key) => store.get(`cache:${key}`, null);
export const cacheSet = (key, data) => store.set(`cache:${key}`, { ts: Date.now(), data });
export const isFresh = (entry, ttlMs) => !!entry && Date.now() - entry.ts < ttlMs;
export function clearCache() {
  store.keys().filter((k) => k.startsWith('cache:') || k.startsWith('geo:')).forEach((k) => store.remove(k));
}

/* ---------- Cài đặt ---------- */
export const DEFAULT_LOCATION = { name: 'Hưng Yên', lat: 20.94, lon: 105.97 };

export const DEFAULT_FEEDS = [
  { id: 'vne-sohoa', name: 'VnExpress Số hóa', url: 'https://vnexpress.net/rss/so-hoa.rss', group: 'vn', lang: 'vi', enabled: true },
  { id: 'vne-khoahoc', name: 'VnExpress Khoa học', url: 'https://vnexpress.net/rss/khoa-hoc.rss', group: 'vn', lang: 'vi', enabled: true },
  { id: 'tinhte', name: 'Tinh tế', url: 'https://tinhte.vn/rss', group: 'vn', lang: 'vi', enabled: true },
  { id: 'hackaday', name: 'Hackaday', url: 'https://hackaday.com/feed/', group: 'embedded', lang: 'en', enabled: true },
  { id: 'cnx', name: 'CNX Software', url: 'https://www.cnx-software.com/feed/', group: 'embedded', lang: 'en', enabled: true },
  { id: 'ieee-robotics', name: 'IEEE Spectrum Robotics', url: 'https://spectrum.ieee.org/feeds/topic/robotics.rss', group: 'robotics', lang: 'en', enabled: true },
  { id: 'arxiv-ro', name: 'arXiv cs.RO', url: 'https://rss.arxiv.org/rss/cs.RO', group: 'robotics', lang: 'en', enabled: true },
];

const isLocalHost = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);

export const DEFAULT_SETTINGS = {
  location: DEFAULT_LOCATION,
  useGPS: true,
  radar: ['STM32', 'ESP32', 'ROS2', 'FOC', 'PID', 'PLC'],
  feeds: DEFAULT_FEEDS,
  gnewsEnabled: true,
  gnewsTerms: ['tự động hóa', 'PLC', 'bán dẫn', 'robot', 'vi điều khiển'],
  githubEnabled: true,
  githubTopics: ['esp32', 'stm32', 'ros2', 'robotics', 'embedded'],
  theme: 'dark', // dark | light | system
  geminiKey: '',
  workerUrl: isLocalHost ? '' : 'https://mecha-hub-api.hieuminh0945.workers.dev',
  techOnly: true, // Lọc tin tiêu dùng rác ở nguồn VN tổng hợp
  ttsRate: 0.95,
  ttsVoice: '',
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export function getSettings() {
  const s = store.get('settings', {}) || {};
  const merged = { ...clone(DEFAULT_SETTINGS), ...s };
  merged.location = { ...DEFAULT_LOCATION, ...(s.location || {}) };
  if (!Array.isArray(merged.feeds)) merged.feeds = clone(DEFAULT_FEEDS);
  if (!Array.isArray(merged.radar)) merged.radar = clone(DEFAULT_SETTINGS.radar);
  return merged;
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  store.set('settings', next);
  window.dispatchEvent(new CustomEvent('settings-changed', { detail: { keys: Object.keys(patch), settings: next } }));
  return next;
}

/* ---------- Sao lưu & khôi phục ---------- */
export function exportAll({ includeKey = false } = {}) {
  const data = {};
  for (const k of store.keys()) data[k] = store.get(k);
  if (data.settings && !includeKey) data.settings = { ...data.settings, geminiKey: '' };
  return { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), data };
}

export function importAll(obj) {
  if (!obj || obj.app !== APP_ID || typeof obj.data !== 'object' || obj.data === null) {
    throw new Error('Tệp không đúng định dạng sao lưu Mechatronics Morning Hub');
  }
  const currentKey = getSettings().geminiKey;
  let n = 0;
  for (const [k, v] of Object.entries(obj.data)) {
    let val = v;
    if (k === 'settings' && val && !val.geminiKey && currentKey) val = { ...val, geminiKey: currentKey };
    if (store.set(k, val)) n++;
  }
  return n;
}

/* ---------- Trạng thái đồng bộ (đèn LED) ---------- */
const pending = new Set();
const failed = new Set();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(sync.state()));

export const sync = {
  begin(name) { pending.add(name); emit(); },
  end(name, ok = true) {
    pending.delete(name);
    if (ok) failed.delete(name); else failed.add(name);
    emit();
  },
  /** 'sync' (vàng nhấp nháy) | 'offline' (đỏ) | 'ok' (xanh) | 'idle' */
  state() {
    if (pending.size) return 'sync';
    if (!navigator.onLine || failed.size) return 'offline';
    return 'ok';
  },
  failedList: () => [...failed],
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  ping: emit,
};
