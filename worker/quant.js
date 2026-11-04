// 📐 6 PHƯƠNG PHÁP ĐỊNH LƯỢNG (anh Jason đưa) – chạy trong Bot Phản Xạ trên máy chủ riêng (VPS).
// SÀN THỬ (tiền ảo): mặc định CẢ 6 đều đánh, dùng chung tài sản sàn thử (như 🧪 thử nghiệm). TIỀN THẬT / Demo: mỗi phương pháp 1 công tắc riêng
// (cfg.lq_<k>, mặc định TẮT) – lệnh thật đi theo đúng lệnh sàn thử (mở cùng lúc, đóng cùng lúc), có cắt lỗ đặt sẵn trên sàn để phòng máy chủ mất kết nối.
// Kiểm chứng: research/quant6a.py (nến 1 giờ 01/2022→) + quant6b.py (nến 5 phút + Open Interest ~16 tháng) – phí + trượt, nến đã đóng, walk-forward.
// Tham số mặc định = tham số walk-forward chọn ở cửa sổ gần nhất (QP bên dưới; số liệu kiểm chứng ở QR – hiện trên trang).
//   ou   – Cặp coin Ornstein-Uhlenbeck: mỗi tháng chọn cặp đồng tích hợp (tương quan ≥ 0,75, ADF < −3,34, bán rã 2–72 giờ) trên 60 coin lớn,
//          hệ số phòng vệ Kalman, vào khi |Z| > zin, chốt |Z| < 0,5, cắt |Z| > 3,5, tối đa max(24, 10× bán rã) giờ, đóng hết cuối tháng.
//   rsi2 – Connors RSI(2): giá > EMA200, ADX14 < 30, RSI2 < ngưỡng, (đóng dưới Keltner 20/2 ATR) → Long; thoát khi đóng > SMA5 / EMA10.
//   fund – Funding cực âm: kỳ chốt funding âm & thấp nhất 5% của chính coin đó trong 90 ngày (→ phe Short quá đông) → Long, giữ h giờ.
//   orb  – Crabel ORB + NR7: hôm qua hẹp nhất 7 ngày (hoặc Bollinger hẹp nhất 30 ngày) → hôm nay chờ mua Open+Stretch / bán Open−Stretch,
//          chốt tp × ATR14 ngày, cắt ở mức đối diện, 23:59 UTC đóng.
//   vwap – VWAP neo 00:00 UTC ± kσ (theo khối lượng), lọc HMM 2 trạng thái trên BTC 1 giờ (p đi ngang > 0,7) & phân kỳ MFI → đánh về VWAP.
//   liq  – Thác thanh lý: 3 nến 5 phút −X%, Open Interest −Y% so với cao nhất 4 nến trước, râu ≥ 40%, khối lượng > 3× TB 20 nến → Long,
//          chốt hồi 50% cú sập, cắt dưới đáy 50% cú sập, giữ tối đa h nến 5 phút.
const FAPI = "https://fapi.binance.com/fapi/v1", FDATA = "https://fapi.binance.com/futures/data";
const iso = (t) => new Date(t).toISOString().slice(0, 19);
const r2 = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FEE = 0.05, SLIP = 0.02;          // % mỗi chiều trên sàn thử: phí taker + trượt giá (khứ hồi ~0,14% như kiểm chứng)
const HR = 3600e3, M5 = 300e3;
const STABLE = new Set(["USDC", "FDUSD", "TUSD", "BUSD", "USDP", "DAI", "USDE", "EUR", "BFUSD", "XUSD", "USD1"]);

export const QS = {
  ou:   { name: "Cặp coin O-U", ico: "🔗", sz: 6, max: 4 },
  rsi2: { name: "Connors RSI(2)", ico: "📉", sz: 5, max: 5 },
  fund: { name: "Funding cực âm → Long", ico: "💸", sz: 5, max: 4 },
  orb:  { name: "ORB + NR7", ico: "📦", sz: 5, max: 4 },
  vwap: { name: "VWAP ± σ + HMM", ico: "〰️", sz: 5, max: 4 },
  liq:  { name: "Thác thanh lý", ico: "🌊", sz: 5, max: 3 },
};
// tham số đang dùng = biến thể tốt nhất trên 6 tháng gần nhất (05–10/2026) theo đúng cách walk-forward chọn; phương pháp mà mọi biến thể đều lỗ
// trong 6 tháng đó (cặp coin, ORB) giữ tham số gốc / biến thể ít lỗ nhất – vẫn đánh trên sàn thử để theo dõi, KHÔNG nên bật tiền thật.
export const QP = {
  ou: { mode: "kal", zin: 2.0 },
  rsi2: { tf: "H4", side: -1, lvl: 5, kel: true, ex: "sma5", sl: null },      // 6 tháng gần nhất: bản gương SHORT khung H4 tốt nhất (+124 bps/lệnh, 170 lệnh)
  fund: { hold: 72, sl: null, abs: true },
  orb: { flt: "bb30", tp: 1.0 },
  vwap: { side: 1, k: 3.0, hmm: false, mfi: false },
  liq: { side: 1, X: 0.03, Y: 0.05, hold: 12 },
};
// kết quả kiểm chứng NGOÀI MẪU (walk-forward 6 tháng chọn → 2 tháng chạy mù, nối lại) – bps ròng/lệnh sau phí + trượt + funding; hiện trên trang
export const QR = {"ou": {"n": 1744, "per_yr": 524.0, "win": 57.1, "win_gross": 60.1, "mean": -5.7, "med": 23.3, "gross": 9.9, "cost": 15.8, "fund": 0.2, "t": -1.02, "ret10": -3.0, "dd10": 16.2, "years": {"2023": [694, 1.1], "2025": [528, -3.6], "2026": [522, -16.7]}, "from": "2022-01"}, "rsi2": {"n": 1564, "per_yr": 373.0, "win": 60.6, "win_gross": 62.2, "mean": -23.7, "med": 92.9, "gross": -0.8, "cost": 17.3, "fund": -5.7, "t": -0.66, "ret10": -8.9, "dd10": 81.7, "years": {"2022": [164, 124.1], "2023": [277, -66.2], "2024": [299, -89.9], "2025": [480, 80.5], "2026": [344, -148.1]}, "from": "2022-01"}, "fund": {"n": 7099, "per_yr": 1669.0, "win": 46.3, "win_gross": 45.9, "mean": 21.7, "med": -56.6, "gross": -6.8, "cost": 17.3, "fund": 45.7, "t": 0.68, "ret10": 36.2, "dd10": 194.6, "years": {"2022": [775, 72.4], "2023": [1276, 121.2], "2024": [1794, 61.2], "2025": [2192, -50.6], "2026": [1062, -52.6]}, "from": "2022-01"}, "orb": {"n": 8670, "per_yr": 2261.0, "win": 40.3, "win_gross": 42.2, "mean": -27.6, "med": -92.2, "gross": -7.6, "cost": 19.2, "fund": -0.8, "t": -2.64, "ret10": -62.5, "dd10": 253.7, "years": {"2022": [2163, -55.6], "2023": [514, -0.2], "2024": [120, 10.1], "2025": [3782, -26.1], "2026": [2091, -10.3]}, "from": "2022-01"}, "vwap": {"n": 1853, "per_yr": 2804.0, "win": 31.7, "win_gross": 34.6, "mean": -13.0, "med": -27.0, "gross": -0.2, "cost": 13.2, "fund": 0.4, "t": -2.62, "ret10": -36.4, "dd10": 26.6, "years": {"2026": [1853, -13.0]}, "from": "2025-07"}, "liq": {"n": 46, "per_yr": 79.0, "win": 41.3, "win_gross": 41.3, "mean": -83.3, "med": -21.0, "gross": -62.4, "cost": 21.0, "fund": 0.2, "t": -1.33, "ret10": -6.6, "dd10": 3.9, "years": {"2026": [46, -83.3]}, "from": "2025-07"}};

// ---------------------------------------------------------------- chỉ báo (giống pandas: ewm adjust=False, rolling)
const ema = (x, n) => { const a = 2 / (n + 1), o = new Array(x.length).fill(NaN); let v = NaN, k = 0; for (let i = 0; i < x.length; i++) { const xi = x[i]; if (!Number.isFinite(xi)) { o[i] = v; continue; } v = Number.isFinite(v) ? a * xi + (1 - a) * v : xi; k++; o[i] = k >= n ? v : NaN; } return o; };
const wild = (x, n) => { const a = 1 / n, o = new Array(x.length).fill(NaN); let v = NaN, k = 0; for (let i = 0; i < x.length; i++) { const xi = x[i]; if (!Number.isFinite(xi)) { o[i] = v; continue; } v = Number.isFinite(v) ? a * xi + (1 - a) * v : xi; k++; o[i] = k >= n ? v : NaN; } return o; };
const sma = (x, n) => x.map((_, i) => { if (i < n - 1) return NaN; let s = 0; for (let j = i - n + 1; j <= i; j++) s += x[j]; return s / n; });
const rstd = (x, n) => x.map((_, i) => { if (i < n - 1) return NaN; let s = 0, q = 0; for (let j = i - n + 1; j <= i; j++) { s += x[j]; q += x[j] * x[j]; } const m = s / n; return Math.sqrt(Math.max(0, (q - n * m * m) / (n - 1))); });
const rsi = (c, n) => { const d = c.map((v, i) => (i ? v - c[i - 1] : NaN)); const up = wild(d.map((v) => (v > 0 ? v : 0)), n), dn = wild(d.map((v) => (v < 0 ? -v : 0)), n); return up.map((u, i) => (dn[i] === 0 ? 100 : 100 - 100 / (1 + u / dn[i]))); };
const trs = (h, l, c) => h.map((_, i) => (i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i]));
const atr = (h, l, c, n) => wild(trs(h, l, c), n);
const adx = (h, l, c, n) => {
  const pdm = h.map((v, i) => { if (!i) return 0; const u = v - h[i - 1], d = l[i - 1] - l[i]; return u > d && u > 0 ? u : 0; });
  const mdm = h.map((v, i) => { if (!i) return 0; const u = v - h[i - 1], d = l[i - 1] - l[i]; return d > u && d > 0 ? d : 0; });
  const a = atr(h, l, c, n), p = wild(pdm, n), m = wild(mdm, n);
  return wild(a.map((av, i) => { const pd = 100 * p[i] / av, md = 100 * m[i] / av, dx = 100 * Math.abs(pd - md) / (pd + md); return Number.isFinite(dx) ? dx : 0; }), n);
};
const lstsq = (X, y) => {      // bình phương nhỏ nhất nhỏ (≤ 3 biến): giải (XᵀX) b = Xᵀy
  const k = X[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (let i = 0; i < y.length; i++) for (let p = 0; p < k; p++) { b[p] += X[i][p] * y[i]; for (let q = 0; q < k; q++) A[p][q] += X[i][p] * X[i][q]; }
  const inv = matInv(A); if (!inv) return null;
  return { b: inv.map((r) => r.reduce((s, v, q) => s + v * b[q], 0)), inv };
};
const matInv = (A) => {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (Math.abs(M[p][i]) < 1e-14) return null; [M[i], M[p]] = [M[p], M[i]];
    const d = M[i][i]; for (let j = 0; j < 2 * n; j++) M[i][j] /= d;
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[i][j]; }
  }
  return M.map((r) => r.slice(n));
};
const adfT = (x) => {      // ADF 1 trễ có hằng số: t của hệ số x[t−1] (Engle-Granger 2 biến: < −3,34 ≈ 5%)
  const dx = x.slice(1).map((v, i) => v - x[i]), y = dx.slice(1), X = y.map((_, i) => [1, x[i + 1], dx[i]]);
  const r = lstsq(X, y); if (!r) return 0;
  let ss = 0; for (let i = 0; i < y.length; i++) { const e = y[i] - X[i].reduce((s, v, p) => s + v * r.b[p], 0); ss += e * e; }
  const s2 = ss / (y.length - 3); return r.b[1] / Math.sqrt(s2 * r.inv[1][1]);
};
const halfLife = (x) => { const y = x.slice(1).map((v, i) => v - x[i]), X = y.map((_, i) => [1, x[i]]), r = lstsq(X, y); const b = r?.b[1]; return b > -1 && b < 0 ? -Math.log(2) / Math.log(1 + b) : 1e9; };
const corr = (a, b) => { const n = a.length; let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; } const ma = sa / n, mb = sb / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; c += x * y; va += x * x; vb += y * y; } return c / Math.sqrt(va * vb); };

// HMM 2 trạng thái (Gaussian chéo) – học Baum-Welch, lọc tiến (không nhìn trước)
function hmmFit(X, it = 50) {
  const n = X.length, k = X[0].length, srt = X.map((x) => x[0]).sort((a, b) => a - b), q3 = srt[Math.floor(n * 0.3)], q7 = srt[Math.floor(n * 0.7)];
  const mean = (R) => Array.from({ length: k }, (_, d) => R.reduce((s, x) => s + x[d], 0) / R.length);
  const v0 = Array.from({ length: k }, (_, d) => { const m = X.reduce((s, x) => s + x[d], 0) / n; return X.reduce((s, x) => s + (x[d] - m) ** 2, 0) / n + 1e-6; });
  let mu = [mean(X.filter((x) => x[0] <= q3)), mean(X.filter((x) => x[0] >= q7))], va = [[...v0], [...v0]], A = [[0.98, 0.02], [0.02, 0.98]], pi = [0.5, 0.5];
  const em = (x, s) => { let lp = 0; for (let d = 0; d < k; d++) lp += -0.5 * ((x[d] - mu[s][d]) ** 2 / va[s][d] + Math.log(2 * Math.PI * va[s][d])); return Math.exp(lp) + 1e-300; };
  for (let r = 0; r < it; r++) {
    const B = X.map((x) => [em(x, 0), em(x, 1)]), al = [], c = [];
    let a0 = [pi[0] * B[0][0], pi[1] * B[0][1]]; c[0] = a0[0] + a0[1]; al[0] = [a0[0] / c[0], a0[1] / c[0]];
    for (let t = 1; t < n; t++) { const p = al[t - 1], a = [(p[0] * A[0][0] + p[1] * A[1][0]) * B[t][0], (p[0] * A[0][1] + p[1] * A[1][1]) * B[t][1]]; c[t] = a[0] + a[1]; al[t] = [a[0] / c[t], a[1] / c[t]]; }
    const be = new Array(n); be[n - 1] = [1, 1];
    for (let t = n - 2; t >= 0; t--) { const q = [B[t + 1][0] * be[t + 1][0], B[t + 1][1] * be[t + 1][1]]; be[t] = [(A[0][0] * q[0] + A[0][1] * q[1]) / c[t + 1], (A[1][0] * q[0] + A[1][1] * q[1]) / c[t + 1]]; }
    const g = al.map((a, t) => { const x = [a[0] * be[t][0], a[1] * be[t][1]], s = x[0] + x[1]; return [x[0] / s, x[1] / s]; });
    const xs = [[0, 0], [0, 0]];
    for (let t = 0; t < n - 1; t++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) xs[i][j] += al[t][i] * A[i][j] * B[t + 1][j] * be[t + 1][j] / c[t + 1];
    A = xs.map((r_) => { const s = r_[0] + r_[1]; return [r_[0] / s, r_[1] / s]; }); pi = g[0];
    for (let s = 0; s < 2; s++) { const w = g.reduce((a, x) => a + x[s], 0); mu[s] = Array.from({ length: k }, (_, d) => X.reduce((a, x, t) => a + g[t][s] * x[d], 0) / w); va[s] = Array.from({ length: k }, (_, d) => X.reduce((a, x, t) => a + g[t][s] * (x[d] - mu[s][d]) ** 2, 0) / w + 1e-6); }
  }
  return { A, mu, va, pi, lo: mu[0][0] <= mu[1][0] ? 0 : 1 };
}
function hmmFilter(X, P) {
  const em = (x, s) => { let lp = 0; for (let d = 0; d < x.length; d++) lp += -0.5 * ((x[d] - P.mu[s][d]) ** 2 / P.va[s][d] + Math.log(2 * Math.PI * P.va[s][d])); return Math.exp(lp) + 1e-300; };
  let al = [P.pi[0] * em(X[0], 0), P.pi[1] * em(X[0], 1)]; let s = al[0] + al[1]; al = [al[0] / s, al[1] / s];
  for (let t = 1; t < X.length; t++) { const a = [(al[0] * P.A[0][0] + al[1] * P.A[1][0]) * em(X[t], 0), (al[0] * P.A[0][1] + al[1] * P.A[1][1]) * em(X[t], 1)]; s = a[0] + a[1]; al = [a[0] / s, a[1] / s]; }
  return al[P.lo];
}
const regFeat = (c) => {      // đặc trưng mỗi giờ: log độ biến động 24h, |lợi suất 24h| / (độ biến động × √24)
  const lr = c.map((v, i) => (i ? Math.log(v / c[i - 1]) : NaN)), out = [];
  for (let i = 25; i < c.length; i++) { const w = lr.slice(i - 23, i + 1); const m = w.reduce((a, b) => a + b, 0) / 24, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 23); out.push([Math.log(sd + 1e-6), Math.abs(Math.log(c[i] / c[i - 24])) / (sd * Math.sqrt(24) + 1e-9)]); }
  return out;
};

// tham số anh chỉnh trên trang (cfg.qx = { ou: { zin: 2.5, sz: 6 }, … }) – thiếu / sai kiểu → dùng chuẩn (QP / QS); số ngoài giới hạn → kẹp vào giới hạn.
// kiểu: "b" bật/tắt · "s" hướng (1 Long / −1 Short) · ["a","b"] chọn 1 · [min, max] số
export const QLIM = {
  ou: { mode: ["kal", "fix"], zin: [1.5, 3.4] },
  rsi2: { tf: ["H1", "H4"], side: "s", lvl: [1, 20], kel: "b", ex: ["sma5", "ema10"] },
  fund: { hold: [8, 168], abs: "b" },
  orb: { flt: ["nr7", "bb30", "both"], tp: [0.3, 3] },
  vwap: { side: "s", k: [1.5, 4], hmm: "b", mfi: "b" },
  liq: { side: "s", X: [0.01, 0.1], Y: [0.01, 0.2], hold: [3, 48] },
  _: { sz: [1, 15], max: [1, 10] },
};
export function qPick(v, lim, d) {
  if (v == null || v === "") return d;
  if (lim === "b") return typeof v === "boolean" ? v : d;
  if (lim === "s") return +v === 1 || +v === -1 ? +v : d;
  if (typeof lim[0] === "string") return lim.includes(v) ? v : d;
  const n = +v; return Number.isFinite(n) ? Math.max(lim[0], Math.min(lim[1], n)) : d;
}

export class QuantLab {
  constructor(core) { this.core = core; this.busy = false; this.K1 = {}; this.K5 = {}; this.OI = {}; this.D1 = {}; this.uni = []; this.uni5 = []; this.at = {}; this.ex = {}; this.fseen = {}; }
  st() {
    const S = this.core.S; S.q ||= { v: 1 };
    for (const k of Object.keys(QS)) S.q[k] ||= { pos: {}, hist: [], st: { n: 0, win: 0, pnl: 0, fee: 0, fund: 0, skip: 0 } };
    return S.q;
  }
  on(k) { const c = this.core.cfg || {}; return c.q_on !== false && c["q_" + k] !== false; }
  P(k) { const x = this.core.cfg?.qx?.[k] || {}, o = { ...QP[k] }; for (const [f, lim] of Object.entries(QLIM[k])) o[f] = qPick(x[f], lim, QP[k][f]); if (k === "liq") o.hold = Math.round(o.hold); return o; }      // tham số đang dùng
  R(k) { const x = this.core.cfg?.qx?.[k] || {}; return { ...QS[k], sz: qPick(x.sz, QLIM._.sz, QS[k].sz), max: Math.round(qPick(x.max, QLIM._.max, QS[k].max)) }; }      // cỡ lệnh & số lệnh tối đa (sàn thử)
  get(u) { return fetch(u, { signal: AbortSignal.timeout(15000) }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${u.split("?")[0].split("/").pop()}`); return r.json(); }); }
  say(m, kind = "info") { try { this.core.say(Date.now(), `📐 ${m}`, kind); } catch (e) { /* bỏ qua */ } }
  note(key, title, body) { try { this.core.note(`q:${key}`, 2, title, body); } catch (e) { /* bỏ qua */ } }
  // giá: sổ lệnh trực tiếp của bot (websocket) → giá đánh dấu (🧪 premiumIndex mỗi phút)
  mid(sym) { const x = this.core.M?.[sym.replace(/USDT$/, "") + ":F"]; if (x?.bid > 0 && x?.ask > 0) return (x.bid + x.ask) / 2; const m = this.core.sw?.px?.[sym]?.m; return m > 0 ? m : null; }
  upnl() { let u = 0; const W = this.core.S?.q; if (!W) return 0; for (const k of Object.keys(QS)) for (const P of Object.values(W[k]?.pos || {})) for (const L of P.legs) { const m = this.mid(L.sym) || L.last || L.e; u += L.side * L.q * (m - L.e); } return u; }
  margin() { let m = 0; const W = this.core.S?.q; if (!W) return 0; for (const k of Object.keys(QS)) for (const P of Object.values(W[k]?.pos || {})) m += P.N / 2; return m; }      // ký quỹ x2

  // ---------------------------------------------------------------- dữ liệu
  async kl(sym, iv, limit) {
    const K = await this.get(`${FAPI}/klines?symbol=${sym}&interval=${iv}&limit=${limit}`), now = Date.now();
    return (K || []).filter((k) => +k[6] < now).map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[7] }));      // chỉ nến ĐÃ ĐÓNG; v = khối lượng USDT
  }
  async universe(now) {
    if (now - (this.at.uni || 0) < HR && this.uni.length) return;
    const T = await this.get(`${FAPI}/ticker/24hr`), ok = this.core.sw?.ob || null;
    const L = (T || []).filter((x) => x.symbol.endsWith("USDT") && !STABLE.has(x.symbol.replace(/USDT$/, "")) && (!ok || ok[x.symbol])).sort((a, b) => +b.quoteVolume - +a.quoteVolume);
    if (L.length < 50) return;
    this.uni = L.slice(0, 100).map((x) => x.symbol); this.uni5 = this.uni.slice(0, 60); this.rank = Object.fromEntries(this.uni.map((s, i) => [s, i])); this.at.uni = now;
  }
  async hourly(now) {      // nến 1 giờ (300 nến) cho 100 coin lớn + BTC, 1 lần mỗi giờ ngay sau khi nến đóng
    const H = Math.floor(now / HR);
    if (this.at.h1 === H || now - H * HR < 8e3) return false;
    for (const s of [...new Set(["BTCUSDT", ...this.uni])]) { try { this.K1[s] = await this.kl(s, "1h", 300); } catch (e) { /* coin này để giờ sau */ } await sleep(60); }
    this.at.h1 = H; return true;
  }
  async five(now) {      // nến 5 phút (300 nến) + Open Interest cho 60 coin lớn, mỗi 5 phút
    const B = Math.floor(now / M5);
    if (this.at.m5 === B || now - B * M5 < 6e3) return false;
    for (const s of this.uni5) {
      try {
        this.K5[s] = await this.kl(s, "5m", 300);
        const o = await this.get(`${FAPI}/openInterest?symbol=${s}`), R = (this.OI[s] ||= []);
        if (!R.length) { try { const Hh = await this.get(`${FDATA}/openInterestHist?symbol=${s}&period=5m&limit=6`); for (const x of Hh || []) R.push([Math.floor(+x.timestamp / M5) - 1, +x.sumOpenInterest]); } catch (e) { /* bỏ qua */ } }
        const b = B - 1; if (!R.length || R[R.length - 1][0] < b) R.push([b, +o.openInterest]); else R[R.length - 1] = [b, +o.openInterest];
        if (R.length > 12) R.splice(0, R.length - 12);
      } catch (e) { /* để lượt sau */ }
      await sleep(40);
    }
    this.at.m5 = B; return true;
  }

  // ---------------------------------------------------------------- vòng chính (gọi mỗi giây, không chờ)
  // mỗi giây: chốt / cắt / hết giờ bằng giá trực tiếp (không bao giờ bị chặn bởi lượt tải dữ liệu); tải dữ liệu & tín hiệu chạy nền
  tick(now = Date.now()) {
    if (this.core.where !== "vps" || !this.core.S) return;
    const W = this.st();
    for (const k of Object.keys(QS)) { if (!this.on(k)) for (const P of Object.values(W[k].pos)) this.close(k, P, "OFF", now); this.watch(k, W[k], now); }
    this.orbWatch(W.orb, now);
    for (const [s, x] of Object.entries(this.core.sw?.px || {})) if (x.next === this.fseen[s]) (this.fr ||= {})[s] = x.r;      // funding dự kiến ngay TRƯỚC kỳ chốt
    if (this.busy || now - (this.at.slow || 0) < 2e3) return;
    this.at.slow = now; this.busy = true;
    this.slow(now, W).catch((e) => this.core.err("định lượng: " + e.message)).finally(() => { this.busy = false; });
  }
  async slow(now, W) {
    {
      await this.universe(now); if (!this.uni.length) return;
      if (await this.hourly(now)) {
        const h = new Date(now).getUTCHours();
        try { await this.regime(now); } catch (e) { this.core.err("HMM: " + e.message); }
        try { if (this.on("rsi2")) this.rsi2(W.rsi2, now, h); } catch (e) { this.core.err("RSI2: " + e.message); }
        try { if (this.on("ou")) await this.ou(W.ou, now); } catch (e) { this.core.err("cặp coin: " + e.message); }
        if (h === 0) try { if (this.on("orb")) await this.orbSetup(W.orb, now); } catch (e) { this.core.err("ORB: " + e.message); }
      }
      try { if (this.on("fund")) await this.fund(W.fund, now); } catch (e) { this.core.err("funding: " + e.message); }
      if (await this.five(now)) {
        try { if (this.on("liq")) this.liq(W.liq, now); } catch (e) { this.core.err("thác thanh lý: " + e.message); }
        try { if (this.on("vwap")) this.vwap(W.vwap, now); } catch (e) { this.core.err("VWAP: " + e.message); }
      }
    }
  }

  // ---------------------------------------------------------------- mở / theo dõi / đóng lệnh sàn thử
  open(k, B, legs, o) {      // legs: [{sym, side, w}] (w = tỉ trọng giá trị); o: {sl, tp, exp, why, meta}
    const R = this.R(k), now = Date.now(), base = legs.map((L) => L.sym.replace(/USDT$/, "")).join("/");
    if (Object.keys(B.pos).length >= R.max) { B.st.skip++; return null; }
    if (Object.values(B.pos).some((P) => P.legs.some((L) => legs.some((x) => x.sym === L.sym)))) { B.st.skip++; return null; }
    const eq = this.core.equity(), N = eq * R.sz / 100;
    if (eq - this.core.used() < N / 2) { this.say(`${R.name}: ${base} – tài sản sàn thử còn trống không đủ, bỏ qua`); B.st.skip++; return null; }
    const L2 = [];
    for (const L of legs) {
      const m = this.mid(L.sym); if (!(m > 0)) { B.st.skip++; return null; }
      const e = m * (1 + L.side * SLIP / 100), n = N * L.w; L2.push({ sym: L.sym, side: L.side, w: L.w, e, q: n / e, last: m, fnext: this.core.sw?.px?.[L.sym]?.next || 0, frate: this.core.sw?.px?.[L.sym]?.r || 0 });
    }
    const fee = N * FEE / 100, id = `${k}${Date.now() % 1e9}`;
    this.core.S.cash -= fee; B.st.fee += fee;
    const P = { id, k, legs: L2, N: r2(N, 2), t0: iso(now), exp: o.exp || now + 72 * HR, sl: o.sl ?? null, tp: o.tp ?? null, why: o.why, meta: o.meta || null, fee, fund: 0, hi: 0, lo: 0 };
    B.pos[id] = P;
    const pxs = L2.map((L) => `${L.side > 0 ? "LONG" : "SHORT"} ${L.sym.replace(/USDT$/, "")} @ ${+L.e.toPrecision(6)}`).join(" + ");
    this.say(`${R.ico} ${R.name}: ${pxs} · ${r2(N, 2)} USDT ảo (${o.why})`);
    this.note(`o:${id}`, `${R.ico} ${R.name}: ${pxs}`, `${o.why} · ${r2(N, 2)} USDT ảo${P.sl ? ` · cắt lỗ ${+P.sl.toPrecision(6)}` : ""}${P.tp ? ` · chốt ${+P.tp.toPrecision(6)}` : ""}`);
    try { this.core.io.onQuant?.({ act: "open", id, k, name: R.name, legs: L2.map((L) => ({ sym: L.sym, side: L.side, w: L.w, px: L.e })), sl: P.sl, tp: P.tp, exp: P.exp, why: o.why }); } catch (e) { this.core.err("định lượng → tiền thật: " + e.message); }
    return P;
  }
  watch(k, B, now) {
    for (const P of Object.values(B.pos)) {
      let u = 0, ok = true;
      for (const L of P.legs) {
        const m = this.mid(L.sym); if (!(m > 0)) { ok = false; continue; } L.last = m; u += L.side * L.q * (m - L.e);
        const x = this.core.sw?.px?.[L.sym];      // funding: Long trả khi dương, nhận khi âm
        if (x) { if (L.fnext && now >= L.fnext) { const amt = -L.side * (L.frate || 0) * L.q * m; this.core.S.cash += amt; P.fund += amt; B.st.fund += amt; L.fnext = x.next > now ? x.next : 0; L.frate = x.r; } else if (!L.fnext && x.next > now) { L.fnext = x.next; L.frate = x.r; } else if (x.next === L.fnext) L.frate = x.r; }
      }
      if (!ok) { if (now > P.exp + HR) this.close(k, P, "NOPX", now); continue; }
      const pct = u / P.N * 100; P.hi = Math.max(P.hi, pct); P.lo = Math.min(P.lo, pct);
      if (P.legs.length === 1) {
        const L = P.legs[0], m = L.last;
        if (P.sl && (L.side > 0 ? m <= P.sl : m >= P.sl)) { this.close(k, P, "SL", now); continue; }
        const tp = P.tpDyn ?? P.tp;
        if (tp && (L.side > 0 ? m >= tp : m <= tp)) { this.close(k, P, "TP", now); continue; }
      }
      if (now >= P.exp) this.close(k, P, "TIME", now);
    }
  }
  close(k, P, why, now = Date.now()) {
    const B = this.core.S.q?.[k]; if (!B?.pos[P.id]) return;
    const R = this.R(k); let gross = 0, fee = 0;
    for (const L of P.legs) { const m = this.mid(L.sym) || L.last || L.e, x = m * (1 - L.side * SLIP / 100); L.x = x; gross += L.side * L.q * (x - L.e); fee += L.q * x * FEE / 100; }
    this.core.S.cash += gross - fee; B.st.fee += fee;
    const net = gross - P.fee - fee + P.fund, pct = net / P.N * 100;
    B.st.n++; B.st.pnl += net; if (net > 0) B.st.win++;
    const leg0 = P.legs[0];
    B.hist = [...B.hist.slice(-99), { id: P.id, legs: P.legs.map((L) => ({ sym: L.sym, side: L.side, e: r2(L.e, 8), x: r2(L.x, 8), q: L.q })), N: P.N, t0: P.t0, t2: iso(now), why, net: r2(net, 3), pct: r2(pct, 2), fund: r2(P.fund, 3), fee: r2(P.fee + fee, 3), note: P.why }];
    try { this.core.io?.onTrade?.({ env: "paper", strat: "q_" + k, k: P.legs.map((L) => L.sym.replace(/USDT$/, "")).join("/") + ":F", side: leg0.side, q: leg0.q, e: leg0.e, x: leg0.x, t1: P.t0, t2: iso(now), fee: P.fee + fee, fund: P.fund, pnl: net, why, note: P.why }); } catch (e) { /* bỏ qua */ }
    delete B.pos[P.id];
    const wl = { TIME: "hết giờ giữ", SL: "chạm cắt lỗ", TP: "chạm chốt lời", X: "tín hiệu thoát", MANUAL: "anh đóng tay", OFF: "anh tắt phương pháp", NOPX: "mất giá coin", EOD: "hết ngày", EOM: "hết tháng (chọn lại cặp)" }[why] || why;
    const nm = P.legs.map((L) => L.sym.replace(/USDT$/, "")).join("/");
    this.say(`${R.ico} ${R.name}: đóng ${nm} – ${wl}: ${net >= 0 ? "+" : ""}${r2(net, 2)} USDT (${pct >= 0 ? "+" : ""}${r2(pct, 2)}%)`, net >= 0 ? "win" : "loss");
    this.note(`c:${P.id}`, `${R.ico} ${R.name}: đóng ${nm} ${pct >= 0 ? "+" : ""}${r2(pct, 2)}%`, `${wl} · ${net >= 0 ? "+" : ""}${r2(net, 2)} USDT ảo`);
    try { this.core.io.onQuant?.({ act: "close", id: P.id, k, why }); } catch (e) { /* bỏ qua */ }
  }
  sig(k, B, legs, o) { if (!this.on(k)) return null; return this.open(k, B, legs, o); }

  // ---------------------------------------------------------------- 📉 RSI(2)
  rsi2(B, now, h) {
    const p = this.P("rsi2"); if (p.tf === "H4" && h % 4 !== 0) return;
    for (const P of Object.values(B.pos)) {      // thoát: nến vừa đóng vượt SMA5 / EMA10
      const s = P.legs[0].sym, K = this.bars(s, p.tf); if (!K) continue;
      const c = K.map((x) => x.c), tg = p.ex === "sma5" ? sma(c, 5) : ema(c, 10), i = c.length - 1, side = P.legs[0].side;
      const tfm = (p.tf === "H4" ? 4 : 1) * HR, ent = Math.floor(Date.parse(P.t0 + "Z") / tfm) * tfm;      // chỉ xét các nến BẮT ĐẦU từ lúc vào lệnh
      if (K[i].t >= ent && (side > 0 ? c[i] > tg[i] : c[i] < tg[i])) this.close("rsi2", P, "X", now);
    }
    for (const s of this.uni) {
      const K = this.bars(s, p.tf); if (!K || K.length < 220) continue;
      const c = K.map((x) => x.c), hh = K.map((x) => x.h), ll = K.map((x) => x.l), i = c.length - 1;
      if (K[i].t + (p.tf === "H4" ? 4 : 1) * HR < now - HR) continue;      // nến cũ (coin ngừng giao dịch)
      const e200 = ema(c, 200), a14 = adx(hh, ll, c, 14), r = rsi(c, 2), e20 = ema(c, 20), at20 = atr(hh, ll, c, 20), at14 = atr(hh, ll, c, 14), side = p.side;
      const trend = side > 0 ? c[i] > e200[i] : c[i] < e200[i], ext = side > 0 ? r[i] < p.lvl : r[i] > 100 - p.lvl, band = side > 0 ? c[i] < e20[i] - 2 * at20[i] : c[i] > e20[i] + 2 * at20[i];
      if (!(trend && a14[i] < 30 && ext && (!p.kel || band))) continue;
      const m = this.mid(s); if (!m) continue;
      this.sig("rsi2", B, [{ sym: s, side, w: 1 }], { sl: p.sl ? m - side * p.sl * at14[i] : null, exp: now + (p.tf === "H1" ? 240 : 240) * HR, why: `${p.tf}: RSI2 ${r2(r[i], 1)}, ADX ${r2(a14[i], 0)}, giá ${side > 0 ? "trên" : "dưới"} EMA200${p.kel ? ", ngoài Keltner" : ""}` });
    }
  }
  bars(s, tf) {
    const K = this.K1[s]; if (!K?.length) return null; if (tf !== "H4") return K;
    const out = []; let cur = null;
    for (const x of K) { const b = Math.floor(x.t / (4 * HR)); if (!cur || cur.b !== b) { if (cur && cur.n === 4) out.push(cur); cur = { b, t: b * 4 * HR, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v, n: 1 }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.v += x.v; cur.n++; } }
    if (cur && cur.n === 4) out.push(cur);
    return out;
  }

  // ---------------------------------------------------------------- 🔗 cặp coin O-U
  async ou(B, now) {
    const W = this.core.S.q, mon = iso(now).slice(0, 7), p = this.P("ou");
    const PR = (W.pairs ||= { m: null, L: [] });
    if (PR.m !== mon) {      // sang tháng: đóng cặp cũ, chọn cặp mới trên 30 ngày TRƯỚC đầu tháng
      for (const P of Object.values(B.pos)) this.close("ou", P, "EOM", now);
      await this.ouForm(PR, mon, now);
    }
    const mEnd = Date.UTC(+mon.slice(0, 4), +mon.slice(5, 7), 1);
    for (const Q of PR.L) {
      const A = this.K1[Q.a], Bk = this.K1[Q.b]; if (!A?.length || !Bk?.length) continue;
      const ta = A[A.length - 1].t; if (Bk[Bk.length - 1].t !== ta || Q.lt >= ta) continue;
      const xa = Math.log(A[A.length - 1].c), xb = Math.log(Bk[Bk.length - 1].c);
      const z = this.ouStep(Q, xa, xb); Q.lt = ta; if (!Number.isFinite(z)) continue;
      const P = Object.values(B.pos).find((x) => x.meta?.pair === Q.id);
      if (P) {
        const held = (now - Date.parse(P.t0 + "Z")) / HR;
        const why = Math.abs(z) < 0.5 ? "X" : Math.abs(z) > 3.5 ? "SL" : held >= Math.max(24, 10 * Q.hl) || now >= mEnd - 2 * HR ? "TIME" : null;
        if (why) this.close("ou", P, why, now);
        continue;
      }
      if (Math.abs(z) > p.zin && Math.abs(z) < 3.5 && now < mEnd - 24 * HR) {
        const side = z > 0 ? -1 : 1, bet = Math.max(0.2, Math.min(5, p.mode === "kal" ? Q.th[0] : Q.beta));
        this.sig("ou", B, [{ sym: Q.a, side, w: 1 / (1 + bet) }, { sym: Q.b, side: -side, w: bet / (1 + bet) }],
          { exp: Math.min(mEnd - HR, now + Math.max(24, 10 * Q.hl) * HR + HR), why: `Z ${r2(z, 2)} · β ${r2(bet, 2)} · bán rã ${r2(Q.hl, 1)} giờ`, meta: { pair: Q.id, z0: r2(z, 2) } });
      }
    }
  }
  ouStep(Q, xa, xb) {      // Kalman 1 bước: trả Z (sai số dự báo / độ lệch chuẩn trượt của sai số, các giờ TRƯỚC)
    const P = Q.P, th = Q.th, x = [xb, 1], d = 1e-6 / (1 - 1e-6);
    P[0][0] += d; P[1][1] += d;
    const Px = [P[0][0] * x[0] + P[0][1], P[1][0] * x[0] + P[1][1]], Qv = x[0] * Px[0] + Px[1] + Q.ve, err = xa - (th[0] * x[0] + th[1]);
    const K = [Px[0] / Qv, Px[1] / Qv]; th[0] += K[0] * err; th[1] += K[1] * err;
    const xP = [x[0] * P[0][0] + P[1][0], x[0] * P[0][1] + P[1][1]];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) P[i][j] -= K[i] * xP[j];
    const sp = xa - Q.beta * xb;
    const E = (Q.E ||= []), Sx = (Q.Sx ||= []); const win = Q.win;
    let z;
    if (this.P("ou").mode === "kal") { if (E.length >= win / 2) { const w = E.slice(-win), m = w.reduce((a, b) => a + b, 0) / w.length, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1)); z = err / sd; } }
    else { const w = [...Sx.slice(-(win - 1)), sp]; if (w.length >= win) { const m = w.reduce((a, b) => a + b, 0) / win, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (win - 1)); z = (sp - m) / sd; } }
    E.push(err); Sx.push(sp); if (E.length > 260) E.splice(0, E.length - 260); if (Sx.length > 260) Sx.splice(0, Sx.length - 260);
    return z;
  }
  async ouForm(PR, mon, now) {
    const m0 = Date.UTC(+mon.slice(0, 4), +mon.slice(5, 7) - 1, 1), FORM = 720, U = this.uni.slice(0, 60), C = {};
    for (const s of U) { try { const K = await this.kl(s, "1h", 1500); const byT = new Map(K.map((x) => [x.t, x.c])); C[s] = byT; } catch (e) { /* bỏ */ } await sleep(150); }
    const T0 = Array.from({ length: FORM }, (_, i) => m0 - (FORM - i) * HR);
    const ok = U.filter((s) => C[s] && T0.every((t) => C[s].get(t) > 0));
    const LX = Object.fromEntries(ok.map((s) => [s, T0.map((t) => Math.log(C[s].get(t)))]));
    const RT = Object.fromEntries(ok.map((s) => [s, LX[s].slice(1).map((v, i) => v - LX[s][i])]));
    const cand = [];
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
      const a = ok[i], b = ok[j]; if (corr(RT[a], RT[b]) < 0.75) continue;
      const r = lstsq(LX[b].map((v) => [v, 1]), LX[a]); if (!r) continue; const [beta, alpha] = r.b;
      if (!(beta > 0.2 && beta < 5)) continue;
      const e = LX[a].map((v, t) => v - beta * LX[b][t] - alpha), t = adfT(e); if (t > -3.34) continue;
      const hl = halfLife(e); if (!(hl >= 2 && hl <= 72)) continue;
      const m = e.reduce((s, v) => s + v, 0) / e.length, sd = Math.sqrt(e.reduce((s, v) => s + (v - m) ** 2, 0) / e.length);
      cand.push({ t, a, b, beta, alpha, hl, sd });
    }
    cand.sort((x, y) => x.t - y.t);
    PR.m = mon; PR.at = iso(now);
    PR.L = cand.slice(0, 20).map((q) => {
      const Q = { id: `${q.a}/${q.b}`, a: q.a, b: q.b, beta: q.beta, hl: q.hl, adf: r2(q.t, 2), win: Math.round(Math.min(240, Math.max(24, 5 * q.hl))), th: [q.beta, q.alpha], P: [[1e-3, 0], [0, 1e-3]], ve: q.sd * q.sd, lt: 0 };
      // chạy Kalman qua 30 ngày chọn cặp + các giờ đã qua của tháng này (máy chủ khởi động giữa tháng) – không vào lệnh cho các giờ đã qua
      const ts = [...C[q.a].keys()].filter((t) => t >= T0[0] && t < now - HR && C[q.b].get(t) > 0).sort((x, y) => x - y);
      for (const t of ts) { this.ouStep(Q, Math.log(C[q.a].get(t)), Math.log(C[q.b].get(t))); Q.lt = t; }
      return Q;
    });
    this.say(`🔗 Cặp coin O-U: tháng ${mon} chọn ${PR.L.length} cặp đồng tích hợp từ ${ok.length} coin (${cand.length} cặp đạt) – ${PR.L.slice(0, 5).map((q) => `${q.a.replace(/USDT$/, "")}/${q.b.replace(/USDT$/, "")}`).join(", ")}${PR.L.length > 5 ? "…" : ""}`);
  }

  // ---------------------------------------------------------------- 💸 funding cực âm
  async fund(B, now) {
    const px = this.core.sw?.px; if (!px) return;
    const p = this.P("fund");
    for (const s of this.uni) {
      const x = px[s]; if (!x?.next) continue;
      const prev = this.fseen[s];
      if (prev == null) { this.fseen[s] = x.next; continue; }
      if (x.next === prev || now < prev + 60e3) continue;      // chưa qua kỳ chốt (đợi 1 phút cho sổ funding cập nhật)
      this.fseen[s] = x.next;
      if (!(this.fr?.[s] < 0)) continue;      // funding ngay trước kỳ chốt không âm → không thể là "cực âm", khỏi tải lịch sử
      try {
        const H = await this.get(`${FAPI}/fundingRate?symbol=${s}&limit=300`); await sleep(100);
        const L = (H || []).map((r) => ({ t: +r.fundingTime, f: +r.fundingRate })).sort((a, b) => a.t - b.t); if (L.length < 151) continue;
        const last = L[L.length - 1]; if (now - last.t > 30 * 60e3 || last.f >= 0) continue;
        const hist = L.filter((r) => r.t >= last.t - 90 * 24 * HR && r.t < last.t).map((r) => r.f); if (hist.length < 150) continue;
        const pct = hist.filter((f) => f < last.f).length / hist.length; if (pct > 0.05) continue;
        let r8 = null; const K = this.K1[s];
        if (K?.length > 9) { const c1 = K[K.length - 1].c, c9 = K[K.length - 9].c; r8 = c1 / c9 - 1; }
        if (p.abs && !(r8 >= 0)) { this.say(`💸 ${s.replace(/USDT$/, "")}: funding ${r2(last.f * 100, 4)}% (thấp nhất ${r2(pct * 100, 1)}% của 90 ngày) nhưng 8 giờ qua giá vẫn giảm ${r2(r8 * 100, 1)}% – chưa hấp thụ, bỏ qua`); continue; }
        const m = this.mid(s); if (!m) continue;
        this.sig("fund", B, [{ sym: s, side: 1, w: 1 }], { sl: p.sl ? m * (1 - p.sl) : null, exp: now + p.hold * HR, why: `funding ${r2(last.f * 100, 4)}%/kỳ – thấp nhất ${r2(pct * 100, 1)}% của 90 ngày${r8 != null ? `, 8 giờ qua giá ${r8 >= 0 ? "+" : ""}${r2(r8 * 100, 1)}%` : ""}` });
      } catch (e) { /* bỏ qua coin này */ }
    }
  }

  // ---------------------------------------------------------------- 📦 ORB + NR7
  async orbSetup(B, now) {
    const day = iso(now).slice(0, 10), W = this.core.S.q, p = this.P("orb");
    if (W.orbDay === day) return; W.orbDay = day; W.orbP = {};
    for (const P of Object.values(B.pos)) this.close("orb", P, "EOD", now);
    for (const s of this.uni) {
      let K; try { K = await this.get(`${FAPI}/klines?symbol=${s}&interval=1d&limit=60`); } catch (e) { continue; } await sleep(40);
      const D = (K || []).map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
      if (D.length < 52 || iso(D[D.length - 1].t).slice(0, 10) !== day) continue;
      const today = D[D.length - 1], Dc = D.slice(0, -1), n = Dc.length;
      const rng = Dc.map((d) => d.h - d.l), c = Dc.map((d) => d.c);
      const nr7 = rng[n - 1] <= Math.min(...rng.slice(-7));
      const bw = c.map((_, i) => (i >= 19 ? (rstd(c.slice(i - 19, i + 1), 20)[19] * 4) / (c.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20) : NaN));
      const bwlow = bw.slice(-30).every((v) => Number.isFinite(v)) && bw[n - 1] <= Math.min(...bw.slice(-30));
      const sel = p.flt === "nr7" ? nr7 : p.flt === "bb30" ? bwlow : nr7 && bwlow; if (!sel) continue;
      const st = Dc.slice(-10).reduce((a, d) => a + Math.min(d.h - d.o, d.o - d.l), 0) / 10, a14 = atr(Dc.map((d) => d.h), Dc.map((d) => d.l), c, 14)[n - 1];
      if (!(st > 0 && a14 > 0)) continue;
      W.orbP[s] = { o: today.o, up: today.o + st, dn: today.o - st, atr: a14, st, why: `${p.flt === "nr7" ? "hôm qua hẹp nhất 7 ngày (NR7)" : p.flt === "bb30" ? "Bollinger hẹp nhất 30 ngày" : "NR7 + Bollinger hẹp nhất 30 ngày"}, stretch ${r2(st / today.o * 100, 2)}%` };
    }
    const L = Object.keys(W.orbP);
    if (L.length) this.say(`📦 ORB + NR7: hôm nay ${day} chờ phá vỡ ${L.length} coin – ${L.slice(0, 6).map((s) => s.replace(/USDT$/, "")).join(", ")}${L.length > 6 ? "…" : ""}`);
  }
  orbWatch(B, now) {
    const W = this.core.S.q, P0 = W.orbP; if (!P0 || W.orbDay !== iso(now).slice(0, 10)) return;
    const eod = Math.floor(now / (24 * HR)) * 24 * HR + 24 * HR - 30e3;
    for (const P of Object.values(B.pos)) if (now >= eod) this.close("orb", P, "EOD", now);
    if (!this.on("orb") || now >= eod) return;
    for (const [s, O] of Object.entries(P0)) {
      if (O.done) continue; const m = this.mid(s); if (!m) continue;
      const side = m >= O.up ? 1 : m <= O.dn ? -1 : 0; if (!side) continue;
      O.done = true;
      this.sig("orb", B, [{ sym: s, side, w: 1 }], { sl: side > 0 ? O.dn : O.up, tp: m + side * this.P("orb").tp * O.atr, exp: eod, why: `${O.why} – giá phá ${side > 0 ? "lên" : "xuống"} ${+(side > 0 ? O.up : O.dn).toPrecision(6)}` });
    }
  }

  // ---------------------------------------------------------------- 〰️ VWAP ± kσ + HMM
  async regime(now) {
    const W = this.core.S.q, K = this.K1.BTCUSDT; if (!K?.length) return;
    if (!W.hmm || now - Date.parse(W.hmm.at + "Z") > 30 * 24 * HR) {      // học lại mỗi 30 ngày trên 6 tháng nến 1 giờ của BTC
      let L = []; let end = now;
      for (let r = 0; r < 3; r++) { const X = await this.get(`${FAPI}/klines?symbol=BTCUSDT&interval=1h&limit=1500&endTime=${end}`); const b = (X || []).filter((k) => +k[6] < now).map((k) => [+k[0], +k[4]]); L = [...b, ...L]; if (!b.length) break; end = b[0][0] - 1; await sleep(200); }
      const seen = new Set(); L = L.filter((x) => (seen.has(x[0]) ? false : seen.add(x[0]))).sort((a, b) => a[0] - b[0]).slice(-4380);
      const F = regFeat(L.map((x) => x[1])); if (F.length < 1000) return;
      const mu = [0, 1].map((d) => F.reduce((a, x) => a + x[d], 0) / F.length), sd = [0, 1].map((d) => Math.sqrt(F.reduce((a, x) => a + (x[d] - mu[d]) ** 2, 0) / F.length) + 1e-9);
      const P = hmmFit(F.map((x) => [(x[0] - mu[0]) / sd[0], (x[1] - mu[1]) / sd[1]]));
      W.hmm = { at: iso(now), P, mu, sd };
    }
    const F = regFeat(K.map((x) => x.c)); if (!F.length) return;
    const H = W.hmm; W.reg = { at: iso(now), p: r2(hmmFilter(F.slice(-200).map((x) => [(x[0] - H.mu[0]) / H.sd[0], (x[1] - H.mu[1]) / H.sd[1]]), H.P), 3) };
  }
  vwap(B, now) {
    const p = this.P("vwap"), W = this.core.S.q, day0 = Math.floor(now / (24 * HR)) * 24 * HR;
    for (const P of Object.values(B.pos)) { const V = this.vw(P.legs[0].sym, day0); if (V) P.tpDyn = V.vw[V.vw.length - 1]; }      // chốt ở VWAP của nến 5 phút vừa đóng
    if (p.hmm && !((W.reg?.p ?? 0) > 0.7)) return;
    for (const s of this.uni5) {
      const V = this.vw(s, day0); if (!V) continue;
      const { K, vw, sd } = V, i = K.length - 1, bar = Math.round((K[i].t - day0) / M5);
      if (bar < 12 || bar >= 276 || !(sd[i] > 0) || K[i].t < now - 2 * M5) continue;
      const c = K[i].c, side = p.side, band = side > 0 ? c < vw[i] - p.k * sd[i] : c > vw[i] + p.k * sd[i]; if (!band) continue;
      if (p.mfi) {
        const KK = this.K5[s], n = KK.length, lo12 = Math.min(...KK.slice(n - 12).map((x) => x.l)), hi12 = Math.max(...KK.slice(n - 12).map((x) => x.h)), M = mfiArr(KK);
        const mprev = M.slice(n - 13, n - 1).filter(Number.isFinite); if (mprev.length < 6) continue;
        const div = side > 0 ? KK[n - 1].l <= lo12 && M[n - 1] > Math.min(...mprev) : KK[n - 1].h >= hi12 && M[n - 1] < Math.max(...mprev);
        if (!div) continue;
      }
      this.sig("vwap", B, [{ sym: s, side, w: 1 }], { sl: vw[i] - side * (p.k + 1.5) * sd[i], tp: vw[i], exp: day0 + 24 * HR - M5, why: `giá ${side > 0 ? "dưới" : "trên"} VWAP ${p.k}σ (${r2((c / vw[i] - 1) * 100, 2)}%)${p.hmm ? `, BTC đi ngang p ${W.reg?.p}` : ""}${p.mfi ? ", phân kỳ MFI" : ""}` });
    }
  }
  vw(s, day0) {
    const KK = this.K5[s]; if (!KK?.length) return null;
    const K = KK.filter((x) => x.t >= day0); if (K.length < 12) return null;
    let pv = 0, v = 0, p2 = 0; const vw = [], sd = [];
    for (const x of K) { const tp = (x.h + x.l + x.c) / 3; pv += tp * x.v; v += x.v; p2 += tp * tp * x.v; const m = v > 0 ? pv / v : NaN; vw.push(m); sd.push(v > 0 ? Math.sqrt(Math.max(0, p2 / v - m * m)) : NaN); }
    return { K, vw, sd };
  }

  // ---------------------------------------------------------------- 🌊 thác thanh lý + OI
  liq(B, now) {
    const p = this.P("liq");
    for (const s of this.uni5) {
      const K = this.K5[s], R = this.OI[s]; if (!K || K.length < 25 || !R || R.length < 5) continue;
      const i = K.length - 1, b = Math.floor(K[i].t / M5); if (K[i].t < now - 2 * M5) continue;
      const oiNow = R.find((x) => x[0] === b)?.[1], prev = R.filter((x) => x[0] >= b - 4 && x[0] < b).map((x) => x[1]); if (!(oiNow > 0) || prev.length < 2) continue;
      const doi = oiNow / Math.max(...prev) - 1, side = p.side, x = K[i], c3 = K[i - 3].c, r3 = x.c / c3 - 1;
      const rg = x.h - x.l, wick = rg > 0 ? (side > 0 ? Math.min(x.o, x.c) - x.l : x.h - Math.max(x.o, x.c)) / rg : 0;
      const v20 = K.slice(i - 20, i).reduce((a, y) => a + y.v, 0) / 20;
      if (!(side * r3 <= -p.X && doi <= -p.Y && wick >= 0.4 && x.v > 3 * v20)) continue;
      const W3 = K.slice(i - 2, i + 1), pk = side > 0 ? Math.max(...W3.map((y) => y.h)) : Math.min(...W3.map((y) => y.l)), lw = side > 0 ? Math.min(...W3.map((y) => y.l)) : Math.max(...W3.map((y) => y.h));
      this.sig("liq", B, [{ sym: s, side, w: 1 }], { tp: lw + 0.5 * (pk - lw), sl: lw - 0.5 * (pk - lw), exp: now + p.hold * M5, why: `15 phút ${r2(r3 * 100, 1)}%, Open Interest ${r2(doi * 100, 1)}%, râu ${r2(wick * 100, 0)}%, khối lượng ${r2(x.v / v20, 1)}×` });
    }
  }

  // ---------------------------------------------------------------- xuất cho trang
  out() {
    const W = this.core.S?.q; if (!W) return null;
    const o = { on: this.core.where === "vps", upnl: r2(this.upnl(), 2), margin: r2(this.margin(), 2), uni: this.uni.length, reg: W.reg || null, hmmAt: W.hmm?.at || null,
      pairs: W.pairs ? { m: W.pairs.m, at: W.pairs.at, L: (W.pairs.L || []).map((q) => ({ id: q.id, beta: r2(q.th?.[0] ?? q.beta, 3), hl: r2(q.hl, 1), adf: q.adf })) } : null,
      orb: W.orbP ? { day: W.orbDay, L: Object.entries(W.orbP).map(([s, x]) => ({ s, up: x.up, dn: x.dn, done: !!x.done })) } : null, QP: Object.fromEntries(Object.keys(QS).map((k) => [k, this.P(k)])), QP0: QP, QS0: QS, QLIM, QR };
    for (const k of Object.keys(QS)) {
      const B = W[k]; if (!B) continue;
      o[k] = { ...this.R(k), on: this.on(k), st: { ...B.st, pnl: r2(B.st.pnl, 2), fee: r2(B.st.fee, 2), fund: r2(B.st.fund, 2) },
        pos: Object.values(B.pos).map((P) => { let u = 0; for (const L of P.legs) u += L.side * L.q * ((this.mid(L.sym) || L.last || L.e) - L.e); return { id: P.id, legs: P.legs.map((L) => ({ sym: L.sym, side: L.side, e: L.e, m: this.mid(L.sym) || L.last })), N: P.N, t0: P.t0, exp: iso(P.exp), sl: P.sl, tp: P.tpDyn ?? P.tp, why: P.why, upnl: r2(u + P.fund - P.fee, 3), pct: r2((u + P.fund - P.fee) / P.N * 100, 2) }; }),
        hist: B.hist.slice(-15).map((h) => ({ ...h, note: undefined })) };
    }
    return o;
  }
}
function mfiArr(K, n = 14) {
  const tp = K.map((x) => (x.h + x.l + x.c) / 3), out = new Array(K.length).fill(NaN);
  for (let i = n; i < K.length; i++) { let ps = 0, ns = 0; for (let j = i - n + 1; j <= i; j++) { const mf = tp[j] * K[j].v; if (tp[j] > tp[j - 1]) ps += mf; else if (tp[j] < tp[j - 1]) ns += mf; } out[i] = ns === 0 ? 100 : 100 - 100 / (1 + ps / ns); }
  return out;
}
export const _t = { ema, wild, sma, rsi, atr, adx, adfT, halfLife, corr, hmmFit, hmmFilter, regFeat, lstsq, mfiArr };
