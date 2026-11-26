// 🔬 DANH MỤC PHÒNG THỬ NGHIỆM trên SÀN THỬ (tiền ảo – KHÔNG đặt lệnh thật) – Jason 27/11/2026:
// "phương pháp nào kiểm chứng có lời là phải có công tắc sàn thử / tiền thật ngay, không cần nhắc".
// Phòng thử nghiệm (research/lab.py, chạy trên GitHub mỗi ngày) tính sẵn TỈ TRỌNG MỤC TIÊU của từng phương pháp cho ngày kế tiếp → site/lab_targets.json:
//   { day, asof, m: { <id>: { name, w: { BTCUSDT: 0.06, ETHUSDT: -0.05, … }, gross, ok } } }   (w > 0 = Long, < 0 = Short, tổng |w| ≤ 1)
// Máy này đọc tệp đó 10 phút/lần; phương pháp nào anh bật 🧪 (cfg.lx[id].paper) thì giữ đúng danh mục ấy bằng tiền ảo:
//   vốn mỗi phương pháp = sz % tài sản sàn thử (mặc định 10%), mỗi mã = w × vốn, đổi danh mục khi có mục tiêu của ngày mới
//   (đóng mã rời danh mục / đổi chiều, mở mã mới, chỉnh cỡ khi lệch > 20%). Phí + trượt 0,08% trên phần giao dịch, funding thật mỗi kỳ, ký quỹ x1.
// → thêm phương pháp mới ở phòng thử nghiệm KHÔNG cần viết thêm mã ở đây. Tiền thật: scalper/live.mjs (lxSync) – công tắc riêng cfg.lx[id].live.
// Dùng chung tài sản sàn thử (S.cash) như 🧪 thử nghiệm; giá đánh dấu + funding lấy từ SwingLab (premiumIndex mỗi phút). Chỉ chạy ở máy chủ riêng.
const iso = (t) => new Date(t).toISOString().slice(0, 19);
const r2 = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);
const FEE = 0.08;     // % trên giá trị giao dịch, mỗi chiều
const clamp = (v, a, b, d) => { const n = +v; return Number.isFinite(n) && n > 0 ? Math.max(a, Math.min(b, n)) : d; };
export const LXDEF = { sz: 10, lsz: 100 };      // sz: % tài sản sàn thử cho mỗi phương pháp · lsz: % số dư Binance (tổng vị thế mục tiêu) cho tiền thật
export const LXW = 0.03;      // tiền thật: chỉ vào mã có |tỉ trọng| ≥ 3% (mã nhỏ hơn không đủ lệnh nhỏ nhất của sàn)
export const lxStale = (T, now) => !T?.day || now - Date.parse(T.day + "T00:00:00Z") > 4 * 864e5;      // danh mục mục tiêu quá 4 ngày tuổi = phòng thử nghiệm đang hỏng → không theo nữa
export const lxR = (cfg, k) => { const x = cfg?.lx?.[k] || {}; return { paper: !!x.paper, live: !!x.live, sz: clamp(x.sz, 1, 50, LXDEF.sz), lsz: clamp(x.lsz, 10, 300, LXDEF.lsz) }; };

export class LabPort {
  constructor(core) { this.core = core; this.busy = false; this.tgAt = 0; this.T = null; this.err = ""; }
  st() { const S = this.core.S; S.lx ||= { v: 1, m: {} }; return S.lx; }
  B(k) { const W = this.st(); return (W.m[k] ||= { pos: {}, hist: [], st: { n: 0, win: 0, pnl: 0, fee: 0, fund: 0 }, id: null, cap: 0 }); }
  mk(sym) { return this.core.sw?.px?.[sym] || null; }
  all() { const W = this.core.S?.lx?.m || {}; return Object.values(W).flatMap((B) => Object.values(B.pos || {})); }
  upnl() { let u = 0; for (const P of this.all()) u += P.side * P.q * ((this.mk(P.sym)?.m || P.last || P.e) - P.e); return u; }
  margin() { let m = 0; for (const P of this.all()) m += P.q * P.e; return m; }
  say(m, kind = "info") { try { this.core.say(Date.now(), `🔬 ${m}`, kind); } catch (e) { /* bỏ qua */ } }
  async load(now) {
    const url = this.core.io?.labUrl; this.tgAt = now; if (!url) return;
    const r = await fetch(`${url}?t=${Math.floor(now / 6e5)}`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json(); if (!j || j.v !== 1 || !j.m || !j.day) throw new Error("tệp mục tiêu sai khuôn");
    const fresh = !this.T || this.T.day !== j.day || this.T.at !== j.at; this.T = j; this.err = "";
    if (fresh) { try { this.core.io?.onLab?.(j); } catch (e) { this.core.err("phòng thử nghiệm → tiền thật: " + e.message); } }
  }
  async tick(now = Date.now()) {
    if (this.busy || this.core.where !== "vps") return; this.busy = true;
    try {
      if (now - this.tgAt >= 10 * 60e3) await this.load(now).catch((e) => { this.err = e.message; });
      this.run(now);
    } catch (e) { this.core.err("phòng thử nghiệm: " + e.message); } finally { this.busy = false; }
  }
  run(now) {
    const W = this.st(), T = this.T; if (Object.keys(this.core.sw?.px || {}).length < 50) return;      // chưa có giá đánh dấu
    for (const k of new Set([...Object.keys(W.m), ...Object.keys(T?.m || {})])) {
      const c = lxR(this.core.cfg, k), B = this.B(k), tg = T?.m?.[k];
      this.mark(k, B, now);
      if (!c.paper) { if (Object.keys(B.pos).length) this.flat(k, B, tg?.name || k, "OFF", now); B.id = null; continue; }
      if (lxStale(T, now)) { if (Object.keys(B.pos).length) this.flat(k, B, tg?.name || k, "STALE", now); B.id = null; continue; }      // phòng thử nghiệm ngừng công bố > 4 ngày → không giữ danh mục cũ
      if (!tg || !tg.w || B.id === T.day || this.core.cfg.pz_on) continue;      // đã theo mục tiêu ngày này / anh đang tạm dừng bot → không đổi danh mục
      this.rebalance(k, B, tg, c, T.day, now);
    }
  }
  // funding mỗi kỳ chốt, hợp đồng ngừng giao dịch, Short x1 giá ×2 = mất trắng phần lệnh
  mark(k, B, now) {
    for (const P of Object.values(B.pos)) {
      const x = this.mk(P.sym);
      if (!x) { if (now - (this.core.sw?.pxAt || 0) < 120e3) this.set(k, B, P.sym, 0, P.last || P.e, "DELIST", now); continue; }
      const m = x.m; P.last = m;
      if (P.fnext && now >= P.fnext) { const amt = -P.side * (P.frate || 0) * P.q * m; this.core.S.cash += amt; P.fund += amt; B.st.fund += amt; P.fnext = x.next > now ? x.next : 0; P.frate = x.r; }
      else if (!P.fnext && x.next > now) { P.fnext = x.next; P.frate = x.r; }
      else if (x.next === P.fnext) P.frate = x.r;
      if (P.side < 0 && m >= 2 * P.e) this.set(k, B, P.sym, 0, 2 * P.e, "LIQ", now);
    }
  }
  rebalance(k, B, tg, c, day, now) {
    const cap = this.core.equity() * c.sz / 100; if (!(cap > 0)) return; B.cap = r2(cap, 2);
    const want = {}; for (const [sym, w] of Object.entries(tg.w)) { const m = this.mk(sym)?.m; if (m > 0 && Number.isFinite(+w) && w) want[sym] = w * cap; }
    let nc = 0, no = 0, na = 0;
    for (const P of Object.values(B.pos)) { const n = want[P.sym]; if (!n || Math.sign(n) !== P.side) { this.set(k, B, P.sym, 0, this.mk(P.sym)?.m || P.last || P.e, "REBAL", now); nc++; } }
    for (const [sym, n] of Object.entries(want)) {
      const P = B.pos[sym], m = this.mk(sym).m, cur = P ? P.q * m : 0, tgN = Math.abs(n);
      if (!P) { this.set(k, B, sym, n, m, "REBAL", now); no++; } else if (Math.abs(tgN - cur) > 0.2 * Math.max(tgN, cur)) { this.set(k, B, sym, n, m, "REBAL", now); na++; }
    }
    B.id = day;
    const L = Object.values(B.pos), g = L.reduce((a, P) => a + P.q * (P.last || P.e), 0);
    this.say(`${tg.name}: theo danh mục ngày ${day} – ${L.filter((P) => P.side > 0).length} Long / ${L.filter((P) => P.side < 0).length} Short, ${r2(g, 2)} USDT ảo (mở ${no}, đóng ${nc}, chỉnh ${na})`);
  }
  // đưa vị thế của 1 mã về giá trị (có dấu) n ở giá m: mở / thêm / bớt / đóng
  set(k, B, sym, n, m, why, now) {
    const S = this.core.S, P = B.pos[sym], x = this.mk(sym), side = Math.sign(n), qT = m > 0 ? Math.abs(n) / m : 0;
    if (!P) {
      if (!(qT > 0)) return; const fee = qT * m * FEE / 100; S.cash -= fee; B.st.fee += fee;
      B.pos[sym] = { sym, side, q: qT, e: m, t0: iso(now), fee, fund: 0, real: 0, fnext: x?.next > now ? x.next : 0, frate: x?.r || 0, last: m }; return;
    }
    if (qT > P.q && side === P.side) { const dq = qT - P.q, fee = dq * m * FEE / 100; S.cash -= fee; B.st.fee += fee; P.fee += fee; P.e = (P.e * P.q + m * dq) / qT; P.q = qT; return; }
    const dq = Math.min(P.q, P.q - (side === P.side ? qT : 0)), gross = P.side * dq * (m - P.e), fee = dq * m * FEE / 100;
    S.cash += gross - fee; B.st.fee += fee; P.fee += fee; P.real += gross; P.q -= dq;
    if (P.q > 1e-12) return;
    const net = P.real - P.fee + P.fund, N0 = P.e * dq || 1;
    B.st.n++; B.st.pnl += net; if (net > 0) B.st.win++;
    B.hist = [...B.hist.slice(-119), { sym, side: P.side, e: P.e, x: m, t0: P.t0, t2: iso(now), why, net: r2(net, 3), pct: r2(net / N0 * 100, 2), fund: r2(P.fund, 3), fee: r2(P.fee, 3) }];
    delete B.pos[sym];
  }
  flat(k, B, name, why, now) { for (const P of Object.values(B.pos)) this.set(k, B, P.sym, 0, this.mk(P.sym)?.m || P.last || P.e, why, now); this.say(`${name}: ${why === "OFF" ? "anh tắt trên sàn thử" : why === "STALE" ? "phòng thử nghiệm chưa công bố danh mục mới quá 4 ngày" : why} – đã đóng hết vị thế ảo`, why === "STALE" ? "warn" : "info"); }
  out() {
    const W = this.core.S?.lx; if (!W) return null; const T = this.T;
    const o = { on: this.core.where === "vps", at: T?.at || null, asof: T?.asof || null, day: T?.day || null, err: this.err || null, WMIN: LXW, upnl: r2(this.upnl(), 2), margin: r2(this.margin(), 2), DEF: LXDEF, m: {} };
    for (const k of new Set([...Object.keys(W.m), ...Object.keys(T?.m || {})])) {
      const B = W.m[k] || { pos: {}, hist: [], st: { n: 0, win: 0, pnl: 0, fee: 0, fund: 0 } }, tg = T?.m?.[k], c = lxR(this.core.cfg, k);
      const pos = Object.values(B.pos).map((P) => { const m = this.mk(P.sym)?.m || P.last || P.e, u = P.side * P.q * (m - P.e) + P.real + P.fund - P.fee; return { sym: P.sym, side: P.side, q: P.q, e: P.e, m, N: r2(P.q * m, 2), upnl: r2(u, 3), pct: r2(u / (P.q * P.e || 1) * 100, 2), t0: P.t0 }; }).sort((a, b) => b.N - a.N);
      o.m[k] = { name: tg?.name || k, ...c, tg: tg ? { n: Object.keys(tg.w || {}).length, nl: Object.values(tg.w || {}).filter((w) => Math.abs(w) >= LXW).length, gross: tg.gross, ok: !!tg.ok, stale: lxStale(T, Date.now()) } : null, id: B.id || null, cap: B.cap || 0,
        st: { ...B.st, pnl: r2(B.st.pnl, 2), fee: r2(B.st.fee, 2), fund: r2(B.st.fund, 2) }, n: pos.length, gross: r2(pos.reduce((a, p) => a + p.N, 0), 2), upnl: r2(pos.reduce((a, p) => a + p.upnl, 0), 2), pos: pos.slice(0, 60), hist: (B.hist || []).slice(-40) };
    }
    return o;
  }
}
