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
  say(m, kind = "info") { this.S.log = [...this.S.log.slice(-79), { t: iso(Date.now()), k: kind, m }]; this.log(`💵 ${m}`); this.save(); }
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
  active() { return Object.values(this.S.ev).filter((e) => !e.done); }
  // ---------------------------------------------------------------- 1) phương pháp vừa đặt lệnh chờ trên sàn thử → đặt lệnh thật tương ứng
  onHook(h) { this.q.push(h); }
  async place(h) {
    const c = this.cfg(), env = this.env(), now = Date.now(), base = h.id.split(":")[0];
    const skip = (why) => { this.say(`Bỏ qua ${base}: ${why}`); this.missAdd({ k: h.id, side: h.side, R: h.R, t0: iso(now), what: "skip", why }); };
    if (!this.enabled()) return;
    if (!h.id.endsWith(":F")) return skip("chỉ đánh futures");
    if (!this.st.ok) return skip(`tài khoản chưa sẵn sàng – ${this.st.why}`);
    if (this.S.halt) return skip(`đang ngừng mở mới – ${this.S.halt}`);
    if (this.S.day.d !== vnDay(now)) this.S.day = { d: vnDay(now), pnl: 0 };
    const B = this.base();
    if (this.S.day.pnl <= -B * c.lv_daily / 100) return skip(`đã lỗ ${this.S.day.pnl.toFixed(2)} USDT hôm nay (giới hạn ${c.lv_daily}% của ${+B.toFixed(2)} USDT)`);
    const A = this.active();
    if (A.length >= c.hk_max) return skip(`đã có ${A.length} lần bắt đang mở (tối đa ${c.hk_max})`);
    const sym = this.core.M?.[h.id]?.sym; if (!sym) return skip("không rõ mã hợp đồng");
    if (A.some((e) => e.sym === sym)) return skip("đang có lần bắt khác trên coin này");
    const F = await this.filters(sym); if (!F) return skip(`${sym} không giao dịch được trên ${env === "live" ? "Binance" : "Binance Demo"}`);
    // vốn: tổng ký quỹ đang dùng + lần này ≤ vốn tối đa
    const used = A.reduce((a, e) => a + e.lv.reduce((b, l) => b + (l.st === "cxl" ? 0 : l.px * l.q), 0), 0) / c.lv_lev;
    // mức "vào ngay" (mk, lệnh thị trường) dùng hk_mkS % vốn; các mức chờ chia đều hk_size %
    const lim = h.lv.filter((l) => !l.mk), mkL = h.lv.filter((l) => l.mk);
    let per = Math.max(B * c.hk_size / 100 / Math.max(1, lim.length), F.minN * 1.1), lv = h.lv, small = false;
    const perMk = Math.max(B * (h.mkS || 0) / 100, F.minN * 1.1);
    const tot = (L) => L.reduce((a, l) => a + (l.mk ? perMk : per), 0);
    if (env === "live") {
      // VỐN NHỎ (chỉ tiền thật): sàn bắt mỗi lệnh ≥ ~5 USDT nên không chia đủ các mức theo 5% được → giữ các mức có lời kỳ vọng cao nhất
      // (kiểm chứng 664 ngày, đã trừ phí & trượt giá): "mua ngay" khi đủ điều kiện +119 bps/lệnh, thắng 73%; lệnh chờ sâu 1,5× +145 bps; 1,25× +108 bps.
      // Ưu tiên: mua ngay → mức chờ sâu hơn → mức nông hơn; mỗi mức cỡ tối thiểu của sàn; cả lần bắt ≤ 25% vốn (1 mức duy nhất: ≤ 30%).
      if (tot(lv) > B * 0.25) {
        small = true; per = F.minN * 1.1; lv = [];
        for (const l of [...mkL, ...[...lim].sort((a, b) => b.d - a.d)]) if (tot([...lv, l]) <= B * (lv.length ? 0.25 : 0.3)) lv.push(l);
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
    // không đụng coin anh đang có vị thế
    const pr = await this.pos(sym); if (pr && Math.abs(pr.amt) > 0) return skip(`anh đang có vị thế ${sym} (${pr.amt}) – bot không đụng vào`);
    if (!this.lev[sym]) {
      await this.req("POST", "/fapi/v1/marginType", { symbol: sym, marginType: "ISOLATED" }).catch((e) => { if (e.code !== -4046) throw e; });
      await this.req("POST", "/fapi/v1/leverage", { symbol: sym, leverage: c.lv_lev }); this.lev[sym] = c.lv_lev;
    }
    const id = `${this.S.seq++}`, side = h.side;
    const ev = { id, k: h.id, sym, side, t0: now, exp: h.exp, hold: h.hold, stopPct: h.stop, R: h.R, c0: h.c0, env, done: false, pos: { q: 0, ap: 0, t1: null }, stop: null, fees: 0,
      lv: lv.map((l, i) => { const m0 = l.mk ? this.mark(h.id) || l.px : l.px, px = side > 0 ? fl(m0, F.tick) : ce(m0, F.tick), q = Math.max(fl((l.mk ? perMk : per) / px, F.step), ce(F.minN * 1.02 / px, F.step)); return { d: l.d, mk: l.mk ? 1 : 0, px: +px.toFixed(F.td), q: +q.toFixed(F.sd), pxs: px.toFixed(F.td), qs: q.toFixed(F.sd), cid: `mb${id}x${i}${env[0]}`, st: "wait", fq: 0, ap: 0 }; }).filter((l) => l.q >= F.minQ && l.q * l.px >= F.minN) };
    if (!ev.lv.length) return skip("khối lượng sau làm tròn nhỏ hơn mức tối thiểu của sàn");
    this.S.ev[id] = ev; this.save();
    this.say(`🪝 ${base} ${side > 0 ? "sập" : "vọt"} ${Math.abs(h.R / 100).toFixed(1)}% → chuẩn bị ${side > 0 ? "MUA" : "BÁN"} ${ev.lv.map((l) => (l.mk ? `${l.q} NGAY (giá thị trường ~${l.px})` : `${l.q} @ ${l.px}`)).join(" và ")} (${env === "live" ? "TIỀN THẬT" : "Demo"}, ký quỹ cô lập x${c.lv_lev}${small ? `, vốn nhỏ ${+B.toFixed(2)} USDT: chỉ giữ mức tốt nhất, cỡ tối thiểu của sàn` : ""})`);
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
  async tick() {
    if (this.busy) return; this.busy = true;
    try {
      while (this.q.length) { const h = this.q.shift(); try { await this.place(h); } catch (e) { this.err(`đặt lệnh ${h.id}`, e); } }
      for (const ev of this.active()) { try { await this.manage(ev); } catch (e) { this.err(`quản lý ${ev.sym}`, e); } }
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
        if (fq > l.fq) { this.addFill(ev, fq - l.fq, (ap * fq - l.ap * l.fq) / Math.max(1e-12, fq - l.fq), l.mk); l.fq = fq; l.ap = ap; }
        if (o.status === "FILLED") l.st = "filled"; else if (["CANCELED", "EXPIRED", "REJECTED"].includes(o.status)) l.st = l.fq > 0 ? "filled" : "cxl";
      }
    }
    // hết giờ chờ khớp → huỷ phần chưa khớp
    if (now > ev.exp) for (const l of ev.lv) if (l.st === "open") { await this.req("DELETE", "/fapi/v1/order", { symbol: ev.sym, origClientOrderId: l.cid }).catch(() => {}); l.st = l.fq > 0 ? "filled" : "cxl"; }
    if (ev.pos.q > 0) {
      await this.ensureStop(ev);
      const m = this.mark(ev.k), sp = ev.stop?.px;
      const hitSoft = m && sp && (ev.side > 0 ? m <= sp * 0.995 : m >= sp * 1.005);      // sàn lẽ ra đã cắt – kiểm tra & đóng dự phòng
      if (now >= ev.pos.t1 + ev.hold * 60e3) await this.close(ev, "TIME");
      else if (hitSoft) await this.close(ev, "SL");
      // cắt lỗ đuổi chỉ cho lệnh CHỜ: với "mua ngay" nó cắt mất cú hồi lớn (vòng 9, 1.863 lệnh: giữ 60 phút +125 bps/lệnh, đuổi 1,5%/1% chỉ +60) – tiền thật giữ đủ giờ
      else if (c.hk_tra > 0 && m && ev.pos.ap > 0 && !(ev.env === "live" && ev.lv.some((l) => l.mk && l.fq > 0)) && this.trail(ev, m, c)) await this.close(ev, "TRAIL");
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
    P.ap = (P.ap * P.q + px * q) / nq; P.q = nq; P.t1 ||= Date.now(); ev.pk = 0; ev.fees += q * px * (mk ? c.fee_t : c.fee_m) / 100; ev.needStop = true;
    this.say(`✅ Khớp ${ev.side > 0 ? "MUA" : "BÁN"} ${ev.sym} ${+q.toFixed(8)} @ ${+px.toPrecision(8)} · vị thế ${+P.q.toFixed(8)} giá TB ${+P.ap.toPrecision(8)} · tự đóng sau ${ev.hold} phút`, "win");
    this.note(`fill:${ev.id}:${P.q}`, 2, `${LTAG(ev.env)} · ✅ Khớp ${ev.side > 0 ? "Long" : "Short"} ${coin(ev.sym)}`, `${+q.toFixed(8)} @ ${+px.toPrecision(8)} – tự đóng sau ${ev.hold} phút, cắt lỗ trên sàn ${ev.stopPct}%`, `lv:${ev.id}`);
  }
  // 🪝 cắt lỗ đuổi (như sàn thử): lời theo giá giữa ≥ hk_tra bps → đóng khi trả lại hk_trg bps từ đỉnh lời. Đỉnh lời tính lại khi khớp thêm mức (giá TB đổi).
  trail(ev, m, c) { const pr = ev.side * (m / ev.pos.ap - 1) * 1e4; if (!(pr <= ev.pk)) ev.pk = pr; return ev.pk >= c.hk_tra && pr <= ev.pk - c.hk_trg; }
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
    let fee = ev.fees + P.q * px * c.fee_t / 100, gp = ev.side * P.q * (px - P.ap), fund = 0, src = "ước tính";
    const I = P.q > 0 ? await this.income(ev) : null;
    if (I) { fund = I.fund; if (I.rp) gp = I.rp; if (I.com && !I.other) fee = -I.com; src = "theo sổ thu chi Binance"; }
    const pnl = gp - fee + fund;
    ev.done = true; ev.exit = px; ev.pnl = +pnl.toFixed(4); ev.fund = +fund.toFixed(4); ev.why = why; ev.t2 = Date.now();
    this.S.day.pnl += pnl; this.S.tot.n++; this.S.tot.pnl += pnl; this.S.tot.fees += fee; if (pnl > 0) this.S.tot.win++;
    { const T = ((this.S.totE ||= {})[ev.env] ||= { n: 0, pnl: 0, win: 0, fees: 0 }); T.n++; T.pnl += pnl; T.fees += fee; if (pnl > 0) T.win++;
      const d = vnDay(Date.now()), DE = ((this.S.dayE ||= {})[ev.env] ||= { d, pnl: 0 }); if (DE.d !== d) { DE.d = d; DE.pnl = 0; } DE.pnl += pnl; }
    this.dayAdd(ev, pnl, fee, px, why);
    const tot0 = +this.S.wal?.[ev.env]?.total || 0;      // tổng tài sản Binance (mọi ví) lúc đóng – để tính lời/lỗ lệnh này bằng bao nhiêu % tổng tài sản
    this.S.hist = [...this.S.hist.slice(-199), { id: ev.id, sym: ev.sym, side: ev.side, q: P.q, e: P.ap, x: px, pnl: ev.pnl, fee: +fee.toFixed(4), fund: ev.fund || undefined, k: ev.k, R: ev.R, c0: ev.c0 || undefined, ts: iso(ev.t0), lvp: ev.lv.map((l) => l.px), nl: ev.lv.filter((l) => l.fq > 0).length, net: P.ap && P.q ? +(ev.pnl / (P.q * P.ap) * 1e4).toFixed(1) : null, why, t1: iso(P.t1 || ev.t0), t2: iso(ev.t2), env: ev.env, tot: tot0 > 0 ? tot0 : undefined }];
    const bps = P.ap ? ev.side * (px / P.ap - 1) * 1e4 : 0;
    this.say(`${pnl >= 0 ? "💰" : "🔻"} Đóng ${ev.sym} ${ev.side > 0 ? "Long" : "Short"} – ${{ TIME: "hết giờ giữ", SL: "cắt lỗ", TRAIL: "cắt lỗ đuổi (đã lời rồi trả lại)" }[why] || why}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT (${bps >= 0 ? "+" : ""}${bps.toFixed(0)} bps giá; phí ${fee.toFixed(3)}${fund ? `, funding ${fund >= 0 ? "+" : ""}${fund.toFixed(3)}` : ""} USDT – ${src}) ${extra}`, pnl >= 0 ? "win" : "loss");
    this.note(`close:${ev.id}`, 2, `${LTAG(ev.env)} · ${pnl >= 0 ? "🟢" : "🔴"} ${coin(ev.sym)} ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT${tot0 > 0 ? ` (${pnl >= 0 ? "+" : ""}${(pnl / tot0 * 100).toFixed(2)}% tổng tài sản)` : ""}`, `${{ TIME: "Hết giờ giữ", SL: "Cắt lỗ", TRAIL: "Cắt lỗ đuổi" }[why] || why} · ${bps >= 0 ? "+" : ""}${bps.toFixed(0)} bps · hôm nay ${this.S.day.pnl >= 0 ? "+" : ""}${this.S.day.pnl.toFixed(2)} USDT`, `lv:${ev.id}`);
    if (this.S.day.pnl <= -this.base() * c.lv_daily / 100) { this.S.halt = `lỗ ${this.S.day.pnl.toFixed(2)} USDT hôm nay – ngừng mở mới tới hết ngày`; this.say(`⛔ ${this.S.halt}`, "stop"); this.dayEvent(`⛔ ${this.S.halt}`); this.note(`halt:${this.S.day.d}`, 3, "⛔ Tài khoản Binance thật: ngừng mở lệnh mới tới hết ngày", this.S.halt); }
    this.save();
  }
  // ---------------------------------------------------------------- kết quả theo ngày, tách riêng Demo / Thật
  dayAdd(ev, pnl, fee, px, why) {
    const env = ev.env, d = vnDay(Date.now()), E = ((this.S.days ||= {})[env] ||= {}), D = (E[d] ||= { n: 0, usd: 0, bps: 0, fees: 0, win: 0, by: {}, coins: {}, why: {}, ev: [] });
    const n0 = Math.max(1e-9, ev.pos.q * ev.pos.ap), bps = ev.pos.ap ? pnl / n0 * 1e4 : 0, coin = ev.sym.replace(/USDT$/, "");      // bps ròng: giá + phí + funding thật
    D.n++; D.usd += pnl; D.bps += bps; D.fees += fee; if (pnl > 0) D.win++; if (ev.fund) D.fund = +((D.fund || 0) + ev.fund).toFixed(4);
    const b = (D.by.hook ||= { n: 0, usd: 0, win: 0 }); b.n++; b.usd += pnl; if (pnl > 0) b.win++;
    const k = (D.coins[coin] ||= [0, 0]); k[0]++; k[1] += pnl;
    const w = (D.why[why] ||= [0, 0]); w[0]++; w[1] += pnl;
    const T = (((this.S.dtr ||= {})[env] ||= {})[d] ||= []);
    if (T.length < 400) T.push([iso(Date.now()).slice(11, 16), coin + ":F", ev.side, "hook", +pnl.toFixed(3), +bps.toFixed(1), why, ev.lv.filter((l) => l.fq > 0).length || null, Math.round((Date.now() - (ev.pos.t1 || ev.t0)) / 1000)]);
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
  resume(at) { if (at && at !== this.S.resumeSeen) { this.S.resumeSeen = at; this.S.halt = null; this.S.errs = 0; this.say("Anh cho chạy lại tài khoản thật"); } }
  summary() {
    const c = this.cfg();
    const B = this.base(), full = B * c.hk_size / 100 / 2 >= 5.5 && B * c.hk_mkS / 100 >= 5.5;
    return { on: !!c.lv_on, ready: this.enabled(), env: this.env(), st: this.st, size: { base: +B.toFixed(2), mode: this.env() !== "live" || full ? "pct" : B * 0.25 >= 16.5 ? "min3" : B * 0.25 >= 11 ? "min2" : "min1", dayLim: +(B * c.lv_daily / 100).toFixed(2) }, halt: this.S.halt, day: { d: this.S.day.d, pnl: +this.S.day.pnl.toFixed(2) },
      totE: Object.fromEntries(Object.entries(this.S.totE || {}).map(([k, T]) => [k, { ...T, pnl: +T.pnl.toFixed(2), fees: +T.fees.toFixed(2) }])),
      dayE: Object.fromEntries(Object.entries(this.S.dayE || {}).map(([k, D]) => [k, { d: D.d, pnl: +D.pnl.toFixed(2) }])), tot: { ...this.S.tot, pnl: +this.S.tot.pnl.toFixed(2), fees: +this.S.tot.fees.toFixed(2) },
      ev: this.active().map((e) => ({ id: e.id, k: e.k, R: e.R, c0: e.c0, fees: +(e.fees || 0).toFixed(4), sym: e.sym, side: e.side, t0: iso(e.t0), exp: iso(e.exp), lv: e.lv.map((l) => ({ px: l.px, q: l.q, st: l.st, fq: l.fq })), pos: e.pos, stop: e.stop?.px || null, stopKind: e.stop?.kind || null, hold: e.hold })),
      hist: this.S.hist.slice(-80), log: this.S.log.slice(-40), miss: (this.S.miss || []).slice(-40), eqH: Object.fromEntries(Object.entries(this.S.eqH || {}).map(([k, H]) => [k, H.slice(-2016)])), wal: this.S.wal || null, walH: Object.fromEntries(Object.entries(this.S.walH || {}).map(([k, H]) => [k, H.slice(-720)])),
      eqHr: Object.fromEntries(Object.entries(this.S.eqHr || {}).map(([k, H]) => [k, H.slice(-24 * 45)])), eqDay: this.S.eqDay || {}, flow: Object.fromEntries(Object.entries(this.S.flow || {}).map(([k, F]) => [k, F.L.slice(-300)])) };
  }
}
