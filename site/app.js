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
const qty = (x) => (isNum(x) ? (Math.abs(x) >= 1000 ? nf(x, 0) : Math.abs(x) >= 1 ? nf(x, 3) : nf(x, 6)) : "—");
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
function disposeCharts() { while (charts.length) { try { charts.pop().remove(); } catch (e) { /* đã huỷ */ } } }
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
  if (!COINS) { COINS = await load("data/coins.json"); BYK = Object.fromEntries(COINS.rows.map((r) => [r.k, r])); }
  return COINS;
}
const coinLink = (k, sub = "") => { const r = BYK?.[k]; return `<a href="#/c/${enc(k)}${sub}" class="ck"><b>${esc(k)}</b>${r && r.n && r.n.toUpperCase() !== k ? `<small>${esc(r.n)}</small>` : ""}</a>`; };
function coinMini(k, extra = "") {
  const r = BYK?.[k]; if (!r) return "";
  return `<a class="row" href="#/c/${enc(k)}"><div class="rm"><b>${esc(k)}</b><small class="muted">${esc(r.n || "")}</small></div><div class="rv"><span>${px(r.p)}</span><small class="${cls(r.r1)}">${pct(r.r1)}</small></div>${extra ? `<div class="rx">${extra}</div>` : ""}</a>`;
}

// ================================================================ THỊ TRƯỜNG
const LIGHT_VI = { green: "Xanh", yellow: "Vàng", red: "Đỏ" };
async function viewMarket() {
  const [M] = await Promise.all([load("data/market.json"), coins()]);
  const b = M.btc || {}, cy = M.cycle || {}, F = M.fng || {}, P = M.play || {}, L = M.light || {}, A = M.agg || {}, G = M.global || {};
  const lst = M.lists || {};
  const dom = G.dom || {};
  const mvrvS = (cy.mvrv_series || []).filter((_, i, a) => i > a.length - 900);
  const pl = cy.pl;
  const zoneTbl = (cy.mvrv_fwd || []).map((z) => `<tr class="${z.zone === cy.mvrv_zone ? "hl" : ""}"><td class="l">${esc(z.zone)}</td><td>${nf(z.n, 0)}</td><td class="${cls(z.med1y)}">${pct(z.med1y, 0)}</td><td>${nf(z.win, 0)}%</td></tr>`).join("");
  const st = F.study || {};
  const fngRows = (st.rows || []).filter((r) => r.reg !== "all");
  const fngTbl = ["Sợ hãi tột độ", "Sợ hãi", "Trung lập", "Tham lam", "Tham lam tột độ"].map((z) => {
    const u = fngRows.find((r) => r.zone === z && r.reg === "up") || {}, d = fngRows.find((r) => r.zone === z && r.reg === "down") || {};
    const cur = z === F.zone;
    return `<tr class="${cur ? "hl" : ""}"><td class="l">${esc(z)}${cur ? " ◀" : ""}</td><td class="${cls(u.med90)}">${pct(u.med90, 0)}</td><td>${isNum(u.win90) ? nf(u.win90, 0) + "%" : "—"}</td><td class="${cls(d.med90)}">${pct(d.med90, 0)}</td><td>${isNum(d.win90) ? nf(d.win90, 0) + "%" : "—"}</td><td class="faint">${nf((u.days || 0) + (d.days || 0), 0)}</td></tr>`;
  }).join("");
  const br = M.breadth || {};
  const brS = (br.series || []);
  const list = (keys, fn) => (keys || []).map((k) => coinMini(k, fn(BYK[k] || {}))).join("") || `<p class="muted">—</p>`;
  app().innerHTML = `
  <div class="ph"><h1>Thị trường crypto</h1><span class="meta">cập nhật ${esc(new Date(M.at).toLocaleString("vi-VN"))} · ${nf(M.counts?.coins, 0)} coin (${nf(M.counts?.fut, 0)} có futures)</span></div>
  <section class="panel hero light-${L.color}"><div class="ph"><h2>🚦 Đèn thị trường: ${LIGHT_VI[L.color] || "—"}</h2><span class="meta">${esc(L.text || "")}</span></div>
    ${kpis([["BTC", `$${nf(b.price, 0)}`, "", ""], ["So với MA200", pct(b.dist200), cls(b.dist200), `MA200 = $${nf(b.ma200, 0)}`], ["Xu hướng", b.state === "up" ? "Tăng" : b.state === "down" ? "Giảm" : "Chuyển tiếp", b.state === "up" ? "up" : b.state === "down" ? "down" : "ref", `${b.above200 ? "Trên" : "Dưới"} MA200 ${b.run_days} ngày`],
      ["7 / 30 / 90 ngày", `<span class="${cls(b.r7)}">${pct(b.r7, 0)}</span> / <span class="${cls(b.r30)}">${pct(b.r30, 0)}</span> / <span class="${cls(b.r90)}">${pct(b.r90, 0)}</span>`], ["Cách đỉnh", pct(b.from_ath), "down", `Đỉnh $${nf(b.ath, 0)}`],
      ["Coin trên MA200", isNum(br.above200) ? nf(br.above200, 0) + "%" : "—", br.above200 >= 50 ? "up" : br.above200 < 30 ? "down" : "ref", "Độ rộng thị trường – top 300"], ["Mùa altcoin", isNum(M.alt?.idx) ? nf(M.alt.idx, 0) + "/100" : "—", "", `% top 50 tăng tốt hơn BTC trong 90 ngày (BTC ${pct(M.alt?.btc_r, 0)})`],
      ["BTC dominance", isNum(dom.btc) ? nf(dom.btc, 1) + "%" : "—"]], true)}
  </section>
  <div class="g g2">
    ${panel(`😨 Tâm lý: ${esc(F.zone || "—")} (${isNum(F.now) ? F.now : "—"}/100)`, `
      ${gauge(F.now, 0, 100)}<p class="faint" style="font-size:.72rem;margin-top:-4px">0 = sợ hãi tột độ · 100 = tham lam tột độ (alternative.me)</p>
      <div class="play"><h3>${esc(P.head || "")}</h3><ul>${(P.lines || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <h3 style="margin-top:10px">BTC 90 ngày sau, theo vùng tâm lý <small class="muted">(dữ liệu từ ${esc((st.since || "").slice(0, 4))})</small></h3>
      <div class="tw"><table><thead><tr><th class="l">Vùng</th><th colspan="2">BTC trên MA200<br><small>trung vị · xác suất tăng</small></th><th colspan="2">BTC dưới MA200<br><small>trung vị · xác suất tăng</small></th><th>Số ngày</th></tr></thead><tbody>${fngTbl}</tbody></table></div>
      ${lineSvg([{ name: "Sợ hãi & Tham lam", color: css("--brand"), pts: (F.series || []).map(([d, v]) => ({ x: fmtD(d), y: v })) }], { h: 140, min: 0, max: 100, bands: [{ lo: 0, hi: 25, color: css("--up") }, { lo: 75, hi: 100, color: css("--down") }], dec: 0 })}`,
      "nên làm gì khi sợ hãi / hưng phấn")}
    ${panel("₿ Chu kỳ Bitcoin – định giá on-chain", `
      ${kpis([["MVRV", nf(cy.mvrv, 2), cy.mvrv < 1 ? "up" : cy.mvrv > 3 ? "down" : "", "Vốn hoá thị trường / vốn hoá thực (giá vốn trung bình của mọi BTC đang lưu hành)"],
        ["Giá vốn toàn mạng", `$${nf(cy.realized_price, 0)}`, "", "Realized price – giá trung bình mà từng BTC được giao dịch lần cuối"],
        ["MVRV cao hơn", isNum(cy.mvrv_pctl) ? `${nf(cy.mvrv_pctl, 0)}% lịch sử` : "—", "", "Phân vị MVRV hiện tại trong toàn bộ lịch sử từ 2014"],
        ["Mayer (giá/MA200)", nf(cy.mayer, 2), cy.mayer < 0.8 ? "up" : cy.mayer > 2.4 ? "down" : "", "< 0,8 lịch sử là vùng rẻ; > 2,4 là vùng quá nóng"],
        pl ? ["Mô hình luỹ thừa", `$${nf(pl.fair, 0)}`, "", `Giá trị xu hướng dài hạn (power-law). Dải 5–95%: $${nf(pl.lo, 0)} – $${nf(pl.hi, 0)}. Sau 1 năm: $${nf(pl.fair_1y, 0)}`] : null,
        pl ? ["Vị trí trong dải", nf(pl.pos, 0) + "/100", pl.pos < 25 ? "up" : pl.pos > 75 ? "down" : "", "0 = sát đáy lịch sử của mô hình, 100 = sát đỉnh"] : null])}
      ${lineSvg([{ name: "MVRV", color: css("--brand"), pts: mvrvS.map(([d, v]) => ({ x: fmtD(d), y: v })) }], { h: 150, dec: 1, hlines: [{ y: 1, label: "1 = vùng đáy", color: css("--up") }, { y: 3, label: "3 = vùng đỉnh", color: css("--down") }] })}
      <h3>BTC 1 năm sau theo vùng MVRV <small class="muted">(từ 2014)</small></h3>
      <div class="tw"><table><thead><tr><th class="l">MVRV</th><th>Số ngày</th><th>Trung vị 1 năm</th><th>Xác suất tăng</th></tr></thead><tbody>${zoneTbl}</tbody></table></div>
      <p class="faint" style="font-size:.74rem">Bitcoin không có dòng tiền như cổ phiếu → định giá bằng hành vi người nắm giữ: khi giá cao gấp 3 lần giá vốn trung bình, người có lãi chốt lời ồ ạt (đỉnh); khi giá dưới giá vốn, người bán đã kiệt sức (đáy).</p>`,
      "MVRV · giá vốn · power-law")}
  </div>
  <div class="g g3">
    ${panel("💧 Thanh khoản & đòn bẩy", `${kpis([["Stablecoin lưu hành", usd(M.stable?.now), "", "Tổng cung stablecoin (USD) – 'tiền chờ' trong hệ sinh thái"], ["30 ngày", pct(M.stable?.c30, 2), cls(M.stable?.c30), "Stablecoin tăng = tiền mới vào thị trường"], ["90 ngày", pct(M.stable?.c90, 2), cls(M.stable?.c90)],
      ["Funding TB (theo OI)", f8s(A.f8), f8c(A.f8), "Mức funding trung bình 8 giờ, gia quyền theo OI các coin"], ["Tổng OI futures", usd(A.oi), "", "Bitget + OKX + Gate + Hyperliquid (chưa gồm Binance/Bybit)"], ["OI / vốn hoá", isNum(A.oi_mc) ? nf(A.oi_mc, 2) + "%" : "—", "", "Đòn bẩy so với quy mô thị trường"],
      ["Biến động kỳ vọng BTC (DVOL)", nf(M.dvol_btc?.now, 1), "", `Cao hơn ${nf(M.dvol_btc?.pctl, 0)}% thời gian 1 năm qua`]])}
      ${lineSvg([{ name: "Stablecoin (tỷ USD)", color: css("--up"), pts: (M.stable?.series || []).map(([d, v]) => ({ x: fmtD(d), y: v })) }], { h: 120, dec: 0 })}`)}
    ${panel("📊 Độ rộng thị trường", `${lineSvg([{ name: "% trên MA50", color: css("--brand"), pts: brS.map(([d, a]) => ({ x: fmtD(d), y: a })) }, { name: "% trên MA200", color: css("--ref"), pts: brS.map(([d, , c]) => ({ x: fmtD(d), y: c })) }], { h: 170, min: 0, max: 100, dec: 0 })}
      <p class="faint" style="font-size:.74rem">Tỷ lệ coin (top 300 vốn hoá) đang trên đường trung bình. Dưới 20% thường là vùng đáy rộng; trên 80% là hưng phấn diện rộng.</p>`)}
    ${panel("🔓 Mở khoá token lớn 14 ngày tới", (M.unlocks || []).length ? `<div class="tw"><table><thead><tr><th class="l">Coin</th><th>Ngày</th><th>% lưu hành</th><th>Giá trị</th></tr></thead><tbody>${(M.unlocks || []).map((e) => `<tr><td class="l">${coinLink(e.k)}</td><td>${fmtT(e.t)}</td><td class="${e.pct >= 2 ? "down" : ""}">${nf(e.pct, 2)}%</td><td>${usd(e.usd)}<br><small class="faint">${esc((e.cats || []).join(", "))}</small></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Không có đợt mở khoá ≥ 0,5% lượng lưu hành trong 14 ngày tới (trong các dự án DefiLlama theo dõi).</p>`, "áp lực bán từ quỹ/đội ngũ")}
  </div>
  <div class="g g4">
    ${panel("🚀 Tăng mạnh 7 ngày", list(lst.gain7, (r) => `<small class="${cls(r.r7)}">${pct(r.r7, 0)}</small>`))}
    ${panel("🩸 Giảm mạnh 7 ngày", list(lst.lose7, (r) => `<small class="${cls(r.r7)}">${pct(r.r7, 0)}</small>`))}
    ${panel("🔥 Funding nóng (Long đông)", list(lst.f_hot, (r) => `<small class="${f8c(r.f8)}">${f8s(r.f8)}</small>`), `<a href="#/futures">xem futures</a>`)}
    ${panel("🧊 Funding âm (Short đông)", list(lst.f_cold, (r) => `<small class="${f8c(r.f8)}">${f8s(r.f8)}</small>`))}
  </div>
  <div class="g g3">
    ${panel("✅ Vừa vào xu hướng tăng", list(lst.trend_new, (r) => `<small>${r.td} ngày</small>`), "tín hiệu theo xu hướng – khung ngày")}
    ${panel("💰 Định giá rẻ (có dòng tiền thật)", list(lst.cheap, (r) => `<small>P/S ${nf(r.ps, 1)}</small>`), `<a href="#/coins/cf">bảng định giá</a>`)}
    ${panel("📈 OI tăng mạnh 7 ngày", list(lst.oi_up, (r) => `<small class="${cls(r.oi7)}">${pct(r.oi7, 0)}</small>`))}
  </div>
  ${(M.news || []).length ? panel("📰 Tin có tác động (72 giờ)", `<div class="ntfs">${M.news.map((n) => newsRow(n, true)).join("")}</div>`, "hack, huỷ niêm yết, pháp lý, niêm yết mới, ETF…") : ""}
  ${(M.alerts || []).length ? panel("⚠️ Cảnh báo đòn bẩy", `<ul class="alerts">${M.alerts.map((a) => `<li>${coinLink(a.k, "/fut")} <b>${esc(a.t)}</b> – ${esc(a.d)}</li>`).join("")}</ul>`) : ""}
  <p class="faint disclaimer">Thông tin phân tích, không phải lời khuyên đầu tư. Crypto biến động mạnh; giao dịch đòn bẩy có thể mất toàn bộ ký quỹ.</p>`;
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
const SUBT = [["", "Tổng quan"], ["val", "Định giá"], ["fut", "Futures"], ["plan", "Kế hoạch giao dịch"], ["tech", "Kỹ thuật"]];
let CTF = lsGet("ctf", "d");
async function viewCoin(key, sub = "") {
  await coins();
  const D = await load(`data/c/${enc(key)}.json`);
  const r = D.row;
  app().innerHTML = `<div class="ph stk"><h1>${esc(key)} <small class="muted">${esc(r.n || "")}</small></h1>
    <span class="meta">${px(r.p)} <b class="${cls(r.r1)}">${pct(r.r1)}</b> · ${r.rk ? `hạng #${r.rk}` : "ngoài top CoinGecko"} · ${esc(r.g || "")} ${r.spot ? pill("Spot Binance", "brand") : ""} ${r.fx ? pill("Futures: " + esc(r.fx), "") : ""}
    <button class="star ${WL.has(key) ? "on" : ""}" id="wlb" title="Theo dõi">★</button></span></div>
    <div class="subtabs">${SUBT.map(([k, n]) => `<button data-st="${k}" class="${k === sub ? "on" : ""}">${n}</button>`).join("")}</div><div id="sub"></div>`;
  $("#wlb").onclick = async () => { await WL.toggle(key); $("#wlb").classList.toggle("on", WL.has(key)); };
  const show = (s) => {
    disposeCharts();
    $$(".subtabs button").forEach((b) => b.classList.toggle("on", b.dataset.st === s));
    history.replaceState(null, "", `#/c/${enc(key)}${s ? "/" + s : ""}`);
    const f = { "": tabOverview, val: tabVal, fut: tabFut, plan: tabPlan, tech: tabTech }[s] || tabOverview;
    $("#sub").innerHTML = f(D);
    (BIND[s || ""] || (() => {}))(D);
  };
  $$(".subtabs button").forEach((b) => b.onclick = () => show(b.dataset.st));
  show(SUBT.some(([k]) => k === sub) ? sub : "");
}
const BIND = {};
function priceChart(D, el, tf) {
  const o = D.ohlc?.[tf] || D.ohlc?.d;
  if (!o || !o.t?.length) { el.innerHTML = `<p class="muted">Chưa có dữ liệu giá khung này.</p>`; return; }
  const T = D.trend || {}, I = D.intra?.plan || {};
  const lines = tf === "d" ? [T.stop && { price: T.stop, color: css("--down"), title: "cắt lỗ xu hướng" }, T.exit_level && { price: T.exit_level, color: css("--ref"), title: "EMA50" }]
    : [I.entry && { price: I.entry, color: css("--brand"), title: "vào" }, I.stop && { price: I.stop, color: css("--down"), title: "cắt lỗ" }, I.t1 && { price: I.t1, color: css("--up"), title: "chốt 1" }, I.t2 && { price: I.t2, color: css("--up"), title: "chốt 2" }];
  const n = o.t.length, from = o.t[Math.max(0, n - (tf === "d" ? 365 : tf === "h4" ? 240 : 200))];
  candleChart(el, o, { ma: tf === "d" ? [["ema", 20, css("--brand")], ["ema", 50, css("--ref")], ["sma", 200, css("--ink-3")]] : [["ema", 20, css("--brand")], ["ema", 50, css("--ref")]], lines: lines.filter(Boolean), from });
}
const tfSeg = (cur) => `<span class="seg" id="tfs">${[["d", "Ngày"], ["h4", "4 giờ"], ["h1", "1 giờ"]].map(([k, n]) => `<button data-tf="${k}" class="${cur === k ? "on" : ""}">${n}</button>`).join("")}</span>`;
function bindChart(D) {
  const el = $("#pchart"); if (!el) return;
  priceChart(D, el, CTF);
  $$("#tfs button").forEach((b) => b.onclick = () => { CTF = b.dataset.tf; lsSet("ctf", CTF); disposeCharts(); el.innerHTML = ""; $$("#tfs button").forEach((x) => x.classList.toggle("on", x === b)); priceChart(D, el, CTF); });
}
function tabOverview(D) {
  const r = D.row, V = D.val || {}, T = D.trend || {}, cg = D.cg || {};
  const why = (V.why || []).slice(0, 4);
  return `<div class="g g2w">
    ${panel(`Biểu đồ ${tfSeg(CTF)}`, `<div class="chart" id="pchart" style="height:420px"></div><p class="faint" style="font-size:.72rem">Ngày: EMA20 (xanh) · EMA50 (vàng) · MA200 (xám). 4h/1h: đường kẻ = kế hoạch lướt (vào / cắt lỗ / chốt).</p>`)}
    <div>
      ${panel("Tóm tắt", `${kpis([["Định giá", vdPill(V.verdict)], ["Xu hướng ngày", tsPill(T.state, T.days)], ["Điểm kỹ thuật", scoreCell(D.tech?.score)],
        ["Vốn hoá", usd(r.mc)], ["FDV", usd(r.fdv), "", "Vốn hoá nếu toàn bộ tổng cung lưu hành"], ["Lưu hành", isNum(V.float_pct) ? nf(V.float_pct, 0) + "%" : "—", V.float_pct < 35 ? "down" : ""],
        ["KL 24h", usd(r.vol)], ["Từ đỉnh", pct(r.ath, 0), "down", cg.ath_date ? `Đỉnh ${px(cg.ath)} ngày ${fmtD(cg.ath_date)}` : ""],
        ["7 / 30 ngày", `<span class="${cls(r.r7)}">${pct(r.r7, 0)}</span> / <span class="${cls(r.r30)}">${pct(r.r30, 0)}</span>`], ["1 năm", pct(r.r365, 0), cls(r.r365)],
        r.oi ? ["OI futures", usd(r.oi)] : null, r.oi ? ["Funding 8h", f8s(r.f8), f8c(r.f8)] : null, D.hedge?.beta ? ["Beta với BTC", nf(D.hedge.beta, 2), "", `Tương quan ${nf(D.hedge.corr, 2)} · biến động năm hoá ${nf(D.hedge.vol90, 0)}%`] : null])}
        ${why.length ? `<ul class="why">${why.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${(D.crowd || []).length ? `<div class="note">${D.crowd.map((c) => `<p><b>${esc(c.t)}</b>: ${esc(c.d)}</p>`).join("")}</div>` : ""}`)}
      ${planSummary(D)}
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
function liqPrice(side, entry, lev, mmr = MMR) { if (!isNum(entry) || !isNum(lev) || lev <= 0) return null; return side === "long" ? entry * (1 - 1 / lev + mmr) : entry * (1 + 1 / lev - mmr); }
function sizing(acct, riskPct, entry, stop, lev) {
  const R = Math.abs(entry - stop); if (!(R > 0)) return null;
  const riskUsd = acct * riskPct / 100, q = riskUsd / R, notional = q * entry, margin = notional / lev;
  const side = stop < entry ? "long" : "short", liq = liqPrice(side, entry, lev);
  const liqBeforeStop = side === "long" ? liq >= stop : liq <= stop;
  return { q, notional, margin, riskUsd, liq, liqBeforeStop, side, marginPct: margin / acct * 100 };
}
function sizeBox(entry, stop, lev, id) {
  const acct = Number(lsGet("acct", 10000)), rk = Number(lsGet("risk", 1));
  const s = sizing(acct, rk, entry, stop, lev);
  if (!s) return "";
  return `<div class="sizebox" id="${id}"><small>Vốn $${nf(acct, 0)} · rủi ro ${nf(rk, 1)}%/lệnh (đổi ở <a href="#/tools">Công cụ</a>) · đòn bẩy x${nf(lev, 0)}:</small>
    ${kpis([["Khối lượng", qty(s.q)], ["Giá trị lệnh", usd(s.notional)], ["Ký quỹ", usd(s.margin), s.marginPct > 50 ? "down" : "", `${nf(s.marginPct, 0)}% vốn`], ["Lỗ nếu chạm cắt lỗ", usd(s.riskUsd), "down"],
      ["Giá thanh lý (ước tính)", px(s.liq), s.liqBeforeStop ? "down" : "", "Ký quỹ isolated, tỉ lệ duy trì 0,5% – sàn thực tế có thể khác"]])}
    ${s.liqBeforeStop ? `<p class="down">⚠️ Giá thanh lý nằm trước điểm cắt lỗ – giảm đòn bẩy.</p>` : ""}</div>`;
}
function tabPlan(D) {
  const T = D.trend || {}, I = D.intra || {}, P = I.plan, H = D.hedge || {}, B = D.bt || {}, r = D.row;
  const maxL = Number(lsGet("maxlev", 3)), maxI = Number(lsGet("maxlevi", 5));
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
  return `<div class="g g2">${panel("📈 Theo xu hướng – khung ngày, đòn bẩy thấp", trendBox)}<div>${panel("⚡ Lướt trong ngày – 4h định hướng, 1h vào lệnh", intraBox)}${panel("🛡️ Phòng hộ spot / basis", hedgeBox)}</div></div>
    <p class="faint disclaimer">Mức giá là gợi ý theo quy tắc kỹ thuật cố định, không phải khuyến nghị. Luôn đặt lệnh cắt lỗ trên sàn; không để giá thanh lý gần hơn điểm cắt lỗ.</p>`;
}
BIND.plan = (D) => {
  const e = D.bt?.long?.eq; if (!e || !$("#eqc")) return;
  const ls = D.bt?.ls?.eq;
  $("#eqc").innerHTML = lineSvg([{ name: "Theo xu hướng (Long)", color: css("--brand"), pts: e.map(([d, a]) => ({ x: fmtD(d), y: a })) }, ...(ls ? [{ name: "Long + Short", color: css("--ref"), pts: ls.map(([d, a]) => ({ x: fmtD(d), y: a })) }] : []),
    { name: "Mua & giữ", color: css("--ink-3"), pts: e.map(([d, , b]) => ({ x: fmtD(d), y: b })) }], { h: 170, log: true, fmt: (v) => "x" + nf(v, v < 10 ? 1 : 0) });
};
function tabTech(D) {
  const T = D.tech || {};
  if (!T.ok) return `<div class="empty">Chưa đủ dữ liệu kỹ thuật.</div>`;
  const g = Object.entries(T.groups || {}).map(([k, v]) => `<div class="tg"><b>${esc(k)}</b> ${scoreCell(v.score)} <small>${v.buy} mua · ${v.neutral} trung tính · ${v.sell} bán</small></div>`).join("");
  const rows = (T.table || []).map((x) => `<tr><td class="l">${esc(x.group)}</td><td class="l">${esc(x.name)}</td><td>${esc(x.value ?? "")}</td><td><span class="pill ${x.signal === "Mua" ? "buy" : x.signal === "Bán" ? "sell" : ""}">${esc(x.signal)}</span></td><td class="l"><small>${esc(x.note || "")}</small></td></tr>`).join("");
  return `<div class="g g2w">${panel(`Đồ thị ${tfSeg(CTF)}`, `<div class="chart" id="pchart" style="height:380px"></div>`)}
    ${panel(`Tổng hợp: ${esc(T.label)} ${scoreCell(T.score)}`, `${kpis([["Xu hướng", esc(T.trend_vi)], ["ATR", `${nf(T.atr_pct, 1)}%/ngày`], ["Đỉnh 1 năm", px(T.hi52)], ["Cách đỉnh 1 năm", pct(T.from_hi52_pct, 0), "down"], ["Phân kỳ RSI", T.divergence?.rsi === "bullish" ? '<b class="up">dương</b>' : T.divergence?.rsi === "bearish" ? '<b class="down">âm</b>' : "—"]])}<div class="tgs">${g}</div>`)}</div>
    ${panel("Chi tiết chỉ báo (khung ngày)", `<div class="tw"><table><thead><tr><th class="l">Nhóm</th><th class="l">Chỉ báo</th><th>Giá trị</th><th>Tín hiệu</th><th class="l">Ghi chú</th></tr></thead><tbody>${rows}</tbody></table></div>`)}`;
}
BIND.tech = bindChart;

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
async function pfLoad() { const r = await Store.get("portfolio"); PF = r.data && typeof r.data === "object" ? r.data : {}; PF.holdings = PF.holdings || []; PF.futures = PF.futures || []; return PF; }
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
    return `<tr><td class="l">${coinLink(h.symbol)}</td><td>${qty(h.qty)}</td><td>${px(h.cost)}</td><td>${px(p)}</td><td>${usd(v)}</td><td class="${cls(pnl)}">${usd(pnl)}<br><small>${h.cost ? pct((p / h.cost - 1) * 100) : ""}</small></td><td>${tsPill(r.ts, r.td)}</td><td>${vdPill(r.vd)}</td><td><button class="chip" data-dh="${i}">Xoá</button></td></tr>`;
  }).join("");
  const fu = PF.futures.map((f, i) => {
    const r = BYK[f.symbol] || {}, p = r.p, s = f.side === "short" ? -1 : 1, n = isNum(p) ? f.qty * p : null;
    const pnl = isNum(p) ? s * f.qty * (p - f.entry) : null, margin = f.qty * f.entry / (f.lev || 1), roe = pnl != null ? pnl / margin * 100 : null;
    const liq = liqPrice(f.side, f.entry, f.lev || 1), dist = isNum(p) && liq ? (s > 0 ? (p - liq) / p : (liq - p) / p) * 100 : null;
    const fd = isNum(r.f8) && n ? -s * n * r.f8 / 100 * 3 : null;
    if (isNum(n)) { futN += n; netDelta += s * n; } if (isNum(pnl)) futPnl += pnl; futMargin += margin; if (fd) fundDay += fd;
    if (isNum(dist) && dist < 15) flags.push([f.symbol, `vị thế ${f.side} chỉ cách giá thanh lý ${nf(dist, 1)}% – bổ sung ký quỹ hoặc giảm vị thế`]);
    if (f.stop && isNum(p) && ((s > 0 && p <= f.stop) || (s < 0 && p >= f.stop))) flags.push([f.symbol, `giá đã chạm mức cắt lỗ ${px(f.stop)}`]);
    if (s > 0 && r.ts === -1) flags.push([f.symbol, `đang Long nhưng xu hướng ngày đã giảm`]);
    if (s < 0 && r.ts === 1) flags.push([f.symbol, `đang Short ngược xu hướng tăng ngày`]);
    if (s > 0 && (r.cr || []).includes("long_crowded")) flags.push([f.symbol, `Long trong lúc Long quá đông – funding ${f8s(r.f8)} ăn mòn lãi`]);
    return `<tr><td class="l">${coinLink(f.symbol, "/fut")}</td><td>${f.side === "short" ? '<b class="down">Short</b>' : '<b class="up">Long</b>'} x${nf(f.lev, 0)}</td><td>${qty(f.qty)}</td><td>${px(f.entry)}</td><td>${px(p)}</td><td>${usd(n)}</td>
      <td class="${cls(pnl)}">${usd(pnl)}<br><small>${pct(roe, 0)} ký quỹ</small></td><td>${px(liq)}<br><small class="${dist < 15 ? "down" : "muted"}">${isNum(dist) ? "cách " + nf(dist, 1) + "%" : ""}</small></td><td>${f.stop ? px(f.stop) : "—"}</td><td class="${cls(fd)}">${fd != null ? usd(fd) + "/ngày" : "—"}</td><td><button class="chip" data-df="${i}">Xoá</button></td></tr>`;
  }).join("");
  const cash = Number(PF.cash || 0), eq = spotV + cash + futMargin + futPnl;
  const wl = [...WL.set].filter((k) => BYK[k]);
  app().innerHTML = `<div class="ph"><h1>Danh mục</h1><span class="meta">dữ liệu riêng của anh – lưu trên tài khoản</span></div>
    <section class="panel hero">${kpis([["Tổng tài sản (ước)", usd(eq)], ["Spot", usd(spotV), "", `Giá vốn ${usd(spotC)}`], ["Lãi/lỗ spot", usd(spotV - spotC), cls(spotV - spotC)], ["Tiền mặt / stablecoin", usd(cash)],
      ["Futures: giá trị vị thế", usd(futN)], ["Lãi/lỗ futures", usd(futPnl), cls(futPnl)], ["Ký quỹ đang dùng", usd(futMargin)], ["Funding mỗi ngày", usd(fundDay), cls(fundDay), "Dương = nhận, âm = trả (ước theo funding hiện tại)"],
      ["Độ phơi nhiễm ròng", usd(netDelta), "", "Spot + Long − Short (USD). Gần 0 = đã phòng hộ"], ["Đòn bẩy ròng", eq > 0 ? "x" + nf(Math.abs(netDelta) / eq, 2) : "—"]], true)}</section>
    ${flags.length ? panel("⚠️ Cần chú ý", `<ul class="alerts">${flags.map(([k, t]) => `<li>${coinLink(k)} ${esc(t)}</li>`).join("")}</ul>`) : ""}
    ${panel("Spot", `<div class="tw"><table><thead><tr><th class="l">Coin</th><th>Số lượng</th><th>Giá vốn</th><th>Giá</th><th>Giá trị</th><th>Lãi/lỗ</th><th>Xu hướng</th><th>Định giá</th><th></th></tr></thead><tbody>${sp || '<tr><td colspan="9" class="muted">Chưa có coin nào.</td></tr>'}</tbody></table></div>
      <div class="filters"><div class="field"><label>Coin</label><input id="hS" list="coinlist" placeholder="BTC"></div><div class="field"><label>Số lượng</label><input id="hQ" type="number" step="any"></div><div class="field"><label>Giá vốn (USD)</label><input id="hC" type="number" step="any"></div><button class="btn primary" id="hAdd">Thêm / cộng dồn</button>
      <div class="field"><label>Tiền mặt / stablecoin (USD)</label><input id="pCash" type="number" step="any" value="${cash || ""}"></div><button class="btn" id="cSave">Lưu tiền mặt</button></div>`)}
    ${panel("Futures (perp)", `<div class="tw"><table><thead><tr><th class="l">Coin</th><th>Chiều</th><th>Số lượng</th><th>Giá vào</th><th>Giá</th><th>Giá trị</th><th>Lãi/lỗ</th><th>Thanh lý (ước)</th><th>Cắt lỗ</th><th>Funding</th><th></th></tr></thead><tbody>${fu || '<tr><td colspan="11" class="muted">Chưa có vị thế.</td></tr>'}</tbody></table></div>
      <div class="filters"><div class="field"><label>Coin</label><input id="fS" list="coinlist" placeholder="ETH"></div><div class="field"><label>Chiều</label><select id="fSide"><option value="long">Long</option><option value="short">Short</option></select></div>
      <div class="field"><label>Số lượng (coin)</label><input id="fQ" type="number" step="any"></div><div class="field"><label>Giá vào</label><input id="fE" type="number" step="any"></div><div class="field"><label>Đòn bẩy</label><input id="fL" type="number" step="any" value="3"></div><div class="field"><label>Cắt lỗ (tuỳ chọn)</label><input id="fSL" type="number" step="any"></div><button class="btn primary" id="fAdd">Thêm vị thế</button></div>
      <p class="faint" style="font-size:.72rem">Giá thanh lý ước tính theo ký quỹ isolated, tỉ lệ duy trì 0,5%; sàn thực tế (cross margin, bậc rủi ro) có thể khác. Hệ thống chỉ theo dõi, không kết nối tài khoản sàn.</p>`)}
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
    PF.futures.push({ symbol: s, side: $("#fSide").value, qty: q, entry: e, lev: l, stop: sl, opened: new Date().toISOString().slice(0, 10) });
    await pfSave(); viewPortfolio();
  };
  $$("[data-dh]").forEach((b) => b.onclick = async () => { PF.holdings.splice(Number(b.dataset.dh), 1); await pfSave(); viewPortfolio(); });
  $$("[data-df]").forEach((b) => b.onclick = async () => { PF.futures.splice(Number(b.dataset.df), 1); await pfSave(); viewPortfolio(); });
}

// ================================================================ CÔNG CỤ
async function viewTools(sub) {
  await coins();
  const acct = lsGet("acct", 10000), rk = lsGet("risk", 1), ml = lsGet("maxlev", 3), mli = lsGet("maxlevi", 5);
  app().innerHTML = `<div class="ph"><h1>Công cụ</h1></div>
  <div class="g g2">
    ${panel("⚙️ Thông số của anh", `<div class="filters"><div class="field"><label>Vốn giao dịch (USD)</label><input id="tA" type="number" value="${acct}"></div><div class="field"><label>Rủi ro mỗi lệnh (% vốn)</label><input id="tR" type="number" step="0.1" value="${rk}"></div>
      <div class="field"><label>Đòn bẩy tối đa – theo xu hướng</label><input id="tML" type="number" value="${ml}"></div><div class="field"><label>Đòn bẩy tối đa – lướt</label><input id="tMLI" type="number" value="${mli}"></div><button class="btn primary" id="tSave">Lưu</button></div>
      <p class="faint" style="font-size:.74rem">Dùng cho phần "khối lượng gợi ý" ở trang từng coin. Quy tắc an toàn: rủi ro 0,5–2%/lệnh; không để tổng ký quỹ > 30% vốn.</p>`)}
    ${panel("🧮 Khối lượng lệnh & giá thanh lý", `<div class="filters"><div class="field"><label>Coin (tự điền giá)</label><input id="cS" list="coinlist2" placeholder="SOL"></div><div class="field"><label>Giá vào</label><input id="cE" type="number" step="any"></div><div class="field"><label>Cắt lỗ</label><input id="cSL" type="number" step="any"></div>
      <div class="field"><label>Đòn bẩy</label><input id="cL" type="number" step="any" value="${ml}"></div><div class="field"><label>Tỉ lệ ký quỹ duy trì (%)</label><input id="cM" type="number" step="0.1" value="0.5"></div></div><div id="cOut"></div>`)}
    ${panel("🛡️ Phòng hộ spot bằng perp", `<div class="filters"><div class="field"><label>Coin đang giữ</label><input id="hS2" list="coinlist2" placeholder="SOL"></div><div class="field"><label>Giá trị đang giữ (USD)</label><input id="hV" type="number" step="any" value="10000"></div>
      <div class="field"><label>Tỉ lệ phòng hộ (%)</label><input id="hP" type="number" value="50"></div><div class="field"><label>Phòng hộ bằng</label><select id="hW"><option value="self">Chính coin đó</option><option value="btc">BTC perp (theo beta)</option></select></div></div><div id="hOut"></div>`)}
    ${panel("📐 Chốt lời / R:R", `<div class="filters"><div class="field"><label>Giá vào</label><input id="rE" type="number" step="any"></div><div class="field"><label>Cắt lỗ</label><input id="rS" type="number" step="any"></div><div class="field"><label>Chốt lời</label><input id="rT" type="number" step="any"></div><div class="field"><label>Phí 1 chiều (%)</label><input id="rF" type="number" step="0.01" value="0.05"></div></div><div id="rOut"></div>`)}
  </div><datalist id="coinlist2">${COINS.rows.slice(0, 800).map((r) => `<option value="${esc(r.k)}">`).join("")}</datalist>`;
  $("#tSave").onclick = () => { lsSet("acct", Number($("#tA").value) || 10000); lsSet("risk", Number($("#tR").value) || 1); lsSet("maxlev", Number($("#tML").value) || 3); lsSet("maxlevi", Number($("#tMLI").value) || 5); toast("Đã lưu"); };
  const calc = () => {
    const e = Number($("#cE").value), s = Number($("#cSL").value), l = Number($("#cL").value) || 1, m = (Number($("#cM").value) || 0.5) / 100;
    if (!(e > 0)) { $("#cOut").innerHTML = ""; return; }
    const liqL = liqPrice("long", e, l, m), liqS = liqPrice("short", e, l, m);
    let h = kpis([["Thanh lý nếu Long", px(liqL), "", `cách ${nf((e - liqL) / e * 100, 1)}%`], ["Thanh lý nếu Short", px(liqS), "", `cách ${nf((liqS - e) / e * 100, 1)}%`]]);
    if (s > 0 && s !== e) {
      const z = sizing(Number(lsGet("acct", 10000)), Number(lsGet("risk", 1)), e, s, l);
      const liq = liqPrice(z.side, e, l, m), bad = z.side === "long" ? liq >= s : liq <= s;
      h += kpis([["Chiều", z.side === "long" ? '<b class="up">Long</b>' : '<b class="down">Short</b>'], ["Khối lượng", qty(z.q)], ["Giá trị lệnh", usd(z.notional)], ["Ký quỹ", usd(z.margin), z.marginPct > 50 ? "down" : "", `${nf(z.marginPct, 0)}% vốn`], ["Lỗ tối đa", usd(z.riskUsd), "down"], ["Khoảng cắt lỗ", nf(Math.abs(e - s) / e * 100, 2) + "%"]]);
      if (bad) h += `<p class="down">⚠️ Giá thanh lý ${px(liq)} nằm trước cắt lỗ – giảm đòn bẩy xuống ≤ x${nf(Math.floor(1 / (Math.abs(e - s) / e + m + 0.003)), 0)}.</p>`;
      if (z.marginPct > 100) h += `<p class="down">Ký quỹ vượt vốn – cắt lỗ quá gần hoặc rủi ro quá lớn so với vốn.</p>`;
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
  $("#ticker").innerHTML = ks.filter((k) => BYK[k]).map((k) => `<a href="#/c/${k}"><span><b>${k}</b>${px(BYK[k].p)} <i class="${cls(BYK[k].r1)}">${pct(BYK[k].r1, 1)}</i></span></a>`).join("");
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
const NK = { liq: "🚨", stop: "🛑", trend: "🔀", crowd: "👥", unlock: "🔓", alert: "🔔", light: "🚦", carry: "💱", system: "ℹ️", admin: "🛠️" };
const NKIND = { liq: "Vị thế futures gần giá thanh lý", stop: "Giá chạm mức cắt lỗ của vị thế", trend: "Xu hướng coin đang giữ đảo chiều", crowd: "Đám đông futures cực đoan ở coin đang giữ",
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
  drawTicker().catch(() => {});
  WL.load().catch(() => {});
  window.addEventListener("hashchange", route);
  route();
})();
