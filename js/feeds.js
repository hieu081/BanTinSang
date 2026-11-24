// feeds.js — RSS (ưu tiên tiếng Việt, tự dịch chuyên ngành Cơ điện tử cho tin tiếng Anh), GitHub API, Radar, Gemini BYOK
import { store, cacheGet, cacheSet, isFresh, getSettings, sync } from './storage.js';
import { $, $$, esc, fetchWithTimeout, fetchJSON, timeAgo, hash, stripHTML, clip, toast } from './utils.js';
import { openBookmarkDialog, isBookmarked } from './notes.js';
import * as tts from './tts.js';

export const GROUPS = { vn: 'Việt Nam', embedded: 'Nhúng', robotics: 'Robotics', github: 'GitHub' };
const FILTERS = [
  ['all', 'Tất cả (Ưu tiên VN)'], ['vn', '🇻🇳 Việt Nam'], ['radar', '◉ RADAR'],
  ['embedded', 'Nhúng & HW'], ['robotics', 'Robotics'], ['github', 'GitHub'], ['unread', 'Chưa đọc'],
];

// Từ khóa giữ lại cho Chế độ Kỹ thuật thuần (lọc tin tiêu dùng/xe/điện thoại ở báo tổng hợp VN)
const TECH_PURE_RE = /(robot|tự động|bán dẫn|vi mạch|chip|ai\b|trí tuệ nhân tạo|vi điều khiển|điện tử|cơ khí|in 3d|plc|cảm biến|pin\b|năng lượng|lập trình|mã nguồn|drone|uav|lidar|cnc|stm32|esp32|ros\s?2|iot|pcb|vệ tinh|vũ trụ|động cơ|lượng tử|khoa học|kỹ thuật|công nghiệp|laser|siêu dẫn|nhiệt hạch|máy học|llm|gpu|cpu|arm|risc|fpga|linux|firmware|arduino|raspberry|foc|pid|bldc|servo)/i;
const GENERAL_VN_IDS = new Set(['vne-sohoa', 'tinhte']);

let items = [];
let sourceStatus = {};
let filter = 'all';
let readSet = new Set(store.get('read', []));
let inflight = null;

/* ---------- Nguồn tin ---------- */
export const gnewsUrl = (terms) => {
  const q = (terms && terms.length ? terms.slice(0, 3).join(' ') : 'robot AI chip');
  return `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&mkt=vi-VN`;
};

function buildSources(s = getSettings()) {
  const list = s.feeds.filter((f) => f.enabled !== false && f.url).map((f) => ({ ...f, kind: 'rss' }));
  if (s.gnewsEnabled && s.gnewsTerms?.length) {
    list.unshift({
      id: 'gnews', name: 'Tin tổng hợp VN', kind: 'rss', group: 'vn', lang: 'vi',
      url: 'https://www.bing.com/news/search?q=robot+AI+chip&format=rss&mkt=vi-VN',
    });
  }
  if (s.githubEnabled && s.githubTopics?.length) {
    list.push({ id: 'github', name: 'GitHub Trending 7 ngày', kind: 'github', group: 'github', lang: 'en', topics: s.githubTopics });
  }
  return list;
}

/* ---------- Resilient RSS fetcher ---------- */
const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
const XML_PROXIES = [
  ['allorigins', (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`],
  ['codetabs', (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`],
];

let rss2jsonCoolUntil = 0;
let localProxyOk = null; // null = chưa kiểm tra, true = có server.py, false = static host

function apiBase() {
  return (getSettings().workerUrl || '').trim().replace(/\/+$/, '');
}

async function viaLocalProxy(url) {
  const base = apiBase();
  const r = await fetchWithTimeout(`${base}/api/rss?url=${encodeURIComponent(url)}`, {}, 10000);
  if (r.status === 404 || r.status === 405) {
    if (!base) localProxyOk = false;
    throw new Error('không có /api/rss');
  }
  if (!r.ok) throw new Error(`proxy HTTP ${r.status}`);
  localProxyOk = true;
  return parseFeedXML(await r.text());
}

async function viaRss2json(url) {
  if (Date.now() < rss2jsonCoolUntil) throw new Error('rss2json đang tạm nghỉ do rate-limit');
  const r = await fetchWithTimeout(RSS2JSON + encodeURIComponent(url), {}, 6500);
  if (r.status === 429) {
    rss2jsonCoolUntil = Date.now() + 60 * 1000;
    throw new Error('HTTP 429 (rate-limit)');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.status !== 'ok' || !Array.isArray(j.items)) throw new Error(j.message || 'rss2json lỗi');
  return j.items.map((it) => ({
    title: it.title, link: it.link || it.guid, date: it.pubDate, desc: it.description || it.content || '',
  }));
}

export function parseFeedXML(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML không hợp lệ');
  const get = (el, tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const rssItems = Array.from(doc.getElementsByTagName('item'));
  if (rssItems.length) {
    return rssItems.map((n) => ({
      title: get(n, 'title'),
      link: get(n, 'link') || get(n, 'guid'),
      date: get(n, 'pubDate') || get(n, 'dc:date'),
      desc: get(n, 'description') || get(n, 'content:encoded'),
    }));
  }
  const entries = Array.from(doc.getElementsByTagName('entry'));
  if (!entries.length) throw new Error('Không có mục tin');
  return entries.map((n) => {
    const links = Array.from(n.getElementsByTagName('link'));
    const alt = links.find((l) => !l.getAttribute('rel') || l.getAttribute('rel') === 'alternate') || links[0];
    return {
      title: get(n, 'title'), link: alt?.getAttribute('href') || '',
      date: get(n, 'updated') || get(n, 'published'), desc: get(n, 'summary') || get(n, 'content'),
    };
  });
}

export async function fetchRSS(url, preferXml = false) {
  const errors = [];
  if (localProxyOk !== false) {
    try {
      return { via: 'direct', items: await viaLocalProxy(url) };
    } catch (e) { errors.push(`direct: ${e.message}`); }
  }
  if (!preferXml && Date.now() >= rss2jsonCoolUntil) {
    try {
      return { via: 'rss2json', items: await viaRss2json(url) };
    } catch (e) { errors.push(`rss2json: ${e.message}`); }
  }
  try {
    return await Promise.any(XML_PROXIES.map(async ([name, proxy]) => {
      const r = await fetchWithTimeout(proxy(url), {}, 8500);
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      const xml = await r.text();
      return { via: name, items: parseFeedXML(xml) };
    }));
  } catch (agg) {
    const list = agg?.errors ? agg.errors.map((x) => x.message) : [agg.message];
    throw new Error([...errors, ...list].join(' | '));
  }
}

function parseDate(s) {
  if (!s) return Date.now();
  if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s)) return Date.parse(`${s.replace(' ', 'T')}Z`);
  const t = Date.parse(s);
  return Number.isNaN(t) ? Date.now() : t;
}

function normalize(raw, src) {
  let title = stripHTML(raw.title);
  let desc = stripHTML(raw.desc);
  let source = src.name;
  const link = String(raw.link || '').trim();
  if (src.id === 'gnews') {
    const m = title.match(/^(.*\S)\s+-\s+([^-]+)$/);
    if (m) { title = m[1]; source = m[2].trim(); }
    desc = '';
  }
  if (/arxiv\.org/.test(src.url || '')) {
    desc = desc.replace(/^.*?Abstract:\s*/i, '');
    title = title.replace(/\s*\(arXiv:[^)]*\)\s*$/i, '');
  }
  if (desc && title && desc.toLowerCase().startsWith(title.toLowerCase())) desc = desc.slice(title.length).trim();
  desc = desc.replace(/\s*The post .* appeared first on .*$/i, '').replace(/\[…\]|\[\.\.\.\]/g, '…');
  return {
    id: hash(link || title), title, link, desc: clip(desc, 260), ts: parseDate(raw.date),
    source, srcId: src.id, group: src.group, lang: src.lang, kind: 'rss',
  };
}

/* ---------- GitHub API ---------- */
async function fetchGitHub(topics) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const results = await Promise.allSettled(topics.map(async (t) => {
    const q = encodeURIComponent(`topic:${t} pushed:>=${since}`);
    const j = await fetchJSON(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=6`,
      { headers: { Accept: 'application/vnd.github+json' } }, 12000);
    return { t, list: j.items || [] };
  }));
  const map = new Map();
  let ok = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    ok++;
    for (const repo of r.value.list) {
      if (map.has(repo.full_name)) continue;
      map.set(repo.full_name, {
        id: hash(repo.html_url), title: repo.full_name, link: repo.html_url,
        desc: clip(repo.description || '', 240), ts: Date.parse(repo.pushed_at) || Date.now(),
        source: 'GitHub', srcId: 'github', group: 'github', lang: 'en', kind: 'repo',
        stars: repo.stargazers_count, language: repo.language || '', topic: r.value.t,
        topics: (repo.topics || []).slice(0, 6),
      });
    }
  }
  if (!ok) {
    const err = results.find((r) => r.status === 'rejected')?.reason;
    throw new Error(err?.message === 'HTTP 403' ? 'GitHub giới hạn tốc độ (403) — thử lại sau ít phút' : err?.message || 'GitHub lỗi');
  }
  return [...map.values()];
}

/* ==========================================================================
   DỊCH CHUYÊN NGÀNH CƠ ĐIỆN TỬ TỰ ĐỘNG (EN → VI) + GLOSSARY SHIELD
   ========================================================================== */

const KEEP_TERMS = [
  'STM32F\\d+\\w*', 'STM32', 'ESP32[-\\w]*', 'ESP8266', 'RP2040', 'RP2350', 'ATmega\\d+\\w*',
  'ROS\\s?2', 'FreeRTOS', 'Zephyr', 'MicroPython', 'CircuitPython', 'Arduino', 'Raspberry\\s?Pi',
  'SimpleFOC', 'BLDC', 'PMSM', 'SVPWM', 'MOSFET', 'IGBT', 'FPGA', 'ASIC', 'RISC-V',
  'LiDAR', 'SLAM', 'Nav2', 'Gazebo', 'Isaac\\s?Sim', 'MuJoCo',
  'UART', 'USART', 'I2C', 'I²C', 'SPI', 'CAN\\s?FD', 'CAN-FD', 'RS-485', 'RS485', 'Modbus', 'EtherCAT', 'PROFINET',
  'PWM', 'ADC', 'DAC', 'DMA', 'GPIO', 'SWD', 'JTAG', 'USB-C', 'PCB', 'PCBA', 'SMD', 'SMT',
  'FOC', 'PID', 'PLC', 'CNC', 'CAD', 'CAM', 'MCU', 'SoC', 'IMU', 'LDO', 'RTOS', 'BOM', 'EMI', 'ESD',
];
const KEEP_RE = new RegExp(`\\b(${KEEP_TERMS.join('|')})\\b`, 'g');

const POST_FIXES = [
  [/\bbộ vi điều khiển\b/gi, 'vi điều khiển'],
  [/\bbộ điều khiển vi mô\b/gi, 'vi điều khiển'],
  [/\bbảng mạch in\b/gi, 'mạch PCB'],
  [/\bphần mềm cơ sở\b/gi, 'firmware'],
  [/\bchương trình cơ sở\b/gi, 'firmware'],
  [/\bbộ mã hóa\b/gi, 'encoder'],
  [/\bđộng cơ không chổi than\b/gi, 'động cơ không chổi than (BLDC)'],
  [/\bnguồn mở\b/gi, 'mã nguồn mở'],
  [/\bđiều chế độ rộng xung\b/gi, 'PWM'],
];

let trCache = store.get('trCache', {});
const trPending = new Set();

function saveTrCache() {
  const keys = Object.keys(trCache);
  if (keys.length > 250) {
    keys.slice(0, keys.length - 200).forEach((k) => { delete trCache[k]; });
  }
  store.set('trCache', trCache);
}

/** Dịch một đoạn tiếng Anh sang tiếng Việt giữ đúng thuật ngữ Cơ điện tử */
export async function translateEnToVi(text) {
  if (!text || !text.trim()) return '';
  const saved = [];
  const shielded = text.replace(KEEP_RE, (m) => {
    const idx = saved.length;
    saved.push(m);
    return `ZZX${idx}ZZ`;
  });
  const directUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(shielded)}`;
  const base = apiBase();
  let data;
  try {
    data = await fetchJSON(directUrl, {}, 7000);
  } catch (e) {
    if (base) data = await fetchJSON(`${base}/api/translate?q=${encodeURIComponent(shielded)}`, {}, 8000);
    else throw e;
  }
  let out = Array.isArray(data?.[0]) ? data[0].map((seg) => seg[0] || '').join('') : text;
  out = out.replace(/ZZX\s*(\d+)\s*ZZ/gi, (_, i) => saved[Number(i)] ?? '');
  for (const [re, rep] of POST_FIXES) out = out.replace(re, rep);
  return out.replace(/\s+/g, ' ').trim();
}

async function translateVisibleBatch(list) {
  if (!navigator.onLine) return;
  const targets = list.filter((it) => it.lang === 'en' && !trCache[it.id] && !trPending.has(it.id)).slice(0, 24);
  if (!targets.length) return;

  targets.forEach((it) => trPending.add(it.id));
  let changed = false;

  for (let i = 0; i < targets.length; i += 3) {
    const slice = targets.slice(i, i + 3);
    await Promise.allSettled(slice.map(async (it) => {
      try {
        if (it.kind === 'repo') {
          const dVi = it.desc ? await translateEnToVi(it.desc) : '';
          trCache[it.id] = { titleVi: `${it.title}${dVi ? ` — ${clip(dVi, 95)}` : ''}`, descVi: dVi };
        } else {
          const [tVi, dVi] = await Promise.all([
            translateEnToVi(it.title),
            it.desc ? translateEnToVi(clip(it.desc, 190)) : Promise.resolve(''),
          ]);
          trCache[it.id] = { titleVi: tVi || it.title, descVi: dVi || it.desc };
        }
        changed = true;
      } catch (e) {
        console.warn('[translate] lỗi dịch:', e.message);
      } finally {
        trPending.delete(it.id);
      }
    }));
    if (changed) {
      saveTrCache();
      render(false);
    }
  }
}

export function getDisplayText(it) {
  if (it.lang !== 'en') return { title: it.title, desc: it.desc, translated: false };
  const tr = trCache[it.id];
  if (!tr) return { title: it.title, desc: it.desc, translated: false };
  return { title: tr.titleVi || it.title, desc: tr.descVi || it.desc, translated: true };
}

/* ---------- Radar ---------- */
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const radarCache = new Map();
function radarRegex(k) {
  if (!radarCache.has(k)) {
    const tail = /\d$/.test(k) ? '' : '(?=$|[^\\p{L}\\p{N}])';
    radarCache.set(k, new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(k)}${tail}`, 'iu'));
  }
  return radarCache.get(k);
}
export function radarMatches(item, keywords = getSettings().radar) {
  const hay = `${item.title} ${item.desc || ''} ${(item.topics || []).join(' ')} ${item.topic || ''}`;
  return keywords.filter((k) => k && radarRegex(k).test(hay));
}

/** Sắp xếp: ƯU TIÊN TIN TIẾNG VIỆT trước, sau đó đến khớp Radar, rồi mới nhất */
function sorted(list) {
  const kw = getSettings().radar;
  return list
    .map((it) => ({ ...it, radar: radarMatches(it, kw) }))
    .sort((a, b) => {
      const aVi = a.lang === 'vi' ? 1 : 0;
      const bVi = b.lang === 'vi' ? 1 : 0;
      if (aVi !== bVi) return bVi - aVi;
      const aR = a.radar.length > 0 ? 1 : 0;
      const bR = b.radar.length > 0 ? 1 : 0;
      if (aR !== bR) return bR - aR;
      return b.ts - a.ts;
    });
}

/** 5 tiêu đề ưu tiên cho Tab 1 & TTS: ưu tiên tiếng Việt kỹ thuật trước + khớp Radar */
export function topHeadlines(n = 5) {
  const kw = getSettings().radar;
  const scored = items.map((it) => {
    const radar = radarMatches(it, kw);
    const tech = isTechItem({ ...it, radar });
    const score = (tech ? 8 : 0) + (it.lang === 'vi' ? 4 : 0) + (radar.length ? 2 : 0) + (it.kind === 'rss' ? 1 : 0);
    const disp = getDisplayText(it);
    return { ...it, radar, score, titleVi: disp.title, descVi: disp.desc, translated: disp.translated };
  });
  scored.sort((a, b) => b.score - a.score || b.ts - a.ts);
  const out = [];
  const per = {};
  for (const it of scored) {
    if ((per[it.srcId] || 0) >= 2) continue;
    per[it.srcId] = (per[it.srcId] || 0) + 1;
    out.push(it);
    if (out.length >= n) break;
  }
  return out;
}

/* ---------- Tải & gộp ---------- */
async function loadSource(src, force) {
  const ck = `feed:${src.id}`;
  const cached = cacheGet(ck);
  const ttl = src.kind === 'github' ? 30 * 60e3 : 10 * 60e3;
  if (!force && isFresh(cached, ttl)) {
    sourceStatus[src.id] = { ok: true, via: 'cache', count: cached.data.length, ts: cached.ts, name: src.name };
    return;
  }
  try {
    let list, via;
    if (src.kind === 'github') {
      list = await fetchGitHub(src.topics);
      via = 'api.github.com';
    } else {
      const r = await fetchRSS(src.url);
      via = r.via;
      list = r.items.map((x) => normalize(x, src)).filter((x) => x.title && x.link).slice(0, 20);
    }
    if (!list.length) throw new Error('Nguồn trả về rỗng');
    cacheSet(ck, list);
    sourceStatus[src.id] = { ok: true, via, count: list.length, ts: Date.now(), name: src.name };
    rebuild();
    render(true);
  } catch (e) {
    console.warn(`[feeds] ${src.name} lỗi:`, e.message);
    sourceStatus[src.id] = { ok: false, error: e.message, name: src.name, ts: cached?.ts, count: cached?.data?.length || 0 };
  }
}

function rebuild() {
  const seen = new Set();
  const all = [];
  for (const src of buildSources()) {
    const c = cacheGet(`feed:${src.id}`);
    if (!c) continue;
    for (const it of c.data) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      all.push(it);
    }
  }
  items = all;
}

export function refresh(force = false) {
  if (inflight) return inflight;
  inflight = (async () => {
    const sources = buildSources();
    sync.begin('feeds');
    let rssDelay = 0;
    await Promise.allSettled(sources.map(async (s) => {
      if (s.kind === 'rss') {
        const d = rssDelay;
        rssDelay += 750;
        if (d) await new Promise((r) => setTimeout(r, d));
      }
      return loadSource(s, force);
    }));
    rebuild();
    render(true);
    const okCount = sources.filter((s) => sourceStatus[s.id]?.ok).length;
    sync.end('feeds', okCount > 0);
  })().finally(() => { inflight = null; });
  return inflight;
}

/* ---------- Render ---------- */
const STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const SPEAK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const AI_READ_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';

function newsCard(it) {
  const read = readSet.has(it.id);
  const bm = isBookmarked(it.id);
  const hasKey = !!getSettings().geminiKey;
  const disp = getDisplayText(it);
  const radarBadge = it.radar.length ? '<span class="radar-badge">RADAR</span>' : '';
  const trBadge = disp.translated ? '<span class="tr-badge">🇻🇳 Đã dịch</span>' : (it.lang === 'en' ? '<span class="tag">EN</span>' : '');
  const extra = it.kind === 'repo'
    ? `<span class="stars">★ ${it.stars?.toLocaleString('en-US')}</span>${it.language ? `<span class="tag">${esc(it.language)}</span>` : ''}`
    : '';
  const kwChips = it.radar.map((k) => `<span class="tag cyan">${esc(k)}</span>`).join('');
  return `
  <article class="card news-card${read ? ' read' : ''}${it.radar.length ? ' radar' : ''}" data-nid="${it.id}">
    <div class="news-meta">
      <span class="src-badge g-${esc(it.group)}">${esc(it.source)}</span>
      ${radarBadge}${trBadge}${extra}
      <span class="time">· ${esc(timeAgo(it.ts))}</span>
    </div>
    <a class="news-title" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer" data-open="${it.id}">${esc(disp.title)}</a>
    ${disp.translated && it.kind !== 'repo' ? `<div class="news-orig">Gốc: ${esc(it.title)}</div>` : ''}
    ${disp.desc ? `<p class="news-desc">${esc(disp.desc)}</p>` : ''}
    <div class="news-actions">
      <div class="chips">${kwChips}</div>
      <div style="display:flex;gap:6px;flex:none">
        ${hasKey ? `<button class="bm-btn" data-ai-read="${it.id}" aria-label="AI đọc hộ bài này" title="AI Đọc hộ & Tóm tắt">${AI_READ_SVG}</button>` : ''}
        <button class="bm-btn" data-speak-item="${it.id}" aria-label="Nghe nhanh tin này" title="Nghe nhanh">${SPEAK_SVG}</button>
        <button class="bm-btn${bm ? ' on' : ''}" data-bm="${it.id}" aria-label="${bm ? 'Đã lưu' : 'Lưu bài'}">${STAR_SVG}</button>
      </div>
    </div>
  </article>`;
}

function isTechItem(it) {
  if (!getSettings().techOnly) return true;
  if (!GENERAL_VN_IDS.has(it.srcId)) return true;
  if (it.radar?.length) return true;
  return TECH_PURE_RE.test(`${it.title} ${it.desc || ''}`);
}

function passFilter(it) {
  if (!isTechItem(it)) return false;
  switch (filter) {
    case 'all': return true;
    case 'radar': return it.radar.length > 0;
    case 'unread': return !readSet.has(it.id);
    default: return it.group === filter;
  }
}

export function render(triggerTranslate = true) {
  const list = sorted(items);
  const counts = {
    all: list.length, radar: list.filter((i) => i.radar.length).length,
    unread: list.filter((i) => !readSet.has(i.id)).length,
  };
  for (const g of Object.keys(GROUPS)) counts[g] = list.filter((i) => i.group === g).length;
  $('#news-filters').innerHTML = FILTERS.map(([k, label]) =>
    `<button class="chip${filter === k ? ' active' : ''}" data-filter="${k}">${label} <span class="count">${counts[k] ?? 0}</span></button>`).join('');

  const shown = list.filter(passFilter).slice(0, 150);
  const box = $('#news-list');
  if (!items.length) {
    if (!inflight) box.innerHTML = '<div class="card empty"><span class="big">📭</span>Chưa có tin. Kiểm tra kết nối mạng rồi bấm "Tải lại nguồn".</div>';
  } else if (!shown.length) {
    box.innerHTML = '<div class="card empty"><span class="big">🔍</span>Không có tin nào trong bộ lọc này.</div>';
  } else {
    box.innerHTML = shown.map(newsCard).join('');
  }

  renderToday();
  renderStatus();
  $('#ai-btn').hidden = !getSettings().geminiKey;
  tts.refreshHighlight();

  if (triggerTranslate) {
    // Luôn lọc riêng các bài tiếng Anh để không bị danh sách tin tiếng Việt ở đầu che mất
    const enItems = shown.filter((i) => i.lang === 'en').slice(0, 24);
    const needTr = [...topHeadlines(5), ...enItems];
    translateVisibleBatch(needTr);
  }
}

function renderToday() {
  const ol = $('#today-news');
  const top = topHeadlines(5);
  if (!top.length) {
    if (!inflight) ol.innerHTML = '<li><div class="hl-body muted small">Chưa tải được tin — sẽ tự đồng bộ khi có mạng.</div></li>';
    return;
  }
  ol.innerHTML = top.map((it) => `
    <li data-nid="${it.id}">
      <div class="hl-body">
        <a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer" data-open="${it.id}">${esc(it.titleVi)}</a>
        <div class="meta">
          <span class="g-${esc(it.group)}" style="font-weight:700">${esc(it.source)}</span>
          ${it.radar.length ? '<span class="radar-badge">RADAR</span>' : ''}
          ${it.translated ? '<span class="tr-badge">Đã dịch</span>' : ''}
          <span class="mono">${esc(timeAgo(it.ts))}</span>
        </div>
      </div>
    </li>`).join('');
}

function renderStatus() {
  const sources = buildSources();
  const okN = sources.filter((s) => sourceStatus[s.id]?.ok).length;
  $('#source-summary').textContent = inflight && !Object.keys(sourceStatus).length
    ? 'Đang tải…'
    : `${okN}/${sources.length} nguồn hoạt động · ${items.length} mục (ưu tiên VN)`;
  $('#source-status').innerHTML = `<ul>${sources.map((s) => {
    const st = sourceStatus[s.id];
    if (!st) return `<li><span>${esc(s.name)}</span><span class="muted">đang chờ…</span></li>`;
    return st.ok
      ? `<li><span>${esc(s.name)}</span><span class="ok mono">✓ ${st.count} · ${esc(st.via)}</span></li>`
      : `<li><span>${esc(s.name)}</span><span class="err" title="${esc(st.error)}">✗ ${st.count ? `cache ${st.count}` : 'lỗi'}</span></li>`;
  }).join('')}</ul>
  <p class="small dim" style="margin:8px 0 0">Tin tiếng Việt được ưu tiên lên đầu. Tin tiếng Anh được tự động dịch chuyên ngành Cơ điện tử (giữ nguyên thuật ngữ STM32, ESP32, ROS 2, FOC, PID, PLC...).</p>`;
}

function markRead(id) {
  if (readSet.has(id)) return;
  readSet.add(id);
  store.set('read', [...readSet].slice(-600));
  $$(`[data-nid="${id}"]`).forEach((el) => el.classList.add('read'));
}

const findItem = (id) => items.find((i) => i.id === id);

/* ---------- Gemini BYOK ---------- */
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-pro-preview'];
const GEMINI_PRO_MODELS = ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const NON_TEXT_MODEL_RE = /(image|tts|audio|live|embed|lyria|veo|banana|imagen|aqa|robotics|computer-use)/i;

async function tryGeminiModel(model, cleanKey, prompt, inlineImage = null) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
  const parts = [{ text: prompt }];
  if (inlineImage?.data) {
    parts.push({ inline_data: { mime_type: inlineImage.mimeType || 'image/jpeg', data: inlineImage.data } });
  }
  const r = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
    }),
  }, 40000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || `HTTP ${r.status}`;
    if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(msg)) {
      throw new Error(`API_KEY_INVALID: ${msg}`);
    }
    throw new Error(msg);
  }
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('rỗng');
  return text;
}

async function discoverModels(cleanKey, pattern = /flash/i) {
  try {
    const j = await fetchJSON(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`, {}, 10000);
    return (j.models || [])
      .filter((m) => {
        const id = (m.name || '').replace(/^models\//, '');
        return (m.supportedGenerationMethods || []).includes('generateContent')
          && /^gemini-/i.test(id)
          && !NON_TEXT_MODEL_RE.test(id)
          && pattern.test(id);
      })
      .map((m) => m.name.replace(/^models\//, ''))
      .reverse();
  } catch (_) {
    return [];
  }
}

export async function callGemini(key, prompt, inlineImage = null) {
  const cleanKey = String(key || '').trim();
  const tried = new Set();
  const errors = [];
  const runList = async (models) => {
    for (const model of models) {
      if (tried.has(model)) continue;
      tried.add(model);
      try {
        return await tryGeminiModel(model, cleanKey, prompt, inlineImage);
      } catch (e) {
        if (String(e.message).startsWith('API_KEY_INVALID')) throw e;
        errors.push(`${model}: ${e.message}`);
      }
    }
    return null;
  };
  const first = await runList(GEMINI_MODELS);
  if (first) return first;
  const dynamic = await discoverModels(cleanKey, /flash/i);
  const second = await runList(dynamic.slice(0, 3));
  if (second) return second;
  throw new Error(errors.join(' | ') || 'Không gọi được Gemini API');
}

/** Gọi model Gemini MẠNH NHẤT (ưu tiên dòng Pro cho chẩn đoán kỹ thuật chuyên sâu, tự dò Pro mới nhất) */
export async function callGeminiPro(key, prompt, inlineImage = null) {
  const cleanKey = String(key || '').trim();
  const tried = new Set();
  const errors = [];
  const runList = async (models) => {
    for (const model of models) {
      if (tried.has(model)) continue;
      tried.add(model);
      try {
        const text = await tryGeminiModel(model, cleanKey, prompt, inlineImage);
        return { text, model };
      } catch (e) {
        if (String(e.message).startsWith('API_KEY_INVALID')) throw e;
        errors.push(`${model}: ${e.message}`);
      }
    }
    return null;
  };
  // Ưu tiên danh sách model text Pro/Flash chuẩn trước, sau đó mới tự dò thêm model text Gemini sạch
  const first = await runList(GEMINI_PRO_MODELS);
  if (first) return first;
  const discovered = await discoverModels(cleanKey, /(pro|flash)/i);
  const second = await runList(discovered.slice(0, 4));
  if (second) return second;
  throw new Error(errors.join(' | ') || 'Không gọi được Gemini Pro API');
}

function parseBullets(text) {
  return text.split('\n')
    .map((l) => l.trim().replace(/^([-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, ''))
    .filter((l) => l.length > 8)
    .slice(0, 5);
}

function renderAI() {
  const box = $('#ai-box');
  const c = store.get('aiSummary');
  if (!c) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <div class="card-head"><div class="card-title">✨ AI tóm tắt kỹ thuật</div><span class="tag mono">${esc(timeAgo(c.ts))}</span></div>
    <ul>${c.bullets.map((b, i) => `<li id="ai-b-${i}">${esc(b)}</li>`).join('')}</ul>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn sm primary" id="ai-speak">🔊 Đọc bản tóm tắt</button>
      <button class="btn sm ghost" id="ai-close">Ẩn</button>
    </div>`;
  $('#ai-speak').onclick = () => tts.playCustom(
    [{ text: 'Sau đây là 5 điểm tin kỹ thuật được AI tổng hợp.', sel: null },
      ...c.bullets.map((b, i) => ({ text: b, sel: `#ai-b-${i}` }))]);
  $('#ai-close').onclick = () => { box.hidden = true; };
}

async function aiSummarize() {
  const key = getSettings().geminiKey;
  if (!key) return;
  if (!items.length) { toast('Chưa có tin để tóm tắt'); return; }
  const btn = $('#ai-btn');
  const box = $('#ai-box');
  btn.disabled = true;
  box.hidden = false;
  box.innerHTML = '<div class="card-title">✨ Gemini đang dịch & tóm tắt…</div><div class="skel skel-line"></div><div class="skel skel-line" style="width:85%"></div><div class="skel skel-line" style="width:70%"></div>';
  const kw = getSettings().radar;
  const top = sorted(items).slice(0, 25)
    .map((it, i) => `${i + 1}. [${it.source}] ${it.title}${it.desc ? ` — ${clip(it.desc, 180)}` : ''}`).join('\n');
  const prompt = `Bạn là biên tập viên kỹ thuật chuyên ngành Cơ điện tử (nhúng, robotics, tự động hóa, điện tử công suất).
Dưới đây là danh sách tin. Yêu cầu:
1) Dịch sang tiếng Việt tự nhiên, GIỮ ĐÚNG thuật ngữ chuyên ngành (MCU, PWM, FOC, ROS 2, PLC, LiDAR, BLDC, SoC, RISC-V, PID, encoder...).
2) Gộp tin trùng, ưu tiên tin Việt Nam và tin khớp từ khóa: ${kw.join(', ')}.
3) Trả về ĐÚNG 5 gạch đầu dòng súc tích (≤ 35 từ/dòng), bắt đầu bằng "- ".

DANH SÁCH TIN:
${top}`;
  try {
    const bullets = parseBullets(await callGemini(key, prompt));
    if (!bullets.length) throw new Error('Không phân tích được kết quả');
    store.set('aiSummary', { ts: Date.now(), bullets });
    renderAI();
  } catch (e) {
    const msg = /API_KEY_INVALID|API key not valid/i.test(e.message)
      ? 'Gemini API Key không hợp lệ — hãy kiểm tra lại chuỗi AIzaSy… trong Cài đặt.'
      : `Lỗi AI: ${e.message}`;
    box.innerHTML = `<div class="card-title">✨ AI tóm tắt</div><p class="small" style="color:var(--red)">${esc(msg)}</p>`;
  } finally {
    btn.disabled = false;
  }
}

/** AI Đọc hộ toàn văn 1 bài báo (lấy qua /api/article nếu có, tóm gọn ý kỹ thuật + đọc thành tiếng) */
async function readArticleWithAI(it) {
  const key = getSettings().geminiKey;
  if (!key) { toast('Hãy nhập Gemini API Key trong Cài đặt trước'); return; }
  const disp = getDisplayText(it);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `
    <div class="sheet" style="max-height:84vh;display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="AI Đọc hộ bài báo">
      <div class="grab"></div>
      <h3>📖 AI Đọc hộ &amp; Tóm tắt</h3>
      <p style="font-weight:600;color:var(--text-strong)">${esc(disp.title)}</p>
      <div id="airead-body" style="overflow-y:auto;flex:1;min-height:120px">
        <div class="skel skel-line"></div><div class="skel skel-line" style="width:85%"></div><div class="skel skel-line" style="width:70%"></div>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn primary" id="airead-speak" disabled>🔊 Nghe tóm tắt</button>
        <a class="btn" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">Mở bài gốc</a>
        <button class="btn ghost" data-close>Đóng</button>
      </div>
    </div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove(); });
  document.body.appendChild(wrap);

  let articleText = '';
  try {
    const base = apiBase();
    const r = await fetchJSON(`${base}/api/article?url=${encodeURIComponent(it.link)}`, {}, 12000);
    if (r?.text && r.text.length > 120) articleText = r.text;
  } catch (_) { /* fallback dùng tiêu đề + mô tả RSS */ }

  const sourceText = articleText || `${it.title}\n${it.desc || ''}`;
  const prompt = `Bạn là trợ lý kỹ thuật Cơ điện tử đọc báo hộ cho Hiếu.
Hãy đọc nội dung bài viết sau và tóm tắt bằng tiếng Việt (giữ đúng thuật ngữ chuyên ngành như STM32, ESP32, ROS 2, FOC, PID, PLC, PWM, MOSFET...):
- Dòng 1: 1 câu chốt bài này nói về cái gì.
- 3 gạch đầu dòng ("- "): các ý kỹ thuật cốt lõi / thông số quan trọng nhất.
- Dòng cuối: 1 câu nhận xét ứng dụng thực tế (nếu có).
Không dùng dấu sao ** đậm nhạt.

TIÊU ĐỀ: ${it.title}
NGUỒN: ${it.source}
NỘI DUNG:
${sourceText.slice(0, 5000)}`;

  try {
    const raw = await callGemini(key, prompt);
    const lines = raw.split('\n').map((l) => l.trim().replace(/\*\*/g, '')).filter((l) => l.length > 4);
    wrap.querySelector('#airead-body').innerHTML = `
      <div class="result" style="font-family:var(--font);font-size:14px;line-height:1.55">
        ${lines.map((l) => `<p style="margin:6px 0">${esc(l)}</p>`).join('')}
      </div>
      <p class="tiny muted" style="margin-top:6px">${articleText ? '✓ Đã đọc toàn văn bài báo gốc' : 'ℹ Tóm tắt từ mô tả RSS'}</p>`;
    const spkBtn = wrap.querySelector('#airead-speak');
    spkBtn.disabled = false;
    spkBtn.onclick = () => {
      tts.playCustom([
        { text: `Tóm tắt bài viết từ ${it.source}: ${disp.title}.`, display: disp.title, sel: null },
        ...lines.map((l) => ({ text: l.replace(/^[-•*]\s*/, ''), display: l, sel: null })),
      ]);
      toast('🎙️ Đang đọc tóm tắt bài viết…');
    };
  } catch (e) {
    wrap.querySelector('#airead-body').innerHTML = `<p class="small" style="color:var(--red)">Lỗi AI: ${esc(e.message)}</p>`;
  }
}

/** Biên tập Podcast AI Sáng nay hoàn chỉnh dành cho Hiếu (có cache trong ngày) */
export async function buildAIPodcast(weatherText = '', force = false) {
  const key = getSettings().geminiKey;
  if (!key) throw new Error('Chưa nhập Gemini API Key trong Cài đặt.');
  const todayKey = new Date().toISOString().slice(0, 10);
  const cached = store.get('podcastCache');
  if (!force && cached && cached.day === todayKey && Array.isArray(cached.segments) && cached.segments.length) {
    return cached.segments;
  }
  const kw = getSettings().radar;
  const top = sorted(items).filter(isTechItem).slice(0, 16)
    .map((it, i) => `${i + 1}. [${it.source}] ${getDisplayText(it).title}${it.desc ? ` — ${clip(getDisplayText(it).desc, 140)}` : ''}`).join('\n');
  if (!top) throw new Error('Chưa có tin tức nào để tổng hợp — hãy bấm ↻ tải tin trước.');

  const h = new Date().getHours();
  const buoi = h < 11 ? 'buổi sáng' : h < 14 ? 'buổi trưa' : h < 18 ? 'buổi chiều' : 'buổi tối';
  const prompt = `Bạn là phát thanh viên bản tin công nghệ Cơ điện tử nói chuyện tự nhiên, thân thiện với Hiếu vào ${buoi}.
Hãy tổng hợp dữ liệu thời tiết và danh sách tin bên dưới thành ĐÚNG 6 ĐOẠN NGẮN (mỗi đoạn trên 1 dòng riêng, mỗi đoạn 25–45 từ, KHÔNG đánh số, KHÔNG dùng dấu sao hay gạch đầu dòng):
- Đoạn 1: Chào ${buoi} Hiếu + tóm tắt ngắn thời tiết và cảnh báo ẩm bo mạch/nhựa in 3D hôm nay.
- Đoạn 2 đến Đoạn 5: 4 tin kỹ thuật quan trọng nhất trong ngày (ưu tiên tin Việt Nam và các từ khóa ${kw.join(', ')}), gộp tin trùng, giải thích ngắn gọn tại sao đáng chú ý.
- Đoạn 6: Lời kết ngắn gọn chúc Hiếu học tập và làm đồ án hiệu quả.

THỜI TIẾT HÔM NAY:
${weatherText || 'Chưa có dữ liệu thời tiết.'}

DANH SÁCH TIN TRONG NGÀY:
${top}`;

  const raw = await callGemini(key, prompt);
  const lines = raw.split('\n')
    .map((l) => l.trim().replace(/^([-*•]|\d+[.)]|Đoạn\s*\d+:?)\s*/i, '').replace(/\*\*/g, ''))
    .filter((l) => l.length > 15)
    .slice(0, 7);
  if (!lines.length) throw new Error('AI không tạo được kịch bản podcast.');
  const segments = lines.map((text, i) => ({
    text,
    display: text,
    sel: i === 0 ? '#wx-card' : '#tts-card',
  }));
  store.set('podcastCache', { day: todayKey, ts: Date.now(), segments });
  return segments;
}

/* ---------- Khởi tạo ---------- */
export function init() {
  rebuild();
  if (items.length) render(true);
  renderAI();

  $('#news-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    render(true);
  });

  document.addEventListener('click', async (e) => {
    const open = e.target.closest('a[data-open]');
    if (open) { markRead(open.dataset.open); return; }
    const airead = e.target.closest('[data-ai-read]');
    if (airead) {
      const it = findItem(airead.dataset.aiRead);
      if (it) readArticleWithAI(it);
      return;
    }
    const spk = e.target.closest('[data-speak-item]');
    if (spk) {
      const it = findItem(spk.dataset.speakItem);
      if (!it) return;
      const disp = getDisplayText(it);
      const body = disp.desc ? `${disp.title}. ${disp.desc}` : disp.title;
      tts.playCustom([{ text: `Tin từ ${it.source}: ${body}`, display: disp.title, sel: `[data-nid="${it.id}"]` }]);
      toast('🎙️ Đang đọc nhanh bài viết…');
      return;
    }
    const bmb = e.target.closest('[data-bm]');
    if (bmb) {
      const it = findItem(bmb.dataset.bm);
      if (!it) return;
      const disp = getDisplayText(it);
      const res = await openBookmarkDialog({ ...it, title: disp.title });
      if (res) {
        const on = isBookmarked(it.id);
        $$(`[data-bm="${it.id}"]`).forEach((b) => b.classList.toggle('on', on));
      }
    }
  });

  const techBtn = $('#news-tech-only');
  const syncTechBtn = () => {
    if (!techBtn) return;
    const on = getSettings().techOnly;
    techBtn.classList.toggle('primary', on);
    techBtn.textContent = on ? '⚙ Kỹ thuật thuần: BẬT' : '⚙ Kỹ thuật thuần: TẮT';
  };
  syncTechBtn();
  techBtn?.addEventListener('click', () => {
    const cur = getSettings().techOnly;
    import('./storage.js').then((m) => m.saveSettings({ techOnly: !cur }));
    syncTechBtn();
    render(false);
  });

  $('#news-refresh').addEventListener('click', () => { refresh(true); toast('Đang tải lại các nguồn tin…'); });
  $('#ai-btn').addEventListener('click', aiSummarize);

  window.addEventListener('settings-changed', (e) => {
    const k = e.detail.keys;
    if (k.includes('radar') || k.includes('techOnly')) { radarCache.clear(); syncTechBtn(); render(false); }
    if (k.includes('workerUrl')) { localProxyOk = null; refresh(true); }
    if (k.some((x) => ['feeds', 'gnewsTerms', 'gnewsEnabled', 'githubTopics', 'githubEnabled'].includes(x))) {
      sourceStatus = {};
      rebuild();
      render(true);
      refresh(true);
    }
    if (k.includes('geminiKey')) $('#ai-btn').hidden = !e.detail.settings.geminiKey;
  });
  window.addEventListener('bookmarks-changed', () => {
    $$('[data-bm]').forEach((b) => b.classList.toggle('on', isBookmarked(b.dataset.bm)));
  });
}

export const getItems = () => items;
