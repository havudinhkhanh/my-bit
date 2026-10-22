// Bộ khớp lệnh của bot – chạy MỖI PHÚT trên Cloudflare (cùng Worker hẹn giờ), không cần máy anh mở.
// Chia việc: máy chủ phân tích (Python, 15 phút) viết "botplan" = ứng viên đã lọc + trần đòn bẩy + funding + báo cáo;
// Worker này là nơi DUY NHẤT ghi "botstate": theo dõi giá từng phút (kèm đỉnh/đáy trong phút), cắt lỗ / chốt lời / dời hoà vốn,
// vào lệnh đúng lúc giá còn đẹp, tính funding, phanh an toàn, ghi nhật ký và thông báo (chuông). Quy tắc giống hệt app/bot.py.
import PLANS from "../functions/_lib/plans.json";

const FEE = { spot: 0.001, fut: 0.0005 }, SLIP = 0.0005;
const PRESETS = {
  safe: { risk: 0.5, max_pos: 3, max_lev: 2, min_win: 45, min_avgR: 0.15, daily_stop: 2, max_dd: 10 },
  bal: { risk: 1.0, max_pos: 5, max_lev: 3, min_win: 40, min_avgR: 0.1, daily_stop: 3, max_dd: 15 },
  aggr: { risk: 1.5, max_pos: 8, max_lev: 5, min_win: 35, min_avgR: 0.05, daily_stop: 5, max_dd: 25 },
};
const DEF = { enabled: false, capital: 1000, preset: "bal", target_month: 5, protect: true, tp1_part: 50, be_after_tp1: true, time_stop: true, ...PRESETS.bal };
const HARD = { risk: [0.1, 2], max_pos: [1, 10], max_lev: [1, 5], daily_stop: [0.5, 10], max_dd: [3, 50], capital: [50, 1e7], target_month: [0, 100], tp1_part: [0, 100] };
const iso = (t) => new Date(t).toISOString().slice(0, 19);
const ms = (s) => Date.parse(s.length <= 19 ? s + "Z" : s);
const vnDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
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
const say = (st, now, m, k = "info") => { st.log = [...(st.log || []).slice(-199), { t: iso(now), k, m }]; };
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
  say(st, now, `Đóng ${p.k} (${p.sd > 0 ? "Long" : "Short"} ${p.mkt}) – ${WHY[why] || why}: ${h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)} USDT${h.r != null ? ` (${h.r >= 0 ? "+" : ""}${h.r.toFixed(2)}R)` : ""}`, h.pnl >= 0 ? "win" : "loss");
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
        say(st, now, `${p.k}: chạm MT1 ${sig(p.t1)} – chốt ${cfg.tp1_part}%, dời cắt lỗ về hoà vốn`, "tp");
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
function entries(st, cfg, cands, price, now, ev, mult) {
  const eq = equity(st, price), held = new Set(st.pos.map((p) => p.k)), used = new Set(st.used || []);
  const cool = new Set((st.hist || []).filter((h) => h.pnl < 0 && now - ms(h.closed) < 864e5).map((h) => h.k));
  const dd = st.peak ? Math.max(0, (1 - eq / st.peak) * 100) : 0;
  for (const x of cands || []) {
    if (st.pos.length >= cfg.max_pos) break;
    const key = `${x.k}|${x.setup}|${x.tf}|${x.at}`;
    if (held.has(x.k) || used.has(key) || cool.has(x.k)) continue;
    const p = price(x.k); if (!p) continue;
    const [ok, rr] = liveOk(x, p); if (!ok) continue;
    const riskUsd = eq * cfg.risk / 100 * mult;
    let n = riskUsd / Math.abs(p - x.s) * p, lev = 1;
    if (x.mkt === "spot") n = Math.min(n, eq * 0.3, st.cash * 0.98);
    else {
      let cap = Math.min(cfg.max_lev, x.cap || 1); if (dd >= 20) cap = 1; else if (dd >= 10) cap = Math.min(cap, 2);
      n = Math.min(n, eq * 0.25 * cap);
      lev = Math.max(1, Math.min(cap, Math.ceil(n / Math.max(1e-9, eq * 0.25))));
      if (n / lev > st.cash * 0.98) n = st.cash * 0.98 * lev;
    }
    if (n < 10) continue;
    const pos = openPos(st, x, x.mkt, n / p, p, lev, now);
    held.add(x.k); st.used = [...(st.used || []).slice(-299), key];
    ev.push(["open", pos, null]);
    say(st, now, `Vào ${x.side === "long" ? "Long" : "Short"} ${x.k} (${x.mkt === "spot" ? "spot" : "futures x" + lev}) ở ${sig(pos.e)} · cắt lỗ ${sig(x.s)} · MT1 ${sig(x.t1)} · MT2 ${sig(x.t2)} · rủi ro ${pos.risk_usd.toFixed(2)} USDT – ${x.name} (${x.tf === "d" ? "ngày" : "4h"}, xác suất ${x.win1}%, lãi TB ${x.avgR}R, R:R ${rr.toFixed(1)})`, "open");
  }
}
export function botStep(cfgRaw, st, plan, price, hl, now) {
  const cfg = norm(cfgRaw), ev = [];
  if (!st || (cfgRaw?.reset_at && cfgRaw.reset_at !== st.reset_seen)) {
    st = newState(cfg.capital, now); st.reset_seen = cfgRaw?.reset_at || null;
    say(st, now, `Khởi tạo tài khoản bot trên sàn thử: ${cfg.capital.toFixed(0)} USDT`);
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
    st.paused = { at: iso(now), why: `sụt ${dd.toFixed(1)}% so với đỉnh (giới hạn ${cfg.max_dd.toFixed(0)}%)` };
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
  else if (dayPct <= -cfg.daily_stop) halt = `lỗ ${dayPct.toFixed(1)}% hôm nay (giới hạn ${cfg.daily_stop.toFixed(1)}%)`;
  else if (!plan || now - ms(plan.at) > 45 * 60e3) halt = "chờ kế hoạch mới từ máy chủ phân tích";
  const mult = cfg.protect && monPct >= cfg.target_month && cfg.target_month > 0 ? 0.5 : 1;
  if (!halt) entries(st, cfg, plan.cands, price, now, ev, mult);
  eq = equity(st, price);
  const h = st.eq || [];
  if (!h.length || now - ms(h[h.length - 1][0]) >= 3000e3) h.push([iso(now), +eq.toFixed(2)]);
  st.eq = h.slice(-2500);
  const hist = st.hist || [], wins = hist.filter((x) => x.pnl > 0);
  st.stats = { eq: +eq.toFixed(2), ret: +((eq / st.start - 1) * 100).toFixed(2), dd: +dd.toFixed(2), day_pct: +dayPct.toFixed(2), mon_pct: +monPct.toFixed(2), n: hist.length,
    win: hist.length ? +(wins.length / hist.length * 100).toFixed(1) : null, avgR: hist.length ? +(hist.reduce((a, x) => a + (x.r || 0), 0) / hist.length).toFixed(2) : null,
    halt, risk_mult: mult, open_risk: +st.pos.filter((p) => !p.tp1).reduce((a, p) => a + p.risk_usd, 0).toFixed(2), engine: "1m" };
  st.last = iso(now);
  return { st, ev };
}
function notes(ev) {
  const out = [];
  for (const [kind, p, h] of ev) {
    if (kind === "open") out.push({ key: `bot:open:${p.id}:${p.opened}`, sev: 2, sym: p.k, title: `🤖 Bot vào ${p.sd > 0 ? "Long" : "Short"} ${p.k} (${p.mkt === "spot" ? "spot" : "futures x" + p.lev})`,
      body: `Giá ${sig(p.e)} · cắt lỗ ${sig(p.s)} · MT1 ${sig(p.t1)} · rủi ro ${p.risk_usd.toFixed(2)} USDT (sàn thử)` });
    else if (kind === "close") out.push({ key: `bot:close:${h.id}:${h.closed}`, sev: 2, sym: h.k, title: `🤖 Bot đóng ${h.k}: ${h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)} USDT${h.r != null ? ` (${h.r >= 0 ? "+" : ""}${h.r.toFixed(2)}R)` : ""}`,
      body: `Lý do: ${WHY[h.why] || h.why} · vào ${sig(h.e)} (sàn thử)` });
    else if (kind === "tp1") out.push({ key: `bot:tp1:${p.id}`, sev: 1, sym: p.k, title: `🤖 ${p.k} chạm MT1 – đã chốt một phần`, body: `Cắt lỗ phần còn lại dời về hoà vốn ${sig(p.s)}` });
    else if (kind === "pause") out.push({ key: `bot:pause:${h.at}`, sev: 3, title: "⛔ Bot tạm dừng", body: h.why });
    else if (kind === "research") out.push({ key: `bot:research:${h.d}`, sev: 1, title: "🤖 Báo cáo nghiên cứu hôm nay của bot", body: (h.lines || []).join(" ").slice(0, 600) });
  }
  return out;
}

// ---------------------------------------------------------------- giá: Binance spot (data-api, không bị chặn vùng) → OKX swap dự phòng
async function getJ(u) { const r = await fetch(u, { headers: { "user-agent": "my-bit-bot" } }); if (!r.ok) throw new Error(r.status + " " + u); return r.json(); }
async function prices(meta, since) {
  const P = {}, HL = {}, sp = Object.entries(meta).filter(([, m]) => m.sp);
  if (sp.length) {
    try {
      const j = await getJ(`https://data-api.binance.vision/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify([...new Set(sp.map(([, m]) => m.sp))]))}`);
      const by = Object.fromEntries(j.map((x) => [x.symbol, +x.price]));
      for (const [k, m] of sp) if (by[m.sp]) P[k] = by[m.sp] / (m.sm || 1);
    } catch (e) { console.log("bot giá spot:", e.message); }
  }
  for (const [k, m] of Object.entries(meta)) {
    if (P[k] || !m.okx) continue;
    try { const j = await getJ(`https://www.okx.com/api/v5/market/ticker?instId=${k}-USDT-SWAP`); const v = +j?.data?.[0]?.last; if (v > 0) P[k] = v; } catch (e) { /* bỏ qua */ }
  }
  // đỉnh/đáy nến 1 phút kể từ lần kiểm tra trước – chỉ cho coin đang có lệnh mở
  for (const [k, t0] of Object.entries(since)) {
    const m = meta[k]; if (!m) continue;
    try {
      if (m.sp) {
        const j = await getJ(`https://data-api.binance.vision/api/v3/klines?symbol=${m.sp}&interval=1m&startTime=${t0 - 60e3}&limit=60`);
        if (j.length) HL[k] = { hi: Math.max(...j.map((x) => +x[2])) / (m.sm || 1), lo: Math.min(...j.map((x) => +x[3])) / (m.sm || 1) };
      } else if (m.okx) {
        const j = await getJ(`https://www.okx.com/api/v5/market/candles?instId=${k}-USDT-SWAP&bar=1m&limit=60`);
        const d = (j.data || []).filter((x) => +x[0] >= t0 - 60e3);
        if (d.length) HL[k] = { hi: Math.max(...d.map((x) => +x[2])), lo: Math.min(...d.map((x) => +x[3])) };
      }
    } catch (e) { /* dùng giá hiện tại */ }
  }
  return { P, HL };
}

const canBot = (u) => {
  if (u.role === "admin") return true;
  const today = new Date().toISOString().slice(0, 10);
  const plan = u.plan_until && u.plan_until < today ? "free" : u.plan;
  return (PLANS.plans[plan]?.features || []).includes("bot");
};

export async function botTick(env) {
  if (!env.DB) return { skip: "no DB" };
  const now = Date.now(), nowIso = new Date(now).toISOString();
  await env.DB.prepare("INSERT INTO config(key, value) VALUES('bot_hb', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(nowIso).run();
  const { results: rows } = await env.DB.prepare("SELECT d.user_id, d.key, d.value, u.role, u.plan, u.plan_until FROM user_data d JOIN users u ON u.id = d.user_id WHERE u.status = 'active' AND d.key IN ('bot', 'botstate', 'botplan')").all();
  const by = {};
  for (const r of rows || []) { const o = (by[r.user_id] ||= { u: r }); try { o[r.key] = JSON.parse(r.value); } catch (e) { /* bỏ qua */ } }
  const jobs = Object.entries(by).filter(([, o]) => o.bot && canBot(o.u) && (o.bot.enabled || o.botstate?.pos?.length || (o.bot.reset_at && o.bot.reset_at !== o.botstate?.reset_seen)));
  if (!jobs.length) return { users: 0 };
  // gộp nhu cầu giá của mọi người dùng → một lần gọi
  const meta = {}, since = {};
  for (const [, o] of jobs) {
    Object.assign(meta, o.botplan?.meta || {});
    for (const p of o.botstate?.pos || []) { since[p.k] = Math.min(since[p.k] ?? Infinity, ms(p.chk)); if (!meta[p.k]) meta[p.k] = o.botplan?.meta?.[p.k] || {}; }
  }
  const { P, HL } = await prices(meta, since);
  const price = (k) => P[k] ?? null;
  let n = 0, nev = 0;
  for (const [uid, o] of jobs) {
    try {
      const { st, ev } = botStep(o.bot, o.botstate, o.botplan, price, HL, now);
      await env.DB.prepare("INSERT INTO user_data(user_id, key, value, updated_at) VALUES(?, 'botstate', ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(Number(uid), JSON.stringify(st), nowIso).run();
      const it = notes(ev);
      if (it.length) {
        await env.DB.batch(it.map((x) => env.DB.prepare("INSERT OR IGNORE INTO notifications(user_id, key, kind, sev, title, body, url, sym, created_at) VALUES(?, ?, 'bot', ?, ?, ?, '#/bot', ?, ?)")
          .bind(Number(uid), x.key.slice(0, 200), x.sev, x.title.slice(0, 200), (x.body || "").slice(0, 1500), x.sym || null, nowIso)));
      }
      n++; nev += ev.length;
    } catch (e) { console.log("bot user", uid, e.message); }
  }
  return { users: n, events: nev, priced: Object.keys(P).length };
}
