// telemetry.js — Thời tiết (Open-Meteo), AQI, cảnh báo ẩm linh kiện/in 3D, tỷ giá USD/CNY
import { store, cacheGet, cacheSet, isFresh, getSettings, sync } from './storage.js';
import { $, $$, esc, fetchJSON, fmtClock, timeAgo, num } from './utils.js';

/* ---------- Bảng mã WMO → tiếng Việt ---------- */
export const WMO = {
  0: ['Trời quang', '☀️', '🌙'], 1: ['Ít mây', '🌤️', '🌙'], 2: ['Mây rải rác', '⛅', '☁️'], 3: ['Nhiều mây, u ám', '☁️', '☁️'],
  45: ['Sương mù', '🌫️'], 48: ['Sương mù đóng băng', '🌫️'],
  51: ['Mưa phùn nhẹ', '🌦️'], 53: ['Mưa phùn', '🌦️'], 55: ['Mưa phùn dày', '🌧️'],
  56: ['Mưa phùn lạnh buốt', '🌧️'], 57: ['Mưa phùn băng giá', '🌧️'],
  61: ['Mưa nhỏ', '🌦️'], 63: ['Mưa vừa', '🌧️'], 65: ['Mưa to', '🌧️'],
  66: ['Mưa lạnh nhẹ', '🌧️'], 67: ['Mưa lạnh nặng hạt', '🌧️'],
  71: ['Tuyết nhẹ', '🌨️'], 73: ['Tuyết vừa', '🌨️'], 75: ['Tuyết dày', '❄️'], 77: ['Hạt tuyết', '🌨️'],
  80: ['Mưa rào nhẹ', '🌦️'], 81: ['Mưa rào', '🌧️'], 82: ['Mưa rào rất to', '⛈️'],
  85: ['Mưa tuyết nhẹ', '🌨️'], 86: ['Mưa tuyết to', '🌨️'],
  95: ['Dông', '⛈️'], 96: ['Dông kèm mưa đá nhẹ', '⛈️'], 99: ['Dông kèm mưa đá lớn', '⛈️'],
};
const DIRS = ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'];
const DIRS_SHORT = ['B', 'ĐB', 'Đ', 'ĐN', 'N', 'TN', 'T', 'TB'];
const dirIdx = (deg) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;
export const windDir = (deg) => DIRS[dirIdx(deg)];

/** Điểm sương — công thức Magnus (fallback khi API không trả dew_point_2m) */
export function dewPoint(t, rh) {
  const a = 17.62, b = 243.12;
  const g = Math.log(rh / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}

/** Đèn báo bảo quản phần cứng & nhựa in 3D */
export function humidityLevel(rh) {
  if (rh == null || Number.isNaN(rh)) return { level: 'unknown', led: '', title: 'Chưa có dữ liệu độ ẩm', sub: '' };
  if (rh < 60) return {
    level: 'ok', led: 'ok', title: 'Môi trường ổn định cho mạch & sợi in 3D',
    sub: 'Độ ẩm thấp: an toàn để hàn, nạp mạch và in PLA/PETG/TPU trực tiếp.',
  };
  if (rh <= 75) return {
    level: 'warn', led: 'warn', title: 'Độ ẩm trung bình — đóng kín hộp nhựa PLA/PETG',
    sub: 'Cất cuộn nhựa vào hộp kín có gói hút ẩm silica; hạn chế để bo mạch trần ngoài không khí.',
  };
  return {
    level: 'danger', led: 'danger', title: 'Cảnh báo ẩm cao — bật tủ chống ẩm bo mạch & sấy nhựa in 3D',
    sub: 'Sấy PLA ~45–50°C, PETG ~65°C, Nylon/TPU 70°C trong 4–6 giờ. Linh kiện MSL nhạy ẩm cần nướng trước khi hàn reflow.',
  };
}

export function aqiInfo(aqi) {
  if (aqi == null || Number.isNaN(aqi)) return { label: '—', cls: '' };
  if (aqi <= 50) return { label: 'Tốt', cls: 'green' };
  if (aqi <= 100) return { label: 'Trung bình', cls: 'amber' };
  if (aqi <= 150) return { label: 'Kém (nhạy cảm)', cls: 'amber' };
  if (aqi <= 200) return { label: 'Xấu', cls: 'red' };
  if (aqi <= 300) return { label: 'Rất xấu', cls: 'purple' };
  return { label: 'Nguy hại', cls: 'purple' };
}

/* ---------- Vị trí ---------- */
function getGPS() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Không hỗ trợ GPS'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false, timeout: 8000, maximumAge: 15 * 60 * 1000,
    });
  });
}

async function resolveLocation() {
  const s = getSettings();
  if (s.useGPS) {
    try {
      const pos = await getGPS();
      const lat = +pos.coords.latitude.toFixed(4);
      const lon = +pos.coords.longitude.toFixed(4);
      const name = store.get(`geo:${lat.toFixed(2)},${lon.toFixed(2)}`) || 'Vị trí GPS';
      return { lat, lon, name, source: 'gps' };
    } catch (e) {
      console.info('[telemetry] GPS không khả dụng → dùng vị trí mặc định:', e.message || e.code);
    }
  }
  return { ...s.location, source: 'default' };
}

async function reverseName(lat, lon) {
  const key = `geo:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = store.get(key);
  if (cached) return cached;
  try {
    const j = await fetchJSON(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=vi`, {}, 6000);
    const name = j.city || j.locality || j.principalSubdivision;
    if (name) { store.set(key, name); return name; }
  } catch (_) { /* tên vị trí không bắt buộc */ }
  return null;
}

/* ---------- API ---------- */
export async function fetchWeather(loc) {
  const q = `latitude=${loc.lat}&longitude=${loc.lon}&timezone=auto`;
  const fUrl = `https://api.open-meteo.com/v1/forecast?${q}`
    + '&current=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,is_day'
    + '&hourly=precipitation_probability'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset'
    + '&forecast_days=1&wind_speed_unit=kmh';
  const aUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=pm2_5,pm10,us_aqi`;

  const [fr, ar] = await Promise.allSettled([fetchJSON(fUrl, {}, 12000), fetchJSON(aUrl, {}, 12000)]);
  if (fr.status !== 'fulfilled') throw fr.reason;
  const f = fr.value;
  const c = f.current || {};
  const d = f.daily || {};
  let rainNow = null;
  if (f.hourly?.time && c.time) {
    const i = f.hourly.time.indexOf(`${c.time.slice(0, 13)}:00`);
    if (i >= 0) rainNow = f.hourly.precipitation_probability[i];
  }
  const aq = ar.status === 'fulfilled' ? ar.value.current || {} : {};
  if (ar.status !== 'fulfilled') console.warn('[telemetry] AQI lỗi:', ar.reason?.message);
  return {
    loc,
    t: c.temperature_2m, feels: c.apparent_temperature, rh: c.relative_humidity_2m,
    dew: c.dew_point_2m ?? dewPoint(c.temperature_2m, c.relative_humidity_2m),
    code: c.weather_code, isDay: c.is_day, wind: c.wind_speed_10m, windDeg: c.wind_direction_10m, gust: c.wind_gusts_10m,
    precip: c.precipitation,
    tmin: d.temperature_2m_min?.[0], tmax: d.temperature_2m_max?.[0],
    rainMax: d.precipitation_probability_max?.[0], rainNow,
    uv: d.uv_index_max?.[0], sunrise: d.sunrise?.[0], sunset: d.sunset?.[0],
    pm25: aq.pm2_5 ?? null, pm10: aq.pm10 ?? null, aqi: aq.us_aqi ?? null,
    obsTime: c.time, tz: f.timezone_abbreviation,
  };
}

export async function fetchFX() {
  const j = await fetchJSON('https://open.er-api.com/v6/latest/USD', {}, 12000);
  if (j.result !== 'success' || !j.rates?.VND || !j.rates?.CNY) throw new Error(j['error-type'] || 'Dữ liệu tỷ giá lỗi');
  return {
    usd: j.rates.VND,
    cny: j.rates.VND / j.rates.CNY,
    updated: j.time_last_update_unix * 1000,
  };
}

/* ---------- Render ---------- */
const f1 = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const f0 = (v) => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toString());

function renderWeather(entry, mode) {
  const body = $('#wx-body');
  if (!entry) {
    if (mode === 'error') body.innerHTML = `<div class="empty"><span class="big">📡</span>Không lấy được dữ liệu thời tiết. Kiểm tra kết nối mạng rồi bấm ↻.</div>`;
    return;
  }
  const w = entry.data;
  const info = WMO[w.code] || ['Không rõ', '🌡️'];
  const icon = w.isDay === 0 && info[2] ? info[2] : info[1];
  const aq = aqiInfo(w.aqi);
  const rain = w.rainNow != null ? `${w.rainNow}%` : '—';
  body.innerHTML = `
    <div class="wx-head">
      <div class="wx-icon" aria-hidden="true">${icon}</div>
      <div class="wx-temp">${f1(w.t)}<sup>°C</sup></div>
      <div class="wx-meta">
        <div class="wx-desc">${esc(info[0])}</div>
        <div class="wx-minmax">↓<b>${f0(w.tmin)}°</b> ↑<b>${f0(w.tmax)}°</b> · cảm giác ${f0(w.feels)}°</div>
        <div class="wx-loc">📍 ${esc(w.loc.name)} <span class="mono">${(+w.loc.lat).toFixed(4)}, ${(+w.loc.lon).toFixed(4)}</span></div>
      </div>
    </div>
    <div class="metric-grid">
      <div class="metric"><div class="k">Mưa (ngày)</div><div class="v">${f0(w.rainMax)}<small>%</small></div><div class="s">giờ này ${rain}</div></div>
      <div class="metric"><div class="k">Gió</div><div class="v">${f1(w.wind)}<small>km/h</small></div><div class="s">${esc(windDir(w.windDeg ?? 0))} · ${f0(w.windDeg)}°</div></div>
      <div class="metric"><div class="k">Độ ẩm</div><div class="v">${f0(w.rh)}<small>%</small></div><div class="s">RH tương đối</div></div>
      <div class="metric"><div class="k">Điểm sương</div><div class="v">${f1(w.dew)}<small>°C</small></div><div class="s">Δ ${f1(w.t - w.dew)}°C</div></div>
      <div class="metric"><div class="k">PM2.5</div><div class="v">${f1(w.pm25)}<small>µg/m³</small></div><div class="s">PM10 ${f0(w.pm10)}</div></div>
      <div class="metric"><div class="k">US AQI</div><div class="v">${f0(w.aqi)}</div><div class="s"><span class="tag ${aq.cls}" style="height:18px">${esc(aq.label)}</span></div></div>
    </div>
    <div class="card-foot">
      <span>${w.loc.source === 'gps' ? '🛰️ GPS' : '📌 Vị trí mặc định'} · UV max ${f1(w.uv)}</span>
      <span class="mono">${mode === 'stale' ? '⚠ cũ · ' : ''}${esc(timeAgo(entry.ts))}</span>
    </div>`;
  $('#wx-src').textContent = mode === 'stale' ? 'Cache' : 'Open-Meteo';
  renderHumidity(w);
}

function renderHumidity(w) {
  const h = humidityLevel(w.rh);
  const card = $('#hum-card');
  card.classList.remove('alert-ok', 'alert-warn', 'alert-danger');
  if (h.level !== 'unknown') card.classList.add(`alert-${h.level}`);
  const margin = w.t - w.dew;
  const condensation = margin < 3
    ? '<div class="alert-sub" style="color:var(--red)">⚠ Nhiệt độ sát điểm sương (&lt; 3°C): nguy cơ đọng sương lên bo mạch khi mang thiết bị lạnh vào phòng.</div>'
    : '';
  $('#hum-body').innerHTML = `
    <div class="alert-box">
      <i class="led big ${h.led}"></i>
      <div style="min-width:0">
        <div class="alert-title">${esc(h.title)}</div>
        <div class="alert-sub">${esc(h.sub)}</div>
        ${condensation}
      </div>
    </div>
    <div class="hum-bar" aria-label="Độ ẩm ${f0(w.rh)}%"><i style="left:${Math.min(100, Math.max(0, w.rh))}%"></i></div>
    <div class="hum-scale"><span>0%</span><span>60%</span><span>75%</span><span>100%</span></div>
    <div class="card-foot"><span>RH <b class="mono">${f0(w.rh)}%</b> · Điểm sương <b class="mono">${f1(w.dew)}°C</b></span><span class="mono">ngưỡng 60 / 75%</span></div>`;
}

/* ---------- Vòng đời ---------- */
let inflight = null;

async function updateWeather() {
  sync.begin('weather');
  try {
    const loc = await resolveLocation();
    const [data, name] = await Promise.all([
      fetchWeather(loc),
      loc.source === 'gps' && loc.name === 'Vị trí GPS' ? reverseName(loc.lat, loc.lon) : Promise.resolve(null),
    ]);
    if (name) data.loc.name = name;
    cacheSet('weather', data);
    renderWeather(cacheGet('weather'), 'live');
    sync.end('weather', true);
  } catch (e) {
    console.warn('[telemetry] Thời tiết lỗi:', e.message);
    const c = cacheGet('weather');
    renderWeather(c, c ? 'stale' : 'error');
    sync.end('weather', false);
  }
}

export function refresh(force = false) {
  if (inflight) return inflight;
  inflight = (async () => {
    if (force || !isFresh(cacheGet('weather'), 10 * 60e3)) {
      await updateWeather();
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

export function init() {
  // Hiển thị cache ngay lập tức (< 100ms), sau đó đồng bộ ngầm
  const w = cacheGet('weather');
  if (w) renderWeather(w, isFresh(w, 10 * 60e3) ? 'live' : 'stale');
}

/** Câu tóm tắt telemetry tự nhiên như phát thanh viên cho TTS */
export function speech() {
  const w = cacheGet('weather')?.data;
  if (!w) return [];
  const desc = (WMO[w.code] || ['thời tiết ổn định'])[0].toLowerCase();
  const h = humidityLevel(w.rh);
  const seg1 = `Thời tiết tại ${w.loc.name} lúc này ${desc}, nhiệt độ khoảng ${Math.round(w.t)} độ xê. Trong ngày dao động từ ${Math.round(w.tmin)} đến ${Math.round(w.tmax)} độ, khả năng mưa ${Math.round(w.rainMax ?? 0)} phần trăm, gió hướng ${windDir(w.windDeg ?? 0)}, tốc độ ${Math.round(w.wind)} ki lô mét mỗi giờ.`;
  const aqiText = w.aqi != null
    ? ` Chỉ số chất lượng không khí A Q I ở mức ${Math.round(w.aqi)}, đánh giá ${aqiInfo(w.aqi).label.replace(/\(.*\)/, '').trim().toLowerCase()}.`
    : '';
  const humClean = h.title.replace(/&/g, 'và').replace(/\//g, ' và ').replace(/—/g, ', ').replace(/3D/g, 'ba đê');
  const seg2 = `Về môi trường phòng mạch: độ ẩm tương đối ${Math.round(w.rh)} phần trăm, điểm sương ${Math.round(w.dew)} độ xê. ${humClean}.${aqiText}`;
  return [
    { text: seg1, sel: '#wx-card' },
    { text: seg2, sel: '#hum-card' },
  ];
}

/** Tìm kiếm địa danh (cho Cài đặt) — Open-Meteo Geocoding, miễn phí */
export async function searchPlace(name) {
  const j = await fetchJSON(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=vi&format=json`, {}, 10000);
  return (j.results || []).map((r) => ({
    name: r.name, lat: +r.latitude.toFixed(4), lon: +r.longitude.toFixed(4),
    admin: [r.admin1, r.country].filter(Boolean).join(', '),
  }));
}

export { DIRS_SHORT };
