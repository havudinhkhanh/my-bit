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
    ["measure", "Thước đo – % thay đổi, số nến", ic('<path d="M4 20 20 4"/><path d="m7 17 2 2M10 14l2 2M13 11l2 2M16 8l2 2"/>')],
    ["pen", "Bút vẽ tự do", ic('<path d="M4 20c3-1 4-5 7-6s4 3 6 2 2-6 3-8"/>')],
    ["text", "Ghi chú chữ", ic('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>')],
  ];
  const TWO = new Set(["trend", "ray", "fib", "rect", "measure"]);
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
    // ---- vẽ
    const lbl = (g, x, y, txt, col, anchor = "start", bg = true) => {
      const t = el2("text", { x, y, fill: col, "font-size": 10.5, "text-anchor": anchor, "dominant-baseline": "middle", class: "cd-lb" }, g); t.textContent = txt;
      if (bg) { try { const b = t.getBBox(); g.insertBefore(el2("rect", { x: b.x - 3, y: b.y - 1, width: b.width + 6, height: b.height + 2, rx: 3, class: "cd-lbg" }), t); } catch (e) { /* chưa hiển thị */ } }
    };
    const render = () => {
      if (!svg.isConnected || !el.isConnected) return cleanup();
      const P = pane(); svg.setAttribute("width", P.w); svg.setAttribute("height", P.h); svg.style.left = P.lw + "px";
      svg.textContent = "";
      const defs = el2("defs", {}, svg), cp = el2("clipPath", { id: "cdc" + uid }, defs); el2("rect", { x: 0, y: 0, width: P.w, height: P.h }, cp);
      const root = el2("g", { "clip-path": `url(#cdc${uid})` }, svg);
      const list = st.hide ? [] : D.slice(); if (st.draft) list.push(st.draft);
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
            lbl(g, x1 + 4, y - 7, `${l} · ${fmt(p2 + (p1 - p2) * l)}`, col, "start", false); });
        } else if (d.k === "measure") {
          const up = d.p[1].p >= d.p[0].p, cc = up ? "#2FBF71" : "#F0525F";
          el2("rect", { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), fill: cc, "fill-opacity": 0.13, stroke: cc, "stroke-width": 1 }, g);
          el2("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: cc, "stroke-width": 1, "stroke-dasharray": "4 3" }, g);
          const bars = Math.round(t2l(d.p[1].t) - t2l(d.p[0].t)), ch = (d.p[1].p / d.p[0].p - 1) * 100;
          lbl(g, (a.x + b.x) / 2, (up ? Math.min(a.y, b.y) : Math.max(a.y, b.y)) + (up ? -12 : 12), `${nfp(ch)} · ${fmt(d.p[1].p - d.p[0].p)} · ${Math.abs(bars)} nến`, cc, "middle");
        } else if (d.k === "pen") {
          el2("polyline", { points: pts.map((q) => `${q.x},${q.y}`).join(" "), fill: "none", stroke: col, "stroke-width": W + 0.4 }, g);
        } else if (d.k === "text") {
          const t = el2("text", { x: a.x, y: a.y, fill: col, "font-size": 12.5, "font-weight": 600, "dominant-baseline": "middle", class: "cd-tx" }, g); t.textContent = d.txt || "";
        }
        if (d === st.sel && d.k !== "pen") pts.forEach((q) => { if (isFinite(q.x) || d.k === "hline") el2("circle", { cx: isFinite(q.x) ? q.x : P.w / 2, cy: isFinite(q.y) ? q.y : P.h / 2, r: 4.5, class: "cd-h", stroke: col }, g); });
      }
    };
    const uid = Math.random().toString(36).slice(2, 8);
    const draw = () => { try { render(); } catch (e) { cleanup(); svg.remove(); tb.remove(); } };
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
    const setTool = (k) => { st.tool = k; st.draft = null; $$b("[data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === k)); svg.classList.toggle("on", k !== "cur"); req(); };
    const $$b = (q) => [...tb.querySelectorAll(q)];
    const finish = (d) => { st.draft = null; if (d) { D.push(d); st.sel = d; save(); } if (btn) btn.classList.toggle("has", D.length > 0); setTool("cur"); };
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
      st.draft = { k: st.tool, p: [P0, { ...P0 }], c: st.color }; st.drag = { two: true, x0: q.x, y0: q.y }; svg.setPointerCapture(ev.pointerId); req();
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
      if (st.tool !== "cur" || ev.target.closest?.(".cd-tb,.cd-in,.cd-tg,.cbt") || (ev.button != null && ev.button !== 0)) return;
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
    tb.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      if (b.dataset.t) return setTool(st.tool === b.dataset.t && b.dataset.t !== "cur" ? "cur" : b.dataset.t);
      if (b.dataset.c) { st.color = b.dataset.c; cfg.set("draw_color", st.color); tb.querySelector(".cd-col i").style.background = st.color; tb.querySelector(".cd-pal").hidden = true; if (st.sel) { st.sel.c = st.color; save(); } return req(); }
      const a = b.dataset.a;
      if (a === "col") tb.querySelector(".cd-pal").hidden = !tb.querySelector(".cd-pal").hidden;
      else if (a === "mag") { st.mag = !st.mag; cfg.set("draw_mag", st.mag); b.classList.toggle("on", st.mag); }
      else if (a === "hide") { st.hide = !st.hide; b.classList.toggle("on", st.hide); req(); }
      else if (a === "del") {
        if (st.sel) { D = D.filter((d) => d !== st.sel); st.sel = null; }
        else if (D.length && confirm(`Xoá hết ${D.length} hình đã vẽ trên biểu đồ này?`)) D = [];
        save(); if (btn) btn.classList.toggle("has", D.length > 0); req();
      }
    });
    const key = (e) => {
      if (OPEN_TB !== inst || !el.isConnected || /input|textarea|select/i.test(document.activeElement?.tagName || "")) return;
      if (e.key === "Escape") { if (st.draft || st.tool !== "cur") { setTool("cur"); e.stopPropagation(); } else if (st.sel) { st.sel = null; req(); } }
      if ((e.key === "Delete" || e.key === "Backspace") && st.sel) { D = D.filter((d) => d !== st.sel); st.sel = null; save(); if (btn) btn.classList.toggle("has", D.length > 0); req(); e.preventDefault(); }
    };
    document.addEventListener("keydown", key, true);
    // ---- vẽ lại khi biểu đồ thay đổi (cuộn, phóng, đổi kích thước, kéo trục giá)
    const onRange = () => req(), onCross = () => req();
    ts.subscribeVisibleLogicalRangeChange(onRange); c.subscribeCrosshairMove(onCross);
    const ro = new ResizeObserver(() => pump(200)); ro.observe(el);
    const wake = () => pump(); el.addEventListener("wheel", wake, { passive: true }); el.addEventListener("pointerdown", wake); el.addEventListener("pointerup", wake);
    let dead = false;
    function cleanup() { if (dead) return; dead = true; el.removeEventListener("pointerdown", down, true); el.removeEventListener("mousedown", block, true); el.removeEventListener("touchstart", block, true); try { ro.disconnect(); ts.unsubscribeVisibleLogicalRangeChange(onRange); c.unsubscribeCrosshairMove(onCross); } catch (e) { /* biểu đồ đã huỷ */ } document.removeEventListener("keydown", key, true); if (OPEN_TB === inst) OPEN_TB = null; }
    const inst = { c, toggle, render: req, alive: () => svg.isConnected, destroy: () => { cleanup(); svg.remove(); tb.remove(); }, get count() { return D.length; } };
    el._cd = inst;
    setTool("cur"); draw(); setTimeout(req, 60); setTimeout(req, 400);
    if (cfg.open) openTb(true);
    return inst;
  }
  window.CDRAW = { attach };
})();
