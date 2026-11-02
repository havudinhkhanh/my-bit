// 🧪 PHÒNG THỬ NGHIỆM (sàn thử, tiền ảo – KHÔNG đặt lệnh thật): 2 phương pháp giữ nhiều ngày, chạy song song với Bắt râu sập
// trên CÙNG tài sản sàn thử (vốn lấy từ S.cash, lời/lỗ & phí & funding vào thẳng tài sản; ký quỹ x1 tính vào vốn đang dùng).
// Riêng cầu dao "lỗ trong ngày" của lướt giây / Bắt râu sập KHÔNG tính phần lời/lỗ ĐANG MỞ của 2 phương pháp này (giữ nhiều ngày, dao động lớn).
// Kiểm chứng: research/round10.py + r10_analyze.py + r10_port.py (nến 1 giờ Binance futures 01/2022–10/2026, 918 mã kể cả mã đã huỷ niêm yết).
//   list – SHORT COIN MỚI NIÊM YẾT futures: 24 giờ sau giờ niêm yết (onboardDate) → Short theo giá đánh dấu, giữ 14 ngày, KHÔNG cắt lỗ,
//          ký quỹ cô lập x1 (giá ×2 = mất trắng phần tiền của lệnh). 10% vốn ảo/lệnh, tối đa 5 lệnh cùng lúc.
//          Quá khứ: 718 lệnh, thắng 65%, TB +5,7%/lệnh sau phí & funding; danh mục 5 lệnh ~+41%/năm, sụt tối đa 49%.
//   pump – SHORT COIN VỪA BƠM: 00:00 UTC, coin tăng ≥ 100% trong 24 giờ & khối lượng 24h ≥ 10 triệu USD → Short, giữ 7 ngày, không cắt lỗ, x1.
//          5% vốn ảo/lệnh, tối đa 5 lệnh. Quá khứ: 111 lệnh, thắng 74%, TB +15%/lệnh; ~+38%/năm, sụt tối đa 16% (ít lệnh, dồn vào 2025–26).
// Phí khứ hồi 0,30% (0,15% mỗi chiều) + funding thật mỗi kỳ chốt. Giá & funding: /fapi/v1/premiumIndex (1 lần gọi cho mọi hợp đồng, mỗi phút).
// Chỉ chạy ở máy chủ riêng (Binance chặn Cloudflare).
const FAPI = "https://fapi.binance.com/fapi/v1";
const iso = (t) => new Date(t).toISOString().slice(0, 19);
const r2 = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);
const FEE = 0.15;     // % mỗi chiều
export const SW = {
  list: { name: "Short coin mới niêm yết", sz: 10, max: 5, hold: 14 * 24, rule: "24 giờ sau khi niêm yết futures → Short, giữ 14 ngày, không cắt lỗ, x1, 10% tài sản sàn thử/lệnh, tối đa 5 lệnh" },
  pump: { name: "Short coin vừa bơm ≥ 100%", sz: 5, max: 5, hold: 7 * 24, rule: "7:00 sáng (00:00 UTC) coin tăng ≥ 100%/24h, khối lượng ≥ 10 triệu USD → Short, giữ 7 ngày, không cắt lỗ, x1, 5% tài sản sàn thử/lệnh, tối đa 5 lệnh" },
};

export class SwingLab {
  constructor(core) { this.core = core; this.busy = false; this.pxAt = 0; this.obAt = 0; this.px = {}; this.ob = {}; }
  st() {
    const S = this.core.S; S.sw ||= { v: 2 };
    if (S.sw.v !== 2) { for (const k of Object.keys(SW)) if (S.sw[k]) { delete S.sw[k].cash; S.sw[k].pos = {}; } S.sw.v = 2; }     // bản cũ (sổ riêng) → dùng chung tài sản sàn thử
    for (const k of Object.keys(SW)) S.sw[k] ||= { pos: {}, hist: [], st: { n: 0, win: 0, pnl: 0, fee: 0, fund: 0, skip: 0 }, seen: {} };
    return S.sw;
  }
  get(u) { return fetch(u, { signal: AbortSignal.timeout(15000) }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${u.split("/").pop()}`); return r.json(); }); }
  // lời/lỗ đang mở & ký quỹ (x1 = giá trị lệnh) của mọi lệnh thử nghiệm – ScalpCore.equity() / used() cộng vào
  upnl() { let u = 0; const W = this.core.S?.sw; if (!W) return 0; for (const k of Object.keys(SW)) for (const P of Object.values(W[k]?.pos || {})) u += P.side * P.q * ((this.px[P.sym]?.m || P.last || P.e) - P.e); return u; }
  margin() { let m = 0; const W = this.core.S?.sw; if (!W) return 0; for (const k of Object.keys(SW)) for (const P of Object.values(W[k]?.pos || {})) m += P.N; return m; }
  say(m, kind = "info") { try { this.core.say(Date.now(), `🧪 ${m}`, kind); } catch (e) { /* bỏ qua */ } }
  note(key, title, body) { try { this.core.note(`sw:${key}`, 2, title, body); } catch (e) { /* bỏ qua */ } }
  async tick(now = Date.now()) {
    if (this.busy || this.core.where !== "vps") return; this.busy = true;
    try {
      const W = this.st();
      if (now - this.pxAt >= 60e3) {       // giá đánh dấu + funding mọi hợp đồng
        const L = await this.get(`${FAPI}/premiumIndex`); const P = {};
        for (const x of L || []) P[x.symbol] = { m: +x.markPrice, r: +x.lastFundingRate || 0, next: +x.nextFundingTime || 0 };
        if (Object.keys(P).length) { this.px = P; this.pxAt = now; }
      }
      if (now - this.obAt >= 30 * 60e3) {   // giờ niêm yết của mọi hợp đồng USDT vĩnh cửu
        const I = await this.get(`${FAPI}/exchangeInfo`); const O = {};
        for (const s of I.symbols || []) if (s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING") O[s.symbol] = +s.onboardDate || 0;
        if (Object.keys(O).length) { this.ob = O; this.obAt = now; }
      }
      if (!Object.keys(this.px).length) return;
      for (const k of Object.keys(SW)) this.manage(k, W[k], now);
      // list: 24–30 giờ sau giờ niêm yết (lần đầu chạy không vào bù coin đã quá 30 giờ)
      for (const [sym, ob] of Object.entries(this.ob)) {
        const age = now - ob;
        if (ob > 0 && age >= 24 * 3600e3 && age < 30 * 3600e3 && !W.list.seen[sym]) { W.list.seen[sym] = iso(now); this.open("list", W.list, sym, now, `niêm yết ${iso(ob).replace("T", " ")} UTC`); }
      }
      // pump: 00:00–00:10 UTC, mỗi ngày 1 lần
      const d = new Date(now), day = d.toISOString().slice(0, 10);
      if (d.getUTCHours() === 0 && d.getUTCMinutes() < 10 && W.pump.day !== day) {
        W.pump.day = day;
        const T = await this.get(`${FAPI}/ticker/24hr`);
        const C = (T || []).filter((x) => x.symbol.endsWith("USDT") && this.ob[x.symbol] && +x.priceChangePercent >= 100 && +x.quoteVolume >= 10e6).sort((a, b) => +b.priceChangePercent - +a.priceChangePercent);
        if (!C.length) this.say(`Short coin vừa bơm: ${day} không có coin nào tăng ≥ 100%/24h – không vào lệnh`);
        for (const x of C) {
          const why = `24h +${(+x.priceChangePercent).toFixed(0)}% · khối lượng ${(+x.quoteVolume / 1e6).toFixed(0)} triệu USD`;
          this.open("pump", W.pump, x.symbol, now, why);
          try { this.core.io.onSwing?.({ k: "pump", sym: x.symbol, px: this.px[x.symbol]?.m || +x.lastPrice, hold: SW.pump.hold, why, chg: +x.priceChangePercent }); } catch (e) { this.core.err("thử nghiệm → tiền thật: " + e.message); }
        }
      }
      // seen: chỉ giữ 60 ngày
      for (const [s, t] of Object.entries(W.list.seen)) if (now - Date.parse(t + "Z") > 60 * 864e5) delete W.list.seen[s];
    } catch (e) { this.core.err("thử nghiệm: " + e.message); } finally { this.busy = false; }
  }
  open(k, B, sym, now, why) {
    const R = SW[k], p = this.px[sym]?.m, base = sym.replace(/USDT$/, "");
    if (!(p > 0)) { this.say(`${R.name}: ${base} chưa có giá – bỏ qua`); B.st.skip++; return; }
    if (Object.keys(B.pos).length >= R.max) { this.say(`${R.name}: ${base} (${why}) – đã đủ ${R.max} lệnh, bỏ qua`); B.st.skip++; return; }
    if (Object.values(B.pos).some((P) => P.sym === sym)) { B.st.skip++; return; }
    const S = this.core.S, eq = this.core.equity(), N = eq * R.sz / 100, q = N / p, fee = N * FEE / 100;
    if (eq - this.core.used() < N) { this.say(`${R.name}: ${base} – tài sản sàn thử còn trống không đủ ${r2(N, 2)} USDT, bỏ qua`); B.st.skip++; return; }
    const id = `${k}${Date.now() % 1e9}`;
    S.cash -= fee; B.st.fee += fee;
    B.pos[id] = { id, sym, side: -1, e: p, q, N: r2(N, 2), t0: iso(now), t1: iso(now + R.hold * 3600e3), why, fee, fund: 0, fnext: this.px[sym]?.next || 0, frate: this.px[sym]?.r || 0, hi: p, lo: p };
    this.say(`${R.name}: SHORT ${base} ${r2(N, 2)} USDT @ ${+p.toPrecision(6)} (${why}) · giữ tới ${iso(now + R.hold * 3600e3).replace("T", " ")} UTC`);
    this.note(`o:${id}`, `🧪 Thử nghiệm: Short ${base}`, `${R.name} · ${why} · ${r2(N, 2)} USDT ảo @ ${+p.toPrecision(6)}, giữ ${R.hold / 24} ngày, không cắt lỗ.`);
  }
  manage(k, B, now) {
    for (const P of Object.values(B.pos)) {
      const x = this.px[P.sym];
      if (!x) {      // hợp đồng bị huỷ niêm yết / ngừng giao dịch → đóng ở giá cuối biết được
        if (now - this.pxAt < 120e3 && Object.keys(this.px).length > 100) this.close(k, B, P, P.last || P.e, "DELIST", now);
        continue;
      }
      const m = x.m; P.last = m; P.hi = Math.max(P.hi, m); P.lo = Math.min(P.lo, m);
      if (P.fnext && now >= P.fnext) {      // kỳ chốt funding: Short nhận khi funding dương, trả khi âm
        const amt = -P.side * (P.frate || 0) * P.q * m; this.core.S.cash += amt; P.fund += amt; B.st.fund += amt; P.fnext = x.next > now ? x.next : 0; P.frate = x.r;
      } else if (!P.fnext && x.next > now) { P.fnext = x.next; P.frate = x.r; }
      else if (x.next === P.fnext) P.frate = x.r;
      if (P.side < 0 && m >= 2 * P.e) this.close(k, B, P, 2 * P.e, "LIQ", now);           // x1: giá ×2 → mất trắng phần ký quỹ
      else if (now >= Date.parse(P.t1 + "Z")) this.close(k, B, P, m, "TIME", now);
    }
  }
  close(k, B, P, px, why, now) {
    const R = SW[k], gross = P.side * P.q * (px - P.e), fee = P.q * px * FEE / 100;
    this.core.S.cash += gross - fee; B.st.fee += fee;
    const net = gross - P.fee - fee + P.fund, pct = net / P.N * 100;
    B.st.n++; B.st.pnl += net; if (net > 0) B.st.win++;
    B.hist = [...B.hist.slice(-199), { sym: P.sym, side: P.side, e: P.e, x: px, N: P.N, t0: P.t0, t2: iso(now), why, net: r2(net, 3), pct: r2(pct, 2), fund: r2(P.fund, 3), fee: r2(P.fee + fee, 3), hi: P.hi, lo: P.lo, note: P.why }];
    delete B.pos[P.id];
    const base = P.sym.replace(/USDT$/, ""), wl = { TIME: "hết giờ giữ", LIQ: "giá ×2 – mất trắng phần lệnh (x1)", DELIST: "hợp đồng ngừng giao dịch" }[why] || why;
    this.say(`${R.name}: đóng ${base} – ${wl}: ${net >= 0 ? "+" : ""}${r2(net, 2)} USDT (${pct >= 0 ? "+" : ""}${r2(pct, 1)}%)`, net >= 0 ? "win" : "loss");
    this.note(`c:${P.id}`, `🧪 Thử nghiệm: đóng ${base} ${pct >= 0 ? "+" : ""}${r2(pct, 1)}%`, `${R.name} · ${wl} · ${net >= 0 ? "+" : ""}${r2(net, 2)} USDT ảo (funding ${r2(P.fund, 2)}).`);
  }
  out() {
    const W = this.core.S?.sw; if (!W) return null;
    const o = { at: this.pxAt ? iso(this.pxAt) : null, shared: true, on: this.core.where === "vps", upnl: r2(this.upnl(), 2), margin: r2(this.margin(), 2) };
    for (const k of Object.keys(SW)) {
      const B = W[k]; if (!B) continue;
      o[k] = { ...SW[k], st: { ...B.st, pnl: r2(B.st.pnl, 2), fee: r2(B.st.fee, 2), fund: r2(B.st.fund, 2) },
        pos: Object.values(B.pos).map((P) => { const m = this.px[P.sym]?.m || P.e, u = P.side * P.q * (m - P.e); return { ...P, m, upnl: r2(u + P.fund - P.fee, 3), pct: r2((u + P.fund - P.fee) / P.N * 100, 2) }; }),
        hist: B.hist.slice(-60), day: B.day || null };
    }
    return o;
  }
}
