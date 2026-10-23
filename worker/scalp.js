// BOT LƯỚT GIÂY (scalping) – chạy liên tục trên Cloudflare Durable Object, nghe sổ lệnh + khớp lệnh từng mili-giây qua WebSocket,
// đánh giá lại mỗi giây, vào/ra trong vài giây tới 1 phút. Sàn thử: tiền giả, giá & khớp lệnh thật, phí thật.
//
// Kỷ luật cốt lõi: CHỈ vào lệnh khi biên lợi nhuận kỳ vọng đo được LỚN HƠN phí + chênh lệch mua/bán.
//   - Bộ học trực tuyến: mỗi giây ghi "tín hiệu lúc này" (dòng lệnh chủ động 5 giây, lệch sổ lệnh, đà giá chuẩn hoá theo biến động),
//     sau 5 / 15 / 30 / 60 giây đo giá đã đi bao nhiêu điểm cơ bản (bps, 1 bps = 0,01%) theo hướng tín hiệu → bảng kỳ vọng theo độ mạnh tín hiệu.
//   - Vào lệnh khi: kỳ vọng(độ mạnh, thời gian giữ) − chi phí khứ hồi ≥ ngưỡng ròng VÀ kỳ vọng ≥ k × chi phí VÀ đủ mẫu.
//   - Chi phí khứ hồi: taker = 2 × phí taker + chênh lệch; maker = phí maker (vào) + phí taker (ra) – lệnh maker chỉ khớp khi có người bán/mua XUYÊN qua giá mình đặt.
//   - Cầu dao: lỗ trong ngày, 50 lệnh gần nhất ròng âm → nghỉ 30 phút và nâng ngưỡng, giới hạn số lệnh/giờ, chênh lệch quá rộng, sát giờ funding.
// Nguồn dữ liệu: Binance Futures → OKX → Bybit (tự chuyển khi một nguồn bị chặn / im lặng).
import { DurableObject } from "cloudflare:workers";

export const SCALP_DEF = { enabled: false, capital: 1000, syms: ["BTC", "ETH", "SOL"], lev: 5, risk: 0.25, mode: "taker", fee_m: 0.02, fee_t: 0.05,
  min_net: 1.0, k: 1.3, min_n: 300, hmax: 60, daily_stop: 3, max_h: 120, spread_max: 3 };
const HS = [5, 15, 30, 60];
const NB = 6, BW = 0.15;
const iso = (t) => new Date(t).toISOString().slice(0, 23);
const vnDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r2 = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);

function norm(c) {
  c = { ...SCALP_DEF, ...(c || {}) };
  c.syms = (Array.isArray(c.syms) ? c.syms : SCALP_DEF.syms).map((s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean).slice(0, 5);
  if (!c.syms.length) c.syms = ["BTC"];
  c.capital = clamp(+c.capital || 1000, 50, 1e7); c.lev = clamp(+c.lev || 5, 1, 20); c.risk = clamp(+c.risk || 0.25, 0.02, 1);
  c.fee_m = clamp(+c.fee_m, -0.02, 0.2); c.fee_t = clamp(+c.fee_t, 0, 0.2); c.min_net = clamp(+c.min_net || 1, 0, 20); c.k = clamp(+c.k || 1.3, 1, 5);
  c.min_n = clamp(+c.min_n || 300, 50, 10000); c.hmax = clamp(+c.hmax || 60, 5, 60); c.daily_stop = clamp(+c.daily_stop || 3, 0.5, 20); c.max_h = clamp(+c.max_h || 120, 1, 1000);
  c.spread_max = clamp(+c.spread_max || 3, 0.2, 50); c.mode = c.mode === "maker" ? "maker" : "taker";
  return c;
}
function newState(c, now) {
  return { v: 1, start: c.capital, cash: c.capital, peak: c.capital, day: { d: vnDay(now), eq0: c.capital }, pos: {}, ord: {}, trades: [], L: {}, eq: [], log: [], seq: 1,
    pause: null, kadd: 0, stats: { n: 0, gross: 0, fees: 0, net: 0, win: 0 }, created: iso(now), reset_seen: c.reset_at || null };
}

// ---------------------------------------------------------------- nguồn dữ liệu
const SRC = {
  binance: {
    url: (S) => `https://fstream.binance.com/stream?streams=${S.map((s) => `${s.toLowerCase()}usdt@bookTicker/${s.toLowerCase()}usdt@aggTrade`).join("/")}`,
    sub: null,
    parse(m, on) {
      const d = m.data; if (!d || !d.s) return;
      const k = d.s.replace(/USDT$/, "");
      if (d.e === "aggTrade") on.trade(k, +d.p, +d.q, d.m ? -1 : 1, d.T);
      else if (d.b) on.book(k, +d.b, +d.B, +d.a, +d.A);
    },
  },
  okx: {
    url: () => "https://ws.okx.com:8443/ws/v5/public",
    sub: (S) => JSON.stringify({ op: "subscribe", args: S.flatMap((s) => [{ channel: "bbo-tbt", instId: `${s}-USDT-SWAP` }, { channel: "trades", instId: `${s}-USDT-SWAP` }]) }),
    ping: "ping",
    parse(m, on) {
      const a = m.arg; if (!a || !m.data) return;
      const k = a.instId.split("-")[0];
      if (a.channel === "trades") for (const t of m.data) on.trade(k, +t.px, +t.sz, t.side === "buy" ? 1 : -1, +t.ts);
      else for (const b of m.data) if (b.bids?.[0] && b.asks?.[0]) on.book(k, +b.bids[0][0], +b.bids[0][1], +b.asks[0][0], +b.asks[0][1]);
    },
  },
  bybit: {
    url: () => "https://stream.bybit.com/v5/public/linear",
    sub: (S) => JSON.stringify({ op: "subscribe", args: S.flatMap((s) => [`orderbook.1.${s}USDT`, `publicTrade.${s}USDT`]) }),
    ping: JSON.stringify({ op: "ping" }),
    parse(m, on) {
      if (!m.topic || !m.data) return;
      if (m.topic.startsWith("publicTrade")) for (const t of m.data) on.trade(t.s.replace(/USDT$/, ""), +t.p, +t.v, t.S === "Buy" ? 1 : -1, +t.T);
      else { const k = m.data.s.replace(/USDT$/, ""), b = m.data.b?.[0], a = m.data.a?.[0]; on.book(k, b ? +b[0] : null, b ? +b[1] : null, a ? +a[0] : null, a ? +a[1] : null); }
    },
  },
};
const ORDER = ["binance", "okx", "bybit"];

export class Scalper extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx; this.env = env;
    this.S = null; this.cfg = null; this.uid = null; this.ws = null; this.src = null; this.srcI = 0; this.lastMsg = 0; this.cfgAt = 0; this.dirty = 0;
    this.M = {};          // dữ liệu thị trường tạm (không lưu): {k: {bid, ask, bq, aq, sec: {buy, sell}, mids: [], pend: []}}
    this.lastSec = 0; this.diag = { err: [], conn: 0 };
  }
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/ping") { const b = await req.json().catch(() => ({})); await this.boot(b.uid); return Response.json({ ok: true, src: this.src, live: !!this.ws, at: iso(Date.now()) }); }
    return new Response("scalper");
  }
  async boot(uid) {
    if (uid) this.uid = uid;
    if (!this.uid) this.uid = await this.ctx.storage.get("uid");
    else await this.ctx.storage.put("uid", this.uid);
    if (!this.S) this.S = (await this.ctx.storage.get("S")) || null;
    await this.loadCfg(true);
    if (!this.cfg?.enabled) { this.close("bot lướt giây đang tắt"); await this.snapshot(); return; }
    if (!this.ws || Date.now() - this.lastMsg > 15000) await this.connect();
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 10000);
  }
  async loadCfg(force) {
    if (!force && Date.now() - this.cfgAt < 30000) return;
    this.cfgAt = Date.now();
    let raw = null;
    try { const r = await this.env.DB.prepare("SELECT value FROM user_data WHERE user_id = ? AND key = 'scalp'").bind(Number(this.uid)).first(); raw = r ? JSON.parse(r.value) : null; } catch (e) { this.diag.err.push("cfg " + e.message); }
    const c = norm(raw), now = Date.now();
    if (!this.S || (c.reset_at && c.reset_at !== this.S.reset_seen)) { this.S = newState(c, now); this.say(now, `Khởi tạo tài khoản lướt giây trên sàn thử: ${c.capital} USDT`); }
    const symsChanged = this.cfg && this.cfg.syms.join() !== c.syms.join();
    this.cfg = c;
    if (symsChanged && this.ws) { this.close("đổi danh sách coin"); await this.connect(); }
  }
  say(now, m, k = "info") { this.S.log = [...(this.S.log || []).slice(-79), { t: iso(now), k, m }]; }
  close(why) { try { this.ws?.close(1000, why); } catch (e) { /* bỏ qua */ } this.ws = null; }
  async connect() {
    this.close("kết nối lại");
    for (let n = 0; n < ORDER.length; n++) {
      const id = ORDER[(this.srcI + n) % ORDER.length], S = SRC[id];
      try {
        const r = await fetch(S.url(this.cfg.syms), { headers: { Upgrade: "websocket" } });
        const ws = r.webSocket; if (!ws) throw new Error("HTTP " + r.status);
        ws.accept();
        ws.addEventListener("message", (ev) => this.onMsg(id, ev.data));
        ws.addEventListener("close", () => { if (this.ws === ws) { this.ws = null; } });
        ws.addEventListener("error", () => { if (this.ws === ws) { this.ws = null; } });
        if (S.sub) ws.send(S.sub(this.cfg.syms));
        this.ws = ws; this.src = id; this.srcI = (this.srcI + n) % ORDER.length; this.lastMsg = Date.now(); this.diag.conn++;
        this.say(Date.now(), `Kết nối dữ liệu từng mili-giây: ${id} (${this.cfg.syms.join(", ")})`);
        return;
      } catch (e) { this.diag.err = [...this.diag.err.slice(-9), `${id}: ${String(e.message).slice(0, 80)}`]; }
    }
    this.say(Date.now(), "Không kết nối được nguồn dữ liệu nào – thử lại sau 10 giây", "stop");
  }
  async alarm() {
    try {
      await this.loadCfg(false);
      if (!this.cfg?.enabled) { this.close("tắt"); await this.snapshot(); return; }
      if (!this.ws || Date.now() - this.lastMsg > 12000) { if (this.ws) { this.srcI = (this.srcI + 1) % ORDER.length; this.diag.err.push(`${this.src}: im lặng > 12 giây`); } await this.connect(); }
      else if (SRC[this.src]?.ping) { try { this.ws.send(SRC[this.src].ping); } catch (e) { /* bỏ qua */ } }
      await this.snapshot();
    } finally {
      if (this.cfg?.enabled) await this.ctx.storage.setAlarm(Date.now() + 10000);
    }
  }
  // ---------------------------------------------------------------- dữ liệu vào
  onMsg(id, raw) {
    if (raw === "pong" || id !== this.src) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const now = Date.now();
    this.lastMsg = now;
    SRC[id].parse(m, {
      book: (k, b, bq, a, aq) => { const x = this.mk(k); if (b) { x.bid = b; x.bq = bq; } if (a) { x.ask = a; x.aq = aq; } if (x.bid && x.ask) this.onBook(k, x, now); },
      trade: (k, p, q, side, t) => { const x = this.mk(k); if (side > 0) x.sec.buy += q * p; else x.sec.sell += q * p; this.onTrade(k, x, p, q, side, now); },
    });
    const sec = Math.floor(now / 1000);
    if (sec > this.lastSec) { this.lastSec = sec; try { this.second(now); } catch (e) { this.diag.err = [...this.diag.err.slice(-9), "second: " + e.message]; } }
  }
  mk(k) { return (this.M[k] ||= { bid: 0, ask: 0, bq: 0, aq: 0, sec: { buy: 0, sell: 0 }, flow: [], mids: [], pend: [] }); }

  // ---------------------------------------------------------------- mỗi giây: tín hiệu → bộ học → quyết định
  second(now) {
    const c = this.cfg, S = this.S;
    const day = vnDay(now), eqNow = this.equity();
    if (S.day.d !== day) { S.day = { d: day, eq0: eqNow }; if (S.pause?.kind === "day") { S.pause = null; this.say(now, "Sang ngày mới – chạy lại"); } }
    S.peak = Math.max(S.peak, eqNow);
    const m1 = Math.floor(now / 60000);
    if (!S.eq.length || S.eq[S.eq.length - 1][0] < m1) S.eq = [...S.eq.slice(-1440), [m1, r2(eqNow, 2)]];
    const dayPct = (eqNow / S.day.eq0 - 1) * 100;
    if (!S.pause && dayPct <= -c.daily_stop) { S.pause = { kind: "day", why: `lỗ ${dayPct.toFixed(2)}% hôm nay (giới hạn ${c.daily_stop}%)`, until: null }; this.say(now, `⛔ Dừng tới hết ngày: ${S.pause.why}`, "stop"); }
    if (S.pause?.until && now >= S.pause.until) { this.say(now, "Hết giờ nghỉ – đánh giá lại"); S.pause = null; }
    this.live = this.live || {};
    for (const k of c.syms) {
      const x = this.M[k]; if (!x || !x.bid || !x.ask) continue;
      const mid = (x.bid + x.ask) / 2, spread = (x.ask - x.bid) / mid * 1e4;
      x.flow.push([x.sec.buy, x.sec.sell]); x.sec = { buy: 0, sell: 0 }; if (x.flow.length > 60) x.flow.shift();
      x.mids.push(mid); if (x.mids.length > 121) x.mids.shift();
      this.manageTime(k, x, now);
      if (x.mids.length < 20) continue;
      // đặc trưng
      const f5 = x.flow.slice(-5), b5 = f5.reduce((a, q) => a + q[0], 0), s5 = f5.reduce((a, q) => a + q[1], 0), tfi = b5 + s5 > 0 ? (b5 - s5) / (b5 + s5) : 0;
      const obi = x.bq + x.aq > 0 ? (x.bq - x.aq) / (x.bq + x.aq) : 0;
      const M = x.mids, rets = []; for (let i = Math.max(1, M.length - 60); i < M.length; i++) rets.push((M[i] / M[i - 1] - 1) * 1e4);
      const mu = rets.reduce((a, b) => a + b, 0) / rets.length, vol = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, rets.length - 1)) || 0.01;
      const mom5 = (mid / M[Math.max(0, M.length - 6)] - 1) * 1e4, mz = clamp(mom5 / (vol * Math.sqrt(5)), -3, 3) / 3;
      const s = clamp(0.4 * tfi + 0.3 * obi + 0.3 * mz, -1, 1), side = s >= 0 ? 1 : -1, bin = Math.min(NB - 1, Math.floor(Math.abs(s) / BW));
      // bộ học: chốt các mẫu đã đủ thời gian
      const L = (S.L[k] ||= Array.from({ length: NB }, () => HS.map(() => [0, 0, 0])));
      x.pend.push({ t: now, sd: side, b: bin, mid });
      while (x.pend.length && now - x.pend[0].t > (HS[HS.length - 1] + 1) * 1000) x.pend.shift();
      for (const p of x.pend) {
        p.done ||= 0;
        HS.forEach((h, hi) => {
          if (p.done & (1 << hi) || now - p.t < h * 1000) return;
          p.done |= 1 << hi;
          const fwd = p.sd * (mid / p.mid - 1) * 1e4, cell = L[p.b][hi], n = cell[0] + 1, a = 1 / Math.min(n, 5000), d = fwd - cell[1];
          cell[0] = n; cell[1] += a * d; cell[2] = (1 - a) * (cell[2] + a * d * d);
        });
      }
      // quyết định
      // chi phí khứ hồi (bps): taker vào + taker ra + chênh lệch; maker vào ở giá mua/bán tốt nhất + taker ra (không mất chênh lệch, nhưng chỉ khớp khi giá đi ngược về mình)
      const cost = c.mode === "taker" ? 2 * c.fee_t * 100 + spread : (c.fee_m + c.fee_t) * 100;
      let best = null;
      HS.forEach((h, hi) => { if (h > c.hmax) return; const cell = L[bin][hi]; if (cell[0] < c.min_n) return; const net = cell[1] - cost; if (!best || net / Math.sqrt(h) > best.score) best = { h, hi, exp: cell[1], n: cell[0], net, score: net / Math.sqrt(h), sd: Math.sqrt(cell[2]) }; });
      const kk = c.k + (S.kadd || 0);
      const ok = best && best.net >= c.min_net && best.exp >= kk * cost;
      let v = "watch", why;
      if (!best) why = `đang học: ô tín hiệu này mới ${L[bin].reduce((a, q) => Math.max(a, q[0]), 0)}/${c.min_n} mẫu`;
      else why = `lợi thế kỳ vọng ${best.exp.toFixed(2)} bps (giữ ${best.h}s) so với chi phí khứ hồi ${cost.toFixed(2)} bps → ròng sau phí ${best.net >= 0 ? "+" : ""}${best.net.toFixed(2)} bps`;
      if (S.pos[k]) v = "hold";
      else if (S.ord[k]) v = "order";
      else if (S.pause) { v = "pause"; why = `tạm dừng: ${S.pause.why}`; }
      else if (spread > c.spread_max) { v = "skip"; why = `chênh lệch mua/bán ${spread.toFixed(2)} bps > ${c.spread_max} – bỏ qua vì chênh lệch quá rộng`; }
      else if (nearFunding(now)) { v = "skip"; why = "sát giờ funding (±60 giây) – đứng ngoài"; }
      else if (this.tradesLastHour(now) >= c.max_h) { v = "skip"; why = `đã ${c.max_h} lệnh trong 1 giờ – nghỉ`; }
      else if (ok) { v = "go"; this.enter(k, x, side, best, cost, vol, mid, spread, now); }
      else if (best) v = "fee";
      this.live[k] = { mid: r2(mid, 6), spread: r2(spread, 3), s: r2(s, 3), tfi: r2(tfi, 2), obi: r2(obi, 2), mz: r2(mz, 2), vol: r2(vol, 3), bin, side, cost: r2(cost, 2), best: best ? { h: best.h, exp: r2(best.exp, 2), net: r2(best.net, 2), n: best.n } : null, v, why };
    }
    // cầu dao kỷ luật: 50 lệnh gần nhất ròng âm → nghỉ 30 phút + nâng ngưỡng
    const T = S.trades.slice(-50);
    if (!S.pause && T.length >= 50 && T.reduce((a, t) => a + t.net, 0) < 0 && (!S.brk || now - S.brk > 3600e3)) {
      S.brk = now; S.kadd = Math.min(2, (S.kadd || 0) + 0.2);
      S.pause = { kind: "brk", why: `50 lệnh gần nhất ròng ${T.reduce((a, t) => a + t.net, 0).toFixed(1)} bps (âm) – phí đang ăn hết biên lời; nghỉ 30 phút, nâng ngưỡng vào lệnh lên ${(c.k + S.kadd).toFixed(1)}× chi phí khứ hồi`, until: now + 1800e3 };
      this.say(now, `⛔ ${S.pause.why}`, "stop");
    }
  }
  tradesLastHour(now) { let n = 0; for (let i = this.S.trades.length - 1; i >= 0 && now - Date.parse(this.S.trades[i].t1 + "Z") < 3600e3; i--) n++; return n; }

  // ---------------------------------------------------------------- vào / ra lệnh (sàn thử, khớp theo sổ lệnh thật)
  size(c, eq, slb) { return Math.min(eq * c.lev, eq * c.risk / 100 / (slb / 1e4)); }
  enter(k, x, side, best, cost, vol, mid, spread, now) {
    const c = this.cfg, S = this.S, eq = this.equity();
    // bộ học đo kỳ vọng ở ĐÚNG thời điểm h giây → thoát chủ yếu theo thời gian; cắt lỗ chỉ để chặn rủi ro bất thường (4 lần biến động),
    // chốt lời sớm chỉ khi giá chạy gấp đôi kỳ vọng (chốt sớm hơn sẽ cắt mất phần thắng lớn, làm kết quả thật kém hơn kỳ vọng)
    const slb = Math.max(2 * cost, 4 * vol * Math.sqrt(best.h)), tpb = cost + 2 * best.exp;
    const notional = this.size(c, eq, slb); if (notional < 20) return;
    if (c.mode === "maker") {
      const px = side > 0 ? x.bid : x.ask;
      S.ord[k] = { side, px, q: notional / px, queue: side > 0 ? x.bq : x.aq, t: now, h: best.h, slb, tpb, exp: best.exp, cost };
      return;
    }
    const px = side > 0 ? x.ask : x.bid;
    this.open(k, side, px, notional / px, "taker", best, slb, tpb, cost, now);
  }
  open(k, side, px, q, how, best, slb, tpb, cost, now) {
    const c = this.cfg, fee = q * px * (how === "maker" ? c.fee_m : c.fee_t) / 100;
    this.S.cash -= fee;
    this.S.pos[k] = { id: this.S.seq++, side, e: px, q, fee, how, t0: now, h: best.h, sl: px * (1 - side * slb / 1e4), tp: px * (1 + side * tpb / 1e4), exp: best.exp, cost, slb, tpb };
  }
  onTrade(k, x, p, q, side, now) {
    const o = this.S?.ord?.[k];
    if (o) {   // lệnh chờ maker: khớp khi có người khớp xuyên giá / hết hàng chờ phía trước ở đúng giá
      if (o.side > 0 && side < 0) { if (p < o.px) o.queue = 0; else if (p === o.px) o.queue -= q; }
      if (o.side < 0 && side > 0) { if (p > o.px) o.queue = 0; else if (p === o.px) o.queue -= q; }
      if (o.queue <= 0) { delete this.S.ord[k]; this.open(k, o.side, o.px, o.q, "maker", { h: o.h, exp: o.exp }, o.slb, o.tpb, o.cost, now); }
    }
  }
  onBook(k, x, now) {
    const P = this.S?.pos?.[k]; if (!P) return;
    const exitPx = P.side > 0 ? x.bid : x.ask;
    if (P.side > 0 ? exitPx <= P.sl : exitPx >= P.sl) this.close1(k, exitPx, "SL", now);
    else if (P.side > 0 ? exitPx >= P.tp : exitPx <= P.tp) this.close1(k, exitPx, "TP", now);
  }
  manageTime(k, x, now) {
    const o = this.S.ord[k];
    if (o && now - o.t > 3000) delete this.S.ord[k];          // maker chờ quá 3 giây → huỷ
    const P = this.S.pos[k];
    if (P && now - P.t0 >= P.h * 1000) this.close1(k, P.side > 0 ? x.bid : x.ask, "TIME", now);
  }
  close1(k, px, why, now) {
    const c = this.cfg, S = this.S, P = S.pos[k]; if (!P) return;
    const fee = P.q * px * c.fee_t / 100, gross = P.side * P.q * (px - P.e);
    S.cash += gross - fee;
    delete S.pos[k];
    const n0 = P.q * P.e, grossB = gross / n0 * 1e4, feeB = (P.fee + fee) / n0 * 1e4, net = grossB - feeB, usd = gross - fee - P.fee;
    const t = { id: P.id, k, side: P.side, how: P.how, e: r2(P.e, 6), x: r2(px, 6), hold: r2((now - P.t0) / 1000, 1), gross: r2(grossB, 2), fee: r2(feeB, 2), net: r2(net, 2), usd: r2(usd, 3), exp: r2(P.exp, 2), why, t0: iso(P.t0), t1: iso(now) };
    S.trades = [...S.trades.slice(-199), t];
    const st = S.stats; st.n++; st.gross += gross; st.fees += P.fee + fee; st.net += usd; if (usd > 0) st.win++;
  }
  equity() {
    const S = this.S; let e = S.cash;
    for (const [k, P] of Object.entries(S.pos || {})) { const x = this.M[k]; const m = x ? (P.side > 0 ? x.bid : x.ask) : P.e; e += P.side * P.q * (m - P.e); }
    return e;
  }
  // ---------------------------------------------------------------- lưu & gửi lên web
  async snapshot() {
    if (!this.S || !this.uid) return;
    const now = Date.now(), S = this.S, eq = this.equity(), T = S.trades, last = T.slice(-50);
    const out = { v: 1, at: iso(now), enabled: !!this.cfg?.enabled, src: this.src, live_ws: !!this.ws, last_msg: this.lastMsg ? iso(this.lastMsg) : null, diag: { ...this.diag, err: this.diag.err.slice(-6) },
      eq: r2(eq, 2), start: S.start, peak: r2(S.peak, 2), day: S.day, pause: S.pause, kadd: S.kadd, stats: { ...S.stats, gross: r2(S.stats.gross, 2), fees: r2(S.stats.fees, 2), net: r2(S.stats.net, 2) },
      last50: last.length ? { n: last.length, net: r2(last.reduce((a, t) => a + t.net, 0) / last.length, 2), gross: r2(last.reduce((a, t) => a + t.gross, 0) / last.length, 2), fee: r2(last.reduce((a, t) => a + t.fee, 0) / last.length, 2), win: r2(last.filter((t) => t.net > 0).length / last.length * 100, 0) } : null,
      live: this.live || {}, pos: S.pos, ord: S.ord, trades: T.slice(-60), L: Object.fromEntries(Object.entries(S.L).map(([k, L]) => [k, L.map((row) => row.map((q) => [q[0], r2(q[1], 2), r2(Math.sqrt(q[2]), 2)]))])),
      HS, BW, eqs: S.eq.slice(-720), log: S.log.slice(-40), cfg: this.cfg };
    try {
      await this.env.DB.prepare("INSERT INTO user_data(user_id, key, value, updated_at) VALUES(?, 'scalpstate', ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(Number(this.uid), JSON.stringify(out), new Date(now).toISOString()).run();
    } catch (e) { this.diag.err = [...this.diag.err.slice(-9), "D1 " + e.message]; }
    if (++this.dirty % 3 === 0 || !this.cfg?.enabled) await this.ctx.storage.put("S", S);
  }
}
const nearFunding = (now) => { const s = Math.floor(now / 1000) % 28800; return s < 60 || s > 28800 - 60; };

// gọi từ cron mỗi phút: đánh thức bot lướt giây của những người đang bật
export async function scalpPing(env, canBot) {
  if (!env.SCALP || !env.DB) return { skip: true };
  const { results } = await env.DB.prepare("SELECT d.user_id, d.value, u.role, u.plan, u.plan_until FROM user_data d JOIN users u ON u.id = d.user_id WHERE u.status = 'active' AND d.key = 'scalp'").all();
  let n = 0;
  for (const r of results || []) {
    let c = null; try { c = JSON.parse(r.value); } catch (e) { continue; }
    if (!c?.enabled) continue;
    if (!canBot(r)) continue;
    const stub = env.SCALP.get(env.SCALP.idFromName("u" + r.user_id), { locationHint: "apac" });
    try { await stub.fetch("https://scalp/ping", { method: "POST", body: JSON.stringify({ uid: r.user_id }) }); n++; } catch (e) { console.log("scalp ping", r.user_id, e.message); }
  }
  return { scalpers: n };
}
