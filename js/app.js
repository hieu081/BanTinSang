// app.js — Điều phối 4 tab, vòng đời ứng dụng, đồng hồ, Spark offline, TTS, iOS Banner, Service Worker
import { store, sync } from './storage.js';
import { $, $$, esc, toast } from './utils.js';
import * as telemetry from './telemetry.js';
import * as feeds from './feeds.js';
import * as tts from './tts.js';
import * as tools from './tools.js';
import * as notes from './notes.js';
import * as settings from './settings.js';
import { SPARKS, dailySparkIndex } from './data/sparks.js';

/* ---------- Đồng hồ & Lời chào ---------- */
function greetingInfo(d = new Date()) {
  const h = d.getHours();
  if (h < 11) return { title: 'Chào buổi sáng, Hiếu!', sub: 'Kiểm tra telemetry môi trường & điểm tin Cơ điện tử.' };
  if (h < 14) return { title: 'Chào buổi trưa, Hiếu!', sub: 'Cập nhật nhanh bản tin kỹ thuật & trạng thái phòng lab.' };
  if (h < 18) return { title: 'Chào buổi chiều, Hiếu!', sub: 'Tiếp tục dự án — tra cứu nhanh Lab Tools & Radar tin.' };
  return { title: 'Chào buổi tối, Hiếu!', sub: 'Tổng kết Lab Log & ôn 1 phút kiến thức Cơ điện tử.' };
}

function updateClock() {
  const d = new Date();
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const p = (n) => String(n).padStart(2, '0');
  $('#clock').textContent = `${days[d.getDay()]} ${p(d.getDate())}/${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}`;
  const g = greetingInfo(d);
  $('#greet-title').textContent = g.title;
  $('#greet-sub').textContent = g.sub;
}

/* ---------- Đèn LED trạng thái đồng bộ ---------- */
function updateSyncLED(state = sync.state()) {
  const led = $('#sync-led');
  const lbl = $('#sync-label');
  const btn = $('#refresh-btn');
  led.className = 'led';
  if (state === 'sync') {
    led.classList.add('sync');
    lbl.textContent = 'Đang đồng bộ';
    btn.classList.add('spinning');
  } else if (state === 'offline') {
    led.classList.add('off');
    lbl.textContent = navigator.onLine ? 'Dữ liệu cũ' : 'Ngoại tuyến';
    btn.classList.remove('spinning');
  } else {
    led.classList.add('ok');
    lbl.textContent = 'Mới nhất';
    btn.classList.remove('spinning');
  }
}

/* ---------- Thẻ "1 phút ôn kỹ thuật" (Offline) ---------- */
let sparkIdx = dailySparkIndex();

function renderSpark(isDaily = true) {
  const sp = SPARKS[sparkIdx];
  $('#spark-index').textContent = `#${sp.id}/${SPARKS.length}`;
  $('#spark-hint').textContent = isDaily ? 'Thẻ cố định hôm nay · 100% Offline' : 'Thẻ ôn ngẫu nhiên · 100% Offline';
  $('#spark-body').innerHTML = `
    <span class="tag cyan spark-group">${esc(sp.group)}</span>
    <div class="spark-title">${esc(sp.title)}</div>
    <p class="spark-body">${esc(sp.body)}</p>
    ${sp.formula ? `<div class="spark-formula">${esc(sp.formula)}</div>` : ''}
    ${sp.tip ? `<div class="spark-tip">💡 ${esc(sp.tip)}</div>` : ''}`;
}

function openSparkSearch() {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `
    <div class="sheet" style="max-height:82vh;display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Tra cứu 55 thẻ ôn kỹ thuật">
      <div class="grab"></div>
      <h3>🔍 Tra nhanh ${SPARKS.length} thẻ ôn Cơ điện tử</h3>
      <input class="input" id="sp-q" placeholder="Tìm: PID, MOSFET, I2C, Encoder, FOC, Vitme…" autocomplete="off" style="margin-bottom:8px">
      <div id="sp-res" style="overflow-y:auto;flex:1;min-height:180px"></div>
      <button class="btn ghost block" data-close style="margin-top:8px">Đóng</button>
    </div>`;
  const renderList = (q = '') => {
    const s = q.trim().toLowerCase();
    const list = s
      ? SPARKS.filter((x) => `${x.title} ${x.group} ${x.body} ${x.formula || ''}`.toLowerCase().includes(s))
      : SPARKS;
    const box = wrap.querySelector('#sp-res');
    box.innerHTML = list.length
      ? `<ul class="list">${list.map((sp) => `
          <li class="list-item" style="cursor:pointer" data-pick-sp="${sp.id}">
            <div class="body">
              <div class="title">#${sp.id} · ${esc(sp.title)}</div>
              <div class="meta"><span class="tag cyan">${esc(sp.group)}</span></div>
            </div>
          </li>`).join('')}</ul>`
      : '<div class="empty">Không tìm thấy thẻ nào khớp.</div>';
  };
  renderList();
  wrap.querySelector('#sp-q').addEventListener('input', (e) => renderList(e.target.value));
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) { wrap.remove(); return; }
    const pick = e.target.closest('[data-pick-sp]');
    if (pick) {
      const id = Number(pick.dataset.pickSp);
      const found = SPARKS.findIndex((x) => x.id === id);
      if (found >= 0) { sparkIdx = found; renderSpark(false); }
      wrap.remove();
    }
  });
  document.body.appendChild(wrap);
  setTimeout(() => wrap.querySelector('#sp-q')?.focus(), 50);
}

function initSpark() {
  renderSpark(true);
  $('#spark-search')?.addEventListener('click', openSparkSearch);
  $('#spark-today').addEventListener('click', () => {
    sparkIdx = dailySparkIndex();
    renderSpark(true);
  });
  $('#spark-next').addEventListener('click', () => {
    let next = sparkIdx;
    while (next === sparkIdx && SPARKS.length > 1) {
      next = Math.floor(Math.random() * SPARKS.length);
    }
    sparkIdx = next;
    renderSpark(false);
  });
}

/* ---------- Điều hướng 4 Tab ---------- */
function switchTab(name) {
  $$('.tab').forEach((s) => s.classList.toggle('active', s.dataset.tab === name));
  $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  store.set('activeTab', name);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function initTabs() {
  $('#tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) switchTab(g.dataset.goto);
  });
  // Sub-tabs trong Tab 4 (Lab Log / Đã lưu / Cài đặt)
  $('#notes-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pane]');
    if (!b) return;
    $$('#notes-seg button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.notes-pane').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.pane; });
  });
}

/* ---------- Banner cài đặt iOS Safari ---------- */
function initIOSBanner() {
  const dismissed = store.get('iosBannerDismissed', false);
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const banner = $('#ios-banner');
  if (isIOS && isSafari && !isStandalone && !dismissed) {
    banner.hidden = false;
  }
  $('#ios-banner-close').addEventListener('click', () => {
    banner.hidden = true;
    store.set('iosBannerDismissed', true);
  });
}

/* ---------- Tạo danh sách đọc TTS (kịch bản phát thanh viên tiếng Việt) ---------- */
function buildTTSQueue() {
  const g = greetingInfo();
  const q = [{
    text: `${g.title} Mời bạn nghe bản tin kỹ thuật Cơ điện tử hôm nay.`,
    display: g.title,
    sel: '#greet',
  }];
  const wxSegs = telemetry.speech();
  if (Array.isArray(wxSegs)) wxSegs.forEach((s) => q.push({ ...s, display: s.text }));
  const top = feeds.topHeadlines(5);
  if (top.length) {
    q.push({
      text: `Chuyển sang điểm tin kỹ thuật. Sau đây là ${top.length} tiêu đề nổi bật nhất.`,
      display: `${top.length} tiêu đề kỹ thuật nổi bật`,
      sel: '#today-news-card',
    });
    top.forEach((it, i) => {
      const title = it.titleVi || it.title;
      q.push({
        text: `Tin số ${i + 1}, từ ${it.source}: ${title}.`,
        display: `${i + 1}. ${title}`,
        sel: `[data-nid="${it.id}"]`,
      });
    });
  }
  q.push({ text: 'Hết bản tin. Chúc Hiếu một ngày làm việc và nghiên cứu hiệu quả!', display: 'Kết thúc bản tin', sel: null });
  return q;
}

/* ---------- Làm mới toàn bộ ---------- */
async function refreshAll(force = false) {
  await Promise.allSettled([telemetry.refresh(force), feeds.refresh(force)]);
}

/* ---------- Khởi chạy ---------- */
function boot() {
  updateClock();
  setInterval(updateClock, 30000);

  sync.on(updateSyncLED);
  window.addEventListener('online', () => { updateSyncLED(); refreshAll(false); });
  window.addEventListener('offline', () => updateSyncLED());

  initTabs();
  initSpark();
  settings.init();
  notes.init();
  tools.init();
  telemetry.init();
  feeds.init();
  tts.init({ build: buildTTSQueue });
  initIOSBanner();

  $('#refresh-btn').addEventListener('click', () => {
    refreshAll(true);
    toast('Đang đồng bộ thời tiết, tỷ giá & bản tin…');
  });
  window.addEventListener('force-refresh', () => refreshAll(true));
  window.addEventListener('settings-changed', (e) => {
    if (e.detail.keys.some((k) => ['location', 'useGPS'].includes(k))) telemetry.refresh(true);
  });

  // Đồng bộ ngầm ngay khi mở app
  refreshAll(false);

  // Đăng ký Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[sw] Không đăng ký được Service Worker:', err.message);
    });
  }
}

boot();
