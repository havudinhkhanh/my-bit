// Bộ khớp lệnh của bot – chạy MỖI PHÚT trên Cloudflare (cùng Worker hẹn giờ), không cần máy anh mở.
// Chia việc: máy chủ phân tích (Python, 15 phút) viết "botplan" = ứng viên đã lọc + trần đòn bẩy + funding + báo cáo;
// Worker này là nơi DUY NHẤT ghi "botstate": theo dõi giá từng phút (kèm đỉnh/đáy trong phút), cắt lỗ / chốt lời / dời hoà vốn,
// vào lệnh đúng lúc giá còn đẹp, tính funding, phanh an toàn, ghi nhật ký và thông báo (chuông). Quy tắc giống hệt app/bot.py.
import PLANS from "../functions/_lib/plans.json";

const FEE = { spot: 0.001, fut: 0.0005 }, SLIP = 0.0005;
const PRESETS = {
  safe: { risk: 0.5, max_pos: 5, max_lev: 2, min_win: 45, min_avgR: 0.15, daily_stop: 2, max_dd: 10, max_heat: 3, max_sector: 2, max_gross: 1.0, cash_min: 30 },
  bal: { risk: 1.0, max_pos: 10, max_lev: 3, min_win: 40, min_avgR: 0.1, daily_stop: 3, max_dd: 15, max_heat: 5, max_sector: 3, max_gross: 1.5, cash_min: 20 },
  aggr: { risk: 1.5, max_pos: 15, max_lev: 5, min_win: 35, min_avgR: 0.05, daily_stop: 5, max_dd: 25, max_heat: 8, max_sector: 4, max_gross: 2.5, cash_min: 10 },
};
const DEF = { enabled: false, capital: 1000, preset: "bal", target_month: 5, protect: true, tp1_part: 50, be_after_tp1: true, time_stop: true, streak_cut: true, eq_ma: true, use_model: true, ...PRESETS.bal };
const HARD = { risk: [0.1, 2], max_pos: [1, 20], max_lev: [1, 5], daily_stop: [0.5, 10], max_dd: [3, 50], capital: [50, 1e7], target_month: [0, 100], tp1_part: [0, 100],
  max_heat: [1, 15], max_sector: [1, 10], max_gross: [0.5, 5], cash_min: [0, 80] };
const iso = (t) => new Date(t).toISOString().slice(0, 19);
const ms = (s) => Date.parse(s.length <= 19 ? s + "Z" : s);
const vnDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
const vn = (x, d = 2) => Number(x).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const sigS = (x) => Number(sig(x)).toLocaleString("vi-VN", { maximumFractionDigits: 12 });
const sig = (x) => { if (!x) return 0; const d = Math.max(2, 6 - Math.floor(Math.log10(Math.abs(x)))); return +x.toFixed(Math.min(12, d)); };

function norm(c) {
  c = { ...DEF, ...(c || {}) };
  for (const [k, [lo, hi]] of Object.entries(HARD)) { const v = Number(c[k]); c[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEF[k]; }
  c.max_pos = Math.floor(c.max_pos); c.max_lev = Math.floor(c.max_lev);
  return c;
}
function newState(cap, now) {
  return { v: 1, start: cap, cash: cap, pos: [], hist: [], log: [], eq: [[iso(now), +cap.toFixed(2)]], peak: cap, day: { d: vnDay(now), eq0: cap }, month: { m: vnDay(now).slice(0, 7), eq0: cap },
    paused: null, research: null, seq: 1, created: iso(now), reset_seen: null, close_seen: null, last: null };
}
const say = (st, now, m, k = "info") => { st.log = [...(st.log || []).slice(-149), { t: iso(now), k, m }]; };
function equity(st, price) {
  let e = +st.cash || 0;
  for (const p of st.pos || []) { const m = price(p.k) || p.e; e += p.mkt === "spot" ? p.q * m : p.margin + p.sd * p.q * (m - p.e); }
  return e;
}
function openPos(st, x, mkt, q, px, lev, now) {
  const sd = x.side === "long" ? 1 : -1, fill = px * (1 + sd * SLIP), n = q * fill, fee = n * FEE[mkt], margin = mkt === "fut" ? n / lev : n;
  st.cash -= margin + fee;
  const p = { id: st.seq++, k: x.k, mkt, side: x.side, sd, q, q0: q, e: fill, s: x.s, s0: x.s, t1: x.t1, t2: x.t2, lev, margin: mkt === "fut" ? margin : 0, fees: fee, fee0: fee, fund: 0, real: 0,
    tf: x.tf, setup: x.setup, name: x.name, win1: x.win1, avgR: x.avgR, risk_usd: q * Math.abs(fill - x.s), opened: iso(now), chk: iso(now), tp1: false,
    tmax: iso(now + (x.d1 || 10) * (x.bd || 1) * 2.2 * 864e5) };
  st.pos.push(p);
  return p;
}
function closePart(st, p, q, px) {
  const fill = px * (1 - p.sd * SLIP), pnl = p.sd * q * (fill - p.e), fee = q * fill * FEE[p.mkt];
  if (p.mkt === "spot") st.cash += q * fill - fee;
  else { const part = p.margin * q / p.q; p.margin -= part; st.cash += part + pnl - fee; }
  p.q -= q; p.fees += fee; p.real += pnl - fee;
}
const WHY = { SL: "dính cắt lỗ", BE: "về hoà vốn sau MT1", TP1: "chạm MT1", TP2: "chạm MT2", TIME: "hết thời gian kỳ vọng", LIQ: "bị thanh lý", MANUAL: "anh yêu cầu đóng" };
function closeAll(st, p, px, why, now, ev) {
  closePart(st, p, p.q, px);
  const tot = p.real - p.fee0 - p.fund, r = p.risk_usd ? tot / p.risk_usd : null;
  const h = { id: p.id, k: p.k, mkt: p.mkt, side: p.side, lev: p.lev, e: p.e, s0: p.s0, t1: p.t1, t2: p.t2, q: p.q0, pnl: +tot.toFixed(2), r: r == null ? null : +r.toFixed(2), why, tf: p.tf,
    setup: p.setup, name: p.name, opened: p.opened, closed: iso(now) };
  st.hist = [...(st.hist || []).slice(-299), h];
  st.pos = st.pos.filter((y) => y !== p);
  ev.push(["close", p, h]);
  say(st, now, `Đóng ${p.k} (${p.sd > 0 ? "Long" : "Short"} ${p.mkt}) – ${WHY[why] || why}: ${h.pnl >= 0 ? "+" : ""}${vn(h.pnl, 2)} USDT${h.r != null ? ` (${h.r >= 0 ? "+" : ""}${vn(h.r, 2)}R)` : ""}`, h.pnl >= 0 ? "win" : "loss");
}
// hl[k] = {hi, lo} từ nến 1 phút kể từ lần kiểm tra trước (bắt được râu nến giữa hai lần chạy)
function manage(st, cfg, price, hl, f8, now, ev) {
  for (const p of [...(st.pos || [])]) {
    const m = price(p.k); if (!m) continue;
    const x = hl[p.k] || { hi: m, lo: m }, hi = Math.max(x.hi, m), lo = Math.min(x.lo, m), L = p.sd > 0;
    if (L ? lo <= p.s : hi >= p.s) { closeAll(st, p, p.s, p.tp1 ? "BE" : "SL", now, ev); continue; }
    if (!p.tp1 && (L ? hi >= p.t1 : lo <= p.t1)) {
      const part = p.q * cfg.tp1_part / 100;
      if (part > 0 && part < p.q * 0.999) {
        closePart(st, p, part, p.t1); p.tp1 = true; if (cfg.be_after_tp1) p.s = p.e;
        ev.push(["tp1", p, null]);
        say(st, now, `${p.k}: chạm MT1 ${sigS(p.t1)} – chốt ${cfg.tp1_part}%, dời cắt lỗ về hoà vốn`, "tp");
      } else { closeAll(st, p, p.t1, "TP1", now, ev); continue; }
    }
    if (L ? hi >= p.t2 : lo <= p.t2) { closeAll(st, p, p.t2, "TP2", now, ev); continue; }
    if (p.mkt === "fut") {
      const f = f8[p.k];
      if (f != null) { const n8 = Math.floor(now / 288e5) - Math.floor(ms(p.chk) / 288e5); if (n8 > 0) { const pay = p.sd * p.q * m * f / 100 * n8; p.fund += pay; st.cash -= pay; } }
      if (p.margin + p.sd * p.q * (m - p.e) <= p.q * m * 0.005) { closeAll(st, p, m, "LIQ", now, ev); continue; }
    }
    if (cfg.time_stop && !p.tp1 && now >= ms(p.tmax)) { closeAll(st, p, m, "TIME", now, ev); continue; }
    p.chk = iso(now);
  }
}
function liveOk(x, p) {
  const sd = x.side === "long" ? 1 : -1;
  if (sd * (p - x.s) <= 0) return [false];
  if (sd * (p - x.t1) >= 0) return [false];
  const rr = Math.abs(x.t1 - p) / Math.abs(p - x.s);
  return [rr >= 1.2, rr];
}
// xét từng ứng viên – vừa quyết định vào lệnh, vừa ghi lại "suy nghĩ" (vì sao vào / chờ / bỏ)
function entries(st, cfg, cands, price, now, ev, mult, halt, fresh) {
  const eq = equity(st, price), held = new Set(st.pos.map((p) => p.k)), used = new Set(st.used || []), th = [];
  const cool = new Set((st.hist || []).filter((h) => h.pnl < 0 && now - ms(h.closed) < 864e5).map((h) => h.k));
  const dd = st.peak ? Math.max(0, (1 - eq / st.peak) * 100) : 0;
  const heatNow = () => st.pos.filter((p) => !p.tp1 || p.s !== p.e).reduce((a, p) => a + p.risk_usd, 0) / eq * 100;
  const grossNow = () => st.pos.reduce((a, p) => a + p.q * (price(p.k) || p.e), 0) / eq;
  const secN = (g) => st.pos.filter((p) => g && p.g === g).length;
  for (const x of (cands || []).slice(0, 12)) {
    const key = `${x.k}|${x.setup}|${x.tf}|${x.at}`, p = price(x.k), L = x.side === "long", sd = L ? 1 : -1;
    const t = { k: x.k, side: x.side, tf: x.tf, mkt: x.mkt, name: x.name, win1: x.win1, avgR: x.avgR, pm: x.pm, play: x.play, p, e: x.e, s: x.s, t1: x.t1, g: x.g };
    th.push(t);
    if (held.has(x.k)) { t.v = "hold"; t.why = "đang có lệnh với coin này"; continue; }
    if (used.has(key)) { t.v = "done"; t.why = "đã đánh tín hiệu này rồi"; continue; }
    if (cool.has(x.k)) { t.v = "cool"; t.why = "vừa thua lệnh coin này – nghỉ 24 giờ"; continue; }
    if (cfg.use_model && x.play === "avoid") { t.v = "model"; t.why = `mô hình riêng của ${x.k} cho thấy thiết lập này lỗ trong lịch sử mã này – bỏ qua`; continue; }
    if (cfg.use_model && x.pm != null && x.pm < cfg.min_win) { t.v = "model"; t.why = `mô hình học máy ước xác suất chạm MT1 chỉ ${x.pm}% (< ${cfg.min_win}%)`; continue; }
    if (!p) { t.v = "nopx"; t.why = "chưa lấy được giá từ mọi nguồn"; continue; }
    if (!fresh(x.k)) { t.v = "nopx"; t.why = "chỉ có giá cũ (lượt phân tích 15 phút) – không vào lệnh bằng giá cũ"; continue; }
    if (sd * (p - x.s) <= 0) { t.v = "dead"; t.why = `giá ${sigS(p)} đã qua cắt lỗ ${sigS(x.s)} – tín hiệu hỏng`; continue; }
    if (sd * (p - x.t1) >= 0) { t.v = "miss"; t.why = `giá ${sigS(p)} đã tới MT1 – lỡ nhịp, không đuổi`; continue; }
    const rr = Math.abs(x.t1 - p) / Math.abs(p - x.s); t.rr = rr;
    if (rr < 1.2) { const lvl = (x.t1 + 1.2 * x.s) / 2.2; t.v = "wait"; t.lvl = lvl; t.why = `R:R chỉ còn ${vn(rr, 2)} (cần ≥ 1,2) – chờ giá ${L ? "hồi về ≤" : "hồi lên ≥"} ${sigS(lvl)}`; continue; }
    if (halt) { t.v = "halt"; t.why = `đạt chuẩn (R:R ${vn(rr, 1)}) nhưng không mở lệnh: ${halt}`; continue; }
    if (st.pos.length >= cfg.max_pos) { t.v = "full"; t.why = `đạt chuẩn (R:R ${vn(rr, 1)}) nhưng đã đủ ${cfg.max_pos} lệnh`; continue; }
    const riskPct = cfg.risk * mult, hn = heatNow();
    if (hn + riskPct > cfg.max_heat + 1e-9) { t.v = "heat"; t.why = `kỷ luật vốn: tổng rủi ro đang mở ${vn(hn, 1)}% + ${vn(riskPct, 1)}% > trần ${cfg.max_heat}% tài sản`; continue; }
    if (x.g && secN(x.g) >= cfg.max_sector) { t.v = "sector"; t.why = `kỷ luật vốn: đã có ${secN(x.g)} lệnh nhóm ${x.g} (tối đa ${cfg.max_sector}) – tránh dồn rủi ro một nhóm`; continue; }
    const riskUsd = eq * riskPct / 100, free = st.cash - eq * cfg.cash_min / 100;
    let n = riskUsd / Math.abs(p - x.s) * p, lev = 1;
    n = Math.min(n, Math.max(0, (cfg.max_gross - grossNow()) * eq));
    if (x.mkt === "spot") n = Math.min(n, eq * 0.3, free * 0.98);
    else {
      let cap = Math.min(cfg.max_lev, x.cap || 1); if (dd >= 20) cap = 1; else if (dd >= 10) cap = Math.min(cap, 2);
      n = Math.min(n, eq * 0.25 * cap);
      lev = Math.max(1, Math.min(cap, Math.ceil(n / Math.max(1e-9, eq * 0.25))));
      if (n / lev > free * 0.98) n = Math.max(0, free * 0.98 * lev);
    }
    if (n < 10) { t.v = "cash"; t.why = grossNow() >= cfg.max_gross - 0.01 ? `kỷ luật vốn: tổng giá trị vị thế đã ${vn(grossNow(), 2)}× tài sản (trần ${cfg.max_gross}×)` : `kỷ luật vốn: phải giữ ≥ ${cfg.cash_min}% tiền mặt dự phòng`; continue; }
    const pos = openPos(st, x, x.mkt, n / p, p, lev, now);
    pos.g = x.g || null;
    held.add(x.k); st.used = [...(st.used || []).slice(-299), key];
    t.v = "go"; t.why = `VÀO: R:R ${vn(rr, 1)}, rủi ro ${vn(pos.risk_usd, 2)} USDT (${vn((pos.risk_usd / eq * 100), 2)}%), ${x.mkt === "spot" ? "spot" : "futures x" + lev}${x.pm != null ? `, mô hình ${x.pm}%` : ""}`;
    ev.push(["open", pos, null]);
    say(st, now, `Vào ${L ? "Long" : "Short"} ${x.k} (${x.mkt === "spot" ? "spot" : "futures x" + lev}) ở ${sigS(pos.e)} · cắt lỗ ${sigS(x.s)} · MT1 ${sigS(x.t1)} · MT2 ${sigS(x.t2)} · rủi ro ${vn(pos.risk_usd, 2)} USDT – ${x.name} (${x.tf === "d" ? "ngày" : "4h"}, xác suất ${x.win1}%${x.pm != null ? `, mô hình ${x.pm}%` : ""}, lãi TB ${x.avgR}R, R:R ${vn(rr, 1)})`, "open");
  }
  return th;
}
function posThink(st, price) {
  return (st.pos || []).map((p) => {
    const m = price(p.k) || p.e, L = p.sd > 0, u = p.sd * p.q * (m - p.e) + p.real - p.fee0 - p.fund;
    const toS = (p.s / m - 1) * 100, toT = ((p.tp1 ? p.t2 : p.t1) / m - 1) * 100;
    return { k: p.k, side: p.side, mkt: p.mkt, lev: p.lev, p: m, e: p.e, s: p.s, t: p.tp1 ? p.t2 : p.t1, tp1: p.tp1, u: +u.toFixed(2), r: p.risk_usd ? +(u / p.risk_usd).toFixed(2) : null,
      toS: +toS.toFixed(2), toT: +toT.toFixed(2), tmax: p.tmax,
      why: `${L ? "Long" : "Short"} ${p.k}: giá ${sigS(m)} · ${p.tp1 ? "đã chốt MT1, cắt lỗ ở hoà vốn" : "chờ MT1"} · còn ${vn(Math.abs(toT), 1)}% tới ${p.tp1 ? "MT2" : "MT1"}, ${vn(Math.abs(toS), 1)}% tới cắt lỗ → giữ` };
  });
}
// dòng suy nghĩ: chỉ ghi khi bot đổi ý về một ứng viên (tránh lặp mỗi phút)
function thinkLog(st, th, now) {
  const prev = st.cv || {}, cur = {};
  for (const t of th) {
    const k = `${t.k}|${t.side}|${t.tf}`; cur[k] = t.v;
    if (prev[k] !== t.v && !["hold", "done"].includes(t.v)) st.dlog = [...(st.dlog || []).slice(-149), { t: iso(now), k: t.k, v: t.v, m: `${t.side === "long" ? "Long" : "Short"} ${t.k} (${t.tf === "d" ? "ngày" : "4h"}): ${t.why}` }];
  }
  st.cv = cur;
}

function report(st, cfg, th, plan, price, now, eq, dayPct, monPct, dd, mwhy, halt) {
  const f = (x, d = 2) => (x >= 0 ? "+" : "") + vn(x, d), S = st.stats || {}, L = { green: "Xanh", yellow: "Vàng", red: "Đỏ" }[plan?.light] || "—";
  const cnt = (v) => th.filter((t) => t.v === v).length, btc = price("BTC");
  const lines = [
    `💰 Tài sản ${vn(eq, 2)} USDT · hôm nay ${f(dayPct)}% · tháng ${f(monPct)}% (mục tiêu ${cfg.target_month}%) · sụt ${vn(dd, 1)}%/${cfg.max_dd}%`,
    `🛡️ Rủi ro đang mở ${vn((S.heat ?? 0), 1)}%/${cfg.max_heat}% · ${st.pos.length}/${cfg.max_pos} lệnh · tổng vị thế ${vn((S.gross ?? 0), 2)}×/${cfg.max_gross}× · tiền mặt ${vn((S.cash_pct ?? 0), 0)}% (giữ ≥ ${cfg.cash_min}%) · rủi ro/lệnh ${vn((cfg.risk * (S.risk_mult || 1)), 2)}%${mwhy.length ? " (đã giảm: " + mwhy.join(", ") + ")" : ""}`,
    `🌡️ Thị trường: đèn ${L}${btc ? ` · BTC ${sigS(btc)}` : ""} · ${Object.values(st.pxsrc || {}).length ? `giá mới từ ${[...new Set(Object.values(st.pxsrc))].join(", ")}` : ""}`,
    `🔎 ${th.length} ứng viên đang xét: ${cnt("go")} vào · ${cnt("wait")} chờ giá · ${cnt("heat") + cnt("sector") + cnt("cash")} bị kỷ luật vốn chặn · ${cnt("model")} mô hình loại · ${cnt("dead") + cnt("miss")} hỏng/lỡ`,
  ];
  for (const p of st.pos.slice(0, 8)) { const m = price(p.k) || p.e, u = p.sd * p.q * (m - p.e) + p.real - p.fee0 - p.fund, r = p.risk_usd ? u / p.risk_usd : 0; lines.push(`📌 ${p.sd > 0 ? "Long" : "Short"} ${p.k}: ${f(r)}R (${f(u)} USDT) · ${p.tp1 ? "đã chốt MT1, cắt lỗ hoà vốn" : `còn ${vn(Math.abs(((p.t1 / m) - 1) * 100), 1)}% tới MT1, ${vn(Math.abs(((p.s / m) - 1) * 100), 1)}% tới cắt lỗ`}`); }
  const w = th.filter((t) => t.v === "wait").slice(0, 3);
  if (w.length) lines.push("⏳ Đang canh: " + w.map((t) => `${t.k} ${t.side === "long" ? "≤" : "≥"} ${sigS(t.lvl)}`).join(" · "));
  if (halt) lines.push(`⛔ ${halt}`);
  return { at: iso(now), lines };
}
export function botStep(cfgRaw, st, plan, price, hl, now) {
  const cfg = norm(cfgRaw), ev = [];
  if (!st || (cfgRaw?.reset_at && cfgRaw.reset_at !== st.reset_seen)) {
    st = newState(cfg.capital, now); st.reset_seen = cfgRaw?.reset_at || null;
    say(st, now, `Khởi tạo tài khoản bot trên sàn thử: ${vn(cfg.capital, 0)} USDT`);
  }
  const f8 = plan?.f8 || {};
  manage(st, cfg, price, hl, f8, now, ev);
  if (cfgRaw?.close_all_at && cfgRaw.close_all_at !== st.close_seen) { for (const p of [...st.pos]) closeAll(st, p, price(p.k) || p.e, "MANUAL", now, ev); st.close_seen = cfgRaw.close_all_at; }
  let eq = equity(st, price);
  st.peak = Math.max(+st.peak || eq, eq);
  const day = vnDay(now);
  if (st.day?.d !== day) st.day = { d: day, eq0: eq };
  if (st.month?.m !== day.slice(0, 7)) st.month = { m: day.slice(0, 7), eq0: eq };
  const dd = st.peak ? (1 - eq / st.peak) * 100 : 0, dayPct = st.day.eq0 ? (eq / st.day.eq0 - 1) * 100 : 0, monPct = st.month.eq0 ? (eq / st.month.eq0 - 1) * 100 : 0;
  if (dd >= cfg.max_dd && !st.paused) {
    st.paused = { at: iso(now), why: `sụt ${vn(dd, 1)}% so với đỉnh (giới hạn ${vn(cfg.max_dd, 0)}%)` };
    say(st, now, `⛔ Bot TẠM DỪNG: ${st.paused.why}. Lệnh đang mở vẫn giữ cắt lỗ; bấm 'Chạy lại' để tiếp tục.`, "stop");
    ev.push(["pause", null, st.paused]);
  }
  if (cfgRaw?.resume_at && cfgRaw.resume_at !== st.resume_seen) { st.resume_seen = cfgRaw.resume_at; if (st.paused) { st.paused = null; st.peak = eq; say(st, now, "Anh cho bot chạy lại – đỉnh tài sản được đặt lại theo hiện tại."); } }
  if (plan?.research && (!st.research || st.research.d !== plan.research.d || st.research.at < plan.research.at)) {
    const fresh = !st.research || st.research.d !== plan.research.d;
    st.research = plan.research;
    if (fresh) ev.push(["research", null, plan.research]);
  }
  let halt = null;
  if (!cfg.enabled) halt = "bot đang tắt";
  else if (st.paused) halt = "bot tạm dừng";
  else if (dayPct <= -cfg.daily_stop) halt = `lỗ ${vn(dayPct, 1)}% hôm nay (giới hạn ${vn(cfg.daily_stop, 1)}%)`;
  else if (!plan || now - ms(plan.at) > 45 * 60e3) halt = "chờ kế hoạch mới từ máy chủ phân tích";
  // kỷ luật: giảm rủi ro khi đạt mục tiêu tháng / thua liên tiếp / tài sản dưới đường trung bình
  let mult = 1; const mwhy = [];
  if (cfg.protect && monPct >= cfg.target_month && cfg.target_month > 0) { mult *= 0.5; mwhy.push("đã đạt mục tiêu tháng"); }
  const lastH = (st.hist || []).slice(-3);
  if (cfg.streak_cut && lastH.length === 3 && lastH.every((h) => h.pnl < 0) && now - ms(lastH[2].closed) < 864e5) { mult *= 0.5; mwhy.push("thua 3 lệnh liên tiếp"); }
  const eqs = (st.eq || []).slice(-20).map((q) => q[1]);
  if (cfg.eq_ma && eqs.length >= 20 && eq < eqs.reduce((a, b) => a + b, 0) / eqs.length) { mult *= 0.5; mwhy.push("tài sản dưới trung bình 20 giờ"); }
  const th = plan && cfg.enabled ? entries(st, cfg, plan.cands, price, now, ev, mult, halt, price.fresh || (() => true)) : [];
  thinkLog(st, th, now);
  eq = equity(st, price);
  const nGo = th.filter((t) => t.v === "go").length, nWait = th.filter((t) => t.v === "wait").length;
  st.think = { at: iso(now), eq: +eq.toFixed(2), light: plan?.light || null, n: (plan?.cands || []).length, plan_at: plan?.at || null, halt,
    head: !cfg.enabled ? "Bot đang tắt – chỉ quản lý lệnh còn mở." : halt ? `Không mở lệnh mới: ${halt}.` : nGo ? `Vừa vào ${nGo} lệnh.` : nWait ? `${nWait} ứng viên gần đạt chuẩn – chờ giá đẹp hơn.` : (plan?.cands || []).length ? "Các ứng viên chưa có điểm vào tốt – tiếp tục theo dõi." : "Không có ứng viên khớp thiết lập – đứng ngoài.",
    pos: posThink(st, price), cands: th.map((t) => ({ ...t, p: t.p ? +t.p.toPrecision(8) : null })) };
  const h = st.eq || [];
  if (!h.length || now - ms(h[h.length - 1][0]) >= 3000e3) h.push([iso(now), +eq.toFixed(2)]);
  st.eq = h.slice(-1500);
  const hist = st.hist || [], wins = hist.filter((x) => x.pnl > 0);
  st.stats = { eq: +eq.toFixed(2), ret: +((eq / st.start - 1) * 100).toFixed(2), dd: +dd.toFixed(2), day_pct: +dayPct.toFixed(2), mon_pct: +monPct.toFixed(2), n: hist.length,
    win: hist.length ? +(wins.length / hist.length * 100).toFixed(1) : null, avgR: hist.length ? +(hist.reduce((a, x) => a + (x.r || 0), 0) / hist.length).toFixed(2) : null,
    halt, risk_mult: mult, mult_why: mwhy, open_risk: +st.pos.filter((p) => !p.tp1 || p.s !== p.e).reduce((a, p) => a + p.risk_usd, 0).toFixed(2), engine: "1m",
    heat: eq ? +(st.pos.filter((p) => !p.tp1 || p.s !== p.e).reduce((a, p) => a + p.risk_usd, 0) / eq * 100).toFixed(2) : 0,
    gross: eq ? +(st.pos.reduce((a, p) => a + p.q * (price(p.k) || p.e), 0) / eq).toFixed(2) : 0, cash_pct: eq ? +(st.cash / eq * 100).toFixed(1) : 0 };
  st.last = iso(now);
  // báo cáo mỗi 2 phút
  if (!st.rep_at || now - ms(st.rep_at) >= 115e3) { st.report = report(st, cfg, th, plan, price, now, eq, dayPct, monPct, dd, mwhy, halt); st.rep_at = iso(now); st.reports = [...(st.reports || []).slice(-29), st.report]; }
  return { st, ev };
}
function notes(ev) {
  const out = [];
  for (const [kind, p, h] of ev) {
    if (kind === "open") out.push({ key: `bot:open:${p.id}:${p.opened}`, sev: 2, sym: p.k, title: `🤖 Bot vào ${p.sd > 0 ? "Long" : "Short"} ${p.k} (${p.mkt === "spot" ? "spot" : "futures x" + p.lev})`,
      body: `Giá ${sigS(p.e)} · cắt lỗ ${sigS(p.s)} · MT1 ${sigS(p.t1)} · rủi ro ${vn(p.risk_usd, 2)} USDT (sàn thử)` });
    else if (kind === "close") out.push({ key: `bot:close:${h.id}:${h.closed}`, sev: 2, sym: h.k, title: `🤖 Bot đóng ${h.k}: ${h.pnl >= 0 ? "+" : ""}${vn(h.pnl, 2)} USDT${h.r != null ? ` (${h.r >= 0 ? "+" : ""}${vn(h.r, 2)}R)` : ""}`,
      body: `Lý do: ${WHY[h.why] || h.why} · vào ${sigS(h.e)} (sàn thử)` });
    else if (kind === "tp1") out.push({ key: `bot:tp1:${p.id}`, sev: 1, sym: p.k, title: `🤖 ${p.k} chạm MT1 – đã chốt một phần`, body: `Cắt lỗ phần còn lại dời về hoà vốn ${sigS(p.s)}` });
    else if (kind === "pause") out.push({ key: `bot:pause:${h.at}`, sev: 3, title: "⛔ Bot tạm dừng", body: h.why });
    else if (kind === "research") out.push({ key: `bot:research:${h.d}`, sev: 1, title: "🤖 Báo cáo nghiên cứu hôm nay của bot", body: (h.lines || []).join(" ").slice(0, 600) });
  }
  return out;
}

// ---------------------------------------------------------------- giá: Binance spot (data-api, không bị chặn vùng) → OKX swap dự phòng
async function getJ(u, opt) { const r = await fetch(u, { headers: { "user-agent": "my-bit-bot", "content-type": "application/json" }, ...(opt || {}) }); if (!r.ok) throw new Error(r.status + " " + u.split("?")[0]); return r.json(); }
// giá: Binance spot (cả lô, lỗi một mã → lấy cả bảng) → Hyperliquid (mọi perp một lần) → OKX → Bitget → Gate → Binance futures → giá lượt phân tích (cũ)
async function prices(meta, since) {
  const P = {}, SRC = {}, HL = {}, D = { err: [] };
  const ks = Object.keys(meta), put = (k, v, s) => { v = +v; if (v > 0 && !P[k]) { P[k] = v; SRC[k] = s; } };
  const sp = ks.filter((k) => meta[k].sp);
  if (sp.length) {
    let by = null;
    try { const j = await getJ(`https://data-api.binance.vision/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify([...new Set(sp.map((k) => meta[k].sp))]))}`); by = Object.fromEntries(j.map((x) => [x.symbol, +x.price])); }
    catch (e) { D.err.push("binance lô: " + e.message.slice(0, 60)); try { const j = await getJ("https://data-api.binance.vision/api/v3/ticker/price"); by = Object.fromEntries(j.map((x) => [x.symbol, +x.price])); } catch (e2) { D.err.push("binance bảng: " + e2.message.slice(0, 60)); } }
    if (by) for (const k of sp) put(k, by[meta[k].sp] / (meta[k].sm || 1), "Binance");
  }
  let mids = null;
  if (ks.some((k) => !P[k])) { try { mids = await getJ("https://api.hyperliquid.xyz/info", { method: "POST", body: JSON.stringify({ type: "allMids" }) }); } catch (e) { D.err.push("hyperliquid: " + e.message.slice(0, 60)); } }
  if (mids) for (const k of ks) if (!P[k]) { if (mids[k]) put(k, mids[k], "Hyperliquid"); else if (mids["k" + k]) put(k, mids["k" + k] / 1000, "Hyperliquid"); }
  for (const k of ks.filter((k) => !P[k]).slice(0, 10)) {
    const tries = [[`https://www.okx.com/api/v5/market/ticker?instId=${k}-USDT-SWAP`, (j) => j?.data?.[0]?.last, "OKX"], [`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${k}USDT&productType=USDT-FUTURES`, (j) => j?.data?.[0]?.lastPr, "Bitget"],
      [`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${k}_USDT`, (j) => j?.[0]?.last, "Gate"], ...(meta[k].bf ? [[`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${meta[k].bf}`, (j) => j?.price / (meta[k].bfm || 1), "Binance futures"]] : [])];
    for (const [u, f, s] of tries) { try { put(k, f(await getJ(u)), s); if (P[k]) break; } catch (e) { /* nguồn kế */ } }
  }
  for (const k of ks) if (!P[k] && meta[k].p) { P[k] = +meta[k].p; SRC[k] = "cũ"; }
  // đỉnh/đáy nến 1 phút kể từ lần kiểm tra trước – cho coin đang có lệnh mở
  for (const [k, t0] of Object.entries(since)) {
    const m = meta[k] || {};
    try {
      if (m.sp && SRC[k] === "Binance") {
        const j = await getJ(`https://data-api.binance.vision/api/v3/klines?symbol=${m.sp}&interval=1m&startTime=${t0 - 60e3}&limit=60`);
        if (j.length) HL[k] = { hi: Math.max(...j.map((x) => +x[2])) / (m.sm || 1), lo: Math.min(...j.map((x) => +x[3])) / (m.sm || 1) };
      } else {
        const coin = mids && !mids[k] && mids["k" + k] ? "k" + k : k, div = coin === k ? 1 : 1000;
        const j = await getJ("https://api.hyperliquid.xyz/info", { method: "POST", body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval: "1m", startTime: t0 - 60e3, endTime: Date.now() } }) });
        if (Array.isArray(j) && j.length) HL[k] = { hi: Math.max(...j.map((x) => +x.h)) / div, lo: Math.min(...j.map((x) => +x.l)) / div };
      }
    } catch (e) { /* dùng giá hiện tại */ }
  }
  D.need = ks.length; D.fresh = ks.filter((k) => P[k] && SRC[k] !== "cũ").length; D.stale = ks.filter((k) => SRC[k] === "cũ"); D.miss = ks.filter((k) => !P[k]);
  D.src = Object.values(SRC).reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {});
  return { P, SRC, HL, D };
}

const canBot = (u) => {
  if (u.role === "admin") return true;
  const today = new Date().toISOString().slice(0, 10);
  const plan = u.plan_until && u.plan_until < today ? "free" : u.plan;
  return (PLANS.plans[plan]?.features || []).includes("bot");
};

// nhiều bot song song: "bot" = {bots:[cfg…]}, "botstate" = {bots:{id: trạng thái}}, "botplan" = {bots:{id: kế hoạch}} (bản cũ một bot vẫn đọc được)
export const botsOf = (c) => (Array.isArray(c?.bots) ? c.bots : c && typeof c === "object" && "enabled" in c ? [{ id: "b1", ...c }] : []);
export const statesOf = (s) => (s?.bots && typeof s.bots === "object" ? s.bots : s && s.cash != null ? { b1: s } : {});
const plansOf = (p) => (p?.bots && typeof p.bots === "object" ? p.bots : p?.cands ? { b1: p } : {});
const active = (b, st) => b.enabled || st?.pos?.length || (b.reset_at && b.reset_at !== st?.reset_seen);

export async function botTick(env) {
  if (!env.DB) return { skip: "no DB" };
  const now = Date.now(), nowIso = new Date(now).toISOString();
  await env.DB.prepare("INSERT INTO config(key, value) VALUES('bot_hb', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(nowIso).run();
  const { results: rows } = await env.DB.prepare("SELECT d.user_id, d.key, d.value, u.role, u.plan, u.plan_until FROM user_data d JOIN users u ON u.id = d.user_id WHERE u.status = 'active' AND d.key IN ('bot', 'botstate', 'botplan')").all();
  const by = {};
  for (const r of rows || []) { const o = (by[r.user_id] ||= { u: r }); try { o[r.key] = JSON.parse(r.value); } catch (e) { /* bỏ qua */ } }
  const jobs = [];
  for (const [uid, o] of Object.entries(by)) {
    if (!o.bot || !canBot(o.u)) continue;
    const S = statesOf(o.botstate), PL = plansOf(o.botplan), B = botsOf(o.bot).slice(0, 6);
    const list = B.filter((b) => active(b, S[b.id]));
    if (list.length) jobs.push({ uid, o, S, PL, B, list });
  }
  if (!jobs.length) return { users: 0 };
  const meta = {}, since = {};
  for (const j of jobs) for (const b of j.list) {
    Object.assign(meta, j.PL[b.id]?.meta || {});
    for (const p of j.S[b.id]?.pos || []) { since[p.k] = Math.min(since[p.k] ?? Infinity, ms(p.chk)); if (!meta[p.k]) meta[p.k] = j.PL[b.id]?.meta?.[p.k] || {}; }
  }
  if (!meta.BTC) meta.BTC = { sp: "BTCUSDT", sm: 1 };
  const { P, SRC, HL, D } = await prices(meta, since);
  const price = (k) => P[k] ?? null;
  price.fresh = (k) => !!P[k] && SRC[k] !== "cũ";
  await env.DB.prepare("INSERT INTO config(key, value) VALUES('bot_px', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify({ at: nowIso, ...D })).run();
  let n = 0, nev = 0;
  for (const j of jobs) {
    try {
      const out = {}, it = [];
      for (const b of j.B) {                                   // giữ nguyên trạng thái của bot không chạy (đang tắt, không lệnh mở)
        if (!j.list.includes(b)) { if (j.S[b.id]) out[b.id] = j.S[b.id]; continue; }
        const px0 = Object.fromEntries(Object.keys(j.PL[b.id]?.meta || {}).filter((k) => SRC[k]).map((k) => [k, SRC[k]]));
        if (j.S[b.id]) j.S[b.id].pxsrc = px0;
        const { st, ev } = botStep(b, j.S[b.id], j.PL[b.id], price, HL, now);
        st.pxsrc = px0;
        out[b.id] = st; nev += ev.length;
        for (const x of notes(ev)) it.push({ ...x, key: `bot:${b.id}:${x.key.slice(4)}`, title: j.B.length > 1 ? x.title.replace(/^(🤖|⛔) (Bot )?/u, `$1 ${b.name || b.id}: `) : x.title });
      }
      await env.DB.prepare("INSERT INTO user_data(user_id, key, value, updated_at) VALUES(?, 'botstate', ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(Number(j.uid), JSON.stringify({ v: 2, bots: out }), nowIso).run();
      if (it.length) {
        await env.DB.batch(it.map((x) => env.DB.prepare("INSERT OR IGNORE INTO notifications(user_id, key, kind, sev, title, body, url, sym, created_at) VALUES(?, ?, 'bot', ?, ?, ?, '#/bot', ?, ?)")
          .bind(Number(j.uid), x.key.slice(0, 200), x.sev, x.title.slice(0, 200), (x.body || "").slice(0, 1500), x.sym || null, nowIso)));
      }
      n += j.list.length;
    } catch (e) { console.log("bot user", j.uid, e.message); }
  }
  return { bots: n, events: nev, priced: Object.keys(P).length };
}
