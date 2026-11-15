/* 🐈‍⬛ NA NA – mèo mun quý tộc, mascot của MyBit. Vẽ HOÀN TOÀN bằng hình học (khối đen, mặt cắt tối nhẹ kiểu low-poly, viền vàng), mọi dáng
   (ngồi · liếm lông · đứng / đi · chạy · nằm · cào) là cùng 1 bộ khung → chuyển dáng nội suy liền mạch, không ghép hình, không lộ đường cắt;
   đuôi luôn phe phẩy (cả khi ngồi / nằm). Tính cách: kiêu kì, đanh đá, châm biếm – nhắc kỷ luật, KHÔNG BAO GIỜ khuyên mua / bán.
   Khi Na Na đang hiện: mọi thông báo của app do Na Na "nói" (bóng thoại, bấm được) thay cho thẻ thông báo cũ. Lâu lâu kêu "meo" (nếu bật tiếng). */
(function () {
  if (window.MUN) return;
  const NS = 'xmlns="http://www.w3.org/2000/svg"', NAME = "Na Na";
  const SKINS = [
    { k: "classic", vi: "Cổ điển", en: "Classic", tier: "free" },
    { k: "shades", vi: "Kính râm", en: "Shades", tier: "free" },
    { k: "fedora", vi: "Mũ phớt", en: "Fedora", tier: "pro" },
  ];
  const D2R = Math.PI / 180, f1 = (v) => (Math.round(v * 10) / 10).toString(), lerp = (a, b, t) => a + (b - a) * t;
  // ================================================================ dáng (đơn vị: mặt đất y = 280, mặt hướng phải)
  //  hip / sh: tâm hông / vai · rh / rs: độ dày mông / ngực · head + ha: vị trí & góc đầu · eye: mở mắt · t*: đuôi (góc gốc, độ cong / đốt, biên độ, tần số, dồn sóng về chóp)
  //  legs: P = bàn chân, O = cổ chân (sau) / cổ tay (trước) so với bàn chân, r = góc bàn chân · tg = lưỡi · cl = vuốt
  const LEG = (P, O, r = 0) => ({ P, O, r });
  const PO = {
    stand: { hip: [96, 168], sh: [222, 160], rh: 38, rs: 31, bel: 0.55, head: [286, 98], ha: -6, eye: 1, ta: 232, tk: 9.4, tA: 7, tom: 4.2, tw: 1, tg: 0, cl: 0, tz: 0,
      nh: LEG([84, 280], [-9, -30]), fh: LEG([72, 279], [-9, -30]), nf: LEG([238, 280], [-2, -13]), ff: LEG([226, 279], [-2, -13]) },
    sit: { hip: [112, 238], sh: [186, 132], rh: 44, rs: 29, bel: 0.3, head: [216, 64], ha: 2, eye: 1, ta: 174, tk: 6.8, tA: 11, tom: 2.6, tw: 2.2, tg: 0, cl: 0, tz: 0,
      nh: LEG([170, 280], [-62, -7]), fh: LEG([160, 279], [-60, -7]), nf: LEG([202, 280], [-1, -13]), ff: LEG([189, 279], [-1, -13]) },
    groom: { hip: [112, 238], sh: [186, 134], rh: 44, rs: 29, bel: 0.3, head: [222, 94], ha: 26, eye: 0.3, ta: 174, tk: 6.8, tA: 11, tom: 2.4, tw: 2.2, tg: 1, cl: 0, tz: 0,
      nh: LEG([170, 280], [-62, -7]), fh: LEG([160, 279], [-60, -7]), nf: LEG([238, 112], [-5, 15], -1.25), ff: LEG([189, 279], [-1, -13]) },
    swipe: { hip: [112, 238], sh: [188, 134], rh: 44, rs: 29, bel: 0.3, head: [220, 70], ha: -6, eye: 0.5, ta: 182, tk: 7.5, tA: 18, tom: 7, tw: 1.4, tg: 0, cl: 1, tz: 0,
      nh: LEG([170, 280], [-62, -7]), fh: LEG([160, 279], [-60, -7]), nf: LEG([272, 116], [-17, 7], -0.45), ff: LEG([189, 279], [-1, -13]) },
    sleep: { hip: [108, 252], sh: [210, 247], rh: 42, rs: 31, bel: 0, head: [262, 236], ha: 12, eye: 0, ta: 177, tk: 2.6, tA: 6, tom: 1.4, tw: 2, tg: 0, cl: 0, tz: 0,
      nh: LEG([168, 280], [-58, -6]), fh: LEG([158, 279], [-56, -6]), nf: LEG([264, 280], [-30, -3]), ff: LEG([252, 279], [-28, -3]) },
  };
  const DUR = { stand: 380, sit: 560, groom: 420, swipe: 150, sleep: 900 };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const mix = (a, b, t) => { if (typeof a === "number") return lerp(a, b, t); if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], t)); const o = {}; for (const k in a) o[k] = mix(a[k], b[k], t); return o; };
  // ================================================================ đi / chạy: bàn chân đặt xuống đứng yên, nhấc lên theo cung, đưa ra trước – 4 chân lệch nhịp như mèo thật
  const GAIT = { walk: { S: 64, H: 17, duty: 0.6, bob: 1.3, off: { nh: 0, nf: 0.25, fh: 0.5, ff: 0.75 } }, run: { S: 200, H: 32, duty: 0.34, bob: 7, off: { nh: 0, fh: 0.12, nf: 0.5, ff: 0.62 } } };
  const ik = (ax, ay, bx, by, l1, l2, sg) => { const vx = bx - ax, vy = by - ay; let d = Math.hypot(vx, vy); const m = l1 + l2 - 0.5; if (d > m) { bx = ax + vx / d * m; by = ay + vy / d * m; d = m; } const a = Math.atan2(by - ay, bx - ax), t = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))); return [ax + l1 * Math.cos(a + sg * t), ay + l1 * Math.sin(a + sg * t), bx, by]; };
  const quad = (x1, y1, w1, x2, y2, w2) => { const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a), ny = Math.cos(a), h1 = w1 / 2, h2 = w2 / 2; return `${f1(x1 + nx * h1)},${f1(y1 + ny * h1)} ${f1(x2 + nx * h2)},${f1(y2 + ny * h2)} ${f1(x2 - nx * h2)},${f1(y2 - ny * h2)} ${f1(x1 - nx * h1)},${f1(y1 - ny * h1)}`; };
  const PAW = [[-5, -7], [6, -8], [17, -2], [17, 1], [-5, 1]];
  const pawPts = (x, y, r) => { const c = Math.cos(r), s = Math.sin(r); return PAW.map(([u, v]) => `${f1(x + u * c - v * s)},${f1(y + u * s + v * c)}`).join(" "); };
  // đường cong kín đi qua các điểm (Catmull-Rom → Bézier) → thân mượt, không góc gãy
  const smooth = (p) => { const n = p.length; let d = `M${f1(p[0][0])} ${f1(p[0][1])}`; for (let i = 0; i < n; i++) { const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], e = p[(i + 2) % n]; d += `C${f1(b[0] + (c[0] - a[0]) / 6)} ${f1(b[1] + (c[1] - a[1]) / 6)} ${f1(c[0] - (e[0] - b[0]) / 6)} ${f1(c[1] - (e[1] - b[1]) / 6)} ${f1(c[0])} ${f1(c[1])}`; } return d + "Z"; };
  // ================================================================ hình (1 SVG / con mèo – các phần được cập nhật thuộc tính mỗi khung hình)
  const HEAD = { skull: [[-25, -2], [-21, -13], [-9, -19], [6, -18], [17, -12], [25, -4], [30, 2], [28, 7], [20, 11], [8, 15], [-6, 15], [-18, 11]],
    muz: [[17, -12], [25, -4], [30, 2], [28, 7], [20, 11], [14, 2]], chk: [[-6, 15], [8, 15], [14, 2], [1, 5]],
    e1: [[-23, -9], [-20, -43], [-5, -18]], e1i: [[-18.5, -14], [-18, -35], [-9.5, -18]], e2: [[-4, -18], [9, -46], [18, -11]], e2i: [[-0.5, -19], [9, -38], [13.5, -14]] };
  const pts = (a) => a.map(([x, y]) => `${x},${y}`).join(" ");
  const legEls = (k) => `<g class="lg ${k}"><polygon class="s1"/><polygon class="s2"/><polygon class="s3"/><circle class="j1"/><circle class="j2"/><polygon class="pw"/><path class="cl"/></g>`;
  const accSvg = (skin) => skin === "fedora"
    ? `<g class="acc"><polygon class="ht" points="-31,-11 31,-21 34,-16 -27,-6"/><polygon class="ht" points="-21,-13 -18,-37 -4,-41 3,-37 19,-39 22,-19"/><polygon class="hb" points="-20.5,-17 21.5,-23.5 21,-28 -19.5,-22"/></g>`
    : skin === "shades" ? `<g class="acc"><path class="gr" d="M2 -7 L-15 -6"/><polygon class="gl" points="2,-9 23,-11 22,-2 11,1 3,-3"/><path class="gh" d="M7 -3 L11 -9 M12 -2 L16 -9"/></g>` : "";
  const catSvg = (skin) => `<svg ${NS} class="mun-cat" viewBox="0 -10 345 300" aria-hidden="true">
    <g class="far">${legEls("ff")}${legEls("fh")}</g>
    <g class="tlg"><circle class="b tt"/><polygon class="b tl"/></g>
    <path class="b to"/><ellipse class="b hn"/><polygon class="fc fa"/><polygon class="fc fb"/>
    <g class="near">${legEls("nh")}</g>
    <polygon class="b nk"/><circle class="b nk2"/>${skin === "fedora" ? "" : `<polygon class="col"/><circle class="gem"/>`}
    <g class="hd">${skin === "fedora" ? "" : `<polygon class="b" points="${pts(HEAD.e1)}"/><polygon class="fc" points="${pts(HEAD.e1i)}"/><polygon class="b ear2" points="${pts(HEAD.e2)}"/><polygon class="fc ear2" points="${pts(HEAD.e2i)}"/>`}
      <polygon class="b" points="${pts(HEAD.skull)}"/><polygon class="fc" points="${pts(HEAD.muz)}"/><polygon class="fc fc2" points="${pts(HEAD.chk)}"/>
      <polygon class="ey"/><path class="pu"/><path class="lsh"/><path class="tg"/>${accSvg(skin)}</g>
    <g class="near">${legEls("nf")}</g></svg>`;
  function bind(svg) {
    const q = (s) => svg.querySelector(s), R = { svg, tlg: q(".tlg"), front: false, tl: q(".tl"), tt: q(".tt"), to: q(".to"), hn: q(".hn"), fa: q(".fa"), fb: q(".fb"), nk: q(".nk"), nk2: q(".nk2"), col: q(".col"), gem: q(".gem"), hd: q(".hd"), ey: q(".ey"), pu: q(".pu"), lsh: q(".lsh"), tg: q(".tg"), ear2: [...svg.querySelectorAll(".ear2")] };
    svg.querySelectorAll(".lg").forEach((g) => { const k = [...g.classList].find((c) => c !== "lg"); R[k] = { s1: g.querySelector(".s1"), s2: g.querySelector(".s2"), s3: g.querySelector(".s3"), j1: g.querySelector(".j1"), j2: g.querySelector(".j2"), pw: g.querySelector(".pw"), cl: g.querySelector(".cl") }; });
    return R;
  }
  const sa = (el, k, v) => el && el.setAttribute(k, v);
  // vẽ 1 khung hình: P = dáng (đã nội suy), X = { wk: mức đang đi 0..1, rn: mức chạy, c: pha bước, t: thời gian, blink, earTw, gaitOn }
  function render(R, P, X) {
    const W = GAIT.walk, U = GAIT.run, rn = X.rn || 0, wk = X.wk || 0, gl = (a, b) => lerp(a, b, rn), TAU = Math.PI * 2, c = X.c || 0, t = X.t || 0;
    const br = 1 + 0.012 * Math.sin(t * 1.5) * (1 - wk), bob = wk * gl(W.bob * Math.cos(2 * TAU * c), U.bob * Math.sin(TAU * c)), pit = wk * gl(1.6 * Math.sin(TAU * c), 4.5 * Math.sin(TAU * c + 0.8));
    const mid = [(P.hip[0] + P.sh[0]) / 2, (P.hip[1] + P.sh[1]) / 2], rot = ([x, y]) => { const a = pit * D2R, X0 = x - mid[0], Y0 = y - mid[1]; return [mid[0] + X0 * Math.cos(a) - Y0 * Math.sin(a), mid[1] + X0 * Math.sin(a) + Y0 * Math.cos(a) + bob]; };
    const H = rot(P.hip), Sh = rot(P.sh), Hd = rot(P.head), rh = P.rh * br, rs = P.rs * br;
    let ux = Sh[0] - H[0], uy = Sh[1] - H[1]; const L = Math.hypot(ux, uy); ux /= L; uy /= L; const nx = uy, ny = -ux;      // u: hông → vai, n: hướng lưng
    const at = (p, a, b) => [p[0] + ux * a + nx * b, p[1] + uy * a + ny * b], M = [(H[0] + Sh[0]) / 2, (H[1] + Sh[1]) / 2];
    // thân: mông – lưng (võng nhẹ) – vai – ức – bụng thon – đùi
    R.to.setAttribute("d", smooth([at(H, -rh * 1.0, rh * 0.15), at(H, -rh * 0.3, rh * 0.86), at(M, 0, rs * 1.0), at(Sh, -rs * 0.25, rs * 1.0), at(Sh, rs * 0.95, -rs * 0.05), at(Sh, rs * 0.25, -rs * 1.12), at(M, 0, -rs * (1.15 - P.bel * 0.55)), at(H, rh * 0.35, -rh * 0.95)]));
    const ang = Math.atan2(uy, ux) / D2R, hc = at(H, 4, -rh * 0.12);
    sa(R.hn, "cx", f1(hc[0])); sa(R.hn, "cy", f1(hc[1])); sa(R.hn, "rx", f1(rh * 1.04)); sa(R.hn, "ry", f1(rh * 0.84)); sa(R.hn, "transform", `rotate(${f1(ang)} ${f1(hc[0])} ${f1(hc[1])})`);
    sa(R.fa, "points", [at(Sh, -rs * 0.15, rs * 0.82), at(Sh, rs * 0.78, rs * 0.08), at(Sh, rs * 0.28, -rs * 0.62)].map((p) => p.map(f1).join(",")).join(" "));      // mặt cắt vai
    sa(R.fb, "points", [at(H, -rh * 0.1, rh * 0.72), at(H, rh * 0.55, -rh * 0.08), at(H, -rh * 0.2, -rh * 0.62)].map((p) => p.map(f1).join(",")).join(" "));      // mặt cắt đùi
    // cổ + vòng cổ vàng
    const ha = P.ha + (P.tg > 0.5 ? 3.2 * Math.sin(t * 15) * P.tg : 0), hr = ha * D2R, hp = (x, y) => [Hd[0] + x * Math.cos(hr) - y * Math.sin(hr), Hd[1] + x * Math.sin(hr) + y * Math.cos(hr)];
    const nb = at(Sh, rs * 0.32, rs * 0.45), ne = hp(-13, 8);
    sa(R.nk, "points", quad(nb[0], nb[1], rs * 1.35, ne[0], ne[1], 26)); sa(R.nk2, "cx", f1(ne[0])); sa(R.nk2, "cy", f1(ne[1])); sa(R.nk2, "r", "13");
    if (R.col) { const cp = [lerp(nb[0], ne[0], 0.55), lerp(nb[1], ne[1], 0.55)], na = Math.atan2(ne[1] - nb[1], ne[0] - nb[0]), w = lerp(rs * 1.35, 26, 0.55) / 2 + 1.5, px = -Math.sin(na), py = Math.cos(na), dx = Math.cos(na) * 2.6, dy = Math.sin(na) * 2.6;
      sa(R.col, "points", [[cp[0] + px * w - dx, cp[1] + py * w - dy], [cp[0] + px * w + dx, cp[1] + py * w + dy], [cp[0] - px * w + dx, cp[1] - py * w + dy], [cp[0] - px * w - dx, cp[1] - py * w - dy]].map((p) => p.map(f1).join(",")).join(" "));
      sa(R.gem, "cx", f1(cp[0] + px * w)); sa(R.gem, "cy", f1(cp[1] + py * w)); sa(R.gem, "r", "3.4"); }
    // đầu: xoay theo góc; tai trước giật nhẹ thỉnh thoảng; mắt vàng hạnh nhân, đồng tử dọc
    sa(R.hd, "transform", `translate(${f1(Hd[0])} ${f1(Hd[1])}) rotate(${f1(ha)})`);
    R.ear2.forEach((e) => e.setAttribute("transform", `rotate(${f1(X.earTw || 0)} 6 -15)`));
    const o = Math.max(0, P.eye * (1 - (X.blink || 0)));
    if (o > 0.12) { sa(R.ey, "points", `4,-4 11,${f1(-4 - 4.6 * o)} 19.5,-6.5 12,${f1(-4 + 1.8 * o)}`); sa(R.pu, "d", `M12 ${f1(-4 - 3.6 * o)}L12.4 ${f1(-4 + 1.2 * o)}`); sa(R.lsh, "d", ""); }
    else { sa(R.ey, "points", ""); sa(R.pu, "d", ""); sa(R.lsh, "d", "M4 -4Q12 -1 19.5 -6.5"); }
    if (P.tg > 0.5) { const k = (Math.sin(t * 15) + 1) / 2; sa(R.tg, "d", `M19 9Q24 ${f1(9 + 2 * k)} 27 ${f1(10 + 8 * k)}Q23 ${f1(13 + 10 * k)} 19 ${f1(12 + 4 * k)}Z`); } else sa(R.tg, "d", "");
    // 4 chân (khớp gắn vào hông / vai đã xoay theo thân)
    const jh = at(H, 4, -rh * 0.18), jf = at(Sh, 4, -rs * 0.36), Sx = gl(W.S, U.S), Hh = gl(W.H, U.H), duty = gl(W.duty, U.duty);
    for (const k of ["nh", "fh", "nf", "ff"]) {
      const Lg = R[k]; if (!Lg) continue; const hind = k[1] === "h", far = k[0] === "f", sh = far ? -12 : 0, gy = 280 - (far ? 2 : 0), pl = P[k];
      const J = hind ? [jh[0] + sh, jh[1] - (far ? 2 : 0)] : [jf[0] + sh, jf[1] - (far ? 2 : 0)];
      let px = pl.P[0], py = pl.P[1], ox = pl.O[0], oy = pl.O[1], r = pl.r;
      if (wk > 0) {      // chân theo nhịp bước
        const x0 = PO.stand[k].P[0], ph = (c + gl(W.off[k], U.off[k]) + 1) % 1; let gx, gyy, toe = 0;
        if (ph < duty) { gx = x0 + Sx * (0.5 - ph / duty); gyy = gy; }
        else { const u = (ph - duty) / (1 - duty), e = u * u * (3 - 2 * u), hh = Hh * (hind ? 0.85 : 1.25) * (1 - rn * 0.2); gx = x0 + Sx * (-0.5 + e); gyy = gy - hh * Math.sin(Math.PI * u); toe = (hind ? 0.5 : 0.95) * Math.sin(Math.PI * u) * (1 - rn * 0.4); }
        const lift = gy - gyy, gox = hind ? -9 - lift * 0.25 : -2 - lift * 0.3, goy = hind ? -30 + lift * 0.15 : -13 + lift * 0.1;
        px = lerp(px, gx, wk); py = lerp(py, gyy, wk); ox = lerp(ox, gox, wk); oy = lerp(oy, goy, wk); r = lerp(r, toe, wk);
      }
      px += far ? sh : 0;
      const ax = px, ay = py - 1, mx = ax + ox, my = ay + oy;
      if (hind) { let [kx, ky] = ik(J[0], J[1], mx, my, 50, 46, -1); ky = Math.min(ky, 272); sa(Lg.s1, "points", quad(J[0], J[1], 36, kx, ky, 15)); sa(Lg.s2, "points", quad(kx, ky, 14, mx, my, 9.5)); sa(Lg.s3, "points", quad(mx, my, 10, ax, ay - 4, 9)); sa(Lg.j1, "cx", f1(kx)); sa(Lg.j1, "cy", f1(ky)); sa(Lg.j1, "r", "7"); sa(Lg.j2, "cx", f1(mx)); sa(Lg.j2, "cy", f1(my)); sa(Lg.j2, "r", "5"); }
      else { let [ex, ey] = ik(J[0], J[1], mx, my, 52, 46, 1); ey = Math.min(ey, 272); sa(Lg.s1, "points", quad(J[0], J[1], 27, ex, ey, 13)); sa(Lg.s2, "points", quad(ex, ey, 12, mx, my, 9.5)); sa(Lg.s3, "points", quad(mx, my, 10, ax, ay - 4, 9)); sa(Lg.j1, "cx", f1(ex)); sa(Lg.j1, "cy", f1(ey)); sa(Lg.j1, "r", "6.2"); sa(Lg.j2, "cx", f1(mx)); sa(Lg.j2, "cy", f1(my)); sa(Lg.j2, "r", "5"); }
      sa(Lg.pw, "points", pawPts(ax, ay, r));
      if (k === "nf" && P.cl > 0.6) { const cr = Math.cos(r), sr = Math.sin(r), tx = ax + 15 * cr, ty = ay + 15 * sr; sa(Lg.cl, "d", [-5, -1, 3].map((d0) => `M${f1(tx - sr * d0)} ${f1(ty + cr * d0)}l${f1(cr * 9)} ${f1(sr * 9)}`).join("")); } else sa(Lg.cl, "d", "");
    }
    // đuôi: 13 đốt; sóng phe phẩy chạy từ gốc ra chóp, dồn biên độ về chóp khi ngồi / nằm; không bao giờ chui xuống đất
    const N = 13, Ls = lerp(12, 13.5, P.tz || 0), a0 = lerp(P.ta, gl(232, 188), wk) + 5 * Math.sin(t * 1.3), kc = lerp(P.tk, gl(9.4, 3), wk), A = lerp(P.tA, gl(7, 11), wk), om = lerp(P.tom, gl(4.2, 10), wk), tw = lerp(P.tw, 1, wk);
    const T0 = at(H, -rh * 0.78, rh * 0.42), Pt = [T0], Wd = [];
    for (let i = 0; i < N; i++) { const q = i / N, a = (a0 + i * kc + A * Math.sin(om * t - i * 0.55) * Math.pow(q, tw) * (tw > 1 ? 2.2 : 1)) * D2R, [x, y] = Pt[i]; Pt.push([x + Ls * Math.cos(a), Math.min(274, y + Ls * Math.sin(a))]); }
    for (let i = 0; i <= N; i++) Wd.push(lerp(19, 8, i / N));
    const lf = [], rt = [];
    for (let i = 0; i <= N; i++) { const p0 = Pt[Math.max(0, i - 1)], p1 = Pt[Math.min(N, i + 1)], a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), qx = -Math.sin(a), qy = Math.cos(a), [x, y] = Pt[i], h = Wd[i] / 2; lf.push(`${f1(x + qx * h)},${f1(y + qy * h)}`); rt.unshift(`${f1(x - qx * h)},${f1(y - qy * h)}`); }
    const fr = (P.tz || 0) * (1 - wk) > 0.5; if (fr !== R.front && R.tlg) { R.front = fr; R.tlg.classList.toggle("tf", fr); if (fr) R.svg.appendChild(R.tlg); else R.svg.insertBefore(R.tlg, R.to); }      // ngồi / nằm: đuôi quấn ra TRƯỚC chân
    sa(R.tl, "points", lf.concat(rt).join(" ")); sa(R.tt, "cx", f1(Pt[N][0])); sa(R.tt, "cy", f1(Pt[N][1])); sa(R.tt, "r", f1(Wd[N] / 2));
  }
  // hình tĩnh (xem trước trong Tài khoản)
  function preview(skin, pose = "sit") { const box = document.createElement("div"); box.innerHTML = catSvg(skin); const R = bind(box.firstElementChild); render(R, PO[pose] || PO.sit, { t: 1 }); return box.innerHTML; }
  window.MUN_ART = { poseSvg: (k, skin) => preview(skin, k === "walk" ? "stand" : k), preview, SKINS };

  // ================================================================ lời thoại – kiêu kì, đanh đá, châm biếm; KHÔNG nói mua / bán / coin nào
  const L = (vi, en) => (typeof EN !== "undefined" && EN ? en : vi);
  const T = {
    gen: [["Bình tĩnh. Thị trường không chạy mất đâu.", "Relax. The market isn't going anywhere."], ["Tôi không đoán. Tôi chờ.", "I don't guess. I wait."], ["Kế hoạch trước. Lệnh sau.", "Plan first. Orders later."],
      ["Thua một lệnh là chuyện nhỏ. Phá luật mới là chuyện lớn.", "Losing a trade is small. Breaking your rules is not."], ["Ngồi yên cũng là một vị thế.", "Sitting still is a position too."], ["Kẻ vội vàng luôn trả học phí.", "The hasty always pay tuition."],
      ["Đừng nhìn nến 1 phút quá lâu. Nó nhìn lại đấy.", "Don't stare at the 1-minute chart. It stares back."], ["Tôi liếm lông. Anh xem lại luật cắt lỗ.", "I groom. You review your stop rules."], ["Người khôn không cần ồn ào.", "Smart money doesn't need noise."],
      ["Cơ hội không đi một mình. Luôn có cái sau.", "Opportunities never come alone. There's always a next one."], ["Cắt lỗ là phép lịch sự với chính mình.", "A stop-loss is good manners toward yourself."], ["Đừng trả thù thị trường. Nó không nhớ anh là ai.", "Don't take revenge on the market. It doesn't know you."],
      ["Ít lệnh, lệnh tốt. Như tôi: ít nói, nói đúng.", "Fewer trades, better trades. Like me: few words, right words."], ["Ghi nhật ký đi. Trí nhớ hay nói dối.", "Keep a journal. Memory lies."], ["Kiên nhẫn là lợi thế duy nhất không ai sao chép được.", "Patience is the one edge nobody can copy."],
      ["Anh mở app lần thứ mấy hôm nay rồi? Tôi đếm không xuể.", "How many times have you opened this today? I lost count."], ["Nhìn biểu đồ thêm 5 phút nữa thì giá cũng không đổi vì anh đâu.", "Staring 5 more minutes won't move the price for you."],
      ["Tôi ngủ 16 tiếng một ngày mà chưa từng cháy tài khoản. Nghĩ đi.", "I sleep 16 hours a day and never blew an account. Think about it."], ["FOMO à? Tôi ngửi thấy từ đây.", "FOMO? I can smell it from here."], ["Thị trường không nợ anh gì cả. Tôi cũng vậy.", "The market owes you nothing. Neither do I."],
      ["Muốn giàu nhanh thì sang app khác. Ở đây làm chậm mà chắc.", "Want to get rich quick? Wrong app. We go slow and sure here."], ["Đừng bấm lung tung. Tôi đang nhìn đấy.", "Stop clicking around. I'm watching."], ["Kỷ luật là thứ anh có lúc 9 giờ sáng và đánh rơi lúc 11 giờ đêm.", "Discipline: you have it at 9 a.m. and drop it at 11 p.m."],
      ["Hôm qua anh cũng nói “lệnh cuối”.", "Yesterday you also said “last trade”."], ["Gồng lỗ không phải kiên nhẫn. Là cứng đầu.", "Holding a loser isn't patience. It's stubbornness."], ["Lời nhỏ mà đều vẫn hơn một cú lớn rồi về mo.", "Small steady wins beat one big win and back to zero."],
      ["Tôi có chín mạng. Tài khoản của anh thì chỉ có một.", "I have nine lives. Your account has one."], ["Ngồi thẳng lưng lên. Ra dáng người có kế hoạch đi.", "Sit up straight. Look like someone with a plan."], ["Tôi không cần lời khuyên của ai. Anh thì cần đấy.", "I don't need anyone's advice. You do."],
      ["Đòn bẩy cao nhìn thì oai. Lúc thanh lý thì hết oai.", "High leverage looks cool. Until liquidation."], ["Tin đồn trên mạng à? Tôi chỉ tin vào luật của mình.", "Online rumours? I only trust my rules."], ["Đừng nhìn tôi. Nhìn vào kế hoạch.", "Don't look at me. Look at your plan."],
      ["Lệnh không có điểm cắt lỗ là lệnh cầu nguyện.", "A trade without a stop is a prayer."], ["Đừng đổi kế hoạch giữa trận chỉ vì nến đỏ một cây.", "Don't rewrite the plan because of one red candle."], ["Anh không cần đúng mọi lần. Chỉ cần thua nhỏ.", "You don't need to be right every time. Just lose small."],
      ["Tôi không vồ mọi con chuột. Chỉ con nào đáng.", "I don't pounce on every mouse. Only the worthy ones."], ["Biểu đồ đẹp không có nghĩa là lệnh đẹp.", "A pretty chart isn't a pretty trade."], ["Nhồi lệnh để gỡ à? Kinh điển. Kinh điển cháy.", "Doubling down to win it back? Classic. Classic blow-up."],
      ["Tôi kiêu vì tôi có lý do. Anh tự tin vì lý do gì?", "I'm arrogant for a reason. What's your reason?"], ["Thị trường đi ngang thì anh cũng nên ngồi yên. Như tôi.", "Sideways market? Sit still. Like me."], ["Đừng kể lệnh lời cho tôi nghe. Kể lệnh lỗ kìa.", "Don't tell me your wins. Tell me your losses."],
      ["Một quy tắc anh giữ được hơn mười quy tắc anh chép trên mạng.", "One rule you keep beats ten you copied online."], ["Ai cũng có kế hoạch cho tới khi giá chạy ngược.", "Everyone has a plan until price moves against them."], ["Tôi đã xem lịch sử lệnh của anh. Tôi giữ im lặng. Vì lịch sự.", "I've seen your trade history. I'm staying quiet. Out of courtesy."],
      ["Phí giao dịch cũng là tiền đấy. Đừng bấm cho vui tay.", "Fees are money too. Stop clicking for fun."], ["Lời rồi thì chốt bớt. Tham thì thâm, mèo cũng biết.", "In profit? Take some off. Even cats know greed bites."], ["Tôi không cần xem tin tức. Tôi xem anh là đủ hiểu thị trường đang điên.", "I don't need the news. Watching you tells me the market's mad."],
      ["Anh nhìn màn hình nhiều hơn nhìn tôi. Tôi ghi nhận.", "You look at the screen more than at me. Noted."], ["Cảm xúc là phí giao dịch ẩn.", "Emotion is a hidden trading fee."], ["Không vào lệnh cũng là một quyết định. Thường là quyết định đúng.", "Not trading is a decision too. Often the right one."],
      ["Đừng tưởng tôi không biết anh vừa phá luật.", "Don't think I didn't see you break a rule."], ["Lệnh thắng làm anh tự tin. Lệnh thua làm anh khôn. Chọn đi.", "Wins make you confident. Losses make you wise. Pick."], ["Tôi không quan tâm anh lời bao nhiêu. Tôi quan tâm anh lỗ thế nào.", "I don't care how much you made. I care how you lose."],
      ["Mắt anh đỏ rồi kìa. Không phải nến đâu.", "Your eyes are red. That's not the candles."], ["Ai cũng giỏi khi thị trường lên.", "Everyone's a genius in a bull market."], ["Chờ xác nhận. Tôi cũng chờ chuột ló đầu mới vồ.", "Wait for confirmation. I wait for the mouse to show its head."],
      ["Giữ tiền mặt không xấu hổ. Cháy tài khoản mới xấu hổ.", "Holding cash isn't shameful. Blowing up is."], ["Đừng nghe người lạ trên mạng. Nghe tôi.", "Don't listen to strangers online. Listen to me."], ["Lệnh tốt thường nhàm chán.", "Good trades are usually boring."],
      ["Cái nút 'Vào lệnh' không chạy mất đâu mà bấm vội.", "The 'Enter' button won't run away. No rush."], ["Thị trường thưởng cho người kiên nhẫn và phạt người lắm lời. Như tôi với anh.", "The market rewards the patient and punishes the chatty. Like me and you."],
      ["Anh có kế hoạch, tôi có móng vuốt. Ai giữ kỷ luật hơn?", "You have a plan, I have claws. Who's more disciplined?"], ["Gỡ lỗ trong một lệnh là cách nhanh nhất để lỗ gấp đôi.", "Trying to win it all back in one trade is the fastest way to double the loss."]],
    climb: [["Lên cao chút cho thoáng.", "Going up for some air."], ["Tránh đường. Mèo lên.", "Make way. Cat coming up."], ["Bậc thang cũng như kế hoạch: từng bước một.", "Stairs are like plans: one step at a time."]],
    top: [["Nhìn từ trên này, biểu đồ cũng chỉ là đường gấp khúc.", "From up here, the chart's just a zigzag."], ["Đứng cao nhìn xa. Anh thì cứ dí mắt vào nến 1 phút.", "Higher view, longer horizon. You keep staring at 1-minute candles."], ["Ở trên này, FOMO không với tới tôi.", "Up here, FOMO can't reach me."],
      ["Toàn cảnh đẹp đấy. Mấy lệnh của anh thì… để sau.", "Nice view. Your trades… let's not."], ["Khung lớn trước, khung nhỏ sau. Nhớ chưa?", "Big timeframe first, small one later. Got it?"]],
    weekend: [["Cuối tuần. Thị trường còn chạy, anh thì nên nghỉ.", "Weekend. The market runs, you should rest."], ["Cuối tuần thanh khoản mỏng. Đừng tưởng là cơ hội.", "Weekend liquidity is thin. Don't mistake it for opportunity."]],
    monday: [["Thứ Hai. Đọc lại nhật ký tuần trước trước khi bấm gì.", "Monday. Reread last week's journal before clicking anything."]],
    bot: [["Bot đang làm việc. Đừng đứng sau lưng nó.", "The bot is working. Don't hover behind it."], ["Luật đã đặt thì để luật chạy.", "Rules are set. Let them run."], ["Can thiệp tay ít thôi. Bảng so sánh ghi hết đấy.", "Easy on the manual moves. The comparison table remembers."],
      ["Sàn thử trước, tiền thật sau. Tôi cũng nếm sữa trước khi uống.", "Paper first, real money later. I taste the milk first too."], ["Để bot yên. Nó làm tốt hơn khi anh không thò tay vào.", "Leave the bot alone. It does better without your paws in it."], ["Bot không có cảm xúc. Anh nên học nó.", "The bot has no feelings. Learn from it."]],
    night: [["Khuya rồi. Mèo còn biết đi ngủ.", "It's late. Even cats sleep."], ["Quyết định lúc 2 giờ sáng hiếm khi là quyết định hay.", "2 a.m. decisions are rarely good ones."], ["Giờ này còn thức? Mai đừng có ngáp với tôi.", "Still up? Don't yawn at me tomorrow."], ["Đêm khuya chỉ có mèo và người sắp vào lệnh dở là còn thức.", "Only cats and people about to make bad trades are up this late."]],
    long: [["Ngồi lâu rồi. Đứng dậy duỗi lưng đi – như tôi.", "You've been sitting long. Stretch – like me."], ["Uống nước đi. Tôi không nhắc lần hai.", "Drink some water. I won't say it twice."], ["Ghế mọc rễ chưa? Đứng dậy đi lại đi.", "Grown roots in that chair yet? Get up and walk."]],
    back: [["Về rồi à. Tôi vẫn ở đây.", "Back already. I'm still here."], ["Vắng anh, mọi thứ vẫn yên.", "All quiet while you were gone."], ["Giờ mới về? Tôi tưởng anh bỏ nghề rồi.", "Only now? I thought you'd quit."], ["Không có anh tôi yên tĩnh hơn hẳn. Thôi, vào việc đi.", "Much quieter without you. Anyway, get to work."]],
    morn: [["Chào buổi sáng. Cà phê trước, lệnh sau.", "Morning. Coffee first, orders later."], ["Sáng rồi. Rửa mặt trước khi nhìn biểu đồ.", "Morning. Wash your face before the charts."], ["Chưa uống cà phê thì đừng đặt lệnh.", "No coffee, no orders."]],
    poke: [["Chuyện gì?", "What is it?"], ["Tôi đang bận… liếm lông.", "I'm busy… grooming."], ["Đừng vuốt ngược lông.", "Not against the fur."], ["Prrr… thôi được rồi.", "Prrr… fine."], ["Có việc thì nói. Không thì để tôi yên.", "Speak if you need something. Otherwise, let me be."],
      ["Tôi là Na Na. Nhớ chưa?", "I'm Na Na. Remember that."], ["Bỏ tay ra.", "Hands off."], ["Lại nữa à?", "Again?"], ["Tôi cào đấy.", "I will scratch."], ["Anh rảnh quá nhỉ.", "You've got time to kill, huh."], ["Muốn được vuốt ve thì đi nuôi chó.", "Want cuddles? Get a dog."],
      ["Chạm thêm lần nữa là tính phí.", "Next touch is billable."], ["Tôi đang làm việc. Kiểu… nhìn anh làm sai.", "I'm working. As in… watching you mess up."], ["Hừ.", "Hmph."], ["Tay anh rảnh thế thì đi ghi nhật ký giao dịch.", "If your hands are that free, go write your trading journal."]],
    wake: [["…Hửm?", "…Hm?"], ["Tôi không ngủ. Tôi đang suy nghĩ.", "I wasn't asleep. I was thinking."], ["Ai cho phép đánh thức tôi?", "Who said you could wake me?"], ["Năm phút nữa.", "Five more minutes."], ["…Có chuyện gì thì nói nhanh.", "…Make it quick."]],
    err: [["Có chuyện. Bình tĩnh mà xử.", "Something's off. Handle it calmly."], ["Lỗi thì sửa. Không cần hoảng.", "Errors get fixed. No panic needed."], ["Lại hỏng gì nữa rồi?", "What broke this time?"], ["Tôi còn chưa hoảng, anh hoảng làm gì.", "I'm not panicking. Why are you?"]],
    ok: [["Gọn.", "Clean."], ["Được.", "Good."], ["Ổn.", "Fine."], ["Tạm được.", "Acceptable."], ["Cũng biết làm đấy.", "So you can do it."], ["Hừm. Không tệ.", "Hm. Not bad."]],
    aris: [["Bổn tiểu thư không vội. Anh vội làm gì?", "A lady is never in a hurry. Why are you?"], ["Na Na sinh ra đã quý phái. Anh thì phải tập kỷ luật.", "Na Na was born elegant. You have to practise discipline."], ["Người sang không đuổi theo giá. Giá tự tìm đến.", "Class doesn't chase price. Price comes to it."],
      ["Ngồi thẳng, cằm cao, lệnh có cắt lỗ. Thế mới gọi là có giáo dục.", "Back straight, chin up, stop-loss set. That's good breeding."], ["Na Na không ăn đồ thừa. Anh cũng đừng vào lệnh thừa.", "Na Na doesn't eat leftovers. Don't take leftover trades."], ["Thị trường là bữa tiệc. Người lịch sự không ăn hết cả bàn.", "The market is a banquet. Well-mannered guests don't eat the whole table."],
      ["Anh bấm nút như mèo hoang vồ bóng. Thanh lịch lên chút.", "You click like a stray chasing shadows. A little elegance, please."], ["Ta đã ngủ trưa, liếm lông, ngắm cảnh. Còn anh – đã ghi nhật ký chưa?", "I've napped, groomed, admired the view. You – journaled yet?"], ["Quý tộc thì thua đẹp: nhỏ, gọn, đúng kế hoạch.", "Aristocrats lose gracefully: small, clean, as planned."],
      ["Tiền thật không thích người ồn ào. Na Na cũng vậy.", "Real money dislikes noisy people. So does Na Na."], ["Đừng nhìn Na Na bằng ánh mắt FOMO đó.", "Don't look at Na Na with those FOMO eyes."], ["Ta không cần đồng ý với anh. Thị trường cũng vậy.", "I don't need to agree with you. Neither does the market."],
      ["Ồ, lại một ý tưởng 'chắc ăn'. Na Na nghe đến lần thứ một trăm rồi.", "Oh, another 'sure thing'. That's the hundredth Na Na has heard."], ["Thưa anh, kỷ luật không phải đồ trang sức đeo lúc rảnh.", "Discipline, sir, is not jewellery for idle hours."], ["Na Na liếm lông mỗi ngày. Anh xem lại rủi ro mỗi ngày chưa?", "Na Na grooms daily. Do you review risk daily?"],
      ["Lệnh đẹp như mèo: kiên nhẫn, im lặng, ra đòn một lần.", "A good trade is like a cat: patient, silent, one strike."], ["Ai cho phép anh vào lệnh khi chưa hỏi ý Na Na? À, Na Na không khuyên đâu. Nhưng vẫn ai cho phép?", "Who allowed you to trade without asking Na Na? Not that Na Na gives advice. But still – who?"], ["Na Na thích sự yên tĩnh. Danh mục của anh thì ồn ào quá.", "Na Na likes quiet. Your portfolio is very loud."],
      ["Thua thì thua, đừng có nhăn nhó. Mất phong độ.", "If you lose, lose without pouting. It's unbecoming."], ["Anh định gồng tới bao giờ? Na Na đi ngủ trước đây.", "How long will you hold that loser? Na Na is going to bed."], ["Ta không phán xét. Ta chỉ nhìn. Rất lâu. Rất kỹ.", "I don't judge. I just watch. Very long. Very closely."]],
    // theo trang đang mở (đổi trang → thỉnh thoảng Na Na bình luận 1 câu)
    p_market: [["Lại xem thị trường à? Nó vẫn thế, chỉ có anh là sốt ruột.", "Checking the market again? It's the same. Only you are restless."], ["Đèn xanh không có nghĩa là lao vào.", "A green light isn't an order to charge."], ["Fear & Greed thấp thì anh sợ, cao thì anh tham. Tôi thì ngủ.", "Low fear, you panic. High greed, you chase. I nap."], ["Nhìn bức tranh lớn trước. Đừng dí mũi vào một cây nến.", "Big picture first. Don't press your nose to one candle."]],
    p_opp: [["Cơ hội nhiều như chuột. Không phải con nào cũng đáng vồ.", "Opportunities are like mice. Not every one is worth the pounce."], ["Lọc kỹ vào. Tôi kén ăn, anh cũng nên kén lệnh.", "Be picky. I'm picky with food, you should be with trades."], ["Danh sách dài thế, anh định vào hết à? Đừng.", "That long list – planning to take them all? Don't."]],
    p_trade: [["Lên kế hoạch thì ghi điểm cắt lỗ trước, mơ mộng sau.", "Plan the stop first, dream later."], ["Khối lượng vừa thôi. Tôi không muốn nuôi anh đâu.", "Size it sensibly. I'm not adopting you."], ["Đòn bẩy cao? Mèo có chín mạng, anh thì không.", "High leverage? Cats have nine lives. You don't."]],
    p_pf: [["Danh mục đỏ thì đừng nhìn mười lần một giờ. Nó không xanh lên vì bị nhìn.", "Red portfolio? Staring ten times an hour won't turn it green."], ["Đa dạng hoá chứ không phải sưu tầm coin.", "Diversify, don't collect coins like stamps."]],
    p_journal: [["Đọc lại lệnh thua đi. Đau nhưng bổ.", "Reread the losing trades. Painful but nutritious."], ["Sổ lệnh không biết nói dối. Anh thì có.", "The journal doesn't lie. You might."], ["Thắng nhiều mà vẫn lỗ? Lỗ to quá đấy.", "Winning often but still down? Your losses are too big."]],
    p_bot: [["Bot làm việc chăm hơn anh đấy.", "The bot works harder than you."], ["Đừng tắt bot chỉ vì một lệnh thua. Nó không giận, anh mới giận.", "Don't kill the bot over one loss. It's not upset – you are."], ["Thấy bot đang lời mà muốn chốt tay? Kìm lại.", "Bot in profit and you want to close manually? Restrain yourself."]],
    p_tax: [["Thuế à? Tôi là mèo, tôi miễn thuế.", "Taxes? I'm a cat. Tax-exempt."], ["Ghi chép đầy đủ đi. Cuối năm khỏi khóc.", "Keep records. Fewer tears at year-end."]],
    p_acc: [["Đổi bộ đồ cho tôi à? Chọn cho đẹp vào.", "Changing my outfit? Choose wisely."], ["Cài đặt xong thì quay lại làm việc.", "Done with settings? Back to work."]],
    scroll: [["Cuộn nhanh thế tìm gì? Bình tĩnh.", "Scrolling that fast – looking for what? Calm down."], ["Từ từ. Dữ liệu không chạy đi đâu.", "Slow down. The data isn't running away."]],
    scratch: [["Tôi đã cảnh cáo rồi.", "I did warn you."], ["Cào cho nhớ.", "A scratch to remember me by."], ["Lần sau là cắn.", "Next time I bite."], ["Tay hư thì bị cào. Luật đấy.", "Naughty hands get scratched. House rule."]],
    against: [["Đừng vuốt ngược lông!", "Not against the fur!"], ["Ngược lông rồi! Học lại cách vuốt mèo đi.", "Wrong way! Learn how to pet a cat."], ["Hừ! Vuốt ngược như vào lệnh ngược xu hướng – chỉ tổ ăn cào.", "Hiss! Petting against the fur is like trading against the trend – you get scratched."]],
    purr: [["Prrr… đúng chiều đấy.", "Prrr… right direction."], ["Ừm. Được. Tiếp đi.", "Mm. Fine. Keep going."], ["Prrr… thôi, đừng để ai thấy.", "Prrr… don't let anyone see this."], ["Xuôi lông, xuôi xu hướng. Anh học nhanh đấy.", "With the fur, with the trend. You learn fast."]],
    enough: [["Đủ rồi.", "Enough."], ["Thôi. Tôi đi chỗ khác.", "That's it. I'm leaving."], ["Hết kiên nhẫn rồi đấy.", "Out of patience."]],
    hi: [["Bổn tiểu thư là Na Na. Ta trông chừng kỷ luật của anh – không hơn.", "I'm Na Na. I keep an eye on your discipline – nothing more."]],
    hi2: [["Cần gì thì giữ lâu vào tôi. Đừng chọc linh tinh.", "Press and hold me if you need something. Don't poke."]],
    chase: [["Chuột!", "Mouse!"], ["Đứng lại đó!", "Stop right there!"], ["Của tôi!", "Mine!"], ["Hừ, dám vào lãnh địa của tôi?", "In MY territory?"]],
    catch: [["Bắt được. Như mọi khi.", "Caught. As always."], ["Dễ. Như cắt lỗ đúng chỗ.", "Easy. Like a well-placed stop."], ["Thấy chưa? Kiên nhẫn rồi mới ra đòn.", "See? Patience, then strike."], ["Bữa phụ.", "Snack time."]],
    miss: [["Tôi… cho nó đi đấy.", "I… let it go."], ["Không đáng công. Như mấy lệnh FOMO của anh.", "Not worth it. Like your FOMO trades."], ["Hôm nay tôi ăn chay.", "I'm vegetarian today."], ["Đuổi theo thứ chạy nhanh hơn mình là ngu. Ghi nhớ đi.", "Chasing what outruns you is dumb. Take note."]],
    stalk: [["Đừng tưởng tôi không thấy con trỏ của anh.", "Don't think I can't see your cursor."], ["Rê nữa đi. Tôi vồ đấy.", "Keep moving it. I'll pounce."], ["Cái chấm nhỏ đó… của tôi.", "That little pointer… is mine."]],
    pounce: [["Bắt được!", "Got it!"], ["Hà! Chậm quá.", "Ha! Too slow."]],
    bored: [["Chán rồi.", "Bored now."], ["Trò trẻ con.", "Child's play."]],
  };
  const recent = [];
  const pick = (k) => { const A = T[k] || T.gen, fresh = A.filter((x) => !recent.includes(x[0])), x = (fresh.length ? fresh : A)[Math.floor(Math.random() * (fresh.length || A.length))]; recent.push(x[0]); if (recent.length > 14) recent.shift(); return L(x[0], x[1]); };
  const pickGen = () => pick(Math.random() < 0.45 ? "aris" : "gen");

  // ================================================================ hành vi
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const S = { el: null, x: -1, face: 1, pose: "sit", tm: 0, walkTm: 0, sayTm: 0, act: Date.now(), t0: Date.now(), hidAt: 0, pokes: [], away: false, cfg: {}, said: {}, nextTalk: 0, s: 0.2 };
  const G = { P: clone(PO.sit), from: null, to: PO.sit, t0: 0, dur: 1, wk: 0, rn: 0, c: 0, t: 0, v: 0, last: 0, blink: 0, blinkAt: 0, earTw: 0, earAt: 0, purr: 0, R: null, on: false };
  const now = () => Date.now(), rnd = (a, b) => a + Math.random() * (b - a);
  const cfgOf = () => { const u = (typeof UIP !== "undefined" && UIP.mun) || {}; const pro = typeof can === "function" ? can("mascot_pro") || (typeof ME !== "undefined" && ME?.eff_plan === "pro") : false;
    let skin = u.skin || "classic"; if (SKINS.find((x) => x.k === skin)?.tier === "pro" && !pro) skin = "classic"; return { on: u.on !== false, talk: u.talk || "n", skin, size: ["s", "m", "l"].includes(u.size) ? u.size : "l", snd: u.snd !== false }; };
  const SZ = { s: [0.165, 0.2], m: [0.2, 0.24], l: [0.235, 0.28] };      // cỡ: Nhỏ (như bản đầu) · Vừa · Lớn
  const mob = () => matchMedia("(max-width:979px)").matches;
  const scale = () => (SZ[S.cfg.size] || SZ.l)[mob() ? 0 : 1];
  // đường đi: điện thoại = mép trên thanh điều hướng nổi ở dưới; máy tính = mép dưới cửa sổ, phần nội dung (bên phải thanh bên)
  function track() {
    const tb = document.getElementById("tabs"), r = tb?.getBoundingClientRect(), W = innerWidth, cw = 345 * S.s;
    const fab = document.querySelector(".pnfab"), fr0 = fab?.getBoundingClientRect(), fr = fr0 && fr0.width > 0 ? fr0 : null;      // nút "Bảng phụ" nổi → không đi xuyên qua
    if (mob() && r && r.height > 0 && r.height < 140 && r.bottom > innerHeight - 60) { let rr = r.right - 14 - cw; if (fr && fr.bottom > r.top - 40 && fr.left > innerWidth / 2) rr = Math.min(rr, fr.left - 8 - cw); return { b: Math.round(innerHeight - r.top - 2), l: r.left + 14, r: rr }; }
    let l = r && r.width < 400 && r.height > innerHeight * 0.6 ? r.right + 12 : 12; if (fr && fr.bottom > innerHeight - 80 && fr.left < innerWidth / 2) l = Math.max(l, fr.right + 12);
    return { b: 0, l, r: W - 12 - cw };
  }
  function place(x) { const tr = track(); x = Math.max(tr.l, Math.min(tr.r, x)); S.x = x; S.el.style.bottom = tr.b + "px"; S.el.style.transition = "none"; S.el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`; }
  function halt() { clearTimeout(S.walkTm); S.mvTk = (S.mvTk || 0) + 1; G.v = 0; }
  // đi tới x: tăng tốc êm lúc khởi hành, giảm tốc êm lúc tới nơi; nhịp chân = tốc độ thật từng khung hình
  function moveTo(x, vmax, done) {
    const tk = (S.mvTk = (S.mvTk || 0) + 1), A = vmax * 1.6; let v = 0, last = 0;
    const f = (t) => {
      if (tk !== S.mvTk || !S.el) return; const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
      const d = x - S.x, want = Math.min(vmax, Math.sqrt(2 * A * Math.abs(d)) * 0.9);
      v += Math.max(-A * dt, Math.min(A * dt, want - v)); S.x += Math.sign(d) * Math.min(Math.abs(d), v * dt); G.v = v;
      S.el.style.transform = `translate3d(${S.x.toFixed(1)}px,0,0)`;
      if (Math.abs(x - S.x) < 0.6 && v < 6) { S.x = x; G.v = 0; done?.(); return; }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }
  // đổi dáng = nội suy liền mạch từ dáng hiện tại sang dáng mới (không ghép hình, không mờ chồng)
  function pose(p) {
    if (!S.el) return; if (p !== "walk") halt(); S.pose = p; S.el.dataset.pose = p;
    const tg = p === "walk" ? "stand" : p; if (G.to === PO[tg]) return;
    G.from = clone(G.P); G.to = PO[tg]; G.t0 = performance.now(); G.dur = RM.matches ? 1 : DUR[tg];
  }
  function sitDown(p = "sit", then) { if (!S.el) return; halt(); S.el.classList.remove("run"); pose(p); if (then) setTimeout(then, DUR[p] || 400); }
  function standUp(go) { if (!S.el) return; if (["sit", "groom", "sleep", "swipe"].includes(S.pose) && !RM.matches) { pose("walk"); setTimeout(go, 300); } else { pose("walk"); go(); } }
  function face(d) { S.face = d; S.el.dataset.face = d > 0 ? "r" : "l"; }
  const hiddenNow = () => !!(document.hidden || document.getElementById("iosSheet") || (document.getElementById("iosMenu") && !document.getElementById("munMenu")) || document.querySelector(".cz-full, .cv-fs, #ocChart, .lb-on") || document.body.classList.contains("cmdk-on") || document.body.classList.contains("typing")
    || (mob() && document.activeElement?.matches?.("input, textarea, select, [contenteditable]")));
  function sched(fn, ms) { clearTimeout(S.tm); S.tm = setTimeout(fn, ms); }
  function walkTo(x, then) {
    const tr = track(); x = Math.max(tr.l, Math.min(tr.r, x)); const dx = x - S.x;
    if (RM.matches || Math.abs(dx) < 24) { place(x); then?.(); return; }
    face(dx > 0 ? 1 : -1); const v = (mob() ? 30 : 40) * (S.s / 0.235); S.el.classList.remove("run");      // đủng đỉnh, kiểu tiểu thư
    clearTimeout(S.walkTm); const tk = (S.walkTk = (S.walkTk || 0) + 1);
    standUp(() => { if (tk !== S.walkTk || !S.el || S.pose !== "walk" || S.chasing) return; moveTo(x, v, () => sitDown("sit", then)); });
  }
  // ---------------------------------------------------------------- vòng vẽ: 60 hình/giây khi đang đi / chuyển dáng, 30 hình/giây khi ngồi yên (đuôi vẫn phe phẩy)
  function loop(t) {
    if (!S.el) { G.on = false; return; }
    const dt = G.last ? Math.min(0.05, (t - G.last) / 1000) : 0; G.last = t; G.t += dt;
    if (G.from) { const u = Math.min(1, (t - G.t0) / G.dur), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; G.P = mix(G.from, G.to, e); if (u >= 1) G.from = null; }
    const wkT = S.pose === "walk" ? 1 : 0; G.wk += (wkT - G.wk) * Math.min(1, dt * 6); if (Math.abs(G.wk - wkT) < 0.002) G.wk = wkT;
    G.rn += ((S.el.classList.contains("run") ? 1 : 0) - G.rn) * Math.min(1, dt * 6);
    const Sx = lerp(GAIT.walk.S, GAIT.run.S, G.rn); G.c = (G.c + ((G.v / S.s) * dt) / Sx) % 1;
    if (t > G.blinkAt) { G.blinkAt = t + rnd(2500, 6500); G.bk0 = t; } const bk = G.bk0 ? (t - G.bk0) / 150 : 9; G.blink = G.purr > t ? 1 : bk < 1 ? Math.sin(bk * Math.PI) : 0;
    if (t > G.earAt) { G.earAt = t + rnd(5000, 12000); G.ea0 = t; } const ea = G.ea0 ? (t - G.ea0) / 320 : 9; G.earTw = ea < 1 ? -14 * Math.sin(ea * Math.PI) : 0;
    const busy = G.from || G.wk > 0 || S.chasing; G.fr = (G.fr || 0) + 1;
    if ((busy || G.fr % 2 === 0) && !S.away && G.R) render(G.R, G.P, { wk: G.wk, rn: G.rn, c: G.c, t: G.t, blink: G.blink, earTw: G.earTw });
    requestAnimationFrame(loop);
  }
  function idle() {      // vòng đời: ngồi → liếm lông → đi dạo → … ; để yên lâu thì ngủ
    if (!S.el) return;
    if (S.away || S.napTill > now() || S.chasing || ST.on || NT.cur) { sched(idle, 1500); return; }
    if (S.nextStairs && now() > S.nextStairs && now() - S.act < 60e3 && !(typeof userBusy === "function" && userBusy(3000))) { S.nextStairs = now() + rnd(12, 25) * 60e3; if (stairs()) return; }
    if (S.nextMouse && now() > S.nextMouse && now() - S.act < 60e3 && !(typeof userBusy === "function" && userBusy(3000))) { S.nextMouse = now() + rnd(10, 22) * 60e3; if (chase()) return; }
    if (now() - S.act > 80e3) { if (S.pose !== "sleep") pose("sleep"); sched(idle, 4000); return; }
    talkMaybe(); meowMaybe();
    const r = Math.random(), tr = track();
    if (r < 0.34) { pose("sit"); sched(idle, rnd(5e3, 11e3)); }
    else if (r < 0.58) { pose("groom"); sched(idle, rnd(3.5e3, 6.5e3)); }
    else { let x = rnd(tr.l, tr.r); if (Math.abs(x - S.x) < 70) x = S.x + (S.x - tr.l > tr.r - S.x ? -1 : 1) * rnd(80, 180); walkTo(x, () => sched(idle, rnd(3e3, 7e3))); }
  }
  // ---------------------------------------------------------------- 🔊 tiếng "meo" (tổng hợp bằng Web Audio – không tải file); iPhone gạt im lặng thì tự im
  let AC = null;
  const unlock = () => { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); } catch (e) { /* bỏ qua */ } };
  function meow(n = 1) {
    if (!S.cfg.snd || !AC || AC.state !== "running" || document.hidden) return;
    for (let k = 0; k < n; k++) {
      const t = AC.currentTime + k * 0.62 + 0.02, d = rnd(0.48, 0.7), f0 = rnd(560, 700) * (k ? 1.06 : 1), out = AC.createGain(); out.gain.value = 0.22; out.connect(AC.destination);
      const o = AC.createOscillator(), o2 = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(); o.type = "sawtooth"; o2.type = "triangle"; lfo.frequency.value = 6.5; lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      [[o, 1], [o2, 2]].forEach(([os, m]) => { os.frequency.setValueAtTime(f0 * 0.82 * m, t); os.frequency.linearRampToValueAtTime(f0 * 1.38 * m, t + d * 0.32); os.frequency.linearRampToValueAtTime(f0 * 0.78 * m, t + d); });
      const b1 = AC.createBiquadFilter(), b2 = AC.createBiquadFilter(), g = AC.createGain(); b1.type = b2.type = "bandpass"; b1.Q.value = 5; b2.Q.value = 7;
      b1.frequency.setValueAtTime(800, t); b1.frequency.linearRampToValueAtTime(1700, t + d * 0.35); b1.frequency.linearRampToValueAtTime(700, t + d);      // "m-e-o-w": khẩu hình mở rồi khép
      b2.frequency.setValueAtTime(2200, t); b2.frequency.linearRampToValueAtTime(2900, t + d * 0.35); b2.frequency.linearRampToValueAtTime(1900, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.07); g.gain.setValueAtTime(1, t + d * 0.62); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(b1); o.connect(b2); o2.connect(b1); b1.connect(g); b2.connect(g); g.connect(out);
      [o, o2, lfo].forEach((x) => { x.start(t); x.stop(t + d + 0.05); });
    }
  }
  function meowMaybe() { if (S.cfg.snd && now() > (S.nextMeow || 0)) { S.nextMeow = now() + rnd(5, 11) * 60e3; meow(Math.random() < 0.4 ? 2 : 1); } }
  // ---------------------------------------------------------------- nói (bóng thoại bám theo Na Na, không lòi ra mép)
  function bubble(html, ms, prio, cls = "") {
    if (!S.el || S.away || hiddenNow()) return false;
    const b = S.el.querySelector(".mun-say"); if (!b.hidden && prio < (b._p || 0)) return false;
    b._p = prio; b.className = "mun-say " + cls; b.querySelector(".tx").innerHTML = html; b.hidden = false; b.classList.remove("out");
    b._bw = b.offsetWidth; b._lx = null;
    const fol = () => { if (b.hidden || !S.el) { b._run = 0; return; } const bw = b._bw, x = new DOMMatrix(getComputedStyle(S.el).transform).m41, cw = 345 * S.s, cx = x + cw / 2, left = Math.max(8, Math.min(innerWidth - bw - 8, cx - bw / 2));
      if (b._lx !== Math.round(x)) { b._lx = Math.round(x); b.style.left = (left - x) + "px"; b.style.setProperty("--tx", Math.max(12, Math.min(bw - 12, cx - left)) + "px"); } requestAnimationFrame(fol); };
    if (!b._run) { b._run = 1; fol(); }
    clearTimeout(S.sayTm); if (ms) S.sayTm = setTimeout(() => sayOut(), ms);
    return true;
  }
  function sayOut() { const b = S.el?.querySelector(".mun-say"); if (!b || b.hidden) return; b.classList.add("out"); setTimeout(() => { if (b.classList.contains("out")) { b.hidden = true; b._p = 0; if (NT.cur) { NT.cur = null; setTimeout(ntNext, 250); } } }, 220); }
  const esc2 = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function say(text, ms = 5200, prio = 0) { if (NT.cur && prio < 9) return false; return bubble(`<span>${esc2(text)}</span>`, ms, prio); }
  function talkMaybe() {
    if (S.cfg.talk === "q" || now() < S.nextTalk || (typeof userBusy === "function" && userBusy(4000))) return;
    const h = new Date().getHours(), d = new Date().toDateString(), hs = location.hash;
    let k = null;
    if ((h >= 23 || h < 5) && !S.said.night) { k = "night"; S.said.night = 1; }
    else if (h >= 5 && h < 10 && lsGet("mun_morn", "") !== d) { k = "morn"; lsSet("mun_morn", d); }
    else if (now() - S.t0 > 50 * 60e3 && !S.said.long) { k = "long"; S.said.long = 1; setTimeout(() => (S.said.long = 0), 50 * 60e3); }
    else if (/^#\/bot/.test(hs) && Math.random() < 0.4) k = "bot";
    else if ([0, 6].includes(new Date().getDay()) && Math.random() < 0.2) k = "weekend";
    else if (new Date().getDay() === 1 && h < 12 && !S.said.mon) { k = "monday"; S.said.mon = 1; }
    if (say(k ? pick(k) : pickGen())) { S.nextTalk = now() + rnd(1.2, 2.6) * 60e3; if (Math.random() < 0.18) meow(1); }
  }
  // ---------------------------------------------------------------- 📣 THÔNG BÁO do Na Na nói: thay thẻ thông báo cũ khi Na Na đang hiện – giữ nguyên chức năng
  //   (nội dung, tiêu đề, bấm để mở trang / hành động, đóng, giữ tay để dừng đếm giờ), thêm 1 câu châm biếm + nhắc việc; nhiều thông báo → lần lượt
  const NT = { q: [], cur: null };
  const NI = {
    err: [["Ối, lại hỏng rồi:", "Oops, broken again:"], ["Tin buồn đây, thưa anh:", "Bad news, dear:"], ["Na Na cảnh báo rồi mà:", "Na Na did warn you:"], ["Bình tĩnh. Nhưng mà:", "Stay calm. However:"]],
    warn: [["Này, để ý giùm Na Na:", "Hey, pay attention:"], ["Na Na nhắc lần một thôi:", "Na Na says this once:"], ["Đọc kỹ cái này, đừng lướt:", "Read this. Don't skim:"]],
    ok: [["Xong rồi đấy, khỏi cảm ơn:", "Done. No need to thank me:"], ["Hiếm khi anh làm đúng ngay:", "Rarely right on the first try:"], ["Na Na ghi nhận:", "Na Na acknowledges:"], ["Tạm chấp nhận được:", "Acceptable, I suppose:"]],
    info: [["Báo anh hay:", "For your information:"], ["Na Na thông báo:", "Na Na announces:"], ["Nghe này:", "Listen:"], ["Có tin, đừng giả vờ không thấy:", "News. Don't pretend you missed it:"]],
  };
  const NE = { err: [["Sửa đi, Na Na chờ.", "Fix it. Na Na waits."], ["Đừng để Na Na nhắc lần hai.", "Don't make Na Na say it twice."]], warn: [["Xử lý luôn cho gọn.", "Deal with it now."], ["Để đó là quên đấy.", "Leave it and you'll forget."]], ok: [["Giữ phong độ nhé.", "Keep it up."], ["Lần sau tự giác hơn.", "Be more diligent next time."]], info: [["Bấm vào mà xem.", "Tap to see."], ["Xem đi rồi tính.", "Look, then decide."]] };
  const ntType = (msg, o) => o.type || (/^(⛔|❌|Lỗi|Error|Không lưu|Chưa lưu được)/i.test(msg) ? "err" : /^(⚠️|Chưa|Không|Cần|Hãy)/.test(msg) ? "warn" : /^(✅|Đã|Đang lưu|Saved)/.test(msg) ? "ok" : "info");
  function notify(msg, o = {}) { NT.q.push([String(msg ?? ""), o]); if (NT.q.length > 4) NT.q.splice(0, NT.q.length - 4); if (!NT.cur) ntNext(); return true; }
  function ntNext() {
    const it = NT.q.shift(); if (!it) return; if (!canTalkNotify()) { orig?.(it[0], it[1]); return ntNext(); }
    const [msg, o] = it, tp = ntType(msg, o), ICO = { ok: "✓", warn: "!", err: "✕", info: "i" }, body = msg.replace(/^(✅|⚠️|⛔|❌)\s*/u, ""), act = !!(o.href || o.onclick);
    const pk = (A) => { const x = A[Math.floor(Math.random() * A.length)]; return L(x[0], x[1]); };
    const ms = (o.ms || (o.title ? 6500 : tp === "err" ? 6000 : tp === "warn" ? 4500 : 3400)) + 2600;
    NT.cur = { o, ms }; if (S.pose === "sleep") pose("sit");
    const html = `<span class="q">${esc2(pk(NI[tp]))}</span><div class="nc t-${tp}${act ? " lnk" : ""}" role="${tp === "err" ? "alert" : "status"}"><i class="ic">${esc2(o.icon || ICO[tp])}</i><span class="m"><b>${esc2(o.title ? (o.icon && o.title.startsWith(o.icon) ? o.title.slice(o.icon.length).trim() : o.title) : body)}</b>${o.title ? `<small>${esc2(body)}</small>` : ""}</span></div>
      <div class="na"><span class="e">${esc2(pk(NE[tp]))}</span>${act ? `<button type="button" class="go">${esc2(L("Xem ngay", "Open"))}</button>` : ""}<button type="button" class="x">${esc2(L("Biết rồi", "Got it"))}</button></div><i class="tp" style="animation-duration:${ms}ms"></i>`;
    if (!bubble(html, ms, 9, "nt")) { NT.cur = null; orig?.(msg, o); return ntNext(); }
    if (tp === "err" || Math.random() < 0.35) meow(1);
    pose(tp === "err" ? "sit" : "groom"); sched(idle, ms + 2000);
    const b = S.el.querySelector(".mun-say"), go = () => { sayOut(); if (o.onclick) o.onclick(); if (o.href) location.hash = o.href.replace(/^[^#]*#/, "#"); };
    b.querySelector(".x").onclick = (e) => { e.stopPropagation(); sayOut(); };
    const g = b.querySelector(".go"); if (g) g.onclick = (e) => { e.stopPropagation(); go(); };
    b.querySelector(".nc").onclick = () => { if (act) go(); };
    let left = ms, t0 = Date.now(); const hold = () => { left = Math.max(1200, left - (Date.now() - t0)); clearTimeout(S.sayTm); b.classList.add("hold"); }, run = () => { t0 = Date.now(); clearTimeout(S.sayTm); S.sayTm = setTimeout(sayOut, left); b.classList.remove("hold"); };
    b.onpointerenter = hold; b.onpointerleave = (e) => { if (e.pointerType !== "touch") run(); }; b.ontouchstart = hold; b.ontouchend = run;
  }
  const canTalkNotify = () => !!(S.el && !S.away && !hiddenNow());
  let orig = null;
  // ---------------------------------------------------------------- chạm / vuốt / giữ lâu
  function poke() {
    if (S.chasing) return;
    if (S.pose === "sleep") { S.act = now(); pose("sit"); say(pick("wake"), 3500, 2); if (Math.random() < 0.5) meow(1); sched(idle, 5000); return; }
    S.pokes = S.pokes.filter((t) => now() - t < 6000); S.pokes.push(now()); navigator.vibrate?.(6);
    S.el.classList.remove("hop"); void S.el.offsetWidth; S.el.classList.add("hop");
    if (S.pokes.length === 3) { say(pick("scratch"), 3000, 2); swipe(S.lastPx, S.lastPy); meow(1); sched(idle, 7000); return; }
    if (S.pokes.length >= 5) { S.pokes = []; say(pick("enough"), 2600, 2); const tr = track(); walkTo(S.x - tr.l > tr.r - S.x ? tr.l : tr.r, () => { pose("groom"); sched(idle, 6000); }); return; }
    pose(Math.random() < 0.5 ? "sit" : "groom"); say(pick("poke"), 3800, 2); if (Math.random() < 0.3) meow(1); sched(idle, 7000);
  }
  // 🐾 cào: giơ chân trước, thò vuốt + 3 vết cào ngay chỗ ngón tay
  function swipe(px, py) {
    if (!S.el) return; halt(); pose("swipe"); navigator.vibrate?.([8, 30, 8]);
    setTimeout(() => { if (S.pose === "swipe") pose("sit"); }, 420);
    if (px != null) setTimeout(() => {
      const m = document.createElement("div"); m.className = "mun-scr"; m.style.left = px - 24 + "px"; m.style.top = py - 24 + "px";
      m.innerHTML = `<svg ${NS} viewBox="0 0 48 48" aria-hidden="true"><path pathLength="1" d="M10 6 Q20 22 16 42"/><path pathLength="1" d="M22 4 Q32 22 28 44"/><path pathLength="1" d="M34 6 Q43 22 39 40"/></svg>`;
      document.body.appendChild(m); setTimeout(() => m.classList.add("out"), 700); setTimeout(() => m.remove(), 1300);
    }, 140);
  }
  // 🤚 vuốt lông: xuôi (đầu → đuôi) thì khoái, ngược thì gắt (và hay cào)
  function stroke(dir, px, py) {
    if (S.chasing || !S.el) return; S.act = now(); clearTimeout(S.tm);
    if (S.pose === "sleep") pose("sit");
    if (dir === S.face) { say(pick("against"), 3200, 2); if (Math.random() < 0.6) swipe(px, py); else { S.el.classList.remove("hop"); void S.el.offsetWidth; S.el.classList.add("hop"); } }
    else { pose("sit"); say(pick("purr"), 3200, 2); G.purr = performance.now() + 1600; navigator.vibrate?.([6, 40, 6, 40, 6]); }
    sched(idle, 7000);
  }
  function menu() {
    if (typeof iosMenuClose === "function" && document.getElementById("iosMenu")) iosMenuClose();
    const R = S.el.querySelector(".mun-c").getBoundingClientRect(), vw = document.documentElement.clientWidth, W = Math.min(260, vw - 16), left = Math.max(8, Math.min(vw - W - 8, R.left + R.width / 2 - W / 2));
    const m = document.createElement("div"); m.id = "iosMenu"; m.className = "ios-menu";
    const it = (k, ic, t, sub) => `<button type="button" data-mun="${k}"><span class="ios-t">${t}${sub ? `<small>${sub}</small>` : ""}</span><span class="ios-ic">${ic}</span></button>`;
    m.innerHTML = `<div class="ios-menu-bg" data-x></div><div class="ios-menu-in" id="munMenu" role="menu" aria-label="${NAME}" style="left:${left}px;width:${W}px;bottom:${Math.round(innerHeight - R.top + 8)}px;transform-origin:${Math.round(R.left + R.width / 2 - left)}px calc(100% + 8px)">
      <div class="ios-menu-h">🐈‍⬛ ${NAME}</div>
      ${it("mouse", "🐭", L("Thả chuột cho Na Na", "Release a mouse"), L("xem Na Na rượt", "watch Na Na hunt"))}
      ${it("stairs", "🪜", L("Leo cầu thang", "Climb the stairs"), L("lên cao ngắm thị trường", "look down on the market"))}
      ${it("sleep", "😴", L("Cho đi ngủ 30 phút", "Nap for 30 min"), L("không đi, không nói", "no walking, no talking"))}
      ${it("quiet", S.cfg.talk === "q" ? "💬" : "🤫", S.cfg.talk === "q" ? L("Nói chuyện bình thường", "Talk normally") : L("Ít nói thôi", "Talk less"), S.cfg.talk === "q" ? "" : L("chỉ đáp khi anh gọi", "only answers when poked"))}
      ${it("snd", S.cfg.snd ? "🔇" : "🔊", S.cfg.snd ? L("Tắt tiếng kêu", "Mute meows") : L("Bật tiếng kêu", "Unmute meows"), L("meo meo khi bật loa", "meows when sound is on"))}
      ${it("size", "📏", L("Cỡ: ", "Size: ") + ({ s: L("Nhỏ", "Small"), m: L("Vừa", "Medium"), l: L("Lớn", "Large") })[S.cfg.size || "l"], L("chạm để đổi Nhỏ → Vừa → Lớn", "tap to cycle Small → Medium → Large"))}
      ${it("skin", "🎩", L("Đổi bộ đồ…", "Change outfit…"), L("Tài khoản › Mèo Na Na", "Account › Na Na"))}
      ${it("off", "🙈", L("Cất Na Na đi", "Hide Na Na"), L("bật lại trong Tài khoản", "turn back on in Account"))}</div>`;
    document.body.appendChild(m);
    m.querySelector("[data-x]").onclick = () => iosMenuClose();
    const setU = async (f) => { const u = { ...(UIP.mun || {}) }; f(u); UIP = { ...UIP, mun: u }; await uiSave(); MUN.apply(); };
    m.querySelectorAll("[data-mun]").forEach((b) => (b.onclick = async () => { const k = b.dataset.mun; iosMenuClose();
      if (k === "size") await setU((u) => (u.size = { s: "m", m: "l", l: "s" }[S.cfg.size || "l"]));
      else if (k === "snd") { await setU((u) => (u.snd = !S.cfg.snd)); if (S.cfg.snd) { unlock(); setTimeout(() => meow(2), 120); } else say(L("Hừ. Im thì im.", "Hmph. Silent it is."), 2500, 2); }
      else if (k === "mouse") setTimeout(() => chase(true), 250);
      else if (k === "stairs") setTimeout(() => stairs(true), 250);
      else if (k === "sleep") { S.napTill = now() + 30 * 60e3; pose("sleep"); clearTimeout(S.tm); S.el.querySelector(".mun-say").hidden = true; }
      else if (k === "quiet") { await setU((u) => (u.talk = S.cfg.talk === "q" ? "n" : "q")); say(S.cfg.talk === "q" ? L("Được. Na Na im. Đừng hối hận.", "Fine. Na Na will be quiet. Don't regret it.") : L("Na Na đã trở lại. Anh nhớ ta chứ gì.", "Na Na is back. You missed me."), 3000, 2); }
      else if (k === "off") { await setU((u) => (u.on = false)); (orig || toast)(L("Đã cất Na Na – bật lại trong Tài khoản › Mèo Na Na", "Na Na is hidden – turn back on in Account › Na Na")); }
      else if (k === "skin") location.hash = "#/account";
    }));
    const kd = (e) => { if (e.key === "Escape") { iosMenuClose(); removeEventListener("keydown", kd); } }; addEventListener("keydown", kd);
  }
  // ---------------------------------------------------------------- 🐭 rượt chuột: thỉnh thoảng 1 con chuột chạy ngang mép dưới, Na Na rượt theo (bắt được hoặc để sổng)
  const MOUSE = `<svg ${NS} viewBox="-8 0 66 30" aria-hidden="true"><path class="mt" d="M7 24 C1 24 -2 19 -7 17"/><path class="ms" d="M5 26 C8 15 20 8 33 9 C44 10 52 15 57 22 C58 25 56 27 52 27 Z"/><circle class="ms" cx="38" cy="8.5" r="5.5"/><circle class="mi" cx="38.5" cy="8.8" r="2.6"/><circle class="me" cx="49.5" cy="16.5" r="1.5"/><path class="ml" d="M20 26 L17 29 M40 26 L43 29"/></svg>`;
  function chase(force) {
    if (!S.el || S.chasing || S.away || S.napTill > now() || (RM.matches && !force)) return false;
    const tr = track(), cw = 345 * S.s, mw = 115 * S.s, fromL = Math.random() < 0.5, dir = fromL ? 1 : -1, win = Math.random() < 0.45;
    const m = document.createElement("div"); m.className = "mun-mouse" + (fromL ? "" : " l"); m.innerHTML = `<i>${MOUSE}</i>`; m.style.bottom = tr.b + "px"; m.style.setProperty("--s", S.s); document.body.appendChild(m);
    S.chasing = true; clearTimeout(S.tm); halt(); pose("sit");      // dừng hẳn lượt đi dở trước, rồi mới lấy vị trí hiện tại (không thì Na Na "dịch chuyển tức thời")
    let mx = fromL ? -mw - 10 : innerWidth + 10, cx = S.x, t0 = performance.now(), last = t0, pauseTill = 0, sniffed = false, vm = 160, v = 0, shout = false, done = false; face(mx + mw / 2 > S.x + cw / 2 ? 1 : -1);
    const end = (caught) => { if (done) return; done = true; S.chasing = false; S.el?.classList.remove("run");
      if (caught) { m.classList.add("poof"); sitDown("groom"); setTimeout(() => say(pick("catch"), 3600, 2), 200); }
      else { sitDown("sit"); setTimeout(() => say(pick("miss"), 3600, 2), 300); }
      setTimeout(() => m.remove(), 400); sched(idle, rnd(6e3, 9e3)); };
    // chuyển động có quán tính (tăng / giảm tốc từ từ) – không giật, không quay đầu loạn xạ
    const step = (t) => {
      if (done) return; if (!S.el || S.away) { m.remove(); S.chasing = false; S.el?.classList.remove("run"); sched(idle, 2000); return; }
      const dt = Math.min(0.05, (t - last) / 1000); last = t; const el = t - t0;
      const mc = mx + mw / 2, cc = cx + cw / 2, gap = Math.abs(mc - cc);
      // chuột: chạy đều; giữa đường dừng ngó 1 lần nếu Na Na còn xa; Na Na đuổi sát thì tăng tốc (hoặc hoảng chạy chậm lại nếu lần này bị bắt)
      if (!sniffed && el > 1100 && mc > innerWidth * 0.3 && mc < innerWidth * 0.7 && gap > 150) { sniffed = true; pauseTill = t + rnd(380, 620); }
      const want = t < pauseTill ? 0 : gap < 130 ? (win ? 150 : 300) : 165;
      vm += (want - vm) * Math.min(1, dt * 7); mx += dir * vm * dt;
      if (!shout && mx > -mw * 0.3 && mx < innerWidth - mw * 0.7) { shout = true; say(pick("chase"), 1500, 1); }
      // Na Na: ngó 0,45 giây rồi phóng theo
      if (el > 450) {
        const d = mc - cw / 2 - cx, tv = Math.abs(d) < 8 ? 0 : Math.sign(d) * Math.min(250, Math.abs(d) * 4);
        v += Math.max(-1000 * dt, Math.min(1000 * dt, tv - v));
        const nx = Math.max(tr.l, Math.min(tr.r, cx + v * dt)); if (nx === cx) v = 0; cx = nx;
        G.v = Math.abs(v); if (Math.abs(v) > 35) { face(v > 0 ? 1 : -1); S.el.classList.toggle("run", Math.abs(v) > 110); if (S.pose !== "walk") pose("walk"); }
        else if (S.pose === "walk" && Math.abs(v) < 12) { S.el.classList.remove("run"); pose("sit"); }
        place(cx);
      }
      m.style.transform = `translate3d(${Math.round(mx)}px,0,0)`;
      if (win && gap < 22 && el > 600) return end(true);
      if (mx > innerWidth + 30 || mx < -mw - 30 || el > 16e3) return end(false);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step); return true;
  }
  // ---------------------------------------------------------------- 🪜 leo cầu thang: các nét cầu thang hiện dần từng nét, Na Na nhảy lên từng bậc, ngồi trên đỉnh ngắm, rồi xuống – cầu thang xoá dần
  function stairs(force) {
    if (!S.el || S.chasing || S.away || S.napTill > now() || (RM.matches && !force)) return false;
    S.chasing = true; clearTimeout(S.tm); halt(); pose("sit");
    const tr = track(), cw = 345 * S.s, k = S.s / 0.235, n = 5, w = Math.round(30 * k), h = Math.round(15 * k), land = Math.round(cw * 0.55), Wd = n * w + land, Ht = n * h;
    const cc = S.x + cw / 2, room = (d) => (d > 0 ? innerWidth - 8 - cc : cc - 8);
    const dir = room(1) >= Wd + 10 ? (room(-1) >= Wd + 10 && Math.random() < 0.5 ? -1 : 1) : room(-1) >= Wd + 10 ? -1 : 0;
    if (!dir) { S.chasing = false; sched(idle, 2000); return false; }
    const x0 = cc + dir * cw * 0.3;      // chân bậc đầu, ngay trước mũi Na Na
    // các nét: đứng (cao h) – ngang (rộng w) … – chiếu nghỉ trên cùng – đứng xuống đất ở cuối
    const P = [[0, 0]]; for (let i = 0; i < n; i++) { P.push([i * w, (i + 1) * h]); P.push([(i + 1) * w, (i + 1) * h]); } P[P.length - 1] = [n * w + land - w, n * h]; P.push([n * w + land - w, 0]);
    const L = P.slice(1).map((q, i) => [P[i], q]), ox = Math.min(0, dir * Wd), X = (u) => (dir > 0 ? u : -u) - ox;
    const svgW = Wd, el = document.createElement("div"); el.className = "mun-st"; el.style.cssText = `left:${Math.round(x0 + ox)}px;bottom:${tr.b}px;width:${svgW}px;height:${Ht + 2}px`;
    el.innerHTML = `<svg ${NS} viewBox="-1 -1 ${svgW + 2} ${Ht + 3}" aria-hidden="true">${L.map(([p0, p1], i) => `<path d="M${X(p0[0])} ${Ht - p0[1]}L${X(p1[0])} ${Ht - p1[1]}" pathLength="1" style="--i:${i};--n:${L.length}"/>`).join("")}</svg>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("in"));
    const drawMs = L.length * 90 + 300;
    // vị trí Na Na theo bậc: tâm Na Na đi theo mặt bậc, mỗi bậc 1 cú nhún
    const posAt = (q) => { const kq = Math.max(0, Math.min(n + 0.6, q));
      if (kq >= n) return [cc + dir * (n * w + ((kq - n) / 0.6) * land * 0.35) - cw / 2, n * h];      // đi ra giữa chiếu nghỉ
      const i = Math.floor(kq), f = kq - i, g = Math.min(1, f / 0.55), up = i * h + h * g, hop = Math.sin(g * Math.PI) * h * 0.35;
      return [cc + dir * kq * w - cw / 2, up + hop]; };
    const setXY = (x, y) => { S.x = x; S.el.style.transition = "none"; S.el.style.transform = `translate3d(${Math.round(x)}px,${-Math.round(y)}px,0)`; };
    let t0 = 0, phase = "draw", q = 0, last = 0;
    const finish = () => { el.classList.add("out"); setTimeout(() => el.remove(), L.length * 70 + 400); S.chasing = false; S.y = 0; setXY(S.x, 0); pose("sit"); sched(idle, rnd(3e3, 6e3)); };
    const abort = () => { el.remove(); S.chasing = false; S.y = 0; if (S.el) { setXY(S.x, 0); pose("sit"); } sched(idle, 2000); };
    const run = (t) => {
      if (!S.el || S.away) return abort();
      if (!t0) { t0 = t; last = t; } const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (phase === "draw") { if (t - t0 > drawMs) { phase = "up"; face(dir); G.v = 2.1 * w; pose("walk"); if (S.cfg.talk !== "q" && Math.random() < 0.6) say(pick("climb"), 2400, 1); } }
      else if (phase === "up") { q += dt * 2.1; const [x, y] = posAt(q); setXY(x, y); if (q >= n + 0.6) { phase = "top"; sitDown("sit"); face(-dir); setTimeout(() => say(pick("top"), 4200, 2), 300); setTimeout(() => { if (phase === "top") pose("groom"); }, 4800); t0 = t; } }
      else if (phase === "top") { if (t - t0 > 9000) { phase = "down"; G.v = 2.4 * w; pose("walk"); face(-dir); q = n + 0.6; } }
      else if (phase === "down") { q -= dt * 2.4; const [x, y] = posAt(q); setXY(x, y); if (q <= 0) return finish(); }
      requestAnimationFrame(run);
    };
    requestAnimationFrame(run); return true;
  }
  // 🖱️ máy tính: rê chuột xuống gần mép dưới → Na Na rình theo con trỏ; để con trỏ đứng yên sát Na Na → vồ. Rình lâu quá thì chán, nghỉ vài phút
  const ST = { on: false, t0: 0, last: 0, mv: 0, px: 0, cool: 0 };
  function stalkEnd(bored) { ST.on = false; if (bored) { if (S.cfg.talk !== "q") say(pick("bored"), 2600, 1); ST.cool = now() + 3 * 60e3; } sched(idle, rnd(2e3, 4e3)); }
  function stalkMove(e) {
    if (e.pointerType !== "mouse" || !S.el || S.away || S.chasing || S.napTill > now() || mob() || RM.matches) return;
    const tr = track(), near = e.clientY > innerHeight - tr.b - 150 * (S.s / 0.28) - 40;
    if (!near) { if (ST.on) stalkEnd(false); return; }
    if (now() < ST.cool) return;
    if (!ST.on) { ST.on = true; ST.t0 = now(); clearTimeout(S.tm); if (S.pose === "sleep") pose("sit"); if (S.cfg.talk !== "q" && Math.random() < 0.5) say(pick("stalk"), 2600, 1); }
    ST.px = e.clientX; ST.mv = now();
    if (now() - ST.t0 > 25e3) return stalkEnd(true);
    if (now() - ST.last > 650) { ST.last = now(); const cw = 345 * S.s, tx = e.clientX - cw / 2; if (Math.abs(tx - S.x) > 30) walkTo(tx, () => pose("sit")); }
  }
  function stalkTick() {
    if (!ST.on || !S.el) return; const cw = 345 * S.s;
    if (now() - ST.mv > 1100 && Math.abs(ST.px - (S.x + cw / 2)) < 60 && S.pose !== "walk") { S.el.classList.remove("hop"); void S.el.offsetWidth; S.el.classList.add("hop"); say(pick("pounce"), 2200, 2); ST.cool = now() + 90e3; stalkEnd(false); }
  }  // ---------------------------------------------------------------- dựng / bật / tắt
  function build() {
    const el = document.createElement("div"); el.id = "mun"; el.className = "mun";
    el.innerHTML = `<div class="mun-say" hidden role="status"><b>${NAME}</b><div class="tx"></div></div><div class="mun-c" role="button" tabindex="0" aria-label="${L("Na Na – mèo trợ lý. Chạm để nói chuyện, vuốt để vuốt lông, giữ lâu để mở menu", "Na Na – assistant cat. Tap to talk, swipe to pet, hold for menu")}"><div class="mun-f">${catSvg(S.cfg.skin)}</div><i class="mun-z">z</i></div>`;
    document.body.appendChild(el); S.el = el; S.s = scale(); el.style.setProperty("--s", S.s); G.R = bind(el.querySelector(".mun-cat"));
    const c = el.querySelector(".mun-c"); let lp = 0, longed = false, x0 = null, y0 = 0, stroked = false;
    c.addEventListener("pointerdown", (e) => { longed = false; stroked = false; x0 = e.clientX; y0 = e.clientY; S.lastPx = e.clientX; S.lastPy = e.clientY; try { c.setPointerCapture(e.pointerId); } catch (er) { /* bỏ qua */ } clearTimeout(lp); lp = setTimeout(() => { longed = true; navigator.vibrate?.(10); menu(); }, 520); });
    c.addEventListener("pointermove", (e) => { if (x0 == null || stroked) return; const dx = e.clientX - x0; if (Math.abs(dx) > 8 || Math.abs(e.clientY - y0) > 8) clearTimeout(lp); if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(e.clientY - y0)) { stroked = true; stroke(dx > 0 ? 1 : -1, e.clientX, e.clientY); } });
    ["pointerup", "pointercancel"].forEach((ev) => c.addEventListener(ev, () => { clearTimeout(lp); x0 = null; }));
    c.addEventListener("click", (e) => { if (longed) { longed = false; return; } if (stroked) { stroked = false; return; } S.lastPx = e.clientX || S.lastPx; S.lastPy = e.clientY || S.lastPy; poke(); });
    c.addEventListener("contextmenu", (e) => { e.preventDefault(); clearTimeout(lp); menu(); });
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poke(); } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); menu(); } });
    face(1); S.pose = "sit"; el.dataset.pose = "sit"; G.P = clone(PO.sit); G.from = null; G.to = PO.sit;
    render(G.R, G.P, { t: 0 }); if (!G.on) { G.on = true; G.last = 0; requestAnimationFrame(loop); }
  }
  let started = false;
  function start() {
    S.cfg = cfgOf(); if (!S.cfg.on) return stop();
    if (S.el) { S.el.querySelector(".mun-f").innerHTML = catSvg(S.cfg.skin); G.R = bind(S.el.querySelector(".mun-cat")); return; }      // đổi bộ đồ
    build(); const tr = track(); const fromL = Math.random() < 0.5;
    place(fromL ? tr.l - 140 : tr.r + 140); S.el.style.opacity = "0";
    requestAnimationFrame(() => { S.el.style.opacity = ""; walkTo(rnd(tr.l + (tr.r - tr.l) * 0.2, tr.l + (tr.r - tr.l) * 0.6), () => {
      if (!lsGet("nana_hi", 0)) { lsSet("nana_hi", 1); say(pick("hi"), 6500, 1); setTimeout(() => say(pick("hi2"), 4500, 1), 7000); S.nextTalk = now() + 3 * 60e3; }
      else S.nextTalk = now() + rnd(0.5, 1.2) * 60e3;
      S.nextMouse = now() + rnd(3, 7) * 60e3; S.nextStairs = now() + rnd(5, 10) * 60e3; S.nextMeow = now() + rnd(1, 3) * 60e3;
      pose("groom"); sched(idle, 5000); }); });
    if (started) return; started = true;
    ["pointerdown", "keydown", "touchend"].forEach((ev) => addEventListener(ev, unlock, { passive: true, capture: true }));
    ["pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach((ev) => addEventListener(ev, () => { S.act = now(); if (S.el && S.pose === "sleep" && !(S.napTill > now())) { pose("sit"); sched(idle, 2500); } }, { passive: true, capture: true }));
    // đổi trang → bình luận theo trang (≈ 60% số lần, cách nhau ≥ 35 giây)
    addEventListener("hashchange", () => { if (!S.el || S.cfg.talk === "q" || S.chasing || NT.cur || now() - (S.navAt || 0) < 35e3 || Math.random() > 0.6) return; S.navAt = now();
      const h = location.hash, k = /^#\/bot/.test(h) ? "p_bot" : /portfolio/.test(h) ? "p_pf" : /plan|paper|live/.test(h) ? "p_trade" : /ideas|radar|coins|pairs|futures|sectors/.test(h) ? "p_opp" : /tax/.test(h) ? "p_tax" : /account|keys/.test(h) ? "p_acc" : /backtest|methods/.test(h) ? "p_journal" : "p_market";
      setTimeout(() => say(pick(k), 4200, 1), 1100); });
    { let sc = 0, st = 0; addEventListener("scroll", () => { const t = now(); if (t - st > 1500) { st = t; sc = 0; } sc++; if (sc > 40 && S.el && S.cfg.talk !== "q" && t - (S.scAt || 0) > 4 * 60e3) { S.scAt = t; say(pick("scroll"), 3200, 1); } }, { passive: true, capture: true }); }
    document.addEventListener("visibilitychange", () => { if (document.hidden) { S.hidAt = now(); return; } if (S.el && S.hidAt && now() - S.hidAt > 10 * 60e3 && S.cfg.talk !== "q") setTimeout(() => { say(pick("back"), 4000, 1); meow(1); }, 900); });
    setInterval(() => { if (!S.el) return; const h = hiddenNow(); if (h !== S.away) { S.away = h; S.el.classList.toggle("away", h); } if (S.napTill && S.napTill < now()) { S.napTill = 0; pose("sit"); sched(idle, 3000); } stalkTick(); }, 400);
    addEventListener("pointermove", stalkMove, { passive: true });
    addEventListener("resize", () => { if (!S.el) return; S.s = scale(); S.el.style.setProperty("--s", S.s); place(S.x); });
    // 📣 thông báo của app: khi Na Na đang hiện → Na Na nói (bóng thoại); không thì thẻ thông báo cũ
    if (typeof window.toast === "function" && !window.toast.__mun) { orig = window.toast; window.toast = function (msg, o) { try { if (canTalkNotify() && !(o && o.raw)) return notify(msg, o || {}); } catch (e) { /* bỏ qua */ } return orig.apply(this, arguments); }; window.toast.__mun = 1; }
  }
  function stop() { clearTimeout(S.tm); halt(); if (S.el) { const el = S.el; S.el = null; NT.q = []; NT.cur = null; el.classList.add("away"); setTimeout(() => el.remove(), 300); } }
  window.MUN = { start, stop, apply: () => { const c = cfgOf(); if (!c.on) stop(); else if (!S.el || c.skin !== S.cfg.skin || c.talk !== S.cfg.talk) { S.cfg = c; start(); } S.cfg = c; if (S.el) { S.s = scale(); S.el.style.setProperty("--s", S.s); place(S.x); } }, say: (t, ms) => say(t, ms, 2), meow: (n) => { unlock(); meow(n || 2); }, chase: () => chase(true), stairs: () => stairs(true), notify,
    _pose: (p) => { S.chasing = true; clearTimeout(S.tm); pose(p); }, _swipe: () => swipe(), _tread: (run, v) => { clearTimeout(S.tm); halt(); S.chasing = true; G.v = v || (run ? 260 : 35); S.el.classList.toggle("run", !!run); G.rn = run ? 1 : 0; pose("walk"); G.v = v || (run ? 260 : 35); }, SKINS };
  // ---------------------------------------------------------------- giao diện
  const st = document.createElement("style"); st.id = "munCss";
  st.textContent = `
.mun{position:fixed;left:0;bottom:0;z-index:40;width:calc(345px*var(--s,.2));height:calc(290px*var(--s,.2));pointer-events:none;will-change:transform;transition:opacity .25s}
.mun.away{opacity:0!important;visibility:hidden;transition:opacity .2s,visibility 0s .2s}
.mun-c{position:absolute;inset:0;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:none;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;outline:none}
.mun-c:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:8px}
.mun-f{position:absolute;inset:0;transform-origin:50% 100%;transition:transform .34s cubic-bezier(.45,0,.25,1)}
.mun[data-face=l] .mun-f{transform:scaleX(-1)}
.mun.hop .mun-f{animation:munHop .32s cubic-bezier(.3,.7,.4,1)}
.mun[data-face=l].hop .mun-f{animation-name:munHopL}
@keyframes munHop{40%{transform:translateY(-6px) scaleY(1.03)}}
@keyframes munHopL{0%,100%{transform:scaleX(-1)}40%{transform:scaleX(-1) translateY(-6px) scaleY(1.03)}}
/* hình mèo: khối đen + mặt cắt tối nhẹ (low-poly), bo góc mềm – nền tối thêm viền sáng mảnh */
.mun-cat{position:absolute;left:0;bottom:calc(-10px*var(--s,.2));width:calc(345px*var(--s,.2));height:calc(300px*var(--s,.2));overflow:visible;
  --f:#0b0b0d;--f3:#1b1c21;--f2:#2e3036;--gold:#C9A45C;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.16))}
:root[data-theme=dark] .mun-cat{--f:#060708;--f3:#17181d;--f2:#25272c;filter:drop-shadow(0 0 .7px rgba(255,255,255,.55)) drop-shadow(0 2px 4px rgba(0,0,0,.5))}
.mun-cat .b,.mun-cat .lg>*{fill:var(--f);stroke:var(--f);stroke-width:3;stroke-linejoin:round}
.mun-cat .far .lg>*{fill:var(--f2);stroke:var(--f2)}
.mun-cat .tlg.tf .b{stroke:#3d3f47;stroke-width:2.4}:root[data-theme=dark] .mun-cat .tlg.tf .b{stroke:#33353c}
.mun-cat .fc{fill:var(--f3)}.mun-cat .fc2{fill:var(--f3);opacity:.7}
.mun-cat .ey{fill:#E4B652}.mun-cat .pu{stroke:#141008;stroke-width:1.8;stroke-linecap:round;fill:none}.mun-cat .lsh{stroke:#8a7650;stroke-width:1.8;stroke-linecap:round;fill:none}
.mun-cat .tg{fill:#EE6A82}.mun-cat .lg .cl{fill:none;stroke:#EDEAE0;stroke-width:2.6;stroke-linecap:round}
.mun-cat .col{fill:var(--gold)}.mun-cat .gem{fill:#7FD1C8;stroke:var(--gold);stroke-width:1.2}
.mun-cat .gl{fill:#232731;stroke:#d5d9e0;stroke-width:1.1;stroke-linejoin:round}.mun-cat .gh{stroke:#fff;stroke-width:1;opacity:.5}.mun-cat .gr{stroke:#d5d9e0;stroke-width:1.2}
.mun-cat .ht{fill:#141417;stroke:#5a5e66;stroke-width:.8;stroke-linejoin:round}.mun-cat .hb{fill:var(--gold)}
.mun-scr{position:fixed;width:48px;height:48px;z-index:96;pointer-events:none}
.mun-scr svg{width:100%;height:100%;overflow:visible}
.mun-scr path{fill:none;stroke:#D64545;stroke-width:3.2;stroke-linecap:round;stroke-dasharray:1 1;stroke-dashoffset:1;animation:munScr .16s ease-out forwards}
.mun-scr path:nth-child(2){animation-delay:.04s}.mun-scr path:nth-child(3){animation-delay:.08s}
.mun-scr.out{opacity:0;transition:opacity .5s}
@keyframes munScr{to{stroke-dashoffset:0}}
.mun-st{position:fixed;z-index:39;pointer-events:none}
.mun-st svg{display:block;width:100%;height:100%;overflow:visible}
.mun-st path{fill:none;stroke:var(--ink-2);stroke-width:2;stroke-linecap:round;stroke-dasharray:1 1;stroke-dashoffset:1;transition:stroke-dashoffset .14s ease-out;transition-delay:calc(var(--i)*90ms)}
.mun-st.in path{stroke-dashoffset:0}
.mun-st.out path{stroke-dashoffset:-1;transition-delay:calc((var(--n) - var(--i))*70ms)}
.mun-mouse{position:fixed;left:0;z-index:40;width:calc(115px*var(--s,.25));height:calc(52px*var(--s,.25));pointer-events:none;will-change:transform}
.mun-mouse>i{display:block;width:100%;height:100%}.mun-mouse.l>i{transform:scaleX(-1)}
.mun-mouse svg{display:block;width:100%;height:100%;overflow:visible;animation:mmBob .13s linear infinite;filter:drop-shadow(0 1px 1px rgba(0,0,0,.18))}
.mun-mouse .ms{fill:#7e838d}.mun-mouse .mi{fill:#c9a7a7}.mun-mouse .me{fill:#111}.mun-mouse .mt,.mun-mouse .ml{fill:none;stroke:#7e838d;stroke-width:2.2;stroke-linecap:round}
:root[data-theme=dark] .mun-mouse .ms{fill:#a3a9b4}:root[data-theme=dark] .mun-mouse .mt,:root[data-theme=dark] .mun-mouse .ml{stroke:#a3a9b4}
.mun-mouse.poof>i{transform:scale(0) rotate(40deg);opacity:0;transition:transform .3s cubic-bezier(.5,0,.8,.4),opacity .3s}
@keyframes mmBob{50%{transform:translateY(-1.5px)}}
.mun-z{position:absolute;left:calc(50% + 100px*var(--s));bottom:calc(80px*var(--s));font:italic 700 11px/1 system-ui;color:var(--ink-3);display:none;pointer-events:none}
.mun[data-face=l] .mun-z{left:auto;right:calc(50% + 100px*var(--s))}
.mun[data-pose=sleep] .mun-z{display:block;animation:munZ 2.6s ease-in infinite}
@keyframes munZ{0%{opacity:0;transform:translate(0,4px) scale(.7)}30%{opacity:.9}100%{opacity:0;transform:translate(8px,-14px) scale(1.15)}}
/* bóng thoại – kính mờ như menu; thông báo = thẻ bấm được trong bóng thoại */
.mun-say{position:absolute;bottom:calc(100% + 8px);left:0;width:max-content;max-width:min(250px,calc(100vw - 16px));padding:7px 11px 8px;border-radius:var(--mn-r,10px);
  background:var(--mn-bg,var(--surface));box-shadow:var(--mn-sh,0 6px 24px rgba(0,0,0,.18));-webkit-backdrop-filter:saturate(1.6) blur(18px);backdrop-filter:saturate(1.6) blur(18px);
  font:500 .78125rem/1.4 "Be Vietnam Pro",system-ui,sans-serif;color:var(--ink);pointer-events:auto;animation:munIn .22s cubic-bezier(.2,.8,.2,1);transform-origin:var(--tx,50%) 100%}
.mun-say>b{display:block;font-size:.65625rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a8874a;margin-bottom:1px}
.mun-say::after{content:"";position:absolute;top:100%;left:var(--tx,50%);margin-left:-6px;border:6px solid transparent;border-top-color:var(--mn-bg,var(--surface));filter:drop-shadow(0 1px 0 rgba(0,0,0,.05))}
.mun-say.out{opacity:0;transform:translateY(4px) scale(.96);transition:opacity .2s,transform .2s}
.mun-say.nt{max-width:min(300px,calc(100vw - 16px));width:min(300px,calc(100vw - 16px));padding:9px 11px 10px;overflow:hidden}
.mun-say .q{display:block;font-style:italic;color:var(--ink-2);margin-bottom:6px}
.mun-say .nc{display:grid;grid-template-columns:24px minmax(0,1fr);gap:9px;align-items:start;padding:8px 9px;border-radius:calc(var(--mn-r,10px) - 3px);background:color-mix(in srgb,var(--ink) 5%,transparent)}
.mun-say .nc.lnk{cursor:pointer}
@media (hover:hover){.mun-say .nc.lnk:hover{background:color-mix(in srgb,var(--ink) 9%,transparent)}}
.mun-say .nc .ic{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;font:700 .75rem/1 system-ui;font-style:normal;color:#fff;background:var(--ink-3)}
.mun-say .t-err .ic{background:var(--down,#d64545)}.mun-say .t-ok .ic{background:var(--up,#1a9b5a)}.mun-say .t-warn .ic{background:#d39a1c}.mun-say .t-info .ic{background:var(--brand,#333)}
.mun-say .nc .m b{display:block;font-weight:650;color:var(--ink);text-transform:none;letter-spacing:0;font-size:.8125rem;line-height:1.35}.mun-say .nc .m small{display:block;color:var(--ink-2);font-size:.75rem;margin-top:2px}
.mun-say .na{display:flex;align-items:center;gap:6px;margin-top:8px}.mun-say .na .e{flex:1;min-width:0;color:var(--ink-3);font-size:.71875rem;font-style:italic}
.mun-say .na button{font:600 .75rem/1 inherit;font-family:inherit;padding:7px 10px;border-radius:var(--mn-ir,7px);border:0;cursor:pointer;color:var(--ink);background:color-mix(in srgb,var(--ink) 8%,transparent)}
.mun-say .na .go{color:#fff;background:var(--brand,#111)}
.mun-say .tp{position:absolute;left:0;right:0;bottom:0;height:2px;background:#a8874a;transform-origin:left;animation:munTp linear forwards;opacity:.6}
.mun-say.hold .tp{animation-play-state:paused}
@keyframes munTp{to{transform:scaleX(0)}}
@keyframes munIn{from{opacity:0;transform:translateY(6px) scale(.94)}}
@media (prefers-reduced-motion:reduce){.mun-z,.mun-say{animation:none!important}}
@media print{.mun{display:none}}`;
  document.head.appendChild(st);
})();
