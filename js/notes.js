// notes.js — Bookmarks (có tìm kiếm nhanh), Lab Log & Sổ tay BOM tính chi phí đồ án + Copy Markdown
import { store, getSettings } from './storage.js';
import { $, $$, esc, timeAgo, fmtDateTime, toast, copyText, num } from './utils.js';
import { callGemini, hasAIKey } from './feeds.js';

export const BM_TAGS = ['#Nhúng', '#CơKhí', '#ĐồÁn', '#Robotics'];
export const LOG_TAGS = ['#Ý_tưởng', '#Mua_linh_kiện', '#Bug_cần_fix'];
const LOG_TAG_CLS = { '#Ý_tưởng': 'cyan', '#Mua_linh_kiện': 'green', '#Bug_cần_fix': 'red' };
const BM_TAG_CLS = { '#Nhúng': 'cyan', '#CơKhí': 'amber', '#ĐồÁn': 'green', '#Robotics': 'purple' };

const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';

/* ---------- Bookmarks ---------- */
export const getBookmarks = () => store.get('bookmarks', []);
export const isBookmarked = (id) => getBookmarks().some((b) => b.id === id);

function saveBookmarks(list) {
  store.set('bookmarks', list);
  window.dispatchEvent(new CustomEvent('bookmarks-changed'));
  renderBookmarks();
}

export function addBookmark(item, tag) {
  const list = getBookmarks().filter((b) => b.id !== item.id);
  list.unshift({
    id: item.id, title: item.title, link: item.link, source: item.source,
    desc: item.desc || '', tag, savedAt: Date.now(), kind: item.kind || 'rss',
  });
  saveBookmarks(list);
}

export function removeBookmark(id) { saveBookmarks(getBookmarks().filter((b) => b.id !== id)); }

export function openBookmarkDialog(item) {
  return new Promise((resolve) => {
    const existing = getBookmarks().find((b) => b.id === item.id);
    const wrap = document.createElement('div');
    wrap.className = 'sheet-backdrop';
    wrap.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Lưu bài viết">
        <div class="grab"></div>
        <h3>${existing ? 'Đổi nhãn / bỏ lưu' : 'Lưu vào Lưu & Ghi chú'}</h3>
        <p>${esc(item.title)}</p>
        <div class="tag-grid">
          ${BM_TAGS.map((t) => `<button class="btn${existing?.tag === t ? ' primary' : ''}" data-tag="${t}">${t}</button>`).join('')}
        </div>
        <div class="btn-row">
          ${existing ? '<button class="btn danger" data-act="remove">Bỏ lưu</button>' : ''}
          <button class="btn ghost" data-act="cancel">Hủy</button>
        </div>
      </div>`;
    const close = (changed) => { wrap.remove(); resolve(changed); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return close(false);
      const t = e.target.closest('[data-tag]');
      if (t) { addBookmark(item, t.dataset.tag); toast(`Đã lưu với nhãn ${t.dataset.tag}`); return close(true); }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'remove') { removeBookmark(item.id); toast('Đã bỏ lưu'); return close(true); }
      close(false);
    });
    document.body.appendChild(wrap);
  });
}

let bmFilter = 'all';
let bmQuery = '';

export function renderBookmarks() {
  const pane = $('#pane-bookmarks');
  if (!pane) return;
  const all = getBookmarks();
  const q = bmQuery.trim().toLowerCase();
  const list = all.filter((b) => {
    if (bmFilter !== 'all' && b.tag !== bmFilter) return false;
    if (q && !`${b.title} ${b.source || ''} ${b.tag}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const count = (t) => all.filter((b) => b.tag === t).length;
  pane.innerHTML = `
    <input class="input" id="bm-search" value="${esc(bmQuery)}" placeholder="🔍 Tìm nhanh bài viết / repo đã lưu…" autocomplete="off" style="margin-bottom:8px">
    <div class="chip-scroll" style="margin-bottom:8px">
      <button class="chip${bmFilter === 'all' ? ' active' : ''}" data-bmf="all">Tất cả <span class="count">${all.length}</span></button>
      ${BM_TAGS.map((t) => `<button class="chip${bmFilter === t ? ' active' : ''}" data-bmf="${t}">${t} <span class="count">${count(t)}</span></button>`).join('')}
    </div>
    <div class="card">
      ${list.length ? `<ul class="list">${list.map((b) => `
        <li class="list-item">
          <div class="body">
            <a class="title" href="${esc(b.link)}" target="_blank" rel="noopener noreferrer">${esc(b.title)}</a>
            <div class="meta"><span class="tag ${BM_TAG_CLS[b.tag] || ''}">${esc(b.tag)}</span><span>${esc(b.source || '')}</span><span class="mono">${esc(timeAgo(b.savedAt))}</span></div>
          </div>
          <button class="del-btn" data-bmdel="${b.id}" aria-label="Xóa bookmark">${TRASH}</button>
        </li>`).join('')}</ul>`
        : '<div class="empty"><span class="big">🔖</span>Chưa có bài nào khớp. Bấm biểu tượng 🔖 trên thẻ tin ở tab "Tin kỹ thuật" để lưu.</div>'}
    </div>
    ${all.length ? '<button class="btn block" id="bm-copy">📋 Copy Markdown danh sách đã lưu</button>' : ''}`;
}

/* ---------- Lab Log & Sổ tay BOM ---------- */
const getLogs = () => store.get('labLog', []);
const saveLogs = (l) => { store.set('labLog', l); renderLog(); };
let logTag = store.get('labLogTag', LOG_TAGS[0]);
let logFilter = 'all';

export function addLog(text, tag = logTag, { qty = null, price = null } = {}) {
  const t = text.trim();
  if (!t) return false;
  const list = getLogs();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text: t, tag, done: false, ts: Date.now(),
  };
  if (tag === '#Mua_linh_kiện') {
    const q = Number.isFinite(qty) && qty > 0 ? qty : null;
    const p = Number.isFinite(price) && price >= 0 ? price : null;
    if (q != null) entry.qty = q;
    if (p != null) entry.price = p;
  }
  list.unshift(entry);
  saveLogs(list);
  return true;
}

export function bomTotal(list = getLogs()) {
  let total = 0;
  let pending = 0;
  for (const l of list) {
    if (l.tag !== '#Mua_linh_kiện' || !(l.price > 0)) continue;
    const sub = (l.qty || 1) * l.price;
    total += sub;
    if (!l.done) pending += sub;
  }
  return { total, pending };
}

export function logsToMarkdown(list = getLogs()) {
  const d = new Date();
  const head = `## Lab Log & BOM — ${d.toLocaleDateString('vi-VN')}\n`;
  let body = '';
  for (const tag of LOG_TAGS) {
    const items = list.filter((l) => l.tag === tag);
    if (!items.length) continue;
    if (tag === '#Mua_linh_kiện' && items.some((x) => x.price > 0)) {
      const { total } = bomTotal(items);
      body += `\n### ${tag} (Tổng dự toán: ${Math.round(total).toLocaleString('vi-VN')} ₫)\n\n`;
      body += '| TT | Linh kiện | SL | Đơn giá (₫) | Thành tiền (₫) |\n|---|---|---:|---:|---:|\n';
      items.forEach((l) => {
        const q = l.qty || 1;
        const p = l.price || 0;
        body += `| ${l.done ? '✅' : '⬜'} | ${l.text.replace(/\|/g, '/')} | ${q} | ${p ? Math.round(p).toLocaleString('vi-VN') : '—'} | ${p ? Math.round(q * p).toLocaleString('vi-VN') : '—'} |\n`;
      });
    } else {
      body += `\n### ${tag}\n${items.map((l) => `- [${l.done ? 'x' : ' '}] ${l.text} _(${fmtDateTime(l.ts)})_`).join('\n')}\n`;
    }
  }
  return head + (body || '\n_(trống)_\n');
}

export function bookmarksToMarkdown(list = getBookmarks()) {
  return `## Bài viết đã lưu — ${new Date().toLocaleDateString('vi-VN')}\n\n${
    list.map((b) => `- [${b.title.replace(/[[\]]/g, '')}](${b.link}) — ${b.source || ''} ${b.tag}`).join('\n')}\n`;
}

export function renderLog() {
  const pane = $('#pane-log');
  if (!pane) return;
  const all = getLogs();
  const list = all.filter((l) => logFilter === 'all' || (logFilter === 'open' ? !l.done : l.tag === logFilter));
  const openN = all.filter((l) => !l.done).length;
  const bom = bomTotal(all);
  const isBomTag = logTag === '#Mua_linh_kiện';

  pane.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">⚡ Ghi nhanh & BOM</div><span class="tag mono">${openN} mở</span></div>
      <form class="note-input" id="log-form" autocomplete="off">
        <textarea class="input" id="log-text" rows="2" placeholder="${isBomTag ? 'VD: MOSFET IRLZ44N, tụ 1000µF 35V, STM32F103C8T6…' : 'VD: Bug I2C treo khi motor chạy / Ý tưởng bộ lọc Kalman'}" aria-label="Nội dung ghi chú"></textarea>
        <div class="seg" id="log-tags">
          ${LOG_TAGS.map((t) => `<button type="button" data-ltag="${t}" class="${logTag === t ? 'active' : ''}">${t.replace(/_/g, ' ')}</button>`).join('')}
        </div>
        <div class="grid-2" id="bom-fields" ${isBomTag ? '' : 'hidden'}>
          <label class="field"><span>Số lượng (SL)</span><input class="input mono" id="log-qty" type="text" inputmode="decimal" value="1" placeholder="1"></label>
          <label class="field"><span>Đơn giá ước tính (₫)</span><input class="input mono" id="log-price" type="text" inputmode="decimal" placeholder="VD: 15000"></label>
        </div>
        <div class="btn-row">
          <button class="btn primary" type="submit">＋ Thêm ${isBomTag ? 'vào BOM' : 'ghi chú'}</button>
          ${isBomTag && hasAIKey() ? '<button class="btn" type="button" id="bom-ai-gen">🤖 AI lập BOM</button>' : ''}
        </div>
      </form>
    </div>
    ${bom.total > 0 ? `
      <div class="card" style="padding:10px 14px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.06em">Dự toán BOM đồ án</div>
            <div class="mono" style="font-size:19px;font-weight:700;color:var(--green)">${Math.round(bom.total).toLocaleString('vi-VN')} ₫</div></div>
          <div style="text-align:right"><div class="tiny muted">Chưa mua</div>
            <div class="mono" style="font-size:14px;color:var(--amber)">${Math.round(bom.pending).toLocaleString('vi-VN')} ₫</div></div>
        </div>
      </div>` : ''}
    <div class="chip-scroll" style="margin-bottom:8px">
      <button class="chip${logFilter === 'all' ? ' active' : ''}" data-lf="all">Tất cả <span class="count">${all.length}</span></button>
      <button class="chip${logFilter === 'open' ? ' active' : ''}" data-lf="open">Chưa xong <span class="count">${openN}</span></button>
      ${LOG_TAGS.map((t) => `<button class="chip${logFilter === t ? ' active' : ''}" data-lf="${t}">${t} <span class="count">${all.filter((l) => l.tag === t).length}</span></button>`).join('')}
    </div>
    <div class="card">
      ${list.length ? `<ul class="list" id="log-list">${list.map((l) => {
        const sub = l.tag === '#Mua_linh_kiện' && l.price > 0
          ? `<span class="tag green mono">${l.qty || 1} × ${Math.round(l.price).toLocaleString('vi-VN')}₫ = ${Math.round((l.qty || 1) * l.price).toLocaleString('vi-VN')}₫</span>`
          : (l.qty > 1 ? `<span class="tag mono">SL: ${l.qty}</span>` : '');
        return `
        <li class="list-item${l.done ? ' done' : ''}" data-lid="${l.id}">
          <button class="check${l.done ? ' on' : ''}" data-ldone="${l.id}" aria-label="${l.done ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}">${CHECK}</button>
          <div class="body">
            <div class="title">${esc(l.text)}</div>
            <div class="meta"><span class="tag ${LOG_TAG_CLS[l.tag] || ''}">${esc(l.tag)}</span>${sub}<span class="mono">${esc(fmtDateTime(l.ts))}</span></div>
          </div>
          <button class="del-btn" data-ldel="${l.id}" aria-label="Xóa ghi chú">${TRASH}</button>
        </li>`;
      }).join('')}</ul>`
        : '<div class="empty"><span class="big">📝</span>Chưa có ghi chú nào.</div>'}
    </div>
    <div class="btn-row">
      <button class="btn" id="log-copy" ${all.length ? '' : 'disabled'}>📋 Copy Markdown (kèm bảng BOM)</button>
      <button class="btn danger" id="log-clear-done" ${all.some((l) => l.done) ? '' : 'disabled'}>Xóa mục đã xong</button>
    </div>`;
}

/* ---------- Sổ theo dõi Sửa máy & Bảo hành ---------- */
const getRepairs = () => store.get('repairs', []);
const saveRepairs = (l) => { store.set('repairs', l); renderRepairs(); };
let repFilter = 'all';

function warrantyEndTs(ts, months) {
  const d = new Date(ts);
  d.setMonth(d.getMonth() + (months || 0));
  return d.getTime();
}

export function renderRepairs() {
  const pane = $('#pane-repairs');
  if (!pane) return;
  const all = getRepairs();
  const now = Date.now();
  const list = all.filter((r) => {
    if (repFilter === 'open') return !r.delivered;
    if (repFilter === 'warranty') return r.delivered && r.warrantyM > 0 && warrantyEndTs(r.deliveredAt || r.ts, r.warrantyM) > now;
    return true;
  });
  const totalDone = all.filter((r) => r.delivered).reduce((s, r) => s + (r.price || 0), 0);
  const openN = all.filter((r) => !r.delivered).length;

  pane.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">📋 Nhận / Ghi đơn Sửa máy</div><span class="tag mono">${openN} đang sửa</span></div>
      <form class="note-input" id="rep-form" autocomplete="off">
        <input class="input" id="rep-dev" placeholder="Tên máy & Khách (VD: Bếp từ Sunhouse — Anh Hùng)">
        <textarea class="input" id="rep-desc" rows="2" placeholder="Lỗi gặp phải & Linh kiện đã thay (VD: Nổ IGBT H20R1203 + thay tụ 0.3µF)"></textarea>
        <div class="grid-2">
          <label class="field"><span>Giá thu (₫)</span><input class="input mono" id="rep-price" type="text" inputmode="decimal" placeholder="VD: 250000"></label>
          <label class="field"><span>Bảo hành (tháng)</span>
            <select class="input mono" id="rep-wm">
              <option value="0">Không BH</option>
              <option value="1">1 tháng</option>
              <option value="3" selected>3 tháng</option>
              <option value="6">6 tháng</option>
            </select>
          </label>
        </div>
        <button class="btn primary block" type="submit">＋ Thêm vào sổ sửa máy</button>
      </form>
    </div>
    ${totalDone > 0 ? `
      <div class="card" style="padding:10px 14px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.06em">Tổng thu đã giao</div>
            <div class="mono" style="font-size:19px;font-weight:700;color:var(--green)">${Math.round(totalDone).toLocaleString('vi-VN')} ₫</div></div>
          <div style="text-align:right"><div class="tiny muted">Tổng đơn</div>
            <div class="mono" style="font-size:15px">${all.length} máy</div></div>
        </div>
      </div>` : ''}
    <div class="chip-scroll" style="margin-bottom:8px">
      <button class="chip${repFilter === 'all' ? ' active' : ''}" data-rf="all">Tất cả <span class="count">${all.length}</span></button>
      <button class="chip${repFilter === 'open' ? ' active' : ''}" data-rf="open">Đang sửa <span class="count">${openN}</span></button>
      <button class="chip${repFilter === 'warranty' ? ' active' : ''}" data-rf="warranty">Còn bảo hành</button>
    </div>
    <div class="card">
      ${list.length ? `<ul class="list">${list.map((r) => {
        const endTs = warrantyEndTs(r.deliveredAt || r.ts, r.warrantyM);
        const wBadge = !r.delivered
          ? '<span class="tag amber">Đang sửa</span>'
          : (r.warrantyM > 0
            ? (endTs > now ? `<span class="tag green">Còn BH đến ${new Date(endTs).toLocaleDateString('vi-VN')}</span>` : '<span class="tag">Hết BH</span>')
            : '<span class="tag">Đã giao</span>');
        return `
        <li class="list-item${r.delivered ? ' done' : ''}">
          <button class="check${r.delivered ? ' on' : ''}" data-rdone="${r.id}" aria-label="Đánh dấu đã giao">${CHECK}</button>
          <div class="body">
            <div class="title">${esc(r.device)}</div>
            ${r.desc ? `<div class="small muted" style="margin-top:2px">${esc(r.desc)}</div>` : ''}
            <div class="meta">
              ${wBadge}
              ${r.price ? `<span class="tag cyan mono">${Math.round(r.price).toLocaleString('vi-VN')}₫</span>` : ''}
              <span class="mono">${esc(fmtDateTime(r.ts))}</span>
              <button class="btn sm ghost" data-rzalo="${r.id}" style="min-height:26px;padding:0 8px;font-size:11.5px">📤 Copy Zalo</button>
            </div>
          </div>
          <button class="del-btn" data-rdel="${r.id}" aria-label="Xóa đơn">${TRASH}</button>
        </li>`;
      }).join('')}</ul>`
        : '<div class="empty"><span class="big">📋</span>Chưa có đơn sửa máy nào.</div>'}
    </div>`;
}

/* ---------- Sổ tay "Pan bệnh đã sửa" (Personal Repair Wiki) ---------- */
const PAN_CATS = ['Bếp từ', 'Máy hàn', 'Nguồn xung', 'Khác'];
const getPans = () => store.get('panWiki', []);
const savePans = (l) => { store.set('panWiki', l); renderPans(); };
let panCat = 'Bếp từ';
let panFilter = 'all';
let panQuery = '';

export function renderPans() {
  const pane = $('#pane-pans');
  if (!pane) return;
  const all = getPans();
  const q = panQuery.trim().toLowerCase();
  const list = all.filter((p) => {
    if (panFilter !== 'all' && p.cat !== panFilter) return false;
    if (q && !`${p.cat} ${p.symptom} ${p.fix}`.toLowerCase().includes(q)) return false;
    return true;
  });
  pane.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">📒 Lưu Pan bệnh đã sửa thành công</div><span class="tag mono">${all.length} pan</span></div>
      <form class="note-input" id="pan-form" autocomplete="off">
        <div class="seg" id="pan-cats">
          ${PAN_CATS.map((c) => `<button type="button" data-pcat="${c}" class="${panCat === c ? 'active' : ''}">${c}</button>`).join('')}
        </div>
        <input class="input" id="pan-sym" placeholder="Model & Triệu chứng (VD: Bếp Sunhouse SHD6861 báo E0 không nhận nồi)">
        <textarea class="input" id="pan-fix" rows="2" placeholder="Nguyên nhân & Cách sửa đã thành công (VD: Đứt trở R18 240kΩ đường đồng bộ, thay xong chạy êm)"></textarea>
        <button class="btn primary block" type="submit">＋ Lưu vào kho Pan bệnh</button>
      </form>
    </div>
    <input class="input" id="pan-search" value="${esc(panQuery)}" placeholder="🔍 Tìm pan cũ (VD: E0, OC, Sunhouse, 240k, D92-02…)" autocomplete="off" style="margin-bottom:8px">
    <div class="chip-scroll" style="margin-bottom:8px">
      <button class="chip${panFilter === 'all' ? ' active' : ''}" data-pf="all">Tất cả <span class="count">${all.length}</span></button>
      ${PAN_CATS.map((c) => `<button class="chip${panFilter === c ? ' active' : ''}" data-pf="${c}">${c} <span class="count">${all.filter((x) => x.cat === c).length}</span></button>`).join('')}
    </div>
    <div class="card">
      ${list.length ? `<ul class="list">${list.map((p) => `
        <li class="list-item">
          <div class="body">
            <div class="title">${esc(p.symptom)}</div>
            <div style="margin-top:4px;font-size:13.5px;color:var(--green)">✓ ${esc(p.fix)}</div>
            <div class="meta"><span class="tag cyan">${esc(p.cat)}</span><span class="mono">${esc(fmtDateTime(p.ts))}</span></div>
          </div>
          <button class="del-btn" data-pdel="${p.id}" aria-label="Xóa pan">${TRASH}</button>
        </li>`).join('')}</ul>`
        : '<div class="empty"><span class="big">📒</span>Chưa có pan bệnh nào. Mỗi lần sửa xong 1 ca khó hãy lưu lại để lần sau xử lý trong 30 giây!</div>'}
    </div>`;
}

export function init() {
  renderLog();
  renderRepairs();
  renderPans();
  renderBookmarks();

  $('#pane-log').addEventListener('submit', (e) => {
    if (e.target.id !== 'log-form') return;
    e.preventDefault();
    const ta = $('#log-text');
    const qty = num($('#log-qty')?.value);
    const price = num($('#log-price')?.value);
    if (addLog(ta.value, logTag, { qty, price })) toast(`Đã thêm ${logTag}`);
    else toast('Nhập nội dung ghi chú trước');
    setTimeout(() => $('#log-text')?.focus(), 0);
  });
  $('#pane-log').addEventListener('keydown', (e) => {
    if (e.target.id === 'log-text' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $('#log-form').requestSubmit();
    }
  });
  $('#pane-log').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ltag]');
    if (t) {
      logTag = t.dataset.ltag;
      store.set('labLogTag', logTag);
      renderLog();
      return;
    }
    const f = e.target.closest('[data-lf]');
    if (f) { logFilter = f.dataset.lf; renderLog(); return; }
    const d = e.target.closest('[data-ldone]');
    if (d) {
      saveLogs(getLogs().map((l) => (l.id === d.dataset.ldone ? { ...l, done: !l.done } : l)));
      return;
    }
    const del = e.target.closest('[data-ldel]');
    if (del) { saveLogs(getLogs().filter((l) => l.id !== del.dataset.ldel)); toast('Đã xóa ghi chú'); return; }
    if (e.target.closest('#log-copy')) {
      const ok = await copyText(logsToMarkdown());
      toast(ok ? 'Đã copy Markdown — dán vào Notion / Obsidian / GitHub' : 'Không copy được');
      return;
    }
    if (e.target.closest('#bom-ai-gen')) {
      const desc = ($('#log-text')?.value || '').trim();
      if (!desc) { toast('Nhập mô tả đồ án vào ô trên trước (VD: Xe tự cân bằng STM32)'); $('#log-text')?.focus(); return; }
      const btn = $('#bom-ai-gen');
      btn.disabled = true;
      btn.textContent = '🤖 Đang lập BOM…';
      try {
        const prompt = `Lập danh sách 5–8 linh kiện chính cần mua tại Việt Nam cho đồ án Cơ điện tử sau: "${desc}".
Chỉ trả về JSON mảng thuần túy, KHÔNG markdown, KHÔNG giải thích, theo đúng định dạng:
[{"name":"Tên linh kiện","qty":1,"price":65000}]`;
        const raw = await callGemini(getSettings().geminiKey, prompt);
        const m = raw.match(/\[[\s\S]*\]/);
        const arr = JSON.parse(m ? m[0] : raw);
        if (!Array.isArray(arr) || !arr.length) throw new Error('Không phân tích được danh sách BOM');
        arr.slice(0, 10).forEach((x) => {
          if (x?.name) addLog(String(x.name), '#Mua_linh_kiện', { qty: Number(x.qty) || 1, price: Number(x.price) || 0 });
        });
        toast(`🤖 Đã thêm ${Math.min(10, arr.length)} linh kiện vào BOM!`);
      } catch (err) {
        toast(`Lỗi AI BOM: ${err.message}`);
      } finally {
        renderLog();
      }
      return;
    }
    if (e.target.closest('#log-clear-done')) saveLogs(getLogs().filter((l) => !l.done));
  });

  $('#pane-bookmarks').addEventListener('input', (e) => {
    if (e.target.id === 'bm-search') {
      bmQuery = e.target.value;
      const pos = e.target.selectionStart;
      renderBookmarks();
      const inp = $('#bm-search');
      if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    }
  });
  $('#pane-bookmarks').addEventListener('click', async (e) => {
    const f = e.target.closest('[data-bmf]');
    if (f) { bmFilter = f.dataset.bmf; renderBookmarks(); return; }
    const del = e.target.closest('[data-bmdel]');
    if (del) { removeBookmark(del.dataset.bmdel); toast('Đã xóa khỏi danh sách lưu'); return; }
    if (e.target.closest('#bm-copy')) {
      const ok = await copyText(bookmarksToMarkdown());
      toast(ok ? 'Đã copy Markdown danh sách bài' : 'Không copy được');
    }
  });

  // Sự kiện Sổ Sửa máy & Bảo hành
  $('#pane-repairs')?.addEventListener('submit', (e) => {
    if (e.target.id !== 'rep-form') return;
    e.preventDefault();
    const device = ($('#rep-dev')?.value || '').trim();
    const desc = ($('#rep-desc')?.value || '').trim();
    if (!device) { toast('Nhập tên máy / khách hàng trước'); return; }
    const price = num($('#rep-price')?.value);
    const warrantyM = Number($('#rep-wm')?.value || 0);
    const list = getRepairs();
    list.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      device, desc, price: Number.isFinite(price) ? price : 0, warrantyM,
      delivered: false, ts: Date.now(), deliveredAt: null,
    });
    saveRepairs(list);
    toast('Đã thêm đơn sửa máy');
  });
  $('#pane-repairs')?.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-rf]');
    if (f) { repFilter = f.dataset.rf; renderRepairs(); return; }
    const d = e.target.closest('[data-rdone]');
    if (d) {
      saveRepairs(getRepairs().map((r) => (r.id === d.dataset.rdone
        ? { ...r, delivered: !r.delivered, deliveredAt: !r.delivered ? Date.now() : null }
        : r)));
      return;
    }
    const del = e.target.closest('[data-rdel]');
    if (del) { saveRepairs(getRepairs().filter((r) => r.id !== del.dataset.rdel)); toast('Đã xóa đơn'); return; }
    const z = e.target.closest('[data-rzalo]');
    if (z) {
      const r = getRepairs().find((x) => x.id === z.dataset.rzalo);
      if (!r) return;
      const msg = [
        `📋 THÔNG BÁO SỬA CHỮA — ${r.device}`,
        r.desc ? `• Nội dung: ${r.desc}` : '',
        r.price ? `• Chi phí: ${Math.round(r.price).toLocaleString('vi-VN')} ₫` : '',
        r.warrantyM ? `• Bảo hành: ${r.warrantyM} tháng (từ ${new Date(r.deliveredAt || Date.now()).toLocaleDateString('vi-VN')})` : '',
        'Cảm ơn anh/chị đã tin tưởng!',
      ].filter(Boolean).join('\n');
      const ok = await copyText(msg);
      toast(ok ? 'Đã copy phiếu — dán gửi Zalo cho khách!' : 'Không copy được');
    }
  });

  // Sự kiện Sổ tay Pan bệnh đã sửa
  $('#pane-pans')?.addEventListener('submit', (e) => {
    if (e.target.id !== 'pan-form') return;
    e.preventDefault();
    const symptom = ($('#pan-sym')?.value || '').trim();
    const fix = ($('#pan-fix')?.value || '').trim();
    if (!symptom || !fix) { toast('Nhập đủ triệu chứng và cách sửa đã thành công'); return; }
    const list = getPans();
    list.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      cat: panCat, symptom, fix, ts: Date.now(),
    });
    savePans(list);
    toast('Đã lưu vào kho Pan bệnh!');
  });
  $('#pane-pans')?.addEventListener('input', (e) => {
    if (e.target.id === 'pan-search') {
      panQuery = e.target.value;
      const pos = e.target.selectionStart;
      renderPans();
      const inp = $('#pan-search');
      if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    }
  });
  $('#pane-pans')?.addEventListener('click', (e) => {
    const c = e.target.closest('[data-pcat]');
    if (c) {
      panCat = c.dataset.pcat;
      $$('#pan-cats button').forEach((b) => b.classList.toggle('active', b === c));
      return;
    }
    const f = e.target.closest('[data-pf]');
    if (f) { panFilter = f.dataset.pf; renderPans(); return; }
    const del = e.target.closest('[data-pdel]');
    if (del) { savePans(getPans().filter((p) => p.id !== del.dataset.pdel)); toast('Đã xóa pan bệnh'); }
  });
}
