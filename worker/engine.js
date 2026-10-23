// CỖ MÁY VỐN của bot giám sát: biến mục tiêu năm (sàn +30%, mục tiêu ×2, mơ ước ×3) thành MỨC RỦI RO MỖI LỆNH cho từng bot – theo toán, không theo cảm xúc.
//
// 1. Đo lợi thế thật của từng bot từ lệnh đã đóng (R đã trừ phí): kỳ vọng μ, độ lệch σ, số lệnh/năm. Dùng μ THẬN TRỌNG = cận dưới 80% (μ − 1,28σ/√n):
//    lợi thế chưa chứng minh được thì không được đặt cược lớn. Bot chưa đủ 10 lệnh = "đang học" → nửa rủi ro.
// 2. Ba mức rủi ro/lệnh (tỷ lệ tài sản f):
//    f_cần  = mức vừa đủ để đạt mục tiêu ×2 vào cuối năm với lợi thế hiện có (không lấy thêm rủi ro khi không cần);
//    f_sụt  = mức lớn nhất mà xác suất sụt quá giới hạn (vd 20%) ≤ 10%:  P(sụt ≥ D) ≈ exp(−2·g·D/v) → f = 2μD / (ln10·σ² + E[R²]·D);
//    f_Kelly = phân số Kelly (mặc định ½ Kelly = μ/E[R²]/2) – vượt mức này thì tăng rủi ro lại làm GIẢM tăng trưởng dài hạn.
//    Chọn f = min(f_cần, f_sụt, f_Kelly, trần 2%/lệnh).
// 3. Bảo vệ sàn kiểu CPPI: đáy bảo vệ = max(đỉnh × (1 − giới hạn sụt), …); khi đã lãi đủ đệm (≥ +30% / 0,9 ≈ +44%) thì KHOÁ sàn +30% –
//    rủi ro tỷ lệ với "đệm" giữa tài sản và đáy: càng gần đáy càng đánh nhỏ, chạm đáy là dừng.
// 4. Nhạy với thay đổi: 10 lệnh gần nhất TB < −0,3R hoặc 20 lệnh gần nhất âm trong khi tổng thể dương → lợi thế đang suy giảm → cắt bớt ngay;
//    lỗ quá nửa giới hạn ngày → giảm một nửa.
// 5. Mô phỏng Monte Carlo (6 giờ/lần): bốc ngẫu nhiên từ chính các lệnh đã đóng của từng bot với mức rủi ro đã chọn → xác suất đạt sàn / ×2 / ×3,
//    xác suất chạm giới hạn sụt. Không có gì là chắc chắn – đây là xác suất dựa trên lợi thế đo được tới hôm nay.
// (không import bot.js để tránh vòng phụ thuộc bot → sup → engine → bot)
const iso = (t) => new Date(t).toISOString().slice(0, 19);
const ms = (x) => Date.parse(x.length <= 19 ? x + "Z" : x);
const vn = (x, d = 2) => Number(x).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const YR = 365 * 864e5;
const LN10 = Math.log(10);
export const ENG_DEF = { engine: true, goal_floor: 30, goal_x: 2, goal_x2: 3, max_risk: 2, kelly: 0.5, lock_buf: 10 };

export function engNorm(c) {
  return { ...ENG_DEF, ...c, goal_floor: clamp(+c.goal_floor || 30, 0, 200), goal_x: clamp(+c.goal_x || 2, 1.05, 20), goal_x2: clamp(+c.goal_x2 || 3, 1.1, 50),
    max_risk: clamp(+c.max_risk || 2, 0.1, 2), kelly: clamp(+c.kelly || 0.5, 0.1, 1), lock_buf: clamp(+c.lock_buf || 10, 2, 30) };
}

// lợi nhuận theo thời gian (TWR): không bị méo khi thêm / làm lại bot (đổi vốn)
export function goalTrack(c, ss, eq, sig, now) {
  const G = (ss.goal ||= { start: iso(now), idx: 1, eq: eq, sig, peak: 1, lock: false, h: [] });
  if (c.goal_reset_at && c.goal_reset_at !== G.reset_seen) { Object.assign(G, { start: iso(now), idx: 1, eq, sig, peak: 1, lock: false, h: [], reset_seen: c.goal_reset_at }); }
  if (G.sig === sig && G.eq > 0 && eq > 0) G.idx *= eq / G.eq;
  G.sig = sig; G.eq = eq; G.peak = Math.max(G.peak || 1, G.idx);
  const last = G.h[G.h.length - 1];
  if (!last || now - ms(last[0]) >= 3600e3) G.h = [...G.h.slice(-24 * 400), [iso(now), +G.idx.toFixed(5)]];
  const y = Math.max(0, (now - ms(G.start)) / YR);
  return { G, y };
}

// lợi thế đo được của một bot
export function botEdge(st, now) {
  const H = (st?.hist || []).filter((h) => h.r != null), r = H.map((h) => h.r), n = r.length;
  if (!n) return { n: 0 };
  const mu = r.reduce((a, b) => a + b, 0) / n, sd = n > 1 ? Math.sqrt(r.reduce((a, x) => a + (x - mu) ** 2, 0) / (n - 1)) : 1;
  const t0 = Math.min(...H.map((h) => ms(h.opened))), days = Math.max(7, (now - t0) / 864e5);
  const m10 = n >= 10 ? r.slice(-10).reduce((a, b) => a + b, 0) / 10 : null, m20 = n >= 20 ? r.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
  return { n, mu, sd: Math.max(0.3, sd), muc: mu - 1.28 * Math.max(0.3, sd) / Math.sqrt(n), freq: n / days * 365, m10, m20, r };
}

// mức rủi ro/lệnh (tỷ lệ) cần để tăng trưởng log g_need mỗi lệnh: f·μ − ½f²·E[R²] = g → f = (μ − √(μ² − 2·E[R²]·g)) / E[R²]
const fNeed = (mu, m2, g) => { const d = mu * mu - 2 * m2 * g; return mu > 0 && d >= 0 ? (mu - Math.sqrt(d)) / m2 : null; };
const growth = (f, mu, m2, n) => Math.exp(n * (f * mu - 0.5 * f * f * m2)) - 1;

export function plan(cRaw, ss, B, S, cfgOf, eqOf, active, ddLim, dayPct, dayLim, now) {
  const c = engNorm(cRaw), live = B.filter((b) => S[b.id] && active(b, S[b.id]));
  const eqT = live.reduce((a, b) => a + eqOf(b), 0), sig = live.map((b) => `${b.id}:${S[b.id].start}:${S[b.id].reset_seen || ""}`).join("|");
  const { G, y } = goalTrack(c, ss, eqT, sig, now);
  const D = -Math.log(1 - ddLim / 100), fl = 1 + c.goal_floor / 100, ry = Math.max(0.05, 1 - (y % 1));
  // ---- sàn bảo vệ (CPPI)
  if (!G.lock && G.idx >= fl / (1 - c.lock_buf / 100)) { G.lock = true; G.lock_at = iso(now); }
  const floor = Math.max(1 - ddLim / 100, G.peak * (1 - ddLim / 100), G.lock ? fl : 0);
  const cush = (G.idx - floor) / G.idx, cppi = clamp(cush / (ddLim / 100), 0, 1);
  const paths = { floor: fl ** y, x: c.goal_x ** y, x2: c.goal_x2 ** y };
  const pace = G.idx >= paths.x2 ? "x3" : G.idx >= paths.x ? "x2" : G.idx >= paths.floor ? "floor" : G.idx >= 0.998 ? "below" : "loss";
  const why = [];
  why.push(`Từ ${G.start.slice(8, 10)}/${G.start.slice(5, 7)}: ${G.idx >= 1 ? "+" : ""}${vn((G.idx - 1) * 100, 1)}% · đường sàn +${c.goal_floor}%/năm lúc này ${vn((paths.floor - 1) * 100, 1)}%, đường ×${c.goal_x} ${vn((paths.x - 1) * 100, 1)}%`);
  why.push(G.lock ? `🔒 Đã khoá sàn +${c.goal_floor}%: rủi ro tỷ lệ với phần lãi vượt sàn – chạm sàn là dừng mở lệnh mới` : `Sàn bảo vệ hiện tại ${vn((floor - 1) * 100, 1)}% (chưa khoá +${c.goal_floor}% – cần lãi ≥ ${vn((fl / (1 - c.lock_buf / 100) - 1) * 100, 0)}% để có đệm khoá)`);
  if (cppi < 1) why.push(`Đệm tới sàn còn ${vn(cush * 100, 1)}% → đánh ${vn(cppi * 100, 0)}% cỡ lệnh bình thường`);
  let acct = cppi;
  if (dayPct <= -dayLim / 2) { acct *= 0.5; why.push(`Hôm nay đã lỗ ${vn(dayPct, 1)}% (quá nửa giới hạn ngày) → giảm một nửa`); }
  // ---- từng bot
  const bots = {};
  let wsum = 0, gExp = 0, gCon = 0, nE = 0;
  for (const b of live) {
    const cfg = cfgOf(b), E = botEdge(S[b.id], now), base = cfg.risk / 100, L = [];
    let f, mode;
    const m2 = E.n ? E.sd * E.sd + E.mu * E.mu : 1;
    let fdd = null, fk = null, fq = null, fq3 = null, ffl = null;
    if (E.n < 10) { f = base * 0.5; mode = "learn"; L.push(`mới ${E.n}/10 lệnh – chưa đo được lợi thế → đánh ½ rủi ro (${vn(f * 100, 2)}%/lệnh)`); }
    else if (E.muc <= 0) {
      f = base * (E.mu > 0 ? 0.5 : 0.25); mode = E.mu > 0 ? "unproven" : "neg";
      L.push(E.mu > 0 ? `lãi TB +${vn(E.mu, 2)}R nhưng chưa chắc chắn (cận dưới ${vn(E.muc, 2)}R) → ½ rủi ro` : `lãi TB ${vn(E.mu, 2)}R – đang lỗ → chỉ ¼ rủi ro để tiếp tục đo`);
    } else {
      const mu = E.muc, m2c = E.sd * E.sd + mu * mu, n = E.freq;
      fdd = 2 * mu * D / (LN10 * E.sd * E.sd + m2c * D);
      fk = c.kelly * mu / m2c;
      // mục tiêu đang nhắm: chưa tới ×2 → nhắm ×2; đã qua ×2 → nhắm ×3; đã qua ×3 → giữ thành quả (½ trần an toàn)
      const tgt = G.idx < c.goal_x ? c.goal_x : G.idx < c.goal_x2 ? c.goal_x2 : null;
      fq = tgt ? fNeed(mu, m2c, Math.log(tgt / G.idx) / Math.max(1, n * ry)) : null;
      fq3 = fNeed(mu, m2c, Math.log(c.goal_x2 / Math.min(G.idx, c.goal_x2 - 1e-6)) / Math.max(1, n * ry));
      ffl = fNeed(mu, m2c, Math.log(Math.max(1.0001, fl / G.idx)) / Math.max(1, n * ry));
      const cap = Math.min(fdd, fk, c.max_risk / 100);
      f = !tgt ? cap * 0.5 : fq != null ? Math.min(fq, cap) : cap; mode = "edge";
      L.push(`lợi thế thận trọng ${vn(mu, 2)}R/lệnh (đo ${vn(E.mu, 2)}R, ${E.n} lệnh, ~${vn(n, 0)} lệnh/năm)`);
      L.push(`${tgt ? `cần ${fq != null ? vn(fq * 100, 2) + "%" : "không đạt được"} rủi ro/lệnh để ×${vn(tgt, 1).replace(/,0$/, "")}` : `đã vượt ×${c.goal_x2} – giữ thành quả`} · trần an toàn sụt ${vn(fdd * 100, 2)}% · ${c.kelly === 1 ? "Kelly" : vn(c.kelly, 1).replace(/,0$/, "") + "×Kelly"} ${vn(fk * 100, 2)}% · trần cứng ${c.max_risk}%`);
      if (!tgt) L.push(`→ đánh ½ trần an toàn (${vn(f * 100, 2)}%/lệnh) để giữ thành quả`);
      else if (fq != null && fq <= cap) L.push(`→ chỉ cần ${vn(fq * 100, 2)}%/lệnh là đủ cho mục tiêu – không lấy thêm rủi ro`);
      else L.push(`→ mục tiêu ×${vn(tgt, 1).replace(/,0$/, "")} cần nhiều rủi ro hơn mức an toàn – máy giữ ${vn(cap * 100, 2)}%/lệnh, chấp nhận kỳ vọng thấp hơn mục tiêu`);
    }
    // nhạy với suy giảm lợi thế
    let dec = 1;
    if (E.m10 != null && E.n >= 15 && E.m10 < -0.3) { dec *= 0.6; L.push(`10 lệnh gần nhất TB ${vn(E.m10, 2)}R – lợi thế đang suy giảm → ×0,6`); }
    else if (E.m20 != null && E.m20 < 0 && E.mu > 0) { dec *= 0.75; L.push(`20 lệnh gần nhất TB ${vn(E.m20, 2)}R (âm) dù tổng thể dương → ×0,75`); }
    const fin = f * acct * dec;
    const mult = base > 0 ? clamp(fin / base, 0, 1.5) : 1;
    const eff = Math.min(base * mult, c.max_risk / 100);
    bots[b.id] = { mode, n: E.n, mu: E.n ? +E.mu.toFixed(3) : null, muc: E.n ? +E.muc.toFixed(3) : null, sd: E.n ? +E.sd.toFixed(2) : null, freq: E.n ? Math.round(E.freq) : null,
      fdd: fdd != null ? +(fdd * 100).toFixed(2) : null, fk: fk != null ? +(fk * 100).toFixed(2) : null, fq: fq != null ? +(fq * 100).toFixed(2) : null, fq3: fq3 != null ? +(fq3 * 100).toFixed(2) : null,
      ffl: ffl != null ? +(ffl * 100).toFixed(2) : null, f: +(eff * 100).toFixed(3), mult: +mult.toFixed(3), base: cfg.risk, why: L,
      exp: mode === "edge" && E.mu > 0 ? +(growth(eff, E.mu, m2, E.freq) * 100).toFixed(1) : null, con: E.n >= 10 && E.muc > 0 ? +(growth(eff, E.muc, E.sd * E.sd + E.muc * E.muc, E.freq) * 100).toFixed(1) : null };
    const w = eqOf(b); wsum += w;
    if (bots[b.id].exp != null) { gExp += w * Math.log(1 + bots[b.id].exp / 100); nE++; }
    if (bots[b.id].con != null) gCon += w * Math.log(1 + bots[b.id].con / 100);
  }
  const out = { at: iso(now), idx: +G.idx.toFixed(5), peak: +G.peak.toFixed(5), start: G.start, y: +y.toFixed(4), paths, pace, floor: +floor.toFixed(4), cush: +cush.toFixed(4), cppi: +cppi.toFixed(3), acct: +acct.toFixed(3),
    lock: G.lock, why, bots, exp: wsum && nE ? +((Math.exp(gExp / wsum) - 1) * 100).toFixed(1) : null, con: wsum && nE ? +((Math.exp(gCon / wsum) - 1) * 100).toFixed(1) : null, cfg: c };
  // ---- Monte Carlo 6 giờ/lần
  if (!ss.mc || now - ms(ss.mc.at) >= 6 * 3600e3) ss.mc = monteCarlo(out, live, S, eqOf, c, ddLim, ry, now);
  out.mc = ss.mc;
  return out;
}

function monteCarlo(P, live, S, eqOf, c, ddLim, ry, now) {
  const src = live.map((b) => ({ b, E: botEdge(S[b.id], now), f: P.bots[b.id]?.f / 100 || 0, w: eqOf(b) })).filter((x) => x.E.n >= 10 && x.f > 0);
  if (!src.length) return { at: iso(now), none: true, why: "cần ít nhất 1 bot có ≥ 10 lệnh đã đóng" };
  const W = src.reduce((a, x) => a + x.w, 0), lam = src.reduce((a, x) => a + x.E.freq, 0) * ry, NS = 800, fl = 1 + c.goal_floor / 100;
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = () => { let u = rnd() * src.reduce((a, x) => a + x.E.freq, 0); for (const x of src) { u -= x.E.freq; if (u <= 0) return x; } return src[src.length - 1]; };
  const fin = [], ddh = [];
  for (let k = 0; k < NS; k++) {
    // mô phỏng đúng cách cỗ máy chạy: rủi ro co theo đệm tới sàn (CPPI), sàn dời lên theo đỉnh, khoá +sàn khi đủ đệm, chạm sàn thì dừng
    let v = P.idx, pk = Math.max(v, P.peak || v), mdd = 0, lock = !!P.lock;
    const N = Math.max(1, Math.round(lam + Math.sqrt(lam) * (rnd() + rnd() + rnd() - 1.5) * 2)), d0 = ddLim / 100;
    for (let t = 0; t < N; t++) {
      if (!lock && v >= fl / (1 - c.lock_buf / 100)) lock = true;
      const F = Math.max(1 - d0, pk * (1 - d0), lock ? fl : 0), sc = clamp((v - F) / v / d0, 0, 1);
      if (sc <= 0) break;
      const x = pick(), R = x.E.r[Math.floor(rnd() * x.E.r.length)]; v *= 1 + (x.w / W) * x.f / Math.max(1e-9, P.acct || 1) * sc * R; pk = Math.max(pk, v); mdd = Math.max(mdd, 1 - v / pk);
    }
    fin.push(v); ddh.push(mdd);
  }
  fin.sort((a, b) => a - b);
  const q = (p) => fin[Math.min(NS - 1, Math.floor(p * NS))], pr = (f) => fin.filter(f).length / NS;
  return { at: iso(now), n: NS, trades: Math.round(lam), p_floor: +pr((v) => v >= fl).toFixed(3), p_x: +pr((v) => v >= c.goal_x).toFixed(3), p_x2: +pr((v) => v >= c.goal_x2).toFixed(3),
    p_loss: +pr((v) => v < 1).toFixed(3), p_dd: +(ddh.filter((d) => d >= ddLim / 100).length / NS).toFixed(3), p10: +q(0.1).toFixed(3), p50: +q(0.5).toFixed(3), p90: +q(0.9).toFixed(3) };
}
