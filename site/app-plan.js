// ================================================================ app-plan.js – LÊN KẾ HOẠCH LỆNH
// Tải khi mở #/plan (hoặc khi chọn cách đánh mới ở tab Kế hoạch của trang coin) – dùng chung mọi hàm / biến của app.js.
// Trang có 3 phần (thanh tab con):
//   ① Lên kế hoạch  #/plan[/<COIN>]  – 5 cách đánh cho 1 coin, so sánh cạnh nhau, chọn 1 để ra phiếu lệnh đầy đủ
//   ② Đã lưu        #/plan/saved      – kế hoạch đang chờ (tự theo dõi: tới vùng vào / chạm mục tiêu / cắt lỗ / hết hạn) + list coin nhiều nhóm
//   ③ Nhật ký       #/plan/log        – kết quả các kế hoạch đã xong theo từng cách đánh + lệnh tay & bài học (lý do, cảm xúc, có theo kế hoạch không)
// Cách đánh: ⚡ Lướt 4h · 📈 Swing ngày (thiết lập có thống kê của hệ thống) · 🏛 SMC dài hạn (cấu trúc nến TUẦN) · 📐 Kỹ thuật (EMA · RSI · MACD ngày)
//            · 🧺 Tích luỹ spot (mua dần theo vùng, không đòn bẩy). Mỗi cách mới đều tự kiểm chứng lại trên chính lịch sử của coin.
// Gói: Miễn phí = Lướt + Swing, 3 kế hoạch đang chờ, 2 list coin, 20 ghi chú · Pro (plan_pro) = thêm SMC tuần, Kỹ thuật, Tích luỹ, quét tín hiệu cả list,
//      thống kê nhật ký theo cảm xúc / theo kế hoạch. Giới hạn đổi được ở functions/_lib/plans.json (limits.plans / lists / notes).

const KHM = [
  ["h4", "⚡", "Lướt 4h", "vài giờ – vài ngày", 0],
  ["d", "📈", "Swing ngày", "vài ngày – vài tuần", 0],
  ["smc", "🏛", "SMC dài hạn", "nến tuần · vài tuần – vài tháng", 1],
  ["tech", "📐", "Kỹ thuật", "EMA · RSI · MACD ngày", 1],
  ["dca", "🧺", "Tích luỹ spot", "mua dần theo vùng · không đòn bẩy", 1],
];
const khMeta = (m) => KHM.find((x) => x[0] === m) || ["auto", "🤖", bi("Tự chọn", "Auto"), "", 0];
const khPro = () => can("plan_pro");
const khLock = (m) => !!khMeta(m)[4] && !khPro();
const khLbl = (m) => { const M = khMeta(m); return `${M[1]} ${M[2]}`; };
const KH_OUT = {
  sl: ["❌", bi("Cắt lỗ", "Stopped out"), "sell"], t1be: ["✅", bi("MT1 rồi về hoà vốn", "T1 then breakeven"), "buy"], t2: ["🏆", bi("Chạm MT2", "Hit T2"), "buy"],
  time: ["⌛", bi("Hết thời gian – thoát", "Timed out"), "wait"], expired: ["💤", bi("Hết hạn – chưa khớp", "Expired unfilled"), ""], missed: ["🏃", bi("Chạy mất – chưa khớp", "Ran away unfilled"), ""],
  inval: ["⛔", bi("Sai kịch bản", "Invalidated"), "sell"], manual: ["✋", bi("Tự đóng", "Closed manually"), "brand"], cancel: ["🗑", bi("Huỷ", "Cancelled"), ""],
};
const KH_IN = new Set(["sl", "t1be", "t2", "time", "inval", "manual"]);      // kết quả có VÀO lệnh (tính R)
const KH_EMO = [["calm", "😌", bi("Bình tĩnh", "Calm")], ["fomo", "😬", bi("Sợ lỡ (FOMO)", "FOMO")], ["greed", "🤑", bi("Tham", "Greedy")], ["revenge", "😤", bi("Gỡ lỗ", "Revenge")], ["fear", "😰", bi("Sợ hãi", "Fearful")], ["unsure", "🤔", bi("Phân vân", "Unsure")]];
const khAgo = (iso) => { const d = (Date.now() - Date.parse(iso)) / 864e5; return d < 1 ? bi("hôm nay", "today") : `${nf(d, 0)} ${bi("ngày trước", "d ago")}`; };
const khD = (ms) => (isNum(ms) || ms ? new Date(ms).toLocaleDateString(LOC, { day: "2-digit", month: "2-digit" }) : "—");
const khProTag = () => (khPro() ? "" : ` <a class="kh-pro" href="#/account">★ Pro</a>`);

// tham số các cách đánh (research/plan_methods_pool.js quét các biến thể trên toàn bộ coin rồi chọn bộ này)
const KHP = { smc: { n: 2, slBuf: 0.25, hold: 26, zone: "ob", side: 0 }, tech: { t1R: 1.5, t2R: 3, exit: "e50", dip: 45, hold: 30, side: 0, ext: false } };
// kiểm chứng GỘP bộ tham số trên toàn bộ coin (node research/plan_methods_pool.js site/data/c pool – nến ngày 10/2022 → 11/2026, đã trừ phí)
// từng coin chỉ có 5–25 lệnh → số của coin được CO về số gộp (như thêm 8 lệnh "trung bình") trước khi đưa lên phiếu
const KH_POOL = { coins: 452, span: "10/2022 – 11/2026", smc: { L: { n: 1180, win1: 26.7, win2: 13.9, avgR: -0.007 }, S: { n: 1307, win1: 34.8, win2: 13.5, avgR: -0.067 } }, tech: { L: { n: 1270, win1: 16.1, win2: 7.6, avgR: -0.111 }, S: { n: 3795, win1: 17.9, win2: 5.4, avgR: 0 } } };
function khShrink(bt, m, sd) { const P = KH_POOL[m][sd === 1 ? "L" : "S"], n = bt.n || 0, k = 8, f = (a, b) => (n * (a || 0) + k * b) / (n + k); return { n, win1: f(bt.win1, P.win1), win2: f(bt.win2, P.win2), avgR: f(bt.avgR, P.avgR), P }; }
const khPoolTxt = (m, sd) => { const P = KH_POOL[m][sd === 1 ? "L" : "S"]; return bi(`Gộp ${KH_POOL.coins} coin (${KH_POOL.span}), ${sd === 1 ? "Long" : "Short"}: ${nf(P.n, 0)} lệnh, chạm MT1 ${nf(P.win1, 0)}%, trung bình <b class="${cls(P.avgR)}">${P.avgR > 0 ? "+" : ""}${nf(P.avgR, 2)}R</b>/lệnh${P.avgR <= 0.05 ? " – <b>chưa chứng minh được lợi thế</b> sau phí. Tách 2 nửa giai đoạn: kết quả đổi dấu theo chiều thị trường (Long thắng lúc thị trường tăng 2023–24, thua 2025–26; Short ngược lại) – cách đánh này chủ yếu là đặt cược vào chiều thị trường, dùng làm khung tham khảo, đánh nhỏ" : ""}.`, `Pooled over ${KH_POOL.coins} coins: ${nf(P.n, 0)} trades, T1 ${nf(P.win1, 0)}%, avg ${nf(P.avgR, 2)}R.`); };
// thanh khoản: trung vị giá trị giao dịch ngày 90 phiên gần nhất (dưới 2 triệu USD kết quả kiểm chứng kém hẳn, nhất là Short)
function khLiq(D) { const v = (D.ohlc?.d?.v || []).slice(-90).filter((x) => x > 0).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; }
const khLiqWarn = (D, warn) => { const q = khLiq(D); if (isNum(q) && q < 2e6) warn.push(bi(`Thanh khoản thấp: giá trị giao dịch ngày trung vị ${usd(q)} (< $2 triệu) – kiểm chứng gộp cho thấy kết quả ở nhóm này kém hơn rõ rệt`, `Thin liquidity (${usd(q)}/day median)`)); };
// ---------------------------------------------------------------- chỉ báo
function khEma(a, n) { const k = 2 / (n + 1), o = new Array(a.length).fill(null); let e = null, s = 0, c = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (!isNum(v)) continue; if (e == null) { s += v; c++; if (c === n) { e = s / n; o[i] = e; } continue; } e += k * (v - e); o[i] = e; } return o; }
function khRsi(c, n = 14) { const o = new Array(c.length).fill(null); let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up; l += dn; if (i < n) continue; g /= n; l /= n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; } o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return o; }
function khAtr(B, n = 14) { const o = new Array(B.c.length).fill(null); let a = null, s = 0; for (let i = 1; i < B.c.length; i++) { const tr = Math.max(B.h[i] - B.l[i], Math.abs(B.h[i] - B.c[i - 1]), Math.abs(B.l[i] - B.c[i - 1])); if (a == null) { s += tr; if (i === n) { a = s / n; o[i] = a; } continue; } a = (a * (n - 1) + tr) / n; o[i] = a; } return o; }
function khHist(c) { const a = khEma(c, 12), b = khEma(c, 26), m = c.map((_, i) => (a[i] != null && b[i] != null ? a[i] - b[i] : null)), sg = khEma(m, 9); return m.map((v, i) => (v != null && sg[i] != null ? v - sg[i] : null)); }
// nến ngày → nến tuần (tuần bắt đầu thứ Hai, giờ UTC như Binance)
function khWeek(o) {
  const W = { t: [], o: [], h: [], l: [], c: [], v: [] }; let key = null;
  for (let i = 0; i < (o?.t?.length || 0); i++) {
    if (!isNum(o.c[i])) continue; const wk = Math.floor((o.t[i] / 86400 + 3) / 7);
    if (wk !== key) { key = wk; W.t.push((wk * 7 - 3) * 86400); W.o.push(o.o[i]); W.h.push(o.h[i]); W.l.push(o.l[i]); W.c.push(o.c[i]); W.v.push(o.v?.[i] || 0); }
    else { const j = W.t.length - 1; W.h[j] = Math.max(W.h[j], o.h[i]); W.l[j] = Math.min(W.l[j], o.l[i]); W.c[j] = o.c[i]; W.v[j] += o.v?.[i] || 0; }
  }
  return W;
}
// nến cuối nhận giá trực tiếp (dữ liệu tĩnh cập nhật 4 giờ / lần)
function khLive(B, p) { if (!B?.c?.length || !isNum(p) || p <= 0) return B; const j = B.c.length - 1, X = { ...B, c: B.c.slice(), h: B.h.slice(), l: B.l.slice() }; X.c[j] = p; X.h[j] = Math.max(X.h[j], p); X.l[j] = Math.min(X.l[j], p); return X; }
async function khWeekly(D) {
  if (D._wk) return D._wk;
  const agg = D.ohlc?.d ? khWeek(D.ohlc.d) : null, r = BYK[D.row.k];
  let live = null;
  if (r && (r.sp || r.bf)) { try { live = await Promise.race([liveKlines(r, "1w", 1, 600).then((x) => x?.o || null), new Promise((res) => setTimeout(() => res(null), 5000))]); } catch (e) { live = null; } }
  D._wk = live && live.c?.length >= (agg?.c?.length || 0) ? { B: live, src: bi("nến tuần Binance", "Binance weekly candles") } : { B: agg, src: bi("nến ngày gộp thành tuần", "daily candles grouped by week") };
  return D._wk;
}

// ---------------------------------------------------------------- 🏛 SMC dài hạn (cấu trúc nến tuần)
// đỉnh / đáy (fractal 2 nến mỗi bên) → đóng tuần vượt đỉnh = phá cấu trúc tăng (BOS nếu đang tăng, CHoCH nếu đổi chiều)
// biên độ giao dịch = đáy bảo vệ (thấp nhất từ đỉnh bị phá tới nến phá) → đỉnh mới; vùng vào = khối lệnh (OB) ở nửa rẻ, chồng vùng OTE 62–79% thì lấy phần chồng
function khStruct(B, n = KHP.smc.n) {
  let tr = 0, SH = null, SL = null; const ev = [], hs = [], ls = [], evAt = new Array(B.c.length).fill(-1);
  for (let j = 0; j < B.c.length; j++) {
    const pi = j - n;
    if (pi >= n) {
      let H = true, L = true;
      for (let k = pi - n; k <= pi + n; k++) { if (k === pi) continue; if (B.h[k] >= B.h[pi]) H = false; if (B.l[k] <= B.l[pi]) L = false; }
      if (H) hs.push((SH = { i: pi, p: B.h[pi], u: false })); if (L) ls.push((SL = { i: pi, p: B.l[pi], u: false }));
    }
    const c = B.c[j];
    if (SH && !SH.u && c > SH.p) { ev.push({ j, dir: 1, type: tr === 1 ? "BOS" : "CHoCH", level: SH.p, pi: SH.i }); tr = 1; SH.u = true; }
    else if (SL && !SL.u && c < SL.p) { ev.push({ j, dir: -1, type: tr === -1 ? "BOS" : "CHoCH", level: SL.p, pi: SL.i }); tr = -1; SL.u = true; }
    evAt[j] = ev.length - 1;
  }
  return { ev, hs, ls, evAt, n };
}
function khSmcAt(B, S, j, aw) {
  const ei = S.evAt[j]; if (ei < 0 || !(aw > 0)) return null;
  const E = S.ev[ei], sd = E.dir;
  let x = sd === 1 ? Infinity : -Infinity, xI = E.pi;
  for (let k = E.pi; k <= E.j; k++) if (sd === 1 ? B.l[k] < x : B.h[k] > x) { x = sd === 1 ? B.l[k] : B.h[k]; xI = k; }
  let y = sd === 1 ? -Infinity : Infinity;
  for (let k = xI; k <= j; k++) if (sd === 1 ? B.h[k] > y : B.l[k] < y) y = sd === 1 ? B.h[k] : B.l[k];
  const lo = sd === 1 ? x : y, hi = sd === 1 ? y : x, R = hi - lo;
  if (!(R > 0)) return null;
  for (let k = E.j; k <= j; k++) if (sd === 1 ? B.c[k] < lo : B.c[k] > hi) return { broken: true, E, sd, lo, hi };
  let ob = null;
  for (let k = xI; k >= Math.max(0, xI - 4); k--) if (sd === 1 ? B.c[k] < B.o[k] : B.c[k] > B.o[k]) { ob = sd === 1 ? { lo: B.l[k], hi: B.o[k], t: B.t[k] } : { lo: B.o[k], hi: B.h[k], t: B.t[k] }; break; }
  const eq = lo + R / 2, ote = sd === 1 ? [hi - 0.79 * R, hi - 0.62 * R] : [lo + 0.62 * R, lo + 0.79 * R];
  let z = null, zs = "OTE 62–79%";
  if (ob && (sd === 1 ? ob.lo < eq : ob.hi > eq)) {
    z = [ob.lo, sd === 1 ? Math.min(ob.hi, eq) : ob.hi]; if (sd === -1) z[0] = Math.max(ob.lo, eq); zs = bi("khối lệnh (OB) tuần", "weekly order block");
    const ov = [Math.max(z[0], ote[0]), Math.min(z[1], ote[1])]; if (ov[1] > ov[0]) { z = ov; zs = bi("OB tuần chồng OTE", "weekly OB ∩ OTE"); }
  }
  if (!z || KHP.smc.zone === "ote") { z = ote; zs = "OTE 62–79%"; }
  if (KHP.smc.zone === "eq") { z = sd === 1 ? [lo + 0.25 * R, eq] : [eq, hi - 0.25 * R]; zs = bi("nửa rẻ của biên độ", "discount half"); }
  const s = sd === 1 ? lo - KHP.smc.slBuf * aw : hi + KHP.smc.slBuf * aw, t1 = sd === 1 ? hi : lo;
  const far = (sd === 1 ? S.hs.filter((h) => h.i + S.n <= j && h.p > hi + 0.382 * R).map((h) => h.p).sort((a, b) => a - b) : S.ls.filter((l) => l.i + S.n <= j && l.p < lo - 0.382 * R).map((l) => l.p).sort((a, b) => b - a));
  let t2 = far[0] ?? (sd === 1 ? hi + 0.618 * R : lo - 0.618 * R); if (t2 <= 0) t2 = lo * 0.6;
  return { E, sd, lo, hi, R, eq, ote, ob, z, zs, s, t1, t2, far: far[0] != null };
}
// kiểm chứng trên chính lịch sử nến tuần: mỗi lần phá cấu trúc chỉ vào 1 lần, khớp khi giá hồi về mép vùng, chạm MT1 chốt 50% & dời cắt lỗ về hoà vốn, giữ tối đa 26 tuần
// tín hiệu ở nến TUẦN, khớp & thoát mô phỏng trên nến NGÀY của tuần đó (tránh đếm MT1 trước lúc khớp trong cùng 1 nến tuần); lệnh còn mở cuối dữ liệu tính theo giá đóng cuối
function khSmcBt(B, S, atr, d) {
  const T = [], used = new Set(), di = new Map((d?.t || []).map((t, i) => [t, i])); let busy = -1;
  for (let j = 20; j < B.c.length - 1; j++) {
    if (j <= busy) continue;
    const P = khSmcAt(B, S, j, atr[j]); if (!P || P.broken || used.has(P.E.j) || (KHP.smc.side && P.sd !== KHP.smc.side)) continue;
    const sd = P.sd, top = sd === 1 ? P.z[1] : P.z[0], k = j + 1, d0 = di.get(B.t[k]);
    if (d0 == null) continue;                                                     // no daily bars for that week → cannot simulate honestly
    let i = d0, e = null;                                                         // limit order at the zone edge, valid for the 7 days of week k
    for (; i < Math.min(d.c.length, d0 + 7); i++) if (sd === 1 ? d.l[i] <= top : d.h[i] >= top) { e = sd === 1 ? Math.min(top, d.o[i]) : Math.max(top, d.o[i]); break; }
    if (e == null || sd * (e - P.s) <= 0 || sd * (P.t1 - e) <= 0) continue;
    used.add(P.E.j);
    const lim = e !== d.o[i], i0 = i, R = Math.abs(e - P.s), r1 = Math.abs(P.t1 - e) / R, r2 = Math.abs(P.t2 - e) / R;
    let res = null, h1 = false, h2 = false, d1 = null, st = P.s, q = i;
    for (; q < Math.min(d.c.length, d0 + 7 * KHP.smc.hold); q++) {
      if (sd === 1 ? d.l[q] <= st : d.h[q] >= st) { res = h1 ? 0.5 * r1 : -1; break; }   // stop first (conservative)
      if (q === i0 && lim) continue;                                              // fill day: the day's extreme may have printed before the fill
      if (!h1 && (sd === 1 ? d.h[q] >= P.t1 : d.l[q] <= P.t1)) { h1 = true; st = e; d1 = Math.ceil((q - i0 + 1) / 7); }
      if (h1 && (sd === 1 ? d.h[q] >= P.t2 : d.l[q] <= P.t2)) { h2 = true; res = 0.5 * r1 + 0.5 * r2; break; }
    }
    if (res == null) { const c = d.c[q - 1]; res = h1 ? 0.5 * r1 + 0.5 * Math.max(0, sd * (c - e) / R) : sd * (c - e) / R; }  // timeout or still open → mark to market
    const tq = d.t[Math.min(q, d.c.length - 1)]; busy = k; while (busy + 1 < B.t.length && B.t[busy + 1] <= tq) busy++;
    T.push({ sd, h1, h2, d1, r: res - (0.002 * e) / R });
  }
  return khBtSum(T);
}
function khBtSum(T) {
  if (!T.length) return { n: 0 };
  const d = T.filter((x) => x.h1).map((x) => x.d1).sort((a, b) => a - b);
  return { n: T.length, win1: (T.filter((x) => x.h1).length / T.length) * 100, win2: (T.filter((x) => x.h2).length / T.length) * 100, avgR: T.reduce((a, x) => a + x.r, 0) / T.length, medD: d.length ? d[Math.floor(d.length / 2)] : null, nL: T.filter((x) => x.sd === 1).length, nS: T.filter((x) => x.sd === -1).length };
}
function khBtTxt(bt, unit, K, nb) {
  if (!bt.n) return `<p class="faint">${bi(`Chưa có lần nào đủ điều kiện trong ${nf(nb, 0)} ${unit} lịch sử của ${esc(K)} – chưa kiểm chứng được trên coin này.`, `No qualifying setups in ${nf(nb, 0)} ${unit} of ${esc(K)} history.`)}</p>`;
  const few = bt.n < 8;
  return `<p class="${few ? "ref" : "faint"}">🧪 ${bi(`Kiểm chứng trên ${nf(nb, 0)} ${unit} lịch sử của ${esc(K)} (đã trừ phí): <b>${nf(bt.n, 0)} lệnh</b> (Long ${bt.nL} · Short ${bt.nS}), chạm MT1 <b>${nf(bt.win1, 0)}%</b>, chạm MT2 ${nf(bt.win2, 0)}%, trung bình <b class="${cls(bt.avgR)}">${bt.avgR > 0 ? "+" : ""}${nf(bt.avgR, 2)}R</b>/lệnh${isNum(bt.medD) ? `, tới MT1 trung vị ${nf(bt.medD, 0)} ${unit}` : ""}.`, `Tested on ${nf(nb, 0)} ${unit} of ${esc(K)} (after fees): <b>${nf(bt.n, 0)} trades</b>, T1 hit <b>${nf(bt.win1, 0)}%</b>, avg <b>${nf(bt.avgR, 2)}R</b>.`)}${few ? bi(" Mẫu còn ít (< 8 lệnh) – xác suất trên phiếu dùng mức thận trọng, chưa coi là có lợi thế.", " Small sample (< 8) – treat as unproven.") : ""}</p>`;
}
function khSmcPlan(D, IJ, W, side) {
  const r = D.row, p = BYK[r.k]?.p || r.p, B = khLive(W.B, p), n = B?.c?.length || 0;
  if (n < 30) return { none: true, k: r.k, reason: bi("Chưa đủ lịch sử nến tuần (cần ít nhất 30 tuần) để đọc cấu trúc dài hạn.", "Not enough weekly history (need 30+ weeks).") };
  const atr = khAtr(B), S = khStruct(B), j = n - 1, aw = atr[j], P = khSmcAt(B, S, j, aw), bt = khSmcBt(B, S, atr, D.ohlc?.d);
  const lastHi = [...S.hs].reverse().find((h) => !h.u && h.i + S.n <= j), lastLo = [...S.ls].reverse().find((l) => !l.u && l.i + S.n <= j);
  const E = P?.E, evTxt = E ? `${E.type} ${E.dir === 1 ? bi("tăng", "up") : bi("giảm", "down")} ${bi("tuần", "week of")} ${khD(B.t[E.j] * 1000)} ${bi("tại", "at")} ${px(E.level)}` : "—";
  const facts = (P && !P.broken) ? kpis([[bi("Cấu trúc tuần", "Weekly structure"), P.sd === 1 ? `<b class="up">${bi("Tăng", "Bullish")}</b>` : `<b class="down">${bi("Giảm", "Bearish")}</b>`], [bi("Sự kiện gần nhất", "Last event"), evTxt],
    [bi("Biên độ giao dịch", "Dealing range"), `${px(P.lo)} – ${px(P.hi)}`], [bi("Cân bằng 50%", "Equilibrium"), px(P.eq)], [bi("Vị trí giá", "Price position"), (() => { const q = ((p - P.lo) / P.R) * 100; return `${nf(q, 0)}% · ${q < 50 ? bi("vùng rẻ", "discount") : bi("vùng đắt", "premium")}`; })()],
    [bi("Vùng vào", "Entry zone"), `${px(P.z[0])} – ${px(P.z[1])}`, "", P.zs], P.ob ? [bi("Khối lệnh tuần", "Weekly OB"), `${px(P.ob.lo)} – ${px(P.ob.hi)}`] : null, [bi("Thanh khoản mục tiêu", "Liquidity targets"), `${px(P.t1)} → ${px(P.t2)}`]]) : "";
  const xh = (t) => `${facts}${khBtTxt(bt, bi("tuần", "weeks"), r.k, n)}${P && !P.broken ? `<p class="faint">🌐 ${khPoolTxt("smc", P.sd)}</p>` : ""}<p class="faint">${bi(`Nguồn: ${W.src}. Chỉ xét lại khi ĐÓNG nến tuần (thứ Hai 7:00 giờ VN) – biến động trong tuần không đổi kế hoạch.`, `Source: ${W.src}. Re-check on weekly close only.`)}</p>${t ? `<div class="kh-ch">${oppChart(B, { ...t, tf: "w" }, p, 640, 170)}</div>` : ""}`;
  if (!P) return { none: true, k: r.k, reason: bi("Nến tuần chưa có lần phá cấu trúc nào rõ ràng – SMC dài hạn chưa có kịch bản.", "No clear weekly structure break yet."), extra: xh() };
  if (P.broken) return { none: true, k: r.k, reason: bi(`Cấu trúc tuần vừa gãy: giá đóng tuần ${P.sd === 1 ? `dưới đáy bảo vệ ${px(P.lo)}` : `trên đỉnh bảo vệ ${px(P.hi)}`} – chờ cấu trúc mới (đóng tuần ${P.sd === 1 ? `trên ${px(lastHi?.p)}` : `dưới ${px(lastLo?.p)}`}).`, "Weekly structure just broke – wait for a new one."), extra: xh() };
  const sdW = side === "long" ? 1 : side === "short" ? -1 : 0;
  if (sdW && sdW !== P.sd) return { none: true, k: r.k, reason: bi(`Cấu trúc tuần đang ${P.sd === 1 ? "tăng" : "giảm"} – SMC chỉ đánh theo cấu trúc. ${sdW === 1 ? `Long khi có CHoCH tăng: đóng tuần trên ${px(lastHi?.p)}.` : `Short khi có CHoCH giảm: đóng tuần dưới ${px(lastLo?.p ?? P.lo)}.`}`, "SMC trades with the weekly structure only."), extra: xh() };
  if (P.sd === -1 && !r.fx) return { none: true, k: r.k, reason: bi(`Cấu trúc tuần đang giảm và ${r.k} không có hợp đồng perp để Short. Với spot: chờ CHoCH tăng – đóng tuần trên ${px(lastHi?.p)} – rồi mới tích luỹ.`, "Bearish weekly structure and no perp to short."), extra: xh() };
  const sd = P.sd, zTop = sd === 1 ? P.z[1] : P.z[0], zBot = sd === 1 ? P.z[0] : P.z[1];
  let e = p, order = "market"; if (sd * (p - zTop) > 0) { e = zTop; order = "limit"; }
  if (sd * (e - P.s) <= 0) return { none: true, k: r.k, reason: bi("Giá đã xuyên mức cắt lỗ của kịch bản tuần.", "Price is beyond the weekly stop."), extra: xh() };
  const d1 = isNum(bt.medD) ? bt.medD : Math.max(2, Math.round((Math.abs(P.t1 - e) / aw) * 1.3)), SH = khShrink(bt, "smc", P.sd);
  const t = { m: "smc", side: sd === 1 ? "long" : "short", tf: "d", tfLabel: bi("SMC dài hạn – nến tuần", "SMC long-term – weekly"), tf_bd: 7, e, s: P.s, t1: P.t1, t2: P.t2, order,
    p1: SH.win1, p2: SH.win2, d1, d1_hi: Math.min(26, d1 * 2), d2: Math.min(26, d1 * 2), n: bt.n || null, avgR: SH.avgR, setup: null, edge: bt.n >= 8 && SH.avgR > 0.1,
    src: bi(`cấu trúc nến tuần (${evTxt}) – vùng vào ${P.zs}`, `weekly structure (${evTxt})`) };
  const warn = []; if (bt.n < 8) warn.push(bi(`Kiểm chứng trên ${r.k} mới có ${bt.n} lệnh – xác suất & kỳ vọng trên phiếu đã co về số gộp ${KH_POOL.coins} coin`, `Only ${bt.n} trades on ${r.k} – figures blended with the pooled test`));
  if (SH.P.avgR <= 0.05) warn.push(bi(`Kiểm chứng gộp ${KH_POOL.coins} coin: SMC tuần ${P.sd === 1 ? "Long" : "Short"} chưa có lợi thế sau phí (${nf(SH.P.avgR, 2)}R/lệnh)`, "No pooled edge after fees"));
  khLiqWarn(D, warn);
  if (!P.far) warn.push(bi("Không còn đỉnh cũ phía trên làm MT2 – MT2 tính theo mở rộng 1,618 biên độ", "No older high above – T2 uses a 1.618 extension"));
  ticketJudge(D, IJ, t, warn, []);
  t.how = bi(`${order === "market" ? `Giá đang trong vùng ${P.zs} (${px(zBot)} – ${px(zTop)}) – vào` : `Đặt lệnh chờ ${sd === 1 ? "mua" : "bán"}`} ${qty(t.q)} ${esc(r.k)} ở ${px(e)}, cắt lỗ ${px(P.s)} (${sd === 1 ? "dưới đáy" : "trên đỉnh"} bảo vệ ${px(sd === 1 ? P.lo : P.hi)}). Chạm ${px(P.t1)} – ${sd === 1 ? "đỉnh" : "đáy"} cũ, nơi có lệnh chờ – chốt 50% và dời cắt lỗ về ${px(e)}; phần còn lại chờ ${px(P.t2)}. Chỉ đổi kế hoạch khi ĐÓNG nến tuần; đóng tuần ${sd === 1 ? "dưới" : "trên"} ${px(sd === 1 ? P.lo : P.hi)} = kịch bản sai. ${order === "limit" ? `Huỷ lệnh chờ nếu giá tới ${px(P.t1)} trước khi khớp.` : ""}`,
    `${order === "market" ? "Price is inside the zone – enter" : "Place a limit"} ${qty(t.q)} ${esc(r.k)} at ${px(e)}, stop ${px(P.s)}. Take 50% at ${px(P.t1)}, move stop to breakeven, rest at ${px(P.t2)}. Re-check on weekly close only.`);
  t.extra = xh(t); t.D = D;
  return t;
}

// ---------------------------------------------------------------- 📐 Kỹ thuật (EMA 20/50/200 · RSI 14 · MACD, nến ngày)
// Long: giá > EMA200, EMA20 > EMA50 > EMA200 (xu hướng tăng xếp lớp) · RSI đã hồi về < 45 trong 6 phiên rồi cắt lên 50 · histogram MACD tăng lại
// cắt lỗ dưới đáy 5 phiên − 0,5 ATR (1–3 ATR) · MT1 1,5R · MT2 3R · thoát sớm khi đóng cửa ngày dưới EMA50 · giữ tối đa 30 phiên. Short ngược lại.
function khTI(B) { const c = B.c; return { e20: khEma(c, 20), e50: khEma(c, 50), e200: khEma(c, 200), rsi: khRsi(c), h: khHist(c), atr: khAtr(B) }; }
function khTechSig(B, I, j, sd) {
  const v = [I.e20[j], I.e50[j], I.e200[j], I.rsi[j], I.rsi[j - 1], I.h[j], I.h[j - 1], I.atr[j]];
  if (j < 7 || v.some((x) => !isNum(x))) return null;
  const c = B.c[j], trend = sd === 1 ? c > I.e200[j] && I.e50[j] > I.e200[j] && I.e20[j] > I.e50[j] : c < I.e200[j] && I.e50[j] < I.e200[j] && I.e20[j] < I.e50[j];
  let dip = false; for (let k = j - 6; k < j; k++) if (isNum(I.rsi[k]) && (sd === 1 ? I.rsi[k] < KHP.tech.dip : I.rsi[k] > 100 - KHP.tech.dip)) dip = true;
  const cross = sd === 1 ? I.rsi[j] >= 50 && I.rsi[j - 1] < 50 : I.rsi[j] <= 50 && I.rsi[j - 1] > 50, mom = sd === 1 ? I.h[j] > I.h[j - 1] : I.h[j] < I.h[j - 1];
  return { trend, dip, cross, mom, ok: trend && dip && cross && mom };
}
function khTechLv(B, I, j, sd, e) {
  const a = I.atr[j]; let x = sd === 1 ? Infinity : -Infinity;
  for (let k = Math.max(0, j - 4); k <= j; k++) x = sd === 1 ? Math.min(x, B.l[k]) : Math.max(x, B.h[k]);
  let s = x - sd * 0.5 * a; const d = Math.abs(e - s); if (d < a) s = e - sd * a; if (d > 3 * a) s = e - sd * 3 * a;
  const R = Math.abs(e - s); let t1 = e + sd * KHP.tech.t1R * R;
  if (KHP.tech.ext) { let z = sd === 1 ? -Infinity : Infinity; for (let k = Math.max(0, j - 20); k <= j; k++) z = sd === 1 ? Math.max(z, B.h[k]) : Math.min(z, B.l[k]); if (sd * (z - t1) > 0) t1 = z; }      // MT1 ít nhất tới đỉnh / đáy 20 phiên
  return { s, t1, t2: e + sd * Math.max(KHP.tech.t2R * R, 1.6 * Math.abs(t1 - e)) };
}
function khTechBt(B, I) {
  const T = []; let busy = -1;
  for (let j = 210; j < B.c.length - 1; j++) {
    if (j <= busy) continue;
    for (const sd of [1, -1]) {
      if (KHP.tech.side && sd !== KHP.tech.side) continue;
      const g = khTechSig(B, I, j, sd); if (!g?.ok) continue;
      const k = j + 1, e = B.o[k], L = khTechLv(B, I, j, sd, e), R = Math.abs(e - L.s); if (!(R > 0)) continue;
      let res = null, h1 = false, h2 = false, d1 = null, q = k;
      const h1R = 0.5 * KHP.tech.t1R, exE = KHP.tech.exit === "e20" ? I.e20 : KHP.tech.exit === "e50" ? I.e50 : null;
      for (; q < Math.min(B.c.length, k + KHP.tech.hold); q++) {
        if (sd === 1 ? B.l[q] <= (h1 ? e : L.s) : B.h[q] >= (h1 ? e : L.s)) { res = h1 ? h1R : -1; break; }
        if (!h1 && (sd === 1 ? B.h[q] >= L.t1 : B.l[q] <= L.t1)) { h1 = true; d1 = q - k + 1; }
        if (h1 && (sd === 1 ? B.h[q] >= L.t2 : B.l[q] <= L.t2)) { h2 = true; res = h1R + 0.5 * KHP.tech.t2R; break; }
        if (exE && isNum(exE[q]) && sd * (B.c[q] - exE[q]) < 0) { res = (h1 ? h1R : 0) + (h1 ? 0.5 : 1) * sd * (B.c[q] - e) / R; break; }
      }
      if (res == null) { const c = B.c[q - 1]; res = (h1 ? h1R : 0) + (h1 ? 0.5 : 1) * sd * (c - e) / R; }
      busy = q; T.push({ sd, h1, h2, d1, r: res - (0.002 * e) / R }); break;
    }
  }
  return khBtSum(T);
}
function khTechPlan(D, IJ, side) {
  const r = D.row, p = BYK[r.k]?.p || r.p, B = khLive(D.ohlc?.d, p), n = B?.c?.length || 0;
  if (n < 230) return { none: true, k: r.k, reason: bi("Cần ít nhất 230 nến ngày để tính EMA200 và kiểm chứng.", "Need 230+ daily candles.") };
  const I = khTI(B), j = n - 1, bt = khTechBt(B, I);
  const pick = (sd) => { const g0 = khTechSig(B, I, j, sd), g1 = khTechSig(B, I, j - 1, sd); return { sd, g: g0, sig: !!(g0?.ok || g1?.ok) }; };
  let C = [pick(1), pick(-1)];
  if (side === "long") C = [C[0]]; else if (side === "short") C = [C[1]];
  const c = C.find((x) => x.sig) || C.find((x) => x.g?.trend);
  const chk = (g, sd) => [[bi(sd === 1 ? "Giá trên EMA200, EMA20 > EMA50 > EMA200" : "Giá dưới EMA200, EMA20 < EMA50 < EMA200", "EMA stack aligned"), g?.trend], [bi(sd === 1 ? "RSI đã hồi về dưới 45 trong 6 phiên" : "RSI đã bật lên trên 55 trong 6 phiên", "RSI pulled back"), g?.dip], [bi(sd === 1 ? "RSI cắt lên 50" : "RSI cắt xuống 50", "RSI crossed 50"), g?.cross], [bi("Histogram MACD đổi chiều cùng hướng", "MACD histogram turning"), g?.mom]];
  const ind = kpis([[bi("Giá / EMA20", "Price / EMA20"), `${px(p)} / ${px(I.e20[j])}`], ["EMA50 / EMA200", `${px(I.e50[j])} / ${px(I.e200[j])}`], ["RSI 14", nf(I.rsi[j], 0), I.rsi[j] >= 70 ? "down" : I.rsi[j] <= 30 ? "up" : ""], [bi("MACD histogram", "MACD histogram"), `${I.h[j] >= 0 ? "+" : ""}${px(I.h[j])} ${I.h[j] > I.h[j - 1] ? "↑" : "↓"}`], [bi("ATR ngày", "Daily ATR"), `${px(I.atr[j])} (${nf((I.atr[j] / p) * 100, 1)}%)`]]);
  const xh = (t, g, sd) => `${ind}${g ? `<ul class="kh-chk">${chk(g, sd).map(([tx, ok]) => `<li class="${ok ? "ok" : ""}">${ok ? "✓" : "○"} ${tx}</li>`).join("")}</ul>` : ""}${khBtTxt(bt, bi("phiên", "days"), r.k, n)}<p class="faint">🌐 ${khPoolTxt("tech", sd)}</p>${t ? `<div class="kh-ch">${oppChart(B, { ...t, tf: "d" }, p, 640, 170)}</div>` : ""}`;
  if (!c) return { none: true, k: r.k, reason: bi("EMA20 / 50 / 200 khung ngày đang lẫn lộn – chưa có xu hướng xếp lớp để đánh theo kỹ thuật.", "Daily EMAs are mixed – no trend to trade."), extra: xh(null, C[0].g, C[0].sd) };
  const sd = c.sd;
  if (sd === -1 && !r.fx) return { none: true, k: r.k, reason: bi(`Xu hướng ngày đang giảm và ${r.k} không có perp để Short.`, "Downtrend and no perp to short."), extra: xh(null, c.g, sd) };
  const a = I.atr[j]; let e = p, order = "market";
  if (!c.sig && sd * (p - I.e20[j]) > 0.3 * a) { e = I.e20[j]; order = "limit"; }
  const L = khTechLv(B, I, j, sd, e), SH = khShrink(bt, "tech", sd);
  if (sd * (p - L.t1) >= 0) {      // giá đang chạy xa EMA20 (đã vượt MT1 của nhịp hồi) → MT1 = đỉnh / đáy 20 phiên để kế hoạch chờ hồi vẫn có nghĩa
    let z = sd === 1 ? -Infinity : Infinity; for (let k = Math.max(0, j - 20); k <= j; k++) z = sd === 1 ? Math.max(z, B.h[k]) : Math.min(z, B.l[k]);
    const R = Math.abs(e - L.s); L.t1 = sd * (z - p) > 0 ? z : p + sd * 0.5 * R; L.t2 = e + sd * Math.max(KHP.tech.t2R * R, 1.6 * Math.abs(L.t1 - e));
  }
  const t = { m: "tech", side: sd === 1 ? "long" : "short", tf: "d", tfLabel: bi("Kỹ thuật – EMA · RSI · MACD ngày", "Technical – daily"), tf_bd: 1, e, s: L.s, t1: L.t1, t2: L.t2, order,
    p1: SH.win1, p2: SH.win2, d1: isNum(bt.medD) ? bt.medD : 8, d1_hi: Math.min(30, (isNum(bt.medD) ? bt.medD : 8) * 2), d2: 20, n: bt.n || null, avgR: SH.avgR, setup: null, edge: bt.n >= 8 && SH.avgR > 0.1,
    src: bi(c.sig ? "tín hiệu kỹ thuật vừa đủ 4 điều kiện" : "xu hướng EMA xếp lớp – đang chờ RSI / MACD xác nhận", c.sig ? "fresh technical signal" : "EMA trend – waiting for RSI/MACD"),
    forceWatch: !c.sig, waitTxt: bi(`Chưa đủ điều kiện: ${chk(c.g, sd).filter(([, o]) => !o).map(([x]) => x).join(" · ") || "chờ nến ngày đóng"} – đặt nhắc, chưa vào`, "Waiting for entry conditions") };
  const warn = []; if (bt.n < 8) warn.push(bi(`Kiểm chứng trên ${r.k} mới có ${bt.n} lệnh – xác suất & kỳ vọng trên phiếu đã co về số gộp ${KH_POOL.coins} coin`, `Only ${bt.n} trades on ${r.k} – figures blended with the pooled test`));
  if (SH.P.avgR <= 0.05) warn.push(bi(`Kiểm chứng gộp ${KH_POOL.coins} coin: Kỹ thuật ${sd === 1 ? "Long" : "Short"} chưa có lợi thế sau phí (${nf(SH.P.avgR, 2)}R/lệnh)`, "No pooled edge after fees"));
  if (sd === 1) warn.push(bi(`Kỹ thuật Long: lỗ ròng ở mọi biến thể đã thử và ở cả 2 nửa giai đoạn (gộp ${KH_POOL.coins} coin: ${nf(KH_POOL.tech.L.avgR, 2)}R/lệnh) – không nên dùng làm lý do vào lệnh`, "Technical Long lost in every tested variant"));
  khLiqWarn(D, warn);
  if (!c.sig) warn.push(bi("Chưa có tín hiệu vào – kế hoạch để chờ, chỉ vào khi đủ 4 điều kiện ở dưới", "No signal yet – plan to wait"));
  ticketJudge(D, IJ, t, warn, []);
  t.how = bi(`${c.sig ? "Tín hiệu đã đủ – vào" : order === "limit" ? `Chờ giá hồi về EMA20 và RSI cắt ${sd === 1 ? "lên" : "xuống"} 50, rồi vào` : `Chờ RSI cắt ${sd === 1 ? "lên" : "xuống"} 50 và MACD đổi chiều, rồi vào`} ${qty(t.q)} ${esc(r.k)} quanh ${px(e)}, cắt lỗ ${px(L.s)} (${sd === 1 ? "dưới đáy" : "trên đỉnh"} 5 phiên − 0,5 ATR). Chạm ${px(L.t1)} (${nf(t.r1, 1)}R) chốt 50% và dời cắt lỗ về hoà vốn; phần còn lại chốt ở ${px(L.t2)} (${nf(t.r2, 1)}R) hoặc khi đóng cửa ngày ${sd === 1 ? "dưới" : "trên"} EMA50. Quá 30 phiên chưa xong thì thoát.`,
    `${c.sig ? "Signal confirmed – enter" : "Wait for RSI to cross 50, then enter"} ${qty(t.q)} ${esc(r.k)} near ${px(e)}, stop ${px(L.s)}, T1 ${px(L.t1)} (${nf(t.r1, 1)}R), T2 ${px(L.t2)} (${nf(t.r2, 1)}R) or exit on a daily close beyond EMA50.`);
  t.extra = xh(t, c.g, sd); t.D = D;
  return t;
}

// ---------------------------------------------------------------- 🧺 Tích luỹ spot (mua dần theo vùng giá, không đòn bẩy, không bị thanh lý)
// 4 mức: giá hiện tại (nếu đang ở nửa rẻ của biên độ 52 tuần) + các vùng đỡ / vùng cầu SMC tuần / đáy 52 tuần, cách nhau ≥ max(4%, 0,6 ATR tuần)
// tỷ trọng tăng dần khi giá rẻ hơn (20 / 25 / 25 / 30%) · ngừng mua khi đóng tuần dưới mức thấp nhất − 1 ATR tuần · chốt 1/3 ở đỉnh 52 tuần, 1/3 ở ATH
function khDcaPlan(D, W, budget, smc) {
  const r = D.row, p = BYK[r.k]?.p || r.p, d = D.ohlc?.d, n = d?.c?.length || 0;
  if (n < 120) return { none: true, k: r.k, reason: bi("Chưa đủ lịch sử nến ngày để tính vùng tích luỹ.", "Not enough daily history.") };
  let hi = -Infinity, lo = Infinity; for (let i = Math.max(0, n - 365); i < n; i++) { hi = Math.max(hi, d.h[i]); lo = Math.min(lo, d.l[i]); }
  hi = Math.max(hi, p); lo = Math.min(lo, p);
  const Bw = W?.B?.c?.length > 15 ? khLive(W.B, p) : khWeek(d), aw = (khAtr(Bw).filter(isNum).pop() || p * 0.1), gap = Math.max(0.04, (0.6 * aw) / p), eq = (hi + lo) / 2;
  const cand = [];
  (D.lv?.d?.sup || []).forEach((z) => { if (isNum(z.p) && z.p < p * 0.985 && z.p > lo * 0.8) cand.push({ p: z.p, src: viDec((z.src || []).slice(0, 2).join(", ")) || bi("vùng đỡ", "support") }); });
  if (smc && !smc.none && smc.side === "long") cand.push({ p: smc.e < p * 0.985 ? smc.e : smc.s * 1.03, src: bi("vùng cầu SMC tuần", "weekly SMC demand") });
  cand.push({ p: lo, src: bi("đáy 52 tuần", "52-week low") });
  cand.sort((a, b) => b.p - a.p);
  const L = []; let last = p;
  if (p <= eq) { L.push({ p, src: bi("giá hiện tại – đang ở nửa rẻ biên độ 52 tuần", "current price – lower half of the 52-week range"), now: true }); }
  for (const c of cand) { if (L.length >= 4) break; if (last - c.p >= gap * p * (L.length ? 1 : 0.6) && c.p > 0) { L.push(c); last = c.p; } }
  while (L.length < 4) { const q = last * (1 - Math.max(gap, 0.08)); if (q < lo * 0.7) break; L.push({ p: q, src: bi(`thấp hơn mức trước ${nf(Math.max(gap, 0.08) * 100, 0)}%`, `${nf(Math.max(gap, 0.08) * 100, 0)}% below the previous level`), fill: true }); last = q; }
  const w0 = [0.2, 0.25, 0.25, 0.3].slice(0, L.length), ws = w0.reduce((a, b) => a + b, 0);
  L.forEach((z, i) => { z.w = w0[i] / ws; z.usd = budget * z.w; z.q = z.usd / z.p; });
  const Q = L.reduce((a, z) => a + z.q, 0), avg = budget / Q, low = L[L.length - 1].p, inval = Math.max(low * 0.5, low - aw);
  const athP = isNum(D.cg?.ath) ? D.cg.ath : isNum(r.ath) ? p / (1 + r.ath / 100) : null;
  let tp1 = hi > avg * 1.15 ? hi : avg * 1.3, tp2 = isNum(athP) && athP > tp1 * 1.15 ? athP : tp1 * 1.5;
  // khả năng chạm mỗi mức trong 90 ngày (theo lịch sử nến ngày của chính coin)
  L.forEach((z) => { const x = 1 - z.p / p; if (z.now || x <= 0) { z.prob = 100; return; } let hit = 0, tot = 0; for (let i = 0; i + 90 < n; i += 2) { let m = Infinity; for (let k = i + 1; k <= i + 90; k++) m = Math.min(m, d.l[k]); tot++; if (m <= d.c[i] * (1 - x)) hit++; } z.prob = tot ? (hit / tot) * 100 : null; });
  // so sánh: mua đều mỗi tuần vs mua 1 lần (52 & 104 tuần qua)
  const Wc = Bw.c, hist = [52, 104].filter((k) => Wc.length > k + 1).map((k) => { const seg = Wc.slice(-k - 1, -1); const a = seg.length / seg.reduce((s, v) => s + 1 / v, 0); return { k, avg: a, dca: (p / a - 1) * 100, lump: (p / seg[0] - 1) * 100 }; });
  return { m: "dca", k: r.k, p, L, Q, avg, inval, tp1, tp2, hi, lo, eq, aw, budget, hist, spot: !!r.spot, src: W?.src };
}
function khDcaHtml(x) {
  if (x.none) return ticketCard(x);
  const K = x.k, sv = esc(JSON.stringify({ k: K, side: "long", tf: "d", m: "dca", lbl: bi("Tích luỹ spot", "Spot accumulation"), e: x.L[0].p, s: x.inval, t1: x.tp1, t2: x.tp2, mode: "spot", lev: 1, q: x.Q, budget: x.budget, order: x.L[0].now ? "market" : "limit",
    zs: x.L.map((z) => ({ p: z.p, w: z.w, now: !!z.now })), tstop: Date.now() + 180 * 864e5, eta1: null }));
  return `<div class="ticket long kh-dca">
    <div class="tk-h"><span class="pill brand big">${bi("TÍCH LUỸ THEO VÙNG", "ACCUMULATE BY ZONE")}</span> ${coinLink(K, "/plan")} <span class="pill buy">SPOT</span> <span class="pill">${bi("không đòn bẩy · không thanh lý", "no leverage · no liquidation")}</span> <small class="muted">${bi("giá hiện tại", "price")} ${px(x.p)}</small></div>
    ${x.spot ? "" : `<p class="ref">⚠️ ${bi(`${esc(K)} không có cặp spot trên Binance – tích luỹ phải dùng sàn khác có spot, hoặc perp (có funding, có thanh lý).`, `${esc(K)} has no Binance spot pair.`)}</p>`}
    <div class="tw"><table class="rs kh-dt"><thead><tr><th class="l">${bi("Mức", "Level")}</th><th>${bi("Giá mua", "Buy at")}</th><th>${bi("Cách giá", "From price")}</th><th>${bi("Tỷ trọng", "Weight")}</th><th>${bi("Số tiền", "Amount")}</th><th>${bi("Số lượng", "Qty")}</th><th title="${esc(bi("Tỷ lệ số lần giá đi xuống tới mức này trong 90 ngày sau đó – theo lịch sử nến ngày của coin", "How often price reached this level within 90 days, historically"))}">${bi("Khả năng khớp 90 ngày", "Fill odds 90d")}</th></tr></thead><tbody>
      ${x.L.map((z, i) => `<tr><td class="l"><b>${i + 1}</b> <small class="faint">${esc(z.src)}</small></td><td>${px(z.p)}</td><td>${z.now ? bi("mua ngay", "now") : pct((z.p / x.p - 1) * 100, 1)}</td><td>${nf(z.w * 100, 0)}%</td><td>${usd(z.usd)}</td><td>${qty(z.q)}</td><td>${isNum(z.prob) ? nf(z.prob, 0) + "%" : "—"}</td></tr>`).join("")}</tbody></table></div>
    ${kpis([[bi("Giá vốn TB nếu khớp đủ", "Avg cost if all fill"), px(x.avg)], [bi("Tổng số lượng", "Total qty"), `${qty(x.Q)} ${esc(K)}`], [bi("Ngừng mua & xem lại", "Stop & review"), px(x.inval), "down", bi("đóng nến tuần dưới mức này", "weekly close below")], [bi("Chốt 1/3", "Sell 1/3"), `${px(x.tp1)} <small>${pct((x.tp1 / x.avg - 1) * 100, 0)}</small>`, "up", bi("đỉnh 52 tuần", "52-week high")], [bi("Chốt 1/3 tiếp", "Sell next 1/3"), `${px(x.tp2)} <small>${pct((x.tp2 / x.avg - 1) * 100, 0)}</small>`, "up", bi("đỉnh lịch sử (ATH) / mở rộng", "ATH / extension")], [bi("Biên độ 52 tuần", "52-week range"), `${px(x.lo)} – ${px(x.hi)}`]])}
    ${x.hist.length ? `<p class="faint">📅 ${x.hist.map((h) => bi(`Mua đều mỗi tuần ${h.k} tuần qua: giá vốn ${px(h.avg)} → hiện <b class="${cls(h.dca)}">${pct(h.dca, 0)}</b> (mua 1 lần đầu kỳ: <span class="${cls(h.lump)}">${pct(h.lump, 0)}</span>)`, `Weekly DCA over ${h.k} weeks: avg ${px(h.avg)} → <b class="${cls(h.dca)}">${pct(h.dca, 0)}</b> (lump sum ${pct(h.lump, 0)})`)).join(" · ")}.</p>` : ""}
    <div class="tk-plan"><b>${bi("Cách đánh", "How")}:</b> ${bi(`Chia ${usd(x.budget)} thành ${x.L.length} phần, đặt sẵn lệnh mua giới hạn ở từng mức (${x.L[0].now ? "phần 1 mua ngay" : "chưa mua ngay"}) – giá càng rẻ phần càng lớn. Không dùng đòn bẩy nên không bị thanh lý; nếu đóng nến tuần dưới ${px(x.inval)} thì ngừng mua và xem lại lý do giữ coin (không bán tháo theo cảm xúc). Lên tới ${px(x.tp1)} chốt 1/3, ${px(x.tp2)} chốt thêm 1/3, phần còn lại giữ dài hạn.`, `Split ${usd(x.budget)} into ${x.L.length} limit buys, larger as price falls. Stop adding on a weekly close below ${px(x.inval)}. Sell 1/3 at ${px(x.tp1)}, 1/3 at ${px(x.tp2)}.`)}</div>
    <div class="kh-ch">${oppChart(Bw0(x), { s: x.inval, e: x.L[0].p, t1: x.tp1, t2: x.tp2, tf: "w" }, x.p, 640, 170)}</div>
    <small class="muted">${bi("Cơ sở", "Basis")}: ${bi("biên độ 52 tuần, vùng đỡ hợp lưu, vùng cầu SMC tuần", "52-week range, support confluence, weekly SMC demand")}${x.src ? ` · ${esc(x.src)}` : ""}. ${bi("Vốn đặt ở ô Ngân sách – không tính theo % rủi ro như lệnh đòn bẩy.", "Budget is set in the field above.")}</small>
    <div class="tk-a"><button class="btn primary" data-khdca='${sv}'>${bi("Lưu kế hoạch & nhắc tôi", "Save plan & remind me")}</button><small class="faint">${bi("nhắc khi giá tới từng mức mua, khi chạm mức chốt hoặc mức ngừng mua", "alerts at each buy level, take-profit and stop-adding level")}</small></div>
  </div>`;
}
const Bw0 = (x) => x._B || { c: [], o: [], h: [], l: [] };

// ---------------------------------------------------------------- chọn cách đánh → phiếu lệnh
const KH_IJ = { v: null };
async function khIJ() { if (!KH_IJ.v) KH_IJ.v = await load("data/ideas.json").catch(() => ({ items: [], btc_up: true })); return KH_IJ.v; }
async function khBuild(D, m, side, budget) {
  const IJ = await khIJ(); D._ij = IJ;
  if (m === "h4" || m === "d") { const t = makeTicket(D, IJ, { tf: m, side }); t.k = t.k || D.row.k; t.m = m; return t; }
  if (m === "tech") return khTechPlan(D, IJ, side);
  const W = await khWeekly(D);
  if (m === "smc") return khSmcPlan(D, IJ, W, side);
  if (m === "dca") { const s = khSmcPlan(D, IJ, W, "long"), x = khDcaPlan(D, W, budget, s); if (!x.none) x._B = khLive(W.B?.c?.length > 15 ? W.B : khWeek(D.ohlc?.d), x.p); return x; }
  return null;
}
const KH_RANK = { go: 0, limit: 1, watch: 2, no: 3 };
// thẻ nhỏ so sánh các cách đánh cho cùng 1 coin
function khMini(m, t, on) {
  const M = khMeta(m);
  if (khLock(m)) return `<button type="button" class="kh-mc lk${on ? " on" : ""}" data-khm="${m}"><b>${M[1]} ${M[2]}</b><small>${M[3]}</small><span class="kh-mcs"><span class="pill">🔒 ★ Pro</span></span></button>`;
  let st;
  if (!t) st = `<span class="pill">…</span>`;
  else if (m === "dca") st = t.none ? `<span class="pill sell">${bi("KHÔNG", "NO")}</span>` : `<span class="pill brand">${t.L.length} ${bi("mức mua", "levels")}</span><em>${bi("giá vốn TB", "avg")} ${px(t.avg)} · ${bi("cách giá", "vs price")} ${pct((t.avg / t.p - 1) * 100, 0)}</em>`;
  else if (t.none) st = `<span class="pill sell">${bi("KHÔNG VÀO", "NO TRADE")}</span><em>${esc(String(t.reason || "").slice(0, 70))}${String(t.reason || "").length > 70 ? "…" : ""}</em>`;
  else { const [vt, vc] = VERD[t.verdict] || ["—", ""]; st = `<span class="pill ${t.side === "long" ? "buy" : "sell"}">${t.side === "long" ? "LONG" : "SHORT"}</span><span class="pill ${t.forceWatch ? "warn" : vc}">${t.forceWatch ? bi("CHỜ TÍN HIỆU", "WAIT") : vt}</span><em>R:R ${nf(t.r1, 1)} · MT1 ${nf(t.p1, 0)}%${isNum(t.n) ? ` <small>(${nf(t.n, 0)} ${bi("lần", "x")})</small>` : ""}</em>`; }
  return `<button type="button" class="kh-mc${on ? " on" : ""}" data-khm="${m}"><b>${M[1]} ${M[2]}</b><small>${M[3]}</small><span class="kh-mcs">${st}</span></button>`;
}
function khLockBody(m) {
  const M = khMeta(m);
  return `<div class="kh-lock"><b>${M[1]} ${M[2]} · ★ Pro</b><p>${{ smc: bi("Đọc cấu trúc nến TUẦN: phá cấu trúc (BOS / CHoCH), biên độ giao dịch, khối lệnh & vùng OTE, mục tiêu ở thanh khoản đỉnh / đáy cũ – kèm kiểm chứng trên toàn bộ lịch sử nến tuần của coin.", "Weekly market structure with OB/OTE entries and liquidity targets, back-tested on the coin."),
    tech: bi("Xu hướng EMA 20/50/200 xếp lớp, RSI hồi rồi cắt 50, MACD đổi chiều – báo đủ / thiếu từng điều kiện và kiểm chứng trên 4 năm nến ngày của coin.", "EMA stack + RSI + MACD rules with a per-coin back-test."),
    dca: bi("Chia vốn mua dần ở 4 vùng giá (vùng đỡ, vùng cầu SMC tuần, đáy 52 tuần), khả năng khớp từng mức theo lịch sử, mức ngừng mua và kế hoạch chốt lời – không đòn bẩy.", "Split a budget across 4 buy zones with fill odds, stop level and take-profit plan.") }[m] || ""}</p><a class="btn primary" href="#/account">${bi("Xem gói Pro", "See Pro")}</a></div>`;
}

// ---------------------------------------------------------------- TRANG
const KH_TABS = [["new", "🧾", bi("Lên kế hoạch", "Plan"), "#/plan"], ["saved", "📌", bi("Đã lưu", "Saved"), "#/plan/saved"], ["log", "📒", bi("Nhật ký", "Journal"), "#/plan/log"]];
async function viewPlan(a0 = "") {
  const tab = a0 === "saved" || a0 === "lists" ? "saved" : a0 === "log" ? "log" : "new";
  if (a0 === "lists") lsSet("khsv", "lists");
  await Promise.all([coins(), loadSettings(), pfLoad().catch(() => null), WL.load().catch(() => null)]);
  if (!PF) PF = { holdings: [], futures: [], journal: [], plans: [] };
  const nAct = (PF?.plans || []).filter((p) => !p.done).length;
  app().innerHTML = `<div class="ph"><h1>${bi("Lên kế hoạch lệnh", "Trade planner")}</h1><span class="meta">${bi("Đèn", "Light")} ${LIGHT_VI[govLight()] || ""} · ${bi("đòn bẩy tối đa", "max leverage")} x${GOV.base.d[govLight()]} swing, x${GOV.base.h4[govLight()]} ${bi("lướt", "intraday")} · ${bi("rủi ro", "risk")} ${nf(levGov({ k: "BTC", mc: 2e12 }, "long", "d").risk, 2)}%/${bi("lệnh", "trade")} · <a href="#/portfolio">${bi("kiểm soát rủi ro →", "risk control →")}</a></span></div>
    <nav class="subtabs kh-tabs" aria-label="${bi("Các phần của Lên kế hoạch", "Planner sections")}">${KH_TABS.map(([k, ic, t, h]) => `<button type="button" data-khtab="${h}" class="${k === tab ? "on" : ""}" aria-current="${k === tab ? "page" : "false"}">${ic} ${t}${k === "saved" && nAct ? ` <i class="kh-bdg">${nAct}</i>` : ""}</button>`).join("")}</nav>
    <div id="khBody"></div>`;
  $$("[data-khtab]").forEach((b) => (b.onclick = () => { location.hash = b.dataset.khtab; }));
  if (tab === "saved") return khSaved();
  if (tab === "log") return khLog();
  return khNew(a0 ? String(a0).toUpperCase() : "");
}

// ① LÊN KẾ HOẠCH
async function khNew(k0) {
  const host = $("#khBody");
  const O = { k: k0 || lsGet("plk", ""), m: lsGet("pltf", "auto"), side: lsGet("plside", "auto"), bud: lsGet("pldca", Math.round(setting("acct", 10000) * 0.1)) };
  if (!["auto", ...KHM.map((x) => x[0])].includes(O.m)) O.m = "auto";
  host.innerHTML = `<section class="panel"><div class="ph"><h2>🧾 ${bi("Tạo kế hoạch cho một coin", "Plan a trade for one coin")}</h2><span class="meta">${bi("chọn coin → xem 5 cách đánh cạnh nhau → bấm 1 cách để ra phiếu lệnh đầy đủ", "pick a coin → compare 5 styles → open one")}</span></div>
      <div class="filters kh-f"><div class="field"><label for="plK">Coin</label><input id="plK" list="plList" value="${esc(O.k)}" placeholder="VD: SOL" autocomplete="off" autocapitalize="characters"></div>
        <div class="field w2"><label>${bi("Chiều", "Side")}</label><div class="bseg kh-side" role="radiogroup">${[["auto", bi("Theo hệ thống", "System")], ["long", "Long"], ["short", "Short"]].map(([k, t]) => `<button type="button" role="radio" aria-checked="${O.side === k}" data-khs="${k}" class="${O.side === k ? "on" : ""}">${t}</button>`).join("")}</div></div>
        <div class="field w2 kh-bud"${O.m === "dca" ? "" : ' style="display:none"'}><label for="khBud">${bi("Ngân sách tích luỹ (USDT)", "Budget (USDT)")}</label><input id="khBud" inputmode="decimal" value="${esc(String(O.bud))}"></div>
        <button class="btn primary" id="plGo">${bi("Tạo kế hoạch", "Build plan")}</button></div>
      <datalist id="plList">${COINS.rows.map((r) => `<option value="${esc(r.k)}">${esc(r.n)}</option>`).join("")}</datalist>
      <div class="kh-mcw" id="khCmp"></div><div id="plOut"></div></section>
    <section class="panel"><div class="ph"><h2>🎯 ${bi("3 lệnh đáng làm nhất lúc này", "Top 3 trades right now")} <span class="live-dot"></span></h2><span class="meta"><a href="#/ideas">${bi("xem tất cả ở Cơ hội hôm nay →", "all ideas →")}</a> · ${bi("thiết lập Lướt / Swing có thống kê của hệ thống · giá & trạng thái cập nhật từng giây", "system Intraday / Swing setups · live")}</span></div><div id="plTop"><p class="muted">${bi("Đang tính…", "Computing…")}</p></div></section>
    <p class="faint disclaimer">${bi("Kế hoạch được tính tự động từ quy tắc cố định & thống kê quá khứ – không phải lời khuyên đầu tư và không đảm bảo kết quả. Đòn bẩy chỉ làm giảm tiền ký quỹ; mức lỗ do khối lượng và điểm cắt lỗ quyết định – luôn đặt cắt lỗ trên sàn.", "Plans are computed from fixed rules & past statistics – not investment advice. Always place the stop on the exchange.")}</p>`;
  let D = null, cur = O.m, RES = {}, seq = 0;
  const side = () => $(".kh-side button.on")?.dataset.khs || "auto";
  const bud = () => { const v = numIn($("#khBud")?.value); return v > 0 ? v : 1000; };
  const strip = () => { const el = $("#khCmp"); if (!el || !D) return; el.innerHTML = `<div class="kh-mcg" role="tablist">${[["auto"], ...KHM].map(([m]) => (m === "auto" ? `<button type="button" class="kh-mc kh-auto${cur === "auto" ? " on" : ""}" data-khm="auto"><b>🤖 ${bi("Tự chọn", "Auto")}</b><small>${bi("cách có kế hoạch tốt nhất", "best available")}</small><span class="kh-mcs">${RES._best ? `<span class="pill brand">${khLbl(RES._best)}</span>` : ""}</span></button>` : khMini(m, RES[m], cur === m))).join("")}</div>`; $$("[data-khm]", el).forEach((b) => (b.onclick = () => pick(b.dataset.khm))); };
  const detail = () => {
    const out = $("#plOut"); if (!out || !D) return;
    $(".kh-bud").style.display = cur === "dca" ? "" : "none";
    let m = cur === "auto" ? RES._best : cur;
    if (!m) { out.innerHTML = `<div class="empty">${bi("Chưa có cách đánh nào ra kế hoạch có lợi thế cho coin này lúc này. Không vào lệnh cũng là một quyết định tốt.", "No style has an edge on this coin right now.")}</div>`; return; }
    if (khLock(m)) { out.innerHTML = khLockBody(m); return; }
    const t = RES[m]; if (!t) { out.innerHTML = skLines(4); return; }
    if (m === "dca") { out.innerHTML = khDcaHtml(t); $$("[data-khdca]", out).forEach((b) => (b.onclick = async () => { if (await planSave(JSON.parse(b.dataset.khdca))) { b.disabled = true; b.textContent = bi("Đã lưu ✓", "Saved ✓"); khBadge(); } })); const p = BYK[t.k]?.p; $$(".kh-ch", out).forEach((c) => oppPm(c, p)); return; }
    if (t.none) { out.innerHTML = ticketCard(t) + (t.extra ? `<div class="kh-x">${t.extra}</div>` : ""); return; }
    liveTickets(out, [{ t, D }]);
    if (t.extra) out.insertAdjacentHTML("beforeend", `<details class="kh-x" open><summary>${m === "smc" ? bi("🏛 Cấu trúc tuần & kiểm chứng", "🏛 Weekly structure & back-test") : bi("📐 Chỉ báo, điều kiện & kiểm chứng", "📐 Indicators, conditions & back-test")}</summary>${t.extra}</details>`);
    $$(".kh-x .kh-ch", out).forEach((c) => oppPm(c, BYK[t.k]?.p));
    $$("[data-tsave]", out).forEach((b) => b.addEventListener("click", () => setTimeout(khBadge, 400)));
  };
  const pick = (m) => { cur = m; lsSet("pltf", m); strip(); detail(); };
  const go = async () => {
    const k = $("#plK").value.trim().toUpperCase(); if (!BYK[k]) { $("#plOut").innerHTML = `<p class="muted">${bi("Chọn coin có trong danh sách.", "Pick a listed coin.")}</p>`; $("#khCmp").innerHTML = ""; return; }
    const my = ++seq; lsSet("plk", k); lsSet("plside", side()); lsSet("pldca", bud());
    if (location.hash !== `#/plan/${k}`) history.replaceState(null, "", `#/plan/${enc(k)}`);
    $("#khCmp").innerHTML = ""; $("#plOut").innerHTML = skLines(4);
    try { D = await load(`data/c/${enc(k)}.json`); } catch (e) { $("#plOut").innerHTML = `<p class="muted">${bi("Chưa có dữ liệu phân tích cho coin này.", "No analysis data for this coin.")}</p>`; return; }
    if (my !== seq) return;
    RES = {}; strip(); if (cur !== "auto") detail();
    const sd = side(), B = bud();
    await Promise.all(KHM.map(async ([m]) => { if (khLock(m)) return; try { RES[m] = await khBuild(D, m, sd, B); } catch (e) { console.error(e); RES[m] = { none: true, k, reason: bi("Không tính được cách đánh này cho coin này.", "Could not compute this style.") }; } if (my === seq) strip(); }));
    if (my !== seq) return;
    const cand = KHM.map(([m]) => m).filter((m) => m !== "dca" && RES[m] && !RES[m].none).sort((a, b) => (KH_RANK[RES[a].verdict] ?? 9) - (KH_RANK[RES[b].verdict] ?? 9) || (RES[b].evR || 0) - (RES[a].evR || 0));
    RES._best = cand.find((m) => RES[m].verdict !== "no") || null; strip(); detail();
  };
  $("#plGo").onclick = go; $("#plK").addEventListener("change", go);
  $$(".kh-side button").forEach((b) => (b.onclick = () => { $$(".kh-side button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); if (D) go(); }));
  $("#khBud").addEventListener("change", async () => { if (!D || khLock("dca")) return; lsSet("pldca", bud()); RES.dca = await khBuild(D, "dca", side(), bud()); strip(); if (cur === "dca" || (cur === "auto" && RES._best === "dca")) detail(); });
  if (O.k && BYK[O.k]) go();
  // 🎯 3 lệnh đáng làm nhất (thiết lập Lướt / Swing của hệ thống)
  const IJ = await khIJ(), L = await liveData();
  const items = ((L && L.ideas && new Date(L.at) > new Date(IJ.at)) ? L.ideas : IJ.items || []).filter((x) => x.edge).slice(0, 3);
  const build = async (fresh) => {
    let src = items;
    if (fresh) { const L2 = await liveData(true); src = ((L2 && L2.ideas && new Date(L2.at) > new Date(IJ.at)) ? L2.ideas : IJ.items || []).filter((x) => x.edge).slice(0, 3); }
    const seen = new Set(), tops = [];
    for (const x of src) { if (seen.has(x.k)) continue; seen.add(x.k); try { const D2 = await load(`data/c/${enc(x.k)}.json`); D2._ij = IJ; D2.ideas = [x, ...(D2.ideas || []).filter((y) => y.setup !== x.setup)]; const t = makeTicket(D2, IJ, { tf: x.tf, side: x.side }); t.m = x.tf; if (!t.none && t.verdict !== "no") tops.push({ t, D: D2 }); } catch (e) { /* thiếu dữ liệu */ } }
    const top = $("#plTop"); if (!top) return;
    const sig = tops.map((x) => x.t.k + x.t.side + x.t.e).join("|");
    if (fresh && sig === top.dataset.sig) return;
    top.dataset.sig = sig;
    if (!tops.length) { top.innerHTML = `<div class="empty">${bi(`Hiện không có thiết lập có lợi thế lịch sử. Không vào lệnh cũng là một quyết định tốt – hoặc tự tạo kế hoạch cho coin anh quan tâm ở trên, hoặc xem <a href="#/radar">Radar</a> cho khung ngắn.`, "No setups with a historical edge right now.")}</div>`; return; }
    liveTickets(top, tops, { refresh: () => build(true) });
  };
  await build(false);
}
function khBadge() { const n = (PF?.plans || []).filter((p) => !p.done).length, b = document.querySelector('[data-khtab="#/plan/saved"]'); if (!b) return; b.querySelector(".kh-bdg")?.remove(); if (n) b.insertAdjacentHTML("beforeend", ` <i class="kh-bdg">${n}</i>`); }

// ---------------------------------------------------------------- theo dõi kế hoạch đã lưu bằng nến (tự biết: đã khớp chưa, chạm MT1 / MT2 / cắt lỗ, hết hạn)
async function khEval(p) {
  const sd = p.side === "short" ? -1 : 1, now = Date.now(), c0 = Date.parse(p.created) / 1000, cur = BYK[p.k]?.p;
  let D = null; try { D = await load(`data/c/${enc(p.k)}.json`); } catch (e) { /* bỏ qua */ }
  const age = (now / 1000 - c0) / 3600, tf = age <= 480 && D?.ohlc?.h1 ? "h1" : age <= 2400 && D?.ohlc?.h4 ? "h4" : "d", o0 = D?.ohlc?.[tf], len = { h1: 3600, h4: 14400, d: 86400 }[tf];
  const bars = []; if (o0) for (let i = 0; i < o0.t.length; i++) if (o0.t[i] >= c0 - (p.order === "market" ? 0 : len)) bars.push([o0.t[i], o0.h[i], o0.l[i], o0.c[i]]);
  if (isNum(cur)) bars.push([now / 1000, cur, cur, cur]);
  const R = Math.abs(p.e - p.s) || 1;
  if (planM(p) === "dca" && Array.isArray(p.zs)) {
    let mn = Infinity, mx = -Infinity; bars.forEach((b) => { mn = Math.min(mn, b[2]); mx = Math.max(mx, b[1]); });
    const f = p.zs.filter((z) => z.now || mn <= z.p), usdF = f.reduce((a, z) => a + (p.budget || 0) * z.w, 0), qF = f.reduce((a, z) => a + ((p.budget || 0) * z.w) / z.p, 0), avg = qF ? usdF / qF : null;
    const Wk = D?.ohlc?.d ? khWeek(D.ohlc.d) : null; let inval = false; if (Wk) for (let i = 0; i < Wk.t.length - 1; i++) if (Wk.t[i] >= c0 - 7 * 86400 && Wk.c[i] < p.s) inval = true;
    const st = inval ? "inval" : f.length && mx >= p.t2 ? "t2" : f.length ? "dca" : "wait";
    return { st, n: f.length, of: p.zs.length, avg, pnl: avg && isNum(cur) ? (cur / avg - 1) * 100 : null, t1: f.length && mx >= p.t1, r: avg ? (((st === "t2" ? p.t2 : cur) / avg) - 1) * 100 : null, cur, tf };
  }
  let en = p.order === "market" ? 0 : null, h1 = false, out = null, at = null;
  for (let i = 0; i < bars.length; i++) {
    const [t, h, l, c] = bars[i];
    if (en == null) {
      if (sd === 1 ? l <= p.e : h >= p.e) en = i;
      else if (sd === 1 ? h >= p.t1 : l <= p.t1) { out = "missed"; at = t; break; }
      else if (p.tstop && t * 1000 > p.tstop) { out = "expired"; at = t; break; }
      else continue;
    }
    if (sd === 1 ? l <= (h1 ? p.e : p.s) : h >= (h1 ? p.e : p.s)) { out = h1 ? "t1be" : "sl"; at = t; break; }
    if (!h1 && (sd === 1 ? h >= p.t1 : l <= p.t1)) h1 = true;
    if (h1 && (sd === 1 ? h >= p.t2 : l <= p.t2)) { out = "t2"; at = t; break; }
    if (!h1 && p.tstop && t * 1000 > p.tstop) { out = "time"; at = t; break; }
  }
  const r1 = Math.abs(p.t1 - p.e) / R, r2 = Math.abs(p.t2 - p.e) / R;
  const rNow = (x) => (sd * (x - p.e)) / R;
  let r = null;
  if (out === "sl") r = -1; else if (out === "t1be") r = 0.5 * r1; else if (out === "t2") r = 0.5 * r1 + 0.5 * r2;
  else if (out === "time") { const b = bars.find((x) => x[0] === at); r = rNow(b ? b[3] : cur); }
  else if (en != null && isNum(cur)) r = h1 ? 0.5 * r1 + 0.5 * Math.max(0, rNow(cur)) : rNow(cur);
  const st = out || (en == null ? "wait" : h1 ? "run1" : "open");
  return { st, r, at: at ? at * 1000 : null, h1, cur, tf, gap: isNum(cur) ? (p.e / cur - 1) * 100 : null };
}
function khChip(p, E) {
  const O = KH_OUT[E.st];
  if (O) return `<span class="pill ${O[2]}">${O[0]} ${O[1]}${isNum(E.r) && KH_IN.has(E.st) ? ` · ${E.r > 0 ? "+" : ""}${nf(E.r, 2)}R` : ""}</span>`;
  if (E.st === "dca") return `<span class="pill brand">🧺 ${bi(`Đã khớp ${E.n}/${E.of} mức`, `Filled ${E.n}/${E.of}`)}${isNum(E.pnl) ? ` · <b class="${cls(E.pnl)}">${pct(E.pnl, 1)}</b>` : ""}</span>${E.t1 ? ` <span class="pill buy">${bi("Tới mức chốt 1/3", "Hit TP1")}</span>` : ""}`;
  if (E.st === "run1") return `<span class="pill buy">✅ ${bi("Chạm MT1 – đã dời cắt lỗ về hoà vốn", "Hit T1 – stop at breakeven")}${isNum(E.r) ? ` · +${nf(E.r, 2)}R` : ""}</span>`;
  if (E.st === "open") return `<span class="pill brand">🟢 ${bi("Đã tới vùng vào", "Entry reached")}${isNum(E.r) ? ` · <b class="${cls(E.r)}">${E.r > 0 ? "+" : ""}${nf(E.r, 2)}R</b>` : ""}</span>`;
  const near = isNum(E.gap) && Math.abs(E.gap) < 1.5;
  return `<span class="pill ${near ? "warn" : ""}">${near ? "🎯" : "⏳"} ${near ? bi("Sắp tới vùng vào", "Near entry") : bi("Chờ vào", "Waiting")}${isNum(E.gap) ? ` · ${bi("cách", "gap")} ${pct(E.gap, 1)}` : ""}</span>`;
}
const KH_ORD = { run1: 0, open: 1, dca: 2, wait: 3 };

// ② ĐÃ LƯU: kế hoạch + list coin
async function khSaved() {
  const host = $("#khBody"), sv = lsGet("khsv", "plans") === "lists" ? "lists" : "plans";
  const nAct = (PF.plans || []).filter((p) => !p.done).length;
  host.innerHTML = `<div class="bseg kh-seg" role="tablist">${[["plans", `📌 ${bi("Kế hoạch đang chờ", "Active plans")} <small>${nAct}/${planLim("plans") >= 200 ? "∞" : planLim("plans")}</small>`], ["lists", `⭐ ${bi("List coin", "Coin lists")} <small>${1 + (WL.lists || []).length}</small>`]].map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === sv}" data-khsv="${k}" class="${k === sv ? "on" : ""}">${t}</button>`).join("")}</div><div id="khSv"></div>`;
  $$("[data-khsv]", host).forEach((b) => (b.onclick = () => { lsSet("khsv", b.dataset.khsv); khSaved(); }));
  return sv === "lists" ? khLists() : khPlans();
}
async function khPlans() {
  const el = $("#khSv"), A = (PF.plans || []).filter((p) => !p.done);
  if (!A.length) { el.innerHTML = `<div class="empty">${bi(`Chưa có kế hoạch đang chờ. Vào <a href="#/plan">Lên kế hoạch</a>, chọn coin & cách đánh rồi bấm <b>Lưu kế hoạch & nhắc tôi</b> – hệ thống nhắc khi giá tới điểm vào, mục tiêu, cắt lỗ hoặc hết hạn, và tự ghi kết quả vào Nhật ký.`, "No active plans yet. Build one in Plan and save it.")}</div>`; return; }
  el.innerHTML = `<div class="kh-pcs">${A.map(() => `<div class="kh-pc">${skLines(3)}</div>`).join("")}</div>`;
  const E = await Promise.all(A.map((p) => khEval(p).catch(() => ({ st: "wait" }))));
  // kết quả cuối (cắt lỗ / chạm MT2 / hết hạn…) → tự chuyển sang Nhật ký
  let ch = false;
  A.forEach((p, i) => { const e = E[i]; if (KH_OUT[e.st] && !p.done) { p.done = { o: e.st, at: new Date(e.at || Date.now()).toISOString(), r: isNum(e.r) ? +e.r.toFixed(3) : null, auto: 1 }; ch = true; } });
  if (ch) { await pfSave().catch(() => null); const n = A.filter((p) => p.done).length; toast(bi(`${n} kế hoạch đã có kết quả – đã chuyển sang Nhật ký`, `${n} plan(s) finished – moved to the Journal`)); }
  const L = A.map((p, i) => [p, E[i]]).filter(([p]) => !p.done).sort((a, b) => (KH_ORD[a[1].st] ?? 9) - (KH_ORD[b[1].st] ?? 9) || Math.abs(a[1].gap ?? 99) - Math.abs(b[1].gap ?? 99));
  if (!L.length) { el.innerHTML = `<div class="empty">${bi(`Các kế hoạch đều đã có kết quả – xem ở <a href="#/plan/log">Nhật ký</a>.`, `All plans finished – see the <a href="#/plan/log">Journal</a>.`)}</div>`; khBadge(); return; }
  el.innerHTML = `<div class="kh-pcs">${L.map(([p, e]) => khCard(p, e)).join("")}</div><p class="faint">${bi("Trạng thái tính từ nến (1 giờ / 4 giờ / ngày tuỳ tuổi kế hoạch) và giá hiện tại – cập nhật khi mở trang. Máy chủ gửi thông báo khi giá tới điểm vào / mục tiêu / cắt lỗ (cần bật thông báo).", "Status is computed from candles and the live price.")}</p>`;
  khBadge();
  el.onclick = async (ev) => {
    const b = ev.target.closest("[data-khact]"); if (!b) return;
    const p = (PF.plans || []).find((x) => x.id === b.dataset.id); if (!p) return;
    const a = b.dataset.khact;
    if (a === "open") { lsSet("pltf", planM(p)); lsSet("plside", p.side); location.hash = `#/plan/${enc(p.k)}`; return; }
    if (a === "note") { const v = await askText(bi(`Ghi chú cho kế hoạch ${p.k}\n\nLý do vào, điều cần chờ, khi nào bỏ kế hoạch…`, `Note for ${p.k}`), p.note || ""); if (v == null) return; p.note = String(v).slice(0, 600); await pfSave(); khPlans(); return; }
    if (a === "close") { const r = await khCloseSheet(p); if (!r) return; p.done = r; await pfSave(); toast(bi(`Đã đóng kế hoạch ${p.k} – xem ở Nhật ký`, `Closed ${p.k}`)); khPlans(); return; }
    if (a === "del") { if (!(await askOk(bi(`Xoá kế hoạch ${p.k}?\n\nXoá hẳn, không ghi vào Nhật ký. Muốn giữ kết quả thì bấm Đóng.`, `Delete the ${p.k} plan?`)))) return; PF.plans = PF.plans.filter((x) => x !== p); await pfSave(); khPlans(); }
  };
}
function khCard(p, E) {
  const m = planM(p), L = p.side !== "short", cur = E.cur;
  const dca = m === "dca" && Array.isArray(p.zs);
  const lv = dca ? `<div class="kh-zs">${p.zs.map((z, i) => `<span class="${z.now || (isNum(E.n) && i < E.n) ? "on" : ""}" title="${esc(bi(`Mức ${i + 1}: ${px(z.p)} · ${nf(z.w * 100, 0)}%`, `Level ${i + 1}`))}"><b>${px(z.p)}</b><small>${nf(z.w * 100, 0)}%</small></span>`).join("")}</div>`
    : `<p class="kh-lv">${bi("vào", "entry")} <b>${px(p.e)}</b> · ${bi("cắt lỗ", "stop")} <b class="down">${px(p.s)}</b> · MT <b class="up">${px(p.t1)}</b> / <b class="up">${px(p.t2)}</b>${isNum(p.r1) ? ` · R:R ${nf(p.r1, 1)}` : ""}</p>${isNum(cur) ? rail(p, cur) : ""}`;
  return `<article class="kh-pc ${L ? "L" : "S"}" data-id="${esc(p.id)}">
    <div class="kh-pch">${coinLink(p.k, "/plan")} <span class="pill ${L ? "buy" : "sell"}">${dca ? "SPOT" : L ? "LONG" : "SHORT"}</span> <span class="pill">${khLbl(m)}</span>${p.mode === "perp" ? ` <small class="faint">x${p.lev}</small>` : ""}<span class="kh-px">${px(cur)}</span></div>
    <div class="kh-pst">${khChip(p, E)}</div>${lv}
    ${dca && isNum(E.avg) ? `<p class="faint">${bi("giá vốn TB phần đã khớp", "avg cost filled")} ${px(E.avg)} · ${bi("ngừng mua dưới", "stop adding below")} ${px(p.s)} · ${bi("chốt", "TP")} ${px(p.t1)} / ${px(p.t2)}</p>` : ""}
    <p class="kh-pm"><small>${bi("lưu", "saved")} ${khD(p.created)} (${khAgo(p.created)})${p.tstop ? ` · ${bi("hạn", "deadline")} ${khD(p.tstop)}` : ""}${p.q ? ` · ${qty(p.q)} ${esc(p.k)}` : ""}${dca && p.budget ? ` · ${usd(p.budget)}` : ""}</small></p>
    ${p.note ? `<p class="kh-note">✍️ ${esc(p.note)}</p>` : ""}
    <div class="kh-pa"><button type="button" class="btn sm" data-khact="open" data-id="${esc(p.id)}">${bi("Mở kế hoạch", "Open")}</button><button type="button" class="btn sm" data-khact="note" data-id="${esc(p.id)}">✍️ ${bi("Ghi chú", "Note")}</button><button type="button" class="btn sm" data-khact="close" data-id="${esc(p.id)}">${bi("Đóng", "Close")}</button><button type="button" class="btn sm ghost" data-khact="del" data-id="${esc(p.id)}" aria-label="${bi("Xoá", "Delete")}">🗑</button></div>
  </article>`;
}
async function khCloseSheet(p) {
  const cur = BYK[p.k]?.p;
  const ok = await iosSheet({ title: bi(`Đóng kế hoạch ${esc(p.k)}`, `Close the ${esc(p.k)} plan`), sub: khLbl(planM(p)),
    body: `<div class="kh-nt"><div class="bseg" id="khCo">${[["manual", bi("✋ Đã vào & đã thoát", "✋ Entered & exited")], ["cancel", bi("🗑 Không vào – huỷ", "🗑 Didn't enter – cancel")]].map(([k, t], i) => `<button type="button" data-v="${k}" class="${i ? "" : "on"}">${t}</button>`).join("")}</div>
      <label class="field"><span>${bi("Giá thoát", "Exit price")}</span><input id="khCx" inputmode="decimal" value="${isNum(cur) ? +cur.toPrecision(6) : ""}"></label>
      <label class="field"><span>${bi("Ghi chú / bài học (tuỳ chọn)", "Note / lesson (optional)")}</span><textarea id="khCn" rows="2">${esc(p.note || "")}</textarea></label></div>`,
    ok: bi("Đóng & ghi nhật ký", "Close & log") });
  if (!ok) return null;
  const o = document.querySelector("#khCo button.on")?.dataset.v || "manual", x = numIn(document.querySelector("#khCx")?.value), note = (document.querySelector("#khCn")?.value || "").slice(0, 600);
  const R = Math.abs(p.e - p.s) || 1, sd = p.side === "short" ? -1 : 1;
  return { o, at: new Date().toISOString(), x: o === "manual" && x > 0 ? x : null, r: o === "manual" && x > 0 && planM(p) !== "dca" ? +((sd * (x - p.e)) / R).toFixed(3) : null, note };
}
document.addEventListener("click", (e) => { const b = e.target.closest("#khCo button"); if (!b) return; $$("#khCo button").forEach((x) => x.classList.toggle("on", x === b)); const f = document.querySelector("#khCx")?.closest(".field"); if (f) f.style.display = b.dataset.v === "cancel" ? "none" : ""; });

// ⭐ LIST COIN (★ Theo dõi + list tự đặt tên – lưu chung khoá watchlist)
async function khLists() {
  const el = $("#khSv"); await WL.load();
  const lists = WL.lists || [], sel0 = lsGet("khls", "star"), sel = sel0 === "star" || lists.some((l) => l.id === sel0) ? sel0 : "star";
  const L = sel === "star" ? { id: "star", n: bi("★ Theo dõi", "★ Watchlist"), syms: [...WL.set] } : lists.find((l) => l.id === sel);
  const rows = (L.syms || []).filter((k) => BYK[k]);
  el.innerHTML = `<section class="panel"><div class="kh-lsb">${[{ id: "star", n: bi("★ Theo dõi", "★ Watchlist"), syms: [...WL.set] }, ...lists].map((l) => `<button type="button" class="chip${l.id === sel ? " on" : ""}" data-khls="${esc(l.id)}">${esc(l.n)} <small>${(l.syms || []).length}</small></button>`).join("")}<button type="button" class="chip kh-add" data-khls="+">＋ ${bi("List mới", "New list")}</button></div>
    <div class="filters kh-lsf"><div class="field"><label for="khLk">${bi("Thêm coin", "Add coin")}</label><input id="khLk" list="plList2" placeholder="VD: SOL" autocomplete="off" autocapitalize="characters"></div><button class="btn" id="khLa">${bi("Thêm", "Add")}</button>
      <span class="kh-lsa">${sel !== "star" ? `<button type="button" class="btn sm" id="khLr">✏️ ${bi("Đổi tên", "Rename")}</button><button type="button" class="btn sm" id="khLd">🗑 ${bi("Xoá list", "Delete list")}</button>` : ""}<button type="button" class="btn sm${khPro() ? "" : " lk"}" id="khLs" ${rows.length ? "" : "disabled"}>🔎 ${bi("Quét tín hiệu cả list", "Scan the list")}${khProTag()}</button></span></div>
    <datalist id="plList2">${COINS.rows.map((r) => `<option value="${esc(r.k)}">${esc(r.n)}</option>`).join("")}</datalist>
    ${rows.length ? `<div class="tw"><table class="rs kh-lt"><thead><tr><th class="l">Coin</th><th>${bi("Giá", "Price")}</th><th>24h</th><th>7 ${bi("ngày", "d")}</th><th>30 ${bi("ngày", "d")}</th><th>${bi("Xu hướng ngày", "Daily trend")}</th><th>${bi("Đánh giá", "Verdict")}</th><th></th></tr></thead><tbody>${rows.map((k) => { const r = BYK[k]; return `<tr><td class="l">${coinLink(k)}</td><td>${px(r.p)}</td><td class="${cls(r.r1)}">${pct(r.r1, 1)}</td><td class="${cls(r.r7)}">${pct(r.r7, 1)}</td><td class="${cls(r.r30)}">${pct(r.r30, 1)}</td><td>${tsPill(r.ts, r.td)}</td><td>${vdPill(r.vd)}</td><td class="kh-la"><a class="btn sm" href="#/plan/${enc(k)}" title="${esc(bi("Lên kế hoạch", "Plan"))}">🧾</a><button type="button" class="btn sm ghost" data-khrm="${esc(k)}" aria-label="${esc(bi("Bỏ khỏi list", "Remove"))}">✕</button></td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">${bi("List này chưa có coin – gõ mã ở ô trên để thêm.", "This list is empty – add a coin above.")}</div>`}
    <div id="khScan"></div></section>`;
  const save = async () => { await WL.save(); };
  $$("[data-khls]", el).forEach((b) => (b.onclick = async () => {
    if (b.dataset.khls !== "+") { lsSet("khls", b.dataset.khls); return khLists(); }
    if (1 + lists.length >= planLim("lists")) { toast(bi(`Gói hiện tại có tối đa ${planLim("lists")} list (gồm ★ Theo dõi) – nâng cấp Pro để thêm`, `Your plan allows ${planLim("lists")} lists`), { type: "warn" }); return; }
    const n = await askText(bi("Tên list mới\n\nVD: Layer 1, Meme, Chờ tích luỹ…", "New list name"), ""); if (!n || !String(n).trim()) return;
    const id = "l" + Date.now().toString(36); WL.lists = [...lists, { id, n: String(n).trim().slice(0, 40), syms: [] }]; lsSet("khls", id); await save(); khLists();
  }));
  const add = async () => {
    const k = ($("#khLk").value || "").trim().toUpperCase(); if (!BYK[k]) { toast(bi("Chọn coin có trong danh sách", "Pick a listed coin"), { type: "warn" }); return; }
    const tot = WL.set.size + lists.reduce((a, l) => a + (l.syms || []).length, 0), lim = ME?.limits?.watch || (khPro() ? 500 : 30);
    if (tot >= lim) { toast(bi(`Gói hiện tại theo dõi tối đa ${lim} mã`, `Up to ${lim} symbols`), { type: "warn" }); return; }
    if (sel === "star") { if (!WL.set.has(k)) WL.set.add(k); } else { L.syms = [...new Set([...(L.syms || []), k])]; }
    await save(); khLists();
  };
  $("#khLa").onclick = add; $("#khLk").addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  $$("[data-khrm]", el).forEach((b) => (b.onclick = async () => { const k = b.dataset.khrm; if (sel === "star") WL.set.delete(k); else L.syms = (L.syms || []).filter((x) => x !== k); await save(); khLists(); }));
  $("#khLr")?.addEventListener("click", async () => { const n = await askText(bi("Đổi tên list", "Rename list"), L.n); if (!n || !String(n).trim()) return; L.n = String(n).trim().slice(0, 40); await save(); khLists(); });
  $("#khLd")?.addEventListener("click", async () => { if (!(await askOk(bi(`Xoá list "${L.n}"?\n\nChỉ xoá list, không ảnh hưởng kế hoạch đã lưu.`, `Delete list "${L.n}"?`)))) return; WL.lists = lists.filter((x) => x !== L); lsSet("khls", "star"); await save(); khLists(); });
  $("#khLs")?.addEventListener("click", () => { if (!khPro()) { $("#khScan").innerHTML = khLockBody("smc").replace(/<p>.*<\/p>/, `<p>${bi("Quét cả list: mỗi coin × 5 cách đánh, biết ngay coin nào đang có tín hiệu / đang tới vùng vào.", "Scan every coin × 5 styles at once.")}</p>`); return; } khScan(rows); });
}
async function khScan(rows) {
  const el = $("#khScan"), ks = rows.slice(0, 40), IJ = await khIJ(), M = KHM.map((x) => x[0]);
  el.innerHTML = `<h3>🔎 ${bi("Tín hiệu theo cách đánh", "Signals by style")} <small class="faint" id="khSp">0/${ks.length}</small></h3><div class="tw"><table class="rs kh-sc"><thead><tr><th class="l">Coin</th>${M.map((m) => `<th>${khLbl(m)}</th>`).join("")}</tr></thead><tbody>${ks.map((k) => `<tr data-k="${esc(k)}"><td class="l">${coinLink(k)}</td>${M.map(() => `<td>…</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="faint">${bi("SMC tuần ở bảng quét dùng nến ngày gộp tuần (nhanh hơn); mở từng coin để xem bản đầy đủ.", "Weekly SMC here uses grouped daily candles.")}</p>`;
  let n = 0;
  for (const k of ks) {
    const tr = el.querySelector(`tr[data-k="${CSS.escape(k)}"]`);
    try {
      const D = await load(`data/c/${enc(k)}.json`); D._ij = IJ; D._wk = { B: D.ohlc?.d ? khWeek(D.ohlc.d) : null, src: bi("nến ngày gộp tuần", "grouped daily") };
      const cells = await Promise.all(M.map(async (m) => { const t = await khBuild(D, m, "auto", 1000).catch(() => null); if (!t) return "—";
        if (m === "dca") return t.none ? "—" : `<a href="#/plan/${enc(k)}" data-khgo="dca">${t.L[0].now ? bi("mua dần từ giá này", "start now") : `${bi("mức 1", "lvl 1")} ${pct((t.L[0].p / t.p - 1) * 100, 0)}`}</a>`;
        if (t.none) return `<span class="faint">—</span>`; const [vt, vc] = VERD[t.verdict] || ["—", ""];
        return `<a href="#/plan/${enc(k)}" data-khgo="${m}" class="pill ${t.forceWatch ? "warn" : vc}">${t.side === "long" ? "L" : "S"} · ${t.forceWatch ? bi("chờ", "wait") : esc(vt.toLowerCase())}</a>`; }));
      if (tr) tr.innerHTML = `<td class="l">${coinLink(k)}</td>${cells.map((c) => `<td>${c}</td>`).join("")}`;
    } catch (e) { if (tr) tr.innerHTML = `<td class="l">${coinLink(k)}</td><td colspan="${M.length}" class="faint">${bi("chưa có dữ liệu", "no data")}</td>`; }
    const sp = $("#khSp"); if (sp) sp.textContent = `${++n}/${ks.length}`;
  }
  el.onclick = (e) => { const a = e.target.closest("[data-khgo]"); if (a) lsSet("pltf", a.dataset.khgo); };
}

// ③ NHẬT KÝ: kết quả kế hoạch + lệnh tay & bài học
async function khLog() {
  const host = $("#khBody"), lg = lsGet("khlg", "plans") === "trades" ? "trades" : "plans";
  host.innerHTML = `<div class="bseg kh-seg" role="tablist">${[["plans", `📊 ${bi("Kết quả kế hoạch", "Plan results")}`], ["trades", `✍️ ${bi("Lệnh tay & bài học", "Trades & lessons")}`]].map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === lg}" data-khlg="${k}" class="${k === lg ? "on" : ""}">${t}</button>`).join("")}</div><div id="khLg"></div>`;
  $$("[data-khlg]", host).forEach((b) => (b.onclick = () => { lsSet("khlg", b.dataset.khlg); khLog(); }));
  return lg === "trades" ? khTrades() : khResults();
}
function khResults() {
  const el = $("#khLg"), Dn = (PF.plans || []).filter((p) => p.done).sort((a, b) => (b.done.at > a.done.at ? 1 : -1));
  if (!Dn.length) { el.innerHTML = `<div class="empty">${bi(`Chưa có kế hoạch nào xong. Kế hoạch ở <a href="#/plan/saved">Đã lưu</a> tự chuyển vào đây khi chạm cắt lỗ, chạm MT2, về hoà vốn sau MT1, hết hạn – hoặc khi anh bấm Đóng.`, "No finished plans yet.")}</div>`; return; }
  const fm = lsGet("khlgm", "all"), F = fm === "all" ? Dn : Dn.filter((p) => planM(p) === fm);
  const st = (A) => { const I = A.filter((p) => KH_IN.has(p.done.o)), R = I.filter((p) => isNum(p.done.r)); return { n: A.length, inN: I.length, win: I.filter((p) => ["t1be", "t2"].includes(p.done.o) || (p.done.o === "manual" && p.done.r > 0)).length, sl: I.filter((p) => p.done.o === "sl").length, avgR: R.length ? R.reduce((a, p) => a + p.done.r, 0) / R.length : null, sumR: R.reduce((a, p) => a + p.done.r, 0) }; };
  const S = st(F), byM = KHM.map(([m]) => [m, st(Dn.filter((p) => planM(p) === m))]).filter(([, s]) => s.n);
  el.innerHTML = `${kpis([[bi("Kế hoạch đã xong", "Finished"), nf(S.n, 0)], [bi("Đã vào lệnh", "Entered"), nf(S.inN, 0)], [bi("Thắng (chạm MT1)", "Won (T1)"), S.inN ? nf((S.win / S.inN) * 100, 0) + "%" : "—"], [bi("Cắt lỗ", "Stopped"), S.inN ? nf((S.sl / S.inN) * 100, 0) + "%" : "—", "down"], [bi("TB mỗi lệnh", "Avg per trade"), isNum(S.avgR) ? `${S.avgR > 0 ? "+" : ""}${nf(S.avgR, 2)}R` : "—", cls(S.avgR)], [bi("Tổng", "Total"), `${S.sumR > 0 ? "+" : ""}${nf(S.sumR, 1)}R`, cls(S.sumR)]], true)}
    <h3>${bi("Theo cách đánh", "By style")}</h3><div class="tw"><table class="rs"><thead><tr><th class="l">${bi("Cách đánh", "Style")}</th><th>${bi("Xong", "Done")}</th><th>${bi("Đã vào", "Entered")}</th><th>${bi("Thắng", "Won")}</th><th>${bi("Cắt lỗ", "Stopped")}</th><th>${bi("TB / lệnh", "Avg")}</th><th>${bi("Tổng", "Total")}</th></tr></thead><tbody>${byM.map(([m, s]) => `<tr><td class="l">${khLbl(m)}</td><td>${s.n}</td><td>${s.inN}</td><td>${s.inN ? nf((s.win / s.inN) * 100, 0) + "%" : "—"}</td><td>${s.inN ? nf((s.sl / s.inN) * 100, 0) + "%" : "—"}</td><td class="${cls(s.avgR)}">${isNum(s.avgR) ? (s.avgR > 0 ? "+" : "") + nf(s.avgR, 2) + "R" : "—"}</td><td class="${cls(s.sumR)}">${s.sumR > 0 ? "+" : ""}${nf(s.sumR, 1)}R</td></tr>`).join("")}</tbody></table></div>
    <div class="bseg kh-fm">${[["all", bi("Tất cả", "All")], ...byM.map(([m]) => [m, khLbl(m)])].map(([k, t]) => `<button type="button" data-khlgm="${k}" class="${fm === k ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="tw"><table class="rs kh-rt"><thead><tr><th class="l">${bi("Ngày xong", "Finished")}</th><th class="l">Coin</th><th>${bi("Cách đánh", "Style")}</th><th>${bi("Chiều", "Side")}</th><th>${bi("Vào / cắt lỗ / MT1", "Entry / stop / T1")}</th><th>${bi("Kết quả", "Result")}</th><th>R</th><th class="l">${bi("Ghi chú", "Note")}</th><th></th></tr></thead><tbody>${F.slice(0, 200).map((p) => { const O = KH_OUT[p.done.o] || ["", p.done.o, ""]; return `<tr><td class="l"><small>${khD(p.done.at)}</small></td><td class="l">${coinLink(p.k)}</td><td>${khLbl(planM(p))}</td><td>${planM(p) === "dca" ? "Spot" : p.side === "short" ? '<b class="down">Short</b>' : '<b class="up">Long</b>'}</td><td><small>${px(p.e)} / <span class="down">${px(p.s)}</span> / <span class="up">${px(p.t1)}</span></small></td><td><span class="pill ${O[2]}">${O[0]} ${O[1]}</span>${p.done.auto ? ` <small class="faint" title="${esc(bi("tự ghi theo giá", "auto from price"))}">⚙</small>` : ""}</td><td class="${cls(p.done.r)}">${isNum(p.done.r) ? (p.done.r > 0 ? "+" : "") + nf(p.done.r, 2) : "—"}</td><td class="l"><small>${esc(p.done.note || p.note || "")}</small></td><td><button type="button" class="btn sm ghost" data-khpdel="${esc(p.id)}" aria-label="${esc(bi("Xoá", "Delete"))}">🗑</button></td></tr>`; }).join("")}</tbody></table></div>
    <p class="faint">${bi("R = lời / lỗ tính theo khoảng cách cắt lỗ của kế hoạch (−1R = chạm cắt lỗ). Kết quả có ⚙ do hệ thống tự ghi theo giá – nếu anh thoát khác kế hoạch, ghi ở tab Lệnh tay & bài học.", "R = result in units of the plan's stop distance. ⚙ = auto-logged from price.")}</p>`;
  $$("[data-khlgm]", el).forEach((b) => (b.onclick = () => { lsSet("khlgm", b.dataset.khlgm); khResults(); }));
  $$("[data-khpdel]", el).forEach((b) => (b.onclick = async () => { if (!(await askOk(bi("Xoá dòng này khỏi Nhật ký?", "Delete this entry?")))) return; PF.plans = PF.plans.filter((p) => p.id !== b.dataset.khpdel); await pfSave(); khResults(); }));
}
function khTrades() {
  const el = $("#khLg"); PF.notes = PF.notes || [];
  const nOf = (ref) => PF.notes.find((n) => n.ref === ref);
  const T = [...(PF.journal || []).map((j) => ({ ref: "pf:" + j.closed, at: j.closed, k: j.k, side: j.side, e: j.entry, x: j.exit, pnl: j.pnl, r: j.r, src: bi("Danh mục", "Portfolio") })),
    ...PF.notes.filter((n) => String(n.ref).startsWith("x:")).map((n) => ({ ref: n.ref, at: n.at, k: n.k, side: n.side, e: n.e, x: n.x, pnl: n.pnl, r: null, src: bi("Ghi tay", "Manual") }))].sort((a, b) => (b.at > a.at ? 1 : -1));
  const stat = (key, list) => { const g = {}; T.forEach((t) => { const n = nOf(t.ref); const v = n?.[key]; if (!v) return; (g[v] = g[v] || []).push(t); }); return list.filter(([k]) => g[k]).map(([k, ic, t]) => { const A = g[k], w = A.filter((x) => x.pnl > 0).length, s = A.reduce((a, x) => a + (x.pnl || 0), 0); return `<tr><td class="l">${ic} ${t}</td><td>${A.length}</td><td>${nf((w / A.length) * 100, 0)}%</td><td class="${cls(s)}">${usd2(s)}</td></tr>`; }).join(""); };
  const sE = stat("emo", KH_EMO), sP = stat("plan", [["y", "✅", bi("Theo kế hoạch", "Followed plan")], ["n", "⚠️", bi("Phá kế hoạch", "Broke plan")], ["-", "➖", bi("Không có kế hoạch", "No plan")]]);
  el.innerHTML = `<div class="kh-tra"><button type="button" class="btn primary" id="khNx">＋ ${bi("Ghi lệnh (sàn khác / ngoài danh mục)", "Log a trade")}</button><small class="faint">${bi(`Lệnh đóng ở <a href="#/portfolio">Danh mục</a> tự hiện ở đây – bấm ✍️ để ghi lý do, cảm xúc, bài học.${can("bot") ? ` Lệnh tay trên Binance ghi chú ở <a href="#/bot/days">Kết quả & sổ lệnh</a>.` : ""}`, "Trades closed in Portfolio appear here automatically.")}</small></div>
    ${T.length ? `<div class="tw"><table class="rs kh-tt"><thead><tr><th class="l">${bi("Ngày", "Date")}</th><th class="l">Coin</th><th>${bi("Chiều", "Side")}</th><th>${bi("Vào → ra", "Entry → exit")}</th><th>${bi("Lãi/lỗ", "P&L")}</th><th>${bi("Cảm xúc", "Mood")}</th><th>${bi("Kế hoạch", "Plan")}</th><th class="l">${bi("Bài học", "Lesson")}</th><th></th></tr></thead><tbody>${T.slice(0, 300).map((t) => { const n = nOf(t.ref), em = KH_EMO.find((x) => x[0] === n?.emo); return `<tr><td class="l"><small>${khD(t.at)}</small><br><small class="faint">${esc(t.src)}</small></td><td class="l">${coinLink(t.k)}</td><td>${t.side === "short" ? '<b class="down">Short</b>' : t.side === "spot" ? "Spot" : '<b class="up">Long</b>'}</td><td><small>${px(t.e)} → ${px(t.x)}</small></td><td class="${cls(t.pnl)}">${usd2(t.pnl)}${isNum(t.r) ? `<br><small>${nf(t.r, 2)}R</small>` : ""}</td><td>${em ? `<span title="${esc(em[2])}">${em[1]}</span>` : "—"}</td><td>${n?.plan === "y" ? "✅" : n?.plan === "n" ? "⚠️" : n?.plan === "-" ? "➖" : "—"}${n?.m ? `<br><small>${khLbl(n.m)}</small>` : ""}</td><td class="l"><small>${esc(n?.les || n?.why || "")}</small></td><td><button type="button" class="btn sm" data-khnt="${esc(t.ref)}">✍️</button></td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">${bi("Chưa có lệnh đã đóng. Đóng vị thế ở Danh mục hoặc bấm ＋ Ghi lệnh để thêm.", "No closed trades yet.")}</div>`}
    ${(sE || sP) ? (khPro() ? `<div class="g g2"><div>${panel(bi("😌 Theo cảm xúc lúc vào", "😌 By mood"), `<div class="tw"><table class="rs"><thead><tr><th class="l">${bi("Cảm xúc", "Mood")}</th><th>${bi("Lệnh", "Trades")}</th><th>${bi("Thắng", "Won")}</th><th>${bi("Lãi/lỗ", "P&L")}</th></tr></thead><tbody>${sE || `<tr><td colspan="4" class="faint">—</td></tr>`}</tbody></table></div>`)}</div><div>${panel(bi("🧭 Theo kế hoạch hay không", "🧭 Plan discipline"), `<div class="tw"><table class="rs"><thead><tr><th class="l"></th><th>${bi("Lệnh", "Trades")}</th><th>${bi("Thắng", "Won")}</th><th>${bi("Lãi/lỗ", "P&L")}</th></tr></thead><tbody>${sP || `<tr><td colspan="4" class="faint">—</td></tr>`}</tbody></table></div>`)}</div></div>`
      : `<div class="kh-lock"><b>📊 ${bi("Thống kê theo cảm xúc & kỷ luật · ★ Pro", "Mood & discipline stats · ★ Pro")}</b><p>${bi("Biết lệnh vào lúc sợ lỡ / gỡ lỗ thắng bao nhiêu %, lệnh theo kế hoạch so với phá kế hoạch chênh nhau bao nhiêu tiền.", "See win rate by mood and plan discipline.")}</p><a class="btn primary" href="#/account">${bi("Xem gói Pro", "See Pro")}</a></div>`) : ""}`;
  $$("[data-khnt]", el).forEach((b) => (b.onclick = async () => { const t = T.find((x) => x.ref === b.dataset.khnt); if (await khNoteSheet(t)) khTrades(); }));
  $("#khNx").onclick = async () => { if (await khNoteSheet(null)) khTrades(); };
}
async function khNoteSheet(t) {
  PF.notes = PF.notes || [];
  const ext = !t, n0 = (t && PF.notes.find((n) => n.ref === t.ref)) || {};
  if (ext && PF.notes.length >= planLim("notes")) { toast(bi(`Gói hiện tại giữ tối đa ${planLim("notes")} ghi chú – nâng cấp Pro để ghi thêm`, `Up to ${planLim("notes")} notes on your plan`), { type: "warn" }); return false; }
  const seg = (id, opts, v) => `<div class="bseg kh-ns" data-id="${id}">${opts.map(([k, ic, tx]) => `<button type="button" data-v="${k}" class="${v === k ? "on" : ""}">${ic} ${tx}</button>`).join("")}</div>`;
  const ok = await iosSheet({ title: ext ? bi("Ghi lệnh mới", "Log a trade") : bi(`Ghi chú lệnh ${esc(t.k)}`, `Note for ${esc(t.k)}`), sub: ext ? "" : `${khD(t.at)} · ${px(t.e)} → ${px(t.x)} · ${usd2(t.pnl)}`,
    body: `<div class="kh-nt">${ext ? `<div class="kh-ng"><label class="field"><span>Coin</span><input id="khNk" list="plListN" autocapitalize="characters" placeholder="SOL"></label><label class="field"><span>${bi("Chiều", "Side")}</span><select id="khNs"><option value="long">Long</option><option value="short">Short</option><option value="spot">Spot</option></select></label>
      <label class="field"><span>${bi("Giá vào", "Entry")}</span><input id="khNe" inputmode="decimal"></label><label class="field"><span>${bi("Giá ra", "Exit")}</span><input id="khNx2" inputmode="decimal"></label><label class="field"><span>${bi("Lãi / lỗ (USDT)", "P&L (USDT)")}</span><input id="khNp" inputmode="decimal" placeholder="-12.5"></label><label class="field"><span>${bi("Ngày đóng", "Closed on")}</span><input id="khNd" type="date" value="${new Date().toISOString().slice(0, 10)}"></label></div>
      <datalist id="plListN">${COINS.rows.slice(0, 600).map((r) => `<option value="${esc(r.k)}">`).join("")}</datalist>` : ""}
      <label class="field"><span>${bi("Cách đánh", "Style")}</span><select id="khNm"><option value="">—</option>${KHM.map(([m, ic, tx]) => `<option value="${m}" ${n0.m === m ? "selected" : ""}>${ic} ${tx}</option>`).join("")}<option value="other" ${n0.m === "other" ? "selected" : ""}>${bi("Khác / cảm tính", "Other")}</option></select></label>
      <div class="field"><span>${bi("Có theo kế hoạch không?", "Did you follow a plan?")}</span>${seg("plan", [["y", "✅", bi("Theo", "Yes")], ["n", "⚠️", bi("Phá kế hoạch", "Broke it")], ["-", "➖", bi("Không có", "None")]], n0.plan)}</div>
      <div class="field"><span>${bi("Cảm xúc lúc vào", "Mood when entering")}</span>${seg("emo", KH_EMO, n0.emo)}</div>
      <label class="field"><span>${bi("Lý do vào", "Why you entered")}</span><textarea id="khNw" rows="2">${esc(n0.why || "")}</textarea></label>
      <label class="field"><span>${bi("Bài học", "Lesson")}</span><textarea id="khNl" rows="2">${esc(n0.les || "")}</textarea></label></div>`,
    ok: bi("Lưu", "Save") });
  if (!ok) return false;
  const q = (s) => document.querySelector(s), segV = (id) => q(`.kh-ns[data-id="${id}"] button.on`)?.dataset.v || "";
  const rec = { ...n0, m: q("#khNm")?.value || "", plan: segV("plan"), emo: segV("emo"), why: (q("#khNw")?.value || "").slice(0, 800), les: (q("#khNl")?.value || "").slice(0, 800), up: new Date().toISOString() };
  if (ext) {
    const k = (q("#khNk")?.value || "").trim().toUpperCase(); if (!k) { toast(bi("Cần mã coin", "Coin required"), { type: "warn" }); return false; }
    Object.assign(rec, { ref: "x:" + Date.now().toString(36), k, side: q("#khNs")?.value || "long", e: numIn(q("#khNe")?.value) || null, x: numIn(q("#khNx2")?.value) || null, pnl: isNum(numIn(q("#khNp")?.value)) ? numIn(q("#khNp")?.value) : null, at: (q("#khNd")?.value || new Date().toISOString().slice(0, 10)) + "T12:00:00Z" });
  } else rec.ref = t.ref;
  PF.notes = [...PF.notes.filter((n) => n.ref !== rec.ref), rec];
  await pfSave(); toast(bi("Đã lưu ghi chú", "Note saved")); return true;
}
document.addEventListener("click", (e) => { const b = e.target.closest(".kh-ns button"); if (!b) return; const g = b.parentElement, was = b.classList.contains("on"); g.querySelectorAll("button").forEach((x) => x.classList.remove("on")); if (!was) b.classList.add("on"); });

// ---------------------------------------------------------------- tab Kế hoạch của trang coin: cách đánh mới dùng chung bộ tính ở đây
async function khCoinTab(D, m, out) {
  if (khLock(m)) { out.innerHTML = khLockBody(m); return; }
  out.innerHTML = skLines(4);
  const t = await khBuild(D, m, "auto", numIn(lsGet("pldca", "")) || Math.round(setting("acct", 10000) * 0.1));
  if (!out.isConnected) return;
  if (m === "dca") { out.innerHTML = khDcaHtml(t); $$("[data-khdca]", out).forEach((b) => (b.onclick = async () => { if (await planSave(JSON.parse(b.dataset.khdca))) { b.disabled = true; b.textContent = bi("Đã lưu ✓", "Saved ✓"); } })); $$(".kh-ch", out).forEach((c) => oppPm(c, BYK[D.row.k]?.p)); return; }
  out.innerHTML = ticketCard(t) + (t.extra ? `<details class="kh-x" open><summary>${m === "smc" ? bi("🏛 Cấu trúc tuần & kiểm chứng", "🏛 Weekly structure & back-test") : bi("📐 Chỉ báo, điều kiện & kiểm chứng", "📐 Indicators & back-test")}</summary>${t.extra}</details>` : "");
  bindTicketSave(out); $$(".kh-ch", out).forEach((c) => oppPm(c, BYK[D.row.k]?.p));
}
