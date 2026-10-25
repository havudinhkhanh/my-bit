// BOT GIÁM SÁT (quản lý danh mục) – đứng trên mọi bot của anh, chạy mỗi phút ngay TRƯỚC và SAU lượt của các bot.
//  TRƯỚC: cầu dao toàn tài khoản · đánh giá lại từng lệnh đang mở (cắt nếu kỳ vọng phía trước âm) · đổi lệnh yếu lấy cơ hội tốt hơn
//         (chỉ khi lợi thế còn dương SAU phí) · gắn "bài học" vào cổng vào lệnh của từng bot.
//  SAU:   khám nghiệm từng lệnh vừa đóng (gắn nhãn lỗi) · theo dõi giá sau khi đóng (cắt lỗ có quá sát? bot giám sát cắt có đúng?)
//         · rút bài học từ toàn bộ lệnh (có bằng chứng mới áp dụng, tự gỡ khi hết bằng chứng) · chấm điểm từng bot (tạm dừng bot
//         lỗ thật sự, không phải xui) · phân tích phí · báo cáo.
// Nguyên tắc: chi phí chìm không quan trọng – chỉ so KỲ VỌNG PHÍA TRƯỚC; giá đi ngẫu nhiên thì giữ hay cắt kỳ vọng như nhau (= 0),
// nên chỉ cắt khi lợi thế ban đầu đã mất (thị trường đổi, BTC sập, funding ăn mòn); mọi phép so đều trừ phí giao dịch + trượt giá.
import { FEE, SLIP, iso, ms, vnDay, vn, sigS, say, equity, closeAll, norm } from "./bot.js";
import { plan as engPlan, ENG_DEF } from "./engine.js";

export const SUP_DEF = { enabled: true, mode: "auto", acct_dd: 20, acct_day: 6, cut: true, rotate: true, lessons: true, pause_bots: true, be1: "auto", min_edge: 0.25, min_trades: 15, off: [], ...ENG_DEF };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sg = (x, d = 2) => (x >= 0 ? "+" : "") + vn(x, d);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const pct = (x) => vn(x * 100, 0) + "%";
const LS = (s) => (s === "long" ? "Long" : "Short");
// các bot chạy song song thường đánh CÙNG một tín hiệu → gộp lại khi rút bài học để không đếm một bằng chứng hai lần
function uniq(R) {
  const m = new Map();
  for (const x of R) { const k = `${x.k}|${x.side}|${x.tf}|${x.sig || x.opened}`, y = m.get(k); if (!y) m.set(k, { ...x, _r: [x.r] }); else { y._r.push(x.r); y.tags = [...new Set([...y.tags, ...x.tags])]; } }
  return [...m.values()].map((x) => ({ ...x, r: mean(x._r) }));
}

export function supNorm(c) {
  c = { ...SUP_DEF, ...(c || {}) };
  c.acct_dd = clamp(+c.acct_dd || 20, 3, 60); c.acct_day = clamp(+c.acct_day || 6, 1, 30); c.min_edge = clamp(+c.min_edge || 0.25, 0.05, 2); c.min_trades = clamp(+c.min_trades || 15, 8, 100);
  c.off = Array.isArray(c.off) ? c.off : [];
  c.herd = Number.isFinite(+c.herd) && c.herd !== "" && c.herd !== null ? clamp(+c.herd, 0, 6) : 2;      // tối đa số bot cùng giữ 1 coin cùng chiều (0 = không giới hạn)
  return c;
}
export function supNew(now) {
  return { v: 1, created: iso(now), log: [], rev: {}, watch: [], shadow: {}, lessons: [], blocks: [], cards: {}, rot: {}, bp: {}, ack: {}, halt: null, self: { cut: { ok: 0, bad: 0, R: 0 }, rot: { n: 0 } }, reports: [] };
}
const slog = (ss, now, m, k = "info", b = null) => { ss.log = [...(ss.log || []).slice(-199), { t: iso(now), k, m, b }]; };

// ---------------------------------------------------------------- bài học: nhãn lỗi → hành động
export const LESSONS = {
  htf_against: { t: "Vào ngược khung lớn", act: "block", how: "không vào lệnh khi khung lớn ngược chiều", sug: { htf_align: true } },
  light_against: { t: "Vào ngược đèn thị trường", act: "block", how: "không Long khi đèn Đỏ, không Short khi đèn Xanh" },
  low_model: { t: "Mô hình chấm thấp / mã yếu", act: "block", how: "chỉ vào khi mô hình ≥ 50% và mã không bị xếp 'yếu'", sug: { min_win: "+5" } },
  fees_heavy: { t: "Phí ăn mòn lợi nhuận", act: "block", how: "bỏ lệnh có phí + trượt giá > 0,2R (cắt lỗ quá hẹp so với phí)" },
  chased: { t: "Đuổi giá", act: "block", how: "chỉ vào khi R:R còn ≥ 80% R:R gốc của tín hiệu" },
  stale: { t: "Tín hiệu đã cũ", act: "block", how: "bỏ tín hiệu quá 3 ngày (khung ngày) / 16 giờ (khung 4h)" },
  gave_back: { t: "Để lệnh lãi thành lỗ", act: "manage", how: "đi được +1R thì dời cắt lỗ về hoà vốn" },
  time_out: { t: "Giữ quá lâu không chạy", act: "advice", how: "cân nhắc chốt sớm hơn khi lệnh đứng yên" },
  revenge: { t: "Vào lại ngay sau khi thua", act: "block", how: "nghỉ 2 giờ sau mỗi lệnh thua", sug: { streak_cut: true } },
  cluster: { t: "Thua dồn cùng nhóm ngành", act: "block", how: "nghỉ nhóm ngành 6 giờ sau một lệnh thua trong nhóm" },
  funding: { t: "Funding ăn mòn", act: "block", how: "bỏ lệnh futures có funding dự kiến > 0,15R" },
  stop_tight: { t: "Cắt lỗ quá sát", act: "advice", how: "dính cắt lỗ rồi giá vẫn chạy tới MT1 – cân nhắc thiết lập có cắt lỗ rộng hơn / khung lớn hơn" },
  liq: { t: "Bị thanh lý", act: "advice", how: "giảm đòn bẩy", sug: { max_lev: "-1" } },
};
const STALE = { d: 3 * 864e5, h4: 16 * 3.6e6 };

// nhãn lỗi cho một lệnh đã đóng (h = dòng lịch sử của bot, hist = lịch sử cùng bot)
function tagsOf(h, hist) {
  const T = [], L = h.side === "long", t0 = ms(h.opened), t1 = ms(h.closed);
  if (h.htf === "h-") T.push("htf_against");
  if ((L && h.light === "red") || (!L && h.light === "green")) T.push("light_against");
  if ((h.pm != null && h.pm < 45) || h.play === "weak") T.push("low_model");
  if (h.risk > 0 && ((h.fees || 0) + Math.max(0, h.fund || 0)) / h.risk >= 0.2) T.push("fees_heavy");
  if (h.rr && h.rr0 && h.rr < 0.8 * h.rr0) T.push("chased");
  if (h.at && t0 - ms(h.at) > (STALE[h.tf] || STALE.d)) T.push("stale");
  if (h.mfe != null && h.mfe >= 1 && h.r != null && h.r <= 0.1 && !h.tp1) T.push("gave_back");
  if (h.why === "TIME" && h.r < 0) T.push("time_out");
  if (hist.some((y) => y !== h && y.pnl < 0 && ms(y.closed) <= t0 && t0 - ms(y.closed) < 2 * 3.6e6)) T.push("revenge");
  if (h.g && h.pnl < 0 && hist.some((y) => y !== h && y.g === h.g && y.pnl < 0 && Math.abs(ms(y.closed) - t1) < 6 * 3.6e6)) T.push("cluster");
  if (h.risk > 0 && (h.fund || 0) / h.risk >= 0.15) T.push("funding");
  if (h.why === "LIQ") T.push("liq");
  return T;
}

// ---------------------------------------------------------------- đánh giá lại một lệnh đang mở: xác suất còn lại & kỳ vọng phía trước
// Giá đi ngẫu nhiên: P(chạm mục tiêu trước cắt lỗ) = khoảng cách tới cắt lỗ / (tới cắt lỗ + tới mục tiêu) → kỳ vọng = 0.
// Lợi thế của tín hiệu = xác suất thống kê/mô hình ÷ xác suất ngẫu nhiên lúc vào; lợi thế mờ dần khi quá nửa thời gian kỳ vọng,
// và giảm khi bối cảnh đổi (đèn thị trường, BTC). Funding futures dự kiến trừ thẳng vào kỳ vọng.
export function assess(p, plan, price, now) {
  const m = price(p.k) || p.e, L = p.sd > 0, T = p.tp1 ? p.t2 : p.t1, S = p.s, R = p.risk_usd || 1;
  if (p.sd * (m - S) <= 0 || p.sd * (T - m) <= 0) return null;
  const up = Math.abs(T - m), dn = Math.abs(m - S), prw = dn / (up + dn), why = [];
  const pe = (p.pm ?? p.win1) / 100, rr0 = p.rr0 || Math.abs(p.t1 - p.e) / Math.abs(p.e - p.s0);
  let E = pe > 0 && rr0 > 0 ? clamp(pe * (1 + rr0), 0.5, 1.8) : 1;
  if (p.tp1) E = 1 + (E - 1) * 0.5;
  const H = Math.max(36e5, ms(p.tmax) - ms(p.opened)), a = (now - ms(p.opened)) / H;
  if (a > 0.5) { const k = clamp(1 - (a - 0.5) / 0.5, 0, 1); if (E > 1) why.push(`đã qua ${vn(a * 100, 0)}% thời gian kỳ vọng – lợi thế mờ dần`); E = 1 + (E - 1) * k; }
  const light = plan?.light;
  if (L && light === "red" && p.light && p.light !== "red") { E *= 0.8; why.push("đèn thị trường chuyển Đỏ từ lúc vào"); }
  if (!L && light === "green" && p.light && p.light !== "green") { E *= 0.8; why.push("đèn thị trường chuyển Xanh từ lúc vào"); }
  const btc = price("BTC");
  if (p.k !== "BTC" && p.btc0 && btc) { const ch = (btc / p.btc0 - 1) * 100; if ((L && ch <= -3) || (!L && ch >= 3)) { E *= 0.85; why.push(`BTC ${sg(ch, 1)}% từ lúc vào – ngược lệnh`); } }
  const pn = clamp(prw * E, 0.03, 0.97), upR = p.q * up / R, dnR = p.q * dn / R;
  let fundR = 0; const f = plan?.f8?.[p.k];
  if (p.mkt === "fut" && f != null) { const hrs = Math.max(0, Math.min(ms(p.tmax) - now, H * 0.5)) / 36e5; fundR = p.sd * p.q * m * f / 100 * (hrs / 8) / R; if (fundR > 0.05) why.push(`funding dự kiến tốn ${vn(fundR, 2)}R`); }
  const EV = pn * upR - (1 - pn) * dnR - fundR, uR = (p.sd * p.q * (m - p.e) + p.real - p.fee0 - p.fund) / R;
  return { k: p.k, side: p.side, m, pn, prw, E, EV, upR, dnR, fundR, uR, a, why, tgt: p.tp1 ? "MT2" : "MT1" };
}

// kỳ vọng (R, đã trừ phí) của một ứng viên ở giá hiện tại
function candEV(c, p) {
  const sd = c.side === "long" ? 1 : -1;
  if (!p || sd * (p - c.s) <= 0 || sd * (c.t1 - p) <= 0) return null;
  const rr = Math.abs(c.t1 - p) / Math.abs(p - c.s), rrS = Math.abs(c.t1 - c.e) / Math.abs(c.e - c.s), pe = (c.pm ?? c.win1) / 100;
  if (!(pe > 0) || rr < 1.2) return null;
  const E = clamp(pe * (1 + rrS), 0.5, 1.8), pc = clamp(E / (1 + rr), 0.03, 0.97), feeR = (2 * FEE[c.mkt || "fut"] + 2 * SLIP) * p / Math.abs(p - c.s);
  return { rr, pc, E, feeR, EV: pc * rr - (1 - pc) - feeR };
}

// ---------------------------------------------------------------- cổng bài học (gắn vào bot, gọi trong entries)
function makeCheck(ss, active, bid, hist, now, S, herd = 2) {
  const on = new Set(active.map((l) => l.id));
  const blocks = (ss.blocks || []).filter((b) => ms(b.until) > now);
  // ghi lại tín hiệu bị chặn để sau này chấm chính lệnh chặn: chặn đúng (giá về cắt lỗ trước) hay chặn nhầm (giá tới MT1 trước)
  const watchBlocked = (l, x, c) => {
    const key = `${l}|${x.k}|${x.side}|${x.at}`;
    if (ss.shadow[key] || (ss.watch || []).length >= 400 || !c?.p) return;
    ss.shadow[key] = 1; ss.watch.push({ kind: "shadow", l, b: bid, k: x.k, sd: x.side === "long" ? 1 : -1, e: c.p, s: x.s, t: x.t1, until: iso(now + (x.tf === "h4" ? 2 : 5) * 864e5) });
  };
  return (x, c) => {
    const L = x.side === "long", reasons = [];
    // CẢ ĐỘI DỒN VÀO 1 TÍN HIỆU: 1 tín hiệu xấu = thua ở mọi bot cùng lúc (đã xảy ra: ORDER 6 bot, T 4 bot) → tối đa `herd` bot giữ cùng 1 coin cùng chiều
    if (S && herd > 0) {
      const hold = Object.entries(S).filter(([id, st]) => id !== bid && (st?.pos || []).some((p) => p.k === x.k && p.side === x.side)).length;
      if (hold >= herd) return `đội bot: đã có ${hold} bot khác giữ ${L ? "Long" : "Short"} ${x.k} – không dồn thêm (1 tín hiệu sai sẽ thua ở mọi bot cùng lúc)`;
    }
    for (const b of blocks) {
      if (b.kind === "side" && b.side === x.side) { watchBlocked(`blk:side:${b.side}`, x, c); return `bài học: mọi thiết lập ${L ? "Long" : "Short"} 7 ngày qua đều thua (${b.n} tín hiệu, TB ${sg(b.R, 2)}R) – thị trường đang không ủng hộ chiều này, tạm dừng tới ${b.until.slice(5, 16).replace("T", " ")}`; }
      if (b.kind === "setup" && b.setup === x.setup && b.tf === "*" && b.side === x.side) { watchBlocked(`blk:${b.setup}|*|${b.side}`, x, c); return `bài học: thiết lập "${x.name}" ${L ? "Long" : "Short"} thua ở mọi khung (${b.n} tín hiệu, TB ${sg(b.R, 2)}R) – tạm dừng tới ${b.until.slice(5, 10).split("-").reverse().join("/")}`; }
      if (b.kind === "coin" && b.k === x.k) return `bài học: ${x.k} thua ${b.n} lệnh gần đây (${sg(b.R, 1)}R) ở các bot – tạm tránh tới ${b.until.slice(5, 10).split("-").reverse().join("/")}`;
      if (b.kind === "setup" && b.setup === x.setup && b.tf === x.tf && b.side === x.side) return `bài học: thiết lập "${x.name}" ${x.tf === "d" ? "ngày" : "4h"} gần đây thua (${b.n} lệnh, TB ${sg(b.R, 2)}R) – tạm dừng tới ${b.until.slice(5, 10).split("-").reverse().join("/")}`;
    }
    if (on.has("htf_against") && x.htf === "h-") reasons.push(["htf_against", "khung lớn ngược chiều"]);
    if (on.has("light_against") && ((L && c.light === "red") || (!L && c.light === "green"))) reasons.push(["light_against", `đèn thị trường ${c.light === "red" ? "Đỏ" : "Xanh"}`]);
    if (on.has("low_model") && ((x.pm != null && x.pm < 50) || x.play === "weak")) reasons.push(["low_model", x.play === "weak" ? "mã yếu với thiết lập này" : `mô hình chỉ ${x.pm}%`]);
    if (on.has("fees_heavy") && c.feeR > 0.2) reasons.push(["fees_heavy", `phí + trượt giá ≈ ${vn(c.feeR, 2)}R`]);
    if (on.has("chased")) { const rr0 = Math.abs(x.t1 - x.e) / Math.abs(x.e - x.s); if (c.rr < 0.8 * rr0) reasons.push(["chased", `R:R còn ${vn(c.rr, 1)} so với gốc ${vn(rr0, 1)} – đang đuổi giá`]); }
    if (on.has("stale") && x.at && now - ms(x.at) > (STALE[x.tf] || STALE.d)) reasons.push(["stale", "tín hiệu đã cũ"]);
    if (on.has("revenge") && hist.some((y) => y.pnl < 0 && now - ms(y.closed) < 2 * 3.6e6)) reasons.push(["revenge", "vừa thua < 2 giờ trước"]);
    if (on.has("cluster") && x.g && hist.some((y) => y.g === x.g && y.pnl < 0 && now - ms(y.closed) < 6 * 3.6e6)) reasons.push(["cluster", `nhóm ${x.g} vừa có lệnh thua`]);
    if (on.has("funding") && x.mkt === "fut" && c.f8?.[x.k] != null) { const hrs = (x.d1 || 10) * (x.bd || 1) * 24 * 0.5; const fr = (L ? 1 : -1) * c.f8[x.k] / 100 * (hrs / 8) * c.p / Math.abs(c.p - x.s); if (fr > 0.15) reasons.push(["funding", `funding dự kiến ${vn(fr, 2)}R`]); }
    if (!reasons.length) return null;
    // theo dõi "lệnh bị chặn" để chấm chính bài học: chặn đúng (giá về cắt lỗ trước) hay chặn nhầm (giá tới MT1 trước)
    const [lid] = reasons[0], key = `${lid}|${x.k}|${x.side}|${x.at}`;
    if (!ss.shadow[key] && (ss.watch || []).length < 400) {
      ss.shadow[key] = 1;
      ss.watch.push({ kind: "shadow", l: lid, b: bid, k: x.k, sd: L ? 1 : -1, e: c.p, s: x.s, t: x.t1, until: iso(now + (x.tf === "h4" ? 2 : 5) * 864e5) });
    }
    return `bài học "${LESSONS[reasons[0][0]].t}": ${reasons.map((r) => r[1]).join(" · ")} – không vào`;
  };
}

// ---------------------------------------------------------------- chấm điểm một bot (từ lịch sử lệnh, R đã trừ phí)
function card(st, cfg, scfg) {
  const H = (st?.hist || []).filter((h) => h.r != null), r = H.map((h) => h.r), n = r.length, mu = mean(r);
  const sd = n > 1 ? Math.sqrt(r.reduce((a, x) => a + (x - mu) ** 2, 0) / (n - 1)) : null, se = sd != null ? sd / Math.sqrt(n) : null;
  const pos = H.filter((h) => h.pnl > 0).reduce((a, h) => a + h.pnl, 0), neg = -H.filter((h) => h.pnl < 0).reduce((a, h) => a + h.pnl, 0);
  const fees = H.reduce((a, h) => a + (h.fees || 0), 0), fund = H.reduce((a, h) => a + (h.fund || 0), 0), gwin = H.reduce((a, h) => a + Math.max(0, h.gross ?? h.pnl), 0);
  const withF = H.filter((h) => h.fees != null && h.risk > 0), feeR = withF.length ? mean(withF.map((h) => h.fees / h.risk)) : null;
  const lo = se != null ? mu - 1.28 * se : null, hi = se != null ? mu + 1.28 * se : null, last = mean(r.slice(-20));
  const eqDD = st?.stats?.dd ?? 0;
  let v = "learn", why = `chưa đủ lệnh để kết luận (${n}/${scfg.min_trades}) – tiếp tục quan sát`;
  if (n >= scfg.min_trades) {
    if (hi < 0) { v = "pause"; why = `sau ${n} lệnh, lãi TB ${sg(mu)}R và cả khoảng tin cậy 80% [${sg(lo)}; ${sg(hi)}]R đều dưới 0 – cách chơi này lỗ thật sự, không phải do xui`; }
    else if (mu < 0) { v = "watch"; why = `lãi TB ${sg(mu)}R (âm) nhưng chưa chắc chắn về thống kê [${sg(lo)}; ${sg(hi)}]R – theo dõi sát, chưa dừng`; }
    else if (lo > 0) { v = "good"; why = `lãi TB ${sg(mu)}R, khoảng tin cậy 80% [${sg(lo)}; ${sg(hi)}]R đều dương – lợi thế có thật`; }
    else { v = "ok"; why = `lãi TB ${sg(mu)}R, dương nhưng chưa chắc chắn [${sg(lo)}; ${sg(hi)}]R`; }
  }
  if (v !== "pause" && cfg && eqDD >= cfg.max_dd * 0.7) { v = v === "good" ? "ok" : "watch"; why += ` · đã sụt ${vn(eqDD, 1)}% (≥ 70% giới hạn ${cfg.max_dd}%)`; }
  return { n, win: n ? +(H.filter((h) => h.pnl > 0).length / n * 100).toFixed(0) : null, avgR: mu != null ? +mu.toFixed(2) : null, sd: sd != null ? +sd.toFixed(2) : null, lo: lo != null ? +lo.toFixed(2) : null, hi: hi != null ? +hi.toFixed(2) : null,
    last20: last != null ? +last.toFixed(2) : null, pf: neg > 0 ? +(pos / neg).toFixed(2) : pos > 0 ? 99 : null, fees: +fees.toFixed(2), fund: +fund.toFixed(2), fee_share: gwin > 0 ? +(fees / gwin * 100).toFixed(1) : null,
    feeR: feeR != null ? +feeR.toFixed(3) : null, net: +(pos - neg).toFixed(2), v, why };
}

// ---------------------------------------------------------------- TRƯỚC lượt bot
// B: cấu hình bot, S: trạng thái (bị sửa trực tiếp khi cắt / đổi lệnh), PL: kế hoạch. Trả về {gates: {id: _sup}, ev: {id: [...]}, notes}
export function supPre(scfgRaw, ss, B, S, PL, price, now, active) {
  const scfg = supNorm(scfgRaw), gates = {}, evs = {}, out = [], auto = scfg.mode === "auto";
  if (!scfg.enabled) { ss.think = { at: iso(now), head: "Bot giám sát đang tắt – các bot tự chạy theo kỷ luật riêng.", items: [] }; return { gates, evs, notes: out }; }
  // ---- tài khoản chung (mọi bot đang chạy / có lệnh)
  const live = B.filter((b) => S[b.id] && active(b, S[b.id]));
  const eq = live.reduce((a, b) => a + equity(S[b.id], price), 0), sig = live.map((b) => `${b.id}:${S[b.id].start}:${S[b.id].reset_seen || ""}`).join("|"), day = vnDay(now);
  if (ss.sig !== sig) { ss.sig = sig; ss.peak = eq; ss.day = { d: day, eq0: eq }; }
  ss.peak = Math.max(ss.peak || eq, eq);
  if (ss.day?.d !== day) { ss.day = { d: day, eq0: eq }; if (ss.halt?.kind === "day") { slog(ss, now, "Sang ngày mới – mở lại khoá lỗ trong ngày của toàn tài khoản."); ss.halt = null; } }
  if (scfgRaw?.resume_at && scfgRaw.resume_at !== ss.resume_seen) { ss.resume_seen = scfgRaw.resume_at; if (ss.halt) { slog(ss, now, "Anh mở khoá toàn tài khoản – đỉnh tài sản chung đặt lại theo hiện tại.", "info"); ss.halt = null; ss.peak = eq; if (ss.goal) { ss.goal.peak = ss.goal.idx; if (ss.goal.lock && ss.goal.idx < 1 + (+scfg.goal_floor || 30) / 100) ss.goal.lock = false; } } }
  const dd = ss.peak ? (1 - eq / ss.peak) * 100 : 0, dayPct = ss.day?.eq0 ? (eq / ss.day.eq0 - 1) * 100 : 0;
  if (!ss.halt && eq > 0) {
    if (dd >= scfg.acct_dd) ss.halt = { kind: "dd", at: iso(now), why: `tài sản chung các bot sụt ${vn(dd, 1)}% so với đỉnh (giới hạn ${scfg.acct_dd}%)` };
    else if (dayPct <= -scfg.acct_day) ss.halt = { kind: "day", at: iso(now), why: `tài sản chung lỗ ${vn(dayPct, 1)}% hôm nay (giới hạn ${scfg.acct_day}%) – khoá tới hết ngày` };
    if (ss.halt) { slog(ss, now, `⛔ KHOÁ TOÀN TÀI KHOẢN: ${ss.halt.why}. Mọi bot ngừng mở lệnh mới; lệnh đang mở vẫn giữ cắt lỗ.`, "stop"); out.push({ key: `sup:halt:${ss.halt.at}`, sev: 3, title: "🛡️ Bot giám sát khoá toàn tài khoản", body: ss.halt.why }); }
  }
  const heatAll = live.reduce((a, b) => a + (S[b.id].pos || []).filter((p) => !(p.be1 || (p.tp1 && p.s === p.e))).reduce((x, p) => x + p.risk_usd, 0), 0);
  ss.acct = { eq: +eq.toFixed(2), peak: +(ss.peak || eq).toFixed(2), dd: +dd.toFixed(2), day_pct: +dayPct.toFixed(2), heat: eq ? +(heatAll / eq * 100).toFixed(2) : 0, n_pos: live.reduce((a, b) => a + (S[b.id].pos || []).length, 0), n_bots: live.length };
  const softMult = !ss.halt && dd >= scfg.acct_dd / 2 ? 0.5 : 1;
  // ---- cỗ máy vốn: mục tiêu năm → rủi ro/lệnh từng bot (xem engine.js)
  let E = null;
  if (scfg.engine && eq > 0) {
    try { E = engPlan(scfgRaw || {}, ss, B, S, norm, (b) => equity(S[b.id], price), active, scfg.acct_dd, dayPct, scfg.acct_day, now); } catch (e) { E = null; slog(ss, now, "Cỗ máy vốn lỗi: " + e.message, "info"); }
    if (E && E.cppi <= 0 && !ss.halt) {
      ss.halt = { kind: "floor", at: iso(now), why: `chạm sàn bảo vệ (${E.lock ? `khoá lãi +${scfg.goal_floor}%` : `sụt ${scfg.acct_dd}% từ đỉnh`}) – dừng mở lệnh mới để giữ thành quả` };
      slog(ss, now, `⛔ ${ss.halt.why}.`, "stop"); out.push({ key: `sup:floor:${ss.halt.at}`, sev: 3, title: "🛡️ Cỗ máy vốn: chạm sàn bảo vệ", body: ss.halt.why });
    }
    if (E && ss.eng_mode) for (const [id, x] of Object.entries(E.bots)) if (ss.eng_mode[id] && ss.eng_mode[id] !== x.mode) slog(ss, now, `🎯 ${B.find((b) => b.id === id)?.name || id}: ${x.why.join("; ")}`, "lesson", id);
    if (E) ss.eng_mode = Object.fromEntries(Object.entries(E.bots).map(([id, x]) => [id, x.mode]));
  }
  ss.eng = E;
  // ---- bài học đang áp dụng (đã tính ở lượt SAU trước đó)
  const act = scfg.lessons ? (ss.lessons || []).filter((l) => l.on && !scfg.off.includes(l.id)) : [];
  // BẢO VỆ LÃI theo bằng chứng thật: các lệnh từng đi được ≥ +1R mà phần lớn cuối cùng vẫn lỗ → dời hoà vốn ở +1R và chốt 1 nửa ở +1,5R khi MT1 còn xa
  // (22–25/10: 15 lệnh từng lãi ≥ 1R, MINA +2,3R, LAB +1,9R… rồi vẫn về cắt lỗ; MT1 thường cách 2–4R nên không lệnh SMC nào chạm MT1)
  const RV = Object.values(ss.rev || {}).filter((x) => !x.old && x.mfe != null && x.r != null && now - ms(x.closed) < 30 * 864e5);
  const gb = RV.filter((x) => x.mfe >= 1), giveBack = gb.length >= 3 && gb.filter((x) => x.r < 0).length / gb.length >= 0.5;
  const be1 = scfg.be1 === "on" || (scfg.be1 === "auto" && (act.some((l) => l.id === "gave_back") || giveBack)), pt = scfg.be1 !== "off" && giveBack;
  if (pt !== !!ss.ptOn) { ss.ptOn = pt; slog(ss, now, pt ? `📚 Bảo vệ lãi BẬT: ${gb.filter((x) => x.r < 0).length}/${gb.length} lệnh từng lãi ≥ +1R cuối cùng vẫn lỗ → từ giờ đi +1R thì dời cắt lỗ về hoà vốn, đi +1,5R mà MT1 còn xa (> 2R) thì chốt 50%.` : "📚 Bảo vệ lãi tạm tắt: lệnh từng lãi phần lớn đã giữ được lãi.", "lesson"); }
  const items = [], seen = new Set();
  // tự học từ chính mình: nếu các lần cắt/đổi trước đó lỗ ròng thì nâng ngưỡng; lỗ rõ thì ngừng tự cắt (chỉ khuyên)
  const SC = ss.self.cut, nSC = SC.ok + SC.bad, cutThr = nSC >= 8 && SC.R < 0 ? -0.3 : -0.15, cutOn = !(nSC >= 15 && SC.R / nSC < -0.2);
  if (!cutOn && !ss.cut_off_said) { ss.cut_off_said = 1; slog(ss, now, `Tự chấm: ${nSC} lần cắt/đổi trước lỗ ròng ${sg(SC.R)}R – bot giám sát NGỪNG tự cắt lệnh (chỉ khuyên) cho tới khi anh đặt lại.`, "self"); }
  for (const b of B) {
    const st = S[b.id]; if (!st || !active(b, st)) continue;
    const cfg = norm(b), plan = PL[b.id], ev = (evs[b.id] = []);
    const EB = E?.bots?.[b.id];
    gates[b.id] = { halt: ss.halt ? `bot giám sát khoá toàn tài khoản – ${ss.halt.why}` : null, mult: EB ? EB.mult : softMult,
      pt, mwhy: EB ? `cỗ máy vốn đặt ${vn(EB.f, 2)}%/lệnh (${{ learn: "đang học", unproven: "lợi thế chưa chắc", neg: "đang lỗ", edge: "theo lợi thế đo được" }[EB.mode]})` : `tài sản chung sụt ${vn(dd, 1)}%`, be1,
      check: scfg.lessons ? makeCheck(ss, act, b.id, st.hist || [], now, S, scfg.herd) : null };
    // ---- đánh giá lại từng lệnh: giữ hay cắt
    const A = [];
    for (const p of [...(st.pos || [])]) {
      const x = assess(p, plan, price, now); if (!x) continue;
      A.push([p, x]);
      const age = (now - ms(p.opened)) / 60e3, it = { b: b.id, bn: b.name || b.id, k: p.k, side: p.side, pn: +x.pn.toFixed(3), prw: +x.prw.toFixed(3), E: +x.E.toFixed(2), EV: +x.EV.toFixed(2), uR: +x.uR.toFixed(2), tgt: x.tgt, why: x.why };
      const head = `${LS(p.side)} ${p.k} (${b.name || b.id}): xác suất tới ${x.tgt} còn ${pct(x.pn)} (ngẫu nhiên ${pct(x.prw)}, lợi thế ×${vn(x.E, 2)})${x.why.length ? " – " + x.why.join("; ") : ""} → kỳ vọng nếu giữ ${sg(x.EV)}R, đang ${sg(x.uR)}R`;
      // cắt chỉ khi kỳ vọng âm rõ (≤ −0,15R) và giữ nguyên ≥ 3 phút liền (tránh cắt vì nhiễu / đèn thị trường nhấp nháy)
      // lệnh đã chốt MT1 / đã dời hoà vốn: phần còn lại là "vé miễn phí" – không cắt, để cắt lỗ hoà vốn lo
      const ck = `${b.id}|${p.id}`, free = p.tp1 || p.be1; ss.cutc ||= {}; ss.cutc[ck] = x.EV < cutThr ? (ss.cutc[ck] || 0) + 1 : 0; seen.add(ck);
      if (scfg.cut && cutOn && !free && ss.cutc[ck] >= 3 && age >= 20 && x.dnR > 0.15) {
        it.dec = auto ? "cut" : "advise"; it.m = `${head}. ${auto ? "CẮT" : "NÊN CẮT"}: giữ tiếp kỳ vọng âm; đang lỗ hay lãi bao nhiêu không quan trọng (chi phí chìm) – chỉ tính phía trước.`;
        if (auto) { closeAll(st, p, x.m, "SUP_CUT", now, ev); say(st, now, `🛡️ Bot giám sát cắt ${p.k}: kỳ vọng giữ tiếp ${sg(x.EV)}R (${x.why.join("; ") || "lợi thế đã hết"})`, "stop");
          ss.watch.push({ kind: "cut", b: b.id, bn: b.name, k: p.k, sd: p.sd, e: x.m, s: p.s, t: p.tp1 ? p.t2 : p.t1, rS: -x.dnR, rT: x.upR, until: iso(now + 3 * 864e5) });
          out.push({ key: `sup:cut:${b.id}:${p.id}`, sev: 2, sym: p.k, title: `🛡️ Giám sát cắt ${LS(p.side)} ${p.k} (${b.name || b.id})`, body: `Kỳ vọng nếu giữ ${sg(x.EV)}R · ${x.why.join("; ")}` }); }
      } else { it.dec = "hold"; it.m = `${head}. GIỮ: ${x.EV >= 0 ? "kỳ vọng còn dương" : free && x.EV < 0 ? "kỳ vọng hơi âm nhưng phần còn lại đã an toàn ở hoà vốn – để cắt lỗ hoà vốn lo" : x.EV < cutThr && cutOn ? `kỳ vọng đang âm – nếu còn âm ${Math.max(1, 3 - ss.cutc[ck])} phút nữa sẽ cắt` : x.EV < cutThr ? "kỳ vọng âm, nhưng tự chấm cho thấy các lần cắt trước lỗ ròng – tạm chỉ khuyên, không tự cắt" : "kỳ vọng ≈ 0, cắt lỗ đã đặt sẵn lo phần xấu"}.`; }
      items.push(it);
    }
    // ---- đổi lệnh: ứng viên tốt bị chặn vì hết chỗ ↔ lệnh yếu nhất đang mở
    const TH = st.think;
    if (scfg.rotate && cfg.enabled && !ss.halt && !st.paused && TH && now - ms(TH.at) < 3 * 60e3) {
      const last = ss.rot[b.id], rd = ss.rotd?.[b.id]?.d === vnDay(now) ? ss.rotd[b.id].n : 0;
      if ((!last || now - ms(last) >= 2 * 3.6e6) && rd < 3) {
        const eqB = equity(st, price), riskNew = eqB * cfg.risk * (st.stats?.risk_mult || 1) / 100;
        const blocked = (TH.cands || []).filter((t) => ["full", "heat", "cash", "sector"].includes(t.v)).map((t) => ({ t, c: (plan?.cands || []).find((c) => c.k === t.k && c.side === t.side && c.tf === t.tf) })).filter((o) => o.c);
        let best = null;
        for (const { t, c } of blocked) {
          const x = candEV(c, price(c.k)); if (!x || x.EV < 0.2) continue;
          if (gates[b.id].check && gates[b.id].check(c, { p: price(c.k), rr: x.rr, feeR: x.feeR, now, st, light: plan?.light, f8: plan?.f8 || {} })) continue;
          if (!best || x.EV > best.x.EV) best = { t, c, x };
        }
        if (best) {
          const cand = A.filter(([p]) => !p.tp1 && now - ms(p.opened) >= 60 * 60e3 && (best.t.v !== "sector" || p.g === best.c.g)).map(([p, x]) => ({ p, x, val: x.EV * p.risk_usd }));
          cand.sort((u, w) => u.val - w.val);
          const w = cand[0];
          if (w) {
            const gain = best.x.EV * riskNew - w.val;
            const msg = `Đổi lệnh? ${LS(best.c.side)} ${best.c.k} (bị chặn: ${best.t.v === "full" ? "đủ lệnh" : "kỷ luật vốn"}) kỳ vọng ${sg(best.x.EV)}R sau phí (${vn(best.x.feeR, 2)}R phí) ≈ ${sg(best.x.EV * riskNew)} USDT, so với giữ ${LS(w.p.side)} ${w.p.k} kỳ vọng ${sg(w.x.EV)}R ≈ ${sg(w.val)} USDT → chênh ${sg(gain)} USDT (cần ≥ ${vn(scfg.min_edge * riskNew, 2)})`;
            if (gain >= scfg.min_edge * riskNew) {
              if (auto) {
                closeAll(st, w.p, w.x.m, "SUP_ROT", now, ev); say(st, now, `🛡️ Bot giám sát đóng ${w.p.k} để nhường chỗ cho ${best.c.k}: ${msg}`, "info");
                ss.rot[b.id] = iso(now); ss.rotd = { ...(ss.rotd || {}), [b.id]: { d: vnDay(now), n: rd + 1 } }; ss.self.rot.n++;
                ss.watch.push({ kind: "rot", b: b.id, bn: b.name, k: w.p.k, sd: w.p.sd, e: w.x.m, s: w.p.s, t: w.p.t1, rS: -w.x.dnR, rT: w.x.upR, until: iso(now + 3 * 864e5) });
                out.push({ key: `sup:rot:${b.id}:${w.p.id}`, sev: 2, sym: best.c.k, title: `🛡️ Giám sát đổi ${w.p.k} → ${best.c.k} (${b.name || b.id})`, body: msg });
              }
              slog(ss, now, `${auto ? "ĐỔI" : "NÊN ĐỔI"} – ${msg}`, "rot", b.id);
            } else if (ss.lastRotMsg?.[b.id] !== best.c.k) { slog(ss, now, `Cân nhắc rồi KHÔNG đổi – ${msg}`, "info", b.id); ss.lastRotMsg = { ...(ss.lastRotMsg || {}), [b.id]: best.c.k }; }
          }
        }
      }
    }
    // ---- bot lỗ thật sự (thống kê) → tạm dừng; anh bấm "Chạy lại" = cho thêm 10 lệnh thử
    if (ss.bp[b.id] && !st.paused) { ss.ack[b.id] = (st.hist || []).length; delete ss.bp[b.id]; slog(ss, now, `Anh cho ${b.name || b.id} chạy lại – bot giám sát cho thêm 10 lệnh thử trước khi xét lại.`, "info", b.id); }
    const C = card(st, cfg, scfg);
    if (scfg.pause_bots && auto && C.v === "pause" && cfg.enabled && !st.paused && !(ss.ack[b.id] != null && C.n < ss.ack[b.id] + 10)) {
      st.paused = { at: iso(now), why: `Bot giám sát: ${C.why}`, by: "sup" }; ss.bp[b.id] = iso(now);
      say(st, now, `⛔ Bot giám sát TẠM DỪNG bot: ${C.why}. Lệnh đang mở vẫn giữ cắt lỗ.`, "stop");
      slog(ss, now, `⛔ Tạm dừng ${b.name || b.id}: ${C.why}`, "stop", b.id);
      out.push({ key: `sup:pause:${b.id}:${iso(now)}`, sev: 3, title: `🛡️ Giám sát tạm dừng ${b.name || b.id}`, body: C.why });
    }
  }
  for (const k of Object.keys(ss.cutc || {})) if (!seen.has(k)) delete ss.cutc[k];
  // dòng suy nghĩ: chỉ ghi khi quyết định về một lệnh thay đổi
  const prev = ss.dv || {}, cur = {};
  for (const it of items) { const k = `${it.b}|${it.k}|${it.side}`; cur[k] = it.dec; if (prev[k] !== cur[k]) slog(ss, now, it.m, it.dec, it.b); }
  ss.dv = cur;
  const nCut = items.filter((i) => i.dec === "cut").length;
  ss.think = { at: iso(now), items, head: ss.halt ? `⛔ Đang khoá toàn tài khoản: ${ss.halt.why}.` : nCut ? `Vừa cắt ${nCut} lệnh có kỳ vọng âm.` : items.length ? `Đang theo dõi ${items.length} lệnh của ${live.length} bot – tất cả còn kỳ vọng ≥ 0, giữ.` : `Không có lệnh mở – canh rủi ro chung và chờ các bot tìm cơ hội.`,
    lessons: act.map((l) => l.id), be1, soft: softMult < 1 };
  return { gates, evs, notes: out };
}

// ---------------------------------------------------------------- SAU lượt bot: khám nghiệm, theo dõi sau đóng, rút bài học, chấm điểm, báo cáo
export function supPost(scfgRaw, ss, B, S, PL, price, now, active) {
  const scfg = supNorm(scfgRaw), out = [];
  if (!scfg.enabled) return out;
  // 1) khám nghiệm lệnh vừa đóng
  let added = 0;
  for (const b of B) {
    const st = S[b.id]; if (!st) continue;
    for (const h of (st.hist || []).slice(-60)) {
      const key = `${b.id}:${h.id}:${h.opened}`; if (ss.rev[key]) continue;
      if (now - ms(h.closed) > 7 * 864e5) { ss.rev[key] = { b: b.id, old: 1, k: h.k, r: h.r, closed: h.closed, tags: [] }; continue; }
      const tags = tagsOf(h, st.hist || []);
      ss.rev[key] = { b: b.id, k: h.k, side: h.side, setup: h.setup, name: h.name, tf: h.tf, mkt: h.mkt, g: h.g, r: h.r, pnl: h.pnl, why: h.why, opened: h.opened, closed: h.closed,
        fees: h.fees, risk: h.risk, mfe: h.mfe, mae: h.mae, tags, sig: h.at || (h.opened || "").slice(0, 13), pend: h.why === "SL" && h.r < 0 ? 1 : 0 };
      if (h.why === "SL" && h.r < 0) ss.watch.push({ kind: "stop", key, b: b.id, k: h.k, sd: h.side === "long" ? 1 : -1, s: h.s ?? h.s0, t: h.t1, until: iso(ms(h.closed) + 864e5) });
      added++;
      if (h.r != null && h.r < 0 && tags.length) { const n2 = tags.map((t) => LESSONS[t]?.t).filter(Boolean).join(", "); slog(ss, now, `Khám nghiệm ${LS(h.side)} ${h.k} (${b.name || b.id}) ${sg(h.r)}R: lỗi – ${n2}`, "rev", b.id); }
      else if (h.r != null && h.r < 0) slog(ss, now, `Khám nghiệm ${LS(h.side)} ${h.k} (${b.name || b.id}) ${sg(h.r)}R: không thấy lỗi quy trình – thua trong xác suất bình thường (không phải lệnh thua nào cũng là sai).`, "rev", b.id);
    }
  }
  // 2) theo dõi giá sau khi đóng / sau khi chặn
  const keep = [];
  for (const w of ss.watch || []) {
    const m = price(w.k), done = (res) => {
      if (w.kind === "stop") { const r = ss.rev[w.key]; if (r) { r.pend = 0; if (res === "t" && !r.tags.includes("stop_tight")) { r.tags.push("stop_tight"); slog(ss, now, `${w.k}: sau khi dính cắt lỗ, giá vẫn chạy tới MT1 trong 24 giờ – ghi nhận "cắt lỗ quá sát".`, "rev", w.b); } } }
      else if (w.kind === "cut" || w.kind === "rot") {
        if (res === "s") { ss.self.cut.ok++; ss.self.cut.R += -w.rS; slog(ss, now, `Tự chấm (${w.bn || w.b}): ${w.kind === "cut" ? "bot giám sát cắt" : "bot giám sát đổi"} ${w.k} là ĐÚNG – giá sau đó về cắt lỗ cũ (tránh thêm ${vn(-w.rS, 2)}R).`, "self", w.b); }
        else if (res === "t") { ss.self.cut.bad++; ss.self.cut.R -= w.rT; slog(ss, now, `Tự chấm (${w.bn || w.b}): ${w.kind === "cut" ? "bot giám sát cắt" : "bot giám sát đổi"} ${w.k} là SAI – giá sau đó tới mục tiêu (lỡ ${vn(w.rT, 2)}R). Bot giám sát sẽ thận trọng hơn khi cắt.`, "self", w.b); }
      } else if (w.kind === "shadow") { const L = (ss.lstat ||= {})[w.l] ||= { ok: 0, bad: 0 }; if (res === "s") L.ok++; else if (res === "t") L.bad++; }
    };
    if (now > ms(w.until)) { done("x"); continue; }
    if (!m) { keep.push(w); continue; }
    if (w.sd * (m - w.t) >= 0) { done("t"); continue; }
    if (w.sd * (m - w.s) <= 0) { done("s"); continue; }
    keep.push(w);
  }
  ss.watch = keep.slice(-400);
  const sk = Object.keys(ss.shadow || {}); if (sk.length > 600) for (const k of sk.slice(0, sk.length - 600)) delete ss.shadow[k];
  // giữ bộ khám nghiệm gọn (≤ 700 lệnh gần nhất)
  const rk = Object.keys(ss.rev); if (rk.length > 700) { rk.sort((a, b) => (ss.rev[a].closed || "").localeCompare(ss.rev[b].closed || "")); for (const k of rk.slice(0, rk.length - 700)) delete ss.rev[k]; }
  // 3) rút bài học (mỗi khi có khám nghiệm mới hoặc 15 phút một lần)
  if (added || !ss.learn_at || now - ms(ss.learn_at) > 15 * 60e3) {
    ss.learn_at = iso(now);
    const R = uniq(Object.values(ss.rev).filter((x) => !x.old && x.r != null && !x.pend)), prevOn = new Set((ss.lessons || []).filter((l) => l.on).map((l) => l.id)), L = [];
    for (const [id, D] of Object.entries(LESSONS)) {
      const A = R.filter((x) => x.tags.includes(id)), Bx = R.filter((x) => !x.tags.includes(id));
      if (!A.length) continue;
      const mA = mean(A.map((x) => x.r)), mB = mean(Bx.map((x) => x.r)) ?? 0, lossA = A.filter((x) => x.r < 0).length / A.length;
      const sh = ss.lstat?.[id], shN = sh ? sh.ok + sh.bad : 0;
      let on = A.length >= 6 && mA < -0.05 && mA < mB - 0.25, note = "";
      if (on && shN >= 8 && sh.bad > sh.ok) { on = false; note = `tự gỡ: trong ${shN} lệnh bị bài học này chặn, ${sh.bad} lệnh lẽ ra thắng – bài học đang chặn nhầm`; }
      if (!on && !note) note = A.length < 6 ? `chưa đủ bằng chứng: ${A.length}/6 lệnh có lỗi này` : `lệnh có lỗi này TB ${sg(mA)}R, lệnh không có ${sg(mB)}R – chênh chưa đủ lớn để thành quy tắc`;
      L.push({ id, t: D.t, act: D.act, how: D.how, sug: D.sug || null, n: A.length, rA: +mA.toFixed(2), rB: +mB.toFixed(2), loss: +(lossA * 100).toFixed(0), on: on && D.act !== "advice", adv: on && D.act === "advice", note,
        sh: sh ? { ok: sh.ok, bad: sh.bad } : null, cost: +(A.filter((x) => x.r < 0).reduce((a, x) => a + x.r, 0)).toFixed(2), since: (ss.lessons || []).find((l) => l.id === id)?.since || (on ? iso(now) : null) });
    }
    L.sort((a, b) => a.cost - b.cost);
    for (const l of L) {
      if ((l.on || l.adv) && !prevOn.has(l.id) && !(ss.lessons || []).find((x) => x.id === l.id && (x.on || x.adv))) {
        slog(ss, now, `📚 Bài học mới: "${l.t}" – ${l.n} lệnh, TB ${sg(l.rA)}R (các lệnh khác: ${sg(l.rB)}R). ${l.on ? "Áp dụng ngay: " + l.how : "Khuyên: " + l.how}.`, "lesson");
        out.push({ key: `sup:lesson:${l.id}:${vnDay(now)}`, sev: 2, title: `🛡️ Bot giám sát rút bài học: ${l.t}`, body: `${l.n} lệnh, TB ${sg(l.rA)}R so với ${sg(l.rB)}R · ${l.on ? "áp dụng: " : "khuyên: "}${l.how}` });
      }
      if (!l.on && prevOn.has(l.id)) slog(ss, now, `Gỡ bài học "${l.t}": ${l.note || "hết bằng chứng"}.`, "lesson");
    }
    ss.lessons = L;
    // nghiên cứu gần đây: coin / thiết lập đang thua ở nhiều bot → tạm tránh
    const recent = R.filter((x) => now - ms(x.closed) < 14 * 864e5), blocks = (ss.blocks || []).filter((b) => ms(b.until) > now), has = (f) => blocks.some(f);
    const byK = {}; for (const x of recent) (byK[x.k] ||= []).push(x);
    for (const [k, xs] of Object.entries(byK)) {
      const loss = xs.filter((x) => x.r < 0), sR = xs.reduce((a, x) => a + x.r, 0);
      if (loss.length >= 3 && sR <= -2 && !has((b) => b.kind === "coin" && b.k === k)) {
        const until = iso(Math.max(...loss.map((x) => ms(x.closed))) + 7 * 864e5); blocks.push({ kind: "coin", k, n: loss.length, R: +sR.toFixed(2), until, at: iso(now) });
        slog(ss, now, `🔬 Nghiên cứu: ${k} – ${loss.length} lệnh thua trong 14 ngày (tổng ${sg(sR)}R) ở các bot – tạm tránh ${k} tới ${until.slice(0, 10)}.`, "lesson");
      }
    }
    const bySet = {}; for (const x of R.filter((x) => now - ms(x.closed) < 30 * 864e5)) (bySet[`${x.setup}|${x.tf}|${x.side}`] ||= []).push(x);
    for (const [key, xs] of Object.entries(bySet)) {
      const mR = mean(xs.map((x) => x.r)), [setup, tf, side] = key.split("|");
      if (xs.length >= 8 && mR <= -0.3 && !has((b) => b.kind === "setup" && b.setup === setup && b.tf === tf && b.side === side)) {
        const until = iso(now + 14 * 864e5); blocks.push({ kind: "setup", setup, tf, side, name: xs[0].name, n: xs.length, R: +mR.toFixed(2), until, at: iso(now) });
        slog(ss, now, `🔬 Nghiên cứu: "${xs[0].name}" ${tf === "d" ? "ngày" : "4h"} ${LS(side)} 30 ngày qua ${xs.length} lệnh, TB ${sg(mR)}R – tạm dừng thiết lập này 14 ngày (thị trường hiện không hợp).`, "lesson");
      }
    }
    // tầng trên: cùng thiết lập thua ở MỌI khung thời gian (vd. "phá đỉnh" khung 4h lẫn ngày) → chặn cả thiết lập theo chiều đó
    const bySS = {}; for (const x of R.filter((x) => now - ms(x.closed) < 30 * 864e5)) (bySS[`${x.setup}|${x.side}`] ||= []).push(x);
    for (const [key, xs] of Object.entries(bySS)) {
      const mR = mean(xs.map((x) => x.r)), [setup, side] = key.split("|");
      if (xs.length >= 6 && mR <= -0.4 && !has((b) => b.kind === "setup" && b.setup === setup && b.tf === "*" && b.side === side)) {
        const until = iso(now + 10 * 864e5); blocks.push({ kind: "setup", setup, tf: "*", side, name: xs[0].name, n: xs.length, R: +mR.toFixed(2), until, at: iso(now) });
        slog(ss, now, `🔬 Nghiên cứu: "${xs[0].name}" ${LS(side)} thua ở mọi khung – ${xs.length} tín hiệu, TB ${sg(mR)}R – tạm dừng cả thiết lập 10 ngày.`, "lesson");
      }
    }
    // tầng trên cùng: MỌI thiết lập cùng chiều đều thua 7 ngày qua → thị trường không ủng hộ chiều đó (chế độ thị trường) → dừng chiều đó 3 ngày
    for (const side of ["long", "short"]) {
      const xs = R.filter((x) => x.side === side && now - ms(x.closed) < 7 * 864e5), mR = mean(xs.map((x) => x.r));
      if (xs.length >= 10 && mR <= -0.4 && !has((b) => b.kind === "side" && b.side === side)) {
        const until = iso(now + 3 * 864e5); blocks.push({ kind: "side", side, n: xs.length, R: +mR.toFixed(2), until, at: iso(now) });
        slog(ss, now, `🔬 Chế độ thị trường: ${xs.length} tín hiệu ${LS(side)} 7 ngày qua, TB ${sg(mR)}R ở mọi thiết lập – tạm dừng ${LS(side)} 3 ngày (tự mở lại sớm nếu lệnh bị chặn lẽ ra thắng).`, "lesson");
        out.push({ key: `sup:side:${side}:${vnDay(now)}`, sev: 2, title: `🛡️ Bot giám sát tạm dừng mọi lệnh ${LS(side)}`, body: `${xs.length} tín hiệu ${LS(side)} 7 ngày qua TB ${sg(mR)}R ở mọi thiết lập – thị trường đang không ủng hộ chiều này. Tự mở lại sau 3 ngày hoặc sớm hơn nếu lệnh bị chặn lẽ ra thắng.` });
      }
    }
    // tự sửa sai: lệnh chặn nào mà các tín hiệu bị chặn phần lớn lẽ ra THẮNG → gỡ ngay
    const LS2 = ss.lstat || {};
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i], id = b.kind === "side" ? `blk:side:${b.side}` : b.kind === "setup" && b.tf === "*" ? `blk:${b.setup}|*|${b.side}` : null, q = id && LS2[id];
      if (q && q.ok + q.bad >= 6 && q.bad > q.ok * 1.5) { slog(ss, now, `🔁 Gỡ chặn ${b.kind === "side" ? LS(b.side) : `"${b.name}" ${LS(b.side)}`}: ${q.bad}/${q.ok + q.bad} tín hiệu bị chặn lẽ ra thắng – thị trường đã đổi.`, "lesson"); blocks.splice(i, 1); delete LS2[id]; }
    }
    ss.blocks = blocks.slice(-40);
  }
  // 4) chấm điểm từng bot + phân tích phí + gợi ý chỉnh thiết lập
  const cards = {};
  for (const b of B) { const st = S[b.id]; if (!st) continue; cards[b.id] = { ...card(st, norm(b), scfg), name: b.name || b.id, enabled: !!b.enabled, paused: !!st.paused }; }
  const best = Object.entries(cards).filter(([, c]) => c.n >= scfg.min_trades).sort((a, b) => b[1].avgR - a[1].avgR)[0];
  for (const [id, c] of Object.entries(cards)) {
    const sug = [], b = B.find((x) => x.id === id), mine = Object.values(ss.rev).filter((x) => x.b === id && !x.old && x.r != null && x.r < 0);
    for (const l of ss.lessons || []) {
      const n = mine.filter((x) => x.tags.includes(l.id)).length;
      if (!(l.on || l.adv) || n < 2 || !l.sug) continue;
      const patch = {};
      for (const [k, v] of Object.entries(l.sug)) patch[k] = typeof v === "string" && /^[+-]/.test(v) ? Math.max(1, (+b?.[k] || 0) + +v) : v;
      if (Object.entries(patch).every(([k, v]) => b?.[k] === v)) continue;
      sug.push({ id: l.id, t: `${n} lệnh thua của bot này do "${l.t}" → ${Object.entries(patch).map(([k, v]) => ({ htf_align: "bật 'Bắt buộc khung lớn cùng chiều'", min_win: `nâng xác suất tối thiểu lên ${v}%`, streak_cut: "bật 'Thua 3 lệnh liên tiếp → giảm rủi ro'", max_lev: `giảm đòn bẩy tối đa xuống x${v}` }[k] || `${k} = ${v}`)).join(", ")}`, patch });
    }
    if (c.fee_share != null && c.fee_share > 25) sug.push({ id: "fee", t: `phí đã ăn ${vn(c.fee_share, 0)}% lãi gộp – ưu tiên futures (phí 0,05%) thay vì spot (0,1%), bỏ lệnh cắt lỗ quá hẹp`, patch: null });
    if (best && best[0] !== id && c.n >= scfg.min_trades && c.avgR < best[1].avgR - 0.2) sug.push({ id: "copy", t: `${best[1].name} đang tốt hơn rõ (${sg(best[1].avgR)}R/lệnh so với ${sg(c.avgR)}R) – cân nhắc dùng thiết lập của ${best[1].name}`, patch: null, from: best[0] });
    c.sug = sug;
  }
  ss.cards = cards;
  // 5) báo cáo của bot giám sát mỗi 15 phút
  if (!ss.rep_at || now - ms(ss.rep_at) >= 15 * 60e3) {
    const a = ss.acct || {}, on = (ss.lessons || []).filter((l) => l.on && !scfg.off.includes(l.id)), V = { good: "tốt", ok: "ổn", watch: "cần theo dõi", pause: "nên dừng", learn: "đang học" };
    const fees = Object.values(cards).reduce((s, c) => s + (c.fees || 0), 0), fund = Object.values(cards).reduce((s, c) => s + (c.fund || 0), 0);
    const lines = [
      `🏦 Tài sản chung ${vn(a.eq || 0, 2)} USDT · hôm nay ${sg(a.day_pct || 0)}% · sụt ${vn(a.dd || 0, 1)}%/${scfg.acct_dd}% · rủi ro mở chung ${vn(a.heat || 0, 1)}% · ${a.n_pos || 0} lệnh ở ${a.n_bots || 0} bot${ss.halt ? ` · ⛔ KHOÁ: ${ss.halt.why}` : ""}`,
      `🤖 ${Object.values(cards).map((c) => `${c.name}: ${V[c.v]} (${c.n} lệnh${c.avgR != null ? `, ${sg(c.avgR)}R` : ""})`).join(" · ") || "chưa có bot"}`,
      `💸 Phí đã trả ${vn(fees, 2)} USDT + funding ${sg(fund)} USDT${Object.values(cards).some((c) => c.feeR != null) ? ` · TB ${vn(mean(Object.values(cards).filter((c) => c.feeR != null).map((c) => c.feeR)), 2)}R mỗi lệnh` : ""}`,
      `📚 ${on.length ? `${on.length} bài học đang áp dụng: ${on.map((l) => l.t).join(", ")}` : "chưa có bài học đủ bằng chứng – các bot chạy theo thiết lập gốc"}${(ss.blocks || []).length ? ` · tạm tránh: ${(ss.blocks || []).map((b) => b.kind === "coin" ? b.k : `${b.name} ${b.tf === "d" ? "ngày" : "4h"}`).join(", ")}` : ""}`,
      `🧑‍⚖️ Tự chấm các lần cắt/đổi: ${ss.self.cut.ok} lần đúng · ${ss.self.cut.bad} lần sai (ròng ${sg(ss.self.cut.R, 2)}R)${ss.self.cut.ok + ss.self.cut.bad >= 8 && ss.self.cut.R < 0 ? " → đã nâng ngưỡng cắt" : ""}`,
    ];
    ss.report = { at: iso(now), lines }; ss.rep_at = iso(now); ss.reports = [...(ss.reports || []).slice(-23), ss.report];
  }
  ss.at = iso(now);
  return out;
}
