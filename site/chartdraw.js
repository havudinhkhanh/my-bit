/* Công cụ vẽ tay trên biểu đồ (dùng chung my-bit & vn-stock) – tải khi cần.
   Đường xu hướng · tia · đường ngang / dọc · Fibonacci thoái lui · vùng · thước đo · bút vẽ · ghi chú.
   Lưu theo mã trên trình duyệt (toạ độ thời gian + giá → đổi khung thời gian vẫn đúng chỗ). Không đụng tới các đường hệ thống vẽ sẵn. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const COLORS = ["#E0B252", "#5B8DEF", "#2FBF71", "#F0525F", "#B07CF0", "#E8EDF3"];
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
  const ic = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const TOOLS = [
    ["cur", "Con trỏ – chọn, kéo, xoá hình đã vẽ", ic('<path d="M5 3l13 8-6 1.5L9 19z"/>')],
    ["trend", "Đường xu hướng (2 điểm)", ic('<path d="M4 19 20 5"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="5" r="1.6"/>')],
    ["ray", "Tia – kéo dài về bên phải", ic('<path d="M4 17 21 6"/><circle cx="4" cy="17" r="1.6"/><path d="m17 5 4 1-1 4"/>')],
    ["hline", "Đường ngang (1 điểm) – hỗ trợ / kháng cự", ic('<path d="M3 12h18"/><circle cx="12" cy="12" r="1.6"/>')],
    ["vline", "Đường dọc (1 điểm) – đánh dấu ngày / sự kiện", ic('<path d="M12 3v18"/><circle cx="12" cy="12" r="1.6"/>')],
    ["fib", "Fibonacci thoái lui (kéo từ đáy lên đỉnh hoặc ngược lại)", ic('<path d="M3 5h18M3 9.5h18M3 13h18M3 19h18"/><path d="M5 19 19 5" stroke-dasharray="2 2"/>')],
    ["rect", "Vùng giá (hình chữ nhật)", ic('<rect x="4" y="6" width="16" height="12" rx="1"/>')],
    ["measure", "Thước đo – kéo từ điểm vào tới điểm ra: % thay đổi, số nến, lời/lỗ sau phí + trượt giá", ic('<path d="M4 20 20 4"/><path d="m7 17 2 2M10 14l2 2M13 11l2 2M16 8l2 2"/>')],
    ["pen", "Bút vẽ tự do", ic('<path d="M4 20c3-1 4-5 7-6s4 3 6 2 2-6 3-8"/>')],
    ["text", "Ghi chú chữ", ic('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>')],
  ];
  const FS_IC = '<path d="M3 18l5-5 4 3 3-4"/><path d="M15 12l5-5" stroke-dasharray="2 2.2"/><path d="M16.5 6.5H20.5v4"/>';
  const TWO = new Set(["trend", "ray", "fib", "rect", "measure"]);
  // ================================================================ MẪU HÌNH ĐÃ XẢY RA (Fibonacci · tam giác / nêm · Elliott) – tìm lại trên dữ liệu cũ & chấm đúng / sai
  // Mọi mẫu hình đều được tìm bằng cùng một quy tắc cố định (không chọn tay) và chấm kết quả bằng giá SAU khi mẫu hình hoàn thành,
  // nên vừa thấy được lần khớp đẹp, vừa thấy cả lần sai – tỉ lệ đúng mới là con số đáng tin.
  function atrOf(o, n = 14) {
    const N = o.c.length, a = new Array(N).fill(null); let v = null;
    for (let i = 0; i < N; i++) {
      const tr = i ? Math.max(o.h[i] - o.l[i], Math.abs(o.h[i] - o.c[i - 1]), Math.abs(o.l[i] - o.c[i - 1])) : o.h[i] - o.l[i];
      v = v == null ? tr : v + (tr - v) / n; a[i] = v;
    }
    return a;
  }
  function zigzag(o, thr) {
    const h = o.h, l = o.l, N = h.length, P = []; let tr = 0, hi = 0, lo = 0;
    for (let i = 1; i < N; i++) {
      if (tr >= 0 && h[i] >= h[hi]) hi = i;
      if (tr <= 0 && l[i] <= l[lo]) lo = i;
      if (tr === 0) {
        if (h[hi] - l[lo] >= thr[i]) { if (hi < lo) { P.push({ i: hi, p: h[hi], k: "H" }); tr = -1; } else { P.push({ i: lo, p: l[lo], k: "L" }); tr = 1; } }
      } else if (tr === 1) {
        if (i > hi && h[hi] - l[i] >= thr[i]) { P.push({ i: hi, p: h[hi], k: "H" }); tr = -1; lo = i; for (let j = hi + 1; j <= i; j++) if (l[j] <= l[lo]) lo = j; }
      } else if (i > lo && h[i] - l[lo] >= thr[i]) { P.push({ i: lo, p: l[lo], k: "L" }); tr = 1; hi = i; for (let j = lo + 1; j <= i; j++) if (h[j] >= h[hi]) hi = j; }
    }
    return P;
  }
  const FIBL = [0.382, 0.5, 0.618, 0.786];
  function scanPatterns(o) {
    const N = o.c.length; if (N < 60 || !o.h || !o.l) return { items: [], st: {} };
    const A = atrOf(o), med = A.slice(14).sort((a, b) => a - b)[Math.floor((N - 14) / 2)] || A[N - 1];
    const thr = A.map((v) => 2.6 * Math.max(v || med, med * 0.5));
    const P = zigzag(o, thr), items = [];
    // ---- 1) Fibonacci: sóng đẩy A→B rồi điều chỉnh B→C. "Khớp" khi C dừng trong ±3,5% quanh 0,382 / 0,5 / 0,618 / 0,786.
    //      "Đúng" khi sau đó giá vượt lại B trước khi thủng A (xu hướng tiếp diễn). So với điều chỉnh dừng ở chỗ khác để biết Fibonacci có thêm giá trị không.
    const fs = { hit: 0, hitOk: 0, miss: 0, missOk: 0 };
    for (let k = 0; k + 2 < P.length; k++) {
      const a = P[k], b = P[k + 1], c = P[k + 2], up = a.k === "L", leg = Math.abs(b.p - a.p);
      if (leg < 5 * (A[b.i] || med)) continue;
      const r = Math.abs(b.p - c.p) / leg; if (r > 1.05) continue;
      let lv = null, dd = 1; for (const L of FIBL) if (Math.abs(r - L) < dd) { dd = Math.abs(r - L); lv = L; }
      let res = null, end = null;
      for (let j = c.i + 1; j < N; j++) {
        if (up ? o.l[j] < a.p : o.h[j] > a.p) { res = false; end = j; break; }
        if (up ? o.h[j] > b.p : o.l[j] < b.p) { res = true; end = j; break; }
      }
      const near = dd <= 0.035;
      if (res !== null) { if (near) { fs.hit++; if (res) fs.hitOk++; } else { fs.miss++; if (res) fs.missOk++; } }
      if (near) items.push({ k: "fib", a, b, c, up, lv, r, res, end, i0: a.i, i1: end ?? Math.min(N - 1, c.i + Math.round((c.i - a.i) * 0.6)) });
    }
    // ---- 2) Tam giác / nêm (hội tụ) & tam giác mở rộng (ngược): 5 đỉnh/đáy luân phiên nằm gọn giữa 2 đường.
    //      Phá vỡ = giá đóng cửa ra ngoài đường; mục tiêu = chiều cao lúc mở đầu, tính từ điểm phá vỡ. "Đúng" khi chạm mục tiêu trước khi quay lại đường bên kia.
    const ts = { n: 0, ok: 0 };
    const line = (p, q) => { const m = (q.p - p.p) / (q.i - p.i); return (i) => p.p + m * (i - p.i); };
    let lastEnd = -1;
    for (let k = 0; k + 4 < P.length; k++) {
      const w = P.slice(k, k + 5); if (w[0].i <= lastEnd) continue;
      const H = w.filter((x) => x.k === "H"), L = w.filter((x) => x.k === "L");
      const U = line(H[0], H[H.length - 1]), D = line(L[0], L[L.length - 1]);
      const i0 = w[0].i, i4 = w[4].i, len = i4 - i0, at = A[i4] || med;
      if (len < 12) continue;
      const w0 = U(i0) - D(i0), w4 = U(i4) - D(i4);
      if (w0 <= 0 || w4 <= 0) continue;
      const tol = 0.6 * at;
      if (H.some((x) => Math.abs(x.p - U(x.i)) > Math.max(tol, 0.18 * w0)) || L.some((x) => Math.abs(x.p - D(x.i)) > Math.max(tol, 0.18 * w0))) continue;
      let out = 0; for (let j = i0; j <= i4; j++) if (o.c[j] > U(j) + tol || o.c[j] < D(j) - tol) out++;
      if (out > 0.08 * len) continue;
      const conv = w4 / w0;
      const su = (U(i4) - U(i0)) / len / at, sl = (D(i4) - D(i0)) / len / at, fl = 0.025;
      let kind, exp = 0;
      if (conv < 0.62) {
        if (su < -fl && sl > fl) kind = "Tam giác cân";
        else if (Math.abs(su) <= fl && sl > fl) { kind = "Tam giác tăng"; exp = 1; }
        else if (su < -fl && Math.abs(sl) <= fl) { kind = "Tam giác giảm"; exp = -1; }
        else if (su > 0 && sl > 0) { kind = "Nêm tăng"; exp = -1; }
        else if (su < 0 && sl < 0) { kind = "Nêm giảm"; exp = 1; }
        else continue;
      } else if (conv > 1.6) kind = "Tam giác mở rộng (ngược)";
      else continue;
      // phá vỡ trong khoảng 1 lần độ dài mẫu hình (và trước đỉnh tam giác)
      let bi = null, dir = 0;
      for (let j = i4 + 1; j < Math.min(N, i4 + len + 1); j++) {
        if (U(j) - D(j) <= 0) break;
        if (o.c[j] > U(j) + 0.15 * at) { bi = j; dir = 1; break; }
        if (o.c[j] < D(j) - 0.15 * at) { bi = j; dir = -1; break; }
      }
      const it = { k: "tri", kind, exp, U0: { i: H[0].i, p: H[0].p }, U1: { i: i4, p: U(i4) }, D0: { i: L[0].i, p: L[0].p }, D1: { i: i4, p: D(i4) }, piv: w, i0, i1: i4, res: null, bi, dir };
      if (bi != null) {
        const opp = w.filter((x) => x.k === (dir > 0 ? "L" : "H")).pop(), bp = o.c[bi], tgt = bp + dir * (kind.startsWith("Tam giác mở") ? w4 : w0) * 1, stop = opp.p;
        it.tgt = tgt; it.stop = stop; it.bp = bp;
        for (let j = bi + 1; j < N; j++) {
          if (dir > 0 ? o.l[j] < stop : o.h[j] > stop) { it.res = false; it.end = j; break; }
          if (dir > 0 ? o.h[j] >= tgt : o.l[j] <= tgt) { it.res = true; it.end = j; break; }
        }
        if (it.res !== null && exp && dir !== exp) it.res = false;     // phá sai hướng sách vở cũng tính là sai
        it.i1 = it.end ?? bi;
        if (it.res !== null) { ts.n++; if (it.res) ts.ok++; }
      }
      items.push(it); lastEnd = i4;
    }
    // ---- 3) Elliott 5 sóng: đúng 3 quy tắc cứng (sóng 2 không về quá gốc, sóng 3 không ngắn nhất, sóng 4 không chồng sóng 1)
    //      + điểm "khớp" theo tỉ lệ Fibonacci kinh điển. "Đúng" khi sau sóng 5 giá điều chỉnh ≥ 38,2% cả 5 sóng trước khi vượt đỉnh sóng 5 thêm 23,6%.
    const es = { n: 0, ok: 0, bn: 0, bok: 0 }; let eEnd = -1;
    // kết quả sau sóng 5: điều chỉnh ≥ 38,2% cả đoạn 0→5 trước khi vượt đỉnh 5 thêm 23,6% (idx: trả về chỉ số nến, dương = đúng, âm = sai)
    const outcome = (w, s, v, idx) => {
      const tot = v[5] - v[0], back = v[5] - 0.382 * tot, over = v[5] + 0.236 * tot;
      for (let j = w[5].i + 1; j < N; j++) {
        const lo = s > 0 ? o.l[j] : -o.h[j], hi = s > 0 ? o.h[j] : -o.l[j];
        if (hi > over) return idx ? -j : false;
        if (lo <= back) return idx ? j : true;
      }
      return null;
    };
    const near = (x, t, s) => Math.max(0, 1 - Math.abs(x - t) / s);
    for (let k = 0; k + 5 < P.length; k++) {
      const w = P.slice(k, k + 6); if (w[0].i <= eEnd) continue;
      const up = w[0].k === "L", s = up ? 1 : -1, v = w.map((x) => s * x.p);
      const w1 = v[1] - v[0], w3 = v[3] - v[2], w5 = v[5] - v[4];
      const okR = v[2] > v[0] && v[3] > v[1] && v[4] > v[1] && v[5] > v[3] && !(w3 < w1 && w3 < w5);
      if (!okR) { if (v[5] > v[0]) { const r0 = outcome(w, s, v); if (r0 !== null) { es.bn++; if (r0) es.bok++; } } continue; }
      const r2 = (v[1] - v[2]) / w1, e3 = w3 / w1, r4 = (v[3] - v[4]) / w3, e5 = w5 / w1;
      const sc = Math.round(100 * (0.3 * Math.max(near(r2, 0.5, 0.25), near(r2, 0.618, 0.25)) + 0.3 * near(e3, 1.618, 0.8) + 0.2 * Math.max(near(r4, 0.382, 0.2), near(r4, 0.236, 0.15)) + 0.2 * Math.max(near(e5, 1, 0.45), near(e5, 0.618, 0.3))));
      if (sc < 45) continue;
      const tot = v[5] - v[0], back = v[5] - 0.382 * tot;
      const end = outcome(w, s, v, true), res = end == null ? null : end > 0;
      if (res !== null) { es.n++; if (res) es.ok++; }
      items.push({ k: "ell", w, up, sc, r2, e3, r4, e5, res, end: end == null ? null : Math.abs(end), back: s * back, i0: w[0].i, i1: end == null ? w[5].i : Math.abs(end) });
      eEnd = w[5].i;
    }
    items.sort((a, b) => b.i0 - a.i0);
    return { items, st: { fib: fs, tri: ts, ell: es }, piv: P.length };
  }
  // ================================================================ KỊCH BẢN GIÁ TƯƠNG LAI (Elliott · Fibonacci · SMC · xu hướng · dải xác suất)
  // Đường nét đứt = "nếu giá đi đúng cách đếm / cách chơi này thì tới đâu, sai ở mức nào" – minh hoạ có điều kiện, KHÔNG phải dự báo.
  // Cùng một hàm dựng kịch bản cho nến cuối và cho từng thời điểm trong quá khứ (chỉ dùng dữ liệu TRƯỚC thời điểm đó: đỉnh / đáy chỉ tính
  // khi đã được xác nhận, ngưỡng theo ATR nhân quả) → tỉ lệ "chạm mục tiêu trước mức sai" đo trên chính biểu đồ, so với giả dược.
  const SCN = { ell: "Elliott", fib: "Fibonacci", smc: "SMC", trend: "Xu hướng", cone: "Dải xác suất" };
  const SC_CAP = 150;      // mốc cuối đường tối đa (nến) – sóng dài hơn thì nén thời gian, giữ hình dạng
  function zzc(o, mult) {
    const A = atrOf(o), N = A.length, thr = new Array(N); let s = 0;
    for (let i = 0; i < N; i++) { s += A[i]; if (i >= 200) s -= A[i - 200]; thr[i] = mult * Math.max(A[i], 0.5 * (s / Math.min(i + 1, 200))); }
    const h = o.h, l = o.l, P = []; let tr = 0, hi = 0, lo = 0;
    for (let i = 1; i < N; i++) {
      if (tr >= 0 && h[i] >= h[hi]) hi = i;
      if (tr <= 0 && l[i] <= l[lo]) lo = i;
      if (tr === 0) {
        if (h[hi] - l[lo] >= thr[i]) { if (hi < lo) { P.push({ i: hi, p: h[hi], k: "H", ci: i }); tr = -1; } else { P.push({ i: lo, p: l[lo], k: "L", ci: i }); tr = 1; } }
      } else if (tr === 1) {
        if (i > hi && h[hi] - l[i] >= thr[i]) { P.push({ i: hi, p: h[hi], k: "H", ci: i }); tr = -1; lo = i; for (let j = hi + 1; j <= i; j++) if (l[j] <= l[lo]) lo = j; }
      } else if (i > lo && h[i] - l[lo] >= thr[i]) { P.push({ i: lo, p: l[lo], k: "L", ci: i }); tr = 1; hi = i; for (let j = lo + 1; j <= i; j++) if (h[j] >= h[hi]) hi = j; }
    }
    return { P, A };
  }
  // đỉnh / đáy đã xác nhận tới nến e + đỉnh / đáy đang hình thành (tạm, chưa xác nhận)
  function pivAt(Z, o, e) {
    const P = []; for (const p of Z.P) { if (p.ci > e) break; P.push(p); }
    const L = P[P.length - 1]; if (!L) return P;
    let b = -1; for (let i = L.i + 1; i <= e; i++) if (b < 0 || (L.k === "L" ? o.h[i] >= o.h[b] : o.l[i] <= o.l[b])) b = i;
    if (b > L.i) P.push({ i: b, p: L.k === "L" ? o.h[b] : o.l[b], k: L.k === "L" ? "H" : "L", prov: true });
    return P;
  }
  function scMk(kind, last, path, target, stop, why, x = {}) {
    if (!(target > 0) || !(stop > 0) || !isFinite(target) || !isFinite(stop)) return null;
    const up = target > last;
    if ((up && stop >= last) || (!up && stop <= last) || Math.abs(target / last - 1) < 0.003) return null;      // mức sai nằm sai phía / mục tiêu sát giá → bỏ
    if (Math.abs(target - last) < 0.2 * Math.abs(last - stop)) return null;      // lời quá nhỏ so với khoảng tới mức sai (R:R < 0,2) → không đáng gọi là kịch bản
    let end = Math.max(...path.map((q) => q[0])), P = path;
    if (end > SC_CAP) { const f = SC_CAP / end; P = path.map(([b, p]) => [b * f, p]); end = SC_CAP; }
    let pb = -1; P = P.map(([b, p], i) => { const r = i ? Math.max(pb + 1, Math.round(b)) : 0; pb = r; return [r, p]; });
    return { kind, dir: up ? 1 : -1, entry: last, target, stop, rr: Math.abs(target - last) / Math.abs(last - stop), path: P, hz: Math.max(10, Math.round(P[P.length - 1][0] * 1.25)), why, ...x };
  }
  // Elliott: chấm điểm cách đếm theo 3 luật cứng + tỉ lệ Fibonacci kinh điển (như vn-stock)
  function impS(v, up) {
    const s = up ? 1 : -1, p = v.map((x) => s * x), k = p.length - 1, w = [];
    for (let i = 0; i < k; i++) w.push(p[i + 1] - p[i]);
    for (let j = 0; j < k; j++) if ((j % 2 === 0 && w[j] <= 0) || (j % 2 === 1 && w[j] >= 0)) return null;
    if (k >= 2 && p[2] <= p[0]) return null;                 // sóng 2 không về quá gốc sóng 1
    if (k >= 4 && p[4] <= p[1]) return null;                 // sóng 4 không chồng sóng 1
    if (k >= 5 && w[2] < Math.min(w[0], w[4])) return null;  // sóng 3 không ngắn nhất
    let sc = 1; const r2 = -w[1] / w[0];
    if (r2 >= 0.382 && r2 <= 0.786) sc += 1 - Math.abs(r2 - 0.618) * 2;
    if (k >= 3) sc += Math.max(0, 1 - Math.abs(w[2] / w[0] - 1.618) / 1.618);
    if (k >= 4) { const r4 = -w[3] / w[2]; if (r4 >= 0.236 && r4 <= 0.5) sc += 1 - Math.abs(r4 - 0.382) * 3; if ((r2 > 0.5) !== (r4 > 0.5)) sc += 0.3; }
    if (k >= 5) { const e5 = w[4] / w[0]; sc += Math.max(0, 1 - Math.min(Math.abs(e5 - 1), Math.abs(e5 - 0.618))); }
    return sc;
  }
  function abcS(v, down) {
    const s = down ? -1 : 1, p = v.map((x) => s * x), k = p.length - 1, w = [];
    for (let i = 0; i < k; i++) w.push(p[i + 1] - p[i]);
    for (let j = 0; j < k; j++) if ((j % 2 === 0 && w[j] <= 0) || (j % 2 === 1 && w[j] >= 0)) return null;
    const rb = -w[1] / w[0]; if (rb >= 1) return null;
    let sc = 0.8 + Math.max(0, 1 - Math.abs(rb - 0.5) * 2);
    if (k >= 3) { const rc = w[2] / w[0]; sc += Math.max(0, 1 - Math.min(Math.abs(rc - 1), Math.abs(rc - 1.618))); }
    return sc;
  }
  function scEll(o, e, Z) {
    const P = pivAt(Z, o, e); if (P.length < 3) return null;
    { const q = P.length, z = P[q - 1]; if (z.prov && Math.abs(z.p - P[q - 2].p) < 0.236 * Math.abs(P[q - 2].p - P[q - 3].p)) P.pop(); }      // nhịp đang hình thành còn quá nhỏ → chưa tính là 1 sóng
    const n = P.length; if (n < 3) return null;
    const C = [];
    for (const k of [5, 4, 3, 2]) for (const end of [n, n - 1]) {
      const st = end - (k + 1); if (st < 0) continue;
      const seg = P.slice(st, end), up = seg[0].k === "L", sc = impS(seg.map((x) => x.p), up);
      if (sc != null) C.push({ t: "imp", up, k, seg, sc: sc + (end === n ? 0.5 : 0) + k * 0.15 });
    }
    for (const k of [3, 2]) for (const end of [n, n - 1]) {
      const st = end - (k + 1); if (st < 0) continue;
      const seg = P.slice(st, end), down = seg[0].k === "H", sc = abcS(seg.map((x) => x.p), down);
      if (sc != null) C.push({ t: "abc", up: !down, k, seg, sc: sc + (end === n ? 0.5 : 0) });
    }
    C.sort((a, b) => b.sc - a.sc);
    const last = o.c[e], A = Z.A[e];
    for (const c of C) {
      const p = c.seg.map((x) => x.p), I = c.seg.map((x) => x.i), s = c.up ? 1 : -1, since = Math.max(0, e - I[I.length - 1]);
      const L = (a, b) => Math.max(1, I[b] - I[a]), dn = (x) => (s > 0 ? x < last : x > last), upw = (x) => (s > 0 ? x > last : x < last);
      const lab = c.t === "imp" ? ["0", "1", "2", "3", "4", "5"] : ["0", "A", "B", "C"], dv = c.up ? "tăng" : "giảm";
      const pts = c.seg.map((x, i) => ({ i: x.i, p: x.p, lb: lab[i], prov: !!x.prov })), conf = Math.min(1, c.sc / 5.5);
      let r = null;
      if (c.t === "imp") {
        const w1 = p[1] - p[0];
        if (c.k === 2) {        // đang ở sóng 3 (thường dài & mạnh nhất)
          const tg = [p[2] + w1 * 1.618, p[2] + w1 * 2.618].filter(upw); if (!tg.length) continue;
          const t3 = tg[0], d3 = Math.max(5, Math.round(L(0, 1) * 1.4) - since), w4 = t3 - 0.382 * (t3 - p[2]), d4 = Math.max(3, Math.round(d3 * 0.5)), w5 = w4 + w1;
          r = scMk("ell", last, [[0, last], [d3, t3], [d3 + d4, w4], [d3 + d4 + Math.max(5, L(0, 1)), w5]], t3, p[0],
            `Đang ở sóng 3 ${dv} (thường mạnh nhất) – mục tiêu sóng 3 = 1,618 × sóng 1; sau đó chỉnh sóng 4 rồi sóng 5. Sai nếu ${s > 0 ? "thủng" : "vượt"} gốc sóng 1`, { pts, conf, leg: "sóng 3" });
        } else if (c.k === 3) { // đang ở sóng 4 (điều chỉnh) → chờ chỉnh xong rồi sóng 5
          if (!(s > 0 ? last > p[1] : last < p[1])) continue;
          const w3 = p[3] - p[2], t4r = [0.236, 0.382, 0.5].map((f) => p[3] - w3 * f).find((x) => s * (last - x) > last * 0.002), base = t4r ?? last;
          const tgt = s > 0 ? Math.max(base + w1, p[3] + 0.1 * w3) : Math.min(base + w1, p[3] + 0.1 * w3), d4 = Math.max(3, Math.round(L(1, 2)) - since), d5 = Math.max(5, L(0, 1));
          r = scMk("ell", last, t4r != null ? [[0, last], [d4, t4r], [d4 + d5, tgt]] : [[0, last], [d5, tgt]], tgt, p[1],
            `Đang ở sóng 4 (điều chỉnh) trong xu hướng ${dv} – kịch bản ${t4r != null ? "chỉnh tiếp về vùng 0,236–0,5 của sóng 3 rồi " : ""}sóng 5 (≈ sóng 1) vượt ${s > 0 ? "đỉnh" : "đáy"} sóng 3. Sai nếu sóng 4 chồng lên sóng 1`,
            { pts, conf, leg: "sóng 4 → 5", wait: t4r ?? null });
        } else if (c.k === 4) { // đang ở sóng 5 (sóng cuối)
          const tg = [p[4] + w1 * 0.618, p[4] + w1, p[4] + (p[3] - p[0]) * 0.618].filter(upw).sort((a, b) => Math.abs(a - last) - Math.abs(b - last)); if (!tg.length) continue;
          r = scMk("ell", last, [[0, last], [Math.max(5, L(0, 1) - since), tg[0]]], tg[0], p[4],
            `Đang ở sóng 5 ${dv} (sóng cuối) – mục tiêu gần nhất theo tỉ lệ sóng 1; sau sóng 5 thường điều chỉnh. Sai nếu ${s > 0 ? "thủng" : "vượt"} đáy sóng 4`, { pts, conf, leg: "sóng 5" });
        } else {                // đủ 5 sóng → điều chỉnh A-B-C
          const tot = p[5] - p[0], tA = p[5] - tot * 0.382, tC = p[5] - tot * 0.618; if (!dn(tA)) continue;
          const dA = Math.max(5, Math.round(L(0, 5) * 0.25) - since), dB = Math.max(3, Math.round(dA * 0.6)), B = tA + 0.5 * (p[5] - tA);
          r = scMk("ell", last, [[0, last], [dA, tA], [dA + dB, B], [dA + dB + dA, tC]], tA, p[5] + 0.236 * tot,
            `Đã đủ 5 sóng ${dv} → kịch bản điều chỉnh A-B-C về 0,382 – 0,618 cả đoạn. Sai nếu ${s > 0 ? "vượt" : "thủng"} đỉnh sóng 5 thêm 23,6%`, { pts, conf, leg: "A-B-C" });
        }
      } else {
        const a = p[1] - p[0];
        if (c.k === 2) {        // đang ở sóng C của nhịp điều chỉnh
          const tg = [p[2] + a, p[2] + a * 1.618].filter((x) => (c.up ? x > last : x < last)); if (!tg.length) continue;
          r = scMk("ell", last, [[0, last], [Math.max(5, L(0, 1) - since), tg[0]]], tg[0], p[0],
            `Đang ở sóng C của nhịp ${c.up ? "hồi" : "điều chỉnh"} – mục tiêu C = A. Sai nếu ${c.up ? "thủng" : "vượt"} điểm bắt đầu sóng A`, { pts, conf, leg: "sóng C" });
        } else {                // A-B-C có thể xong → quay lại xu hướng chính
          const tg = p[0];
          r = scMk("ell", last, [[0, last], [Math.max(5, Math.round(L(0, 3) * 0.8) - since), tg]], tg, p[3],
            `Nhịp điều chỉnh A-B-C có thể đã xong → kịch bản quay lại xu hướng chính, về lại điểm bắt đầu điều chỉnh. Sai nếu ${c.up ? "vượt" : "thủng"} điểm cuối sóng C`, { pts, conf, leg: "sau A-B-C" });
        }
      }
      if (r) return r;
    }
    return null;
  }
  // Fibonacci: thoái lui / mở rộng của sóng gần nhất (như vn-stock)
  function scFib(o, e, Z) {
    const P = pivAt(Z, o, e); if (P.length < 2) return null;
    const a = P[P.length - 2], b = P[P.length - 1], last = o.c[e], lo = Math.min(a.p, b.p), hi = Math.max(a.p, b.p), rg = hi - lo; if (!(rg > 0)) return null;
    const up = b.k === "H", n = Math.max(5, b.i - a.i), r = (k) => (up ? hi - k * rg : lo + k * rg), x = (k) => (up ? lo + k * rg : hi - k * rg), sw = { a, b, up };
    const E = (path, t, st, why, ex) => scMk("fib", last, path, t, st, why, { sw, ...ex });
    if (up) {
      if (last >= hi) return E([[0, last], [n * 0.8, x(1.272)], [n * 1.3, x(1.618)]], x(1.618), r(0.382), "Vượt đỉnh sóng tăng – mục tiêu mở rộng Fibonacci 1,272 → 1,618; sai nếu về dưới thoái lui 0,382");
      const pos = (hi - last) / rg;
      if (pos < 0.382) return E([[0, last], [n * 0.5, r(0.5)], [n * 1.2, hi], [n * 1.7, x(1.272)]], hi, r(0.786), "Sóng tăng chưa điều chỉnh đủ – kịch bản về vùng 0,5–0,618 rồi quay lại đỉnh, mở rộng 1,272; sai nếu thủng 0,786", { wait: r(0.5) });
      if (pos <= 0.786) return E([[0, last], [n * 0.8, hi], [n * 1.3, x(1.272)]], hi, lo + (r(0.786) - lo) * 0.5, `Đang ở vùng thoái lui ${pos.toFixed(2).replace(".", ",")} của sóng tăng – kịch bản bật lại đỉnh sóng rồi mở rộng 1,272; sai nếu thủng giữa 0,786 và đáy sóng`);
      return E([[0, last], [n * 0.6, lo]], lo, r(0.618), "Đã thủng 0,786 – sóng tăng trước có thể hỏng, kịch bản về đáy sóng; sai nếu lấy lại 0,618");
    }
    if (last <= lo) return E([[0, last], [n * 0.8, x(1.272)], [n * 1.3, x(1.618)]], x(1.618), r(0.382), "Thủng đáy sóng giảm – mục tiêu mở rộng 1,272 → 1,618; sai nếu hồi quá 0,382");
    const pos = (last - lo) / rg;
    if (pos < 0.382) return E([[0, last], [n * 0.6, r(0.382)], [n * 1.2, r(0.618)]], r(0.618), lo - 0.1 * rg, "Sóng giảm – kịch bản hồi kỹ thuật lên 0,382 → 0,618 (thường gặp kháng cự); sai nếu thủng đáy sóng");
    return E([[0, last], [n * 0.6, lo]], lo, r(0.786), `Đã hồi ${pos.toFixed(2).replace(".", ",")} sóng giảm – vùng kháng cự 0,5–0,618, kịch bản quay lại đáy; sai nếu vượt 0,786`);
  }
  // SMC: cấu trúc tăng → về Order Block mua (nếu có) rồi tới thanh khoản phía trên; giảm thì ngược lại
  function scSmc(o, e, smcFn, A) {
    if (!smcFn || e < 60) return null;
    const v = e === o.c.length - 1 ? o : { t: o.t.slice(0, e + 1), o: (o.o || o.c).slice(0, e + 1), h: o.h.slice(0, e + 1), l: o.l.slice(0, e + 1), c: o.c.slice(0, e + 1), v: (o.v || []).slice(0, e + 1) };
    let S = null; try { S = smcFn(v); } catch (er) { S = null; } if (!S || !S.trend) return null;
    const last = o.c[e], a = A[e], n = 20, up = S.trend > 0, s = up ? 1 : -1, pd = S.pd;
    const lq = (S.liq || []).filter((q) => q.kind === (up ? "EQH" : "EQL") && s * (q.p - last) > 0.3 * a).sort((x, y) => Math.abs(x.p - last) - Math.abs(y.p - last))[0];
    let tgt = lq ? lq.p : pd && s * ((up ? pd.hi : pd.lo) - last) > 0.5 * a ? (up ? pd.hi : pd.lo) : last + s * 3 * a;
    tgt = up ? Math.min(tgt, last + 10 * a) : Math.max(tgt, last - 10 * a);
    const ob = (S.obs || []).filter((b) => b.dead == null && b.dir === s && (up ? b.hi < last && b.hi > last - 6 * a : b.lo > last && b.lo < last + 6 * a)).sort((x, y) => (up ? y.hi - x.hi : x.lo - y.lo))[0];
    let stop = ob ? (up ? ob.lo - 0.2 * a : ob.hi + 0.2 * a) : pd ? (up ? pd.lo - 0.2 * a : pd.hi + 0.2 * a) : last - s * 3 * a;
    if (s * (last - stop) < 0.3 * a) stop = last - s * 2 * a;
    const touch = ob && (up ? ob.hi < last - 0.4 * a : ob.lo > last + 0.4 * a), w = touch ? (up ? ob.hi : ob.lo) : null;
    const path = [[0, last]]; if (touch) path.push([Math.round(n * 0.4), w]); path.push([n, tgt]);
    return scMk("smc", last, path, tgt, stop,
      `Cấu trúc ${up ? "tăng" : "giảm"} (BOS / CHoCH gần nhất) – dòng tiền lớn thường kéo tới ${lq ? `thanh khoản ${up ? "đỉnh bằng nhau" : "đáy bằng nhau"}` : up ? "đỉnh vùng giá" : "đáy vùng giá"} ${up ? "phía trên" : "phía dưới"}${touch ? `, sau khi về test Order Block ${up ? "mua" : "bán"}` : ""}; sai nếu ${up ? "thủng" : "vượt"} ${ob ? "Order Block" : up ? "đáy vùng giá" : "đỉnh vùng giá"}`,
      { wait: w, ob: ob ? { i: ob.i, lo: ob.lo, hi: ob.hi } : null, lq: lq ? lq.p : null });
  }
  // Xu hướng (MA50 / MA200): kéo dài đà 60 nến qua, giảm dần một nửa
  function scTrend(o, e, A) {
    const n = 60; if (e < 260) return null;
    let s50 = 0, s200 = 0; for (let i = e - 199; i <= e; i++) { s200 += o.c[i]; if (i > e - 50) s50 += o.c[i]; }
    const m50 = s50 / 50, m200 = s200 / 200, last = o.c[e];
    let sx = 0, sy = 0, sxy = 0, sxx = 0; for (let j = 0; j < n; j++) { const y = Math.log(o.c[e - n + 1 + j]); sx += j; sy += y; sxy += j * y; sxx += j * j; }
    const sl = (n * sxy - sx * sy) / (n * sxx - sx * sx), upt = last > m50 && m50 > m200, dnt = last < m50 && m50 < m200;
    if (!(upt || dnt) || (upt && sl <= 0) || (dnt && sl >= 0)) return null;
    const pts = [[0, last]]; let acc = 0;
    for (let b = 1; b <= n; b++) { acc += sl * (1 - b / (2 * n)); if (b % 15 === 0) pts.push([b, last * Math.exp(acc)]); }
    return scMk("trend", last, pts, pts[pts.length - 1][1], upt ? m50 - A[e] : m50 + A[e],
      `Giá ${upt ? "trên" : "dưới"} MA50 ${upt ? ">" : "<"} MA200 – kéo dài đà ${n} nến qua (giảm dần); sai nếu đóng cửa ${upt ? "dưới" : "trên"} MA50 thêm 1 ATR`, { ma: m50 });
  }
  // Dải xác suất: 2.000 đường mô phỏng ghép từ các khối 5 nến có thật của chính mã (không giả định xu hướng)
  function rng32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function scCone(o, e, H = 120, M = 2000) {
    const s0 = Math.max(1, e - 1000); if (e - s0 < 250) return null;
    const lr = []; for (let i = s0; i <= e; i++) lr.push(Math.log(o.c[i] / o.c[i - 1]));
    // bỏ xu hướng cũ (trừ lợi suất trung bình) · biến động gần đây cao hơn mức dài hạn → nới dải theo √(tỉ lệ), tối đa ×√2,5 (kiểm chứng: khung ngày 82/53, 4 giờ 82/49 – lý tưởng 80/50)
    const L0 = lr.length; let mu = 0; for (const r of lr) mu += r; mu /= L0; let lv = 0; for (const r of lr) lv += (r - mu) * (r - mu); lv = Math.sqrt(lv / L0);
    let ew = lv * lv; for (const r of lr) ew = 0.94 * ew + 0.06 * (r - mu) * (r - mu);
    const fv = Math.sqrt(Math.max(1, Math.min(2.5, Math.sqrt(ew) / (lv || 1)))); for (let i = 0; i < L0; i++) lr[i] = (lr[i] - mu) * fv;
    const NB = lr.length - 4, R = rng32(7 + e), last = o.c[e], Q = [0.1, 0.25, 0.5, 0.75, 0.9], K = H / 5;
    const at = []; for (let b = 5; b <= H; b += 5) at.push(new Float64Array(M));
    for (let m = 0; m < M; m++) { let acc = 0; for (let q = 0; q < K; q++) { const j = Math.floor(R() * NB); for (let z = 0; z < 5; z++) acc += lr[j + z]; at[q][m] = acc; } }
    const bands = at.map((arr, q) => { const srt = Array.from(arr).sort((x, y) => x - y); return [(q + 1) * 5, ...Q.map((f) => last * Math.exp(srt[Math.min(M - 1, Math.floor(f * M))]))]; });
    const pu = (b) => { const arr = at[b / 5 - 1]; if (!arr) return null; let k = 0; for (let m = 0; m < M; m++) if (arr[m] > 0) k++; return (k / M) * 100; };
    return { kind: "cone", entry: last, bands, pu: { 20: pu(20), 60: pu(60), 120: pu(120) } };
  }
  function scenAll(o, e, Z3, Z4, smcFn, cone = true) {
    const S = {};
    try { S.ell = scEll(o, e, Z3); } catch (er) { S.ell = null; }
    try { S.fib = scFib(o, e, Z4); } catch (er) { S.fib = null; }
    try { S.smc = scSmc(o, e, smcFn, Z3.A); } catch (er) { S.smc = null; }
    try { S.trend = scTrend(o, e, Z3.A); } catch (er) { S.trend = null; }
    if (cone) try { S.cone = scCone(o, e); } catch (er) { S.cone = null; }
    return S;
  }
  // 1 = chạm mục tiêu trước, 0 = chạm mức sai trước (cùng nến → tính là sai), -1 = hết hạn, null = chưa đủ nến sau đó để chấm
  function scOut(o, e, en, t, st, dir, hz) {
    const N = o.c.length, T = en * t, S = en * st;
    for (let j = e + 1; j <= Math.min(N - 1, e + hz); j++) {
      if (dir > 0 ? o.l[j] <= S : o.h[j] >= S) return 0;
      if (dir > 0 ? o.h[j] >= T : o.l[j] <= T) return 1;
    }
    return e + hz <= N - 1 ? -1 : null;
  }
  // kiểm chứng trên chính biểu đồ: mỗi vài nến dựng lại kịch bản chỉ bằng dữ liệu trước đó → chấm; giả dược = cùng hướng, cùng khoảng cách %
  // tới mục tiêu / mức sai, cùng hạn, đặt ở 12 thời điểm khác của chính biểu đồ (khử xu hướng chung & độ biến động riêng của mã)
  function scBack(o, Z3, Z4, smcFn) {
    const N = o.c.length, i0 = Math.max(120, Math.floor(N * 0.12)), step = Math.max(2, Math.round((N - i0) / 170)), K = ["ell", "fib", "smc", "trend"];
    const T = { ell: [], fib: [], smc: [], trend: [] }, cn = { n: 0, in80: 0, in50: 0 };
    for (let e = i0; e < N - 3; e += step) {
      const S = scenAll(o, e, Z3, Z4, smcFn, false);
      for (const k of K) { const s = S[k]; if (s && e + s.hz <= N - 1) T[k].push({ e, r: scOut(o, e, o.c[e], s.target / s.entry, s.stop / s.entry, s.dir, s.hz), t: s.target / s.entry, s: s.stop / s.entry, dir: s.dir, hz: s.hz }); }
    }
    for (let e = Math.max(i0, 260); e + 60 < N; e += Math.max(step * 3, 20)) {
      const c = scCone(o, e, 60, 400); if (!c) continue; const b = c.bands[c.bands.length - 1], real = o.c[e + 60];
      cn.n++; if (real >= b[1] && real <= b[5]) cn.in80++; if (real >= b[2] && real <= b[4]) cn.in50++;
    }
    const R = rng32(13), out = { step, cone: cn };
    for (const k of K) {
      const tr = T[k], res = tr.filter((x) => x.r === 0 || x.r === 1); let pn = 0, pk = 0;
      for (const x of tr) for (let q = 0; q < 12; q++) {
        const lim = N - 1 - x.hz; if (lim <= i0) break; const j = i0 + Math.floor(R() * (lim - i0)); if (Math.abs(j - x.e) <= 10) continue;
        const r = scOut(o, j, o.c[j], x.t, x.s, x.dir, x.hz); if (r === 0 || r === 1) { pn++; pk += r; }
      }
      const hit = res.length ? (res.filter((x) => x.r === 1).length / res.length) * 100 : null, pl = pn ? (pk / pn) * 100 : null;
      const rw = tr.length ? (tr.reduce((a, x) => a + Math.abs(x.s - 1) / (Math.abs(x.s - 1) + Math.abs(x.t - 1)), 0) / tr.length) * 100 : null;
      const hz = tr.length ? tr.reduce((a, x) => a + x.hz, 0) / tr.length : 1, neff = Math.min(res.length, (N - i0) / hz);      // số lần ĐỘC LẬP xấp xỉ = số khoảng thời hạn không chồng nhau
      out[k] = { n: tr.length, res: res.length, hit, pl, edge: hit != null && pl != null ? hit - pl : null, rw, exp: tr.filter((x) => x.r === -1).length,
        up: tr.filter((x) => x.dir > 0).length, neff, se: hit != null && neff > 0 ? 100 * Math.sqrt((hit / 100) * (1 - hit / 100) * 2 / neff) : null };
    }
    return out;
  }
  const tnum = (t) => (typeof t === "number" ? t : typeof t === "string" ? Date.parse(t.length <= 10 ? t + "T00:00:00Z" : t) / 1000 : t && t.year ? Date.UTC(t.year, t.month - 1, t.day) / 1000 : NaN);
  const el2 = (tag, at = {}, par) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (par) par.appendChild(e); return e; };
  const dseg = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let u = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(px - ax - u * dx, py - ay - u * dy); };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let OPEN_TB = null;   // thanh công cụ đang mở (chỉ 1 biểu đồ một lúc nhận phím tắt)

  function attach(cfg) {
    const { el, c, s, o } = cfg;
    if (el._cd && el._cd.c === c && el._cd.alive()) { if (cfg.open) el._cd.toggle(true); return el._cd; }
    if (el._cd) el._cd.destroy();
    const fmt = cfg.fmt || ((p) => (Math.abs(p) >= 100 ? p.toFixed(2) : p.toPrecision(5)));
    const nfp = cfg.pct || ((v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%");
    let D = []; try { D = (cfg.get(cfg.key, []) || []).filter((d) => d && d.k && Array.isArray(d.p)); } catch (e) { D = []; }
    const st = { tool: "cur", color: (cfg.get("draw_color", COLORS[0])) || COLORS[0], mag: !!cfg.get("draw_mag", true), hide: false, sel: null, draft: null, drag: null };
    const save = () => { try { cfg.set(cfg.key, D); } catch (e) { /* bỏ qua */ } };
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    // ---- lớp vẽ
    const svg = el2("svg", { class: "cd-svg" }); el.appendChild(svg);
    const tb = document.createElement("div"); tb.className = "cd-tb"; tb.hidden = true;
    tb.innerHTML = TOOLS.map(([k, t, i]) => `<button type="button" data-t="${k}" title="${t}" aria-label="${t}">${i}</button>`).join("")
      + `<span class="cd-sep"></span><button type="button" class="cd-col" data-a="col" title="Màu nét vẽ"><i style="background:${st.color}"></i></button>`
      + `<button type="button" data-a="mag" title="Nam châm – điểm vẽ tự bám vào giá mở / cao / thấp / đóng của nến gần nhất" class="${st.mag ? "on" : ""}">${ic('<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>')}</button>`
      + `<button type="button" data-a="hide" title="Ẩn / hiện hình đã vẽ">${ic('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')}</button>`
      + `<button type="button" data-a="ap" title="Mẫu hình đã xảy ra: tìm lại Fibonacci, tam giác / nêm, Elliott trên dữ liệu cũ và chấm đúng / sai">${ic('<path d="M3 20 9 8l4 7 3-5 5 10"/><path d="M3 20h18"/>')}</button>`
      + (cfg.btn4 ? `<button type="button" data-a="fs" title="Kịch bản giá tương lai: Elliott, Fibonacci, SMC, xu hướng, dải xác suất – vẽ đường đi dự kiến, mục tiêu, mức sai">${ic(FS_IC)}</button>` : "")
      + `<button type="button" data-a="del" title="Xoá hình đang chọn (phím Delete) – không chọn gì thì xoá hết">${ic('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')}</button>`
      + `<div class="cd-pal" hidden>${COLORS.map((x) => `<button type="button" data-c="${x}" style="background:${x}" aria-label="màu ${x}"></button>`).join("")}</div>`;
    el.appendChild(tb);
    const btn = cfg.btn; if (btn) { btn.onclick = (e) => { e.stopPropagation(); toggle(); }; btn.classList.toggle("has", D.length > 0); }
    // ---- đổi toạ độ: thời gian ↔ chỉ số nến (logical) ↔ điểm ảnh
    let N = [], NL = -1, NZ = null, step = 86400;
    const nums = () => { const t = o.t; if (t.length !== NL || t[t.length - 1] !== NZ) { N = t.map(tnum); NL = t.length; NZ = t[t.length - 1]; const d = []; for (let i = Math.max(1, N.length - 30); i < N.length; i++) d.push(N[i] - N[i - 1]); d.sort((a, b) => a - b); step = d[d.length >> 1] || 86400; } return N; };
    const t2l = (t) => { const A = nums(), n = A.length; if (!n) return 0; if (t <= A[0]) return (t - A[0]) / step; if (t >= A[n - 1]) return n - 1 + (t - A[n - 1]) / step; let a = 0, b = n - 1; while (b - a > 1) { const m = (a + b) >> 1; if (A[m] <= t) a = m; else b = m; } return a + (t - A[a]) / ((A[b] - A[a]) || step); };
    const l2t = (L) => { const A = nums(), n = A.length; if (!n) return 0; if (L <= 0) return A[0] + L * step; if (L >= n - 1) return A[n - 1] + (L - n + 1) * step; const a = Math.floor(L); return A[a] + (L - a) * (A[a + 1] - A[a]); };
    const ts = c.timeScale();
    const X = (t) => { const v = ts.logicalToCoordinate(t2l(t)); return v == null ? NaN : v; };
    const Y = (p) => { const v = s.priceToCoordinate(p); return v == null ? NaN : v; };
    const pane = () => { let w = 0, h = 0; try { const ps = c.paneSize ? c.paneSize() : null; if (ps) { w = ps.width; h = ps.height; } } catch (e) { /* phiên bản cũ */ } if (!w) w = ts.width(); if (!h) h = el.clientHeight - (ts.height ? ts.height() : 26); let lw = 0; try { lw = c.priceScale("left").width() || 0; } catch (e) { lw = 0; } return { w, h, lw }; };
    const ptAt = (ev, snap = true) => {
      const R = svg.getBoundingClientRect(), x = ev.clientX - R.left, y = ev.clientY - R.top;
      let L = ts.coordinateToLogical(x), p = s.coordinateToPrice(y);
      if (L == null || p == null) return null;
      if (snap && st.mag && o.h) { const i = Math.round(L); if (i >= 0 && i < o.t.length) { let best = null, bd = 14; for (const q of [o.o?.[i], o.h[i], o.l[i], o.c[i]]) { if (q == null) continue; const d = Math.abs(Y(q) - y); if (d < bd) { bd = d; best = q; } } if (best != null) { p = best; L = i; } } }
      return { t: l2t(L), p: +p, x, y };
    };
    // ---- 💰 thước đo: lời/lỗ nếu vào ở điểm đầu, ra ở điểm cuối – kéo LÊN = Long, kéo XUỐNG = Short; trừ phí 2 chiều + trượt giá 2 chiều (vào & ra đều trượt bất lợi)
    const n2 = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2).replace(".", ","), c2 = (v) => v.toFixed(2).replace(".", ",");
    // cfg.cost (tuỳ trang): fee = phí mỗi chiều %, sell = phí/thuế THÊM ở chiều ra %, slip = trượt giá mỗi chiều %, short = false nếu thị trường không bán khống được
    // (khi đó kéo xuống = mua ở điểm đầu, bán ở điểm cuối → lỗ), amt + unit = quy ra tiền ("USDT trên 1.000").
    const MC = { fee: cfg.cost?.fee ?? cfg.get?.("ms_fee", 0.1) ?? 0.1, sell: cfg.cost?.sell ?? 0, slip: cfg.cost?.slip ?? cfg.get?.("ms_slip", 0.05) ?? 0.05, short: cfg.cost?.short !== false, amt: cfg.cost?.amt || 1000, unit: cfg.cost?.unit || "USDT trên 1.000", unitS: cfg.cost?.unitS || "USDT / 1.000" };
    const msCalc = (p0, p1) => {
      if (cfg.cost === false || !(p0 > 0 && p1 > 0) || p0 === p1) return null;      // cost: false = biểu đồ không giao dịch được (chỉ số) → chỉ đo %, số nến
      const f = MC.fee / 100, fx = (MC.fee + MC.sell) / 100, sp = MC.slip / 100, up = p1 > p0, long = up || !MC.short;
      const net = long ? (p1 * (1 - sp) * (1 - fx)) / (p0 * (1 + sp) * (1 + f)) - 1 : (p0 * (1 - sp) * (1 - f) - p1 * (1 + sp) * (1 + fx)) / p0;
      return { up, long, net, ch: (p1 / p0 - 1) * 100, lab: !MC.short ? "Mua → bán" : up ? "Long" : "Short", fee2: MC.fee * 2 + MC.sell, slip2: MC.slip * 2, amt: net * MC.amt };
    };
    const msHint = MC.short ? "lên = Long, xuống = Short" : "mua ở điểm đầu, bán ở điểm cuối";
    // ---- vẽ
    const lbl = (g, x, y, txt, col, anchor = "start", bg = true, maxW = 0) => {
      const t = el2("text", { x, y, fill: col, "font-size": 10.5, "text-anchor": anchor, "dominant-baseline": "middle", class: "cd-lb" }, g); t.textContent = txt;
      if (maxW) { try { const b = t.getBBox(); if (b.x < 5) t.setAttribute("x", x + 5 - b.x); else if (b.x + b.width > maxW - 5) t.setAttribute("x", x - (b.x + b.width - maxW + 5)); } catch (e) { /* chưa hiển thị */ } }      // nhãn dài (thước đo) không tràn khỏi khung – nhất là trên điện thoại
      if (bg) { try { const b = t.getBBox(); g.insertBefore(el2("rect", { x: b.x - 3, y: b.y - 1, width: b.width + 6, height: b.height + 2, rx: 3, class: "cd-lbg" }), t); } catch (e) { /* chưa hiển thị */ } }
    };
    const render = () => {
      if (!svg.isConnected || !el.isConnected) return cleanup();
      const P = pane(); svg.setAttribute("width", P.w); svg.setAttribute("height", P.h); svg.style.left = P.lw + "px";
      svg.textContent = "";
      const defs = el2("defs", {}, svg), cp = el2("clipPath", { id: "cdc" + uid }, defs); el2("rect", { x: 0, y: 0, width: P.w, height: P.h }, cp);
      const root = el2("g", { "clip-path": `url(#cdc${uid})` }, svg);
      if (AP.on && AP.R) drawAP(root, P);
      if (FS.on) { if (fsN() !== FS.N) { fsCalc(); fsExt(); fsPanel(); } drawFS(root, P); }
      const list = st.hide ? [] : D.slice(); if (QM) list.push(QM); if (st.draft) list.push(st.draft);
      qSync();
      for (const d of list) {
        const g = el2("g", { class: "cd-o" + (d === st.sel ? " sel" : "") }, root), col = d.c || COLORS[0], W = d === st.sel ? 2 : 1.4;
        const pts = d.p.map((q) => ({ x: X(q.t), y: Y(q.p) }));
        if (pts.some((q) => !isFinite(q.x) && d.k !== "hline") || pts.some((q) => !isFinite(q.y) && d.k !== "vline")) continue;
        const [a, b] = pts;
        if (d.k === "trend" || d.k === "ray") {
          let bx = b.x, by = b.y;
          if (d.k === "ray" && (b.x !== a.x || b.y !== a.y)) { const k = (P.w * 4) / Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y)); bx = a.x + (b.x - a.x) * k; by = a.y + (b.y - a.y) * k; }
          el2("line", { x1: a.x, y1: a.y, x2: bx, y2: by, stroke: col, "stroke-width": W }, g);
        } else if (d.k === "hline") {
          el2("line", { x1: 0, y1: a.y, x2: P.w, y2: a.y, stroke: col, "stroke-width": W, "stroke-dasharray": d === st.sel ? "" : "5 3" }, g);
          lbl(g, P.w - 4, a.y - 8, fmt(d.p[0].p), col, "end");
        } else if (d.k === "vline") {
          el2("line", { x1: a.x, y1: 0, x2: a.x, y2: P.h, stroke: col, "stroke-width": W, "stroke-dasharray": "5 3" }, g);
        } else if (d.k === "rect") {
          el2("rect", { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), fill: col, "fill-opacity": 0.12, stroke: col, "stroke-width": W }, g);
        } else if (d.k === "fib") {
          const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), p1 = d.p[0].p, p2 = d.p[1].p;
          el2("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: col, "stroke-width": 1, "stroke-dasharray": "3 3", "stroke-opacity": 0.6 }, g);
          const yy = FIB.map((l) => Y(p2 + (p1 - p2) * l));
          if (isFinite(yy[4]) && isFinite(yy[3])) el2("rect", { x: x1, y: Math.min(yy[3], yy[4]), width: Math.max(1, P.w - x1), height: Math.abs(yy[4] - yy[3]), fill: col, "fill-opacity": 0.1 }, g);
          FIB.forEach((l, i) => { const y = yy[i]; if (!isFinite(y)) return; const key = l === 0.5 || l === 0.618 || l === 0 || l === 1;
            el2("line", { x1, y1: y, x2: Math.max(x2, P.w), y2: y, stroke: col, "stroke-width": key ? 1.3 : 0.9, "stroke-opacity": key ? 0.95 : 0.6 }, g);
            lbl(g, x1 + 4, y - 7, `${String(l).replace(".", ",")} · ${fmt(p2 + (p1 - p2) * l)}`, col, "start", false); });
        } else if (d.k === "measure") {
          const up = d.p[1].p >= d.p[0].p, cc = up ? "#2FBF71" : "#F0525F";
          el2("rect", { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), fill: cc, "fill-opacity": 0.13, stroke: cc, "stroke-width": 1 }, g);
          el2("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: cc, "stroke-width": 1, "stroke-dasharray": "4 3" }, g);
          const bars = Math.round(t2l(d.p[1].t) - t2l(d.p[0].t)), ch = (d.p[1].p / d.p[0].p - 1) * 100;
          el2("circle", { cx: a.x, cy: a.y, r: 3.2, fill: cc, stroke: "var(--surface)", "stroke-width": 1.2 }, g); el2("circle", { cx: b.x, cy: b.y, r: 3.2, fill: "var(--surface)", stroke: cc, "stroke-width": 1.6 }, g);      // ● vào · ○ ra
          if (d.q) continue;      // 📏 đo nhanh: số liệu nằm ở thẻ kết quả (chữ to, đọc được trên điện thoại) – không vẽ nhãn nhỏ
          const top = Math.min(a.y, b.y), bot = Math.max(a.y, b.y), dir = up ? (top - 29 < 8 ? 1 : -1) : (bot + 29 > P.h - 8 ? -1 : 1), yl = (up ? top : bot) + dir * 12;      // sát mép trên / dưới thì lật nhãn vào trong
          lbl(g, (a.x + b.x) / 2, yl, `${nfp(ch)} · ${fmt(d.p[1].p - d.p[0].p)} · ${Math.abs(bars)} nến`, cc, "middle", true, P.w);
          // 💰 lời/lỗ nếu vào ở điểm đầu, ra ở điểm cuối (11/2026, Jason): kéo LÊN = Long, kéo XUỐNG = Short; trừ phí spot 2 chiều + trượt giá 2 chiều
          // (vào bị trượt bất lợi, ra bị trượt bất lợi). Phí / trượt mỗi chiều (%) đổi được: cfg.cost hoặc khoá ms_fee / ms_slip.
          { const M = msCalc(d.p[0].p, d.p[1].p);
            if (M) lbl(g, (a.x + b.x) / 2, yl + dir * 17, P.w < 300 ? `${M.lab} ròng ${n2(M.net * 100)}% · ${n2(M.amt)}` : P.w < 520 ? `${M.lab} · ròng ${n2(M.net * 100)}% · ${n2(M.amt)} ${MC.unitS}` : `${M.lab} · ròng ${n2(M.net * 100)}% sau phí ${c2(M.fee2)}% + trượt ${c2(M.slip2)}% · ${n2(M.amt)} ${MC.unitS}`, M.net >= 0 ? "#2FBF71" : "#F0525F", "middle", true, P.w); }
        } else if (d.k === "pen") {
          el2("polyline", { points: pts.map((q) => `${q.x},${q.y}`).join(" "), fill: "none", stroke: col, "stroke-width": W + 0.4 }, g);
        } else if (d.k === "text") {
          const t = el2("text", { x: a.x, y: a.y, fill: col, "font-size": 12.5, "font-weight": 600, "dominant-baseline": "middle", class: "cd-tx" }, g); t.textContent = d.txt || "";
        }
        if (d === st.sel && d.k !== "pen") pts.forEach((q) => { if (isFinite(q.x) || d.k === "hline") el2("circle", { cx: isFinite(q.x) ? q.x : P.w / 2, cy: isFinite(q.y) ? q.y : P.h / 2, r: 4.5, class: "cd-h", stroke: col }, g); });
      }
    };
    const uid = Math.random().toString(36).slice(2, 8);
    const draw = () => { try { render(); } catch (e) { cleanup(); svg.remove(); tb.remove(); qc.remove(); AP.box?.remove(); FS.box?.remove(); } };
    let rq = 0; const req = () => { if (!rq && !dead) rq = requestAnimationFrame(() => { rq = 0; draw(); }); };
    let pumpT = 0; const pump = (ms = 450) => { const end = performance.now() + ms; pumpT = Math.max(pumpT, end); const f = () => { if (dead) return; draw(); if (performance.now() < pumpT) requestAnimationFrame(f); }; requestAnimationFrame(f); };
    // ---- chọn hình
    const hit = (x, y) => {
      if (st.hide) return null;
      const P = pane();
      for (let k = D.length - 1; k >= 0; k--) {
        const d = D[k], q = d.p.map((z) => ({ x: X(z.t), y: Y(z.p) })), [a, b] = q;
        for (let i = 0; i < q.length && d.k !== "pen"; i++) if (Math.hypot(q[i].x - x, q[i].y - y) < 8) return { d, h: i };
        let ok = false;
        if (d.k === "trend") ok = dseg(x, y, a.x, a.y, b.x, b.y) < 6;
        else if (d.k === "ray") { const kk = (P.w * 4) / Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y)); ok = dseg(x, y, a.x, a.y, a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk) < 6; }
        else if (d.k === "hline") ok = Math.abs(y - a.y) < 6;
        else if (d.k === "vline") ok = Math.abs(x - a.x) < 6;
        else if (d.k === "rect" || d.k === "measure") ok = x >= Math.min(a.x, b.x) - 4 && x <= Math.max(a.x, b.x) + 4 && y >= Math.min(a.y, b.y) - 4 && y <= Math.max(a.y, b.y) + 4;
        else if (d.k === "fib") { const x1 = Math.min(a.x, b.x); ok = x >= x1 - 4 && FIB.some((l) => Math.abs(Y(d.p[1].p + (d.p[0].p - d.p[1].p) * l) - y) < 5); }
        else if (d.k === "pen") for (let i = 1; i < q.length && !ok; i++) ok = dseg(x, y, q[i - 1].x, q[i - 1].y, q[i].x, q[i].y) < 6;
        else if (d.k === "text") ok = x >= a.x - 4 && x <= a.x + 8 * (d.txt || "").length + 8 && Math.abs(y - a.y) < 10;
        if (ok) return { d, h: -1 };
      }
      return null;
    };
    // ---- 📏 ĐO NHANH (11/2026, Jason – dùng được trên điện thoại): bấm nút thước cạnh nút bút → chạm điểm vào, giữ và kéo tới điểm ra (hoặc chạm 2 điểm)
    //      → thẻ kết quả chữ to: Long/Short, % thay đổi, số nến, ròng sau phí + trượt, lời/lỗ trên 1.000 USDT. Không lưu; đo lần mới thay lần cũ; ✕ để xoá.
    let QM = null, qBtn = cfg.btn3 || null;
    const qc = document.createElement("div"); qc.className = "cd-qm"; qc.hidden = true; el.appendChild(qc);
    qc.addEventListener("pointerdown", (e) => e.stopPropagation());
    qc.addEventListener("click", (e) => { if (!e.target.closest("[data-qx]")) return; e.stopPropagation(); QM = null; if (st.quick) setTool("cur"); req(); });
    let qLast = "", qH = 0, qG = null;      // chiều cao thẻ đo + mép dưới chú thích: đo 1 lần mỗi khi nội dung thẻ đổi (trước: đo lại mỗi lần vẽ → ép trình duyệt tính bố cục mỗi khung hình khi rê chuột / kéo)
    const qSync = () => {
      const d = st.draft?.q ? st.draft : QM, on = !!(st.quick || QM); if (qBtn) qBtn.classList.toggle("on", on);
      let h = "";
      if (on) { const M = d ? msCalc(d.p[0].p, d.p[1].p) : null, X_ = `<button type="button" data-qx aria-label="Đóng thước đo">✕</button>`;
        if (!M) h = `<div class="cd-qm-h">📏 <b>Chạm điểm vào</b>, giữ và <b>kéo tới điểm ra</b> · ${msHint} <small>· đã trừ phí ${c2(MC.fee * 2 + MC.sell)}% + trượt ${c2(MC.slip * 2)}%</small></div>${X_}`;
        else { const bars = Math.abs(Math.round(t2l(d.p[1].t) - t2l(d.p[0].t))), cl = M.net >= 0 ? "up" : "down";
          h = `<div class="cd-qm-r"><span><b class="cd-qm-s ${M.up ? "up" : "down"}">${M.lab}</b> giá ${esc(nfp(M.ch))} · ${bars} nến</span><span>Ròng <b class="${cl}">${n2(M.net * 100)}%</b> · <b class="${cl}">${n2(M.amt)}</b> ${esc(MC.unit)}</span><small>${esc(fmt(d.p[0].p))} → ${esc(fmt(d.p[1].p))} · đã trừ phí ${c2(M.fee2)}% + trượt ${c2(M.slip2)}%</small></div>${X_}`; } }
      if (h !== qLast) { qLast = h; qc.innerHTML = h; qc.hidden = !h; qH = 0; qG = null; }
      if (h && d) {      // thẻ nằm ở đáy; điểm đo chạm vùng đáy thì thẻ nhảy lên đầu (không che chỗ đang đo)
        const y0 = Y(d.p[0].p), y1 = Y(d.p[1].p), H = pane().h, ch = qH || (qH = qc.offsetHeight || 76), lo = Math.max(y0, y1), hi = Math.min(y0, y1), T0 = qc.classList.contains("qm-t");
        const cb = lo > H - ch - (T0 ? 4 : 16), ct = hi < (qG ?? (qG = (parseFloat(getComputedStyle(el).getPropertyValue("--clgb")) || (el.classList.contains("has-pxp") ? 38 : 26)) + (el.classList.contains("cd-row1") ? 8 : 40))) + ch + (T0 ? 16 : 4), top = cb && !ct ? true : !cb ? false : y1 > H / 2; if (top !== T0) qc.classList.toggle("qm-t", top);      // cả 2 đầu đều vướng → tránh điểm RA (chỗ ngón tay)
      } else if (!d) qc.classList.remove("qm-t");
    };
    const measure = (b) => { if (b) qBtn = b; if (st.quick && !st.draft) { setTool("cur"); return; } QM = null; setTool("measure"); st.quick = true; OPEN_TB = inst; req(); };      // bấm lần nữa khi đang chờ điểm đầu = thôi đo
    const setTool = (k) => { st.tool = k; st.draft = null; st.quick = false; $$b("[data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === k)); svg.classList.toggle("on", k !== "cur"); req(); };
    const $$b = (q) => [...tb.querySelectorAll(q)];
    const finish = (d) => { st.draft = null; if (d && d.q) { QM = d; setTool("cur"); return; } if (d) { D.push(d); st.sel = d; save(); } if (btn) btn.classList.toggle("has", D.length > 0); setTool("cur"); };
    // ---- bút vẽ khi đang chọn công cụ (lớp phủ nhận chuột)
    svg.addEventListener("pointerdown", (ev) => {
      if (st.tool === "cur") return;
      ev.preventDefault(); ev.stopPropagation();
      const q = ptAt(ev, st.tool !== "pen"); if (!q) return;
      const P0 = { t: q.t, p: q.p };
      if (st.tool === "hline" || st.tool === "vline") return finish({ k: st.tool, p: [P0], c: st.color });
      if (st.tool === "text") return textAt(q);
      if (st.tool === "pen") { st.draft = { k: "pen", p: [P0], c: st.color }; st.drag = { pen: true, lx: q.x, ly: q.y }; svg.setPointerCapture(ev.pointerId); return req(); }
      if (st.draft) { st.draft.p[1] = P0; return finish(st.draft); }
      st.draft = { k: st.tool, p: [P0, { ...P0 }], c: st.color, ...(st.quick ? { q: 1 } : {}) }; st.drag = { two: true, x0: q.x, y0: q.y }; svg.setPointerCapture(ev.pointerId); req();
    });
    svg.addEventListener("pointermove", (ev) => {
      if (st.tool === "cur" || !st.draft) return;
      const q = ptAt(ev, st.tool !== "pen"); if (!q) return;
      if (st.draft.k === "pen") { if (st.drag && Math.hypot(q.x - st.drag.lx, q.y - st.drag.ly) > 2.5) { st.draft.p.push({ t: q.t, p: q.p }); st.drag.lx = q.x; st.drag.ly = q.y; } }
      else st.draft.p[1] = { t: q.t, p: q.p };
      req();
    });
    svg.addEventListener("pointerup", (ev) => {
      if (st.tool === "cur" || !st.draft) return;
      const dr = st.drag; st.drag = null;
      if (st.draft.k === "pen") return finish(st.draft.p.length > 1 ? st.draft : null);
      if (dr && dr.two) { const q = ptAt(ev); if (q && Math.hypot(q.x - dr.x0, q.y - dr.y0) > 6) { st.draft.p[1] = { t: q.t, p: q.p }; finish(st.draft); } }   // kéo-thả xong; bấm-bấm thì chờ điểm 2
    });
    svg.addEventListener("pointercancel", () => { if (st.draft && st.drag) { st.drag = null; st.draft = null; req(); } });
    const textAt = (q) => {
      const inp = document.createElement("input"); inp.className = "cd-in"; inp.placeholder = "Ghi chú… (Enter)";
      const R = svg.getBoundingClientRect(), E = el.getBoundingClientRect();
      Object.assign(inp.style, { left: q.x + R.left - E.left + "px", top: q.y + R.top - E.top - 12 + "px" }); el.appendChild(inp); inp.focus(); setTimeout(() => inp.focus(), 0); let arm = false; setTimeout(() => (arm = true), 250);
      let done = false; const ok = () => { if (done) return; done = true; const v = inp.value.trim(); inp.remove(); finish(v ? { k: "text", p: [{ t: q.t, p: q.p }], c: st.color, txt: v.slice(0, 120) } : null); };
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") ok(); if (e.key === "Escape") { inp.value = ""; ok(); } }; inp.onblur = () => { if (arm) ok(); else setTimeout(() => inp.focus(), 0); };
    };
    // ---- chế độ con trỏ: bấm trúng hình thì chọn / kéo, không thì để biểu đồ kéo như thường
    let grab = false;
    const down = (ev) => {
      if (st.tool !== "cur" || ev.target.closest?.(".cd-tb,.cd-in,.cd-tg,.cbt,.cd-ap") || (ev.button != null && ev.button !== 0)) return;
      const R = svg.getBoundingClientRect(), x = ev.clientX - R.left, y = ev.clientY - R.top;
      if (x < 0 || y < 0 || x > R.width || y > R.height) { if (st.sel) { st.sel = null; req(); } return; }
      const h = hit(x, y);
      if (!h) { if (st.sel) { st.sel = null; req(); } return; }
      grab = true; ev.preventDefault(); ev.stopPropagation();
      st.sel = h.d; openTb(true);
      const orig = h.d.p.map((z) => ({ ...z })), x0 = x, y0 = y, d = h.d;
      const mv = (e) => {
        const dx = e.clientX - R.left - x0, dy = e.clientY - R.top - y0;
        if (h.h >= 0) { const q = ptAt(e); if (q) d.p[h.h] = { t: d.k === "hline" ? orig[h.h].t : q.t, p: d.k === "vline" ? orig[h.h].p : q.p }; }
        else d.p = orig.map((z) => { const L = ts.coordinateToLogical(X(z.t) + dx), p = s.coordinateToPrice(Y(z.p) + dy); return { t: d.k === "hline" || L == null ? z.t : l2t(L), p: d.k === "vline" || p == null ? z.p : +p }; });
        req();
      };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); grab = false; save(); };
      addEventListener("pointermove", mv); addEventListener("pointerup", up); req();
    };
    const block = (ev) => { if (grab) { ev.stopPropagation(); ev.preventDefault(); } };
    el.addEventListener("pointerdown", down, true); el.addEventListener("mousedown", block, true); el.addEventListener("touchstart", block, { capture: true, passive: false });
    // ---- thanh công cụ
    const openTb = (v) => { tb.hidden = !v; if (btn) btn.classList.toggle("on", v); if (v) OPEN_TB = inst; else { setTool("cur"); st.sel = null; } req(); };
    const toggle = (v) => openTb(v ?? tb.hidden);
    tb.addEventListener("pointerdown", (e) => e.stopPropagation());
    tb.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      if (b.dataset.t) return setTool(st.tool === b.dataset.t && b.dataset.t !== "cur" ? "cur" : b.dataset.t);
      if (b.dataset.c) { st.color = b.dataset.c; cfg.set("draw_color", st.color); tb.querySelector(".cd-col i").style.background = st.color; tb.querySelector(".cd-pal").hidden = true; if (st.sel) { st.sel.c = st.color; save(); } return req(); }
      const a = b.dataset.a;
      if (a === "col") tb.querySelector(".cd-pal").hidden = !tb.querySelector(".cd-pal").hidden;
      else if (a === "mag") { st.mag = !st.mag; cfg.set("draw_mag", st.mag); b.classList.toggle("on", st.mag); }
      else if (a === "hide") { st.hide = !st.hide; b.classList.toggle("on", st.hide); req(); }
      else if (a === "ap") apOn(!AP.on);
      else if (a === "fs") fsOn(!FS.on);
      else if (a === "del") {
        if (st.sel) { D = D.filter((d) => d !== st.sel); st.sel = null; }
        else if (D.length && (await askOk(`Xoá hết ${D.length} hình đã vẽ trên biểu đồ này?`))) D = [];
        save(); if (btn) btn.classList.toggle("has", D.length > 0); req();
      }
    });
    const key = (e) => {
      if (OPEN_TB !== inst || !el.isConnected || /input|textarea|select/i.test(document.activeElement?.tagName || "")) return;
      if (e.key === "Escape") { if (st.draft || st.tool !== "cur") { setTool("cur"); e.stopPropagation(); } else if (QM) { QM = null; req(); } else if (st.sel) { st.sel = null; req(); } }
      if ((e.key === "Delete" || e.key === "Backspace") && st.sel) { D = D.filter((d) => d !== st.sel); st.sel = null; save(); if (btn) btn.classList.toggle("has", D.length > 0); req(); e.preventDefault(); }
    };
    document.addEventListener("keydown", key, true);
    // ---- vẽ lại khi biểu đồ thay đổi (cuộn, phóng, đổi kích thước, kéo trục giá)
    const onRange = () => req(), onCross = () => req();
    ts.subscribeVisibleLogicalRangeChange(onRange); c.subscribeCrosshairMove(onCross);
    const ro = new ResizeObserver(() => pump(200)); ro.observe(el);
    const wake = () => pump(); el.addEventListener("wheel", wake, { passive: true }); el.addEventListener("pointerdown", wake); el.addEventListener("pointerup", wake);
    // ---- lớp "mẫu hình đã xảy ra" (tự tìm, không lưu vào hình vẽ của anh)
    const AP = { on: false, R: null, sh: { fib: true, tri: true, ell: true }, focus: null, box: null };
    const CO = { ok: "#2FBF71", bad: "#F0525F", pend: "#8793A4", fib: "#E0B252", tri: "#5B8DEF", ell: "#B07CF0" };
    const XI = (i) => { const v = ts.logicalToCoordinate(i); return v == null ? NaN : v; };
    // bảng mẫu hình / kịch bản: biểu đồ cao cố định (cửa sổ biểu đồ lệnh, toàn màn hình) → nổi đè đáy biểu đồ, thu gọn 1 dòng (chèn xuống dưới sẽ bóp biểu đồ về 0)
    const tight = () => !!el.closest(".occ-p,.cv-fs") || parseFloat(getComputedStyle(el).flexGrow) > 0;
    const hostBox = (box) => { if (tight()) { box.classList.add("cd-ov", "mini"); el.appendChild(box); } else (el.closest(".lwbox") || el).after(box); };
    const ovBtn = (box) => (box?.classList.contains("cd-ov") ? `<button type="button" class="cd-ovt" data-ovt aria-expanded="${!box.classList.contains("mini")}">${box.classList.contains("mini") ? "Chi tiết ▴" : "Thu gọn ▾"}</button>` : "");
    const rc = (it) => (it.res === true ? CO.ok : it.res === false ? CO.bad : CO.pend), rs = (it) => (it.res === true ? "✓" : it.res === false ? "✗" : "…");
    const f2 = (v) => String(+v.toFixed(3)).replace(".", ",");
    function drawAP(root, P) {
      const G = el2("g", { class: "cd-ap-g" }, root);
      for (const it of AP.R.items) {
        if (!AP.sh[it.k]) continue;
        const g = el2("g", { opacity: AP.focus && AP.focus !== it ? 0.22 : 1 }, G), x0 = XI(it.i0), x1 = XI(it.i1);
        if (!isFinite(x0) || !isFinite(x1) || x1 < -40 || x0 > P.w + 40) continue;
        const rcol = rc(it);
        if (it.k === "fib") {
          const { a, b, c } = it, xe = XI(Math.max(it.i1, c.i + 3)), xa = XI(a.i), xc = XI(c.i);
          el2("line", { x1: xa, y1: Y(a.p), x2: XI(b.i), y2: Y(b.p), stroke: CO.fib, "stroke-width": 1, "stroke-dasharray": "3 3", "stroke-opacity": 0.7 }, g);
          for (const L of [0, 0.382, 0.5, 0.618, 0.786, 1]) {
            const y = Y(b.p + (a.p - b.p) * L), hit = L === it.lv;
            el2("line", { x1: xa, y1: y, x2: xe, y2: y, stroke: hit ? rcol : CO.fib, "stroke-width": hit ? 1.8 : 0.8, "stroke-opacity": hit ? 1 : 0.55 }, g);
            if (hit || L === 0 || L === 1) lbl(g, xa + 3, y - 7, f2(L), hit ? rcol : CO.fib, "start", false);
          }
          el2("circle", { cx: xc, cy: Y(c.p), r: 4, fill: rcol, stroke: "var(--surface)", "stroke-width": 1.5 }, g);
          if (it.end != null) el2("line", { x1: xc, y1: Y(c.p), x2: XI(it.end), y2: Y(it.res ? b.p : a.p), stroke: rcol, "stroke-width": 1.2, "stroke-dasharray": "2 3" }, g);
          lbl(g, xc, Y(c.p) + (it.up ? 16 : -16), `${rs(it)} Fib ${f2(it.lv)}`, rcol, "middle");
        } else if (it.k === "tri") {
          const ie = it.bi ?? it.i1, xe = XI(ie), la = (A, B, i) => A.p + (B.p - A.p) * (i - A.i) / ((B.i - A.i) || 1);
          const Ue = la(it.U0, it.U1, ie), De = la(it.D0, it.D1, ie), xu = XI(it.U0.i), xd = XI(it.D0.i);
          el2("polygon", { points: `${xu},${Y(it.U0.p)} ${xe},${Y(Ue)} ${xe},${Y(De)} ${xd},${Y(it.D0.p)}`, fill: CO.tri, "fill-opacity": 0.09, stroke: "none" }, g);
          el2("line", { x1: xu, y1: Y(it.U0.p), x2: xe, y2: Y(Ue), stroke: CO.tri, "stroke-width": 1.5 }, g);
          el2("line", { x1: xd, y1: Y(it.D0.p), x2: xe, y2: Y(De), stroke: CO.tri, "stroke-width": 1.5 }, g);
          if (it.bi != null) {
            const xb = XI(it.bi), yb = Y(it.bp);
            el2("circle", { cx: xb, cy: yb, r: 4, fill: rcol, stroke: "var(--surface)", "stroke-width": 1.5 }, g);
            const xt = XI(it.end ?? Math.min(it.bi + (it.i1 - it.i0), o.t.length - 1));
            el2("line", { x1: xb, y1: Y(it.tgt), x2: Math.max(xt, xb + 20), y2: Y(it.tgt), stroke: rcol, "stroke-width": 1, "stroke-dasharray": "4 3" }, g);
            el2("line", { x1: xb, y1: yb, x2: xb, y2: Y(it.tgt), stroke: rcol, "stroke-width": 1, "stroke-dasharray": "2 3", "stroke-opacity": 0.7 }, g);
            lbl(g, xb + 4, Y(it.tgt) + (it.dir > 0 ? -9 : 9), `${rs(it)} ${it.kind} · phá ${it.dir > 0 ? "lên" : "xuống"}`, rcol);
          } else lbl(g, XI(it.U0.i) + 4, Y(it.U0.p) - 9, `${it.kind} · chưa phá vỡ`, CO.pend);
        } else if (it.k === "ell") {
          const pts = it.w.map((q) => [XI(q.i), Y(q.p)]);
          el2("polyline", { points: pts.map((q) => q.join(",")).join(" "), fill: "none", stroke: CO.ell, "stroke-width": 1.6 }, g);
          it.w.forEach((q, i) => { const [x, y] = pts[i], top = q.k === "H"; el2("circle", { cx: x, cy: y, r: 2.6, fill: CO.ell }, g); if (i) lbl(g, x, y + (top ? -11 : 11), String(i), CO.ell, "middle"); });
          const [x5, y5] = pts[5];
          if (it.end != null) el2("line", { x1: x5, y1: y5, x2: XI(it.end), y2: Y(it.res ? it.back : it.w[5].p), stroke: rcol, "stroke-width": 1.2, "stroke-dasharray": "2 3" }, g);
          lbl(g, pts[0][0] + 4, pts[0][1] + (it.up ? 14 : -14), `${rs(it)} Elliott · khớp ${it.sc}/100`, rcol);
        }
      }
    }
    const dstr = (i) => { const t = tnum(o.t[Math.max(0, Math.min(o.t.length - 1, i))]); return isFinite(t) ? new Date(t * 1000).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit" }) : ""; };
    const pc = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "—");
    function apPanel() {
      if (!AP.on) { AP.box?.remove(); AP.box = null; return; }
      if (!AP.box || !AP.box.isConnected) { AP.box = document.createElement("div"); AP.box.className = "cd-ap"; hostBox(AP.box); AP.box.addEventListener("click", apClick); }
      const S = AP.R.st, f = S.fib, T = S.tri, E = S.ell, it = AP.R.items.filter((x) => AP.sh[x.k]);
      const nm = (x) => (x.k === "fib" ? `Fib ${f2(x.lv)}` : x.k === "tri" ? x.kind : `Elliott ${x.sc}/100`);
      AP.box.innerHTML = `<div class="cd-ap-h"><b>📐 Mẫu hình đã xảy ra trên biểu đồ này</b>${ovBtn(AP.box)}
        ${[["fib", "Fibonacci"], ["tri", "Tam giác / nêm"], ["ell", "Elliott"]].map(([k, n]) => `<button type="button" class="cd-chip ${AP.sh[k] ? "on" : ""}" data-sh="${k}" style="--cc:${CO[k]}">${n}</button>`).join("")}
        <button type="button" class="cd-x" data-x title="Tắt lớp mẫu hình">✕</button></div>
        <div class="cd-ap-s">
          ${AP.sh.fib ? `<p><i style="background:${CO.fib}"></i><span><b>Fibonacci:</b> ${f.hit} lần điều chỉnh dừng sát mức Fib → <b>${f.hitOk} lần</b> giá đi tiếp vượt đỉnh / đáy cũ (<b>${pc(f.hitOk, f.hit)}</b>). Điều chỉnh dừng ở chỗ khác: ${f.missOk}/${f.miss} (${pc(f.missOk, f.miss)}).</span></p>` : ""}
          ${AP.sh.tri ? `<p><i style="background:${CO.tri}"></i><span><b>Tam giác / nêm:</b> ${T.n} lần phá vỡ đã có kết quả → <b>${T.ok} lần</b> chạm mục tiêu sách vở (<b>${pc(T.ok, T.n)}</b>).</span></p>` : ""}
          ${AP.sh.ell ? `<p><i style="background:${CO.ell}"></i><span><b>Elliott 5 sóng:</b> ${E.n} lần đếm đủ 5 sóng → <b>${E.ok} lần</b> sau đó điều chỉnh ≥ 38,2% (<b>${pc(E.ok, E.n)}</b>). Mọi chuỗi 5 nhịp không đúng luật Elliott: ${pc(E.bok, E.bn)}.</span></p>` : ""}
        </div>
        ${it.length ? `<div class="cd-ap-l">${it.slice(0, 40).map((x) => `<button type="button" class="cd-it ${AP.focus === x ? "on" : ""}" data-i="${AP.R.items.indexOf(x)}" style="--rc:${rc(x)}"><b>${rs(x)}</b> ${esc(nm(x))} <small>${dstr(x.i0)}</small></button>`).join("")}</div>` : `<p class="cd-ap-e">Chưa thấy mẫu hình nào trong dữ liệu đang có của khung này – thử khung thời gian dài hơn.</p>`}
        <details class="cd-ap-d"><summary>Cách tìm & chấm đúng / sai</summary><ul>
          <li><b>Chọn đỉnh / đáy</b> tự động: một nhịp mới được tính khi giá đảo chiều ≥ 2,6 lần biên độ trung bình (ATR) – mọi mẫu hình đều tìm bằng cùng quy tắc, không chọn tay.</li>
          <li><b>Fibonacci:</b> sóng đẩy ≥ 5 ATR, điều chỉnh dừng trong ±3,5% quanh 0,382 / 0,5 / 0,618 / 0,786. <span style="color:${CO.ok}">✓</span> khi giá sau đó vượt lại đỉnh (đáy) của sóng đẩy trước khi thủng gốc sóng.</li>
          <li><b>Tam giác / nêm:</b> 5 đỉnh / đáy luân phiên nằm gọn giữa 2 đường hội tụ (hoặc mở rộng). Phá vỡ = giá đóng cửa ra ngoài. <span style="color:${CO.ok}">✓</span> khi chạm mục tiêu = chiều cao lúc mở đầu, trước khi về lại đáy / đỉnh cuối bên kia; nêm & tam giác tăng / giảm phá sai hướng sách vở cũng tính ✗.</li>
          <li><b>Elliott:</b> đủ 3 luật cứng (sóng 2 không về quá gốc, sóng 3 không ngắn nhất, sóng 4 không chồng sóng 1); điểm khớp chấm theo tỉ lệ Fibonacci kinh điển của từng sóng. <span style="color:${CO.ok}">✓</span> khi sau sóng 5 giá điều chỉnh ≥ 38,2% cả đoạn trước khi vượt đỉnh sóng 5 thêm 23,6%.</li>
          <li><b>…</b> = chưa đủ dữ liệu sau mẫu hình để chấm. Nhìn lại quá khứ thì mẫu hình nào cũng dễ thấy "rất khớp" – hãy so tỉ lệ đúng với dòng "chỗ khác / không đúng luật" để biết mẫu hình có thật sự giúp dự đoán hay không.</li></ul></details>`;
    }
    function apClick(e) {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.x != null) return apOn(false);
      if (b.dataset.ovt != null) { AP.box.classList.toggle("mini"); return apPanel(); }
      if (b.dataset.sh) { AP.sh[b.dataset.sh] = !AP.sh[b.dataset.sh]; AP.focus = null; apPanel(); return req(); }
      if (b.dataset.i != null) {
        const x = AP.R.items[+b.dataset.i]; AP.focus = AP.focus === x ? null : x;
        if (AP.focus) { const pad = Math.max(8, Math.round((x.i1 - x.i0) * 0.35)); ts.setVisibleLogicalRange({ from: x.i0 - pad, to: x.i1 + pad }); }
        apPanel(); pump(300);
      }
    }
    function apOn(v) {
      AP.on = v; try { cfg.set("draw_ap", v); } catch (e) { /* bỏ qua */ }
      if (v && !AP.R) AP.R = scanPatterns(o);
      tb.querySelector('[data-a="ap"]')?.classList.toggle("on", v); cfg.btn2?.classList.toggle("on", v);
      AP.focus = null; apPanel(); req();
    }
    // ---- lớp "kịch bản giá tương lai" (tự dựng từ nến đang xem, không lưu vào hình vẽ của anh) – chỉ bật khi trang gọi có nút (cfg.btn4)
    const FS = { on: false, S: null, B: null, N: -1, m: cfg.get("fs_m", "ell") || "ell", box: null, Z3: null, Z4: null, lr0: null, ext: null, as: false, bt: 0 };
    const FSC = { up: "#2FBF71", dn: "#F0525F", stop: "#8793A4", wait: "#E0B252", ell: "#B07CF0", fib: "#E0B252", smc: "#5B8DEF", trend: "#2FBF71", cone: "#5B8DEF" };
    const FSK = ["ell", "fib", "smc", "trend", "cone"].filter((k) => k !== "smc" || cfg.smc);
    const FSWHY = { ell: "chưa có cách đếm sóng nào thoả 3 luật cứng của Elliott", fib: "chưa có sóng đủ lớn để đo Fibonacci", smc: "cấu trúc chưa nghiêng hẳn về bên nào", trend: "giá không nằm gọn trong xu hướng MA50 – MA200 (cần ≥ 260 nến)", cone: "chưa đủ lịch sử (cần ≥ 250 nến)" };
    const fsN = () => o.c.length;
    function fsCalc() {
      const n = fsN(); FS.N = n; FS.S = {};
      if (n < 60 || !o.h || !o.l) return;
      FS.Z3 = zzc(o, 3); FS.Z4 = zzc(o, 4); FS.S = scenAll(o, n - 1, FS.Z3, FS.Z4, cfg.smc);
      if (FS.B && n - FS.bt > 20) FS.B = null;      // đã có thêm nhiều nến mới → kiểm chứng lại
    }
    const fsCur = () => FS.S?.[FS.m] || null;
    function fsExt() {      // khoảng giá cần thấy được (mở rộng trục giá tự co giãn của biểu đồ)
      const S = fsCur(); if (!S) { FS.ext = null; return; }
      const v = S.kind === "cone" ? S.bands.filter((b) => b[0] <= 60).flatMap((b) => [b[1], b[5]]).concat(S.bands.map((b) => b[2]), S.bands.map((b) => b[4])) : [...S.path.map((q) => q[1]), S.target, S.stop, S.wait].filter((x) => x > 0);
      FS.ext = v.length ? [Math.min(...v), Math.max(...v)] : null;
      if (!FS.as) { FS.as = true; let prev = null; try { prev = s.options().autoscaleInfoProvider || null; } catch (e) { prev = null; }
        try { s.applyOptions({ autoscaleInfoProvider: (orig) => { const r0 = prev ? prev(orig) : orig(); if (!FS.on || !FS.ext || !r0?.priceRange) return r0; return { ...r0, priceRange: { minValue: Math.min(r0.priceRange.minValue, FS.ext[0]), maxValue: Math.max(r0.priceRange.maxValue, FS.ext[1]) } }; } }); } catch (e) { /* phiên bản cũ */ } }
    }
    function fsFit() {
      const S = fsCur(); if (!S) return; const n0 = FS.N - 1, fut = S.kind === "cone" ? 120 : S.path[S.path.length - 1][0];
      const span = Math.max(70, Math.round(fut / 0.32)), to = n0 + fut + Math.round(span * 0.12) + 2;      // phần tương lai ≈ 1/3 khung nhìn + chừa chỗ cho cột nhãn giá bên phải
      try { ts.setVisibleLogicalRange({ from: to - span, to }); } catch (e) { /* bỏ qua */ }
    }
    const fsTime = (b) => { const A = nums(); return (A[A.length - 1] || 0) + b * step; };
    const fsDate = (b) => { const t = fsTime(b); if (!isFinite(t)) return ""; const d = new Date(t * 1000), z = (x) => String(x).padStart(2, "0"), dd = `${z(d.getDate())}/${z(d.getMonth() + 1)}`;
      return step >= 86400 ? `${dd}/${z(d.getFullYear() % 100)}` : `${dd} ${z(d.getHours())}:${z(d.getMinutes())}`; };
    const fsDur = (b) => { const sec = b * step, h = sec / 3600; return h < 48 ? `${Math.max(1, Math.round(h))} giờ` : h < 24 * 21 ? `${Math.round(h / 24)} ngày` : h < 24 * 90 ? `${Math.round(h / 24 / 7)} tuần` : `${(h / 24 / 30.4).toFixed(h < 24 * 365 ? 0 : 1).replace(".", ",")} tháng`; };
    const fsPc = (p, e) => nfp((p / e - 1) * 100);
    function drawFS(root, P) {
      const S = fsCur(); if (!S) return;
      const G = el2("g", { class: "cd-fs-g" }, root), n0 = FS.N - 1, x0 = XI(n0), X = (b) => XI(n0 + b);
      if (isFinite(x0) && x0 < P.w) {
        el2("rect", { x: Math.max(0, x0), y: 0, width: Math.max(0, P.w - Math.max(0, x0)), height: P.h, class: "cd-fs-fut" }, G);
        el2("line", { x1: x0, y1: 0, x2: x0, y2: P.h, class: "cd-fs-now" }, G);
      }
      if (S.kind === "cone") {
        const B = [[0, S.entry, S.entry, S.entry, S.entry, S.entry], ...S.bands], pt = (i) => B.map((b) => `${X(b[0])},${Y(b[i])}`);
        el2("polygon", { points: [...pt(5), ...pt(1).reverse()].join(" "), fill: FSC.cone, "fill-opacity": 0.08 }, G);
        el2("polygon", { points: [...pt(4), ...pt(2).reverse()].join(" "), fill: FSC.cone, "fill-opacity": 0.16 }, G);
        el2("polyline", { points: pt(3).join(" "), fill: "none", stroke: FSC.cone, "stroke-width": 1.6, "stroke-dasharray": "5 4" }, G);
        for (const h of P.w < 560 ? [60] : [20, 60, 120]) {      // điện thoại: 1 nhãn cho đỡ chồng const b = S.bands.find((q) => q[0] === h); if (!b) continue; const x = X(h); if (!isFinite(x) || x > P.w + 10) continue;
          el2("line", { x1: x, y1: Y(b[5]), x2: x, y2: Y(b[1]), stroke: FSC.cone, "stroke-opacity": 0.45, "stroke-dasharray": "1 3" }, G);
          lbl(G, x, Y(b[5]) - 9, `80%: ${fmt(b[1])} – ${fmt(b[5])}`, FSC.cone, "middle", true, P.w); }
        return;
      }
      const col = S.dir > 0 ? FSC.up : FSC.dn, bE = S.path[S.path.length - 1][0], xe = X(bE);
      // ngữ cảnh của cách chơi: sóng đã đếm / sóng đo Fibonacci / Order Block
      if (S.kind === "ell" && S.pts) {
        const q = S.pts.map((z) => [XI(z.i), Y(z.p)]);
        el2("polyline", { points: q.map((z) => z.join(",")).join(" "), fill: "none", stroke: FSC.ell, "stroke-width": 1.6 }, G);
        S.pts.forEach((z, i) => { const [x, y] = q[i], top = i > 0 ? z.p > S.pts[i - 1].p : z.p > S.pts[1].p;
          el2("circle", { cx: x, cy: y, r: 3, fill: z.prov ? "var(--surface)" : FSC.ell, stroke: FSC.ell, "stroke-width": 1.4 }, G);
          lbl(G, x, y + (top ? -12 : 12), z.prov ? z.lb + "?" : z.lb, FSC.ell, "middle"); });
      } else if (S.kind === "fib" && S.sw) {
        const { a, b } = S.sw, xa = XI(a.i), xr = Math.max(xe, x0 + 40);
        el2("line", { x1: xa, y1: Y(a.p), x2: XI(b.i), y2: Y(b.p), stroke: FSC.fib, "stroke-width": 1, "stroke-dasharray": "3 3", "stroke-opacity": 0.8 }, G);
        for (const L of [0, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618]) {
          const y = Y(L > 1 ? a.p + (b.p - a.p) * L : b.p + (a.p - b.p) * L);      // 0 … 1 = thoái lui tính từ đỉnh / đáy sóng · 1,272 / 1,618 = mở rộng tính từ gốc sóng
          el2("line", { x1: xa, y1: y, x2: xr, y2: y, stroke: FSC.fib, "stroke-width": 0.8, "stroke-opacity": 0.5 }, G);
          lbl(G, xa + 3, y - 7, f2(L), FSC.fib, "start", false);
        }
      } else if (S.kind === "smc" && S.ob) {
        const xa = XI(S.ob.i), xr = Math.max(xe, x0 + 40);
        el2("rect", { x: xa, y: Y(S.ob.hi), width: Math.max(1, xr - xa), height: Math.max(1, Y(S.ob.lo) - Y(S.ob.hi)), fill: FSC.smc, "fill-opacity": 0.13, stroke: FSC.smc, "stroke-opacity": 0.5 }, G);
        lbl(G, xa + 4, Y(S.ob.hi) - 8, `Order Block ${S.dir > 0 ? "mua" : "bán"}`, FSC.smc, "start");
      }
      // mức giá: mục tiêu · chờ vào · sai nếu (từ bây giờ tới hết đường dự kiến)
      const xr = Math.min(P.w - 4, Math.max(xe + 8, x0 + 60)), hl = (p, c, dash, txt, dy) => { const y = Y(p); if (!isFinite(y)) return;
        el2("line", { x1: x0, y1: y, x2: xr, y2: y, stroke: c, "stroke-width": 1.2, "stroke-dasharray": dash }, G); lbl(G, xr - 2, y + dy, txt, c, "end", true, P.w); };
      const tUp = S.target > S.entry;
      hl(S.target, col, "5 3", `🎯 Mục tiêu ${fmt(S.target)} (${fsPc(S.target, S.entry)})`, tUp ? -9 : 9);
      hl(S.stop, FSC.stop, "2 3", `✕ Sai nếu ${fmt(S.stop)} (${fsPc(S.stop, S.entry)})`, tUp ? 9 : -9);
      if (S.wait) hl(S.wait, FSC.wait, "1 3", `⏳ Chờ vào ${fmt(S.wait)}`, S.wait > S.entry ? -9 : 9);
      // đường đi dự kiến (nét đứt) + điểm mốc
      const q = S.path.map(([b, p]) => [X(b), Y(p)]), pts = q.map((z) => z.join(",")).join(" ");
      el2("polyline", { points: pts, fill: "none", stroke: col, "stroke-width": 6, "stroke-opacity": 0.14, "stroke-linejoin": "round", "stroke-linecap": "round" }, G);
      el2("polyline", { points: pts, fill: "none", stroke: col, "stroke-width": 2.2, "stroke-dasharray": "7 5", "stroke-linejoin": "round", "stroke-linecap": "round" }, G);
      q.forEach(([x, y], i) => { if (i) el2("circle", { cx: x, cy: y, r: i === q.length - 1 ? 4 : 3, fill: i === q.length - 1 ? col : "var(--surface)", stroke: col, "stroke-width": 1.6 }, G); });
      const [xl, yl] = q[q.length - 1], lastUp = S.path[S.path.length - 1][1] >= S.path[S.path.length - 2][1];
      lbl(G, xl, yl + (lastUp ? -14 : 14), `~${fsDate(bE)}`, col, "middle", true, P.w);
    }
    // con số kiểm chứng gộp trên toàn bộ coin (chạy cùng hàm này, 27/11/2026) – để biết kịch bản đáng tin tới đâu, không chỉ trên 1 mã
    const SCG = cfg.scg || null;
    const fsTfKey = () => (step >= 0.9 * 86400 ? "d" : step >= 0.9 * 14400 ? "h4" : "h1");
    const fsTfExact = () => [86400, 14400, 3600].some((x) => Math.abs(step / x - 1) < 0.1);      // khung đang xem trùng khung đã kiểm chứng gộp (ngày / 4 giờ / 1 giờ)
    const fsTfName = { d: "nến ngày", h4: "nến 4 giờ", h1: "nến 1 giờ" };
    // "có / kém lợi thế" chỉ khi đủ số lần độc lập (≥ 30 khoảng thời hạn không chồng nhau) VÀ chênh vượt 2 sai số – 573 coin × 4 cách thì ngẫu nhiên cũng có biểu đồ trông "rất đúng"
    const fsVerdict = (b) => (!b || b.res < 10 || b.edge == null ? ["Ít mẫu", "pend"] : b.neff < 30 ? ["Chưa đủ bằng chứng", "pend"] : b.edge >= 2 * b.se ? ["Có lợi thế trên biểu đồ này", "ok"] : b.edge <= -2 * b.se ? ["Kém hơn ngẫu nhiên", "bad"] : ["Như ngẫu nhiên", "pend"]);
    const p1 = (v) => (v == null ? "—" : v.toFixed(0) + "%"), e1 = (v) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(0));
    function fsPanel() {
      if (!FS.on) { FS.box?.remove(); FS.box = null; return; }
      if (!FS.box || !FS.box.isConnected) { FS.box = document.createElement("div"); FS.box.className = "cd-ap cd-fs"; hostBox(FS.box); FS.box.addEventListener("click", fsClick); }
      const S = FS.S || {}, cur = fsCur(), pro = !cfg.can || cfg.can("backtest"), B = FS.B, tk = fsTfKey(), G0 = SCG?.[tk];
      const chips = FSK.map((k) => `<button type="button" class="cd-chip ${FS.m === k ? "on" : ""}${S[k] ? "" : " off"}" data-fm="${k}" aria-pressed="${FS.m === k}" style="--cc:${FSC[k]}"${S[k] ? "" : ` title="Hiện không dựng được: ${FSWHY[k]}"`}>${SCN[k]}</button>`).join("");
      const kp = (a) => `<div class="cd-fs-k">${a.map(([k, v, c, t]) => `<span${t ? ` title="${esc(t)}"` : ""}><small>${k}</small><b${c ? ` class="${c}"` : ""}>${v}</b></span>`).join("")}</div>`;
      const sum = !FS.box.classList.contains("cd-ov") ? "" : !cur ? `<p class="cd-fs-sum faint">Hiện không dựng được – ${FSWHY[FS.m]}</p>` : cur.kind === "cone"
        ? `<p class="cd-fs-sum">80% · 20 nến: <b>${fmt(cur.bands[3][1])} – ${fmt(cur.bands[3][5])}</b></p>`
        : `<p class="cd-fs-sum"><b class="${cur.dir > 0 ? "up" : "down"}">${cur.dir > 0 ? "▲ Tăng" : "▼ Giảm"}</b> · 🎯 <b>${fmt(cur.target)}</b> <small>${fsPc(cur.target, cur.entry)}</small> · ✕ ${fmt(cur.stop)} <small>${fsPc(cur.stop, cur.entry)}</small>${G0?.[cur.kind] && Math.abs(G0[cur.kind].edge) < 3 ? ` · <span class="faint">không hơn ngẫu nhiên</span>` : ""}</p>`;
      let body = "";
      if (!cur) body = `<p class="cd-ap-e">${SCN[FS.m]}: hiện không dựng được kịch bản rõ ràng – ${FSWHY[FS.m]}.</p>`;
      else if (cur.kind === "cone") {
        const b = (h) => cur.bands.find((q) => q[0] === h), b20 = b(20), b60 = b(60), b120 = b(120);
        body = `<p class="cd-fs-w"><b>Dải xác suất từ chính lịch sử biến động của mã</b> – 2.000 đường mô phỏng ghép từ các đoạn 5 nến có thật, không giả định xu hướng nào.</p>
          ${kp([["80% · 20 nến", `${fmt(b20[1])} – ${fmt(b20[5])}`, "", `≈ ${fsDur(20)} tới: 80% số đường nằm trong khoảng này`], ["50% · 20 nến", `${fmt(b20[2])} – ${fmt(b20[4])}`], ["80% · 60 nến", `${fmt(b60[1])} – ${fmt(b60[5])}`, "", `≈ ${fsDur(60)}`],
            ["80% · 120 nến", b120 ? `${fmt(b120[1])} – ${fmt(b120[5])}` : "—", "", `≈ ${fsDur(120)}`], ["Cao hơn sau 20 nến", p1(cur.pu[20])], ["Cao hơn sau 60 nến", p1(cur.pu[60])]])}
          <p class="cd-fs-v">${pro ? (B ? `Kiểm chứng trên biểu đồ này: giá thật 60 nến sau nằm trong dải 10–90% <b>${p1(B.cone.n ? (B.cone.in80 / B.cone.n) * 100 : null)}</b> số lần (lý tưởng 80%), trong dải 25–75% <b>${p1(B.cone.n ? (B.cone.in50 / B.cone.n) * 100 : null)}</b> (lý tưởng 50%) · ${B.cone.n} lần.` : "Đang kiểm chứng trên chính biểu đồ này…") : fsLock()}
          ${G0?.cone ? `<br><span class="faint">Trên ${G0.cone.coins} coin (${fsTfName[tk]}${fsTfExact() ? "" : " – khung gần nhất đã kiểm chứng"}): trong dải 80% <b>${p1(G0.cone.in80)}</b>, dải 50% <b>${p1(G0.cone.in50)}</b> số lần${G0.cone.in80 < 76 ? " – độ tin cậy thấp ở khung này (lịch sử ngắn), giá hay ra ngoài dải hơn mức mô phỏng" : " – khớp mức lý tưởng 80% / 50%"}.</span>` : ""}</p>
          <p class="faint cd-fs-n">Cách dùng: cắt lỗ đặt ngoài dải 25% nếu không muốn bị quét bởi dao động bình thường; mục tiêu trên dải 75% là kỳ vọng lạc quan.</p>`;
      } else {
        const up = cur.dir > 0, bE = cur.path[cur.path.length - 1][0], bt = B?.[cur.kind], vd = fsVerdict(bt), g = G0?.[cur.kind];
        body = `<p class="cd-fs-w"><b>${SCN[cur.kind]}${cur.leg ? ` · ${cur.leg}` : ""}</b> ${esc(cur.why)}.</p>
          ${kp([["Hướng", up ? "Tăng" : "Giảm", up ? "up" : "down"], ["Mục tiêu", `${fmt(cur.target)} <small>${fsPc(cur.target, cur.entry)}</small>`], ["Sai nếu", `${fmt(cur.stop)} <small>${fsPc(cur.stop, cur.entry)}</small>`],
            ["Lời / lỗ", cur.rr.toFixed(2).replace(".", ",") + "×", "", "Khoảng cách tới mục tiêu ÷ khoảng cách tới mức sai"], ...(cur.wait ? [["Chờ vào", fmt(cur.wait), "", "Kịch bản đi qua vùng này trước khi tới mục tiêu"]] : []),
            ["Mốc cuối đường", `~${fsDate(bE)}`, "", `${bE} nến ≈ ${fsDur(bE)} · hạn kiểm chứng ${cur.hz} nến`]])}
          <p class="cd-fs-v">${pro ? (B ? (bt && bt.n ? `<b>Kiểm chứng trên biểu đồ này</b> (${bt.n} lần dựng lại kịch bản trong quá khứ, mỗi lần chỉ dùng nến trước đó – các lần chồng nhau, ≈ ${Math.round(bt.neff)} lần độc lập): chạm mục tiêu trước mức sai <b>${p1(bt.hit)}</b>${bt.se != null ? ` <small class="faint">±${Math.round(2 * bt.se)}</small>` : ""} · giả dược ${p1(bt.pl)} → <b class="${vd[1] === "ok" ? "up" : vd[1] === "bad" ? "down" : ""}">${e1(bt.edge)} điểm</b> <span class="cd-fs-p ${vd[1]}">${vd[0]}</span>` : "Chưa đủ lịch sử trên biểu đồ này để kiểm chứng.") : "Đang kiểm chứng trên chính biểu đồ này…") : fsLock()}
          ${g ? `<br><span class="faint">Trên ${g.coins} coin (${fsTfName[tk]}${fsTfExact() ? "" : " – khung gần nhất đã kiểm chứng"}, ${g.n.toLocaleString("vi-VN")} lần): trúng ${p1(g.hit)} · giả dược ${p1(g.pl)} (coin khác cùng thời điểm) → ${e1(g.edge)} điểm${Math.abs(g.edge) < 3 ? " – không hơn ngẫu nhiên" : g.edge < 0 ? " – kém hơn ngẫu nhiên" : tk === "d" ? " – nhỉnh hơn ngẫu nhiên một chút" : " – nhỉnh hơn nhưng dữ liệu khung này mới vài tháng (1 giai đoạn thị trường), chưa đủ kết luận"}.</span>` : ""}</p>
          <p class="faint cd-fs-n">Đường nét đứt là "nếu giá đi đúng cách đếm này" – minh hoạ có điều kiện, không phải dự báo hay lời khuyên mua / bán. Dùng để biết trước: kịch bản đúng thì tới đâu, sai ở mức nào thì bỏ.</p>`;
      }
      const tb2 = pro && B ? `<table class="cd-fs-t"><thead><tr><th>Cách</th><th>Lần</th><th>Trúng</th><th>Giả dược</th><th>Chênh</th><th>Kết luận</th></tr></thead><tbody>${["ell", "fib", "smc", "trend"].filter((k) => FSK.includes(k)).map((k) => { const b = B[k], v = fsVerdict(b);
        return `<tr><td>${SCN[k]}</td><td>${b?.n || 0}</td><td>${p1(b?.hit)}</td><td>${p1(b?.pl)}</td><td class="${v[1] === "ok" ? "up" : v[1] === "bad" ? "down" : ""}">${e1(b?.edge)}</td><td><span class="cd-fs-p ${v[1]}">${v[0]}</span></td></tr>`; }).join("")}</tbody></table>` : "";
      FS.box.innerHTML = `<div class="cd-ap-h"><b>🔮 Kịch bản giá tương lai</b>${ovBtn(FS.box)}<button type="button" class="cd-x" data-x title="Tắt lớp kịch bản">✕</button></div><div class="cd-fs-m" role="group" aria-label="Cách dựng kịch bản">${chips}</div>${sum}${body}
        <details class="cd-ap-d"><summary>Kiểm chứng mọi cách & cách dựng</summary>${tb2}<ul>
          <li><b>Kiểm chứng:</b> cứ vài nến lại dựng lại kịch bản chỉ bằng dữ liệu trước thời điểm đó (đỉnh / đáy chỉ dùng khi đã xác nhận), rồi xem giá thật chạm mục tiêu hay mức sai trước (cùng nến → tính là sai). <b>Giả dược</b> = cùng hướng, cùng khoảng cách % tới mục tiêu / mức sai, đặt vào thời điểm ngẫu nhiên khác của chính mã (con số gộp: coin khác ngẫu nhiên ở CÙNG thời điểm, khoảng cách quy theo biến động) → chênh lệch mới là phần cách chơi đóng góp. Các lần kiểm chứng chồng lên nhau nên chỉ kết luận "có lợi thế" khi đủ ≥ 30 lần độc lập và chênh lớn hơn 2 lần sai số; con số gộp trên mọi coin đáng tin hơn con số của riêng 1 biểu đồ.</li>
          <li><b>Elliott:</b> đếm sóng tự động (sóng 2 không về quá gốc, sóng 3 không ngắn nhất, sóng 4 không chồng sóng 1), chọn cách đếm khớp tỉ lệ Fibonacci nhất; mục tiêu theo vị trí sóng hiện tại (sóng 3 = 1,618 × sóng 1, sóng 5 ≈ sóng 1, A-B-C về 0,382–0,618…).</li>
          <li><b>Fibonacci:</b> sóng gần nhất (đỉnh / đáy đổi chiều ≥ 4 ATR) – vị trí giá trong vùng thoái lui quyết định kịch bản bật lại đỉnh, mở rộng 1,272 / 1,618 hay về đáy.</li>
          ${cfg.smc ? `<li><b>SMC:</b> cấu trúc BOS / CHoCH gần nhất – về test Order Block (nếu còn) rồi tới thanh khoản đỉnh / đáy bằng nhau; sai khi thủng Order Block.</li>` : ""}
          <li><b>Xu hướng:</b> giá – MA50 – MA200 cùng chiều → kéo dài đà 60 nến qua, giảm dần một nửa; sai khi đóng cửa qua MA50 thêm 1 ATR.</li>
          <li><b>Dải xác suất:</b> không đoán hướng – cho biết giá thường dao động rộng tới đâu (bỏ xu hướng cũ; biến động gần đây cao hơn bình thường thì nới dải).</li></ul></details>`;
      if (pro && !B && !FS.bq && FS.on) { FS.bq = setTimeout(() => { FS.bq = 0; if (!FS.on || dead) return; try { FS.B = scBack(o, FS.Z3 || zzc(o, 3), FS.Z4 || zzc(o, 4), cfg.smc); FS.bt = fsN(); } catch (er) { FS.B = { cone: { n: 0 } }; } fsPanel(); }, 60); }
    }
    const fsLock = () => `<span class="cd-fs-lk">★ Pro: tỉ lệ kịch bản chạm mục tiêu trước mức sai trên chính biểu đồ này, so với giả dược</span>`;
    function fsClick(e) {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.x != null) return fsOn(false);
      if (b.dataset.ovt != null) { FS.box.classList.toggle("mini"); return fsPanel(); }
      if (b.dataset.fm) { FS.m = b.dataset.fm; try { cfg.set("fs_m", FS.m); } catch (er) { /* bỏ qua */ } fsExt(); fsFit(); fsPanel(); pump(300); }
    }
    function fsOn(v) {
      if (!cfg.btn4) return;
      FS.on = v; try { cfg.set("draw_fs", v); } catch (e) { /* bỏ qua */ }
      if (v) {
        if (!FS.S || FS.N !== fsN()) fsCalc();
        if (!fsCur()) { const k = FSK.find((x) => FS.S[x]); if (k) FS.m = k; }
        try { FS.lr0 = ts.getVisibleLogicalRange(); } catch (e) { FS.lr0 = null; }
        fsExt(); fsFit();
      } else { FS.ext = null; if (FS.lr0) { try { ts.setVisibleLogicalRange(FS.lr0); } catch (e) { /* bỏ qua */ } } FS.lr0 = null; clearTimeout(FS.bq); FS.bq = 0; }
      try { c.priceScale("right").applyOptions({ autoScale: true }); } catch (e) { /* bỏ qua */ }
      tb.querySelector('[data-a="fs"]')?.classList.toggle("on", v); cfg.btn4?.classList.toggle("on", v);
      fsPanel(); pump(300);
    }
    let dead = false;
    function cleanup() { if (dead) return; dead = true; AP.box?.remove(); FS.box?.remove(); clearTimeout(FS.bq); el.removeEventListener("pointerdown", down, true); el.removeEventListener("mousedown", block, true); el.removeEventListener("touchstart", block, true); try { ro.disconnect(); ts.unsubscribeVisibleLogicalRangeChange(onRange); c.unsubscribeCrosshairMove(onCross); } catch (e) { /* biểu đồ đã huỷ */ } document.removeEventListener("keydown", key, true); if (OPEN_TB === inst) OPEN_TB = null; }
    const inst = { c, toggle, render: req, alive: () => svg.isConnected, destroy: () => { cleanup(); svg.remove(); tb.remove(); qc.remove(); AP.box?.remove(); FS.box?.remove(); }, measure, ap: (v) => apOn(v ?? !AP.on), fs: (v) => fsOn(v ?? !FS.on), get count() { return D.length; } };
    el._cd = inst;
    setTool("cur"); draw(); setTimeout(req, 60); setTimeout(req, 400);
    if (cfg.open) openTb(true);
    return inst;
  }
  window.CDRAW = { attach, FS_IC };
})();
