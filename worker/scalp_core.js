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
  fee_m: 0.02, fee_t: 0.05, fee_ms: 0.1, fee_ts: 0.1, min_net: 1.0, k: 1.3, min_n: 300, warm: 60, hmax: 60, cool: 20, sh_min: 30, day_target: 2, day_lock: true, daily_stop: 3, max_h: 120, spread_max: 10, max_side: 3, burst: 4, bx_mode: "auto", bx_z: 4, bx_r: 30, bx_min: 30,
  // 🪝 BẮT RÂU SẬP (đã kiểm chứng trên nến 1 phút Binance futures 7–10/2026, xem research/round3.py): cú sốc 1 phút ≥ hk_r bps & ≥ hk_z lần độ lệch chuẩn 60 phút
  // & khối lượng ≥ hk_v lần trung vị → đặt 2 lệnh chờ ngược chiều sâu thêm hk_d1 / hk_d2 lần độ lớn cú sốc, chờ hk_w phút, giữ hk_h phút rồi đóng.
  hk_on: true, hk_size: 5, hk_z: 4, hk_r: 300, hk_v: 8, hk_d1: 1.5, hk_d2: 2, hk_w: 8, hk_h: 60, hk_stop: 35, hk_max: 6, hk_spot: false, hk_f6: 6, hk_knife: 10, hk_r15: 100, hk_fund: 50, hk_rev: 2,
  // 💵 TÀI KHOẢN BINANCE THẬT (chỉ máy chủ riêng, chỉ Bắt râu sập): khoá nằm trong scalper/.env trên máy chủ – xem scalper/live.mjs
  lv_on: false, lv_env: "demo", lv_cap: 100, lv_lev: 2, lv_daily: 10 };
const HS = [2, 5, 15, 30, 60, 120, 180, 240, 300, 450, 600, 900];      // các mốc thời gian giữ (giây) bộ học đo – giữ tối đa tới 15 phút
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
// BỐI CẢNH: tín hiệu thuận (T) / ngược (N) xu hướng 15 phút của chính coin, hoặc coin đang đi ngang (0);
// cùng chiều (+) / ngược chiều (−) BTC 5 phút. Bảng học gộp được tách theo nhóm thanh khoản × bối cảnh → "mua thuận trend" và
// "bắt đáy ngược trend" học riêng, không lấy trung bình lẫn nhau.
const CTX = ["T+", "T-", "0+", "0-", "N+", "N-"];
export const CTX_VI = { T: "thuận xu hướng 15 phút", 0: "coin đi ngang 15 phút", N: "ngược xu hướng 15 phút", "+": "BTC cùng chiều / đi ngang", "-": "ngược chiều BTC 5 phút" };
const ZT = 0.5;
// VÙNG GIÁ kiểu SMC trong biên 60 phút (so với hướng tín hiệu): W = vừa quét thanh khoản phía ngược lại rồi quay đầu (sweep),
// A = đúng vùng (mua vùng rẻ / bán vùng đắt), M = giữa biên, B = sai vùng (mua đắt / bán rẻ), X = đang phá biên theo hướng tín hiệu, ? = chưa đủ 30 phút giá
// nhãn dễ đọc cho một loại tình huống, ví dụ "T|F1T+A|15" → "Taker · Futures hạng 1 · thuận xu hướng 15 phút · BTC cùng chiều / đi ngang · vùng giá tốt · giữ 15s"
const keyVI = (k) => { const [m, g, h] = String(k).split("|"); const p = [(m[0] === "M" ? "Maker" : "Taker") + (m[1] === "D" ? " thoát linh hoạt" : ""), g === "*" ? "mọi thị trường" : `${g[0] === "F" ? "Futures" : "Spot"} hạng ${g[1]}`];
  if (g.length >= 4) p.push(CTX_VI[g[2]], CTX_VI[g[3]]); if (g.length >= 5) p.push(ZONE_VI[g[4]]); p.push(`giữ ${h}s`); return p.filter(Boolean).join(" · "); };
export const ZONE_VI = { W: "vừa quét thanh khoản rồi quay đầu", A: "vùng giá tốt (mua rẻ / bán đắt)", M: "giữa biên 60 phút", B: "vùng giá xấu (mua đắt / bán rẻ)", X: "đang phá biên 60 phút", "?": "chưa đủ 30 phút giá" };
// KIỂM NGHIỆM BẰNG LỆNH ẢO: mỗi cơ hội đạt chuẩn ở tầng 1 được đánh thử ảo (cả taker lẫn maker, đúng phí, đúng cắt lỗ/chốt lời/hết giờ).
// Chỉ khi lệnh ảo của đúng loại tình huống đó có lời ròng (đã trừ sai số) thì mới vào lệnh thật. Trung bình trượt ~300 kết quả gần nhất → nhớ lâu nhưng vẫn theo kịp thị trường.
const SHW = 300, SH_MAX = 5000, SH_GAP = 15000, EP = 600e3, SHW_EP = 120;   // EP: lệnh ảo trong cùng 10 phút gộp thành 1 "đợt" (chúng chạy cùng nhau – không phải 30 bằng chứng độc lập)                               // |giá đi 15 phút| ≥ 0,5 lần dao động kỳ vọng → coi là có xu hướng
// BỘ NHỚ HỌC (dùng lại được cho bot khác / máy khác / lúc giao dịch thật): chỉ nạp khi cùng "lược đồ" – cùng mốc giữ, cách chia ô, hạng, bối cảnh, công thức tín hiệu
export const BRAIN_SCH = JSON.stringify({ v: 3, HS: [2, 5, 15, 30, 60, 120, 180, 240, 300, 450, 600, 900], NB: 6, BW: 0.15, TIERS: [500, 50, 5], ctx: "t15z0.5|b5z0.5", sig: "0.4tfi5+0.3obi5lv+0.3mz5", z: "fwd/(vol60*sqrt(h))" });
// bộ nhớ học bản cũ dùng được nếu chỉ khác ở chỗ có ít mốc giữ hơn (mốc mới thêm vào cuối → bảng cũ được thêm cột trống)
const schOK = (sch) => { if (sch === BRAIN_SCH) return true; try { const a = JSON.parse(sch), b = JSON.parse(BRAIN_SCH); const { HS: ha, ...ra } = a, { HS: hb, ...rb } = b; return JSON.stringify(ra) === JSON.stringify(rb) && ha.every((h, i) => hb[i] === h); } catch (e) { return false; } };
const fit = (L, w) => { for (const row of L) while (row.length < HS.length) row.push(Array(w).fill(0)); return L; };   // bảng học cũ ít mốc hơn → thêm cột trống

// Nâng cấp thiết lập đã lưu lên bản kiểm chứng vòng 5 (research/round5.py + r5_analyze.py, 01/2025–10/2026, ~900 mã): chờ khớp ≤ 8 phút, khối lượng ≥ 8×, bỏ "xả sau bơm" 15 phút.
// Chỉ chạy 1 lần cho thiết lập cũ (chưa có hk_rev) – sau đó anh chỉnh gì bot giữ nguyên.
export function hkMigrate(c) {
  c = { ...(c || {}) };
  if (!(+c.hk_rev >= 2)) { c.hk_v = Math.max(+c.hk_v || 8, 8); c.hk_w = Math.min(+c.hk_w || 8, 8); if (c.hk_r15 == null) c.hk_r15 = 100; c.hk_rev = 2; }
  return c;
}
function norm(c) {
  c = { ...SCALP_DEF, ...hkMigrate(c) };
  const n = (k, a, b) => (c[k] = clamp(Number.isFinite(+c[k]) ? +c[k] : SCALP_DEF[k], a, b));
  n("capital", 50, 1e7); n("min_vol", 0, 1e4); n("max_mk", 10, 1200); n("lev", 1, 20); n("risk", 0.02, 1); n("max_pos", 1, 30);
  n("fee_m", -0.02, 0.3); n("fee_t", 0, 0.3); n("fee_ms", -0.02, 0.5); n("fee_ts", 0, 0.5); n("min_net", 0, 50); n("k", 1, 5); n("min_n", 50, 20000);
  n("hmax", 2, 1800); n("warm", 0, 1440); n("sh_min", 10, 1000); n("day_target", 0, 50); n("cool", 0, 600); n("daily_stop", 0.5, 20); n("max_h", 1, 2000); n("spread_max", 0.2, 100);
  c.mode = ["maker", "taker", "auto"].includes(c.mode) ? c.mode : "auto"; c.day_lock = c.day_lock !== false; c.fut = c.fut !== false; c.spot = c.spot !== false;
  c.where = c.where === "vps" ? "vps" : "cf";
  n("max_side", 1, 30); n("bx_z", 2, 20); n("bx_r", 5, 500); n("bx_min", 10, 500); c.bx_mode = ["auto", "on", "off"].includes(c.bx_mode) ? c.bx_mode : "auto"; n("burst", 1, 60); n("hk_f6", 0, 48); n("hk_r15", 0, 5000); n("hk_fund", 0, 1000); n("hk_knife", 0, 100); n("hk_size", 0.5, 50); n("hk_z", 2, 30); n("hk_r", 50, 5000); n("hk_v", 1, 50); n("hk_d1", 0, 5); n("hk_d2", 0, 5); n("hk_w", 1, 120); n("hk_h", 1, 600); n("hk_stop", 0, 95); n("hk_max", 1, 30);
  c.hk_on = c.hk_on !== false; c.hk_spot = !!c.hk_spot;
  n("lv_cap", 10, 1e7); n("lv_lev", 1, 5); n("lv_daily", 1, 50); c.lv_on = !!c.lv_on; c.lv_env = c.lv_env === "live" ? "live" : "demo";
  if (!c.fut && !c.spot) c.fut = true;
  return c;
}
function newState(c, now) {
  return { v: 2, start: c.capital, cash: c.capital, peak: c.capital, day: { d: vnDay(now), eq0: c.capital }, pos: {}, ord: {}, hk: {}, hkc: {}, byS: {}, trades: [], LP: {}, eq: [], log: [], seq: 1,
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
    // tỉ lệ funding sắp chốt của mọi hợp đồng: { sym: { r, next } } (r = số thập phân, next = ms)
    async fund() {
      const r = await get("https://api.bybit.com/v5/market/tickers?category=linear"); if (!r.ok) return null;
      const o = {}; for (const x of (await r.json()).result?.list || []) if (x.fundingRate !== "" && +x.nextFundingTime > 0) o[x.symbol] = { r: +x.fundingRate, next: +x.nextFundingTime };
      return o;
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
  bars: (sym) => `https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=1m&limit=62`,
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
  bars: (sym) => `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1m&limit=62`,
  async fund() {      // 1 lần gọi cho mọi hợp đồng: tỉ lệ funding của kỳ đang chạy + giờ chốt kế tiếp
    const r = await get("https://fapi.binance.com/fapi/v1/premiumIndex"); if (!r.ok) return null;
    const o = {}; for (const x of (await r.json()) || []) if (+x.nextFundingTime > 0) o[x.symbol] = { r: +x.lastFundingRate || 0, next: +x.nextFundingTime };
    return o;
  },
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
  on.book(mk, +B[0][0], bq, +A[0][0], aq, +B[0][1], +A[0][1]);
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
    this.notes = [];      // thông báo chờ gửi (chuông + đẩy điện thoại)
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
    if (!this.S || (c.reset_at && c.reset_at !== this.S.reset_seen)) {   // làm lại TÀI KHOẢN sàn thử – GIỮ nguyên kiến thức đã học
      const old = this.S; this.S = newState(c, now);
      if (old) { this.S.LP = old.LP || {}; this.S.LPt = old.LPt || {}; this.S.SH = old.SH || {}; this.S.wipe_seen = old.wipe_seen; this.S.brainAt = old.brainAt; }
      this.S.wipe_seen ??= c.wipe_at || null;
      this.say(now, this.upgraded ? `Nâng cấp lên bản quét toàn thị trường – tài khoản sàn thử mới ${c.capital} USDT` : `Khởi tạo tài khoản lướt giây trên sàn thử: ${c.capital} USDT${old ? " (giữ nguyên bộ nhớ học)" : ""}`); this.upgraded = false;
    }
    if (c.wipe_at && c.wipe_at !== this.S.wipe_seen) {             // anh bấm "xoá bộ học" → học lại từ đầu, xoá cả bản lưu dùng chung
      this.S.wipe_seen = c.wipe_at; this.S.LP = {}; this.S.LPt = {}; this.S.SH = {}; this.LM = {};
      await this.kv.delete([...(await this.kv.list({ prefix: "LM:" })).keys()]).catch(() => {});
      try { await this.io.saveBrain?.(this.uid, null); } catch (e) { /* bỏ qua */ }
      this.say(now, "🧹 Đã xoá bộ nhớ học – bot học lại từ đầu", "info");
    }
    this.migrate(now);
    if (!this.brainTried) { this.brainTried = true; await this.loadBrain(now); }
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
  // bảng học bản trước (chưa tách bối cảnh) không dùng chung được với bản mới → bỏ, học lại theo bối cảnh
  migrate(now) {
    const S = this.S, old = Object.keys(S.LP || {}).filter((g) => g.length === 2);
    if (!old.length) return;
    for (const g of old) delete S.LP[g];
    S.LPt = {};
    this.say(now, "Bộ học chuyển sang học riêng theo bối cảnh (thuận/ngược xu hướng 15 phút × cùng/ngược BTC) – học lại, khởi động lại thời gian học tối thiểu", "info");
  }
  brainOut() {
    const S = this.S, LP = {}, LM = {};
    let n = 0;
    for (const [g, L] of Object.entries(S.LP)) { LP[g] = L.map((row) => row.map((q) => [q[0], +q[1].toFixed(4), +q[2].toFixed(4)])); n += L.reduce((a, row) => a + row[0][0], 0); }
    for (const [k, L] of Object.entries(this.LM)) LM[k] = L.map((row) => row.map((q) => [q[0], +q[1].toFixed(3)]));
    const SH = {}; for (const [k, q] of Object.entries(S.SH || {})) if (q[0] + q[4] > 0) SH[k] = q.map((v, i) => (i === 1 || i === 2 || i === 3 ? +v.toFixed(4) : v));
    return { sch: BRAIN_SCH, at: new Date().toISOString(), where: this.where, host: this.io.host || null, n, coins: Object.keys(LM).length, LP, LPt: S.LPt || {}, LM, SH };
  }
  // nạp kiến thức đã lưu: ô nào bản lưu có nhiều mẫu hơn thì lấy bản lưu (máy mới / sau khi cài lại không phải học lại từ đầu)
  brainIn(b) {
    if (!b || !schOK(b.sch)) return 0;
    const S = this.S; let k = 0;
    S.LP ||= {}; S.LPt ||= {};
    for (const [g, L] of Object.entries(b.LP || {})) { const me = S.LP[g]; if (!me || me.reduce((a, r) => a + r[0][0], 0) < L.reduce((a, r) => a + r[0][0], 0)) { S.LP[g] = L; k++; } }
    for (const [g, t] of Object.entries(b.LPt || {})) S.LPt[g] = Math.min(S.LPt[g] || Infinity, t);
    S.SH ||= {}; for (const [k, q] of Object.entries(b.SH || {})) if (!S.SH[k] || S.SH[k][0] + S.SH[k][4] < q[0] + q[4]) S.SH[k] = q;      // kết quả lệnh ảo / lệnh thật đã kiểm nghiệm
    for (const [id, L] of Object.entries(b.LM || {})) { const me = this.LM[id]; if (!me || me.reduce((a, r) => a + r[0][0], 0) < L.reduce((a, r) => a + r[0][0], 0)) this.LM[id] = L; }
    return k;
  }
  async loadBrain(now) {
    if (!this.io.loadBrain) return;
    try {
      const b = await this.io.loadBrain(this.uid);
      if (!b) return;
      if (!schOK(b.sch)) { this.say(now, "Bộ nhớ học đã lưu thuộc phiên bản khác – không nạp, học mới", "info"); return; }
      const k = this.brainIn(b);
      this.say(now, `🧠 Nạp bộ nhớ học đã lưu (${String(b.at).slice(0, 16).replace("T", " ")} UTC, ${b.n} mẫu, ${b.coins} coin) – ${k} bảng nhóm được bổ sung`, "info");
    } catch (e) { this.err("nạp bộ nhớ học " + e.message); }
  }
  async saveBrain() {
    if (!this.io.saveBrain || !this.S) return;
    try { const b = this.brainOut(); await this.io.saveBrain(this.uid, b); this.S.brainAt = b.at; this.S.brainN = b.n; this.S.brainCoins = b.coins; } catch (e) { this.err("lưu bộ nhớ học " + e.message); }
  }
  // xu hướng: giá đi bao nhiêu trong `mins` phút, chia cho mức dao động kỳ vọng (dao động mỗi giây × √số giây)
  trendZ(x, mins, vol) {
    const L = x.m1; if (!L || L.length < mins + 1) return null;
    const then = L[L.length - 1 - mins][1], now = L[L.length - 1][1];
    return (now / then - 1) * 1e4 / (Math.max(0.05, vol ?? x.vol ?? 1) * Math.sqrt(60 * mins));
  }
  note(key, sev, title, body, url = "#/bot/scalp") { if (this.notes.length < 50) this.notes.push({ key, sev, title, body, url }); }
  say(now, m, k = "info") { this.S.log = [...(this.S.log || []).slice(-79), { t: iso(now), k, m }]; if (k === "stop" && this.S.days) { const D = this.dayRec(now); D.ev = [...(D.ev || []).slice(-9), [iso(now).slice(11, 16), m.slice(0, 160)]]; } }
  // ---------------------------------------------------------------- KẾT QUẢ THEO NGÀY (giờ Việt Nam) – lưu lâu dài, trang "Kết quả theo ngày" đọc để vẽ biểu đồ & rút bài học
  dayRec(now, d = vnDay(now)) {
    const S = this.S, D = ((S.days ||= {})[d] ||= { n: 0, usd: 0, bps: 0, fees: 0, win: 0, by: {}, coins: {}, why: {}, f6: 0, knife: 0, seen: 0, placed: 0, ev: [] });
    return D;
  }
  daysInit() {      // lần đầu: dựng lại các ngày cũ từ lịch sử lệnh còn giữ (≤ 300 lệnh gần nhất)
    this.S.days = {}; this.S.dtr = {};
    for (const t of this.S.trades || []) this.dayAdd(t, (t.fee || 0) * Math.abs(t.usd || 0) / Math.max(1, Math.abs(t.net || 1)));
    this.say(Date.now(), `📅 Bắt đầu lưu kết quả theo ngày – dựng lại ${Object.keys(this.S.days).length} ngày từ lịch sử lệnh`, "info");
  }
  dayAdd(t, feeUsd) {
    const d = vnDay(Date.parse(t.t1 + "Z")), D = this.dayRec(0, d), st = t.strat || "sec", coin = t.k.split(":")[0];
    D.n++; D.usd += t.usd || 0; D.bps += t.net || 0; D.fees += feeUsd || 0; if (t.usd > 0) D.win++;
    if (t.fu) D.fund = r2((D.fund || 0) + t.fu, 4);      // funding USDT (+ nhận / − trả) đã nằm trong t.usd
    const b = (D.by[st] ||= { n: 0, usd: 0, win: 0 }); b.n++; b.usd += t.usd || 0; if (t.usd > 0) b.win++;
    const k = (D.coins[coin] ||= [0, 0]); k[0]++; k[1] += t.usd || 0;
    const w = (D.why[t.why] ||= [0, 0]); w[0]++; w[1] += t.usd || 0;
    const L = ((this.S.dtr ||= {})[d] ||= []);
    if (L.length < 400) L.push([t.t1.slice(11, 16), t.k, t.side, st, r2(t.usd, 3), r2(t.net, 1), t.why, t.lv || null, r2(t.hold, 0)]);
  }
  daysOut() {
    const S = this.S, keys = Object.keys(S.days || {}).sort(), dk = Object.keys(S.dtr || {}).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete S.days[k];
    for (const k of dk.slice(0, Math.max(0, dk.length - 90))) delete S.dtr[k];
    return { days: S.days || {}, dtr: S.dtr || {}, start: S.start, eq: r2(this.equity(), 2), at: iso(Date.now()) };
  }
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
        if (SRC[id].bars) this.backfill(f, id).catch((e) => this.err("nạp nến " + e.message));
        this.say(Date.now(), `Kết nối ${name}: ${id} · quét ${U.length} thị trường (khối lượng 24h ≥ ${c.min_vol} triệu USD)${wss.length > 1 ? ` · ${wss.length} kết nối` : ""}`);
        return;
      } catch (e) { this.err(`${id} ${name}: ${e.message}`); for (const w of opened) { if (!f.wss.includes(w)) { try { w.close(1000, "lỗi"); } catch (x) { /* bỏ qua */ } } } }
    }
    this.say(Date.now(), `Không kết nối được nguồn dữ liệu ${name} nào – thử lại sau 10 giây`, "stop");
  }
  // khởi động lại không phải chờ 15–30 phút: tải ngay 62 nến 1 phút gần nhất của từng coin (8 yêu cầu song song, nhẹ nhàng với giới hạn của sàn)
  async backfill(f, id) {
    const L = [...f.list], url = SRC[id].bars; let ok = 0, i = 0;
    const work = async () => {
      while (i < L.length) {
        const u = L[i++], x = this.M[u.id]; if (!x || x.m1.length >= 32) continue;
        try {
          const r = await fetch(url(u.sym), { signal: AbortSignal.timeout(10000) }); if (!r.ok) continue;
          const K = await r.json(); if (!Array.isArray(K) || K.length < 2) continue;
          const bars = K.map((k) => [Math.floor(+k[0] / 60000), +k[4], +k[2], +k[3], +k[7]]), last = x.m1[x.m1.length - 1];
          if (last && bars[bars.length - 1][0] === last[0]) { last[4] = Math.max(last[4] || 0, bars[bars.length - 1][4]); bars[bars.length - 1] = last; }
          x.m1 = bars.slice(-62); ok++;
        } catch (e) { /* bỏ qua coin này */ }
        await sleep(60);
      }
    };
    await Promise.all(Array.from({ length: 8 }, work));
    this.say(Date.now(), `Nạp nến 1 phút cho ${ok}/${L.length} thị trường ${f.t === "F" ? "futures" : "spot"} – biết ngay xu hướng 15 phút & vùng giá 60 phút, không phải chờ`, "info");
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
    for (const f of Object.values(this.F)) {        // mất dữ liệu > 2 phút → báo; có lại → báo
      const now2 = Date.now(), nm = f.t === "F" ? "futures" : "spot";
      if (!f.ws || now2 - f.last > 60000) { f.downAt ||= now2; if (now2 - f.downAt > 120000 && !f.downNoted) { f.downNoted = true; this.note(`down:${nm}:${f.downAt}`, 2, `⚠️ Bot lướt giây mất dữ liệu ${nm}`, `Không nhận được dữ liệu từ ${f.src || "sàn"} hơn 2 phút – bot đang thử kết nối lại.`); } }
      else { if (f.downNoted) this.note(`up:${nm}:${now2}`, 1, `✅ Bot lướt giây có lại dữ liệu ${nm}`, `Đã kết nối lại ${f.src}.`); f.downAt = 0; f.downNoted = false; }
    }
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
      book: (x, b, bq, a, aq, b1, a1) => { if (b) { x.bid = b; if (bq != null) { x.bq = bq; x.b1q = b1 ?? bq; } } if (a) { x.ask = a; if (aq != null) { x.aq = aq; x.a1q = a1 ?? aq; } } x.tb = now; if (x.bid && x.ask) this.onBook(x, now); },
      trade: (x, p, q, side) => { if (!(p > 0 && q > 0)) return; if (side > 0) x.sec.buy += q * p; else x.sec.sell += q * p;
        const mv = Math.floor(now / 60000); if (!x.vm || x.vm[0] !== mv) { x.vmp = x.vm; x.vm = [mv, 0]; } x.vm[1] += q * p * (x.ct || 1);      // khối lượng (USDT) từng phút
        this.onTrade(x, p, q, side, now); },
    });
    const sec = Math.floor(now / 1000);
    if (sec > this.lastSec) { this.lastSec = sec; try { this.second(now); } catch (e) { this.err("second: " + e.message); } }
  }
  mk(id, t) { return (this.M[id] ||= { id, t, sym: "", ct: 1, qv: 0, g: t + "3", m1: [], sh: [], shT: {}, vol: 1, bid: 0, ask: 0, bq: 0, aq: 0, tb: 0, sec: { buy: 0, sell: 0 }, flow: [], mids: [], pend: [] }); }

  // ---------------------------------------------------------------- mỗi giây: tín hiệu → bộ học → chọn cơ hội tốt nhất toàn thị trường
  second(now) {
    const c = this.cfg, S = this.S;
    const day = vnDay(now), eqNow = this.equity();
    if (S.day.d !== day) {
      const D = S.dstat; if (D && D.d === S.day.d && (D.n || D.sh)) this.note(`day:${D.d}`, 2, `📊 Bot lướt giây – tổng kết ${D.d}`, `${D.n} lệnh thật · ${(eqNow / S.day.eq0 - 1) * 100 >= 0 ? "+" : ""}${((eqNow / S.day.eq0 - 1) * 100).toFixed(2)}% · ròng ${D.net >= 0 ? "+" : ""}${D.net.toFixed(2)} USDT · phí ${D.fees.toFixed(2)} · thắng ${D.n ? Math.round(D.win / D.n * 100) : 0}%`);
      S.dstat = { d: day, n: 0, net: 0, fees: 0, win: 0 };
      if (S.days) { const P = this.dayRec(0, S.day.d); P.eq0 ??= r2(S.day.eq0, 2); P.eq1 = r2(eqNow, 2); }
      S.day = { d: day, eq0: eqNow }; if (S.pause?.kind === "day" || S.pause?.kind === "target") { S.pause = null; this.say(now, "Sang ngày mới – chạy lại"); }
    }
    S.peak = Math.max(S.peak, eqNow);
    const m1 = Math.floor(now / 60000);
    if (!S.eq.length || S.eq[S.eq.length - 1][0] < m1) {
      S.eq = [...S.eq.slice(-1440), [m1, r2(eqNow, 2)]];
      if (!S.days) this.daysInit();
      const D = this.dayRec(now); D.eq0 ??= r2(S.day.eq0, 2); D.eq1 = r2(eqNow, 2); D.pk = Math.max(D.pk || D.eq0, eqNow); D.mdd = r2(Math.max(D.mdd || 0, (1 - eqNow / D.pk) * 100), 2);
      const bx = this.M["BTC:F"] || this.M["BTC:S"]; if (bx?.bid) { const m = (bx.bid + bx.ask) / 2; D.btc0 ??= r2(m, 2); D.btc1 = r2(m, 2); }
      if (m1 % 60 === 0) D.pos = Object.keys(S.pos).length;
    }
    try { this.fundTick(now); } catch (e) { this.err("funding " + e.message); }
    try { this.hkvTick(now); } catch (e) { this.err("kiểm chứng bộ lọc " + e.message); }
    const dayPct = (eqNow / S.day.eq0 - 1) * 100;
    if (!S.pause && dayPct <= -c.daily_stop) { S.pause = { kind: "day", why: `lỗ ${dayPct.toFixed(2)}% hôm nay (giới hạn ${c.daily_stop}%)`, until: null }; this.say(now, `⛔ Dừng tới hết ngày: ${S.pause.why}`, "stop"); this.note(`stop:${day}`, 2, "⛔ Bot lướt giây dừng tới hết ngày", S.pause.why); }
    if (S.pause?.until && now >= S.pause.until) { this.say(now, "Hết giờ nghỉ – đánh giá lại", "info"); S.pause = null; }
    if (!S.pause && c.day_lock && c.day_target > 0 && dayPct >= c.day_target && !Object.keys(S.pos).length) {     // CHỐT NGÀY: đạt mục tiêu → giữ thành quả
      S.pause = { kind: "target", why: `đạt mục tiêu ngày +${dayPct.toFixed(2)}% (mục tiêu ${c.day_target}%) – chốt lời, ngừng mở lệnh thật tới hết ngày; lệnh ảo vẫn chạy để học`, until: null };
      this.say(now, `🎯 ${S.pause.why}`, "info"); this.note(`target:${day}`, 2, `🎯 Bot lướt giây đạt mục tiêu ngày +${dayPct.toFixed(2)}%`, "Chốt lời, ngừng mở lệnh thật tới hết ngày – lệnh ảo vẫn chạy để học.");
    }
    S.hk ||= {}; S.hkc ||= {}; S.byS ||= {};
    for (const [id, H] of Object.entries(S.hk)) if (now > H.exp) { delete S.hk[id]; if (!H.lv.some((l) => l.f)) this.say(now, `🪝 ${id.split(":")[0]}: hết ${c.hk_w} phút giá không xuống tới lệnh chờ – huỷ`, "info"); }
    const kk = c.k + (S.kadd || 0), hourN = this.tradesLastHour(now), nOpen = Object.values(S.pos).filter((p) => p.strat !== "hook").length + Object.keys(S.ord).length;
    const live = {}, cnt = { all: 0, learn: 0, fee: 0, go: 0, skip: 0, hold: 0, stale: 0 }, cand = [];
    const bx = this.M["BTC:F"] || this.M["BTC:S"], bz = bx ? this.trendZ(bx, 5) : null;      // BTC 5 phút: dẫn dắt cả thị trường
    if (bx) try { this.btcShock(bx, now); } catch (e) { this.err("btc shock " + e.message); }
    for (const id in this.M) {
      const x = this.M[id]; if (!x.bid || !x.ask || x.ask <= x.bid) continue;
      cnt.all++;
      const mid = (x.bid + x.ask) / 2, spread = (x.ask - x.bid) / mid * 1e4;
      x.flow.push([x.sec.buy, x.sec.sell]); x.sec = { buy: 0, sell: 0 }; if (x.flow.length > 10) x.flow.shift();
      x.mids.push(mid); if (x.mids.length > 61) x.mids.shift();
      const mm = Math.floor(now / 60000), lb = x.m1[x.m1.length - 1];
      if (!lb || lb[0] < mm) {
        if (lb) { const v = x.vm?.[0] === lb[0] ? x.vm[1] : x.vmp?.[0] === lb[0] ? x.vmp[1] : null; if (v != null) lb[4] = Math.max(lb[4] || 0, v); try { this.hookBar(x, lb, now); } catch (e) { this.err("hook " + e.message); } }
        x.m1.push([mm, mid, mid, mid]); if (x.m1.length > 62) x.m1.shift();
      } else { lb[1] = mid; if (!(lb[2] >= mid)) lb[2] = mid; if (!(lb[3] <= mid)) lb[3] = mid; }
      this.manageTime(x, now); this.shTime(x, now);
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
      x.sNow = s;      // tín hiệu hiện tại – cho thoát linh hoạt
      const g = (x.g = x.t + tierOf(x.qv));
      x.vol = vol;
      const z15 = this.trendZ(x, 15, vol);
      if (z15 == null) {       // chưa đủ 15 phút giá → chưa biết xu hướng → chưa học, chưa vào lệnh
        if (!S.pos[id]) { cnt.learn++; live[id] = { t: x.t, g, mid: r2(mid, 8), spread: r2(spread, 2), s: r2(s, 2), tfi: r2(tfi, 2), obi: r2(obi, 2), mz: r2(mz, 2), vol: r2(vol, 2), qv: r2(x.qv, 1), bin, side, cost: null, best: null, v: "learn", why: `đang gom giá 15 phút để biết xu hướng (${x.m1.length - 1}/15 phút)` }; }
        continue;
      }
      const tc = Math.abs(z15) < ZT ? "0" : Math.sign(z15) === side ? "T" : "N";
      const bc = id.startsWith("BTC:") || bz == null || Math.abs(bz) < ZT || Math.sign(bz) === side ? "+" : "-";
      const gk = g + tc + bc;
      // bộ học: chốt các mẫu đã đủ thời gian (gộp theo nhóm – đơn vị biến động; riêng từng coin – bps)
      const LP = fit((S.LP[gk] ||= newCell()), 3), LM = fit((this.LM[id] ||= Array.from({ length: NB }, () => HS.map(() => [0, 0]))), 2);
      // chỉ học các mốc ≤ thời gian giữ tối đa đang cài (đỡ tốn bộ nhớ/CPU khi quét hàng trăm thị trường); con trỏ theo từng mốc → mỗi mẫu chỉ xử lý 1 lần
      const nh = HS.filter((h) => h <= c.hmax).length, hl = HS[nh - 1];
      x.pend.push([now, side, bin, mid, vol, gk]);
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
      const costT = 2 * ft * 100 + spread, costM = (fm + ft) * 100;
      const cost = c.mode === "maker" ? costM : costT;          // để hiển thị
      const pass = [];          // tầng 1: các (cách khớp, mốc giữ) có kỳ vọng thận trọng vượt chi phí
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
        for (const [m, cm] of [["T", costT], ["M", costM]]) if (exp - cm >= c.min_net) pass.push({ m, h, exp, raw, se, cost: cm, net: exp - cm, strict: exp >= kk * cm });   // lệnh ảo: chỉ cần vượt phí; lệnh thật: thêm ngưỡng k × chi phí
      }
      const t0g = (S.LPt ||= {})[g] ||= now, warm = now - t0g >= c.warm * 60000;
      let v = "learn", why, rc = null;
      const cx = `${CTX_VI[tc]} · ${CTX_VI[bc]}`;
      if (!best) why = `đang học: nhóm ${g} (${cx}) mới ${LP[bin].reduce((a, q) => Math.max(a, q[0]), 0)}/${c.min_n} mẫu`;
      else if (!warm) { why = `đang khởi động: nhóm ${g} mới học ${Math.floor((now - t0g) / 60000)}/${c.warm} phút – chưa cho vào lệnh`; best = { ...best, warm: false }; }
      else why = `${cx}: lợi thế kỳ vọng ${best.exp.toFixed(2)} bps (giữ ${best.h}s) so với chi phí khứ hồi ${cost.toFixed(2)} bps → ròng sau phí ${best.net >= 0 ? "+" : ""}${best.net.toFixed(2)} bps`;
      const zone = this.zoneOf(x, side, mid);
      const canShadow = best && pass.length && !(x.t === "S" && side < 0) && spread <= c.spread_max && !(x.t === "F" && nearFunding(now, Math.max(...pass.map((q) => q.h))));
      if (canShadow) this.shSpawn(x, side, pass, gk, zone, vol, now);
      // tầng 2: chọn (cách khớp, mốc giữ) đã được lệnh ảo chứng minh – cận dưới lời ròng ≥ ngưỡng
      // cách khớp × cách thoát: "T"/"M" = thoát đúng giờ; "TD"/"MD" = THOÁT LINH HOẠT (ra sớm khi tín hiệu đảo chiều, giữ thêm tới 2× khi tín hiệu còn thuận & đang lãi)
      const modes = c.mode === "auto" ? ["T", "M", "TD", "MD"] : c.mode === "maker" ? ["M", "MD"] : ["T", "TD"];
      let pick = null, seen = null;
      for (const q0 of pass.flatMap((q) => [q, { ...q, m: q.m + "D" }])) {
        const q = q0;
        if (!modes.includes(q.m)) continue;
        const st = this.shStat(this.shKeys(q.m, g, gk, zone, q.h));
        if (st && (!seen || st.lcb > seen.lcb)) seen = { ...st, m: q.m, h: q.h };
        if (st && st.lcb >= c.min_net && !(S.proven ||= {})[st.key]) {
          S.proven[st.key] = day; const nd = Object.values(S.proven).filter((d) => d === day).length;
          if (nd <= 6) this.note(`proven:${st.key}`, 2, "🧪 Lệnh ảo vừa chứng minh một tình huống có lời", `${keyVI(st.key)}: ${st.n} lệnh ảo, ròng TB +${st.mean.toFixed(1)} bps (thận trọng +${st.lcb.toFixed(1)}) – bot sẽ đánh thật tình huống này`);
        }
        if (st && q.strict && st.lcb >= c.min_net && (!pick || st.lcb / Math.sqrt(q.h) > pick.sc)) pick = { ...q, st, sc: st.lcb / Math.sqrt(q.h) };
      }
      const ok = !!pick;
      if (S.pos[id]) v = "hold";
      else if (S.ord[id]) v = "order";
      else if (!best || best.warm === false) v = "learn";
      else if (!pass.length) { v = "fee"; why += best.net < c.min_net ? ` – cần ròng ≥ ${c.min_net} bps` : ` – cần kỳ vọng ≥ ${kk.toFixed(1)}× chi phí = ${(kk * cost).toFixed(2)} bps`; }
      else if (!ok) { v = "verify"; why = `${cx} · ${ZONE_VI[zone]}: đạt tầng 1, ` + (seen ? `lệnh ảo ${seen.m[0] === "M" ? "maker" : "taker"} ${seen.m[1] === "D" ? "thoát linh hoạt quanh" : "giữ"} ${seen.h}s: ${seen.n} lệnh, ròng TB ${seen.mean >= 0 ? "+" : ""}${seen.mean.toFixed(1)} bps (thận trọng ${seen.lcb >= 0 ? "+" : ""}${seen.lcb.toFixed(1)}) → chưa chứng minh có lời, chỉ đánh ảo` : `đang kiểm nghiệm bằng lệnh ảo (cần ≥ ${c.sh_min} lệnh ảo cùng loại tình huống)`); }
      else if (x.t === "S" && side < 0) { v = "skip"; rc = "short"; why = "tín hiệu bán nhưng spot không bán khống được – đứng ngoài"; }
      else if (S.pause) { v = "pause"; rc = "pause"; why = `tạm dừng: ${S.pause.why}`; }
      else if (spread > c.spread_max) { v = "skip"; rc = "spread"; why = `chênh lệch mua/bán ${spread.toFixed(2)} bps > ${c.spread_max} – bỏ qua vì chênh lệch quá rộng`; }
      else if (x.t === "F" && nearFunding(now, best.h)) { v = "skip"; rc = "funding"; why = "lệnh sẽ giữ qua giờ funding – đứng ngoài"; }
      else if (S.cool[id] && now < S.cool[id]) { v = "skip"; rc = "cool"; why = `vừa đóng lệnh coin này – nghỉ thêm ${Math.ceil((S.cool[id] - now) / 1000)} giây`; }
      else { v = "go"; why = `${cx} · ${ZONE_VI[zone]}: lệnh ảo ${pick.m[0] === "M" ? "maker" : "taker"} ${pick.m[1] === "D" ? "thoát linh hoạt quanh" : "giữ"} ${pick.h}s đã chứng minh: ${pick.st.n} lệnh, ròng TB +${pick.st.mean.toFixed(1)} bps (thận trọng +${pick.st.lcb.toFixed(1)})`; cand.push({ x, side, best: { ...pick, sc: pick.sc }, cost: pick.cost, vol, mid, spread, ctx: tc + bc, zone, keys: this.shKeys(pick.m, g, gk, zone, pick.h), mode: pick.m[0] }); }
      cnt[v === "order" || v === "hold" ? "hold" : v === "pause" ? "skip" : v] = (cnt[v === "order" || v === "hold" ? "hold" : v === "pause" ? "skip" : v] || 0) + 1;
      live[id] = { t: x.t, g, tc, bc, zone, rc, cT: r2(costT, 2), cM: r2(costM, 2), z15: r2(z15, 2), mid: r2(mid, 8), spread: r2(spread, 2), s: r2(s, 2), tfi: r2(tfi, 2), obi: r2(obi, 2), mz: r2(mz, 2), vol: r2(vol, 2), qv: r2(x.qv, 1), bin, side, cost: r2(cost, 2),
        best: best ? { h: best.h, exp: r2(best.exp, 2), raw: r2(best.raw, 2), se: r2(best.se, 2), net: r2(best.net, 2), n: best.n, nq: best.nq } : null, v, why };
    }
    // chọn: tối đa 1 lệnh mới mỗi giây – ứng viên có lợi thế ròng / √thời gian giữ cao nhất, trong giới hạn vị thế & số lệnh/giờ
    cand.sort((a, b) => b.best.sc - a.best.sc);
    const top = cand[0];
    S.ent = (S.ent || []).filter((t) => now - t < 300e3);
    const book = this.book();
    if (top) {
      if (nOpen >= c.max_pos) { live[top.x.id].v = "skip"; live[top.x.id].rc = "cap"; live[top.x.id].why = `đạt chuẩn nhưng đã mở ${nOpen}/${c.max_pos} vị thế`; }
      else if (hourN >= c.max_h) { live[top.x.id].v = "skip"; live[top.x.id].rc = "hour"; live[top.x.id].why = `đạt chuẩn nhưng đã ${hourN} lệnh trong 1 giờ (tối đa ${c.max_h})`; }
      // CÙNG CHIỀU = CÙNG 1 VÁN CƯỢC: nhiều coin cùng Long (hoặc cùng Short) lúc thị trường đảo sẽ thua cả loạt → giới hạn số lệnh cùng chiều & số lệnh mới trong 5 phút
      else if (book.ids.length && (this._rq = this.corrRisk([...book.ids, top.x.id], [...book.sides, top.side], now)) > c.max_side + 1e-9) {
        const r0 = this.corrRisk(book.ids, book.sides, now);
        live[top.x.id].v = "skip"; live[top.x.id].rc = "side";
        live[top.x.id].why = `đạt chuẩn nhưng rủi ro tương quan của danh mục sẽ thành ${this._rq.toFixed(1)} lệnh tương đương (đang ${r0.toFixed(1)}, tối đa ${c.max_side}) – lệnh này đi cùng nhịp với các lệnh đang giữ`;
      }
      else if (S.ent.length >= c.burst) { live[top.x.id].v = "skip"; live[top.x.id].rc = "burst"; live[top.x.id].why = `đã vào ${S.ent.length} lệnh trong 5 phút – chờ kết quả rồi mới vào tiếp (tối đa ${c.burst})`; }
      else { top.x.ctx = top.ctx; top.x.zone = top.zone; top.x.shk = top.keys; this.enter(top.x, top.side, top.best, top.cost, top.vol, now, top.mode); }
      for (const q of cand.slice(1)) { live[q.x.id].v = "skip"; live[q.x.id].rc = "better"; live[q.x.id].why = "đạt chuẩn nhưng có cơ hội tốt hơn trong giây này (mỗi giây tối đa 1 lệnh mới)"; }
    }
    this.live = live; this.cnt = cnt;
    // cầu dao kỷ luật: 50 lệnh gần nhất ròng âm → nghỉ 30 phút + nâng ngưỡng
    // chỉ tính lệnh thật đã qua kiểm nghiệm lệnh ảo, trong 24 giờ qua (lệnh cũ trước khi có kiểm nghiệm không làm bot tự trói tay)
    const T = S.trades.filter((t) => t.val && now - Date.parse(t.t1 + "Z") < 864e5).slice(-50);
    if (S.kadd > 1) S.kadd = 1;
    if (S.kadd > 0 && now - (S.brk || 0) > 2 * 3600e3 && now - (S.kdec || 0) > 3600e3) { S.kdec = now; S.kadd = Math.max(0, +(S.kadd - 0.2).toFixed(2)); }   // 2 giờ không phạm → mỗi giờ hạ dần ngưỡng
    // cầu dao NHANH: 6/8 lệnh lướt giây gần nhất (trong 2 giờ) thua → thị trường vừa đổi tính chất, nghỉ 60 phút cho bảng kiểm nghiệm kịp cập nhật
    const R8 = S.trades.filter((t) => t.strat !== "hook" && now - Date.parse(t.t1 + "Z") < 2 * 3600e3).slice(-8), s8 = R8.reduce((a, t) => a + t.net, 0);
    if (!S.pause && R8.length >= 8 && R8.filter((t) => t.net < 0).length >= 6 && s8 < 0 && (!S.brk2 || now - S.brk2 > 3 * 3600e3)) {
      S.brk2 = now;
      S.pause = { kind: "brk", why: `${R8.filter((t) => t.net < 0).length}/8 lệnh lướt giây gần nhất thua (ròng ${s8.toFixed(0)} bps) trong 2 giờ – thị trường vừa đổi tính chất; nghỉ 60 phút (Bắt râu sập vẫn chạy)`, until: now + 3600e3 };
      this.say(now, `⛔ ${S.pause.why}`, "stop"); this.note(`brk2:${now}`, 2, "⛔ Bot lướt giây nghỉ 60 phút", S.pause.why);
    }
    if (!S.pause && T.length >= 50 && T.reduce((a, t) => a + t.net, 0) < 0 && (!S.brk || now - S.brk > 3600e3)) {
      S.brk = now; S.kadd = Math.min(1, (S.kadd || 0) + 0.2);
      S.pause = { kind: "brk", why: `50 lệnh gần nhất ròng ${T.reduce((a, t) => a + t.net, 0).toFixed(1)} bps (âm) – phí đang ăn hết biên lời; nghỉ 30 phút, nâng ngưỡng vào lệnh lên ${(c.k + S.kadd).toFixed(1)}× chi phí khứ hồi`, until: now + 1800e3 };
      this.say(now, `⛔ ${S.pause.why}`, "stop"); this.note(`brk:${now}`, 2, "⛔ Bot lướt giây nghỉ 30 phút", S.pause.why);
    }
  }
  // ---------------------------------------------------------------- RỦI RO TƯƠNG QUAN CỦA DANH MỤC
  // Mỗi lệnh lướt giây được định cỡ theo rủi ro (cắt lỗ ∝ dao động) → mỗi lệnh ≈ 1 đơn vị rủi ro. Rủi ro danh mục = √(Σᵢⱼ sᵢ sⱼ ρᵢⱼ), sᵢ = ±1 (Long/Short),
  // ρ = tương quan lợi suất 1 phút trong 60 phút gần nhất. 3 lệnh cùng chiều tương quan hoàn toàn = 3; 9 lệnh độc lập = 3; Long A + Short B tương quan cao ≈ phòng hộ.
  // Thận trọng: ρ co về mô hình 1 nhân tố (ρᵢ,BTC × ρⱼ,BTC) vì 60 điểm còn nhiễu; phần "phòng hộ" chỉ được tính một nửa vì lúc sập mạnh tương quan dồn về 1.
  book() {
    const ids = [], sides = [];
    for (const [id, p] of Object.entries(this.S.pos)) if (p.strat !== "hook") { ids.push(id); sides.push(p.side); }
    for (const [id, o] of Object.entries(this.S.ord)) if (!ids.includes(id)) { ids.push(id); sides.push(o.side); }
    return { ids, sides };
  }
  rets(x, mm) {
    if (!x?.m1?.length) return null;
    if (x._rm?.mm === mm) return x._rm.m;
    const L = x.m1, m = new Map();
    for (let i = 1; i < L.length; i++) if (L[i][0] < mm && L[i][0] === L[i - 1][0] + 1 && L[i][1] > 0 && L[i - 1][1] > 0) m.set(L[i][0], Math.log(L[i][1] / L[i - 1][1]));
    x._rm = { mm, m }; return m;
  }
  pcorr(a, b) {
    if (!a || !b) return null;
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (const [k, va] of a) { const vb = b.get(k); if (vb == null) continue; n++; sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb; }
    if (n < 30) return null;
    const cv = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    return va > 0 && vb > 0 ? clamp(cv / Math.sqrt(va * vb), -1, 1) : null;
  }
  corrRisk(ids, sides, now) {
    const mm = Math.floor(now / 60000), R = ids.map((id) => this.rets(this.M[id], mm)), B = this.rets(this.M["BTC:F"] || this.M["BTC:S"], mm);
    const rb = ids.map((id, i) => (id.startsWith("BTC:") ? 1 : this.pcorr(R[i], B) ?? 0.6));      // chưa đủ dữ liệu → coi như đi cùng BTC khá chặt (thận trọng)
    let tot = 0;
    for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) {
      let rho = 1;
      if (i !== j) { const f = rb[i] * rb[j], pc = ids[i].split(":")[0] === ids[j].split(":")[0] ? 1 : this.pcorr(R[i], R[j]); rho = pc == null ? f : 0.7 * pc + 0.3 * f; }
      let c = sides[i] * sides[j] * rho; if (c < 0) c *= 0.5;
      tot += c;
    }
    return Math.sqrt(Math.max(0, tot));
  }
  tradesLastHour(now) { let n = 0; for (let i = this.S.trades.length - 1; i >= 0 && now - Date.parse(this.S.trades[i].t1 + "Z") < 3600e3; i--) n++; return n; }

  // ---------------------------------------------------------------- vào / ra lệnh (sàn thử, khớp theo sổ lệnh thật)
  used() { let u = 0; for (const P of [...Object.values(this.S.pos), ...Object.values(this.S.ord)]) u += P.q * (P.e || P.px) / (P.t === "F" ? this.cfg.lev : 1); return u; }
  enter(x, side, best, cost, vol, now, mode) {
    const c = this.cfg, S = this.S, eq = this.equity(), lev = x.t === "F" ? c.lev : 1;
    // thoát chủ yếu theo thời gian (bộ học đo kỳ vọng ở đúng h giây); cắt lỗ chặn rủi ro bất thường (4 lần biến động); chốt sớm khi giá chạy gấp đôi kỳ vọng
    const slb = Math.max(2 * cost, 4 * vol * Math.sqrt(best.h)), tpb = cost + 2 * best.exp;
    const free = Math.max(0, eq - this.used());
    const notional = Math.min(free * lev, eq * c.risk / 100 / (slb / 1e4), eq * lev);
    if (notional < 10) return;
    (S.ent ||= []).push(now);
    if ((mode || (c.mode === "maker" ? "M" : "T")) === "M") {
      const px = side > 0 ? x.bid : x.ask;
      S.ord[x.id] = { dx: !!best.m?.endsWith?.("D"), t: x.t, side, px, q: notional / px, queue: side > 0 ? x.b1q ?? x.bq : x.a1q ?? x.aq, t0: now, h: best.h, slb, tpb, exp: best.exp, raw: best.raw, g: x.g, ctx: x.ctx, zone: x.zone, shk: x.shk, cost };
      return;
    }
    this.open(x, side, side > 0 ? x.ask : x.bid, notional / (side > 0 ? x.ask : x.bid), "taker", best, slb, tpb, cost, now);
  }
  open(x, side, px, q, how, best, slb, tpb, cost, now) {
    const c = this.cfg, fr = x.t === "F" ? (how === "maker" ? c.fee_m : c.fee_t) : how === "maker" ? c.fee_ms : c.fee_ts, fee = q * px * fr / 100;
    this.S.cash -= fee;
    this.S.pos[x.id] = { id: this.S.seq++, dx: !!best.m?.endsWith?.("D"), t: x.t, side, e: px, q, fee, how, t0: now, h: best.h, sl: px * (1 - side * slb / 1e4), tp: px * (1 + side * tpb / 1e4), exp: best.exp, raw: best.raw, g: x.g, ctx: x.ctx, zone: x.zone, shk: x.shk, cost, slb, tpb };
  }
  onTrade(x, p, q, side, now) {
    const o = this.S?.ord?.[x.id];
    if (o) {   // lệnh chờ maker: khớp khi có người khớp xuyên giá / hết hàng chờ phía trước ở đúng giá
      if (o.side > 0 && side < 0) { if (p < o.px) o.queue = 0; else if (p === o.px) o.queue -= q; }
      if (o.side < 0 && side > 0) { if (p > o.px) o.queue = 0; else if (p === o.px) o.queue -= q; }
      if (o.queue <= 0) { delete this.S.ord[x.id]; x.ctx = o.ctx; x.zone = o.zone; x.shk = o.shk; this.open(x, o.side, o.px, o.q, "maker", { h: o.h, exp: o.exp, raw: o.raw, m: o.dx ? "MD" : "M" }, o.slb, o.tpb, o.cost, now); }
    }
    this.shTrade(x, p, q, side, now);
    if (this.S?.hk?.[x.id]) this.hookTrade(x, p, now);
    if (this.S?.hkv?.[x.id]) this.hkvTrade(x, p, now);
  }
  onBook(x, now) {
    if (x.sh?.length) this.shBook(x, now);
    const P = this.S?.pos?.[x.id]; if (!P) return;
    const exitPx = P.side > 0 ? x.bid : x.ask;
    if (P.side > 0 ? exitPx <= P.sl : exitPx >= P.sl) this.close1(x, exitPx, "SL", now);
    else if (P.side > 0 ? exitPx >= P.tp : exitPx <= P.tp) this.close1(x, exitPx, "TP", now);
  }
  manageTime(x, now) {
    const o = this.S.ord[x.id];
    if (o && now - o.t0 > 3000) delete this.S.ord[x.id];          // maker chờ quá 3 giây → huỷ
    const P = this.S.pos[x.id];
    if (P && P.dx) { const why = now - x.tb > 30000 ? "STALE" : this.dynExit(x, P.side, P.t0, P.h, P.e, now); if (why) this.close1(x, P.side > 0 ? x.bid : x.ask, why, now); }
    else if (P && now - P.t0 >= P.h * 1000) this.close1(x, P.side > 0 ? x.bid : x.ask, "TIME", now);
    else if (P && now - x.tb > 30000) this.close1(x, P.side > 0 ? x.bid : x.ask, "STALE", now);   // mất dữ liệu coin này > 30 giây → đóng ở giá cuối
  }
  // PHÍ FUNDING (futures): lệnh còn mở đúng giờ chốt funding thì trả/nhận funding như trên sàn thật – Long trả khi tỉ lệ > 0, Short trả khi < 0.
  // Tỉ lệ lấy từ sàn (premiumIndex Binance / tickers Bybit), làm mới 5 phút/lần, 1 phút/lần khi sắp tới giờ chốt. Không lấy được tỉ lệ → không tính (ghi nhận nguồn).
  fundTick(now) {
    const S = this.S, src = SRC[this.F?.F?.src];
    const open = Object.entries(S.pos).filter(([, P]) => P.t === "F"); if (!open.length || !src?.fund) return;
    const due = open.some(([, P]) => P.fnext && P.fnext - now < 180e3);
    if (!this.frBusy && (!this.frAt || now - this.frAt > (due ? 60e3 : 300e3))) {
      this.frBusy = true;
      src.fund().then((m) => { if (m && Object.keys(m).length) { this.FR = m; this.frAt = Date.now(); } }).catch(() => {}).finally(() => { this.frBusy = false; });
    }
    for (const [id, P] of open) {
      const x = this.M[id], fr = this.FR?.[x?.sym]; if (!fr) continue;
      if (!P.fnext) { if (fr.next > now) { P.fnext = fr.next; P.frate = fr.r; } continue; }
      if (now < P.fnext) { if (fr.next === P.fnext) P.frate = fr.r; continue; }
      const px = x.bid && x.ask ? (x.bid + x.ask) / 2 : P.e, amt = -P.side * (P.frate || 0) * P.q * px;      // + = nhận, − = trả
      S.cash += amt; P.fund = (P.fund || 0) + amt; P.fn = (P.fn || 0) + 1;
      if (P.strat === "hook" && Math.abs(amt) >= 0.01) this.say(now, `💸 Funding ${id.split(":")[0]} ${P.side > 0 ? "Long" : "Short"}: ${amt >= 0 ? "nhận" : "trả"} ${Math.abs(amt).toFixed(3)} USDT (tỉ lệ ${((P.frate || 0) * 100).toFixed(4)}%)`, "info");
      P.fnext = fr.next > now ? fr.next : null; P.frate = fr.next > now ? fr.r : null;
    }
  }
  close1(x, px, why, now) {
    const c = this.cfg, S = this.S, P = S.pos[x.id]; if (!P) return;
    const fee = P.q * px * (P.t === "F" ? c.fee_t : c.fee_ts) / 100, gross = P.side * P.q * (px - P.e);
    S.cash += gross - fee;
    delete S.pos[x.id];
    if (c.cool) S.cool[x.id] = now + c.cool * 1000;
    const n0 = P.q * P.e, fund = P.fund || 0, grossB = gross / n0 * 1e4, feeB = (P.fee + fee) / n0 * 1e4, fundB = fund / n0 * 1e4, net = grossB - feeB + fundB, usd = gross - fee - P.fee + fund;      // funding đã cộng/trừ vào tiền mặt lúc chốt
    const t = { id: P.id, k: x.id, t: P.t, side: P.side, how: P.how, e: r2(P.e, 8), x: r2(px, 8), hold: r2((now - P.t0) / 1000, 1), gross: r2(grossB, 2), fee: r2(feeB, 2), net: r2(net, 2), usd: r2(usd, 3), exp: r2(P.exp, 2), raw: r2(P.raw, 2), cost: r2(P.cost, 2), h: P.h, g: P.g || x.g, ctx: P.ctx || null, zone: P.zone || null, why, fund: fund ? r2(fundB, 2) : undefined, fu: fund ? r2(fund, 4) : undefined, c0: P.c0 ? +P.c0.toPrecision(8) : undefined, ts: P.ts ? iso(P.ts) : undefined, lvp: P.lvp || undefined, val: !!P.shk, strat: P.strat || "sec", lv: P.lv || undefined, shock: P.R || undefined, t0: iso(P.t0), t1: iso(now) };
    S.trades = [...S.trades.slice(-299), t];
    if (!S.days) this.daysInit(); else this.dayAdd(t, P.fee + fee);
    const st = S.stats; st.n++; st.gross += gross; st.fees += P.fee + fee; st.net += usd; if (usd > 0) st.win++;
    const b = (S.by[P.t] ||= { n: 0, net: 0, fees: 0, win: 0 }); b.n++; b.net += usd; b.fees += P.fee + fee; if (usd > 0) b.win++;
    const bs = ((S.byS ||= {})[P.strat || "sec"] ||= { n: 0, net: 0, fees: 0, win: 0, bps: 0 }); bs.n++; bs.net += usd; bs.fees += P.fee + fee; bs.bps += net; if (usd > 0) bs.win++;
    if (P.shk) this.shAdd(P.shk, net, true, now);
    if (P.bx && why !== "BTC") this.bxAdd(P.bx.ep, clamp(P.side * (P.bx.px - px) / P.e * 1e4, -1000, 1000));      // lệnh thật giữ qua cú sốc BTC: thoát lúc đó thì hơn/kém bao nhiêu      // kết quả lệnh thật cũng cộng vào kiểm nghiệm (cùng thước đo)
    const D = (S.dstat ||= { d: vnDay(now), n: 0, net: 0, fees: 0, win: 0 }); D.n++; D.net += usd; D.fees += P.fee + fee; if (usd > 0) D.win++;
    this.note(`t:${P.id}`, P.strat === "hook" ? 2 : 1, `${P.strat === "hook" ? "🪝" : "⚡"} ${x.id.split(":")[0]} ${P.side > 0 ? "Long" : "Short"} ${usd >= 0 ? "+" : ""}${usd.toFixed(2)} USDT`, `${{ TP: "chốt lời", SL: "cắt lỗ", TIME: "hết thời gian giữ", "TIME+": "hết giờ (đã giữ thêm vì tín hiệu còn thuận)", REV: "tín hiệu đảo chiều – thoát sớm", BTC: "BTC sốc ngược chiều – thoát ngay", STALE: "mất dữ liệu" }[why] || why} · ${net >= 0 ? "+" : ""}${net.toFixed(1)} bps sau phí · giữ ${((now - P.t0) / 1000).toFixed(0)}s · tài sản ${this.equity().toFixed(2)} USDT`);
  }

  // ---------------------------------------------------------------- 🪝 BẮT RÂU SẬP – đặt lệnh chờ sâu sau cú sốc 1 phút
  // Kiểm chứng (research/round3.py, ~900 mã Binance futures, khối lượng đúng thời điểm, khớp phải xuyên qua giá chờ 5 bps, thoát taker + trượt 10 bps):
  // trong mẫu 7–9/2026 và ngoài mẫu 10/2026 đều ròng dương sau phí; lời dồn vào các cú sập lớn cả thị trường, đuôi lỗ dày → cỡ lệnh nhỏ, có cắt lỗ thảm hoạ.
  hookBar(x, b, now) {
    const c = this.cfg, S = this.S; if (!c?.hk_on || !S || (x.t === "S" && !c.hk_spot)) return;
    const L = x.m1, n = L.length; if (n < 42 || L[n - 1] !== b) return;
    const prev = L[n - 2]; if (!(prev[1] > 0 && b[1] > 0)) return;
    const r = Math.log(b[1] / prev[1]);
    let sm = 0, sq = 0, k = 0; const vs = [];
    for (let i = Math.max(1, n - 61); i < n - 1; i++) { const ri = Math.log(L[i][1] / L[i - 1][1]); if (Number.isFinite(ri)) { sm += ri; sq += ri * ri; k++; } if (L[i][4] > 0) vs.push(L[i][4]); }
    if (k < 40) return;
    const sd = Math.sqrt(Math.max(1e-14, (sq - sm * sm / k) / (k - 1))), R = Math.abs(r) * 1e4, z = Math.abs(r) / sd;
    const H = (this.hkStat ||= { seen: 0, vol: 0, placed: 0, last: null });
    if (R < c.hk_r || z < c.hk_z) return;
    H.seen++; this.dayRec(now).seen++;
    vs.sort((a, q) => a - q); const med = vs.length >= 20 ? vs[vs.length >> 1] : 0;
    const base = x.id.split(":")[0], side = r < 0 ? 1 : -1;
    H.last = { k: x.id, at: iso(now), R: r2(r * 1e4, 0), z: r2(z, 1), vx: med > 0 ? r2((b[4] || 0) / med, 1) : null };
    const V = (why) => this.hkvAdd(x, side, b, r, R, why, now);      // đi theo ẢO cú sốc bị bộ lọc chặn → kiểm chứng bộ lọc bằng số liệu thật
    if (!(med > 0 && (b[4] || 0) >= c.hk_v * med)) { H.last.why = "khối lượng chưa đủ lớn"; if (med > 0) V("vol"); return; }
    H.vol++;
    // BỘ LỌC (kiểm chứng 01/2025–10/2026, ~900 mã, 45.800 cú sốc – research/round4.py; sau lỗ 27/10 ở Q, BULLA bắt 2–3 lần liền):
    // coin đã có cú sốc khác trong hk_f6 giờ = đang bơm/xả liên tục → bỏ. (Kết hợp với lọc "dao rơi" bên dưới: TB +26 → +91 bps/lệnh, đuôi lỗ nhỏ hơn)
    // Bộ nhớ trong máy chỉ là phương án dự phòng: sau mỗi lần khởi động lại / cập nhật nó trống → còn tính lại từ nến 1 phút của sàn (hookHist) ngay lúc có cú sốc.
    const SK = ((S.hkShk ||= {})[x.id] ||= []).filter((t) => now - t < 48 * 3600e3), mem = SK.filter((t) => now - t < c.hk_f6 * 3600e3).length;
    SK.push(now); S.hkShk[x.id] = SK.slice(-30);
    // "xả sau bơm": 15 phút trước cú sốc giá đã chạy CÙNG hướng lệnh > hk_r15 bps (vd. vừa bơm +1% rồi sập) → cú sốc là xả hàng, ít bật lại.
    // Vòng 5: nhóm này TB −56 bps/lệnh, thua 3/4 nửa năm; bỏ đi (cùng chờ ≤ 8p, khối lượng ≥ 8×) → lợi nhuận 22 tháng +23% → +51%, sụt tối đa −20% → −9%.
    if (c.hk_r15 && n >= 18 && L[n - 17][1] > 0) {
      const r15 = side * (prev[1] / L[n - 17][1] - 1) * 1e4;
      if (r15 > c.hk_r15) { H.r15 = (H.r15 || 0) + 1; this.dayRec(now).r15 = (this.dayRec(now).r15 || 0) + 1; H.last.why = `15 phút trước đó giá vừa ${side > 0 ? "tăng" : "giảm"} ${(r15 / 100).toFixed(1)}% – cú sốc là xả sau bơm, ít bật lại, không bắt`; V("r15"); this.say(now, `🪝 ${base} ${side > 0 ? "sập" : "vọt"} ${R.toFixed(0)} bps – BỎ QUA: ${H.last.why}`, "info"); return; }
    }
    if (x.t === "S" && side < 0) { H.last.why = "spot không bán khống"; return; }
    if (S.hk[x.id] || S.pos[x.id] || S.hkc[x.id] > now) { H.last.why = "đang có lệnh / vừa bắt coin này"; return; }
    if (S.pause?.kind === "day") { H.last.why = "bot đang dừng tới hết ngày (lỗ quá giới hạn ngày)"; return; }      // chốt mục tiêu ngày KHÔNG dừng Bắt râu: lời của nó dồn vào vài ngày sập mạnh – dừng ở +2% là cắt mất phần lời lớn nhất
    const act = Object.keys(S.hk).length + Object.values(S.pos).filter((p) => p.strat === "hook").length;
    if (act >= c.hk_max) { H.last.why = `đã có ${act}/${c.hk_max} lần bắt râu đang mở`; return; }
    // lọc "dao rơi": giá 4 giờ qua đã đi NGƯỢC hướng lệnh > hk_knife % (bắt đáy trong xu hướng sập / bán đỉnh trong xu hướng bơm) → bỏ. Lấy nến 15 phút từ sàn (cú sốc hiếm nên gọi thêm không tốn)
    this.hookHist(x, side, b[1], b[0]).then(async (hh) => {
      const t1 = Date.now(), prior = Math.max(mem, hh.prior || 0);
      if (c.hk_f6 && prior) { H.f6 = (H.f6 || 0) + 1; this.dayRec(t1).f6++; H.last.why = `coin đã có ${prior} cú sốc khác trong ${c.hk_f6} giờ qua – đang bơm/xả liên tục, không bắt`; V("f6"); this.say(t1, `🪝 ${base} ${side > 0 ? "sập" : "vọt"} ${R.toFixed(0)} bps – BỎ QUA: ${H.last.why}`, "info"); return; }
      // phí funding: lệnh sẽ còn mở lúc chốt funding và phải TRẢ ≥ hk_fund bps → bỏ. Kiểm chứng (research/funding5.py): TB funding chỉ −0,6 bps/lệnh,
      // nhưng 0,6% số lệnh mất 0,5–2% vì funding – hầu hết là Short coin đang bị ép giá (funding âm sâu), giá cũng thường chạy ngược.
      if (c.hk_fund && hh.fr && hh.fr.next > t1 && hh.fr.next < t1 + (c.hk_w + c.hk_h + 1) * 60e3) {
        const pay = side * hh.fr.r * 1e4;      // > 0: lệnh phải trả
        if (pay >= c.hk_fund) { H.fund = (H.fund || 0) + 1; H.last.why = `sắp chốt funding ${(hh.fr.r * 100).toFixed(3)}% – lệnh ${side > 0 ? "Long" : "Short"} sẽ phải trả ${(pay / 100).toFixed(2)}%, không bắt`; V("fund"); this.say(t1, `🪝 ${base} ${side > 0 ? "sập" : "vọt"} ${R.toFixed(0)} bps – BỎ QUA: ${H.last.why}`, "info"); return; }
      }
      const r4 = hh.r4 != null ? hh.r4 : await this.hookKnife(x, side, b[1]);
      if (r4 != null && c.hk_knife && r4 <= -c.hk_knife * 100) { H.knife = (H.knife || 0) + 1; this.dayRec(t1).knife++; H.last.why = `dao rơi: 4 giờ qua giá đã đi ngược hướng lệnh ${(r4 / 100).toFixed(1)}% – không bắt`; V("knife"); this.say(t1, `🪝 ${base} ${side > 0 ? "sập" : "vọt"} ${R.toFixed(0)} bps – BỎ QUA: ${H.last.why}`, "info"); return; }
      if (S.hk[x.id] || S.pos[x.id]) return;
      this.hookPlace(x, side, b, r, R, z, med, now);
    }).catch((e) => this.err("hook " + e.message));
  }
  // ---- KIỂM CHỨNG BỘ LỌC: cú sốc bị chặn vẫn được "đặt" 2 lệnh chờ ẢO y hệt (không tốn tiền), khớp & thoát theo giá thật, cùng phí như lệnh thật.
  // Bộ lọc đúng khi các lệnh ảo nó chặn TB lỗ (hoặc kém hẳn lệnh thật). Kết quả: S.hkvS[lý do] = {n cú sốc, f lệnh khớp, sum bps, win}, S.hkvL = 40 lần gần nhất.
  hkvAdd(x, side, b, r, R, why, now) {
    const c = this.cfg, S = this.S, V = (S.hkv ||= {}); if (V[x.id] || (x.t === "S" && side < 0)) return;
    const mv = Math.abs(Math.expm1(r)), c0 = b[1], lvs = [c.hk_d1, c.hk_d2].filter((d) => d > 0); if (!lvs.length) return;
    V[x.id] = { why, side, t0: now, exp: now + c.hk_w * 60000, R: r2(R, 0), c0, lv: lvs.map((d) => ({ d, px: c0 * (1 - side * d * mv), f: 0, t: 0 })) };
    const st = ((S.hkvS ||= {})[why] ||= { n: 0, f: 0, sum: 0, win: 0 }); st.n++;
  }
  hkvTrade(x, p, now) {
    const v = this.S.hkv[x.id]; if (!v || now > v.exp) return;
    for (const l of v.lv) { if (l.f) continue; const th = l.px * (1 - v.side * 5 / 1e4); if (v.side > 0 ? p < th : p > th) { l.f = 1; l.t = now; v.tf ||= now; } }
  }
  hkvTick(now) {
    const S = this.S, c = this.cfg; if (!S?.hkv) return;
    for (const [id, v] of Object.entries(S.hkv)) {
      const x = this.M[id];
      if (!v.tf) { if (now > v.exp) { delete S.hkv[id]; this.hkvDone(id, v, null); } continue; }
      if (now < v.tf + c.hk_h * 60e3) continue;
      if (!x?.bid || !x?.ask) { if (now > v.tf + (c.hk_h + 10) * 60e3) delete S.hkv[id]; continue; }
      const xp = v.side > 0 ? x.bid : x.ask, cost = (x.t === "F" ? c.fee_m + c.fee_t : c.fee_ms + c.fee_ts) * 100;
      const L = v.lv.filter((l) => l.f).map((l) => v.side * (xp / l.px - 1) * 1e4 - cost);
      delete S.hkv[id]; this.hkvDone(id, v, L);
    }
  }
  hkvDone(id, v, L) {
    const S = this.S, st = ((S.hkvS ||= {})[v.why] ||= { n: 0, f: 0, sum: 0, win: 0 });
    if (L?.length) { for (const b of L) { st.f++; st.sum += b; if (b > 0) st.win++; } }
    S.hkvL = [...(S.hkvL || []).slice(-39), { k: id, why: v.why, side: v.side, R: v.R, at: iso(v.t0), nf: L?.length || 0, net: L?.length ? r2(L.reduce((a, q) => a + q, 0) / L.length, 1) : null }];
  }
  // Lịch sử 1 phút ~8 giờ ngay trước cú sốc, lấy thẳng từ sàn (1 lần gọi, cú sốc hiếm): số cú sốc khác trong hk_f6 giờ (cùng chuẩn: ≥ hk_r bps, z ≥ hk_z, khối lượng ≥ hk_v×)
  // và giá 4 giờ qua đi theo/ngược hướng lệnh. Không phụ thuộc bộ nhớ trong máy → khởi động lại / cập nhật xong vẫn lọc đúng ngay. Lỗi mạng → {null} (dùng dự phòng).
  async hookHist(x, side, c0, tb) {
    const c = this.cfg, out = { r4: null, prior: null };
    try {
      const f = this.F[x.t], u = SRC[f?.src]?.bars?.(x.sym); if (!u || !u.includes("limit=62")) return out;
      const r = await get(u.replace("limit=62", "limit=500")); if (!r.ok) return out;
      const K = await r.json(); if (!Array.isArray(K)) return out;
      const B = K.map((k) => [Math.floor(+k[0] / 60000), +k[4], +k[7]]).filter((k) => k[0] < tb && k[1] > 0), n = B.length;
      if (n >= 241) out.r4 = side * (c0 / B[n - 240][1] - 1) * 1e4;
      if (n < 120) return out;
      const lr = B.map((k, i) => (i ? Math.log(k[1] / B[i - 1][1]) : 0)), from = tb - c.hk_f6 * 60;
      let cnt = 0;
      for (let i = 61; i < n; i++) {
        if (B[i][0] < from) continue;
        const R = Math.abs(lr[i]) * 1e4; if (R < c.hk_r) continue;
        let sm = 0, sq = 0; const vs = [];
        for (let j = i - 60; j < i; j++) { sm += lr[j]; sq += lr[j] * lr[j]; vs.push(B[j][2]); }
        const sd = Math.sqrt(Math.max(1e-14, (sq - sm * sm / 60) / 59)); vs.sort((a, q) => a - q);
        if (Math.abs(lr[i]) / sd >= c.hk_z && B[i][2] >= c.hk_v * vs[30]) { cnt++; i += 29; }      // gộp các nến sốc liền nhau (30 phút) thành 1 lần
      }
      out.prior = cnt;
      if (u.includes("fapi.binance.com")) {      // funding sắp chốt có rơi vào lúc chờ + giữ lệnh không, tỉ lệ bao nhiêu
        const q = await get(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${x.sym}`);
        if (q.ok) { const j = await q.json(); if (+j.nextFundingTime > 0) out.fr = { r: +j.lastFundingRate || 0, next: +j.nextFundingTime }; }
      }
    } catch (e) { /* dùng dự phòng */ }
    return out;
  }
  async hookKnife(x, side, c0) {
    try {      // lỗi mạng → không lọc được thì vẫn bắt (như trước khi có bộ lọc)
      const f = this.F[x.t], u = SRC[f?.src]?.bars?.(x.sym); if (!u) return null;
      const r = await get(u.replace("interval=1m&limit=62", "interval=15m&limit=20")); if (!r.ok) return null;
      const K = await r.json(); if (!Array.isArray(K) || K.length < 18) return null;
      const c4 = +K[K.length - 17][4]; return c4 > 0 ? side * (c0 / c4 - 1) * 1e4 : null;
    } catch (e) { return null; }
  }
  hookPlace(x, side, b, r, R, z, med, now) {
    const c = this.cfg, S = this.S, H = this.hkStat, base = x.id.split(":")[0];
    const eq = this.equity(), lev = x.t === "F" ? c.lev : 1, notional = Math.min(eq * c.hk_size / 100, Math.max(0, eq - this.used()) * lev);
    const lvs = [c.hk_d1, c.hk_d2].filter((d) => d > 0); if (!lvs.length || notional < 10) { H.last.why = "không đủ vốn"; return; }
    const mv = Math.abs(Math.expm1(r)), c0 = b[1], each = notional / lvs.length;
    S.hk[x.id] = { t: x.t, side, t0: now, exp: now + c.hk_w * 60000, mv, R: r2(R, 0), z: r2(z, 1), c0, lv: lvs.map((d) => { const px = c0 * (1 - side * d * mv); return { d, px, q: each / px, f: 0 }; }) };
    S.hkc[x.id] = now + 30 * 60000; H.placed++; this.dayRec(now).placed++; H.last.why = "đã đặt lệnh chờ";
    try { this.io.onHook?.({ id: x.id, side, c0, mv, R: r2(R, 0), z: r2(z, 1), t0: now, exp: now + c.hk_w * 60000, hold: c.hk_h, stop: c.hk_stop, lv: S.hk[x.id].lv.map((l) => ({ d: l.d, px: l.px })) }); } catch (e) { this.err("live " + e.message); }
    const pxs = S.hk[x.id].lv.map((l) => +l.px.toPrecision(6)).join(" / ");
    this.say(now, `🪝 ${base} ${side > 0 ? "sập" : "vọt"} ${Math.abs(r * 1e4).toFixed(0)} bps trong 1 phút (z ${z.toFixed(1)}, khối lượng ${(b[4] / med).toFixed(1)}×) → chờ ${side > 0 ? "mua" : "bán"} ở ${pxs}`, "info");
    this.note(`hk:${x.id}:${b[0]}`, 1, `🪝 ${base} ${side > 0 ? "sập" : "vọt"} ${Math.abs(r * 100).toFixed(1)}% trong 1 phút`, `Đặt lệnh chờ ${side > 0 ? "mua" : "bán"} ở ${pxs} (sàn thử) – chờ tối đa ${c.hk_w} phút, khớp thì giữ ${c.hk_h} phút.`);
  }
  hookTrade(x, p, now) {
    const H = this.S.hk[x.id]; if (!H) return;
    for (const l of H.lv) { if (l.f) continue; const th = l.px * (1 - H.side * 5 / 1e4); if (H.side > 0 ? p < th : p > th) { l.f = 1; this.hookFill(x, H, l, now); } }
    if (H.lv.every((l) => l.f)) delete this.S.hk[x.id];
  }
  hookFill(x, H, l, now) {
    const c = this.cfg, S = this.S, fr = x.t === "F" ? c.fee_m : c.fee_ms, fee = l.q * l.px * fr / 100, P = S.pos[x.id];
    const stop = (e) => (c.hk_stop ? e * (1 - H.side * c.hk_stop / 100) : H.side > 0 ? 0 : 1e18);
    if (P && P.strat !== "hook") return;          // coin đang có lệnh lướt giây → bỏ mức này
    S.cash -= fee;
    if (P) { const q = P.q + l.q; P.e = (P.e * P.q + l.px * l.q) / q; P.q = q; P.fee += fee; P.lv = (P.lv || 1) + 1; P.sl = stop(P.e); }
    else S.pos[x.id] = { id: S.seq++, t: x.t, side: H.side, e: l.px, q: l.q, fee, how: "maker", strat: "hook", t0: now, h: c.hk_h * 60, sl: stop(l.px), tp: H.side > 0 ? 1e18 : 0,
      exp: null, raw: null, cost: r2((fr + (x.t === "F" ? c.fee_t : c.fee_ts)) * 100, 1), slb: c.hk_stop * 100, tpb: null, R: H.R, z: H.z, lv: 1, c0: H.c0, ts: H.t0, lvp: H.lv.map((q) => +q.px.toPrecision(8)) };
    const base = x.id.split(":")[0], away = (l.px / H.c0 - 1) * 100;
    this.say(now, `🪝 Khớp ${H.side > 0 ? "mua" : "bán"} ${base} ở ${+l.px.toPrecision(6)} (${away >= 0 ? "+" : ""}${away.toFixed(1)}% so với giá đóng nến sốc) · giữ ${c.hk_h} phút`, "info");
    this.note(`hkf:${x.id}:${H.t0}:${l.d}`, 2, `🪝 Khớp ${H.side > 0 ? "Long" : "Short"} ${base} ở ${+l.px.toPrecision(6)}`, `${away >= 0 ? "+" : ""}${away.toFixed(1)}% so với giá sau cú ${H.side > 0 ? "sập" : "vọt"} · sàn thử · tự đóng sau ${c.hk_h} phút${c.hk_stop ? `, cắt lỗ thảm hoạ ${c.hk_stop}%` : ""}.`);
  }

  // ---------------------------------------------------------------- VÙNG GIÁ (SMC) & LỆNH ẢO
  // bảng giá Binance thật (giữa giá mua/bán) + đỉnh/đáy 4 nến 1 phút gần nhất – chuyển cho các bot phút trên Cloudflare
  pxRelay() {
    const px = {}, now = Date.now();
    const add = (k, x, div) => {
      if (!x.bid || !x.ask || now - x.tb > 30000) return;
      const mid = (x.bid + x.ask) / 2 / div, bars = (x.m1 || []).slice(-4).map((b) => [b[0], +(b[2] / div).toPrecision(8), +(b[3] / div).toPrecision(8)]);
      px[k] = [+mid.toPrecision(8), bars];
    };
    for (const x of Object.values(this.M)) if (x.t === "S") add(x.id.split(":")[0], x, 1);          // ưu tiên giá spot (giống nguồn cũ của bot phút)
    for (const x of Object.values(this.M)) {
      if (x.t !== "F") continue;
      const b = x.id.split(":")[0], m = b.match(/^(1000000|1000)([A-Z0-9]+)$/);
      if (!px[b]) add(b, x, 1);
      if (m && !px[m[2]]) add(m[2], x, +m[1]);      // 1000PEPE → PEPE
    }
    return px;
  }
  // "vì sao chưa vào lệnh" – tổng hợp trực tiếp trên mọi thị trường giây vừa rồi
  whyAgg() {
    const L = Object.values(this.live || {}), rc = {};
    const med = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? r2(a[Math.floor(a.length / 2)], 2) : null; };
    for (const q of L) { const k = q.v === "skip" || q.v === "pause" ? q.rc || q.v : q.v; rc[k] = (rc[k] || 0) + 1; }
    const B = L.filter((q) => q.best && Number.isFinite(q.cT));
    return { n: L.length, rc, cT: med(L.map((q) => q.cT)), cM: med(L.map((q) => q.cM)), exp: med(B.map((q) => q.best.exp)), raw: med(B.map((q) => q.best.raw)), vol: med(L.map((q) => q.vol)), spread: med(L.map((q) => q.spread)),
      nb: B.length, posT: B.length ? r2(B.filter((q) => q.best.exp > q.cT).length / B.length * 100, 0) : null, posM: B.length ? r2(B.filter((q) => q.best.exp > q.cM).length / B.length * 100, 0) : null };
  }
  shSummary() {
    const SH = this.S.SH || {}, rows = [], open = this.shN || 0;
    for (const [k, q] of Object.entries(SH)) {
      if (q[0] + q[4] === 0) continue;
      const [m, ctx, h] = k.split("|"), ep = q[5] || 0, sd = Math.sqrt(q[2]) || 1;
      rows.push([k, m, ctx, +h, ep, ep ? r2(q[1], 2) : null, ep ? r2(q[1] - 2 * sd / Math.sqrt(Math.min(ep, SHW_EP)), 2) : null, ep ? r2(q[3] * 100, 0) : null, r2(q[0] / Math.max(1, q[0] + q[4]) * 100, 0), q[0]]);
    }
    const all = rows.filter((r) => r[2] === "*"), fine = rows.filter((r) => r[2] !== "*" && r[4] >= 5).sort((a, b) => b[6] - a[6]);
    const trusted = rows.filter((r) => r[4] >= this.cfg.sh_min && r[6] >= this.cfg.min_net).length, ready = rows.filter((r) => r[4] >= this.cfg.sh_min).length;
    return { open, all: all.sort((a, b) => a[1].localeCompare(b[1]) || a[3] - b[3]), best: fine.slice(0, 25), worst: fine.slice(-10).reverse(), keys: rows.length, ready, trusted };
  }
  zoneOf(x, side, mid) {
    const L = x.m1; if (!L || L.length < 32) return "?";
    let hi = -Infinity, lo = Infinity, rhi = -Infinity, rlo = Infinity;
    for (let i = Math.max(0, L.length - 62); i < L.length - 2; i++) { if (L[i][2] > hi) hi = L[i][2]; if (L[i][3] < lo) lo = L[i][3]; }
    for (let i = L.length - 2; i < L.length; i++) { if (L[i][2] > rhi) rhi = L[i][2]; if (L[i][3] < rlo) rlo = L[i][3]; }
    if (side > 0 && rlo < lo && mid > lo) return "W";       // quét đáy 60 phút rồi kéo lên lại → thuận Long
    if (side < 0 && rhi > hi && mid < hi) return "W";       // quét đỉnh rồi rơi lại → thuận Short
    const pos = hi > lo ? (mid - lo) / (hi - lo) : 0.5;
    if ((side > 0 && pos > 1) || (side < 0 && pos < 0)) return "X";
    if (pos <= 0.25) return side > 0 ? "A" : "B";
    if (pos >= 0.75) return side > 0 ? "B" : "A";
    return "M";
  }
  shKeys(m, g, gk, zone, h) { return [`${m}|${gk}${zone}|${h}`, `${m}|${gk}|${h}`, `${m}|${g}|${h}`, `${m}|*|${h}`]; }
  // thống kê lệnh ảo: lấy tầng chi tiết nhất có đủ mẫu (chi tiết → nhóm+bối cảnh → nhóm → toàn bộ)
  shStat(keys) {
    const SH = this.S.SH ||= {};
    for (const k of keys) {
      const q = SH[k], ep = q?.[5] || 0; if (!q || ep < this.cfg.sh_min) continue;
      // BẰNG CHỨNG = SỐ ĐỢT 10 PHÚT ĐỘC LẬP, không phải số lệnh ảo: 30 lệnh ảo trong cùng 1 cú chạy của thị trường chỉ là 1 bằng chứng
      // (lỗi ngày 25/10: một chuỗi thắng 15 phút làm bảng kiểm nghiệm "tin" ngay → bot vào ~30 lệnh cùng chiều, thị trường đảo, thua cả loạt)
      const sd = Math.sqrt(q[2]) || 1;
      return { key: k, n: ep, ns: q[0], mean: q[1], sd, lcb: q[1] - 2 * sd / Math.sqrt(Math.min(ep, SHW_EP)), win: q[3] * 100, fill: q[0] / Math.max(1, q[0] + q[4]) * 100 };
    }
    return null;
  }
  shCommit(q, m) {
    const n = (q[5] = (q[5] || 0) + 1), a = 1 / Math.min(n, SHW_EP), d = m - q[1];
    q[1] += a * d; q[2] = (1 - a) * (q[2] + a * d * d); q[3] += a * ((m > 0 ? 1 : 0) - q[3]);
  }
  shAdd(keys, net, filled, now = Date.now()) {
    const SH = this.S.SH ||= {};
    for (const k of keys) {
      const q = (SH[k] ||= [0, 0, 0, 0, 0]);
      if (!filled) { q[4]++; continue; }
      // q = [số lệnh ảo, TB, phương sai, tỉ lệ thắng, số maker không khớp, SỐ ĐỢT, đầu đợt hiện tại, tổng đợt, số mẫu đợt] – TB/phương sai/thắng tính theo TB TỪNG ĐỢT
      q[0]++;
      if (!(q[6] > 0)) { q[6] = now; q[7] = 0; q[8] = 0; }
      if (now - q[6] >= EP) { if (q[8] > 0) this.shCommit(q, q[7] / q[8]); q[6] = now; q[7] = 0; q[8] = 0; }
      q[7] += net; q[8]++;
    }
  }
  // ---------------------------------------------------------------- CÚ SỐC BTC NGƯỢC CHIỀU CÁC LỆNH ĐANG GIỮ
  // BTC chạy ≥ bx_z × dao động 1 phút và ≥ bx_r bps trong 60 giây → mọi lệnh lướt giây (thật & ảo) đi cùng nhịp BTC (ρ ≥ 0,3) mà đang NGƯỢC hướng cú sốc
  // được ghi "giá nếu thoát ngay". Lệnh ảo vẫn giữ tới lúc thoát bình thường → so trực tiếp: thoát ngay − giữ tiếp. Mỗi cú sốc = 1 bằng chứng.
  // Chế độ "auto": chỉ khi đủ bx_min cú sốc và cận dưới của (thoát ngay − giữ) > 0 thì lệnh THẬT mới thoát ngay khi có cú sốc.
  btcShock(bx, now) {
    const c = this.cfg, S = this.S, M = bx.mids;      // kể cả khi tắt vẫn đo (lệnh ảo) để biết có nên bật
    if (!M || M.length < 61 || now - (S.bxLast || 0) < 120e3) return;
    const mm = Math.floor(now / 60000), rb = this.rets(bx, mm); if (!rb || rb.size < 40) return;
    let sm = 0, sq = 0; for (const v of rb.values()) { sm += v; sq += v * v; }
    const sd = Math.sqrt(Math.max(1e-14, sq / rb.size - (sm / rb.size) ** 2)), r = Math.log(M[M.length - 1] / M[M.length - 61]);
    if (!(Math.abs(r) >= c.bx_z * sd && Math.abs(r) * 1e4 >= c.bx_r)) return;
    const d = Math.sign(r), ep = now; S.bxLast = now;
    const act = this.bxActive(), hit = [];
    let nSh = 0;
    for (const x of Object.values(this.M)) {
      const P = S.pos[x.id], hasSh = x.sh?.some((o) => !o.done && o.e && !o.bx);
      if (!(P && P.strat !== "hook") && !hasSh) continue;
      const rho = x.id.startsWith("BTC:") ? 1 : this.pcorr(this.rets(x, mm), rb) ?? 0.6;
      if (rho < 0.3) continue;
      for (const o of x.sh || []) if (!o.done && o.e && !o.bx && o.side * d < 0) { o.bx = { ep, px: o.side > 0 ? x.bid : x.ask }; nSh++; }
      if (P && P.strat !== "hook" && P.side * d < 0) { hit.push(x); if (!P.bx) P.bx = { ep, px: P.side > 0 ? x.bid : x.ask }; }
    }
    S.bxEv = { at: iso(now), r: r2(r * 1e4, 0), z: r2(Math.abs(r) / sd, 1), sh: nSh, real: hit.length, act };
    this.say(now, `⚡ BTC ${d > 0 ? "vọt" : "sập"} ${Math.abs(r * 1e4).toFixed(0)} bps trong 60 giây (z ${(Math.abs(r) / sd).toFixed(1)}) · ${hit.length} lệnh thật & ${nSh} lệnh ảo đang ngược hướng${act && hit.length ? " → thoát ngay lệnh thật (đã được chứng minh tốt hơn giữ)" : hit.length ? " → giữ (chưa đủ bằng chứng thoát ngay tốt hơn)" : ""}`, "info");
    if (act) for (const x of hit) this.close1(x, S.pos[x.id].side > 0 ? x.bid : x.ask, "BTC", now);
  }
  bxAdd(ep, diff) {
    const B = (this.S.BX ||= { n: 0, m: 0, v: 0, win: 0, ep: 0, s: 0, k: 0 });
    if (B.ep !== ep) { if (B.k > 0) { const x = B.s / B.k, n = ++B.n, a = 1 / Math.min(n, 150), dd = x - B.m; B.m += a * dd; B.v = (1 - a) * (B.v + a * dd * dd); B.win += a * ((x > 0 ? 1 : 0) - B.win); } B.ep = ep; B.s = 0; B.k = 0; }
    B.s += diff; B.k++;
  }
  bxStat() { const B = this.S.BX; if (!B || !B.n) return { n: 0 }; const sd = Math.sqrt(B.v) || 1; return { n: B.n, mean: r2(B.m, 2), lcb: r2(B.m - 2 * sd / Math.sqrt(Math.min(B.n, 150)), 2), win: r2(B.win * 100, 0) }; }
  bxActive() { const c = this.cfg; if (c.bx_mode === "on") return true; if (c.bx_mode === "off") return false; const st = this.bxStat(); return st.n >= c.bx_min && st.lcb > 0; }
  // THOÁT LINH HOẠT: ra sớm khi tín hiệu đảo chiều rõ (sau tối thiểu 30% thời gian giữ, ≥ 5 giây); tới giờ mà tín hiệu vẫn thuận & đang lãi → giữ thêm, tối đa 2× (≤ "giữ tối đa").
  // Chỉ được dùng cho lệnh thật khi lệnh ảo thoát linh hoạt của đúng loại tình huống đó tốt hơn ngưỡng – thị trường tự quyết cách thoát nào hợp.
  dynExit(x, side, t0, h, e, now) {
    const el = (now - t0) / 1000, a = side * (x.sNow || 0);
    if (el >= Math.max(5, 0.3 * h) && a <= -0.3) return "REV";
    if (el < h) return null;
    const px = side > 0 ? x.bid : x.ask, up = e ? side * (px / e - 1) * 1e4 : 0;
    if (el < Math.min(2 * h, Math.max(h, this.cfg.hmax)) && a >= 0.3 && up > 0) return null;
    return el > h + 1.5 ? "TIME+" : "TIME";      // TIME+ = đã giữ thêm quá mốc rồi mới thoát
  }
  shSpawn(x, side, pass, gk, zone, vol, now) {
    if ((this.shN || 0) >= SH_MAX) return;
    for (const m of ["T", "M"]) {
      if (now - (x.shT[m] || 0) < SH_GAP) continue;
      const L = pass.filter((q) => q.m === m); if (!L.length) continue;
      x.shT[m] = now;
      const pickH = [...new Set([L[0], L[Math.floor(L.length / 2)], L[L.length - 1]])];      // ngắn nhất / giữa / dài nhất → biết mốc giữ nào thật sự có lời
      for (const q of pickH) {
        const slb = Math.max(2 * q.cost, 4 * vol * Math.sqrt(q.h)), tpb = q.cost + 2 * q.exp;
        for (const dx of [false, true]) {       // cùng 1 cơ hội, 2 cách thoát → so trực tiếp thoát đúng giờ với thoát linh hoạt
          const mk = m + (dx ? "D" : "");
          const o = { m, dx, side, h: q.h, keys: this.shKeys(mk, x.g, gk, zone, q.h), slb, tpb, cost: q.cost, t0: now, fee: m === "M" ? q.cost : null };
          if (m === "T") { o.e = side > 0 ? x.ask : x.bid; o.tf = now; }
          else { o.px = side > 0 ? x.bid : x.ask; o.queue = side > 0 ? x.b1q ?? x.bq : x.a1q ?? x.aq; }
          x.sh.push(o); this.shN = (this.shN || 0) + 1;
        }
      }
    }
  }
  shClose(x, o, px, now) {
    const fees = o.m === "M" ? o.cost : 2 * (x.t === "F" ? this.cfg.fee_t : this.cfg.fee_ts) * 100;
    const net = o.side * (px / o.e - 1) * 1e4 - fees;
    this.shAdd(o.keys, clamp(net, -1000, 1000), true, now);
    if (o.bx) this.bxAdd(o.bx.ep, clamp(o.side * (o.bx.px / o.e - 1) * 1e4 - fees - net, -1000, 1000));     // thoát ngay lúc BTC sốc − giữ tiếp (bps)
    o.done = true; this.shN--;
  }
  shTrade(x, p, q, side, now) {
    if (!x.sh?.length) return;
    for (const o of x.sh) {
      if (o.done || o.e) continue;     // chỉ lệnh ảo maker đang chờ khớp
      if (o.side > 0 && side < 0) { if (p < o.px) o.queue = 0; else if (p === o.px) o.queue -= q; }
      if (o.side < 0 && side > 0) { if (p > o.px) o.queue = 0; else if (p === o.px) o.queue -= q; }
      if (o.queue <= 0) { o.e = o.px; o.tf = now; o.sl = o.e * (1 - o.side * o.slb / 1e4); o.tp = o.e * (1 + o.side * o.tpb / 1e4); }
    }
  }
  shBook(x, now) {
    const ex = (o) => (o.side > 0 ? x.bid : x.ask);
    for (const o of x.sh) {
      if (o.done || !o.e) continue;
      o.sl ??= o.e * (1 - o.side * o.slb / 1e4); o.tp ??= o.e * (1 + o.side * o.tpb / 1e4);
      const px = ex(o);
      if (o.side > 0 ? px <= o.sl || px >= o.tp : px >= o.sl || px <= o.tp) this.shClose(x, o, px, now);
    }
  }
  shTime(x, now) {
    if (!x.sh?.length) return;
    const stale = now - x.tb > 30000;
    for (const o of x.sh) {
      if (o.done) continue;
      if (!o.e) { if (now - o.t0 > 3000 || stale) { this.shAdd(o.keys, 0, false); o.done = true; this.shN--; } continue; }     // maker không khớp trong 3 giây → huỷ (ghi nhận tỉ lệ khớp)
      if (stale || (o.dx ? this.dynExit(x, o.side, o.tf, o.h, o.e, now) : now - o.tf >= o.h * 1000)) this.shClose(x, o, o.side > 0 ? x.bid : x.ask, now);
    }
    if (x.sh.some((o) => o.done)) x.sh = x.sh.filter((o) => !o.done);
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
      radar, pos: S.pos, ord: S.ord, hk: S.hk || {}, byS: S.byS || {}, today: S.days ? { d: vnDay(now), ...this.dayRec(now) } : null, bx: { ...this.bxStat(), act: this.bxActive(), mode: this.cfg.bx_mode, last: S.bxEv || null }, guard: { ent5: (S.ent || []).filter((t) => now - t < 300e3).length, rq: (() => { const b = this.book(); return b.ids.length ? r2(this.corrRisk(b.ids, b.sides, now), 2) : 0; })(), nb: Object.keys(S.pos).length, L: Object.values(S.pos).filter((p) => p.strat !== "hook" && p.side > 0).length, S: Object.values(S.pos).filter((p) => p.strat !== "hook" && p.side < 0).length, brk: S.brk ? iso(S.brk) : null, brk2: S.brk2 ? iso(S.brk2) : null }, hkStat: this.hkStat || null, hkv: { S: S.hkvS || {}, L: (S.hkvL || []).slice(-30), open: Object.keys(S.hkv || {}).length }, trades: T.slice(-80),
      LP: Object.fromEntries(Object.entries(S.LP).map(([g, Lg]) => [g, Lg.map((row) => row.map((q) => [q[0], r2(q[1], 3), r2(Math.sqrt(q[2]), 2)]))])),
      sh: this.shSummary(), why: this.whyAgg(), HS, BW, TIERS, CTX, brain: S.brainAt ? { at: S.brainAt, n: S.brainN, coins: S.brainCoins } : null, eqs: S.eq.slice(-720), log: S.log.slice(-40), cfg: this.cfg };
    try { await this.io.writeState(this.uid, out); } catch (e) { this.err("lưu trạng thái " + e.message); }
    if (this.notes.length && this.io.notify) { const L = this.notes.splice(0); try { await this.io.notify(this.uid, L); } catch (e) { this.err("thông báo " + e.message); } }
    this.dirty++;
    if (this.dirty % 3 === 0 || !this.cfg?.enabled) await this.kv.put("S", S);
    if (this.dirty % 60 === 5) await this.saveBrain();
    if (this.io.saveDays && S.days && (this.dirty % 60 === 15 || S.daysSaved !== S.day.d)) { try { await this.io.saveDays(this.uid, this.daysOut()); S.daysSaved = S.day.d; } catch (e) { this.err("lưu kết quả ngày " + e.message); } }      // bộ nhớ học dùng chung: lưu ~10 phút/lần (lần đầu sau ~1 phút)
    if (this.dirty % 30 === 0 || !this.cfg?.enabled) {     // bộ học riêng từng coin: lưu mỗi ~5 phút, chia khối 100 coin
      const ids = Object.keys(this.LM), put = {};
      for (let i = 0; i < ids.length; i += 100) put["LM:" + i / 100] = Object.fromEntries(ids.slice(i, i + 100).map((k) => [k, this.LM[k]]));
      try { await this.kv.put(put); } catch (e) { this.err("lưu bộ học " + e.message); }
    }
  }
}
// futures: không mở lệnh trong 45 giây sau giờ tròn, và không mở lệnh mà thời gian giữ sẽ vắt qua giờ tròn (giờ funding 1h/4h/8h đều rơi vào giờ tròn)
const nearFunding = (now, h = 0) => { const s = Math.floor(now / 1000) % 3600; return s < 45 || 3600 - s < h + 45; };

