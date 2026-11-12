// MyBit – ĐẶT LỆNH THẬT trên Binance USDⓈ-M Futures cho phương pháp 🪝 Bắt râu sập (chỉ chạy trên máy chủ riêng).
//
// An toàn – đọc trước:
//   • Khoá API Binance CHỈ nằm trong scalper/.env trên máy chủ này (quyền 600). Không gửi lên trang MyBit, không ai khác thấy.
//     Dùng khoá RIÊNG cho bot: chỉ bật "Futures", TẮT rút tiền, giới hạn IP = IP máy chủ này. Ở môi trường thật, bot kiểm tra
//     quyền của khoá (apiRestrictions) và TỪ CHỐI chạy nếu khoá được phép rút tiền.
//   • Chỉ đặt lệnh khi trên trang: bật "Tài khoản Binance thật", chọn môi trường (Demo = tiền ảo giá thật / Thật), và với môi trường Thật
//     phải gõ xác nhận. Bot không bao giờ dùng quá "Vốn tối đa" anh đặt; ký quỹ cô lập; đòn bẩy thấp; mỗi coin tối đa 1 lần bắt.
//   • Mỗi lệnh khớp luôn có CẮT LỖ trên sàn (STOP_MARKET, đóng toàn bộ) + cắt lỗ dự phòng trên máy chủ; tự đóng sau "giữ" phút.
//   • Không đụng vào coin anh đang có vị thế (do anh tự mở). Lỗi API liên tiếp hoặc lỗ quá giới hạn ngày → ngừng mở mới (lệnh đang mở vẫn được quản lý).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sgVA, extSet, extExit, extRemind } from "../worker/scalp_core.js";

const BASE = { live: "https://fapi.binance.com", demo: process.env.MYBIT_DEMO_BASE || "https://demo-fapi.binance.com" };     // MYBIT_DEMO_BASE: chỉ để kiểm thử với sàn giả lập
const SAPI = process.env.MYBIT_SAPI || "https://api.binance.com";      // MYBIT_SAPI: chỉ để kiểm thử
const SPOT = { live: "https://api.binance.com", demo: process.env.MYBIT_DEMO_SPOT || "https://demo-api.binance.com" };     // ví Spot (Demo có cổng spot riêng)
const STABLE = { USDT: 1, USDC: 1, FDUSD: 1, BUSD: 1, TUSD: 1, DAI: 1, USD1: 1 };
const vnDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
const iso = (t) => new Date(t).toISOString().slice(0, 19);
const dec = (s) => { const t = String(s); const i = t.indexOf("."); return i < 0 ? 0 : t.replace(/0+$/, "").length - i - 1; };
const fl = (x, step) => Math.floor(x / step + 1e-9) * step;
const ce = (x, step) => Math.ceil(x / step - 1e-9) * step;

// nhãn đầu mọi thông báo của lệnh trên Binance – phân biệt ngay với 🧪 SÀN THỬ
const LTAG = (env) => (env === "live" ? "💰 TIỀN THẬT" : "🟡 DEMO"), coin = (sym) => String(sym || "").replace(/USDT$/, "");
// 🛡️ GIỚI HẠN AN TOÀN CHUNG – cứng trong mã, KHÔNG chỉnh trên trang: cộng MỌI phương pháp (Bắt râu sập + Short coin vừa bơm…).
// Dù thiết lập đặt nhầm (vốn, đòn bẩy, cỡ lệnh, số lệnh) bot cũng không vượt: vượt → bỏ qua lệnh MỚI, lệnh đang mở vẫn được quản lý bình thường.
//   margin  – tổng ký quỹ đang dùng ≤ 80% số dư ví futures (chừa 20% cho phí, funding, dao động)
//   notional– tổng giá trị lệnh ≤ 2× số dư
//   worst   – nếu MỌI lệnh đang mở cùng chạm cắt lỗ / bị thanh lý cùng lúc, mất tối đa 35% số dư
//   dd      – số dư thấp hơn đỉnh cao nhất 30% → ngừng mở mới tới khi anh bấm "Chạy lại" trên trang
const RISK = { margin: 0.8, notional: 2, worst: 0.35, dd: 0.3 };
export class LiveExec {
  constructor({ core, dir, log }) {
    this.core = core; this.log = log; this.file = path.join(dir, "live.json");
    this.S = { ev: {}, day: { d: vnDay(Date.now()), pnl: 0 }, tot: { n: 0, pnl: 0, win: 0, fees: 0 }, hist: [], log: [], errs: 0, halt: null, seq: 1 };
    try { Object.assign(this.S, JSON.parse(fs.readFileSync(this.file, "utf8"))); } catch (e) { /* tệp mới */ }
    // tổng kết TÁCH RIÊNG Binance thật / Demo (bản cũ cộng chung) – lần đầu dựng lại từ lịch sử lệnh đã đóng
    if (!this.S.totE) { this.S.totE = {}; for (const h of this.S.hist || []) { const T = (this.S.totE[h.env || "demo"] ||= { n: 0, pnl: 0, win: 0, fees: 0 }); T.n++; T.pnl += h.pnl || 0; T.fees += h.fee || 0; if (h.pnl > 0) T.win++; } }
    this.S.dayE ||= {};
    this.st = { checked: null, ok: false, why: "chưa kiểm tra" }; this.fx = {}; this.lev = {}; this.off = 0; this.busy = false; this.q = [];
  }
  // ---------------------------------------------------------------- cấu hình & khoá
  cfg() { return this.core.cfg || {}; }
  env() { return this.cfg().lv_env === "live" ? "live" : "demo"; }
  keys(env = this.env()) { const p = env === "live" ? "BINANCE_LIVE" : "BINANCE_DEMO"; const k = (process.env[`${p}_KEY`] || "").trim(), s = (process.env[`${p}_SECRET`] || "").trim(); return k && s ? { k, s } : null; }
  enabled() {
    const c = this.cfg();
    if (!c.lv_on || !c.enabled) return false;
    if (this.env() === "live" && !c.lv_live_ok) return false;          // môi trường thật: phải gõ xác nhận trên trang
    return true;
  }
  // vốn để tính cỡ lệnh & giới hạn lỗ ngày. Thật: min(Vốn tối đa, số dư ví futures) – hoặc TOÀN BỘ số dư khi bật "Dùng toàn bộ số dư" (lv_all)
  // → lời thì cỡ lệnh tự tăng theo (lãi kép), lỗ thì tự nhỏ lại. Demo: giữ nguyên như cũ (Vốn tối đa).
  base() { const c = this.cfg(); return this.env() === "live" && this.st.bal > 0 ? (c.lv_all ? this.st.bal : Math.min(c.lv_cap, this.st.bal)) : c.lv_cap; }
  say(m, kind = "info") { this.S.log = [...this.S.log.slice(-299), { t: iso(Date.now()), k: kind, m }]; this.log(`💵 ${m}`); this.save(); }
  note(key, sev, title, body, grp = null) { try { this.core.note(`lv:${key}`, sev, title, body, undefined, grp); } catch (e) { /* bỏ qua */ } }
  save() { try { const tmp = this.file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(this.S)); fs.renameSync(tmp, this.file); } catch (e) { this.log("lưu live.json lỗi", e.message); } }
  // ---------------------------------------------------------------- gọi API Binance (ký HMAC-SHA256)
  async req(method, p, params = {}, signed = true, base = BASE[this.env()], env = this.env()) {
    const K = this.keys(env); if (signed && !K) throw new Error("chưa có khoá API trên máy chủ");
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
    if (signed) { q.set("recvWindow", "5000"); q.set("timestamp", String(Date.now() + this.off)); q.set("signature", crypto.createHmac("sha256", K.s).update(q.toString()).digest("hex")); }
    const r = await fetch(`${base}${p}${q.toString() ? "?" + q : ""}`, { method, headers: K ? { "X-MBX-APIKEY": K.k } : {}, signal: AbortSignal.timeout(10000) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* không phải JSON */ }
    if (!r.ok || (j && j.code && j.code < 0)) { const e = new Error(`${j?.code ?? r.status} ${j?.msg || t.slice(0, 160)}`); e.code = j?.code; throw e; }
    return j;
  }
  // ---------------------------------------------------------------- TỔNG TÀI SẢN trên Binance (chỉ ĐỌC): mọi ví quy ra USDT, theo từng coin, lịch sử theo giờ
  // Thật: /sapi/v1/asset/wallet/balance (số dư từng ví – Spot, Funding, Earn, Futures, Margin, Bot…, đã quy USDT) + chi tiết coin ở Spot / Funding / Earn / Futures.
  // Demo: sàn Demo không có cổng ví tổng → cộng Spot + Futures. Giá quy đổi: giá Binance spot (1 lần gọi cho mọi coin).
  async prices() {
    if (this.pxm && Date.now() - this.pxAt < 60e3) return this.pxm;
    const r = await fetch("https://api.binance.com/api/v3/ticker/price", { signal: AbortSignal.timeout(10000) }), L = await r.json(), m = { ...STABLE };
    for (const x of L || []) if (x.symbol.endsWith("USDT") && !(x.symbol.slice(0, -4) in STABLE)) m[x.symbol.slice(0, -4)] = +x.price;
    this.pxm = m; this.pxAt = Date.now(); return m;
  }
  async wallet(env) {
    if (!this.keys(env)) return null;
    const P = await this.prices().catch(() => ({ ...STABLE })), W = { env, at: iso(Date.now()), wallets: [], assets: {}, err: [] };
    const pr = (a) => P[a] ?? (a.startsWith("LD") ? P[a.slice(2)] : undefined);
    const add = (where, a0, q) => { if (!(q > 0)) return; const a = a0.startsWith("LD") && pr(a0) != null && P[a0] == null ? a0.slice(2) : a0, u = (pr(a0) || 0) * q; const A = (W.assets[a] ||= { q: 0, usd: 0, w: {} }); A.q += q; A.usd += u; A.w[where] = (A.w[where] || 0) + u; if (pr(a0) == null) W.nopx = [...new Set([...(W.nopx || []), a])]; };
    let earnOk = false;
    if (env === "live") {
      try { const L = await this.req("GET", "/sapi/v1/asset/wallet/balance", { quoteAsset: "USDT" }, true, SAPI, env); W.wallets = (L || []).filter((x) => +x.balance > 0.005).map((x) => [x.walletName, +(+x.balance).toFixed(2)]).sort((a, b) => b[1] - a[1]); } catch (e) { W.err.push("ví tổng: " + e.message); }
      try { const F = await this.req("POST", "/sapi/v1/asset/get-funding-asset", {}, true, SAPI, env); for (const b of F || []) add("Funding", b.asset, +b.free + +b.locked + +b.freeze); } catch (e) { W.err.push("Funding: " + e.message); }
      try { const E = await this.req("GET", "/sapi/v1/simple-earn/flexible/position", { size: 100 }, true, SAPI, env); for (const r of E?.rows || []) add("Earn", r.asset, +r.totalAmount); earnOk = true; } catch (e) { W.err.push("Earn linh hoạt: " + e.message); }
      try { const E = await this.req("GET", "/sapi/v1/simple-earn/locked/position", { size: 100 }, true, SAPI, env); for (const r of E?.rows || []) add("Earn", r.asset, +r.amount); } catch (e) { W.err.push("Earn cố định: " + e.message); }
    }
    try { const a = await this.req("GET", "/api/v3/account", { omitZeroBalances: "true" }, true, SPOT[env], env); for (const b of a.balances || []) { if (earnOk && b.asset.startsWith("LD")) continue; add("Spot", b.asset, +b.free + +b.locked); } } catch (e) { W.err.push("Spot: " + e.message); }
    try {
      const f = await this.req("GET", "/fapi/v3/account", {}, true, BASE[env], env).catch(() => this.req("GET", "/fapi/v2/account", {}, true, BASE[env], env));
      for (const b of f.assets || []) add("Futures", b.asset, +b.marginBalance);
      W.fut = { wallet: +(+f.totalWalletBalance || 0).toFixed(2), upnl: +(+f.totalUnrealizedProfit || 0).toFixed(2), margin: +(+f.totalMarginBalance || 0).toFixed(2), avail: +(+f.availableBalance || 0).toFixed(2) };
    } catch (e) { W.err.push("Futures: " + e.message); }
    // vị thế futures đang mở (để trang Danh mục đồng bộ): [mã, số lượng (+Long/−Short), giá vào, giá mark, đòn bẩy, lời/lỗ đang mở, giá thanh lý, cross/isolated, ký quỹ]
    try {
      const L = await this.req("GET", "/fapi/v2/positionRisk", {}, true, BASE[env], env);
      W.pos = (L || []).filter((x) => +x.positionAmt !== 0).map((x) => [x.symbol, +x.positionAmt, +x.entryPrice, +x.markPrice, +x.leverage || 1, +(+x.unRealizedProfit || 0).toFixed(4), +x.liquidationPrice || 0, x.marginType === "isolated" ? "iso" : "cross", +(+x.isolatedMargin || 0).toFixed(4)]);
    } catch (e) { W.err.push("Vị thế futures: " + e.message); }
    const sumA = Object.values(W.assets).reduce((s2, a) => s2 + a.usd, 0);
    W.total = +(W.wallets.length ? W.wallets.reduce((s2, w) => s2 + w[1], 0) : sumA).toFixed(2);
    if (!W.wallets.length) { const by = {}; for (const a of Object.values(W.assets)) for (const [k, v] of Object.entries(a.w)) by[k] = (by[k] || 0) + v; W.wallets = Object.entries(by).map(([k, v]) => [k, +v.toFixed(2)]).sort((a, b) => b[1] - a[1]); }
    W.assets = Object.entries(W.assets).map(([a, x]) => [a, +x.q.toPrecision(8), +x.usd.toFixed(2), Object.fromEntries(Object.entries(x.w).map(([k, v]) => [k, +v.toFixed(2)]))]).sort((a, b) => b[2] - a[2]).slice(0, 40);
    if (!(W.total > 0) && W.err.length) return W;
    const H = ((this.S.walH ||= {})[env] ||= []), m = Math.floor(Date.now() / 60000);      // lịch sử theo giờ, 60 ngày
    if (H.length && m - H[H.length - 1][0] < 55) H[H.length - 1] = [H[H.length - 1][0], W.total]; else H.push([m, W.total]);
    if (H.length > 1440) H.splice(0, H.length - 1440);
    return W;
  }
  async wallets() {
    for (const env of ["demo", "live"]) {
      if (!this.keys(env)) continue;
      try {
        const W = await this.wallet(env); if (W) (this.S.wal ||= {})[env] = W;
        if (W?.fut?.margin > 0) {
          const m = Math.floor(Date.now() / 60000), v = W.fut.margin, E = ((this.S.eqH ||= {})[env] ||= []);
          E.push([m, v]); if (E.length > 2100) E.splice(0, E.length - 2100);      // tài sản futures (gồm lãi/lỗ đang mở), 5 phút 1 điểm, 7 ngày
          // lịch sử dài: mỗi giờ 1 điểm (~400 ngày) + mỗi ngày 1 điểm (10 năm) – điểm cuối của giờ/ngày = số mới nhất
          const put = (A, k, cap) => { if (A.length && A[A.length - 1][0] === k) A[A.length - 1][1] = v; else A.push([k, v]); if (A.length > cap) A.splice(0, A.length - cap); };
          const Hr = ((this.S.eqHr ||= {})[env] ||= []), Dy = ((this.S.eqDay ||= {})[env] ||= []);
          if (!Hr.length && E.length > 1) for (const [m0, v0] of E.slice(0, -1)) { const k = Math.floor(m0 / 60) * 60; if (Hr.length && Hr[Hr.length - 1][0] === k) Hr[Hr.length - 1][1] = v0; else Hr.push([k, v0]); }      // lần đầu: lấy từ lịch sử 5 phút có sẵn
          if (!Dy.length && Hr.length) for (const [m0, v0] of Hr) { const k = Math.floor((m0 + 420) / 1440) * 1440 - 420; if (Dy.length && Dy[Dy.length - 1][0] === k) Dy[Dy.length - 1][1] = v0; else Dy.push([k, v0]); }
          put(Hr, Math.floor(m / 60) * 60, 9600); put(Dy, Math.floor((m + 420) / 1440) * 1440 - 420, 3650);      // ngày theo giờ Việt Nam
          await this.flows(env);
        }
      } catch (e) { ((this.S.wal ||= {})[env] ||= {}).err = [e.message]; }
    }
    this.save();
  }
  // ---------------------------------------------------------------- kiểm tra tài khoản (mỗi 5 phút)
  async check() {
    const env = this.env(), st = { env, checked: iso(Date.now()), keys: !!this.keys(), ok: false, why: "" };
    try {
      if (!st.keys) { st.why = `chưa có khoá ${env === "live" ? "Binance thật" : "Binance Demo"} trên máy chủ – chạy: sudo bash /opt/my-bit/scalper/install.sh --binance`; return (this.st = st); }
      const t = await this.req("GET", "/fapi/v1/time", {}, false); this.off = t.serverTime - Date.now();
      const dual = await this.req("GET", "/fapi/v1/positionSide/dual"); st.dual = !!dual.dualSidePosition;
      const bal = await this.req("GET", "/fapi/v2/balance").catch(() => this.req("GET", "/fapi/v3/balance"));
      const u = (bal || []).find((b) => b.asset === "USDT"); st.bal = u ? +(+u.balance).toFixed(2) : 0; st.avail = u ? +(+u.availableBalance).toFixed(2) : 0;
      { const B = ((this.S.bal ||= {})[env] ||= {}), d = vnDay(Date.now()); B[d] = [B[d]?.[0] ?? st.bal, st.bal]; this.save(); }      // số dư đầu / cuối ngày
      { // 🛡️ số dư thấp hơn đỉnh 30% → ngừng mở mới (rút tiền / chuyển ví cũng làm số dư giảm: bấm "Chạy lại" để đặt lại đỉnh)
        const P = (this.S.peak ||= {}); if (st.bal > 0 && !(P[env] >= st.bal)) P[env] = st.bal;
        if (st.bal > 0 && P[env] > 0 && st.bal < P[env] * (1 - RISK.dd) && !this.S.halt) {
          this.S.halt = `số dư ${st.bal} USDT thấp hơn mức cao nhất ${P[env].toFixed(2)} USDT quá ${RISK.dd * 100}% – ngừng mở lệnh mới để anh xem lại (nếu do rút / chuyển tiền: bấm "Chạy lại")`;
          this.say(`⛔ ${this.S.halt}`, "stop"); this.note(`dd:${vnDay(Date.now())}`, 3, `${LTAG(env)} · ⛔ Ngừng mở lệnh mới`, this.S.halt);
        }
      }
      if (env === "live") {
        const R = await this.req("GET", "/sapi/v1/account/apiRestrictions", {}, true, SAPI);
        st.restr = { withdraw: !!R.enableWithdrawals, futures: !!R.enableFutures, ip: !!R.ipRestrict };
        if (st.restr.withdraw) { st.why = "khoá API đang được phép RÚT TIỀN – bot từ chối chạy. Vào Binance → Quản lý API → tắt quyền rút tiền (nên tạo khoá riêng cho bot)."; return (this.st = st); }
        if (!st.restr.futures) { st.why = "khoá API chưa bật quyền Futures"; return (this.st = st); }
      }
      if (st.dual) { st.why = "tài khoản đang bật chế độ Hedge (2 chiều) – bot cần chế độ One-way: Binance Futures → ⚙️ → Chế độ vị thế → One-way"; return (this.st = st); }
      st.ok = true; st.why = env === "live" && !st.restr?.ip ? "khoá chưa giới hạn IP – nên giới hạn IP = IP máy chủ này" : "";
      if (this.S.errs >= 5 && !this.S.halt) { /* giữ nguyên ngừng do lỗi */ }
    } catch (e) { st.why = `không kiểm tra được tài khoản: ${e.message}`; }
    return (this.st = st);
  }
  // ---------------------------------------------------------------- bộ lọc giá / khối lượng của từng hợp đồng
  async filters(sym) {
    if (!this.fxAt || Date.now() - this.fxAt > 6 * 3600e3) {
      const j = await this.req("GET", "/fapi/v1/exchangeInfo", {}, false);
      this.fx = {}; this.fxAt = Date.now();
      for (const s of j.symbols || []) {
        if (s.contractType !== "PERPETUAL" || s.status !== "TRADING") continue;
        const F = Object.fromEntries((s.filters || []).map((f) => [f.filterType, f]));
        this.fx[s.symbol] = { tick: +F.PRICE_FILTER.tickSize, td: dec(F.PRICE_FILTER.tickSize), step: +F.LOT_SIZE.stepSize, sd: dec(F.LOT_SIZE.stepSize), minQ: +F.LOT_SIZE.minQty,
          minN: +(F.MIN_NOTIONAL?.notional ?? 5), up: +(F.PERCENT_PRICE?.multiplierUp ?? 1.05), dn: +(F.PERCENT_PRICE?.multiplierDown ?? 0.95) };
      }
    }
    return this.fx[sym] || null;
  }
  mark(id) { const x = this.core.M?.[id]; return x?.bid && x?.ask ? (x.bid + x.ask) / 2 : null; }
  // ⏰ SẮP TỚI GIỜ TỰ ĐÓNG MÀ LỆNH ĐANG LỖ → thông báo hỏi anh làm gì tiếp (để bot đóng / gia hạn / ra ở đỉnh nhịp nảy / về hoà vốn / đóng ngay).
  //    1 lần cho mỗi mốc giờ đóng (gia hạn → mốc mới → có thể hỏi lại). Lệnh anh đã chọn giữ / gia hạn kiểu khác (xm) thì không hỏi. Không tự đổi gì.
  askNear(o, kind, id, sym, end, hold, upnl, pr) {
    if (!o || o.keep || o.xm || !(end > 0) || !isFinite(pr) || !isFinite(upnl)) return;
    const now = Date.now(), left = end - now, lead = Math.min(kind === "swp" ? 3 * 3600e3 : 15 * 60e3, Math.max(3 * 60e3, hold * 0.17));
    if (left <= 0 || left > lead || pr > -0.1 || o.askAt === end) return;
    o.askAt = end; this.save();
    const mm = Math.max(1, Math.round(left / 60e3)), hm = new Date(end + 7 * 3600e3).toISOString().slice(11, 16), lt = mm >= 120 ? `${(mm / 60).toFixed(1)} giờ` : `${mm} phút`;
    const tip = kind === "lv" ? " · Kiểm chứng 22 tháng: lệnh còn lỗ gần hết giờ, ra ở đỉnh nhịp nảy kế tiếp nhỉnh hơn đóng đúng giờ (+154% so với +146% cả giai đoạn)." : "";
    this.note(`ask${kind === "lv" ? "" : kind === "swp" ? "w" : "q"}:${id}:${Math.round(end / 6e4)}`, 2,
      `${LTAG(o.env || this.env())} · ⏰ ${coin(sym)} sắp tự đóng – đang lỗ ${upnl.toFixed(2)} USDT (${pr.toFixed(2)}%)`,
      `Bot sẽ đóng lúc ${hm} (còn ${lt}) theo chiến lược. Anh muốn: để bot đóng đúng giờ · gia hạn thêm giờ · ra ở đỉnh nhịp nảy · chờ về hoà vốn · hay đóng ngay?${tip}`, `lv:${id}`);
  }
  active() { return Object.values(this.S.ev).filter((e) => !e.done); }
  // ---------------------------------------------------------------- 1) phương pháp vừa đặt lệnh chờ trên sàn thử → đặt lệnh thật tương ứng
  onHook(h) { this.q.push(h); }
  async place(h) {
    const c = this.cfg(), env = this.env(), now = Date.now(), base = h.id.split(":")[0];
    const skip = (why) => { this.say(`Bỏ qua ${base}: ${why}`); this.missAdd({ k: h.id, side: h.side, R: h.R, t0: iso(now), what: "skip", why }); };
    if (!this.enabled()) return;
    if (c.lv_hk === false) return;      // 🪝 Bắt râu sập trên Binance tắt riêng (các phương pháp khác trên tài khoản vẫn chạy)
    if (!h.id.endsWith(":F")) return skip("chỉ đánh futures");
    if (!this.st.ok) return skip(`tài khoản chưa sẵn sàng – ${this.st.why}`);
    if (this.S.halt) return skip(`đang ngừng mở mới – ${this.S.halt}`);
    if (this.S.day.d !== vnDay(now)) this.S.day = { d: vnDay(now), pnl: 0 };
    const B = this.base();
    if (this.S.day.pnl <= -B * c.lv_daily / 100) return skip(`đã lỗ ${this.S.day.pnl.toFixed(2)} USDT hôm nay (giới hạn ${c.lv_daily}% của ${+B.toFixed(2)} USDT)`);
    const A = this.active();
    if (A.length >= c.hk_max) return skip(`đã có ${A.length} lần bắt đang mở (tối đa ${c.hk_max})`);
    // 🧩 vòng 19: cú sập "cả nhóm" (nhiều coin cùng sập 1 lúc) → tối đa hk_gmax lần đang mở – đêm 10–11/10/2025 cả 9 chỗ vào trong 4 phút rồi cùng lỗ
    if (h.grp && c.hk_gmax > 0) { const g = A.filter((e) => e.grp).length; if (g >= c.hk_gmax) return skip(`cả thị trường đang sập cùng lúc – đã có ${g} lần bắt "cả nhóm" đang mở (tối đa ${c.hk_gmax})`); }
    const sym = this.core.M?.[h.id]?.sym; if (!sym) return skip("không rõ mã hợp đồng");
    if (A.some((e) => e.sym === sym)) return skip("đang có lần bắt khác trên coin này");
    const F = await this.filters(sym); if (!F) return skip(`${sym} không giao dịch được trên ${env === "live" ? "Binance" : "Binance Demo"}`);
    // vốn: tổng ký quỹ đang dùng + lần này ≤ vốn tối đa
    const used = A.reduce((a, e) => a + e.lv.reduce((b, l) => b + (l.st === "cxl" ? 0 : l.px * l.q), 0), 0) / c.lv_lev;
    // mức "vào ngay" (mk, lệnh thị trường) dùng hk_mkS % vốn; các mức chờ chia đều hk_size %
    const lim = h.lv.filter((l) => !l.mk), mkL = h.lv.filter((l) => l.mk);
    // 💰 tuỳ chọn (lv_ag, mặc định tắt): nến sốc có ≥ hk_ag khối lượng là bán tháo chủ động → cỡ lệnh Long × hk_agX (vòng 16). Mọi giới hạn vốn / rủi ro bên dưới vẫn áp như cũ.
    const agX = c.lv_ag && c.hk_ag > 0 && c.hk_agX > 1 && h.side > 0 && h.ag != null && h.ag * 100 >= c.hk_ag ? c.hk_agX : 1;
    let per = Math.max(B * c.hk_size / 100 * agX / Math.max(1, lim.length), F.minN * 1.1), lv = h.lv, small = false;
    const perMk = Math.max(B * (h.mkS || 0) / 100 * agX, F.minN * 1.1);
    const tot = (L) => L.reduce((a, l) => a + (l.mk ? perMk : per), 0);
    if (env === "live") {
      // VỐN NHỎ (chỉ tiền thật): sàn bắt mỗi lệnh ≥ ~5 USDT nên không chia đủ các mức theo 5% được → giữ các mức có lời kỳ vọng cao nhất
      // (kiểm chứng 664 ngày, đã trừ phí & trượt giá): "mua ngay" khi đủ điều kiện +119 bps/lệnh, thắng 73%; lệnh chờ sâu 1,5× +145 bps; 1,25× +108 bps.
      // Ưu tiên: mua ngay → mức chờ theo lựa chọn của anh (lv_small): "near" = mức GẦN trước (khớp nhiều hơn, lời mỗi lệnh thấp hơn),
      // "far" = mức XA trước (lời mỗi lệnh cao hơn, nhiều lần không khớp); mỗi mức cỡ tối thiểu của sàn; cả lần bắt ≤ 25% vốn (1 mức duy nhất: ≤ 30%).
      if (tot(lv) > B * 0.25) {
        small = true; per = F.minN * 1.1; lv = [];
        for (const l of [...mkL, ...[...lim].sort((a, b) => (c.lv_small === "far" ? b.d - a.d : a.d - b.d))]) if (tot([...lv, l]) <= B * (lv.length ? 0.25 : 0.3)) lv.push(l);
        if (!lv.length) return skip(`vốn ${+B.toFixed(2)} USDT: lệnh nhỏ nhất của ${sym} (${F.minN} USDT) lớn hơn 30% vốn – cần số dư futures ≥ ${Math.ceil(F.minN * 1.1 / 0.3)} USDT`);
      }
      // tổng giá trị các lần bắt đang mở ≤ 1× vốn (cú sập toàn thị trường làm nhiều coin cùng chạm cắt lỗ)
      const openN = A.reduce((a, e) => a + e.lv.reduce((b, l) => b + (l.st === "cxl" ? 0 : l.px * l.q), 0), 0);
      if (openN + tot(lv) > B) return skip(`đang mở ${openN.toFixed(2)} USDT giá trị lệnh – thêm lần này vượt 1× vốn ${+B.toFixed(2)} USDT`);
    } else {
      if (tot(lv) > c.lv_cap * 0.25) { lv = [...mkL, ...lim.slice(0, 1)]; per = Math.max(c.lv_cap * c.hk_size / 100, F.minN * 1.1); }
      if (tot(lv) > c.lv_cap * 0.25) lv = lim.slice(0, 1);
      if (tot(lv) > c.lv_cap * 0.25) return skip(`lệnh nhỏ nhất của ${sym} (${F.minN} USDT) lớn hơn 25% vốn tối đa – tăng "Vốn tối đa"`);
    }
    const capM = env === "live" ? B : c.lv_cap;
    if (used + tot(lv) / c.lv_lev > capM) return skip(`đã dùng ${used.toFixed(2)} / ${+capM.toFixed(2)} USDT ký quỹ`);
    if (this.st.avail != null && tot(lv) / c.lv_lev > this.st.avail * 0.9) return skip(`số dư khả dụng ${this.st.avail} USDT không đủ`);
    { const why = this.riskOk(tot(lv), c.lv_lev, +h.stop > 0 ? (+h.stop + 0.5) / 100 : 1); if (why) return skip(`🛡️ giới hạn an toàn chung: ${why}`); }
    // không đụng coin anh đang có vị thế
    const pr = await this.pos(sym); if (pr && Math.abs(pr.amt) > 0) return skip(`anh đang có vị thế ${sym} (${pr.amt}) – bot không đụng vào`);
    if (!this.lev[sym]) {
      await this.req("POST", "/fapi/v1/marginType", { symbol: sym, marginType: "ISOLATED" }).catch((e) => { if (e.code !== -4046) throw e; });
      await this.req("POST", "/fapi/v1/leverage", { symbol: sym, leverage: c.lv_lev }); this.lev[sym] = c.lv_lev;
    }
    const id = `${this.S.seq++}`, side = h.side;
    const ev = { id, k: h.id, sym, side, t0: now, exp: h.exp, hold: h.hold, stopPct: h.stop, R: h.R, c0: h.c0, grp: h.grp ? 1 : 0, brd: h.brd ?? null, env, done: false, pos: { q: 0, ap: 0, t1: null }, stop: null, fees: 0,
      lv: lv.map((l, i) => { const m0 = l.mk ? this.mark(h.id) || l.px : l.px, px = side > 0 ? fl(m0, F.tick) : ce(m0, F.tick), q = Math.max(fl((l.mk ? perMk : per) / px, F.step), ce(F.minN * 1.02 / px, F.step)); return { d: l.d, mk: l.mk ? 1 : 0, px: +px.toFixed(F.td), q: +q.toFixed(F.sd), pxs: px.toFixed(F.td), qs: q.toFixed(F.sd), cid: `mb${id}x${i}${env[0]}`, st: "wait", fq: 0, ap: 0 }; }).filter((l) => l.q >= F.minQ && l.q * l.px >= F.minN) };
    if (!ev.lv.length) return skip("khối lượng sau làm tròn nhỏ hơn mức tối thiểu của sàn");
    this.S.ev[id] = ev; this.save();
    this.say(`🪝 ${base} ${side > 0 ? "sập" : "vọt"} ${Math.abs(h.R / 100).toFixed(1)}% → chuẩn bị ${side > 0 ? "MUA" : "BÁN"} ${ev.lv.map((l) => (l.mk ? `${l.q} NGAY (giá thị trường ~${l.px})` : `${l.q} @ ${l.px}`)).join(" và ")} (${env === "live" ? "TIỀN THẬT" : "Demo"}, ký quỹ cô lập x${c.lv_lev}${small ? `, vốn nhỏ ${+B.toFixed(2)} USDT: chỉ giữ mức ${c.lv_small === "far" ? "xa (lời cao hơn)" : "gần (khớp nhiều hơn)"}, cỡ tối thiểu của sàn` : ""})`);
    await this.submitDue(ev);
    // điện thoại: 1 thông báo cho lần bắt này, các lần khớp / đóng sau sẽ ĐÈ lên (cùng nhóm lv:<id>)
    const wl = ev.lv.filter((l) => !l.mk && l.st !== "cxl"), mkx = ev.lv.find((l) => l.mk);
    this.note(`open:${ev.id}`, 2, `${LTAG(env)} · ⏳ Chờ ${side > 0 ? "mua" : "bán"} ${coin(sym)}`,
      `${base} ${side > 0 ? "sập" : "vọt"} ${Math.abs(h.R / 100).toFixed(1)}%${mkx ? ` · đã ${side > 0 ? "mua" : "bán"} ngay ${mkx.q}` : ""}${wl.length ? ` · chờ khớp ở ${wl.map((l) => l.px).join(" / ")}` : ""} · chờ tối đa ${Math.max(1, Math.round((ev.exp - now) / 60000))} phút, khớp thì giữ ${ev.hold} phút`, `lv:${ev.id}`);
  }
  // lệnh chờ quá xa giá hiện tại bị sàn từ chối (giới hạn PERCENT_PRICE) → chỉ gửi khi giá tới gần
  async submitDue(ev) {
    const F = await this.filters(ev.sym), m = this.mark(ev.k);
    for (const l of ev.lv) {
      if (l.st !== "wait") continue;
      if (Date.now() > ev.exp) { l.st = "cxl"; continue; }
      if (l.mk) {      // vào ngay: lệnh thị trường, gửi 1 lần
        try {
          const o = await this.req("POST", "/fapi/v1/order", { symbol: ev.sym, side: ev.side > 0 ? "BUY" : "SELL", type: "MARKET", quantity: l.qs, newClientOrderId: l.cid, newOrderRespType: "RESULT" });
          l.st = "open"; this.S.errs = 0; this.say(`Đã ${ev.side > 0 ? "mua" : "bán"} ngay ${ev.sym} ${l.q} (lệnh thị trường${+o.avgPrice > 0 ? `, giá TB ${+o.avgPrice}` : ""})`);
        } catch (e) { this.err(`vào ngay ${ev.sym}`, e); l.st = "cxl"; }
        continue;
      }
      if (!m) continue;
      const okBand = ev.side > 0 ? l.px >= m * (F.dn + 0.003) : l.px <= m * (F.up - 0.003);
      if (!okBand) continue;
      try {
        await this.req("POST", "/fapi/v1/order", { symbol: ev.sym, side: ev.side > 0 ? "BUY" : "SELL", type: "LIMIT", timeInForce: "GTC", quantity: l.qs, price: l.pxs, newClientOrderId: l.cid });
        l.st = "open"; this.S.errs = 0; this.say(`Đã đặt lệnh chờ ${ev.side > 0 ? "mua" : "bán"} ${ev.sym} ${l.q} @ ${l.px}`);
      } catch (e) { this.err(`đặt lệnh ${ev.sym}`, e); if (/-2019|-2018|Margin is insufficient|balance/i.test(e.message)) l.st = "cxl"; }
    }
    this.save();
  }
  // ---------------------------------------------------------------- 2) vòng quản lý (mỗi 2 giây)
  // 🔔 nhắc lệnh Binance đang "giữ tay" (không giá / giờ ra) – 30 phút / lần, trừ khi anh hoãn nhắc
  remindKept() {
    const now = Date.now();
    for (const [o, ref] of [...this.active().map((e) => [e, "lv:" + e.id]), ...this.swOpen().map((p) => [p, "swp:" + p.id]), ...this.qOpen().map((p) => [p, "lq:" + p.id])])
      if (extRemind(o, now)) { this.save(); this.note(`kpr:${ref}:${Math.floor(now / 18e5)}`, 2, `${LTAG(this.env())} · ✋ ${coin(o.sym || o.legs?.[0]?.sym || "")} đang giữ – chưa có giá / giờ ra`, `Anh đã chọn giữ lệnh này, bot KHÔNG tự đóng khi hết giờ (cắt lỗ trên sàn vẫn còn). Mở thẻ lệnh để gia hạn có giờ, chọn cách ra (đỉnh nhịp nảy / hoà vốn) hoặc hoãn nhắc.`); }
  }
  async tick() {
    try { this.remindKept(); } catch (e) { /* bỏ qua */ }
    if (this.busy) return; this.busy = true;
    try {
      while (this.q.length) { const h = this.q.shift(); try { await this.place(h); } catch (e) { this.err(`đặt lệnh ${h.id}`, e); } }
      while (this.qm?.length) { const k = this.qm.shift(); try { await this.doManual(k); } catch (e) { this.err(`đóng tay ${k}`, e); } }
      while (this.qe?.length) { const id = this.qe.shift(); try { await this.enterNow(id); } catch (e) { this.err(`vào ngay ${id}`, e); } }
      while (this.qs?.length) { const x = this.qs.shift(); try { await this.swPlace(x); } catch (e) { this.err(`Short bơm ${x.sym}`, e); } }
      await this.swManage();
      while (this.qq?.length) { const x = this.qq.shift(); try { if (x.act === "open") await this.qPlace(x); else await this.qExit(x.id, x.why); } catch (e) { this.err(`📐 ${x.k || ""} ${x.act}`, e); } }
      await this.qManage();
      for (const ev of this.active()) { try { await this.manage(ev); } catch (e) { this.err(`quản lý ${ev.sym}`, e); } }
      await this.accrue();
      await this.mManage().catch((e) => this.err("hẹn đóng lệnh tay", e));
      await this.mHist().catch((e) => { if (!this.mhErrAt || Date.now() - this.mhErrAt > 900e3) { this.mhErrAt = Date.now(); this.err("đọc lệnh tay đã đóng", e); } });
      await this.mSync().catch((e) => { if (!this.mErrAt || Date.now() - this.mErrAt > 600e3) { this.mErrAt = Date.now(); this.err("đọc lệnh tay trên Binance", e); } });
      const d = vnDay(Date.now()); if (this.S.day.d !== d) { this.S.day = { d, pnl: 0 }; if (/hôm nay/.test(this.S.halt || "")) this.S.halt = null; }
    } finally { this.busy = false; }
  }
  async manage(ev) {
    const now = Date.now(), c = this.cfg();
    await this.submitDue(ev);
    // cập nhật trạng thái các lệnh chờ đã gửi (mỗi ~4 giây)
    if (!ev.qAt || now - ev.qAt > 4000) {
      ev.qAt = now;
      for (const l of ev.lv) {
        if (l.st !== "open") continue;
        const o = await this.req("GET", "/fapi/v1/order", { symbol: ev.sym, origClientOrderId: l.cid });
        const fq = +o.executedQty, ap = +o.avgPrice;
        if (fq > l.fq) { if (!ev.ft && +o.updateTime > 0) ev.ft = +o.updateTime; this.addFill(ev, fq - l.fq, (ap * fq - l.ap * l.fq) / Math.max(1e-12, fq - l.fq), l.mk); l.fq = fq; l.ap = ap; }
        if (o.status === "FILLED") l.st = "filled"; else if (["CANCELED", "EXPIRED", "REJECTED"].includes(o.status)) l.st = l.fq > 0 ? "filled" : "cxl";
      }
    }
    // hết giờ chờ khớp → huỷ phần chưa khớp
    if (now > ev.exp) for (const l of ev.lv) if (l.st === "open") { await this.req("DELETE", "/fapi/v1/order", { symbol: ev.sym, origClientOrderId: l.cid }).catch(() => {}); l.st = l.fq > 0 ? "filled" : "cxl"; }
    if (ev.pos.q > 0) {
      await this.ensureStop(ev);
      const m = this.mark(ev.k), sp = ev.stop?.px;
      if (m && ev.pos.ap > 0) { const pr = ev.side * (m / ev.pos.ap - 1) * 1e4; if (!(pr <= ev.dpk)) ev.dpk = pr; if (!(pr >= ev.dmn)) ev.dmn = pr;
        // 🔬 luật CŨ chạy song song (chỉ ghi, không giao dịch): đuổi lời theo giá giữa từng nhịp → lẽ ra đóng ở bao nhiêu bps, sau bao nhiêu giây
        if (ev.sxp == null && c.hk_tra > 0) { if (!(pr <= ev.spk)) ev.spk = pr; if (ev.spk >= c.hk_tra && pr <= ev.spk - c.hk_trg) { ev.sxp = Math.round(pr); ev.sxs = Math.round((Date.now() - ev.pos.t1) / 1000); } } }      // 🔬 nhật ký thoát (vòng 19): đỉnh lời / đáy lỗ theo giá giữa
      const hitSoft = m && sp && (ev.side > 0 ? m <= sp * 0.995 : m >= sp * 1.005);      // sàn lẽ ra đã cắt – kiểm tra & đóng dự phòng
      const xw = ev.xm && m && ev.pos.ap > 0 ? extExit(ev, ev.side * (m / ev.pos.ap - 1) * 1e4, now) : null;      // ⏱ gia hạn kiểu đỉnh nhịp nảy / hoà vốn
      if (m && ev.pos.ap > 0) this.askNear(ev, "lv", ev.id, ev.sym, ev.pos.t1 + ev.hold * 60e3, ev.hold * 60e3, ev.side * ev.pos.q * (m - ev.pos.ap), ev.side * (m / ev.pos.ap - 1) * 100);
      if (xw) await this.close(ev, xw);
      else if (!ev.keep && now >= ev.pos.t1 + ev.hold * 60e3) await this.close(ev, "TIME");      // ev.keep: anh chọn giữ → không tự đóng khi hết giờ
      else if (hitSoft) await this.close(ev, "SL");
      // cắt lỗ đuổi chỉ cho lệnh CHỜ: với "mua ngay" nó cắt mất cú hồi lớn (vòng 9, 1.863 lệnh: giữ 60 phút +125 bps/lệnh, đuổi 1,5%/1% chỉ +60) – tiền thật giữ đủ giờ
      else if (c.hk_tra > 0 && m && ev.pos.ap > 0 && !ev.trDone && this.trail(ev, m, c)) await this.trailClose(ev);
      else if (c.lv_u40 && c.hk_u40 > 0 && m && ev.pos.ap > 0 && this.peak(ev, m, c, now)) await this.close(ev, "PEAK");      // 💰 tuỳ chọn (mặc định tắt): còn lỗ từ phút hk_u40 → ra ở đỉnh nhịp nảy (vòng 15)
      else if (!ev.pAt || now - ev.pAt > 20000) {      // vị thế còn không? (cắt lỗ trên sàn đã chạy / anh tự đóng)
        ev.pAt = now; const p = await this.pos(ev.sym);
        if (p && Math.abs(p.amt) === 0 && ev.lv.every((l) => l.st !== "open")) await this.finish(ev, "SL", sp || ev.pos.ap, "vị thế đã được đóng trên sàn (cắt lỗ chạy hoặc anh tự đóng)");
      }
    } else if (ev.lv.every((l) => l.st === "cxl" || (l.st === "filled" && l.fq === 0))) { ev.done = true; this.say(`${ev.sym}: hết ${Math.round((ev.exp - ev.t0) / 60e3)} phút giá không tới lệnh chờ – đã huỷ, không mất phí`); this.missWhy(ev).catch(() => {}); }
    this.save();
  }
  // Lệnh chờ hết giờ không khớp: so đỉnh/đáy trên sàn đang đặt lệnh (Demo / thật) với giá sàn thật mà sàn thử dùng (nến 1 phút của luồng dữ liệu bot)
  // → ghi rõ "Demo không chạm tới mức chờ trong khi sàn thật đã chạm" (sàn Demo có sổ lệnh riêng, râu nến thường ngắn hơn sàn thật).
  async missWhy(ev) {
    const K = await this.req("GET", "/fapi/v1/klines", { symbol: ev.sym, interval: "1m", startTime: ev.t0 - 60e3, endTime: ev.exp }, false);
    if (!Array.isArray(K) || !K.length) return;
    const hi = Math.max(...K.map((k) => +k[2])), lo = Math.min(...K.map((k) => +k[3])), LL = ev.lv.filter((l) => !l.mk), lvl = ev.side > 0 ? Math.max(...LL.map((l) => l.px)) : Math.min(...LL.map((l) => l.px));
    const reach = ev.side > 0 ? lo : hi, gap = ev.side > 0 ? (reach / lvl - 1) * 100 : (lvl / reach - 1) * 100;
    const x = this.core.M?.[ev.k], m0 = Math.floor(ev.t0 / 60000) - 1, m1 = Math.floor(ev.exp / 60000), B = (x?.m1 || []).filter((b) => b[0] >= m0 && b[0] <= m1);
    const rH = B.length ? Math.max(...B.map((b) => b[2])) : null, rL = B.length ? Math.min(...B.map((b) => b[3])) : null, rr = ev.side > 0 ? rL : rH;
    const realHit = rr != null && (ev.side > 0 ? rr <= lvl : rr >= lvl), nm = ev.env === "live" ? "sàn thật" : "Demo";
    ev.miss = { hi, lo, rH, rL, lvl };
    this.missAdd({ k: ev.k, side: ev.side, R: ev.R, t0: iso(ev.t0), what: "nofill", reach: +reach.toPrecision(6), lvl: +lvl.toPrecision(6), gap: +gap.toFixed(2), real: rr != null ? +rr.toPrecision(6) : null, realHit });
    this.say(`🔍 ${ev.sym}: ${nm} ${ev.side > 0 ? "thấp nhất" : "cao nhất"} ${+reach.toPrecision(6)} – còn cách mức chờ gần nhất ${+lvl.toPrecision(6)} ${gap.toFixed(2)}%${rr != null ? ` · giá Binance thật (sàn thử dùng) ${ev.side > 0 ? "thấp nhất" : "cao nhất"} ${+rr.toPrecision(6)}${realHit ? " – ĐÃ chạm mức chờ" : " – cũng chưa chạm"}` : ""}${realHit && ev.env !== "live" ? ". Sàn Demo có sổ lệnh riêng, râu nến lúc sốc thường ngắn hơn sàn thật → lệnh chờ sâu khó khớp trên Demo." : ""}`);
  }
  missAdd(m) { const env = this.env(); this.S.miss = [...(this.S.miss || []).slice(-79), { ...m, env }]; }
  addFill(ev, q, px, mk = 0) {
    const c = this.cfg(), P = ev.pos, nq = P.q + q;
    if (!ev.ff && ev.k && !String(ev.k).startsWith("q:")) { ev.ff = 1; try { this.core.hkLiveFill?.(Date.now()); } catch (e) { /* bỏ qua */ } }
    P.ap = (P.ap * P.q + px * q) / nq; P.q = nq; P.t1 ||= Date.now(); ev.pk = 0; ev.fees += q * px * (mk ? c.fee_t : c.fee_m) / 100; ev.needStop = true; ev.ichk = 0;
    this.say(`✅ Khớp ${ev.side > 0 ? "MUA" : "BÁN"} ${ev.sym} ${+q.toFixed(8)} @ ${+px.toPrecision(8)} · vị thế ${+P.q.toFixed(8)} giá TB ${+P.ap.toPrecision(8)} · tự đóng sau ${ev.hold} phút`, "win");
    this.note(`fill:${ev.id}:${P.q}`, 2, `${LTAG(ev.env)} · ✅ Khớp ${ev.side > 0 ? "Long" : "Short"} ${coin(ev.sym)}`, `${+q.toFixed(8)} @ ${+px.toPrecision(8)} – tự đóng sau ${ev.hold} phút, cắt lỗ trên sàn ${ev.stopPct}%`, `lv:${ev.id}`);
  }
  // 🪝 cắt lỗ đuổi (như sàn thử): lời theo giá giữa ≥ hk_tra bps → đóng khi trả lại hk_trg bps từ đỉnh lời. Đỉnh lời tính lại khi khớp thêm mức (giá TB đổi).
  // ghi lời/lỗ (bps) mỗi phút từ lúc khớp; từ phút hk_u40 mà còn lỗ → true khi nhịp nảy vừa tạo đỉnh (đạo hàm bậc 1 đổi từ > 0 sang ≤ 0, bậc 2 < 0) – giống sàn thử (hookPeak)
  peak(ev, m, c, now) {
    const mi = Math.floor((now - ev.pos.t1) / 60000); if (!(mi > (ev.pmi || 0))) return false;
    const pr = ev.side * (m / ev.pos.ap - 1) * 1e4; ev.pmi = mi; const A = (ev.pm ||= []); A.push(Math.round(pr)); if (A.length > 70) A.shift();
    const w = c.hk_uw || 9; if (mi < c.hk_u40 || !(pr < 0) || A.length < w + 1) return false;
    const d1 = sgVA(A.slice(-w)), d0 = sgVA(A.slice(-w - 1, -1));
    return d1.v <= 0 && d1.a < 0 && d0.v > 0;
  }
  // vòng 19 (research/r19_result.md, 4.959 chân theo từng giao dịch thật): xét đuổi lời theo giá từng nhịp bị nhịp giật trong phút đẩy ra sớm (trung vị 6 giây sau khớp ở ngày sập)
  // → hk_trm = 1: chỉ xét ở GIÁ GIỮA CUỐI MỖI PHÚT (lúc nến phút đóng). +48 bps/chân, danh mục +19% → +49% (trượt 10 bps). hk_trm = 0: như cũ, mỗi nhịp.
  trail(ev, m, c) {
    let px = m;
    if (c.hk_trm) { const mi = Math.floor(Date.now() / 60e3); if (ev.tmi == null || mi === ev.tmi) { ev.tmi = mi; ev.tlm = m; return false; } px = ev.tlm; ev.tmi = mi; ev.tlm = m; }      // phút trước vừa đóng: giá giữa cuối phút đó
    const pr = ev.side * (px / ev.pos.ap - 1) * 1e4; if (!(pr <= ev.pk)) ev.pk = pr; return ev.pk >= c.hk_tra && pr <= ev.pk - c.hk_trg;
  }
  // cắt lỗ đuổi chạy: chỉ đóng phần của LỆNH CHỜ; chân "mua ngay" (nếu đã khớp) giữ tới hết giờ – vòng 19 chỉ kiểm chứng chân mua ngay giữ đủ giờ
  async trailClose(ev) {
    const qm = ev.lv.filter((l) => l.mk && l.fq > 0).reduce((a, l) => a + l.fq, 0);
    if (!(qm > 0)) return this.close(ev, "TRAIL");
    for (const l of ev.lv) if (l.st === "open") { await this.req("DELETE", "/fapi/v1/order", { symbol: ev.sym, origClientOrderId: l.cid }).catch(() => {}); l.st = l.fq > 0 ? "filled" : "cxl"; }
    const F = await this.filters(ev.sym), p = await this.pos(ev.sym), have = Math.abs(p.amt), q = fl(Math.min(have, ev.pos.q - qm), F.step);
    ev.trDone = 1;
    if (!(q > 0) || q >= have) return this.close(ev, "TRAIL");
    const m = this.mark(ev.k) || ev.pos.ap;
    const o = await this.req("POST", "/fapi/v1/order", { symbol: ev.sym, side: ev.side > 0 ? "SELL" : "BUY", type: "MARKET", quantity: q.toFixed(F.sd), reduceOnly: "true", newOrderRespType: "RESULT" });
    const px = +o.avgPrice > 0 ? +o.avgPrice : m, c = this.cfg();
    ev.prp = (ev.prp || 0) + ev.side * q * (px - ev.pos.ap); ev.pqty = (ev.pqty || 0) + q; ev.ppx = px; ev.fees += q * px * c.fee_t / 100; ev.pos.q = Math.max(0, ev.pos.q - q);
    ev.dxm = m; ev.dxp = ev.side * (m / ev.pos.ap - 1) * 1e4; ev.dxt = Date.now();
    this.say(`🪝 ${ev.sym}: cắt lỗ đuổi – đã đóng phần lệnh chờ ${+q.toFixed(8)} @ ${+px.toPrecision(8)} (${ev.side * (px / ev.pos.ap - 1) * 1e4 >= 0 ? "+" : ""}${(ev.side * (px / ev.pos.ap - 1) * 1e4).toFixed(0)} bps); phần mua ngay ${+ev.pos.q.toFixed(8)} giữ tới hết giờ`, "info");
    this.save();
  }
  async ensureStop(ev) {
    if (!ev.needStop || !ev.stopPct) return;
    const F = await this.filters(ev.sym), raw = ev.pos.ap * (1 - ev.side * ev.stopPct / 100), pxs = (ev.side > 0 ? ce(raw, F.tick) : fl(raw, F.tick)).toFixed(F.td), px = +pxs;
    if (ev.stop?.id) await this.cancelStop(ev);
    const p = { symbol: ev.sym, side: ev.side > 0 ? "SELL" : "BUY", type: "STOP_MARKET", stopPrice: pxs, closePosition: "true", workingType: "MARK_PRICE", newClientOrderId: `mb${ev.id}s${Date.now() % 1e6}` };
    try { const o = await this.req("POST", "/fapi/v1/order", p); ev.stop = { id: o.orderId, px, kind: "order" }; }
    catch (e) {      // một số tài khoản phải dùng cổng lệnh điều kiện (Algo) cho STOP_MARKET
      try { const o = await this.req("POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: p.symbol, side: p.side, type: "STOP_MARKET", triggerPrice: pxs, closePosition: "true", workingType: "MARK_PRICE" }); ev.stop = { id: o.algoId, px, kind: "algo" }; }
      catch (e2) { ev.stop = { id: null, px, kind: "soft" }; this.err(`đặt cắt lỗ trên sàn ${ev.sym} (dùng cắt lỗ dự phòng trên máy chủ)`, e2); }
    }
    ev.needStop = false;
    this.say(`🛡️ Cắt lỗ ${ev.sym} tại ${px} (${ev.stop.kind === "soft" ? "dự phòng trên máy chủ" : "đặt trên sàn"})`);
  }
  async cancelStop(ev) {
    const s = ev.stop; if (!s?.id) return;
    if (s.kind === "algo") await this.req("DELETE", "/fapi/v1/algoOrder", { algoId: s.id }).catch(() => {});
    else await this.req("DELETE", "/fapi/v1/order", { symbol: ev.sym, orderId: s.id }).catch(() => {});
    ev.stop = { ...s, id: null };
  }
  async pos(sym) {
    const L = await this.req("GET", "/fapi/v2/positionRisk", { symbol: sym }).catch(() => this.req("GET", "/fapi/v3/positionRisk", { symbol: sym }));
    const p = (L || []).find((x) => x.symbol === sym); return p ? { amt: +p.positionAmt, ep: +p.entryPrice } : { amt: 0, ep: 0 };
  }
  async close(ev, why) {
    { const m = this.mark(ev.k); ev.dxm = m || null; ev.dxt = Date.now(); ev.dxp = m && ev.pos.ap > 0 ? ev.side * (m / ev.pos.ap - 1) * 1e4 : null; }      // 🔬 giá giữa lúc quyết định đóng
    for (const l of ev.lv) if (l.st === "open") { await this.req("DELETE", "/fapi/v1/order", { symbol: ev.sym, origClientOrderId: l.cid }).catch(() => {}); l.st = l.fq > 0 ? "filled" : "cxl"; }
    const p = await this.pos(ev.sym), q = Math.abs(p.amt), F = await this.filters(ev.sym);
    let px = this.mark(ev.k) || ev.pos.ap;
    if (q > 0) {
      const o = await this.req("POST", "/fapi/v1/order", { symbol: ev.sym, side: ev.side > 0 ? "SELL" : "BUY", type: "MARKET", quantity: q.toFixed(F.sd), reduceOnly: "true", newOrderRespType: "RESULT" });
      if (+o.avgPrice > 0) px = +o.avgPrice;
    }
    await this.cancelStop(ev);
    await this.finish(ev, why, px, q > 0 ? "" : "vị thế đã đóng trước đó");
  }
  // ---------------------------------------------------------------- 🧪 SHORT COIN VỪA BƠM bằng tiền thật (bật riêng: sw_lv_pump)
  // Tín hiệu từ phòng thử nghiệm (00:00 UTC, coin +≥100%/24h, khối lượng ≥ 10 triệu USD). Short lệnh thị trường, ký quỹ CÔ LẬP x1,
  // giữ 7 ngày, KHÔNG cắt lỗ (kiểm chứng: cắt lỗ +15/+30% làm mất lợi thế). Giá ×2 → sàn thanh lý = mất đúng phần tiền của lệnh, không hơn.
  // Cỡ: sw_lv_sz % vốn (tối thiểu = lệnh nhỏ nhất của sàn), ≤ 25% vốn/lệnh, tổng ≤ 60% vốn, tối đa sw_lv_max lệnh cùng lúc.
  onSwing(s) { (this.qs ||= []).push(s); }
  // ✋ đóng tay từ trang: lv:<id> = lần Bắt râu sập (huỷ lệnh chờ + đóng vị thế), swp:<id> = lệnh Short bơm
  onManual(k) { (this.qm ||= []).push(k); }
  // ✋ VÀO NGAY từ trang: lần Bắt râu sập đang chờ khớp → huỷ các lệnh chờ còn lại, vào phần còn thiếu bằng lệnh thị trường; sau đó quản lý như lệnh khớp thường
  // (cắt lỗ đặt trên sàn, cắt lỗ đuổi, giữ tối đa hk_h phút tính từ lúc vào)
  onEnter(id) { (this.qe ||= []).push(id); }
  async enterNow(id) {
    const ev = this.S.ev[id]; if (!ev || ev.done) return; ev.ivE = 1;      // ✋ anh bấm "vào ngay" → ghi là có can thiệp
    const F = await this.filters(ev.sym); if (!F) return;
    let rem = 0;
    for (const l of ev.lv) {
      if (l.st === "open") {
        await this.req("DELETE", "/fapi/v1/order", { symbol: ev.sym, origClientOrderId: l.cid }).catch(() => {});
        const o = await this.req("GET", "/fapi/v1/order", { symbol: ev.sym, origClientOrderId: l.cid }).catch(() => null);
        if (o) { const fq = +o.executedQty, ap = +o.avgPrice; if (fq > (l.fq || 0)) { this.addFill(ev, fq - (l.fq || 0), (ap * fq - (l.ap || 0) * (l.fq || 0)) / Math.max(1e-12, fq - (l.fq || 0)), l.mk); l.fq = fq; l.ap = ap; } }
      }
      if (l.st === "open" || l.st === "wait") { rem += Math.max(0, l.q - (l.fq || 0)); l.st = (l.fq || 0) > 0 ? "filled" : "cxl"; }
    }
    ev.exp = Math.min(ev.exp, Date.now());
    const m = this.mark(ev.k) || ev.pos.ap || ev.c0; let q = fl(rem, F.step);
    if (m && q * m < F.minN) q = ce(F.minN * 1.02 / m, F.step);
    if (!(rem > 0) || !(q > 0)) { this.say(`✋ ${ev.sym}: không còn mức chờ nào để vào ngay`, "info"); this.save(); return; }
    const o = await this.req("POST", "/fapi/v1/order", { symbol: ev.sym, side: ev.side > 0 ? "BUY" : "SELL", type: "MARKET", quantity: q.toFixed(F.sd), newClientOrderId: `mb${ev.id}n${Date.now() % 1e6}`, newOrderRespType: "RESULT" });
    const fq = +o.executedQty || q, ap = +o.avgPrice || m;
    ev.lv.push({ d: 0, mk: 0, man: 1, px: ap, q: fq, st: "filled", fq, ap, cid: o.clientOrderId || "" });
    this.addFill(ev, fq, ap, 1); ev.man = 1;
    this.say(`✋ Anh bấm VÀO NGAY ${ev.sym} trên trang – ${ev.side > 0 ? "mua" : "bán"} ${fq} giá thị trường ~${+ap.toPrecision(8)} (đã huỷ lệnh chờ còn lại)`, "info");
    this.save();
  }
  async doManual(k) {
    if (k.startsWith("lv:")) { const ev = this.S.ev[k.slice(3)]; if (ev && !ev.done) {
      const pr = await this.pos(ev.sym);
      if (!(ev.pos?.q > 0) && !Math.abs(pr.amt)) {      // chưa khớp mức nào → chỉ huỷ lệnh chờ, không tính là 1 lệnh
        for (const l of ev.lv) if (l.st === "open") { await this.req("DELETE", "/fapi/v1/order", { symbol: ev.sym, origClientOrderId: l.cid }).catch(() => {}); l.st = "cxl"; } else if (l.st === "wait") l.st = "cxl";
        ev.done = true; ev.why = "MANUAL"; ev.t2 = Date.now(); this.say(`✋ Anh huỷ lệnh chờ ${ev.sym} trên trang`, "info"); this.save(); return;
      }
      this.say(`✋ Anh bấm đóng ${ev.sym} trên trang – huỷ lệnh chờ & đóng vị thế`, "info"); await this.close(ev, "MANUAL");
    } }
    else if (k.startsWith("swp:")) { const p = this.S.swp?.[k.slice(4)]; if (p && !p.done) { this.say(`✋ Anh bấm đóng Short bơm ${p.sym} trên trang`, "info"); await this.swClose(p, "MANUAL"); } }
    else if (k.startsWith("lq:")) { const p = this.S.qp?.[k.slice(3)]; if (p && !p.done) { this.say(`✋ Anh bấm đóng 📐 ${p.name} ${p.legs.map((L) => coin(L.sym)).join("/")} trên trang`, "info"); await this.qClose(p, "MANUAL"); } }
    else if (k.startsWith("kp:") || k.startsWith("kz:")) {      // ⏱ gia hạn / giữ lệnh bot trên Binance (cắt lỗ trên sàn / cắt lỗ đuổi vẫn chạy) · 🔕 hoãn nhắc
      const spec = k.slice(k.lastIndexOf(":") + 1), ref = k.slice(3, k.lastIndexOf(":")), t = ref.split(":")[0], id = ref.slice(ref.indexOf(":") + 1);
      const o = t === "lv" ? this.S.ev?.[id] : t === "swp" ? this.S.swp?.[id] : t === "lq" ? this.S.qp?.[id] : null;
      if (o && !o.done) {
        const nm = `${coin(o.sym || o.legs?.[0]?.sym || "")} trên ${LTAG(this.env())}`, now = Date.now();
        if (k.startsWith("kz:")) { o.xs = +spec > 0 ? now + +spec * 60e3 : 0; this.say(`🔕 ${nm}: ${+spec > 0 ? `hoãn nhắc ${+spec >= 60 ? +spec / 60 + " giờ" : spec + " phút"}` : "nhắc lại như thường"}`, "info"); }
        else if (t === "lv") { if (o.pos?.q > 0) this.say(`⏱ ${nm}: ${extSet(o, spec, now, o.pos.t1 + o.hold * 60e3, (ms) => { o.hold = Math.max(1, (ms - o.pos.t1) / 60e3); })}`, "info"); }
        else this.say(`⏱ ${nm}: ${extSet(o, spec, now, o.exp, (ms) => { o.exp = ms; })}`, "info");
        this.save();
      }
    }
    else if (k.startsWith("mx:")) { const [, sym, fr] = k.split(":"); await this.mClose(sym, Math.min(1, Math.max(0.01, +fr || 1))); }
    else if (k.startsWith("mst:") || k.startsWith("mtp:")) { const [kd, sym, pxs] = k.split(":"); await this.mCond(sym, kd === "mst" ? "sl" : "tp", +pxs || 0); }
    else if (k.startsWith("mw:")) { this.mAt = 0; await this.mSync(true); }
    else if (k.startsWith("mcp:")) { const [, sym, sd, usd, lev, sl, tp, ex, ...rest] = k.split(":"); await this.mCopy(sym, +sd > 0 ? 1 : -1, +usd || 0, Math.max(1, Math.min(20, Math.round(+lev || 1))), +sl || 0, +tp || 0, +ex || 0, rest.join(":")); }
    else if (k.startsWith("mlk:")) { const [, sym, sd, ex, ...rest] = k.split(":"); this.mLink(sym, +sd || 0, +ex || 0, rest.join(":")); this.save(); await this.mSync(true); }
  }
  // ---------------------------------------------------------------- ✋ LỆNH TAY: vị thế anh tự mở trên Binance Futures (bot KHÔNG mở) – bot không tự đụng tới.
  // Đọc 20 giây/lần (vị thế + lệnh cắt lỗ / chốt lời đang chờ) để trang hiện & cho anh tự quản lý: đóng (cả / một nửa), đặt / sửa / huỷ cắt lỗ, chốt lời.
  // Mọi thao tác chỉ chạy khi anh bấm trên trang. Mã nào bot đang có lệnh → không thao tác ở đây (Binance gộp chung vị thế cùng mã).
  botSyms() { const s = new Set(); for (const e of this.active()) s.add(e.sym); for (const p of this.qOpen()) for (const L of p.legs) s.add(L.sym); for (const p of this.swOpen()) s.add(p.sym); return s; }
  async mSync(force) {
    const env = this.env(); if (!this.keys(env)) { this.S.man = null; return; }
    if (!force && Date.now() - (this.mAt || 0) < 20e3) return; this.mAt = Date.now();
    const L = await this.req("GET", "/fapi/v2/positionRisk", {}).catch(() => this.req("GET", "/fapi/v3/positionRisk", {})), bot = this.botSyms();
    const pos = (L || []).filter((x) => +x.positionAmt !== 0).map((x) => ({ sym: x.symbol, amt: +x.positionAmt, ep: +x.entryPrice, mk: +x.markPrice, lev: +x.leverage || 1, up: +(+x.unRealizedProfit || 0).toFixed(4),
      liq: +x.liquidationPrice || 0, mt: x.marginType === "isolated" ? "iso" : "cross", im: +(+x.isolatedMargin || 0).toFixed(4), ps: x.positionSide || "BOTH", bot: bot.has(x.symbol) }));
    const ord = {};
    if (pos.some((p) => !p.bot)) {
      const want = new Set(pos.filter((p) => !p.bot).map((p) => p.sym)), put = (o) => { if (want.has(o.sym)) (ord[o.sym] ||= []).push(o); };
      const O = await this.req("GET", "/fapi/v1/openOrders", {}).catch(() => []);
      for (const o of O || []) put({ sym: o.symbol, id: o.orderId, algo: 0, type: o.type, side: o.side, px: +(+o.stopPrice || +o.price || 0), q: +o.origQty || 0, cp: o.closePosition === true || o.closePosition === "true", ro: o.reduceOnly === true || o.reduceOnly === "true" });
      const A = await this.req("GET", "/fapi/v1/openAlgoOrders", {}).catch(() => []);
      for (const o of (Array.isArray(A) ? A : A?.orders || A?.rows || [])) put({ sym: o.symbol, id: o.algoId, algo: 1, type: o.orderType || o.type || "", side: o.side, px: +(+o.triggerPrice || +o.stopPrice || +o.price || 0), q: +o.quantity || +o.origQty || 0, cp: o.closePosition === true || o.closePosition === "true", ro: o.reduceOnly === true || o.reduceOnly === "true" });
    }
    this.S.man = { env, at: iso(Date.now()), pos, ord, lk: this.S.mlk || {} };
  }
  // ⏱ hẹn đóng lệnh tay: theo giờ (exp) và/hoặc theo 1 lệnh sàn thử (pk) – sàn thử đóng lệnh đó (chốt / cắt / hết giờ / anh đóng) → máy chủ đóng lệnh thật luôn
  paperOpen(pk) {
    const S = this.core.S; if (!S) return true;      // chưa nạp xong trạng thái sàn thử → coi như còn mở, không đóng bừa
    const [t, a, b] = pk.split(":");
    if (t === "pp") return !!S.pos?.[pk.slice(3)];
    if (t === "sw") return !!S.sw?.[a]?.pos?.[b];
    if (t === "q") return !!S.q?.[a]?.pos?.[b];
    return true;
  }
  pkName(pk) { const [t, a, b] = String(pk).split(":"); return t === "pp" ? `🧪 ${coin(a)} (sàn thử)` : t === "sw" ? `🧪 ${a === "pump" ? "Short coin vừa bơm" : "Short coin mới niêm yết"} #${b}` : t === "q" ? `🧪 định lượng ${a} #${b}` : pk; }
  mLink(sym, sd, exp, pk) {
    const L = (this.S.mlk ||= {});
    if (!exp && !pk) { if (L[sym]) { delete L[sym]; this.say(`⏱ Huỷ hẹn đóng lệnh tay ${coin(sym)}`, "info"); } return; }
    if (pk && !this.paperOpen(pk)) { this.say(`⏱ Lệnh tay ${coin(sym)}: lệnh ${this.pkName(pk)} không còn mở – không gắn theo`, "info"); pk = ""; if (!exp) return; }
    if (!pk && !(exp > Date.now())) { this.say(`⏱ Lệnh tay ${coin(sym)}: giờ hẹn đã qua – không hẹn`, "info"); return; }
    L[sym] = { sd, exp: exp > Date.now() ? exp : 0, pk, at: Date.now() };
    const t = L[sym].exp ? new Date(L[sym].exp + 7 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "";
    this.say(`⏱ Hẹn đóng lệnh tay ${coin(sym)} ${sd > 0 ? "Long" : "Short"}:${t ? ` lúc ${t} (giờ VN)` : ""}${pk ? `${t ? " hoặc" : ""} khi lệnh ${this.pkName(pk)} đóng` : ""}`, "info");
  }
  async mManage() {
    const L = this.S.mlk; if (!L || !Object.keys(L).length) return;
    const man = this.S.man;
    for (const [sym, x] of Object.entries(L)) {
      const P = man?.pos?.find((p) => p.sym === sym);
      if (man && Date.now() - Date.parse(man.at + "Z") < 120e3 && (!P || Math.sign(P.amt) !== x.sd)) { delete L[sym]; this.save(); continue; }      // vị thế đã đóng / đổi chiều → bỏ hẹn
      const why = x.exp && Date.now() >= x.exp ? "tới giờ hẹn" : x.pk && !this.paperOpen(x.pk) ? `lệnh ${this.pkName(x.pk)} vừa đóng` : "";
      if (!why) continue;
      delete L[sym]; this.save();
      this.say(`⏱ Lệnh tay ${coin(sym)}: ${why} → đóng theo hẹn`, "info");
      this.mWhyNext = x.pk && !(x.exp && Date.now() >= x.exp) ? "FOLLOW" : "TIMER"; await this.mClose(sym, 1);
    }
  }
  // 🧾 LỆNH TAY ĐÃ ĐÓNG: dựng lại từ sổ khớp lệnh của Binance (userTrades) – mỗi lần vị thế từ 0 → mở → về 0 = 1 lệnh; lời/lỗ, phí, funding lấy đúng số của sàn.
  // Mã có lời/lỗ thực hiện (income REALIZED_PNL) mới đọc sổ khớp; bỏ các lệnh trùng thời gian với lệnh của bot cùng mã. 5 phút/lần, lần đầu đọc lại 30 ngày.
  async mHist() {
    const env = this.env(); if (!this.keys(env) || Date.now() - (this.mhAt || 0) < 300e3) return; this.mhAt = Date.now();
    const H = ((this.S.mh ||= {})[env] ||= { last: Date.now() - 30 * 864e5, L: {} }), now = Date.now(), syms = new Set();
    for (let a = H.last - 2 * 3600e3; a < now; a += 7 * 864e5) {
      const I = await this.req("GET", "/fapi/v1/income", { incomeType: "REALIZED_PNL", startTime: String(a), endTime: String(Math.min(now, a + 7 * 864e5 - 1)), limit: "1000" });
      for (const x of I || []) syms.add(x.symbol);
    }
    if (!syms.size) { H.last = now; return; }
    const ms = (t) => (t ? (typeof t === "number" ? t : Date.parse(String(t) + (String(t).endsWith("Z") ? "" : "Z"))) : 0);
    const win = (sym) => [...(this.S.hist || []).filter((h) => h.sym === sym).map((h) => [ms(h.t1 || h.ts), ms(h.t2)]), ...this.active().filter((e) => e.sym === sym).map((e) => [e.t0, now]),
      ...Object.values(this.S.swp || {}).filter((p) => p.sym === sym).map((p) => [p.t0, p.t2 || now]), ...Object.values(this.S.qp || {}).filter((p) => p.legs?.some((L) => L.sym === sym)).map((p) => [p.t0, p.t2 || now])];
    const cur = new Map((this.S.man?.pos || []).map((p) => [p.sym, p.amt]));
    for (const sym of syms) {
      const T = [];
      for (let a = H.last - 7 * 864e5; a < now; a += 7 * 864e5) { const R = await this.req("GET", "/fapi/v1/userTrades", { symbol: sym, startTime: String(a), endTime: String(Math.min(now, a + 7 * 864e5 - 1)), limit: "1000" }); T.push(...(R || [])); }
      T.sort((x, y) => x.time - y.time || x.id - y.id);
      const sq = (t) => (t.side === "BUY" ? 1 : -1) * +t.qty;
      let pos = (cur.get(sym) || 0) - T.reduce((s2, t) => s2 + sq(t), 0); if (Math.abs(pos) < 1e-9) pos = 0;
      let R = null; const W = win(sym);
      for (const t of T) {
        const q = sq(t), before = pos; pos = +(pos + q).toFixed(10);
        if (before === 0 && pos !== 0) R = { sd: Math.sign(pos), t1: t.time, eq: 0, ev: 0, xq: 0, xv: 0, pnl: 0, fee: 0, maxQ: 0 };
        if (!R) continue;
        const open = Math.sign(q) === R.sd; if (open) { R.eq += Math.abs(q); R.ev += Math.abs(q) * +t.price; } else { R.xq += Math.abs(q); R.xv += Math.abs(q) * +t.price; }
        R.pnl += +t.realizedPnl || 0; R.fee += /^(USDT|USDC|FDUSD)$/.test(t.commissionAsset) ? +t.commission : +t.commission * (this.pxm?.[t.commissionAsset] || 0); R.maxQ = Math.max(R.maxQ, Math.abs(pos));      // phí trả bằng BNB → quy USDT theo giá spot
        if (pos === 0 || Math.sign(pos) !== R.sd) {
          const t2 = t.time, bot = W.some(([a, b]) => a && t2 >= a - 60e3 && R.t1 <= (b || now) + 60e3);
          if (!bot && R.eq > 0 && R.xq > 0) {
            const key = `${sym}|${R.t1}`, wy = this.S.mxWhy?.[sym], why = wy && Math.abs(wy.at - t2) < 180e3 ? wy.why : "EXCH", e = R.ev / R.eq, x = R.xv / R.xq;
            if (!H.L[key]) (this.mNew ||= new Set()).add(key);
            H.L[key] = { id: key, strat: "man", sym, side: R.sd, q: +R.maxQ.toPrecision(10), e: +e.toPrecision(8), x: +x.toPrecision(8), pnl: +(R.pnl - R.fee).toFixed(4), gross: +R.pnl.toFixed(4), fee: +R.fee.toFixed(4), t1: iso(R.t1), t2: iso(t2), why, env,
              N: +(R.eq * e).toFixed(4), net: +((R.pnl - R.fee) / Math.max(1e-9, R.eq * e) * 1e4).toFixed(1) };
          }
          R = pos !== 0 ? { sd: Math.sign(pos), t1: t.time, eq: Math.abs(pos), ev: Math.abs(pos) * +t.price, xq: 0, xv: 0, pnl: 0, fee: 0, maxQ: Math.abs(pos) } : null;      // đảo chiều trong 1 lệnh khớp → mở lệnh mới
        }
      }
    }
    // funding trong thời gian giữ (đọc 1 lần cho các lệnh chưa có)
    const need = Object.values(H.L).filter((h) => h.fund == null);
    if (need.length) {
      const a0 = Math.min(...need.map((h) => Date.parse(h.t1 + "Z"))), F = [];
      for (let a = a0; a < now; a += 7 * 864e5) F.push(...((await this.req("GET", "/fapi/v1/income", { incomeType: "FUNDING_FEE", startTime: String(a), endTime: String(Math.min(now, a + 7 * 864e5 - 1)), limit: "1000" }).catch(() => [])) || []));
      for (const h of need) { const a = Date.parse(h.t1 + "Z"), b = Date.parse(h.t2 + "Z"); h.fund = +F.filter((x) => x.symbol === h.sym && +x.time >= a && +x.time <= b).reduce((s2, x) => s2 + +x.income, 0).toFixed(4); h.pnl = +(h.pnl + h.fund).toFixed(4); h.net = +(h.pnl / Math.max(1e-9, h.N || h.q * h.e) * 1e4).toFixed(1); }
    }
    // lệnh tay mới đóng → sổ lệnh (Sổ lệnh, Sổ thuế, biểu đồ) + tổng kết ngày (trang Kết quả) – 1 lần cho mỗi lệnh
    for (const key of this.mNew || []) { const h = H.L[key]; if (!h) continue; const t1 = Date.parse(h.t1 + "Z"), t2 = Date.parse(h.t2 + "Z");
      try { this.led({ ...h, k: coin(h.sym) + ":F", nl: 1 }); } catch (e) { /* bỏ qua */ }
      try { this.dayAdd({ env, sym: h.sym, side: h.side, pos: { q: h.q, ap: h.e, t1 }, t0: t1, lv: [{ fq: h.q }], fund: h.fund || 0, strat: "man" }, h.pnl, h.fee || 0, h.x, h.why, t2); } catch (e) { /* bỏ qua */ }
      // 🔔 lệnh tay vừa đóng → thông báo như lệnh bot (chỉ lệnh đóng trong 1 giờ qua – lần đầu đọc lại 30 ngày không bắn thông báo cũ)
      if (now - t2 < 3600e3) { const tot0 = +this.S.wal?.[env]?.total || 0, mv = h.e > 0 ? h.side * (h.x / h.e - 1) * 100 : 0, hm = Math.max(0, (t2 - t1) / 60e3);
        this.note(`mclose:${key}`, 2, `${LTAG(env)} · ${h.pnl >= 0 ? "🟢" : "🔴"} ✋ ${coin(h.sym)} ${h.side > 0 ? "Long" : "Short"} ${h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)} USDT${tot0 > 0 ? ` (${h.pnl >= 0 ? "+" : ""}${(h.pnl / tot0 * 100).toFixed(2)}% tổng tài sản)` : ""}`,
          `Lệnh tay · ${{ MANUAL: "anh đóng trên MyBit", TIMER: "tới giờ hẹn đóng", FOLLOW: "theo lệnh sàn thử", EXCH: "đóng trên Binance (tay / cắt lỗ / chốt lời)", TP: "chốt lời", SL: "cắt lỗ" }[h.why] || h.why} · ${+h.e.toPrecision(6)} → ${+h.x.toPrecision(6)} (${mv >= 0 ? "+" : ""}${mv.toFixed(2)}%) · giá trị ${(h.N || 0).toFixed(2)} USDT · giữ ${hm < 120 ? Math.round(hm) + " phút" : (hm / 60).toFixed(1) + " giờ"} · phí ${(h.fee || 0).toFixed(3)}${h.fund ? ` · funding ${h.fund >= 0 ? "+" : ""}${h.fund.toFixed(3)}` : ""}`); } }
    this.mNew = null;
    const keep = Object.values(H.L).sort((a, b) => (a.t2 < b.t2 ? -1 : 1)).slice(-300); H.L = Object.fromEntries(keep.map((h) => [h.id, h])); H.last = now; this.save();
  }
  // 📋 CHÉP 1 lệnh sàn thử sang Binance (anh bấm trên trang): vào bằng lệnh thị trường, ký quỹ CÔ LẬP, đòn bẩy anh chọn; rồi đặt cắt lỗ / chốt lời trên sàn
  // và hẹn đóng đúng giờ của lệnh sàn thử (+ đóng ngay khi sàn thử đóng lệnh đó). Sau đó là 1 lệnh tay bình thường (thẻ ✋ trên trang).
  async mCopy(sym, sd, usd, lev, sl, tp, exp, pk) {
    const tag = `📋 Chép ${pk ? this.pkName(pk) : "lệnh sàn thử"} → ${coin(sym)} ${sd > 0 ? "Long" : "Short"}`;
    if (this.env() !== "live" && this.env() !== "demo") return;
    if (this.botSyms().has(sym)) { this.say(`${tag}: bot đang có lệnh trên mã này – không chép (Binance gộp chung vị thế)`, "info"); return; }
    const F = await this.filters(sym); if (!F) { this.say(`${tag}: mã không giao dịch futures được`, "info"); return; }
    const L = await this.req("GET", "/fapi/v2/positionRisk", { symbol: sym }).catch(() => this.req("GET", "/fapi/v3/positionRisk", { symbol: sym }));
    // đã có vị thế lệnh tay trên mã này: CÙNG chiều → vào thêm để bình quân giá (Binance gộp thành 1 vị thế, giá vào = giá bình quân);
    // NGƯỢC chiều ở chế độ 1 chiều → lệnh mới sẽ đóng bớt vị thế cũ chứ không mở lệnh mới → không chép
    const dual0 = await this.req("GET", "/fapi/v1/positionSide/dual").catch(() => ({})), hedge = !!dual0?.dualSidePosition;
    const P = (L || []).find((x) => x.symbol === sym && +x.positionAmt !== 0 && (!hedge || x.positionSide === (sd > 0 ? "LONG" : "SHORT")));
    if (P && !hedge && Math.sign(+P.positionAmt) !== sd) { this.say(`${tag}: anh đang có vị thế ${coin(sym)} NGƯỢC chiều (${P.positionAmt}) – lệnh mới sẽ đóng bớt vị thế đó chứ không mở lệnh mới, không chép`, "info"); return; }
    const avg = !!P, q0 = P ? Math.abs(+P.positionAmt) : 0, e0 = P ? +P.entryPrice : 0;
    const mk = +((L || []).find((x) => x.symbol === sym)?.markPrice) || this.mark(coin(sym) + ":F");
    if (!(mk > 0) || !(usd > 0)) { this.say(`${tag}: thiếu giá / số tiền`, "info"); return; }
    if (sl > 0 && (sd > 0 ? sl >= mk : sl <= mk)) { this.say(`${tag}: cắt lỗ ${sl} đã nằm sai phía giá hiện tại ${mk} – không chép`, "info"); return; }
    const q = fl(usd / mk, F.step); if (!(q >= F.minQ) || q * mk < F.minN) { this.say(`${tag}: ${usd} USDT nhỏ hơn mức tối thiểu của sàn (${F.minN} USDT)`, "info"); return; }
    if (avg) lev = +P.leverage || lev;      // bình quân: giữ kiểu ký quỹ & đòn bẩy của vị thế đang có (sàn không cho đổi kiểu ký quỹ khi đang có vị thế)
    else {
      await this.req("POST", "/fapi/v1/marginType", { symbol: sym, marginType: "ISOLATED" }).catch((e) => { if (e.code !== -4046) throw e; });
      await this.req("POST", "/fapi/v1/leverage", { symbol: sym, leverage: lev }); delete this.lev[sym];      // bot đặt lại đòn bẩy của nó khi cần
    }
    const p = { symbol: sym, side: sd > 0 ? "BUY" : "SELL", type: "MARKET", quantity: q.toFixed(F.sd), newOrderRespType: "RESULT" };
    if (hedge) p.positionSide = sd > 0 ? "LONG" : "SHORT";
    const o = await this.req("POST", "/fapi/v1/order", p), ap = +o.avgPrice || mk;
    if (avg) { const e1 = (q0 * e0 + q * ap) / (q0 + q); this.say(`${tag}: BÌNH QUÂN – vào thêm ${q.toFixed(F.sd)} @ ${ap} (${LTAG(this.env())}, ~${(q * ap).toFixed(2)} USDT) · vị thế ${+q0.toFixed(F.sd)} → ${+(q0 + q).toFixed(F.sd)}, giá vào ${+e0.toPrecision(6)} → ~${+e1.toPrecision(6)}`, "win"); }
    else this.say(`${tag}: đã vào ${q.toFixed(F.sd)} @ ${ap} (lệnh thị trường, ${LTAG(this.env())}, ký quỹ cô lập x${lev}, ~${(q * ap).toFixed(2)} USDT)`, "win");
    this.mAt = 0; await this.mSync(true);
    if (sl > 0) await this.mCond(sym, "sl", sl).catch((e) => this.err(`${tag}: đặt cắt lỗ`, e));
    if (tp > 0) await this.mCond(sym, "tp", tp).catch((e) => this.err(`${tag}: đặt chốt lời`, e));
    // hẹn đóng: vị thế đã có hẹn (từ lần chép trước / anh đặt) → giữ hẹn cũ cho cả vị thế, không đè
    if ((exp > Date.now() || pk) && !(avg && this.S.mlk?.[sym])) { this.mLink(sym, sd, exp, pk); this.save(); }
    else if (avg && this.S.mlk?.[sym]) this.say(`⏱ ${coin(sym)}: giữ hẹn đóng đang có cho cả vị thế sau khi bình quân`, "info");
    this.mAt = 0; await this.mSync(true);
  }
  async mClose(sym, frac = 1) {
    if (this.botSyms().has(sym)) { this.say(`✋ ${coin(sym)}: bot đang có lệnh trên mã này – vị thế gộp chung, đóng ở thẻ lệnh của bot`, "info"); return; }
    const L = await this.req("GET", "/fapi/v2/positionRisk", { symbol: sym }).catch(() => this.req("GET", "/fapi/v3/positionRisk", { symbol: sym }));
    const P = (L || []).find((x) => x.symbol === sym && +x.positionAmt !== 0), F = await this.filters(sym);
    if (!P || !F) { this.say(`✋ ${coin(sym)}: không còn vị thế để đóng`, "info"); this.mAt = 0; return; }
    const amt = +P.positionAmt, q0 = Math.abs(amt); let q = frac >= 0.999 ? q0 : fl(q0 * frac, F.step);
    if (q < F.minQ) q = q0;
    const p = { symbol: sym, side: amt > 0 ? "SELL" : "BUY", type: "MARKET", quantity: q.toFixed(F.sd), newOrderRespType: "RESULT" };
    if ((P.positionSide || "BOTH") !== "BOTH") p.positionSide = P.positionSide; else p.reduceOnly = "true";
    const o = await this.req("POST", "/fapi/v1/order", p), ax = +o.avgPrice || +P.markPrice, pnl = (ax - +P.entryPrice) * (amt > 0 ? 1 : -1) * q;
    (this.S.mxWhy ||= {})[sym] = { why: this.mWhyNext || "MANUAL", at: Date.now() }; this.mWhyNext = null; this.mhAt = 0;
    this.say(`✋ Anh đóng ${q >= q0 ? "" : `${Math.round(q / q0 * 100)}% `}lệnh tay ${coin(sym)} ${amt > 0 ? "Long" : "Short"} ${q.toFixed(F.sd)} @ ${ax} · ước ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT (chưa trừ phí)`, pnl >= 0 ? "win" : "loss");
    if (q >= q0) await this.mCancel(sym, () => true);      // đóng hết → huỷ cắt lỗ / chốt lời còn treo của mã này
    this.mAt = 0; await this.mSync(true);
  }
  async mCancel(sym, pick) {
    const O = await this.req("GET", "/fapi/v1/openOrders", { symbol: sym }).catch(() => []);
    for (const o of O || []) if (/STOP|TAKE_PROFIT/.test(o.type) && pick(o.type)) await this.req("DELETE", "/fapi/v1/order", { symbol: sym, orderId: o.orderId }).catch(() => {});
    const A = await this.req("GET", "/fapi/v1/openAlgoOrders", { symbol: sym }).catch(() => []);
    for (const o of (Array.isArray(A) ? A : A?.orders || A?.rows || [])) if (o.symbol === sym && pick(o.orderType || o.type || "")) await this.req("DELETE", "/fapi/v1/algoOrder", { algoId: o.algoId }).catch(() => {});
  }
  // đặt / sửa (px > 0) hoặc huỷ (px = 0) cắt lỗ / chốt lời cho cả vị thế lệnh tay – lệnh điều kiện đóng toàn bộ vị thế, kích hoạt theo giá mark
  async mCond(sym, kind, px) {
    if (this.botSyms().has(sym)) { this.say(`✋ ${coin(sym)}: bot đang có lệnh trên mã này – không đặt ${kind === "sl" ? "cắt lỗ" : "chốt lời"} riêng`, "info"); return; }
    const L = await this.req("GET", "/fapi/v2/positionRisk", { symbol: sym }).catch(() => this.req("GET", "/fapi/v3/positionRisk", { symbol: sym }));
    const P = (L || []).find((x) => x.symbol === sym && +x.positionAmt !== 0), F = await this.filters(sym);
    if (!P || !F) { this.say(`✋ ${coin(sym)}: không còn vị thế`, "info"); return; }
    const sd = +P.positionAmt > 0 ? 1 : -1, mk = +P.markPrice, T = kind === "sl" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET", nm = kind === "sl" ? "cắt lỗ" : "chốt lời";
    const re = kind === "sl" ? /^STOP/ : /^TAKE_PROFIT/;
    if (px > 0) {
      const bad = kind === "sl" ? (sd > 0 ? px >= mk : px <= mk) : (sd > 0 ? px <= mk : px >= mk);
      if (bad) { this.say(`✋ ${coin(sym)}: giá ${nm} ${px} nằm sai phía giá hiện tại ${mk} – không đặt`, "info"); return; }
    }
    await this.mCancel(sym, (t) => re.test(t));
    if (px > 0) {
      const pxs = (sd > 0 ? (kind === "sl" ? ce(px, F.tick) : fl(px, F.tick)) : (kind === "sl" ? fl(px, F.tick) : ce(px, F.tick))).toFixed(F.td);
      const p = { symbol: sym, side: sd > 0 ? "SELL" : "BUY", type: T, stopPrice: pxs, closePosition: "true", workingType: "MARK_PRICE" };
      if ((P.positionSide || "BOTH") !== "BOTH") p.positionSide = P.positionSide;
      try { await this.req("POST", "/fapi/v1/order", p); }
      catch (e) { const a = { algoType: "CONDITIONAL", symbol: sym, side: p.side, type: T, triggerPrice: pxs, closePosition: "true", workingType: "MARK_PRICE" }; if (p.positionSide) a.positionSide = p.positionSide; await this.req("POST", "/fapi/v1/algoOrder", a); }
      this.say(`✋ ${nm[0].toUpperCase() + nm.slice(1)} lệnh tay ${coin(sym)} ${sd > 0 ? "Long" : "Short"} tại ${pxs} (đặt trên sàn, đóng cả vị thế)`, "info");
    } else this.say(`✋ Huỷ ${nm} lệnh tay ${coin(sym)}`, "info");
    this.mAt = 0; await this.mSync(true);
  }
  // rủi ro đang mở của tài khoản đang dùng: giá trị lệnh, ký quỹ, mức mất tối đa (cắt lỗ đặt trên sàn / thanh lý ký quỹ cô lập)
  riskNow() {
    const c = this.cfg(), lev = Math.max(1, +c.lv_lev || 1), env = this.env(); let N = 0, M = 0, W = 0;
    for (const e of this.active()) {
      if ((e.env || env) !== env) continue;
      const n = e.lv.reduce((a, l) => a + (l.st === "cxl" ? 0 : l.px * l.q), 0); N += n; M += n / lev;
      W += Math.min(n / lev, n * (+e.stopPct > 0 ? (+e.stopPct + 0.5) / 100 : 1));      // +0,5% trượt giá khi chạm cắt lỗ
    }
    for (const p of this.swOpen()) { N += p.N; M += p.N; W += p.N; }      // x1 không cắt lỗ: mất tối đa = cả phần lệnh
    for (const p of this.qOpen()) { N += p.N; M += p.N / p.lev; W += Math.min(p.N / p.lev, p.N * p.worst); }
    return { B: this.st.bal > 0 ? this.st.bal : this.base(), N, M, W };
  }
  riskOk(n, lev, worstPct) {
    const r = this.riskNow(), m = n / Math.max(1, lev), w = Math.min(m, n * worstPct), f = (x) => x.toFixed(2);
    if (!(r.B > 0)) return "chưa biết số dư tài khoản";
    if (r.M + m > r.B * RISK.margin) return `ký quỹ ${f(r.M)} + ${f(m)} USDT sẽ vượt ${RISK.margin * 100}% số dư ${f(r.B)} USDT`;
    if (r.N + n > r.B * RISK.notional) return `tổng giá trị lệnh ${f(r.N)} + ${f(n)} USDT sẽ vượt ${RISK.notional}× số dư`;
    if (r.W + w > r.B * RISK.worst) return `nếu mọi lệnh cùng chạm cắt lỗ / bị thanh lý sẽ mất ${f(r.W + w)} USDT – quá ${RISK.worst * 100}% số dư ${f(r.B)} USDT`;
    return null;
  }
  swOpen() { return Object.values(this.S.swp || {}).filter((p) => !p.done && p.env === this.env()); }
  async swPlace(s) {
    const c = this.cfg(), env = this.env(), base = coin(s.sym), skip = (w) => { this.say(`🧪 Short bơm ${base} (${s.why}): bỏ qua – ${w}`, "skip"); };
    if (!c.sw_lv_pump) return;
    if (!this.enabled()) return skip("tài khoản Binance của bot đang tắt");
    if (!this.st.ok) return skip(`tài khoản chưa sẵn sàng – ${this.st.why}`);
    if (this.S.halt) return skip(`đang ngừng mở mới – ${this.S.halt}`);
    const O = this.swOpen(), max = Math.max(1, Math.min(5, +c.sw_lv_max || 2));
    if (O.length >= max) return skip(`đã có ${O.length}/${max} lệnh Short bơm đang mở`);
    if (O.some((p) => p.sym === s.sym) || this.active().some((e) => e.sym === s.sym)) return skip("đang có lệnh của bot trên coin này");
    const F = await this.filters(s.sym); if (!F) return skip(`${s.sym} không giao dịch được trên ${env === "live" ? "Binance" : "Binance Demo"}`);
    const pr = await this.pos(s.sym); if (Math.abs(pr.amt) > 0) return skip(`anh đang có vị thế ${s.sym} – bot không đụng vào`);
    const B = this.base(), minN = F.minN * 1.1; let N = Math.max(B * Math.max(1, Math.min(25, +c.sw_lv_sz || 5)) / 100, minN);
    if (N > B * 0.25) return skip(`lệnh nhỏ nhất của sàn ${minN.toFixed(2)} USDT lớn hơn 25% vốn ${B.toFixed(2)} USDT`);
    const usedSw = O.reduce((a, p) => a + p.N, 0); if (usedSw + N > B * 0.6) return skip(`tổng Short bơm đang mở ${usedSw.toFixed(2)} USDT – thêm lệnh này vượt 60% vốn`);
    if (this.st.avail != null && N > this.st.avail * 0.9) return skip(`số dư khả dụng ${this.st.avail} USDT không đủ cho ${N.toFixed(2)} USDT ký quỹ x1`);
    { const why = this.riskOk(N, 1, 1); if (why) return skip(`🛡️ giới hạn an toàn chung: ${why}`); }
    await this.req("POST", "/fapi/v1/marginType", { symbol: s.sym, marginType: "ISOLATED" }).catch((e) => { if (e.code !== -4046) throw e; });
    await this.req("POST", "/fapi/v1/leverage", { symbol: s.sym, leverage: 1 }); delete this.lev[s.sym];      // Bắt râu sập sau này trên coin này tự đặt lại đòn bẩy của nó
    const px0 = s.px > 0 ? s.px : (await this.req("GET", "/fapi/v1/premiumIndex", { symbol: s.sym }, false)).markPrice;
    const q = Math.max(fl(N / px0, F.step), ce(F.minN * 1.02 / px0, F.step));
    const o = await this.req("POST", "/fapi/v1/order", { symbol: s.sym, side: "SELL", type: "MARKET", quantity: q.toFixed(F.sd), newOrderRespType: "RESULT" });
    const ap = +o.avgPrice > 0 ? +o.avgPrice : +px0, fq = +o.executedQty > 0 ? +o.executedQty : q, now = Date.now(), id = `sw${this.S.seq++}`;
    (this.S.swp ||= {})[id] = { id, sym: s.sym, env, side: -1, q: fq, ap, N: +(fq * ap).toFixed(4), t0: now, exp: now + (s.hold || 168) * 3600e3, why: s.why, chg: s.chg, done: false, fees: fq * ap * c.fee_t / 100, chk: 0 };
    this.S.errs = 0; this.save();
    this.say(`🧪 Short bơm ${base} (${s.why}) → BÁN ${fq} @ ${+ap.toPrecision(8)} (${(fq * ap).toFixed(2)} USDT, ký quỹ cô lập x1, không cắt lỗ) – tự đóng ${iso(now + (s.hold || 168) * 3600e3).replace("T", " ")} UTC`, "win");
    this.note(`swo:${id}`, 2, `${LTAG(env)} · 🧪 Short ${base} (coin vừa bơm)`, `${s.why} · bán ${fq} @ ${+ap.toPrecision(8)} = ${(fq * ap).toFixed(2)} USDT, x1 cô lập, giữ 7 ngày, không cắt lỗ (giá ×2 sàn thanh lý – mất tối đa ${(fq * ap).toFixed(2)} USDT).`, `lv:${id}`);
  }
  async swManage() {
    const now = Date.now();
    for (const p of this.swOpen()) {
      try {
        if (!p.keep && now >= p.exp) { await this.swClose(p, "TIME"); continue; }
        { const m = this.core.sw?.px?.[p.sym]?.m; if (m > 0 && p.ap > 0) this.askNear(p, "swp", p.id, p.sym, p.exp, p.exp - p.t0, -p.q * (m - p.ap), -(m / p.ap - 1) * 100); }
        if (now - (p.chk || 0) < 5 * 60e3) continue;
        p.chk = now; const pr = await this.pos(p.sym);
        if (!pr.amt) await this.swClose(p, "GONE");      // sàn đã thanh lý (giá ×2) hoặc anh tự đóng trên Binance
      } catch (e) { this.err(`Short bơm ${p.sym}`, e); }
    }
  }
  // ---------------------------------------------------------------- 📐 6 PHƯƠNG PHÁP ĐỊNH LƯỢNG bằng tiền thật / Demo (công tắc riêng: lq_<k>)
  // Đi theo đúng lệnh SÀN THỬ của worker/quant.js: sàn thử mở → mở lệnh thị trường ở đây (nếu phương pháp đó đang bật), sàn thử đóng → đóng ở đây.
  // Ký quỹ CÔ LẬP x lv_lev. Cắt lỗ trên sàn (STOP_MARKET đóng toàn bộ): lệnh có cắt lỗ → đặt xa hơn mức của phương pháp 0,3% (bot đóng trước, sàn là dự phòng);
  // lệnh không cắt lỗ (cặp coin, RSI2, funding) → cắt lỗ thảm hoạ −20% phòng máy chủ mất kết nối. Cỡ: lq_sz % vốn (mỗi chân ≥ lệnh nhỏ nhất của sàn), ≤ 25% vốn/lệnh,
  // tối đa lq_max lệnh mỗi phương pháp, và luôn trong 🛡️ giới hạn an toàn chung.
  onQuant(x) { (this.qq ||= []).push(x); }
  qOpen() { return Object.values(this.S.qp || {}).filter((p) => !p.done && p.env === this.env()); }
  async qPlace(x) {
    const c = this.cfg(), env = this.env(), nm = `${x.k === "sec" ? "⚡" : "📐"} ${x.name || x.k}`, base = x.legs.map((L) => coin(L.sym)).join("/"), skip = (w) => this.say(`${nm} ${base}: bỏ qua lệnh thật – ${w}`, "skip");
    if (!c["lq_" + x.k]) return;
    if (!this.enabled()) return skip("tài khoản Binance của bot đang tắt");
    if (!this.st.ok) return skip(`tài khoản chưa sẵn sàng – ${this.st.why}`);
    if (this.S.halt) return skip(`đang ngừng mở mới – ${this.S.halt}`);
    const O = this.qOpen(), max = Math.max(1, Math.min(5, +c.lq_max || 2));
    if (O.filter((p) => p.k === x.k).length >= max) return skip(`đã có ${max} lệnh thật của phương pháp này`);
    const busy = new Set([...this.active().map((e) => e.sym), ...this.swOpen().map((p) => p.sym), ...O.flatMap((p) => p.legs.map((L) => L.sym))]);
    if (x.legs.some((L) => busy.has(L.sym))) return skip("đang có lệnh khác của bot trên coin này");
    const FS = []; for (const L of x.legs) { const F = await this.filters(L.sym); if (!F) return skip(`${L.sym} không giao dịch được trên ${env === "live" ? "Binance" : "Binance Demo"}`); FS.push(F); }
    for (const L of x.legs) { const pr = await this.pos(L.sym); if (Math.abs(pr.amt) > 0) return skip(`anh đang có vị thế ${L.sym} – bot không đụng vào`); }
    const B = this.base(), lev = Math.max(1, Math.min(5, +c.lv_lev || 2));
    let N = B * Math.max(1, Math.min(25, +c.lq_sz || 5)) / 100;
    x.legs.forEach((L, i) => { N = Math.max(N, FS[i].minN * 1.1 / L.w); });      // mỗi chân ≥ lệnh nhỏ nhất của sàn
    if (N > B * 0.25) return skip(`lệnh nhỏ nhất có thể ${N.toFixed(2)} USDT lớn hơn 25% vốn ${B.toFixed(2)} USDT`);
    const one = x.legs.length === 1, px0 = x.legs[0].px, worst = one && x.sl ? Math.abs(x.sl / px0 - 1) + 0.008 : 0.2;
    if (this.st.avail != null && N / lev > this.st.avail * 0.9) return skip(`số dư khả dụng ${this.st.avail} USDT không đủ`);
    { const why = this.riskOk(N, lev, worst); if (why) return skip(`🛡️ giới hạn an toàn chung: ${why}`); }
    const id = `q${this.S.seq++}`, now = Date.now(), legs = [];
    for (let i = 0; i < x.legs.length; i++) {
      const L = x.legs[i], F = FS[i];
      try {
        await this.req("POST", "/fapi/v1/marginType", { symbol: L.sym, marginType: "ISOLATED" }).catch((e) => { if (e.code !== -4046) throw e; });
        await this.req("POST", "/fapi/v1/leverage", { symbol: L.sym, leverage: lev }); this.lev[L.sym] = lev;
        const ref = this.core.q?.mid?.(L.sym) || L.px, q = Math.max(fl(N * L.w / ref, F.step), ce(F.minN * 1.02 / ref, F.step));
        const o = await this.req("POST", "/fapi/v1/order", { symbol: L.sym, side: L.side > 0 ? "BUY" : "SELL", type: "MARKET", quantity: q.toFixed(F.sd), newOrderRespType: "RESULT" });
        legs.push({ sym: L.sym, side: L.side, q: +o.executedQty > 0 ? +o.executedQty : q, ap: +o.avgPrice > 0 ? +o.avgPrice : ref, stop: null });
      } catch (e) {
        this.err(`${nm} mở ${L.sym}`, e);
        for (const D of legs) { try { const F2 = await this.filters(D.sym); await this.req("POST", "/fapi/v1/order", { symbol: D.sym, side: D.side > 0 ? "SELL" : "BUY", type: "MARKET", quantity: D.q.toFixed(F2.sd), reduceOnly: "true" }); } catch (e2) { this.err(`${nm} huỷ chân đã mở ${D.sym}`, e2); } }
        return;
      }
    }
    const p = { id, pid: x.id, k: x.k, name: x.name || x.k, env, legs, N: +legs.reduce((a, L) => a + L.q * L.ap, 0).toFixed(4), lev, worst, sl: x.sl ?? null, t0: now, exp: (x.exp || now + 72 * 3600e3) + 3600e3, why: x.why, done: false, fees: legs.reduce((a, L) => a + L.q * L.ap * c.fee_t / 100, 0), chk: 0 };
    (this.S.qp ||= {})[id] = p; this.S.errs = 0; this.save();
    for (const L of legs) {      // cắt lỗ trên sàn: mức của phương pháp (+0,3% đệm) hoặc thảm hoạ −20%
      const F = await this.filters(L.sym), raw = one && x.sl ? x.sl * (1 - L.side * 0.003) : L.ap * (1 - L.side * 0.2), pxs = (L.side > 0 ? ce(raw, F.tick) : fl(raw, F.tick)).toFixed(F.td);
      const q = { symbol: L.sym, side: L.side > 0 ? "SELL" : "BUY", type: "STOP_MARKET", stopPrice: pxs, closePosition: "true", workingType: "MARK_PRICE", newClientOrderId: `mq${id}${L.sym.slice(0, 4)}${Date.now() % 1e5}` };
      try { const o = await this.req("POST", "/fapi/v1/order", q); L.stop = { id: o.orderId, px: +pxs, kind: "order" }; }
      catch (e) { try { const o = await this.req("POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: q.symbol, side: q.side, type: "STOP_MARKET", triggerPrice: pxs, closePosition: "true", workingType: "MARK_PRICE" }); L.stop = { id: o.algoId, px: +pxs, kind: "algo" }; } catch (e2) { L.stop = { id: null, px: +pxs, kind: "soft" }; this.err(`${nm} cắt lỗ trên sàn ${L.sym}`, e2); } }
    }
    this.save();
    const txt = legs.map((L) => `${L.side > 0 ? "MUA" : "BÁN"} ${L.q} ${coin(L.sym)} @ ${+L.ap.toPrecision(8)}`).join(" + ");
    this.say(`${nm} (${x.why}) → ${txt} · ${p.N.toFixed(2)} USDT, ký quỹ cô lập x${lev}`, "win");
    this.note(`qo:${id}`, 2, `${LTAG(env)} · 📐 ${p.name}: ${base}`, `${x.why} · ${txt} = ${p.N.toFixed(2)} USDT, x${lev} cô lập`, `lv:${id}`);
  }
  async qExit(pid, why) { const p = this.qOpen().find((q) => q.pid === pid); if (p) await this.qClose(p, why); }
  async qManage() {
    const now = Date.now();
    for (const p of this.qOpen()) {
      try {
        if (!p.keep && now >= p.exp) { await this.qClose(p, "TIME"); continue; }
        { let u = 0, ok = true; for (const L of p.legs) { const m = this.core.q?.mid?.(L.sym); if (!(m > 0)) { ok = false; break; } u += L.side * L.q * (m - L.ap); } if (ok && p.N > 0) this.askNear(p, "lq", p.id, p.legs[0]?.sym, p.exp, p.exp - p.t0, u, u / p.N * 100); }
        if (now - (p.chk || 0) < 5 * 60e3) continue; p.chk = now;
        let gone = 0; for (const L of p.legs) { const pr = await this.pos(L.sym); if (!pr.amt) gone++; }
        if (gone) await this.qClose(p, gone === p.legs.length ? "GONE" : "LEG");      // sàn đã cắt lỗ / anh tự đóng trên Binance → đóng nốt phần còn lại
      } catch (e) { this.err(`📐 ${p.k} ${p.id}`, e); }
    }
  }
  async qClose(p, why) {
    const c = this.cfg(); let gp = 0, fee = p.fees, fund = 0, src = true;
    for (const L of p.legs) {
      if (L.stop?.id) { if (L.stop.kind === "algo") await this.req("DELETE", "/fapi/v1/algoOrder", { algoId: L.stop.id }).catch(() => {}); else await this.req("DELETE", "/fapi/v1/order", { symbol: L.sym, orderId: L.stop.id }).catch(() => {}); }
      const pr = await this.pos(L.sym), q = Math.abs(pr.amt); let px = null;
      if (q > 0 && Math.sign(pr.amt) === L.side) { const F = await this.filters(L.sym), o = await this.req("POST", "/fapi/v1/order", { symbol: L.sym, side: L.side > 0 ? "SELL" : "BUY", type: "MARKET", quantity: q.toFixed(F.sd), reduceOnly: "true", newOrderRespType: "RESULT" }); if (+o.avgPrice > 0) px = +o.avgPrice; }
      if (!px) px = this.core.q?.mid?.(L.sym) || L.stop?.px || L.ap;
      L.x = px;
      const I = await this.income({ sym: L.sym, t0: p.t0 });
      let g = L.side * L.q * (px - L.ap), f = L.q * px * c.fee_t / 100;
      if (I) { fund += I.fund; if (I.rp) g = I.rp; if (I.com && !I.other) { f = -I.com; fee -= L.q * L.ap * c.fee_t / 100; } } else src = false;
      gp += g; fee += f;
    }
    const pnl = gp - fee + fund, pct = pnl / p.N * 100;
    Object.assign(p, { done: true, pnl: +pnl.toFixed(4), fund: +fund.toFixed(4), why, t2: Date.now() });
    this.S.day.pnl += pnl; this.S.tot.n++; this.S.tot.pnl += pnl; this.S.tot.fees += fee; if (pnl > 0) this.S.tot.win++;
    { const T = ((this.S.totE ||= {})[p.env] ||= { n: 0, pnl: 0, win: 0, fees: 0 }); T.n++; T.pnl += pnl; T.fees += fee; if (pnl > 0) T.win++;
      const d = vnDay(Date.now()), DE = ((this.S.dayE ||= {})[p.env] ||= { d, pnl: 0 }); if (DE.d !== d) { DE.d = d; DE.pnl = 0; } DE.pnl += pnl; }
    const L0 = p.legs[0], sym = p.legs.map((L) => L.sym).join("/");
    this.dayAdd({ env: p.env, sym, side: L0.side, pos: { q: L0.q, ap: L0.ap, t1: p.t0 }, t0: p.t0, lv: [{ fq: L0.q }], fund, strat: "q_" + p.k }, pnl, fee, L0.x, why);
    const tot0 = +this.S.wal?.[p.env]?.total || 0;
    this.S.hist = [...this.S.hist.slice(-199), { id: p.id, strat: "q_" + p.k, sym: L0.sym, side: L0.side, q: L0.q, e: L0.ap, x: L0.x, pnl: p.pnl, fee: +fee.toFixed(4), fund: p.fund || undefined, k: p.legs.map((L) => coin(L.sym)).join("/") + ":F", ts: iso(p.t0), nl: p.legs.length, net: +(pnl / p.N * 1e4).toFixed(1), why, t1: iso(p.t0), t2: iso(p.t2), env: p.env, tot: tot0 > 0 ? tot0 : undefined, note: p.why, legs: p.legs.map((L) => ({ sym: L.sym, side: L.side, q: L.q, e: L.ap, x: L.x })) }];
    this.led(this.S.hist[this.S.hist.length - 1]);
    const wl = { TIME: "hết giờ giữ", SL: "chạm cắt lỗ", TP: "chạm chốt lời", X: "tín hiệu thoát", MANUAL: "anh đóng tay", OFF: "anh tắt phương pháp", GONE: "vị thế đã đóng trên Binance", LEG: "1 chân đã đóng trên Binance", EOD: "hết ngày", EOM: "hết tháng" }[why] || why;
    this.say(`${pnl >= 0 ? "💰" : "🔻"} 📐 Đóng ${p.name} ${sym.replace(/USDT/g, "")} – ${wl}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%${src ? "" : ", ước tính"})`, pnl >= 0 ? "win" : "loss");
    this.note(`qc:${p.id}`, 2, `${LTAG(p.env)} · ${pnl >= 0 ? "🟢" : "🔴"} 📐 ${p.legs.map((L) => coin(L.sym)).join("/")} ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT${tot0 > 0 ? ` (${pnl >= 0 ? "+" : ""}${(pnl / tot0 * 100).toFixed(2)}% tổng tài sản)` : ""}`, `${p.name} · ${wl} · ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% phần lệnh`, `lv:${p.id}`);
    for (const [k, v] of Object.entries(this.S.qp)) if (v.done && Date.now() - v.t2 > 30 * 864e5) delete this.S.qp[k];
    if (this.S.day.pnl <= -this.base() * c.lv_daily / 100 && !this.S.halt) { this.S.halt = `lỗ ${this.S.day.pnl.toFixed(2)} USDT hôm nay – ngừng mở mới tới hết ngày`; this.say(`⛔ ${this.S.halt}`, "stop"); }
    this.save();
  }
  // funding & phí ĐÃ TRẢ THẬT của lệnh đang mở (sổ thu chi Binance, 10 phút/lần) → trang ước tính lời/lỗ ròng nếu đóng tay ngay
  async accrue() {
    const now = Date.now(), L = [...this.swOpen().map((p) => [p, p.t0]), ...this.active().filter((e) => e.pos?.q > 0).map((e) => [e, e.t0])];
    for (const [x, t0] of L) {
      if (now - (x.ichk || 0) < 10 * 60e3) continue; x.ichk = now;
      try { const I = await this.income({ sym: x.sym, t0 }); if (I) { x.fundA = +I.fund.toFixed(4); if (I.com && !I.other) x.feeA = +(-I.com).toFixed(4); } } catch (e) { /* lần sau thử lại */ }
    }
  }
  led(h) { try { this.core?.io?.onTrade?.({ env: h.env, strat: h.strat || "hook", k: h.k || coin(h.sym) + ":F", side: h.side, q: h.q, e: h.e, x: h.x, t1: h.t1 || h.ts, t2: h.t2, fee: h.fee, fund: h.fund || 0, pnl: h.pnl, why: h.why, lv: h.nl, R: h.R, tot: h.tot, note: h.note, dx: h.dx }); } catch (e) { /* sổ lệnh lỗi không ảnh hưởng giao dịch */ } }
  async swClose(p, why) {
    const c = this.cfg(), pr = await this.pos(p.sym), q = Math.abs(pr.amt);
    let px = null;
    if (q > 0) { const F = await this.filters(p.sym), o = await this.req("POST", "/fapi/v1/order", { symbol: p.sym, side: "BUY", type: "MARKET", quantity: q.toFixed(F.sd), reduceOnly: "true", newOrderRespType: "RESULT" }); if (+o.avgPrice > 0) px = +o.avgPrice; }
    if (!px) { try { px = +(await this.req("GET", "/fapi/v1/premiumIndex", { symbol: p.sym }, false)).markPrice; } catch (e) { px = p.ap; } }
    const I = await this.income({ sym: p.sym, t0: p.t0 });
    let gp = -p.q * (px - p.ap), fee = p.fees + p.q * px * c.fee_t / 100, fund = 0, liq = false;
    if (I) { fund = I.fund; if (I.rp) gp = I.rp; if (I.com && !I.other) fee = -I.com; }
    if (why === "GONE" && gp <= -0.8 * p.N) { liq = true; why = "LIQ"; }
    const pnl = gp - fee + fund, pct = pnl / p.N * 100, bps = p.ap ? -(px / p.ap - 1) * 1e4 : 0;
    Object.assign(p, { done: true, x: px, pnl: +pnl.toFixed(4), fund: +fund.toFixed(4), why, t2: Date.now() });
    this.S.day.pnl += pnl; this.S.tot.n++; this.S.tot.pnl += pnl; this.S.tot.fees += fee; if (pnl > 0) this.S.tot.win++;
    { const T = ((this.S.totE ||= {})[p.env] ||= { n: 0, pnl: 0, win: 0, fees: 0 }); T.n++; T.pnl += pnl; T.fees += fee; if (pnl > 0) T.win++;
      const d = vnDay(Date.now()), DE = ((this.S.dayE ||= {})[p.env] ||= { d, pnl: 0 }); if (DE.d !== d) { DE.d = d; DE.pnl = 0; } DE.pnl += pnl; }
    this.dayAdd({ env: p.env, sym: p.sym, side: -1, pos: { q: p.q, ap: p.ap, t1: p.t0 }, t0: p.t0, lv: [{ fq: p.q }], fund, strat: "pump" }, pnl, fee, px, why);
    const tot0 = +this.S.wal?.[p.env]?.total || 0;
    this.S.hist = [...this.S.hist.slice(-199), { id: p.id, strat: "pump", sym: p.sym, side: -1, q: p.q, e: p.ap, x: px, pnl: p.pnl, fee: +fee.toFixed(4), fund: p.fund || undefined, k: coin(p.sym) + ":F", ts: iso(p.t0), nl: 1, net: +bps.toFixed(1), why, t1: iso(p.t0), t2: iso(p.t2), env: p.env, tot: tot0 > 0 ? tot0 : undefined, note: p.why }];
    this.led(this.S.hist[this.S.hist.length - 1]);      // 📒 sổ giao dịch đầy đủ (máy chủ giữ mãi, trang "Sổ lệnh" đọc)
    const wl = { TIME: "hết 7 ngày giữ", MANUAL: "anh đóng tay", LIQ: "giá ×2 – sàn thanh lý (mất phần tiền của lệnh)", GONE: "vị thế đã đóng trên Binance" }[why] || why;
    this.say(`${pnl >= 0 ? "💰" : "🔻"} 🧪 Đóng Short bơm ${coin(p.sym)} – ${wl}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% phần lệnh, funding ${fund >= 0 ? "+" : ""}${fund.toFixed(3)})`, pnl >= 0 ? "win" : "loss");
    this.note(`swc:${p.id}`, 2, `${LTAG(p.env)} · ${pnl >= 0 ? "🟢" : "🔴"} 🧪 ${coin(p.sym)} ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT${tot0 > 0 ? ` (${pnl >= 0 ? "+" : ""}${(pnl / tot0 * 100).toFixed(2)}% tổng tài sản)` : ""}`, `Short coin vừa bơm · ${wl} · ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% phần lệnh`, `lv:${p.id}`);
    for (const [k, v] of Object.entries(this.S.swp)) if (v.done && Date.now() - v.t2 > 30 * 864e5) delete this.S.swp[k];
    if (this.S.day.pnl <= -this.base() * c.lv_daily / 100 && !this.S.halt) { this.S.halt = `lỗ ${this.S.day.pnl.toFixed(2)} USDT hôm nay – ngừng mở mới tới hết ngày`; this.say(`⛔ ${this.S.halt}`, "stop"); }
    this.save();
  }
  // Lời/lỗ THẬT từ sổ thu chi của sàn (income): lời lỗ giá đã chốt, phí giao dịch, phí FUNDING trong lúc giữ lệnh. Không đọc được → dùng ước tính.
  // nạp / rút vào ví futures (chuyển từ Spot/Funding sang, hoặc ngược lại) – để biểu đồ & % lời/lỗ KHÔNG tính tiền nạp là tiền lời
  async flows(env) {
    const F = ((this.S.flow ||= {})[env] ||= { at: 0, last: 0, L: [] });
    if (Date.now() - F.at < 280e3) return;
    F.at = Date.now();
    try {
      const L = await this.req("GET", "/fapi/v1/income", { incomeType: "TRANSFER", startTime: String(F.last ? F.last + 1 : Date.now() - 89 * 864e5), limit: "1000" }, true, BASE[env], env);
      for (const x of L || []) {
        const v = +x.income, t = +x.time; if (!Number.isFinite(v) || !t || !/^(USDT|USDC|FDUSD|BUSD)$/.test(x.asset)) continue;
        F.L.push([Math.floor(t / 60000), +v.toFixed(4)]); if (t > F.last) F.last = t;
      }
      if (F.L.length > 1000) F.L.splice(0, F.L.length - 1000);
    } catch (e) { /* lần sau thử lại */ }
  }
  async income(ev) {
    try {
      await new Promise((r) => setTimeout(r, 1500));      // sàn ghi sổ chậm vài trăm ms sau lệnh đóng
      const L = await this.req("GET", "/fapi/v1/income", { symbol: ev.sym, startTime: String((ev.t0 || Date.now()) - 5000), endTime: String(Date.now() + 5000), limit: "1000" });
      const o = { rp: 0, com: 0, fund: 0, n: 0, other: false };
      for (const x of L || []) {
        const v = +x.income; if (!Number.isFinite(v)) continue;
        if (x.incomeType === "FUNDING_FEE" && x.asset === "USDT") { o.fund += v; o.n++; }
        else if (x.incomeType === "REALIZED_PNL" && x.asset === "USDT") { o.rp += v; o.n++; }
        else if (x.incomeType === "COMMISSION") { if (x.asset === "USDT") { o.com += v; o.n++; } else o.other = true; }      // phí trả bằng BNB → giữ ước tính phí
      }
      return o.n ? o : null;
    } catch (e) { return null; }
  }
  async finish(ev, why, px, extra = "") {
    const c = this.cfg(), P = ev.pos;
    if (ev.stop?.id) await this.cancelStop(ev);
    let fee = ev.fees + P.q * px * c.fee_t / 100, gp = ev.side * P.q * (px - P.ap) + (ev.prp || 0), fund = 0, src = "ước tính";
    if (ev.pqty > 0) { const Q = P.q + ev.pqty; px = (px * P.q + ev.ppx * ev.pqty) / Math.max(1e-12, Q); P.q = Q; ev.pqty = 0; ev.prp = 0; }      // đã đóng 1 phần trước (cắt lỗ đuổi phần lệnh chờ) → ghi sổ theo cả vị thế, giá ra bình quân
    const I = P.q > 0 ? await this.income(ev) : null;
    if (I) { fund = I.fund; if (I.rp) gp = I.rp; if (I.com && !I.other) fee = -I.com; src = "theo sổ thu chi Binance"; }
    const pnl = gp - fee + fund;
    ev.done = true; ev.exit = px; ev.pnl = +pnl.toFixed(4); ev.fund = +fund.toFixed(4); ev.why = why; ev.t2 = Date.now();
    this.S.day.pnl += pnl; this.S.tot.n++; this.S.tot.pnl += pnl; this.S.tot.fees += fee; if (pnl > 0) this.S.tot.win++;
    { const T = ((this.S.totE ||= {})[ev.env] ||= { n: 0, pnl: 0, win: 0, fees: 0 }); T.n++; T.pnl += pnl; T.fees += fee; if (pnl > 0) T.win++;
      const d = vnDay(Date.now()), DE = ((this.S.dayE ||= {})[ev.env] ||= { d, pnl: 0 }); if (DE.d !== d) { DE.d = d; DE.pnl = 0; } DE.pnl += pnl; }
    this.dayAdd(ev, pnl, fee, px, why);
    const tot0 = +this.S.wal?.[ev.env]?.total || 0;      // tổng tài sản Binance (mọi ví) lúc đóng – để tính lời/lỗ lệnh này bằng bao nhiêu % tổng tài sản
    this.S.hist = [...this.S.hist.slice(-199), { id: ev.id, sym: ev.sym, side: ev.side, q: P.q, e: P.ap, x: px, pnl: ev.pnl, fee: +fee.toFixed(4), fund: ev.fund || undefined, k: ev.k, R: ev.R, c0: ev.c0 || undefined, ts: iso(ev.t0), lvp: ev.lv.map((l) => l.px), nl: ev.lv.filter((l) => l.fq > 0).length, net: P.ap && P.q ? +(ev.pnl / (P.q * P.ap) * 1e4).toFixed(1) : null, why, t1: iso(P.t1 || ev.t0), t2: iso(ev.t2), env: ev.env, tot: tot0 > 0 ? tot0 : undefined,
      // ✋ can thiệp tay (biểu đồ "Bot tự động vs có can thiệp"): close = anh đóng · ext = gia hạn · keep = giữ / chờ hoà vốn / đỉnh nảy · enter = vào ngay; h0 = giờ giữ GỐC (phút)
      iv: [why === "MANUAL" && "close", ev.x0 != null && "ext", ev.xm && "keep", ev.ivE && "enter"].filter(Boolean).join(",") || undefined, h0: ev.x0 != null && P.t1 ? +((ev.x0 - P.t1) / 60e3).toFixed(1) : ev.hold,
      // 🔬 nhật ký thoát (vòng 19): pk/mn = đỉnh lời / đáy lỗ theo giá giữa (bps) · tr = lời lúc quyết định đóng · m = giá giữa lúc đó · sl = giá khớp đóng so với giá giữa (bps, âm = xấu hơn)
      //   hs = giây giữ (từ lúc bot thấy khớp) · lag = giây từ lúc sàn khớp tới lúc bot thấy · dl = giây từ quyết định tới khi đóng xong
      dx: P.ap > 0 ? { pk: isFinite(ev.dpk) ? Math.round(ev.dpk) : null, mn: isFinite(ev.dmn) ? Math.round(ev.dmn) : null, tr: ev.dxp != null ? Math.round(ev.dxp) : null, m: ev.dxm || null,
        sl: ev.dxm ? +(ev.side * (px / ev.dxm - 1) * 1e4).toFixed(1) : null, hs: P.t1 ? Math.round((ev.t2 - P.t1) / 1000) : null, lag: ev.ft && P.t1 ? +((P.t1 - ev.ft) / 1000).toFixed(1) : null, dl: ev.dxt ? +((ev.t2 - ev.dxt) / 1000).toFixed(1) : null,
        rl: c.hk_trm ? "1m" : "tick", ox: ev.sxp ?? null, os: ev.sxs ?? null, g: ev.grp ? 1 : 0 } : undefined }];
    this.led(this.S.hist[this.S.hist.length - 1]);      // 📒 sổ giao dịch đầy đủ (máy chủ giữ mãi, trang "Sổ lệnh" đọc)
    { const lag = this.S.hist[this.S.hist.length - 1].dx?.lag; if (lag > 6) { this.say(`⚠️ ${ev.sym}: bot thấy lệnh khớp chậm ${lag} giây (ngưỡng 6 giây) – cắt lỗ đuổi & giờ giữ tính trễ theo`, "warn"); this.note(`lag:${ev.id}`, 1, `${LTAG(ev.env)} · ⚠️ Bot thấy khớp chậm ${lag}s`, `${coin(ev.sym)}: sàn khớp lúc ${iso(ev.ft).slice(11, 19)} UTC, bot thấy sau ${lag} giây. Thường do mạng máy chủ chậm hoặc Binance trả chậm – xem nhật ký nếu lặp lại.`, `lv:${ev.id}`); } }
    const bps = P.ap ? ev.side * (px / P.ap - 1) * 1e4 : 0;
    this.say(`${pnl >= 0 ? "💰" : "🔻"} Đóng ${ev.sym} ${ev.side > 0 ? "Long" : "Short"} – ${{ TIME: "hết giờ giữ", SL: "cắt lỗ", TRAIL: "cắt lỗ đuổi (đã lời rồi trả lại)", PEAK: "ra ở đỉnh nhịp nảy", BE: "về hoà vốn (gia hạn)", EXT: "hết giờ gia hạn", MANUAL: "anh đóng tay" }[why] || why}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT (${bps >= 0 ? "+" : ""}${bps.toFixed(0)} bps giá; phí ${fee.toFixed(3)}${fund ? `, funding ${fund >= 0 ? "+" : ""}${fund.toFixed(3)}` : ""} USDT – ${src}) ${extra}`, pnl >= 0 ? "win" : "loss");
    this.note(`close:${ev.id}`, 2, `${LTAG(ev.env)} · ${pnl >= 0 ? "🟢" : "🔴"} ${coin(ev.sym)} ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT${tot0 > 0 ? ` (${pnl >= 0 ? "+" : ""}${(pnl / tot0 * 100).toFixed(2)}% tổng tài sản)` : ""}`, `${{ TIME: "Hết giờ giữ", SL: "Cắt lỗ", TRAIL: "Cắt lỗ đuổi", PEAK: "Ra ở đỉnh nhịp nảy", BE: "Về hoà vốn", EXT: "Hết giờ gia hạn", MANUAL: "Anh đóng tay" }[why] || why} · ${bps >= 0 ? "+" : ""}${bps.toFixed(0)} bps\nVào ${+P.ap.toPrecision(8)} → ra ${+px.toPrecision(8)} · ${+P.q.toFixed(8)} ${coin(ev.sym)} (${(P.q * P.ap).toFixed(2)} USDT) · giữ ${Math.max(1, Math.round((Date.now() - (P.t1 || ev.t0)) / 60000))} phút\nLời gộp ${gp >= 0 ? "+" : ""}${gp.toFixed(3)} · phí −${Math.abs(fee).toFixed(3)}${fund ? ` · funding ${fund >= 0 ? "+" : ""}${fund.toFixed(3)}` : ""} · hôm nay ${this.S.day.pnl >= 0 ? "+" : ""}${this.S.day.pnl.toFixed(2)} USDT`, `lv:${ev.id}`);
    if (this.S.day.pnl <= -this.base() * c.lv_daily / 100) { this.S.halt = `lỗ ${this.S.day.pnl.toFixed(2)} USDT hôm nay – ngừng mở mới tới hết ngày`; this.say(`⛔ ${this.S.halt}`, "stop"); this.dayEvent(`⛔ ${this.S.halt}`); this.note(`halt:${this.S.day.d}`, 3, "⛔ Tài khoản Binance thật: ngừng mở lệnh mới tới hết ngày", this.S.halt); }
    this.save();
  }
  // ---------------------------------------------------------------- kết quả theo ngày, tách riêng Demo / Thật
  dayAdd(ev, pnl, fee, px, why, at = Date.now()) {
    const env = ev.env, d = vnDay(at), E = ((this.S.days ||= {})[env] ||= {}), D = (E[d] ||= { n: 0, usd: 0, bps: 0, fees: 0, win: 0, by: {}, coins: {}, why: {}, ev: [] });
    const n0 = Math.max(1e-9, ev.pos.q * ev.pos.ap), bps = ev.pos.ap ? pnl / n0 * 1e4 : 0, coin = ev.sym.replace(/USDT$/, "");      // bps ròng: giá + phí + funding thật
    D.n++; D.usd += pnl; D.bps += bps; D.fees += fee; if (pnl > 0) D.win++; if (ev.fund) D.fund = +((D.fund || 0) + ev.fund).toFixed(4);
    const b = (D.by[ev.strat || "hook"] ||= { n: 0, usd: 0, win: 0 }); b.n++; b.usd += pnl; if (pnl > 0) b.win++;
    const k = (D.coins[coin] ||= [0, 0]); k[0]++; k[1] += pnl;
    const w = (D.why[why] ||= [0, 0]); w[0]++; w[1] += pnl;
    const T = (((this.S.dtr ||= {})[env] ||= {})[d] ||= []);
    if (T.length < 400) T.push([iso(at).slice(11, 16), coin + ":F", ev.side, ev.strat || "hook", +pnl.toFixed(3), +bps.toFixed(1), why, ev.lv.filter((l) => l.fq > 0).length || null, Math.round((at - (ev.pos.t1 || ev.t0)) / 1000)]);
  }
  dayEvent(m) { const env = this.env(), d = vnDay(Date.now()), E = ((this.S.days ||= {})[env] ||= {}), D = (E[d] ||= { n: 0, usd: 0, bps: 0, fees: 0, win: 0, by: {}, coins: {}, why: {}, ev: [] }); D.ev = [...(D.ev || []).slice(-9), [iso(Date.now()).slice(11, 16), String(m).slice(0, 160)]]; }
  daysOut(env) {
    const E = (this.S.days || {})[env] || {}, T = (this.S.dtr || {})[env] || {}, B = (this.S.bal || {})[env] || {};
    const ks = Object.keys(T).sort(); for (const k of ks.slice(0, Math.max(0, ks.length - 90))) delete T[k];
    for (const [d, b] of Object.entries(B)) { const D = (E[d] ||= { n: 0, usd: 0, bps: 0, fees: 0, win: 0, by: {}, coins: {}, why: {}, ev: [] }); D.eq0 = b[0]; D.eq1 = b[1]; }
    return { days: E, dtr: T, start: null, eq: this.st.env === env ? this.st.bal ?? null : null, at: iso(Date.now()) };
  }
  err(what, e) {
    this.S.errs++; this.say(`⚠️ ${what}: ${e.message}`, "stop");
    if (this.S.errs >= 5 && !this.S.halt) { this.S.halt = `${this.S.errs} lỗi API liên tiếp (gần nhất: ${e.message.slice(0, 80)}) – ngừng mở mới, lệnh đang mở vẫn được quản lý; bấm "Chạy lại" trên trang sau khi xử lý`; this.note(`err:${Date.now()}`, 3, "⚠️ Tài khoản Binance thật: tạm ngừng do lỗi", this.S.halt); }
  }
  resume(at) { if (at && at !== this.S.resumeSeen) { this.S.resumeSeen = at; this.S.halt = null; this.S.errs = 0; if (this.st.bal > 0) (this.S.peak ||= {})[this.env()] = this.st.bal; this.say("Anh cho chạy lại tài khoản thật"); } }
  summary() {
    const c = this.cfg();
    const B = this.base(), full = B * c.hk_size / 100 / 2 >= 5.5 && B * c.hk_mkS / 100 >= 5.5;
    return { on: !!c.lv_on, ready: this.enabled(), env: this.env(), st: this.st, size: { base: +B.toFixed(2), mode: this.env() !== "live" || full ? "pct" : B * 0.25 >= 16.5 ? "min3" : B * 0.25 >= 11 ? "min2" : "min1", dayLim: +(B * c.lv_daily / 100).toFixed(2) }, halt: this.S.halt, day: { d: this.S.day.d, pnl: +this.S.day.pnl.toFixed(2) },
      risk: (() => { const r = this.riskNow(); return { B: +r.B.toFixed(2), N: +r.N.toFixed(2), M: +r.M.toFixed(2), W: +r.W.toFixed(2), lim: RISK, peak: this.S.peak?.[this.env()] || null }; })(),
      qp: { on: Object.fromEntries(["ou", "rsi2", "fund", "orb", "vwap", "liq", "sec"].map((k) => [k, !!this.cfg()["lq_" + k]])), sz: this.cfg().lq_sz, max: this.cfg().lq_max,
        open: this.qOpen().map((p) => { let u = 0; for (const L of p.legs) { const m = this.core.q?.mid?.(L.sym) || L.ap; u += L.side * L.q * (m - L.ap); } return { id: p.id, keep: p.keep ? 1 : 0, xm: p.xm || null, xs: p.xs || null, x0: p.x0 || null, pid: p.pid, k: p.k, name: p.name, legs: p.legs.map((L) => ({ sym: L.sym, side: L.side, q: L.q, ap: L.ap, stop: L.stop?.px || null, m: this.core.q?.mid?.(L.sym) || null })), N: p.N, upnl: +u.toFixed(4), t0: iso(p.t0), exp: iso(p.exp), why: p.why, fees: +p.fees.toFixed(4) }; }) },
      swp: { on: !!this.cfg().sw_lv_pump, sz: this.cfg().sw_lv_sz, max: this.cfg().sw_lv_max, open: this.swOpen().map((p) => { const m = this.core.sw?.px?.[p.sym]?.m || p.ap; return { id: p.id, keep: p.keep ? 1 : 0, xm: p.xm || null, xs: p.xs || null, x0: p.x0 || null, sym: p.sym, q: p.q, ap: p.ap, N: p.N, m, upnl: +(-p.q * (m - p.ap)).toFixed(4), t0: iso(p.t0), exp: iso(p.exp), why: p.why, fees: +(p.feeA ?? p.fees ?? 0).toFixed(4), fund: p.fundA ?? null }; }) },
      totE: Object.fromEntries(Object.entries(this.S.totE || {}).map(([k, T]) => [k, { ...T, pnl: +T.pnl.toFixed(2), fees: +T.fees.toFixed(2) }])),
      dayE: Object.fromEntries(Object.entries(this.S.dayE || {}).map(([k, D]) => [k, { d: vnDay(Date.now()), pnl: D.d === vnDay(Date.now()) ? +D.pnl.toFixed(2) : 0 }])),      // sang ngày mới chưa có lệnh đóng → 0, không hiện lời ngày cũ tot: { ...this.S.tot, pnl: +this.S.tot.pnl.toFixed(2), fees: +this.S.tot.fees.toFixed(2) },
      ev: this.active().map((e) => ({ id: e.id, keep: e.keep ? 1 : 0, xm: e.xm || null, xu: e.xu || null, xs: e.xs || null, x0: e.x0 || null, k: e.k, R: e.R, c0: e.c0, fees: +(e.feeA ?? e.fees ?? 0).toFixed(4), fund: e.fundA ?? null, sym: e.sym, side: e.side, t0: iso(e.t0), exp: iso(e.exp), lv: e.lv.map((l) => ({ px: l.px, q: l.q, st: l.st, fq: l.fq })), pos: e.pos, stop: e.stop?.px || null, stopKind: e.stop?.kind || null, hold: e.hold })),
      hist: this.S.hist.slice(-80), log: this.S.log.slice(-200), miss: (this.S.miss || []).slice(-40), eqH: Object.fromEntries(Object.entries(this.S.eqH || {}).map(([k, H]) => [k, H.slice(-2016)])), wal: this.S.wal || null, man: this.S.man || null, mh: Object.values(this.S.mh?.[this.env()]?.L || {}).slice(-150), walH: Object.fromEntries(Object.entries(this.S.walH || {}).map(([k, H]) => [k, H.slice(-720)])),
      eqHr: Object.fromEntries(Object.entries(this.S.eqHr || {}).map(([k, H]) => [k, H.slice(-24 * 45)])), eqDay: this.S.eqDay || {}, flow: Object.fromEntries(Object.entries(this.S.flow || {}).map(([k, F]) => [k, F.L.slice(-300)])) };
  }
}
