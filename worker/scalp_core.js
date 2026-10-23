// BOT LƯỚT GIÂY (scalping) – bản quét TOÀN THỊ TRƯỜNG: mọi cặp USDT spot + mọi hợp đồng vĩnh cửu USDT (futures),
// chạy liên tục trên Cloudflare Durable Object, nghe sổ lệnh + khớp lệnh qua WebSocket, đánh giá lại MỖI GIÂY trên mọi thị trường,
// rồi CHỈ chọn những cơ hội mà lợi thế đo được lớn hơn phí. Sàn thử: tiền giả, giá & khớp lệnh thật, phí theo mức anh nhập (mặc định phí Binance thường).
//
// Ý tưởng:
//   - Mỗi giây, mỗi thị trường: tín hiệu s = 0,4 × dòng lệnh chủ động 5 giây + 0,3 × lệch sổ lệnh + 0,3 × đà giá 5 giây (chuẩn hoá theo biến động).
//   - Bộ học GỘP theo nhóm (futures/spot × 4 hạng thanh khoản): đo giá đi bao nhiêu sau 2/5/15/30/60 giây theo hướng tín hiệu, tính bằng
//     ĐƠN VỊ BIẾN ĐỘNG của chính coin đó (để coin to/nhỏ học chung được). Kỳ vọng của một coin = kỳ vọng nhóm × biến động coin,
//     co dần về số liệu riêng của coin khi coin đó có đủ mẫu.
//   - Chi phí khứ hồi: taker = 2 × phí taker + chênh lệch mua/bán; maker = phí maker + phí taker. Spot phí cao hơn futures và chỉ được Long.
//   - Mỗi giây gom các ứng viên đạt chuẩn trên TOÀN thị trường, chỉ vào TỐI ĐA 1 lệnh tốt nhất (không phải giây nào cũng vào),
//     giới hạn số vị thế mở, số lệnh/giờ, nghỉ sau khi đóng lệnh trên cùng coin.
//   - Cầu dao: lỗ trong ngày, 50 lệnh gần nhất ròng âm → nghỉ 30 phút + nâng ngưỡng, chênh lệch quá rộng, sát giờ funding.
// Nguồn dữ liệu: trên Cloudflare – futures Bybit → OKX, spot Binance → OKX → Bybit (Binance futures chặn máy chủ Cloudflare);
//                trên máy chủ riêng (VPS) – Binance futures + Binance spot trực tiếp, các sàn khác dự phòng.
// File này là LÕI dùng chung: Cloudflare Durable Object (worker/scalp.js) và chương trình chạy trên VPS (scalper/runner.mjs)
// đều tạo ScalpCore với bộ I/O riêng: io = { kv, readCfg(uid), writeState(uid, out), openWS(url), where: "cf" | "vps", ord }.

export const SCALP_DEF = { enabled: false, capital: 1000, fut: true, spot: true, min_vol: 2, max_mk: 800, lev: 5, risk: 0.25, max_pos: 6, mode: "taker",
  fee_m: 0.02, fee_t: 0.05, fee_ms: 0.1, fee_ts: 0.1, min_net: 1.0, k: 1.3, min_n: 300, warm: 60, hmax: 60, cool: 20, daily_stop: 3, max_h: 120, spread_max: 10 };
const HS = [2, 5, 15, 30, 60, 120, 180, 240, 300];      // các mốc thời gian giữ (giây) bộ học đo – giữ tối đa tới 5 phút
const NB = 6, BW = 0.15, N0 = 150;
const TIERS = [500, 50, 5];                  // triệu USD khối lượng 24h: ≥500 → hạng 0, ≥50 → 1, ≥5 → 2, còn lại 3
const STABLE = new Set(["USDC", "USDT", "FDUSD", "TUSD", "DAI", "USDE", "USDD", "PYUSD", "BUSD", "EUR", "EURI", "AEUR", "USD1", "USDP", "USTC", "RLUSD", "XUSD", "BFUSD", "USDS", "GUSD"]);
const iso = (t) => new Date(t).toISOString().slice(0, 23);
const vnDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r2 = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url) => fetch(url, { signal: AbortSignal.timeout(15000) });   // REST: không bao giờ chờ quá 15 giây (tránh treo cả vòng lặp)
const tierOf = (qv) => (qv >= TIERS[0] ? 0 : qv >= TIERS[1] ? 1 : qv >= TIERS[2] ? 2 : 3);
const newCell = () => Array.from({ length: NB }, () => HS.map(() => [0, 0, 0]));
const fit = (L, w) => { for (const row of L) while (row.length < HS.length) row.push(Array(w).fill(0)); return L; };   // bảng học cũ ít mốc hơn → thêm cột trống

function norm(c) {
  c = { ...SCALP_DEF, ...(c || {}) };
  const n = (k, a, b) => (c[k] = clamp(Number.isFinite(+c[k]) ? +c[k] : SCALP_DEF[k], a, b));
  n("capital", 50, 1e7); n("min_vol", 0, 1e4); n("max_mk", 10, 1200); n("lev", 1, 20); n("risk", 0.02, 1); n("max_pos", 1, 30);
  n("fee_m", -0.02, 0.3); n("fee_t", 0, 0.3); n("fee_ms", -0.02, 0.5); n("fee_ts", 0, 0.5); n("min_net", 0, 50); n("k", 1, 5); n("min_n", 50, 20000);
  n("hmax", 2, 300); n("warm", 0, 1440); n("cool", 0, 600); n("daily_stop", 0.5, 20); n("max_h", 1, 2000); n("spread_max", 0.2, 100);
  c.mode = c.mode === "maker" ? "maker" : "taker"; c.fut = c.fut !== false; c.spot = c.spot !== false;
  c.where = c.where === "vps" ? "vps" : "cf";
  if (!c.fut && !c.spot) c.fut = true;
  return c;
}
function newState(c, now) {
  return { v: 2, start: c.capital, cash: c.capital, peak: c.capital, day: { d: vnDay(now), eq0: c.capital }, pos: {}, ord: {}, trades: [], LP: {}, eq: [], log: [], seq: 1,
    pause: null, kadd: 0, cool: {}, stats: { n: 0, gross: 0, fees: 0, net: 0, win: 0 }, by: { F: { n: 0, net: 0, fees: 0, win: 0 }, S: { n: 0, net: 0, fees: 0, win: 0 } },
    created: iso(now), reset_seen: c.reset_at || null };
}

// ---------------------------------------------------------------- nguồn dữ liệu: danh sách thị trường (REST) + luồng giá (WebSocket)
// mã nội bộ: "BTC:F" = hợp đồng vĩnh cửu BTC/USDT, "BTC:S" = spot BTC/USDT
const SRC = {
  okx: {
    async universe(t) {
      const it = t === "F" ? "SWAP" : "SPOT";
      const [ri, rt] = await Promise.all([get(`https://www.okx.com/api/v5/public/instruments?instType=${it}`), get(`https://www.okx.com/api/v5/market/tickers?instType=${it}`)]);
      if (!ri.ok || !rt.ok) throw new Error(`HTTP ${ri.status}/${rt.status}`);
      const I = (await ri.json()).data || [], T = new Map(((await rt.json()).data || []).map((x) => [x.instId, x]));
      const out = [];
      for (const x of I) {
        if (x.state !== "live") continue;
        if (t === "F" && !(x.settleCcy === "USDT" && x.ctType === "linear")) continue;
        if (t === "S" && x.quoteCcy !== "USDT") continue;
        const base = t === "F" ? x.ctValCcy || x.uly?.split("-")[0] : x.baseCcy, tk = T.get(x.instId); if (!base || !tk) continue;
        const last = +tk.last, qv = t === "F" ? +tk.volCcy24h * last : +tk.volCcy24h;
        out.push({ id: `${base}:${t}`, sym: x.instId, ct: t === "F" ? +x.ctVal || 1 : 1, qv: qv / 1e6 });
      }
      return out;
    },
    url: () => "wss://ws.okx.com:8443/ws/v5/public",
    subs: (t, L) => { const a = L.flatMap((m) => [{ channel: "tickers", instId: m.sym }, { channel: "trades", instId: m.sym }]), out = []; for (let i = 0; i < a.length; i += 150) out.push(JSON.stringify({ op: "subscribe", args: a.slice(i, i + 150) })); return out; },
    ping: "ping",
    parse(m, F, on) {
      const a = m.arg; if (!a || !m.data) return;
      const mk = F.bySym.get(a.instId); if (!mk) return;
      if (a.channel === "trades") { for (const q of m.data) on.trade(mk, +q.px, +q.sz * mk.ct, q.side === "buy" ? 1 : -1); return; }
      for (const b of m.data) {
        on.book(mk, +b.bidPx, +b.bidSz * mk.ct, +b.askPx, +b.askSz * mk.ct);
        if (b.volCcy24h) mk.qv = (F.t === "F" ? +b.volCcy24h * +b.last : +b.volCcy24h) / 1e6;
      }
    },
  },
  bybit: {
    async universe(t) {
      const r = await get(`https://api.bybit.com/v5/market/tickers?category=${t === "F" ? "linear" : "spot"}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const L = (await r.json()).result?.list || [], out = [];
      for (const x of L) {
        if (!/^[A-Z0-9]+USDT$/.test(x.symbol)) continue;
        out.push({ id: `${x.symbol.replace(/USDT$/, "")}:${t}`, sym: x.symbol, ct: 1, qv: +x.turnover24h / 1e6 });
      }
      return out;
    },
    url: (t) => `wss://stream.bybit.com/v5/public/${t === "F" ? "linear" : "spot"}`,
    subs: (t, L) => { const a = L.flatMap((m) => [t === "F" ? `tickers.${m.sym}` : `orderbook.1.${m.sym}`, `publicTrade.${m.sym}`]), n = t === "F" ? 100 : 10, out = []; for (let i = 0; i < a.length; i += n) out.push(JSON.stringify({ op: "subscribe", args: a.slice(i, i + n) })); return out; },
    ping: JSON.stringify({ op: "ping" }),
    parse(m, F, on) {
      if (!m.topic || !m.data) return;
      if (m.topic.startsWith("publicTrade")) { for (const q of m.data) { const mk = F.bySym.get(q.s); if (mk) on.trade(mk, +q.p, +q.v, q.S === "Buy" ? 1 : -1); } return; }
      const d = m.data, mk = F.bySym.get(d.s || d.symbol); if (!mk) return;
      if (m.topic.startsWith("tickers")) on.book(mk, d.bid1Price ? +d.bid1Price : null, d.bid1Size ? +d.bid1Size : null, d.ask1Price ? +d.ask1Price : null, d.ask1Size ? +d.ask1Size : null);
      else { const b = d.b?.[0], a = d.a?.[0]; on.book(mk, b ? +b[0] : null, b ? +b[1] : null, a ? +a[0] : null, a ? +a[1] : null); }
    },
  },
};
SRC.binance = {      // spot: data-stream.binance.vision (kết nối được cả từ Cloudflare); danh sách thị trường lấy từ !miniTicker@arr
  only: "S",
  url: () => "wss://data-stream.binance.vision/stream?streams=!miniTicker@arr",
  uniFrom: (arr, t) => arr.filter((x) => /^[A-Z0-9]+USDT$/.test(x.s)).map((x) => ({ id: `${x.s.replace(/USDT$/, "")}:${t}`, sym: x.s, ct: 1, qv: +x.q / 1e6 })),
  // sổ lệnh 5 mức chụp mỗi 100ms (thay cho bookTicker: coin lớn đổ về hàng nghìn tin/giây, máy chủ nhỏ không kham nổi) + khớp lệnh gộp
  subs: (t, L) => { const a = L.slice(0, 500).flatMap((m) => [`${m.sym.toLowerCase()}@depth5@100ms`, `${m.sym.toLowerCase()}@aggTrade`]), out = []; for (let i = 0; i < a.length; i += 100) out.push(JSON.stringify({ method: "SUBSCRIBE", params: a.slice(i, i + 100), id: i / 100 + 1 })); return out; },
  ping: null,
  parse(m, F, on) {
    const d = m.data; if (!d) return;
    if (Array.isArray(d)) { for (const x of d) { const mk = F.bySym.get(x.s); if (mk) mk.qv = +x.q / 1e6; } return; }
    if (d.bids && d.asks) { const mk = F.bySym.get(String(m.stream || "").split("@")[0].toUpperCase()); if (mk) book5(on, mk, d.bids, d.asks); return; }   // sổ lệnh 5 mức (không có mã coin trong dữ liệu → lấy từ tên luồng)
    const mk = F.bySym.get(d.s); if (!mk) return;
    if (d.e === "aggTrade") on.trade(mk, +d.p, +d.q, d.m ? -1 : 1);
    else if (d.b) on.book(mk, +d.b, +d.B, +d.a, +d.A);
  },
};
SRC.binancef = {     // futures vĩnh cửu USDT của Binance – CHỈ chạy được ở máy chủ riêng (Binance trả 403 cho Cloudflare)
  only: "F",
  async universe() {
    const [ri, rt] = await Promise.all([get("https://fapi.binance.com/fapi/v1/exchangeInfo"), get("https://fapi.binance.com/fapi/v1/ticker/24hr")]);
    if (!ri.ok || !rt.ok) throw new Error(`HTTP ${ri.status}/${rt.status}`);
    const I = (await ri.json()).symbols || [], T = new Map(((await rt.json()) || []).map((x) => [x.symbol, x]));
    return I.filter((x) => x.status === "TRADING" && x.contractType === "PERPETUAL" && x.quoteAsset === "USDT" && T.has(x.symbol))
      .map((x) => ({ id: `${x.baseAsset}:F`, sym: x.symbol, ct: 1, qv: +T.get(x.symbol).quoteVolume / 1e6 }));
  },
  // luồng sổ lệnh ở /public, khớp lệnh ở /market (Binance tách đường dẫn từ 2026); mỗi kết nối 100 coin
  conns: (t, L) => {
    const out = [];
    for (let i = 0; i < L.length; i += 100) {
      const g = L.slice(i, i + 100).map((m) => m.sym.toLowerCase());
      out.push({ url: "wss://fstream.binance.com/public/stream", subs: [JSON.stringify({ method: "SUBSCRIBE", params: g.map((s) => s + "@depth5@500ms"), id: i + 1 })] });
      out.push({ url: "wss://fstream.binance.com/market/stream", subs: [JSON.stringify({ method: "SUBSCRIBE", params: g.map((s) => s + "@aggTrade"), id: i + 2 })] });
    }
    return out;
  },
  ping: null,
  parse(m, F, on) {
    const d = m.data; if (!d || !d.s) return;
    const mk = F.bySym.get(d.s); if (!mk) return;
    if (d.e === "aggTrade") on.trade(mk, +d.p, +d.q, d.m ? -1 : 1);
    else if (d.e === "depthUpdate" && Array.isArray(d.b)) book5(on, mk, d.b, d.a);
    else if (d.e === "bookTicker") on.book(mk, +d.b, +d.B, +d.a, +d.A);
  },
};
// sổ lệnh nhiều mức → giá mua/bán tốt nhất + tổng khối lượng 5 mức mỗi bên (đo lệch sổ lệnh ổn định hơn chỉ nhìn mức đầu)
function book5(on, mk, B, A) {
  if (!B?.length || !A?.length) return;
  let bq = 0, aq = 0; for (const x of B) bq += +x[1]; for (const x of A) aq += +x[1];
  on.book(mk, +B[0][0], bq, +A[0][0], aq);
}
// thứ tự thử nguồn theo loại (mặc định cho Cloudflare: OKX hay trả 429 cho IP chung của Cloudflare nên futures thử Bybit trước)
export const ORD_CF = { F: ["bybit", "okx"], S: ["binance", "okx", "bybit"] };
export const ORD_VPS = { F: ["binancef", "bybit", "okx"], S: ["binance", "okx", "bybit"] };
const BN_PROBE = [["futures", "wss://fstream.binance.com/public/ws/btcusdt@bookTicker"], ["spot", "wss://data-stream.binance.vision/ws/btcusdt@bookTicker"]];

export class ScalpCore {
  constructor(io) {
    this.io = io; this.kv = io.kv; this.where = io.where || "cf"; this.ORD = io.ord || ORD_CF;
    this.S = null; this.cfg = null; this.uid = null; this.cfgAt = 0; this.dirty = 0;
    this.F = {};          // luồng dữ liệu theo loại: {F: {t, src, srcI, ws, last, n, n0, rate, bySym, list, at}, S: {...}}
    this.M = {};          // thị trường (không lưu): {id: {id, t, sym, ct, qv, g, bid, ask, bq, aq, tb, sec:{buy,sell}, flow, mids, pend}}
    this.LM = {};         // bộ học riêng từng coin (bps): {id: NB × HS × [n, mean]}
    this.lastSec = 0; this.diag = { err: [], conn: 0 }; this.bn = null; this.live = {}; this.cnt = {};
  }
  err(m) { this.diag.err = [...this.diag.err.slice(-11), `${new Date().toISOString().slice(11, 19)} ${String(m).slice(0, 140)}`]; }
  async boot(uid) {
    if (uid) this.uid = uid;
    if (!this.uid) this.uid = await this.kv.get("uid");
    else await this.kv.put("uid", this.uid);
    if (!this.S) {
      const S = (await this.kv.get("S")) || null;
      this.S = S && S.v === 2 ? S : null;
      if (this.S) { const ch = await this.kv.list({ prefix: "LM:" }); for (const v of ch.values()) Object.assign(this.LM, v); }
      else if (S) this.upgraded = true;
    }
    await this.loadCfg(true);
    if (!this.here()) { this.closeAll("bot lướt giây đang tắt / chạy ở nơi khác"); if (!this.cfg?.enabled) await this.snapshot(); return false; }
    await this.ensureFeeds();
    return true;
  }
  // bật VÀ được chọn chạy ở đúng nơi này (Cloudflare hay máy chủ riêng) – tránh 2 nơi cùng chạy, cùng ghi đè trạng thái
  here() { return !!this.cfg?.enabled && (this.cfg.where === "vps" ? "vps" : "cf") === this.where; }
  async loadCfg(force) {
    if (!force && Date.now() - this.cfgAt < 30000) return;
    this.cfgAt = Date.now();
    let raw = null;
    try { raw = await this.io.readCfg(this.uid); } catch (e) { this.err("cfg " + e.message); if (this.cfg) return; }
    const c = norm(raw), now = Date.now();
    if (!this.S || (c.reset_at && c.reset_at !== this.S.reset_seen)) {
      this.S = newState(c, now); this.LM = {}; await this.kv.delete([...(await this.kv.list({ prefix: "LM:" })).keys()]).catch(() => {});
      this.say(now, this.upgraded ? `Nâng cấp lên bản quét toàn thị trường – tài khoản sàn thử mới ${c.capital} USDT` : `Khởi tạo tài khoản lướt giây trên sàn thử: ${c.capital} USDT`); this.upgraded = false;
    }
    if (c.resume_at && c.resume_at !== this.S.resume_seen) {   // anh bấm "bỏ nghỉ, chạy tiếp"
      this.S.resume_seen = c.resume_at;
      if (this.S.pause) {
        const k = this.S.pause.kind; this.S.pause = null;
        if (k === "day") this.S.day.eq0 = this.equity();          // dừng ngày: tính lại hạn mức lỗ trong ngày từ bây giờ
        this.S.brk = now;                                       // cầu dao 50 lệnh không bật lại trong 1 giờ tới
        this.say(now, `▶ Anh bỏ qua lần nghỉ – chạy tiếp${k === "day" ? " (hạn mức lỗ trong ngày tính lại từ bây giờ)" : ""}; ngưỡng vào lệnh vẫn giữ ${(c.k + (this.S.kadd || 0)).toFixed(1)}× chi phí`, "info");
      }
    }
    const old = this.cfg; this.cfg = c;
    if (old && (old.fut !== c.fut || old.spot !== c.spot || old.min_vol !== c.min_vol || old.max_mk !== c.max_mk)) { for (const t of Object.keys(this.F)) this.closeFeed(t, "đổi phạm vi thị trường"); for (const f of Object.values(this.F)) f.at = 0; }
  }
  say(now, m, k = "info") { this.S.log = [...(this.S.log || []).slice(-79), { t: iso(now), k, m }]; }
  closeFeed(t, why) { const f = this.F[t]; if (!f) return; for (const w of f.wss || []) { try { w.close(1000, why); } catch (e) { /* bỏ qua */ } } f.ws = null; f.wss = []; }
  closeAll(why) { for (const t of Object.keys(this.F)) this.closeFeed(t, why); }

  // ---------------------------------------------------------------- kết nối: danh sách thị trường + WebSocket, tự chuyển nguồn khi lỗi / im lặng
  async ensureFeeds() {
    const c = this.cfg, want = [...(c.fut ? ["F"] : []), ...(c.spot ? ["S"] : [])];
    for (const t of Object.keys(this.F)) if (!want.includes(t)) { this.closeFeed(t, "tắt loại thị trường"); delete this.F[t]; for (const id of Object.keys(this.M)) if (this.M[id].t === t && !this.S.pos[id]) delete this.M[id]; }
    for (const t of want) {
      const f = (this.F[t] ||= { t, src: null, srcI: 0, ws: null, wss: [], last: 0, n: 0, n0: 0, rate: 0, bySym: new Map(), list: [], at: 0 });
      const silent = f.ws && Date.now() - f.last >= 15000, old = f.ws && Date.now() - f.at >= 3600e3;
      if (f.ws && !silent && !old) continue;
      if (silent) { this.err(`${f.src} ${t === "F" ? "futures" : "spot"}: im lặng > 15 giây – chuyển nguồn`); f.srcI = (f.srcI + 1) % this.ORD[t].length; this.closeFeed(t, "im lặng"); }
      else if (old) this.closeFeed(t, "làm mới danh sách thị trường");
      await this.connect(f);
    }
  }
  async connect(f) {
    const c = this.cfg, t = f.t, name = t === "F" ? "futures" : "spot";
    const O = this.ORD[t];
    for (let n = 0; n < O.length; n++) {
      const id = O[(f.srcI + n) % O.length], S = SRC[id];
      if (S.only && S.only !== t) continue;
      const opened = [];
      try {
        let U0, first = null;
        if (S.uniFrom) {     // danh sách thị trường lấy từ chính luồng WebSocket (tin đầu tiên của !miniTicker@arr)
          first = await this.io.openWS(S.url(t)); opened.push(first);
          const w = first, arr = await new Promise((res, rej) => {
            const tm = setTimeout(() => rej(new Error("không nhận được danh sách thị trường")), 8000);
            const h = (ev) => { try { const m = JSON.parse(ev.data); if (Array.isArray(m.data)) { clearTimeout(tm); w.removeEventListener("message", h); res(m.data); } } catch (e) { /* bỏ qua */ } };
            w.addEventListener("message", h);
          });
          U0 = S.uniFrom(arr, t);
        } else U0 = await S.universe(t);
        let U = U0.filter((m) => !STABLE.has(m.id.split(":")[0]) && m.qv >= c.min_vol);
        const seen = new Set(); U = U.sort((a, b) => b.qv - a.qv).filter((m) => (seen.has(m.id) ? false : seen.add(m.id))).slice(0, Math.min(S.uniFrom ? 500 : 1e9, c.max_mk, this.io.cap ? this.io.cap(t) : 1e9));
        if (!U.length) throw new Error("danh sách thị trường rỗng");
        // một nguồn có thể cần nhiều kết nối (Binance futures: sổ lệnh và khớp lệnh ở 2 đường dẫn, 100 coin mỗi kết nối)
        const plan = S.conns ? S.conns(t, U) : [{ url: S.url(t), subs: S.subs(t, U) }];
        const wss = [];
        for (let i = 0; i < plan.length; i++) { const w = i === 0 && first ? first : await this.io.openWS(plan[i].url); if (w !== first) opened.push(w); wss.push(w); }
        f.bySym = new Map(); f.list = U;
        for (const u of U) { const m = this.mk(u.id, t); m.sym = u.sym; m.ct = u.ct; m.qv = u.qv; m.g = t + tierOf(u.qv); f.bySym.set(u.sym, m); }
        const keep = new Set(U.map((u) => u.id)); for (const k of Object.keys(this.M)) if (this.M[k].t === t && !keep.has(k) && !this.S.pos[k]) delete this.M[k];
        for (const w of wss) {
          w.addEventListener("message", (ev) => this.onMsg(f, w, ev.data));
          w.addEventListener("close", () => { if (f.wss.includes(w)) f.ws = null; });
          w.addEventListener("error", () => { if (f.wss.includes(w)) f.ws = null; });
        }
        f.ws = wss[0]; f.wss = wss; f.src = id; f.srcI = (f.srcI + n) % O.length; f.last = Date.now(); f.at = Date.now(); this.diag.conn++;
        for (let i = 0; i < plan.length; i++) for (const msg of plan[i].subs) { wss[i].send(msg); await sleep(id === "binance" ? 300 : id === "binancef" ? 150 : id === "okx" ? 120 : 40); }
        this.say(Date.now(), `Kết nối ${name}: ${id} · quét ${U.length} thị trường (khối lượng 24h ≥ ${c.min_vol} triệu USD)${wss.length > 1 ? ` · ${wss.length} kết nối` : ""}`);
        return;
      } catch (e) { this.err(`${id} ${name}: ${e.message}`); for (const w of opened) { if (!f.wss.includes(w)) { try { w.close(1000, "lỗi"); } catch (x) { /* bỏ qua */ } } } }
    }
    this.say(Date.now(), `Không kết nối được nguồn dữ liệu ${name} nào – thử lại sau 10 giây`, "stop");
  }
  async probeBinance() {     // Binance chặn máy chủ Cloudflare (HTTP 403) – thử lại mỗi giờ, ghi kết quả để biết khi nào dùng lại được
    if (this.bn && Date.now() - Date.parse(this.bn.at + "Z") < 3600e3) return;
    const res = {};
    for (const [k, url] of BN_PROBE) {
      try { const w = await this.io.openWS(url); res[k] = "OK"; w.close(1000, "probe"); } catch (e) { res[k] = String(e.message).slice(0, 60); }
    }
    this.bn = { at: iso(Date.now()), ...res };
  }
  // gọi mỗi 10 giây (Cloudflare: alarm; máy chủ riêng: setInterval). Trả về true nếu bot còn phải chạy ở nơi này.
  async tick() {
    await this.loadCfg(false);
    if (!this.here()) { this.closeAll("tắt / chạy ở nơi khác"); if (!this.cfg?.enabled) await this.snapshot(); return false; }
    await this.ensureFeeds();
    for (const f of Object.values(this.F)) { f.rate = (f.n - f.n0) / 10; f.n0 = f.n; if (SRC[f.src]?.ping) for (const w of f.wss || []) { try { w.send(SRC[f.src].ping); } catch (e) { /* bỏ qua */ } } }
    if (this.where === "cf") await this.probeBinance().catch(() => {});
    await this.snapshot();
    return true;
  }
  // ---------------------------------------------------------------- dữ liệu vào
  onMsg(f, ws, raw) {
    if (raw === "pong" || !f.wss.includes(ws)) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const now = Date.now(); f.last = now; f.n++;
    SRC[f.src].parse(m, f, {
      book: (x, b, bq, a, aq) => { if (b) { x.bid = b; if (bq != null) x.bq = bq; } if (a) { x.ask = a; if (aq != null) x.aq = aq; } x.tb = now; if (x.bid && x.ask) this.onBook(x, now); },
      trade: (x, p, q, side) => { if (!(p > 0 && q > 0)) return; if (side > 0) x.sec.buy += q * p; else x.sec.sell += q * p; this.onTrade(x, p, q, side, now); },
    });
    const sec = Math.floor(now / 1000);
    if (sec > this.lastSec) { this.lastSec = sec; try { this.second(now); } catch (e) { this.err("second: " + e.message); } }
  }
  mk(id, t) { return (this.M[id] ||= { id, t, sym: "", ct: 1, qv: 0, g: t + "3", bid: 0, ask: 0, bq: 0, aq: 0, tb: 0, sec: { buy: 0, sell: 0 }, flow: [], mids: [], pend: [] }); }

  // ---------------------------------------------------------------- mỗi giây: tín hiệu → bộ học → chọn cơ hội tốt nhất toàn thị trường
  second(now) {
    const c = this.cfg, S = this.S;
    const day = vnDay(now), eqNow = this.equity();
    if (S.day.d !== day) { S.day = { d: day, eq0: eqNow }; if (S.pause?.kind === "day") { S.pause = null; this.say(now, "Sang ngày mới – chạy lại"); } }
    S.peak = Math.max(S.peak, eqNow);
    const m1 = Math.floor(now / 60000);
    if (!S.eq.length || S.eq[S.eq.length - 1][0] < m1) S.eq = [...S.eq.slice(-1440), [m1, r2(eqNow, 2)]];
    const dayPct = (eqNow / S.day.eq0 - 1) * 100;
    if (!S.pause && dayPct <= -c.daily_stop) { S.pause = { kind: "day", why: `lỗ ${dayPct.toFixed(2)}% hôm nay (giới hạn ${c.daily_stop}%)`, until: null }; this.say(now, `⛔ Dừng tới hết ngày: ${S.pause.why}`, "stop"); }
    if (S.pause?.until && now >= S.pause.until) { this.say(now, "Hết giờ nghỉ – đánh giá lại", "info"); S.pause = null; }
    const kk = c.k + (S.kadd || 0), hourN = this.tradesLastHour(now), nOpen = Object.keys(S.pos).length + Object.keys(S.ord).length;
    const live = {}, cnt = { all: 0, learn: 0, fee: 0, go: 0, skip: 0, hold: 0, stale: 0 }, cand = [];
    for (const id in this.M) {
      const x = this.M[id]; if (!x.bid || !x.ask || x.ask <= x.bid) continue;
      cnt.all++;
      const mid = (x.bid + x.ask) / 2, spread = (x.ask - x.bid) / mid * 1e4;
      x.flow.push([x.sec.buy, x.sec.sell]); x.sec = { buy: 0, sell: 0 }; if (x.flow.length > 10) x.flow.shift();
      x.mids.push(mid); if (x.mids.length > 61) x.mids.shift();
      this.manageTime(x, now);
      if (now - x.tb > 10000) { cnt.stale++; x.pend.length = 0; x.ptr = null; if (!S.pos[id]) continue; }
      if (x.mids.length < 20) continue;
      // đặc trưng
      let b5 = 0, s5 = 0; for (let i = Math.max(0, x.flow.length - 5); i < x.flow.length; i++) { b5 += x.flow[i][0]; s5 += x.flow[i][1]; }
      const tfi = b5 + s5 > 0 ? (b5 - s5) / (b5 + s5) : 0;
      const obi = x.bq + x.aq > 0 ? (x.bq - x.aq) / (x.bq + x.aq) : 0;
      const M = x.mids; let sm = 0, sq = 0, nr = 0;
      for (let i = 1; i < M.length; i++) { const r = (M[i] / M[i - 1] - 1) * 1e4; sm += r; sq += r * r; nr++; }
      const vol = Math.max(0.05, Math.sqrt(Math.max(0, sq / nr - (sm / nr) ** 2)));
      const mom5 = (mid / M[Math.max(0, M.length - 6)] - 1) * 1e4, mz = clamp(mom5 / (vol * Math.sqrt(5)), -3, 3) / 3;
      const s = clamp(0.4 * tfi + 0.3 * obi + 0.3 * mz, -1, 1), side = s >= 0 ? 1 : -1, bin = Math.min(NB - 1, Math.floor(Math.abs(s) / BW));
      const g = (x.g = x.t + tierOf(x.qv));
      // bộ học: chốt các mẫu đã đủ thời gian (gộp theo nhóm – đơn vị biến động; riêng từng coin – bps)
      const LP = fit((S.LP[g] ||= newCell()), 3), LM = fit((this.LM[id] ||= Array.from({ length: NB }, () => HS.map(() => [0, 0]))), 2);
      // chỉ học các mốc ≤ thời gian giữ tối đa đang cài (đỡ tốn bộ nhớ/CPU khi quét hàng trăm thị trường); con trỏ theo từng mốc → mỗi mẫu chỉ xử lý 1 lần
      const nh = HS.filter((h) => h <= c.hmax).length, hl = HS[nh - 1];
      x.pend.push([now, side, bin, mid, vol, g]);
      const ptr = (x.ptr ||= HS.map(() => 0));
      while (x.pend.length && now - x.pend[0][0] > (hl + 1) * 1000) { x.pend.shift(); for (let hi = 0; hi < HS.length; hi++) ptr[hi] = Math.max(0, ptr[hi] - 1); }
      for (let hi = 0; hi < nh; hi++) {
        const hms = HS[hi] * 1000, sq = Math.sqrt(HS[hi]);
        while (ptr[hi] < x.pend.length && now - x.pend[ptr[hi]][0] >= hms) {
          const p = x.pend[ptr[hi]++];
          const fwd = clamp(p[1] * (mid / p[3] - 1) * 1e4, -500, 500), z = clamp(fwd / (p[4] * sq), -10, 10);
          const P = fit((S.LP[p[5]] ||= newCell()), 3)[p[2]][hi], n = P[0] + 1, a = 1 / Math.min(n, 20000), d = z - P[1];
          P[0] = n; P[1] += a * d; P[2] = (1 - a) * (P[2] + a * d * d);
          const Q = LM[p[2]][hi], nq = Q[0] + 1; Q[0] = nq; Q[1] += (fwd - Q[1]) / Math.min(nq, 3000);
        }
      }
      // kỳ vọng & chi phí
      const fm = x.t === "F" ? c.fee_m : c.fee_ms, ft = x.t === "F" ? c.fee_t : c.fee_ts;
      const cost = c.mode === "taker" ? 2 * ft * 100 + spread : (fm + ft) * 100;
      let best = null;
      for (let hi = 0; hi < HS.length; hi++) {
        const h = HS[hi]; if (h > c.hmax) continue;
        const P = LP[bin][hi], Q = LM[bin][hi];
        if (P[0] < c.min_n) continue;          // bắt buộc có số liệu nhóm – số liệu riêng 1 coin quá ít để tự đứng
        // KỲ VỌNG THẬN TRỌNG (chống "lời nhờ may"):
        //  - mẫu lấy mỗi giây chồng lên nhau khi giữ h giây, nhiều coin cùng chạy theo BTC → số mẫu độc lập ≈ n / (2h), không phải n;
        //  - số liệu riêng coin chỉ được tin dần theo số mẫu độc lập của nó (ne/(ne+50)), còn lại theo nhóm;
        //  - mỗi giây chọn cái TỐT NHẤT trong hàng trăm coin × 9 mốc giờ → cái được chọn hay là cái được ước lượng lố nhờ may.
        //    Vì vậy trừ 2,33 sai số chuẩn (mức 99%) thay vì 1,65.
        const sq = Math.sqrt(h), sdb = (Math.sqrt(P[2]) || 1) * vol * sq, neP = Math.max(1, P[0] / (2 * h)), neQ = Q[0] / (2 * h);
        const w = neQ / (neQ + 50), raw = w * Q[1] + (1 - w) * P[1] * vol * sq;
        const se = sdb * Math.sqrt(w * w / Math.max(1, neQ) + (1 - w) * (1 - w) / neP);
        const exp = raw - 2.33 * se;
        const net = exp - cost, sc = net / sq;
        if (!best || sc > best.sc) best = { h, exp, raw, se, net, sc, n: P[0], nq: Q[0] };
      }
      const t0g = (S.LPt ||= {})[g] ||= now, warm = now - t0g >= c.warm * 60000;
      let v = "learn", why;
      if (!best) why = `đang học: nhóm ${g} mới ${LP[bin].reduce((a, q) => Math.max(a, q[0]), 0)}/${c.min_n} mẫu`;
      else if (!warm) { why = `đang khởi động: nhóm ${g} mới học ${Math.floor((now - t0g) / 60000)}/${c.warm} phút – chưa cho vào lệnh`; best = { ...best, warm: false }; }
      else why = `lợi thế kỳ vọng ${best.exp.toFixed(2)} bps (giữ ${best.h}s) so với chi phí khứ hồi ${cost.toFixed(2)} bps → ròng sau phí ${best.net >= 0 ? "+" : ""}${best.net.toFixed(2)} bps`;
      const ok = best && best.net >= c.min_net && best.exp >= kk * cost;
      if (S.pos[id]) v = "hold";
      else if (S.ord[id]) v = "order";
      else if (!best || best.warm === false) v = "learn";
      else if (!ok) { v = "fee"; why += best.net < c.min_net ? ` – cần ròng ≥ ${c.min_net} bps` : ` – cần kỳ vọng ≥ ${kk.toFixed(1)}× chi phí = ${(kk * cost).toFixed(2)} bps`; }
      else if (x.t === "S" && side < 0) { v = "skip"; why = "tín hiệu bán nhưng spot không bán khống được – đứng ngoài"; }
      else if (S.pause) { v = "pause"; why = `tạm dừng: ${S.pause.why}`; }
      else if (spread > c.spread_max) { v = "skip"; why = `chênh lệch mua/bán ${spread.toFixed(2)} bps > ${c.spread_max} – bỏ qua vì chênh lệch quá rộng`; }
      else if (x.t === "F" && nearFunding(now, best.h)) { v = "skip"; why = "lệnh sẽ giữ qua giờ funding – đứng ngoài"; }
      else if (S.cool[id] && now < S.cool[id]) { v = "skip"; why = `vừa đóng lệnh coin này – nghỉ thêm ${Math.ceil((S.cool[id] - now) / 1000)} giây`; }
      else { v = "go"; cand.push({ x, side, best, cost, vol, mid, spread }); }
      cnt[v === "order" || v === "hold" ? "hold" : v === "pause" ? "skip" : v]++;
      live[id] = { t: x.t, g, mid: r2(mid, 8), spread: r2(spread, 2), s: r2(s, 2), tfi: r2(tfi, 2), obi: r2(obi, 2), mz: r2(mz, 2), vol: r2(vol, 2), qv: r2(x.qv, 1), bin, side, cost: r2(cost, 2),
        best: best ? { h: best.h, exp: r2(best.exp, 2), raw: r2(best.raw, 2), se: r2(best.se, 2), net: r2(best.net, 2), n: best.n, nq: best.nq } : null, v, why };
    }
    // chọn: tối đa 1 lệnh mới mỗi giây – ứng viên có lợi thế ròng / √thời gian giữ cao nhất, trong giới hạn vị thế & số lệnh/giờ
    cand.sort((a, b) => b.best.sc - a.best.sc);
    const top = cand[0];
    if (top) {
      if (nOpen >= c.max_pos) { live[top.x.id].v = "skip"; live[top.x.id].why = `đạt chuẩn nhưng đã mở ${nOpen}/${c.max_pos} vị thế`; }
      else if (hourN >= c.max_h) { live[top.x.id].v = "skip"; live[top.x.id].why = `đạt chuẩn nhưng đã ${hourN} lệnh trong 1 giờ (tối đa ${c.max_h})`; }
      else this.enter(top.x, top.side, top.best, top.cost, top.vol, now);
      for (const q of cand.slice(1)) { live[q.x.id].v = "skip"; live[q.x.id].why = "đạt chuẩn nhưng có cơ hội tốt hơn trong giây này (mỗi giây tối đa 1 lệnh mới)"; }
    }
    this.live = live; this.cnt = cnt;
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
  used() { let u = 0; for (const P of [...Object.values(this.S.pos), ...Object.values(this.S.ord)]) u += P.q * (P.e || P.px) / (P.t === "F" ? this.cfg.lev : 1); return u; }
  enter(x, side, best, cost, vol, now) {
    const c = this.cfg, S = this.S, eq = this.equity(), lev = x.t === "F" ? c.lev : 1;
    // thoát chủ yếu theo thời gian (bộ học đo kỳ vọng ở đúng h giây); cắt lỗ chặn rủi ro bất thường (4 lần biến động); chốt sớm khi giá chạy gấp đôi kỳ vọng
    const slb = Math.max(2 * cost, 4 * vol * Math.sqrt(best.h)), tpb = cost + 2 * best.exp;
    const free = Math.max(0, eq - this.used());
    const notional = Math.min(free * lev, eq * c.risk / 100 / (slb / 1e4), eq * lev);
    if (notional < 10) return;
    if (c.mode === "maker") {
      const px = side > 0 ? x.bid : x.ask;
      S.ord[x.id] = { t: x.t, side, px, q: notional / px, queue: side > 0 ? x.bq : x.aq, t0: now, h: best.h, slb, tpb, exp: best.exp, raw: best.raw, g: x.g, cost };
      return;
    }
    this.open(x, side, side > 0 ? x.ask : x.bid, notional / (side > 0 ? x.ask : x.bid), "taker", best, slb, tpb, cost, now);
  }
  open(x, side, px, q, how, best, slb, tpb, cost, now) {
    const c = this.cfg, fr = x.t === "F" ? (how === "maker" ? c.fee_m : c.fee_t) : how === "maker" ? c.fee_ms : c.fee_ts, fee = q * px * fr / 100;
    this.S.cash -= fee;
    this.S.pos[x.id] = { id: this.S.seq++, t: x.t, side, e: px, q, fee, how, t0: now, h: best.h, sl: px * (1 - side * slb / 1e4), tp: px * (1 + side * tpb / 1e4), exp: best.exp, raw: best.raw, g: x.g, cost, slb, tpb };
  }
  onTrade(x, p, q, side, now) {
    const o = this.S?.ord?.[x.id];
    if (o) {   // lệnh chờ maker: khớp khi có người khớp xuyên giá / hết hàng chờ phía trước ở đúng giá
      if (o.side > 0 && side < 0) { if (p < o.px) o.queue = 0; else if (p === o.px) o.queue -= q; }
      if (o.side < 0 && side > 0) { if (p > o.px) o.queue = 0; else if (p === o.px) o.queue -= q; }
      if (o.queue <= 0) { delete this.S.ord[x.id]; this.open(x, o.side, o.px, o.q, "maker", { h: o.h, exp: o.exp, raw: o.raw }, o.slb, o.tpb, o.cost, now); }
    }
  }
  onBook(x, now) {
    const P = this.S?.pos?.[x.id]; if (!P) return;
    const exitPx = P.side > 0 ? x.bid : x.ask;
    if (P.side > 0 ? exitPx <= P.sl : exitPx >= P.sl) this.close1(x, exitPx, "SL", now);
    else if (P.side > 0 ? exitPx >= P.tp : exitPx <= P.tp) this.close1(x, exitPx, "TP", now);
  }
  manageTime(x, now) {
    const o = this.S.ord[x.id];
    if (o && now - o.t0 > 3000) delete this.S.ord[x.id];          // maker chờ quá 3 giây → huỷ
    const P = this.S.pos[x.id];
    if (P && now - P.t0 >= P.h * 1000) this.close1(x, P.side > 0 ? x.bid : x.ask, "TIME", now);
    else if (P && now - x.tb > 30000) this.close1(x, P.side > 0 ? x.bid : x.ask, "STALE", now);   // mất dữ liệu coin này > 30 giây → đóng ở giá cuối
  }
  close1(x, px, why, now) {
    const c = this.cfg, S = this.S, P = S.pos[x.id]; if (!P) return;
    const fee = P.q * px * (P.t === "F" ? c.fee_t : c.fee_ts) / 100, gross = P.side * P.q * (px - P.e);
    S.cash += gross - fee;
    delete S.pos[x.id];
    if (c.cool) S.cool[x.id] = now + c.cool * 1000;
    const n0 = P.q * P.e, grossB = gross / n0 * 1e4, feeB = (P.fee + fee) / n0 * 1e4, net = grossB - feeB, usd = gross - fee - P.fee;
    const t = { id: P.id, k: x.id, t: P.t, side: P.side, how: P.how, e: r2(P.e, 8), x: r2(px, 8), hold: r2((now - P.t0) / 1000, 1), gross: r2(grossB, 2), fee: r2(feeB, 2), net: r2(net, 2), usd: r2(usd, 3), exp: r2(P.exp, 2), raw: r2(P.raw, 2), cost: r2(P.cost, 2), h: P.h, g: P.g || x.g, why, t0: iso(P.t0), t1: iso(now) };
    S.trades = [...S.trades.slice(-299), t];
    const st = S.stats; st.n++; st.gross += gross; st.fees += P.fee + fee; st.net += usd; if (usd > 0) st.win++;
    const b = (S.by[P.t] ||= { n: 0, net: 0, fees: 0, win: 0 }); b.n++; b.net += usd; b.fees += P.fee + fee; if (usd > 0) b.win++;
  }
  equity() {
    const S = this.S; let e = S.cash;
    for (const [k, P] of Object.entries(S.pos || {})) { const x = this.M[k]; const m = x?.bid ? (P.side > 0 ? x.bid : x.ask) : P.e; e += P.side * P.q * (m - P.e); }
    return e;
  }
  // ---------------------------------------------------------------- lưu & gửi lên web
  async snapshot() {
    if (!this.S || !this.uid) return;
    const now = Date.now(), S = this.S, eq = this.equity(), T = S.trades, last = T.slice(-50);
    for (const k of Object.keys(S.cool)) if (S.cool[k] < now) delete S.cool[k];
    const rank = { go: 0, hold: 0, order: 0, skip: 1, fee: 2, pause: 2, learn: 3 };
    const L = Object.entries(this.live), radar = L.filter(([, q]) => q.best).sort((a, b) => (rank[a[1].v] - rank[b[1].v]) || b[1].best.net / Math.sqrt(b[1].best.h) - a[1].best.net / Math.sqrt(a[1].best.h)).slice(0, 40);
    for (const id of [...Object.keys(S.pos), ...Object.keys(S.ord)]) if (!radar.some(([k]) => k === id) && this.live[id]) radar.unshift([id, this.live[id]]);
    if (radar.length < 40) radar.push(...L.filter(([, q]) => !q.best).sort((a, b) => b[1].qv - a[1].qv).slice(0, 40 - radar.length));
    const feeds = Object.fromEntries(Object.entries(this.F).map(([t, f]) => [t, { src: f.src, ws: !!f.ws, last: f.last ? iso(f.last) : null, n: f.list.length, rate: r2(f.rate, 0), at: f.at ? iso(f.at) : null }]));
    const out = { v: 2, at: iso(now), enabled: !!this.cfg?.enabled, where: this.where, host: this.io.host || null, sys: this.io.sys ? this.io.sys() : null, feeds, bn: this.bn, diag: { ...this.diag, err: this.diag.err.slice(-8) },
      eq: r2(eq, 2), start: S.start, peak: r2(S.peak, 2), day: S.day, pause: S.pause, kadd: S.kadd, used: r2(this.used(), 2),
      stats: { ...S.stats, gross: r2(S.stats.gross, 2), fees: r2(S.stats.fees, 2), net: r2(S.stats.net, 2) }, by: S.by, cnt: this.cnt,
      last50: last.length ? { n: last.length, net: r2(last.reduce((a, t) => a + t.net, 0) / last.length, 2), gross: r2(last.reduce((a, t) => a + t.gross, 0) / last.length, 2), fee: r2(last.reduce((a, t) => a + t.fee, 0) / last.length, 2), win: r2(last.filter((t) => t.net > 0).length / last.length * 100, 0) } : null,
      radar, pos: S.pos, ord: S.ord, trades: T.slice(-80),
      LP: Object.fromEntries(Object.entries(S.LP).map(([g, Lg]) => [g, Lg.map((row) => row.map((q) => [q[0], r2(q[1], 3), r2(Math.sqrt(q[2]), 2)]))])),
      HS, BW, TIERS, eqs: S.eq.slice(-720), log: S.log.slice(-40), cfg: this.cfg };
    try { await this.io.writeState(this.uid, out); } catch (e) { this.err("lưu trạng thái " + e.message); }
    this.dirty++;
    if (this.dirty % 3 === 0 || !this.cfg?.enabled) await this.kv.put("S", S);
    if (this.dirty % 30 === 0 || !this.cfg?.enabled) {     // bộ học riêng từng coin: lưu mỗi ~5 phút, chia khối 100 coin
      const ids = Object.keys(this.LM), put = {};
      for (let i = 0; i < ids.length; i += 100) put["LM:" + i / 100] = Object.fromEntries(ids.slice(i, i + 100).map((k) => [k, this.LM[k]]));
      try { await this.kv.put(put); } catch (e) { this.err("lưu bộ học " + e.message); }
    }
  }
}
// futures: không mở lệnh trong 45 giây sau giờ tròn, và không mở lệnh mà thời gian giữ sẽ vắt qua giờ tròn (giờ funding 1h/4h/8h đều rơi vào giờ tròn)
const nearFunding = (now, h = 0) => { const s = Math.floor(now / 1000) % 3600; return s < 45 || 3600 - s < h + 45; };

