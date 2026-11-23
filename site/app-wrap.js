// ================================================================ 🖼️ ẢNH KẾT QUẢ NGÀY + ✨ TỔNG KẾT THÁNG (kiểu "Wrapped") của bot
// Tải khi cần (lazyJs) từ trang Kết quả & sổ lệnh. Chỉ dùng số liệu đã có trên trang (sổ ngày, lệnh trong ngày, % đã khử nạp/rút) – không gọi máy chủ.
// Mọi câu chữ chỉ nêu sự kiện đã qua, không phải lời khuyên mua / bán. Gói: ảnh ngày Free có hình mờ, Pro sạch ("sharecard"); tổng kết tháng đầy đủ = Pro ("wrapped").
(() => {
  const ST = { hook: ["🪝", "Bắt râu sập", "Wick Catcher"], sec: ["⚡", "Lướt giây", "Scalp"], man: ["✋", "Lệnh tay", "Manual"], pump: ["🧪", "Short coin vừa bơm", "Pump short"], list: ["🧪", "Short coin mới niêm yết", "New-listing short"], hist: ["📜", "Lịch sử sàn", "Exchange history"] };
  const stN = (k) => { const s = ST[k] || ["🧪", k, k]; return `${s[0]} ${bi(s[1], s[2])}`; };
  const ENVN = { live: ["Binance · tiền thật", "Binance · live"], demo: ["Binance · Demo", "Binance · Demo"], paper: ["Sàn thử (giả lập)", "Paper (simulated)"] };
  const ok = (f) => typeof can !== "function" || can(f) || ME?.eff_plan === "pro";
  const sgn = (v, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), d)}`;
  const money = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}$${nf(Math.abs(v), Math.abs(v) >= 1000 ? 0 : 2)}`;
  const coinOf = (k) => String(k || "").split(":")[0].replace(/USDT$/, "");
  const MON = (ym) => { const [y, m] = ym.split("-"); return bi(`Tháng ${+m}/${y}`, new Date(Date.UTC(+y, +m - 1, 15)).toLocaleDateString("en", { month: "long", year: "numeric" })); };
  const DOW = (d) => new Date(d + "T12:00:00Z").toLocaleDateString(LOC, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

  // ---------------------------------------------------------------- số liệu
  function dayStats(D, d) {
    const x = D.days[d] || {}, T = (D.dtr[d] || []).slice().sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1)), p = D.PF[d] || {};
    let c = 0; const line = [0, ...T.map((t) => (c += +t[4] || 0))];
    const cm = {}; for (const t of T) { const k = coinOf(t[1]); cm[k] = (cm[k] || 0) + (+t[4] || 0); }
    const best = Object.entries(cm).sort((a, b) => b[1] - a[1])[0] || null;
    const by = Object.entries(x.by || {}).filter(([, b]) => b?.n).sort((a, b) => b[1].n - a[1].n);
    return { d, usd: x.usd || 0, r: isNum(p.r) ? p.r : null, n: x.n || T.length, win: x.win ?? T.filter((t) => t[4] > 0).length, line: line.length > 2 ? line : null, best, top: by[0]?.[0] || null };
  }
  function monStats(D, ym) {
    const ks = D.keys.filter((d) => d.startsWith(ym) && ((D.days[d]?.n || 0) > 0 || Math.abs(D.days[d]?.usd || 0) > 0.005));
    let cr = 1, anyR = false, cum = 0, pk = 0, mdd = 0, st = 0, stMax = 0; const line = [0], cm = {}, cn = {}, hr = new Array(24).fill(0), byM = {};
    let n = 0, win = 0, usd = 0, best = null, worst = null, green = 0;
    for (const d of ks) {
      const x = D.days[d] || {}, r = D.PF[d]?.r, u = x.usd || 0;
      if (isNum(r)) { cr *= 1 + r; anyR = true; }
      n += x.n || 0; win += x.win || 0; usd += u; cum += u; line.push(cum); pk = Math.max(pk, cum); mdd = Math.min(mdd, cum - pk);
      if (u > 0) { green++; st++; stMax = Math.max(stMax, st); } else st = 0;
      const v = isNum(r) ? r : null, key = v ?? u;
      if (!best || key > best.k) best = { d, r: v, usd: u, k: key };
      if (!worst || key < worst.k) worst = { d, r: v, usd: u, k: key };
      for (const t of D.dtr[d] || []) { const k = coinOf(t[1]); cm[k] = (cm[k] || 0) + (+t[4] || 0); cn[k] = (cn[k] || 0) + 1; const h = +String(t[0]).slice(0, 2); if (h >= 0 && h < 24) hr[h]++; }
      for (const [k, b] of Object.entries(x.by || {})) if (b?.n) { const m = (byM[k] ||= { n: 0, usd: 0 }); m.n += b.n; m.usd += b.usd || 0; }
    }
    const cE = Object.entries(cm), topCoin = cE.sort((a, b) => b[1] - a[1])[0] || null, busyCoin = Object.entries(cn).sort((a, b) => b[1] - a[1])[0] || null;
    const hMax = Math.max(...hr), peakH = hMax > 0 ? hr.indexOf(hMax) : null, meth = Object.entries(byM).sort((a, b) => b[1].n - a[1].n);
    return { ym, ks, days: ks.length, n, win, usd, r: anyR ? cr - 1 : null, best, worst, green, stMax, mdd, line: line.length > 2 ? line : null, topCoin, busyCoin, peakH, hr, meth };
  }

  // ---------------------------------------------------------------- vẽ ảnh 1080×1350 (4:5 – đăng Zalo / Facebook / Instagram đều vừa)
  async function catImg() {
    try { await lazyJs("mascot.js"); const s = window.MUN_ART?.preview?.((UIP?.mun?.skin) || "classic", "sit"); if (!s) return null;
      const svg = typeof s === "string" ? s : s.outerHTML, url = URL.createObjectURL(new Blob([svg.includes("xmlns") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')], { type: "image/svg+xml" }));
      const im = new Image(); await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = url; }); return im; } catch (e) { return null; }
  }
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  async function drawCard(o) {
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const F = '"Be Vietnam Pro", system-ui, sans-serif';
    try { await Promise.all(["400", "600", "800"].map((w) => document.fonts.load(`${w} 40px "Be Vietnam Pro"`))); } catch (e) { /* bỏ qua */ }
    const dark = o.theme !== "light", up = (o.v ?? 0) >= 0;
    const P = dark ? { bg0: "#0A0F17", bg1: "#121B29", ink: "#EEE8DB", ink2: "#A6AFBC", ink3: "#6E7A8B", card: "rgba(255,255,255,.045)", line: "rgba(255,255,255,.08)" }
      : { bg0: "#F7F4EE", bg1: "#ECE7DC", ink: "#141B26", ink2: "#4E5867", ink3: "#8A93A1", card: "rgba(20,27,38,.04)", line: "rgba(20,27,38,.08)" };
    const ACC = getComputedStyle(document.documentElement).getPropertyValue("--brass").trim() || "#CBA765", UP = dark ? "#3DD598" : "#0B8A5C", DN = dark ? "#F2646A" : "#D23439", K = up ? UP : DN;
    // nền: chuyển màu + 1 vầng sáng theo màu kết quả
    let gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, P.bg1); gr.addColorStop(1, P.bg0); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    gr = g.createRadialGradient(W * 0.86, 120, 20, W * 0.86, 120, 760); gr.addColorStop(0, K + (dark ? "3A" : "2A")); gr.addColorStop(1, K + "00"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    gr = g.createRadialGradient(80, H - 80, 10, 80, H - 80, 620); gr.addColorStop(0, ACC + "24"); gr.addColorStop(1, ACC + "00"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // đầu ảnh: thương hiệu · nơi chạy
    g.fillStyle = ACC; g.beginPath(); g.arc(92, 108, 13, 0, 7); g.fill();
    g.fillStyle = P.ink; g.font = `800 40px ${F}`; g.textBaseline = "middle"; g.fillText("MyBit", 120, 110);
    g.font = `600 26px ${F}`; const et = o.env || "", ew = g.measureText(et).width + 44; rr(g, W - 72 - ew, 84, ew, 52, 26); g.fillStyle = P.card; g.fill(); g.strokeStyle = P.line; g.lineWidth = 2; g.stroke(); g.fillStyle = P.ink2; g.fillText(et, W - 72 - ew + 22, 111);
    // tiêu đề
    g.fillStyle = P.ink2; g.font = `600 34px ${F}`; g.fillText(o.kicker || "", 72, 230);
    g.fillStyle = P.ink; g.font = `800 52px ${F}`; g.fillText(o.title || "", 72, 292);
    // số lớn
    g.fillStyle = K; g.font = `800 ${o.big && o.big.length > 8 ? 150 : 190}px ${F}`; g.fillText(o.big || "—", 64, 470);
    g.fillStyle = P.ink2; g.font = `500 32px ${F}`; g.fillText(o.bigSub || "", 72, 586);
    // đường lời/lỗ cộng dồn
    if (o.line && o.line.length > 1) {
      const x0 = 72, x1 = W - 72, y0 = 650, y1 = 900, mn = Math.min(0, ...o.line), mx = Math.max(0, ...o.line), sp = mx - mn || 1, X = (i) => x0 + (x1 - x0) * i / (o.line.length - 1), Y = (v) => y1 - (y1 - y0) * (v - mn) / sp;
      g.strokeStyle = P.line; g.lineWidth = 2; g.setLineDash([6, 8]); g.beginPath(); g.moveTo(x0, Y(0)); g.lineTo(x1, Y(0)); g.stroke(); g.setLineDash([]);
      g.beginPath(); o.line.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
      const ln = new Path2D(); o.line.forEach((v, i) => (i ? ln.lineTo(X(i), Y(v)) : ln.moveTo(X(i), Y(v))));
      g.lineTo(x1, y1); g.lineTo(x0, y1); g.closePath(); gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, K + "55"); gr.addColorStop(1, K + "00"); g.fillStyle = gr; g.fill();
      g.strokeStyle = K; g.lineWidth = 6; g.lineJoin = "round"; g.lineCap = "round"; g.stroke(ln);
      const li = o.line.length - 1; g.fillStyle = K; g.beginPath(); g.arc(X(li), Y(o.line[li]), 11, 0, 7); g.fill(); g.strokeStyle = P.bg0; g.lineWidth = 4; g.stroke();
    }
    // 4 ô số liệu
    const S = (o.stats || []).slice(0, 4), cw = (W - 144 - 24) / 2, ch = 118;
    S.forEach(([lab, val], i) => { const x = 72 + (i % 2) * (cw + 24), y = 940 + Math.floor(i / 2) * (ch + 20);
      rr(g, x, y, cw, ch, 26); g.fillStyle = P.card; g.fill(); g.strokeStyle = P.line; g.lineWidth = 2; g.stroke();
      g.fillStyle = P.ink3; g.font = `600 26px ${F}`; g.fillText(lab, x + 28, y + 40);
      g.fillStyle = P.ink; g.font = `800 40px ${F}`; let v = String(val); while (g.measureText(v).width > cw - 56 && v.length > 4) v = v.slice(0, -2) + "…"; g.fillText(v, x + 28, y + 84); });
    // chân ảnh: mèo na + lời nhắc
    const cat = await catImg(); if (cat) { try { const cw2 = 104, chh = Math.round(cw2 * (cat.height / cat.width || 1)), o2 = document.createElement("canvas"); o2.width = cw2; o2.height = chh; const q = o2.getContext("2d");
      q.drawImage(cat, 0, 0, cw2, chh); q.globalCompositeOperation = "source-in"; q.fillStyle = dark ? "#D8CFBE" : "#1B2330"; q.fillRect(0, 0, cw2, chh);      // mèo đen trên nền tối không thấy → tô cùng màu chữ
      g.globalAlpha = 0.9; g.drawImage(o2, W - 72 - cw2, H - 30 - chh); g.globalAlpha = 1; } catch (e) { /* bỏ qua */ } }
    g.fillStyle = P.ink3; g.font = `500 24px ${F}`; g.fillText(bi("Kết quả đã qua · không phải lời khuyên mua / bán", "Past results · not investment advice"), 72, H - 74);
    // gói Free: hình mờ chéo + dòng chân
    if (o.mark) { g.save(); g.translate(W / 2, H / 2); g.rotate(-0.42); g.fillStyle = dark ? "rgba(255,255,255,.06)" : "rgba(20,27,38,.06)"; g.font = `800 120px ${F}`; g.textAlign = "center";
      for (let k = -2; k <= 2; k++) g.fillText("MyBit · Free", 0, k * 270); g.restore();
      g.fillStyle = ACC; g.font = `700 24px ${F}`; g.fillText(bi("Tạo bằng MyBit · Free", "Made with MyBit · Free"), 72, H - 116); }
    return c;
  }

  // ---------------------------------------------------------------- bảng xem trước + tải / chia sẻ
  async function shareSheet(title, build) {
    const S = { hide: lsGet("shHide", true), theme: lsGet("shTheme", "dark") }; let cv = null;
    const opts = () => `<div class="shc-o"><label><input type="checkbox" class="acp-sw" data-shh ${S.hide ? "checked" : ""}> ${bi("Ẩn số tiền (chỉ hiện %)", "Hide amounts (% only)")}</label>
      <div class="th-seg shc-t" role="radiogroup">${[["dark", bi("Tối", "Dark")], ["light", bi("Sáng", "Light")]].map(([k, t]) => `<button type="button" role="radio" aria-checked="${S.theme === k}" data-sht="${k}">${t}</button>`).join("")}</div></div>`;
    const P = iosSheet({ title, body: `<div class="shc"><div class="shc-p busy"><i class="shc-sp" aria-hidden="true"></i><img alt="" hidden></div>${opts()}${ok("sharecard") ? "" : `<p class="shc-free faint">${bi("Gói Free có hình mờ MyBit. ★ Pro: ảnh sạch.", "Free plan adds a MyBit watermark. ★ Pro: clean image.")}</p>`}<div class="shc-a" hidden><button type="button" class="btn" data-shs hidden>${bi("↗ Chia sẻ", "↗ Share")}</button><button type="button" class="btn" data-shcp hidden>${bi("⧉ Sao chép ảnh", "⧉ Copy image")}</button></div></div>`, ok: bi("⬇ Tải ảnh", "⬇ Download"), cancel: bi("Đóng", "Close") });
    const box = () => document.getElementById("iosSheet");
    const draw = async () => { const m = box(); if (!m) return; const im = m.querySelector(".shc-p img"); m.querySelector(".shc-p").classList.add("busy"); cv = await build(S); im.src = cv.toDataURL("image/png"); im.hidden = false; m.querySelector(".shc-p").classList.remove("busy"); };
    const bind = () => { const m = box(); if (!m) return;
      m.querySelector("[data-shh]").onchange = (e) => { S.hide = e.target.checked; lsSet("shHide", S.hide); draw(); };
      m.querySelectorAll("[data-sht]").forEach((b) => (b.onclick = () => { S.theme = b.dataset.sht; lsSet("shTheme", S.theme); m.querySelectorAll("[data-sht]").forEach((x) => x.setAttribute("aria-checked", x === b)); draw(); }));
      const fileOf = () => new Promise((r) => cv.toBlob((bl) => r(new File([bl], "mybit-ket-qua.png", { type: "image/png" })), "image/png"));
      const sh = m.querySelector("[data-shs]"); if (navigator.canShare) { sh.hidden = false; sh.parentElement.hidden = false; sh.onclick = async () => { try { const f = await fileOf(); if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: "MyBit" }); } catch (e) { /* người dùng huỷ */ } }; }
      const cp = m.querySelector("[data-shcp]"); if (window.ClipboardItem && navigator.clipboard?.write) { cp.hidden = false; cp.parentElement.hidden = false; cp.onclick = async () => { try { const f = await fileOf(); await navigator.clipboard.write([new ClipboardItem({ "image/png": f })]); toast(bi("Đã sao chép ảnh", "Image copied")); } catch (e) { toast(bi("Trình duyệt chưa cho sao chép ảnh", "This browser can't copy images")); } }; } };
    requestAnimationFrame(() => { bind(); draw(); });
    if (await P && cv) { const a = document.createElement("a"); a.download = `mybit-${Date.now()}.png`; a.href = cv.toDataURL("image/png"); a.click(); }
  }

  window.wrapShareDay = (D, d) => {
    const s = dayStats(D, d), env = ENVN[D.env] || ENVN.paper;
    return shareSheet(bi("🖼 Ảnh kết quả ngày", "🖼 Daily result image"), (S) => drawCard({ theme: S.theme, mark: !ok("sharecard"), env: bi(env[0], env[1]),
      kicker: DOW(d), title: bi("Kết quả bot trong ngày", "Bot result of the day"), v: s.r ?? s.usd,
      big: isNum(s.r) ? `${sgn(s.r * 100)}%` : S.hide ? (s.usd >= 0 ? bi("Ngày lời", "Green day") : bi("Ngày lỗ", "Red day")) : money(s.usd),
      bigSub: isNum(s.r) ? (S.hide ? bi("so với tài sản đầu ngày", "vs. start-of-day equity") : `${money(s.usd)} · ${bi("so với tài sản đầu ngày", "vs. start-of-day equity")}`) : bi("lời/lỗ đã chốt trong ngày", "realised P&L of the day"),
      line: s.line, stats: [[bi("Số lệnh", "Trades"), nf(s.n, 0)], [bi("Lệnh thắng", "Winners"), s.n ? `${s.win}/${s.n} · ${nf(s.win / s.n * 100, 0)}%` : "—"],
        [bi("Coin tốt nhất", "Best coin"), s.best ? `${s.best[0]}${S.hide ? "" : " " + money(s.best[1])}` : "—"], [bi("Phương pháp", "Method"), s.top ? stN(s.top).replace(/^\S+\s/, "") : "—"]] }));
  };

  // ---------------------------------------------------------------- ✨ TỔNG KẾT THÁNG – story toàn màn hình (chạm / phím → để qua thẻ, ← để lùi, Esc đóng)
  const naSay = (m) => {
    const wr = m.n ? m.win / m.n : 0;
    if (!m.n) return bi("Tháng này bot chưa vào lệnh nào. Ngồi chờ cũng là một kỹ năng.", "No trades this month. Waiting is a skill too.");
    if (m.mdd < 0 && Math.abs(m.mdd) > Math.abs(m.usd) && m.usd > 0) return bi("Có lúc sụt sâu hơn cả phần lời cuối tháng. na ghi lại để anh xem lại mức rủi ro.", "At one point the drawdown was larger than the month's final profit – noted for your risk review.");
    if (wr >= 0.6) return bi(`Thắng ${nf(wr * 100, 0)}% số lệnh. na chỉ ghi nhận – tháng sau thị trường có thể khác.`, `${nf(wr * 100, 0)}% winners. Just a record – next month may differ.`);
    if (m.usd < 0) return bi("Tháng lỗ. Bot vẫn giữ đúng luật cắt lỗ – na ghi nhận, không phán xét.", "A red month. The bot kept its stop rules – noted, not judged.");
    return bi("Lời lỗ đan xen, kỷ luật vẫn giữ. na ghi nhận.", "Mixed results, discipline kept. Noted.");
  };
  window.wrapMonth = async (D, ym) => {
    const m = monStats(D, ym), env = ENVN[D.env] || ENVN.paper, pro = ok("wrapped"), up = (m.r ?? m.usd) >= 0;
    let cat = ""; try { await lazyJs("mascot.js"); const s = window.MUN_ART?.preview?.((UIP?.mun?.skin) || "classic", "sit"); cat = typeof s === "string" ? s : s?.outerHTML || ""; } catch (e) { /* bỏ qua */ }
    const hrT = (h) => (h == null ? "—" : `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`);
    const bar = m.hr.map((v) => `<i style="--h:${Math.round(v / (Math.max(...m.hr) || 1) * 100)}%"></i>`).join("");
    const big = isNum(m.r) ? `${sgn(m.r * 100)}%` : money(m.usd);
    const slides = [
      `<div class="wr-s wr-i"><small>${bi(env[0], env[1])}</small><h2>${MON(ym)}</h2><p>${bi("của Bot Phản Xạ", "with Bot Phản Xạ")}</p><div class="wr-cat">${cat || "🐈‍⬛"}</div><p class="wr-m"><b data-wn="${m.n}">${nf(m.n, 0)}</b> ${bi("lệnh", "trades")} · <b>${m.days}</b> ${bi("ngày có lệnh", "active days")}</p></div>`,
      `<div class="wr-s ${up ? "up" : "dn"}"><small>${bi("Cả tháng", "The month")}</small><h2 class="wr-big">${big}</h2><p>${isNum(m.r) ? `${money(m.usd)} · ${bi("đã khử tiền nạp / rút", "net of deposits / withdrawals")}` : bi("lời/lỗ đã chốt", "realised P&L")}</p>
        <div class="wr-k"><span><b>${m.n ? nf(m.win / m.n * 100, 0) : "—"}%</b><small>${bi("lệnh thắng", "winners")}</small></span><span><b>${m.green}/${m.days}</b><small>${bi("ngày lời", "green days")}</small></span><span><b>${m.stMax}</b><small>${bi("chuỗi ngày lời dài nhất", "longest green streak")}</small></span></div></div>`,
      `<div class="wr-s"><small>${bi("Ngày đáng nhớ", "Days to remember")}</small>${m.best ? `<div class="wr-d up"><em>${bi("Ngày tốt nhất", "Best day")}</em><b>${ddmm(m.best.d)}</b><span>${isNum(m.best.r) ? `${sgn(m.best.r * 100)}%` : money(m.best.usd)}</span></div>` : ""}${m.worst && m.worst.d !== m.best?.d ? `<div class="wr-d dn"><em>${bi("Ngày khó nhất", "Toughest day")}</em><b>${ddmm(m.worst.d)}</b><span>${isNum(m.worst.r) ? `${sgn(m.worst.r * 100)}%` : money(m.worst.usd)}</span></div>` : ""}<p class="faint">${bi("Sụt sâu nhất trong tháng", "Deepest dip of the month")}: <b>${money(m.mdd)}</b></p></div>`,
      `<div class="wr-s"><small>${bi("Coin của tháng", "Coins of the month")}</small>${m.topCoin ? `<div class="wr-c"><em>${bi("Đem lại nhiều nhất", "Most profitable")}</em><b>${esc(m.topCoin[0])}</b><span class="${m.topCoin[1] >= 0 ? "up" : "dn"}">${money(m.topCoin[1])}</span></div>` : `<p>${bi("Chưa có chi tiết lệnh theo coin.", "No per-coin detail yet.")}</p>`}${m.busyCoin ? `<div class="wr-c"><em>${bi("Vào nhiều lần nhất", "Traded most often")}</em><b>${esc(m.busyCoin[0])}</b><span>${m.busyCoin[1]} ${bi("lệnh", "trades")}</span></div>` : ""}</div>`,
      `<div class="wr-s"><small>${bi("Nhịp của bot", "Bot rhythm")}</small><h3>${bi("Giờ bận nhất", "Busiest hour")}</h3><h2>${hrT(m.peakH)}</h2><div class="wr-h" aria-hidden="true">${bar}</div><p class="faint">${bi("Số lệnh theo giờ Việt Nam, 0h → 23h", "Trades by Vietnam hour, 0 → 23")}</p>${m.meth[0] ? `<p>${bi("Chạy nhiều nhất", "Most used")}: <b>${stN(m.meth[0][0])}</b> · ${m.meth[0][1].n} ${bi("lệnh", "trades")}</p>` : ""}</div>`,
      `<div class="wr-s wr-e"><div class="wr-cat sm">${cat || "🐈‍⬛"}</div><blockquote>${naSay(m)}</blockquote><button type="button" class="btn primary" data-wrimg>${bi("🖼 Lưu ảnh tổng kết", "🖼 Save summary image")}</button><p class="faint">${bi("Kết quả đã qua · không phải lời khuyên mua / bán", "Past results · not investment advice")}</p></div>`];
    const S = pro ? slides : [slides[0], `<div class="wr-s wr-lock"><div class="wr-blur">${slides[1]}</div><div class="wr-up"><b>★ ${bi("Tổng kết tháng đầy đủ là tính năng Pro", "The full monthly wrap is a Pro feature")}</b><p>${bi("Kết quả cả tháng, ngày đáng nhớ, coin của tháng, nhịp bot và ảnh để chia sẻ.", "Month result, standout days, coins of the month, bot rhythm and a shareable image.")}</p><a class="btn primary" href="#/account">${bi("Xem các gói", "See plans")}</a></div></div>`];
    document.getElementById("wrap")?.remove();
    const el = document.createElement("div"); el.id = "wrap"; el.className = `wr ${up ? "up" : "dn"}`; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", bi("Tổng kết tháng", "Monthly wrap"));
    el.innerHTML = `<div class="wr-in"><div class="wr-pg">${S.map(() => "<i><b></b></i>").join("")}</div><button type="button" class="wr-x" aria-label="${bi("Đóng", "Close")}">✕</button><div class="wr-st"></div><button type="button" class="wr-nav l" aria-label="${bi("Thẻ trước", "Previous")}"></button><button type="button" class="wr-nav r" aria-label="${bi("Thẻ sau", "Next")}"></button></div>`;
    document.body.appendChild(el); document.body.classList.add("wr-on");
    const st = el.querySelector(".wr-st"), pg = [...el.querySelectorAll(".wr-pg i")], DUR = 6000; let i = -1;
    // thời gian mỗi thẻ do chính thanh tiến trình (CSS) đếm: hết thanh → sang thẻ sau; giữ ngón tay = dừng thanh (animation-play-state) → tạm dừng đúng chỗ
    pg.forEach((p, j) => p.firstChild.addEventListener("animationend", () => { if (j === i && i < S.length - 1) go(i + 1); }));
    const close = () => { removeEventListener("keydown", kd); el.classList.add("out"); document.body.classList.remove("wr-on"); setTimeout(() => el.remove(), 260); };
    const go = (k) => { if (k < 0) k = 0; if (k >= S.length) return close(); i = k;
      st.innerHTML = S[i]; st.firstElementChild?.classList.add("in");
      pg.forEach((p, j) => { p.className = j < i ? "done" : j === i ? "run" : ""; p.firstChild.style.animationDuration = DUR + "ms"; });
      const wi = st.querySelector("[data-wrimg]"); if (wi) wi.onclick = () => { close(); shareSheet(bi("🖼 Ảnh tổng kết tháng", "🖼 Monthly summary image"), (O) => drawCard({ theme: O.theme, mark: !ok("sharecard"), env: bi(env[0], env[1]), kicker: MON(ym), title: bi("Tổng kết tháng của bot", "Bot monthly wrap"), v: m.r ?? m.usd,
        big: isNum(m.r) ? `${sgn(m.r * 100)}%` : O.hide ? (m.usd >= 0 ? bi("Tháng lời", "Green month") : bi("Tháng lỗ", "Red month")) : money(m.usd), bigSub: isNum(m.r) ? (O.hide ? bi("đã khử tiền nạp / rút", "net of deposits / withdrawals") : `${money(m.usd)} · ${bi("đã khử tiền nạp / rút", "net of deposits / withdrawals")}`) : bi("lời/lỗ đã chốt", "realised P&L"),
        line: m.line, stats: [[bi("Số lệnh", "Trades"), `${nf(m.n, 0)} · ${m.days} ${bi("ngày", "days")}`], [bi("Lệnh thắng", "Winners"), m.n ? `${nf(m.win / m.n * 100, 0)}%` : "—"], [bi("Ngày tốt nhất", "Best day"), m.best ? `${ddmm(m.best.d)} ${isNum(m.best.r) ? sgn(m.best.r * 100) + "%" : O.hide ? "" : money(m.best.usd)}` : "—"], [bi("Coin của tháng", "Coin of the month"), m.topCoin ? m.topCoin[0] : "—"]] })); };
    };
    const kd = (e) => { if (e.key === "Escape") close(); else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(i + 1); } else if (e.key === "ArrowLeft") go(i - 1); };
    addEventListener("keydown", kd); addEventListener("hashchange", close, { once: true });
    el.querySelector(".wr-x").onclick = close; el.querySelector(".wr-nav.l").onclick = () => go(i - 1); el.querySelector(".wr-nav.r").onclick = () => go(i + 1);
    // giữ ngón tay = tạm dừng (như story), thả ra chạy tiếp
    st.addEventListener("pointerdown", () => el.classList.add("hold")); ["pointerup", "pointercancel", "pointerleave"].forEach((e) => st.addEventListener(e, () => el.classList.remove("hold")));
    go(0);
  };
  window.wrapMonths = (D) => [...new Set(D.keys.filter((d) => (D.days[d]?.n || 0) > 0).map((d) => d.slice(0, 7)))].sort().reverse();
})();
