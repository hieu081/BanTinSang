// tools.js — Bộ công cụ Lab Tools 100% offline
// Gồm: SVG Pinout, Giải mã màu điện trở cắm (4/5 vòng), Điện trở SMD/LED/Cầu phân áp,
// Định luật Ohm & Tỏa nhiệt LDO, Độ rộng mạch đồng PCB (IPC-2221), Shunt đo dòng,
// Pin LiPo/18650, Lọc RC & Timer PWM, Mô-men/RPM/Steps/mm/AWG, Encoder, Khí nén, Tra cứu linh kiện.
import { BOARDS, CONNECTORS } from './data/pinouts.js';
import { PARTS } from './data/parts.js';
import { getSettings } from './storage.js';
import { callGemini } from './feeds.js';
import * as tts from './tts.js';
import { $, $$, esc, num, toast } from './utils.js';

/* ==========================================================================
   1. HÀM TOÁN HỌC THUẦN (exported để kiểm thử & tái sử dụng)
   ========================================================================== */

const EIA96_VALS = [
  100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130,
  133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174,
  178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232,
  237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309,
  316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412,
  422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549,
  562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732,
  750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976,
];
const EIA96_MULT = {
  Z: 0.001, Y: 0.01, R: 0.01, X: 0.1, S: 0.1,
  A: 1, B: 10, H: 10, C: 100, D: 1000, E: 10000, F: 100000,
};

export function fmtOhm(ohms) {
  if (!Number.isFinite(ohms) || ohms < 0) return '—';
  if (ohms === 0) return '0 Ω';
  const clean = (v) => Number(v.toPrecision(4)).toString();
  if (ohms >= 1e6) return `${clean(ohms / 1e6)} MΩ`;
  if (ohms >= 1e3) return `${clean(ohms / 1e3)} kΩ`;
  if (ohms < 1) return `${clean(ohms * 1000)} mΩ`;
  return `${clean(ohms)} Ω`;
}

export function fmtFreq(hz) {
  if (!Number.isFinite(hz) || hz <= 0) return '—';
  const clean = (v) => Number(v.toPrecision(4)).toString();
  if (hz >= 1e6) return `${clean(hz / 1e6)} MHz`;
  if (hz >= 1e3) return `${clean(hz / 1e3)} kHz`;
  return `${clean(hz)} Hz`;
}

// Bảng màu điện trở cắm (4 vòng & 5 vòng)
export const RES_COLORS = [
  { id: 'black',  name: 'Đen (0)',       hex: '#111827', digit: 0, mult: 1,       tol: null },
  { id: 'brown',  name: 'Nâu (1)',       hex: '#78350F', digit: 1, mult: 10,      tol: 1 },
  { id: 'red',    name: 'Đỏ (2)',        hex: '#DC2626', digit: 2, mult: 100,     tol: 2 },
  { id: 'orange', name: 'Cam (3)',       hex: '#EA580C', digit: 3, mult: 1e3,     tol: null },
  { id: 'yellow', name: 'Vàng (4)',      hex: '#EAB308', digit: 4, mult: 1e4,     tol: null },
  { id: 'green',  name: 'Lục (5)',       hex: '#16A34A', digit: 5, mult: 1e5,     tol: 0.5 },
  { id: 'blue',   name: 'Lam (6)',       hex: '#2563EB', digit: 6, mult: 1e6,     tol: 0.25 },
  { id: 'violet', name: 'Tím (7)',       hex: '#7C3AED', digit: 7, mult: 1e7,     tol: 0.1 },
  { id: 'grey',   name: 'Xám (8)',       hex: '#64748B', digit: 8, mult: null,    tol: 0.05 },
  { id: 'white',  name: 'Trắng (9)',     hex: '#F8FAFC', digit: 9, mult: null,    tol: null },
  { id: 'gold',   name: 'Vàng kim (×0.1)', hex: '#D4AF37', digit: null, mult: 0.1,  tol: 5 },
  { id: 'silver', name: 'Bạc (×0.01)',   hex: '#CBD5E1', digit: null, mult: 0.01, tol: 10 },
];
const colorById = (id) => RES_COLORS.find((c) => c.id === id) || RES_COLORS[0];

/** Giải mã điện trở cắm 4 vòng hoặc 5 vòng */
export function decodeColorResistor({ bands = 4, b1, b2, b3, mult, tol }) {
  const c1 = colorById(b1);
  const c2 = colorById(b2);
  const c3 = colorById(b3);
  const cm = colorById(mult);
  const ct = colorById(tol);
  const sig = bands === 5
    ? c1.digit * 100 + c2.digit * 10 + c3.digit
    : c1.digit * 10 + c2.digit;
  const ohms = sig * (cm.mult ?? 1);
  const tolPct = ct.tol ?? 5;
  const minOhms = ohms * (1 - tolPct / 100);
  const maxOhms = ohms * (1 + tolPct / 100);
  return { ohms, formatted: fmtOhm(ohms), tolPct, minOhms, maxOhms };
}

/** Giải mã điện trở SMD: 3 số, 4 số, chữ R/K/M, EIA-96 */
export function decodeSMD(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) return null;
  if (/^0+$/.test(code)) return { ohms: 0, formatted: '0 Ω', type: 'Cầu nối 0 Ω (Jumper)', tol: '—' };

  const rMatch = code.match(/^(\d*)([RKM])(\d+)$/);
  if (rMatch) {
    const [, a, unit, b] = rMatch;
    const base = parseFloat(`${a || '0'}.${b}`);
    const mult = unit === 'R' ? 1 : unit === 'K' ? 1e3 : 1e6;
    const ohms = base * mult;
    return { ohms, formatted: fmtOhm(ohms), type: `Mã thập phân (${unit})`, tol: '±1% hoặc ±5%' };
  }

  const eia = code.match(/^(\d{2})([A-Z])$/);
  if (eia) {
    const idx = parseInt(eia[1], 10);
    const mult = EIA96_MULT[eia[2]];
    if (idx >= 1 && idx <= 96 && mult !== undefined) {
      const ohms = EIA96_VALS[idx - 1] * mult;
      return { ohms, formatted: fmtOhm(ohms), type: `Chuẩn EIA-96 (${EIA96_VALS[idx - 1]} × ${mult})`, tol: '±1%' };
    }
    return { error: 'Mã EIA-96 không hợp lệ (số 01–96, chữ Z/Y/R/X/S/A/B/H/C/D/E/F).' };
  }

  if (/^\d{3}$/.test(code)) {
    const sig = parseInt(code.slice(0, 2), 10);
    const exp = parseInt(code[2], 10);
    const ohms = sig * Math.pow(10, exp);
    return { ohms, formatted: fmtOhm(ohms), type: `Mã 3 số (${sig} × 10^${exp})`, tol: '±5%' };
  }

  if (/^\d{4}$/.test(code)) {
    const sig = parseInt(code.slice(0, 3), 10);
    const exp = parseInt(code[3], 10);
    const ohms = sig * Math.pow(10, exp);
    return { ohms, formatted: fmtOhm(ohms), type: `Mã 4 số (${sig} × 10^${exp})`, tol: '±1%' };
  }

  return { error: 'Không nhận diện được mã SMD. Thử: 103, 4701, 4R7, R22, 01C.' };
}

export function fmtCap(pf) {
  if (!Number.isFinite(pf) || pf <= 0) return '—';
  const clean = (v) => Number(v.toPrecision(4)).toString();
  if (pf >= 1e6) return `${clean(pf / 1e6)} µF (${clean(pf / 1e3)} nF)`;
  if (pf >= 1e3) return `${clean(pf / 1e3)} nF (${clean(pf / 1e6)} µF)`;
  return `${clean(pf)} pF`;
}

/** Giải mã mã tụ gốm/film 3 số (104 → 100 nF = 0.1 µF, 472 → 4.7 nF, 220 → 22 pF, 4R7 → 4.7 pF) */
export function decodeCapacitor(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) return null;
  const rM = code.match(/^(\d*)R(\d+)$/);
  if (rM) {
    const pf = parseFloat(`${rM[1] || '0'}.${rM[2]}`);
    return { pf, formatted: fmtCap(pf), note: 'Mã thập phân pF' };
  }
  const m = code.match(/^(\d{2})(\d)([A-Z]?)$/);
  if (m) {
    const sig = parseInt(m[1], 10);
    const exp = parseInt(m[2], 10);
    const tolMap = { J: '±5%', K: '±10%', M: '±20%', Z: '+80/-20%', G: '±2%', F: '±1%' };
    const pf = sig * Math.pow(10, exp);
    return { pf, formatted: fmtCap(pf), note: `(${sig} × 10^${exp} pF)${m[3] && tolMap[m[3]] ? ` · Sai số ${tolMap[m[3]]}` : ''}` };
  }
  if (/^\d{1,2}$/.test(code)) {
    const pf = parseInt(code, 10);
    return { pf, formatted: fmtCap(pf), note: 'Giá trị trực tiếp (pF)' };
  }
  return { error: 'Nhập mã tụ hợp lệ: VD 104, 103, 472, 220, 4R7, 104K.' };
}

// Bảng tra ren ốc hệ mét M2–M12 (bước ren, khoan taro, lỗ xuyên, chìa lục giác, lỗ ốc cấy nhiệt in 3D)
const METRIC_THREADS = [
  { sz: 'M2',   pitch: 0.4,  tap: 1.6,  clear: 2.2,  hex: 1.5, insert: '3.2' },
  { sz: 'M2.5', pitch: 0.45, tap: 2.05, clear: 2.7,  hex: 2.0, insert: '3.6' },
  { sz: 'M3',   pitch: 0.5,  tap: 2.5,  clear: 3.4,  hex: 2.5, insert: '4.0' },
  { sz: 'M4',   pitch: 0.7,  tap: 3.3,  clear: 4.5,  hex: 3.0, insert: '5.6' },
  { sz: 'M5',   pitch: 0.8,  tap: 4.2,  clear: 5.5,  hex: 4.0, insert: '6.4' },
  { sz: 'M6',   pitch: 1.0,  tap: 5.0,  clear: 6.6,  hex: 5.0, insert: '8.0' },
  { sz: 'M8',   pitch: 1.25, tap: 6.8,  clear: 9.0,  hex: 6.0, insert: '—' },
  { sz: 'M10',  pitch: 1.5,  tap: 8.5,  clear: 11.0, hex: 8.0, insert: '—' },
  { sz: 'M12',  pitch: 1.75, tap: 10.2, clear: 13.5, hex: 10,  insert: '—' },
];

const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
function nearestE24Up(ohms) {
  if (ohms <= 0) return 0;
  const exp = Math.floor(Math.log10(ohms));
  const pow = Math.pow(10, exp);
  const norm = ohms / pow;
  for (const v of E24) if (v >= norm - 1e-6) return v * pow;
  return 10 * pow;
}

export function calcLED(vs, vf, ifMa) {
  if (!(vs > 0) || !(vf >= 0) || !(ifMa > 0)) return { error: 'Nhập đủ V nguồn, Vf và dòng LED (> 0).' };
  if (vs <= vf) return { error: 'Nguồn V_s phải lớn hơn điện áp thuận V_f của LED.' };
  const iA = ifMa / 1000;
  const rExact = (vs - vf) / iA;
  const rStd = nearestE24Up(rExact);
  const iActualMa = ((vs - vf) / rStd) * 1000;
  const pMw = (vs - vf) * (iActualMa / 1000) * 1000;
  return { rExact, rStd, iActualMa, pMw };
}

export function calcDivider(vin, r1, r2) {
  if (!Number.isFinite(vin) || !(r1 >= 0) || !(r2 >= 0) || r1 + r2 <= 0) return { error: 'Nhập Vin và R1, R2 hợp lệ.' };
  const vout = vin * (r2 / (r1 + r2));
  const iMa = (vin / (r1 + r2)) * 1000;
  const pMw = vin * (vin / (r1 + r2)) * 1000;
  return { vout, iMa, pMw };
}

/** Định luật Ohm: nhập đúng 2 đại lượng bất kỳ trong {v, i, r, p} */
export function calcOhm({ v, i, r, p }) {
  const has = (x) => Number.isFinite(x) && x > 0;
  const count = [v, i, r, p].filter(has).length;
  if (count !== 2) return { error: 'Hãy nhập đúng 2 ô và để trống 2 ô còn lại.' };
  if (has(v) && has(i)) return { v, i, r: v / i, p: v * i };
  if (has(v) && has(r)) return { v, i: v / r, r, p: (v * v) / r };
  if (has(v) && has(p)) return { v, i: p / v, r: (v * v) / p, p };
  if (has(i) && has(r)) return { v: i * r, i, r, p: i * i * r };
  if (has(i) && has(p)) return { v: p / i, i, r: p / (i * i), p };
  return { v: Math.sqrt(p * r), i: Math.sqrt(p / r), r, p };
}

/** Độ rộng đường mạch đồng PCB theo chuẩn IPC-2221 */
export function calcPcbTrace(currentA, oz = 1, dT = 10) {
  if (!(currentA > 0) || !(oz > 0) || !(dT > 0)) return { error: 'Nhập dòng điện, độ dày đồng và ΔT > 0.' };
  const thicknessMil = oz * 1.378;
  // IPC-2221: Area (mil^2) = (I / (k * dT^0.44))^(1 / 0.725)
  const areaExt = Math.pow(currentA / (0.048 * Math.pow(dT, 0.44)), 1 / 0.725);
  const areaInt = Math.pow(currentA / (0.024 * Math.pow(dT, 0.44)), 1 / 0.725);
  const extMil = areaExt / thicknessMil;
  const intMil = areaInt / thicknessMil;
  return { extMil, extMm: extMil * 0.0254, intMil, intMm: intMil * 0.0254 };
}

/** Điện trở Shunt đo dòng + Khuếch đại (VD: INA240/INA219) */
export function calcShunt(iMaxA, rMohm, gain = 1) {
  if (!(iMaxA > 0) || !(rMohm > 0) || !(gain > 0)) return { error: 'Nhập dòng, R_shunt và Gain > 0.' };
  const rOhm = rMohm / 1000;
  const vShuntMv = iMaxA * rOhm * 1000;
  const pWatt = iMaxA * iMaxA * rOhm;
  const vAdcV = (vShuntMv / 1000) * gain;
  return { vShuntMv, pWatt, vAdcV };
}

const LIPO_CURVE = [
  [4.20, 100], [4.15, 95], [4.11, 90], [4.08, 85], [4.02, 80], [3.98, 75],
  [3.95, 70], [3.91, 65], [3.87, 60], [3.85, 55], [3.84, 50], [3.82, 45],
  [3.80, 40], [3.79, 35], [3.77, 30], [3.75, 25], [3.73, 20], [3.71, 15],
  [3.69, 10], [3.61, 5], [3.27, 1], [3.00, 0],
];

export function calcBattery(cells, vTotal, capMah, loadMa) {
  if (!(cells >= 1 && cells <= 6) || !(vTotal > 0)) return { error: 'Nhập điện áp pin hợp lệ.' };
  const vCell = vTotal / cells;
  let soc = 0;
  if (vCell >= 4.2) soc = 100;
  else if (vCell <= 3.0) soc = 0;
  else {
    for (let i = 0; i < LIPO_CURVE.length - 1; i++) {
      const [vHi, pHi] = LIPO_CURVE[i];
      const [vLo, pLo] = LIPO_CURVE[i + 1];
      if (vCell <= vHi && vCell >= vLo) {
        soc = pLo + ((vCell - vLo) / (vHi - vLo)) * (pHi - pLo);
        break;
      }
    }
  }
  let status = 'ok';
  let statusText = 'An toàn — mức hoạt động bình thường';
  if (vCell > 4.23) { status = 'danger'; statusText = 'QUÁ ÁP (> 4.23V/cell) — kiểm tra lại số cell (S) hoặc bộ sạc!'; }
  else if (vCell < 3.0) { status = 'danger'; statusText = 'NGUY HIỂM: Xả kiệt dưới 3.0V/cell — nguy cơ hỏng cell vĩnh viễn!'; }
  else if (vCell < 3.3) { status = 'danger'; statusText = 'CẢNH BÁO XẢ SÂU (< 3.3V/cell) — ngắt tải và sạc ngay!'; }
  else if (vCell < 3.6) { status = 'warn'; statusText = 'Pin yếu (< 3.6V/cell) — chuẩn bị sạc lại.'; }

  const hours = capMah > 0 && loadMa > 0 ? (capMah * (soc / 100) * 0.85) / loadMa : null;
  const fullHours = capMah > 0 && loadMa > 0 ? (capMah * 0.85) / loadMa : null;
  return { vCell, soc: Math.round(soc), status, statusText, hours, fullHours };
}

export function calcRC(rOhm, cFarad) {
  if (!(rOhm > 0) || !(cFarad > 0)) return { error: 'Nhập R và C > 0.' };
  const tau = rOhm * cFarad;
  const fc = 1 / (2 * Math.PI * tau);
  return { fc, tau };
}

export function calcPWM(clockMhz, targetHz) {
  if (!(clockMhz > 0) || !(targetHz > 0)) return { error: 'Nhập Clock (MHz) và tần số PWM (Hz) > 0.' };
  const fClk = clockMhz * 1e6;
  const totalTicks = fClk / targetHz;
  if (totalTicks < 2) return { error: 'Tần số PWM quá cao so với xung nhịp Clock.' };

  const minPscPlus1 = Math.max(1, Math.ceil(totalTicks / 65536));
  if (minPscPlus1 > 65536) return { error: 'Tần số PWM quá thấp cho Timer 16-bit.' };

  let best = null;
  const searchEnd = Math.min(65536, minPscPlus1 + 2500);
  for (let p1 = minPscPlus1; p1 <= searchEnd; p1++) {
    const a1 = Math.round(totalTicks / p1);
    if (a1 < 2 || a1 > 65536) continue;
    const fActual = fClk / (p1 * a1);
    const errPct = Math.abs(fActual - targetHz) / targetHz * 100;
    if (!best || errPct < best.errPct - 1e-9) {
      best = { psc: p1 - 1, arr: a1 - 1, fActual, errPct, resBits: Math.log2(a1) };
      if (errPct < 1e-6) break;
    }
  }
  return best || { error: 'Không tìm được cặp PSC/ARR phù hợp.' };
}

const KGFCM_PER_NM = 100 / 9.80665;
const OZIN_PER_NM = 141.611932666;

export function convertTorque(val, unit) {
  if (!Number.isFinite(val)) return null;
  let nm = val;
  if (unit === 'kgfcm') nm = val / KGFCM_PER_NM;
  else if (unit === 'ozin') nm = val / OZIN_PER_NM;
  return { nm, kgfcm: nm * KGFCM_PER_NM, ozin: nm * OZIN_PER_NM };
}

export function convertSpeed(val, unit) {
  if (!Number.isFinite(val)) return null;
  if (unit === 'rpm') return { rpm: val, rads: (val * 2 * Math.PI) / 60 };
  return { rpm: (val * 60) / (2 * Math.PI), rads: val };
}

export function calcStepsPerMm({ mode, fullSteps = 200, microstep = 16, lead = 8, teeth = 20, beltPitch = 2 }) {
  if (!(fullSteps > 0) || !(microstep > 0)) return { error: 'Thông số bước không hợp lệ.' };
  const stepsPerRev = fullSteps * microstep;
  let mmPerRev;
  if (mode === 'leadscrew') {
    if (!(lead > 0)) return { error: 'Bước tiến Vitme (lead) phải > 0.' };
    mmPerRev = lead;
  } else {
    if (!(teeth > 0) || !(beltPitch > 0)) return { error: 'Số răng pulley và bước đai phải > 0.' };
    mmPerRev = teeth * beltPitch;
  }
  const stepsPerMm = stepsPerRev / mmPerRev;
  return { stepsPerRev, mmPerRev, stepsPerMm, umPerStep: 1000 / stepsPerMm };
}

/** Tính tần số xung Encoder (PPR/CPR ↔ RPM) */
export function calcEncoder(ppr, modeX, rpm) {
  if (!(ppr > 0) || !(modeX > 0) || !(rpm >= 0)) return { error: 'Nhập PPR và RPM hợp lệ.' };
  const cpr = ppr * modeX;
  const freqHz = (cpr * rpm) / 60;
  const degPerCount = 360 / cpr;
  return { cpr, freqHz, degPerCount };
}

/** Tính lực Xi-lanh Khí nén (D piston mm, d cần mm, áp suất bar) */
export function calcPneumatic(boreMm, rodMm, bar) {
  if (!(boreMm > 0) || !(rodMm >= 0) || rodMm >= boreMm || !(bar > 0)) {
    return { error: 'Đường kính piston D phải lớn hơn đường kính cần d và áp suất > 0.' };
  }
  const pMpa = bar * 0.1; // 1 bar = 0.1 N/mm²
  const aPush = Math.PI * boreMm * boreMm / 4;
  const aPull = Math.PI * (boreMm * boreMm - rodMm * rodMm) / 4;
  const fPushN = pMpa * aPush;
  const fPullN = pMpa * aPull;
  return { fPushN, fPullN, fPushKgf: fPushN / 9.80665, fPullKgf: fPullN / 9.80665 };
}

/** Tìm Top 5 cặp điện trở E12 phổ thông ghép Song song (//) hoặc Nối tiếp (+) sát giá trị cần nhất */
const E12_BASE = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export function findResistorCombos(targetOhms) {
  if (!(targetOhms > 0) || targetOhms > 1e8) return [];
  const pool = [];
  const expCenter = Math.floor(Math.log10(targetOhms));
  for (let e = Math.max(0, expCenter - 2); e <= Math.min(7, expCenter + 2); e++) {
    const p = Math.pow(10, e);
    for (const v of E12_BASE) pool.push(Math.round(v * p * 100) / 100);
  }
  const results = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i; j < pool.length; j++) {
      const a = pool[i], b = pool[j];
      const ser = a + b;
      const errSer = Math.abs(ser - targetOhms) / targetOhms * 100;
      if (errSer < 6) results.push({ mode: '+', a, b, val: ser, errPct: errSer });
      const par = (a * b) / (a + b);
      const errPar = Math.abs(par - targetOhms) / targetOhms * 100;
      if (errPar < 6) results.push({ mode: '//', a, b, val: par, errPct: errPar });
    }
  }
  results.sort((x, y) => x.errPct - y.errPct);
  const out = [];
  const seen = new Set();
  for (const r of results) {
    const k = `${r.mode}:${r.a}:${r.b}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= 5) break;
  }
  return out;
}

/** Tính sụt áp dây đồng 2 chiều (đi + về): ΔV = 2 · ρ · L · I / A (ρ_Cu = 0.01724 Ω·mm²/m) */
export function calcVoltageDrop({ vSrc, currentA, lengthM, areaMm2 }) {
  if (!(vSrc > 0) || !(currentA > 0) || !(lengthM > 0) || !(areaMm2 > 0)) {
    return { error: 'Nhập nguồn, dòng tải, chiều dài dây và tiết diện > 0.' };
  }
  const rWire = (2 * 0.01724 * lengthM) / areaMm2;
  const vDrop = rWire * currentA;
  const pct = (vDrop / vSrc) * 100;
  const vLoad = Math.max(0, vSrc - vDrop);
  const pLoss = vDrop * currentA;
  return { rWire, vDrop, pct, vLoad, pLoss };
}

/** Tính đóng Pack Pin 18650 (Li-ion) hoặc LiFePO4 theo cấu hình nS mP */
export function calcBatteryPack({ chem = 'liion', s = 3, p = 2, cellMah = 2600, cellAmp = 10 }) {
  if (!(s >= 1) || !(p >= 1) || !(cellMah > 0) || !(cellAmp > 0)) {
    return { error: 'Nhập thông số cell và cấu hình S/P hợp lệ.' };
  }
  const vSpec = chem === 'lifepo4'
    ? { nom: 3.2, full: 3.65, cut: 2.5, label: 'LiFePO4 (3.2V)' }
    : { nom: 3.7, full: 4.2, cut: 3.2, label: 'Li-ion 18650 (3.7V)' };
  const totalCells = s * p;
  const vNom = s * vSpec.nom;
  const vFull = s * vSpec.full;
  const vCut = s * vSpec.cut;
  const capAh = (cellMah * p) / 1000;
  const wh = vNom * capAh;
  const maxA = cellAmp * p;
  const maxW = vNom * maxA;
  return { label: vSpec.label, totalCells, vNom, vFull, vCut, capAh, wh, maxA, maxW };
}

/** Tính nhanh chi phí In 3D (nhựa + tiền điện) */
export function calc3DPrintCost({ grams, pricePerKg = 280000, hours = 2, watts = 120, elecRate = 2500 }) {
  if (!(grams > 0) || !(pricePerKg >= 0) || !(hours >= 0) || !(watts >= 0)) {
    return { error: 'Nhập khối lượng nhựa (> 0) và thời gian in hợp lệ.' };
  }
  const plasticCost = (grams / 1000) * pricePerKg;
  const kwh = (watts * hours) / 1000;
  const elecCost = kwh * elecRate;
  const total = plasticCost + elecCost;
  return { plasticCost, kwh, elecCost, total };
}

const AWG_DATA = [
  { awg: 10, d: 2.588, area: 5.26, r: 3.28, iOpen: 55, iBundle: 15 },
  { awg: 12, d: 2.053, area: 3.31, r: 5.21, iOpen: 41, iBundle: 9.3 },
  { awg: 14, d: 1.628, area: 2.08, r: 8.29, iOpen: 32, iBundle: 5.9 },
  { awg: 16, d: 1.291, area: 1.31, r: 13.17, iOpen: 22, iBundle: 3.7 },
  { awg: 18, d: 1.024, area: 0.823, r: 20.95, iOpen: 16, iBundle: 2.3 },
  { awg: 20, d: 0.812, area: 0.518, r: 33.31, iOpen: 11, iBundle: 1.5 },
  { awg: 22, d: 0.644, area: 0.326, r: 52.96, iOpen: 7, iBundle: 0.92 },
  { awg: 24, d: 0.511, area: 0.205, r: 84.22, iOpen: 3.5, iBundle: 0.58 },
  { awg: 26, d: 0.405, area: 0.129, r: 133.9, iOpen: 2.2, iBundle: 0.36 },
  { awg: 28, d: 0.321, area: 0.081, r: 212.9, iOpen: 1.4, iBundle: 0.23 },
  { awg: 30, d: 0.255, area: 0.051, r: 338.6, iOpen: 0.86, iBundle: 0.14 },
];

/* ==========================================================================
   2. RENDER SVG PINOUT & SVG ĐIỆN TRỞ CẮM
   ========================================================================== */

let activeBoard = 'esp32';
let activePinId = 'D34';

function buildBoardSVG(board, selectedId) {
  const rows = Math.max(board.left.length, board.right.length);
  const rowH = 26;
  const topPad = 40;
  const botPad = 24;
  const h = topPad + rows * rowH + botPad;
  const w = 360;
  const bx = 114;
  const bw = 132;
  const by = 18;
  const bh = h - 30;

  const renderRow = (pin, idx, side) => {
    const y = topPad + idx * rowH + rowH / 2;
    const isLeft = side === 'left';
    const padX = isLeft ? bx + 13 : bx + bw - 13;
    const hitX = isLeft ? 2 : bx + bw - 26;
    const hitW = isLeft ? bx + 24 : w - (bx + bw - 26) - 2;
    const lblX = isLeft ? bx - 8 : bx + bw + 8;
    const anchor = isLeft ? 'end' : 'start';
    const sel = pin.id === selectedId ? ' sel' : '';
    return `
      <g class="pin-row${sel}" data-pin="${esc(pin.id)}" tabindex="0" role="button" aria-label="${esc(pin.label)} ${esc(pin.gpio)}">
        <rect class="pin-hit" x="${hitX}" y="${y - rowH / 2}" width="${hitW}" height="${rowH}" rx="6"/>
        <line x1="${isLeft ? bx - 3 : bx + bw + 3}" y1="${y}" x2="${padX}" y2="${y}" stroke="rgba(148,163,184,0.35)" stroke-width="1.5"/>
        <circle class="pad ${pin.cat}" cx="${padX}" cy="${y}" r="6.5"/>
        <text class="pin-label" x="${lblX}" y="${y - 1}" text-anchor="${anchor}">${esc(pin.label)}</text>
        <text class="pin-sub" x="${lblX}" y="${y + 10}" text-anchor="${anchor}">${esc(pin.sub)}</text>
      </g>`;
  };

  const midY = by + bh / 2;
  return `
  <svg class="pinout-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sơ đồ chân ${esc(board.name)}">
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="12" fill="${board.color}" stroke="${board.accent}" stroke-opacity="0.55" stroke-width="1.6"/>
    <rect x="${w / 2 - 22}" y="${by - 7}" width="44" height="18" rx="4" fill="#475569" stroke="#94A3B8" stroke-width="1.2"/>
    <text class="board-sub" x="${w / 2}" y="${by + 5}" text-anchor="middle">${esc(board.usbLabel)}</text>
    <rect x="${w / 2 - 34}" y="${midY - 38}" width="68" height="76" rx="6" fill="#0B1120" stroke="rgba(148,163,184,0.35)" stroke-width="1.2"/>
    <text class="board-text" x="${w / 2}" y="${midY - 2}" text-anchor="middle">${esc(board.chipLabel)}</text>
    <text class="board-sub" x="${w / 2}" y="${midY + 13}" text-anchor="middle">Chạm chân để tra</text>
    ${board.left.map((p, i) => renderRow(p, i, 'left')).join('')}
    ${board.right.map((p, i) => renderRow(p, i, 'right')).join('')}
  </svg>`;
}

function buildResistorSVG({ bands, b1, b2, b3, mult, tol }) {
  const bodyFill = bands === 5 ? '#3B82F6' : '#E5C697';
  const bodyStroke = bands === 5 ? '#1D4ED8' : '#B8935A';
  const c1 = colorById(b1).hex;
  const c2 = colorById(b2).hex;
  const c3 = colorById(b3).hex;
  const cm = colorById(mult).hex;
  const ct = colorById(tol).hex;

  const stripes = bands === 5
    ? `<rect x="108" y="18" width="13" height="44" fill="${c1}" rx="1"/>
       <rect x="134" y="21" width="13" height="38" fill="${c2}" rx="1"/>
       <rect x="160" y="21" width="13" height="38" fill="${c3}" rx="1"/>
       <rect x="186" y="21" width="13" height="38" fill="${cm}" rx="1"/>
       <rect x="226" y="18" width="13" height="44" fill="${ct}" rx="1"/>`
    : `<rect x="114" y="18" width="15" height="44" fill="${c1}" rx="1"/>
       <rect x="148" y="21" width="15" height="38" fill="${c2}" rx="1"/>
       <rect x="182" y="21" width="15" height="38" fill="${cm}" rx="1"/>
       <rect x="224" y="18" width="15" height="44" fill="${ct}" rx="1"/>`;

  return `
  <svg class="res-svg" viewBox="0 0 340 80" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hình minh họa điện trở cắm">
    <line x1="10" y1="40" x2="88" y2="40" stroke="#94A3B8" stroke-width="6" stroke-linecap="round"/>
    <line x1="252" y1="40" x2="330" y2="40" stroke="#94A3B8" stroke-width="6" stroke-linecap="round"/>
    <path d="M88,24 C88,18 96,15 106,15 L124,15 C132,15 136,20 142,20 L198,20 C204,20 208,15 216,15 L234,15 C244,15 252,18 252,24 L252,56 C252,62 244,65 234,65 L216,65 C208,65 204,60 198,60 L142,60 C136,60 132,65 124,65 L106,65 C96,65 88,62 88,56 Z"
      fill="${bodyFill}" stroke="${bodyStroke}" stroke-width="2"/>
    ${stripes}
    <rect x="92" y="22" width="156" height="6" rx="3" fill="rgba(255,255,255,0.22)"/>
  </svg>`;
}

function renderPinout() {
  const board = BOARDS[activeBoard];
  const allPins = [...board.left, ...board.right];
  let pin = allPins.find((p) => p.id === activePinId);
  if (!pin) { pin = allPins[0]; activePinId = pin.id; }

  $('#pinout-sub').textContent = board.subtitle;
  $('#pinout-svg-wrap').innerHTML = buildBoardSVG(board, pin.id);
  $('#pinout-legend').innerHTML = board.legend.map((l) => `<span><i class="${l.cls}"></i>${esc(l.label)}</span>`).join('');

  const warns = pin.warnings?.length
    ? `<ul class="warn-list">${pin.warnings.map((w) => `<li class="${w.level}"><b>${esc(w.title)}</b>${esc(w.text)}</li>`).join('')}</ul>`
    : '<p class="small" style="color:var(--green);margin:10px 0 0">✓ Không có cảnh báo xung đột đặc biệt trên chân này.</p>';

  $('#pinout-detail').innerHTML = `
    <div class="pd-head">
      <span class="pd-label">${esc(pin.label)}</span>
      <span class="pd-name">${esc(pin.gpio)}</span>
      <span class="tag ${/5V-Tolerant/i.test(pin.voltage) ? 'green' : /ONLY/i.test(pin.voltage) ? 'red' : 'cyan'}">${esc(pin.voltage)}</span>
    </div>
    <p class="pd-desc">${esc(pin.desc)}</p>
    <dl class="pd-kv"><dt>Chức năng</dt><dd>${esc(pin.funcs.join(' · '))}</dd></dl>
    ${warns}`;

  $('#pinout-notes').innerHTML = board.notes.map((n) => `<li>${esc(n)}</li>`).join('');
}

/* ==========================================================================
   3. DỰNG GIAO DIỆN TAB 3 (LAB TOOLS)
   ========================================================================== */

const optList = (filterFn, selectedId) => RES_COLORS.filter(filterFn)
  .map((c) => `<option value="${c.id}"${c.id === selectedId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');

export function init() {
  const root = $('#tools-root');
  if (!root) return;

  root.innerHTML = `
    <!-- 0. SOI LINH KIỆN & ĐỌC MẠCH BẰNG CAMERA AI -->
    <details class="acc" id="tool-vision">
      <summary>
        <span class="ico">📸</span>
        <span>Soi linh kiện &amp; Đọc mạch (Camera AI)<span class="sub">Chụp IC chữ mờ · Đọc vòng màu · Kiểm tra sơ đồ</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <input type="file" id="vis-file" accept="image/*" capture="environment" hidden>
        <label class="field" style="margin-bottom:8px"><span>Ghi chú muốn hỏi AI (tùy chọn)</span>
          <input class="input" id="vis-note" placeholder="VD: Con IC này tên gì, thứ tự chân, cách đo sống/chết?">
        </label>
        <div class="btn-row">
          <button class="btn primary" id="vis-pick">📷 Chụp / Chọn ảnh linh kiện</button>
          <button class="btn" id="vis-speak" hidden>🔊 Nghe AI đọc</button>
        </div>
        <img id="vis-preview" hidden alt="Ảnh linh kiện" style="width:100%;max-height:220px;object-fit:contain;border-radius:10px;margin-top:10px;border:1px solid var(--border)">
        <div class="result" id="vis-out" style="font-family:var(--font);font-size:13.5px;line-height:1.5">
          <span class="muted">Chụp ảnh linh kiện, điện trở hoặc góc bo mạch — ảnh được nén nhỏ (&lt;120 KB) để tiết kiệm 4G rồi gửi Gemini 3.8 Flash phân tích.</span>
        </div>
      </div>
    </details>

    <!-- 0b. TRA NHANH CHÂN & MÃ THAY THẾ LINH KIỆN PHỔ THÔNG -->
    <details class="acc" id="tool-parts">
      <summary>
        <span class="ico">🔌</span>
        <span>Tra chân &amp; Mã thay thế Linh kiện (Offline)<span class="sub">24 IC/MOSFET/BJT phổ biến: IRFZ44N, LM317, 7805…</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <input class="input mono" id="parts-q" placeholder="Gõ mã: IRFZ44N, IRLZ44N, LM317, 2N2222, PC817, TMC2209…" autocomplete="off">
        <div class="chips" style="margin-top:8px">
          <button class="chip" data-pq="IRFZ44N">IRFZ44N</button>
          <button class="chip" data-pq="IRLZ44N">IRLZ44N</button>
          <button class="chip" data-pq="LM317">LM317</button>
          <button class="chip" data-pq="AMS1117">AMS1117</button>
          <button class="chip" data-pq="2N2222">2N2222A</button>
          <button class="chip" data-pq="PC817">PC817</button>
          <button class="chip" data-pq="TMC2209">TMC2209</button>
        </div>
        <div id="parts-list" style="margin-top:10px"></div>
      </div>
    </details>

    <!-- 1. SƠ ĐỒ CHÂN TƯƠNG TÁC -->
    <details class="acc" open id="tool-pinout">
      <summary>
        <span class="ico">🔌</span>
        <span>Sơ đồ chân tương tác (SVG Pinout)<span class="sub" id="pinout-sub">ESP32 · STM32 Blue Pill · Arduino Nano</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <div class="seg" id="board-seg">
          <button data-board="esp32" class="active">ESP32</button>
          <button data-board="stm32">STM32</button>
          <button data-board="nano">Nano</button>
          <button data-board="pico">RPi Pico</button>
        </div>
        <div class="pinout-wrap" id="pinout-svg-wrap"></div>
        <div class="legend" id="pinout-legend"></div>
        <div class="pin-detail" id="pinout-detail"></div>
        <ul class="board-notes" id="pinout-notes"></ul>
        <div class="tool-block" style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-strong)">
          <h4>Đầu nối chuẩn hay quên (SWD · USB-C · RS-485)</h4>
          ${CONNECTORS.map((c) => `
            <div class="result" style="margin-top:8px">
              <div style="font-weight:700;color:var(--cyan);margin-bottom:4px;font-family:var(--font)">${esc(c.name)}</div>
              ${c.pins.map(([k, v]) => `<div class="line"><span>${esc(k)}</span><span style="text-align:right;font-family:var(--font);font-size:12.5px">${esc(v)}</span></div>`).join('')}
            </div>`).join('')}
        </div>
      </div>
    </details>

    <!-- 2. GIẢI MÃ MÀU ĐIỆN TRỞ CẮM (4/5 VÒNG) -->
    <details class="acc" id="tool-rescolor">
      <summary>
        <span class="ico">🎨</span>
        <span>Giải mã màu Điện trở cắm (4/5 vòng)<span class="sub">Trực quan SVG · Sai số · Dải Min–Max</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <div class="seg" id="res-bands-seg" style="margin-bottom:10px">
          <button data-bands="4" class="active">4 vòng (Carbon ±5%)</button>
          <button data-bands="5">5 vòng (Metal Film ±1%)</button>
        </div>
        <div class="res-svg-wrap" id="res-svg-wrap"></div>
        <div class="band-row">
          <label class="field"><span>Vòng 1 (Chữ số 1)</span><select class="input" id="rc-b1">${optList((c) => c.digit != null && c.digit > 0, 'brown')}</select></label>
          <label class="field"><span>Vòng 2 (Chữ số 2)</span><select class="input" id="rc-b2">${optList((c) => c.digit != null, 'black')}</select></label>
          <label class="field" id="rc-b3-wrap" hidden><span>Vòng 3 (Chữ số 3)</span><select class="input" id="rc-b3">${optList((c) => c.digit != null, 'black')}</select></label>
          <label class="field"><span>Hệ số nhân</span><select class="input" id="rc-mult">${optList((c) => c.mult != null, 'orange')}</select></label>
          <label class="field"><span>Vòng sai số</span><select class="input" id="rc-tol">${optList((c) => c.tol != null, 'gold')}</select></label>
        </div>
        <div class="chips" style="margin-top:8px">
          <button class="chip" data-rpreset="4,red,red,black,brown,gold">220 Ω</button>
          <button class="chip" data-rpreset="4,brown,black,black,red,gold">1 kΩ</button>
          <button class="chip" data-rpreset="4,yellow,violet,black,red,gold">4.7 kΩ</button>
          <button class="chip" data-rpreset="4,brown,black,black,orange,gold">10 kΩ</button>
          <button class="chip" data-rpreset="5,brown,black,black,red,brown">10 kΩ (1%)</button>
        </div>
        <div class="result" id="res-color-out"></div>
      </div>
    </details>

    <!-- 3. ĐIỆN TRỞ SMD, LED & CẦU PHÂN ÁP -->
    <details class="acc" id="tool-smd">
      <summary>
        <span class="ico">⚡</span>
        <span>Điện trở SMD, LED & Cầu phân áp<span class="sub">Mã 3/4 số, 4R7, EIA-96 · Trở LED · Vout</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <div class="tool-block">
          <h4>Giải mã điện trở SMD</h4>
          <label class="field"><span>Mã in trên điện trở</span>
            <input class="input mono" id="smd-code" value="103" placeholder="VD: 103, 4701, 4R7, 01C" autocomplete="off">
          </label>
          <div class="chips" style="margin-top:8px">
            <button class="chip" data-smd="103">103</button>
            <button class="chip" data-smd="4701">4701</button>
            <button class="chip" data-smd="4R7">4R7</button>
            <button class="chip" data-smd="01C">01C</button>
            <button class="chip" data-smd="68X">68X</button>
          </div>
          <div class="result" id="smd-out"></div>
        </div>

        <div class="tool-block">
          <h4>🔍 Tìm cặp Điện trở ghép Song song / Nối tiếp</h4>
          <div class="input-unit">
            <input class="input mono" id="rcmb-val" type="text" inputmode="decimal" value="750" placeholder="Giá trị cần (VD: 750)">
            <select class="input mono" id="rcmb-unit"><option value="1" selected>Ω</option><option value="1000">kΩ</option><option value="1000000">MΩ</option></select>
          </div>
          <div class="chips" style="margin-top:8px">
            <button class="chip" data-rcmb="750,1">750 Ω</button>
            <button class="chip" data-rcmb="3.3,1000">3.3 kΩ</button>
            <button class="chip" data-rcmb="2.5,1000">2.5 kΩ</button>
            <button class="chip" data-rcmb="150,1">150 Ω</button>
          </div>
          <div class="result" id="rcmb-out"></div>
        </div>

        <div class="tool-block">
          <h4>Giải mã mã Tụ điện (104, 472, 220…)</h4>
          <label class="field"><span>Mã in trên thân tụ</span>
            <input class="input mono" id="cap-code" value="104" placeholder="VD: 104, 103, 472, 220, 4R7" autocomplete="off">
          </label>
          <div class="chips" style="margin-top:8px">
            <button class="chip" data-cap="220">220</button>
            <button class="chip" data-cap="102">102</button>
            <button class="chip" data-cap="472">472</button>
            <button class="chip" data-cap="104">104</button>
            <button class="chip" data-cap="105">105</button>
          </div>
          <div class="result" id="cap-out"></div>
        </div>

        <div class="tool-block">
          <h4>Trở hạn dòng LED</h4>
          <div class="grid-3">
            <label class="field"><span>V nguồn (V)</span><input class="input mono" id="led-vs" type="text" inputmode="decimal" value="5"></label>
            <label class="field"><span>V thuận Vf (V)</span><input class="input mono" id="led-vf" type="text" inputmode="decimal" value="2.0"></label>
            <label class="field"><span>Dòng If (mA)</span><input class="input mono" id="led-if" type="text" inputmode="decimal" value="15"></label>
          </div>
          <div class="result" id="led-out"></div>
        </div>

        <div class="tool-block">
          <h4>Cầu phân áp (Voltage Divider)</h4>
          <div class="grid-3">
            <label class="field"><span>Vin (V)</span><input class="input mono" id="div-vin" type="text" inputmode="decimal" value="5"></label>
            <label class="field"><span>R1 trên (kΩ)</span><input class="input mono" id="div-r1" type="text" inputmode="decimal" value="1"></label>
            <label class="field"><span>R2 dưới (kΩ)</span><input class="input mono" id="div-r2" type="text" inputmode="decimal" value="2"></label>
          </div>
          <div class="formula">V_out = V_in × R2 / (R1 + R2)</div>
          <div class="result" id="div-out"></div>
        </div>
      </div>
    </details>

    <!-- 4. ĐỊNH LUẬT OHM, LDO & MẠCH IN PCB / SHUNT -->
    <details class="acc" id="tool-power">
      <summary>
        <span class="ico">🔥</span>
        <span>Định luật Ohm, LDO, Đường mạch PCB & Shunt<span class="sub">Tính V/I/R/P · IPC-2221 · Shunt đo dòng</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <div class="tool-block">
          <h4>Định luật Ohm (nhập đúng 2 ô bất kỳ)</h4>
          <div class="grid-2">
            <label class="field"><span>Điện áp V (V)</span><input class="input mono" id="ohm-v" type="text" inputmode="decimal" value="12" placeholder="trống"></label>
            <label class="field"><span>Dòng điện I (A)</span><input class="input mono" id="ohm-i" type="text" inputmode="decimal" value="0.5" placeholder="trống"></label>
            <label class="field"><span>Điện trở R (Ω)</span><input class="input mono" id="ohm-r" type="text" inputmode="decimal" placeholder="trống"></label>
            <label class="field"><span>Công suất P (W)</span><input class="input mono" id="ohm-p" type="text" inputmode="decimal" placeholder="trống"></label>
          </div>
          <div class="btn-row" style="margin-top:8px">
            <button class="btn sm ghost" id="ohm-clear">Xóa trống 4 ô</button>
          </div>
          <div class="result" id="ohm-out"></div>
        </div>

        <div class="tool-block">
          <h4>Độ rộng đường mạch đồng PCB (IPC-2221)</h4>
          <div class="grid-3">
            <label class="field"><span>Dòng tải (A)</span><input class="input mono" id="pcb-i" type="text" inputmode="decimal" value="3"></label>
            <label class="field"><span>Đồng (oz)</span>
              <select class="input mono" id="pcb-oz"><option value="1" selected>1 oz</option><option value="2">2 oz</option></select>
            </label>
            <label class="field"><span>Tăng nhiệt ΔT (°C)</span><input class="input mono" id="pcb-dt" type="text" inputmode="decimal" value="10"></label>
          </div>
          <div class="result" id="pcb-out"></div>
        </div>

        <div class="tool-block">
          <h4>Điện trở Shunt đo dòng & Khuếch đại ADC</h4>
          <div class="grid-3">
            <label class="field"><span>I_max (A)</span><input class="input mono" id="sh-i" type="text" inputmode="decimal" value="5"></label>
            <label class="field"><span>R_shunt (mΩ)</span><input class="input mono" id="sh-r" type="text" inputmode="decimal" value="10"></label>
            <label class="field"><span>Gain (INA)</span><input class="input mono" id="sh-g" type="text" inputmode="decimal" value="50"></label>
          </div>
          <div class="result" id="sh-out"></div>
        </div>

        <div class="tool-block">
          <h4>Công suất tỏa nhiệt IC ổn áp LDO</h4>
          <div class="grid-3">
            <label class="field"><span>Vin (V)</span><input class="input mono" id="ldo-in" type="text" inputmode="decimal" value="12"></label>
            <label class="field"><span>Vout (V)</span><input class="input mono" id="ldo-outv" type="text" inputmode="decimal" value="3.3"></label>
            <label class="field"><span>Dòng (mA)</span><input class="input mono" id="ldo-ma" type="text" inputmode="decimal" value="250"></label>
          </div>
          <div class="result" id="ldo-out"></div>
        </div>
      </div>
    </details>

    <!-- 5. PIN LIPO / 18650 & ĐÓNG PACK PIN -->
    <details class="acc" id="tool-bat">
      <summary>
        <span class="ico">🔋</span>
        <span>Pin LiPo / 18650 &amp; Đóng Pack nS mP<span class="sub">1S–6S % SoC · Ghép Pack 18650 / LiFePO4</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <div class="tool-block">
          <h4>Ước lượng % SoC Pin LiPo / 18650</h4>
          <div class="grid-2">
            <label class="field"><span>Số cell (S)</span>
              <select class="input mono" id="bat-s">
                <option value="1">1S (3.7V)</option>
                <option value="2">2S (7.4V)</option>
                <option value="3" selected>3S (11.1V)</option>
                <option value="4">4S (14.8V)</option>
                <option value="5">5S (18.5V)</option>
                <option value="6">6S (22.2V)</option>
              </select>
            </label>
            <label class="field"><span>Điện áp đo (V)</span><input class="input mono" id="bat-v" type="text" inputmode="decimal" value="11.4"></label>
          </div>
          <div class="grid-2" style="margin-top:8px">
            <label class="field"><span>Dung lượng (mAh)</span><input class="input mono" id="bat-cap" type="text" inputmode="decimal" value="2200"></label>
            <label class="field"><span>Dòng tải (mA)</span><input class="input mono" id="bat-load" type="text" inputmode="decimal" value="800"></label>
          </div>
          <div class="result" id="bat-out"></div>
        </div>

        <div class="tool-block">
          <h4>Tính đóng Pack Pin 18650 / LiFePO4 (nS mP)</h4>
          <div class="grid-3">
            <label class="field"><span>Loại cell</span>
              <select class="input" id="pk-chem"><option value="liion" selected>18650 (3.7V)</option><option value="lifepo4">LiFePO4 (3.2V)</option></select>
            </label>
            <label class="field"><span>Nối tiếp (S)</span><input class="input mono" id="pk-s" type="text" inputmode="decimal" value="3"></label>
            <label class="field"><span>Song song (P)</span><input class="input mono" id="pk-p" type="text" inputmode="decimal" value="2"></label>
          </div>
          <div class="grid-2" style="margin-top:8px">
            <label class="field"><span>Dung lượng 1 cell (mAh)</span><input class="input mono" id="pk-mah" type="text" inputmode="decimal" value="2600"></label>
            <label class="field"><span>Dòng xả 1 cell (A)</span><input class="input mono" id="pk-amp" type="text" inputmode="decimal" value="10"></label>
          </div>
          <div class="result" id="pk-out"></div>
        </div>
      </div>
    </details>

    <!-- 6. MẠCH LỌC RC, TIMER PWM & ENCODER -->
    <details class="acc" id="tool-rcpwm">
      <summary>
        <span class="ico">〰️</span>
        <span>Mạch lọc RC, Timer PWM & Encoder<span class="sub">Tần số cắt fc · PSC/ARR · Tần số xung Encoder</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <div class="tool-block">
          <h4>Mạch lọc thông thấp RC</h4>
          <div class="grid-2">
            <label class="field"><span>Điện trở R</span>
              <div class="input-unit">
                <input class="input mono" id="rc-r" type="text" inputmode="decimal" value="10">
                <select class="input mono" id="rc-ru"><option value="1">Ω</option><option value="1000" selected>kΩ</option><option value="1000000">MΩ</option></select>
              </div>
            </label>
            <label class="field"><span>Tụ điện C</span>
              <div class="input-unit">
                <input class="input mono" id="rc-c" type="text" inputmode="decimal" value="100">
                <select class="input mono" id="rc-cu"><option value="1e-12">pF</option><option value="1e-9" selected>nF</option><option value="1e-6">µF</option></select>
              </div>
            </label>
          </div>
          <div class="formula">f_c = 1 / (2π · R · C)</div>
          <div class="result" id="rc-out"></div>
        </div>

        <div class="tool-block">
          <h4>Tính Timer PWM (PSC / ARR 16-bit)</h4>
          <div class="grid-2">
            <label class="field"><span>Clock Timer (MHz)</span><input class="input mono" id="pwm-clk" type="text" inputmode="decimal" value="72"></label>
            <label class="field"><span>Tần số PWM (Hz)</span><input class="input mono" id="pwm-hz" type="text" inputmode="decimal" value="20000"></label>
          </div>
          <div class="chips" style="margin-top:8px">
            <button class="chip" data-pwm="72,50">Servo 50 Hz</button>
            <button class="chip" data-pwm="72,20000">Motor 20 kHz</button>
            <button class="chip" data-pwm="168,25000">F4 168M/25k</button>
          </div>
          <div class="result" id="pwm-out"></div>
        </div>

        <div class="tool-block">
          <h4>Tần số xung Encoder (PPR/CPR ↔ RPM)</h4>
          <div class="grid-3">
            <label class="field"><span>PPR</span><input class="input mono" id="enc-ppr" type="text" inputmode="decimal" value="600"></label>
            <label class="field"><span>Chế độ đọc</span>
              <select class="input mono" id="enc-x"><option value="1">1x</option><option value="2">2x</option><option value="4" selected>4x (Quad)</option></select>
            </label>
            <label class="field"><span>Tốc độ (RPM)</span><input class="input mono" id="enc-rpm" type="text" inputmode="decimal" value="1500"></label>
          </div>
          <div class="result" id="enc-out"></div>
        </div>
      </div>
    </details>

    <!-- 7. TRUYỀN ĐỘNG CƠ KHÍ, KHÍ NÉN & DÂY DẪN -->
    <details class="acc" id="tool-mech">
      <summary>
        <span class="ico">⚙️</span>
        <span>Cơ khí, Khí nén & Dây dẫn AWG<span class="sub">Mô-men · Steps/mm · Lực Xi-lanh · Bảng AWG</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <div class="tool-block">
          <h4>Đổi Mô-men xoắn & Tốc độ quay</h4>
          <div class="grid-2">
            <label class="field"><span>Mô-men xoắn</span>
              <div class="input-unit">
                <input class="input mono" id="tq-val" type="text" inputmode="decimal" value="1">
                <select class="input mono" id="tq-unit">
                  <option value="nm" selected>N·m</option>
                  <option value="kgfcm">kgf·cm</option>
                  <option value="ozin">oz·in</option>
                </select>
              </div>
            </label>
            <label class="field"><span>Tốc độ quay</span>
              <div class="input-unit">
                <input class="input mono" id="sp-val" type="text" inputmode="decimal" value="300">
                <select class="input mono" id="sp-unit">
                  <option value="rpm" selected>RPM</option>
                  <option value="rads">rad/s</option>
                </select>
              </div>
            </label>
          </div>
          <div class="result" id="mech-out"></div>
        </div>

        <div class="tool-block">
          <h4>Tính Steps/mm cho Động cơ bước</h4>
          <div class="seg" id="step-mode" style="margin-bottom:8px">
            <button data-smode="leadscrew" class="active">Vitme (Leadscrew)</button>
            <button data-smode="belt">Dây đai (GT2)</button>
          </div>
          <div class="grid-2">
            <label class="field"><span>Bước đủ / vòng</span>
              <select class="input mono" id="st-full"><option value="200" selected>200 (1.8°)</option><option value="400">400 (0.9°)</option></select>
            </label>
            <label class="field"><span>Vi bước (Microstep)</span>
              <select class="input mono" id="st-micro"><option value="1">1/1</option><option value="2">1/2</option><option value="4">1/4</option><option value="8">1/8</option><option value="16" selected>1/16</option><option value="32">1/32</option></select>
            </label>
          </div>
          <div id="st-lead-box" style="margin-top:8px">
            <label class="field"><span>Bước tiến Lead / vòng (mm) — VD: T8-8mm nhập 8</span>
              <input class="input mono" id="st-lead" type="text" inputmode="decimal" value="8">
            </label>
          </div>
          <div id="st-belt-box" class="grid-2" style="margin-top:8px" hidden>
            <label class="field"><span>Số răng Pulley</span><input class="input mono" id="st-teeth" type="text" inputmode="decimal" value="20"></label>
            <label class="field"><span>Bước đai (mm)</span><input class="input mono" id="st-pitch" type="text" inputmode="decimal" value="2"></label>
          </div>
          <div class="result" id="st-out"></div>
        </div>

        <div class="tool-block">
          <h4>Lực Xi-lanh Khí nén (Đẩy ra / Kéo về)</h4>
          <div class="grid-3">
            <label class="field"><span>Ø Piston D (mm)</span><input class="input mono" id="pn-d" type="text" inputmode="decimal" value="32"></label>
            <label class="field"><span>Ø Cần d (mm)</span><input class="input mono" id="pn-rod" type="text" inputmode="decimal" value="12"></label>
            <label class="field"><span>Áp suất (bar)</span><input class="input mono" id="pn-bar" type="text" inputmode="decimal" value="6"></label>
          </div>
          <div class="result" id="pn-out"></div>
        </div>

        <div class="tool-block">
          <h4>Bảng tra nhanh Ren ốc hệ mét M2–M12 (CAD & In 3D)</h4>
          <label class="field" style="margin-bottom:8px"><span>Tìm nhanh cỡ ren (VD: M3, M4, M5)</span>
            <input class="input mono" id="th-q" placeholder="Để trống xem toàn bảng M2–M12">
          </label>
          <div class="table-wrap">
            <table class="awg-table" id="th-table">
              <thead><tr><th>Ren</th><th>Bước</th><th>Khoan taro</th><th>Lỗ xuyên</th><th>Lục giác</th><th>Cấy 3D</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div class="tool-block">
          <h4>🖨️ Tính nhanh chi phí In 3D (Nhựa + Điện)</h4>
          <div class="grid-2">
            <label class="field"><span>Khối lượng nhựa (gram)</span><input class="input mono" id="p3d-g" type="text" inputmode="decimal" value="45"></label>
            <label class="field"><span>Giá cuộn nhựa (₫/kg)</span><input class="input mono" id="p3d-pkg" type="text" inputmode="decimal" value="280000"></label>
          </div>
          <div class="grid-3" style="margin-top:8px">
            <label class="field"><span>Giờ in</span><input class="input mono" id="p3d-h" type="text" inputmode="decimal" value="3.5"></label>
            <label class="field"><span>Công suất (W)</span><input class="input mono" id="p3d-w" type="text" inputmode="decimal" value="120"></label>
            <label class="field"><span>Giá điện (₫)</span><input class="input mono" id="p3d-el" type="text" inputmode="decimal" value="2500"></label>
          </div>
          <div class="result" id="p3d-out"></div>
        </div>

        <div class="tool-block">
          <h4>⚡ Tính sụt áp dây dẫn (Voltage Drop)</h4>
          <div class="grid-2">
            <label class="field"><span>Nguồn V (V)</span><input class="input mono" id="vd-v" type="text" inputmode="decimal" value="12"></label>
            <label class="field"><span>Dòng tải (A)</span><input class="input mono" id="vd-i" type="text" inputmode="decimal" value="5"></label>
          </div>
          <div class="grid-2" style="margin-top:8px">
            <label class="field"><span>Chiều dài 1 chiều (m)</span><input class="input mono" id="vd-l" type="text" inputmode="decimal" value="3"></label>
            <label class="field"><span>Cỡ dây đồng</span>
              <select class="input mono" id="vd-awg">
                ${AWG_DATA.map((a) => `<option value="${a.area}"${a.awg === 18 ? ' selected' : ''}>AWG ${a.awg} (${a.area} mm²)</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="result" id="vd-out"></div>
        </div>

        <div class="tool-block">
          <h4>Bảng tra nhanh Dây điện AWG ↔ mm²</h4>
          <label class="field" style="margin-bottom:8px"><span>Lọc theo dòng tải cần chịu (A) — tô sáng cỡ dây đạt chuẩn</span>
            <input class="input mono" id="awg-amp" type="text" inputmode="decimal" placeholder="VD: 5 (để trống xem toàn bảng)">
          </label>
          <div class="table-wrap">
            <table class="awg-table" id="awg-table">
              <thead><tr><th>AWG</th><th>Ø mm</th><th>mm²</th><th>mΩ/m</th><th>Rời (A)</th><th>Bó (A)</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    </details>

    <!-- 8. THANH NHẢY NHANH LINH KIỆN -->
    <details class="acc" open id="tool-launch">
      <summary>
        <span class="ico">🔎</span>
        <span>Tra cứu nhanh Linh kiện<span class="sub">AllDatasheet · LCSC · GitHub · YouTube</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="acc-body">
        <label class="field"><span>Mã linh kiện / IC / Module</span>
          <input class="input mono" id="part-q" placeholder="VD: DRV8825, MPU6050, IRF540N, AMS1117…" autocomplete="off">
        </label>
        <div class="chips" style="margin-top:8px">
          <button class="chip" data-part="DRV8825">DRV8825</button>
          <button class="chip" data-part="MPU6050">MPU6050</button>
          <button class="chip" data-part="IRF540N">IRF540N</button>
          <button class="chip" data-part="AMS1117">AMS1117</button>
          <button class="chip" data-part="TMC2209">TMC2209</button>
        </div>
        <div class="launch-grid">
          <button class="btn" data-launch="datasheet">📄 AllDatasheet</button>
          <button class="btn" data-launch="lcsc">🛒 LCSC</button>
          <button class="btn" data-launch="github">💻 GitHub</button>
          <button class="btn" data-launch="youtube">▶ YouTube</button>
        </div>
      </div>
    </details>
  `;

  bindVision();
  bindPartsLookup();
  bindPinout();
  bindResistorColor();
  bindCalcs();
  bindLauncher();
}

/* ---------- Camera AI Soi linh kiện (nén ảnh JPEG ≤ 1024px tiết kiệm 4G) ---------- */
function compressImageFile(file, maxSide = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Ảnh không hợp lệ'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL('image/jpeg', quality);
        resolve({ dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function bindVision() {
  const fileInp = $('#vis-file');
  const pickBtn = $('#vis-pick');
  const speakBtn = $('#vis-speak');
  const imgEl = $('#vis-preview');
  const out = $('#vis-out');
  let lastVisionText = '';

  pickBtn.addEventListener('click', () => {
    if (!getSettings().geminiKey) {
      toast('Hãy nhập Gemini API Key trong Tab 4 → Cài đặt trước');
      return;
    }
    fileInp.click();
  });

  speakBtn.addEventListener('click', () => {
    if (!lastVisionText) return;
    tts.playCustom([{ text: lastVisionText, display: 'Phân tích linh kiện từ Camera AI', sel: '#tool-vision' }]);
    toast('🎙️ Đang đọc kết quả soi linh kiện…');
  });

  fileInp.addEventListener('change', async () => {
    const f = fileInp.files?.[0];
    fileInp.value = '';
    if (!f) return;
    const key = getSettings().geminiKey;
    if (!key) { toast('Thiếu Gemini API Key'); return; }
    pickBtn.disabled = true;
    speakBtn.hidden = true;
    out.innerHTML = '<div class="skel skel-line"></div><div class="skel skel-line" style="width:80%"></div><div class="skel skel-line" style="width:60%"></div>';
    try {
      const { dataUrl, base64, mimeType } = await compressImageFile(f);
      imgEl.src = dataUrl;
      imgEl.hidden = false;
      const note = ($('#vis-note')?.value || '').trim();
      const prompt = `Bạn là kỹ sư điện tử Cơ điện tử đang soi ảnh cho Hiếu.
Hãy quan sát ảnh và trả lời thật súc tích, thực chiến bằng tiếng Việt (không dùng dấu sao ** đậm nhạt):
1) Nhận diện: Tên/mã linh kiện hoặc loại mạch trong ảnh (nếu chữ mờ hãy đọc hết mức có thể và nói rõ độ chắc chắn).
2) Thứ tự chân / Thông số chính (V, A, giá trị Ω/µF nếu là trở/tụ).
3) Cách kiểm tra nhanh sống/chết bằng đồng hồ vạn năng hoặc lưu ý tránh cháy mạch.
${note ? `Yêu cầu thêm của Hiếu: ${note}` : ''}`;
      const res = await callGemini(key, prompt, { data: base64, mimeType });
      lastVisionText = res.replace(/\*\*/g, '').trim();
      out.innerHTML = `<div style="white-space:pre-wrap">${esc(lastVisionText)}</div>`;
      speakBtn.hidden = false;
    } catch (e) {
      out.innerHTML = `<span class="err">Lỗi soi ảnh: ${esc(e.message)}</span>`;
    } finally {
      pickBtn.disabled = false;
    }
  });
}

/* ---------- Tra cứu chân & mã thay thế 24 linh kiện phổ thông ---------- */
function bindPartsLookup() {
  const inp = $('#parts-q');
  const box = $('#parts-list');
  const render = () => {
    const q = (inp.value || '').trim().toLowerCase();
    const list = q
      ? PARTS.filter((p) => `${p.name} ${p.type} ${p.pkg} ${p.equiv} ${p.spec}`.toLowerCase().includes(q))
      : PARTS.slice(0, 5);
    if (!list.length) {
      box.innerHTML = '<div class="empty">Không thấy mã này trong 24 linh kiện phổ thông — thử dùng mục "Tra cứu nhanh Linh kiện" bên dưới.</div>';
      return;
    }
    box.innerHTML = list.map((p) => `
      <div class="result" style="margin-top:8px;font-family:var(--font)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <b class="mono" style="font-size:16px;color:var(--cyan)">${esc(p.name)}</b>
          <span class="tag">${esc(p.type)} · ${esc(p.pkg)}</span>
        </div>
        <div style="margin-top:6px;font-size:13px"><b style="color:var(--green)">Chân:</b> <span class="mono">${esc(p.pins)}</span></div>
        <div style="margin-top:4px;font-size:12.5px;color:var(--text)"><b>Thông số:</b> ${esc(p.spec)}</div>
        <div style="margin-top:4px;font-size:12.5px;color:var(--amber)"><b>Thay thế:</b> ${esc(p.equiv)}</div>
        <div style="margin-top:4px;font-size:12px;color:var(--muted)">💡 ${esc(p.note)}</div>
      </div>`).join('');
  };
  inp.addEventListener('input', render);
  $$('[data-pq]').forEach((b) => b.addEventListener('click', () => { inp.value = b.dataset.pq; render(); }));
  render();
}

/* ---------- Binding sự kiện ---------- */

function bindPinout() {
  renderPinout();
  $('#board-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-board]');
    if (!b) return;
    activeBoard = b.dataset.board;
    activePinId = activeBoard === 'esp32' ? 'D34' : activeBoard === 'stm32' ? 'PA0' : activeBoard === 'pico' ? 'GP28' : 'A6';
    $$('#board-seg button').forEach((x) => x.classList.toggle('active', x === b));
    renderPinout();
  });
  $('#pinout-svg-wrap').addEventListener('click', (e) => {
    const row = e.target.closest('.pin-row');
    if (!row) return;
    activePinId = row.dataset.pin;
    renderPinout();
  });
  $('#pinout-svg-wrap').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.pin-row');
    if (!row) return;
    e.preventDefault();
    activePinId = row.dataset.pin;
    renderPinout();
  });
}

function bindResistorColor() {
  let bands = 4;
  const update = () => {
    const cfg = {
      bands,
      b1: $('#rc-b1').value,
      b2: $('#rc-b2').value,
      b3: $('#rc-b3').value,
      mult: $('#rc-mult').value,
      tol: $('#rc-tol').value,
    };
    $('#res-svg-wrap').innerHTML = buildResistorSVG(cfg);
    const r = decodeColorResistor(cfg);
    $('#res-color-out').innerHTML = `
      <span class="big">${esc(r.formatted)} <small style="font-size:14px;color:var(--muted)">±${r.tolPct}%</small></span>
      <div class="line"><span>Dải giá trị thực</span><span>${fmtOhm(r.minOhms)} – ${fmtOhm(r.maxOhms)}</span></div>`;
  };
  $('#res-bands-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bands]');
    if (!b) return;
    bands = Number(b.dataset.bands);
    $$('#res-bands-seg button').forEach((x) => x.classList.toggle('active', x === b));
    $('#rc-b3-wrap').hidden = bands !== 5;
    if (bands === 5 && $('#rc-tol').value === 'gold') $('#rc-tol').value = 'brown';
    update();
  });
  ['#rc-b1', '#rc-b2', '#rc-b3', '#rc-mult', '#rc-tol'].forEach((s) => $(s).addEventListener('change', update));
  $$('[data-rpreset]').forEach((btn) => btn.addEventListener('click', () => {
    const [n, b1, b2, b3, m, t] = btn.dataset.rpreset.split(',');
    bands = Number(n);
    $$('#res-bands-seg button').forEach((x) => x.classList.toggle('active', Number(x.dataset.bands) === bands));
    $('#rc-b3-wrap').hidden = bands !== 5;
    $('#rc-b1').value = b1;
    $('#rc-b2').value = b2;
    $('#rc-b3').value = b3;
    $('#rc-mult').value = m;
    $('#rc-tol').value = t;
    update();
  }));
  update();
}

function bindCalcs() {
  // 1. SMD
  const updateSMD = () => {
    const out = $('#smd-out');
    const r = decodeSMD($('#smd-code').value);
    if (!r) { out.innerHTML = '<span class="muted">Nhập mã in trên điện trở SMD…</span>'; return; }
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `<span class="big">${esc(r.formatted)}</span>
      <div class="line"><span>Định dạng</span><span>${esc(r.type)}</span></div>
      <div class="line"><span>Sai số thường gặp</span><span>${esc(r.tol)}</span></div>`;
  };
  $('#smd-code').addEventListener('input', updateSMD);
  $$('[data-smd]').forEach((b) => b.addEventListener('click', () => { $('#smd-code').value = b.dataset.smd; updateSMD(); }));
  updateSMD();

  // 1a. Resistor Combo Finder (Parallel / Series)
  const updateRCombo = () => {
    const out = $('#rcmb-out');
    const target = num($('#rcmb-val').value) * Number($('#rcmb-unit').value);
    const list = findResistorCombos(target);
    if (!list.length) { out.innerHTML = '<span class="err">Nhập giá trị hợp lệ (1 Ω – 100 MΩ).</span>'; return; }
    out.innerHTML = list.map((r) => `
      <div class="line">
        <span><b>${fmtOhm(r.a)} ${r.mode} ${fmtOhm(r.b)}</b></span>
        <span>${fmtOhm(r.val)} <small style="color:${r.errPct < 1 ? 'var(--green)' : 'var(--amber)'}">(${r.errPct.toFixed(2)}%)</small></span>
      </div>`).join('');
  };
  $('#rcmb-val').addEventListener('input', updateRCombo);
  $('#rcmb-unit').addEventListener('change', updateRCombo);
  $$('[data-rcmb]').forEach((b) => b.addEventListener('click', () => {
    const [v, u] = b.dataset.rcmb.split(',');
    $('#rcmb-val').value = v;
    $('#rcmb-unit').value = u;
    updateRCombo();
  }));
  updateRCombo();

  // 1b. Battery Pack nS mP
  const updatePack = () => {
    const out = $('#pk-out');
    const r = calcBatteryPack({
      chem: $('#pk-chem').value,
      s: Math.round(num($('#pk-s').value)),
      p: Math.round(num($('#pk-p').value)),
      cellMah: num($('#pk-mah').value),
      cellAmp: num($('#pk-amp').value),
    });
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `<span class="big cyan">${r.vNom.toFixed(1)}V · ${r.capAh.toFixed(1)}Ah <small style="font-size:13px;color:var(--muted)">(${r.wh.toFixed(0)} Wh)</small></span>
      <div class="line"><span>Tổng số cell cần mua</span><b>${r.totalCells} cell (${esc(r.label)})</b></div>
      <div class="line"><span>Sạc đầy / Ngắt xả</span><span>${r.vFull.toFixed(2)}V / ${r.vCut.toFixed(2)}V</span></div>
      <div class="line"><span>Dòng xả tối đa / Công suất</span><b style="color:var(--green)">${r.maxA.toFixed(0)} A (${r.maxW.toFixed(0)} W)</b></div>`;
  };
  $('#pk-chem').addEventListener('change', updatePack);
  ['#pk-s', '#pk-p', '#pk-mah', '#pk-amp'].forEach((s) => $(s).addEventListener('input', updatePack));
  updatePack();

  // 1c. 3D Print Cost
  const updateP3d = () => {
    const out = $('#p3d-out');
    const r = calc3DPrintCost({
      grams: num($('#p3d-g').value),
      pricePerKg: num($('#p3d-pkg').value),
      hours: num($('#p3d-h').value),
      watts: num($('#p3d-w').value),
      elecRate: num($('#p3d-el').value),
    });
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `<span class="big">${Math.round(r.total).toLocaleString('vi-VN')} ₫</span>
      <div class="line"><span>Tiền nhựa</span><span>${Math.round(r.plasticCost).toLocaleString('vi-VN')} ₫</span></div>
      <div class="line"><span>Tiền điện (${r.kwh.toFixed(2)} kWh)</span><span>${Math.round(r.elecCost).toLocaleString('vi-VN')} ₫</span></div>`;
  };
  ['#p3d-g', '#p3d-pkg', '#p3d-h', '#p3d-w', '#p3d-el'].forEach((s) => $(s).addEventListener('input', updateP3d));
  updateP3d();

  // 1d. Voltage Drop
  const updateVDrop = () => {
    const out = $('#vd-out');
    const r = calcVoltageDrop({
      vSrc: num($('#vd-v').value),
      currentA: num($('#vd-i').value),
      lengthM: num($('#vd-l').value),
      areaMm2: Number($('#vd-awg').value),
    });
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    const cls = r.pct > 5 ? 'red' : r.pct > 3 ? 'amber' : '';
    out.innerHTML = `<span class="big ${cls}">Sụt ${r.vDrop.toFixed(2)}V (${r.pct.toFixed(1)}%)</span>
      <div class="line"><span>Điện áp còn lại tại tải</span><b>${r.vLoad.toFixed(2)} V</b></div>
      <div class="line"><span>Điện trở dây 2 chiều / Hao phí</span><span>${r.rWire.toFixed(3)} Ω · ${r.pLoss.toFixed(2)} W</span></div>
      ${r.pct > 5 ? '<p class="small" style="color:var(--red);margin:6px 0 0">⚠ Sụt áp > 5% — nên tăng cỡ dây lớn hơn (AWG nhỏ hơn) để tránh reset MCU!</p>' : ''}`;
  };
  ['#vd-v', '#vd-i', '#vd-l'].forEach((s) => $(s).addEventListener('input', updateVDrop));
  $('#vd-awg').addEventListener('change', updateVDrop);
  updateVDrop();

  // 1b. Capacitor Code
  const updateCap = () => {
    const out = $('#cap-out');
    const r = decodeCapacitor($('#cap-code').value);
    if (!r) { out.innerHTML = '<span class="muted">Nhập mã tụ điện…</span>'; return; }
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `<span class="big cyan">${esc(r.formatted)}</span>
      <div class="line"><span>Diễn giải</span><span>${esc(r.note)}</span></div>`;
  };
  $('#cap-code').addEventListener('input', updateCap);
  $$('[data-cap]').forEach((b) => b.addEventListener('click', () => { $('#cap-code').value = b.dataset.cap; updateCap(); }));
  updateCap();

  // 15b. Metric Threads Table
  const renderThreads = () => {
    const q = ($('#th-q').value || '').trim().toUpperCase();
    const tb = $('#th-table tbody');
    tb.innerHTML = METRIC_THREADS.map((r) => {
      const hit = q && r.sz.toUpperCase().includes(q);
      return `<tr class="${hit ? 'hit' : ''}">
        <td><b>${r.sz}</b></td><td>${r.pitch}</td><td>Ø${r.tap}</td><td>Ø${r.clear}</td><td>${r.hex}mm</td><td>${r.insert === '—' ? '—' : `Ø${r.insert}`}</td>
      </tr>`;
    }).join('');
  };
  $('#th-q').addEventListener('input', renderThreads);
  renderThreads();

  // 2. LED
  const updateLED = () => {
    const out = $('#led-out');
    const r = calcLED(num($('#led-vs').value), num($('#led-vf').value), num($('#led-if').value));
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    const watt = r.pMw > 250 ? '½ W trở lên' : r.pMw > 125 ? '¼ W (0805/1206)' : '⅛ W (0603/0805)';
    out.innerHTML = `<span class="big cyan">${fmtOhm(r.rStd)} <small style="font-size:13px;color:var(--muted)">(chuẩn E24)</small></span>
      <div class="line"><span>Tính chính xác</span><span>${fmtOhm(r.rExact)}</span></div>
      <div class="line"><span>Dòng thực tế</span><span>${r.iActualMa.toFixed(1)} mA</span></div>
      <div class="line"><span>Công suất tỏa nhiệt</span><span>${r.pMw.toFixed(1)} mW → chọn ${watt}</span></div>`;
  };
  ['#led-vs', '#led-vf', '#led-if'].forEach((s) => $(s).addEventListener('input', updateLED));
  updateLED();

  // 3. Divider
  const updateDiv = () => {
    const out = $('#div-out');
    const r = calcDivider(num($('#div-vin').value), num($('#div-r1').value) * 1000, num($('#div-r2').value) * 1000);
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `<span class="big">${r.vout.toFixed(3)} V</span>
      <div class="line"><span>Dòng tĩnh qua cầu</span><span>${r.iMa.toFixed(2)} mA</span></div>
      <div class="line"><span>Công suất tiêu hao</span><span>${r.pMw.toFixed(2)} mW</span></div>`;
  };
  ['#div-vin', '#div-r1', '#div-r2'].forEach((s) => $(s).addEventListener('input', updateDiv));
  updateDiv();

  // 4. Ohm's Law
  const updateOhm = () => {
    const out = $('#ohm-out');
    const r = calcOhm({ v: num($('#ohm-v').value), i: num($('#ohm-i').value), r: num($('#ohm-r').value), p: num($('#ohm-p').value) });
    if (r.error) { out.innerHTML = `<span class="muted">${esc(r.error)}</span>`; return; }
    out.innerHTML = `
      <div class="line"><span>Điện áp V</span><b>${r.v.toFixed(3)} V</b></div>
      <div class="line"><span>Dòng điện I</span><b>${r.i.toFixed(4)} A (${(r.i * 1000).toFixed(1)} mA)</b></div>
      <div class="line"><span>Điện trở R</span><b>${fmtOhm(r.r)}</b></div>
      <div class="line"><span>Công suất P</span><b style="color:var(--cyan)">${r.p.toFixed(3)} W</b></div>`;
  };
  ['#ohm-v', '#ohm-i', '#ohm-r', '#ohm-p'].forEach((s) => $(s).addEventListener('input', updateOhm));
  $('#ohm-clear').addEventListener('click', () => {
    ['#ohm-v', '#ohm-i', '#ohm-r', '#ohm-p'].forEach((s) => { $(s).value = ''; });
    updateOhm();
  });
  updateOhm();

  // 5. PCB Trace Width (IPC-2221)
  const updatePcb = () => {
    const out = $('#pcb-out');
    const r = calcPcbTrace(num($('#pcb-i').value), Number($('#pcb-oz').value), num($('#pcb-dt').value));
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `<span class="big cyan">${r.extMm.toFixed(2)} mm <small style="font-size:13px;color:var(--muted)">(${r.extMil.toFixed(1)} mil) lớp ngoài</small></span>
      <div class="line"><span>Lớp trong (Internal)</span><span>${r.intMm.toFixed(2)} mm (${r.intMil.toFixed(1)} mil)</span></div>`;
  };
  ['#pcb-i', '#pcb-dt'].forEach((s) => $(s).addEventListener('input', updatePcb));
  $('#pcb-oz').addEventListener('change', updatePcb);
  updatePcb();

  // 6. Current Shunt
  const updateShunt = () => {
    const out = $('#sh-out');
    const r = calcShunt(num($('#sh-i').value), num($('#sh-r').value), num($('#sh-g').value));
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    const warn = r.vAdcV > 3.3 ? '<p class="warn small" style="margin:6px 0 0">⚠ V_ADC vượt 3.3V — giảm Gain hoặc giảm R_shunt cho STM32/ESP32.</p>' : '';
    out.innerHTML = `<span class="big">${r.vAdcV.toFixed(3)} V <small style="font-size:13px;color:var(--muted)">tại chân ADC</small></span>
      <div class="line"><span>Sụt áp trên Shunt</span><span>${r.vShuntMv.toFixed(2)} mV</span></div>
      <div class="line"><span>Công suất tỏa nhiệt Shunt</span><span>${r.pWatt.toFixed(3)} W (chọn ≥ ${(r.pWatt * 2).toFixed(2)} W)</span></div>${warn}`;
  };
  ['#sh-i', '#sh-r', '#sh-g'].forEach((s) => $(s).addEventListener('input', updateShunt));
  updateShunt();

  // 7. LDO Heat
  const updateLdo = () => {
    const out = $('#ldo-out');
    const vin = num($('#ldo-in').value), vout = num($('#ldo-outv').value), ma = num($('#ldo-ma').value);
    if (!(vin > vout) || !(vout > 0) || !(ma > 0)) { out.innerHTML = '<span class="err">Vin phải lớn hơn Vout và dòng > 0.</span>'; return; }
    const pW = (vin - vout) * (ma / 1000);
    const eff = (vout / vin) * 100;
    const cls = pW > 1.2 ? 'red' : pW > 0.6 ? 'amber' : '';
    const note = pW > 1.2 ? '⚠ QUÁ NÓNG với SOT-223 (AMS1117)! Bắt buộc chuyển sang mạch Buck DC-DC.' : pW > 0.6 ? '⚠ Khá nóng — cần vùng đồng tản nhiệt lớn.' : '✓ Mức nhiệt an toàn cho LDO.';
    out.innerHTML = `<span class="big ${cls}">${pW.toFixed(2)} W <small style="font-size:13px;color:var(--muted)">(hiệu suất ${eff.toFixed(0)}%)</small></span>
      <p class="small" style="margin:6px 0 0;color:${cls ? `var(--${cls})` : 'var(--green)'}">${note}</p>`;
  };
  ['#ldo-in', '#ldo-outv', '#ldo-ma'].forEach((s) => $(s).addEventListener('input', updateLdo));
  updateLdo();

  // 8. Battery
  const updateBat = () => {
    const out = $('#bat-out');
    const cells = parseInt($('#bat-s').value, 10);
    const r = calcBattery(cells, num($('#bat-v').value), num($('#bat-cap').value), num($('#bat-load').value));
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    const cls = r.status === 'danger' ? 'red' : r.status === 'warn' ? 'amber' : '';
    const barColor = r.status === 'danger' ? 'var(--red)' : r.status === 'warn' ? 'var(--amber)' : 'var(--green)';
    const fmtH = (h) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)} phút` : `${h.toFixed(1)} giờ`);
    out.innerHTML = `<span class="big ${cls}">${r.soc}% SoC <small style="font-size:14px;color:var(--muted)">(${r.vCell.toFixed(2)} V/cell)</small></span>
      <div class="soc-bar"><i style="width:${r.soc}%;background:${barColor}"></i></div>
      <p class="small" style="margin:8px 0 4px;color:${barColor}">${esc(r.statusText)}</p>
      <div class="line"><span>Thời gian còn lại (ước tính 85%)</span><span>${fmtH(r.hours)}</span></div>
      <div class="line"><span>Nếu đầy 100% ở tải này</span><span>${fmtH(r.fullHours)}</span></div>`;
  };
  $('#bat-s').addEventListener('change', () => {
    $('#bat-v').value = (parseInt($('#bat-s').value, 10) * 3.8).toFixed(1);
    updateBat();
  });
  ['#bat-v', '#bat-cap', '#bat-load'].forEach((s) => $(s).addEventListener('input', updateBat));
  updateBat();

  // 9. RC Filter
  const updateRC = () => {
    const out = $('#rc-out');
    const r = calcRC(num($('#rc-r').value) * Number($('#rc-ru').value), num($('#rc-c').value) * Number($('#rc-cu').value));
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    const tauStr = r.tau >= 1 ? `${r.tau.toFixed(3)} s` : r.tau >= 1e-3 ? `${(r.tau * 1e3).toFixed(3)} ms` : `${(r.tau * 1e6).toFixed(2)} µs`;
    out.innerHTML = `<span class="big cyan">${fmtFreq(r.fc)}</span>
      <div class="line"><span>Hằng số thời gian τ = R·C</span><span>${tauStr}</span></div>
      <div class="line"><span>Thời gian lên 10–90% (2.2τ)</span><span>${(r.tau * 2.2 * 1000).toFixed(3)} ms</span></div>`;
  };
  ['#rc-r', '#rc-c'].forEach((s) => $(s).addEventListener('input', updateRC));
  ['#rc-ru', '#rc-cu'].forEach((s) => $(s).addEventListener('change', updateRC));
  updateRC();

  // 10. Timer PWM
  const updatePWM = () => {
    const out = $('#pwm-out');
    const r = calcPWM(num($('#pwm-clk').value), num($('#pwm-hz').value));
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `<span class="big">PSC = ${r.psc} · ARR = ${r.arr}</span>
      <div class="line"><span>Tần số thực tế</span><span>${fmtFreq(r.fActual)} (sai số ${r.errPct.toFixed(3)}%)</span></div>
      <div class="line"><span>Độ phân giải Duty</span><span>${r.resBits.toFixed(1)} bit (${r.arr + 1} mức)</span></div>
      <div class="code-snippet">htim.Init.Prescaler = ${r.psc};
htim.Init.Period    = ${r.arr};</div>`;
  };
  ['#pwm-clk', '#pwm-hz'].forEach((s) => $(s).addEventListener('input', updatePWM));
  $$('[data-pwm]').forEach((b) => b.addEventListener('click', () => {
    const [clk, hz] = b.dataset.pwm.split(',');
    $('#pwm-clk').value = clk;
    $('#pwm-hz').value = hz;
    updatePWM();
  }));
  updatePWM();

  // 11. Encoder
  const updateEnc = () => {
    const out = $('#enc-out');
    const r = calcEncoder(num($('#enc-ppr').value), Number($('#enc-x').value), num($('#enc-rpm').value));
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `<span class="big cyan">${fmtFreq(r.freqHz)}</span>
      <div class="line"><span>Số xung / vòng (CPR)</span><span>${r.cpr} xung/vòng</span></div>
      <div class="line"><span>Độ phân giải góc</span><span>${r.degPerCount.toFixed(3)}° / xung</span></div>`;
  };
  ['#enc-ppr', '#enc-rpm'].forEach((s) => $(s).addEventListener('input', updateEnc));
  $('#enc-x').addEventListener('change', updateEnc);
  updateEnc();

  // 12. Torque & Speed
  const updateMech = () => {
    const out = $('#mech-out');
    const tq = convertTorque(num($('#tq-val').value), $('#tq-unit').value);
    const sp = convertSpeed(num($('#sp-val').value), $('#sp-unit').value);
    if (!tq && !sp) { out.innerHTML = '<span class="err">Nhập số hợp lệ.</span>'; return; }
    const power = tq && sp ? tq.nm * sp.rads : null;
    out.innerHTML = `
      ${tq ? `<div class="line"><span>N·m</span><b>${tq.nm.toFixed(4)} N·m</b></div>
      <div class="line"><span>kgf·cm</span><b>${tq.kgfcm.toFixed(3)} kgf·cm</b></div>
      <div class="line"><span>oz·in</span><b>${tq.ozin.toFixed(2)} oz·in</b></div>` : ''}
      ${sp ? `<div class="line"><span>Tốc độ quay</span><b>${sp.rpm.toFixed(1)} RPM = ${sp.rads.toFixed(3)} rad/s</b></div>` : ''}
      ${power != null ? `<div class="line"><span>Công suất cơ (P = T·ω)</span><b style="color:var(--cyan)">${power.toFixed(2)} W</b></div>` : ''}`;
  };
  ['#tq-val', '#sp-val'].forEach((s) => $(s).addEventListener('input', updateMech));
  ['#tq-unit', '#sp-unit'].forEach((s) => $(s).addEventListener('change', updateMech));
  updateMech();

  // 13. Steps/mm
  let stepMode = 'leadscrew';
  const updateSteps = () => {
    const out = $('#st-out');
    const r = calcStepsPerMm({
      mode: stepMode,
      fullSteps: Number($('#st-full').value),
      microstep: Number($('#st-micro').value),
      lead: num($('#st-lead').value),
      teeth: num($('#st-teeth').value),
      beltPitch: num($('#st-pitch').value),
    });
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `<span class="big cyan">${r.stepsPerMm.toFixed(2)} steps/mm</span>
      <div class="line"><span>Độ phân giải</span><span>${r.umPerStep.toFixed(2)} µm / bước</span></div>
      <div class="line"><span>Hành trình / vòng</span><span>${r.mmPerRev} mm (${r.stepsPerRev} bước)</span></div>`;
  };
  $('#step-mode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-smode]');
    if (!b) return;
    stepMode = b.dataset.smode;
    $$('#step-mode button').forEach((x) => x.classList.toggle('active', x === b));
    $('#st-lead-box').hidden = stepMode !== 'leadscrew';
    $('#st-belt-box').hidden = stepMode !== 'belt';
    updateSteps();
  });
  ['#st-full', '#st-micro'].forEach((s) => $(s).addEventListener('change', updateSteps));
  ['#st-lead', '#st-teeth', '#st-pitch'].forEach((s) => $(s).addEventListener('input', updateSteps));
  updateSteps();

  // 14. Pneumatic Cylinder
  const updatePn = () => {
    const out = $('#pn-out');
    const r = calcPneumatic(num($('#pn-d').value), num($('#pn-rod').value), num($('#pn-bar').value));
    if (r.error) { out.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    out.innerHTML = `
      <div class="line"><span>Lực đẩy ra (Extend)</span><b style="color:var(--green)">${r.fPushN.toFixed(1)} N (${r.fPushKgf.toFixed(1)} kgf)</b></div>
      <div class="line"><span>Lực kéo về (Retract)</span><b style="color:var(--cyan)">${r.fPullN.toFixed(1)} N (${r.fPullKgf.toFixed(1)} kgf)</b></div>
      <div class="line"><span>Tải thực tế khuyên dùng (70%)</span><span>${(r.fPushKgf * 0.7).toFixed(1)} kgf đẩy · ${(r.fPullKgf * 0.7).toFixed(1)} kgf kéo</span></div>`;
  };
  ['#pn-d', '#pn-rod', '#pn-bar'].forEach((s) => $(s).addEventListener('input', updatePn));
  updatePn();

  // 15. AWG Table
  const renderAWG = () => {
    const amp = num($('#awg-amp').value);
    const tb = $('#awg-table tbody');
    tb.innerHTML = AWG_DATA.map((r) => {
      const hit = Number.isFinite(amp) && amp > 0 && r.iOpen >= amp;
      return `<tr class="${hit ? 'hit' : ''}">
        <td><b>${r.awg}</b></td><td>${r.d.toFixed(2)}</td><td>${r.area}</td><td>${r.r}</td><td>${r.iOpen}</td><td>${r.iBundle}</td>
      </tr>`;
    }).join('');
  };
  $('#awg-amp').addEventListener('input', renderAWG);
  renderAWG();
}

function bindLauncher() {
  const URLS = {
    datasheet: (q) => `https://www.alldatasheet.com/view.jsp?Searchword=${encodeURIComponent(q)}`,
    lcsc: (q) => `https://www.lcsc.com/search?q=${encodeURIComponent(q)}`,
    github: (q) => `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`,
    youtube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} tutorial pinout`)}`,
  };
  $$('[data-part]').forEach((b) => b.addEventListener('click', () => { $('#part-q').value = b.dataset.part; }));
  $$('[data-launch]').forEach((b) => b.addEventListener('click', () => {
    const q = $('#part-q').value.trim();
    if (!q) { $('#part-q').focus(); return; }
    window.open(URLS[b.dataset.launch](q), '_blank', 'noopener,noreferrer');
  }));
}
