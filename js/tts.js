// tts.js — Bản tin âm thanh chuyên nghiệp: hỗ trợ Cloud Neural Voices (Hoài My, Nam Minh, Google Tiếng Việt) + Web Speech API
import { store, getSettings } from './storage.js';
import { $, $$, esc, toast } from './utils.js';

const RATES = [0.85, 0.95, 1.0, 1.15, 1.3];
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

let queue = [];       // [{ text, display, sel }]
let idx = 0;
let playing = false;
let paused = false;
let token = 0;
let rate = RATES.includes(store.get('ttsRate')) ? store.get('ttsRate') : 0.95;
let savedVoiceId = store.get('ttsVoice', '');

let cloudVoices = []; // [{ id, label, mode: 'server' | 'gtts-direct' }]
let localVoices = []; // Web Speech SpeechSynthesisVoice[]
let selectedId = '';
let buildQueue = () => [];
let currentSel = null;

// Dùng DUY NHẤT 1 thẻ <audio> cố định để iOS Safari cho phép phát xuyên suốt khi khóa màn hình
let sharedAudio = null;
const blobCache = new Map(); // url -> objectURL đã tải sẵn trong RAM

function getAudio() {
  if (!sharedAudio) {
    sharedAudio = document.createElement('audio');
    sharedAudio.setAttribute('playsinline', '');
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

function preloadAudio(url) {
  if (!url || blobCache.has(url) || url.includes('translate.google.com')) return;
  blobCache.set(url, null); // đánh dấu đang tải
  fetch(url)
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => {
      if (b && b.size > 0) blobCache.set(url, URL.createObjectURL(b));
      else blobCache.delete(url);
    })
    .catch(() => { blobCache.delete(url); });
}

/* ---------- Chuẩn hóa phát âm tiếng Việt tự nhiên ---------- */
const PRONOUNCE_MAP = [
  [/\bSTM32\b/gi, 'ét tê mờ ba hai'],
  [/\bESP32\b/gi, 'e ét pê ba hai'],
  [/\bESP8266\b/gi, 'e ét pê tám hai sáu sáu'],
  [/\bROS\s?2\b/gi, 'rốt hai'],
  [/\bPLC\b/g, 'pê lờ xê'],
  [/\bFOC\b/g, 'ép ô xê'],
  [/\bPID\b/g, 'pê i đê'],
  [/\bBLDC\b/gi, 'bê lờ đê xê'],
  [/\bPWM\b/g, 'pê vê mờ'],
  [/\bPCB\b/g, 'pê xê bê'],
  [/\bMCU\b/g, 'em xê u'],
  [/\bFPGA\b/g, 'ép pê gờ a'],
  [/\bRISC-V\b/gi, 'rít năm'],
  [/\bMOSFET\b/gi, 'mót phét'],
  [/\bRTOS\b/gi, 'rờ tốt'],
  [/\bUART\b/gi, 'u a rờ tê'],
  [/\bI2C\b|I²C/gi, 'i hai xê'],
  [/\bSPI\b/g, 'ét pê i'],
  [/\bADC\b/g, 'a đê xê'],
  [/\bDAC\b/g, 'đê a xê'],
  [/\bUSB-C\b/gi, 'u ét bê xê'],
  [/\bUSB\b/g, 'u ét bê'],
  [/\bWi-Fi\b/gi, 'oai phai'],
  [/\bAI\b/g, 'ây ai'],
  [/\bIoT\b/gi, 'ai ô ti'],
  [/\b3D\b/gi, 'ba đê'],
  [/\bGitHub\b/gi, 'gít hắp'],
  [/\bArduino\b/gi, 'a đu i nô'],
  [/\bRaspberry\s?Pi\b/gi, 'rát be ri pai'],
  [/\bLiDAR\b/gi, 'lai đa'],
  [/\bVnExpress\b/gi, 'vê en ích rét'],
  [/\bPM2\.5\b/gi, 'bụi mịn pê em hai phẩy năm'],
  [/\bAQI\b/g, 'a quy i'],
  [/°C/g, ' độ xê'],
  [/km\/h/gi, ' ki lô mét mỗi giờ'],
  [/m\/s/gi, ' mét trên giây'],
  [/kHz/gi, ' ki lô héc'],
  [/MHz/gi, ' mê ga héc'],
  [/GHz/gi, ' ghi ga héc'],
  [/mAh/gi, ' mi li am pe giờ'],
];

export function normalizeForViSpeech(text) {
  let s = String(text || '');
  s = s.replace(/https?:\/\/\S+/g, '').replace(/[#*_~`<>[\]]/g, ' ');
  for (const [re, rep] of PRONOUNCE_MAP) s = s.replace(re, rep);
  s = s.replace(/\s*[—–|•·]\s*/g, ', ').replace(/\s*\/\s*/g, ', ');
  s = s.replace(/(\d+)\.(\d+)/g, '$1 phẩy $2');
  return s.replace(/\s+/g, ' ').trim();
}

function voiceScore(v) {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  let score = 0;
  if (/vi[-_]?vn/i.test(v.lang)) score += 100;
  else if (/^vi/i.test(v.lang)) score += 80;
  else return -1;
  if (/natural|neural/i.test(n)) score += 60;
  if (/enhanced|premium|siri/i.test(n)) score += 50;
  if (/hoaimy|namminh/i.test(n)) score += 45;
  if (/linh/i.test(n)) score += 40;
  if (/google/i.test(n)) score += 35;
  if (/online/i.test(n)) score += 15;
  return score;
}

function cleanVoiceLabel(v) {
  const name = v.name
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s+-\s+Vietnamese.*$/i, '')
    .replace(/\s*\(Vietnam\)/i, '')
    .trim();
  const isNatural = /natural|neural|enhanced|premium/i.test(v.name);
  return `${isNatural ? '★ ' : '📱 '}${name} (${v.lang})`;
}

function ttsApiBase() {
  return (getSettings().workerUrl || '').trim().replace(/\/+$/, '');
}

/* ---------- Khám phá giọng Cloud (server.py / Cloudflare Worker) + giọng thiết bị ---------- */
async function detectCapabilities() {
  const base = ttsApiBase();
  try {
    const r = await fetch(`${base}/api/capabilities`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.cloudVoices) && j.cloudVoices.length) {
        cloudVoices = j.cloudVoices.map((v) => ({ ...v, mode: 'server' }));
        renderVoiceSelect();
        return;
      }
    }
  } catch (_) { /* đang chạy static host */ }
  cloudVoices = [{ id: 'gtts-direct:vi', label: '★ Google Tiếng Việt (Cloud Audio)', mode: 'gtts-direct' }];
  renderVoiceSelect();
}

/* ---------- Media Session API (Điều khiển trên Màn hình khóa iPhone) ---------- */
function updateMediaSession(seg) {
  if (!('mediaSession' in navigator)) return;
  try {
    if (!playing) {
      navigator.mediaSession.playbackState = 'none';
      return;
    }
    navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: (seg?.display || seg?.text || 'Bản tin Cơ điện tử').slice(0, 90),
      artist: 'Mechatronics Morning Hub',
      album: `Đoạn ${idx + 1}/${queue.length}`,
      artwork: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  } catch (_) { /* trình duyệt cũ bỏ qua */ }
}

function bindMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const set = (act, fn) => { try { navigator.mediaSession.setActionHandler(act, fn); } catch (_) {} };
  set('play', () => { if (paused || !playing) play(); });
  set('pause', () => { if (playing && !paused) play(); });
  set('previoustrack', prev);
  set('nexttrack', next);
  set('stop', stop);
}

function populateLocalVoices() {
  if (!synth) return;
  const all = synth.getVoices() || [];
  localVoices = all
    .map((v) => ({ v, score: voiceScore(v) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.v);
  renderVoiceSelect();
}

function renderVoiceSelect() {
  const sel = $('#tts-voice-select');
  if (!sel) return;
  const options = [
    ...cloudVoices.map((c) => ({ id: c.id, label: c.label })),
    ...localVoices.map((v) => ({ id: `local:${v.voiceURI}`, label: cleanVoiceLabel(v) })),
  ];
  if (!options.length) {
    options.push({ id: 'local:default', label: '📱 Giọng tiếng Việt mặc định' });
  }
  const exists = options.some((o) => o.id === savedVoiceId);
  selectedId = exists ? savedVoiceId : options[0].id;
  sel.innerHTML = options.map((o) =>
    `<option value="${esc(o.id)}"${o.id === selectedId ? ' selected' : ''}>${esc(o.label)}</option>`
  ).join('');
}

/* ---------- Highlight & UI ---------- */
function highlight(sel) {
  $$('.speaking').forEach((el) => el.classList.remove('speaking'));
  currentSel = sel || null;
  if (!sel) return;
  const els = $$(sel);
  els.forEach((el) => el.classList.add('speaking'));
  const visible = els.find((el) => el.offsetParent !== null);
  if (visible) visible.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function refreshHighlight() {
  if (playing && currentSel) $$(currentSel).forEach((el) => el.classList.add('speaking'));
}

function setUI() {
  const btn = $('#tts-play');
  if (!btn) return;
  const label = btn.querySelector('span');
  const icon = btn.querySelector('svg');
  if (playing && !paused) {
    label.textContent = 'Tạm dừng';
    icon.innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
  } else {
    label.textContent = paused ? 'Tiếp tục' : 'Phát bản tin';
    icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
  }
  $('#tts-rate').textContent = `${rate.toFixed(2).replace(/0$/, '')}x`;
  const badge = $('#tts-badge');
  const bar = $('#tts-prog-bar');
  const st = $('#tts-status');
  const mp = $('#mini-player');
  const mpBar = $('#mp-bar');
  const mpText = $('#mp-text');
  const mpPlay = $('#mp-play');
  const mpDot = $('#mp-dot');
  if (!playing) {
    if (badge) badge.textContent = 'Sẵn sàng';
    if (bar) bar.style.width = '0%';
    st.textContent = 'Lời chào · Telemetry thời tiết · 5 tin ưu tiên (tiếng Việt)';
    if (mp) mp.hidden = true;
    document.body.classList.remove('has-mini-player');
  } else {
    const pct = `${Math.round(((idx + 1) / Math.max(1, queue.length)) * 100)}%`;
    const cur = queue[idx];
    const txt = cur?.display || cur?.text || '';
    if (badge) badge.textContent = paused ? 'Tạm dừng' : `${idx + 1}/${queue.length}`;
    if (bar) bar.style.width = pct;
    st.textContent = `${paused ? '⏸' : '🎙️'} ${txt}`;
    if (mp) {
      mp.hidden = false;
      document.body.classList.add('has-mini-player');
      if (mpBar) mpBar.style.width = pct;
      if (mpText) mpText.textContent = `${idx + 1}/${queue.length} · ${txt}`;
      if (mpPlay) mpPlay.textContent = paused ? '▶' : '⏸';
      if (mpDot) mpDot.classList.toggle('paused', paused);
    }
  }
  updateMediaSession(queue[idx]);
}

/* ---------- Phát âm thanh (Cloud MP3 trên 1 thẻ <audio> duy nhất hoặc Web Speech) ---------- */
function stopActiveAudio() {
  if (sharedAudio) {
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
    sharedAudio.pause();
    sharedAudio.removeAttribute('src');
    sharedAudio.load();
  }
  if (synth) synth.cancel();
}

function cloudAudioUrl(voiceId, cleanText) {
  if (voiceId.startsWith('gtts-direct:')) {
    const short = cleanText.slice(0, 180);
    return `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(short)}`;
  }
  const base = ttsApiBase();
  return `${base}/api/tts?voice=${encodeURIComponent(voiceId)}&rate=${encodeURIComponent(rate)}&text=${encodeURIComponent(cleanText)}`;
}

function speakLocal(cleanText, my) {
  if (!synth) { toast('Thiết bị không hỗ trợ đọc offline'); stop(); return; }
  const uri = selectedId.replace(/^local:/, '');
  const v = localVoices.find((x) => x.voiceURI === uri) || localVoices[0] || null;
  const u = new SpeechSynthesisUtterance(cleanText);
  u.lang = v?.lang || 'vi-VN';
  if (v) u.voice = v;
  u.rate = rate;
  u.pitch = 1.0;
  u.onend = () => {
    if (my !== token) return;
    idx++;
    setTimeout(() => { if (my === token) speakCurrent(); }, 220);
  };
  u.onerror = (e) => {
    if (my !== token || e.error === 'interrupted' || e.error === 'canceled') return;
    idx++;
    speakCurrent();
  };
  setTimeout(() => { if (my === token) synth.speak(u); }, 60);
}

function speakCurrent() {
  const my = ++token;
  if (synth) synth.cancel();
  const seg = queue[idx];
  if (!seg) { stop(); return; }
  highlight(seg.sel);
  setUI();

  const cleanText = normalizeForViSpeech(seg.text);
  const isCloud = !selectedId.startsWith('local:') && navigator.onLine;

  if (!isCloud) {
    if (sharedAudio) { sharedAudio.onended = null; sharedAudio.pause(); }
    speakLocal(cleanText, my);
    return;
  }

  const audio = getAudio();
  const rawUrl = cloudAudioUrl(selectedId, cleanText);
  const cachedBlob = blobCache.get(rawUrl);
  audio.onended = null;
  audio.onerror = null;
  audio.src = cachedBlob || rawUrl;

  // Với Google TTS, điều chỉnh playbackRate theo phong cách giọng + tốc độ người dùng chọn
  if (selectedId === 'google:vi-slow') {
    audio.playbackRate = Math.max(0.75, rate * 0.88);
  } else if (selectedId === 'google:vi-fast') {
    audio.playbackRate = Math.min(1.5, rate * 1.18);
  } else if (selectedId.startsWith('gtts-direct:') || selectedId.startsWith('google:')) {
    audio.playbackRate = rate;
  } else {
    audio.playbackRate = 1.0;
  }

  // QUAN TRỌNG cho iOS khi tắt màn hình: chuyển đoạn & play() NGAY LẬP TỨC trong onended, không dùng setTimeout!
  audio.onended = () => {
    if (my !== token) return;
    idx++;
    speakCurrent();
  };
  audio.onerror = () => {
    if (my !== token) return;
    speakLocal(cleanText, my);
  };
  audio.play().catch(() => {
    if (my === token) speakLocal(cleanText, my);
  });

  // Preload sẵn 2 đoạn tiếp theo thành Blob URL để iPhone chuyển câu tức thì 0ms kể cả khi đang khóa màn hình
  for (let offset = 1; offset <= 2; offset++) {
    const nxt = queue[idx + offset];
    if (nxt && !selectedId.startsWith('gtts-direct:')) {
      preloadAudio(cloudAudioUrl(selectedId, normalizeForViSpeech(nxt.text)));
    }
  }
}

function start(items) {
  stopActiveAudio();
  queue = items.filter((x) => x && x.text);
  if (!queue.length) { toast('Chưa có nội dung để đọc'); return; }
  idx = 0;
  playing = true;
  paused = false;
  speakCurrent();
}

export function play() {
  if (!playing) { start(buildQueue()); return; }
  if (paused) {
    paused = false;
    if (sharedAudio && sharedAudio.paused && sharedAudio.src) {
      sharedAudio.play().catch(() => speakCurrent());
      setUI();
    } else {
      speakCurrent();
    }
  } else {
    paused = true;
    if (sharedAudio && !sharedAudio.paused) {
      sharedAudio.pause();
    } else {
      token++;
      if (synth) synth.cancel();
    }
    setUI();
  }
}

export function playCustom(items) { start(items); }

export function prev() {
  if (!playing) return;
  idx = Math.max(0, idx - 1);
  paused = false;
  speakCurrent();
}

export function next() {
  if (!playing) return;
  idx++;
  paused = false;
  speakCurrent();
}

export function stop() {
  token++;
  stopActiveAudio();
  playing = false;
  paused = false;
  idx = 0;
  highlight(null);
  setUI();
}

export function cycleRate() {
  rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
  store.set('ttsRate', rate);
  setUI();
  if (playing && !paused) speakCurrent();
}

export function init({ build }) {
  buildQueue = build;
  detectCapabilities();
  bindMediaSessionHandlers();
  window.addEventListener('settings-changed', (e) => {
    if (e.detail.keys.includes('workerUrl')) detectCapabilities();
  });
  if (synth) {
    populateLocalVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', populateLocalVoices);
    else synth.onvoiceschanged = populateLocalVoices;
  }
  $('#tts-play').addEventListener('click', play);
  $('#tts-prev')?.addEventListener('click', prev);
  $('#tts-next').addEventListener('click', next);
  $('#tts-stop').addEventListener('click', stop);
  $('#tts-rate').addEventListener('click', cycleRate);
  $('#mp-play')?.addEventListener('click', play);
  $('#mp-next')?.addEventListener('click', next);
  $('#mp-stop')?.addEventListener('click', stop);
  $('#mp-goto')?.addEventListener('click', () => {
    document.querySelector('#tabbar button[data-tab="today"]')?.click();
    $('#tts-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#tts-voice-select')?.addEventListener('change', (e) => {
    savedVoiceId = e.target.value;
    selectedId = savedVoiceId;
    store.set('ttsVoice', savedVoiceId);
    if (playing && !paused) speakCurrent();
  });
  window.addEventListener('pagehide', stop);
  setUI();
}
