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
const SAPI = "https://api.binance.com";
const vnDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
const iso = (t) => new Date(t).toISOString().slice(0, 19);
const dec = (s) => { const t = String(s); const i = t.indexOf("."); return i < 0 ? 0 : t.replace(/0+$/, "").length - i - 1; };
const fl = (x, step) => Math.floor(x / step + 1e-9) * step;
const ce = (x, step) => Math.ceil(x / step - 1e-9) * step;

export class LiveExec {
  constructor({ core, dir, log }) {
    this.core = core; this.log = log; this.file = path.join(dir, "live.json");
    this.S = { ev: {}, day: { d: vnDay(Date.now()), pnl: 0 }, tot: { n: 0, pnl: 0, win: 0, fees: 0 }, hist: [], log: [], errs: 0, halt: null, seq: 1 };
    try { Object.assign(this.S, JSON.parse(fs.readFileSync(this.file, "utf8"))); } catch (e) { /* tệp mới */ }
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
  say(m, kind = "info") { this.S.log = [...this.S.log.slice(-79), { t: iso(Date.now()), k: kind, m }]; this.log(`💵 ${m}`); this.save(); }
  note(key, sev, title, body) { try { this.core.note(`lv:${key}`, sev, title, body); } catch (e) { /* bỏ qua */ } }
  save() { try { const tmp = this.file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(this.S)); fs.renameSync(tmp, this.file); } catch (e) { this.log("lưu live.json lỗi", e.message); } }
  // ---------------------------------------------------------------- gọi API Binance (ký HMAC-SHA256)
  async req(method, p, params = {}, signed = true, base = BASE[this.env()]) {
    const K = this.keys(); if (signed && !K) throw new Error("chưa có khoá API trên máy chủ");
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
    if (signed) { q.set("recvWindow", "5000"); q.set("timestamp", String(Date.now() + this.off)); q.set("signature", crypto.createHmac("sha256", K.s).update(q.toString()).digest("hex")); }
    const r = await fetch(`${base}${p}${q.toString() ? "?" + q : ""}`, { method, headers: K ? { "X-MBX-APIKEY": K.k } : {}, signal: AbortSignal.timeout(10000) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* không phải JSON */ }
    if (!r.ok || (j && j.code && j.code < 0)) { const e = new Error(`${j?.code ?? r.status} ${j?.msg || t.slice(0, 160)}`); e.code = j?.code; throw e; }
    return j;
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
    const skip = (why) => this.say(`Bỏ qua ${base}: ${why}`);
    if (!this.enabled()) return;
    if (!h.id.endsWith(":F")) return skip("chỉ đánh futures");
    if (!this.st.ok) return skip(`tài khoản chưa sẵn sàng – ${this.st.why}`);
    if (this.S.halt) return skip(`đang ngừng mở mới – ${this.S.halt}`);
    if (this.S.day.d !== vnDay(now)) this.S.day = { d: vnDay(now), pnl: 0 };
    if (this.S.day.pnl <= -c.lv_cap * c.lv_daily / 100) return skip(`đã lỗ ${this.S.day.pnl.toFixed(2)} USDT hôm nay (giới hạn ${c.lv_daily}% của ${c.lv_cap} USDT)`);
    const A = this.active();
    if (A.length >= c.hk_max) return skip(`đã có ${A.length} lần bắt đang mở (tối đa ${c.hk_max})`);
    const sym = this.core.M?.[h.id]?.sym; if (!sym) return skip("không rõ mã hợp đồng");
    if (A.some((e) => e.sym === sym)) return skip("đang có lần bắt khác trên coin này");
    const F = await this.filters(sym); if (!F) return skip(`${sym} không giao dịch được trên ${env === "live" ? "Binance" : "Binance Demo"}`);
    // vốn: tổng ký quỹ đang dùng + lần này ≤ vốn tối đa
    const used = A.reduce((a, e) => a + e.lv.reduce((b, l) => b + (l.st === "cxl" ? 0 : l.px * l.q), 0), 0) / c.lv_lev;
    let per = Math.max(c.lv_cap * c.hk_size / 100 / h.lv.length, F.minN * 1.1), lv = h.lv;
    if (per * lv.length > c.lv_cap * 0.25) { lv = h.lv.slice(0, 1); per = Math.max(c.lv_cap * c.hk_size / 100, F.minN * 1.1); }
    if (per * lv.length > c.lv_cap * 0.25) return skip(`lệnh nhỏ nhất của ${sym} (${F.minN} USDT) lớn hơn 25% vốn tối đa – tăng "Vốn tối đa"`);
    if (used + per * lv.length / c.lv_lev > c.lv_cap) return skip(`đã dùng ${used.toFixed(2)} / ${c.lv_cap} USDT ký quỹ`);
    if (this.st.avail != null && per * lv.length / c.lv_lev > this.st.avail * 0.9) return skip(`số dư khả dụng ${this.st.avail} USDT không đủ`);
    // không đụng coin anh đang có vị thế
    const pr = await this.pos(sym); if (pr && Math.abs(pr.amt) > 0) return skip(`anh đang có vị thế ${sym} (${pr.amt}) – bot không đụng vào`);
    if (!this.lev[sym]) {
      await this.req("POST", "/fapi/v1/marginType", { symbol: sym, marginType: "ISOLATED" }).catch((e) => { if (e.code !== -4046) throw e; });
      await this.req("POST", "/fapi/v1/leverage", { symbol: sym, leverage: c.lv_lev }); this.lev[sym] = c.lv_lev;
    }
    const id = `${this.S.seq++}`, side = h.side;
    const ev = { id, k: h.id, sym, side, t0: now, exp: h.exp, hold: h.hold, stopPct: h.stop, R: h.R, env, done: false, pos: { q: 0, ap: 0, t1: null }, stop: null, fees: 0,
      lv: lv.map((l, i) => { const px = side > 0 ? fl(l.px, F.tick) : ce(l.px, F.tick), q = Math.max(fl(per / px, F.step), ce(F.minN * 1.02 / px, F.step)); return { d: l.d, px: +px.toFixed(F.td), q: +q.toFixed(F.sd), pxs: px.toFixed(F.td), qs: q.toFixed(F.sd), cid: `mb${id}x${i}${env[0]}`, st: "wait", fq: 0, ap: 0 }; }).filter((l) => l.q >= F.minQ && l.q * l.px >= F.minN) };
    if (!ev.lv.length) return skip("khối lượng sau làm tròn nhỏ hơn mức tối thiểu của sàn");
    this.S.ev[id] = ev; this.save();
    this.say(`🪝 ${base} ${side > 0 ? "sập" : "vọt"} ${Math.abs(h.R / 100).toFixed(1)}% → chuẩn bị ${side > 0 ? "MUA" : "BÁN"} ${ev.lv.map((l) => `${l.q} @ ${l.px}`).join(" và ")} (${env === "live" ? "TIỀN THẬT" : "Demo"}, ký quỹ cô lập x${c.lv_lev})`);
    await this.submitDue(ev);
  }
  // lệnh chờ quá xa giá hiện tại bị sàn từ chối (giới hạn PERCENT_PRICE) → chỉ gửi khi giá tới gần
  async submitDue(ev) {
    const F = await this.filters(ev.sym), m = this.mark(ev.k);
    for (const l of ev.lv) {
      if (l.st !== "wait") continue;
      if (Date.now() > ev.exp) { l.st = "cxl"; continue; }
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
        if (fq > l.fq) { this.addFill(ev, fq - l.fq, (ap * fq - l.ap * l.fq) / Math.max(1e-12, fq - l.fq)); l.fq = fq; l.ap = ap; }
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
      else if (!ev.pAt || now - ev.pAt > 20000) {      // vị thế còn không? (cắt lỗ trên sàn đã chạy / anh tự đóng)
        ev.pAt = now; const p = await this.pos(ev.sym);
        if (p && Math.abs(p.amt) === 0 && ev.lv.every((l) => l.st !== "open")) await this.finish(ev, "SL", sp || ev.pos.ap, "vị thế đã được đóng trên sàn (cắt lỗ chạy hoặc anh tự đóng)");
      }
    } else if (ev.lv.every((l) => l.st === "cxl" || (l.st === "filled" && l.fq === 0))) { ev.done = true; this.say(`${ev.sym}: hết ${Math.round((ev.exp - ev.t0) / 60e3)} phút giá không tới lệnh chờ – đã huỷ, không mất phí`); }
    this.save();
  }
  addFill(ev, q, px) {
    const c = this.cfg(), P = ev.pos, nq = P.q + q;
    P.ap = (P.ap * P.q + px * q) / nq; P.q = nq; P.t1 ||= Date.now(); ev.fees += q * px * c.fee_m / 100; ev.needStop = true;
    this.say(`✅ Khớp ${ev.side > 0 ? "MUA" : "BÁN"} ${ev.sym} ${+q.toFixed(8)} @ ${+px.toPrecision(8)} · vị thế ${+P.q.toFixed(8)} giá TB ${+P.ap.toPrecision(8)} · tự đóng sau ${ev.hold} phút`, "win");
    this.note(`fill:${ev.id}:${P.q}`, 2, `💵 ${ev.env === "live" ? "LỆNH THẬT" : "Demo"}: khớp ${ev.side > 0 ? "Long" : "Short"} ${ev.sym}`, `${+q.toFixed(8)} @ ${+px.toPrecision(8)} – tự đóng sau ${ev.hold} phút, cắt lỗ trên sàn ${ev.stopPct}%`);
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
  async finish(ev, why, px, extra = "") {
    const c = this.cfg(), P = ev.pos;
    if (ev.stop?.id) await this.cancelStop(ev);
    const fee = ev.fees + P.q * px * c.fee_t / 100, pnl = ev.side * P.q * (px - P.ap) - fee;
    ev.done = true; ev.exit = px; ev.pnl = +pnl.toFixed(4); ev.why = why; ev.t2 = Date.now();
    this.S.day.pnl += pnl; this.S.tot.n++; this.S.tot.pnl += pnl; this.S.tot.fees += fee; if (pnl > 0) this.S.tot.win++;
    this.dayAdd(ev, pnl, fee, px, why);
    this.S.hist = [...this.S.hist.slice(-199), { id: ev.id, sym: ev.sym, side: ev.side, q: P.q, e: P.ap, x: px, pnl: ev.pnl, fee: +fee.toFixed(4), why, t1: iso(P.t1 || ev.t0), t2: iso(ev.t2), env: ev.env }];
    const bps = P.ap ? ev.side * (px / P.ap - 1) * 1e4 : 0;
    this.say(`${pnl >= 0 ? "💰" : "🔻"} Đóng ${ev.sym} ${ev.side > 0 ? "Long" : "Short"} – ${{ TIME: "hết giờ giữ", SL: "cắt lỗ" }[why] || why}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT (${bps >= 0 ? "+" : ""}${bps.toFixed(0)} bps, đã trừ phí ước tính) ${extra}`, pnl >= 0 ? "win" : "loss");
    this.note(`close:${ev.id}`, 2, `💵 ${ev.env === "live" ? "LỆNH THẬT" : "Demo"}: ${ev.sym} ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT`, `${{ TIME: "Hết giờ giữ", SL: "Cắt lỗ" }[why] || why} · ${bps >= 0 ? "+" : ""}${bps.toFixed(0)} bps · hôm nay ${this.S.day.pnl >= 0 ? "+" : ""}${this.S.day.pnl.toFixed(2)} USDT`);
    if (this.S.day.pnl <= -c.lv_cap * c.lv_daily / 100) { this.S.halt = `lỗ ${this.S.day.pnl.toFixed(2)} USDT hôm nay – ngừng mở mới tới hết ngày`; this.say(`⛔ ${this.S.halt}`, "stop"); this.dayEvent(`⛔ ${this.S.halt}`); this.note(`halt:${this.S.day.d}`, 3, "⛔ Tài khoản Binance thật: ngừng mở lệnh mới tới hết ngày", this.S.halt); }
    this.save();
  }
  // ---------------------------------------------------------------- kết quả theo ngày, tách riêng Demo / Thật
  dayAdd(ev, pnl, fee, px, why) {
    const env = ev.env, d = vnDay(Date.now()), E = ((this.S.days ||= {})[env] ||= {}), D = (E[d] ||= { n: 0, usd: 0, bps: 0, fees: 0, win: 0, by: {}, coins: {}, why: {}, ev: [] });
    const bps = ev.pos.ap ? ev.side * (px / ev.pos.ap - 1) * 1e4 - (fee / Math.max(1e-9, ev.pos.q * ev.pos.ap)) * 1e4 : 0, coin = ev.sym.replace(/USDT$/, "");
    D.n++; D.usd += pnl; D.bps += bps; D.fees += fee; if (pnl > 0) D.win++;
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
    return { on: !!c.lv_on, ready: this.enabled(), env: this.env(), st: this.st, halt: this.S.halt, day: { d: this.S.day.d, pnl: +this.S.day.pnl.toFixed(2) }, tot: { ...this.S.tot, pnl: +this.S.tot.pnl.toFixed(2), fees: +this.S.tot.fees.toFixed(2) },
      ev: this.active().map((e) => ({ id: e.id, sym: e.sym, side: e.side, t0: iso(e.t0), exp: iso(e.exp), lv: e.lv.map((l) => ({ px: l.px, q: l.q, st: l.st, fq: l.fq })), pos: e.pos, stop: e.stop?.px || null, stopKind: e.stop?.kind || null, hold: e.hold })),
      hist: this.S.hist.slice(-30), log: this.S.log.slice(-30) };
  }
}
