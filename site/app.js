/* MyBit – phân tích crypto spot & futures (vanilla JS, không cần build). Chỉ phân tích & cảnh báo, không đặt lệnh. */
"use strict";

// ================================================================ tiện ích
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = (x) => x !== null && x !== undefined && x !== "" && typeof x !== "boolean" && !Number.isNaN(Number(x));
const NF = {};
const nf = (x, d = 2) => (isNum(x) ? (NF[d] || (NF[d] = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }))).format(Number(x)) : "—");
const pct = (x, d = 1, sign = true) => (isNum(x) ? (sign && x > 0 ? "+" : "") + nf(x, d) + "%" : "—");
const cls = (x) => (!isNum(x) ? "" : x > 0 ? "up" : x < 0 ? "down" : "ref");
// giá crypto: từ 0,00000123 đến 100.000 → số chữ số thập phân theo độ lớn
const pdec = (x) => { const a = Math.abs(Number(x)); return a >= 1000 ? 2 : a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : a > 0 ? Math.min(10, Math.ceil(-Math.log10(a)) + 3) : 2; };
const px = (x) => (isNum(x) ? nf(x, pdec(x)) : "—");
const usd = (x, d = 1) => { if (!isNum(x)) return "—"; const a = Math.abs(x), s = x < 0 ? "-" : ""; return a >= 1e12 ? `${s}$${nf(a / 1e12, 2)} nghìn tỷ` : a >= 1e9 ? `${s}$${nf(a / 1e9, d + 1)} tỷ` : a >= 1e6 ? `${s}$${nf(a / 1e6, d)} tr` : a >= 1e3 ? `${s}$${nf(a / 1e3, d)} k` : `${s}$${nf(a, 0)}`; };
const QF = {};
const qty = (x) => { if (!isNum(x)) return "—"; const a = Math.abs(x), d = a >= 1000 ? 0 : a >= 1 ? 3 : 6; return (QF[d] || (QF[d] = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: d }))).format(Number(x)); };
const CSSV = {};
const css = (v) => { const k = (document.documentElement.dataset.theme || "") + v; return k in CSSV ? CSSV[k] : (CSSV[k] = getComputedStyle(document.documentElement).getPropertyValue(v).trim()); };
const enc = encodeURIComponent;
const lsGet = (k, d) => { try { const v = localStorage.getItem("mybit_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem("mybit_" + k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } };
const fmtT = (t) => { const d = new Date(t * 1000); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; };
const fmtD = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : "—");

const cache = {};
async function load(path) {
  if (cache[path]) return cache[path];
  const v = window.__ver || "";
  const r = await fetch(path + (path.includes("?") ? "" : `?v=${v}`), { cache: v ? "default" : "no-cache" });
  if (!r.ok) throw new Error(`Không tải được ${path} (HTTP ${r.status})`);
  return (cache[path] = await r.json());
}
async function tryLoad(path) { try { return await load(path); } catch (e) { return null; } }
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function scoreColor(v) {
  if (!isNum(v)) return "var(--sunk)";
  const t = Math.max(0, Math.min(1, v / 100));
  const a = t < 0.5 ? css("--down") : css("--up");
  const alpha = Math.round(Math.abs(t - 0.5) * 2 * 60 + 10);
  return `color-mix(in srgb, ${a} ${alpha}%, transparent)`;
}
const scoreCell = (v) => `<span class="score" style="background:${scoreColor(v)}">${isNum(v) ? Math.round(v) : "—"}</span>`;
const kpis = (items, lg = false, extra = "") => `<dl class="kpis ${lg ? "lg" : ""} ${extra}">${items.filter(Boolean).map(([k, v, c, t]) => `<div${t ? ` title="${esc(t)}"` : ""}><dt>${k}</dt><dd class="${c || ""}">${v ?? "—"}</dd></div>`).join("")}</dl>`;
const panel = (title, body, meta = "", extra = "") => `<section class="panel ${extra}"><div class="ph"><h2>${title}</h2>${meta ? `<span class="meta">${meta}</span>` : ""}</div>${body}</section>`;
const pill = (t, k = "") => `<span class="pill ${k}">${t}</span>`;
const VD_CLS = { "Rẻ": "buy", "Hợp lý": "brand", "Hơi đắt": "", "Đắt": "sell", "Đầu cơ": "warn", "Theo chu kỳ": "brand", "L1 rẻ tương đối": "buy", "L1 ngang nhóm": "brand", "L1 đắt tương đối": "sell" };
const vdPill = (v) => (v ? pill(esc(v), VD_CLS[v] ?? "") : "—");
const TS = { 1: ["Tăng", "buy"], 0: ["Ngang", ""], "-1": ["Giảm", "sell"] };
const tsPill = (s, d) => (s == null ? "—" : pill(`${TS[s][0]}${isNum(d) ? ` <small>${d}n</small>` : ""}`, TS[s][1]));
const CROWD = { long_crowded: ["Long đông", "sell"], short_crowded: ["Short đông", "buy"], oi_spike: ["OI vọt", "warn"], lsr_high: ["Nhỏ lẻ Long", ""], lsr_low: ["Nhỏ lẻ Short", ""] };
const crowdPills = (a) => (a || []).map((k) => (CROWD[k] ? pill(CROWD[k][0], CROWD[k][1]) : "")).join(" ");
const f8c = (x) => (!isNum(x) ? "" : x >= 0.05 ? "down" : x <= -0.03 ? "up" : x > 0.015 ? "ref" : "");
const f8s = (x) => (isNum(x) ? `${x > 0 ? "+" : ""}${nf(x, 4)}%` : "—");

// ================================================================ lưu dữ liệu riêng (Cloudflare D1 / KV, dự phòng localStorage)
const Store = {
  async get(key) {
    try {
      const r = await fetch(`api/${key}`, { cache: "no-store" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) return { data: await r.json(), remote: true };
    } catch (e) { /* chạy trên máy: không có API */ }
    if (ME && !ME.legacy) return { data: null, remote: false };
    return { data: lsGet(key, null), remote: false };
  },
  async put(key, data) {
    const multi = ME && !ME.legacy;
    if (!multi) lsSet(key, data);
    try {
      const r = await fetch(`api/${key}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      if (r.ok) return true;
      if (multi) { let m = `Chưa lưu được (HTTP ${r.status})`; try { m = (await r.json()).error || m; } catch (e) { /* rỗng */ } setTimeout(() => toast("⚠️ " + m), 60); }
    } catch (e) { /* bỏ qua */ }
    return multi ? false : true;
  },
};

// ================================================================ đồ thị
const IND = {
  sma(a, n) { const o = []; let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; o.push(i >= n - 1 ? s / n : null); } return o; },
  ema(a, n) { const k = 2 / (n + 1); const o = []; let e = null; for (let i = 0; i < a.length; i++) { if (i === n - 1) { e = a.slice(0, n).reduce((x, y) => x + y, 0) / n; } else if (i >= n) e = a[i] * k + e * (1 - k); o.push(i >= n - 1 ? e : null); } return o; },
  rsi(a, n = 14) { const o = [null]; let g = 0, l = 0; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; const G = Math.max(d, 0), L = Math.max(-d, 0); if (i <= n) { g += G / n; l += L / n; o.push(i === n ? (l === 0 ? 100 : 100 - 100 / (1 + g / l)) : null); } else { g = (g * (n - 1) + G) / n; l = (l * (n - 1) + L) / n; o.push(l === 0 ? 100 : 100 - 100 / (1 + g / l)); } } return o; },
};
const charts = [];
function disposeCharts() { while (charts.length) { try { charts.pop().remove(); } catch (e) { /* đã huỷ */ } } if (typeof closeWs === "function") closeWs(); if (typeof rdClose === "function") rdClose(); if (typeof plClose === "function") plClose(); if (typeof oppClose === "function") oppClose(); if (typeof lvClose === "function" && !location.hash.startsWith("#/live")) lvClose(); }
function themeOpts() {
  return {
    layout: { background: { color: "transparent" }, textColor: css("--ink-2"), fontFamily: "Be Vietnam Pro, system-ui", fontSize: 11 },
    grid: { vertLines: { visible: false }, horzLines: { color: css("--line-2") } },
    rightPriceScale: { borderColor: css("--line") }, timeScale: { borderColor: css("--line"), timeVisible: true, secondsVisible: false },
    crosshair: { mode: 0 }, localization: { locale: "vi-VN", priceFormatter: (p) => px(p) },
  };
}
function mkChart(el, extra = {}) { const c = LightweightCharts.createChart(el, { ...themeOpts(), autoSize: true, ...extra }); charts.push(c); return c; }
function candleChart(el, o, opts = {}) {
  const c = mkChart(el);
  const cs = c.addCandlestickSeries({ upColor: css("--up"), downColor: css("--down"), borderVisible: false, wickUpColor: css("--up"), wickDownColor: css("--down"),
    priceFormat: { type: "price", precision: pdec(o.c[o.c.length - 1]), minMove: 10 ** -pdec(o.c[o.c.length - 1]) } });
  cs.setData(o.t.map((t, i) => ({ time: t, open: o.o[i], high: o.h[i], low: o.l[i], close: o.c[i] })));
  if (opts.volume !== false) {
    const vs = c.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    vs.setData(o.t.map((t, i) => ({ time: t, value: o.v[i] || 0, color: o.c[i] >= (o.c[i - 1] ?? o.c[i]) ? css("--up") + "55" : css("--down") + "55" })));
  }
  (opts.ma || []).forEach(([kind, n, color]) => {
    const v = IND[kind](o.c, n);
    const s = c.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    s.setData(o.t.map((t, i) => (v[i] == null ? null : { time: t, value: v[i] })).filter(Boolean));
  });
  (opts.lines || []).forEach((l) => { if (isNum(l.price)) cs.createPriceLine({ price: Number(l.price), color: l.color || css("--ink-3"), lineWidth: 1, lineStyle: l.style ?? 2, axisLabelVisible: true, title: l.title || "" }); });
  if (opts.from) c.timeScale().setVisibleRange({ from: opts.from, to: o.t[o.t.length - 1] });
  return { c, cs };
}
function lineSvg(series, opt = {}) {
  const W = opt.w || 640, H = opt.h || 180, pl = 40, pr = 8, pt = 8, pb = 18;
  const all = series.flatMap((s) => s.pts.map((p) => p.y)).filter(isNum).concat(opt.hlines ? opt.hlines.map((h) => h.y) : []);
  if (!all.length) return `<p class="muted">Chưa có số liệu.</p>`;
  let mn = Math.min(...all), mx = Math.max(...all);
  if (opt.zero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); }
  if (isNum(opt.min)) mn = Math.min(mn, opt.min);
  if (isNum(opt.max)) mx = Math.max(mx, opt.max);
  if (mx === mn) { mx += 1; mn -= 1; }
  const pad = (mx - mn) * 0.06; mn -= pad; mx += pad;
  const lg = !!opt.log && mn > 0;
  const T = (v) => (lg ? Math.log10(v) : v), tmn = T(mn > 0 || !lg ? mn : 1e-9), tmx = T(mx);
  const n = Math.max(...series.map((s) => s.pts.length));
  const X = (i) => pl + (i / Math.max(1, n - 1)) * (W - pl - pr);
  const Y = (v) => pt + (1 - (T(v) - tmn) / (tmx - tmn)) * (H - pt - pb);
  let s = `<svg class="svgchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label || "biểu đồ")}">`;
  (opt.bands || []).forEach((b) => { const y1 = Y(Math.min(mx, b.hi)), y2 = Y(Math.max(mn, b.lo)); if (y2 > y1) s += `<rect x="${pl}" width="${W - pl - pr}" y="${y1}" height="${y2 - y1}" fill="${b.color}" opacity="${b.op ?? 0.1}"/>`; });
  for (let k = 0; k <= 3; k++) { const tv = tmn + (tmx - tmn) * k / 3, v = lg ? 10 ** tv : tv; s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line-2)"/><text x="2" y="${Y(v) + 3}">${opt.fmt ? opt.fmt(v) : nf(v, opt.dec ?? 1)}</text>`; }
  (opt.hlines || []).forEach((h) => { s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(h.y)}" y2="${Y(h.y)}" stroke="${h.color || "var(--ink-3)"}" stroke-dasharray="4 3"/>${h.label ? `<text x="${W - pr - 2}" y="${Y(h.y) - 3}" text-anchor="end" style="fill:${h.color || "var(--ink-3)"}">${esc(h.label)}</text>` : ""}`; });
  series.forEach((se) => {
    if (se.bars) {
      const bw = Math.max(1, (W - pl - pr) / n - 1);
      se.pts.forEach((p, i) => { if (!isNum(p.y)) return; const y0 = Y(Math.max(mn, Math.min(mx, 0))), y1 = Y(p.y); s += `<rect x="${X(i) - bw / 2}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(0.5, Math.abs(y1 - y0))}" fill="${se.color || (p.y >= 0 ? css("--up") : css("--down"))}" opacity=".75"><title>${esc(p.x)}: ${opt.fmt ? opt.fmt(p.y) : nf(p.y, opt.dec ?? 1)}</title></rect>`; });
      return;
    }
    const d = se.pts.map((p, i) => (isNum(p.y) ? `${X(i)},${Y(p.y)}` : null)).filter(Boolean).join(" ");
    s += `<polyline fill="none" stroke="${se.color}" stroke-width="${se.width || 1.6}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ""} points="${d}"/>`;
  });
  const ref = series[0].pts;
  const step = Math.ceil(ref.length / (opt.ticks || 6));
  ref.forEach((p, i) => { if (i % step === 0 || i === ref.length - 1) s += `<text x="${X(i)}" y="${H - 4}" text-anchor="middle">${esc(p.x)}</text>`; });
  s += `</svg>`;
  const legend = series.filter((x) => x.name).map((x) => `<span><i style="background:${x.color || css("--brand")}"></i>${esc(x.name)}</span>`).join("");
  return s + (legend ? `<div class="leg">${legend}</div>` : "");
}
function gauge(v, lo = 0, hi = 100, label = "") {
  const t = Math.max(0, Math.min(1, ((v ?? lo) - lo) / (hi - lo)));
  return `<div class="gauge"><div class="gbar"><i style="left:${t * 100}%"></i></div><div class="gl"><span>${esc(label)}</span></div></div>`;
}

// ================================================================ khung trang
function setTab(r) { $$("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.r === r)); }
const app = () => $("#app");
async function route() {
  disposeCharts();
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/");
  const r = parts[0], arg = parts.slice(1).map((x) => decodeURIComponent(x));
  window.scrollTo(0, 0);
  if (!app().querySelector(".panel")) app().innerHTML = `<div class="skel"><i></i><i></i><i></i><i class="w"></i><i class="w"></i></div>`;
  try {
    if (!r) { setTab("market"); await viewMarket(); }
    else if (r === "coins") { setTab("coins"); await viewCoins(arg[0]); }
    else if (r === "c" && arg[0]) { setTab("coins"); await viewCoin(arg[0].toUpperCase(), arg[1]); }
    else if (r === "live") { setTab("live"); await viewLive(); }
    else if (r === "radar") { setTab("radar"); await viewRadar(); }
    else if (r === "pairs") { setTab("pairs"); await viewPairs(); }
    else if (r === "sectors") { setTab("sectors"); await viewSectors(); }
    else if (r === "sector" && arg[0]) { setTab("sectors"); await viewSector(arg[0]); }
    else if (r === "plan") { setTab("plan"); await viewPlan(arg[0] ? arg[0].toUpperCase() : ""); }
    else if (r === "ideas") { setTab("ideas"); await viewIdeas(arg[0]); }
    else if (r === "futures") { setTab("futures"); await viewFutures(arg[0]); }
    else if (r === "portfolio") { setTab("portfolio"); await viewPortfolio(); }
    else if (r === "tools") { setTab("tools"); await viewTools(arg[0]); }
    else if (r === "backtest") { setTab("backtest"); await viewBacktest(); }
    else if (r === "help") { setTab(""); await viewHelp(); }
    else if (r === "account") { setTab(""); await viewAccount(); }
    else if (r === "admin") { setTab(""); await viewAdmin(arg[0]); }
    else if (r === "notifications") { setTab(""); await viewNotifications(); }
    else app().innerHTML = `<div class="empty">Không có trang này. <a href="#/">Về trang Thị trường</a></div>`;
  } catch (e) {
    console.error(e);
    app().innerHTML = `<div class="panel"><h2>Chưa có dữ liệu để hiển thị</h2><p>${esc(e.message)}</p><p class="muted">Hệ thống cập nhật mỗi 4 giờ. Nếu đây là lần đầu, chờ lượt chạy đầu tiên hoàn tất.</p></div>`;
  }
  app().focus({ preventScroll: true });
}

// ================================================================ dữ liệu chung
let COINS = null, BYK = null;
async function coins() {
  if (!COINS) { COINS = await load("data/coins.json"); BYK = Object.fromEntries(COINS.rows.map((r) => [r.k, r])); await liveData(); }
  return COINS;
}
const coinLink = (k, sub = "") => { const r = BYK?.[k]; return `<a href="#/c/${enc(k)}${sub}" class="ck"><b>${esc(k)}</b>${r && r.n && r.n.toUpperCase() !== k ? `<small>${esc(r.n)}</small>` : ""}</a>`; };
function coinMini(k, extra = "") {
  const r = BYK?.[k]; if (!r) return "";
  return `<a class="row" href="#/c/${enc(k)}"><div class="rm"><b>${esc(k)}</b><small class="muted">${esc(r.n || "")}</small></div><div class="rv"><span>${px(r.p)}</span><small class="${cls(r.r1)}">${pct(r.r1)}</small></div>${extra ? `<div class="rx">${extra}</div>` : ""}</a>`;
}

// ================================================================ THỊ TRƯỜNG
const LIGHT_VI = { green: "Xanh", yellow: "Vàng", red: "Đỏ" };
function spark(vals, o = {}) {
  const v = (vals || []).filter(isNum).map(Number); if (v.length < 3) return "";
  const W = o.w || 120, H = o.h || 26, mn = Math.min(...v), mx = Math.max(...v), d = mx - mn || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 2 - (y - mn) / d * (H - 4)).toFixed(1)}`).join(" ");
  const col = o.color || (v[v.length - 1] >= v[0] ? css("--up") : css("--down"));
  return `<svg class="spk" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="${col}" stroke-width="1.5" points="${pts}"/></svg>`;
}
// thẻ số liệu: [nhãn, giá trị, dòng phụ, tín hiệu (+1 tốt / -1 xấu / 0), chú thích, sparkline, id]
const stc = ([k, v, sub, sg, tip, sp, id], grp) => `<div class="st ${sg > 0 ? "g" : sg < 0 ? "b" : ""}" ${tip ? `title="${esc(tip)}"` : ""}><dt>${grp ? `<i class="sgp">${esc(grp)}</i>` : ""}${k}</dt><dd ${id ? `id="${id}"` : ""}>${v ?? "—"}</dd>${sub ? `<small>${sub}</small>` : ""}${sp || ""}</div>`;
const STG_TAG = { "Xu hướng": "Xu hướng", "Độ rộng thị trường": "Độ rộng", "Định giá Bitcoin (on-chain)": "On-chain", "Tâm lý & đòn bẩy": "Đòn bẩy", "Thanh khoản": "Thanh khoản" };
const stGroup = (title, items) => `<div class="stg"><h3>${title}</h3><dl class="stats">${items.filter(Boolean).map((x) => stc(x, STG_TAG[title])).join("")}</dl></div>`;
const sgn = (x, good = 1, th = 0) => (!isNum(x) ? 0 : x > th ? good : x < -th ? -good : 0);
async function viewMarket() {
  const [M, IJ] = await Promise.all([load("data/market.json"), tryLoad("data/ideas.json"), coins()]);
  const L0 = await liveData();
  const IDS = ((L0 && L0.ideas && IJ && new Date(L0.at) > new Date(IJ.at)) ? L0.ideas : (IJ?.items || [])).filter((x) => x.edge).slice(0, 8);
  const b = M.btc || {}, cy = M.cycle || {}, F = M.fng || {}, P = M.play || {}, L = M.light || {}, A = M.agg || {}, G = M.global || {}, X = M.ex || {}, br = M.breadth || {};
  const lst = M.lists || {}, dom = G.dom || {}, pl = cy.pl, E = X.eth || {}, adv = X.adv || {};
  const BT = BYK.BTC || {};
  const mz = (cy.mvrv_fwd || []).find((z) => z.zone === cy.mvrv_zone) || {};
  const trendUp = COINS.rows.filter((r) => r.ts === 1 && (r.vol || 0) >= 1e6).length, liqN = COINS.rows.filter((r) => (r.vol || 0) >= 1e6).length;
  const st = F.study || {};
  const fngRows = (st.rows || []).filter((r) => r.reg !== "all");
  const fngTbl = ["Sợ hãi tột độ", "Sợ hãi", "Trung lập", "Tham lam", "Tham lam tột độ"].map((z) => {
    const u = fngRows.find((r) => r.zone === z && r.reg === "up") || {}, d = fngRows.find((r) => r.zone === z && r.reg === "down") || {};
    return `<tr class="${z === F.zone ? "hl" : ""}"><td class="l">${esc(z)}</td><td class="${cls(u.med90)}">${pct(u.med90, 0)}</td><td>${isNum(u.win90) ? nf(u.win90, 0) + "%" : "—"}</td><td class="${cls(d.med90)}">${pct(d.med90, 0)}</td><td>${isNum(d.win90) ? nf(d.win90, 0) + "%" : "—"}</td></tr>`;
  }).join("");
  const zoneTbl = (cy.mvrv_fwd || []).map((z) => `<tr class="${z.zone === cy.mvrv_zone ? "hl" : ""}"><td class="l">${esc(z.zone)}</td><td>${nf(z.n, 0)}</td><td class="${cls(z.med1y)}">${pct(z.med1y, 0)}</td><td>${nf(z.win, 0)}%</td></tr>`).join("");
  const list = (keys, fn, n = 8) => (keys || []).slice(0, n).map((k) => coinMini(k, fn(BYK[k] || {}))).join("") || `<p class="muted">—</p>`;
  const sec = (X.sectors || []).map((s) => `<tr><td class="l"><a href="#/sector/${enc(s.g)}"><b>${esc(s.g)}</b></a> <small class="faint">${s.n}</small></td><td class="${cls(s.r1)}">${pct(s.r1, 1)}</td><td class="${cls(s.r7)}">${pct(s.r7, 1)}</td><td class="${cls(s.r30)}">${pct(s.r30, 0)}</td><td>${usd(s.mc)}</td><td>${nf(s.up / s.n * 100, 0)}%</td><td class="l">${coinLink(s.best)} <small class="${cls(s.best7)}">${pct(s.best7, 0)}</small></td></tr>`).join("");
  app().innerHTML = `
  <div class="ph"><h1>Thị trường crypto</h1><span class="meta">cập nhật ${esc(new Date(M.at).toLocaleString("vi-VN"))} · ${nf(M.counts?.coins, 0)} coin (${nf(M.counts?.fut, 0)} có futures, ${nf(M.counts?.spot, 0)} trên Binance spot) · <a href="#/radar">⚡ Radar vào lệnh</a> · <a href="#/pairs">Cặp coin</a> · <a href="#/live">Binance trực tiếp →</a></span></div>
  <section class="panel hero light-${L.color}"><div class="ph"><h2>🚦 Đèn thị trường: ${LIGHT_VI[L.color] || "—"} – ${esc(L.text || "")}</h2><span class="meta">${esc(P.head || "")}</span></div>
  <div class="stgs">
    ${stGroup("Xu hướng", [
      ["BTC", `$${nf(BT.p ?? b.price, 0)}`, `<span class="${cls(BT.r1)}">${pct(BT.r1, 2)} 24h</span>`, sgn(BT.r1), "Giá trực tiếp (Binance)", spark(b.sp), "mkBtc"],
      ["BTC so với MA200", pct(b.dist200), `MA200 $${nf(b.ma200, 0)} · ${b.above200 ? "trên" : "dưới"} ${b.run_days} ngày`, sgn(b.dist200)],
      ["BTC 7 / 30 / 90 ngày", `<span class="${cls(b.r7)}">${pct(b.r7, 0)}</span> <span class="${cls(b.r30)}">${pct(b.r30, 0)}</span> <span class="${cls(b.r90)}">${pct(b.r90, 0)}</span>`, `xu hướng ${b.state === "up" ? "tăng" : b.state === "down" ? "giảm" : "chuyển tiếp"} · MA50 ${b.golden ? ">" : "<"} MA200`, b.state === "up" ? 1 : b.state === "down" ? -1 : 0],
      ["Cách đỉnh lịch sử", pct(b.from_ath), `đỉnh $${nf(b.ath, 0)}`, -1],
      ["ETH", `$${nf((BYK.ETH || {}).p ?? E.p, 0)}`, `7n ${pct(E.r7, 0)} · 30n ${pct(E.r30, 0)}`, sgn(E.r30)],
      ["ETH / BTC", nf(E.ethbtc, 4), `30n ${pct(E.ethbtc30, 1)} · cao hơn ${nf(E.ethbtc_pctl, 0)}% thời gian 4 năm`, sgn(E.ethbtc30), "Tỷ giá ETH so với BTC – tăng là dấu hiệu tiền chảy sang altcoin"],
      ["Tổng vốn hoá", usd(G.total_mcap), `<span class="${cls(G.mcap_chg_24h)}">${pct(G.mcap_chg_24h, 2)} 24h</span>`, sgn(G.mcap_chg_24h)],
      ["BTC dominance", isNum(dom.btc) ? nf(dom.btc, 1) + "%" : "—", `ETH ${nf(dom.eth, 1)}% · altcoin ${nf(100 - (dom.btc || 0) - (dom.eth || 0), 1)}%`, 0, "Tỷ trọng vốn hoá BTC – giảm thường là mùa altcoin"],
      ["Mùa altcoin", isNum(M.alt?.idx) ? nf(M.alt.idx, 0) + "/100" : "—", M.alt?.idx >= 75 ? "mùa altcoin" : M.alt?.idx <= 25 ? "mùa Bitcoin" : `trung tính · BTC 90n ${pct(M.alt?.btc_r, 0)}`, 0, "% top 50 tăng tốt hơn BTC trong 90 ngày"]])}
    ${stGroup("Độ rộng thị trường", [
      ["Coin tăng 24h", `${nf(adv.up, 0)} / ${nf(adv.n, 0)}`, `${nf(adv.up / Math.max(1, adv.n) * 100, 0)}% · 7 ngày: ${nf(adv.up7 / Math.max(1, adv.n) * 100, 0)}%`, sgn(adv.up / Math.max(1, adv.n) - 0.5)],
      ["Trên MA50 / MA200", `${nf(br.above50, 0)}% / ${nf(br.above200, 0)}%`, br.above200 < 20 ? "vùng đáy diện rộng" : br.above200 > 80 ? "hưng phấn diện rộng" : "top 300 vốn hoá", sgn(br.above200 - 50)],
      ["Đỉnh / đáy 52 tuần", `<span class="up">${nf(X.hl52?.hi, 0)}</span> / <span class="down">${nf(X.hl52?.lo, 0)}</span>`, "số coin sát đỉnh / đáy 1 năm", sgn((X.hl52?.hi || 0) - (X.hl52?.lo || 0))],
      ["Coin đang xu hướng tăng", `${nf(trendUp, 0)} / ${nf(liqN, 0)}`, `${nf(trendUp / Math.max(1, liqN) * 100, 0)}% có tín hiệu Long khung ngày`, sgn(trendUp / Math.max(1, liqN) - 0.4)]])}
    ${stGroup("Định giá Bitcoin (on-chain)", [
      ["MVRV", nf(cy.mvrv, 2), `vùng ${esc(cy.mvrv_zone || "")} · cao hơn ${nf(cy.mvrv_pctl, 0)}% lịch sử`, cy.mvrv < 1.5 ? 1 : cy.mvrv > 3 ? -1 : 0, "Vốn hoá / vốn hoá thực. <1 đáy chu kỳ, >3 đỉnh chu kỳ"],
      ["Giá vốn toàn mạng", `$${nf(cy.realized_price, 0)}`, `giá đang cao hơn ${pct(((BT.p ?? b.price) / cy.realized_price - 1) * 100, 0)}`, 0, "Realized price – giá trung bình mà mỗi BTC được giao dịch lần cuối"],
      ["Mayer multiple", nf(cy.mayer, 2), `giá / MA200 · cao hơn ${nf(cy.mayer_pctl, 0)}% lịch sử`, cy.mayer < 0.8 ? 1 : cy.mayer > 2.4 ? -1 : 0],
      pl ? ["Mô hình luỹ thừa", `$${nf(pl.fair, 0)}`, `vị trí ${nf(pl.pos, 0)}/100 · 1 năm nữa $${nf(pl.fair_1y, 0)}`, pl.pos < 30 ? 1 : pl.pos > 75 ? -1 : 0, `Dải 5–95%: $${nf(pl.lo, 0)} – $${nf(pl.hi, 0)}`] : null,
      ["Lịch sử vùng MVRV này", pct(mz.med1y, 0), `BTC 1 năm sau (trung vị) · tăng ${nf(mz.win, 0)}% số lần`, sgn(mz.med1y)]])}
    ${stGroup("Tâm lý & đòn bẩy", [
      ["Sợ hãi & Tham lam", `${isNum(F.now) ? F.now : "—"} · ${esc(F.zone || "")}`, `hôm qua ${X.fng_1d ?? "—"} · 7n ${X.fng_7d ?? "—"} · 30n ${X.fng_30d ?? "—"}`, F.now <= 25 ? 1 : F.now >= 75 ? -1 : 0, "", spark((F.series || []).slice(-60).map((x) => x[1]), { color: css("--brand") })],
      ["Funding TB (theo OI)", f8s(A.f8), `${nf(X.f_pos, 0)}% coin dương · ${nf(X.f_hot_n, 0)} nóng · ${nf(X.f_neg_n, 0)} âm`, A.f8 > 0.03 ? -1 : A.f8 < 0 ? 1 : 0, "Funding 8 giờ trung bình theo OI"],
      ["Tổng OI futures", usd(A.oi), `24h ${pct(X.oi24, 1)} · OI/vốn hoá ${nf(A.oi_mc, 2)}%`, 0, "Bitget + OKX + Gate + Hyperliquid"],
      ["BTC funding · OI 7n", f8s(X.btc_f8), `OI ${usd(X.btc_oi)} · 7n ${pct(X.btc_oi7, 0)}`, X.btc_f8 > 0.03 ? -1 : X.btc_f8 < 0 ? 1 : 0],
      ["BTC Long/Short (Binance)", nf(X.btc_lsr, 2), `top trader ${nf(X.btc_top, 2)} · taker mua/bán ${nf(X.btc_taker, 2)}`, X.btc_lsr > 2.5 ? -1 : X.btc_lsr < 0.9 ? 1 : 0, "Tỉ lệ tài khoản – chỉ báo ngược khi cực đoan"],
      ["Biến động kỳ vọng (DVOL)", `BTC ${nf(M.dvol_btc?.now, 0)} · ETH ${nf(M.dvol_eth?.now, 0)}`, `BTC cao hơn ${nf(M.dvol_btc?.pctl, 0)}% thời gian 1 năm`, 0, "Deribit DVOL – kỳ vọng biến động năm hoá từ quyền chọn"],
      ["Dòng tiền BTC (ngày)", isNum(X.btc_mf) ? `${X.btc_mf > 0 ? "+" : ""}${X.btc_mf}/100` : "—", "mua/bán chủ động, OBV, CMF", sgn(X.btc_mf, 1, 10)]])}
    ${stGroup("Thanh khoản", [
      ["Stablecoin lưu hành", usd(M.stable?.now), `30n ${pct(M.stable?.c30, 2)} · 90n ${pct(M.stable?.c90, 2)}`, sgn(M.stable?.c30), "Tiền chờ trong hệ sinh thái – tăng = tiền mới vào", spark((M.stable?.series || []).slice(-90).map((x) => x[1]))],
      ["Khối lượng 24h", usd(G.total_vol), `${nf(G.total_vol / Math.max(1, G.total_mcap) * 100, 1)}% vốn hoá`, 0]])}
  </div></section>
  <section class="panel"><div class="ph"><h2>🗺️ Bản đồ nhiệt top 100 vốn hoá</h2><span class="meta"><span class="seg" id="hmS"><button data-k="r1" class="on">24h</button><button data-k="r7">7 ngày</button><button data-k="r30">30 ngày</button></span> ô càng to vốn hoá càng lớn · bấm để mở coin</span></div><div id="hm">${heatMap(COINS.rows, "r1")}</div></section>
  <div class="g g4">
    ${panel("Sợ hãi & Tham lam", lineSvg([{ color: css("--brand"), pts: (F.series || []).map(([d, v]) => ({ x: fmtD(d), y: v })) }], { h: 130, min: 0, max: 100, bands: [{ lo: 0, hi: 25, color: css("--up") }, { lo: 75, hi: 100, color: css("--down") }], dec: 0 }))}
    ${panel("MVRV Bitcoin", lineSvg([{ color: css("--brand"), pts: (cy.mvrv_series || []).slice(-900).map(([d, v]) => ({ x: fmtD(d), y: v })) }], { h: 130, dec: 1, hlines: [{ y: 1, color: css("--up") }, { y: 3, color: css("--down") }] }))}
    ${panel("Độ rộng (% trên MA50 / MA200)", lineSvg([{ color: css("--brand"), pts: (br.series || []).map(([d, a]) => ({ x: fmtD(d), y: a })) }, { color: css("--ref"), pts: (br.series || []).map(([d, , c]) => ({ x: fmtD(d), y: c })) }], { h: 130, min: 0, max: 100, dec: 0 }))}
    ${panel("Stablecoin (tỷ USD)", lineSvg([{ color: css("--up"), pts: (M.stable?.series || []).map(([d, v]) => ({ x: fmtD(d), y: v })) }], { h: 130, dec: 0 }))}
  </div>
  <div class="g g3">
    ${panel(`😨 Nên làm gì lúc này (${esc(F.zone || "")})`, `<div class="play"><ul>${(P.lines || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`)}
    ${panel(`BTC 90 ngày sau theo vùng tâm lý <small class="muted">từ ${esc((st.since || "").slice(0, 4))}</small>`, `<div class="tw"><table><thead><tr><th class="l">Vùng</th><th colspan="2">BTC trên MA200</th><th colspan="2">BTC dưới MA200</th></tr></thead><tbody>${fngTbl}</tbody></table></div><p class="faint" style="font-size:.7rem">Trung vị lợi nhuận · xác suất tăng</p>`)}
    ${panel("BTC 1 năm sau theo vùng MVRV <small class='muted'>từ 2014</small>", `<div class="tw"><table><thead><tr><th class="l">MVRV</th><th>Số ngày</th><th>Trung vị</th><th>Tăng</th></tr></thead><tbody>${zoneTbl}</tbody></table></div>`)}
  </div>
  <div class="g g2w">
    ${panel("🧭 Nhóm ngành (coin có khối lượng ≥ $1 tr) – <a href='#/sectors'>bản đồ luân chuyển & giải thích từng nhóm →</a>", `<div class="tw"><table><thead><tr><th class="l">Nhóm</th><th>24h</th><th>7 ngày</th><th>30 ngày</th><th>Vốn hoá</th><th>Đang tăng</th><th class="l">Mạnh nhất 7n</th></tr></thead><tbody>${sec}</tbody></table></div>`, "trung vị biến động")}
    <div>${panel("🎯 Cơ hội có lợi thế lịch sử", IDS.length ? `<div class="rows">${IDS.map((x) => coinMini(x.k, `<span class="pill ${x.side === "long" ? "buy" : "sell"}">${x.side === "long" ? "L" : "S"}</span> <small>${x.tf === "d" ? "ngày" : "4h"} · MT1 ${pct(x.t1_pct, 1)} · ${isNum(x.win1) ? nf(x.win1, 0) + "%" : ""} · ${isNum(x.d1) ? durTxt(x.d1, x.bd) : ""}</small>`)).join("")}</div>` : `<p class="muted">Chưa có thiết lập có lợi thế – đứng ngoài hoặc chờ.</p>`, `<a href="#/ideas">tất cả</a>`)}
    ${panel("🔓 Mở khoá lớn 14 ngày", (M.unlocks || []).length ? `<div class="tw"><table><tbody>${(M.unlocks || []).slice(0, 10).map((e) => `<tr><td class="l">${coinLink(e.k)}</td><td>${fmtT(e.t).slice(0, 5)}</td><td class="${e.pct >= 2 ? "down" : ""}">${nf(e.pct, 2)}%</td><td>${usd(e.usd)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Không có đợt ≥ 0,5% lưu hành.</p>`)}</div>
  </div>
  <div class="g g5">
    ${panel("🚀 Tăng 7 ngày", list(lst.gain7, (r) => `<small class="${cls(r.r7)}">${pct(r.r7, 0)}</small>`))}
    ${panel("🩸 Giảm 7 ngày", list(lst.lose7, (r) => `<small class="${cls(r.r7)}">${pct(r.r7, 0)}</small>`))}
    ${panel("🔥 Funding nóng", list(lst.f_hot, (r) => `<small class="${f8c(r.f8)}">${f8s(r.f8)}</small>`))}
    ${panel("🧊 Funding âm", list(lst.f_cold, (r) => `<small class="${f8c(r.f8)}">${f8s(r.f8)}</small>`))}
    ${panel("📈 OI tăng 7 ngày", list(lst.oi_up, (r) => `<small class="${cls(r.oi7)}">${pct(r.oi7, 0)}</small>`))}
    ${panel("✅ Vừa vào xu hướng tăng", list(lst.trend_new, (r) => `<small>${r.td} ngày</small>`))}
    ${panel("💰 Định giá rẻ (dòng tiền thật)", list(lst.cheap, (r) => `<small>P/S ${nf(r.ps, 1)}</small>`))}
    ${panel("💱 Carry funding cao", list(lst.carry, (r) => `<small class="up">${nf(r.car, 0)}%/năm</small>`))}
  </div>
  ${(M.news || []).length ? panel("📰 Tin có tác động (72 giờ)", `<div class="ntfs cols2">${M.news.map((n) => newsRow(n, true)).join("")}</div>`) : ""}
  ${(M.alerts || []).length ? panel("⚠️ Cảnh báo đòn bẩy", `<ul class="alerts">${M.alerts.map((a) => `<li>${coinLink(a.k, "/fut")} <b>${esc(a.t)}</b> – ${esc(a.d)}</li>`).join("")}</ul>`) : ""}
  <p class="faint disclaimer">Thông tin phân tích, không phải lời khuyên đầu tư. Crypto biến động mạnh; giao dịch đòn bẩy có thể mất toàn bộ ký quỹ.</p>`;
  $$("#hmS button").forEach((b) => b.onclick = () => { $$("#hmS button").forEach((x) => x.classList.toggle("on", x === b)); $("#hm").innerHTML = heatMap(COINS.rows, b.dataset.k); });
}

// ================================================================ BẢNG COIN
const COLS = {
  k: ["Coin", (r) => coinLink(r.k) + (r.nw ? ` <span class="pill sell" title="Có tin xấu nghiêm trọng 3 ngày qua">⚠ tin</span>` : ""), "l"],
  p: ["Giá", (r) => px(r.p)],
  r1: ["24h", (r) => `<span class="${cls(r.r1)}">${pct(r.r1)}</span>`],
  r7: ["7 ngày", (r) => `<span class="${cls(r.r7)}">${pct(r.r7, 0)}</span>`],
  r30: ["30 ngày", (r) => `<span class="${cls(r.r30)}">${pct(r.r30, 0)}</span>`],
  r90: ["90 ngày", (r) => `<span class="${cls(r.r90)}">${pct(r.r90, 0)}</span>`],
  r365: ["1 năm", (r) => `<span class="${cls(r.r365)}">${pct(r.r365, 0)}</span>`],
  ath: ["Từ đỉnh", (r) => `<span class="down">${pct(r.ath, 0)}</span>`],
  mc: ["Vốn hoá", (r) => usd(r.mc)],
  fdv: ["FDV", (r) => usd(r.fdv)],
  vol: ["KL 24h", (r) => usd(r.vol)],
  fl: ["Lưu hành", (r) => (isNum(r.fl) ? `<span class="${r.fl < 35 ? "down" : ""}">${nf(r.fl, 0)}%</span>` : "—"), "", "Lượng lưu hành / tổng cung (FDV)"],
  u365: ["Mở khoá 1 năm", (r) => (isNum(r.u365) ? `<span class="${r.u365 >= 15 ? "down" : ""}">${nf(r.u365, 1)}%</span>` : "—"), "", "% lượng lưu hành sẽ được mở khoá trong 12 tháng (DefiLlama)"],
  inf: ["Lạm phát cung", (r) => (isNum(r.inf) ? `<span class="${r.inf >= 15 ? "down" : ""}">${pct(r.inf, 0)}</span>` : "—"), "", "Tốc độ tăng lượng lưu hành thực tế/năm (CoinGecko)"],
  rev: ["Doanh thu/năm", (r) => usd(r.rev), "", "Doanh thu giao thức năm hoá (DefiLlama)"],
  ps: ["P/S", (r) => nf(r.ps, 1), "", "Vốn hoá / doanh thu năm"],
  phr: ["P/HR", (r) => nf(r.phr, 1), "", "Vốn hoá / phần doanh thu về người giữ token (mua lại, đốt, chia cho staker)"],
  ig: ["Tăng trưởng ngầm định", (r) => (isNum(r.ig) ? `<span class="${r.ig > 50 ? "down" : r.ig <= 10 ? "up" : ""}">${nf(r.ig, 0)}%/năm</span>` : "—"), "", "Dòng tiền phải tăng bao nhiêu %/năm trong 5 năm để giá hiện tại hợp lý"],
  vd: ["Định giá", (r) => vdPill(r.vd)],
  ts: ["Xu hướng", (r) => tsPill(r.ts, r.td)],
  tsc: ["Điểm KT", (r) => scoreCell(r.tsc), "", "Điểm kỹ thuật tổng hợp 0–100"],
  beta: ["Beta BTC", (r) => nf(r.beta, 2), "", "Biến động so với BTC (90 ngày)"],
  oi: ["OI", (r) => usd(r.oi), "", "Tổng hợp đồng mở các sàn theo dõi"],
  oi24: ["OI 24h", (r) => `<span class="${cls(r.oi24)}">${pct(r.oi24, 0)}</span>`],
  oi7: ["OI 7 ngày", (r) => `<span class="${cls(r.oi7)}">${pct(r.oi7, 0)}</span>`],
  f8: ["Funding 8h", (r) => `<span class="${f8c(r.f8)}">${f8s(r.f8)}</span>`],
  fp: ["Phân vị funding", (r) => (isNum(r.fp) ? nf(r.fp, 0) : "—"), "", "Funding hiện tại cao hơn bao nhiêu % thời gian 90 ngày"],
  f7: ["Funding TB 7n", (r) => `<span class="${f8c(r.f7)}">${f8s(r.f7)}</span>`],
  lsr: ["Long/Short", (r) => nf(r.lsr, 2), "", "Tỉ lệ tài khoản Long/Short trên Binance (ngày hôm qua)"],
  cr: ["Đám đông", (r) => crowdPills(r.cr)],
  car: ["Carry/năm", (r) => (isNum(r.car) ? `<span class="${r.car >= 15 ? "up" : ""}">${nf(r.car, 0)}%</span>` : "—"), "", "Lãi funding năm hoá nếu mua spot + bán perp (trung tính giá), theo TB 7 ngày"],
  ml: ["Đòn bẩy tối đa", (r) => (isNum(r.ml) ? `x${nf(r.ml, 0)}` : "—")],
  g: ["Nhóm", (r) => `<small>${esc(r.g || "")}</small>`, "l"],
};
const VIEWS = {
  all: ["Tổng quan", ["k", "p", "r1", "r7", "r30", "mc", "vol", "ts", "vd", "f8", "g"]],
  cf: ["Định giá", ["k", "p", "mc", "fdv", "fl", "u365", "inf", "rev", "ps", "phr", "ig", "vd", "g"]],
  trend: ["Xu hướng", ["k", "p", "ts", "tsc", "r7", "r30", "r90", "r365", "ath", "beta", "vol"]],
  fut: ["Futures", ["k", "p", "r1", "oi", "oi24", "oi7", "f8", "fp", "f7", "lsr", "cr", "car", "ml"]],
};
async function viewCoins(view0) {
  const C = await coins();
  let view = VIEWS[view0] ? view0 : lsGet("cview", "all");
  const F = lsGet("cfilter", { q: "", g: "", fut: false, spot: false, vd: "", ts: "", cf: false, min: 0 });
  let sort = lsGet("csort", { k: "mc", d: -1 });
  const groups = [...new Set(C.rows.map((r) => r.g).filter(Boolean))].sort();
  app().innerHTML = `<div class="ph"><h1>Coin</h1><span class="meta">${nf(C.rows.length, 0)} coin · top ~300 vốn hoá + cặp USDT Binance + mọi coin có futures (đã loại stablecoin, token bọc, cổ phiếu token hoá)</span></div>
    <div class="views">${Object.entries(VIEWS).map(([k, [n]]) => `<button data-v="${k}" class="${k === view ? "on" : ""}">${n}</button>`).join("")}</div>
    <div class="filters">
      <div class="field"><label>Tìm</label><input id="fq" value="${esc(F.q)}" placeholder="Tên hoặc mã"></div>
      <div class="field"><label>Nhóm</label><select id="fg"><option value="">Tất cả</option>${groups.map((g) => `<option ${F.g === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></div>
      <div class="field"><label>Định giá</label><select id="fvd"><option value="">Tất cả</option>${["Rẻ", "Hợp lý", "Hơi đắt", "Đắt", "Đầu cơ", "L1 rẻ tương đối", "L1 ngang nhóm", "L1 đắt tương đối"].map((v) => `<option ${F.vd === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label>Xu hướng</label><select id="fts"><option value="">Tất cả</option><option value="1" ${F.ts === "1" ? "selected" : ""}>Tăng</option><option value="0" ${F.ts === "0" ? "selected" : ""}>Ngang</option><option value="-1" ${F.ts === "-1" ? "selected" : ""}>Giảm</option></select></div>
      <div class="field"><label>Vốn hoá tối thiểu</label><select id="fmin">${[[0, "Không lọc"], [1e7, "$10 tr"], [1e8, "$100 tr"], [1e9, "$1 tỷ"], [1e10, "$10 tỷ"]].map(([v, n]) => `<option value="${v}" ${Number(F.min) === v ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <label class="chk"><input type="checkbox" id="ffut" ${F.fut ? "checked" : ""}> Có futures</label>
      <label class="chk"><input type="checkbox" id="fspot" ${F.spot ? "checked" : ""}> Có spot Binance</label>
      <label class="chk"><input type="checkbox" id="fcf" ${F.cf ? "checked" : ""}> Có doanh thu thật</label>
    </div>
    <div id="ctab"></div>`;
  const draw = () => {
    const q = F.q.trim().toUpperCase();
    let rows = C.rows.filter((r) => (!q || r.k.includes(q) || String(r.n || "").toUpperCase().includes(q)) && (!F.g || r.g === F.g) && (!F.vd || r.vd === F.vd)
      && (F.ts === "" || String(r.ts) === F.ts) && (!F.fut || r.fx) && (!F.spot || r.spot) && (!F.cf || isNum(r.ps)) && (!Number(F.min) || (r.mc || 0) >= Number(F.min)));
    const k = sort.k, d = sort.d;
    rows.sort((a, b) => { const x = a[k], y = b[k]; if (!isNum(x) && !isNum(y)) return 0; if (!isNum(x)) return 1; if (!isNum(y)) return -1; return (x - y) * d; });
    const cols = VIEWS[view][1];
    const show = rows.slice(0, 400);
    $("#ctab").innerHTML = `<div class="tw sticky"><table class="sortable"><thead><tr>${cols.map((c) => `<th data-s="${c}" class="${COLS[c][2] || ""} ${sort.k === c ? "on" : ""}" ${COLS[c][3] ? `title="${esc(COLS[c][3])}"` : ""}>${COLS[c][0]}${sort.k === c ? (d > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
      <tbody>${show.map((r) => `<tr>${cols.map((c) => `<td class="${COLS[c][2] || ""}">${COLS[c][1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="faint">${nf(rows.length, 0)} coin khớp bộ lọc${rows.length > 400 ? " (hiện 400 dòng đầu)" : ""}.</p>`;
    $$("th[data-s]", $("#ctab")).forEach((th) => th.onclick = () => { const c = th.dataset.s; sort = { k: c, d: sort.k === c ? -sort.d : (c === "k" ? 1 : -1) }; if (c === "k") sort.k = "rk"; lsSet("csort", sort); draw(); });
  };
  const bind = (id, key, val = (e) => e.value) => { const el = $(id); el.addEventListener(el.type === "checkbox" ? "change" : "input", () => { F[key] = el.type === "checkbox" ? el.checked : val(el); lsSet("cfilter", F); draw(); }); };
  bind("#fq", "q"); bind("#fg", "g"); bind("#fvd", "vd"); bind("#fts", "ts"); bind("#fmin", "min"); bind("#ffut", "fut"); bind("#fspot", "spot"); bind("#fcf", "cf");
  $$(".views button").forEach((b) => b.onclick = () => { view = b.dataset.v; lsSet("cview", view); $$(".views button").forEach((x) => x.classList.toggle("on", x === b)); if (view === "cf" && !["ps", "phr", "ig", "mc", "rev"].includes(sort.k)) sort = { k: "rev", d: -1 }; if (view === "fut" && !["oi", "f8", "oi7", "oi24", "car", "fp", "f7"].includes(sort.k)) sort = { k: "oi", d: -1 }; draw(); });
  draw();
}

// ================================================================ CHI TIẾT COIN
const SUBT = [["", "Tổng quan"], ["smc", "SMC & vào lệnh"], ["val", "Định giá"], ["lv", "Mức giá & thời gian"], ["fut", "Futures"], ["plan", "Kế hoạch giao dịch"], ["tech", "Kỹ thuật"]];
async function viewCoin(key, sub = "") {
  await coins();
  const D = await load(`data/c/${enc(key)}.json`);
  D._ij = await tryLoad("data/ideas.json");
  if (D._ij?.names) IDEA_NAMES = { ...IDEA_NAMES, ...D._ij.names };
  if (!PF) await pfLoad().catch(() => null);
  const r = D.row;
  app().innerHTML = `<div class="ph stk"><h1>${esc(key)} <small class="muted">${esc(r.n || "")}</small></h1>
    <span class="meta"><b id="lp" data-k="${esc(key)}" class="lp">${px(r.p)}</b> <b class="${cls(r.r1)}">${pct(r.r1)}</b> · ${r.rk ? `hạng #${r.rk}` : "ngoài top CoinGecko"} · ${r.g ? `<a href="#/sector/${enc(r.g)}">nhóm ${esc(r.g)}</a>` : ""} ${r.spot ? pill("Spot Binance", "brand") : ""} ${r.fx ? pill("Futures: " + esc(r.fx), "") : ""}
    <button class="star ${WL.has(key) ? "on" : ""}" id="wlb" title="Theo dõi">★</button></span></div>
    <div class="subtabs">${SUBT.map(([k, n]) => `<button data-st="${k}" class="${k === sub ? "on" : ""}">${n}</button>`).join("")}</div><div id="sub"></div>`;
  $("#wlb").onclick = async () => { await WL.toggle(key); $("#wlb").classList.toggle("on", WL.has(key)); };
  const show = (s) => {
    disposeCharts();
    $$(".subtabs button").forEach((b) => b.classList.toggle("on", b.dataset.st === s));
    history.replaceState(null, "", `#/c/${enc(key)}${s ? "/" + s : ""}`);
    const f = { "": tabOverview, smc: tabSmc, val: tabVal, lv: tabLevels, fut: tabFut, plan: tabPlan, tech: tabTech }[s] || tabOverview;
    $("#sub").innerHTML = f(D);
    (BIND[s || ""] || (() => {}))(D);
  };
  $$(".subtabs button").forEach((b) => b.onclick = () => show(b.dataset.st));
  show(SUBT.some(([k]) => k === sub) ? sub : "");
}
const BIND = {};
// ---- biểu đồ nhiều khung: 1 phút → năm. Giá trực tiếp lấy thẳng từ Binance trên trình duyệt (Việt Nam truy cập được), dự phòng dữ liệu máy chủ
const TFS = [["1s", "1s"], ["5s", "5s"], ["15s", "15s"], ["30s", "30s"], ["1m", "1p"], ["5m", "5p"], ["10m", "10p"], ["15m", "15p"], ["30m", "30p"], ["1h", "1h"], ["4h", "4h"], ["1d", "Ngày"], ["1w", "Tuần"], ["15d", "15 ngày"], ["1M", "Tháng"], ["3M", "Quý"], ["1y", "Năm"]];
const TFB = { "1s": ["1s"], "3s": ["1s", 3], "5s": ["1s", 5], "15s": ["1s", 15], "30s": ["1s", 30], "1m": ["1m"], "5m": ["5m"], "10m": ["5m", 600], "15m": ["15m"], "30m": ["30m"], "1h": ["1h"], "4h": ["4h"], "1d": ["1d"], "1w": ["1w"], "15d": ["1d", "15d"], "1M": ["1M"], "3M": ["1M", "q"], "1y": ["1M", "y"] };
const OKXB = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H", "4h": "4H", "1d": "1Dutc", "1w": "1Wutc", "1M": "1Mutc" };
let CTF = lsGet("ctf2", "1d");
const WSS = [];
function closeWs() { while (WSS.length) { try { WSS.pop().close(); } catch (e) { /* đã đóng */ } } }
const toO = (rows, m = 1) => ({ t: rows.map((x) => Math.floor(x[0] / 1000)), o: rows.map((x) => +x[1] / m), h: rows.map((x) => +x[2] / m), l: rows.map((x) => +x[3] / m), c: rows.map((x) => +x[4] / m), v: rows.map((x) => +(x[7] ?? x[5] * x[4])),
  tb: rows.length && rows[0][10] != null ? rows.map((x) => +x[10]) : undefined });
function aggO(o, mode) {
  if (!mode || !o) return o;
  const key = (t) => { const d = new Date(t * 1000); if (typeof mode === "number") return Math.floor(t / mode) * mode;
    if (mode === "15d") return Math.floor(t / (15 * 86400)) * 15 * 86400;
    if (mode === "q") return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1) / 1000;
    if (mode === "y") return Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
    if (mode === "w") { const wd = (d.getUTCDay() + 6) % 7; return Math.floor(t / 86400) * 86400 - wd * 86400; }
    if (mode === "M") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; return t; };
  const out = { t: [], o: [], h: [], l: [], c: [], v: [] }, tb = o.tb ? [] : null;
  for (let i = 0; i < o.t.length; i++) {
    const k = key(o.t[i]), n = out.t.length;
    if (n && out.t[n - 1] === k) { out.h[n - 1] = Math.max(out.h[n - 1], o.h[i]); out.l[n - 1] = Math.min(out.l[n - 1], o.l[i]); out.c[n - 1] = o.c[i]; out.v[n - 1] += o.v[i] || 0; if (tb) tb[n - 1] += o.tb[i] || 0; }
    else { out.t.push(k); out.o.push(o.o[i]); out.h.push(o.h[i]); out.l.push(o.l[i]); out.c.push(o.c[i]); out.v.push(o.v[i] || 0); if (tb) tb.push(o.tb[i] || 0); }
  }
  if (tb) out.tb = tb;
  return out;
}
async function fetchJ(url, ms = 7000) { const r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function liveKlines(r, iv, pages = 1, lim0 = 0) {
  const lim = lim0 || (iv === "1M" ? 200 : iv === "1w" ? 600 : 1000);
  const tries = [];
  if (iv === "1s") {      // nến 1 giây chỉ có ở Binance spot; ghép nhiều trang khi cần khung 15s/30s
    if (!r.sp) return null;
    for (const u of ["https://api.binance.com/api/v3/klines", "https://data-api.binance.vision/api/v3/klines"]) {
      try {
        let rows = [], end = "";
        for (let pg = 0; pg < pages; pg++) {
          const j = await fetchJ(`${u}?symbol=${r.sp}&interval=1s&limit=1000${end}`);
          if (!Array.isArray(j) || !j.length) break;
          rows = j.concat(rows); end = `&endTime=${j[0][0] - 1}`;
          if (j.length < 1000) break;
        }
        const seen = new Set(); rows = rows.filter((x) => (seen.has(x[0]) ? false : seen.add(x[0]))).sort((a, b) => a[0] - b[0]);
        if (rows.length) return { o: toO(rows, r.sm || 1), src: "Binance spot", sym: r.sp, m: r.sm || 1, kind: "spot" };
      } catch (e) { /* thử nguồn khác */ }
    }
    return null;
  }
  if (r.sp) { tries.push(["https://api.binance.com/api/v3/klines", r.sp, r.sm || 1, "spot"]); tries.push(["https://data-api.binance.vision/api/v3/klines", r.sp, r.sm || 1, "spot"]); }
  if (r.bf) tries.push(["https://fapi.binance.com/fapi/v1/klines", r.bf, r.bfm || 1, "fut"]);
  for (const [u, sym, m, kind] of tries) {
    try { const j = await fetchJ(`${u}?symbol=${sym}&interval=${iv}&limit=${lim}`); if (Array.isArray(j) && j.length) return { o: toO(j, m), src: kind === "spot" ? "Binance spot" : "Binance futures", sym, m, kind }; } catch (e) { /* thử nguồn khác */ }
  }
  if (OKXB[iv]) {
    for (const inst of [`${r.k}-USDT`, `${r.k}-USDT-SWAP`]) {
      try { const j = await fetchJ(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${OKXB[iv]}&limit=${Math.min(300, lim)}`); const d = (j.data || []).slice().reverse(); if (d.length) return { o: toO(d.map((x) => [+x[0], x[1], x[2], x[3], x[4], x[5], 0, x[7]])), src: "OKX", sym: inst, m: 1, kind: "okx" }; } catch (e) { /* thử nguồn khác */ }
    }
  }
  return null;
}
function serverO(D, tf) {
  const d = D.ohlc?.d;
  const m = { "1d": d, "4h": D.ohlc?.h4, "1h": D.ohlc?.h1, "1w": aggO(d, "w"), "15d": aggO(d, "15d"), "1M": aggO(d, "M"), "3M": aggO(d, "q"), "1y": aggO(d, "y") };
  return m[tf] || null;
}
function drawO(D, el, o, tf, src) {
  el.innerHTML = "";
  const intra = ["1s", "5s", "15s", "30s", "1m", "5m", "10m", "15m", "30m", "1h", "4h"].includes(tf);
  const T = D.trend || {}, I = D.intra?.plan || {}, LV = (D.lv || {})[tf === "4h" || tf === "1h" ? "h4" : "d"] || {};
  const lines = [];
  if (!intra && T.stop) lines.push({ price: T.stop, color: css("--down"), title: "cắt lỗ xu hướng" });
  if (intra && I.entry) { lines.push({ price: I.entry, color: css("--brand"), title: "vào (lướt)" }, { price: I.stop, color: css("--down"), title: "cắt lỗ" }, { price: I.t1, color: css("--up"), title: "chốt 1" }); }
  if (lsGet("showZones", true)) (LV.sup || []).slice(0, 2).concat((LV.res || []).slice(0, 2)).forEach((z) => lines.push({ price: z.p, color: z.n >= 3 ? css("--ref") : css("--ink-3"), title: `${z.side} (${z.n})`, style: 1 }));
  const n = o.t.length, show = { "1s": 300, "5s": 240, "15s": 200, "30s": 180, "1m": 240, "5m": 288, "10m": 288, "15m": 192, "30m": 240, "1h": 240, "4h": 240, "1d": 365 }[tf] || n;
  const ch = candleChart(el, o, { ma: ["1d", "1w"].includes(tf) ? [["ema", 20, css("--brand")], ["ema", 50, css("--ref")], ["sma", 200, css("--ink-3")]] : [["ema", 20, css("--brand")], ["ema", 50, css("--ref")]], lines, from: o.t[Math.max(0, n - show)] });
  $("#csrc") && ($("#csrc").textContent = src);
  return ch;
}
async function priceChart(D, el, tf) {
  closeWs();
  const r = D.row, [base, ag] = TFB[tf] || ["1d"];
  el.innerHTML = `<p class="muted" style="padding:20px">Đang tải nến ${esc(tf)}…</p>`;
  const L = await liveKlines(r, base, base === "1s" ? Math.min(6, Math.max(1, Math.ceil((ag || 1) * 300 / 1000))) : 1);
  if (L) {
    let raw = L.o, o = aggO(raw, ag);
    const ch = drawO(D, el, o, tf, `${L.src} ${L.sym} · trực tiếp`);
    const tools = chartTools(D, el, ch, tf); tools.upd(o, true);
    if (L.kind !== "okx") {
      const url = (L.kind === "spot" ? "wss://stream.binance.com:9443/ws/" : "wss://fstream.binance.com/ws/") + `${L.sym.toLowerCase()}@kline_${base}`;
      try {
        const ws = new WebSocket(url); WSS.push(ws);
        ws.onmessage = (ev) => {
          const k = JSON.parse(ev.data).k; if (!k) return;
          const t = Math.floor(k.t / 1000), m = L.m, i = raw.t.length - 1;
          const bar = [+k.o / m, +k.h / m, +k.l / m, +k.c / m, +k.q, +k.Q];
          if (raw.t[i] === t) { raw.o[i] = bar[0]; raw.h[i] = bar[1]; raw.l[i] = bar[2]; raw.c[i] = bar[3]; raw.v[i] = bar[4]; if (raw.tb) raw.tb[i] = bar[5]; }
          else if (t > raw.t[i]) { raw.t.push(t); raw.o.push(bar[0]); raw.h.push(bar[1]); raw.l.push(bar[2]); raw.c.push(bar[3]); raw.v.push(bar[4]); if (raw.tb) raw.tb.push(bar[5]); }
          const a = ag ? aggO({ t: raw.t.slice(-40), o: raw.o.slice(-40), h: raw.h.slice(-40), l: raw.l.slice(-40), c: raw.c.slice(-40), v: raw.v.slice(-40) }, ag) : null;
          const j = a ? a.t.length - 1 : raw.t.length - 1, s2 = a || raw;
          try { ch.cs.update({ time: s2.t[j], open: s2.o[j], high: s2.h[j], low: s2.l[j], close: s2.c[j] }); } catch (e) { /* bỏ qua nến cũ */ }
          tools.upd(ag ? aggO(raw, ag) : raw, k.x);
          livePx(r.k, bar[3]);
        };
      } catch (e) { /* trình duyệt chặn websocket */ }
    }
    return;
  }
  const o = serverO(D, tf);
  if (!o || !o.t?.length) { el.innerHTML = `<p class="muted" style="padding:20px">${base === "1s" && !r.sp ? "Nến theo giây chỉ có cho coin niêm yết spot trên Binance. " : ""}Không lấy được nến ${esc(tf)} trực tiếp (trình duyệt không kết nối được Binance/OKX) và máy chủ chỉ có khung ngày / 4h / 1h.</p>`; return; }
  const ch = drawO(D, el, o, tf, "dữ liệu máy chủ (cập nhật 15 phút – 4 giờ)");
  chartTools(D, el, ch, tf).upd(o, true);
}
function livePx(k, p) {
  const el = $("#lp"); if (!el || el.dataset.k !== k) return;
  const prev = Number(el.dataset.p || p); el.dataset.p = p;
  el.textContent = px(p); el.classList.toggle("up", p > prev); el.classList.toggle("down", p < prev);
  const r = BYK?.[k]; if (r) r.p = p;
}
const tfSeg = (cur) => `<span class="seg tfseg" id="tfs">${TFS.map(([k, n]) => `<button data-tf="${k}" class="${cur === k ? "on" : ""}">${n}</button>`).join("")}</span>`;
function bindChart(D) {
  const el = $("#pchart"); if (!el) return;
  priceChart(D, el, CTF);
  $$("#tfs button").forEach((b) => b.onclick = () => { CTF = b.dataset.tf; lsSet("ctf2", CTF); disposeCharts(); $$("#tfs button").forEach((x) => x.classList.toggle("on", x === b)); priceChart(D, el, CTF); });
  [["#zt", "showZones"], ["#smt", "showSmc"], ["#pnt", "showPanes"]].forEach(([id, key]) => { const z = $(id); if (z) z.onchange = () => { lsSet(key, z.checked); disposeCharts(); priceChart(D, el, CTF); }; });
}
const chartBox = (D, h = 440) => `<div class="cbar">${tfSeg(CTF)}<span class="cops"><label class="chk"><input type="checkbox" id="smt" ${lsGet("showSmc", true) ? "checked" : ""}> SMC</label><label class="chk"><input type="checkbox" id="pnt" ${lsGet("showPanes", true) ? "checked" : ""}> RSI · MACD · CVD</label><label class="chk"><input type="checkbox" id="zt" ${lsGet("showZones", true) ? "checked" : ""}> Hỗ trợ/kháng cự</label></span><small class="faint" id="csrc"></small></div><div class="chart" id="pchart" style="height:${h}px"></div><div id="panes" class="panes"></div>`;
function tabOverview(D) {
  const r = D.row, V = D.val || {}, T = D.trend || {}, cg = D.cg || {};
  const why = (V.why || []).slice(0, 4);
  return `${D.about || D.gwhat ? `<div class="about"><b>${esc(r.k)} làm gì?</b> ${esc(D.about || "")} ${r.g ? `<span class="faint">Nhóm <a href="#/sector/${enc(r.g)}">${esc(r.g)}</a>: ${esc(D.gwhat || "")}</span>` : ""}</div>` : ""}<div class="g g3w">
    ${panel("Biểu đồ", `${chartBox(D)}<p class="faint" style="font-size:.72rem">EMA20 (xanh) · EMA50 (vàng) · MA200 (xám, khung ngày/tuần). Khung ≤ 4h: đường kẻ = kế hoạch lướt (vào / cắt lỗ / chốt). Đường chấm = vùng hỗ trợ/kháng cự (số trong ngoặc = số mức trùng nhau). Khung 10 phút, 15 ngày, quý, năm được gộp từ nến nhỏ hơn.</p>`)}
    <div class="col">
      ${panel("⚡ Vào lệnh lúc này? – đánh giá thời gian thực", rtBox(), `theo khung đang xem · <a href="#/c/${enc(r.k)}/smc">SMC chi tiết</a>`)}
      ${planSummary(D)}</div>
    <div class="col">
      ${panel("Tóm tắt", `${kpis([["Định giá", vdPill(V.verdict)], ["Xu hướng ngày", tsPill(T.state, T.days)], ["Điểm kỹ thuật", scoreCell(D.tech?.score)],
        ["Vốn hoá", usd(r.mc)], ["FDV", usd(r.fdv), "", "Vốn hoá nếu toàn bộ tổng cung lưu hành"], ["Lưu hành", isNum(V.float_pct) ? nf(V.float_pct, 0) + "%" : "—", V.float_pct < 35 ? "down" : ""],
        ["KL 24h", usd(r.vol)], ["Từ đỉnh", pct(r.ath, 0), "down", cg.ath_date ? `Đỉnh ${px(cg.ath)} ngày ${fmtD(cg.ath_date)}` : ""],
        ["7 / 30 ngày", `<span class="${cls(r.r7)}">${pct(r.r7, 0)}</span> / <span class="${cls(r.r30)}">${pct(r.r30, 0)}</span>`], ["1 năm", pct(r.r365, 0), cls(r.r365)],
        r.oi ? ["OI futures", usd(r.oi)] : null, r.oi ? ["Funding 8h", f8s(r.f8), f8c(r.f8)] : null, D.hedge?.beta ? ["Beta với BTC", nf(D.hedge.beta, 2), "", `Tương quan ${nf(D.hedge.corr, 2)} · biến động năm hoá ${nf(D.hedge.vol90, 0)}%`] : null])}
        ${why.length ? `<ul class="why">${why.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${(D.crowd || []).length ? `<div class="note">${D.crowd.map((c) => `<p><b>${esc(c.t)}</b>: ${esc(c.d)}</p>`).join("")}</div>` : ""}`)}
      ${(D.news || []).length ? panel("Tin tức", `<div class="ntfs">${D.news.slice(0, 12).map((n) => newsRow(n)).join("")}</div>`) : ""}
    </div></div>`;
}
BIND[""] = bindChart;
function newsRow(n, withK = false) {
  const c = n.sign < 0 ? "down" : n.sign > 0 ? "up" : "";
  return `<div class="nwr sev${n.sev || 0}">${withK ? coinLink(n.k) : ""}<div><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
    <small class="muted">${esc(n.src)} · ${esc(fmtD(n.t))} ${esc((n.t || "").slice(11, 16))}${n.tag ? ` · <b class="${c}">${esc(n.tag)}</b>` : ""}</small></div></div>`;
}
function planSummary(D) {
  const T = D.trend || {}, I = D.intra || {}, P = I.plan;
  const tl = T.state === 1 ? `<b class="up">Long theo xu hướng</b> – đang trong xu hướng tăng ${T.days} ngày. Cắt lỗ ${px(T.stop)} (−${nf(T.stop_pct, 1)}%); thoát khi ${esc(T.exit_rule || "")} (${px(T.exit_level)}).${T.ext > 15 ? ` <span class="ref">Giá đã cách EMA20 ${nf(T.ext, 0)}% – chờ hồi để vào.</span>` : ""}`
    : T.state === -1 ? (T.side === "short" ? `<b class="down">Short theo xu hướng (perp)</b> – xu hướng giảm ${T.days} ngày, BTC cũng dưới MA200. Cắt lỗ ${px(T.stop)} (+${nf(T.stop_pct, 1)}%).` : `<b class="down">Xu hướng giảm</b> – không mua spot. Chưa Short vì BTC vẫn trên MA200.`)
    : `<b>Đứng ngoài</b> – chưa có xu hướng rõ ở khung ngày.`;
  const il = P ? `${P.side === "long" ? '<b class="up">Long</b>' : '<b class="down">Short</b>'} quanh ${px(P.entry)}, cắt lỗ ${px(P.stop)} (${nf(P.risk_pct, 2)}%), chốt ${px(P.t1)} / ${px(P.t2)}${P.wait ? ` · <span class="ref">${esc(P.wait)}</span>` : ""}${P.warn ? ` · <span class="down">${esc(P.warn)}</span>` : ""}`
    : I.bias4h === 0 ? "Khung 4h đi ngang – không có lợi thế lướt" : "Chưa đủ dữ liệu 4h/1h";
  return panel("Kế hoạch nhanh", `<p>📈 <b>Theo xu hướng:</b> ${tl}</p><p>⚡ <b>Lướt trong ngày:</b> ${il}</p>${D.carry?.ok ? `<p>💱 <b>Carry:</b> mua spot + bán perp ${esc(D.carry.ex)} đang hưởng ~${nf(D.carry.ann7 ?? D.carry.ann_now, 0)}%/năm funding (trung tính giá).</p>` : ""}
    <p><a href="#/c/${enc(D.row.k)}/plan">Chi tiết kế hoạch, khối lượng & giá thanh lý →</a></p>`);
}

function tabVal(D) {
  const V = D.val || {}, r = D.row, cf = D.cf || {}, U = D.unl || {};
  const hasCF = V.has_cf;
  const cfBox = cf && (cf.fees_total30d || cf.rev_total30d) ? `${kpis([["Phí người dùng trả (năm)", usd(V.fees_ann), "", "Fees: tổng phí người dùng trả cho giao thức – DefiLlama, năm hoá"],
      ["Doanh thu giao thức (năm)", usd(V.rev_ann), "", "Revenue: phần phí giao thức giữ lại"], ["Về tay người giữ token (năm)", usd(V.hrev_ann), "", "Holders revenue: mua lại & đốt, chia cho người stake…"],
      ["Tỉ lệ tích luỹ giá trị", isNum(V.accrual) ? nf(V.accrual, 0) + "%" : "—", "", "Holders revenue / Fees – bao nhiêu phần phí thực sự chảy về token"],
      ["Doanh thu 30n vs nhịp 12 tháng", pct((V.rev_vs1y ?? 0) * 100, 0), cls(V.rev_vs1y), "Doanh thu 30 ngày gần nhất năm hoá so với tổng 12 tháng"]])}
      <p class="faint" style="font-size:.74rem">Nguồn: DefiLlama ${esc(cf.name || V.ll_name || "")} (${esc(cf.category || V.ll_cat || "")}${cf.n_parts > 1 ? `, gộp ${cf.n_parts} phiên bản/sản phẩm` : ""}).</p>` : `<p class="muted">DefiLlama không ghi nhận phí/doanh thu cho dự án này.</p>`;
  const multBox = hasCF ? `${kpis([["P/S (vốn hoá)", nf(V.ps, 1), "", "Vốn hoá / doanh thu năm"], ["P/S (FDV)", nf(V.ps_fdv, 1), "", "Tính trên toàn bộ tổng cung"], ["P/F", nf(V.pf, 1), "", "Vốn hoá / phí năm"],
      ["P/HR", nf(V.phr, 1), "", "Vốn hoá / phần về người giữ token – gần với P/E nhất"], ["P/HR (FDV)", nf(V.phr_fdv, 1)], ["P/S trung vị nhóm", nf(V.ps_grp, 1), "", `Nhóm ${r.g || ""}`],
      ["So với nhóm", isNum(V.vs_grp) ? pct(V.vs_grp, 0) : "—", V.vs_grp < 0 ? "up" : "down"], ["Tăng trưởng ngầm định", isNum(V.implied_g) ? nf(V.implied_g, 0) + "%/năm" : "—", V.implied_g > 50 ? "down" : V.implied_g <= 10 ? "up" : "", "Dòng tiền về token phải tăng bao nhiêu %/năm trong 5 năm để giá hiện tại hợp lý (chiết khấu 30%/năm, bội số cuối kỳ 15)"],
      ["Pha loãng 1 năm", isNum(V.dil_1y) ? nf(V.dil_1y, 1) + "%" : "—", V.dil_1y > 10 ? "down" : ""]])}
      ${kpis([["Giá nếu ngang P/S nhóm", px(V.fair_grp), "", "Giá tương ứng khi P/S bằng trung vị nhóm – thước đo tương đối, không phải mục tiêu giá"],
        ["Giá theo dòng tiền hiện tại", px(V.fair_cf), "", "Nếu dòng tiền KHÔNG tăng: giá trị = dòng tiền về token × 15, đã trừ pha loãng 1 năm. Thấp hơn nhiều so với giá = thị trường đang trả tiền cho tăng trưởng"],
        ["Giá hiện tại", px(r.p)]])}
      <p class="faint" style="font-size:.74rem">${V.cf_basis === "rev50" ? "Giao thức chưa chuyển doanh thu cho người giữ token → giả định tối đa 50% doanh thu sẽ về token (có thể thấp hơn nhiều)." : "Dòng tiền về token = holders revenue (mua lại/đốt/chia thưởng)."}</p>`
    : `<div class="note"><p><b>${esc(V.verdict || "Đầu cơ")}</b>: ${esc((V.why || [])[0] || "")}</p><p>Với coin không có dòng tiền, giá chủ yếu do câu chuyện, thanh khoản và dòng tiền đầu cơ. Hãy dựa nhiều hơn vào <b>xu hướng</b>, <b>đòn bẩy (funding/OI)</b> và <b>áp lực cung</b> (mở khoá) – và giữ tỷ trọng nhỏ.</p></div>`;
  const nxt = (V.unlock_next || []).map((e) => `<tr><td class="l">${fmtT(e.t)}</td><td>${isNum(e.pct) ? nf(e.pct, 2) + "%" : "—"}</td><td>${usd(e.usd)}</td><td class="l"><small>${esc(e.cat || "")} · ${esc(e.desc || "")}</small></td></tr>`).join("");
  const us = (U.series || []);
  const supBox = `${kpis([["Lưu hành / tổng cung", isNum(V.float_pct) ? nf(V.float_pct, 0) + "%" : "—", V.float_pct < 35 ? "down" : ""], ["Mở khoá 30 ngày", isNum(V.u30_pct) ? nf(V.u30_pct, 2) + "%" : "—", "", usd(V.u30_usd)],
      ["Mở khoá 90 ngày", isNum(V.u90_pct) ? nf(V.u90_pct, 2) + "%" : "—", "", usd(V.u90_usd)], ["Mở khoá 1 năm", isNum(V.u365_pct) ? nf(V.u365_pct, 1) + "%" : "—", V.u365_pct >= 15 ? "down" : "", usd(V.u365_usd)],
      ["Lịch mở khoá đã đi được", isNum(V.sched_done_pct) ? nf(V.sched_done_pct, 0) + "%" : "—"], ["Lạm phát cung thực tế (90n / 1 năm)", `${pct(V.infl90, 0)} / ${pct(V.infl365, 0)}`, (V.infl365 ?? V.infl90) > 15 ? "down" : "", "Tốc độ tăng lượng lưu hành đo từ CoinGecko, năm hoá"]])}
    ${us.length > 3 ? lineSvg([{ name: "Lượng đã mở khoá (lịch DefiLlama)", color: css("--ref"), pts: us.map(([t, v]) => ({ x: fmtT(t).slice(3), y: v })) }], { h: 150, fmt: (v) => qty(v), hlines: [] }) : ""}
    ${(D.sup || []).length > 5 ? lineSvg([{ name: "Lượng lưu hành thực tế (CoinGecko)", color: css("--brand"), pts: D.sup.map(([d, v]) => ({ x: fmtD(d), y: v })) }], { h: 130, fmt: (v) => qty(v) }) : ""}
    ${nxt ? `<h3>Đợt mở khoá sắp tới</h3><div class="tw"><table><thead><tr><th class="l">Ngày</th><th>% lưu hành</th><th>Giá trị</th><th class="l">Hạng mục</th></tr></thead><tbody>${nxt}</tbody></table></div>` : `<p class="muted">${U.file ? "Không có đợt mở khoá đáng kể sắp tới." : "DefiLlama chưa có lịch mở khoá cho token này."}</p>`}`;
  return `<div class="g g2">
    ${panel(`Kết luận định giá: ${vdPill(V.verdict)}`, `<ul class="why">${(V.why || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>${multBox}`, "dòng tiền thật · áp lực cung · thị trường ngầm định")}
    <div>${panel("Dòng tiền on-chain", cfBox)}${panel("Nguồn cung & mở khoá", supBox)}</div></div>
    <p class="faint disclaimer">Cách đọc: crypto không có báo cáo tài chính chuẩn. Hệ thống dùng phí/doanh thu on-chain thật (DefiLlama), so với nhóm cùng ngành, rồi hỏi ngược: "giá hiện tại đòi hỏi dòng tiền tăng bao nhiêu?". Coin không có dòng tiền được gắn nhãn Đầu cơ – không có nghĩa là xấu, mà là không định giá được bằng tiền thật.</p>`;
}

function tabFut(D) {
  const r = D.row, V = D.venues || [], fs = D.fst || {}, B = D.bnm || {}, q = D.quad, C = D.carry;
  if (!V.length) return `<div class="empty">Coin này chưa có hợp đồng tương lai trên các sàn đang theo dõi (Bitget, OKX, Gate, Hyperliquid).</div>`;
  const vt = V.map((v) => `<tr><td class="l"><b>${esc(v.ex)}</b> <small class="muted">${esc(v.inst || "")}</small></td><td>${px(v.price)}</td><td>${usd(v.oi_usd)}</td><td>${usd(v.vol_usd)}</td><td class="${f8c(v.f8)}">${f8s(v.f8)}</td><td>${isNum(v.interval_h) ? nf(v.interval_h, 0) + "h" : "—"}</td><td class="${cls(v.basis)}">${isNum(v.basis) ? pct(v.basis, 3) : "—"}</td><td>${isNum(v.max_lev) ? "x" + nf(v.max_lev, 0) : "—"}</td></tr>`).join("");
  const fser = (fs.series || []);
  const bser = (B.series || []);
  return `<div class="g g2">
    ${panel("Tổng hợp", `${kpis([["Tổng OI", usd(r.oi)], ["OI 24h", pct(r.oi24, 1), cls(r.oi24)], ["OI 7 ngày", pct(r.oi7, 1), cls(r.oi7)], ["Funding 8h (TB theo OI)", f8s(r.f8), f8c(r.f8)],
      ["Funding năm hoá", isNum(r.f8) ? pct(r.f8 * 3 * 365, 0) : "—", f8c(r.f8)], ["Funding TB 7 / 30 ngày", `${f8s(fs.avg7d)} / ${f8s(fs.avg30d)}`], ["Phân vị 90 ngày", isNum(fs.pctl90) ? nf(fs.pctl90, 0) + "/100" : "—", "", "Funding hiện tại cao hơn bao nhiêu % thời gian 90 ngày"],
      ["Kỳ funding dương (30n)", isNum(fs.pos30) ? nf(fs.pos30, 0) + "%" : "—"], ["Long/Short (Binance)", nf(B.lsr_acct, 2), "", "Tỉ lệ số tài khoản Long/Short – dữ liệu ngày " + (B.date || "")], ["Top trader L/S (vị thế)", nf(B.lsr_top_pos, 2)], ["Taker mua/bán", nf(B.taker, 2), "", "> 1: lệnh chủ động mua nhiều hơn"]])}
      ${q ? `<div class="note"><p><b>${esc(q.t)}</b> (7 ngày): ${esc(q.d)}</p></div>` : ""}
      ${(D.crowd || []).map((c) => `<div class="note warn"><p><b>${esc(c.t)}</b>: ${esc(c.d)}</p></div>`).join("")}
      ${C ? `<h3>Chênh lệch funding (carry)</h3><p>Mua ${esc(r.k)} spot + bán perp cùng lượng trên <b>${esc(C.ex)}</b>: lãi funding ~<b class="${C.ok ? "up" : ""}">${nf(C.ann7 ?? C.ann_now, 1)}%/năm</b> (TB 7 ngày; hiện tại ${nf(C.ann_now, 1)}%, TB 30 ngày ${nf(C.ann30, 1)}%), chi phí vào/ra ~${nf(C.cost, 1)}%. Lãi ròng ước tính 30 ngày: <b>${pct(C.net_30d, 2)}</b>.
        ${C.ok ? "" : '<span class="muted"> – chưa đủ hấp dẫn/ổn định (cần ≥ 15%/năm và ≥ 70% kỳ dương).</span>'}</p><p class="faint" style="font-size:.74rem">Rủi ro: funding đổi chiều, sàn sập/rút tiền chậm, perp bị thanh lý khi giá tăng mạnh nếu ký quỹ mỏng (giữ đòn bẩy chân perp ≤ 2–3x).</p>` : ""}`)}
    <div>${panel("Theo sàn", `<div class="tw"><table><thead><tr><th class="l">Sàn</th><th>Giá</th><th>OI</th><th>KL 24h</th><th>Funding 8h</th><th>Kỳ</th><th>Basis</th><th>Đòn bẩy</th></tr></thead><tbody>${vt}</tbody></table></div><p class="faint" style="font-size:.72rem">Basis = giá mark perp so với giá chỉ số spot. Funding đã quy về mức 8 giờ để so sánh giữa sàn.</p>`)}
    ${fser.length ? panel("Lịch sử funding (%/8h)", lineSvg([{ bars: true, pts: fser.map(([t, v]) => ({ x: fmtD(t), y: v })) }], { h: 150, dec: 3, zero: true })) : ""}
    ${bser.length ? panel("Binance: OI & Long/Short theo ngày", lineSvg([{ name: "OI (triệu USD)", color: css("--brand"), pts: bser.map(([d, o]) => ({ x: fmtD(d), y: isNum(o) ? o / 1e6 : null })) }], { h: 130, dec: 0 }) + lineSvg([{ name: "Tỉ lệ tài khoản Long/Short", color: css("--ref"), pts: bser.map(([d, , l]) => ({ x: fmtD(d), y: l })) }], { h: 110, dec: 2, hlines: [{ y: 1, label: "cân bằng" }] })) : ""}</div></div>`;
}

const MMR = 0.005;
// thông số giao dịch của anh: lưu theo tài khoản (Store "profile"), dự phòng trên máy
let SET = null;
async function loadSettings() { if (SET) return SET; try { const r = await Store.get("profile"); SET = (r.data && typeof r.data === "object" && r.data.trade) ? r.data.trade : {}; } catch (e) { SET = {}; } return SET; }
function setting(k, d) { const v = SET && SET[k] != null ? SET[k] : lsGet(k, d); return isNum(v) ? Number(v) : d; }
async function saveSettings(o) { SET = { ...(SET || {}), ...o }; Object.entries(o).forEach(([k, v]) => lsSet(k, v)); let cur = {}; try { cur = (await Store.get("profile")).data || {}; } catch (e) { /* rỗng */ } await Store.put("profile", { ...cur, trade: SET }); }
function liqPrice(side, entry, lev, mmr = MMR) { if (!isNum(entry) || !isNum(lev) || lev <= 0) return null; return side === "long" ? entry * (1 - 1 / lev + mmr) : entry * (1 + 1 / lev - mmr); }
function sizing(acct, riskPct, entry, stop, lev) {
  const R = Math.abs(entry - stop); if (!(R > 0)) return null;
  const riskUsd = acct * riskPct / 100, q = riskUsd / R, notional = q * entry, margin = notional / lev;
  const side = stop < entry ? "long" : "short", liq = liqPrice(side, entry, lev);
  const liqBeforeStop = side === "long" ? liq >= stop : liq <= stop;
  return { q, notional, margin, riskUsd, liq, liqBeforeStop, side, marginPct: margin / acct * 100 };
}
function sizeBox(entry, stop, lev, id) {
  const acct = Number(setting("acct", 10000)), rk = Number(setting("risk", 1));
  const s = sizing(acct, rk, entry, stop, lev);
  if (!s) return "";
  return `<div class="sizebox" id="${id}"><small>Vốn $${nf(acct, 0)} · rủi ro ${nf(rk, 1)}%/lệnh (đổi ở <a href="#/tools">Công cụ</a>) · đòn bẩy x${nf(lev, 0)}:</small>
    ${kpis([["Khối lượng", qty(s.q)], ["Giá trị lệnh", usd(s.notional)], ["Ký quỹ", usd(s.margin), s.marginPct > 50 ? "down" : "", `${nf(s.marginPct, 0)}% vốn`], ["Lỗ nếu chạm cắt lỗ", usd(s.riskUsd), "down"],
      ["Giá thanh lý (ước tính)", px(s.liq), s.liqBeforeStop ? "down" : "", "Ký quỹ isolated, tỉ lệ duy trì 0,5% – sàn thực tế có thể khác"]])}
    ${s.liqBeforeStop ? `<p class="down">⚠️ Giá thanh lý nằm trước điểm cắt lỗ – giảm đòn bẩy.</p>` : ""}</div>`;
}
function tabPlan(D) {
  const T = D.trend || {}, I = D.intra || {}, P = I.plan, H = D.hedge || {}, B = D.bt || {}, r = D.row;
  const maxL = levGov({ ...r, atr: r.atr ?? T.atr_pct }, T.side === "short" ? "short" : "long", "d", T.stop_pct).cap, maxI = levGov({ ...r, atr: r.atr ?? T.atr_pct }, P?.side || "long", "h4", P?.risk_pct).cap;
  const btRow = (b, n) => b && b.cagr != null ? `<tr><td class="l">${n}</td><td class="${cls(b.cagr)}">${pct(b.cagr, 0)}</td><td class="down">${pct(b.mdd, 0)}</td><td>${nf(b.trades, 0)}</td><td>${isNum(b.win) ? nf(b.win, 0) + "%" : "—"}</td><td>${nf(b.expo, 0)}%</td><td class="${cls(b.r1y)}">${pct(b.r1y, 0)}</td></tr>` : "";
  const trendBox = T.state == null ? `<p class="muted">Chưa đủ lịch sử giá.</p>` : `
    <p>${T.state === 1 ? `<b class="up">Đang có tín hiệu Long</b> (${T.days} ngày)` : T.state === -1 ? (T.side === "short" ? `<b class="down">Đang có tín hiệu Short</b> (${T.days} ngày)` : `<b class="down">Xu hướng giảm</b> – Short bị chặn vì BTC còn trên MA200`) : "<b>Không có tín hiệu</b> – đứng ngoài"}.
      Quy tắc: Long khi giá > EMA50, EMA20 > EMA50 và giá > MA200; thoát khi đóng cửa ngày dưới EMA50. Cắt lỗ ban đầu 2×ATR.</p>
    ${kpis([["Giá", px(T.close)], ["EMA20 / EMA50", `${px(T.ema20)} / ${px(T.ema50)}`], ["MA200", px(T.ma200)], ["ATR ngày", `${px(T.atr)} (${nf(T.atr_pct, 1)}%)`], T.stop ? ["Cắt lỗ", px(T.stop), "down", `${nf(T.stop_pct, 1)}%`] : null, T.exit_level ? ["Mức thoát", px(T.exit_level), "ref", T.exit_rule] : null])}
    ${T.stop && (T.side === "long" || T.side === "short") ? sizeBox(T.close, T.stop, maxL, "szT") : ""}
    ${B.long?.cagr != null ? `<h3>Kiểm chứng quy tắc này trên ${esc(r.k)} (${nf(B.long.years, 1)} năm, có phí & funding)</h3>
      <div class="tw"><table><thead><tr><th class="l">Cách chơi</th><th>Lãi/năm</th><th>Sụt tối đa</th><th>Số lệnh</th><th>Thắng</th><th>Thời gian có lệnh</th><th>12 tháng qua</th></tr></thead><tbody>
      ${btRow(B.long, "Chỉ Long (x1)")}${btRow(B.ls, "Long + Short khi BTC dưới MA200")}<tr><td class="l">Mua & giữ</td><td class="${cls(B.long.bh_cagr)}">${pct(B.long.bh_cagr, 0)}</td><td class="down">${pct(B.long.bh_mdd, 0)}</td><td>—</td><td>—</td><td>100%</td><td class="${cls(B.long.bh1y)}">${pct(B.long.bh1y, 0)}</td></tr></tbody></table></div>
      <div id="eqc"></div>` : ""}`;
  const intraBox = !I.bias4h && I.bias4h !== 0 ? `<p class="muted">Chưa có dữ liệu nến 4h/1h cho coin này (chỉ tải cho ~150 coin có OI lớn nhất).</p>` : `
    ${kpis([["Xu hướng 4h", I.bias4h === 1 ? '<b class="up">Tăng</b>' : I.bias4h === -1 ? '<b class="down">Giảm</b>' : "Ngang"], ["RSI 1h", nf(I.rsi1h, 0)], ["ATR 1h", `${px(I.atr1h)} (${nf(I.atr1h_pct, 2)}%)`], ["24h", pct(I.chg24, 1), cls(I.chg24)],
      ["Cao / thấp 24h", `${px(I.hi24)} / ${px(I.lo24)}`], ["VWAP 24h", px(I.vwap24)], ["Pivot hôm nay", px(I.piv?.P), "", `R1 ${px(I.piv?.R1)} · S1 ${px(I.piv?.S1)} · đỉnh/đáy hôm qua ${px(I.piv?.pdh)} / ${px(I.piv?.pdl)}`]])}
    ${P ? `<div class="note"><p>${P.side === "long" ? '<b class="up">Kế hoạch Long</b>' : '<b class="down">Kế hoạch Short</b>'}: vào ${px(P.entry)} · cắt lỗ ${px(P.stop)} (${nf(P.risk_pct, 2)}%) · chốt 1: ${px(P.t1)} (1,5R) · chốt 2: ${px(P.t2)} (2,5R)</p><p class="muted">${esc(P.note)}</p>${P.wait ? `<p class="ref">${esc(P.wait)}</p>` : ""}${P.warn ? `<p class="down">${esc(P.warn)}</p>` : ""}</div>${sizeBox(P.entry, P.stop, maxI, "szI")}` : "<p>Khung 4h đi ngang – không có kế hoạch lướt.</p>"}
    ${I.bt?.n >= 10 ? `<p class="faint">Kiểm chứng trên ${nf(I.bt.days, 0)} ngày nến 4h: ${nf(I.bt.n, 0)} lệnh, thắng ${nf(I.bt.win, 0)}%, trung bình ${nf(I.bt.avg_r, 2)}R/lệnh (đã trừ phí). ${I.bt.avg_r > 0.1 ? "→ quy tắc có lợi thế trên coin này." : "→ lợi thế yếu, đánh nhỏ hoặc bỏ qua."}</p>` : ""}`;
  const fh = r.f8;
  const hedgeBox = r.fx ? `<p>Giữ ${esc(r.k)} spot nhưng lo giá giảm ngắn hạn? Bán perp cùng lượng = trung tính giá (khoá giá trị bằng USD).</p>
    ${kpis([["Beta với BTC", nf(H.beta, 2), "", "1% BTC biến động → coin biến động bao nhiêu %"], ["Tương quan", nf(H.corr, 2)], ["Biến động năm hoá", isNum(H.vol90) ? nf(H.vol90, 0) + "%" : "—"],
      ["Funding nếu Short phòng hộ", isNum(fh) ? (fh >= 0 ? `<b class="up">nhận ${nf(fh * 3 * 365, 0)}%/năm</b>` : `<b class="down">trả ${nf(-fh * 3 * 365, 0)}%/năm</b>`) : "—"]])}
    <p class="faint" style="font-size:.74rem">Phòng hộ bằng chính coin: chính xác nhất. Phòng hộ bằng BTC perp (giá trị = vị thế × beta): rẻ & thanh khoản hơn nhưng còn rủi ro riêng của coin (tương quan ${nf(H.corr, 2)}). Dùng <a href="#/tools/hedge">máy tính phòng hộ</a>.</p>` : `<p class="muted">Không có perp để phòng hộ trực tiếp – có thể phòng hộ bằng BTC perp với beta ${nf(H.beta, 2)}.</p>`;
  const tk = (tf) => { const t = makeTicket(D, D._ij, { tf }); if (t.none) t.k = r.k; return ticketCard(t); };
  return `${panel("🧾 Kế hoạch lệnh (tính theo vốn của anh)", `<div class="seg" id="tkSeg"><button data-tk="auto" class="on">Tự chọn</button><button data-tk="h4">Lướt 4h</button><button data-tk="d">Swing ngày</button></div><div id="tkOut">${tk("auto")}</div>`, `<a href="#/plan/${enc(r.k)}">mở trang Lên lệnh</a>`)}
  <div class="g g2">${panel("📈 Theo xu hướng – khung ngày, đòn bẩy thấp", trendBox)}<div>${panel("⚡ Lướt trong ngày – 4h định hướng, 1h vào lệnh", intraBox)}${panel("🛡️ Phòng hộ spot / basis", hedgeBox)}</div></div>
    <p class="faint disclaimer">Mức giá là gợi ý theo quy tắc kỹ thuật cố định, không phải khuyến nghị. Luôn đặt lệnh cắt lỗ trên sàn; không để giá thanh lý gần hơn điểm cắt lỗ.</p>`;
}
BIND.plan = (D) => {
  bindTicketSave($("#tkOut"));
  $$("#tkSeg button").forEach((b) => b.onclick = () => { $$("#tkSeg button").forEach((x) => x.classList.toggle("on", x === b)); const t = makeTicket(D, D._ij, { tf: b.dataset.tk }); if (t.none) t.k = D.row.k; $("#tkOut").innerHTML = ticketCard(t); bindTicketSave($("#tkOut")); });
  const e = D.bt?.long?.eq; if (!e || !$("#eqc")) return;
  const ls = D.bt?.ls?.eq;
  $("#eqc").innerHTML = lineSvg([{ name: "Theo xu hướng (Long)", color: css("--brand"), pts: e.map(([d, a]) => ({ x: fmtD(d), y: a })) }, ...(ls ? [{ name: "Long + Short", color: css("--ref"), pts: ls.map(([d, a]) => ({ x: fmtD(d), y: a })) }] : []),
    { name: "Mua & giữ", color: css("--ink-3"), pts: e.map(([d, , b]) => ({ x: fmtD(d), y: b })) }], { h: 170, log: true, fmt: (v) => "x" + nf(v, v < 10 ? 1 : 0) });
};
// ---- mức giá & thời gian (Fibonacci, Gann, hồ sơ khối lượng, dòng tiền)
const TFV = { d: "Ngày", h4: "4 giờ" };
function zoneRows(L, cur) {
  return (L || []).map((z) => `<tr><td class="l">${px(z.p)}${z.lo !== z.hi ? `<br><small class="faint">${px(z.lo)} – ${px(z.hi)}</small>` : ""}</td><td class="${z.dist > 0 ? "down" : "up"}">${pct(z.dist, 1)}</td><td>${"●".repeat(Math.min(5, z.n))}</td><td class="l"><small>${esc(z.src.join(" · "))}</small></td></tr>`).join("");
}
function lvBlock(L, tf) {
  if (!L || !L.price) return `<p class="muted">Chưa đủ dữ liệu khung ${TFV[tf]}.</p>`;
  const f = L.fib || {}, sw = L.swing || {};
  const fibT = Object.entries(f.ret || {}).map(([k, v]) => `<tr class="${Math.abs(v / L.price - 1) < 0.01 ? "hl" : ""}"><td class="l">Thoái lui ${nf(Number(k) * 100, 1)}%</td><td>${px(v)}</td><td class="${cls(v - L.price)}">${pct((v / L.price - 1) * 100, 1)}</td></tr>`).join("")
    + Object.entries(f.ext || {}).map(([k, v]) => `<tr><td class="l">Mở rộng ${nf(Number(k) * 100, 1)}%</td><td>${px(v)}</td><td class="${cls(v - L.price)}">${pct((v / L.price - 1) * 100, 1)}</td></tr>`).join("");
  return `${kpis([["Sóng gần nhất", sw.dir === 1 ? `<b class="up">Tăng</b>` : sw.dir === -1 ? `<b class="down">Giảm</b>` : "—", "", sw.t0 ? `${fmtD(sw.t0)} → ${fmtD(sw.t1)}` : ""], ["Đáy / đỉnh sóng", `${px(sw.lo)} / ${px(sw.hi)}`], ["Đã thoái lui", !isNum(L.retr_now) ? "—" : L.retr_now > 1 ? (sw.dir === 1 ? "thủng đáy sóng" : "vượt đỉnh sóng") : L.retr_now < 0 ? (sw.dir === 1 ? "vượt đỉnh sóng" : "thủng đáy sóng") : nf(L.retr_now * 100, 0) + "%", "", "Giá hiện tại đã hồi lại bao nhiêu % của sóng gần nhất"],
      ["POC khối lượng", px(L.vp?.poc), "", "Mức giá có khối lượng giao dịch lớn nhất (120 nến) – thường là nam châm hút giá"], ["Vùng giá trị", L.vp ? `${px(L.vp.val)} – ${px(L.vp.vah)}` : "—", "", "70% khối lượng giao dịch nằm trong vùng này"],
      ["Gann Sq9 trên", (L.sq9?.up || []).slice(0, 2).map(px).join(" · ")], ["Gann Sq9 dưới", (L.sq9?.dn || []).slice(0, 2).map(px).join(" · ")]])}
    <div><div><h3>Kháng cự phía trên</h3><div class="tw"><table><thead><tr><th class="l">Vùng</th><th>Cách</th><th>Độ mạnh</th><th class="l">Gồm</th></tr></thead><tbody>${zoneRows(L.res) || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody></table></div></div>
      <div><h3>Hỗ trợ phía dưới</h3><div class="tw"><table><thead><tr><th class="l">Vùng</th><th>Cách</th><th>Độ mạnh</th><th class="l">Gồm</th></tr></thead><tbody>${zoneRows(L.sup) || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody></table></div></div></div>
    <details><summary>Bảng Fibonacci của sóng gần nhất</summary><div class="tw"><table><tbody>${fibT}</tbody></table></div></details>
    ${(L.time || []).length ? `<h3>Mốc thời gian đáng chú ý (Fibonacci / Gann)</h3><div class="tw"><table><thead><tr><th class="l">Ngày</th><th>Trùng</th><th class="l">Nguồn</th></tr></thead><tbody>${L.time.slice(0, 8).map((t) => `<tr class="${t.n >= 2 ? "hl" : ""}"><td class="l">${fmtD(t.t)}</td><td>${"●".repeat(t.n)}</td><td class="l"><small>${esc(t.src)}</small></td></tr>`).join("")}</tbody></table></div>` : ""}`;
}
function flowBlock(F, tf) {
  if (!F || F.score == null) return "";
  return `<h3>Dòng tiền khung ${TFV[tf]}: <span class="${cls(F.score)}">${F.score > 0 ? "+" : ""}${F.score}/100</span></h3>
    ${kpis([["Mua − bán chủ động (7 nến)", isNum(F.cvd7) ? pct(F.cvd7, 2) : "—", cls(F.cvd7), "CVD: lệnh khớp chủ động phía mua trừ phía bán, chia tổng khối lượng (nến Binance)"], ["30 nến", isNum(F.cvd30) ? pct(F.cvd30, 2) : "—", cls(F.cvd30)],
      ["OBV 20 nến", nf(F.obv20, 2), cls(F.obv20)], ["Chaikin Money Flow", nf(F.cmf, 3), cls(F.cmf)], ["Khối lượng 5/30 nến", "x" + nf(F.vol5_30, 2)]])}
    ${(F.why || []).length ? `<ul class="why">${F.why.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${(F.cvd || []).length > 10 ? lineSvg([{ name: "CVD tích luỹ (USD)", color: css("--brand"), pts: F.cvd.map((v, i) => ({ x: String(i - F.cvd.length + 1), y: v })) }], { h: 110, fmt: (v) => usd(v) }) : ""}`;
}
function tabLevels(D) {
  const LV = D.lv || {}, FL = D.flow || {};
  const ideasHere = (D.ideas || []);
  const ss = D.setup_stats || {};
  const stT = Object.entries(ss).flatMap(([tf, o]) => Object.entries(o).map(([st, x]) => `<tr><td class="l">${TFV[tf]}</td><td class="l">${esc(IDEA_NAMES[st] || st)}</td><td>${nf(x.n, 0)}</td><td>${isNum(x.win1) ? nf(x.win1, 0) + "%" : "—"}</td><td class="${cls(x.avgR)}">${isNum(x.avgR) ? nf(x.avgR, 2) + "R" : "—"}</td><td>${isNum(x.d1) ? durTxt(x.d1, tf === "d" ? 1 : 1 / 6) : "—"}</td></tr>`)).join("");
  return `${ideasHere.length ? panel("🎯 Thiết lập đang xuất hiện", ideaCards(ideasHere)) : ""}
    <div class="g g2">${panel("Khung ngày – Fibonacci, Gann, khối lượng", lvBlock(LV.d, "d") + flowBlock(FL.d, "d"))}${panel("Khung 4 giờ", lvBlock(LV.h4, "h4") + flowBlock(FL.h4, "h4"))}</div>
    ${stT ? panel(`Các thiết lập từng xuất hiện ở ${esc(D.row.k)} (lịch sử)`, `<div class="tw"><table><thead><tr><th class="l">Khung</th><th class="l">Thiết lập</th><th>Số lần</th><th>Chạm MT1</th><th>Lãi TB/lệnh</th><th>Thời gian tới MT1</th></tr></thead><tbody>${stT}</tbody></table></div>`) : ""}
    <p class="faint disclaimer">Fibonacci, Gann (Square of 9, chu kỳ thời gian) là quy ước nhiều người giao dịch cùng dùng nên đôi khi thành vùng phản ứng – không phải quy luật. Hệ thống ghép chúng với đỉnh/đáy cũ, khối lượng, MA để tìm vùng có nhiều mức trùng nhau ("hợp lưu"). Mốc thời gian chỉ để chú ý biến động, không dự báo chiều.</p>`;
}
BIND.lv = () => {};
const durTxt = (bars, perDay) => { const d = bars * perDay; return d < 1 ? `~${nf(d * 24, 0)} giờ` : `~${nf(d, d < 3 ? 1 : 0)} ngày`; };
const etaTxt = (iso) => (iso ? new Date(iso + "Z").toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
let IDEA_NAMES = { pullback_up: "Hồi về vùng Fibonacci trong xu hướng tăng", pullback_dn: "Hồi lên vùng Fibonacci trong xu hướng giảm", breakout_up: "Phá đỉnh 55 nến có khối lượng",
  breakout_dn: "Thủng đáy 55 nến có khối lượng", oversold_up: "Bán quá mức trong xu hướng tăng (bật lại)", overbought_dn: "Mua quá mức trong xu hướng giảm (quay đầu)" };
function ideaCards(list) {
  return `<div class="ideas">${list.map((x) => `<div class="idea ${x.side} ${x.edge ? "edge" : "noedge"}">
    <div class="ih">${coinLink(x.k)} <span class="pill ${x.side === "long" ? "buy" : "sell"}">${x.side === "long" ? "LONG" : "SHORT"}</span> <span class="pill">${x.tf === "d" ? "Ngày" : "4 giờ"}</span>
      ${x.edge ? `<span class="pill brand" title="Kỳ vọng dương trên ${nf(x.n, 0)} lần lịch sử và vẫn dương trong 2 năm gần nhất">có lợi thế lịch sử</span>` : `<span class="pill" title="Lịch sử không cho thấy lợi thế sau phí">không có lợi thế</span>`}</div>
    <div class="in"><b>${esc(x.name)}</b>${x.mfb ? ` <small class="muted">· thống kê khi dòng tiền ${esc(x.mfb)}</small>` : ""}
      ${x.htf ? ` <span class="pill ${x.htf === "h+" ? "buy" : x.htf === "h-" ? "sell" : ""}" title="Khung ${x.tf === "d" ? "tuần + tháng" : "ngày + tuần"} so với chiều lệnh${isNum(x.htf_avgR) ? ` – lịch sử ở trạng thái này: ${nf(x.htf_n, 0)} lần, chạm MT1 ${nf(x.htf_win1, 0)}%, lãi TB ${nf(x.htf_avgR, 2)}R` : ""}">${x.htf === "h+" ? "khung lớn cùng chiều" : x.htf === "h-" ? "khung lớn ngược chiều" : "khung lớn lẫn lộn"}${isNum(x.htf_avgR) ? ` · ${nf(x.htf_avgR, 2)}R` : ""}</span>` : ""}</div>
    ${kpis([["Vào", px(x.e)], ["Cắt lỗ", px(x.s), "down", `${nf(x.risk_pct, 2)}%`], ["Mục tiêu 1", `${px(x.t1)} <small>(${pct(x.t1_pct, 1)} · ${nf(x.r1, 1)}R)</small>`, "up"], ["Mục tiêu 2", `${px(x.t2)} <small>(${pct(x.t2_pct, 1)} · ${nf(x.r2, 1)}R)</small>`, "up"],
      ["Xác suất MT1", isNum(x.win1) ? nf(x.win1, 0) + "%" : "—", "", `MT2: ${nf(x.win2, 0)}% · trên ${nf(x.n, 0)} lần lịch sử`], ["Thời gian tới MT1", isNum(x.d1) ? `${durTxt(x.d1, x.bd)}` : "—", "", isNum(x.d1_lo) ? `50% số lần chạm MT1 trong ${durTxt(x.d1_lo, x.bd)} – ${durTxt(x.d1_hi, x.bd)}; MT2 ~${durTxt(x.d2, x.bd)}` : ""],
      ["Dự kiến", etaTxt(x.eta1), "", "Theo thời gian trung vị lịch sử"], ["Lãi TB/lệnh", isNum(x.avgR) ? `${nf(x.avgR, 2)}R` : "—", cls(x.avgR), `R = khoảng cắt lỗ. 2 năm gần nhất: ${isNum(x.avgR_2y) ? nf(x.avgR_2y, 2) + "R" : "—"}`]])}
    ${(x.notes || []).length ? `<small class="muted">${x.notes.map(esc).join(" · ")}</small>` : ""}
    <small class="faint">Độ tin cậy: ${esc(x.conf)} · tín hiệu nến ${etaTxt(x.at)} · cách đánh: chốt 50% ở MT1, dời cắt lỗ về giá vào, phần còn lại chờ MT2</small>
    <a class="btn" href="#/plan/${enc(x.k)}">Lên lệnh: khối lượng & đòn bẩy →</a></div>`).join("")}</div>`;
}

// ================================================================ KIỂM SOÁT ĐÒN BẨY (hệ thống quyết định – anh không tự nâng được)
// Quy tắc giống hệt app/analysis/risk.py (dùng cho cảnh báo gửi về điện thoại)
const GOV = {
  base: { d: { green: 3, yellow: 2, red: 1 }, h4: { green: 5, yellow: 3, red: 2 } },
  shortRed: { d: 2, h4: 3 },
  portLev: { green: 1.5, yellow: 1.0, red: 0.6 },     // tổng giá trị vị thế ròng / tài sản
  marginMax: 0.5, maxPos: 5, riskMax: 2,
};
function govLight() { return COINS?.light || "yellow"; }
function govDD() { if (RISK && isNum(RISK.dd)) return RISK.dd; const eq = PF?.eq, pk = PF?.peak; return isNum(eq) && isNum(pk) && pk > 0 ? Math.max(0, (1 - eq / pk) * 100) : 0; }
function levGov(r, side, tf, stopPct, opts = {}) {
  const light = govLight(), why = [];
  const tfk = tf === "d" ? "d" : "h4";
  let cap = side === "short" && light === "red" ? GOV.shortRed[tfk] : GOV.base[tfk][light];
  why.push(`Thị trường đèn ${LIGHT_VI[light] || light}, kiểu ${tfk === "d" ? "swing" : "lướt"} ${side === "long" ? "Long" : "Short"}: tối đa x${cap}`);
  const atr = r.atr ?? opts.atr;
  if (isNum(atr)) { const v = atr <= 3 ? 10 : atr <= 5 ? 5 : atr <= 8 ? 3 : atr <= 12 ? 2 : 1; if (v < cap) { cap = v; why.push(`Biến động ngày ${nf(atr, 1)}% → tối đa x${v}`); } }
  const mc = r.mc || 0, big = r.k === "BTC" || r.k === "ETH";
  const tier = big ? 10 : mc >= 1e10 ? 5 : mc >= 1e9 ? 3 : mc >= 2e8 ? 2 : 1;
  if (tier < cap) { cap = tier; why.push(mc ? `Vốn hoá ${usd(mc)} → tối đa x${tier}` : `Coin không có dữ liệu vốn hoá → chỉ x1`); }
  const cr = r.cr || [];
  if ((side === "long" && cr.includes("long_crowded")) || (side === "short" && cr.includes("short_crowded"))) { cap = Math.max(1, cap - 1); why.push(`Phe ${side === "long" ? "Long" : "Short"} đang quá đông → giảm 1 bậc`); }
  if (isNum(stopPct) && stopPct > 0) { const mmr = mc < 1e9 ? 0.01 : 0.005, l = Math.max(1, Math.floor(1 / (2.2 * stopPct / 100 + mmr + 0.002))); if (l < cap) { cap = l; why.push(`Cắt lỗ ${nf(stopPct, 1)}% → giá thanh lý phải xa gấp 2,2 lần → tối đa x${l}`); } }
  if (isNum(r.ml) && r.ml < cap) { cap = r.ml; why.push(`Sàn chỉ cho tối đa x${r.ml}`); }
  const dd = govDD();
  let riskMul = 1;
  if (dd >= 20) { cap = 1; riskMul = 0.25; why.push(`Tài khoản đang sụt ${nf(dd, 0)}% so với đỉnh → khoá đòn bẩy (chỉ x1), rủi ro còn 1/4`); }
  else if (dd >= 10) { cap = Math.min(cap, 2); riskMul = 0.5; why.push(`Tài khoản đang sụt ${nf(dd, 0)}% so với đỉnh → tối đa x2, rủi ro giảm 1/2`); }
  if (light === "red" && side === "long") riskMul *= 0.5; else if (light === "yellow") riskMul *= 0.75;
  (RISK?.half || []).forEach((h) => { riskMul *= 0.5; why.push(`Rủi ro giảm 1/2 vì ${h}`); });
  let halt = false;
  if (RISK?.halt) { halt = true; riskMul = 0; why.push(`Đã lỗ ${nf(RISK.day_pct, 1)}% hôm nay (mức dừng −3%) → KHÔNG mở lệnh mới tới hết ngày`); }
  const risk = Math.min(GOV.riskMax, setting("risk", 1)) * riskMul;
  return { cap: Math.max(1, Math.floor(cap)), why, risk, dd, light, halt };
}
// vị thế hiện có: tổng đòn bẩy ròng, ký quỹ, số lệnh
function pfExposure() {
  if (!PF) return null;
  let spot = 0, cash = Number(PF.cash || 0), net = 0, margin = 0, pnl = 0, n = 0;
  (PF.holdings || []).forEach((h) => { const p = BYK?.[h.symbol]?.p; if (isNum(p)) { spot += h.qty * p; net += h.qty * p; } });
  (PF.futures || []).forEach((f) => { const p = BYK?.[f.symbol]?.p; if (!isNum(p)) return; const sd = f.side === "short" ? -1 : 1; net += sd * f.qty * p; margin += f.qty * f.entry / (f.lev || 1); pnl += sd * f.qty * (p - f.entry); n++; });
  const eq = spot + cash + margin + pnl;
  return { eq, net, margin, n, eff: eq > 0 ? Math.abs(net) / eq : 0, cap: GOV.portLev[govLight()] };
}

// ================================================================ LÊN LỆNH: quyết định – giá vào – cắt lỗ – mục tiêu – khối lượng – đòn bẩy – thời gian thoát
const FEE1 = 0.0005;
const VERD = { go: ["VÀO NGAY", "buy"], limit: ["ĐẶT LỆNH CHỜ", "brand"], watch: ["CHỈ THEO DÕI", "warn"], no: ["KHÔNG VÀO", "sell"] };
function poolStat(IJ, tf, setup, btcUp) { const x = IJ?.stats?.[tf]?.[setup]; return x ? (x[btcUp ? "up" : "down"] || x.all || null) : null; }
// t: { side, tf, e, s, t1, t2, p1, p2, d1, d1_hi, d2, src, setup, edge }  → tính khối lượng, đòn bẩy, chi phí, kỳ vọng
function finishTicket(D, t) {
  const r = D.row, X = pfExposure(), acct = X && X.eq > 0 && (PF.holdings?.length || PF.futures?.length || PF.cash) ? X.eq : setting("acct", 10000);
  const sd = t.side === "long" ? 1 : -1, e = t.e, s = t.s;
  const stopPct = Math.abs(e - s) / e;
  t.r1 = Math.abs(t.t1 - e) / Math.abs(e - s); t.r2 = Math.abs(t.t2 - e) / Math.abs(e - s);
  t.rrBlend = 0.5 * t.r1 + 0.5 * t.r2;
  const G = levGov({ ...r, atr: r.atr ?? D.trend?.atr_pct }, t.side, t.tf, stopPct * 100);
  const rk = G.risk;
  const riskUsd = acct * rk / 100, qtyC = riskUsd / Math.abs(e - s), notional = qtyC * e;
  const smallCap = (r.mc || 0) < 1e9, mmr = smallCap ? 0.01 : 0.005;
  const Lmax = G.cap;
  t.gov = G;
  const marginCap = 0.25 * acct;                                                    // ký quỹ 1 lệnh ≤ 25% vốn
  const Lneed = notional / marginCap;
  const canSpot = sd === 1 && r.spot;
  let mode, lev, q = qtyC, capped = false;
  if (canSpot && notional <= marginCap * 1.2) { mode = "spot"; lev = 1; }
  else if (!r.fx) { mode = canSpot ? "spot" : "none"; lev = 1; if (canSpot && notional > marginCap) { q = marginCap / e; capped = true; } }
  else { mode = "perp"; lev = Math.min(Lmax, Math.max(1, Math.ceil(Lneed * 10) / 10)); lev = Math.max(1, Math.round(lev)); if (notional / lev > marginCap) { q = marginCap * lev / e; capped = true; } }
  const XX = X && X.eq > 0 ? X : { eq: acct, net: 0, margin: 0, n: 0, cap: GOV.portLev[govLight()] };
  { const X = XX;                            // giới hạn tổng: đòn bẩy ròng danh mục & ký quỹ & số lệnh
    const room = Math.max(0, X.cap * X.eq - sd * X.net);
    if (q * e > room) { q = room / e; capped = true; G.why.push(`Tổng vị thế ròng tối đa ${nf(X.cap, 1)} lần tài sản (đèn ${LIGHT_VI[G.light]}) → chỉ còn chỗ ${usd(room)}`); }
    if (mode === "perp") { const mroom = Math.max(0, GOV.marginMax * X.eq - X.margin); if (q * e / lev > mroom) { q = mroom * lev / e; capped = true; G.why.push(`Tổng ký quỹ tối đa 50% tài sản → còn ${usd(mroom)}`); } }
    if (mode === "perp" && X.n >= GOV.maxPos) { q = 0; G.why.push(`Đã có ${X.n} vị thế futures (tối đa ${GOV.maxPos}) – đóng bớt trước khi mở lệnh mới`); }
  }
  const N = q * e, margin = N / lev, liq = mode === "perp" ? liqPrice(t.side, e, lev, mmr) : null;
  const holdDays = (t.d1 || 3) * (t.tf_bd ?? (t.tf === "d" ? 1 : 1 / 6));
  const f8 = r.f8 || 0, fundUsd = mode === "perp" ? -sd * N * f8 / 100 * 3 * holdDays : 0;       // dương = được nhận
  const feeUsd = N * FEE1 * 2, riskReal = q * Math.abs(e - s);
  const costR = (feeUsd - fundUsd) / Math.max(1e-9, riskReal);
  const p1 = (t.p1 ?? 40) / 100, p2 = Math.min(p1, (t.p2 ?? (t.p1 ?? 40) * 0.45) / 100);
  const evR = isNum(t.avgR) ? t.avgR : p2 * (0.5 * t.r1 + 0.5 * t.r2) + (p1 - p2) * (0.5 * t.r1) - (1 - p1) - costR;
  Object.assign(t, { acct, rk, govRisk: G.risk, stopPct: stopPct * 100, q, N, margin, marginPct: margin / acct * 100, lev, Lmax, mode, liq, liqDist: liq ? Math.abs(liq / e - 1) * 100 : null,
    riskUsd: riskReal, riskPct: riskReal / acct * 100, feeUsd, fundUsd, costR, evR, evUsd: evR * riskReal, capped, mmr, holdDays,
    win1Usd: q * Math.abs(t.t1 - e) * 0.5 + 0, win2Usd: q * Math.abs(t.t2 - e) * 0.5,
    ex: r.bf ? "Binance" : (D.venues || [])[0]?.ex || "—" });
  return t;
}
function makeTicket(D, IJ, opt = {}) {
  const r = D.row, T = D.trend || {}, I = D.intra || {}, btcUp = IJ ? IJ.btc_up : true;
  const want = opt.tf || "auto", sideWant = opt.side || "auto";
  const price = BYK?.[r.k]?.p || r.p;
  const notes = [], warn = [];
  // 1) có thiết lập đã kiểm chứng đang xuất hiện → dùng thẳng
  let cands = (D.ideas || []).filter((x) => (want === "auto" || x.tf === want) && (sideWant === "auto" || x.side === sideWant));
  cands.sort((a, b) => (b.edge - a.edge) || ((b.avgR || -9) - (a.avgR || -9)));
  let t = null;
  if (cands.length) {
    const x = cands[0];
    const atr = x.tf === "d" ? T.atr : I.atr1h * 2;
    const far = atr && Math.abs(price - x.e) > 0.6 * atr;
    t = { side: x.side, tf: x.tf, e: far ? x.e : price, s: x.s, t1: x.t1, t2: x.t2, p1: x.win1, p2: x.win2, d1: x.d1, d1_hi: x.d1_hi, d2: x.d2, avgR: x.avgR, n: x.n, setup: x.name, edge: x.edge,
      src: `thiết lập "${x.name}" – ${nf(x.n, 0)} lần trong lịch sử`, order: far ? "limit" : "market" };
    if (!x.edge) warn.push("Thiết lập này không có lợi thế lịch sử sau phí");
    (x.notes || []).forEach((n) => notes.push(n));
  } else {
    // 2) không có thiết lập: lập kế hoạch theo cấu trúc giá (hỗ trợ/kháng cự hợp lưu) theo xu hướng
    const tf = want === "auto" ? (I.bias4h != null && I.bias4h !== 0 && (T.state === I.bias4h || !T.state) ? "h4" : "d") : want;
    const L = (D.lv || {})[tf] || {};
    let side = sideWant !== "auto" ? sideWant : tf === "d" ? (T.state === 1 ? "long" : T.state === -1 && T.side === "short" ? "short" : null) : (I.bias4h === 1 ? "long" : I.bias4h === -1 ? "short" : null);
    if (!side) return { none: true, reason: tf === "d" ? "Khung ngày chưa có xu hướng rõ (giá quanh EMA50) – không có lợi thế để vào." : "Khung 4h đi ngang – không có lợi thế lướt.", tf, price };
    if (side === "short" && !r.fx) return { none: true, reason: "Coin này không có hợp đồng perp để Short.", tf, price };
    const atr = tf === "d" ? (T.atr || L.atr) : (L.atr || I.atr1h * 2);
    const sd = side === "long" ? 1 : -1;
    const zones = sd === 1 ? (L.sup || []) : (L.res || []);
    const tz = sd === 1 ? (L.res || []) : (L.sup || []);
    // vùng vào: vùng hợp lưu mạnh nhất trong 2,5 ATR, không thì EMA20
    const near = zones.filter((z) => Math.abs(z.p - price) <= 2.5 * atr).sort((a, b) => b.n - a.n || Math.abs(a.p - price) - Math.abs(b.p - price));
    let e = price, order = "market", zsrc = "";
    const ema20 = tf === "d" ? T.ema20 : I.ema20_4h;
    if (near.length && near[0].n >= 2) {
      const edge = sd === 1 ? near[0].hi : near[0].lo;
      zsrc = near[0].src.slice(0, 3).join(", ");
      if (sd * (price - edge) > 0.3 * atr) { e = edge; order = "limit"; }      // giá còn cách vùng đỡ → chờ hồi về vùng
    }
    else if (ema20 && sd * (price - ema20) > 1.2 * atr) { e = ema20; order = "limit"; zsrc = "EMA20"; }
    if (order === "market" && zsrc) zsrc = "giá đang nằm trong vùng " + zsrc;
    // cắt lỗ dưới vùng đỡ kế tiếp (hoặc 1,5 ATR)
    const below = zones.filter((z) => sd * (e - z.p) > 0.3 * atr).sort((a, b) => sd * (b.p - a.p));
    let s = e - sd * 1.5 * atr;
    if (below.length && sd * (e - below[0].lo) < 2.5 * atr) s = (sd === 1 ? below[0].lo : below[0].hi) - sd * 0.3 * atr;
    if (sd * (e - s) < 0.8 * atr) s = e - sd * 0.8 * atr;
    const R = Math.abs(e - s);
    const tgt = tz.filter((z) => sd * (z.p - e) >= 1.2 * R).sort((a, b) => sd * (a.p - b.p));
    const fx = L.fib?.ext || {};
    let t1 = tgt[0]?.p ?? e + sd * 1.5 * R, t2 = tgt[1]?.p ?? (isNum(fx["1.618"]) && sd * (fx["1.618"] - t1) > 0 ? fx["1.618"] : e + sd * 3 * R);
    if (sd * (t2 - t1) <= 0) t2 = t1 + sd * 1.5 * R;
    // xác suất & thời gian: thiết lập gần nhất trong thống kê, không có thì ước lượng theo biến động
    const retr = L.retr_now;
    const proxy = sd === 1 ? (isNum(retr) && retr >= 0.3 && retr <= 0.75 ? "pullback_up" : "breakout_up") : (isNum(retr) && retr >= 0.3 && retr <= 0.75 ? "pullback_dn" : "breakout_dn");
    const P = poolStat(IJ, tf, proxy, btcUp) || {};
    const bars1 = Math.max(1, Math.round((Math.abs(t1 - e) / atr) ** 2 * 0.8));
    t = { side, tf, e, s, t1, t2, p1: P.win1 ?? 38, p2: P.win2, d1: P.d1 ?? bars1, d1_hi: P.d1_hi ?? bars1 * 2, d2: P.d2 ?? bars1 * 2, n: P.n, setup: null, edge: false, order,
      src: `kế hoạch theo cấu trúc giá${zsrc ? ` (${order === "limit" ? "vào ở vùng " : ""}${zsrc})` : ""} – xác suất ước theo thiết lập gần giống "${IDEA_NAMES[proxy]}"` };
    warn.push("Chưa có thiết lập đã kiểm chứng xuất hiện – đây là kế hoạch tham khảo, nên chờ thiết lập hoặc đánh nhỏ");
  }
  t.tf_bd = t.tf === "d" ? 1 : 1 / 6;
  finishTicket(D, t);
  // 3) bộ lọc rủi ro
  const sd = t.side === "long" ? 1 : -1, cr = r.cr || [];
  if (sd === 1 && cr.includes("long_crowded")) warn.push(`Phe Long đang quá đông (funding ${f8s(r.f8)}) – dễ bị quét trước khi chạy`);
  if (sd === -1 && cr.includes("short_crowded")) warn.push("Phe Short đang quá đông – dễ bị ép tăng");
  if (sd === 1 && !btcUp) warn.push("BTC đang dưới MA200 – Long altcoin rủi ro cao hơn");
  if (sd === -1 && btcUp) warn.push("BTC đang trên MA200 – Short ngược xu hướng chung");
  if (r.nw) warn.push("Có tin xấu nghiêm trọng 3 ngày qua – xem tab Tổng quan");
  if (isNum(r.u90) && r.u90 >= 3 && sd === 1) warn.push(`Sắp mở khoá ${nf(r.u90, 1)}% lượng lưu hành trong 90 ngày`);
  if (t.tf === "d" && T.state && T.state !== sd) warn.push("Ngược xu hướng khung ngày");
  if (t.r1 < 1) warn.push(`Mục tiêu 1 chỉ ${nf(t.r1, 2)}R – lời ít hơn lỗ`);
  if ((r.vol || 0) < 2e6 && (r.oi || 0) < 2e6) warn.push("Thanh khoản thấp – trượt giá lớn");
  if (t.capped) warn.push("Khối lượng bị giới hạn để ký quỹ không vượt 25% vốn");
  // 4) quyết định
  let v;
  if (t.evR <= 0) v = "no";
  else if (t.edge && t.order === "market" && t.r1 >= 1 && warn.length <= 2) v = "go";
  else if (t.edge || (t.evR > 0.05 && warn.length <= 3)) v = t.order === "limit" || !t.edge ? "limit" : "go";
  else v = "watch";
  if (warn.some((w) => w.startsWith("Có tin xấu")) && v === "go") v = "watch";
  if (!(t.q > 0)) { v = "no"; warn.unshift(t.gov?.halt ? `Hệ thống đang DỪNG giao dịch: đã lỗ ${nf(RISK?.day_pct, 1)}% hôm nay – nghỉ tới mai` : "Danh mục đã chạm giới hạn rủi ro của hệ thống – không mở thêm lệnh"); }
  t.verdict = v; t.warn = warn; t.notes = notes; t.price = price; t.k = r.k;
  const now = Date.now();
  t.eta1 = now + (t.d1 || 0) * t.tf_bd * 86400e3; t.eta2 = now + (t.d2 || 0) * t.tf_bd * 86400e3; t.tstop = now + (t.d1_hi || t.d1 * 2 || 0) * t.tf_bd * 86400e3;
  return t;
}
const D_FX = (t) => !!BYK?.[t.k]?.fx && t.Lmax > 1;
const dt = (ms) => new Date(ms).toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function ticketCard(t, opts = {}) {
  if (!t || t.none) return `<div class="ticket"><div class="tk-h"><span class="pill sell">KHÔNG VÀO</span> <b>${esc(t?.k || "")}</b></div><p>${esc(t?.reason || "Không đủ dữ liệu.")}</p></div>`;
  const [vt, vc] = VERD[t.verdict], L = t.side === "long";
  const modeTxt = t.mode === "spot" ? `<b>Mua spot</b> – không cần đòn bẩy` : t.mode === "perp" ? `<b>Perp ${L ? "Long" : "Short"} x${t.lev}</b> ` : "—";
  return `<div class="ticket ${t.side}">
    <div class="tk-h">${opts.live ? "" : `<span class="pill ${vc} big">${vt}</span>`} ${coinLink(t.k, "/plan")} <span class="pill ${L ? "buy" : "sell"}">${L ? "LONG" : "SHORT"}</span> <span class="pill">${t.tfLabel || (t.tf === "d" ? "Swing – khung ngày" : "Lướt – khung 4h")}</span> ${t.edge ? '<span class="pill brand">có lợi thế lịch sử</span>' : ""}
      <small class="muted">giá hiện tại ${px(t.price)}</small></div>
    <div class="tk-g">
      <div class="tk-b"><h4>① Giá vào</h4><p class="tk-v">${px(t.e)}</p><small>${t.order === "market" ? "Vào ngay (lệnh thị trường / giới hạn sát giá)" : `Đặt lệnh chờ ${L ? "mua" : "bán"} – cách giá hiện tại ${pct((t.e / t.price - 1) * 100, 1)}`}</small></div>
      <div class="tk-b"><h4>② Cắt lỗ</h4><p class="tk-v down">${px(t.s)}</p><small>−${nf(t.stopPct, 2)}% · lỗ tối đa ${usd(t.riskUsd)} (${nf(t.riskPct, 2)}% vốn)</small></div>
      <div class="tk-b"><h4>③ Chốt lời</h4><p class="tk-v up">${px(t.t1)} <small>→</small> ${px(t.t2)}</p><small>MT1 ${pct((t.t1 / t.e - 1) * 100, 1)} · <b>R:R ${nf(t.r1, 1)}</b> | MT2 ${pct((t.t2 / t.e - 1) * 100, 1)} · <b>R:R ${nf(t.r2, 1)}</b></small></div>
      <div class="tk-b"><h4>④ Khối lượng & đòn bẩy <span class="pill brand" title="Do hệ thống kiểm soát">hệ thống cho tối đa x${t.Lmax}</span></h4><p class="tk-v">${modeTxt}</p><small>${qty(t.q)} ${esc(t.k)} · giá trị ${usd(t.N)} · ký quỹ ${usd(t.margin)} (${nf(t.marginPct, 0)}% vốn)${t.liq ? ` · thanh lý ${px(t.liq)} (cách ${nf(t.liqDist, 1)}%, xa gấp ${nf(t.liqDist / t.stopPct, 1)} lần cắt lỗ)` : ""} · sàn gợi ý: ${esc(t.ex)}${t.mode === "spot" && D_FX(t) ? ` · <i>hoặc perp x${t.Lmax} nếu muốn giữ tiền: ký quỹ ${usd(t.N / t.Lmax)}, thanh lý ${px(liqPrice(t.side, t.e, t.Lmax, t.mmr))}</i>` : ""}</small></div>
      <div class="tk-b"><h4>⑤ Khi nào ra</h4><p class="tk-v">MT1 ${durTxt(t.d1, t.tf_bd)}</p><small>dự kiến ${dt(t.eta1)} · MT2 ${durTxt(t.d2, t.tf_bd)} (${dt(t.eta2)}) · <b>quá ${dt(t.tstop)} chưa chạm MT1 → thoát</b> (hết thời gian kỳ vọng)</small></div>
      <div class="tk-b"><h4>⑥ Kỳ vọng</h4><p class="tk-v ${cls(t.evR)}">${t.evR > 0 ? "+" : ""}${nf(t.evR, 2)}R <small>≈ ${usd(t.evUsd)}/lệnh</small></p><small>xác suất chạm MT1 ${nf(t.p1, 0)}%${isNum(t.n) ? ` (trên ${nf(t.n, 0)} lần lịch sử)` : ""} · phí ~${usd(t.feeUsd)}${t.mode === "perp" ? ` · funding ${t.fundUsd >= 0 ? "nhận" : "trả"} ~${usd(Math.abs(t.fundUsd))} trong thời gian giữ` : ""}</small></div>
    </div>
    <details class="tk-gov"><summary>Vì sao hệ thống cho đòn bẩy tối đa x${t.Lmax} và rủi ro ${nf(t.govRisk, 2)}%/lệnh?</summary><ul>${(t.gov?.why || []).map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>
    <div class="tk-plan"><b>Cách đánh:</b> ${t.order === "market" ? "Vào" : "Đặt lệnh chờ"} ${qty(t.q)} ${esc(t.k)} ở ${px(t.e)}, đặt sẵn cắt lỗ ${px(t.s)} trên sàn. Chạm ${px(t.t1)} → chốt 50% và dời cắt lỗ về ${px(t.e)} (hoà vốn). Phần còn lại chốt ở ${px(t.t2)}${t.tf === "d" ? " hoặc khi đóng cửa ngày dưới EMA20" : " hoặc khi nến 4h đóng ngược EMA20"}. ${t.order === "limit" ? `Huỷ lệnh chờ nếu giá chạy tới ${px(t.t1)} trước khi khớp.` : ""}</div>
    <small class="muted">Cơ sở: ${esc(t.src)}${t.notes.length ? " · " + t.notes.map(esc).join(" · ") : ""}</small>
    ${t.warn.length ? `<ul class="tk-w">${t.warn.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
    ${opts.save !== false ? `<div class="tk-a"><button class="btn primary" data-tsave='${esc(JSON.stringify({ k: t.k, side: t.side, tf: t.tf, e: t.e, s: t.s, t1: t.t1, t2: t.t2, lev: t.lev, mode: t.mode, q: t.q, eta1: t.eta1, tstop: t.tstop, order: t.order }))}'>Lưu kế hoạch & nhắc tôi</button> <small class="faint">hệ thống báo khi giá tới điểm vào / MT1 / cắt lỗ / hết thời gian</small></div>` : ""}
  </div>`;
}
function bindTicketSave(root = document) {
  $$("[data-tsave]", root).forEach((b) => b.onclick = async () => {
    const x = JSON.parse(b.dataset.tsave);
    await pfLoad();
    PF.plans = (PF.plans || []).filter((p) => !(p.k === x.k && p.side === x.side && p.status !== "done"));
    PF.plans.push({ ...x, id: Date.now().toString(36), created: new Date().toISOString(), status: "chờ" });
    await pfSave(); toast(`Đã lưu kế hoạch ${x.k} – xem ở Danh mục`); b.disabled = true; b.textContent = "Đã lưu ✓";
  });
}
async function viewPlan(k0) {
  const [IJ] = await Promise.all([load("data/ideas.json"), coins(), loadSettings(), pfLoad().catch(() => null)]);
  const L = await liveData();
  const items = ((L && L.ideas && new Date(L.at) > new Date(IJ.at)) ? L.ideas : IJ.items).filter((x) => x.edge).slice(0, 6);
  const O = { k: k0 || lsGet("plk", ""), tf: lsGet("pltf", "auto"), side: lsGet("plside", "auto") };
  app().innerHTML = `<div class="ph"><h1>Lên lệnh</h1><span class="meta">đèn ${LIGHT_VI[govLight()] || ""} · đòn bẩy do hệ thống kiểm soát (swing ≤ x${GOV.base.d[govLight()]}, lướt ≤ x${GOV.base.h4[govLight()]}) · rủi ro ${nf(levGov({ k: "BTC", mc: 2e12 }, "long", "d").risk, 2)}%/lệnh · <a href="#/portfolio">xem kiểm soát rủi ro</a></span></div>
    <section class="panel"><div class="ph"><h2>🧾 Tạo kế hoạch cho một coin</h2></div>
      <div class="filters"><div class="field"><label>Coin</label><input id="plK" list="plList" value="${esc(O.k)}" placeholder="VD: SOL"></div>
        <div class="field"><label>Kiểu chơi</label><select id="plTf"><option value="auto">Tự chọn</option><option value="h4" ${O.tf === "h4" ? "selected" : ""}>Lướt (4h, vài giờ – vài ngày)</option><option value="d" ${O.tf === "d" ? "selected" : ""}>Swing (ngày, vài ngày – vài tuần)</option></select></div>
        <div class="field"><label>Chiều</label><select id="plSide"><option value="auto">Theo hệ thống</option><option value="long" ${O.side === "long" ? "selected" : ""}>Long</option><option value="short" ${O.side === "short" ? "selected" : ""}>Short</option></select></div>
        <button class="btn primary" id="plGo">Tạo kế hoạch</button></div>
      <datalist id="plList">${COINS.rows.map((r) => `<option value="${esc(r.k)}">${esc(r.n)}</option>`).join("")}</datalist>
      <div id="plOut"></div></section>
    <section class="panel"><div class="ph"><h2>🎯 Lệnh đáng làm nhất lúc này <span class="live-dot"></span></h2><span class="meta">giá & trạng thái cập nhật từng giây · xác nhận khung 15 phút mỗi phút · danh sách làm mới mỗi 5 phút · đã tính khối lượng, spot hay futures, đòn bẩy theo vốn của anh</span></div><div id="plTop"><p class="muted">Đang tính…</p></div></section>
    <p class="faint disclaimer">Kế hoạch được tính tự động từ quy tắc cố định & thống kê quá khứ – không phải lời khuyên đầu tư và không đảm bảo kết quả. Đòn bẩy chỉ làm giảm tiền ký quỹ; mức lỗ do khối lượng và điểm cắt lỗ quyết định – luôn đặt cắt lỗ trên sàn.</p>`;
  const go = async () => {
    const k = $("#plK").value.trim().toUpperCase(); if (!BYK[k]) { $("#plOut").innerHTML = `<p class="muted">Chọn coin có trong danh sách.</p>`; return; }
    lsSet("plk", k); lsSet("pltf", $("#plTf").value); lsSet("plside", $("#plSide").value);
    $("#plOut").innerHTML = `<p class="muted">Đang tính ${esc(k)}…</p>`;
    const D = await load(`data/c/${enc(k)}.json`);
    const t = makeTicket(D, IJ, { tf: $("#plTf").value, side: $("#plSide").value }); if (t.none) t.k = k;
    if (t.none) { $("#plOut").innerHTML = ticketCard(t); return; }
    liveTickets($("#plOut"), [{ t, D }]);
  };
  $("#plGo").onclick = go; $("#plK").addEventListener("change", go);
  if (O.k && BYK[O.k]) go();
  const build = async (fresh) => {
    let src = items;
    if (fresh) { const L2 = await liveData(true); src = ((L2 && L2.ideas && new Date(L2.at) > new Date(IJ.at)) ? L2.ideas : IJ.items).filter((x) => x.edge).slice(0, 8); }
    const seen = new Set(), tops = [];
    for (const x of src) { if (seen.has(x.k)) continue; seen.add(x.k); try { const D = await load(`data/c/${enc(x.k)}.json`); D._ij = IJ; D.ideas = [x, ...(D.ideas || []).filter((y) => y.setup !== x.setup)]; const t = makeTicket(D, IJ, { tf: x.tf, side: x.side }); if (!t.none && t.verdict !== "no") tops.push({ t, D }); } catch (e) { /* thiếu dữ liệu */ } }
    const host = $("#plTop"); if (!host) return;
    const sig = tops.map((x) => x.t.k + x.t.side + x.t.e).join("|");
    if (fresh && sig === host.dataset.sig) return;
    host.dataset.sig = sig;
    if (!tops.length) { host.innerHTML = `<div class="empty">Hiện không có thiết lập có lợi thế lịch sử. Không vào lệnh cũng là một quyết định tốt – hoặc tự tạo kế hoạch cho coin anh quan tâm ở trên, hoặc xem <a href="#/radar">Radar</a> cho khung ngắn.</div>`; return; }
    liveTickets(host, tops, { refresh: () => build(true) });
  };
  await build(false);
}

// ================================================================ PHIẾU LỆNH TRỰC TIẾP – giá từng giây, trạng thái vào lệnh đổi theo giá
const FEE_SPOT = 0.001, FEE_FUT_T = 0.0005, FEE_FUT_M = 0.0002;
const usd2 = (x) => (isNum(x) && Math.abs(x) < 100 ? `${x < 0 ? "-" : ""}$${nf(Math.abs(x), 2)}` : usd(x));
function spotFutBox(t, open = true) {
  const r = BYK?.[t.k] || {}, L = t.side === "long", sd = L ? 1 : -1, N = t.N, f8 = r.f8 || 0, hold = t.holdDays || 1;
  const canSpot = L && !!r.spot, canFut = !!r.fx;
  const fl = t.mode === "perp" ? t.lev : Math.max(1, Math.min(t.Lmax || 1, 3));
  const fund = -sd * N * f8 / 100 * 3 * hold, liq = canFut ? liqPrice(t.side, t.e, fl, t.mmr || MMR) : null;
  const spotCost = N * FEE_SPOT * 2, futCost = N * FEE_FUT_T * 2 - fund;
  const why = [];
  if (t.mode === "spot") {
    why.push("Lệnh Long và coin có trên Binance spot – mua thật, <b>không thể bị thanh lý</b>, không trả funding");
    if (canFut && f8 > 0) why.push(`Funding đang dương ${f8s(f8)}/8h: giữ perp ${durTxt(t.d1 || 3, t.tf_bd || 1)} sẽ tốn ~${usd2(Math.abs(fund))}`);
    why.push(`Giá trị lệnh ${usd2(N)} = ${nf(N / Math.max(1, t.acct) * 100, 0)}% tài sản – vừa sức mua bằng tiền thật, không cần vay`);
  } else if (t.mode === "perp") {
    if (!L) why.push("Lệnh <b>Short</b> – spot không bán khống được, phải dùng hợp đồng vĩnh cửu (perp)");
    else if (!r.spot) why.push("Coin không có cặp spot trên Binance – dùng perp");
    else why.push(`Giá trị lệnh ${usd2(N)} lớn hơn 25% tài sản – dùng perp x${t.lev} để chỉ khoá ${usd2(t.margin)} ký quỹ (phần tiền còn lại vẫn rảnh)`);
    if (fund > 0) why.push(`Funding đang ${f8s(f8)}/8h – phe ${L ? "Long" : "Short"} được <b>nhận</b> ~${usd2(fund)} trong thời gian giữ`);
    else if (fund < 0) why.push(`Funding ${f8s(f8)}/8h – tốn ~${usd2(-fund)} trong thời gian giữ (đã tính vào chi phí)`);
    why.push(`Đòn bẩy x${t.lev} do hệ thống chọn: giá thanh lý ${px(t.liq)} xa gấp ${nf(t.liqDist / t.stopPct, 1)} lần điểm cắt lỗ – cắt lỗ luôn chạy trước thanh lý`);
  } else why.push("Không có cách vào phù hợp (không có perp để Short / không có spot)");
  const col = (on, title, rows) => `<div class="sf-c ${on ? "on" : ""}"><h5>${title}${on ? ' <span class="pill buy">nên dùng</span>' : ""}</h5><dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl></div>`;
  const spotCol = canSpot ? col(t.mode === "spot", "Spot (mua coin thật)", [["Tiền cần bỏ ra", usd2(N)], ["Phí 2 chiều (0,1%)", usd2(spotCost)], ["Funding", "không có"], ["Thanh lý", "không bao giờ"], ["Short được?", "không"]]) : col(false, "Spot", [["", L ? "Coin không có trên Binance spot" : "Spot không Short được"]]);
  const futCol = canFut ? col(t.mode === "perp", `Futures perp x${fl}`, [["Ký quỹ khoá", usd2(N / fl)], ["Phí 2 chiều (0,05%)", usd2(N * FEE_FUT_T * 2)], ["Funding thời gian giữ", `${fund >= 0 ? "nhận" : "trả"} ${usd2(Math.abs(fund))}`], ["Thanh lý", `${px(liq)} (${pct((liq / t.e - 1) * 100, 1)})`], ["Tổng chi phí", usd2(futCost)]]) : col(false, "Futures", [["", "Coin không có hợp đồng perp"]]);
  return `<details class="sf" ${open ? "open" : ""}><summary><b>Đánh spot hay futures?</b> → <span class="pill ${t.mode === "spot" ? "buy" : t.mode === "perp" ? "brand" : "sell"}">${t.mode === "spot" ? "Spot – mua coin thật" : t.mode === "perp" ? `Futures perp x${t.lev}` : "Không có cách vào"}</span> <small class="faint">bấm để xem so sánh & cách đặt lệnh từng bước</small></summary><div class="sf-g">${spotCol}${futCol}</div><ul class="sf-w">${why.map((w) => `<li>${w}</li>`).join("")}</ul>${binanceSteps(t)}</details>`;
}
function binanceSteps(t) {
  const r = BYK?.[t.k] || {}, L = t.side === "long", half = t.q / 2, lim = t.order !== "market";
  const onB = t.mode === "spot" ? !!r.sp : !!r.bf;
  const ex = onB ? "Binance" : (t.ex || "sàn có hợp đồng");
  let st = [];
  if (t.mode === "spot") st = [
    `Mở ${ex} → <b>Giao dịch → Spot</b> → tìm cặp <b>${esc(r.sp || t.k + "USDT")}</b>.`,
    lim ? `Chọn <b>Giới hạn (Limit)</b>: Giá <b>${px(t.e)}</b>, Số lượng <b>${qty(t.q)} ${esc(t.k)}</b> (≈ ${usd(t.N)}) → Mua. Lệnh nằm chờ tới khi giá về.` : `Chọn <b>Giới hạn</b> với giá = giá bán tốt nhất hiện tại (hoặc <b>Thị trường</b>), Số lượng <b>${qty(t.q)} ${esc(t.k)}</b> → Mua.`,
    `Khớp xong → đặt ngay lệnh <b>OCO</b> bán ${qty(half)} ${esc(t.k)}: Giá chốt lời (Limit) <b>${px(t.t1)}</b> · Giá kích hoạt Stop <b>${px(t.s)}</b> · Giá Limit của Stop <b>${px(t.s * 0.995)}</b>.`,
    `Đặt OCO thứ hai cho ${qty(half)} ${esc(t.k)} còn lại: chốt lời <b>${px(t.t2)}</b> · Stop <b>${px(t.s)}</b> · Limit <b>${px(t.s * 0.995)}</b>.`,
    `Khi MT1 khớp → huỷ OCO còn lại, đặt lại OCO: chốt lời <b>${px(t.t2)}</b>, Stop = <b>${px(t.e)}</b> (giá vào – hoà vốn).`,
    `Nếu tới <b>${dt(t.tstop)}</b> chưa chạm MT1 → huỷ OCO, bán thị trường (hết thời gian kỳ vọng).`];
  else if (t.mode === "perp") st = [
    `Mở ${ex} → <b>Futures → USDⓈ-M</b> → <b>${esc(r.bf || t.k + "USDT")} Vĩnh cửu</b>.`,
    `Bấm chế độ ký quỹ → chọn <b>Isolated (Cô lập)</b> (lỗ không lan sang tiền khác). Bấm số đòn bẩy → kéo về <b>x${t.lev}</b> → Xác nhận.`,
    `${lim ? `Chọn <b>Limit</b>, Giá <b>${px(t.e)}</b>` : "Chọn <b>Market</b> (hoặc Limit sát giá)"}, Số lượng <b>${qty(t.q)} ${esc(t.k)}</b> (≈ ${usd(t.N)}, ký quỹ ${usd(t.margin)}). Tick <b>TP/SL</b>: TP <b>${px(t.t1)}</b>, SL <b>${px(t.s)}</b>, kích hoạt theo <b>Mark price</b>. → <b>${L ? "Mua/Long" : "Bán/Short"}</b>.`,
    `Khớp xong → tab <b>Vị thế → TP/SL</b>: sửa TP thành 2 phần – <b>${qty(half)}</b> ở ${px(t.t1)} và <b>${qty(half)}</b> ở ${px(t.t2)} (Reduce-only); SL toàn bộ ở <b>${px(t.s)}</b>.`,
    `Kiểm tra <b>Giá thanh lý</b> sàn hiển thị ≈ ${px(t.liq)} – phải nằm xa hơn SL ${px(t.s)}. Nếu gần hơn → giảm đòn bẩy.`,
    `Khi MT1 khớp → sửa SL về <b>${px(t.e)}</b> (hoà vốn). Funding trừ/cộng mỗi 8 giờ (00:00, 08:00, 16:00 UTC).`,
    `Nếu tới <b>${dt(t.tstop)}</b> chưa chạm MT1 → đóng vị thế bằng Market.`];
  if (!st.length) return "";
  return `<details class="bsteps" open><summary>Cách đặt lệnh trên ${esc(ex)} – từng bước</summary><ol>${st.map((s) => `<li>${s}</li>`).join("")}</ol></details>`;
}
// trạng thái theo giá hiện tại
function liveSt(t, p) {
  const sd = t.side === "long" ? 1 : -1;
  if (!isNum(p)) return { k: "na", rank: 9, c: "", lbl: "…", txt: "Đang chờ giá" };
  if (sd * (p - t.s) <= 0) return { k: "dead", rank: 6, c: "sell", lbl: "HUỶ", txt: `Giá đã chạm cắt lỗ ${px(t.s)} – kế hoạch không còn hiệu lực` };
  if (sd * (p - t.t1) >= 0) return { k: "missed", rank: 5, c: "", lbl: "LỠ NHỊP", txt: `Giá đã tới MT1 ${px(t.t1)} – không đuổi theo, chờ cơ hội mới` };
  const rr = Math.abs(t.t1 - p) / Math.abs(p - t.s), gap = (p / t.e - 1) * 100;
  if (t.order === "limit" && sd * (p - t.e) > Math.abs(t.e) * 0.0015) return { k: "wait", rank: 2, c: "brand", lbl: "ĐẶT LỆNH CHỜ", rr, txt: `Đặt sẵn lệnh ${sd === 1 ? "mua" : "bán"} ở ${px(t.e)} – giá còn cách ${pct(Math.abs(gap), 2, false)}. Khớp được thì R:R ${nf(t.r1, 1)}` };
  if (rr >= 1.2) return { k: "go", rank: 0, c: "buy", lbl: "VÀO ĐƯỢC NGAY", rr, txt: `Vào ở giá hiện tại ${px(p)}: R:R tới MT1 ${nf(rr, 1)}${sd * (p - t.e) < 0 ? " (giá đang tốt hơn kế hoạch)" : ""}` };
  return { k: "chase", rank: 3, c: "warn", lbl: "ĐỪNG ĐUỔI", rr, txt: `Giá đã chạy – vào bây giờ R:R chỉ còn ${nf(rr, 1)}. Đặt chờ ở ${px(t.e)} hoặc bỏ qua` };
}
function rail(t, p) {
  const xs = [t.s, t.e, t.t1, t.t2, p].filter(isNum), lo = Math.min(...xs), hi = Math.max(...xs), W = (x) => ((x - lo) / (hi - lo || 1)) * 100;
  const m = (x, c, l) => `<i class="${c}" style="left:${W(x).toFixed(1)}%"><b>${l}</b></i>`;
  return `<div class="rail">${m(t.s, "s", "Cắt lỗ")}${m(t.e, "e", "Vào")}${m(t.t1, "t", "MT1")}${m(t.t2, "t", "MT2")}<i class="p" style="left:${W(p).toFixed(1)}%"></i></div>`;
}
const PLS = new Set();
function plStop(P) { P.dead = true; P.ws.forEach((w) => { try { w.onclose = null; w.close(); } catch (e) { /* bỏ qua */ } }); clearInterval(P.timer); PLS.delete(P); }
function plClose() { [...PLS].forEach(plStop); }
function liveTickets(host, items, opt = {}) {
  // items: [{t, D}] → mỗi phiếu có dải trạng thái trực tiếp ở đầu, cập nhật từng giây
  if (host._pl) plStop(host._pl);
  const PL = { ws: [], timer: null, dead: false, src: {} }; host._pl = PL; PLS.add(PL);
  const px0 = {};
  host.innerHTML = items.map(({ t }, i) => `<div class="ltk" data-i="${i}"><div class="ltk-h" id="lh${i}"></div>${ticketCard(t, { live: true })}${spotFutBox(t, i === 0)}<div class="ltk-c" id="lc${i}"><small class="faint">Đang kiểm tra xác nhận khung 15 phút…</small></div></div>`).join("");
  bindTicketSave(host);
  const head = (i) => {
    const { t } = items[i], p = px0[t.k] ?? t.price, S = liveSt(t, p), el = $("#lh" + i, host); if (!el) return;
    if (S.k === "go" && items[i].cf === false) S.txt += ". Khung 15 phút chưa xác nhận → có thể vào 1/2 khối lượng bây giờ, 1/2 còn lại khi 15 phút phá cấu trúc cùng chiều";
    if (S.k === "go" && items[i].cf === true) S.txt += ". Khung 15 phút đã xác nhận ✓";
    items[i].S = S;
    const pv = +el.dataset.p || p; el.dataset.p = p;
    el.innerHTML = `<div class="ltk-r"><span class="pill ${S.c} big">${S.lbl}</span> <b>${esc(t.k)}</b> <span class="pill ${t.side === "long" ? "buy" : "sell"}">${t.side === "long" ? "LONG" : "SHORT"}</span>
      <span class="ltk-p ${p > pv ? "up" : p < pv ? "down" : ""}">${px(p)}</span> <small class="faint">${PL.src?.[t.k] || ""}</small></div><p class="ltk-t">${esc(S.txt)}</p>${rail(t, p)}`;
  };
  const order = () => { const nodes = items.map((x, i) => [x.S?.rank ?? 9, -(x.t.evR || 0), host.querySelector(`.ltk[data-i="${i}"]`)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); nodes.forEach(([, , n]) => n && host.appendChild(n)); };
  items.forEach((_, i) => head(i));
  // giá trực tiếp: spot miniTicker, coin chỉ có perp → mark price
  const sp = items.map(({ t }) => BYK[t.k]).filter((r) => r?.sp), fu = items.map(({ t }) => BYK[t.k]).filter((r) => r && !r.sp && r.bf);
  const tick = (k, p) => { px0[k] = p; };
  if (sp.length) { try { const w = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${sp.map((r) => r.sp.toLowerCase() + "@miniTicker").join("/")}`); w.onmessage = (ev) => { const d = JSON.parse(ev.data).data; const r = sp.find((x) => x.sp === d.s); if (r) { tick(r.k, +d.c / (r.sm || 1)); PL.src[r.k] = "spot · trực tiếp"; } }; PL.ws.push(w); } catch (e) { /* bỏ qua */ } }
  if (fu.length) { try { const w = new WebSocket(`wss://fstream.binance.com/stream?streams=${fu.map((r) => r.bf.toLowerCase() + "@markPrice@1s").join("/")}`); w.onmessage = (ev) => { const d = JSON.parse(ev.data).data; const r = fu.find((x) => x.bf === d.s); if (r) { tick(r.k, +d.p / (r.bfm || 1)); PL.src[r.k] = "mark perp · trực tiếp"; } }; PL.ws.push(w); } catch (e) { /* bỏ qua */ } }
  // xác nhận khung nhỏ (15 phút) mỗi 60 giây: cấu trúc có đang cùng chiều phiếu không
  const confirm = async () => {
    for (let i = 0; i < items.length; i++) {
      if (PL.dead) return;
      const { t, D } = items[i], r = BYK[t.k], el = $("#lc" + i, host); if (!el || !r) continue;
      try {
        const [L, H] = await Promise.all([liveKlines(r, "15m", 1, 300), htfO(r, D, "1h", 300)]);
        if (!L) { el.innerHTML = `<small class="faint">Không lấy được nến 15 phút.</small>`; continue; }
        const E = rtEval(L.o, H, null, { tf1: "1h", cr: r.cr || [] }); if (!E) continue;
        const B = E[t.side], ok = E.best === t.side && B.status !== "wait";
        items[i].cf = ok;
        el.innerHTML = `<div class="ltk-cf ${ok ? "ok" : ""}"><b>${ok ? "✓ Khung 15 phút xác nhận" : "⏳ Khung 15 phút chưa xác nhận"}</b> – ${t.side === "long" ? "Long" : "Short"} ${B.score}/100 (${RTS[B.status][0]})${B.trig ? ` · ${esc(B.trig)}` : ""}${!ok && E.best !== t.side ? ` · khung nhỏ đang nghiêng ${E.best === "long" ? "Long" : "Short"} ${E[E.best].score}/100 – nên chờ` : ""}
          <small class="faint"> · ${B.chk.filter((k) => k.ok === 1).sort((a, b) => b.w - a.w).slice(0, 3).map((k) => esc(k.t)).join(" · ")}</small></div>`;
      } catch (e) { /* bỏ qua */ }
    }
  };
  confirm();
  let n = 0;
  PL.timer = setInterval(() => { if (PL.dead || !host.isConnected) { plStop(PL); return; } if (document.hidden) return; n++; items.forEach((_, i) => head(i)); if (n % 5 === 0) order(); if (n % 60 === 0) confirm(); if (opt.refresh && n % 300 === 0) opt.refresh(); }, 1000);
}

// ================================================================ CƠ HỘI GIAO DỊCH
// ================================================================ CƠ HỘI – chia làn Mua spot / Long futures / Short futures, giá & trạng thái trực tiếp
let SECT = null;
async function sectorsData() { if (!SECT) SECT = await tryLoad("data/sectors.json"); return SECT; }
const secLink = (g) => (g ? `<a class="pill tag" href="#/sector/${enc(g)}">${esc(g)}</a>` : "");
const LANES = [
  { k: "spot", t: "🟢 MUA SPOT", sub: "Long bằng tiền thật trên Binance Spot – không đòn bẩy, không bị thanh lý, không funding. Lời khi giá tăng." },
  { k: "flong", t: "🔵 LONG FUTURES", sub: "Coin không có spot Binance (hoặc muốn khoá ít vốn) – Long hợp đồng perp, đòn bẩy do hệ thống giới hạn. Lời khi giá tăng." },
  { k: "fshort", t: "🔴 SHORT FUTURES", sub: "Bán khống bằng hợp đồng perp – lời khi giá GIẢM. Chỉ làm được trên futures; luôn đặt cắt lỗ vì giá có thể tăng không giới hạn." },
];
function laneOf(x) { const r = BYK[x.k] || {}; return x.side === "short" ? "fshort" : r.spot ? "spot" : "flong"; }
function ideaMoney(x, lane) {
  const r = BYK[x.k] || {}, X = pfExposure(), acct = X && X.eq > 0 && (PF?.holdings?.length || PF?.futures?.length || PF?.cash) ? X.eq : setting("acct", 10000);
  const stopPct = Math.abs(x.e - x.s) / x.e * 100, G = levGov(r, x.side, x.tf, stopPct);
  const riskUsd = acct * G.risk / 100, q = riskUsd / Math.abs(x.e - x.s), N = q * x.e;
  const lev = lane === "spot" ? 1 : Math.min(G.cap, Math.max(1, Math.ceil(N / (0.25 * acct))));
  const ev = (x.avgR || 0) * riskUsd;
  return { acct, G, riskUsd, q, N, lev, margin: N / lev, liq: lane === "spot" ? null : liqPrice(x.side, x.e, lev, (r.mc || 0) < 1e9 ? 0.01 : 0.005), ev, win1: q * Math.abs(x.t1 - x.e), win2: q * Math.abs(x.t2 - x.e) };
}
function oppCard(x, i) {
  const r = BYK[x.k] || {}, lane = laneOf(x), L = x.side === "long", M = ideaMoney(x, lane);
  const verb = lane === "spot" ? "MUA" : L ? "LONG" : "SHORT", exitv = lane === "spot" ? "BÁN" : "ĐÓNG";
  const htf = x.htf ? `<span class="pill ${x.htf === "h+" ? "buy" : x.htf === "h-" ? "sell" : ""}">${x.htf === "h+" ? "khung lớn cùng chiều" : x.htf === "h-" ? "khung lớn ngược" : "khung lớn lẫn lộn"}</span>` : "";
  return `<div class="opp ${x.side}" data-i="${i}">
    <div class="opp-h"><span class="pill big" data-st>…</span> ${coinLink(x.k)} <span class="pill">${x.tf === "d" ? "Swing ngày" : "Lướt 4h"}</span> ${secLink(r.g)} <span class="opp-p" data-p>${px(r.p)}</span><small class="${cls(r.r1)}" data-r>${pct(r.r1, 1)}</small></div>
    <p class="opp-a"><b class="${L ? "up" : "down"}">${verb}</b> ở <b>${px(x.e)}</b> → ${exitv} <b class="up">${px(x.t1)}</b> <small>(${pct(x.t1_pct, 1)})</small> rồi <b class="up">${px(x.t2)}</b> <small>(${pct(x.t2_pct, 1)})</small> · cắt lỗ <b class="down">${px(x.s)}</b> <small>(${pct(L ? -x.risk_pct : x.risk_pct, 1)})</small></p>
    <div class="opp-k"><span><i>Xác suất MT1</i><b>${isNum(x.win1) ? nf(x.win1, 0) + "%" : "—"}</b></span><span><i>Lãi TB/lệnh</i><b class="${cls(x.avgR)}">${isNum(x.avgR) ? nf(x.avgR, 2) + "R" : "—"}</b></span><span><i>R:R</i><b>${nf(x.r1, 1)} / ${nf(x.r2, 1)}</b></span><span><i>Tới MT1</i><b>${isNum(x.d1) ? durTxt(x.d1, x.bd) : "—"}</b></span></div>
    <p class="opp-m">Vốn ${usd(M.acct)}, rủi ro ${nf(M.G.risk, 2)}% = <b>${usd2(M.riskUsd)}</b> → ${lane === "spot" ? `mua <b>${qty(M.q)} ${esc(x.k)}</b> (${usd2(M.N)})` : `perp <b>x${M.lev}</b>: ${qty(M.q)} ${esc(x.k)} (${usd2(M.N)}), ký quỹ <b>${usd2(M.margin)}</b>, thanh lý ${px(M.liq)}`}.
      Chạm MT1: <b class="up">+${usd2(M.win1)}</b> · chạm MT2: <b class="up">+${usd2(M.win2)}</b> · dính cắt lỗ: <b class="down">−${usd2(M.riskUsd)}</b> · kỳ vọng mỗi lệnh <b class="${cls(M.ev)}">${M.ev >= 0 ? "+" : ""}${usd2(M.ev)}</b></p>
    <small class="faint">${esc(x.name)} · ${nf(x.n, 0)} lần lịch sử ${htf} ${(x.notes || []).slice(0, 2).map(esc).join(" · ")}</small>
    <div class="opp-b"><a class="btn primary" href="#/plan/${enc(x.k)}" data-pl="${x.tf}|${x.side}">Lên lệnh & hướng dẫn đặt lệnh →</a><a class="btn" href="#/c/${enc(x.k)}/smc">Biểu đồ SMC</a></div></div>`;
}
const OPP = { ws: [], timer: null };
function oppClose() { OPP.ws.forEach((w) => { try { w.onclose = null; w.close(); } catch (e) { /* bỏ qua */ } }); OPP.ws = []; clearInterval(OPP.timer); OPP.timer = null; }
async function viewIdeas() {
  const [I, M, S, P] = await Promise.all([load("data/ideas.json"), tryLoad("data/market.json"), sectorsData(), tryLoad("data/pairs.json"), coins(), loadSettings(), pfLoad().catch(() => null)]);
  IDEA_NAMES = { ...IDEA_NAMES, ...(I.names || {}) };
  const L0 = await liveData();
  const fromLive = L0 && L0.ideas && new Date(L0.at) > new Date(I.at);
  const all = (fromLive ? L0.ideas : I.items).filter((x) => BYK[x.k]);
  const F = { tf: "", edge: true, g: "", sort: "ev", ...lsGet("ifilter2", {}) };
  const groups = [...new Set(all.map((x) => BYK[x.k]?.g).filter(Boolean))].sort();
  const st = I.stats || {}, reg = I.btc_up ? "up" : "down";
  const sTab = ["d", "h4"].map((tf) => Object.entries(st[tf] || {}).filter(([k]) => k !== "_all").map(([k, v]) => { const x = v[reg] || v.all || {}; return `<tr><td class="l">${TFV[tf]}</td><td class="l">${esc(IDEA_NAMES[k] || k)}</td><td>${nf(x.n, 0)}</td><td>${isNum(x.win1) ? nf(x.win1, 0) + "%" : "—"}</td><td class="${cls(x.avgR)}">${isNum(x.avgR) ? nf(x.avgR, 2) + "R" : "—"}</td><td class="${cls(x.avgR_2y)}">${isNum(x.avgR_2y) ? nf(x.avgR_2y, 2) + "R" : "—"}</td><td>${isNum(x.d1) ? durTxt(x.d1, tf === "d" ? 1 : 1 / 6) : "—"}</td></tr>`; }).join("")).join("");
  const light = M?.light || {};
  // chiến lược khác
  const carry = (M?.lists?.carry || []).slice(0, 6).map((k) => BYK[k]).filter(Boolean);
  const pok = (P?.pairs || []).filter((x) => x.ok).slice(0, 4);
  const lead = (S?.sectors || []).filter((s) => s.action?.q === "Dẫn dắt" && s.n_liq >= 3).slice(0, 4);
  const cy = M?.cycle || {};
  const more = `<div class="more">
    <div class="mo"><h4>💱 Ăn funding (carry) – gần như không rủi ro giá</h4><p>Mua spot + Short perp cùng số lượng → giá lên hay xuống đều bù trừ, anh nhận tiền funding phe Long trả mỗi 8 giờ.</p>${carry.length ? `<ul>${carry.map((r) => `<li>${coinLink(r.k, "/fut")} <b class="up">~${nf(r.car, 0)}%/năm</b> <small>funding ${f8s(r.f8)}/8h</small></li>`).join("")}</ul>` : `<p class="muted">Hiện không có coin funding đủ cao (≥ 15%/năm).</p>`}</div>
    <div class="mo"><h4>📈 Theo nhóm ngành dẫn dắt</h4><p>Tiền thường chạy theo nhóm: nhóm đang mạnh hơn BTC và còn tăng tốc → ưu tiên Long coin đứng đầu nhóm khi hồi.</p>${lead.length ? `<ul>${lead.map((s) => `<li><a href="#/sector/${enc(s.g)}"><b>${esc(s.g)}</b></a> <small>30 ngày ${pct(s.r30, 1)} · so BTC ${pct(s.rs30, 1)}</small> → ${s.top.slice(0, 3).map((k) => coinLink(k)).join(" ")}</li>`).join("")}</ul>` : `<p class="muted">Chưa có nhóm nào vừa mạnh hơn BTC vừa tăng tốc – thị trường đang thiếu nhóm dẫn dắt.</p>`}<a href="#/sectors">Xem bản đồ nhóm ngành →</a></div>
    <div class="mo"><h4>⚖️ Giao dịch cặp (trung lập thị trường)</h4><p>Long coin rẻ / Short coin đắt trong một cặp hay chạy cùng nhau, chờ chênh lệch quay về.</p>${pok.length ? `<ul>${pok.map((x) => `<li><b>${esc(x.side)}</b> <small>z ${nf(x.z, 2)} · quay về ${nf(x.win, 0)}% · ${x.n} lần</small></li>`).join("")}</ul>` : `<p class="muted">Không có cặp nào đạt chuẩn lúc này.</p>`}<a href="#/pairs">Xem cặp coin →</a></div>
    <div class="mo"><h4>⚡ Lướt khung ngắn (phút – giờ)</h4><p>Radar quét trực tiếp 20–80 coin theo SMC + chỉ báo + khung lớn, báo khi coin chuyển sang VÀO ĐƯỢC.</p><a class="btn" href="#/radar">Mở Radar →</a></div>
    <div class="mo"><h4>🧱 Tích luỹ BTC dài hạn</h4><p>MVRV ${nf(cy.mvrv, 2)} (${esc(cy.mvrv_zone || "")}). ${cy.mvrv < 1.5 ? "Vùng rẻ lịch sử – mua đều (DCA) hằng tuần là chiến lược có xác suất cao nhất." : cy.mvrv > 3 ? "Vùng đắt lịch sử – ngừng mua thêm, chốt lời dần phần dài hạn." : "Vùng trung tính – mua đều phần nhỏ, giữ tiền mặt chờ vùng rẻ."}</p><a href="#/">Xem định giá BTC →</a></div></div>`;
  app().innerHTML = `<div class="ph"><h1>Cơ hội kiếm lời – vào lệnh gì lúc này</h1><span class="meta">${fromLive ? "thiết lập cập nhật " + etaTxt(L0.at.slice(0, 16)) : "cập nhật " + etaTxt(I.at.slice(0, 16))} · giá trực tiếp từng giây <span class="live-dot"></span></span></div>
    <section class="panel hero light-${light.color || ""}"><div class="opp-sum" id="oSum"></div></section>
    <div class="filters"><div class="field"><label>Kiểu đánh</label><select id="iT"><option value="">Swing + lướt</option><option value="d" ${F.tf === "d" ? "selected" : ""}>Swing – khung ngày (giữ vài ngày–tuần)</option><option value="h4" ${F.tf === "h4" ? "selected" : ""}>Lướt – khung 4h (giữ vài giờ–ngày)</option></select></div>
      <div class="field"><label>Nhóm ngành</label><select id="iG"><option value="">Tất cả</option>${groups.map((g) => `<option ${F.g === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></div>
      <div class="field"><label>Xếp theo</label><select id="iO"><option value="ev" ${F.sort === "ev" ? "selected" : ""}>Kỳ vọng lãi</option><option value="win" ${F.sort === "win" ? "selected" : ""}>Xác suất chạm MT1</option><option value="near" ${F.sort === "near" ? "selected" : ""}>Gần điểm vào nhất</option></select></div>
      <label class="chk"><input type="checkbox" id="iE" ${F.edge ? "checked" : ""}> Chỉ thiết lập có lợi thế lịch sử</label></div>
    <div class="lanes" id="lanes"></div>
    ${panel("🧭 Ngoài vào lệnh theo tín hiệu, anh còn có thể kiếm lời bằng", more)}
    <details class="panel"><summary>Thiết lập nào thực sự có lợi thế? (BTC ${I.btc_up ? "trên" : "dưới"} MA200 – bấm để xem)</summary><div class="tw"><table><thead><tr><th class="l">Khung</th><th class="l">Thiết lập</th><th>Số lần</th><th>Chạm MT1</th><th>Lãi TB/lệnh</th><th>2 năm gần nhất</th><th>Tới MT1</th></tr></thead><tbody>${sTab}</tbody></table></div>
      <p class="faint" style="font-size:.74rem">1R = khoảng từ điểm vào tới cắt lỗ. Lãi TB 0,2R = mỗi lần rủi ro $100 thì trung bình lãi $20 sau phí. "Có lợi thế" = kỳ vọng dương trên ≥ 100 lần, vẫn dương ở 2 năm gần nhất và ở đúng trạng thái khung lớn hiện tại.</p></details>
    <p class="faint disclaimer">Tín hiệu từ quy tắc cố định & thống kê quá khứ – không phải lời khuyên đầu tư, không đảm bảo kết quả. Luôn đặt cắt lỗ trên sàn.</p>`;
  let xs = [];
  const draw = () => {
    oppClose();
    xs = all.filter((x) => (!F.tf || x.tf === F.tf) && (!F.edge || x.edge) && (!F.g || BYK[x.k]?.g === F.g));
    const seen = new Set(); xs = xs.filter((x) => { const k = x.k + x.side + x.tf; if (seen.has(k)) return false; seen.add(k); return true; });
    const lp = (x) => BYK[x.k]?.p ?? x.e;
    xs.sort((a, b) => F.sort === "win" ? (b.win1 || 0) - (a.win1 || 0) : F.sort === "near" ? Math.abs(lp(a) / a.e - 1) - Math.abs(lp(b) / b.e - 1) : (b.avgR || 0) - (a.avgR || 0));
    xs = xs.slice(0, 60);
    $("#lanes").innerHTML = LANES.map((ln) => { const L = xs.map((x, i) => [x, i]).filter(([x]) => laneOf(x) === ln.k);
      return `<section class="lane lane-${ln.k}"><div class="lane-h"><h2>${ln.t} <small>${L.length}</small></h2><p>${ln.sub}</p></div>${L.length ? L.map(([x, i]) => oppCard(x, i)).join("") : `<p class="muted lane-e">Không có cơ hội ${F.edge ? "có lợi thế " : ""}ở làn này lúc này – không vào cũng là quyết định đúng.</p>`}</section>`; }).join("");
    $$("[data-pl]").forEach((a) => a.onclick = () => { const [tf, sd] = a.dataset.pl.split("|"); lsSet("pltf", tf); lsSet("plside", sd); });
    // giá trực tiếp
    const px0 = {};
    const sp = [...new Set(xs.map((x) => BYK[x.k]).filter((r) => r?.sp))], fu = [...new Set(xs.map((x) => BYK[x.k]).filter((r) => r && !r.sp && r.bf))];
    const chunk = (a, n) => a.reduce((o, x, i) => { (o[Math.floor(i / n)] = o[Math.floor(i / n)] || []).push(x); return o; }, []);
    chunk(sp, 60).forEach((g) => { try { const w = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${g.map((r) => r.sp.toLowerCase() + "@miniTicker").join("/")}`); w.onmessage = (ev) => { const d = JSON.parse(ev.data).data, r = g.find((y) => y.sp === d.s); if (r) { px0[r.k] = +d.c / (r.sm || 1); r.r1 = (+d.c / +d.o - 1) * 100; } }; OPP.ws.push(w); } catch (e) { /* bỏ qua */ } });
    chunk(fu, 60).forEach((g) => { try { const w = new WebSocket(`wss://fstream.binance.com/stream?streams=${g.map((r) => r.bf.toLowerCase() + "@markPrice@1s").join("/")}`); w.onmessage = (ev) => { const d = JSON.parse(ev.data).data, r = g.find((y) => y.bf === d.s); if (r) px0[r.k] = +d.p / (r.bfm || 1); }; OPP.ws.push(w); } catch (e) { /* bỏ qua */ } });
    const tick = () => {
      if (!$("#lanes")) { oppClose(); return; }
      if (document.hidden) return;
      const cnt = { go: 0, wait: 0, chase: 0 }, top = [];
      $$(".opp").forEach((el) => {
        const x = xs[+el.dataset.i], r = BYK[x.k] || {}, p = px0[x.k] ?? r.p;
        const t = { side: x.side, e: x.e, s: x.s, t1: x.t1, t2: x.t2, r1: x.r1, order: "market" }, S = liveSt(t, p);
        const sEl = $("[data-st]", el); if (sEl._k !== S.k) { sEl.textContent = S.lbl; sEl.className = `pill big ${S.c}`; sEl.title = S.txt; sEl._k = S.k; el.classList.toggle("dim", ["dead", "missed"].includes(S.k)); }
        const pe = $("[data-p]", el), t2 = px(p); if (pe.textContent !== t2) { pe.classList.toggle("up", p > (pe._v || p)); pe.classList.toggle("down", p < (pe._v || p)); pe.textContent = t2; pe._v = p; }
        const re = $("[data-r]", el), t3 = pct(r.r1, 1); if (re.textContent !== t3) { re.textContent = t3; re.className = cls(r.r1); }
        if (S.k in cnt) cnt[S.k]++;
        if (S.k === "go") top.push([x, S]);
      });
      const nL = xs.filter((x) => laneOf(x) === "spot").length, nF = xs.filter((x) => laneOf(x) === "flong").length, nS = xs.filter((x) => laneOf(x) === "fshort").length;
      top.sort((a, b) => (b[0].avgR || 0) - (a[0].avgR || 0));
      { const sk = new Set(); for (let j = top.length - 1; j >= 0; j--) { } top.splice(0, top.length, ...top.filter(([x]) => (sk.has(x.k) ? false : sk.add(x.k)))); }
      $("#oSum").innerHTML = `<div class="os-g"><div><i>Đèn thị trường</i><b>${LIGHT_VI[light.color] || "—"}</b><small>${esc(light.text || "")}</small></div><div><i>BTC</i><b>${I.btc_up ? "trên MA200" : "dưới MA200"}</b><small>${I.btc_up ? "ưu tiên Long" : "ưu tiên phòng thủ / Short"}</small></div>
        <div><i>Mua spot</i><b class="up">${nL}</b></div><div><i>Long futures</i><b class="brand">${nF}</b></div><div><i>Short futures</i><b class="down">${nS}</b></div><div><i>Vào được ngay</i><b class="up">${cnt.go}</b><small>${cnt.chase} đã chạy xa · đừng đuổi</small></div></div>
        ${top.length ? `<p class="os-top">👉 <b>Nên làm ngay:</b> ${top.slice(0, 3).map(([x]) => `<a href="#/plan/${enc(x.k)}" data-pl="${x.tf}|${x.side}"><b class="${x.side === "long" ? "up" : "down"}">${laneOf(x) === "spot" ? "Mua spot" : x.side === "long" ? "Long" : "Short"} ${esc(x.k)}</b></a> <small>(${nf(x.win1, 0)}% · ${nf(x.avgR, 2)}R)</small>`).join(" · ")}</p>` : `<p class="os-top">Chưa có lệnh nào ở trạng thái vào được ngay – đặt lệnh chờ theo các thẻ bên dưới hoặc đứng ngoài.</p>`}`;
      $$("#oSum [data-pl]").forEach((a) => a.onclick = () => { const [tf, sd] = a.dataset.pl.split("|"); lsSet("pltf", tf); lsSet("plside", sd); });
    };
    tick(); OPP.timer = setInterval(tick, 1000);
  };
  [["#iT", "tf"], ["#iG", "g"], ["#iO", "sort"]].forEach(([id, k]) => $(id).onchange = (e) => { F[k] = e.target.value; lsSet("ifilter2", F); draw(); });
  $("#iE").onchange = (e) => { F.edge = e.target.checked; lsSet("ifilter2", F); draw(); };
  draw();
}

// ================================================================ NHÓM NGÀNH
const QCOL = { "Dẫn dắt": "buy", "Cải thiện": "brand", "Suy yếu": "warn", "Tụt hậu": "sell" };
function rrg(S, W = 760, H = 380) {
  const xs = S.filter((s) => isNum(s.rs30) && isNum(s.mom));
  if (!xs.length) return `<p class="muted">Chưa đủ dữ liệu.</p>`;
  const q80 = (arr) => { const v = arr.map(Math.abs).sort((p, q) => p - q); return v[Math.floor(v.length * 0.8)] || 1; };
  const ax = Math.max(5, q80(xs.map((s) => s.rs30)) * 1.6), ay = Math.max(3, q80(xs.map((s) => s.mom)) * 1.6);
  const cl = (v, m) => Math.max(-m * 0.97, Math.min(m * 0.97, v));
  const X = (v) => W / 2 + (cl(v, ax) / ax) * (W / 2 - 30), Y = (v) => H / 2 - (cl(v, ay) / ay) * (H / 2 - 24), mx = Math.sqrt(Math.max(...xs.map((s) => s.mc || 1)));
  let s = `<svg class="svgchart rrg" viewBox="0 0 ${W} ${H}">`;
  [[W / 2, 0, "Cải thiện", css("--brand")], [W / 2, H / 2, "Dẫn dắt", css("--up")], [0, H / 2, "Tụt hậu", css("--down")], [0, 0, "Suy yếu", css("--ref")]].forEach(([x0, y0, t, c], i) => {
    const qx = i === 0 ? 0 : i === 1 ? W / 2 : i === 2 ? 0 : W / 2, qy = i === 0 ? 0 : i === 1 ? 0 : i === 2 ? H / 2 : H / 2;
    const lab = ["Cải thiện", "Dẫn dắt", "Tụt hậu", "Suy yếu"][i], col = [css("--brand"), css("--up"), css("--down"), css("--ref")][i];
    s += `<rect x="${qx}" y="${qy}" width="${W / 2}" height="${H / 2}" fill="${col}" opacity=".06"/><text x="${qx + (i % 2 ? W / 2 - 8 : 8)}" y="${qy + (i < 2 ? 16 : H / 2 - 8)}" text-anchor="${i % 2 ? "end" : "start"}" style="fill:${col};font-weight:600;font-size:12px">${lab}</text>`;
  });
  s += `<line x1="${W / 2}" x2="${W / 2}" y1="0" y2="${H}" stroke="var(--line)"/><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--line)"/>
    <text x="${W - 6}" y="${H / 2 + 14}" text-anchor="end">mạnh hơn BTC 30 ngày →</text><text x="${W / 2 + 6}" y="${H - 6}">↑ đang tăng tốc / ↓ đang chậm lại (7 ngày)</text>`;
  xs.forEach((q) => { const c = css("--" + ({ "Dẫn dắt": "up", "Cải thiện": "brand", "Suy yếu": "ref", "Tụt hậu": "down" }[q.action?.q] || "ink-3"));
    const tr = (q.trail || []).filter((t) => isNum(t[0]) && isNum(t[1]));
    if (tr.length > 1) s += `<polyline fill="none" stroke="${c}" stroke-opacity=".45" stroke-width="1.5" points="${tr.map((t) => `${X(t[0])},${Y(t[1])}`).join(" ")}"/>`;
    const rad = 4 + Math.sqrt(q.mc || 1) / mx * 14;
    s += `<a href="#/sector/${enc(q.g)}"><circle cx="${X(q.rs30)}" cy="${Y(q.mom)}" r="${rad.toFixed(1)}" fill="${c}" fill-opacity=".55" stroke="${c}"><title>${esc(q.g)}: so BTC 30 ngày ${pct(q.rs30, 1)}, đà ${nf(q.mom, 1)}</title></circle><text x="${X(q.rs30) + rad + 3}" y="${Y(q.mom) + 4}" style="font-size:11px;fill:var(--ink)">${esc(q.g)}</text></a>`; });
  return s + `</svg>`;
}
async function viewSectors() {
  const [S] = await Promise.all([sectorsData(), coins()]);
  if (!S) throw new Error("Chưa có dữ liệu nhóm ngành – chờ lượt cập nhật đầy đủ kế tiếp");
  const L = S.sectors.filter((s) => s.series?.length && s.n_liq >= 2 && s.g !== "Khác");
  let rng = lsGet("secrng", 90), sort = lsGet("secsort", "rs30");
  app().innerHTML = `<div class="ph"><h1>Nhóm ngành crypto</h1><span class="meta">${L.length} nhóm · chỉ số giá theo vốn hoá của coin giao dịch được · cập nhật ${esc(new Date(S.at).toLocaleString("vi-VN"))}</span></div>
    <div class="note"><p>Tiền trong crypto chạy theo <b>nhóm câu chuyện</b> (AI, Meme, Layer 1, DeFi…). Khi một nhóm mạnh hơn BTC và còn tăng tốc, coin trong nhóm thường cùng tăng; khi nhóm hụt hơi, cả nhóm cùng giảm. Trang này cho anh biết từng nhóm làm gì, kiếm tiền từ đâu, đang mạnh hay yếu, và nên làm gì.</p></div>
    <div class="g g2w">${panel("🔄 Bản đồ luân chuyển dòng tiền", rrg(L) + `<p class="faint" style="font-size:.72rem">Trục ngang: nhóm tăng hơn (phải) hay kém (trái) BTC trong 30 ngày. Trục dọc: lợi thế đó đang tăng thêm (trên) hay giảm đi (dưới) trong 7 ngày. Vệt mờ = đường đi 3 tuần qua. Vòng quay điển hình: Cải thiện → Dẫn dắt → Suy yếu → Tụt hậu. Bong bóng càng to vốn hoá càng lớn.</p>`)}
      ${panel("📊 Hiệu suất các nhóm", `<div class="tw"><table class="sect"><thead><tr><th class="l">Nhóm</th><th>7 ngày</th><th>30 ngày</th><th>90 ngày</th><th>So BTC 30n</th><th class="l">Trạng thái</th></tr></thead><tbody>${L.slice().sort((a, b) => (b.rs30 ?? -999) - (a.rs30 ?? -999)).map((s) => `<tr><td class="l"><a href="#/sector/${enc(s.g)}"><b>${esc(s.g)}</b></a></td><td class="${cls(s.r7)}">${pct(s.r7, 1)}</td><td class="${cls(s.r30)}">${pct(s.r30, 1)}</td><td class="${cls(s.r90)}">${pct(s.r90, 0)}</td><td class="${cls(s.rs30)}"><b>${pct(s.rs30, 1)}</b></td><td class="l">${pill(esc(s.action?.q || "—"), QCOL[s.action?.q] || "")}</td></tr>`).join("")}</tbody></table></div>`)}</div>
    ${panel("📈 Chỉ số giá các nhóm lớn so với BTC", `<span class="seg" id="srg">${[30, 90, 365].map((d) => `<button data-d="${d}" class="${d === rng ? "on" : ""}">${d === 365 ? "1 năm" : d + " ngày"}</button>`).join("")}</span><div id="smc2"></div>`)}
    <div class="ph" style="margin-top:14px"><h2>Từng nhóm</h2><span class="meta"><span class="seg" id="sso">${[["rs30", "Mạnh nhất so BTC"], ["mc", "Vốn hoá"], ["r7", "7 ngày"], ["vflow", "Tiền đổ vào"]].map(([k, n]) => `<button data-k="${k}" class="${k === sort ? "on" : ""}">${n}</button>`).join("")}</span></span></div>
    <div class="secs" id="secs"></div>`;
  const drawC = () => { const big = L.slice().sort((a, b) => (b.mc || 0) - (a.mc || 0)).slice(0, 8), pal = ["--brand", "--up", "--floor", "--ceil", "--down", "--ref", "--ink-2", "--l-yellow"];
    const ser = big.map((s, i) => { const z = s.series.slice(-rng - 1), b0 = z[0][1]; return { name: s.g, color: css(pal[i]) || css("--ink-3"), pts: z.map(([d, a]) => ({ x: fmtD(d), y: (a / b0 - 1) * 100 })) }; });
    const z = L[0].series.slice(-rng - 1), c0 = z[0][3]; ser.push({ name: "BTC", color: css("--ink"), width: 2.4, dash: "5 3", pts: z.map(([d, , , c]) => ({ x: fmtD(d), y: (c / c0 - 1) * 100 })) });
    $("#smc2").innerHTML = lineSvg(ser, { h: 260, dec: 0, zero: true, fmt: (v) => nf(v, 0) + "%" }); };
  const drawS = () => { const xs = L.slice().sort((a, b) => (b[sort] ?? -1e18) - (a[sort] ?? -1e18));
    $("#secs").innerHTML = xs.map((s) => `<a class="sec" href="#/sector/${enc(s.g)}"><div class="sec-h"><b>${esc(s.g)}</b>${pill(esc(s.action?.q || "—"), QCOL[s.action?.q] || "")}</div>
      <p class="sec-w">${esc(s.info.what)}</p>${spark(s.series.slice(-90).map((x) => x[1]), { w: 260, h: 38 })}
      <div class="sec-k"><span><i>7n</i><b class="${cls(s.r7)}">${pct(s.r7, 1)}</b></span><span><i>30n</i><b class="${cls(s.r30)}">${pct(s.r30, 1)}</b></span><span><i>So BTC</i><b class="${cls(s.rs30)}">${pct(s.rs30, 1)}</b></span><span><i>Đang tăng</i><b>${isNum(s.breadth) ? nf(s.breadth, 0) + "%" : "—"}</b></span><span><i>Tiền vào</i><b class="${cls(s.vflow)}">${pct(s.vflow, 0)}</b></span><span><i>Vốn hoá</i><b>${usd(s.mc)}</b></span><span><i>Beta</i><b>${nf(s.beta, 1)}</b></span><span><i>Biến động</i><b>${isNum(s.volat) ? nf(s.volat, 0) + "%" : "—"}</b></span><span><i>Funding</i><b class="${f8c(s.f8)}">${isNum(s.f8) ? nf(s.f8 * 100, 1) + "‱" : "—"}</b></span><span><i>Cơ hội</i><b>${s.ideas_long ? `<span class="up">${s.ideas_long}L</span> ` : ""}${s.ideas_short ? `<span class="down">${s.ideas_short}S</span>` : ""}${!s.ideas_long && !s.ideas_short ? "0" : ""}</b></span></div>
      <p class="sec-a">${esc(s.action?.head || "")}</p><div class="sec-t">${s.top.slice(0, 6).map((k) => `<span>${esc(k)}</span>`).join("")}</div></a>`).join(""); };
  $$("#srg button").forEach((b) => b.onclick = () => { rng = +b.dataset.d; lsSet("secrng", rng); $$("#srg button").forEach((x) => x.classList.toggle("on", x === b)); drawC(); });
  $$("#sso button").forEach((b) => b.onclick = () => { sort = b.dataset.k; lsSet("secsort", sort); $$("#sso button").forEach((x) => x.classList.toggle("on", x === b)); drawS(); });
  drawC(); drawS();
}

function secMore(s, mem) {
  const tbl = (head, rows) => `<div class="tw"><table><thead><tr>${head.map((h, i) => `<th class="${i ? "" : "l"}">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${head.length}" class="muted">—</td></tr>`}</tbody></table></div>`;
  const D = s.desc || {}, tops = s.top.slice(0, 9).map((k) => BYK[k]).filter(Boolean);
  const cards = `<div class="cdesc">${tops.map((r) => `<a class="cd" href="#/c/${enc(r.k)}"><div class="cd-h"><b>${esc(r.k)}</b><small>${esc(r.n || "")}</small><span class="${cls(r.r1)}">${pct(r.r1, 1)}</span></div>
    <p>${esc(D[r.k] || "Chưa có mô tả – bấm để xem phân tích coin.")}</p><div class="cd-k"><span>${usd(r.mc)}</span><span class="${cls(r.r30)}">30n ${pct(r.r30, 0)}</span>${tsPill(r.ts, r.td)}${vdPill(r.vd)}</div></a>`).join("")}</div>`;
  const vdT = Object.entries(s.vd || {}).sort((a, b) => b[1] - a[1]), vdN = vdT.reduce((x, [, n]) => x + n, 0) || 1;
  const vdBar = vdT.length ? `<div class="vdbar">${vdT.map(([k, n]) => `<i class="${VD_CLS[k] || ""}" style="flex:${n}" title="${esc(k)}: ${n} coin">${n / vdN > 0.12 ? esc(k) + " " + n : ""}</i>`).join("")}</div>` : "";
  const st = (s.setups || []).slice(0, 8).map((q) => `<tr><td class="l">${TFV[q.tf]} · ${esc(IDEA_NAMES[q.setup] || q.setup)}</td><td>${nf(q.n, 0)}</td><td>${nf(q.win1, 0)}%</td><td class="${cls(q.avgR)}"><b>${nf(q.avgR, 2)}R</b></td><td class="${cls(q.avgR_2y)}">${isNum(q.avgR_2y) ? nf(q.avgR_2y, 2) + "R" : "—"}</td><td>${isNum(q.d1) ? durTxt(q.d1, q.tf === "d" ? 1 : 1 / 6) : "—"}</td></tr>`);
  const lst = (arr, f) => `<div class="rows">${(arr || []).map((x) => coinMini(x[0], f(x))).join("") || `<p class="muted">—</p>`}</div>`;
  return `${panel(`Coin tiêu biểu trong nhóm – làm gì?`, cards)}
    <div class="g g2">${panel("🎮 Cách đánh nhóm này", `<p class="play">${esc(s.info?.play || "")}</p><h4 class="sub">Thiết lập kỹ thuật hiệu quả nhất với nhóm (kiểm chứng lịch sử)</h4>${tbl(["Thiết lập", "Số lần", "Chạm MT1", "Lãi TB", "2 năm gần", "Tới MT1"], st)}<p class="faint" style="font-size:.72rem">Gộp mọi coin trong nhóm, đã trừ phí. Chỉ tin thiết lập có lãi TB dương ở cả cột "2 năm gần".</p>`)}
      ${panel("💰 Định giá & dòng tiền thật", `${vdBar}<h4 class="sub">Rẻ nhất theo P/S (vốn hoá / doanh thu năm)</h4>${tbl(["Coin", "P/S", "Doanh thu 30 ngày"], (s.cheap || []).map(([k, ps, rv]) => `<tr><td class="l">${coinLink(k)}</td><td><b>${nf(ps, 1)}</b></td><td>${rv ? usd(rv) : "—"}</td></tr>`))}<h4 class="sub">Doanh thu lớn nhất 30 ngày</h4>${tbl(["Coin", "Doanh thu"], (s.revtop || []).map(([k, rv]) => `<tr><td class="l">${coinLink(k)}</td><td>${usd(rv)}</td></tr>`))}`)}</div>
    <div class="g g4">${panel("🚀 Mạnh nhất 7 ngày", lst(s.best7, ([, v]) => `<small class="${cls(v)}">${pct(v, 1)}</small>`))}${panel("🩸 Yếu nhất 7 ngày", lst(s.worst7, ([, v]) => `<small class="${cls(v)}">${pct(v, 1)}</small>`))}
      ${panel("📊 OI futures lớn nhất", lst(s.oi_top, ([, oi, o7]) => `<small>${usd(oi)} · 7n <b class="${cls(o7)}">${pct(o7, 0)}</b></small>`))}${panel("🔓 Mở khoá 90 ngày tới", lst(s.unl, ([, u]) => `<small class="${u >= 3 ? "down" : ""}">${nf(u, 1)}% lưu hành</small>`))}</div>
    ${(s.trend_up || []).length ? panel("✅ Coin trong nhóm đang xu hướng tăng (khung ngày)", `<div class="chips">${s.trend_up.map((k) => coinLink(k)).join("")}</div>`) : ""}`;
}
async function viewSector(g) {
  const [S, I] = await Promise.all([sectorsData(), tryLoad("data/ideas.json"), coins()]);
  const s = (S?.sectors || []).find((x) => x.g === g);
  if (!s) { app().innerHTML = `<div class="empty">Không có nhóm “${esc(g)}”. <a href="#/sectors">Về danh sách nhóm</a></div>`; return; }
  if (I?.names) IDEA_NAMES = { ...IDEA_NAMES, ...I.names };
  let rng = lsGet("secrng1", 365);
  const In = s.info || {}, A = s.action || {};
  const mem = s.members.map((k) => BYK[k]).filter(Boolean);
  const ideasHere = (I?.items || []).filter((x) => x.edge && BYK[x.k]?.g === g);
  app().innerHTML = `<div class="ph"><h1>${esc(g)} <small>${s.n} coin · ${s.n_liq} coin thanh khoản</small></h1><span class="meta">${pill(esc(A.q || "—"), QCOL[A.q] || "")} · <a href="#/sectors">tất cả nhóm</a></span></div>
    <section class="panel hero"><p class="sec-ah">${esc(A.head || "")}</p><ul class="why">${(A.lines || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
    <div class="g g2w">
      ${panel("Chỉ số giá nhóm", `<span class="seg" id="srg1">${[30, 90, 365].map((d) => `<button data-d="${d}" class="${d === rng ? "on" : ""}">${d === 365 ? "1 năm" : d + " ngày"}</button>`).join("")}</span><div id="sch"></div><p class="faint" style="font-size:.72rem">Theo vốn hoá = coin lớn nặng ký hơn · Bình quân = mỗi coin như nhau (phản ánh coin nhỏ trong nhóm) · BTC để so sánh. Chỉ tính coin giao dịch được trên Binance / sàn futures.</p>`)}
      ${panel("Nhóm này là gì?", `<dl class="secinfo"><dt>Là gì</dt><dd>${esc(In.what)}</dd><dt>Sản phẩm / dịch vụ</dt><dd>${esc(In.product)}</dd><dt>Kiếm tiền từ đâu · token được gì</dt><dd>${esc(In.money)}</dd><dt>Điều làm giá chạy</dt><dd>${esc(In.drivers)}</dd><dt>Rủi ro chính</dt><dd>${esc(In.risks)}</dd></dl>`)}</div>
    ${panel("Số liệu nhóm", kpis([["Vốn hoá", usd(s.mc)], ["Tỷ trọng thị trường", isNum(s.share) ? nf(s.share, 2) + "%" : "—"], ["KL 24h", usd(s.vol)],
      ["Beta với BTC (trung vị)", nf(s.beta, 2), "", "BTC tăng/giảm 1% thì coin trong nhóm thường tăng/giảm bấy nhiêu %"], ["Biến động năm hoá", isNum(s.volat) ? nf(s.volat, 0) + "%" : "—"], ["Tương quan với BTC", nf(s.corr, 2)], ["Biến động ngày (ATR)", isNum(s.atr) ? nf(s.atr, 1) + "%" : "—"],
      ["Mở khoá 90 ngày tới", isNum(s.u90) ? nf(s.u90, 2) + "% vốn hoá" : "—", s.u90 >= 2 ? "down" : ""], ["7 ngày", pct(s.r7, 1), cls(s.r7)], ["30 ngày", pct(s.r30, 1), cls(s.r30)], ["90 ngày", pct(s.r90, 0), cls(s.r90)], ["1 năm", pct(s.r365, 0), cls(s.r365)],
      ["So BTC 30 ngày", pct(s.rs30, 1), cls(s.rs30)], ["So BTC 90 ngày", pct(s.rs90, 1), cls(s.rs90)], ["Cách đỉnh 1 năm", pct(s.dd, 0), "down"], ["Coin đang tăng", isNum(s.breadth) ? `${nf(s.breadth, 0)}%` : "—", "", `${s.up} tăng · ${s.dn} giảm`],
      ["Khối lượng 7n vs 30n", pct(s.vflow, 0), cls(s.vflow)], ["Thị phần khối lượng", isNum(s.vshare7) ? nf(s.vshare7, 1) + "%" : "—", "", `30 ngày trước: ${nf(s.vshare30, 1)}%`], ["OI futures", usd(s.oi)], ["OI 7 ngày", pct(s.oi7, 0), cls(s.oi7)], ["Funding TB", f8s(s.f8), f8c(s.f8)],
      ["P/S trung vị", isNum(s.ps_med) ? nf(s.ps_med, 1) : "—", "", "Vốn hoá / doanh thu năm hoá – chỉ coin có doanh thu đo được"], ["Doanh thu 30 ngày", s.rev30 ? usd(s.rev30) : "—", "", `Phí người dùng trả 30 ngày: ${usd(s.fees30)}`]]))}
    ${secMore(s, mem)}
    ${ideasHere.length ? panel(`🎯 Cơ hội có lợi thế trong nhóm ${esc(g)}`, `<div class="rows">${ideasHere.slice(0, 10).map((x) => coinMini(x.k, `<span class="pill ${x.side === "long" ? "buy" : "sell"}">${x.side === "long" ? (BYK[x.k]?.spot ? "Mua spot" : "Long") : "Short"}</span> <small>${x.tf === "d" ? "ngày" : "4h"} · MT1 ${pct(x.t1_pct, 1)} · ${nf(x.win1, 0)}% · ${nf(x.avgR, 2)}R</small>`)).join("")}</div>`, `<a href="#/ideas">tất cả cơ hội</a>`) : ""}
    ${panel(`Các coin trong nhóm (${mem.length})`, `<div class="tw"><table><thead><tr><th class="l">Coin</th><th>Giá</th><th>24h</th><th>7 ngày</th><th>30 ngày</th><th>90 ngày</th><th>Vốn hoá</th><th>Xu hướng</th><th class="l">Định giá</th><th>Funding</th><th class="l">Giao dịch</th></tr></thead><tbody>${mem.map((r) => `<tr><td class="l">${coinLink(r.k)}</td><td>${px(r.p)}</td><td class="${cls(r.r1)}">${pct(r.r1, 1)}</td><td class="${cls(r.r7)}">${pct(r.r7, 1)}</td><td class="${cls(r.r30)}">${pct(r.r30, 0)}</td><td class="${cls(r.r90)}">${pct(r.r90, 0)}</td><td>${usd(r.mc)}</td><td>${tsPill(r.ts, r.td)}</td><td class="l">${vdPill(r.vd)}</td><td class="${f8c(r.f8)}">${r.oi ? f8s(r.f8) : "—"}</td><td class="l"><small>${r.spot ? "Spot" : ""}${r.spot && r.fx ? " · " : ""}${r.fx ? "Perp" : ""}</small></td></tr>`).join("")}</tbody></table></div>`)}`;
  const drawC = () => { const z = s.series.slice(-rng - 1); if (!z.length) { $("#sch").innerHTML = `<p class="muted">Chưa đủ dữ liệu giá.</p>`; return; } const [a0, e0, c0] = [z[0][1], z[0][2], z[0][3]];
    $("#sch").innerHTML = lineSvg([{ name: `${g} (theo vốn hoá)`, color: css("--brand"), width: 2.2, pts: z.map(([d, a]) => ({ x: fmtD(d), y: (a / a0 - 1) * 100 })) }, { name: "Bình quân các coin", color: css("--floor"), pts: z.map(([d, , e]) => ({ x: fmtD(d), y: (e / e0 - 1) * 100 })) },
      { name: "BTC", color: css("--ink-3"), dash: "5 3", pts: z.map(([d, , , c]) => ({ x: fmtD(d), y: (c / c0 - 1) * 100 })) }], { h: 260, zero: true, fmt: (v) => nf(v, 0) + "%" }); };
  $$("#srg1 button").forEach((b) => b.onclick = () => { rng = +b.dataset.d; lsSet("secrng1", rng); $$("#srg1 button").forEach((x) => x.classList.toggle("on", x === b)); drawC(); });
  drawC();
}

// ================================================================ BINANCE TRỰC TIẾP – toàn bộ cặp spot + perp, cập nhật mỗi giây
const LV = { rows: new Map(), ws: [], timer: null, sort: lsGet("lvsort", { k: "qv", d: -1 }), q: "", lim: lsGet("lvlim", 60), both: false, st: { spot: "…", fut: "…" } };
function lvRow(base) { let r = LV.rows.get(base); if (!r) { r = { base, hist: [] }; LV.rows.set(base, r); } return r; }
function lvChg(r, sec) { const h = r.hist; if (!h.length || r.p == null) return null; const t0 = Date.now() / 1000 - sec; if (h[0][0] > t0 + 5) return null;
  let lo = 0, hi = h.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (h[m][0] <= t0) lo = m; else hi = m - 1; } return (r.p / h[lo][1] - 1) * 100; }
function lvPush(r, p) { const t = Date.now() / 1000; r.p = p; const h = r.hist; if (!h.length || t - h[h.length - 1][0] >= 5) { h.push([t, p]); if (h.length > 200 && h[0][0] < t - 960) h.splice(0, h.findIndex((x) => x[0] >= t - 960)); } }
function lvClose() { LV.ws.forEach((w) => { try { w.onclose = null; w.close(); } catch (e) { /* bỏ qua */ } }); LV.ws = []; clearInterval(LV.timer); LV.timer = null; }
const keyOfBase = (() => { let m = null; return (base, kind) => { if (!m) { m = { spot: {}, fut: {} }; (COINS?.rows || []).forEach((r) => { if (r.sp) m.spot[r.sp.replace(/USDT$/, "")] = r.k; if (r.bf) m.fut[r.bf.replace(/USDT$/, "")] = r.k; }); } return m[kind][base]; }; })();
async function viewLive() {
  await coins();
  lvClose();
  app().innerHTML = `<div class="ph"><h1>Binance trực tiếp</h1><span class="meta">mọi cặp USDT spot + hợp đồng vĩnh cửu USDT-M · giá từng giây, lấy thẳng từ Binance trên trình duyệt của anh
    · spot <b id="lvS">${LV.st.spot}</b> · futures <b id="lvF">${LV.st.fut}</b></span></div>
    <div class="g g3" id="lvMov"></div>
    <div class="filters"><div class="field"><label>Tìm</label><input id="lvQ" placeholder="BTC, SOL…"></div>
      <label class="chk"><input type="checkbox" id="lvB"> Chỉ cặp có cả spot và perp</label><div class="field"><label>Số cặp</label><select id="lvA"><option value="60">60 lớn nhất</option><option value="120">120</option><option value="250">250</option><option value="0">Tất cả</option></select></div>
      <small class="faint" id="lvN"></small></div>
    <div class="tw sticky" id="lvT"></div>
    <p class="faint" style="font-size:.72rem">1p / 5p / 15p = biến động trong 1, 5, 15 phút gần nhất – tính từ lúc anh mở trang (cần mở đủ lâu). Basis = giá mark perp so với giá chỉ số spot. Funding = mức kỳ tới (đa số kỳ 8 giờ). Bấm tên coin để mở phân tích (coin có trong hệ thống).</p>`;
  const set = (id, v) => { LV.st[id === "lvS" ? "spot" : "fut"] = v; const e = $("#" + id); if (e) e.innerHTML = v; };
  const ok = '<span class="up">● đang chạy</span>', bad = '<span class="down">● không kết nối được</span>';
  // ảnh chụp ban đầu
  try {
    const t = await fetchJ("https://api.binance.com/api/v3/ticker/24hr", 12000).catch(() => fetchJ("https://data-api.binance.vision/api/v3/ticker/24hr", 12000));
    t.filter((x) => x.symbol.endsWith("USDT") && +x.quoteVolume > 0).forEach((x) => { const r = lvRow(x.symbol.slice(0, -4)); r.sp = x.symbol; r.r24 = +x.priceChangePercent; r.qv = +x.quoteVolume; r.hi = +x.highPrice; r.lo = +x.lowPrice; r.o24 = +x.openPrice; lvPush(r, +x.lastPrice); });
    set("lvS", ok);
  } catch (e) { set("lvS", bad); }
  try {
    const [t, pi] = await Promise.all([fetchJ("https://fapi.binance.com/fapi/v1/ticker/24hr", 12000), fetchJ("https://fapi.binance.com/fapi/v1/premiumIndex", 12000)]);
    t.filter((x) => x.symbol.endsWith("USDT")).forEach((x) => { const r = lvRow(x.symbol.slice(0, -4)); r.fs = x.symbol; r.fp = +x.lastPrice; r.fqv = +x.quoteVolume; r.fr24 = +x.priceChangePercent; if (!r.sp) lvPush(r, +x.lastPrice); });
    pi.filter((x) => x.symbol.endsWith("USDT")).forEach((x) => { const r = lvRow(x.symbol.slice(0, -4)); r.fr = +x.lastFundingRate * 100; r.mk = +x.markPrice; r.ix = +x.indexPrice; r.nf = +x.nextFundingTime; });
    set("lvF", ok);
  } catch (e) { set("lvF", bad); }
  // nạp sẵn 15 phút gần nhất (nến 1 phút) cho ~100 cặp lớn nhất → cột 1p/5p/15p có số ngay
  (async () => {
    const top = [...LV.rows.values()].filter((r) => r.sp).sort((a, b) => (b.qv || 0) - (a.qv || 0)).slice(0, 100);
    for (let i = 0; i < top.length; i += 10) {
      if (!location.hash.startsWith("#/live")) return;
      await Promise.all(top.slice(i, i + 10).map(async (r) => {
        try { const j = await fetchJ(`https://api.binance.com/api/v3/klines?symbol=${r.sp}&interval=1m&limit=16`, 6000);
          const seed = j.map((x) => [x[0] / 1000, +x[1]]); r.hist = seed.concat(r.hist.filter((h) => h[0] > (seed[seed.length - 1]?.[0] || 0))); } catch (e) { /* bỏ qua */ }
      }));
    }
  })();
  // websocket
  const open = (url, on, id) => { try { const w = new WebSocket(url); w.onmessage = on; w.onopen = () => set(id, ok); w.onerror = () => set(id, bad); w.onclose = () => { if (location.hash.startsWith("#/live")) setTimeout(() => { if (location.hash.startsWith("#/live")) open(url, on, id); }, 5000); }; LV.ws.push(w); } catch (e) { set(id, bad); } };
  open("wss://stream.binance.com:9443/ws/!miniTicker@arr", (ev) => { const a = JSON.parse(ev.data); a.forEach((x) => { if (!x.s.endsWith("USDT")) return; const r = lvRow(x.s.slice(0, -4)); r.sp = x.s; r.o24 = +x.o; r.hi = +x.h; r.lo = +x.l; r.qv = +x.q; lvPush(r, +x.c); r.r24 = (+x.c / +x.o - 1) * 100; r.tk = Date.now(); }); }, "lvS");
  open("wss://fstream.binance.com/stream?streams=!miniTicker@arr/!markPrice@arr", (ev) => { const m = JSON.parse(ev.data); const a = m.data || [];
    if ((m.stream || "").startsWith("!markPrice")) a.forEach((x) => { if (!x.s.endsWith("USDT")) return; const r = lvRow(x.s.slice(0, -4)); r.mk = +x.p; r.ix = +x.i; r.fr = +x.r * 100; r.nf = +x.T; });
    else a.forEach((x) => { if (!x.s.endsWith("USDT")) return; const r = lvRow(x.s.slice(0, -4)); r.fs = x.s; r.fp = +x.c; r.fqv = +x.q; r.fr24 = (+x.c / +x.o - 1) * 100; if (!r.sp) { lvPush(r, +x.c); r.tk = Date.now(); } }); }, "lvF");
  $("#lvQ").oninput = (e) => { LV.q = e.target.value.trim().toUpperCase(); drawLive(true); };
  $("#lvB").onchange = (e) => { LV.both = e.target.checked; drawLive(true); };
  $("#lvA").value = String(LV.lim); $("#lvA").onchange = (e) => { LV.lim = +e.target.value; lsSet("lvlim", LV.lim); drawLive(true); };
  drawLive(true);
  let n = 0;
  LV.timer = setInterval(() => { if (!location.hash.startsWith("#/live")) { lvClose(); return; } if (document.hidden) return; n++; drawLive(n % 10 === 0); }, 1000);
}
const LVC = [["base", "Coin", "l"], ["p", "Giá"], ["c1", "1p"], ["c5", "5p"], ["c15", "15p"], ["r24", "24h"], ["rng", "Vị trí 24h"], ["qv", "KL spot 24h"], ["fqv", "KL perp 24h"], ["basis", "Basis"], ["fr", "Funding"], ["nf", "Kỳ tới"]];
function lvVals(r) {
  return { base: r.base, p: r.p, c1: lvChg(r, 60), c5: lvChg(r, 300), c15: lvChg(r, 900), r24: r.r24 ?? r.fr24, rng: r.hi > r.lo ? (r.p - r.lo) / (r.hi - r.lo) * 100 : null, qv: r.qv, fqv: r.fqv,
    basis: r.mk && r.ix ? (r.mk / r.ix - 1) * 100 : null, fr: r.fr, nf: r.nf };
}
const setc = (td, txt, c) => { if (td._t !== txt) { td.textContent = txt; td._t = txt; } if (c !== undefined && td._c !== c) { td.className = c; td._c = c; } };
function drawLive(resort) {
  const T = $("#lvT"); if (!T) return;
  const now = Date.now();
  if (resort || !T.firstChild) {
    let rows = [...LV.rows.values()].filter((r) => r.p && (!LV.q || r.base.includes(LV.q)) && (!LV.both || (r.sp && r.fs)));
    if (LV.lim && !LV.q) rows = rows.sort((a, b) => ((b.qv || 0) + (b.fqv || 0)) - ((a.qv || 0) + (a.fqv || 0))).slice(0, LV.lim);
    const { k, d } = LV.sort, val = new Map(rows.map((r) => [r.base, lvVals(r)[k]]));
    rows.sort((a, b) => { const x = val.get(a.base), y = val.get(b.base); if (k === "base") return String(x).localeCompare(String(y)) * d; if (!isNum(x) && !isNum(y)) return 0; if (!isNum(x)) return 1; if (!isNum(y)) return -1; return (x - y) * d; });
    LV.order = rows.map((r) => r.base);
    if (!T.firstChild || T._sort !== `${k}${d}`) {
      T.innerHTML = `<table class="sortable lvt"><thead><tr>${LVC.map(([c, n, l]) => `<th data-s="${c}" class="${l || ""} ${LV.sort.k === c ? "on" : ""}">${n}${LV.sort.k === c ? (LV.sort.d > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead><tbody></tbody></table>`;
      T._sort = `${k}${d}`; LV.tr = new Map();
      $$("th[data-s]", T).forEach((th) => th.onclick = () => { const c = th.dataset.s; LV.sort = { k: c, d: LV.sort.k === c ? -LV.sort.d : (c === "base" ? 1 : -1) }; lsSet("lvsort", LV.sort); drawLive(true); });
    }
    const tb = $("tbody", T), keep = new Set(LV.order);
    for (const [b, tr] of LV.tr) if (!keep.has(b)) { tr.remove(); LV.tr.delete(b); }
    LV.order.forEach((b) => {
      let tr = LV.tr.get(b);
      if (!tr) { const r = LV.rows.get(b), kk = keyOfBase(r.base, r.sp ? "spot" : "fut"); tr = document.createElement("tr"); tr.innerHTML = LVC.map(([, , l]) => `<td class="${l || ""}"></td>`).join("");
        tr.children[0].innerHTML = kk ? `<a href="#/c/${enc(kk)}"><b>${esc(r.base)}</b></a>${r.fs ? ' <small class="faint">perp</small>' : ""}` : `<b>${esc(r.base)}</b>${r.fs ? ' <small class="faint">perp</small>' : ""}${!r.sp ? ' <small class="faint">chỉ perp</small>' : ""}`;
        tr.children[6].innerHTML = `<span class="rngb"><i></i></span>`; LV.tr.set(b, tr); }
      tb.appendChild(tr);
    });
    $("#lvN").textContent = `${nf(LV.rows.size, 0)} cặp đang theo dõi · hiện ${LV.order.length}`;
  }
  for (const b of LV.order || []) {
    const tr = LV.tr.get(b), r = LV.rows.get(b); if (!tr || !r) continue;
    const v = lvVals(r), td = tr.children;
    setc(td[1], px(v.p), r.tk && now - r.tk < 1200 ? "flash" : "");
    [[2, "c1", 2], [3, "c5", 2], [4, "c15", 2], [5, "r24", 1]].forEach(([i, c, dd]) => setc(td[i], isNum(v[c]) ? pct(v[c], dd) : "—", cls(v[c]) + (Math.abs(v[c] || 0) >= (c === "c1" ? 1 : c === "c5" ? 2 : 4) ? " lvbig" : "")));
    const ri = td[6].firstChild?.firstChild; if (ri && isNum(v.rng)) { const l = Math.max(0, Math.min(100, v.rng)).toFixed(0) + "%"; if (ri.style.left !== l) ri.style.left = l; }
    setc(td[7], usd(v.qv)); setc(td[8], usd(v.fqv));
    setc(td[9], isNum(v.basis) ? pct(v.basis, 3) : "—", cls(v.basis));
    setc(td[10], isNum(v.fr) ? f8s(v.fr) : "—", f8c(v.fr));
    setc(td[11], v.nf ? (() => { const m = Math.max(0, Math.round((v.nf - now) / 60000)); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; })() : "—");
  }
  // biến động mạnh (10 giây/lần)
  const mv = $("#lvMov");
  if (mv && (resort || !mv.firstChild)) {
    const all = [...LV.rows.values()].filter((r) => r.p && ((r.qv || 0) + (r.fqv || 0)) > 3e6).map((r) => [r, lvChg(r, 300)]);
    const top = (arr, n = 8) => arr.filter(([, x]) => isNum(x)).sort((a, b) => b[1] - a[1]).slice(0, n);
    const box = (title, L, dd = 2) => panel(title, L.length ? `<div class="rows">${L.map(([r, x]) => { const k = keyOfBase(r.base, r.sp ? "spot" : "fut"); return `<a class="row" ${k ? `href="#/c/${enc(k)}"` : ""}><div class="rm"><b>${esc(r.base)}</b></div><div class="rv"><span>${px(r.p)}</span></div><div class="rx ${cls(x)}">${pct(x, dd)}</div></a>`; }).join("")}</div>` : `<p class="muted">Đang tích luỹ dữ liệu…</p>`);
    const fr = [...LV.rows.values()].filter((r) => isNum(r.fr) && (r.fqv || 0) > 3e6).map((r) => [r, r.fr]);
    mv.innerHTML = box("⚡ Tăng mạnh 5 phút", top(all)) + box("⚡ Giảm mạnh 5 phút", top(all.map(([r, x]) => [r, x == null ? null : -x])).map(([r, x]) => [r, -x])) + box("🔥 Funding cao nhất / thấp nhất", top(fr, 4).concat(top(fr.map(([r, x]) => [r, -x]), 4).map(([r, x]) => [r, -x])), 4);
  }
}

// ---- dữ liệu lượt nhanh (15 phút) qua /api/intraday
let LIVE = null, LIVE_AT = 0;
async function liveData(force = false) {
  if (!force && LIVE && Date.now() - LIVE_AT < 60000) return LIVE;
  try { const r = await fetch("api/intraday", { cache: "no-store" }); if (r.ok && (r.headers.get("content-type") || "").includes("json")) { LIVE = await r.json(); LIVE_AT = Date.now(); } } catch (e) { /* chạy trên máy */ }
  if (LIVE && LIVE.ok && BYK) {
    for (const [k, [p, r24]] of Object.entries(LIVE.prices || {})) { const r = BYK[k]; if (r && p) { r.p = p; if (isNum(r24)) r.r1 = r24; } }
    for (const [k, [f8, oi, oi24]] of Object.entries(LIVE.fut || {})) { const r = BYK[k]; if (r) { if (isNum(f8)) r.f8 = f8; if (isNum(oi)) r.oi = oi; if (isNum(oi24)) r.oi24 = oi24; } }
  }
  return LIVE;
}
// dải giá đầu trang: websocket Binance (giá từng giây)
function tickerWs() {
  const ks = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "HYPE"].filter((k) => BYK?.[k]?.sp);
  if (!ks.length) return;
  try {
    const ws = new WebSocket("wss://stream.binance.com:9443/stream?streams=" + ks.map((k) => BYK[k].sp.toLowerCase() + "@miniTicker").join("/"));
    const by = Object.fromEntries(ks.map((k) => [BYK[k].sp, k]));
    ws.onmessage = (ev) => { const d = JSON.parse(ev.data).data; const k = by[d?.s]; if (!k) return; const r = BYK[k], m = r.sm || 1, p = +d.c / m, o = +d.o / m; r.p = p; r.r1 = (p / o - 1) * 100;
      const el = $(`#ticker [data-tk="${k}"]`); if (el) el.innerHTML = `<b>${k}</b>${px(p)} <i class="${cls(r.r1)}">${pct(r.r1, 1)}</i>`; livePx(k, p); };
    ws.onclose = () => setTimeout(tickerWs, 15000);
  } catch (e) { /* không có websocket */ }
}

function tabTech(D) {
  const T = D.tech || {};
  if (!T.ok) return `<div class="empty">Chưa đủ dữ liệu kỹ thuật.</div>`;
  const g = Object.entries(T.groups || {}).map(([k, v]) => `<div class="tg"><b>${esc(k)}</b> ${scoreCell(v.score)} <small>${v.buy} mua · ${v.neutral} trung tính · ${v.sell} bán</small></div>`).join("");
  const rows = (T.table || []).map((x) => `<tr><td class="l">${esc(x.group)}</td><td class="l">${esc(x.name)}</td><td>${esc(x.value ?? "")}</td><td><span class="pill ${x.signal === "Mua" ? "buy" : x.signal === "Bán" ? "sell" : ""}">${esc(x.signal)}</span></td><td class="l"><small>${esc(x.note || "")}</small></td></tr>`).join("");
  return `<div class="g g2w">${panel("Đồ thị", chartBox(D, 380))}
    ${panel(`Tổng hợp: ${esc(T.label)} ${scoreCell(T.score)}`, `${kpis([["Xu hướng", esc(T.trend_vi)], ["ATR", `${nf(T.atr_pct, 1)}%/ngày`], ["Đỉnh 1 năm", px(T.hi52)], ["Cách đỉnh 1 năm", pct(T.from_hi52_pct, 0), "down"], ["Phân kỳ RSI", T.divergence?.rsi === "bullish" ? '<b class="up">dương</b>' : T.divergence?.rsi === "bearish" ? '<b class="down">âm</b>' : "—"]])}<div class="tgs">${g}</div>`)}</div>
    ${panel("Chi tiết chỉ báo (khung ngày)", `<div class="tw"><table><thead><tr><th class="l">Nhóm</th><th class="l">Chỉ báo</th><th>Giá trị</th><th>Tín hiệu</th><th class="l">Ghi chú</th></tr></thead><tbody>${rows}</tbody></table></div>`)}`;
}
BIND.tech = bindChart;
BIND.smc = (D) => { bindChart(D); mtfMount(D); };

// ================================================================ BỘ MÁY KỸ THUẬT TRÊN TRÌNH DUYỆT (thời gian thực): SMC, chỉ báo, đánh giá vào lệnh
const TA = {
  ema(a, n) { const k = 2 / (n + 1), o = new Array(a.length).fill(null); let e = null; for (let i = 0; i < a.length; i++) { if (a[i] == null) continue; e = e == null ? a[i] : a[i] * k + e * (1 - k); o[i] = i >= n - 1 ? e : null; } return o; },
  rsi(a, n = 14) { const o = new Array(a.length).fill(null); let g = 0, l = 0; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1], G = Math.max(d, 0), L = Math.max(-d, 0); if (i <= n) { g += G / n; l += L / n; if (i === n) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } else { g = (g * (n - 1) + G) / n; l = (l * (n - 1) + L) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; },
  atr(o, n = 14) { const out = new Array(o.c.length).fill(null); let a = null; for (let i = 0; i < o.c.length; i++) { const tr = i ? Math.max(o.h[i] - o.l[i], Math.abs(o.h[i] - o.c[i - 1]), Math.abs(o.l[i] - o.c[i - 1])) : o.h[i] - o.l[i]; a = a == null ? tr : (a * (n - 1) + tr) / n; out[i] = a; } return out; },
  macd(c) { const f = TA.ema(c, 12), s = TA.ema(c, 26), line = c.map((_, i) => (f[i] != null && s[i] != null ? f[i] - s[i] : null)); const sig = TA.ema(line.map((x) => x ?? 0), 9); return { line, sig, hist: line.map((x, i) => (x != null ? x - sig[i] : null)) }; },
  cvd(o) { if (!o.tb) return null; let s = 0; return o.v.map((v, i) => (s += 2 * (o.tb[i] || 0) - (v || 0))); },
  vwap(o, n = 96) { const out = []; let pv = 0, vv = 0; const q = []; for (let i = 0; i < o.c.length; i++) { const tp = (o.h[i] + o.l[i] + o.c[i]) / 3, v = o.v[i] || 0; q.push([tp * v, v]); pv += tp * v; vv += v; if (q.length > n) { const [a, b] = q.shift(); pv -= a; vv -= b; } out.push(vv > 0 ? pv / vv : null); } return out; },
  fractals(o, n = 3) { const hs = [], ls = []; for (let i = n; i < o.c.length - n; i++) { let H = true, L = true; for (let j = i - n; j <= i + n; j++) { if (o.h[j] > o.h[i]) H = false; if (o.l[j] < o.l[i]) L = false; } if (H && o.h[i] > o.h[i - 1]) hs.push([i, o.h[i], i + n]); if (L && o.l[i] < o.l[i - 1]) ls.push([i, o.l[i], i + n]); } return { hs, ls }; },
  smc(o, n = 3) {
    const N = o.c.length; if (N < 40) return null;
    const atr = TA.atr(o), { hs, ls } = TA.fractals(o, n);
    let ih = 0, il = 0, sh = null, sl = null, trend = 0;
    const events = [], obs = [], sweeps = [];
    for (let i = 0; i < N; i++) {
      while (ih < hs.length && hs[ih][2] <= i) { sh = { i: hs[ih][0], p: hs[ih][1], br: false }; ih++; }
      while (il < ls.length && ls[il][2] <= i) { sl = { i: ls[il][0], p: ls[il][1], br: false }; il++; }
      if (sl && !sl.br && o.l[i] < sl.p && o.c[i] > sl.p) sweeps.push({ i, dir: 1, level: sl.p, ext: o.l[i] });
      if (sh && !sh.br && o.h[i] > sh.p && o.c[i] < sh.p) sweeps.push({ i, dir: -1, level: sh.p, ext: o.h[i] });
      if (sh && !sh.br && o.c[i] > sh.p) {
        events.push({ i, type: trend === 1 ? "BOS" : "CHoCH", dir: 1, level: sh.p, from: sh.i }); sh.br = true; trend = 1;
        for (let j = i - 1; j >= Math.max(sl ? sl.i : 0, i - 15); j--) if (o.c[j] < o.o[j]) { obs.push({ i: j, lo: o.l[j], hi: o.h[j], dir: 1, born: i, mit: null, dead: null }); break; }
      }
      if (sl && !sl.br && o.c[i] < sl.p) {
        events.push({ i, type: trend === -1 ? "BOS" : "CHoCH", dir: -1, level: sl.p, from: sl.i }); sl.br = true; trend = -1;
        for (let j = i - 1; j >= Math.max(sh ? sh.i : 0, i - 15); j--) if (o.c[j] > o.o[j]) { obs.push({ i: j, lo: o.l[j], hi: o.h[j], dir: -1, born: i, mit: null, dead: null }); break; }
      }
      for (const b of obs) { if (b.dead != null || i <= b.born) continue; if (b.dir === 1) { if (b.mit == null && o.l[i] <= b.hi) b.mit = i; if (o.c[i] < b.lo) b.dead = i; } else { if (b.mit == null && o.h[i] >= b.lo) b.mit = i; if (o.c[i] > b.hi) b.dead = i; } }
    }
    const fvg = [];
    for (let i = Math.max(2, N - 150); i < N; i++) {
      if (o.l[i] > o.h[i - 2] && o.l[i] - o.h[i - 2] >= 0.25 * atr[i]) { const g = { i: i - 1, lo: o.h[i - 2], hi: o.l[i], dir: 1, fill: null }; for (let j = i + 1; j < N; j++) if (o.l[j] <= g.lo) { g.fill = j; break; } fvg.push(g); }
      if (o.h[i] < o.l[i - 2] && o.l[i - 2] - o.h[i] >= 0.25 * atr[i]) { const g = { i: i - 1, lo: o.h[i], hi: o.l[i - 2], dir: -1, fill: null }; for (let j = i + 1; j < N; j++) if (o.h[j] >= g.hi) { g.fill = j; break; } fvg.push(g); }
    }
    const a = atr[N - 1], liq = [];
    [[hs, "EQH", 1], [ls, "EQL", -1]].forEach(([arr, kind, sg]) => {
      const P = arr.slice(-12), used = new Set();
      for (let x = 0; x < P.length; x++) { if (used.has(x)) continue; const g = [P[x]]; for (let y = x + 1; y < P.length; y++) if (!used.has(y) && Math.abs(P[y][1] - P[x][1]) <= 0.15 * a) { g.push(P[y]); used.add(y); }
        if (g.length >= 2) { const lvl = sg === 1 ? Math.max(...g.map((q) => q[1])) : Math.min(...g.map((q) => q[1])), li = Math.max(...g.map((q) => q[0])); let sw = false; for (let j = li + 1; j < N; j++) if (sg === 1 ? o.h[j] > lvl : o.l[j] < lvl) { sw = true; break; } if (!sw) liq.push({ kind, p: lvl, n: g.length, i: li }); } }
    });
    const hiR = hs.length ? Math.max(...hs.slice(-3).map((q) => q[1])) : null, loR = ls.length ? Math.min(...ls.slice(-3).map((q) => q[1])) : null, px0 = o.c[N - 1];
    const pd = hiR && loR && hiR > loR ? { lo: loR, hi: hiR, eq: (hiR + loR) / 2, pos: (px0 - loR) / (hiR - loR) * 100 } : null;
    return { trend, events, obs, fvg, liq, sweeps, pd, sh, sl, atr, hs, ls };
  },
};
// ---- đánh giá vào lệnh thời gian thực: 1 khung vào lệnh (o) + 1–2 khung lớn (hi1, hi2)
function rtEval(o, hi1, hi2, ctx = {}, S0 = null) {
  const N = o?.c?.length || 0; if (N < 60) return null;
  const S = S0 || TA.smc(o); if (!S) return null;
  const c = o.c, p = c[N - 1], atr = S.atr[N - 1];
  const e20 = TA.ema(c, 20), e50 = TA.ema(c, 50), rsi = TA.rsi(c), mac = TA.macd(c), cvd = TA.cvd(o), vw = TA.vwap(o);
  const H1 = hi1 && hi1.c.length > 60 ? TA.smc(hi1) : null, H2 = hi2 && hi2.c.length > 60 ? TA.smc(hi2) : null;
  const he = (h) => { if (!h) return 0; const a = TA.ema(h.c, 20), b = TA.ema(h.c, 50), n = h.c.length - 1; return a[n] > b[n] && h.c[n] > b[n] ? 1 : a[n] < b[n] && h.c[n] < b[n] ? -1 : 0; };
  const vm = o.v.slice(-21, -1).reduce((x, y) => x + y, 0) / 20;
  const res = {};
  for (const sd of [1, -1]) {
    const chk = [], add = (ok, w, t, half = false) => chk.push({ ok: ok ? 1 : half ? 0.5 : 0, w, t });
    const hb1 = H1 ? H1.trend : he(hi1), hb2 = H2 ? H2.trend : he(hi2);
    add(hb1 === sd, 16, `Khung lớn ${ctx.tf1 || ""}: cấu trúc ${hb1 === 1 ? "tăng" : hb1 === -1 ? "giảm" : "ngang"}`, hb1 === 0);
    add(hb2 === sd || hb2 === 0, 8, hi2 ? `Khung lớn hơn ${ctx.tf2 || ""}: ${hb2 === 1 ? "tăng" : hb2 === -1 ? "giảm" : "ngang"}` : "Khung lớn hơn: không xét");
    const lastEv = S.events[S.events.length - 1];
    const evOk = lastEv && lastEv.dir === sd && N - 1 - lastEv.i <= 20;
    add(evOk, 14, lastEv ? `${lastEv.type} ${lastEv.dir === 1 ? "tăng" : "giảm"} cách ${N - 1 - lastEv.i} nến` : "Chưa có BOS/CHoCH");
    const sw = S.sweeps.filter((x) => x.dir === sd && N - 1 - x.i <= 15).pop();
    add(!!sw, 10, sw ? `Đã quét thanh khoản ${sd === 1 ? "đáy" : "đỉnh"} ${px(sw.level)}` : `Chưa quét thanh khoản ${sd === 1 ? "đáy" : "đỉnh"}`);
    const pos = S.pd?.pos;
    add(pos != null && (sd === 1 ? pos < 50 : pos > 50), 8, pos != null ? `Vị trí ${nf(pos, 0)}% biên swing – ${pos < 45 ? "Discount (rẻ)" : pos > 55 ? "Premium (đắt)" : "giữa"}` : "Chưa rõ biên swing", pos != null && Math.abs(pos - 50) < 8);
    const ob = S.obs.filter((b) => b.dir === sd && b.dead == null && (sd === 1 ? p >= b.lo - 0.3 * atr && p <= b.hi + 0.5 * atr : p <= b.hi + 0.3 * atr && p >= b.lo - 0.5 * atr)).pop();
    const fv = S.fvg.filter((g) => g.dir === sd && g.fill == null && p >= g.lo - 0.3 * atr && p <= g.hi + 0.3 * atr).pop();
    add(!!(ob || fv), 12, ob ? `Giá đang ở Order Block ${sd === 1 ? "mua" : "bán"} ${px(ob.lo)}–${px(ob.hi)}` : fv ? `Giá đang ở FVG ${px(fv.lo)}–${px(fv.hi)}` : "Chưa ở OB/FVG cùng chiều");
    const r = rsi[N - 1];
    add(sd === 1 ? r < 68 && r > 40 : r > 32 && r < 60, 6, `RSI ${nf(r, 0)}${sd === 1 && r >= 68 ? " – quá mua" : sd === -1 && r <= 32 ? " – quá bán" : ""}`);
    const mh = mac.hist[N - 1], mh1 = mac.hist[N - 2];
    add(sd * (mh - mh1) > 0, 6, `MACD ${sd * (mh - mh1) > 0 ? "đang quay cùng chiều" : "chưa quay"}`);
    if (cvd) { const d20 = cvd[N - 1] - cvd[N - 21]; add(sd * d20 > 0, 8, `Dòng tiền chủ động 20 nến ${d20 > 0 ? "mua" : "bán"} ròng ${usd(Math.abs(d20))}`); }
    add(sd * (p - vw[N - 1]) > 0, 4, `Giá ${p > vw[N - 1] ? "trên" : "dưới"} VWAP (${px(vw[N - 1])})`);
    const vr = o.v[N - 1] / Math.max(1e-9, vm);
    add(vr >= 1.3, 4, `Khối lượng nến hiện tại x${nf(vr, 1)} trung bình`, vr >= 0.9);
    const cr = ctx.cr || [];
    add(!(sd === 1 && cr.includes("long_crowded")) && !(sd === -1 && cr.includes("short_crowded")), 4, sd === 1 && cr.includes("long_crowded") ? "Long đang quá đông (funding nóng)" : sd === -1 && cr.includes("short_crowded") ? "Short đang quá đông" : "Đám đông futures không ngược chiều");
    // kế hoạch: vào – cắt lỗ – mục tiêu theo cấu trúc SMC
    let e = p, s, trig = null;
    if (ob) { e = sd === 1 ? Math.min(p, ob.hi) : Math.max(p, ob.lo); s = sd === 1 ? ob.lo - 0.2 * atr : ob.hi + 0.2 * atr; }
    else if (sw) s = sd === 1 ? sw.ext - 0.2 * atr : sw.ext + 0.2 * atr;
    else s = sd === 1 ? p - 1.5 * atr : p + 1.5 * atr;
    if (!evOk) { const lvl = sd === 1 ? S.sh?.p : S.sl?.p;
      if (lvl && sd * (lvl - p) > 0) { trig = `Chưa phá cấu trúc: đặt lệnh chờ ${sd === 1 ? "mua khi nến đóng trên" : "bán khi nến đóng dưới"} ${px(lvl)} – vào ở đó, không vào trước`; e = lvl; if (sd * (e - s) > 3 * atr) s = e - sd * 1.5 * atr; }
      else if (lvl) trig = `Chờ phá cấu trúc ${sd === 1 ? "tăng" : "giảm"} rõ ràng (BOS/CHoCH) trước khi vào`; }
    if (sd * (e - s) < 0.5 * atr) s = e - sd * 0.8 * atr;
    const R = Math.abs(e - s);
    const tg = (sd === 1 ? S.hs.map((q) => q[1]).concat(S.liq.filter((x) => x.kind === "EQH").map((x) => x.p)).filter((x) => x > e + R) : S.ls.map((q) => q[1]).concat(S.liq.filter((x) => x.kind === "EQL").map((x) => x.p)).filter((x) => x < e - R)).sort((a, b) => sd * (a - b));
    let t1 = tg[0] ?? e + sd * 2 * R, t2 = tg[1] && sd * (tg[1] - t1) > 0.5 * R ? tg[1] : t1 + sd * 1.5 * R;
    // cản của khung lớn (đỉnh/đáy swing, Order Block ngược chiều, thanh khoản EQH/EQL) trên đường tới mục tiêu
    let obst = null;
    [[H1, ctx.tf1], [H2, ctx.tf2]].forEach(([H, nm]) => {
      if (!H) return;
      const lv = sd === 1 ? H.hs.slice(-10).map((q) => q[1]).concat(H.obs.filter((b) => b.dir === -1 && b.dead == null).map((b) => b.lo), H.liq.filter((q) => q.kind === "EQH").map((q) => q.p))
        : H.ls.slice(-10).map((q) => q[1]).concat(H.obs.filter((b) => b.dir === 1 && b.dead == null).map((b) => b.hi), H.liq.filter((q) => q.kind === "EQL").map((q) => q.p));
      const nx = lv.filter((x) => sd * (x - e) > 0.15 * R).sort((x, y) => sd * (x - y))[0];
      if (nx != null && (!obst || sd * (nx - obst.p) < 0)) obst = { p: nx, tf: nm };
    });
    if (obst && sd * (obst.p - e) < 0.8 * R) add(false, 8, `${sd === 1 ? "Kháng cự" : "Hỗ trợ"} khung ${obst.tf} ở ${px(obst.p)} – quá gần (< 0,8R), lời ít hơn lỗ`);
    else if (obst && sd * (t1 - obst.p) > 0) { t1 = obst.p; if (sd * (t2 - t1) < 0.5 * R) t2 = t1 + sd * R; add(false, 8, `MT1 hạ về cản khung ${obst.tf} (${px(obst.p)}) – đường lên ${sd === 1 ? "có người bán" : "có người mua"} khung lớn chờ`, true); }
    else add(true, 8, obst ? `Đường tới MT1 thông – cản khung ${obst.tf} ở ${px(obst.p)} xa hơn MT1` : "Không thấy cản khung lớn trước MT1");
    const score = Math.round(chk.reduce((x, k) => x + k.ok * k.w, 0) / chk.reduce((x, k) => x + k.w, 0) * 100);
    res[sd === 1 ? "long" : "short"] = { score, obst, chk, e, s, t1, t2, rr1: Math.abs(t1 - e) / R, rr2: Math.abs(t2 - e) / R, trig, setup: sw && evOk ? (sd === 1 ? "smc_sweep_up" : "smc_sweep_dn") : ob ? (sd === 1 ? "smc_ob_up" : "smc_ob_dn") : null };
  }
  const best = res.long.score >= res.short.score ? "long" : "short", B = res[best];
  [res.long, res.short].forEach((X) => { X.status = X.score >= 75 && !X.trig ? "go" : X.score >= 58 ? "ready" : "wait"; });
  return { ...res, best, p, atr, S, H1, e20: e20[N - 1], e50: e50[N - 1], rsi: rsi[N - 1] };
}
const RTS = { go: ["VÀO ĐƯỢC", "buy"], ready: ["CHUẨN BỊ", "brand"], wait: ["CHỜ", ""] };
function rtCard(E, ctx = {}) {
  if (!E) return `<p class="muted">Chưa đủ nến để đánh giá.</p>`;
  const sd = E.best, B = E[sd], O = E[sd === "long" ? "short" : "long"], [st, sc] = RTS[B.status];
  const stat = ctx.stats && B.setup ? ctx.stats[B.setup] : null;
  return `<div class="rt ${sd}"><div class="rt-h"><span class="pill ${sc} big">${st}</span> <b class="${sd === "long" ? "up" : "down"}">${sd === "long" ? "LONG" : "SHORT"}</b>
      <span class="rt-score"><i style="width:${B.score}%"></i></span><b>${B.score}/100</b> <small class="muted">chiều ngược lại ${O.score}/100 · khung vào ${esc(ctx.tf || "")} · cập nhật ${new Date().toLocaleTimeString("vi-VN")}</small></div>
    ${B.trig ? `<p class="ref">⏳ ${esc(B.trig)}</p>` : ""}
    <div class="rt-g">${kpis([["Vào", px(B.e)], ["Cắt lỗ", px(B.s), "down", pct(-Math.abs(B.e - B.s) / B.e * 100, 2)], ["MT1", px(B.t1), "up", `R:R ${nf(B.rr1, 1)}`], ["MT2", px(B.t2), "up", `R:R ${nf(B.rr2, 1)}`],
      stat ? ["Lịch sử thiết lập", `${nf(stat.win1, 0)}% · ${nf(stat.avgR, 2)}R`, cls(stat.avgR), `${IDEA_NAMES[B.setup]} – ${nf(stat.n, 0)} lần (khung ${ctx.statTf === "d" ? "ngày" : "4h"})`] : ["Lịch sử thiết lập", ctx.statTf ? "chưa có thiết lập SMC" : "chưa kiểm chứng", "", ctx.statTf ? "Chưa xuất hiện quét thanh khoản + phá cấu trúc hoặc hồi về OB" : "Khung dưới 4h chưa có thống kê lịch sử – đánh nhỏ"]])}</div>
    <ul class="rtc">${B.chk.map((k) => `<li class="${k.ok === 1 ? "ok" : k.ok ? "half" : "no"}"><i>${k.ok === 1 ? "✓" : k.ok ? "◐" : "✗"}</i>${esc(k.t)} <small>${k.w}đ</small></li>`).join("")}</ul></div>`;
}

// ---- lớp vẽ SMC lên biểu đồ (hộp OB / FVG, đường BOS / CHoCH, thanh khoản, vùng premium/discount)
function smcOverlay(el, ch, cs) {
  const cv = document.createElement("canvas"); cv.className = "ov"; el.appendChild(cv);
  let o = null, S = null, q = false;
  const draw = () => {
    q = false; if (!S || !o || !cv.isConnected) return;
    const W = el.clientWidth, H = el.clientHeight, dpr = devicePixelRatio || 1;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const ts = ch.timeScale(), X = (i) => ts.logicalToCoordinate(i), Y = (v) => cs.priceToCoordinate(v);
    const right = W - (ch.priceScale("right").width() || 60), N = o.c.length, bot = H - 26;
    g.save(); g.beginPath(); g.rect(0, 0, right, bot); g.clip();
    const up = css("--up"), dn = css("--down"), br = css("--brand"), rf = css("--ref"), i3 = css("--ink-3");
    g.font = "10px Be Vietnam Pro, system-ui, sans-serif";
    const box = (i0, lo, hi, col, label) => { let x0 = X(i0); const y0 = Y(hi), y1 = Y(lo); if (y0 == null || y1 == null) return; if (x0 == null || x0 < 0) x0 = 0; if (x0 > right) return;
      g.fillStyle = col + "22"; g.strokeStyle = col + "99"; g.lineWidth = 1; g.fillRect(x0, y0, right - x0, Math.max(1, y1 - y0)); g.strokeRect(x0 + 0.5, y0 + 0.5, right - x0, Math.max(1, y1 - y0));
      if (label && W >= 600) { g.fillStyle = col; g.fillText(label, x0 + 3, y0 + 11); } };
    if (S.pd) { const y0 = Y(S.pd.hi), ym = Y(S.pd.eq), y1 = Y(S.pd.lo); if (y0 != null && y1 != null && ym != null) {
      g.fillStyle = dn + "0c"; g.fillRect(0, y0, right, ym - y0); g.fillStyle = up + "0c"; g.fillRect(0, ym, right, y1 - ym);
      g.setLineDash([2, 4]); g.strokeStyle = i3; g.beginPath(); g.moveTo(0, ym); g.lineTo(right, ym); g.stroke(); g.setLineDash([]);
      g.fillStyle = i3; g.fillText("Premium ↑ · EQ 50% · ↓ Discount", 6, ym - 4); } }
    S.obs.filter((b) => b.dead == null).slice(-6).forEach((b) => box(b.i, b.lo, b.hi, b.dir === 1 ? up : dn, `OB ${b.dir === 1 ? "mua" : "bán"}${b.mit != null ? " · đã chạm" : ""}`));
    S.fvg.filter((f) => f.fill == null).slice(-6).forEach((f) => box(f.i, f.lo, f.hi, br, `FVG ${f.dir === 1 ? "↑" : "↓"}`));
    S.events.slice(-10).forEach((e) => { const x0 = X(e.from), x1 = X(e.i), y = Y(e.level); if (x0 == null || x1 == null || y == null || x1 < 0) return;
      g.strokeStyle = e.dir === 1 ? up : dn; g.setLineDash(e.type === "CHoCH" ? [5, 3] : []); g.lineWidth = 1.3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = e.dir === 1 ? up : dn; g.font = "bold 10px system-ui, sans-serif"; g.fillText(e.type, (x0 + x1) / 2 - 14, y + (e.dir === 1 ? -4 : 12)); g.font = "10px system-ui, sans-serif"; });
    S.liq.forEach((q) => { let x0 = X(q.i); const y = Y(q.p); if (y == null) return; if (x0 == null || x0 < 0) x0 = 0;
      g.strokeStyle = rf; g.setLineDash([1, 3]); g.beginPath(); g.moveTo(x0, y); g.lineTo(right, y); g.stroke(); g.setLineDash([]); g.fillStyle = rf; g.fillText(`$$$ ${q.kind} ×${q.n}`, right - 70, y - 3); });
    S.sweeps.filter((s) => s.i > N - 80).forEach((s) => { const x = X(s.i), y = Y(s.ext); if (x == null || y == null) return; g.fillStyle = rf; g.beginPath(); g.arc(x, y + (s.dir === 1 ? 7 : -7), 3, 0, 7); g.fill(); });
    g.restore();
  };
  const later = () => { if (!q) { q = true; requestAnimationFrame(draw); } };
  ch.timeScale().subscribeVisibleLogicalRangeChange(later);
  ch.subscribeCrosshairMove(later);
  try { new ResizeObserver(later).observe(el); } catch (e) { /* trình duyệt cũ */ }
  return { set(o2, S2) { o = o2; S = S2; later(); } };
}
// ---- khung phụ đồng bộ với biểu đồ chính: RSI, MACD, dòng tiền chủ động (CVD)
function subPanes(host, main) {
  host.innerHTML = "";
  const panes = [];
  const mk = (h, title, fmt) => { const d = document.createElement("div"); d.className = "pane"; d.style.height = h + "px"; d.innerHTML = `<span class="pane-t">${title}</span>`; host.appendChild(d);
    const c = mkChart(d, { localization: { locale: "vi-VN", priceFormatter: fmt }, timeScale: { visible: false }, rightPriceScale: { borderColor: css("--line"), minimumWidth: 74, scaleMargins: { top: 0.12, bottom: 0.08 } }, handleScroll: false, handleScale: false }); panes.push(c); return c; };
  const line = (c, col, w = 1.3) => c.addLineSeries({ color: col, lineWidth: w, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
  const r = mk(92, "RSI 14 · 70 quá mua · 30 quá bán", (v) => nf(v, 0)), rs = line(r, css("--brand"));
  [70, 50, 30].forEach((y) => rs.createPriceLine({ price: y, color: css("--ink-3"), lineStyle: 2, lineWidth: 1, axisLabelVisible: false }));
  const m = mk(92, "MACD 12-26-9", (v) => px(v)), mh = m.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "price", precision: 6, minMove: 1e-6 } }), ml = line(m, css("--brand"), 1), msg = line(m, css("--ref"), 1);
  ml.applyOptions({ priceFormat: { type: "price", precision: 6, minMove: 1e-6 } }); msg.applyOptions({ priceFormat: { type: "price", precision: 6, minMove: 1e-6 } });
  let cc = null, cl = null;
  const sync = () => { const rg = main.timeScale().getVisibleLogicalRange(); if (rg) panes.forEach((p) => { try { p.timeScale().setVisibleLogicalRange(rg); } catch (e) { /* chưa có dữ liệu */ } }); };
  main.timeScale().subscribeVisibleLogicalRangeChange(sync);
  return (o) => {
    const T = o.t, D = (v) => T.map((t, i) => (v[i] == null || !isFinite(v[i]) ? { time: t } : { time: t, value: v[i] }));
    rs.setData(D(TA.rsi(o.c)));
    const M = TA.macd(o.c);
    mh.setData(T.map((t, i) => (M.hist[i] == null ? { time: t } : { time: t, value: M.hist[i], color: M.hist[i] >= 0 ? css("--up") + "99" : css("--down") + "99" })));
    ml.setData(D(M.line)); msg.setData(D(M.sig));
    const cv = TA.cvd(o);
    if (cv) { if (!cc) { cc = mk(92, "CVD – mua chủ động trừ bán chủ động (tích luỹ, USD)", (v) => usd(v)); cl = cc.addAreaSeries({ lineColor: css("--up"), topColor: css("--up") + "33", bottomColor: css("--up") + "00", lineWidth: 1.3, priceLineVisible: false, priceFormat: { type: "volume" } }); } cl.setData(D(cv)); }
    sync();
  };
}
// ---- công cụ gắn vào biểu đồ chính: SMC + khung phụ + đánh giá vào lệnh, chạy lại mỗi khi có nến mới
const HTF = { "1s": ["1m", "5m"], "5s": ["1m", "15m"], "15s": ["5m", "15m"], "30s": ["5m", "1h"], "1m": ["15m", "1h"], "5m": ["1h", "4h"], "10m": ["1h", "4h"], "15m": ["1h", "4h"], "30m": ["4h", "1d"], "1h": ["4h", "1d"], "4h": ["1d", "1w"], "1d": ["1w", "1M"], "1w": ["1M", null], "15d": ["1M", null], "1M": [null, null], "3M": [null, null], "1y": [null, null] };
const TF_SEC = { "1s": 1, "5s": 5, "15s": 15, "30s": 30, "1m": 60, "5m": 300, "10m": 600, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800, "15d": 1296000, "1M": 2592000, "3M": 7776000, "1y": 31536000 };
const TFN = Object.fromEntries(TFS.concat([["3s", "3s"]]));
const STAT_TF = { "1d": "d", "4h": "h4" };
const SMC_SET = ["smc_sweep_up", "smc_sweep_dn", "smc_ob_up", "smc_ob_dn"];
async function htfO(r, D, iv, lim) { if (!iv) return null; const L = await liveKlines(r, iv, 1, lim).catch(() => null); return L ? L.o : serverO(D, iv); }
const RT = { prev: {} };
function rtNotify(title, body, url) {
  toast(`${title} – ${body}`);
  try { if (lsGet("rtNtf", false) && "Notification" in window && Notification.permission === "granted") { const n = new Notification(title, { body, icon: "icon.svg", tag: title }); if (url) n.onclick = () => { window.focus(); location.hash = url; }; } } catch (e) { /* bỏ qua */ }
}
const RANK = { wait: 0, ready: 1, go: 2 };
function rtFlip(k, tf, E) {
  const key = k + "|" + tf, B = E[E.best], now = { st: B.status, side: E.best }, pv = RT.prev[key]; RT.prev[key] = now;
  if (!pv) return false;
  if (RANK[now.st] > RANK[pv.st] || (now.st !== "wait" && now.side !== pv.side)) {
    rtNotify(`${k} ${TFN[tf] || tf}: ${RTS[now.st][0]} ${now.side === "long" ? "LONG" : "SHORT"}`, `điểm ${B.score}/100 · vào ${px(B.e)} · cắt lỗ ${px(B.s)} · MT1 ${px(B.t1)} (R:R ${nf(B.rr1, 1)})`, `#/c/${enc(k)}/smc`);
    return true;
  }
  return false;
}
const rtBox = () => `<div id="rt"><div class="rt-body"><p class="muted">Đang tải nến khung lớn để đánh giá…</p></div>
  <div class="rt-act"><button class="btn primary" id="rtTk">Lên lệnh theo đánh giá này →</button><label class="chk"><input type="checkbox" id="rtN" ${lsGet("rtNtf", false) ? "checked" : ""}> Báo trên trình duyệt khi trạng thái đổi</label></div><div class="rt-tk"></div></div>`;
function rtStats(D, tf) {
  const st = STAT_TF[tf]; if (!st) return null;
  const up = COINS?.btc_up ?? D._ij?.btc_up ?? true;
  return Object.fromEntries(SMC_SET.map((s) => [s, poolStat(D._ij, st, s, up)]));
}
function rtTicket(D, E, tf) {
  const sd = E.best, B = E[sd], stats = rtStats(D, tf), st = stats && B.setup ? stats[B.setup] : null;
  const bars = Math.max(2, Math.round((Math.abs(B.t1 - B.e) / E.atr) ** 2 * 0.8));
  const t = { side: sd, tf: TF_SEC[tf] >= 86400 ? "d" : "h4", tf_bd: TF_SEC[tf] / 86400, e: B.e, s: B.s, t1: B.t1, t2: B.t2, p1: st?.win1 ?? 40, p2: st?.win2, d1: st?.d1 ?? bars, d1_hi: st?.d1_hi ?? bars * 2, d2: st?.d2 ?? bars * 2,
    avgR: st?.avgR, n: st?.n, setup: B.setup ? IDEA_NAMES[B.setup] : null, edge: !!(st && st.avgR >= 0.05 && st.n >= 100 && (st.avgR_2y == null || st.avgR_2y > 0)),
    order: Math.abs(E.p - B.e) > 0.25 * E.atr ? "limit" : "market", src: `đánh giá SMC thời gian thực khung ${TFN[tf]} – điểm ${B.score}/100${st ? `, thiết lập "${IDEA_NAMES[B.setup]}" ${nf(st.n, 0)} lần lịch sử` : ""}`, tfLabel: `Khung ${TFN[tf]}` };
  finishTicket(D, t);
  const warn = [], r = D.row, cr = r.cr || [];
  if (B.trig) warn.push(B.trig);
  if (!st) warn.push(`Khung ${TFN[tf]} chưa có thống kê lịch sử – xác suất ${nf(t.p1, 0)}% chỉ là giả định, nên đánh nhỏ`);
  if (sd === "long" && cr.includes("long_crowded")) warn.push(`Phe Long đang quá đông (funding ${f8s(r.f8)})`);
  if (sd === "short" && cr.includes("short_crowded")) warn.push("Phe Short đang quá đông – dễ bị ép tăng");
  if (sd === "long" && COINS && !COINS.btc_up) warn.push("BTC đang dưới MA200 – Long altcoin rủi ro cao hơn");
  if (t.r1 < 1) warn.push(`Mục tiêu 1 chỉ ${nf(t.r1, 2)}R`);
  if (t.capped) warn.push("Khối lượng bị giới hạn để ký quỹ không vượt 25% vốn");
  let v = t.evR <= 0 ? "no" : { go: "go", ready: "limit", wait: "watch" }[B.status];
  if (!(t.q > 0)) { v = "no"; warn.unshift(t.gov?.halt ? "Hệ thống đang DỪNG giao dịch hôm nay (chạm lỗ ngày)" : "Danh mục đã chạm giới hạn rủi ro – không mở thêm lệnh"); }
  const now = Date.now();
  Object.assign(t, { verdict: v, warn, notes: B.chk.filter((k) => k.ok === 1).slice(0, 4).map((k) => k.t), price: E.p, k: r.k,
    eta1: now + t.d1 * t.tf_bd * 86400e3, eta2: now + t.d2 * t.tf_bd * 86400e3, tstop: now + t.d1_hi * t.tf_bd * 86400e3 });
  return t;
}
function chartTools(D, el, ch, tf) {
  const r = D.row;
  ch.c.applyOptions({ rightPriceScale: { minimumWidth: 74 } });
  const ov = lsGet("showSmc", true) ? smcOverlay(el, ch.c, ch.cs) : null;
  const ph = $("#panes"); if (ph) ph.innerHTML = "";
  const pn = ph && lsGet("showPanes", true) ? subPanes(ph, ch.c) : null;
  const rtEl = $("#rt"), body = rtEl && $(".rt-body", rtEl);
  const [a1, a2] = HTF[tf] || [null, null];
  const H = { h1: null, h2: null, t: 0, busy: false };
  const loadH = async () => { if (H.busy || !rtEl) return; H.busy = true; try { const [x, y] = await Promise.all([htfO(r, D, a1, 500), htfO(r, D, a2, 300)]); H.h1 = x; H.h2 = y; H.t = Date.now(); } finally { H.busy = false; } };
  let last = 0, pend = null, cur = null, E = null;
  const run = () => {
    const o = cur; if (!o || !el.isConnected) return; last = Date.now();
    const S = TA.smc(o);
    if (ov) ov.set(o, S);
    if (pn) try { pn(o); } catch (e) { console.warn(e); }
    if (body && body.isConnected) {
      if (Date.now() - H.t > 120e3) loadH();
      E = rtEval(o, H.h1, H.h2, { tf1: TFN[a1], tf2: TFN[a2], cr: r.cr || [] }, S);
      body.innerHTML = rtCard(E, { tf: TFN[tf], stats: rtStats(D, tf), statTf: STAT_TF[tf] });
      if (E && rtFlip(r.k, tf, E)) body.firstElementChild?.classList.add("flash");
    }
  };
  if (rtEl) {
    $("#rtTk", rtEl).onclick = () => { if (!E) return; const t = rtTicket(D, E, tf); $(".rt-tk", rtEl).innerHTML = ticketCard(t) + spotFutBox(t); bindTicketSave(rtEl); };
    $("#rtN", rtEl).onchange = async (ev) => { lsSet("rtNtf", ev.target.checked); if (ev.target.checked && "Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) { /* bỏ qua */ } } };
  }
  const upd = (o, force) => { cur = o; if (force || Date.now() - last > 1500) { clearTimeout(pend); pend = null; run(); } else if (!pend) pend = setTimeout(() => { pend = null; run(); }, 1500 - (Date.now() - last)); };
  loadH().then(() => run());
  return { upd };
}

// ================================================================ TAB SMC & VÀO LỆNH
function smcSrv(s, nm) {
  if (!s || s.bias === undefined) return "";
  const pd = s.pd || {}, P = (a) => (a ? `${px(a[0])} – ${px(a[1])}` : "—");
  const obs = (s.obs || []).slice(-4).reverse().map((o) => `<li><span class="pill ${o.dir === 1 ? "buy" : "sell"}">OB ${o.dir === 1 ? "mua" : "bán"}</span> ${px(o.lo)} – ${px(o.hi)} ${o.mit ? '<small class="faint">đã chạm</small>' : '<small class="up">chưa chạm</small>'}</li>`).join("");
  const fv = (s.fvg || []).slice(-3).reverse().map((g) => `<li><span class="pill brand">FVG ${g.dir === 1 ? "↑" : "↓"}</span> ${px(g.lo)} – ${px(g.hi)}</li>`).join("");
  const lq = (s.liq || []).map((q) => `<li><span class="pill warn">${q.kind}</span> ${px(q.p)} <small class="faint">${q.n} đỉnh/đáy bằng nhau – thanh khoản chờ bị quét</small></li>`).join("");
  return `<div class="smcb"><h3>${nm} ${tsPill(s.bias)}</h3>
    ${kpis([["Vị trí trong biên", pd.zone ? `${esc(pd.zone.split(" (")[0])}` : "—", pd.pos < 45 ? "up" : pd.pos > 55 ? "down" : "", isNum(pd.pos) ? `${nf(pd.pos, 0)}% từ đáy swing ${px(pd.lo)} tới đỉnh ${px(pd.hi)}` : ""], ["Đỉnh swing", px(s.sh)], ["Đáy swing", px(s.sl)], ["OTE Long (62–79%)", P(pd.ote_long), "up"], ["OTE Short", P(pd.ote_short), "down"]])}
    ${(s.notes || []).length ? `<ul class="why">${s.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <ul class="smcl">${obs}${fv}${lq}</ul></div>`;
}
function tabSmc(D) {
  const X = D.smc || {}, IJ = D._ij || {}, up = COINS?.btc_up ?? IJ.btc_up;
  const st = ["d", "h4"].flatMap((tf) => SMC_SET.map((s) => { const x = IJ.stats?.[tf]?.[s]; const a = x && (x[up ? "up" : "down"] || x.all); if (!a) return ""; return `<tr><td class="l">${TFV[tf]}</td><td class="l">${esc(IDEA_NAMES[s] || s)}</td><td>${nf(a.n, 0)}</td><td>${nf(a.win1, 0)}%</td><td class="${cls(a.avgR)}">${nf(a.avgR, 2)}R</td><td class="${cls(a.avgR_2y)}">${isNum(a.avgR_2y) ? nf(a.avgR_2y, 2) + "R" : "—"}</td><td>${durTxt(a.d1, tf === "d" ? 1 : 1 / 6)}</td></tr>`; })).join("");
  return `${panel("🧭 Đa khung thời gian – khung nhỏ có bị tuần / tháng / quý chặn không?", `<div id="mtf"><p class="muted">Đang tải 9 khung (1 phút → quý)…</p></div>`, "giây/phút/ngày so với tuần/tháng/quý")}
  <div class="g g2w">
    ${panel("Biểu đồ Smart Money – vẽ lại theo từng nến", `${chartBox(D, 520)}<p class="faint" style="font-size:.72rem">Hộp xanh/đỏ = Order Block (nến ngược chiều cuối cùng trước cú phá cấu trúc) · hộp tím = FVG (khoảng trống giá chưa lấp) · đường liền = BOS (phá cấu trúc cùng xu hướng), đứt = CHoCH (đổi tính chất – đảo chiều) · đường chấm vàng $$$ = đỉnh/đáy bằng nhau (thanh khoản chờ bị quét) · chấm vàng = vừa quét thanh khoản · nền đỏ nhạt trên EQ = Premium (đắt), xanh nhạt = Discount (rẻ).</p>`)}
    <div>${panel("⚡ Vào lệnh lúc này? – đánh giá thời gian thực", rtBox(), "theo khung đang xem · tính lại mỗi 1,5 giây")}
      ${panel("Cấu trúc SMC theo khung (máy chủ, cập nhật 15 phút – 4 giờ)", smcSrv(X.d, "Ngày") + smcSrv(X.h4, "4 giờ") + smcSrv(X.h1, "1 giờ") || `<p class="muted">Chưa có dữ liệu.</p>`)}</div></div>
    ${st ? panel(`Thiết lập SMC có thật sự hiệu quả? (kiểm chứng trên toàn bộ coin, BTC ${up ? "trên" : "dưới"} MA200)`, `<div class="tw"><table><thead><tr><th class="l">Khung</th><th class="l">Thiết lập</th><th>Số lần</th><th>Chạm MT1</th><th>Lãi TB/lệnh</th><th>2 năm gần nhất</th><th>Tới MT1</th></tr></thead><tbody>${st}</tbody></table></div>
      <p class="faint" style="font-size:.74rem">Cách đo: vào ở giá đóng cửa nến xác nhận (hoặc khi chạm lại OB), cắt lỗ dưới râu quét/OB, MT1 = đỉnh/đáy swing đối diện, đã trừ phí; nến chạm cả điểm vào lẫn cắt lỗ tính là thua −1R. Quét thanh khoản + phá cấu trúc là thiết lập tốt nhất anh có trong hệ thống; hồi về OB có lợi thế nhỏ hơn. Khung dưới 4h chưa kiểm chứng – đánh nhỏ.</p>`) : ""}`;
}

// ================================================================ RADAR – quét thời gian thực nhiều coin theo khung chọn
const RD = { timer: null, res: new Map(), busy: false, gen: 0 };
function rdClose() { clearInterval(RD.timer); RD.timer = null; RD.gen++; }
async function viewRadar() {
  await coins(); if (!PF) await pfLoad().catch(() => null);
  const IJ = await tryLoad("data/ideas.json");
  const O = { tf: lsGet("rdtf", "15m"), n: lsGet("rdn", 30), side: lsGet("rdside", ""), st: lsGet("rdst", "") };
  const TFR = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
  app().innerHTML = `<div class="ph"><h1>Radar vào lệnh</h1><span class="meta">quét trực tiếp từ Binance trên trình duyệt · SMC + chỉ báo + khung lớn · <span id="rdS">…</span></span></div>
    <div class="note"><p>Mỗi coin được chấm điểm 0–100 cho cả Long và Short theo cùng bảng kiểm tra ở tab <b>SMC & vào lệnh</b>: cấu trúc khung lớn, BOS/CHoCH, quét thanh khoản, vị trí Premium/Discount, giá đang ở Order Block/FVG, RSI, MACD, dòng tiền chủ động (CVD), VWAP, khối lượng, đám đông futures. <b>VÀO ĐƯỢC</b> ≥ 75 điểm và đã phá cấu trúc · <b>CHUẨN BỊ</b> ≥ 58 (đặt cảnh báo/lệnh chờ) · còn lại <b>CHỜ</b>.</p></div>
    <div class="filters"><div class="field"><label>Khung vào lệnh</label><select id="rdT">${TFR.map((t) => `<option value="${t}" ${t === O.tf ? "selected" : ""}>${TFN[t]}</option>`).join("")}</select></div>
      <div class="field"><label>Số coin</label><select id="rdN">${[20, 30, 50, 80].map((n) => `<option ${n === O.n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="field"><label>Chiều</label><select id="rdD"><option value="">Cả hai</option><option value="long" ${O.side === "long" ? "selected" : ""}>Long</option><option value="short" ${O.side === "short" ? "selected" : ""}>Short</option></select></div>
      <div class="field"><label>Trạng thái</label><select id="rdF"><option value="">Tất cả</option><option value="ready" ${O.st === "ready" ? "selected" : ""}>Chuẩn bị trở lên</option><option value="go" ${O.st === "go" ? "selected" : ""}>Chỉ VÀO ĐƯỢC</option></select></div>
      <label class="chk"><input type="checkbox" id="rdNt" ${lsGet("rtNtf", false) ? "checked" : ""}> Báo trên trình duyệt khi có coin chuyển trạng thái</label>
      <button class="btn" id="rdGo">Quét lại ngay</button></div>
    <div class="tw"><table class="rdt"><thead><tr><th class="l">Coin</th><th>Giá</th><th>24h</th><th class="l">Trạng thái</th><th>Điểm</th><th>Vào</th><th>Cắt lỗ</th><th>MT1</th><th>R:R</th><th class="l">Lý do chính</th></tr></thead><tbody id="rdB"><tr><td colspan="10" class="muted">Đang quét…</td></tr></tbody></table></div>
    <p class="faint disclaimer">Radar chấm điểm theo quy tắc cố định, không phải lời khuyên đầu tư. Điểm cao = nhiều yếu tố kỹ thuật cùng chiều, không đảm bảo giá chạy. Bấm vào coin để xem biểu đồ SMC và tạo phiếu lệnh (đòn bẩy do hệ thống kiểm soát).</p>`;
  await WL.load().catch(() => {});
  const mine = new Set([...WL.set, ...(PF?.holdings || []).map((h) => h.symbol), ...(PF?.futures || []).map((f) => f.symbol)]);
  const pick = () => { const liq = COINS.rows.filter((r) => (r.sp || r.bf)).sort((a, b) => (b.vol || 0) - (a.vol || 0)).slice(0, O.n); const ks = new Set(liq.map((r) => r.k)); mine.forEach((k) => { if (BYK[k] && (BYK[k].sp || BYK[k].bf)) ks.add(k); }); return [...ks]; };
  const draw = () => {
    let xs = [...RD.res.values()].filter((x) => x.tf === O.tf);
    xs = xs.map((x) => { const sd = O.side || x.E.best, B = x.E[sd]; return { ...x, sd, B, stt: sd === x.E.best ? B.status : (B.score >= 75 && !B.trig ? "go" : B.score >= 58 ? "ready" : "wait") }; })
      .filter((x) => !O.st || RANK[x.stt] >= RANK[O.st]).sort((a, b) => RANK[b.stt] - RANK[a.stt] || b.B.score - a.B.score);
    $("#rdB").innerHTML = xs.map((x) => { const B = x.B, [st, sc] = RTS[x.stt], R = BYK[x.k] || {};
      return `<tr class="${x.flip ? "flash" : ""}" data-k="${esc(x.k)}"><td class="l">${coinLink(x.k, "/smc")}${mine.has(x.k) ? ' <small class="faint">★</small>' : ""}</td><td>${px(x.E.p)}</td><td class="${cls(R.r1)}">${pct(R.r1, 1)}</td>
        <td class="l"><span class="pill ${sc}">${st}</span> <b class="${x.sd === "long" ? "up" : "down"}">${x.sd === "long" ? "LONG" : "SHORT"}</b></td><td><span class="rt-score sm"><i style="width:${B.score}%"></i></span> ${B.score}</td>
        <td>${px(B.e)}</td><td class="down">${px(B.s)} <small>${pct(-Math.abs(B.e - B.s) / B.e * 100, 1)}</small></td><td class="up">${px(B.t1)}</td><td>${nf(B.rr1, 1)}</td>
        <td class="l"><small>${esc(B.trig ? "⏳ " + B.trig : B.chk.filter((k) => k.ok === 1).sort((a, b) => b.w - a.w).slice(0, 3).map((k) => k.t).join(" · "))}</small></td></tr>`; }).join("") || `<tr><td colspan="10" class="muted">Không có coin nào khớp bộ lọc lúc này.</td></tr>`;
  };
  const scan = async () => {
    if (RD.busy) return; RD.busy = true; const g = RD.gen, tf = O.tf, [a1, a2] = HTF[tf], ks = pick(); let done = 0, fail = 0;
    const st = $("#rdS"); if (st) st.textContent = `đang quét ${ks.length} coin khung ${TFN[tf]}…`;
    const one = async (k) => {
      const r = BYK[k]; if (!r) return;
      try {
        const [L, h1, h2] = await Promise.all([liveKlines(r, TFB[tf][0], 1, 400), htfO(r, {}, a1, 300), a2 ? htfO(r, {}, a2, 200) : null]);
        if (g !== RD.gen) return;
        if (!L) { fail++; return; }
        const E = rtEval(L.o, h1, h2, { tf1: TFN[a1], tf2: TFN[a2], cr: r.cr || [] }); if (!E) return;
        const flip = rtFlip(k, tf, E);
        RD.res.set(k + tf, { k, tf, E, flip });
      } catch (e) { fail++; }
      done++; if (st && g === RD.gen) st.textContent = `quét ${done}/${ks.length} coin khung ${TFN[tf]}${fail ? ` · ${fail} lỗi` : ""}`;
    };
    for (let i = 0; i < ks.length; i += 6) { if (g !== RD.gen) break; await Promise.all(ks.slice(i, i + 6).map(one)); if ($("#rdB")) draw(); }
    if (g === RD.gen) RD.busy = false;
    if (st && g === RD.gen) st.textContent = `${done} coin · khung ${TFN[tf]} · quét lúc ${new Date().toLocaleTimeString("vi-VN")} · tự quét lại mỗi ${TF_SEC[tf] >= 3600 ? 3 : 1} phút`;
  };
  const restart = () => { rdClose(); RD.busy = false; const g = RD.gen; scan(); RD.timer = setInterval(() => { if (g === RD.gen && $("#rdB")) scan(); }, (TF_SEC[O.tf] >= 3600 ? 180 : 60) * 1000); };
  $("#rdT").onchange = (e) => { O.tf = e.target.value; lsSet("rdtf", O.tf); draw(); restart(); };
  $("#rdN").onchange = (e) => { O.n = +e.target.value; lsSet("rdn", O.n); restart(); };
  $("#rdD").onchange = (e) => { O.side = e.target.value; lsSet("rdside", O.side); draw(); };
  $("#rdF").onchange = (e) => { O.st = e.target.value; lsSet("rdst", O.st); draw(); };
  $("#rdGo").onclick = restart;
  $("#rdNt").onchange = async (ev) => { lsSet("rtNtf", ev.target.checked); if (ev.target.checked && "Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) { /* bỏ qua */ } } };
  if (RD.res.size) draw();
  restart();
}

// ================================================================ CẶP COIN – chạy cùng nhau, chạy trễ, giao dịch cặp, sức mạnh so với BTC
const corrCol = (v) => (!isNum(v) ? "transparent" : v >= 0 ? `color-mix(in srgb, var(--up) ${Math.round(Math.max(0, (v - 0.2) / 0.8) * 90)}%, var(--surface))` : `color-mix(in srgb, var(--down) ${Math.round(Math.min(1, -v) * 85)}%, var(--surface))`);
async function viewPairs() {
  const [P] = await Promise.all([load("data/pairs.json"), coins()]);
  const C = P.corr || {}, ks = C.keys || [];
  const heat = ks.length ? `<div class="hmx"><table class="corr"><thead><tr><th></th>${ks.map((k) => `<th><span>${esc(k)}</span></th>`).join("")}</tr></thead><tbody>${ks.map((a, i) => `<tr><th>${esc(a)}</th>${C.m[i].map((v, j) => `<td style="background:${corrCol(v)}" title="${esc(a)} – ${esc(ks[j])}: ${nf(v, 2)}">${i === j ? "" : Math.round((v ?? 0) * 100)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có dữ liệu.</p>`;
  const sl = (k) => `<a href="#/c/${enc(k)}"><b>${esc(k)}</b></a>`;
  const pl = (arr) => `<div class="tw"><table><tbody>${(arr || []).map(([a, b, v]) => `<tr><td class="l">${sl(a)} ↔ ${sl(b)}</td><td><span class="rt-score sm"><i style="width:${Math.max(0, v) * 100}%"></i></span></td><td><b class="${v >= 0.8 ? "up" : v < 0.3 ? "down" : ""}">${nf(v, 2)}</b></td></tr>`).join("")}</tbody></table></div>`;
  const lb = {}; (P.lead || []).filter((x) => x.c0 >= 0.5 && BYK[x.k]).forEach((x) => { if (!lb[x.k] || x.c0 > lb[x.k].c0) lb[x.k] = x; });
  const lead = Object.values(lb).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 30);
  const llTxt = (x) => { const big = Math.abs(x.mv_lead3h) >= 0.5, L = x.lead;
    if (x.gap > 1) return `<b class="down">yếu hơn dự kiến ${pct(x.gap, 1)}</b> – ${big && x.mv_lead3h > 0 ? `chưa bắt kịp đà tăng của ${L}` : `giảm mạnh/riêng so với ${L} (tin hoặc dòng tiền riêng)`}`;
    if (x.gap < -1) return `<b class="up">mạnh hơn dự kiến ${pct(-x.gap, 1)}</b> – ${big && x.mv_lead3h < 0 ? `chưa giảm theo ${L} (giữ giá tốt)` : `chạy riêng so với ${L} (tin hoặc dòng tiền riêng)`}`;
    return "đi đúng nhịp"; };
  const maxLag = Math.max(0, ...(P.lead || []).map((x) => x.clag || 0));
  const pairs = P.pairs || [];
  const rs = (P.rs || []).filter((x) => BYK[x.k]);
  const rsT = (arr) => `<div class="tw"><table><thead><tr><th class="l">Coin</th><th>7 ngày</th><th>30 ngày</th><th>90 ngày</th><th>Giá / BTC 90 ngày</th></tr></thead><tbody>${arr.map((x) => `<tr><td class="l">${coinLink(x.k)}</td><td class="${cls(x.rs7)}">${pct(x.rs7, 1)}</td><td class="${cls(x.rs30)}"><b>${pct(x.rs30, 1)}</b></td><td class="${cls(x.rs90)}">${pct(x.rs90, 0)}</td><td>${spark(x.sp, { w: 110, h: 22 })}</td></tr>`).join("")}</tbody></table></div>`;
  const rsS = rs.slice().sort((a, b) => (b.rs30 ?? -999) - (a.rs30 ?? -999));
  app().innerHTML = `<div class="ph"><h1>Cặp coin – coin nào chạy cùng nhau</h1><span class="meta">cập nhật ${esc(new Date(P.at).toLocaleString("vi-VN"))} · ${ks.length} coin thanh khoản lớn · tương quan lợi nhuận ngày ${C.days || 90} ngày</span></div>
    <div class="g g2w">
      ${panel("🧩 Bản đồ tương quan (số = tương quan × 100)", heat + `<p class="faint" style="font-size:.72rem">Xếp theo mức tương quan với BTC. Xanh đậm = chạy gần như cùng nhau (đa dạng hoá kém, hedge tốt); đỏ = ngược chiều; nhạt = ít liên quan. Altcoin lớn thường tương quan 0,7–0,9 với BTC – khi thị trường sập, gần như mọi thứ giảm cùng lúc.</p>`)}
      <div>${panel("Chạy cùng nhau nhiều nhất", pl(C.top))}${panel("Ít liên quan nhất (đa dạng hoá)", pl(C.low))}</div></div>
    ${panel("⏱️ Coin chạy theo BTC/ETH – đã bắt kịp chưa? (nến 1 giờ, 20 ngày)", `<div class="tw"><table><thead><tr><th class="l">Coin</th><th>Theo</th><th>Tương quan cùng giờ</th><th>Beta</th><th>Trễ tốt nhất</th><th>BTC/ETH 3 giờ qua</th><th>Coin 3 giờ qua</th><th>Lẽ ra (theo beta)</th><th class="l">Nhận xét</th></tr></thead><tbody>${lead.map((x) => `<tr><td class="l">${sl(x.k)}</td><td>${esc(x.lead)}</td><td>${nf(x.c0, 2)}</td><td>${nf(x.beta, 2)}</td><td>${x.lag}h <small class="faint">(${nf(x.clag, 2)})</small></td><td class="${cls(x.mv_lead3h)}">${pct(x.mv_lead3h, 2)}</td><td class="${cls(x.mv3h)}">${pct(x.mv3h, 2)}</td><td class="${cls(x.beta * x.mv_lead3h)}">${pct(x.beta * x.mv_lead3h, 2)}</td><td class="l"><small>${llTxt(x)}</small></td></tr>`).join("")}</tbody></table></div>
      <p class="faint" style="font-size:.74rem">Kết quả nghiên cứu thật: tương quan trễ 1–6 giờ cao nhất chỉ ${nf(maxLag, 2)} (gần 0) – altcoin phản ứng với BTC <b>trong cùng giờ</b>, gần như không có độ trễ khai thác được ở khung 1h. Cột nhận xét so sánh biến động 3 giờ của coin với mức "lẽ ra" theo beta – chỉ cho thấy coin đang lệch nhịp (thường do tin riêng hoặc dòng tiền riêng) – không phải tín hiệu đã kiểm chứng.</p>`)}
    ${panel("⚖️ Giao dịch cặp – chênh lệch giá quay về trung bình", `<div class="tw"><table class="prt"><thead><tr><th class="l">Cặp</th><th>Tương quan</th><th>Beta</th><th>Z-score hiện tại</th><th class="l">Nếu vào</th><th>Số lần (2 năm)</th><th>Quay về</th><th>Lãi TB/lần</th><th>Giữ</th><th>Bán rã</th><th></th></tr></thead><tbody>${pairs.map((x, i) => `<tr data-i="${i}" class="${i === 0 ? "on" : ""}"><td class="l">${sl(x.a)} / ${sl(x.b)}</td><td>${nf(x.corr, 2)}</td><td>${nf(x.beta, 2)}</td><td class="${Math.abs(x.z) >= 2 ? "ref" : ""}"><b>${nf(x.z, 2)}</b></td><td class="l"><small>${Math.abs(x.z) >= 2 ? esc(x.side) : "chưa lệch đủ (|z| < 2)"}</small></td><td>${x.n}</td><td>${nf(x.win, 0)}%</td><td class="${cls(x.avg)}">${pct(x.avg, 2)}</td><td>${nf(x.days, 0)} ngày</td><td>${isNum(x.hl) ? nf(x.hl, 0) + " ngày" : "—"}</td><td>${x.ok ? '<span class="pill brand">đạt</span>' : ""}</td></tr>`).join("")}</tbody></table></div><div id="pz"></div>
      <p class="faint" style="font-size:.74rem">Chênh lệch = log(giá A) − beta × log(giá B). Z-score = chênh lệch hiện tại so với trung bình 60 ngày, đo bằng độ lệch chuẩn. |z| ≥ 2 → Short coin đắt / Long coin rẻ cùng giá trị × beta, thoát khi |z| ≤ 0,5, cắt khi |z| ≥ 3,5 hoặc sau 30 ngày; đã trừ phí 4 chân. "Đạt" = đang lệch ≥ 2, quay về ≥ 60% số lần, lãi TB dương, bán rã ≤ 30 ngày. <b>Kết quả nghiên cứu: phần lớn cặp crypto có lãi trung bình gần 0 hoặc âm</b> – các cặp tương quan cao vẫn có thể "lệch luôn" khi một coin có câu chuyện riêng. Số lần ít (thường < 20) nên chỉ dùng tham khảo, khối lượng nhỏ.</p>`)}
    <div class="g g2">${panel("💪 Mạnh hơn BTC (30 ngày)", rsT(rsS.slice(0, 20)))}${panel("🐢 Yếu hơn BTC (30 ngày)", rsT(rsS.slice(-20).reverse()))}</div>
    <p class="faint disclaimer">Tương quan và quan hệ dẫn – theo thay đổi theo thời gian; không phải lời khuyên đầu tư.</p>`;
  const zc = (i) => { const x = pairs[i]; if (!x) { $("#pz").innerHTML = ""; return; }
    $("#pz").innerHTML = `<h3 style="margin:10px 0 4px">${esc(x.a)} / ${esc(x.b)} – z-score 180 ngày</h3>` + lineSvg([{ color: css("--brand"), pts: (x.series || []).map(([d, v]) => ({ x: fmtD(d), y: v })) }], { h: 170, dec: 1, hlines: [{ y: 2, color: css("--down"), label: "+2: Short " + x.a }, { y: -2, color: css("--up"), label: "−2: Long " + x.a }, { y: 0, color: css("--ink-3") }], bands: [{ lo: 2, hi: 9, color: css("--down") }, { lo: -9, hi: -2, color: css("--up") }] });
    $$(".prt tbody tr").forEach((tr) => tr.classList.toggle("on", +tr.dataset.i === i)); };
  $$(".prt tbody tr").forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest("a")) return; zc(+tr.dataset.i); });
  zc(0);
}

// ================================================================ bản đồ nhiệt thị trường
function heatMap(rows, key = "r1") {
  const xs = rows.filter((r) => r.mc && isNum(r[key])).sort((a, b) => b.mc - a.mc).slice(0, 100);
  if (!xs.length) return "";
  const mx = Math.sqrt(xs[0].mc);
  return `<div class="hmap">${xs.map((r) => { const v = r[key], a = Math.min(88, 12 + Math.abs(v) * (key === "r1" ? 9 : 3)), w = Math.max(1, Math.sqrt(r.mc) / mx * 14);
    return `<a href="#/c/${enc(r.k)}" style="flex:${w.toFixed(2)} 1 ${(46 + w * 9).toFixed(0)}px;background:color-mix(in srgb,var(${v >= 0 ? "--up" : "--down"}) ${a.toFixed(0)}%,var(--surface))" title="${esc(r.n || r.k)} · ${usd(r.mc)}"><b>${esc(r.k)}</b><small>${pct(v, 1)}</small></a>`; }).join("")}</div>`;
}

// ================================================================ ĐA KHUNG THỜI GIAN – khung nhỏ có bị khung lớn (tuần / tháng / quý) chặn không?
const MTF_L = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M", "3M"];
const HZ = [
  { k: "scalp", n: "Lướt giây – phút", tfs: "1s – 5p", own: ["1m", "5m"], p1: "15m", p2: "1h", hold: "vài phút – 1 giờ" },
  { k: "intra", n: "Trong ngày", tfs: "15p – 1h", own: ["15m", "1h"], p1: "4h", p2: "1d", hold: "vài giờ – 1 ngày" },
  { k: "swing", n: "Swing", tfs: "4h – ngày", own: ["4h", "1d"], p1: "1w", p2: "1M", hold: "vài ngày – vài tuần" },
  { k: "pos", n: "Trung hạn", tfs: "tuần – quý", own: ["1w"], p1: "1M", p2: "3M", hold: "vài tuần – vài tháng" },
];
function mtfRow(o) {
  const N = o.c.length, p = o.c[N - 1], c = o.c;
  const e20 = TA.ema(c, 20), e50 = TA.ema(c, Math.min(50, Math.max(5, N - 2))), a = e20[N - 1], b = e50[N - 1];
  let ema = 0;
  if (a != null && b != null) ema = a > b && p > b ? 1 : a < b && p < b ? -1 : 0;
  else if (a != null) ema = p > a ? 1 : -1;
  const S = N >= 40 ? TA.smc(o) : null, st = S ? S.trend : 0;
  const atr = TA.atr(o)[N - 1], rsi = TA.rsi(c)[N - 1];
  let res = null, sup = null;
  if (S) {
    const up = S.hs.slice(-8).map((q) => [q[1], "đỉnh swing"]).concat(S.obs.filter((x) => x.dir === -1 && x.dead == null).map((x) => [x.lo, "OB bán"]), S.liq.filter((q) => q.kind === "EQH").map((q) => [q.p, "EQH"])).filter((x) => x[0] > p).sort((x, y) => x[0] - y[0]);
    const dn = S.ls.slice(-8).map((q) => [q[1], "đáy swing"]).concat(S.obs.filter((x) => x.dir === 1 && x.dead == null).map((x) => [x.hi, "OB mua"]), S.liq.filter((q) => q.kind === "EQL").map((q) => [q.p, "EQL"])).filter((x) => x[0] < p).sort((x, y) => y[0] - x[0]);
    res = up[0] || null; sup = dn[0] || null;
  }
  const ev = S?.events?.[S.events.length - 1];
  return { p, ema, smc: st, bias: ema + st, rsi, pos: S?.pd?.pos, res, sup, ev: ev ? `${ev.type} ${ev.dir === 1 ? "↑" : "↓"}` : null, evAgo: ev ? N - 1 - ev.i : null, atrp: atr / p * 100, n: N };
}
async function mtfLoad(r, D) {
  const M = {};
  await Promise.all(MTF_L.map(async (tf) => {
    let o = null;
    try {
      if (tf === "3M") { const L = await liveKlines(r, "1M", 1, 200); o = L ? aggO(L.o, "q") : serverO(D, "3M"); }
      else { const L = await liveKlines(r, tf, 1, tf === "1M" ? 200 : 500); o = L ? L.o : serverO(D, tf); }
    } catch (e) { o = serverO(D, tf); }
    if (o && o.c?.length >= 12) M[tf] = mtfRow(o);
  }));
  return M;
}
const sg1 = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
function mtfHz(M, h) {
  const own = h.own.map((t) => M[t]?.bias || 0).reduce((x, y) => x + y, 0), b1 = M[h.p1]?.bias ?? 0, b2 = M[h.p2]?.bias ?? 0;
  const side = (sd) => {
    const ao = sg1(own) * sd, a1 = sg1(b1) * sd, a2 = sg1(b2) * sd;
    let size, lbl, txt, c;
    if (a1 > 0 && a2 >= 0) { size = ao > 0 ? 100 : 75; c = "buy"; lbl = "THUẬN"; txt = ao > 0 ? "Khung vào và 2 khung lớn cùng chiều – đánh đủ khối lượng, giữ tới mục tiêu" : "Khung lớn thuận nhưng khung vào chưa quay – chờ khung vào phá cấu trúc (BOS/CHoCH) rồi vào"; }
    else if (a1 > 0 && a2 < 0) { size = 50; c = "brand"; lbl = "THUẬN GẦN – NGƯỢC XA"; txt = `Khung ${TFN[h.p1]} cùng chiều nhưng ${TFN[h.p2]} ngược – chỉ 50% khối lượng, chốt sớm ở cản khung ${TFN[h.p2]}, không gồng`; }
    else if (a1 === 0 && a2 > 0) { size = 50; c = "brand"; lbl = "ĐI NGANG TRONG XU HƯỚNG THUẬN"; txt = `Khung ${TFN[h.p1]} đi ngang, ${TFN[h.p2]} thuận – vào ở biên ${sd === 1 ? "dưới" : "trên"} vùng đi ngang, 50%`; }
    else if (a1 === 0) { size = a2 < 0 ? 0 : 25; c = a2 < 0 ? "sell" : ""; lbl = a2 < 0 ? "NGƯỢC KHUNG XA" : "MỌI KHUNG ĐI NGANG"; txt = a2 < 0 ? `Khung ${TFN[h.p2]} ngược chiều, ${TFN[h.p1]} chưa ủng hộ – không đánh chiều này` : "Chỉ đánh 2 biên vùng giá, khối lượng 25%, chốt nhanh"; }
    else if (a1 < 0 && a2 > 0) { size = 25; c = "warn"; lbl = "ĐIỀU CHỈNH NGƯỢC TRONG XU HƯỚNG LỚN"; txt = `Khung ${TFN[h.p1]} đang ngược nhưng ${TFN[h.p2]} thuận – CHỜ: chỉ vào khi khung vào CHoCH ${sd === 1 ? "tăng" : "giảm"} tại vùng ${sd === 1 ? "Discount / OB mua" : "Premium / OB bán"} của khung lớn; trước đó 0–25%`; }
    else { size = 0; c = "sell"; lbl = "NGƯỢC"; txt = `Cả ${TFN[h.p1]} và ${TFN[h.p2]} ngược chiều – không đánh chiều này (nếu khung vào có tín hiệu thì đó chỉ là nhịp hồi)`; }
    const caps = [h.p1, h.p2].map((t) => (sd === 1 ? M[t]?.res : M[t]?.sup) && { tf: t, p: (sd === 1 ? M[t].res : M[t].sup)[0], k: (sd === 1 ? M[t].res : M[t].sup)[1] }).filter(Boolean).sort((x, y) => sd * (x.p - y.p));
    return { size, lbl, txt, c, cap: caps[0] || null };
  };
  const L = side(1), S = side(-1), best = L.size > S.size ? "long" : S.size > L.size ? "short" : null;
  return { L, S, best };
}
function mtfConflict(M) {
  const ks = MTF_L.filter((t) => M[t]);
  const ar = ks.map((t) => [t, sg1(M[t].bias)]);
  const out = [];
  for (let i = ar.length - 1; i > 0; i--) {
    const [hi, bh] = ar[i]; if (!bh) continue;
    const lo = ar.slice(0, i).reverse().find(([, b]) => b && b !== bh);
    if (lo) { out.push(`Khung <b>${TFN[hi]}</b> ${bh > 0 ? "tăng" : "giảm"} nhưng <b>${TFN[lo[0]]}</b> ${lo[1] > 0 ? "tăng" : "giảm"} → ${bh > 0 ? `nhịp giảm ở ${TFN[lo[0]]} là điều chỉnh trong xu hướng tăng lớn: ưu tiên chờ mua lại ở hỗ trợ khung lớn, Short chỉ lướt ngắn` : `nhịp tăng ở ${TFN[lo[0]]} là hồi trong xu hướng giảm lớn: Long chỉ lướt tới kháng cự khung lớn, ưu tiên Short khi khung nhỏ đảo chiều ở vùng Premium`}`); break; }
  }
  const up = ar.filter(([, b]) => b > 0).length, dn = ar.filter(([, b]) => b < 0).length;
  return { txt: out, up, dn, n: ar.length };
}
const biasTxt = (b) => (b >= 2 ? ["Tăng mạnh", "up"] : b === 1 ? ["Nghiêng tăng", "up"] : b <= -2 ? ["Giảm mạnh", "down"] : b === -1 ? ["Nghiêng giảm", "down"] : ["Ngang / xung đột", "ref"]);
function mtfHtml(M, IJ) {
  const ks = MTF_L.filter((t) => M[t]);
  if (!ks.length) return `<p class="muted">Không tải được nến các khung (trình duyệt không kết nối được Binance/OKX).</p>`;
  const C = mtfConflict(M), p = M[ks[0]].p;
  const strip = `<div class="mtfs">${ks.map((t) => { const b = M[t].bias; return `<div class="mtf-c ${b > 0 ? "u" : b < 0 ? "d" : "n"} ${Math.abs(b) >= 2 ? "s" : ""}"><b>${TFN[t]}</b><small>${biasTxt(b)[0]}</small></div>`; }).join("")}</div>`;
  const lvl = (x) => (x ? `${px(x[0])} <small class="faint">${esc(x[1])} · ${pct((x[0] / p - 1) * 100, 1)}</small>` : "—");
  const tbl = `<div class="tw"><table class="mtft"><thead><tr><th class="l">Khung</th><th class="l">Tổng hợp</th><th>EMA 20/50</th><th>Cấu trúc SMC</th><th>Sự kiện gần nhất</th><th>RSI</th><th>Vị trí biên</th><th>Biến động/nến</th><th class="l">Kháng cự gần</th><th class="l">Hỗ trợ gần</th></tr></thead><tbody>${ks.map((t) => { const x = M[t], [bt, bc] = biasTxt(x.bias);
    return `<tr><td class="l"><b>${TFN[t]}</b></td><td class="l"><b class="${bc}">${bt}</b></td><td>${x.ema > 0 ? '<span class="up">▲</span>' : x.ema < 0 ? '<span class="down">▼</span>' : "–"}</td><td>${x.smc > 0 ? '<span class="up">▲</span>' : x.smc < 0 ? '<span class="down">▼</span>' : "–"}</td><td>${x.ev ? `${esc(x.ev)} <small class="faint">${x.evAgo} nến</small>` : "—"}</td><td class="${x.rsi >= 70 ? "down" : x.rsi <= 30 ? "up" : ""}">${nf(x.rsi, 0)}</td><td class="${x.pos > 55 ? "down" : x.pos < 45 ? "up" : ""}">${!isNum(x.pos) ? "—" : x.pos > 100 ? "vượt đỉnh" : x.pos < 0 ? "thủng đáy" : nf(x.pos, 0) + "%"}</td><td>${nf(x.atrp, 2)}%</td><td class="l">${lvl(x.res)}</td><td class="l">${lvl(x.sup)}</td></tr>`; }).join("")}</tbody></table></div>`;
  const hz = `<div class="hzs">${HZ.map((h) => { const V = mtfHz(M, h), B = V.best ? V[V.best === "long" ? "L" : "S"] : null;
    const one = (sd, X) => `<div class="hz-s"><span class="pill ${X.c}">${sd === 1 ? "LONG" : "SHORT"} · ${X.lbl}</span> <b>${X.size}%</b> khối lượng<p>${esc(X.txt)}</p>${X.cap ? `<small>Trần mục tiêu: ${sd === 1 ? "kháng cự" : "hỗ trợ"} khung ${TFN[X.cap.tf]} ${px(X.cap.p)} (${esc(X.cap.k)}, ${pct((X.cap.p / p - 1) * 100, 1)})</small>` : ""}</div>`;
    return `<div class="hz ${V.best || "none"}"><h4>${esc(h.n)} <small>${esc(h.tfs)} · xét khung ${TFN[h.p1]} + ${TFN[h.p2]} · giữ ${esc(h.hold)}</small></h4>
      <p class="hz-v">${B ? `Nên ưu tiên <b class="${V.best === "long" ? "up" : "down"}">${V.best === "long" ? "LONG" : "SHORT"}</b>` : "<b>Không có chiều nào được khung lớn ủng hộ rõ – đứng ngoài hoặc đánh rất nhỏ</b>"}</p>${one(1, V.L)}${one(-1, V.S)}</div>`; }).join("")}</div>`;
  // nghiên cứu: thiết lập cùng / ngược khung lớn (máy chủ, toàn bộ coin)
  const st = IJ?.stats || {}, reg = IJ?.btc_up ? "up" : "down";
  const cell = (x) => (x && x.n && x.n < 30 ? `<small class="faint">ít mẫu (${x.n})</small>` : x && x.n ? `<span class="${cls(x.avgR)}">${nf(x.avgR, 2)}R</span> <small class="faint">${nf(x.win1, 0)}% · ${nf(x.n, 0)}</small>` : "—");
  const rows = ["d", "h4"].flatMap((tf) => ["_all", ...Object.keys(st[tf] || {}).filter((k) => k !== "_all")].map((s) => { const x = st[tf]?.[s]; if (!x || !(x["h+"] || x["h-"])) return "";
    return `<tr class="${s === "_all" ? "hl" : ""}"><td class="l">${TFV[tf]}</td><td class="l">${s === "_all" ? "<b>Tất cả thiết lập</b>" : esc(IDEA_NAMES[s] || s)}</td><td>${cell(x["h+"])}</td><td>${cell(x["h0"])}</td><td>${cell(x["h-"])}</td><td>${cell(x[reg + "_h+"])}</td><td>${cell(x[reg + "_h-"])}</td></tr>`; })).join("");
  const res = rows ? `<h3 style="margin:14px 0 4px">Kiểm chứng: đánh cùng chiều hay ngược chiều khung lớn thì tốt hơn?</h3>
    <div class="tw"><table><thead><tr><th class="l">Khung vào</th><th class="l">Thiết lập</th><th>Khung lớn cùng chiều</th><th>Lẫn lộn</th><th>Khung lớn ngược</th><th>Cùng chiều · BTC ${IJ.btc_up ? "trên" : "dưới"} MA200</th><th>Ngược · BTC ${IJ.btc_up ? "trên" : "dưới"} MA200</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="faint" style="font-size:.74rem">Khung lớn của khung ngày = tuần + tháng; của khung 4h = ngày + tuần. "Cùng chiều" = cả 2 khung lớn cùng hướng lệnh tại thời điểm tín hiệu (giá so với EMA của các kỳ đã đóng, không nhìn trước). Mỗi ô: lãi TB/lệnh sau phí · tỉ lệ chạm MT1 · số lần. Điều thú vị: thiết lập <b>thuận xu hướng</b> (hồi về Fibonacci, phá đỉnh) cần khung lớn cùng chiều, còn thiết lập <b>đảo chiều</b> (quét thanh khoản đáy) lại tốt nhất khi khung lớn đang giảm – vì đó chính là lúc phe bán bị quét. Vì vậy hệ thống chấm theo số liệu của đúng thiết lập + đúng trạng thái khung lớn, không áp một quy tắc chung.</p>` : "";
  return `${strip}<div class="mtf-sum"><p>${C.up} / ${C.n} khung tăng · ${C.dn} / ${C.n} khung giảm</p>${C.txt.map((t) => `<p>⚠️ ${t}</p>`).join("") || "<p>Các khung không xung đột lớn.</p>"}</div>${hz}${tbl}${res}`;
}
async function mtfMount(D) {
  const el = $("#mtf"); if (!el) return;
  const go = async () => { if (!el.isConnected) return; const M = await mtfLoad(D.row, D); if (!el.isConnected) return; el.innerHTML = mtfHtml(M, D._ij) + `<p class="faint" style="font-size:.7rem">Cập nhật ${new Date().toLocaleTimeString("vi-VN")} · tự làm mới mỗi 60 giây · khung Quý gộp từ nến tháng.</p>`; };
  await go();
  const tm = setInterval(() => { if (!el.isConnected) { clearInterval(tm); return; } go(); }, 60e3);
}

// ================================================================ FUTURES
async function viewFutures(sub) {
  const C = await coins();
  const R = C.rows.filter((r) => r.fx && (r.oi || 0) > 2e6);
  const tbl = (rows, cols) => `<div class="tw"><table><thead><tr>${cols.map((c) => `<th class="${COLS[c][2] || ""}" ${COLS[c][3] ? `title="${esc(COLS[c][3])}"` : ""}>${COLS[c][0]}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${COLS[c][2] || ""}">${COLS[c][1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const by = (k, d = -1, f = () => true, n = 15) => R.filter((r) => isNum(r[k]) && f(r)).sort((a, b) => (a[k] - b[k]) * d).slice(0, n);
  const crowd = R.filter((r) => (r.cr || []).length).sort((a, b) => (b.oi || 0) - (a.oi || 0)).slice(0, 25);
  const carry = by("car", -1, (r) => r.spot && (r.oi || 0) > 5e6, 15);
  app().innerHTML = `<div class="ph"><h1>Futures</h1><span class="meta">${nf(R.length, 0)} hợp đồng có OI > $2 tr · Bitget, OKX, Gate, Hyperliquid (+ OI/long-short Binance theo ngày)</span></div>
    <div class="note"><p><b>Cách đọc nhanh:</b> funding dương cao = phe Long trả phí, đám đông đang Long → dễ bị "xả" khi giá quay đầu. Funding âm = Short đông → dễ bị ép tăng.
    OI tăng cùng giá = tiền mới vào xu hướng; OI tăng mà giá đứng = đòn bẩy dồn tích, sắp có biến động mạnh.</p></div>
    <div class="g g2">
      ${panel("🔥 Funding cao nhất (Long trả phí)", tbl(by("f8"), ["k", "p", "r1", "f8", "f7", "fp", "oi", "oi7"]))}
      ${panel("🧊 Funding thấp nhất (Short trả phí)", tbl(by("f8", 1), ["k", "p", "r1", "f8", "f7", "fp", "oi", "oi7"]))}
      ${panel("📈 OI tăng mạnh 7 ngày", tbl(by("oi7", -1, (r) => (r.oi || 0) > 5e6), ["k", "p", "r7", "oi", "oi24", "oi7", "f8"]))}
      ${panel("📉 OI giảm mạnh 7 ngày (xả đòn bẩy)", tbl(by("oi7", 1, (r) => (r.oi || 0) > 5e6), ["k", "p", "r7", "oi", "oi24", "oi7", "f8"]))}
    </div>
    ${panel("👥 Tín hiệu đám đông", crowd.length ? tbl(crowd, ["k", "p", "r1", "r7", "f8", "fp", "oi7", "lsr", "cr"]) : `<p class="muted">Hiện không có coin nào ở trạng thái đám đông cực đoan.</p>`, "chỉ báo ngược – đám đông thường sai ở cực trị")}
    ${panel("💱 Cơ hội chênh lệch funding (mua spot + bán perp)", carry.length ? tbl(carry, ["k", "p", "car", "f8", "f7", "oi", "vol"]) + `<p class="faint" style="font-size:.74rem">Lãi năm hoá theo funding TB 7 ngày, chưa trừ phí vào/ra (~0,4%). Giữ chân perp đòn bẩy thấp (≤ 2–3x) để không bị thanh lý khi giá tăng vọt. Funding có thể đổi chiều bất cứ lúc nào.</p>` : `<p class="muted">Chưa có cơ hội đáng kể.</p>`)}
    ${panel("Toàn bộ hợp đồng", `<p><a class="btn" href="#/coins/fut">Mở bảng Futures đầy đủ (lọc, sắp xếp) →</a></p>`)}`;
}

// ================================================================ THEO DÕI
const WL = {
  set: new Set(), loaded: false,
  async load() { if (this.loaded) return; const r = await Store.get("watchlist"); this.set = new Set((r.data?.symbols) || []); this.loaded = true; },
  has(k) { return this.set.has(k); },
  async toggle(k) { await this.load(); if (this.set.has(k)) this.set.delete(k); else this.set.add(k); await Store.put("watchlist", { symbols: [...this.set] }); toast(this.set.has(k) ? `Đã theo dõi ${k}` : `Bỏ theo dõi ${k}`); },
};

// ================================================================ DANH MỤC (spot + futures)
let PF = null;
let RISK = null;
async function pfLoad() { const [r, k] = await Promise.all([Store.get("portfolio"), Store.get("risk").catch(() => ({ data: null }))]); PF = r.data && typeof r.data === "object" ? r.data : {}; PF.holdings = PF.holdings || []; PF.futures = PF.futures || []; PF.journal = PF.journal || []; RISK = k && k.data && k.data.at ? k.data : null; return PF; }
async function pfSave() { PF.updated = new Date().toISOString(); await Store.put("portfolio", PF); }
async function viewPortfolio() {
  const C = await coins(); await pfLoad(); await WL.load();
  const P = (k) => BYK[k]?.p;
  let spotV = 0, spotC = 0, futN = 0, futPnl = 0, futMargin = 0, fundDay = 0, netDelta = 0;
  const flags = [];
  const sp = PF.holdings.map((h, i) => {
    const r = BYK[h.symbol] || {}, p = r.p, v = isNum(p) ? h.qty * p : null, c = h.qty * (h.cost || 0), pnl = isNum(v) && h.cost ? v - c : null;
    if (isNum(v)) { spotV += v; netDelta += v; } spotC += c;
    if (r.ts === -1) flags.push([h.symbol, `xu hướng ngày đã chuyển GIẢM – cân nhắc giảm tỷ trọng hoặc phòng hộ`]);
    if (isNum(r.u90) && r.u90 >= 3) flags.push([h.symbol, `mở khoá ${nf(r.u90, 1)}% lượng lưu hành trong 90 ngày tới`]);
    if ((r.cr || []).includes("long_crowded")) flags.push([h.symbol, `phe Long quá đông trên futures (funding ${f8s(r.f8)}) – rủi ro điều chỉnh`]);
    return `<tr><td class="l">${coinLink(h.symbol)}</td><td>${qty(h.qty)}</td><td>${px(h.cost)}</td><td>${px(p)}</td><td>${usd(v)}</td><td class="${cls(pnl)}">${usd(pnl)}<br><small>${h.cost ? pct((p / h.cost - 1) * 100) : ""}</small></td><td>${tsPill(r.ts, r.td)}</td><td>${vdPill(r.vd)}</td><td><button class="chip" data-ch="${i}">Bán hết</button> <button class="chip" data-dh="${i}" title="Xoá dòng (nhập nhầm)">Xoá</button></td></tr>`;
  }).join("");
  const fu = PF.futures.map((f, i) => {
    const r = BYK[f.symbol] || {}, p = r.p, s = f.side === "short" ? -1 : 1, n = isNum(p) ? f.qty * p : null;
    const pnl = isNum(p) ? s * f.qty * (p - f.entry) : null, margin = f.qty * f.entry / (f.lev || 1), roe = pnl != null ? pnl / margin * 100 : null;
    const liq = liqPrice(f.side, f.entry, f.lev || 1), dist = isNum(p) && liq ? (s > 0 ? (p - liq) / p : (liq - p) / p) * 100 : null;
    const fd = isNum(r.f8) && n ? -s * n * r.f8 / 100 * 3 : null;
    if (isNum(n)) { futN += n; netDelta += s * n; } if (isNum(pnl)) futPnl += pnl; futMargin += margin; if (fd) fundDay += fd;
    if (isNum(dist) && dist < 15) flags.push([f.symbol, `vị thế ${f.side} chỉ cách giá thanh lý ${nf(dist, 1)}% – bổ sung ký quỹ hoặc giảm vị thế`]);
    const stopP = f.stop ? Math.abs(f.entry - f.stop) / f.entry * 100 : null;
    const G = levGov(r, f.side, f.tf || "d", stopP);
    f._cap = G.cap;
    if ((f.lev || 1) > G.cap) {
      const needMargin = f.qty * f.entry / G.cap - margin;
      flags.unshift([f.symbol, `🚫 đòn bẩy x${nf(f.lev, 0)} VƯỢT mức hệ thống cho phép x${G.cap} (${G.why[G.why.length - 1] || ""}). Làm 1 trong 2: nạp thêm ${usd(needMargin)} ký quỹ để về x${G.cap}, hoặc giảm vị thế còn ${qty(f.qty * G.cap / f.lev)} ${f.symbol}.`]);
    }
    if (f.stop && isNum(p) && ((s > 0 && p <= f.stop) || (s < 0 && p >= f.stop))) flags.push([f.symbol, `giá đã chạm mức cắt lỗ ${px(f.stop)}`]);
    if (s > 0 && r.ts === -1) flags.push([f.symbol, `đang Long nhưng xu hướng ngày đã giảm`]);
    if (s < 0 && r.ts === 1) flags.push([f.symbol, `đang Short ngược xu hướng tăng ngày`]);
    if (s > 0 && (r.cr || []).includes("long_crowded")) flags.push([f.symbol, `Long trong lúc Long quá đông – funding ${f8s(r.f8)} ăn mòn lãi`]);
    return `<tr><td class="l">${coinLink(f.symbol, "/fut")}</td><td>${f.side === "short" ? '<b class="down">Short</b>' : '<b class="up">Long</b>'} x${nf(f.lev, 0)}${(f.lev || 1) > (f._cap || 99) ? ` <span class="pill sell" title="Vượt mức hệ thống cho phép">tối đa x${f._cap}</span>` : ""}</td><td>${qty(f.qty)}</td><td>${px(f.entry)}</td><td>${px(p)}</td><td>${usd(n)}</td>
      <td class="${cls(pnl)}">${usd(pnl)}<br><small>${pct(roe, 0)} ký quỹ</small></td><td>${px(liq)}<br><small class="${dist < 15 ? "down" : "muted"}">${isNum(dist) ? "cách " + nf(dist, 1) + "%" : ""}</small></td><td>${f.stop ? px(f.stop) : "—"}</td><td class="${cls(fd)}">${fd != null ? usd(fd) + "/ngày" : "—"}</td><td><button class="chip" data-cf="${i}">Đóng</button> <button class="chip" data-df="${i}" title="Xoá dòng (nhập nhầm)">Xoá</button></td></tr>`;
  }).join("");
  const cash = Number(PF.cash || 0), eq = spotV + cash + futMargin + futPnl;
  const wl = [...WL.set].filter((k) => BYK[k]);
  if (eq > 0) { const pk = Math.max(PF.peak || 0, eq); if (pk !== PF.peak || Math.abs((PF.eq || 0) - eq) / eq > 0.01) { PF.peak = pk; PF.eq = eq; pfSave(); } }
  const light = govLight(), pcap = GOV.portLev[light], eff = eq > 0 ? Math.abs(netDelta) / eq : 0, dd = govDD();
  if (eq > 0 && eff > pcap) flags.unshift(["", `🚫 Tổng vị thế ròng x${nf(eff, 2)} tài sản VƯỢT mức hệ thống x${nf(pcap, 1)} (đèn ${LIGHT_VI[light]}). Giảm khoảng ${usd(Math.abs(netDelta) - pcap * eq)} vị thế (bán bớt spot/đóng bớt Long, hoặc mở Short phòng hộ).`]);
  if (eq > 0 && futMargin > GOV.marginMax * eq) flags.unshift(["", `🚫 Tổng ký quỹ ${usd(futMargin)} (${nf(futMargin / eq * 100, 0)}% tài sản) vượt mức 50% – đóng bớt vị thế futures.`]);
  if (PF.futures.length > GOV.maxPos) flags.unshift(["", `🚫 Đang có ${PF.futures.length} vị thế futures, hệ thống chỉ cho tối đa ${GOV.maxPos}.`]);
  const gS = levGov({ k: "BTC", mc: 2e12, atr: BYK.BTC?.atr }, "long", "d", null), gI = levGov({ k: "BTC", mc: 2e12, atr: BYK.BTC?.atr }, "long", "h4", null);
  const govBox = panel("🛡️ Hệ thống đang kiểm soát rủi ro của anh", `${kpis([["Đèn thị trường", LIGHT_VI[light] || "—", light === "green" ? "up" : light === "red" ? "down" : "ref"],
      ["Đòn bẩy tối đa – swing", "x" + gS.cap, "", "Mức trần cho coin lớn nhất; coin nhỏ / biến động mạnh thấp hơn"], ["Đòn bẩy tối đa – lướt", "x" + gI.cap],
      ["Rủi ro mỗi lệnh", nf(gS.risk, 2) + "% vốn", "", `Anh đặt ${nf(setting("risk", 1), 1)}% (trần 2%); hệ thống giảm khi đèn vàng/đỏ hoặc tài khoản sụt`],
      ["Tổng vị thế ròng", `x${nf(eff, 2)} / tối đa x${nf(pcap, 1)}`, eff > pcap ? "down" : "up"], ["Tổng ký quỹ", `${nf(eq > 0 ? futMargin / eq * 100 : 0, 0)}% / tối đa 50%`, futMargin > GOV.marginMax * eq ? "down" : "up"],
      ["Số vị thế futures", `${PF.futures.length} / tối đa ${GOV.maxPos}`, PF.futures.length > GOV.maxPos ? "down" : "up"], ["Sụt so với đỉnh tài sản", pct(-dd, 1), dd >= 10 ? "down" : "", dd >= 20 ? "≥ 20%: khoá đòn bẩy, rủi ro còn 1/4" : dd >= 10 ? "≥ 10%: tối đa x2, rủi ro giảm 1/2" : "Sụt ≥ 10% sẽ tự giảm đòn bẩy & rủi ro"]])}
      ${kpis([["Lãi/lỗ hôm nay", RISK ? pct(RISK.day_pct, 2) : "—", RISK?.day_pct <= -3 ? "down" : cls(RISK?.day_pct), "Mức dừng: −3%/ngày → không mở lệnh mới tới hết ngày (giờ Việt Nam)"],
        ["Lãi/lỗ tuần này", RISK ? pct(RISK.week_pct, 2) : "—", RISK?.week_pct <= -6 ? "down" : cls(RISK?.week_pct), "−6%/tuần → rủi ro mỗi lệnh giảm 1/2 tới hết tuần"],
        ["Chuỗi thua", RISK ? `${RISK.streak} lệnh` : "—", RISK?.streak >= 3 ? "down" : "", "Thua 3 lệnh liên tiếp → rủi ro giảm 1/2 trong 24 giờ"],
        ["Trạng thái", RISK?.halt ? "⛔ DỪNG" : (RISK?.half || []).length ? "⚠️ GIẢM RỦI RO" : "✅ Bình thường", RISK?.halt ? "down" : (RISK?.half || []).length ? "ref" : "up", RISK ? `máy chủ kiểm tra lúc ${new Date(RISK.at + "Z").toLocaleTimeString("vi-VN")}` : "máy chủ chưa kiểm tra lần nào – sau lượt 15 phút tới"]])}
      <p class="faint" style="font-size:.74rem">Anh không tự nâng được đòn bẩy: mọi phiếu lệnh dùng mức trần này (thêm giới hạn theo biến động, vốn hoá, khoảng cắt lỗ, đám đông). Vị thế nhập vào vượt mức sẽ bị đánh dấu đỏ và hệ thống nhắc mỗi 15 phút cho tới khi anh giảm.</p>`);
  app().innerHTML = `<div class="ph"><h1>Danh mục</h1><span class="meta">dữ liệu riêng của anh – lưu trên tài khoản</span></div>
    <section class="panel hero">${kpis([["Tổng tài sản (ước)", usd(eq)], ["Spot", usd(spotV), "", `Giá vốn ${usd(spotC)}`], ["Lãi/lỗ spot", usd(spotV - spotC), cls(spotV - spotC)], ["Tiền mặt / stablecoin", usd(cash)],
      ["Futures: giá trị vị thế", usd(futN)], ["Lãi/lỗ futures", usd(futPnl), cls(futPnl)], ["Ký quỹ đang dùng", usd(futMargin)], ["Funding mỗi ngày", usd(fundDay), cls(fundDay), "Dương = nhận, âm = trả (ước theo funding hiện tại)"],
      ["Độ phơi nhiễm ròng", usd(netDelta), "", "Spot + Long − Short (USD). Gần 0 = đã phòng hộ"], ["Đòn bẩy ròng", eq > 0 ? "x" + nf(Math.abs(netDelta) / eq, 2) : "—"]], true)}</section>
    ${govBox}
    ${flags.length ? panel("⚠️ Cần chú ý", `<ul class="alerts">${flags.map(([k, t]) => `<li>${k ? coinLink(k) : ""} ${esc(t)}</li>`).join("")}</ul>`) : ""}
    ${panel("Spot", `<div class="tw"><table><thead><tr><th class="l">Coin</th><th>Số lượng</th><th>Giá vốn</th><th>Giá</th><th>Giá trị</th><th>Lãi/lỗ</th><th>Xu hướng</th><th>Định giá</th><th></th></tr></thead><tbody>${sp || '<tr><td colspan="9" class="muted">Chưa có coin nào.</td></tr>'}</tbody></table></div>
      <div class="filters"><div class="field"><label>Coin</label><input id="hS" list="coinlist" placeholder="BTC"></div><div class="field"><label>Số lượng</label><input id="hQ" type="number" step="any"></div><div class="field"><label>Giá vốn (USD)</label><input id="hC" type="number" step="any"></div><button class="btn primary" id="hAdd">Thêm / cộng dồn</button>
      <div class="field"><label>Tiền mặt / stablecoin (USD)</label><input id="pCash" type="number" step="any" value="${cash || ""}"></div><button class="btn" id="cSave">Lưu tiền mặt</button></div>`)}
    ${panel("Futures (perp)", `<div class="tw"><table><thead><tr><th class="l">Coin</th><th>Chiều</th><th>Số lượng</th><th>Giá vào</th><th>Giá</th><th>Giá trị</th><th>Lãi/lỗ</th><th>Thanh lý (ước)</th><th>Cắt lỗ</th><th>Funding</th><th></th></tr></thead><tbody>${fu || '<tr><td colspan="11" class="muted">Chưa có vị thế.</td></tr>'}</tbody></table></div>
      <div class="filters"><div class="field"><label>Coin</label><input id="fS" list="coinlist" placeholder="ETH"></div><div class="field"><label>Chiều</label><select id="fSide"><option value="long">Long</option><option value="short">Short</option></select></div>
      <div class="field"><label>Số lượng (coin)</label><input id="fQ" type="number" step="any"></div><div class="field"><label>Giá vào</label><input id="fE" type="number" step="any"></div><div class="field"><label>Đòn bẩy</label><input id="fL" type="number" step="any" value="3"></div><div class="field"><label>Cắt lỗ (tuỳ chọn)</label><input id="fSL" type="number" step="any"></div><button class="btn primary" id="fAdd">Thêm vị thế</button></div>
      <p class="faint" style="font-size:.72rem">Giá thanh lý ước tính theo ký quỹ isolated, tỉ lệ duy trì 0,5%; sàn thực tế (cross margin, bậc rủi ro) có thể khác. Hệ thống chỉ theo dõi, không kết nối tài khoản sàn.</p>`)}
    ${panel("🧾 Kế hoạch đã lưu", (PF.plans || []).length ? `<div class="tw"><table><thead><tr><th class="l">Coin</th><th>Chiều</th><th>Vào</th><th>Giá</th><th>Cắt lỗ</th><th>MT1 / MT2</th><th>Khối lượng</th><th>Hạn MT1</th><th>Trạng thái</th><th></th></tr></thead><tbody>${(PF.plans || []).map((p, i) => {
      const cur = BYK[p.k]?.p, L = p.side === "long", st = !isNum(cur) ? "—" : (L ? cur <= p.s : cur >= p.s) ? '<b class="down">chạm cắt lỗ</b>' : (L ? cur >= p.t2 : cur <= p.t2) ? '<b class="up">chạm MT2</b>' : (L ? cur >= p.t1 : cur <= p.t1) ? '<b class="up">chạm MT1 – chốt 50%, dời SL</b>' : Date.now() > p.tstop ? '<b class="ref">hết thời gian – cân nhắc thoát</b>' : (L ? cur <= p.e : cur >= p.e) || p.order === "market" ? "đã tới vùng vào" : `chờ (cách ${pct((p.e / cur - 1) * 100, 1)})`;
      return `<tr><td class="l">${coinLink(p.k, "/plan")}</td><td>${L ? '<b class="up">Long</b>' : '<b class="down">Short</b>'} ${p.mode === "perp" ? "x" + p.lev : "spot"}</td><td>${px(p.e)}</td><td>${px(cur)}</td><td class="down">${px(p.s)}</td><td class="up">${px(p.t1)} / ${px(p.t2)}</td><td>${qty(p.q)}</td><td><small>${dt(p.tstop)}</small></td><td>${st}</td><td><button class="chip" data-dp="${i}">Xoá</button></td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted">Chưa có kế hoạch. Vào <a href="#/plan">Lên lệnh</a> để tạo, hệ thống sẽ nhắc khi giá tới điểm vào / mục tiêu / cắt lỗ.</p>`)}
    ${panel("📒 Sổ lệnh đã đóng", (PF.journal || []).length ? (() => { const J = PF.journal.slice().reverse(), w = J.filter((j) => j.pnl > 0).length, tot = J.reduce((a, j) => a + (j.pnl || 0), 0);
      return `${kpis([["Số lệnh", nf(J.length, 0)], ["Thắng", nf(w / J.length * 100, 0) + "%"], ["Tổng lãi/lỗ", usd(tot), cls(tot)], ["TB mỗi lệnh (R)", (() => { const R = J.filter((j) => isNum(j.r)); return R.length ? nf(R.reduce((a, j) => a + j.r, 0) / R.length, 2) + "R" : "—"; })()]])}
      <div class="tw" style="max-height:320px"><table><thead><tr><th class="l">Coin</th><th>Chiều</th><th>Vào</th><th>Ra</th><th>Đòn bẩy</th><th>Lãi/lỗ</th><th>R</th><th>Đóng lúc</th></tr></thead><tbody>${J.slice(0, 60).map((j) => `<tr><td class="l">${coinLink(j.k)}</td><td>${j.side === "short" ? '<b class="down">Short</b>' : j.side === "spot" ? "Spot" : '<b class="up">Long</b>'}</td><td>${px(j.entry)}</td><td>${px(j.exit)}</td><td>x${nf(j.lev || 1, 0)}</td><td class="${cls(j.pnl)}">${usd(j.pnl)}</td><td class="${cls(j.r)}">${isNum(j.r) ? nf(j.r, 2) : "—"}</td><td><small>${new Date(j.closed).toLocaleString("vi-VN")}</small></td></tr>`).join("")}</tbody></table></div>`; })()
      : `<p class="muted">Bấm "Đóng" / "Bán hết" ở vị thế để ghi lãi/lỗ thực – hệ thống dùng sổ này để tính lỗ trong ngày và chuỗi thua.</p>`)}
    ${panel("★ Đang theo dõi", wl.length ? `<div class="rows">${wl.map((k) => coinMini(k, `${tsPill(BYK[k].ts)} ${vdPill(BYK[k].vd)}`)).join("")}</div>` : `<p class="muted">Bấm ★ ở trang coin để theo dõi.</p>`)}
    <datalist id="coinlist">${C.rows.slice(0, 800).map((r) => `<option value="${esc(r.k)}">${esc(r.n)}</option>`).join("")}</datalist>`;
  const num = (id) => Number($(id).value);
  $("#hAdd").onclick = async () => {
    const s = $("#hS").value.trim().toUpperCase(), q = num("#hQ"), c = num("#hC") || BYK[s]?.p || 0;
    if (!BYK[s] || !(q > 0)) return toast("Nhập mã coin có trong danh sách và số lượng > 0");
    const h = PF.holdings.find((x) => x.symbol === s);
    if (h) { h.cost = (h.cost * h.qty + c * q) / (h.qty + q); h.qty += q; } else PF.holdings.push({ symbol: s, qty: q, cost: c });
    await pfSave(); viewPortfolio();
  };
  $("#cSave").onclick = async () => { PF.cash = num("#pCash") || 0; await pfSave(); viewPortfolio(); };
  $("#fAdd").onclick = async () => {
    const s = $("#fS").value.trim().toUpperCase(), q = num("#fQ"), e = num("#fE") || BYK[s]?.p, l = num("#fL") || 1, sl = num("#fSL") || null;
    if (!BYK[s] || !(q > 0) || !(e > 0)) return toast("Nhập mã coin, số lượng và giá vào");
    const G = levGov(BYK[s], $("#fSide").value, "d", sl ? Math.abs(e - sl) / e * 100 : null);
    if (l > G.cap && !confirm(`Đòn bẩy x${l} vượt mức hệ thống cho phép x${G.cap} cho ${s}.\n\n${G.why.join("\n")}\n\nVẫn ghi lại vị thế này (hệ thống sẽ nhắc giảm)?`)) return;
    PF.futures.push({ symbol: s, side: $("#fSide").value, qty: q, entry: e, lev: l, stop: sl, opened: new Date().toISOString().slice(0, 10) });
    await pfSave(); viewPortfolio();
  };
  $$("[data-dh]").forEach((b) => b.onclick = async () => { PF.holdings.splice(Number(b.dataset.dh), 1); await pfSave(); viewPortfolio(); });
  $$("[data-df]").forEach((b) => b.onclick = async () => { PF.futures.splice(Number(b.dataset.df), 1); await pfSave(); viewPortfolio(); });
  $$("[data-dp]").forEach((b) => b.onclick = async () => { PF.plans.splice(Number(b.dataset.dp), 1); await pfSave(); viewPortfolio(); });
  // đóng vị thế → ghi sổ lệnh (lãi/lỗ thực), tiền về tiền mặt – để hệ thống tính lỗ ngày/tuần & chuỗi thua
  const askExit = (k, def) => { const v = prompt(`Giá thoát ${k} (để trống = giá hiện tại ${px(def)}):`, ""); if (v === null) return null; const x = Number(String(v).replace(",", ".")); return x > 0 ? x : def; };
  $$("[data-cf]").forEach((b) => b.onclick = async () => {
    const f = PF.futures[Number(b.dataset.cf)], cur = BYK[f.symbol]?.p, x = askExit(f.symbol, cur); if (!x) return;
    const sd = f.side === "short" ? -1 : 1, pnl = sd * f.qty * (x - f.entry) - f.qty * (f.entry + x) * FEE1;
    PF.journal.push({ k: f.symbol, side: f.side, qty: f.qty, entry: f.entry, exit: x, lev: f.lev, stop: f.stop, pnl, r: f.stop ? pnl / (f.qty * Math.abs(f.entry - f.stop)) : null, opened: f.opened, closed: new Date().toISOString() });
    PF.cash = Number(PF.cash || 0) + f.qty * f.entry / (f.lev || 1) + pnl;
    PF.futures.splice(Number(b.dataset.cf), 1); await pfSave(); toast(`Đã đóng ${f.symbol}: ${pnl >= 0 ? "lãi" : "lỗ"} ${usd(Math.abs(pnl))}`); viewPortfolio();
  });
  $$("[data-ch]").forEach((b) => b.onclick = async () => {
    const h = PF.holdings[Number(b.dataset.ch)], cur = BYK[h.symbol]?.p, x = askExit(h.symbol, cur); if (!x) return;
    const pnl = h.qty * (x - (h.cost || x)) - h.qty * x * FEE1 * 2;
    PF.journal.push({ k: h.symbol, side: "spot", qty: h.qty, entry: h.cost, exit: x, lev: 1, pnl, closed: new Date().toISOString() });
    PF.cash = Number(PF.cash || 0) + h.qty * (h.cost || x) + pnl;
    PF.holdings.splice(Number(b.dataset.ch), 1); await pfSave(); toast(`Đã bán ${h.symbol}: ${pnl >= 0 ? "lãi" : "lỗ"} ${usd(Math.abs(pnl))}`); viewPortfolio();
  });
}

// ================================================================ CÔNG CỤ
async function viewTools(sub) {
  await coins();
  const acct = setting("acct", 10000), rk = setting("risk", 1), ml = setting("maxlev", 3), mli = setting("maxlevi", 5);
  app().innerHTML = `<div class="ph"><h1>Công cụ</h1></div>
  <div class="g g2">
    ${panel("⚙️ Thông số của anh", `<div class="filters"><div class="field"><label>Vốn giao dịch (USD)</label><input id="tA" type="number" value="${acct}"></div><div class="field"><label>Rủi ro mỗi lệnh (% vốn)</label><input id="tR" type="number" step="0.1" value="${rk}"></div>
      <button class="btn primary" id="tSave">Lưu</button></div>
      <p class="faint" style="font-size:.74rem">Rủi ro tối đa 2%/lệnh. <b>Đòn bẩy do hệ thống kiểm soát</b> – xem chi tiết ở <a href="#/portfolio">Danh mục</a>. Khi đã nhập danh mục, hệ thống dùng tổng tài sản thực thay cho vốn giao dịch.</p>`)}
    ${panel("🧮 Khối lượng lệnh & giá thanh lý", `<div class="filters"><div class="field"><label>Coin (tự điền giá)</label><input id="cS" list="coinlist2" placeholder="SOL"></div><div class="field"><label>Giá vào</label><input id="cE" type="number" step="any"></div><div class="field"><label>Cắt lỗ</label><input id="cSL" type="number" step="any"></div>
      <div class="field"><label>Đòn bẩy</label><input id="cL" type="number" step="any" value="${ml}"></div><div class="field"><label>Tỉ lệ ký quỹ duy trì (%)</label><input id="cM" type="number" step="0.1" value="0.5"></div></div><div id="cOut"></div>`)}
    ${panel("🛡️ Phòng hộ spot bằng perp", `<div class="filters"><div class="field"><label>Coin đang giữ</label><input id="hS2" list="coinlist2" placeholder="SOL"></div><div class="field"><label>Giá trị đang giữ (USD)</label><input id="hV" type="number" step="any" value="10000"></div>
      <div class="field"><label>Tỉ lệ phòng hộ (%)</label><input id="hP" type="number" value="50"></div><div class="field"><label>Phòng hộ bằng</label><select id="hW"><option value="self">Chính coin đó</option><option value="btc">BTC perp (theo beta)</option></select></div></div><div id="hOut"></div>`)}
    ${panel("📐 Chốt lời / R:R", `<div class="filters"><div class="field"><label>Giá vào</label><input id="rE" type="number" step="any"></div><div class="field"><label>Cắt lỗ</label><input id="rS" type="number" step="any"></div><div class="field"><label>Chốt lời</label><input id="rT" type="number" step="any"></div><div class="field"><label>Phí 1 chiều (%)</label><input id="rF" type="number" step="0.01" value="0.05"></div></div><div id="rOut"></div>`)}
  </div><datalist id="coinlist2">${COINS.rows.slice(0, 800).map((r) => `<option value="${esc(r.k)}">`).join("")}</datalist>`;
  $("#tSave").onclick = async () => { const rk = Math.min(2, Math.max(0.1, Number($("#tR").value) || 1)); await saveSettings({ acct: Number($("#tA").value) || 10000, risk: rk }); toast(rk < Number($("#tR").value) ? "Rủi ro tối đa 2%/lệnh – đã giới hạn" : "Đã lưu thông số"); viewTools(); };
  const calc = () => {
    const e = Number($("#cE").value), s = Number($("#cSL").value), l = Number($("#cL").value) || 1, m = (Number($("#cM").value) || 0.5) / 100;
    if (!(e > 0)) { $("#cOut").innerHTML = ""; return; }
    const liqL = liqPrice("long", e, l, m), liqS = liqPrice("short", e, l, m);
    let h = kpis([["Thanh lý nếu Long", px(liqL), "", `cách ${nf((e - liqL) / e * 100, 1)}%`], ["Thanh lý nếu Short", px(liqS), "", `cách ${nf((liqS - e) / e * 100, 1)}%`]]);
    if (s > 0 && s !== e) {
      const z = sizing(Number(setting("acct", 10000)), Number(setting("risk", 1)), e, s, l);
      const liq = liqPrice(z.side, e, l, m), bad = z.side === "long" ? liq >= s : liq <= s;
      h += kpis([["Chiều", z.side === "long" ? '<b class="up">Long</b>' : '<b class="down">Short</b>'], ["Khối lượng", qty(z.q)], ["Giá trị lệnh", usd(z.notional)], ["Ký quỹ", usd(z.margin), z.marginPct > 50 ? "down" : "", `${nf(z.marginPct, 0)}% vốn`], ["Lỗ tối đa", usd(z.riskUsd), "down"], ["Khoảng cắt lỗ", nf(Math.abs(e - s) / e * 100, 2) + "%"]]);
      if (bad) h += `<p class="down">⚠️ Giá thanh lý ${px(liq)} nằm trước cắt lỗ – giảm đòn bẩy xuống ≤ x${nf(Math.floor(1 / (Math.abs(e - s) / e + m + 0.003)), 0)}.</p>`;
      if (z.marginPct > 100) h += `<p class="down">Ký quỹ vượt vốn – cắt lỗ quá gần hoặc rủi ro quá lớn so với vốn.</p>`;
      const rr = BYK[$("#cS").value.trim().toUpperCase()];
      if (rr) { const G = levGov(rr, z.side, "d", Math.abs(e - s) / e * 100); if (l > G.cap) h += `<p class="down">🚫 Hệ thống chỉ cho tối đa <b>x${G.cap}</b> với ${esc(rr.k)} lúc này (${esc(G.why[G.why.length - 1] || "")}). Đòn bẩy x${nf(l, 0)} sẽ bị đánh dấu vi phạm trong Danh mục.</p>`; else h += `<p class="up">✓ Trong mức hệ thống cho phép (tối đa x${G.cap}).</p>`; }
    }
    $("#cOut").innerHTML = h;
  };
  ["#cE", "#cSL", "#cL", "#cM"].forEach((id) => $(id).addEventListener("input", calc));
  $("#cS").addEventListener("change", () => { const r = BYK[$("#cS").value.trim().toUpperCase()]; if (r) { $("#cE").value = r.p; calc(); } });
  const hcalc = () => {
    const r = BYK[$("#hS2").value.trim().toUpperCase()], v = Number($("#hV").value) || 0, p = (Number($("#hP").value) || 0) / 100, w = $("#hW").value;
    if (!r) { $("#hOut").innerHTML = `<p class="muted">Chọn coin.</p>`; return; }
    const b = BYK.BTC;
    const n = w === "btc" ? v * p * (r.beta || 1) : v * p, f8 = w === "btc" ? b?.f8 : r.f8;
    const qn = w === "btc" ? n / (b?.p || 1) : n / r.p;
    $("#hOut").innerHTML = kpis([["Bán perp", `${qty(qn)} ${w === "btc" ? "BTC" : esc(r.k)}`], ["Giá trị Short", usd(n)], ["Beta dùng", w === "btc" ? nf(r.beta, 2) : "1"], ["Funding", isNum(f8) ? (f8 >= 0 ? `<b class="up">nhận ~${usd(n * f8 / 100 * 3)}/ngày</b>` : `<b class="down">trả ~${usd(-n * f8 / 100 * 3)}/ngày</b>`) : "—"],
      ["Còn phơi nhiễm", usd(v - (w === "btc" ? n / (r.beta || 1) : n))]]) + (w === "btc" && r.k !== "BTC" ? `<p class="faint" style="font-size:.74rem">Phòng hộ chéo bằng BTC chỉ khử phần biến động chung (tương quan với BTC); phần riêng của ${esc(r.k)} vẫn còn.</p>` : "") +
      (r.fx ? "" : `<p class="down">${esc(r.k)} không có perp trên các sàn theo dõi – chỉ phòng hộ được bằng BTC.</p>`);
  };
  ["#hS2", "#hV", "#hP", "#hW"].forEach((id) => $(id).addEventListener("input", hcalc));
  const rcalc = () => {
    const e = Number($("#rE").value), s = Number($("#rS").value), t = Number($("#rT").value), f = (Number($("#rF").value) || 0) / 100;
    if (!(e > 0 && s > 0 && t > 0)) { $("#rOut").innerHTML = ""; return; }
    const R = Math.abs(e - s), W = Math.abs(t - e), fee = e * f * 2;
    const rr = (W - fee) / (R + fee), be = 1 / (1 + rr) * 100;
    $("#rOut").innerHTML = kpis([["R:R sau phí", nf(rr, 2)], ["Tỉ lệ thắng hoà vốn", nf(be, 0) + "%", "", "Cần thắng ít nhất bằng tỉ lệ này để không lỗ"], ["Lời", pct(W / e * 100, 2)], ["Lỗ", pct(-R / e * 100, 2)]]);
  };
  ["#rE", "#rS", "#rT", "#rF"].forEach((id) => $(id).addEventListener("input", rcalc));
  if (sub === "hedge") $("#hS2").focus();
}

// ================================================================ KIỂM CHỨNG
async function viewBacktest() {
  const B = await load("data/backtest.json"); await coins();
  const T = B.trend || {};
  const rows = (T.rows || []).filter((r) => BYK[r.key] && (BYK[r.key].mc || 0) > 3e8);
  const fz = (B.fng?.rows || []).filter((r) => r.reg === "all");
  app().innerHTML = `<div class="ph"><h1>Kiểm chứng</h1><span class="meta">các quy tắc dùng trên trang, chạy lại trên dữ liệu lịch sử – có phí, trượt giá, funding</span></div>
  <div class="g g2">
    ${panel("📈 Theo xu hướng (Long khi giá > EMA50 > …, thoát dưới EMA50)", `${kpis([["Số coin kiểm chứng", nf(T.n, 0)], ["Lãi/năm (trung vị)", pct(T.cagr, 0), cls(T.cagr)], ["Mua & giữ (trung vị)", pct(T.bh_cagr, 0), cls(T.bh_cagr)], ["Sụt tối đa (trung vị)", pct(T.mdd, 0), "down"], ["Mua & giữ sụt tối đa", pct(T.bh_mdd, 0), "down"],
      ["Thắng mua & giữ", nf(T.beat, 0) + "% số coin"], ["Sụt giảm nhỏ hơn", nf(T.dd_better, 0) + "% số coin"], ["Thời gian có lệnh", nf(T.expo, 0) + "%"]])}
      <p>Ý nghĩa: quy tắc xu hướng không phải để "lãi nhiều nhất" mà để <b>né các đợt sụt 70–90%</b> của altcoin. Phần lớn altcoin mua & giữ đều lỗ nặng; đi theo xu hướng giữ tiền ở ngoài khi thị trường giảm.</p>
      <div class="tw" style="max-height:420px"><table><thead><tr><th class="l">Coin</th><th>Năm</th><th>Lãi/năm</th><th>Mua & giữ</th><th>Sụt tối đa</th><th>Mua & giữ sụt</th><th>Lệnh</th><th>Thắng</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="l">${coinLink(r.key, "/plan")}</td><td>${nf(r.years, 1)}</td><td class="${cls(r.cagr)}">${pct(r.cagr, 0)}</td><td class="${cls(r.bh_cagr)}">${pct(r.bh_cagr, 0)}</td><td class="down">${pct(r.mdd, 0)}</td><td class="down">${pct(r.bh_mdd, 0)}</td><td>${nf(r.trades, 0)}</td><td>${nf(r.win, 0)}%</td></tr>`).join("")}</tbody></table></div>`)}
    <div>${panel("😨 Mua khi sợ hãi? (BTC từ " + esc((B.fng?.since || "").slice(0, 4)) + ")", `<div class="tw"><table><thead><tr><th class="l">Vùng</th><th>Số ngày</th><th>30 ngày sau</th><th>90 ngày sau</th><th>180 ngày sau</th><th>Xác suất tăng 90n</th><th>Xấu nhất 10% (90n)</th></tr></thead><tbody>
      ${fz.map((r) => `<tr><td class="l">${esc(r.zone)}</td><td>${nf(r.days, 0)}</td><td class="${cls(r.med30)}">${pct(r.med30, 0)}</td><td class="${cls(r.med90)}">${pct(r.med90, 0)}</td><td class="${cls(r.med180)}">${pct(r.med180, 0)}</td><td>${nf(r.win90, 0)}%</td><td class="down">${pct(r.p10_90, 0)}</td></tr>`).join("")}
      <tr class="faint"><td class="l">Mọi thời điểm</td><td></td><td>${pct(B.fng?.base?.med30, 0)}</td><td>${pct(B.fng?.base?.med90, 0)}</td><td>${pct(B.fng?.base?.med180, 0)}</td><td>${nf(B.fng?.base?.win90, 0)}%</td><td></td></tr></tbody></table></div>
      <p class="faint" style="font-size:.74rem">Lợi nhuận trung vị của BTC sau khi chỉ số Sợ hãi & Tham lam ở từng vùng. Tách theo BTC trên/dưới MA200 ở trang Thị trường.</p>`)}
    ${panel("₿ MVRV và lợi nhuận 1 năm sau (từ 2014)", `<div class="tw"><table><thead><tr><th class="l">MVRV</th><th>Số ngày</th><th>Trung vị 1 năm</th><th>Xác suất tăng</th></tr></thead><tbody>${(B.mvrv || []).map((z) => `<tr><td class="l">${esc(z.zone)}</td><td>${nf(z.n, 0)}</td><td class="${cls(z.med1y)}">${pct(z.med1y, 0)}</td><td>${nf(z.win, 0)}%</td></tr>`).join("")}</tbody></table></div>`)}</div>
  </div>`;
}

async function viewHelp() {
  app().innerHTML = `<div class="ph"><h1>Hướng dẫn</h1></div>${panel("Hệ thống làm gì", `<ul class="why">
    <li><b>Định giá thực tế:</b> dùng phí/doanh thu on-chain (DefiLlama), phần về tay người giữ token, áp lực mở khoá và lạm phát cung, so với nhóm cùng ngành; hỏi ngược "giá hiện tại cần dòng tiền tăng bao nhiêu %/năm". Bitcoin định giá bằng MVRV, giá vốn toàn mạng, mô hình luỹ thừa.</li>
    <li><b>Theo xu hướng (đòn bẩy thấp):</b> tín hiệu khung ngày, cắt lỗ 2×ATR, kiểm chứng lịch sử từng coin.</li>
    <li><b>Lướt trong ngày:</b> xu hướng 4h, điểm vào 1h quanh EMA20, cắt lỗ 1,5×ATR, chốt 1,5R/2,5R.</li>
    <li><b>Phòng hộ / basis:</b> beta với BTC, funding khi bán perp, cơ hội carry (mua spot + bán perp).</li>
    <li><b>Futures:</b> funding, OI, basis gộp Bitget/OKX/Gate/Hyperliquid; OI & long/short Binance theo ngày.</li>
    <li>Cập nhật mỗi 4 giờ. Hệ thống <b>không</b> kết nối tài khoản sàn, không đặt lệnh.</li></ul>`)}`;
}

// ================================================================ khung: giao diện, tìm kiếm, dải giá
function initTheme() {
  $("#theme").onclick = () => { const dark = document.documentElement.dataset.theme === "dark"; document.documentElement.dataset.theme = dark ? "light" : "dark"; lsSet("theme", document.documentElement.dataset.theme); route(); };
}
function initSearch() {
  const q = $("#q"), box = $("#sugg");
  let sel = 0, list = [];
  const pick = (s) => { box.hidden = true; q.value = ""; location.hash = `#/c/${s}`; };
  q.addEventListener("input", async () => {
    const t = q.value.trim().toUpperCase();
    if (!t) { box.hidden = true; return; }
    const C = await coins();
    list = C.rows.filter((r) => r.k.startsWith(t) || String(r.n || "").toUpperCase().includes(t)).sort((a, b) => (b.k === t) - (a.k === t) || (b.k.startsWith(t) - a.k.startsWith(t)) || (b.mc || 0) - (a.mc || 0)).slice(0, 8);
    sel = 0;
    box.innerHTML = list.map((r, i) => `<a href="#/c/${r.k}" class="${i === 0 ? "on" : ""}"><b>${r.k}</b><span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.76rem">${esc(r.n || "")}</span><span style="margin-left:auto">${px(r.p)}</span><small class="${cls(r.r1)}">${pct(r.r1, 1)}</small></a>`).join("") || `<div class="muted" style="padding:10px">Không thấy coin</div>`;
    box.hidden = false;
  });
  q.addEventListener("keydown", (e) => {
    if (box.hidden || !list.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { sel = (sel + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length; $$("a", box).forEach((a, i) => a.classList.toggle("on", i === sel)); e.preventDefault(); }
    if (e.key === "Enter") { pick(list[sel].k); e.preventDefault(); }
    if (e.key === "Escape") box.hidden = true;
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) box.hidden = true; });
  box.addEventListener("click", () => { box.hidden = true; q.value = ""; });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
}
async function drawTicker() {
  const C = await tryLoad("data/coins.json"); if (!C) return;
  COINS = COINS || C; BYK = BYK || Object.fromEntries(C.rows.map((r) => [r.k, r]));
  const ks = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "HYPE"];
  $("#ticker").innerHTML = ks.filter((k) => BYK[k]).map((k) => `<a href="#/c/${k}"><span data-tk="${k}"><b>${k}</b>${px(BYK[k].p)} <i class="${cls(BYK[k].r1)}">${pct(BYK[k].r1, 1)}</i></span></a>`).join("");
  tickerWs();
  const age = (Date.now() - new Date(C.at)) / 60000;
  $("#upd").textContent = age < 90 ? `${Math.round(age)} phút trước` : `${Math.round(age / 60)} giờ trước`;
  $("#upd").title = "Dữ liệu cập nhật lúc " + new Date(C.at).toLocaleString("vi-VN");
}

// ================================================================ TÀI KHOẢN, THÔNG BÁO, QUẢN TRỊ (dùng chung hạ tầng với vn-stock)
let ME = null, PLANS = null, PERSONAL;
const multiUser = () => !!ME && !ME.legacy;
const can = (f) => !ME || ME.legacy || (ME.features || []).includes("*") || (ME.features || []).includes(f);
const isAdmin = () => !ME || ME.legacy || ME.role === "admin";
async function fetchMe() {
  try {
    const r = await fetch("api/auth/me", { cache: "no-store" });
    if (r.status === 401) return null;
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) { const j = await r.json(); return j.legacy ? { ...j.me, legacy: true } : j.me; }
  } catch (e) { /* chạy trên máy, không có API */ }
  return { legacy: true, role: "admin", features: ["*"] };
}
async function plansData() { if (!PLANS) { try { PLANS = await (await fetch("api/auth/plans")).json(); } catch (e) { PLANS = { plans: {}, feature_names: {}, order: [] }; } } return PLANS; }
const featName = (f) => (PLANS?.feature_names || {})[f] || f;
async function api(path, method = "GET", body) {
  const r = await fetch("api/" + path, { method, cache: "no-store", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  let j = {};
  try { j = await r.json(); } catch (e) { /* rỗng */ }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// ---- khoá tính năng theo gói
function lockBox(feature, title, small = false) {
  return `<section class="panel lockp ${small ? "sm" : ""}"><div class="ph"><h2>🔒 ${esc(title || featName(feature))}</h2><span class="pill brand">Gói Pro</span></div>
    <p class="muted">${small ? "Phần này dành cho gói Pro." : "Tính năng này dành cho thành viên gói Pro."} Gói hiện tại của anh/chị: <b>${esc(ME?.plan_name || "Miễn phí")}</b>.</p>
    <a class="btn primary" href="#/account">Xem quyền lợi các gói</a></section>`;
}
async function lockView(feature) {
  await plansData();
  app().innerHTML = lockBox(feature) + `<section class="panel sec">${planTable()}</section>`;
}
function planTable() {
  const P = PLANS || { plans: {}, order: [] }, ks = P.order || Object.keys(P.plans);
  const feats = [...new Set(ks.flatMap((k) => P.plans[k].features))];
  return `<div class="ph"><h2>Quyền lợi theo gói</h2></div><div class="tw"><table><thead><tr><th class="l">Tính năng</th>${ks.map((k) => `<th class="${ME?.eff_plan === k ? "brand" : ""}">${esc(P.plans[k].name)}${ME?.eff_plan === k ? " ✓" : ""}</th>`).join("")}</tr></thead><tbody>
    ${feats.map((f) => `<tr><td class="l">${esc(featName(f))}</td>${ks.map((k) => `<td>${P.plans[k].features.includes(f) ? '<b class="up">✓</b>' : '<span class="faint">—</span>'}</td>`).join("")}</tr>`).join("")}
    <tr><td class="l">Số mã trong danh mục / theo dõi / cảnh báo đang bật</td>${ks.map((k) => { const L = P.plans[k].limits || {}; return `<td>${L.holdings} / ${L.watch} / ${L.alerts}</td>`; }).join("")}</tr>
  </tbody></table></div>`;
}


// ---- chuông thông báo
const NK = { idea: "🎯", liq: "🚨", stop: "🛑", trend: "🔀", crowd: "👥", unlock: "🔓", alert: "🔔", light: "🚦", carry: "💱", system: "ℹ️", admin: "🛠️" };
const NKIND = { idea: "Cơ hội có lợi thế mới (coin đang giữ/theo dõi + mạnh nhất)", liq: "Vị thế futures gần giá thanh lý / vượt đòn bẩy", stop: "Giá chạm mức cắt lỗ của vị thế", trend: "Xu hướng coin đang giữ đảo chiều", crowd: "Đám đông futures cực đoan ở coin đang giữ",
  unlock: "Mở khoá token lớn ở coin đang giữ", alert: "Cảnh báo giá", light: "Đèn thị trường đổi màu", carry: "Cơ hội chênh lệch funding mới" };
const agoShort = (iso) => { const m = (Date.now() - new Date(iso)) / 60000; return m < 1 ? "vừa xong" : m < 60 ? `${Math.round(m)} phút` : m < 1440 ? `${Math.round(m / 60)} giờ` : new Date(iso).toLocaleDateString("vi-VN"); };
function ntfRow(n) {
  const url = /^event/.test(n.kind || "") && /^#\/s\/[A-Z0-9]+$/.test(n.url || "") ? n.url + "/ev" : n.url;   // thông báo sự kiện → mở biểu đồ đúng đợt
  return `<a class="ntf ${n.read_at ? "" : "new"} sev${n.sev || 0}" href="${esc(url || "#/notifications")}" data-nid="${n.id}"><span class="ni">${NK[n.kind] || "•"}</span>
    <span class="nb"><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ""}</span><time>${agoShort(n.created_at)}</time></a>`;
}
let __bellN = 0;
async function bellCount() {
  if (!multiUser() || document.hidden) return;
  try { const j = await api("notifications/count"); __bellN = j.unread || 0; const b = $("#bellN"); if (b) { b.textContent = __bellN > 99 ? "99+" : __bellN; b.hidden = !__bellN; } } catch (e) { /* bỏ qua */ }
}
async function bellOpen() {
  let box = $("#bellBox");
  if (box) { box.remove(); return; }
  box = document.createElement("div"); box.id = "bellBox"; box.className = "menu bellbox";
  box.style.top = Math.round(($("#bell")?.getBoundingClientRect().bottom || 40) + 6) + "px";
  box.innerHTML = `<div class="ph"><h3>Thông báo</h3><button class="chip" id="bellAll">Đánh dấu đã đọc</button></div><div class="ntfs"><p class="muted">Đang tải…</p></div><a class="more" href="#/notifications">Xem tất cả</a>`;
  document.body.appendChild(box);
  const j = await api("notifications?limit=15").catch(() => ({ items: [] }));
  box.querySelector(".ntfs").innerHTML = (j.items || []).map(ntfRow).join("") || `<p class="muted">Chưa có thông báo nào. Hệ thống báo khi mã của anh/chị chạm mức thoát, cảnh báo giá, có tín hiệu mới…</p>`;
  bindNtf(box);
  $("#bellAll").onclick = async () => { await api("notifications/read", "POST", { all: true }); box.remove(); bellCount(); };
  setTimeout(() => document.addEventListener("click", function off(e) { if (!box.contains(e.target) && e.target.closest("#bell") == null) { box.remove(); document.removeEventListener("click", off); } }), 0);
}
function bindNtf(root) {
  $$("[data-nid]", root).forEach((a) => a.addEventListener("click", () => { if (a.classList.contains("new")) api("notifications/read", "POST", { ids: [Number(a.dataset.nid)] }).then(bellCount).catch(() => {}); $("#bellBox")?.remove(); }));
}
async function viewNotifications() {
  if (!multiUser()) { app().innerHTML = `<div class="empty">Thông báo trên web có khi trang chạy chế độ nhiều người dùng. Hiện thông báo gửi qua Telegram (nếu đã cài).</div>`; return; }
  let items = [], more = true;
  const draw = () => {
    const by = {};
    items.forEach((n) => { const d = new Date(n.created_at).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }); (by[d] = by[d] || []).push(n); });
    app().innerHTML = `<div class="ph"><h1>Thông báo</h1><span class="meta"><button class="btn" id="nAll">Đánh dấu tất cả đã đọc</button> <button class="btn" id="nDel">Xoá thông báo đã đọc</button> <a class="btn" href="#/account">Cài đặt nhận thông báo</a></span></div>
      ${Object.entries(by).map(([d, L]) => `<section class="panel sec"><div class="ph"><h3>${esc(d)}</h3></div><div class="ntfs">${L.map(ntfRow).join("")}</div></section>`).join("") || '<div class="empty">Chưa có thông báo nào.</div>'}
      ${more ? '<button class="btn" id="nMore" style="margin-top:10px">Xem thêm</button>' : ""}`;
    bindNtf(app());
    $("#nAll").onclick = async () => { await api("notifications/read", "POST", { all: true }); items.forEach((n) => (n.read_at = n.read_at || "x")); draw(); bellCount(); };
    $("#nDel").onclick = async () => { await api("notifications", "DELETE"); items = items.filter((n) => !n.read_at); draw(); };
    if ($("#nMore")) $("#nMore").onclick = load_;
  };
  const load_ = async () => { const j = await api(`notifications?limit=50${items.length ? "&before=" + items[items.length - 1].id : ""}`); items = items.concat(j.items || []); more = (j.items || []).length === 50; draw(); };
  await load_();
}

// ---- thông báo đẩy
const u8 = (b64) => { const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function pushState() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return { ok: false, why: /iPhone|iPad/.test(navigator.userAgent) ? "Trên iPhone/iPad: bấm Chia sẻ → Thêm vào Màn hình chính, mở trang từ biểu tượng đó rồi bật lại." : "Trình duyệt này không hỗ trợ thông báo đẩy." };
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { ok: true, on: !!sub && Notification.permission === "granted", perm: Notification.permission, sub };
}
async function pushEnable() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Chưa cho phép thông báo trên trình duyệt này");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const { key } = await api("push/key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
  await api("push/subscribe", "POST", sub.toJSON());
}
async function pushDisable() {
  const st = await pushState();
  if (st.sub) { await api("push/unsubscribe", "POST", { endpoint: st.sub.endpoint }).catch(() => {}); await st.sub.unsubscribe(); }
}

// ---- trang tài khoản
async function viewAccount() {
  await plansData();
  if (!multiUser()) { app().innerHTML = `<div class="ph"><h1>Tài khoản</h1></div><div class="panel"><p>Trang đang chạy chế độ một chủ sở hữu (đăng nhập qua Cloudflare Access). Khi bật chế độ nhiều người dùng (gắn cơ sở dữ liệu D1), mỗi người có tài khoản, danh mục và thông báo riêng.</p></div><section class="panel sec">${planTable()}</section>`; return; }
  const [np, ps, subs] = await Promise.all([api("notify").catch(() => ({})), pushState(), api("push/list").catch(() => ({ subs: [] }))]);
  const N = { push: np.push || "normal", email: np.email || "important", email_to: np.email_to || "", kinds: np.kinds || {} };
  const lv = (k, v) => `<select id="${k}">${[["all", "Tất cả"], ["normal", "Bình thường (bỏ tin nhỏ)"], ["important", "Chỉ việc quan trọng"], ["off", "Tắt"]].map(([a, b]) => `<option value="${a}" ${v === a ? "selected" : ""}>${b}</option>`).join("")}</select>`;
  app().innerHTML = `<div class="ph"><h1>Tài khoản</h1><span class="meta">${esc(ME.email)}</span></div>
  <div class="g g2">
    <section class="panel"><div class="ph"><h2>Thông tin</h2><span class="pill ${ME.eff_plan === "pro" ? "buy" : ""}">Gói ${esc(ME.plan_name || ME.eff_plan)}</span></div>
      ${kpis([["Email", esc(ME.email)], ["Gói", esc(ME.plan_name || ME.eff_plan) + (ME.plan_until ? ` <small>đến ${esc(ME.plan_until)}</small>` : "")], ["Vai trò", ME.role === "admin" ? "Quản trị" : "Thành viên"],
        ["Đăng nhập", [ME.has_pw ? "mật khẩu" : "", ME.google ? "Google" : ""].filter(Boolean).join(" + ") || "—"]], false, "c2")}
      <div class="filters" style="margin-top:8px"><div class="field"><label for="acName">Tên hiển thị</label><input id="acName" value="${esc(ME.name || "")}"></div><button class="btn" id="acSave">Lưu tên</button></div></section>
    <section class="panel"><div class="ph"><h2>Bảo mật</h2></div>
      <div class="filters">${ME.has_pw ? `<div class="field"><label for="pwOld">Mật khẩu hiện tại</label><input id="pwOld" type="password" autocomplete="current-password"></div>` : ""}
        <div class="field"><label for="pwNew">Mật khẩu mới (≥ 8 ký tự)</label><input id="pwNew" type="password" autocomplete="new-password"></div><button class="btn" id="pwSave">${ME.has_pw ? "Đổi mật khẩu" : "Đặt mật khẩu"}</button></div>
      <p style="margin-top:10px"><button class="btn" id="acOut">Đăng xuất</button> <button class="btn" id="acOutAll">Đăng xuất mọi thiết bị</button></p></section>
  </div>
  <section class="panel sec"><div class="ph"><h2>Nhận thông báo</h2><span class="meta">chuông trên web luôn bật</span></div>
    <div class="g g2">
      <div><h3>Thông báo đẩy (điện thoại / máy tính)</h3>
        ${!can("notify_push") ? `<p class="muted">🔒 Thông báo đẩy dành cho gói Pro.</p>` : !ps.ok ? `<p class="note">${esc(ps.why)}</p>`
          : `<p>Trên thiết bị này: <b class="${ps.on ? "up" : "muted"}">${ps.on ? "đang bật" : ps.perm === "denied" ? "bị chặn trong cài đặt trình duyệt" : "chưa bật"}</b> ${ps.on ? '<button class="btn" id="puOff">Tắt</button> <button class="btn" id="puTest">Gửi thử</button>' : '<button class="btn primary" id="puOn">Bật trên thiết bị này</button>'}</p>
          <p class="faint" style="font-size:.74rem">Đang bật trên ${nf((subs.subs || []).length, 0)} thiết bị. Thông báo đẩy được gửi ngay sau mỗi lượt cập nhật (4 giờ/lần).</p>`}
        <div class="field"><label for="nPush">Mức gửi đẩy</label>${lv("nPush", N.push)}</div></div>
      <div><h3>Email</h3>${!can("notify_email") ? `<p class="muted">🔒 Thông báo qua email dành cho gói Pro.</p>` : ""}
        <div class="field"><label for="nEmail">Mức gửi email</label>${lv("nEmail", N.email)}</div>
        <div class="field"><label for="nTo">Gửi tới</label><input id="nTo" type="email" placeholder="${esc(ME.email)}" value="${esc(N.email_to)}"></div></div>
    </div>
    <h3 style="margin-top:10px">Loại thông báo</h3>
    <div class="nkinds">${Object.entries(NKIND).map(([k, t]) => `<label><input type="checkbox" data-nk="${k}" ${N.kinds[k] === false ? "" : "checked"}> ${NK[k] || ""} ${esc(t)}</label>`).join("")}</div>
    <p style="margin-top:8px"><button class="btn primary" id="nSave">Lưu cài đặt thông báo</button></p>
    <p class="faint" style="font-size:.72rem">“Quan trọng” = vị thế gần giá thanh lý, chạm cắt lỗ, xu hướng coin đang giữ đảo chiều, cảnh báo giá. “Bình thường” thêm đám đông futures cực đoan, mở khoá token lớn, đèn thị trường.</p></section>
  <section class="panel sec">${planTable()}<p class="muted" style="margin-top:6px">Muốn nâng cấp hoặc gia hạn gói, liên hệ quản trị viên.</p></section>`;
  $("#acSave").onclick = async () => { try { const j = await api("auth/profile", "POST", { name: $("#acName").value }); ME = { ...ME, ...j.me }; toast("Đã lưu"); } catch (e) { toast(e.message); } };
  $("#pwSave").onclick = async () => { try { await api("auth/password", "POST", { old: $("#pwOld")?.value || "", new: $("#pwNew").value }); toast("Đã đổi mật khẩu"); viewAccount(); } catch (e) { toast(e.message); } };
  $("#acOut").onclick = logout;
  $("#acOutAll").onclick = async () => { await api("auth/logout_all", "POST").catch(() => {}); clearLocal(); location.href = "/login"; };
  if ($("#puOn")) $("#puOn").onclick = async () => { try { await pushEnable(); toast("Đã bật thông báo đẩy"); viewAccount(); } catch (e) { toast(e.message); } };
  if ($("#puOff")) $("#puOff").onclick = async () => { await pushDisable(); toast("Đã tắt trên thiết bị này"); viewAccount(); };
  if ($("#puTest")) $("#puTest").onclick = async () => { const reg = await navigator.serviceWorker.getRegistration("/"); reg?.showNotification("MyBit", { body: "Thông báo đẩy hoạt động trên thiết bị này.", icon: "/icon.svg" }); };
  $("#nSave").onclick = async () => {
    const kinds = Object.fromEntries($$("[data-nk]").map((x) => [x.dataset.nk, x.checked]));
    try { await api("notify", "PUT", { push: $("#nPush").value, email: $("#nEmail").value, email_to: $("#nTo").value.trim(), kinds, updated: new Date().toISOString() }); toast("Đã lưu cài đặt thông báo"); } catch (e) { toast(e.message); }
  };
}
function clearLocal() { ["portfolio", "watchlist", "cfilter"].forEach((k) => { try { localStorage.removeItem("mybit_" + k); } catch (e) { /* bỏ qua */ } }); }
async function logout() { await api("auth/logout", "POST").catch(() => {}); clearLocal(); location.href = "/login"; }

// ---- trang quản trị
async function viewAdmin(sub = "users") {
  if (!multiUser() || ME.role !== "admin") { app().innerHTML = `<div class="empty">Chỉ quản trị viên (chế độ nhiều người dùng).</div>`; return; }
  const tabs = [["users", "Người dùng"], ["invites", "Mã mời"], ["config", "Cấu hình"], ["audit", "Nhật ký"]];
  const st = await api("admin/stats").catch(() => ({}));
  const head = `<div class="ph"><h1>Quản trị</h1><span class="meta">${nf(st.users, 0)} tài khoản · ${nf(st.active, 0)} hoạt động · <b class="${st.pending ? "ref" : ""}">${nf(st.pending, 0)} chờ duyệt</b> · ${nf(st.pro, 0)} Pro · ${nf(st.active7, 0)} vào web 7 ngày · ${nf(st.push, 0)} thiết bị nhận đẩy · ${nf(st.notif7, 0)} thông báo 7 ngày</span></div>
    <div class="views" style="margin-top:0">${tabs.map(([k, n]) => `<a class="btn ${k === sub ? "primary" : ""}" href="#/admin/${k}">${n}</a>`).join("")}</div>`;
  if (sub === "users") {
    const j = await api("admin/users");
    const P = j.plans || {};
    const sel = (id, k, v, opts) => `<select data-u="${id}" data-k="${k}">${opts.map(([a, b]) => `<option value="${a}" ${v === a ? "selected" : ""}>${esc(b)}</option>`).join("")}</select>`;
    app().innerHTML = head + `<section class="panel sec"><div class="tw"><table class="admt"><thead><tr><th class="l">Email / tên</th><th>Trạng thái</th><th>Gói</th><th>Hết hạn</th><th>Vai trò</th><th class="l">Ghi chú</th><th>Tạo</th><th>Vào gần nhất</th><th>Đẩy</th><th></th></tr></thead><tbody>
      ${j.users.map((u) => `<tr class="${u.status === "pending" ? "pend" : ""}"><td class="l"><b>${esc(u.email)}</b><br><small class="muted">${esc(u.name || "")}${u.google ? " · Google" : ""}${u.invite ? " · mã " + esc(u.invite) : ""}</small></td>
        <td>${sel(u.id, "status", u.status, [["active", "Hoạt động"], ["pending", "Chờ duyệt"], ["disabled", "Khoá"]])}</td>
        <td>${sel(u.id, "plan", u.plan, Object.entries(P))}</td><td><input type="date" data-u="${u.id}" data-k="plan_until" value="${esc(u.plan_until || "")}"></td>
        <td>${sel(u.id, "role", u.role, [["user", "Thành viên"], ["admin", "Quản trị"]])}</td><td class="l"><input data-u="${u.id}" data-k="note" value="${esc(u.note || "")}" style="width:140px"></td>
        <td><small>${esc((u.created_at || "").slice(0, 10))}</small></td><td><small>${u.last_seen ? agoShort(u.last_seen) : "—"}</small></td><td>${nf(u.push, 0)}</td>
        <td><button class="btn" data-save="${u.id}">Lưu</button> <button class="chip" data-rst="${u.id}" title="Tạo liên kết đặt lại mật khẩu (72 giờ)">Link đặt MK</button></td></tr>`).join("")}</tbody></table></div>
      <p class="faint" style="font-size:.72rem;margin-top:4px">Khoá tài khoản hoặc đổi vai trò sẽ đăng xuất người đó khỏi mọi thiết bị. Gói hết hạn tự về Miễn phí.</p><div id="rstOut"></div></section>`;
    $$("[data-save]").forEach((b) => (b.onclick = async () => {
      const id = b.dataset.save, body = { id: Number(id) };
      $$(`[data-u="${id}"]`).forEach((x) => (body[x.dataset.k] = x.value));
      try { await api("admin/user", "POST", body); toast("Đã lưu"); } catch (e) { toast(e.message); }
    }));
    $$("[data-rst]").forEach((b) => (b.onclick = async () => { const r = await api("admin/reset_link", "POST", { id: Number(b.dataset.rst) }); $("#rstOut").innerHTML = `<p class="note">Gửi liên kết này cho người dùng (hết hạn sau ${r.hours} giờ):<br><input readonly value="${esc(r.link)}" style="width:100%" onclick="this.select()"></p>`; }));
    return;
  }
  if (sub === "invites") {
    const [j, p] = await Promise.all([api("admin/invites"), plansData()]);
    const base = location.origin + "/login#invite=";
    app().innerHTML = head + `<section class="panel sec"><div class="ph"><h2>Tạo mã mời</h2></div>
      <div class="filters"><div class="field"><label>Mã (để trống = tự tạo)</label><input id="ivCode" placeholder="VD: BETA2026"></div>
        <div class="field"><label>Gói</label><select id="ivPlan">${Object.entries(p.plans).map(([k, v]) => `<option value="${k}" ${k === "pro" ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Số ngày dùng gói (trống = không hạn)</label><input id="ivDays" type="number" value="30" style="width:90px"></div>
        <div class="field"><label>Số lượt dùng mã</label><input id="ivMax" type="number" value="5" style="width:80px"></div>
        <div class="field"><label>Mã hết hạn ngày</label><input id="ivExp" type="date"></div>
        <div class="field"><label>Ghi chú</label><input id="ivNote" placeholder="nhóm thử nghiệm…"></div><button class="btn primary" id="ivAdd">Tạo</button></div></section>
      <section class="panel sec"><div class="tw"><table><thead><tr><th class="l">Mã</th><th>Gói</th><th>Ngày dùng</th><th>Đã dùng</th><th>Hết hạn</th><th class="l">Ghi chú</th><th class="l">Liên kết mời</th><th></th></tr></thead><tbody>
        ${j.invites.map((v) => `<tr><td class="l"><b>${esc(v.code)}</b></td><td>${esc((p.plans[v.plan] || {}).name || v.plan)}</td><td>${v.days ? nf(v.days, 0) : "∞"}</td><td>${v.uses}/${v.max_uses}</td><td>${esc(v.expires_at || "—")}</td>
          <td class="l">${esc(v.note || "")}</td><td class="l"><input readonly value="${esc(base + v.code)}" onclick="this.select()" style="width:260px"></td><td><button class="chip" data-ivdel="${esc(v.code)}">Xoá</button></td></tr>`).join("") || '<tr><td colspan="8" class="muted">Chưa có mã mời.</td></tr>'}</tbody></table></div></section>`;
    $("#ivAdd").onclick = async () => { try { const r = await api("admin/invites", "POST", { code: $("#ivCode").value, plan: $("#ivPlan").value, days: $("#ivDays").value, max_uses: $("#ivMax").value, expires_at: $("#ivExp").value, note: $("#ivNote").value }); toast("Đã tạo mã " + r.code); viewAdmin("invites"); } catch (e) { toast(e.message); } };
    $$("[data-ivdel]").forEach((b) => (b.onclick = async () => { await api("admin/invites?code=" + enc(b.dataset.ivdel), "DELETE"); viewAdmin("invites"); }));
    return;
  }
  if (sub === "config") {
    const j = await api("admin/config"), C = j.config;
    const f = (k, label, hint = "", type = "text") => `<div class="field"><label for="cf_${k}">${label}</label><input id="cf_${k}" type="${type}" value="${esc(C[k] || "")}" placeholder="${esc(hint)}"></div>`;
    app().innerHTML = head + `<section class="panel sec"><div class="ph"><h2>Đăng ký & đăng nhập</h2></div>
      <div class="filters"><div class="field"><label for="cf_signup_mode">Đăng ký</label><select id="cf_signup_mode"><option value="invite" ${C.signup_mode !== "open" ? "selected" : ""}>Cần mã mời / chờ duyệt</option><option value="open" ${C.signup_mode === "open" ? "selected" : ""}>Mở tự do (gói Miễn phí)</option></select></div>
        ${f("google_client_id", "Google OAuth Client ID", "xxxx.apps.googleusercontent.com")}${f("site_url", "Địa chỉ trang", "https://my-bit.pages.dev")}</div>
      <p class="faint" style="font-size:.72rem">Google Client ID: Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web), thêm “Authorized JavaScript origins” = địa chỉ trang. ${j.env.GOOGLE_CLIENT_ID ? "Đang dùng biến môi trường GOOGLE_CLIENT_ID." : ""}</p></section>
      <section class="panel sec"><div class="ph"><h2>Email gửi thông báo</h2></div>
      <div class="filters">${f("mail_from", "Người gửi", "MyBit <ban@gmail.com>")}${f("smtp_host", "Máy chủ SMTP", "smtp.gmail.com")}${f("smtp_port", "Cổng", "465")}${f("smtp_user", "Tài khoản SMTP", "ban@gmail.com")}${f("smtp_pass", "Mật khẩu ứng dụng", "16 ký tự", "password")}${f("resend_key", "Resend API key (tuỳ chọn)", "re_…", "password")}</div>
      <p class="faint" style="font-size:.72rem">Gmail: bật xác minh 2 bước → myaccount.google.com/apppasswords → tạo “Mật khẩu ứng dụng”, dán vào ô trên (không dùng mật khẩu Gmail thường). Email thông báo gửi từ các lượt chạy; email đặt lại mật khẩu tức thì cần Resend (có tên miền riêng) – nếu chưa có, người dùng bấm “Quên mật khẩu” sẽ tạo yêu cầu để anh gửi liên kết từ trang Người dùng.</p>
      <p><button class="btn primary" id="cfSave">Lưu cấu hình</button></p></section>`;
    $("#cfSave").onclick = async () => { const b = {}; $$("[id^=cf_]").forEach((x) => (b[x.id.slice(3)] = x.value)); try { await api("admin/config", "POST", b); toast("Đã lưu cấu hình"); } catch (e) { toast(e.message); } };
    return;
  }
  const j = await api("admin/audit");
  app().innerHTML = head + `<section class="panel sec"><div class="tw"><table><thead><tr><th>Lúc</th><th class="l">Người</th><th>Việc</th><th class="l">Chi tiết</th></tr></thead><tbody>
    ${j.audit.map((a) => `<tr><td><small>${esc(new Date(a.at).toLocaleString("vi-VN"))}</small></td><td class="l">${esc(a.email || "—")}</td><td>${esc(a.action)}</td><td class="l wrap"><small>${esc(a.detail || "")}</small></td></tr>`).join("")}</tbody></table></div></section>`;
}

// ---- bản tin thị trường
function initAccountUI() {
  if (!multiUser()) return;
  const th = $("#theme");
  const bell = document.createElement("button");
  bell.className = "iconbtn bell"; bell.id = "bell"; bell.title = "Thông báo"; bell.setAttribute("aria-label", "Thông báo");
  bell.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg><span id="bellN" hidden></span>`;
  const meb = document.createElement("button");
  meb.className = "iconbtn mebtn"; meb.id = "meBtn"; meb.title = ME.email; meb.setAttribute("aria-label", "Tài khoản");
  meb.textContent = ((ME.name || ME.email || "?").trim()[0] || "?").toUpperCase();
  th.parentNode.insertBefore(bell, th); th.parentNode.insertBefore(meb, th);
  bell.onclick = (e) => { e.stopPropagation(); bellOpen(); };
  meb.onclick = (e) => {
    e.stopPropagation();
    let m = $("#meMenu"); if (m) { m.remove(); return; }
    m = document.createElement("div"); m.id = "meMenu"; m.className = "menu memenu";
    m.style.top = Math.round(meb.getBoundingClientRect().bottom + 6) + "px";
    m.innerHTML = `<div class="mh"><b>${esc(ME.name || ME.email)}</b><small>${esc(ME.email)}</small><span class="pill ${ME.eff_plan === "pro" ? "buy" : ""}">Gói ${esc(ME.plan_name || ME.eff_plan)}${ME.plan_until ? " · đến " + esc(ME.plan_until) : ""}</span></div>
      <a href="#/notifications">🔔 Thông báo</a><a href="#/account">⚙️ Tài khoản & cài đặt</a><a href="#/help">❓ Hướng dẫn & FAQ</a>${ME.role === "admin" ? '<a href="#/admin">🛠️ Quản trị</a>' : ""}<button id="meOut">↩ Đăng xuất</button>`;
    document.body.appendChild(m);
    $("#meOut").onclick = logout;
    m.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => m.remove()));
    setTimeout(() => document.addEventListener("click", function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("click", off); } }), 0);
  };
  // khoá tab theo gói
  const tabF = { backtest: "backtest" };
  $$("#tabs a").forEach((a) => { const f = tabF[a.dataset.r]; if (f && !can(f)) a.classList.add("locked"); });
  if (!can("pdf")) $("#pdfBtn")?.remove();
  bellCount(); setInterval(bellCount, 120000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) bellCount(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

(async function main() {
  ME = await fetchMe();
  if (!ME) { location.replace("/login?next=" + encodeURIComponent("/" + location.hash)); return; }
  initTheme(); initSearch(); initAccountUI(); plansData();
  try {
    const meta = await load("data/meta.json?x=" + Date.now());
    window.__ver = meta.ver || "";
    $("#brandDot").style.background = "var(--brand)";
  } catch (e) { /* chưa có dữ liệu */ }
  loadSettings().catch(() => {});
  pfLoad().catch(() => {});
  drawTicker().then(() => liveData()).catch(() => {});
  setInterval(() => liveData(true), 120000);
  WL.load().catch(() => {});
  window.addEventListener("hashchange", route);
  route();
})();
