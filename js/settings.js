// settings.js — Tab 4: Cài đặt (Vị trí, Radar, Nguồn RSS, Gemini BYOK, Theme, Export/Import JSON)
import { getSettings, saveSettings, exportAll, importAll, clearCache, DEFAULT_FEEDS, DEFAULT_LOCATION } from './storage.js';
import { searchPlace } from './telemetry.js';
import { $, $$, esc, toast, downloadFile, num } from './utils.js';

export function applyTheme(theme = getSettings().theme) {
  let resolved = theme;
  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#EEF2F7' : '#090D16');
}

export function render() {
  const pane = $('#pane-settings');
  if (!pane) return;
  const s = getSettings();
  pane.innerHTML = `
    <!-- Tiết kiệm 4G -->
    <div class="card settings-group">
      <div class="card-head"><div class="card-title">📶 Dữ liệu di động</div></div>
      <div class="switch-row">
        <div><div>Chế độ Tiết kiệm 4G</div><div class="small muted">Chỉ tải tin & thời tiết khi bạn chủ động bấm nút ↻</div></div>
        <label class="switch"><input type="checkbox" id="set-4g" ${s.saveData4G ? 'checked' : ''}><span></span></label>
      </div>
    </div>

    <!-- Vị trí & GPS -->
    <div class="card settings-group">
      <div class="card-head"><div class="card-title">📍 Vị trí & Thời tiết</div><span class="tag mono">${s.location.lat}, ${s.location.lon}</span></div>
      <div class="switch-row">
        <div><div>Ưu tiên GPS trình duyệt</div><div class="small muted">Nếu từ chối sẽ tự fallback về vị trí mặc định</div></div>
        <label class="switch"><input type="checkbox" id="set-gps" ${s.useGPS ? 'checked' : ''}><span></span></label>
      </div>
      <div class="row" style="margin-top:10px">
        <label class="field"><span>Tìm địa danh mặc định</span>
          <input class="input" id="geo-q" value="${esc(s.location.name)}" placeholder="VD: Hưng Yên, Hà Nội, Đà Nẵng…">
        </label>
        <button class="btn" id="geo-search" style="flex:0 0 auto">Tìm</button>
      </div>
      <ul class="geo-results" id="geo-results"></ul>
      <div class="grid-2" style="margin-top:8px">
        <label class="field"><span>Vĩ độ (Lat)</span><input class="input mono" id="set-lat" type="text" inputmode="decimal" value="${s.location.lat}"></label>
        <label class="field"><span>Kinh độ (Lon)</span><input class="input mono" id="set-lon" type="text" inputmode="decimal" value="${s.location.lon}"></label>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn sm primary" id="set-loc-save">Lưu vị trí mặc định</button>
        <button class="btn sm ghost" id="set-loc-reset">Mặc định (Hưng Yên)</button>
      </div>
    </div>

    <!-- Từ khóa Radar -->
    <div class="card settings-group">
      <div class="card-head"><div class="card-title">◉ Radar từ khóa đồ án</div><span class="tag cyan">${s.radar.length} từ khóa</span></div>
      <label class="field"><span>Phân tách bằng dấu phẩy (không phân biệt hoa thường)</span>
        <input class="input mono" id="set-radar" value="${esc(s.radar.join(', '))}" placeholder="STM32, ESP32, ROS2, FOC, PID, PLC">
      </label>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn sm primary" id="set-radar-save">Lưu từ khóa Radar</button>
      </div>
    </div>

    <!-- Nguồn tin RSS & Google News -->
    <div class="card settings-group">
      <div class="card-head"><div class="card-title">📡 Nguồn tin RSS & GitHub</div></div>
      <div id="set-feeds">
        ${s.feeds.map((f) => `
          <div class="feed-row">
            <label class="switch"><input type="checkbox" data-ftoggle="${esc(f.id)}" ${f.enabled !== false ? 'checked' : ''}><span></span></label>
            <div class="body">
              <div class="name">${esc(f.name)} <span class="tag">${esc(f.group)}</span></div>
              <div class="url">${esc(f.url)}</div>
            </div>
            <button class="del-btn" data-fdel="${esc(f.id)}" aria-label="Xóa nguồn">✕</button>
          </div>`).join('')}
      </div>
      <div class="row" style="margin-top:10px">
        <label class="field"><span>Thêm nguồn RSS mới (Tên)</span><input class="input" id="add-fname" placeholder="VD: Embedded.com"></label>
        <label class="field"><span>Nhóm</span>
          <select class="input" id="add-fgroup">
            <option value="embedded">Nhúng</option><option value="robotics">Robotics</option><option value="vn">Việt Nam</option>
          </select>
        </label>
      </div>
      <div class="row" style="margin-top:6px">
        <input class="input mono" id="add-furl" placeholder="https://example.com/feed.xml">
        <button class="btn primary" id="add-fbtn" style="flex:0 0 auto">＋ Thêm</button>
      </div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
        <div class="switch-row">
          <div><div>Google News RSS (Việt Nam)</div></div>
          <label class="switch"><input type="checkbox" id="set-gnews" ${s.gnewsEnabled ? 'checked' : ''}><span></span></label>
        </div>
        <label class="field" style="margin-top:6px"><span>Từ khóa Google News (dấu phẩy)</span>
          <input class="input" id="set-gterms" value="${esc((s.gnewsTerms || []).join(', '))}">
        </label>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn sm" id="set-gterms-save">Cập nhật Google News</button>
          <button class="btn sm ghost" id="set-feeds-reset">Khôi phục nguồn mặc định</button>
        </div>
      </div>
    </div>

    <!-- Cloudflare Worker (Tùy chọn cho iPhone dùng từ xa) -->
    <div class="card settings-group">
      <div class="card-head"><div class="card-title">☁️ Cloudflare Worker (Miễn phí cho iPhone)</div><span class="tag">${s.workerUrl ? 'Đã nối' : 'Local / Mặc định'}</span></div>
      <label class="field"><span>URL Worker của bạn (để trống nếu dùng server.py cục bộ)</span>
        <input class="input mono" id="set-worker" value="${esc(s.workerUrl || '')}" placeholder="https://mecha-hub.ten-ban.workers.dev">
      </label>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn sm primary" id="set-worker-save">Lưu Worker URL</button>
        <button class="btn sm ghost" id="set-worker-del" ${s.workerUrl ? '' : 'disabled'}>Xóa</button>
      </div>
      <p class="hint">Deploy miễn phí tệp <code>cloudflare/worker.js</code> (100.000 lượt/ngày) để mở web từ 4G iPhone vẫn đạt 9/9 nguồn RSS + giọng Cloud Audio.</p>
    </div>

    <!-- Gemini AI BYOK -->
    <div class="card settings-group">
      <div class="card-head"><div class="card-title">✨ Gemini AI (BYOK — Tùy chọn)</div><span class="tag">${s.geminiKey ? 'Đã cấu hình' : 'Chưa nhập'}</span></div>
      <div class="row">
        <label class="field"><span>Gemini API Key (lưu cục bộ tại máy bạn)</span>
          <input class="input mono" id="set-gkey" type="password" value="${esc(s.geminiKey || '')}" placeholder="AIzaSy…">
        </label>
        <button class="btn" id="set-gkey-eye" style="flex:0 0 auto" aria-label="Ẩn/hiện key">👁</button>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn sm primary" id="set-gkey-save">Lưu API Key</button>
        <button class="btn sm danger" id="set-gkey-del" ${s.geminiKey ? '' : 'disabled'}>Xóa Key</button>
      </div>
      <p class="hint">Gọi thẳng endpoint chính thức <code class="mono">gemini-2.5-flash</code>. Không nhập key mọi tính năng khác vẫn chạy bình thường.</p>
    </div>

    <!-- Giao diện -->
    <div class="card settings-group">
      <div class="card-head"><div class="card-title">🎨 Giao diện</div></div>
      <div class="seg" id="set-theme">
        <button data-th="dark" class="${s.theme === 'dark' ? 'active' : ''}">🌙 Tối</button>
        <button data-th="light" class="${s.theme === 'light' ? 'active' : ''}">☀️ Sáng</button>
        <button data-th="system" class="${s.theme === 'system' ? 'active' : ''}">📱 Hệ thống</button>
      </div>
    </div>

    <!-- Sao lưu & Khôi phục -->
    <div class="card settings-group">
      <div class="card-head"><div class="card-title">💾 Sao lưu & Khôi phục</div></div>
      <div class="btn-row">
        <button class="btn primary" id="btn-export">⬇ Export JSON</button>
        <button class="btn" id="btn-import">⬆ Import JSON</button>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn sm" id="btn-force-update">🔄 Cập nhật bản mới nhất</button>
        <button class="btn sm danger" id="btn-clear-cache">Xóa cache tin</button>
      </div>
      <p class="hint">Xuất toàn bộ cài đặt, Bookmarks và Lab Log ra tệp <code>.json</code> để không mất dữ liệu khi đổi iPhone hoặc xóa cache Safari.</p>
    </div>
  `;
}

export function init() {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getSettings().theme === 'system') applyTheme('system');
  });
  render();

  const pane = $('#pane-settings');
  pane.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'set-4g') {
      saveSettings({ saveData4G: t.checked });
      toast(t.checked ? 'Đã bật chế độ Tiết kiệm 4G' : 'Đã tắt Tiết kiệm 4G');
      return;
    }
    if (t.id === 'set-gps') {
      saveSettings({ useGPS: t.checked });
      toast(t.checked ? 'Đã bật ưu tiên GPS' : 'Dùng vị trí mặc định');
      return;
    }
    if (t.id === 'set-gnews') {
      saveSettings({ gnewsEnabled: t.checked });
      return;
    }
    if (t.dataset.ftoggle) {
      const feeds = getSettings().feeds.map((f) => (f.id === t.dataset.ftoggle ? { ...f, enabled: t.checked } : f));
      saveSettings({ feeds });
      return;
    }
    if (t.id === 'import-file' && t.files?.[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const n = importAll(JSON.parse(reader.result));
          toast(`Đã khôi phục ${n} mục dữ liệu — đang tải lại…`);
          setTimeout(() => location.reload(), 700);
        } catch (err) {
          toast(`Lỗi nhập tệp: ${err.message}`);
        }
      };
      reader.readAsText(t.files[0]);
      t.value = '';
    }
  });

  pane.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.id === 'geo-search') {
      const q = $('#geo-q').value.trim();
      if (!q) return;
      btn.disabled = true;
      try {
        const res = await searchPlace(q);
        const ul = $('#geo-results');
        ul.innerHTML = res.length
          ? res.map((p) => `<li><button data-pick-geo="${esc(JSON.stringify(p))}"><b>${esc(p.name)}</b><small>${esc(p.admin)} · ${p.lat}, ${p.lon}</small></button></li>`).join('')
          : '<li class="small muted">Không tìm thấy địa danh phù hợp.</li>';
      } catch (err) {
        toast(`Lỗi tìm địa danh: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
      return;
    }
    if (btn.dataset.pickGeo) {
      const p = JSON.parse(btn.dataset.pickGeo);
      saveSettings({ location: { name: p.name, lat: p.lat, lon: p.lon } });
      toast(`Đã chọn vị trí mặc định: ${p.name}`);
      render();
      return;
    }
    if (btn.id === 'set-loc-save') {
      const name = $('#geo-q').value.trim() || 'Vị trí tùy chỉnh';
      const lat = num($('#set-lat').value);
      const lon = num($('#set-lon').value);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) { toast('Tọa độ không hợp lệ'); return; }
      saveSettings({ location: { name, lat: +lat.toFixed(4), lon: +lon.toFixed(4) } });
      toast(`Đã lưu vị trí: ${name}`);
      render();
      return;
    }
    if (btn.id === 'set-loc-reset') {
      saveSettings({ location: { ...DEFAULT_LOCATION } });
      toast('Đã đặt lại vị trí mặc định: Hưng Yên');
      render();
      return;
    }
    if (btn.id === 'set-radar-save') {
      const radar = $('#set-radar').value.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
      saveSettings({ radar });
      toast(`Đã lưu ${radar.length} từ khóa Radar`);
      render();
      return;
    }
    if (btn.dataset.fdel) {
      const feeds = getSettings().feeds.filter((f) => f.id !== btn.dataset.fdel);
      saveSettings({ feeds });
      toast('Đã xóa nguồn tin');
      render();
      return;
    }
    if (btn.id === 'add-fbtn') {
      const name = $('#add-fname').value.trim();
      const url = $('#add-furl').value.trim();
      const group = $('#add-fgroup').value;
      if (!name || !/^https?:\/\//i.test(url)) { toast('Nhập tên và URL hợp lệ (http/https)'); return; }
      const feeds = [...getSettings().feeds, { id: `custom-${Date.now().toString(36)}`, name, url, group, lang: group === 'vn' ? 'vi' : 'en', enabled: true }];
      saveSettings({ feeds });
      toast(`Đã thêm nguồn ${name}`);
      render();
      return;
    }
    if (btn.id === 'set-gterms-save') {
      const gnewsTerms = $('#set-gterms').value.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
      saveSettings({ gnewsTerms });
      toast('Đã cập nhật từ khóa Google News');
      return;
    }
    if (btn.id === 'set-feeds-reset') {
      saveSettings({ feeds: JSON.parse(JSON.stringify(DEFAULT_FEEDS)) });
      toast('Đã khôi phục nguồn RSS mặc định');
      render();
      return;
    }
    if (btn.id === 'set-worker-save') {
      const url = $('#set-worker').value.trim().replace(/\/+$/, '');
      if (url && !/^https?:\/\//i.test(url)) { toast('URL Worker phải bắt đầu bằng https://'); return; }
      saveSettings({ workerUrl: url });
      toast(url ? 'Đã lưu Cloudflare Worker URL' : 'Đã đặt về chế độ mặc định');
      render();
      return;
    }
    if (btn.id === 'set-worker-del') {
      saveSettings({ workerUrl: '' });
      toast('Đã xóa Worker URL');
      render();
      return;
    }
    if (btn.id === 'set-gkey-eye') {
      const inp = $('#set-gkey');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      return;
    }
    if (btn.id === 'set-gkey-save') {
      saveSettings({ geminiKey: $('#set-gkey').value.trim() });
      toast('Đã lưu Gemini API Key cục bộ');
      render();
      return;
    }
    if (btn.id === 'set-gkey-del') {
      saveSettings({ geminiKey: '' });
      toast('Đã xóa Gemini API Key');
      render();
      return;
    }
    if (btn.dataset.th) {
      saveSettings({ theme: btn.dataset.th });
      applyTheme(btn.dataset.th);
      $$('#set-theme button').forEach((b) => b.classList.toggle('active', b === btn));
      return;
    }
    if (btn.id === 'btn-export') {
      const payload = exportAll({ includeKey: false });
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadFile(`mechatronics-hub-backup-${dateStr}.json`, JSON.stringify(payload, null, 2));
      toast('Đã tải xuống tệp sao lưu JSON');
      return;
    }
    if (btn.id === 'btn-import') {
      $('#import-file').click();
      return;
    }
    if (btn.id === 'btn-force-update') {
      toast('Đang xóa cache cũ & tải bản mới nhất…');
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch (_) { /* bỏ qua */ }
      location.reload();
      return;
    }
    if (btn.id === 'btn-clear-cache') {
      clearCache();
      toast('Đã xóa cache — đang đồng bộ lại…');
      window.dispatchEvent(new CustomEvent('force-refresh'));
    }
  });
}
