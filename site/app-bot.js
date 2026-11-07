/* MyBit – các trang bot, tải khi cần (xem lazyJs trong app.js). Dùng chung hàm & biến toàn cục của app.js. */
// đổi tab con của Bot Phản Xạ MƯỢT: sáng tab ngay khi chạm, vẽ lại bằng dữ liệu đã có, giữ thanh tab đứng yên đúng chỗ trên màn hình,
// giữ chiều cao trang trong lúc vẽ (không bị kéo cuộn), gắn lại thanh vị trí ngay trong cùng khung hình
// tab cũ (mỗi phương pháp 1 tab) → tab mới gộp: hook/sec/lab/q → 🎯 Phương pháp, ev/learn → 📜 Nhật ký (nút con nhớ lựa chọn)
function scNormTab(k) {
  if (["hook", "sec"].includes(k)) { window.__scPm = k; lsSet("scpm", k); return "pm"; }
  if (k === "lab" || k === "q" || k === "sw") { window.__scPm = "lab"; lsSet("scpm", "lab"); return "pm"; }      // 🧪 Thử nghiệm: 1 bảng kéo-thả cho mọi phương pháp thử nghiệm
  if (k === "ev" || k === "learn") { window.__scLog = k; lsSet("sclog", k); return "log"; }
  if (k === "live") { window.__scEnv = "live"; lsSet("scenv", "live"); return "ov"; }      // tab "Binance thật" cũ → Tổng quan, lọc Binance
  return k;
}
async function scTabGo(k) {
  k = scNormTab(k);
  if (k === window.__scTab) { await viewScalp(); try { cusDraw(); } catch (e) { /* bỏ qua */ } return; }
  const ORD = ["ov", "ord", "pm", "log", "set"], dir = Math.sign(ORD.indexOf(k) - ORD.indexOf(window.__scTab)) || 1;
  $$("[data-sctab]").forEach((x) => { const on = x.dataset.sctab === k; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); });
  window.__scTab = k; lsSet("sctab", k); try { navFreqHit?.("#/bot/scalp|" + k); } catch (e) { /* bỏ qua */ }
  window.__scTabX = $(".sc-tabs")?.scrollLeft ?? null;      // giữ vị trí cuộn ngang của thanh tab qua lần vẽ lại → trượt mượt tới giữa
  const root = $("#app"), bar0 = $(".sc-tabs")?.getBoundingClientRect().top;
  root.style.minHeight = root.offsetHeight + "px"; window.__scUseCache = true;
  window.__scKeep = bar0 != null && bar0 >= 0 && bar0 < innerHeight * 0.6 ? bar0 : 64;
  await viewScalp();
  try { cusDraw(); } catch (e) { /* bỏ qua */ }      // lối tắt ★ / ↻ sáng đúng tab vừa mở
  try { if (!matchMedia("(prefers-reduced-motion: reduce)").matches) $(".sc-body")?.animate([{ opacity: 0.2, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch (e) { /* bỏ qua */ }      // đổi tab: trượt theo chiều tab
  setTimeout(() => { root.style.minHeight = ""; }, 400);
}
// ✋ lệnh tay qua ĐƯỜNG NHANH: ghi khoá nhỏ "scalpcmd" – máy chủ riêng đang chờ sẵn (hỏi kiểu chờ dài) nên nhận trong ~1 giây
async function scCmd(act, k, at) {
  const L = (window.__scCmdL || []).filter((x) => Date.now() - Date.parse(x.at) < 10 * 60e3); L.push({ act, k, at }); window.__scCmdL = L;
  try { await Store.put("scalpcmd", { list: L.slice(-20) }); } catch (e) { /* còn đường thiết lập dự phòng */ }
}
const HK_ENTER_NOTE = "Kiểm chứng 01/2025–11/2026 (731 coin futures, vòng 11): vào ngay bằng giá thị trường lúc vừa có cú sốc TB −3 bps/lệnh sau phí (cả danh mục −44%); chờ ở 1,25× / 1,5× như bot: +50 bps/lệnh (+144%). Bot chỉ tự vào ngay khi Long và 15 phút trước giá đã giảm ≥ 3%. Đây là lựa chọn của anh, bot không khuyên.";
// ĐIỆN THOẠI: vuốt ngang trên nội dung để chuyển tab Bot Phản Xạ (Tổng quan ↔ Lệnh ↔ Phương pháp ↔ Hoạt động ↔ Thiết lập) – như lật trang trong app.
// Mép trái/phải màn hình để dành cho vuốt lùi/tới trang; vuốt trên bảng cuộn ngang, biểu đồ, ô nhập, thanh nút thì không đổi tab.
(function scSwipe() {
  if (window.__scSwipe) return; window.__scSwipe = 1;
  const MOBq = matchMedia("(max-width:979px)");
  const noGo = (t) => { for (let el = t; el && el.id !== "app"; el = el.parentElement) {
    if (el.matches?.("input, textarea, select, canvas, svg, .tw, .sc-tabs, .bseg, .sc-sub2, .sc-evf, .lb-seg, [data-noswipe], .chartbox, .lw-chart")) return true;
    const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2) return true; } return false; };
  let st = null;
  addEventListener("touchstart", (e) => {
    st = null; if (!MOBq.matches || !location.hash.startsWith("#/bot/scalp") || e.touches.length !== 1) return;
    if (document.documentElement.classList.contains("lb-lock") || document.getElementById("iosSheet") || document.getElementById("iosMenu")) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY, body = document.querySelector("#app .sc-body");
    if (!body || x < 30 || x > innerWidth - 30 || !body.contains(e.target) || noGo(e.target)) return;
    const keys = [...document.querySelectorAll(".sc-tabs [data-sctab]")].map((b) => b.dataset.sctab), i = keys.indexOf(window.__scTab);
    if (i < 0) return; st = { x, y, t: Date.now(), dx: 0, lock: false, body, keys, i };
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!st) return; const dx = e.touches[0].clientX - st.x, dy = e.touches[0].clientY - st.y;
    if (!st.lock) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { st = null; return; } if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.6) return; st.lock = true; }
    e.preventDefault();
    const edge = (dx > 0 && st.i === 0) || (dx < 0 && st.i === st.keys.length - 1), d = edge ? dx * 0.25 : dx; st.dx = d;
    st.body.style.transition = "none"; st.body.style.transform = `translateX(${d}px)`; st.body.style.opacity = String(1 - Math.min(0.35, Math.abs(d) / innerWidth * 0.6));
    const bar = document.querySelector(".sc-tabs"), nx = st.keys[st.i + (dx < 0 ? 1 : -1)];
    bar?.querySelectorAll("[data-sctab]").forEach((b) => b.classList.toggle("pv", !edge && Math.abs(d) > innerWidth * 0.22 && b.dataset.sctab === nx));
  }, { passive: false });
  const end = async () => {
    if (!st) return; const s = st; st = null; if (!s.lock) return;
    document.querySelectorAll(".sc-tabs .pv").forEach((b) => b.classList.remove("pv"));
    const W = innerWidth, v = Math.abs(s.dx) / Math.max(1, Date.now() - s.t), j = s.i + (s.dx < 0 ? 1 : -1);
    const go = j >= 0 && j < s.keys.length && (Math.abs(s.dx) > W * 0.22 || (v > 0.5 && Math.abs(s.dx) > 40));
    s.body.style.transition = "transform .18s cubic-bezier(.2,.8,.2,1), opacity .18s";
    if (!go) { s.body.style.transform = ""; s.body.style.opacity = ""; return; }
    const dir = s.dx < 0 ? 1 : -1; s.body.style.transform = `translateX(${-dir * W * 0.6}px)`; s.body.style.opacity = "0";
    navigator.vibrate?.(5);
    setTimeout(async () => {
      await scTabGo(s.keys[j]);
      const nb = document.querySelector("#app .sc-body"); if (!nb) return;
      try { nb.animate([{ transform: `translateX(${dir * W * 0.35}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch (er) { /* bỏ qua */ }
    }, 150);
  };
  addEventListener("touchend", end); addEventListener("touchcancel", end);
})();
// khung sự kiện: Gọn (ít dòng, mỗi sự kiện 1 dòng) · Vừa (mặc định) · Đầy đủ (hiện hết, không cuộn trong khung) – áp dụng cho mọi khung sự kiện, nhớ lựa chọn
const fdSz = () => { const v = lsGet("feedsz", "m"); return ["s", "m", "l"].includes(v) ? v : "m"; };
document.documentElement.dataset.fdsz = fdSz();
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-fdsz]");
  if (b) { const v = b.dataset.fdsz; lsSet("feedsz", v); document.documentElement.dataset.fdsz = v; $$("[data-fdsz]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.fdsz === v))); return; }
  const li = e.target.closest?.(".sc-feed li");      // chế độ Gọn / Vừa: chạm 1 sự kiện để xem đủ chữ
  if (li && document.documentElement.dataset.fdsz !== "l" && !e.target.closest("a, button")) li.classList.toggle("open");
});
const durVi = (sec) => (sec < 90 ? `${nf(sec, 0)} giây` : sec < 5400 ? `${nf(sec / 60, 0)} phút` : sec < 172800 ? `${nf(sec / 3600, 0)} giờ` : `${nf(sec / 86400, 0)} ngày`);
const cmpMark = () => { const f = window.__cmpF || "all"; $$("[data-cmpf]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cmpf === f))); $$(".cmp-l").forEach((l) => (l.dataset.f = f)); };
document.addEventListener("click", (e) => { const b = e.target.closest?.("[data-cmpf]"); if (!b) return; const f = b.dataset.cmpf; window.__cmpF = f === "all" || window.__cmpF === f ? "all" : f; cmpMark(); });
// nút Gọn / Vừa / Đầy đủ: đặt lên hàng tiêu đề của khung sự kiện (cùng dòng với tên khung) cho đỡ tốn chỗ
function fdPlace() { $$("#app .fd-sz").forEach((c) => { const h = c.closest(".panel")?.querySelector(":scope > .ph"); if (h && c.parentElement !== h) { h.appendChild(c); h.classList.add("ph-fd"); } }); }
document.addEventListener("click", (e) => { const b = e.target.closest?.("[data-hzinfo]"); if (!b) return; const d = b.closest(".hz2")?.querySelector(":scope > .sc-i"); if (d) { d.open = !d.open; window.__hzInfo = d.open; b.setAttribute("aria-expanded", String(d.open)); } });
function lvEqBind() {
  $$("#lvEqBox [data-lvr]").forEach((b) => (b.onclick = () => { window.__lvRng = b.dataset.lvr; lsSet("lvrng", b.dataset.lvr); window.__lvEqRedraw?.(); }));
  $$("#lvEqBox [data-lvm]").forEach((b) => (b.onclick = () => { window.__lvMd = b.dataset.lvm; lsSet("lvmd", b.dataset.lvm); window.__lvEqRedraw?.(); }));
}
// ✋ Đóng tay: trước khi gửi, hiện bảng ƯỚC TÍNH lời/lỗ ròng nếu đóng NGAY (giá sống − phí đã trả − phí lúc đóng − trượt giá ± funding),
// giá hoà vốn sau phí, % tổng tài sản. Nút xác nhận mở sau 1,2 giây để không lỡ tay bấm liền. Số tự cập nhật mỗi giây theo giá.
function mxCalc(x) {
  if (!x || x.nofill) return null;
  const m = (x.pk && SCL.px[x.pk]) || x.m || x.e, q = +x.q, e = +x.e, sd = +x.sd; if (!(q > 0 && e > 0 && m > 0)) return null;
  const gross = sd * q * (m - e), f0 = +x.f0 || 0, fx = q * m * (+x.fr || 0) / 100, sl = q * m * (+x.sl || 0) / 100, fund = isNum(x.fund) ? +x.fund : 0;
  const net = gross - f0 - fx - sl + fund, N = q * e, k = ((+x.fr || 0) + (+x.sl || 0)) / 100;
  const be = (sd * q * e + f0 - fund) / (q * (sd - k));      // giá mà lời/lỗ ròng = 0
  return { e, m, gross, f0, fx, sl, fund, net, N, be, live: !!(x.pk && SCL.px[x.pk]) };
}
function mxAsk(key, name, real, pend) {
  const sgP = (v, d) => `${nz(v, d) > 0 ? "+" : nz(v, d) < 0 ? "−" : ""}${nf(Math.abs(v), d)}`;
  const $v = (v, d) => `${v > 0 ? "+" : v < 0 ? "−" : ""}$${nf(Math.abs(v), d ?? (Math.abs(v) < 1 ? 3 : 2))}`, cl = (v) => (nz(v, 3) > 0 ? "up" : nz(v, 3) < 0 ? "down" : "");
  const x0 = window.__MXE?.[key], tot = () => (x0?.paper ? window.__MXT?.paper : window.__MXT?.real);
  const nothing = !x0 || x0.nofill || pend;
  const body = () => {
    const x = window.__MXE?.[key] || x0, r = mxCalc(x);
    if (nothing || !r) return `<p style="margin:2px 0 0;text-align:center">${esc(name)}</p><div class="mxw inf">${pend || x?.nofill ? bi("Chưa khớp lệnh nào → chỉ HUỶ lệnh chờ, không tốn phí, không lời/lỗ.", "Nothing filled → only cancels pending orders, no fees, no P/L.") : bi("Không có đủ số liệu để ước tính lời/lỗ – đóng theo giá thị trường lúc máy chủ xử lý.", "Not enough data to estimate P/L – closes at market when the server runs it.")}</div>${real ? `<div class="mxw">⚠️ ${bi("Lệnh TIỀN THẬT trên Binance.", "REAL-money order on Binance.")}</div>` : ""}`;
    const T = tot(), pT = T > 0 ? r.net / T * 100 : null, bp = r.net / r.N * 1e4, mv = (r.m / r.e - 1) * 100, dBe = (r.be / r.m - 1) * 100, sd = +x.sd;
    const fundRow = isNum(x.fund) ? `<tr><td>${nz(r.fund, 3) === 0 ? `Funding<small>${bi("chưa qua kỳ chốt funding nào", "no funding settlement yet")}</small>` : `${bi("Funding đã", "Funding so far")} ${r.fund > 0 ? bi("nhận", "received") : bi("trả", "paid")}`}</td><td class="${cl(r.fund)}">${$v(r.fund)}</td></tr>`
      : `<tr><td>Funding<small>${x.long ? bi("chưa đọc được từ sàn (cần cập nhật máy chủ) – lệnh giữ nhiều ngày nên có thể lệch", "not read from the exchange yet (server update needed) – multi-day hold, may differ") : bi("chưa đọc được – lệnh giữ ngắn, thường ≈ 0", "not read yet – short hold, usually ≈ 0")}</small></td><td class="faint">?</td></tr>`;
    let warn = "";
    if (r.gross >= 0 && r.net < 0) warn = `<div class="mxw">⚠️ <b>${bi("Nhìn giá đang lời/hoà nhưng đóng bây giờ là LỖ", "Price looks flat/green but closing now is a LOSS")} ${$v(r.net)}</b> ${bi("vì phí", "because of fees")}${r.fund < 0 ? " + funding" : ""}. ${bi("Hoà vốn sau phí khi giá", "Break-even after costs when price")} ${sd > 0 ? "≥" : "≤"} <b>${px(r.be)}</b> (${bi("cách", "away")} ${nf(Math.abs(dBe), 2)}%).</div>`;
    else if (r.net < 0) warn = `<div class="mxw">🔻 ${bi("Đóng bây giờ chịu lỗ", "Closing now realises a loss of")} <b>${$v(r.net)}</b>. ${bi("Hoà vốn sau phí khi giá", "Break-even after costs when price")} ${sd > 0 ? "≥" : "≤"} <b>${px(r.be)}</b> (${bi("cách", "away")} ${nf(Math.abs(dBe), 2)}%).</div>`;
    else warn = `<div class="mxw ok">✅ ${bi("Đã trừ hết phí vẫn lời", "Still in profit after all costs:")} <b>${$v(r.net)}</b>${r.net < r.gross * 0.5 ? ` – ${bi("nhưng phí ăn", "but costs eat")} ${nf((1 - r.net / r.gross) * 100, 0)}% ${bi("tiền lời giá", "of the price gain")}` : ""}.</div>`;
    return `<p style="margin:2px 0 4px;text-align:center">${esc(name)}</p>
      <table class="mxe"><tbody>
      <tr><td>${bi("Giá vào → giá bây giờ", "Entry → now")}<small>${r.live ? bi("giá khớp trực tiếp từ Binance", "live trade price from Binance") : bi("giá máy chủ gửi gần nhất", "last price from the server")}</small></td><td>${px(r.e)} → <b>${px(r.m)}</b><small class="${cl(mv * sd)}">${sgP(mv, 2)}%</small></td></tr>
      <tr><td>${bi("Lời/lỗ theo giá", "Price P/L")}<small>${qty(+x.q)} · ${bi("giá trị", "notional")} $${nf(r.N, 2)}</small></td><td class="${cl(r.gross)}">${$v(r.gross)}</td></tr>
      <tr><td>${bi("Phí lúc vào (đã trả)", "Entry fees (paid)")}</td><td class="down">${$v(-r.f0)}</td></tr>
      <tr><td>${bi("Phí lúc đóng", "Exit fee")}<small>${bi("lệnh thị trường", "market order")} ${nf(+x.fr, 3)}%</small></td><td class="down">${$v(-r.fx)}</td></tr>
      ${x.sl ? `<tr><td>${bi("Trượt giá ước tính", "Est. slippage")}<small>~${nf(+x.sl, 2)}% ${bi("(chênh mua/bán, khớp lệnh thị trường)", "(spread, market fill)")}</small></td><td class="down">${$v(-r.sl)}</td></tr>` : ""}
      ${fundRow}
      <tr class="tot"><td>${bi("Ròng nếu đóng ngay", "Net if closed now")}</td><td class="${cl(r.net)}">${$v(r.net)}<small>${sgP(bp, 1)} bps${pT != null ? ` · ${sgP(pT, Math.abs(pT) < 0.01 ? 3 : 2)}% ${bi("tổng tài sản", "of total")}` : ""}</small></td></tr>
      </tbody></table>${warn}${real ? `<div class="mxw">⚠️ ${bi("Lệnh TIỀN THẬT trên Binance – số thật có thể lệch chút theo giá lúc khớp.", "REAL-money order on Binance – the actual result may differ slightly at fill.")}</div>` : ""}${x.pend ? `<p class="mxn">${bi("Các lệnh chờ chưa khớp cũng được huỷ.", "Unfilled pending orders are cancelled too.")}</p>` : ""}
      <p class="mxn">${bi("Ước tính – máy chủ đóng trong ≤ 30 giây nên giá có thể khác lúc bấm.", "Estimate – the server closes within 30 s, so the price may move.")}</p>`;
  };
  const lab = () => { const r = nothing ? null : mxCalc(window.__MXE?.[key] || x0);
    return nothing ? [bi("Huỷ lệnh chờ", "Cancel pending orders"), false] : r ? [r.net < 0 ? `${bi("Đóng – chịu lỗ", "Close – take loss")} ${$v(r.net)}` : `${bi("Đóng – chốt lời", "Close – take profit")} ${$v(r.net)}`, real || r.net < 0] : [bi("Đóng bằng lệnh thị trường", "Close at market"), real]; };
  return iosSheet({ title: nothing ? bi("Huỷ lệnh chờ?", "Cancel pending?") : bi("Đóng lệnh ngay?", "Close now?"), body, ok: lab, cancel: bi("Giữ lệnh", "Keep it"), wait: nothing ? 600 : 1200 });
}
async function viewScalp() {
  window.__scDirty = false;
  if (ME && !can("bot")) { app().innerHTML = `<div class="ph"><h1>⚡ Bot Phản Xạ</h1></div><div class="panel"><p class="muted">🔒 Dành cho gói Pro.</p></div>`; return; }
  // đổi tab con: dùng lại dữ liệu vừa tải (< 20 giây) → vẽ ngay, không chờ mạng (trang không "giật")
  const cc = window.__scCache, useC = window.__scUseCache && cc && Date.now() - cc.t < 20000; window.__scUseCache = false;
  const [rq, rv, rk] = useC ? cc.d : await Promise.all([Store.get("scalp"), Store.get("scalpstate"), Store.get("scalpkey")]);
  if (!useC) window.__scCache = { t: Date.now(), d: [rq, rv, rk] };
  if (!window.__scDays || Date.now() - window.__scDays.t > 300e3) { window.__scDays = { t: Date.now(), data: window.__scDays?.data || null }; Store.get("scalpdays").then((r) => { window.__scDays = { t: Date.now(), data: r.data }; }).catch(() => {}); }      // kết quả theo ngày (thẻ "7 ngày") – 5 phút tải lại 1 lần
  const KEYH = rk.data?.h ? rk.data : null;
  const C = { ...SCALP_DEF, ...scMig(rq.data) }, X0 = rv.data || {}, X = X0.v === 2 ? X0 : { at: X0.at };
  const VW = C.where === "vps", age = X.at ? (Date.now() - Date.parse(X.at + "Z")) / 1000 : null, FD = X.feeds || {}, fl = Object.values(FD);
  const nMk = fl.reduce((a, f) => a + (f.n || 0), 0), rate = fl.reduce((a, f) => a + (f.rate || 0), 0), anyLive = fl.some((f) => f.ws && f.last && (Date.now() - Date.parse(f.last + "Z")) / 1000 < 30);
  const st = !C.enabled ? ["Đang tắt", "", "Bật để bot quét mọi cặp spot & futures USDT, nghe sổ lệnh & khớp lệnh liên tục và tự đánh giá mỗi giây – chạy trên máy chủ kể cả khi anh tắt máy."]
    : VW && (X.where !== "vps" || age > 90) ? ["Đang chờ máy chủ riêng", "warn", "chưa nhận được tin từ máy chủ riêng trong 90 giây qua – kiểm tra chương trình trên VPS đang chạy và đã dán đúng khoá (xem Thiết lập → Nơi chạy)"]
    : !X.at || age > 90 || !X.feeds || (X.where || "cf") !== (VW ? "vps" : "cf") ? ["Đang khởi động", "warn", "máy chủ đánh thức bot trong vòng 1 phút sau khi bật"]
    : !anyLive ? ["Mất kết nối dữ liệu", "sell", `đang thử nguồn khác${X.diag?.err?.length ? " · " + X.diag.err.slice(-2).join(" · ") : ""}`]
    : X.pause ? ["⏸ Tạm dừng", "warn", X.pause.why] : ["● Đang chạy", "buy", `đang quét ${nf(nMk, 0)} thị trường · ${nf(rate, 0)} tin nhắn/giây · cập nhật trang mỗi 3 giây`];
  const S = X.stats || {}, L50 = X.last50, ret = X.start ? (X.eq / X.start - 1) * 100 : null, dayP = X.day?.eq0 ? (X.eq / X.day.eq0 - 1) * 100 : null, N = X.cnt || {};
  const feeShare = S.gross > 0 ? S.fees / S.gross * 100 : null, nOpen = Object.keys(X.pos || {}).length;
  const feedTxt = (X.where === "vps" ? `<span>Chạy ở: <b>máy chủ riêng</b>${X.host ? ` (${esc(X.host)})` : ""}</span>` : "") + Object.entries(FD).map(([t, f]) => `<span>${t === "F" ? "Futures" : "Spot"}: <b>${esc(f.src || "—")}</b> · ${nf(f.n || 0, 0)} thị trường · ${nf(f.rate || 0, 0)} tin/giây ${f.ws ? `<i class="up">●</i>` : `<i class="down">●</i>`}</span>`).join("");
  const bn = X.bn ? `<span class="faint">Binance (thử lại mỗi giờ): futures ${esc(X.bn.futures || "—")} · spot ${esc(X.bn.spot || "—")}${X.bn.futures === "OK" ? "" : " – Binance futures đang chặn máy chủ Cloudflare nên futures dùng dữ liệu sàn khác (Bybit/OKX) cho cùng các coin; phí vẫn tính theo mức phí Binance anh nhập"}</span>` : "";
  const F0 = (window.__scF ||= "all");
  const rows = (X.radar || []).filter(([id, q]) => F0 === "all" || q.t === F0);
  const radar = rows.map(([id, x]) => { const v = SCV[x.v] || [x.v, ""], b = x.best;
    return `<tr><td class="l">${scK(id)} ${scCx(x)}<div class="sc-w faint">${esc(x.why || "")}</div></td><td class="lpx" data-lpx="${esc(id)}">${px(x.mid)}</td><td>${nf(x.spread, 2)}</td><td>${nf(x.vol, 2)}</td>
      <td><span class="scl-m" title="${esc(`dòng lệnh ${bps(x.tfi * 100, 0)}% · sổ lệnh ${bps(x.obi * 100, 0)}% · đà giá ${bps(x.mz * 100, 0)}%`)}"><i style="left:${((x.s + 1) / 2 * 100).toFixed(0)}%"></i></span> <small class="${x.side > 0 ? "up" : "down"}">${x.side > 0 ? "L" : "S"} ${nf(Math.abs(x.s), 2)}</small></td>
      <td title="${b && isNum(b.raw) ? esc(`ước lượng thô ${nf(b.raw, 2)} − 2,33 × sai số ${nf(b.se, 2)} = thận trọng ${nf(b.exp, 2)} bps`) : ""}">${b ? `${nf(b.exp, 2)} <small class="faint">${b.h}s</small>` : "—"}</td><td>${nf(x.cost, 2)}</td><td class="${b ? cls(b.net) : ""}"><b>${b ? bps(b.net, 2) : "—"}</b></td>
      <td><span class="pill ${v[1]}" title="${esc(x.why || "")}">${v[0]}</span></td></tr>`; }).join("");
  const frOf = (p) => (p.t === "F" ? C.fee_t : C.fee_ts);     // phí taker lúc thoát (%), để tính lãi/lỗ đang mở sau phí
  const pxL = (v) => (isNum(v) && v > 0 && v < 1e15 ? px(v) : "—");
  const pos = Object.entries(X.pos || {}).map(([k, p]) => `<tr><td class="l">${p.strat === "hook" ? "🪝 " : ""}${scK(k)} <span class="${p.side > 0 ? "up" : "down"}">${p.side > 0 ? "Long" : "Short"}</span> <small>${p.how}</small></td><td>${px(p.e)}</td>
    <td class="lpx" data-lpx="${esc(k)}">${isNum(p.m) ? px(p.m) : "—"}</td><td data-lpnl="${esc(k)}" data-e="${p.e}" data-q="${p.q}" data-sd="${p.side}" data-f0="${p.fee || 0}" data-fr="${frOf(p)}" data-sl="${p.sl}" data-tp="${p.tp}"><b>—</b></td>
    <td class="down">${pxL(p.sl)}</td><td class="up">${pxL(p.tp)}</td><td data-lt0="${p.t0}" data-lh="${p.h}"><span class="sc-cd"><i></i></span><small>${nf(p.h, 0)}s</small></td><td>${usd2(p.q * p.e)}</td></tr>`).join("");
  // điện thoại: mỗi lệnh là 1 thẻ (không phải kéo ngang bảng)
  const posC = Object.entries(X.pos || {}).map(([k, p]) => `<div class="sc-pcard"><div class="r1"><span>${p.strat === "hook" ? "🪝 " : ""}${scK(k)} <span class="${p.side > 0 ? "up" : "down"}">${p.side > 0 ? "Long" : "Short"}</span> <small class="faint">${p.how} · ${usd2(p.q * p.e)}</small></span><b class="lpx" data-lpx="${esc(k)}">${isNum(p.m) ? px(p.m) : px(p.e)}</b></div>
    <div class="r2" data-lpnl="${esc(k)}" data-e="${p.e}" data-q="${p.q}" data-sd="${p.side}" data-f0="${p.fee || 0}" data-fr="${frOf(p)}" data-sl="${p.sl}" data-tp="${p.tp}"><b>—</b></div>
    <div class="r3"><small>vào <b>${px(p.e)}</b></small><small class="down">cắt lỗ ${pxL(p.sl)}</small><small class="up">chốt ${pxL(p.tp)}</small></div>
    <div class="r4" data-lt0="${p.t0}" data-lh="${p.h}"><span class="sc-cd"><i></i></span><small>${nf(p.h, 0)}s</small><small class="faint">giữ tối đa ${p.h >= 600 ? nf(p.h / 60, 0) + " phút" : nf(p.h, 0) + "s"}</small></div></div>`).join("");
  // 🪝 BẮT RÂU SẬP: lệnh chờ đang treo + kết quả + bằng chứng kiểm chứng
  const HK = X.hk || {}, HKS = X.hkStat, BS = X.byS || {}, bh = BS.hook, bsec = BS.sec;
  const hkRows = Object.entries(HK).map(([k, h]) => `<tr><td class="l">🪝 ${scK(k)} <span class="${h.side > 0 ? "up" : "down"}">${h.side > 0 ? "chờ Long" : "chờ Short"}</span></td><td class="${h.side > 0 ? "down" : "up"}">${h.side > 0 ? "−" : "+"}${nf(h.R / 100, 1)}% <small class="faint">z ${nf(h.z, 1)}</small></td>
    <td class="lpx" data-lpx="${esc(k)}">${px(h.c0)}</td><td>${h.lv.map((l) => `${l.f ? "✅" : "⏳"} ${px(l.px)} <small class="faint">(${l.d}×)</small>`).join("<br>")}</td><td data-lt0="${h.t0}" data-lh="${(h.exp - h.t0) / 1000}"><span class="sc-cd"><i></i></span><small></small></td></tr>`).join("");
  const sRow = (lab, b) => `<tr><td class="l">${lab}</td><td>${nf(b?.n || 0, 0)}</td><td>${b?.n ? nf(b.win / b.n * 100, 0) + "%" : "—"}</td><td class="${cls(b?.net)}">${b ? (b.net >= 0 ? "+" : "") + usd2(b.net) : "—"}</td><td class="${cls(b?.bps)}">${b?.n ? bps(b.bps / b.n, 1) : "—"}</td></tr>`;
  const hkLast = HKS?.last ? `<p class="faint" style="font-size:.75rem">${bi(`Cú sốc gần nhất: <b>${esc(HKS.last.k.split(":")[0])}</b> ${HKS.last.R > 0 ? "+" : ""}${nf(HKS.last.R / 100, 1)}% lúc ${hms(HKS.last.at)} (z ${nf(HKS.last.z, 1)}${HKS.last.vx ? `, khối lượng ${nf(HKS.last.vx, 1)}×` : ""}) – ${esc(HKS.last.why || "")}. Từ lúc máy chủ khởi động: ${nf(HKS.seen, 0)} cú sốc đủ lớn · ${nf(HKS.vol, 0)} đủ khối lượng · bỏ ${nf(HKS.f6 || 0, 0)} coin đang bơm/xả liên tục · bỏ ${nf(HKS.knife || 0, 0)} "dao rơi" · bỏ ${nf(HKS.r15 || 0, 0)} "xả sau bơm" · ${nf(HKS.placed, 0)} lần đặt lệnh chờ.`, `Latest shock: <b>${esc(HKS.last.k.split(":")[0])}</b> ${HKS.last.R > 0 ? "+" : ""}${nf(HKS.last.R / 100, 1)}% at ${hms(HKS.last.at)} (z ${nf(HKS.last.z, 1)}${HKS.last.vx ? `, volume ${nf(HKS.last.vx, 1)}×` : ""}) – ${esc(HKS.last.why || "")}. Since the server started: ${nf(HKS.seen, 0)} big-enough shocks · ${nf(HKS.vol, 0)} with enough volume · skipped ${nf(HKS.f6 || 0, 0)} pumping/dumping coins · ${nf(HKS.knife || 0, 0)} "falling knives" · ${nf(HKS.r15 || 0, 0)} "dumps after pumps" · ${nf(HKS.placed, 0)} times limit orders placed.`)}</p>` : `<p class="faint" style="font-size:.75rem">${bi(`Chưa có cú sốc nào đủ lớn từ lúc máy chủ khởi động – cú sốc ≥ ${nf(C.hk_r / 100, 1)}%/phút chỉ xảy ra vài lần mỗi ngày trên toàn thị trường, có ngày không có.`, `No big-enough shock since the server started – shocks ≥ ${nf(C.hk_r / 100, 1)}%/minute happen only a few times a day across the whole market, some days none.`)}</p>`;
  // 🧠 kinh nghiệm đang áp dụng: các quy tắc tự học / tự sửa và tình trạng ngay lúc này
  const GD = X.guard || {}, SHs = X.sh || {}, brain = X.brain;
  const lgFix = (X.log || []).filter((l) => /⛔|🔁|Hết giờ nghỉ|Sang ngày mới/.test(l.m)).slice(-4).reverse();
  const learnPanel = panel("🧠 Kinh nghiệm đang áp dụng – tự học & tự sửa", `<ul class="bot-rl">
      <li><b>Bộ nhớ học:</b> <span>${brain ? `${nf(brain.n || 0, 0)} mẫu trên ${nf(brain.coins || 0, 0)} coin, lưu lần cuối ${hms(brain.at)} – máy chủ khởi động lại vẫn nhớ.` : "chưa lưu lần nào."}</span></li>
      <li><b>Bằng chứng theo đợt 10 phút</b> <span>(sửa lỗi 25/10: 30 lệnh ảo thắng trong cùng một cú chạy từng được tính là 30 bằng chứng → bot vào ồ ạt rồi thua cả loạt khi thị trường đảo). Giờ</span> <b>${nf(SHs.ready || 0, 0)}</b> <span>loại tình huống đã đủ ${nf(C.sh_min, 0)} đợt, trong đó</span> <b class="${SHs.trusted ? "up" : ""}">${nf(SHs.trusted || 0, 0)}</b> <span>chứng minh có lời → chỉ các loại này được đánh thật.</span></li>
      <li><b>Rủi ro tương quan của danh mục:</b> <span>đang giữ ${nf(GD.L || 0, 0)} Long / ${nf(GD.S || 0, 0)} Short ≈</span> <b>${nf(GD.rq || 0, 1)}</b> <span>lệnh tương đương (tối đa ${nf(C.max_side, 0)}). Tính bằng √(Σ chiềuᵢ × chiềuⱼ × tương quanᵢⱼ) theo lợi suất 1 phút của 60 phút gần nhất: 3 coin cùng nhịp cùng Long = 3; 9 coin độc lập = 3; Long A + Short B cùng nhịp ≈ phòng hộ (chỉ tính một nửa vì lúc sập mạnh mọi thứ cùng rơi). ${nf(GD.ent5 || 0, 0)} lệnh mới trong 5 phút (tối đa ${nf(C.burst, 0)}).</span></li>
      <li><b>Cú sốc BTC ngược chiều lệnh đang giữ</b> <span>(BTC chạy ≥ ${nf(C.bx_z, 0)}× dao động & ≥ ${nf(C.bx_r, 0)} bps trong 60 giây): mỗi lần như vậy bot so "thoát ngay" với "giữ tiếp" trên lệnh ảo & lệnh thật. Kiểm chứng 01/2023–10/2026 (44 coin, hơn 6.600 cú sốc): sau cú sốc, coin chỉ chạy tiếp TB 0–3 bps và đa số lần bật lại → thoát ngay thường thiệt hơn giữ (mất thêm trượt giá) → mặc định GIỮ, chỉ tự chuyển sang thoát ngay nếu dữ liệu trực tiếp chứng minh ngược lại.</span> ${X.bx?.n ? `<span>${nf(X.bx.n, 0)} cú sốc · thoát ngay ${X.bx.mean >= 0 ? "hơn" : "kém"} giữ TB ${bps(X.bx.mean, 1)} bps (thận trọng ${bps(X.bx.lcb, 1)}) →</span> ` : `<span>chưa có cú sốc nào để đo →</span> `}${X.bx?.act ? `<span class="pill buy">đang áp dụng: thoát ngay</span>` : `<span class="pill">${C.bx_mode === "off" ? "đã tắt" : "chưa áp dụng – giữ như bình thường"}</span>`}${X.bx?.last ? ` <small class="faint">lần gần nhất ${hms(X.bx.last.at)}: BTC ${X.bx.last.r > 0 ? "+" : ""}${nf(X.bx.last.r, 0)} bps, ${nf(X.bx.last.real, 0)} lệnh thật / ${nf(X.bx.last.sh, 0)} lệnh ảo ngược hướng</small>` : ""}</li>
      <li><b>Cầu dao:</b> <span>6/8 lệnh gần nhất thua trong 2 giờ → nghỉ 60 phút; 50 lệnh gần nhất ròng âm → nghỉ 30 phút và nâng ngưỡng (hiện ×${nf(C.k + (X.kadd || 0), 1)} chi phí); lỗ ${nf(C.daily_stop, 1)}% trong ngày → dừng tới hết ngày.</span> ${X.pause ? `<span class="pill warn">Đang nghỉ: ${esc(X.pause.why)}</span>` : `<span class="pill buy">Đang chạy bình thường</span>`}</li>
      <li><b>Bắt râu sập</b> <span>có sổ riêng (khung 🪝) để so với lướt giây – phương pháp nào thua kéo dài sẽ hiện rõ ở đây thay vì lẫn vào tổng.</span></li></ul>
    ${lgFix.length ? `<p class="sbh">Lần tự sửa gần nhất</p><ul class="bot-rl">${lgFix.map((l) => `<li><small class="faint">${hms(l.t)}</small> ${esc(l.m)}</li>`).join("")}</ul>` : ""}`);  const learnPanelEN = panel("🧠 Lessons in use – self-learning & self-correcting", `<ul class="bot-rl">
      <li><b>Learning memory:</b> ${brain ? `${nf(brain.n || 0, 0)} samples on ${nf(brain.coins || 0, 0)} coins, last saved ${hms(brain.at)} – kept across server restarts.` : "not saved yet."}</li>
      <li><b>Evidence by 10-minute episodes</b> (fix of 25/10: 30 winning virtual trades in one single run used to count as 30 pieces of evidence → the bot piled in and lost the whole batch when the market turned). Now <b>${nf(SHs.ready || 0, 0)}</b> situation types have ${nf(C.sh_min, 0)} episodes, of which <b class="${SHs.trusted ? "up" : ""}">${nf(SHs.trusted || 0, 0)}</b> proved profitable → only these are traded for real.</li>
      <li><b>Portfolio correlation risk:</b> holding ${nf(GD.L || 0, 0)} Long / ${nf(GD.S || 0, 0)} Short ≈ <b>${nf(GD.rq || 0, 1)}</b> equivalent trades (max ${nf(C.max_side, 0)}). Computed as √(Σ sideᵢ × sideⱼ × correlationᵢⱼ) on 1-minute returns over the last 60 minutes: 3 coins moving together, all Long = 3; 9 independent coins = 3; Long A + Short B moving together ≈ a hedge (counted at half, because in a crash everything falls together). ${nf(GD.ent5 || 0, 0)} new trades in 5 minutes (max ${nf(C.burst, 0)}).</li>
      <li><b>BTC shock against an open trade</b> (BTC moves ≥ ${nf(C.bx_z, 0)}× its volatility & ≥ ${nf(C.bx_r, 0)} bps within 60 seconds): each time, the bot compares "exit now" with "keep holding" on virtual & live trades. Tested 01/2023–10/2026 (44 coins, 6,600+ shocks): after the shock coins continue only 0–3 bps on average and mostly bounce → exiting at once usually costs more than holding (extra slippage) → default HOLD, switching to exit-now only if live data proves otherwise. ${X.bx?.n ? `${nf(X.bx.n, 0)} shocks · exit-now ${X.bx.mean >= 0 ? "beats" : "trails"} holding by ${bps(X.bx.mean, 1)} bps on average (conservative ${bps(X.bx.lcb, 1)}) → ` : "no shock to measure yet → "}${X.bx?.act ? `<span class="pill buy">in use: exit now</span>` : `<span class="pill">${C.bx_mode === "off" ? "turned off" : "not applied – holding as usual"}</span>`}${X.bx?.last ? ` <small class="faint">last at ${hms(X.bx.last.at)}: BTC ${X.bx.last.r > 0 ? "+" : ""}${nf(X.bx.last.r, 0)} bps, ${nf(X.bx.last.real, 0)} live / ${nf(X.bx.last.sh, 0)} virtual trades against it</small>` : ""}</li>
      <li><b>Circuit breakers:</b> 6 of the last 8 trades lost within 2 hours → pause 60 minutes; last 50 trades net negative → pause 30 minutes and raise the bar (now ×${nf(C.k + (X.kadd || 0), 1)} cost); a ${nf(C.daily_stop, 1)}% loss in a day → stop until the day ends. ${X.pause ? `<span class="pill warn">Paused: ${esc(X.pause.why)}</span>` : `<span class="pill buy">Running normally</span>`}</li>
      <li><b>Wick Catcher</b> keeps its own book (🪝 tab) so it can be compared with scalping – a method that keeps losing shows up clearly instead of hiding in the total.</li></ul>
    ${lgFix.length ? `<p class="sbh">Latest self-corrections</p><ul class="bot-rl">${lgFix.map((l) => `<li><small class="faint">${hms(l.t)}</small> ${esc(l.m)}</li>`).join("")}</ul>` : ""}`);

  // 💵 tài khoản Binance thật (máy chủ riêng gửi kèm trạng thái)
  const LV = X.live, lvSt = LV?.st || {};
  const LVE0 = LV?.env || C.lv_env || "demo", LVH0 = (LV?.hist || []).filter((h) => (h.env || "demo") === LVE0);
  const LVT0 = LV?.totE?.[LVE0] || LVH0.reduce((T, h) => { T.n++; T.pnl += h.pnl || 0; T.fees += h.fee || 0; if (h.pnl > 0) T.win++; return T; }, { n: 0, pnl: 0, win: 0, fees: 0 });
  // hôm nay = cộng lời/lỗ các lệnh ĐÃ ĐÓNG hôm nay (giờ VN) của đúng tài khoản này – lấy thẳng từ danh sách lệnh nên luôn khớp bảng bên dưới
  const LVD0 = LVH0.filter((h) => vnDayOf(h.t2) === vnToday()).reduce((a, h) => a + (h.pnl || 0), 0);
  const lvPanel = !C.lv_on && !LV?.ev?.length && !LV?.hist?.length ? "" : panel(bi(`Trạng thái tài khoản ${LV?.env === "live" ? "thật" : "Demo"}`, `Account status – ${LV?.env === "live" ? "live" : "Demo"}`), !LV ? `<p class="muted">Máy chủ riêng chưa gửi trạng thái tài khoản – chạy <code>sudo bash /opt/my-bit/scalper/install.sh</code> để cập nhật, rồi <code>sudo bash /opt/my-bit/scalper/install.sh --binance</code> để cài khoá.</p>` : `
    <p style="margin-top:0">${LV.ready && lvSt.ok && !LV.halt ? `<span class="pill buy">Sẵn sàng</span>` : `<span class="pill warn">Chưa chạy</span>`} ${LV.env === "live" ? `<span class="pill sell">TIỀN THẬT</span>` : `<span class="pill">Demo</span>`}
      ${lvSt.bal != null ? `<span>Số dư futures</span> <b>${usd2(lvSt.bal)}</b> <span>(khả dụng ${usd2(lvSt.avail)})</span> · ` : ""}<span>vốn tối đa bot dùng</span> <b>${C.lv_all && LV.env === "live" ? "toàn bộ số dư" : usd(C.lv_cap)}</b>${LV.size && LV.env === "live" ? ` <span>(tính cỡ lệnh theo ${usd2(LV.size.base)})</span>` : ""} · <span>hôm nay</span> <b class="${cls(LVD0)}">${LVD0 >= 0 ? "+" : ""}${usd2(LVD0)}</b> · <span>tổng ${LVE0 === "live" ? "tiền thật" : "Demo"}</span> <b class="${cls(LVT0.pnl)}">${LVT0.pnl >= 0 ? "+" : ""}${usd2(LVT0.pnl)}</b> <span>(${nf(LVT0.n, 0)} lệnh, thắng ${LVT0.n ? nf(LVT0.win / LVT0.n * 100, 0) : 0}%)</span></p>
    ${LV.size && LV.env === "live" ? `<p class="faint">📏 ${{ pct: `Cỡ lệnh chuẩn: ${C.hk_size}% vốn mỗi lần bắt (chia các mức chờ) + ${C.hk_mkS}% mua ngay.`, min3: "Vốn vừa: đủ mua ngay + 2 mức chờ, mỗi mức cỡ tối thiểu của sàn (~5,5 USDT). Từ ~275 USDT tự chạy lại theo %.", min2: "Vốn nhỏ: mỗi lần bắt giữ 2 mức tốt nhất (mua ngay nếu đủ điều kiện, rồi mức chờ sâu), cỡ tối thiểu ~5,5 USDT. Từ ~66 USDT đủ cả 3 mức.", min1: "Vốn nhỏ: mỗi lần bắt chỉ giữ 1 mức tốt nhất – mua ngay nếu đủ điều kiện, không thì lệnh chờ sâu nhất – cỡ tối thiểu ~5,5 USDT. Từ ~44 USDT giữ 2 mức, ~66 USDT đủ 3 mức, ~275 USDT chạy lại theo %." }[LV.size.mode] || ""} Cỡ lệnh tính theo số dư futures (không vượt Vốn tối đa) – lời thì tự tăng, lỗ thì tự nhỏ lại.</p>` : ""}
    ${!LV.ready ? `<p class="faint">${!C.lv_on ? "Đang tắt." : LV.env === "live" && !C.lv_live_ok ? "Chưa xác nhận chuyển sang tiền thật." : "Bot đang tắt."}</p>` : ""}${lvSt.why ? `<p class="${lvSt.ok ? "faint" : "warn"}">⚠️ ${esc(lvSt.why)}</p>` : ""}${lvSt.restr ? `<p class="faint">Quyền khoá API: rút tiền ${lvSt.restr.withdraw ? "<b class='down'>BẬT</b>" : "tắt ✓"} · futures ${lvSt.restr.futures ? "bật ✓" : "tắt"} · giới hạn IP ${lvSt.restr.ip ? "có ✓" : "chưa"}</p>` : ""}
    ${LV.halt ? `<p class="warn">⛔ ${esc(LV.halt)} <button class="btn" id="lvRes">▶ Chạy lại</button></p>` : ""}
    <p class="sc-goord"><span>${bi(`${(LV.ev || []).length} lệnh đang mở · ${LVH0.length} đã đóng – xem ở Bot Phản Xạ › Lệnh`, `${(LV.ev || []).length} open · ${LVH0.length} closed – see Reflex Bot › Trades`)}</span><a class="btn sm" href="#/bot/scalp" data-sctab-go="ord">${bi("Lệnh →", "Trades →")}</a></p>
    <details class="sc-dt"><summary>Sự kiện tài khoản</summary><ul class="bot-rl">${(LV.log || []).slice().reverse().map((l) => `<li><small class="faint">${hms(l.t)}</small> ${esc(l.m)}</li>`).join("")}</ul></details>`, LV?.env === "live" ? "tiền thật" : "tiền ảo");
  const hkPanel = panel("🪝 Bắt râu sập – phương pháp mới đã kiểm chứng", `<p style="margin-top:0">${C.hk_on !== false ? `<span class="pill buy">${bi("Đang bật", "On")}</span>` : `<span class="pill">${bi("Đang tắt", "Off")}</span>`} ${bi(`<span>Khi một coin futures</span> <b>sập (hoặc vọt) ≥ ${nf(C.hk_r / 100, 1)}% trong 1 phút</b> <span>với khối lượng ≥ ${nf(C.hk_v, 0)}× bình thường (thường là quét thanh lý), bot đặt 2 lệnh chờ ngược chiều</span> <b>sâu thêm ${nf(C.hk_d1, 1)}× và ${nf(C.hk_d2, 1)}× cú sốc</b><span>, chờ tối đa ${nf(C.hk_w, 0)} phút; khớp thì giữ ${nf(C.hk_h, 0)} phút rồi đóng${+C.hk_tra > 0 ? ` (đã lời ≥ ${nf(C.hk_tra / 100, 1)}% thì đóng sớm khi giá trả lại ${nf((C.hk_trg ?? 100) / 100, 1)}% từ đỉnh lời)` : ""}. Mỗi lần bắt dùng ${nf(C.hk_size, 1)}% tài sản, cắt lỗ thảm hoạ ${C.hk_stop ? nf(C.hk_stop, 0) + "%" : "tắt"}.</span>${C.hk_mkS > 0 && C.hk_mk !== false ? ` <span>Riêng cú</span> <b>sập đến khi 15 phút trước giá đã giảm ≥ ${nf((C.hk_mk15 ?? 300) / 100, 1)}%</b> <span>(tháo chạy): bot</span> <b>mua ngay ${nf(C.hk_mkS ?? 2, 1)}% tài sản</b> <span>bằng lệnh thị trường, không chờ giá xuống sâu.</span>` : ""}`, `When a futures coin <b>crashes (or spikes) ≥ ${nf(C.hk_r / 100, 1)}% within 1 minute</b> on volume ≥ ${nf(C.hk_v, 0)}× normal (usually a liquidation sweep), the bot places 2 opposite limit orders <b>a further ${nf(C.hk_d1, 1)}× and ${nf(C.hk_d2, 1)}× the shock away</b>, waits up to ${nf(C.hk_w, 0)} minutes; if filled it holds ${nf(C.hk_h, 0)} minutes then closes${+C.hk_tra > 0 ? ` (once up ≥ ${nf(C.hk_tra / 100, 1)}% it closes early on a ${nf((C.hk_trg ?? 100) / 100, 1)}% giveback from the peak)` : ""}. Each catch uses ${nf(C.hk_size, 1)}% of equity, disaster stop ${C.hk_stop ? nf(C.hk_stop, 0) + "%" : "off"}.${C.hk_mkS > 0 && C.hk_mk !== false ? ` For crashes that come after a ≥ ${nf((C.hk_mk15 ?? 300) / 100, 1)}% drop over the prior 15 minutes (capitulation), the bot <b>buys ${nf(C.hk_mkS ?? 2, 1)}% of equity immediately</b> at market instead of waiting.` : ""}`)}</p>
    ${hkLast}
    <div class="tw"><table><thead><tr><th class="l">Phương pháp</th><th>Lệnh</th><th>Thắng</th><th>Ròng (USDT)</th><th>TB / lệnh (bps)</th></tr></thead><tbody>${sRow("🪝 Bắt râu sập", bh)}${sRow("⚡ Lướt giây (tín hiệu sổ lệnh)", bsec)}</tbody></table></div>
    <details class="sc-dt"><summary>Bằng chứng: kiểm chứng trên dữ liệu Binance trước khi đưa vào bot</summary><ul class="bot-rl">
      <li><b>Dữ liệu:</b> <span>nến 1 phút của toàn bộ ~900 hợp đồng futures USDT trên Binance, 01/07 – 24/10/2026. Chỉ tính coin đủ khối lượng ở đúng thời điểm (không chọn coin "sống sót" như hôm nay); lệnh chờ chỉ được tính là khớp khi giá xuyên qua thêm 0,05%; thoát lệnh trừ phí taker + trượt giá 0,1%.</span></li>
      <li><b>Cấu hình mặc định</b> <span>(sốc ≥ 3%, z ≥ 4, chờ sâu thêm 1,5× và 2×, giữ 60 phút): trung bình mỗi lệnh</span> <b>+170 / +208 bps</b> <span>(tháng 7–9, dùng để chọn tham số) và</span> <b>+253 / +342 bps</b> <span>(tháng 10, ngoài mẫu), thắng 63–68%.</span></li>
      <li><b>Kiểm chứng dài hơn (01/2025 – 10/2026, ~900 mã, 45.800 cú sốc) – kém hơn nhiều:</b> <span>không lọc, TB chỉ +26 / +57 bps mỗi lệnh và</span> <b>lỗ cả nửa cuối 2025</b> <span>(−126 bps/lệnh); tháng 7–10/2026 là giai đoạn đẹp nhất. Sau lỗ 27/10 (Q, BULLA bắt 2–3 lần liền khi coin đang sập tiếp), bot thêm 2 bộ lọc:</span> <b>bỏ coin đã có cú sốc khác trong 6 giờ</b> <span>và</span> <b>bỏ "dao rơi" (4 giờ qua đã đi ngược lệnh > 10%)</b><span>. Có lọc: TB +91 / +148 bps, thắng 64–67%, lệnh tệ nhất nhỏ hơn; theo nửa năm −72 / +68 / +76 / +237 bps – vẫn có giai đoạn lỗ.</span></li>
      <li><b>Vòng 5 (27/10, cùng dữ liệu 01/2025 – 10/2026, có tính giới hạn tối đa ${nf(C.hk_max, 0)} lần bắt mở cùng lúc):</b> <span>3 điều chỉnh, chọn trên 2025 rồi kiểm lại trên 2026, vùng tham số lân cận đều cho kết quả tương tự (không phải "trúng số" 1 con số):</span>
        <span>(1) <b>chờ khớp tối đa 8 phút thay vì 15</b> – lệnh khớp muộn ở phút 8–15 lỗ TB −105 bps, âm cả 4 nửa năm (giá trôi mãi = dao rơi); khớp ngay trong phút đầu TB +346 bps, thắng 80%;</span>
        <span>(2) <b>khối lượng ≥ 8× bình thường</b> (cũ 3×) – cú sốc khối lượng thấp TB chỉ +23 bps;</span>
        <span>(3) <b>bỏ "xả sau bơm"</b> – 15 phút trước cú sốc giá vừa chạy cùng hướng lệnh > 1% (vd. vừa bơm rồi sập): TB −56 bps, thua 3/4 nửa năm.</span>
        <span>Kết quả 22 tháng, 5% tài sản mỗi lần: lợi nhuận</span> <b>+23% → +51%</b><span>, sụt tối đa</span> <b>−20% → −9%</b><span>, ngày tệ nhất −7,1% → −4,3%; mỗi lệnh TB +113 → +235 bps, thắng 65% → 72% (riêng 2026, ngoài mẫu: 75%); nửa đầu 2025 (giai đoạn xấu nhất) từ −16% về gần hoà.</span>
        <span><b>Phí funding</b> (kiểm 2.835 lệnh với funding thật từng kỳ của Binance): 26% số lệnh giữ vắt qua giờ chốt funding, nhưng trung bình chỉ −0,6 bps/lệnh – không đổi kết luận (+226 → +225 bps, thắng 72%). Đuôi xấu: 0,6% số lệnh mất 0,5–2% vì funding, gần như toàn Short coin đang bị ép giá → bot bỏ lệnh sẽ phải trả funding ≥ ${nf((C.hk_fund ?? 50) / 100, 2)}%. Sàn thử trừ/cộng funding đúng giờ chốt; tài khoản Binance lấy lời lỗ, phí và funding thật từ sổ thu chi của sàn.</span>
        <span>Đã thử và KHÔNG dùng: chốt lời sớm bằng lệnh chờ (thắng tới 85% nhưng lời mỗi lệnh giảm mạnh, tổng kém hơn), thoát sớm khi đang lỗ, cắt lỗ chặt 5–25% (đều làm giảm lợi nhuận), giữ lâu hơn 60 phút, đặt sâu hơn 2×.</span>
        <span>Điều đáng biết: lời lớn nhất đến khi <b>cả thị trường cùng sập</b> (BTC giảm ≥ 0,5%/giờ hoặc nhiều coin cùng sốc): TB +410–490 bps/lệnh, thắng 84–89%; cú sốc riêng lẻ của 1 coin chỉ +44 bps, thắng 61%. Lệnh Short (bán cú vọt) yếu hơn Long nhiều (sau lọc: +106 vs +330 bps/lệnh) nhưng vẫn dương.</span></li>
      <li><b>Rủi ro thật:</b> <span>lệnh tệ nhất −94% (coin sập luôn không hồi) → mỗi lần chỉ dùng 5% tài sản và có cắt lỗ thảm hoạ. Lời dồn vào vài ngày cả thị trường sập mạnh; nhiều ngày không có lệnh nào; có tháng lỗ (tháng 7), tháng 8 lời rất lớn, tháng 9 gần hoà. Đây là kết quả quá khứ trên sàn thử – không bảo đảm tương lai.</span></li>
      <li><b>Đã thử và loại</b> <span>(không thắng nổi phí ngoài mẫu): đánh theo cú sốc, phá đỉnh/đáy 2 giờ kèm khối lượng, BTC dẫn – coin chạy theo, đảo chiều / đà chéo mỗi giờ, ăn funding quanh giờ chốt (giá luôn chạy ngược bù lại funding).</span></li></ul></details>`, bh?.n ? bi(`${bh.n} lệnh`, `${bh.n} trades`) : bi("chờ cú sốc", "waiting for a shock"));
  const ords = Object.entries(X.ord || {}).map(([k, o]) => `<li>${scK(k)} ${o.side > 0 ? "mua" : "bán"} maker ở ${px(o.px)} – còn ${nf(Math.max(0, o.queue), 4)} hàng chờ phía trước</li>`).join("");
  const HS = X.HS || [2, 5, 15, 30, 60, 120, 180, 240, 300, 450, 600, 900], BW = X.BW || 0.15, LK = Object.keys(X.LP || {}).filter((k) => k.length === 4);
  const GS = [...new Set(LK.map((k) => k.slice(0, 2)))].sort(), Gb = GS.includes(window.__scG) ? window.__scG : GS[0];
  const CX = (X.CTX || ["T+", "T-", "0+", "0-", "N+", "N-"]).filter((c) => LK.includes(Gb + c)), Cx = CX.includes(window.__scC) ? window.__scC : CX[0], G0 = Gb && Cx ? Gb + Cx : null;
  const learn = G0 && X.LP[G0] ? `<div class="bseg sc-gs">${GS.map((g) => `<button type="button" data-scg="${g}" class="${g === Gb ? "on" : ""}">${g[0] === "F" ? "Futures" : "Spot"} ${g[1]}</button>`).join("")}</div>
    <div class="bseg sc-gs">${CX.map((c) => `<button type="button" data-scc="${c}" class="${c === Cx ? "on" : ""}">${scC(c)}</button>`).join("")}</div><p class="sbh">${scG(Gb, X.TIERS)} · ${scC(Cx)}</p>
    <div class="tw"><table class="scl-t"><thead><tr><th class="l">Độ mạnh tín hiệu</th>${HS.map((h) => `<th>+${h}s</th>`).join("")}</tr></thead><tbody>${X.LP[G0].map((row, b) => `<tr><td class="l">${nf(b * BW, 2)}–${b === row.length ? "1" : b === 5 ? "1" : nf((b + 1) * BW, 2)}</td>${row.map(([n, m, sd]) => `<td class="${n >= C.min_n && m > 0.15 ? "up" : n < C.min_n ? "faint" : m < 0 ? "down" : ""}" title="${nf(n, 0)} mẫu · độ lệch ${nf(sd, 2)}">${n ? `${bps(m, 3)} <small class="faint">${n >= 1e6 ? nf(n / 1e6, 1) + "M" : n >= 1000 ? nf(n / 1000, 0) + "k" : n}</small>` : "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có mẫu.</p>`;
  const BY = X.by || {}, byRow = (t, nm) => { const b = BY[t] || {}; return `<tr><td class="l"><b>${nm}</b></td><td>${nf(b.n || 0, 0)}</td><td>${b.n ? nf(b.win / b.n * 100, 0) + "%" : "—"}</td><td class="${cls(b.net)}">${isNum(b.net) ? (b.net >= 0 ? "+" : "") + usd2(b.net) : "—"}</td><td class="down">${isNum(b.fees) ? usd2(b.fees) : "—"}</td></tr>`; };
  const trs = (X.trades || []).slice().reverse().map((t) => `<tr><td class="l"><small>${hms(t.t1)}</small></td><td class="l">${t.strat === "hook" ? "🪝 " : ""}${scK(t.k)} <span class="${t.side > 0 ? "up" : "down"}">${t.side > 0 ? "L" : "S"}</span> <small>${t.how}</small></td><td>${px(t.e)} → ${px(t.x)}</td><td>${nf(t.hold, 1)}s</td><td class="${cls(t.gross)}">${bps(t.gross, 2)}</td><td class="down">−${nf(t.fee, 2)}</td><td class="${cls(t.net)}"><b>${bps(t.net, 2)}</b></td><td class="${cls(t.usd)}">${t.usd >= 0 ? "+" : ""}${nf(t.usd, 3)}</td><td><small>${{ TP: "chốt lời", SL: "cắt lỗ", TIME: "hết thời gian giữ", "TIME+": "hết giờ (đã giữ thêm)", REV: "tín hiệu đảo chiều – thoát sớm", BTC: "BTC sốc ngược chiều – thoát ngay", STALE: "mất dữ liệu" }[t.why] || t.why}</small></td></tr>`).join("");
  const AT = X.trades || [], agg = (xs) => { const n = xs.length, f = (k) => xs.reduce((a, t) => a + (t[k] || 0), 0) / n; return { n, exp: f("exp"), gross: f("gross"), fee: f("fee"), net: f("net"), win: xs.filter((t) => t.net > 0).length / n * 100, hold: f("hold") }; };
  const aRow = (lbl, xs) => { const a = agg(xs); return `<tr><td class="l">${lbl}</td><td>${a.n}</td><td>${bps(a.exp, 2)}</td><td class="${cls(a.gross)}">${bps(a.gross, 2)}</td><td class="${a.gross < a.exp - 1 ? "down" : ""}">${bps(a.gross - a.exp, 2)}</td><td class="down">−${nf(a.fee, 2)}</td><td class="${cls(a.net)}"><b>${bps(a.net, 2)}</b></td><td>${nf(a.win, 0)}%</td><td>${nf(a.hold, 0)}s</td></tr>`; };
  const grp = (key, lab) => { const G = {}; AT.forEach((t) => (G[t[key] ?? "?"] ||= []).push(t)); return Object.entries(G).sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => aRow(lab(k), xs)).join(""); };
  const audit = AT.length ? `<div class="tw"><table><thead><tr><th class="l">Nhóm</th><th>Lệnh</th><th title="bps, đã trừ sai số – lúc vào lệnh">Kỳ vọng</th><th title="bps, trước phí">Gộp thực</th><th title="Gộp thực − kỳ vọng">Lệch</th><th>Phí</th><th>Ròng (bps)</th><th>Thắng</th><th>Giữ TB</th></tr></thead><tbody>
      ${aRow("<b>Tất cả</b>", AT)}<tr><td class="l sbh" colspan="9">Theo lý do thoát</td></tr>${grp("why", (k) => ({ TP: "chốt lời", SL: "cắt lỗ", TIME: "hết thời gian giữ", "TIME+": "hết giờ (đã giữ thêm)", REV: "tín hiệu đảo chiều – thoát sớm", STALE: "mất dữ liệu" }[k] || k))}
      <tr><td class="l sbh" colspan="9">Theo thời gian giữ dự kiến</td></tr>${grp("h", (k) => (k === "?" ? "(lệnh cũ)" : `${k}s`))}<tr><td class="l sbh" colspan="9">Theo vùng giá (SMC)</td></tr>${grp("zone", (k) => (k === "?" ? "(lệnh cũ / chưa rõ)" : ZONE_TXT[k] || k))}<tr><td class="l sbh" colspan="9">Theo bối cảnh</td></tr>${grp("ctx", (k) => (k === "?" ? "(lệnh cũ)" : scC(k)))}<tr><td class="l sbh" colspan="9">Theo loại</td></tr>${grp("t", (k) => (k === "F" ? "Futures" : "Spot"))}</tbody></table></div>
      <p class="faint" style="font-size:.75rem">Nếu "gộp thực" thấp hơn "kỳ vọng" một cách đều đặn, bộ học đang tự tin quá mức – bot cần thận trọng hơn. Nếu gộp thực ≈ kỳ vọng mà ròng vẫn âm, thì phí + chênh lệch quá lớn so với biên lời.</p>` : `<p class="muted">Chưa có lệnh để kiểm tra.</p>`;
  // ================================================================ GIAO DIỆN THEO TAB (A) – mỗi tab gọn, phần giải thích dài nằm trong nút ⓘ
  // Thứ tự tab theo cách dùng: tổng quan → TIỀN THẬT (quan trọng nhất) → các phương pháp (sàn thử) → theo dõi & học → thiết lập.
  // 🧪 Thử nghiệm gộp 2 nhóm phương pháp chạy song song trên sàn thử (giữ nhiều ngày + 📐 6 phương pháp định lượng), chọn bằng nút con.
  // 5 tab: Tổng quan · Binance (tiền thật) · 🎯 Phương pháp (nút con: Bắt râu sập / Lướt giây / Giữ nhiều ngày / Định lượng) · 📜 Nhật ký (Sự kiện / Học & kiểm chứng) · Thiết lập
  // 11/2026: tab = CHỨC NĂNG; sàn thử / Binance là BỘ LỌC (công tắc trên đầu Tổng quan & Lệnh), không còn tab "Binance thật" riêng.
  const TABS = [["ov", "Tổng quan"], ["ord", "Lệnh"], ["pm", "Phương pháp"], ["log", "Hoạt động"], ["set", "Thiết lập"]];      // 11/2026: Lệnh lên thứ 2 (dùng nhiều nhất); "Nhật ký" → "Hoạt động" (sự kiện bot) cho khỏi lẫn với Sổ lệnh
  const ENV = (window.__scEnv ?? (C.lv_on ? "live" : "paper")) === "live" ? "live" : "paper"; window.__scEnv = ENV;      // mở app: có tài khoản Binance thì luôn xem Binance trước; chọn tay giữ trong phiên
  let TOP = scNormTab(window.__scTab ?? lsGet("sctab", "ov")); if (!TABS.some(([k]) => k === TOP)) TOP = "ov"; window.__scTab = TOP;
  const PMS0 = window.__scPm ?? lsGet("scpm", "lab"), PMS = PMS0 === "hook" ? "hook" : PMS0 === "sec" ? "sec" : "lab", LOGS = (window.__scLog ?? lsGet("sclog", "ev")) === "learn" ? "learn" : "ev";
  const TB = TOP === "pm" ? PMS : TOP === "log" ? LOGS : TOP;
  let LB = null;      // 🧪 bảng thử nghiệm: danh sách phương pháp (để các nút / kéo-thả bên dưới dùng)
  const POS = Object.entries(X.pos || {}), posH = POS.filter(([, p]) => p.strat === "hook"), posS = POS.filter(([, p]) => p.strat !== "hook");
  const SWX = X.sw || null, swPos = SWX ? ["list", "pump"].reduce((a, k) => a + (SWX[k]?.pos?.length || 0), 0) : 0;
  const QX = X.q || null, QK = ["ou", "rsi2", "fund", "orb", "vwap", "liq"], qPos = QX ? QK.reduce((a, k) => a + (QX[k]?.pos?.length || 0), 0) : 0;
  const nHook = Object.keys(HK).length + posH.length;
  const nLive = (LV?.ev || []).length + (LV?.qp?.open?.length || 0) + (LV?.swp?.open?.length || 0), nPaper = nHook + posS.length + swPos + qPos;
  const badge = { ord: nLive + nPaper };      // số lệnh đang mở của CẢ 2 sàn – không đổi khi bấm công tắc sàn (từng sàn: số trên nút Binance / Sàn thử)
  const tabBar = `<nav class="sc-tabs" role="tablist" aria-label="Các phần của bot">${TABS.map(([k, t, sep]) => `<button type="button" role="tab" aria-selected="${k === TOP}" data-sctab="${k}" class="${k === TOP ? "on" : ""}">${t}${badge[k] ? `<i class="sc-bdg">${badge[k]}</i>` : ""}</button>${sep ? '<i class="sc-tsep" aria-hidden="true"></i>' : ""}`).join("")}</nav>`;
  const cnt = (n) => (n ? ` <i class="sc-bdg">${n}</i>` : "");
  const subSeg = TOP === "pm" ? `<div class="sc-sub2" role="tablist" aria-label="Phương pháp">${[["lab", `Tất cả · bật/tắt${cnt(nHook + posS.length + swPos + qPos)}`, "10 kiểu chơi · sàn thử & tiền thật"], ["hook", `Bắt râu sập${cnt(nHook)}`, "chi tiết · lệnh chờ · kiểm chứng"], ["sec", `Lướt giây${cnt(posS.length)}`, "chi tiết · lệnh đang mở"]].map(([k, t, s]) => `<button type="button" role="tab" data-scpm="${k}" class="${PMS === k ? "on" : ""}" aria-selected="${PMS === k}"><span>${t}</span><small>${s}</small></button>`).join("")}</div>`
    : TOP === "log" ? `<div class="sc-sub2" role="tablist" aria-label="Hoạt động">${[["ev", "Sự kiện", "mọi việc bot làm"], ["learn", "Học & kiểm chứng", "bot học được gì"]].map(([k, t, s]) => `<button type="button" role="tab" data-sclog="${k}" class="${LOGS === k ? "on" : ""}" aria-selected="${LOGS === k}"><span>${t}</span><small>${s}</small></button>`).join("")}</div>` : "";
  const info = (html, lab = "ⓘ Giải thích") => `<details class="sc-i"><summary>${lab}</summary><div class="sc-ib">${html}</div></details>`;
  const empty = (t) => `<p class="sc-empty">${t}</p>`;
  // ---------------------------------------------------------------- 🧪 PHƯƠNG PHÁP THỬ NGHIỆM (Giữ nhiều ngày + Định lượng): MỘT khuôn thẻ chung
  // thẻ = Làm gì → Bật/tắt (sàn thử | tiền thật) → Kết quả → ⚙️ Thông số (có mức chuẩn & lời khuyên) → Luật chi tiết
  const lmV = (p, d) => (p.top ? C[p.f] : (C[p.sc]?.[p.k]?.[p.f])) ?? d;      // giá trị đang lưu (chưa chỉnh = chuẩn)
  const lmShow = (p, v) => (p.mul ? +(v * p.mul).toFixed(4) : v);
  const lmRow = (m, p) => {
    const def = p.def, cur = p.top ? (C[p.f] ?? def) : (p.cur ?? lmV(p, def)), chg = String(cur) !== String(def), id = `${m.sc}|${m.k}|${p.f}`;
    const dshow = p.type === "n" ? `${nf(lmShow(p, def), Number.isInteger(lmShow(p, def)) ? 0 : p.dp ?? 2)}${p.unit ? " " + p.unit : ""}` : p.type === "b" ? (def ? "bật" : "tắt") : (p.opts.find(([v]) => String(v) === String(def))?.[1] || def);
    const ctl = p.type === "n" ? `<span class="sc-nin field"><input inputmode="decimal" data-lmf="${id}" data-mul="${p.mul || 1}" data-top="${p.top ? 1 : ""}" value="${lmShow(p, cur)}" aria-label="${esc(p.label)}"><small>${p.unit || ""}</small></span>`
      : p.type === "b" ? `<button type="button" class="sc-sw${cur ? " on" : ""}" data-lmb="${id}" role="switch" aria-checked="${!!cur}"><i></i><span>${cur ? "Bật" : "Tắt"}</span></button>`
      : `<div class="bseg sc-seg" data-lmg="${id}">${p.opts.map(([v, t]) => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? "on" : ""}">${t}</button>`).join("")}</div>`;
    return `<div class="sc-row lm-pr${chg ? " chg" : ""}" data-lmrow="${id}" data-def="${esc(String(def))}" data-type="${p.type}"><div class="sc-rl"><b>${p.label}</b><small>${p.desc || ""}</small><small class="lm-std">Chuẩn: <b>${dshow}</b>${p.tip ? ` · ${p.tip}` : ""}</small></div><div class="sc-rc">${ctl}</div></div>`;
  };
  const lmCard = (m) => {
    const nchg = m.params.filter((p) => { const cur = p.top ? (C[p.f] ?? p.def) : (p.cur ?? lmV(p, p.def)); return String(cur) !== String(p.def); }).length;
    const live = m.live.none ? `<div class="sc-row lm-off"><div class="sc-rl"><b>Tiền thật</b><small>${m.live.none}</small></div><div class="sc-rc"><span class="pill">không hỗ trợ</span></div></div>`
      : `<div class="sc-row"><div class="sc-rl"><b>${C.lv_env === "live" ? "💰 Tiền thật" : "🟡 Binance Demo"}</b><small>${m.live.note}</small></div><div class="sc-rc"><button type="button" class="sc-sw lm-real${m.live.on ? " on" : ""}" ${m.live.attr} role="switch" aria-checked="${m.live.on}"><i></i><span>${m.live.on ? "Bật" : "Tắt"}</span></button></div></div>`;
    const grpP = (g) => m.params.filter((p) => (p.g || "") === g).map((p) => lmRow(m, p)).join("");
    const groups = [...new Set(m.params.map((p) => p.g || ""))];
    return `<section class="panel lm${m.paper.on || m.live.on ? "" : " lm-sleep"}" id="lm-${m.k}">
      <header class="lm-h"><div class="lm-t"><h2>${m.ico} ${esc(m.name)}</h2><span class="lm-kind">${m.kind}</span></div><div class="lm-pills">${m.verdict}</div></header>
      <p class="lm-what">${m.what}</p>
      <div class="lm-g">
        <div class="lm-stats">${m.stats.map(([t, v, s]) => `<div class="lm-st"><span>${t}</span><b>${v}</b>${s ? `<small>${s}</small>` : ""}</div>`).join("")}</div>
        <div class="lm-sw"><h4 class="sc-gt">Bật / tắt</h4><div class="sc-rows">
          <div class="sc-row"><div class="sc-rl"><b>🧪 Sàn thử</b><small>${m.paper.note}</small></div><div class="sc-rc"><button type="button" class="sc-sw${m.paper.on ? " on" : ""}" ${m.paper.attr} role="switch" aria-checked="${m.paper.on}"><i></i><span>${m.paper.on ? "Bật" : "Tắt"}</span></button></div></div>
          ${live}</div>${m.mech ? `<p class="lm-mech">${m.mech}</p>` : ""}</div>
      </div>
      <details class="lm-par" data-lmo="p-${m.k}" ${window.__lmO?.["p-" + m.k] ? "open" : ""}><summary>⚙️ Thông số <small class="${nchg ? "warn" : "faint"}">${nchg ? `${nchg} mục đang khác chuẩn` : "đang dùng mức chuẩn"}</small></summary>
        ${groups.map((g) => `<div class="sc-grp">${g ? `<h4 class="sc-gt">${g}</h4>` : ""}<div class="sc-rows">${grpP(g)}</div></div>`).join("")}
        <div class="lm-bar"><span class="faint lm-dm">Áp dụng cho lệnh MỚI · lệnh đang mở giữ nguyên.</span><button type="button" class="btn" data-lmstd="${m.sc}|${m.k}">↺ Về chuẩn</button><button type="button" class="btn primary" data-lmsave="${m.sc}|${m.k}" disabled>💾 Lưu</button></div>
      </details>
      <details class="lm-rule" data-lmo="r-${m.k}" ${window.__lmO?.["r-" + m.k] ? "open" : ""}><summary>📖 Luật chi tiết & cách kiểm chứng</summary><div class="lm-rb">${m.rule}</div></details>
    </section>`;
  };
  const lmOver = (L) => `<div class="tw"><table class="rs lm-ov keep"><thead><tr><th class="l">Phương pháp</th><th>Sàn thử</th><th>Tiền thật</th><th>Kết quả sàn thử</th><th class="l">Kiểm chứng</th></tr></thead><tbody>${L.map((m) => `<tr><td class="l"><a href="#lm-${m.k}" data-lmgo="${m.k}"><b>${m.ico} ${esc(m.name)}</b></a></td>
      <td><span class="lm-dot${m.paper.on ? " on" : ""}">${m.paper.on ? "bật" : "tắt"}</span></td><td>${m.live.none ? `<span class="faint">—</span>` : `<span class="lm-dot${m.live.on ? " on real" : ""}">${m.live.on ? "bật" : "tắt"}</span>`}</td>
      <td>${m.res}</td><td class="l">${m.verdict}</td></tr>`).join("")}</tbody></table></div>`;
  // ---------------------------------------------------------------- (B) thanh trạng thái 1 dòng – đèn xanh / vàng / đỏ
  const dataOk = anyLive && age != null && age < 30;
  const lt = (c, lab, val, tip) => `<span class="sc-li ${c}"${tip ? ` title="${esc(tip)}"` : ""}><i></i><b>${lab}</b><span>${val}</span></span>`;
  const lights = [
    lt(st[1] === "buy" ? "ok" : st[1] === "sell" ? "bad" : st[1] === "warn" ? "warn" : "off", "Bot", esc(String(st[0]).replace(/^[●⏸]\s*/, "")), st[2]),
    lt(dataOk ? "ok" : X.at ? "warn" : "off", "Dữ liệu", dataOk ? bi(`${nf(nMk, 0)} thị trường · ${nf(rate, 0)} tin/giây`, `${nf(nMk, 0)} markets · ${nf(rate, 0)} msg/s`) : X.at ? bi(`cũ ${durVi(age)}`, `${nf(age, 0)}s old`) : bi("chưa có", "none yet"), ""),
    lt(fl.length && fl.every((f) => f.ws) ? "ok" : fl.length ? "warn" : "off", "Sàn", Object.entries(FD).map(([t, f]) => `${t === "F" ? "Futures" : "Spot"} ${esc(f.src || "—")}`).join(" · ") || "—", ""),
    lt(!C.lv_on ? "off" : LV?.halt ? "bad" : LV?.ready && lvSt.ok ? "ok" : "warn", LV?.env === "live" || C.lv_env === "live" ? "Binance THẬT" : "Binance Demo", !C.lv_on ? bi("đang tắt", "off") : LV?.halt ? bi("đang ngừng", "halted") : lvSt.bal != null ? usd2(lvSt.bal) : lvSt.why ? bi("cần xem", "check") : "—", lvSt.why || LV?.halt || ""),
  ].join("");
  // ---- khung trạng thái (kiểu thẻ iOS): đèn + trạng thái lớn · công tắc bật/tắt · ⋯ ; dưới là 3 ô Dữ liệu / Sàn / Binance ; cuối là dòng "Chi tiết kỹ thuật ›"
  const bS = st[1] === "buy" ? "ok" : st[1] === "sell" ? "bad" : st[1] === "warn" ? "warn" : "off";
  const tile = (c, lab, val, tip) => `<div class="hz-tl ${c}"${tip ? ` title="${esc(tip)}"` : ""}><small><i></i>${lab}</small><b>${val}</b></div>`;
  const hzSub = dataOk ? bi(`${nf(nMk, 0)} thị trường · ${nf(rate, 0)} tin/giây`, `${nf(nMk, 0)} markets · ${nf(rate, 0)} msg/s`) : X.at ? bi(`dữ liệu cũ ${durVi(age)}`, `data ${nf(age, 0)}s old`) : bi("chưa có dữ liệu", "no data yet");
  // ---- dải trạng thái gọn (chữ nhỏ): đèn + trạng thái · Dữ liệu · Sàn · Binance · giá trực tiếp | công tắc nhỏ · ⓘ · ⋯
  const chip = (c, txt, tip) => `<span class="hz2-c ${c}"${tip ? ` title="${esc(tip)}"` : ""}><i></i>${txt}</span>`;
  const hero = `<section class="panel sc-hero hz2">
    <div class="hz2-r"><div class="hz2-l"><span class="hz2-s ${bS}"><i></i><b>${esc(String(st[0]).replace(/^[●⏸]\s*/, ""))}</b></span>
      ${chip(dataOk ? "ok" : X.at ? "warn" : "off", dataOk ? bi(`${nf(nMk, 0)} thị trường · ${nf(rate, 0)}/s`, `${nf(nMk, 0)} mkts · ${nf(rate, 0)}/s`) : X.at ? bi(`dữ liệu cũ ${durVi(age)}`, `data ${nf(age, 0)}s old`) : bi("chưa có dữ liệu", "no data"), bi("Dữ liệu thị trường bot đang nghe", "Market data feed"))}
      ${chip(fl.length && fl.every((f) => f.ws) ? "ok" : fl.length ? "warn" : "off", Object.entries(FD).map(([t, f]) => `${t === "F" ? "F" : "S"}·${esc(String(f.src || "—").replace(/f$/, ""))}`).join(" ") || bi("sàn —", "feeds —"), Object.entries(FD).map(([t, f]) => `${t === "F" ? "Futures" : "Spot"} ${f.src || "—"}`).join(" · "))}
      ${chip(!C.lv_on ? "off" : LV?.halt ? "bad" : LV?.ready && lvSt.ok ? "ok" : "warn", `${LV?.env === "live" || C.lv_env === "live" ? bi("Thật", "Live") : "Demo"} ${!C.lv_on ? bi("tắt", "off") : LV?.halt ? bi("ngừng", "halted") : lvSt.bal != null ? usd2(lvSt.bal) : "—"}`, lvSt.why || LV?.halt || bi("Tài khoản Binance của bot", "Bot's Binance account"))}
      <span id="scLive" class="sc-lv hz2-lv"></span></div>
      <div class="hz2-a"><button type="button" class="ios-sw sm" id="scOn" role="switch" aria-checked="${!!C.enabled}" aria-label="${C.enabled ? "Tắt bot" : "Bật bot"}" title="${C.enabled ? "Tắt bot" : "Bật bot"}"><i></i></button>
        <button type="button" class="hz2-ic" data-hzinfo aria-label="Chi tiết kỹ thuật" title="Chi tiết kỹ thuật"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.01"/></svg></button>
        <div class="sc-act"><details class="sc-more"><summary class="hz-ic hz2-ic" aria-label="Thêm thao tác"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></summary><div class="sc-menu"><button class="btn" id="scAuto" title="Trang tự cập nhật số liệu – tạm dừng để xem kỹ">${autoOff("scalp") ? "▶ Tự cập nhật trang" : "⏸ Dừng tự cập nhật trang"}</button><button class="btn" id="scReset" title="Tài khoản sàn thử về vốn ban đầu, xoá lịch sử lệnh – GIỮ nguyên bộ nhớ học">↺ Làm lại tài khoản sàn thử</button></div></details></div></div></div>
    ${X.pause ? `<div class="hz-pause"><span>⏸ ${esc(X.pause.why)}</span>${C.enabled ? `<button class="btn sm primary" id="scRes" title="Bỏ qua lần nghỉ này, chạy tiếp ngay (≤ 30 giây)">▶ Chạy tiếp</button>` : ""}</div>` : ""}
    ${info(`<div class="sc-fd">${X.at ? `<small id="scAge" data-at="${X.at}" data-noi18n class="faint"></small>` : ""}${feedTxt}${bn}<small class="faint">${esc(st[2])}</small></div>`, "Chi tiết kỹ thuật")}</section>`;
  // ---------------------------------------------------------------- 💰 TỔNG TÀI SẢN BINANCE (máy chủ riêng đọc mỗi 5 phút, chỉ quyền ĐỌC)
  const WAL = LV?.wal || {}, WALH = LV?.walH || {}, wEnvs = ["live", "demo"].filter((e) => WAL[e]?.at);
  const wEnv = wEnvs.includes(window.__scWal) ? window.__scWal : wEnvs.includes(LV?.env) ? LV.env : wEnvs[0];
  const chg = (H, mins) => { if (!H?.length) return null; const last = H[H.length - 1], ref = H.find((q) => q[0] >= last[0] - mins) || H[0]; return ref && ref !== last && ref[1] > 0 ? [last[1] - ref[1], (last[1] / ref[1] - 1) * 100] : null; };
  const WN = { Spot: bi("Spot", "Spot"), Funding: bi("Funding (nạp/rút, P2P)", "Funding"), Earn: bi("Earn (tiết kiệm)", "Earn"), Futures: "USDⓈ-M Futures" };
  const walPanel = (() => {
    if (!wEnv) return ""; const u$ = (v) => (v < 0 ? "−$" : "$") + nf(Math.abs(v), 2);
    const W = WAL[wEnv], H = WALH[wEnv] || [], d1 = chg(H, 1440), d7 = chg(H, 7 * 1440), tot = W.total || 0;
    const seg = wEnvs.length > 1 ? `<div class="bseg">${wEnvs.map((e) => `<button type="button" data-scwal="${e}" class="${e === wEnv ? "on" : ""}">${e === "live" ? bi("💵 Tài khoản thật", "💵 Live account") : bi("🟡 Demo", "🟡 Demo")}</button>`).join("")}</div>` : "";
    const kp = `<dl class="stats sc-kp">${[
      [bi("Tổng tài sản", "Total assets"), u$(tot), `${(W.wallets || []).length} ${bi("ví", "wallets")} · ${hms(W.at)}`, 0, "", spark(H.map((q) => q[1]), { w: 150, h: 30 })],
      [bi("24 giờ", "24 hours"), d1 ? `${d1[0] >= 0 ? "+" : ""}${u$(d1[0])}` : "—", d1 ? pct(d1[1], 2) : bi("cần thêm số liệu", "needs more data"), d1 ? sgn(d1[0]) : 0],
      [bi("7 ngày", "7 days"), d7 ? `${d7[0] >= 0 ? "+" : ""}${u$(d7[0])}` : "—", d7 ? pct(d7[1], 2) : bi("cần thêm số liệu", "needs more data"), d7 ? sgn(d7[0]) : 0],
      W.fut ? [bi("Futures", "Futures"), usd2(W.fut.margin), `${bi("lãi/lỗ đang mở", "unrealized")} ${W.fut.upnl >= 0 ? "+" : ""}${usd2(W.fut.upnl)} · ${bi("khả dụng", "available")} ${usd2(W.fut.avail)}`, sgn(W.fut.upnl)] : null,
    ].filter(Boolean).map((x) => stc(x)).join("")}</dl>`;
    const wb = (W.wallets || []).map(([n, v]) => `<div class="sc-wb"><span>${esc(WN[n] || n)}</span><i><b style="width:${tot > 0 ? Math.max(1, v / tot * 100).toFixed(1) : 0}%"></b></i><span class="num">${u$(v)}</span><small class="faint">${tot > 0 ? nf(v / tot * 100, 1) + "%" : ""}</small></div>`).join("");
    // theo coin: mỗi coin 1 hàng gọn – tên + số lượng · giá trị + tỉ trọng; dưới là vạch tỉ trọng + nằm ở ví nào
    const ar = (W.assets || []).map(([a, q, u, w]) => { const sh = tot > 0 ? u / tot * 100 : 0, wl = Object.entries(w).sort((x, y) => y[1] - x[1]);
      const wl2 = wl.filter(([, v]) => v >= 0.005);
      return `<div class="sc-ca"><b class="ca-n">${esc(a)}</b><b class="ca-v">${u$(u)}</b><small class="ca-q">${qty(q)}</small><small class="ca-p">${tot > 0 ? nf(sh, 1) + "%" : "—"}</small>
        <i class="ca-b"><b style="width:${Math.max(0.6, sh).toFixed(1)}%"></b></i><small class="ca-w" title="${esc(wl.map(([k, v]) => `${WN[k] || k} ${usd2(v)}`).join(" · "))}">${(wl2.length ? wl2 : wl).map(([k, v]) => `${esc(String(WN[k] || k).replace(/ \(.*\)$/, ""))}${wl2.length > 1 ? " " + usd2(v) : ""}`).join(" · ")}</small></div>`; }).join("");
    const ch = H.length > 2 ? lineSvg([{ name: bi("Tổng tài sản (USDT)", "Total assets (USDT)"), color: css("--brand"), width: 2, pts: H.map(([m, v]) => ({ x: new Date(m * 60000).toLocaleString(LOC, { day: "2-digit", month: "2-digit", hour: "2-digit" }), y: v })) }], { h: 170, dec: 2 }) : `<p class="faint sc-cap">${bi("Đường tổng tài sản hiện sau vài giờ (mỗi giờ 1 điểm).", "The total-assets line appears after a few hours (one point per hour).")}</p>`;
    return panel(bi(`💰 Tổng tài sản Binance ${wEnv === "live" ? "– tài khoản thật" : "– Demo"}`, `💰 Total Binance assets ${wEnv === "live" ? "– live account" : "– Demo"}`), `${seg}${kp}
      <div class="sc-g2"><div><p class="sbh">${bi("Theo ví", "By wallet")}</p>${wb || empty("—")}</div><div><p class="sbh">${bi("Diễn biến", "History")}</p>${ch}</div></div>
      ${ar ? `<p class="sbh">${bi("Theo coin", "By coin")} <small class="faint">· ${(W.assets || []).length} coin</small></p><div class="sc-cal">${ar}</div>` : ""}
      ${W.err?.length ? `<p class="faint sc-cap">⚠️ ${bi("Chưa đọc được", "Couldn't read")}: ${esc(W.err.join(" · "))}</p>` : ""}${W.nopx?.length ? `<p class="faint sc-cap">${bi("Chưa có giá quy đổi (tính 0)", "No USDT price (counted as 0)")}: ${esc(W.nopx.join(", "))}</p>` : ""}
      ${info(bi(`<p>Máy chủ riêng đọc tài khoản bằng khoá API của bot mỗi 5 phút – <b>chỉ đọc</b>, không đặt lệnh, không rút tiền. ${wEnv === "live" ? "Tài khoản thật: lấy số dư từng ví do Binance tự quy ra USDT (Spot, Funding, Earn, Futures, Margin, Bot…) – khớp với số \"Tổng tài sản\" trong ứng dụng Binance; chi tiết từng coin lấy ở Spot, Funding, Earn, Futures." : "Sàn Demo không có cổng ví tổng nên tổng = Spot + Futures."} Giá quy đổi theo giá Binance spot. Số liệu chỉ lưu trong tài khoản MyBit của anh.</p>`, `<p>Your own server reads the account with the bot's API key every 5 minutes – <b>read only</b>, no orders, no withdrawals. ${wEnv === "live" ? "Live account: each wallet's balance as valued in USDT by Binance itself (Spot, Funding, Earn, Futures, Margin, Bots…) – matches \"Total assets\" in the Binance app; per-coin detail from Spot, Funding, Earn and Futures." : "Binance Demo has no all-wallet endpoint, so total = Spot + Futures."} Prices from Binance spot. The data is stored only in your MyBit account.</p>`))}`, bi("chỉ đọc · cập nhật 5 phút/lần", "read only · every 5 minutes"));
  })();
  // ---------------------------------------------------------------- (B) 4 thẻ số + biểu đồ mini
  const cum = (a) => { let s = 0; return a.map((v) => (s += v || 0)); };
  const eqv = (X.eqs || []).map((q) => q[1]), m0d = Date.parse(vnToday() + "T00:00:00+07:00") / 60000, eqT = (X.eqs || []).filter((q) => q[0] >= m0d).map((q) => q[1]);
  const DD = { ...(window.__scDays?.data?.paper?.days || {}) }; if (X.today?.d) DD[X.today.d] = { ...DD[X.today.d], ...X.today };
  const k7 = Object.keys(DD).sort().slice(-7), d7 = k7.map((k) => DD[k].usd || 0), s7 = d7.reduce((a, v) => a + v, 0);
  const TDY = X.today;
  const cards = `<dl class="stats sc-kp">${[
    [bi("Tài sản", "Equity"), isNum(X.eq) ? usd2(X.eq) : "—", `${bi("vốn", "capital")} ${usd(X.start ?? C.capital)} · ${pct(ret, 2)}`, sgn(ret), "", spark(eqv, { w: 150, h: 30 })],
    [bi("Hôm nay", "Today"), pct(dayP, 2), TDY ? `${TDY.usd >= 0 ? "+" : ""}${usd2(TDY.usd || 0)} · ${nf(TDY.n || 0, 0)} ${bi("lệnh", "trades")}` : bi(`dừng ở −${nf(C.daily_stop, 1)}%`, `stop at −${nf(C.daily_stop, 1)}%`), sgn(dayP), bi(`dừng khi lỗ ${C.daily_stop}% trong ngày`, `stops at a ${C.daily_stop}% daily loss`), spark(eqT, { w: 150, h: 30 })],
    [bi("7 ngày", "7 days"), d7.length ? `${s7 >= 0 ? "+" : ""}${usd2(s7)}` : "—", d7.length ? bi(`${d7.filter((v) => v > 0).length}/${d7.length} ngày lời`, `${d7.filter((v) => v > 0).length}/${d7.length} winning days`) : bi("chưa có số liệu", "no data yet"), sgn(s7), "", spark(cum(d7), { w: 150, h: 30 })],
    wEnv ? [bi(`Binance ${wEnv === "live" ? "thật" : "Demo"}`, `Binance ${wEnv === "live" ? "live" : "Demo"}`), "$" + nf(WAL[wEnv].total || 0, 2), (() => { const c = chg(WALH[wEnv], 1440); const T = (LV?.hist || []).filter((h) => (h.env || "demo") === wEnv && vnDayOf(h.t2) === vnToday()), u = T.reduce((x, h) => x + (h.pnl || 0), 0);
      return `${bi("hôm nay", "today")} ${T.length ? `${nz(u, 2) > 0 ? "+" : ""}${usd2(u)} · ${T.length} ${bi("lệnh thật", "real trades")}` : bi("chưa có lệnh", "no trades")}${c ? ` · 24h ${pct(c[1], 2)}` : ""}`; })(), (() => { const c = chg(WALH[wEnv], 1440); return c ? sgn(c[0]) : 0; })(), "", spark((WALH[wEnv] || []).map((q) => q[1]), { w: 150, h: 30 })] : null,
    ["Tỉ lệ thắng", S.n ? nf(S.win / S.n * 100, 0) + "%" : "—", S.n ? bi(`${nf(S.n, 0)} lệnh · 50 gần nhất ${L50 ? bps(L50.net, 1) + " bps" : "—"}`, `${nf(S.n, 0)} trades · last 50 ${L50 ? bps(L50.net, 1) + " bps" : "—"}`) : bi("chưa có lệnh", "no trades yet"), 0, "", spark(cum(AT.map((t) => t.usd)), { w: 150, h: 30 })],
  ].filter(Boolean).map((x) => stc(x)).join("")}</dl>`;
  // ---------------------------------------------------------------- (B) thẻ lệnh đang mở + lệnh chờ (giá Binance trực tiếp, thanh thời gian, khoảng cách tới cắt lỗ)
  const okPx = (v) => isNum(v) && v > 0 && v < 1e15;
  // ✋ nút ĐÓNG TAY trên mỗi lệnh đang mở / đang chờ (gửi yêu cầu qua thiết lập, máy chủ xử lý ≤ 30 giây)
  // MXE[key] = số liệu để ƯỚC TÍNH lời/lỗ ròng nếu đóng ngay: e giá vào, q khối lượng, sd 1/−1, f0 phí đã trả, fr % phí taker lúc đóng, fund funding đã nhận(+)/trả(−) (null = chưa biết), pk mã giá sống, m giá dự phòng, sl % trượt giá ước tính
  const MXE = (window.__MXE = {});
  const mxRow = (key, name, real, est) => { const b = window.__mClosing?.[key]; if (est) MXE[key] = est; return `<div class="sc-mxr"><button type="button" class="sc-mx${real ? " real" : ""}${b ? " busy" : ""}" data-mclose="${esc(key)}" data-mname="${esc(name)}" data-mreal="${real ? 1 : 0}" ${b ? "disabled" : ""}>${b ? bi("⏳ Đang gửi lệnh đóng…", "⏳ Closing…") : bi("✕ Đóng lệnh", "✕ Close")}</button></div>`; };
  // ✋ "Vào ngay" cho lệnh Bắt râu sập đang chờ khớp (sàn thử / Binance): huỷ lệnh chờ còn lại, vào phần còn thiếu bằng giá thị trường
  const enterBtn = (key, name, real) => { const b = window.__mEntering?.[key]; return `<button type="button" class="sc-mx sc-me${real ? " real" : ""}${b ? " busy" : ""}" data-menter="${esc(key)}" data-mname="${esc(name)}" data-mreal="${real ? 1 : 0}" ${b ? "disabled" : ""}>${b ? "Đang gửi…" : "Vào ngay"}</button>`; };
  const withMx = (html, key, name, real, est, enter) => html.replace(/<\/div>\s*$/, mxRow(key, name, real, est).replace('<div class="sc-mxr">', `<div class="sc-mxr">${enter ? enterBtn(key, name, real) : ""}`) + "</div>");
  const pcard0 = (k, p) => `<div class="sc-oc ${p.side > 0 ? "L" : "S"}"><div class="r1"><span>${p.strat === "hook" ? "🪝" : "⚡"} <b>${scK(k)}</b> <span class="${p.side > 0 ? "up" : "down"}">${p.side > 0 ? "Long" : "Short"}</span></span><b class="lpx" data-lpx="${esc(k)}">${px(isNum(p.m) ? p.m : p.e)}</b></div>
      <div class="r1s">${accT("paper")} ${p.strat === "hook" ? `${bi("Bắt râu sập · sốc", "Wick Catcher · shock")} ${nf((p.R || 0) / 100, 1)}%` : esc(p.how || "")}</div>
      <div class="r2" data-lpnl="${esc(k)}" data-e="${p.e}" data-q="${p.q}" data-sd="${p.side}" data-f0="${p.fee || 0}" data-fr="${frOf(p)}" data-sl="${p.sl}" data-tp="${p.tp}"><b>—</b></div>
      <div class="r3"><small>${bi("vào", "entry")} <b>${px(p.e)}</b> · ${usd2(p.q * p.e)}</small>${okPx(p.sl) ? `<small class="down" data-lsd="${esc(k)}" data-sl="${p.sl}" data-sd="${p.side}">${bi("cắt lỗ", "stop")} ${px(p.sl)}</small>` : `<small class="faint">${bi("không cắt lỗ", "no stop")}</small>`}${okPx(p.tp) ? `<small class="up">${bi("chốt", "target")} ${px(p.tp)}</small>` : ""}</div>
      <div class="r4" data-lt0="${p.t0}" data-lh="${p.h}"><span class="sc-cd"><i></i></span><small></small><small class="faint">${bi("tự đóng sau", "auto-closes after")} ${p.h >= 600 ? nf(p.h / 60, 0) + bi(" phút", " min") : nf(p.h, 0) + bi(" giây", " s")}</small></div></div>`;
  const pcard = (k, p) => withMx(pcard0(k, p), "pp:" + k, `${k.split(":")[0]} ${p.side > 0 ? "Long" : "Short"} (sàn thử)`, false, { pk: k, e: p.e, q: p.q, sd: p.side, f0: p.fee || 0, fr: frOf(p), fund: p.fund || 0, m: p.m, sl: 0, paper: 1 });
  const hcard0 = (k, h) => `<div class="sc-oc pend ${h.side > 0 ? "L" : "S"}"><div class="r1"><span>🪝 <b>${scK(k)}</b> <span class="${h.side > 0 ? "up" : "down"}">${bi("chờ", "pending")} ${h.side > 0 ? "Long" : "Short"}</span></span><b class="lpx" data-lpx="${esc(k)}">${px(h.c0)}</b></div>
      <div class="r1s">${accT("paper")} ${bi("Bắt râu sập · sốc", "Wick Catcher · shock")} ${h.side > 0 ? "−" : "+"}${nf(h.R / 100, 1)}% · z ${nf(h.z, 1)}</div>
      ${h.lv.map((l) => `<div class="sc-lvl"><span>${l.f ? "✅" : "⏳"} ${bi("mức", "level")} ${nf(l.d, 1)}× ${bi("ở", "at")} <b>${px(l.px)}</b></span><small class="faint" data-lgap="${esc(k)}" data-px="${l.px}" data-sd="${h.side}" data-f="${l.f ? 1 : 0}">${l.f ? bi("đã khớp", "filled") : ""}</small></div>`).join("")}
      <div class="r4" data-lt0="${h.t0}" data-lh="${(h.exp - h.t0) / 1000}"><span class="sc-cd"><i></i></span><small></small><small class="faint">${bi("còn chờ khớp", "waiting to fill")}</small></div></div>`;
  const hcard = (k, h) => withMx(hcard0(k, h), "pp:" + k, `lệnh chờ ${k.split(":")[0]} (sàn thử)`, false, { nofill: 1, paper: 1 }, h.lv.some((l) => !l.f));
  const lvEst = (e) => (e.pos?.q > 0 ? { pk: e.k || e.sym.replace(/USDT$/, "") + ":F", e: e.pos.ap, q: e.pos.q, sd: e.side, f0: e.fees || 0, fr: C.fee_t, fund: e.fund ?? null, sl: 0.05, pend: e.lv.filter((l) => l.st === "open" || l.st === "wait").length } : { nofill: 1 });
  const accT = (a) => `<span class="sc-acc ${a}">${a === "paper" ? bi("Sàn thử", "Paper") : a === "live" ? bi("💵 Tiền thật", "💵 Real") : "Demo"}</span>`;
  const lvAcc = () => accT(LV?.env === "live" ? "live" : "demo");
  // 1 mẫu thẻ duy nhất cho lệnh Binance (trang Tổng quan và thẻ Binance dùng chung) – cùng bố cục với thẻ sàn thử
  const lvCard = (e) => { const k = e.k || e.sym.replace(/USDT$/, "") + ":F", P = e.pos || {}, pend = e.lv.filter((l) => l.st === "open" || l.st === "wait"), t0 = Date.parse(e.t0 + "Z"), ex = Date.parse(e.exp + "Z"), sh = e.side > 0 ? "−" : "+";
    return withMx(`<div class="sc-oc lv ${P.q > 0 ? "" : "pend "}${e.side > 0 ? "L" : "S"}"><div class="r1"><span>🪝 <b>${scK(k)}</b> <span class="${e.side > 0 ? "up" : "down"}">${P.q > 0 ? "" : bi("chờ ", "pending ")}${e.side > 0 ? "Long" : "Short"}</span></span><b class="lpx" data-lpx="${esc(k)}">—</b></div>
      <div class="r1s">${lvAcc()} ${bi("Bắt râu sập", "Wick Catcher")}${e.R ? ` · ${bi("sốc", "shock")} ${sh}${nf(e.R / 100, 1)}%` : ""}</div>
      ${P.q > 0 ? `<div class="r2" data-lpnl="${esc(k)}" data-e="${P.ap}" data-q="${P.q}" data-sd="${e.side}" data-f0="${e.fees || 0}" data-fr="${C.fee_t}" data-sl="${e.stop || 0}" data-tp="0"><b>—</b></div>
      <div class="r3"><small>${bi("vào TB", "avg entry")} <b>${px(P.ap)}</b> · ${qty(P.q)} · ${usd2(P.q * P.ap)}</small>${e.stop ? `<small class="down" data-lsd="${esc(k)}" data-sl="${e.stop}" data-sd="${e.side}">${bi("cắt lỗ trên sàn", "exchange stop")} ${px(e.stop)}</small>` : ""}</div>` : ""}
      ${e.lv.map((l, i) => `<div class="sc-lvl"><span>${{ open: "⏳", wait: "🕒", filled: "✅", cxl: "✖" }[l.st] || ""} ${bi("mức", "level")} ${i + 1} ${bi("ở", "at")} <b>${px(l.px)}</b> <small class="faint">· ${qty(l.q)}${l.fq > 0 && l.st !== "filled" ? ` (${bi("khớp", "filled")} ${qty(l.fq)})` : ""}</small></span><small class="faint" data-lgap="${esc(k)}" data-px="${l.px}" data-sd="${e.side}" data-f="${l.st === "open" || l.st === "wait" ? 0 : 1}">${l.st === "filled" ? bi("đã khớp", "filled") : l.st === "cxl" ? bi("đã huỷ", "cancelled") : l.st === "wait" ? bi("chờ giá tới gần mới gửi", "sent when price is near") : ""}</small></div>`).join("")}
      ${P.q > 0 ? `<div class="r4" data-lt0="${P.t1}" data-lh="${(e.hold || 60) * 60}"><span class="sc-cd"><i></i></span><small></small><small class="faint">${bi("tự đóng sau", "auto-closes after")} ${nf(e.hold || 60, 0)}${bi(" phút", " min")}</small></div>` : pend.length && Date.now() < ex ? `<div class="r4" data-lt0="${t0}" data-lh="${(ex - t0) / 1000}"><span class="sc-cd"><i></i></span><small></small><small class="faint">${bi("còn chờ khớp", "waiting to fill")}</small></div>` : ""}</div>`, "lv:" + e.id, `${e.sym.replace(/USDT$/, "")} ${e.side > 0 ? "Long" : "Short"} trên Binance ${LV?.env === "live" ? "THẬT" : "Demo"}`, LV?.env === "live", lvEst(e), pend.length > 0 && Date.now() < ex);
  };
  const lcard = lvCard;
  const openCards = [...POS.map(([k, p]) => pcard(k, p)), ...Object.entries(HK).map(([k, h]) => hcard(k, h)), ...(LV?.ev || []).map(lcard)].join("");
  const openPanel = panel("📌 Đang mở & đang chờ", openCards ? `<div class="sc-ocs">${openCards}</div>` : empty(bi(`Chưa có lệnh nào đang mở. 🪝 Bắt râu sập chờ cú sốc ≥ ${nf(C.hk_r / 100, 1)}%/phút – vài lần mỗi ngày, có ngày không có.`, `No open trades. 🪝 Wick Catcher waits for a ≥ ${nf(C.hk_r / 100, 1)}%/minute shock – a few times a day, some days none.`)), bi(`${POS.length} lệnh · ${Object.keys(HK).length} chờ khớp${LV?.ev?.length ? ` · ${LV.ev.length} trên Binance` : ""}`, `${POS.length} open · ${Object.keys(HK).length} pending${LV?.ev?.length ? ` · ${LV.ev.length} on Binance` : ""}`));
  // ---------------------------------------------------------------- (B) biểu đồ: tài sản + điểm đóng lệnh, lời/lỗ cộng dồn theo phương pháp
  const EQ = X.eqs || [], m0 = EQ.length ? EQ[0][0] : 0, tm = (m) => new Date(m * 60000).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" });
  const mk = EQ.map(() => null), mkc = EQ.map(() => null);
  AT.forEach((t) => { const m = Math.floor(Date.parse(t.t1 + "Z") / 60000) - m0; if (m >= 0 && m < EQ.length) { mk[m] = EQ[m][1]; mkc[m] = t.usd >= 0 ? css("--up") : css("--down"); } });
  const eqChart = EQ.length > 2 ? lineSvg([{ name: "Tài sản (USDT)", color: css("--brand"), width: 2, pts: EQ.map(([m, v]) => ({ x: tm(m), y: v })) }, { name: "Đóng lệnh", dots: true, color: css("--ink-2"), pts: mk.map((y, i) => ({ x: tm(EQ[i][0]), y, c: mkc[i] })) }], { h: 200, dec: 2 }) : empty("Đường tài sản hiện sau vài phút chạy.");
  const ATs = AT.slice().sort((a, b) => (a.t1 < b.t1 ? -1 : 1));
  let ch = 0, cs = 0; const stp = ATs.map((t) => { if (t.strat === "hook") ch += t.usd || 0; else cs += t.usd || 0; return { x: hms(t.t1), h: +ch.toFixed(3), s: +cs.toFixed(3) }; });
  const stChart = stp.length > 1 ? lineSvg([{ name: "🪝 Bắt râu sập", color: css("--brass") || css("--brand"), width: 2, pts: stp.map((p) => ({ x: p.x, y: p.h })) }, { name: "⚡ Lướt giây", color: css("--ink-2"), width: 1.5, pts: stp.map((p) => ({ x: p.x, y: p.s })) }], { h: 160, dec: 2, zero: true }) : empty("Chưa đủ lệnh để vẽ.");
  // 🧪 Thử nghiệm (SwingLab – Short niêm yết / Short bơm): giữ nhiều ngày nên tính riêng, kèm lệnh đang mở & lãi/lỗ tạm tính
  const swRows = () => {
    if (!SWX) return `<tr><td class="l">🧪 Thử nghiệm</td><td colspan="4" class="faint">${bi("chưa chạy – máy chủ riêng cần cập nhật bản mới (sudo bash /opt/my-bit/scalper/install.sh)", "not running – update your server")}</td></tr>`;
    return ["list", "pump"].filter((k) => SWX[k]).map((k) => { const B = SWX[k], H = B.hist || [], st = B.st || {}, op = (B.pos || []).length, up = (B.pos || []).reduce((a, x) => a + (x.upnl || 0), 0);
      return `${sRow(`🧪 ${k === "list" ? bi("Short niêm yết", "Short listings") : bi("Short bơm", "Short pumps")}`, { n: st.n || 0, win: st.win || 0, net: st.pnl || 0, bps: H.reduce((a, x) => a + (x.pct || 0) * 100, 0) * ((st.n || 0) / Math.max(1, H.length)) })}${op ? `<tr><td class="l faint" colspan="5"><small>↳ ${op} ${bi("lệnh đang mở", "open")} · ${bi("tạm tính", "unrealized")} <b class="${cls(up)}">${nz(up, 2) > 0 ? "+" : ""}${usd2(up)}</b></small></td></tr>` : ""}`; }).join("");
  };
  const stTable = `<div class="tw"><table class="rs"><thead><tr><th class="l">Phương pháp</th><th>Lệnh</th><th>Thắng</th><th>Ròng (USDT)</th><th>TB / lệnh (bps)</th></tr></thead><tbody>${sRow("🪝 Bắt râu sập", bh)}${sRow("⚡ Lướt giây", bsec)}${swRows()}</tbody></table></div>`;
  // ---------------------------------------------------------------- (C) dòng sự kiện trực tiếp, phân loại & lọc
  const EVC = [["all", "Mọi loại"], ["trade", "Lệnh"], ["skip", "Bộ lọc chặn"], ["fix", "Tự sửa & dừng"], ["lv", "Binance"], ["fund", "Funding"], ["err", "Lỗi"], ["sys", "Hệ thống"]];
  const evCat = (e) => (e.s === "lv" ? (/⚠️|lỗi/i.test(e.m) ? "err" : "lv") : /BỎ QUA/.test(e.m) ? "skip" : /💸|funding/i.test(e.m) ? "fund" : /⛔|🔁|nghỉ|Dừng|chạy lại|chạy tiếp|Sang ngày|mục tiêu/i.test(e.m) ? "fix" : /⚠️|lỗi/i.test(e.m) || e.k === "err" ? "err" : /Khớp|Đóng|chờ (mua|bán)|đặt lệnh|đã huỷ|💰|🔻|🪝|⚡|Long|Short/.test(e.m) ? "trade" : "sys");
  // nguồn của mỗi dòng nhật ký (thuộc phương pháp nào) – nhãn màu trên từng dòng + lọc theo nguồn
  const EVSRC = [["all", "Mọi nguồn"], ["hook", "Bắt râu sập"], ["sec", "Lướt giây"], ["sw", "Giữ nhiều ngày"], ["q", "Định lượng"], ["sys", "Hệ thống"]];
  const evSrc = (e) => { const m = String(e.m || "");
    if (/^🧪|Short (coin )?(vừa )?bơm|niêm yết|thử nghiệm/i.test(m)) return "sw";
    if (/^📐|^🔗|^📉|^💸 Funding cực|^📦|^〰️|^🌊|định lượng/i.test(m)) return "q";
    if (/🪝|râu|lệnh chờ|chờ (mua|bán)|giá không tới|^🔍|cú sốc|bắt/i.test(m)) return "hook";
    if (/⚡|lướt|Mở (Long|Short)|taker|maker|sổ lệnh|chốt ngày|mục tiêu/i.test(m)) return "sec";
    return "sys"; };
  const EVS = [...(X.log || []).map((l) => ({ t: l.t, m: l.m, k: l.k, n: l.n || 0, t0: l.t0, s: "bot" })), ...(LV?.log || []).map((l) => ({ t: l.t, m: l.m, k: l.k, n: l.n || 0, t0: l.t0, s: "lv" }))].map((e) => ({ ...e, c: evCat(e), src: evSrc(e) })).sort((a, b) => (a.t < b.t ? 1 : -1))
    .reduce((A, e) => {      // thông báo hệ thống lặp lại (chỉ khác con số) → gộp 1 dòng "×n" (bản máy chủ mới tự gộp; đây là cho số liệu cũ)
      const sig = String(e.m).replace(/[\d.,]+/g, "#"), g = e.src === "sys" ? A.slice(-4).find((x) => x.src === "sys" && x.s === e.s && x.sig === sig) : null;
      if (g) { g.n = (g.n || 1) + (e.n || 1); g.t0 = e.t0 || e.t; return A; }
      A.push({ ...e, sig }); return A; }, []);
  if (window.__scEvF === undefined && C.lv_on && (LV?.log || []).length) window.__scEvF = "lv";      // Nhật ký: mặc định lọc sự kiện Binance (tiền thật) trước
  const EVF = EVC.some(([k]) => k === window.__scEvF) ? window.__scEvF : "all", EVS_F = EVSRC.some(([k]) => k === window.__scEvS) ? window.__scEvS : "all";
  const SRCT = Object.fromEntries(EVSRC), ACC = LV?.env === "live" || C.lv_env === "live" ? "Binance thật" : "Binance Demo";
  const evIco = { trade: "🔔", skip: "🚫", fix: "🔁", lv: "💵", fund: "💸", err: "⚠️", sys: "⚙️" };
  // mỗi sự kiện thuộc ngày nào (giờ VN): dải ngày chen giữa danh sách + lọc theo ngày
  const evD = (t) => { try { return vnDayOf(String(t).slice(0, 19)); } catch (e) { return ""; } }, EVTD = vnToday(), EVYD = new Date(Date.parse(EVTD + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
  const dLab = (d) => (d === EVTD ? bi("Hôm nay", "Today") : d === EVYD ? bi("Hôm qua", "Yesterday") : new Date(d + "T00:00:00Z").toLocaleDateString(LOC, { weekday: "long", timeZone: "UTC" })) + ` · ${ddmm(d)}`;
  const EVDAYS = [...new Set(EVS.map((e) => evD(e.t)).filter(Boolean))].sort().reverse(), EVDF = EVDAYS.includes(window.__scEvD) ? window.__scEvD : "all";
  const feedLis = (L, chips) => { let last = ""; return L.map((e) => { const d = evD(e.t), hide = chips && ((EVF !== "all" && e.c !== EVF) || (EVS_F !== "all" && (e.src || evSrc(e)) !== EVS_F) || (EVDF !== "all" && d !== EVDF)), h = d && d !== last ? `<li class="sc-fday" data-d="${d}">${esc(dLab(d))}</li>` : ""; last = d || last;
    const src = e.src || evSrc(e), lv = e.s === "lv" || /TIỀN THẬT|Binance (thật|Demo)/.test(e.m || "");
    const tags = `<span class="sc-ftg s-${src}">${SRCT[src] || "Hệ thống"}</span>${src !== "sys" ? `<span class="sc-ftg a-${lv ? "lv" : "bot"}">${lv ? ACC : "Sàn thử"}</span>` : ""}${e.n > 1 ? `<span class="sc-ftg rep" title="Lặp lại ${e.n} lần${e.t0 ? ` từ ${hms(e.t0)}` : ""}">×${e.n}</span>` : ""}`;
    return `${h}<li data-c="${e.c}" data-src="${src}" data-d="${d}" class="${e.k || ""}" ${hide ? "hidden" : ""} title="${esc(viDec(e.m))}"><span class="sc-fi">${evIco[e.c]}</span><span class="sc-ft">${hms(e.t)}</span><span class="sc-fm"><span class="sc-ftgs">${tags}</span>${esc(viDec(e.m))}</span></li>`; }).join(""); };
  const feed = (L, chips) => `${chips ? `<div class="bseg sc-evf sc-evs" aria-label="Lọc theo nguồn">${EVSRC.map(([k, t]) => { const n = k === "all" ? L.length : L.filter((e) => e.src === k).length; return n || k === "all" ? `<button type="button" data-scevs="${k}" class="${k === EVS_F ? "on" : ""}">${t} <small class="faint" data-noi18n>${n}</small></button>` : ""; }).join("")}</div>` : ""}${chips ? `<div class="bseg sc-evf">${EVC.map(([k, t]) => { const n = k === "all" ? L.length : L.filter((e) => e.c === k).length; return n || k === "all" ? `<button type="button" data-scev="${k}" class="${k === EVF ? "on" : ""}">${t} <small class="faint" data-noi18n>${n}</small></button>` : ""; }).join("")}</div>` : ""}
    <div class="fd-sz" role="radiogroup" aria-label="Độ dài khung sự kiện">${[["s", bi("Gọn", "Short")], ["m", bi("Vừa", "Medium")], ["l", bi("Đầy đủ", "Full")]].map(([k, t]) => `<button type="button" role="radio" data-fdsz="${k}" aria-checked="${k === fdSz()}">${t}</button>`).join("")}</div>
    ${chips && EVDAYS.length > 1 ? `<div class="bseg sc-evd" aria-label="Lọc theo ngày"><button type="button" data-scevd="all" class="${EVDF === "all" ? "on" : ""}">${bi("Mọi ngày", "All days")}</button>${EVDAYS.map((d) => `<button type="button" data-scevd="${d}" class="${EVDF === d ? "on" : ""}">${esc(d === EVTD ? bi("Hôm nay", "Today") : d === EVYD ? bi("Hôm qua", "Yesterday") : ddmm(d))} <small class="faint" data-noi18n>${L.filter((e) => evD(e.t) === d).length}</small></button>`).join("")}</div>` : ""}
    <ul class="sc-feed" data-f="${chips ? EVF : "all"}">${feedLis(L, chips) || `<li class="faint">Chưa có sự kiện.</li>`}</ul>`;
  // ---------------------------------------------------------------- (D) Bắt râu sập: lệnh đã đóng + biểu đồ cú sốc, kiểm chứng bộ lọc bằng lệnh ảo
  const HT = AT.filter((t) => t.strat === "hook").slice().reverse();
  const hkTrades = HT.length ? `<div class="sc-hl lvt">${HT.map((t, i) => `<div class="sc-ht"><div class="lvt-r"><span class="lvt-a"><small class="faint">${hms(t.t1)}</small> 🪝 <b>${esc(String(t.k).split(":")[0])}</b> <span class="${t.side > 0 ? "up" : "down"}">${t.side > 0 ? "Long" : "Short"}</span></span><span class="lvt-v"><b class="${cls(t.usd)}">${nz(t.usd, 2) > 0 ? "+" : ""}${usd2(t.usd)}</b><em class="${cls(t.net)}">${bps(t.net, 0)} bps</em></span>
      <small class="lvt-b faint">${bi("sốc", "shock")} ${nf((t.shock || 0) / 100, 1)}% · ${t.lv || 1} ${bi("mức khớp", t.lv > 1 ? "levels" : "level")} · ${{ TIME: bi("hết giờ", "time exit"), SL: bi("cắt lỗ", "stop"), TRAIL: bi("cắt lỗ đuổi", "trailing stop") }[t.why] || esc(t.why)}${isNum(t.e) && isNum(t.x) ? ` · ${px(t.e)} → ${px(t.x)}` : ""}${isNum(t.hold) ? ` · ${bi("giữ", "held")} ${durVi(t.hold)}` : ""}</small><button type="button" class="lvt-c" data-hkc="${i}" aria-label="Xem biểu đồ cú sốc">📈</button></div><div class="sc-hc" id="hkc${i}" hidden></div></div>`).join("")}</div>` : empty("Chưa có lệnh Bắt râu sập nào đã đóng.");
  const HV = X.hkv || {}, HVS = HV.S || {}, realB = bh?.n ? bh.bps / bh.n : null;
  const FNM = { vol: bi(`Khối lượng < ${nf(C.hk_v, 0)}× bình thường`, `Volume < ${nf(C.hk_v, 0)}× normal`), r15: bi(`"Xả sau bơm" – Short (15 phút > ${nf(C.hk_r15 / 100, 1)}%)`, `"Dump after pump" – Short (15 min > ${nf(C.hk_r15 / 100, 1)}%)`), f6: bi(`Đã có cú sốc khác trong ${nf(C.hk_f6, 0)} giờ`, `Another shock within ${nf(C.hk_f6, 0)} h`), knife: bi(`"Dao rơi" (4 giờ > ${nf(C.hk_knife, 0)}%)`, `"Falling knife" (4 h > ${nf(C.hk_knife, 0)}%)`), fund: bi(`Phải trả funding ≥ ${nf(C.hk_fund / 100, 2)}%`, `Would pay funding ≥ ${nf(C.hk_fund / 100, 2)}%`) };
  // KẾT LUẬN có kiểm định: chỉ nói "đúng" / "xem lại" khi chênh lệch vượt 2 lần sai số chuẩn; không thì "chưa rõ – cần thêm mẫu".
  // Độ lệch chuẩn lấy từ tổng bình phương máy chủ ghi (q); số cũ chưa có thì ước bằng độ lệch của các lệnh Bắt râu sập gần nhất.
  const sdQ = (q) => (q?.n > 2 ? Math.sqrt(Math.max(0, (q.sq - (q.s * q.s) / q.n) / (q.n - 1))) : null);
  const HTn = HT.map((t) => t.net).filter(isNum), sdHT = HTn.length > 4 ? Math.sqrt(HTn.reduce((a, v) => a + (v - HTn.reduce((p, q) => p + q, 0) / HTn.length) ** 2, 0) / (HTn.length - 1)) : null;
  const sdR = sdQ(bh?.q) ?? sdHT ?? 1000;
  const vStat = (s) => { if (!s || (s.f || 0) < 5) return null; const m = s.sum / s.f, sdB = sdQ(s.q?.n >= 5 ? s.q : null) ?? sdR, seB = sdB / Math.sqrt(s.f), se = realB != null && bh?.n ? Math.sqrt(seB * seB + (sdR * sdR) / bh.n) : null; return { m, seB, se, d: realB != null ? m - realB : null }; };
  const verdict = (s) => { if (!s || (s.f || 0) < 5) return `<span class="pill" title="${esc(bi("Cần ít nhất 5 lệnh ảo khớp mới đánh giá", "Needs at least 5 virtual fills"))}">${bi(`thiếu mẫu ${s?.f || 0}/5`, `need data ${s?.f || 0}/5`)}</span>`;
    const V = vStat(s), tip = (t) => ` title="${esc(t)}"`;
    if (V.m + 2 * V.seB < 0) return `<span class="pill buy"${tip(bi(`Lệnh bị chặn TB ${nf(V.m, 0)} ± ${nf(2 * V.seB, 0)} bps – lỗ rõ ràng`, ""))}>${bi("✅ đúng · tránh lỗ", "✅ right · avoided losses")}</span>`;
    if (V.se != null && -V.d > 2 * V.se) return `<span class="pill buy"${tip(bi(`Kém lệnh thật ${nf(-V.d, 0)} bps, sai số ±${nf(2 * V.se, 0)} bps`, ""))}>${bi("✅ đúng · kém lệnh thật", "✅ right · worse than live")}</span>`;
    if (V.se != null && V.d > 2 * V.se) return `<span class="pill warn"${tip(bi(`Hơn lệnh thật ${nf(V.d, 0)} bps, vượt sai số ±${nf(2 * V.se, 0)} bps`, ""))}>${bi("⚠️ xem lại · bị chặn tốt hơn", "⚠️ review · blocked did better")}</span>`;
    const need = V.se != null && V.d ? Math.ceil(s.f * ((2 * V.se) / Math.max(30, Math.abs(V.d))) ** 2) : null;
    return `<span class="pill"${tip(bi(`Chênh với lệnh thật ${V.d != null ? (V.d >= 0 ? "+" : "") + nf(V.d, 0) : "—"} bps, sai số ±${V.se != null ? nf(2 * V.se, 0) : "—"} bps – chưa phân biệt được với may rủi`, ""))}>${bi("chưa rõ", "unclear")}${need && need > s.f && need < 5000 ? ` <small>· cần ~${nf(need, 0)}</small>` : ""}</span>`; };
  const FSUB = { vol: [["vol_hi", bi(`↳ khối lượng 5× – ${nf(C.hk_v, 0)}×`, `↳ volume 5× – ${nf(C.hk_v, 0)}×`)], ["vol_lo", bi("↳ khối lượng < 5×", "↳ volume < 5×")]] };
  const fRow = (k, t, sub) => { const s = HVS[k], V = vStat(s);
    if (sub && !s) return `<tr class="sc-fsub"><td class="l">${t}</td><td colspan="5" class="faint sc-fwait">${bi("chưa có số – đếm từ khi VPS chạy bản mới", "no data yet – counts once the VPS runs the new version")}</td></tr>`;
    return `<tr class="${sub ? "sc-fsub" : ""}"><td class="l">${t}</td><td>${nf(s?.n || 0, 0)}</td><td>${nf(s?.f || 0, 0)}</td><td class="${s?.f ? cls(s.sum) : ""}">${s?.f ? `<b>${bps(s.sum / s.f, 0)}</b>` : "—"}${V ? `<small class="faint sc-pm">±${nf(2 * V.seB, 0)}</small>` : ""}</td><td>${s?.f ? nf(s.win / s.f * 100, 0) + "%" : "—"}</td><td class="sc-fv">${verdict(s)}</td></tr>`; };
  const fRows = Object.entries(FNM).map(([k, t]) => fRow(k, t) + (FSUB[k] || []).map(([k2, t2]) => fRow(k2, t2, true)).join("")).join("");
  const fRecent = (HV.L || []).slice().reverse().slice(0, 12).map((v) => `<li><small class="faint">${hms(v.at)}</small> ${scK(v.k)} <span class="${v.side > 0 ? "up" : "down"}">${v.side > 0 ? "L" : "S"}</span> <small>${bi("sốc", "shock")} ${nf(v.R / 100, 1)}% · ${esc(FNM[v.why] || v.why)}</small> → ${v.nf ? `<b class="${cls(v.net)}">${bps(v.net, 0)} bps</b> ${bi("nếu đã vào", "if taken")}` : `<span class="faint">${bi("giá không tới mức chờ", "price never reached the levels")}</span>`}</li>`).join("");
  const filterPanel = panel("🧪 Bộ lọc có đúng không? – đi theo ảo các cú sốc bị chặn", `<div class="tw"><table class="rs sc-flt keep"><thead><tr><th class="l">Bộ lọc</th><th title="${esc(bi("Số cú sốc bộ lọc này đã chặn", "Shocks this filter blocked"))}">Bị chặn</th><th title="${esc(bi("Số lệnh ảo đã khớp giá thật", "Virtual orders that filled on real prices"))}">Ảo khớp</th><th title="${esc(bi("Lời/lỗ trung bình nếu đã vào, sau phí; ± = 2 sai số chuẩn", "Average P&L if taken, after fees; ± = 2 standard errors"))}">TB lẽ ra (bps)</th><th>Thắng</th><th class="l">Kết luận</th></tr></thead><tbody>${fRows}</tbody>
      <tfoot><tr><td class="l"><b>${bi("Lệnh thật đã vào (để so)", "Live trades taken (baseline)")}</b></td><td>—</td><td>${nf(bh?.n || 0, 0)}</td><td class="${cls(realB)}"><b>${realB != null ? bps(realB, 0) : "—"}</b>${realB != null && bh?.n ? `<small class="faint sc-pm">±${nf((2 * sdR) / Math.sqrt(bh.n), 0)}</small>` : ""}</td><td>${bh?.n ? nf(bh.win / bh.n * 100, 0) + "%" : "—"}</td><td></td></tr></tfoot></table></div>
    ${fRecent ? `<p class="sbh">Gần đây</p><ul class="bot-rl sc-fr">${fRecent}</ul>` : ""}
    ${info(bi(`<p>Mỗi cú sốc bị bộ lọc chặn, bot vẫn "đặt" 2 lệnh chờ <b>ảo</b> y hệt lệnh thật (không tốn tiền): khớp theo giá Binance thật (phải xuyên qua giá chờ 0,05%), giữ ${nf(C.hk_h, 0)} phút rồi thoát theo giá mua/bán thật, trừ phí maker + taker như lệnh thật. Bộ lọc <b>đúng</b> khi các lệnh nó chặn trung bình lỗ, hoặc kém hẳn lệnh thật bot đã vào. Cần ít nhất 5 lệnh ảo khớp; chỉ kết luận "đúng" / "xem lại" khi chênh lệch với lệnh thật vượt 2 lần sai số chuẩn (số ± dưới mỗi ô) – lời/lỗ từng lệnh dao động khoảng ±1.000 bps nên mẫu nhỏ rất dễ đánh lừa. Bộ lọc khối lượng chia thêm 2 nhóm (5× tới ngưỡng, dưới 5×) để biết nên hạ ngưỡng tới đâu. Số liệu đếm từ lúc máy chủ cập nhật bản này.</p>`, `<p>For every shock a filter blocks, the bot still "places" the same 2 limit orders <b>virtually</b> (no money involved): they fill on real Binance prices (price must trade 0.05% through the level), are held ${nf(C.hk_h, 0)} minutes and exit at the real bid/ask, minus the same maker + taker fees as live trades. A filter is <b>right</b> when the trades it blocks lose on average, or do clearly worse than the trades the bot actually took. At least 5 virtual fills are needed before a verdict; more is better. Counting started when the server got this version.</p>`), bi("ⓘ Giải thích", "ⓘ Explain"))}`, HV.open ? bi(`${HV.open} cú sốc đang theo dõi ảo`, `${HV.open} shocks tracked virtually`) : bi("kiểm chứng trực tiếp", "live check"));
  // ---------------------------------------------------------------- 💵 BINANCE (Demo / thật) – theo dõi y như sàn thử: tài sản, giá trực tiếp, lệnh mở/chờ, lệnh đã đóng, so với sàn thử
  const LVE = LV?.env || C.lv_env || "demo", LVN = LVE === "live" ? bi("Binance thật", "Binance live") : "Binance Demo", u$ = (v) => (v < 0 ? "−$" : "$") + nf(Math.abs(v), 2), sg$ = (v) => (nz(v, 2) > 0 ? "+" : "") + usd2(v);
  const LH = (LV?.hist || []).filter((h) => (h.env || LVE) === LVE), LHs = LH.slice().sort((a, b) => (a.t2 < b.t2 ? -1 : 1)), EQL = LV?.eqH?.[LVE] || [], WL = WAL[LVE];
  const lvEq = WL?.fut?.margin ?? lvSt.bal, tdLV = vnToday(), nTd = LH.filter((h) => vnDayOf(h.t2) === tdLV).length;
  // 7 ngày = 7 NGÀY LỊCH gần nhất (giờ VN, tính cả hôm nay), mỗi ngày = tổng lời/lỗ lệnh đã đóng trong ngày đó.
  // Lấy từ danh sách lệnh (đủ & khớp bảng); ngày cũ hơn lệnh xa nhất còn trong danh sách thì dùng số máy chủ lưu theo ngày.
  const LDD = {}, dSrv = window.__scDays?.data?.[LVE]?.days || {}, hMin = LH.length ? LH.map((h) => vnDayOf(h.t2)).sort()[0] : "9999";
  for (const h of LH) { const d = vnDayOf(h.t2); LDD[d] = { usd: (LDD[d]?.usd || 0) + (h.pnl || 0) }; }
  for (const [d, v] of Object.entries(dSrv)) if (d < hMin && !(d in LDD) && isNum(v?.usd) && (v.n || v.usd)) LDD[d] = { usd: v.usd };
  const lvD7 = new Date(Date.parse(vnToday() + "T00:00:00Z") - 6 * 864e5).toISOString().slice(0, 10);
  const lk7 = Object.keys(LDD).filter((k) => k >= lvD7).sort(), l7 = lk7.map((k) => LDD[k].usd || 0), ls7 = l7.reduce((a, v) => a + v, 0), LT = LV?.totE?.[LVE] || LH.reduce((T, h) => { T.n++; T.pnl += h.pnl || 0; T.fees += h.fee || 0; if (h.pnl > 0) T.win++; return T; }, { n: 0, pnl: 0, win: 0, fees: 0 });      // chỉ tài khoản đang xem (thật / Demo)
  // lời/lỗ theo % TỔNG TÀI SẢN Binance (mọi ví) lúc đầu kỳ = tổng hiện tại − lời/lỗ của kỳ
  const TOTL = WL?.total, pTot = (v) => (isNum(v) && TOTL > 0 && TOTL - v > 0 ? v / (TOTL - v) * 100 : null);
  window.__MXT = { real: TOTL, paper: X.eq };
  const pTag = (v) => { const q = pTot(v); return q == null ? "" : ` <em class="sc-ptot ${cls(q)}">${nz(q, 2) > 0 ? "+" : ""}${nf(q, 2)}%</em>`; };
  // 🛡️ giới hạn an toàn chung (cứng trên máy chủ riêng, cộng mọi phương pháp) – thanh đầy = bot không mở thêm lệnh
  const RK = LV?.risk, lvRisk = !RK?.B ? "" : (() => { const L = RK.lim || {}, bar = (lab, v, lim, tip) => { const pc = lim > 0 ? Math.min(100, v / lim * 100) : 0; return `<div class="rk-b ${pc >= 100 ? "full" : pc >= 75 ? "hi" : ""}" title="${esc(tip)}"><span>${lab}</span><i><b style="width:${pc.toFixed(1)}%"></b></i><small>${usd2(v)} / ${usd2(lim)}</small></div>`; };
    const dd = RK.peak > 0 ? (1 - RK.B / RK.peak) * 100 : 0;
    return `<div class="rk"><div class="rk-h">🛡️ ${bi("Giới hạn an toàn chung", "Account-wide safety limits")} <small class="faint">${bi("cứng trong máy chủ – thiết lập đặt nhầm cũng không vượt được; đầy = không mở lệnh mới", "hard-coded on your server – wrong settings can't exceed them")}</small></div>
      ${bar(bi("Ký quỹ", "Margin"), RK.M, RK.B * L.margin, `tối đa ${L.margin * 100}% số dư`)}${bar(bi("Giá trị lệnh", "Notional"), RK.N, RK.B * L.notional, `tối đa ${L.notional}× số dư`)}${bar(bi("Mất tối đa", "Worst case"), RK.W, RK.B * L.worst, `nếu mọi lệnh cùng chạm cắt lỗ / bị thanh lý – tối đa ${L.worst * 100}% số dư`)}
      <div class="rk-b ${dd >= L.dd * 100 ? "full" : dd >= L.dd * 75 ? "hi" : ""}" title="${bi(`số dư thấp hơn mức cao nhất ${L.dd * 100}% thì ngừng mở lệnh mới`, "")}"><span>${bi("Sụt từ đỉnh", "Drawdown")}</span><i><b style="width:${Math.min(100, dd / (L.dd * 100) * 100).toFixed(1)}%"></b></i><small>${nf(Math.max(0, dd), 1)}% / ${L.dd * 100}%</small></div></div>`; })();
  const lvCards = `<dl class="stats sc-kp">${[
    [bi("Tài sản futures", "Futures equity"), isNum(lvEq) ? u$(lvEq) : "—", `${bi("ví", "wallet")} ${isNum(WL?.fut?.wallet ?? lvSt.bal) ? usd2(WL?.fut?.wallet ?? lvSt.bal) : "—"} · ${bi("khả dụng", "available")} ${isNum(lvSt.avail) ? usd2(lvSt.avail) : "—"}`, WL?.fut ? sgn(WL.fut.upnl) : 0, "", spark(EQL.map((q) => q[1]), { w: 150, h: 30 })],
    [bi("Hôm nay", "Today"), LV?.day ? sg$(LVD0) + pTag(LVD0) : "—", `${nTd} ${bi("lệnh", "trades")} · ${bi("dừng ở −", "stop at −")}${usd2(LV?.size?.dayLim ?? C.lv_cap * C.lv_daily / 100)}`, sgn(LVD0)],
    [bi("7 ngày", "7 days"), l7.length ? sg$(ls7) + pTag(ls7) : "—", l7.length ? bi(`${l7.filter((v) => v > 0).length}/${l7.length} ngày lời`, `${l7.filter((v) => v > 0).length}/${l7.length} winning days`) : bi("chưa có số liệu", "no data yet"), sgn(ls7), "", spark(cum(l7), { w: 150, h: 30 })],
    [bi("Tỉ lệ thắng", "Win rate"), LT.n ? nf(LT.win / LT.n * 100, 0) + "%" : "—", LT.n ? bi(`${LT.n} lệnh · ròng ${sg$(LT.pnl)} · phí ${usd2(LT.fees)}`, `${LT.n} trades · net ${sg$(LT.pnl)} · fees ${usd2(LT.fees)}`) : bi("chưa có lệnh", "no trades yet"), sgn(LT.pnl), "", spark(cum(LHs.map((h) => h.pnl)), { w: 150, h: 30 })],
    // Tổng tài sản các ví chỉ ở trang Tài khoản Binance (trang tiền) – thẻ ở đây là hiệu quả của bot
  ].filter(Boolean).map((x) => stc(x)).join("")}</dl>`;
  const lvk = (e) => e.k || e.sym.replace(/USDT$/, "") + ":F";
  const lvOpen = (LV?.ev || []).map(lvCard).join("");
  // 🧪 Short coin vừa bơm bằng tiền thật – lệnh đang giữ (7 ngày, x1, không cắt lỗ)
  const swOpenL = (LV?.swp?.open || []).map((p) => { const t0 = Date.parse(p.t0 + "Z"), ex = Date.parse(p.exp + "Z"), pc = p.N ? p.upnl / p.N * 100 : 0;
    return withMx(`<div class="sc-oc lv S"><div class="r1"><span>🧪 <b>${scK(String(p.sym).replace(/USDT$/, "") + ":F")}</b> <span class="down">Short</span></span><b class="lpx">${px(p.m)}</b></div>
      <div class="r1s">${lvAcc()} ${bi("Short coin vừa bơm · x1 · không cắt lỗ", "Short pumped coin · x1 · no stop")}</div>
      <div class="r2"><b class="${cls(p.upnl)}">${nz(p.upnl, 2) > 0 ? "+" : ""}${usd2(p.upnl)}</b> <small class="${cls(pc)}">${nz(pc, 1) > 0 ? "+" : ""}${nf(pc, 1)}%</small> <small class="faint">${bi("tạm tính", "unrealized")}</small></div>
      <div class="r3"><small>${bi("vào", "entry")} <b>${px(p.ap)}</b> · ${bi("giá", "mark")} ${px(p.m)} · ${qty(p.q)} · ${usd2(p.N)} · ${bi("mất trắng khi giá", "wiped out at")} ≥ ${px(p.ap * 2)}</small></div>
      <div class="r4" data-lt0="${t0}" data-lh="${(ex - t0) / 1000}"><span class="sc-cd"><i></i></span><small></small><small class="faint">${bi("tự đóng sau", "auto-closes in")} 7 ${bi("ngày", "days")} · ${esc(p.why || "")}</small></div></div>`, "swp:" + p.id, `Short ${String(p.sym).replace(/USDT$/, "")} (coin vừa bơm) trên ${LVN}`, LVE === "live", { pk: String(p.sym).replace(/USDT$/, "") + ":F", e: p.ap, q: p.q, sd: -1, f0: p.fees ?? p.N * C.fee_t / 100, fr: C.fee_t, fund: p.fund ?? null, m: p.m, sl: 0.1, long: 1 });
  }).join("");
  // 🧪 lệnh của các phương pháp thử nghiệm đang mở (sàn thử: Short coin vừa bơm / mới niêm yết, 6 kiểu định lượng; Binance: định lượng) – trước đây chỉ có trong bảng Phương pháp
  const XNM = { ou: "Cặp coin O-U", rsi2: "RSI(2) Connors", fund: "Funding âm → Long", orb: "ORB + NR7", vwap: "VWAP ± σ", liq: "Thác thanh lý", pump: "Short coin vừa bơm", list: "Short coin mới niêm yết" };
  const xLeft = (t) => { const s = (Date.parse(String(t) + "Z") - Date.now()) / 1000; return !isNum(s) ? "" : s <= 0 ? bi("sắp đóng", "closing") : s > 86400 ? `${Math.floor(s / 86400)} ${bi("ngày", "d")} ${Math.floor((s % 86400) / 3600)} ${bi("giờ", "h")}` : `${Math.floor(s / 3600)} ${bi("giờ", "h")} ${Math.floor((s % 3600) / 60)} ${bi("phút", "m")}`; };
  const xCard = (o, acc, real, key, est) => { const L = o.legs, one = L.length === 1, pc = isNum(o.pct) ? o.pct : o.N ? o.upnl / o.N * 100 : null, sd = one ? L[0].side : 0;
    return withMx(`<div class="sc-oc ${real ? "lv " : ""}${sd > 0 ? "L" : sd < 0 ? "S" : ""}" data-omk="lab"><div class="r1"><span>🧪 ${L.map((x) => `<b>${scK(String(x.sym).replace(/USDT$/, "") + ":F")}</b> <span class="${x.side > 0 ? "up" : "down"}">${x.side > 0 ? "Long" : "Short"}</span>`).join(" · ")} ${grpTag(L[0].sym)}</span>${one && isNum(L[0].m) ? `<b class="lpx">${px(L[0].m)}</b>` : ""}</div>
      <div class="r1s">${accT(acc)} ${esc(XNM[o.k] || o.name || o.k)}${o.why ? ` · ${esc(o.why)}` : ""}</div>
      <div class="r2"><b class="${cls(o.upnl)}">${nz(o.upnl, 2) > 0 ? "+" : ""}${usd2(o.upnl || 0)}</b>${isNum(pc) ? ` <small class="${cls(pc)}">${nz(pc, 1) > 0 ? "+" : ""}${nf(pc, 1)}%</small>` : ""} <small class="faint">${bi("tạm tính", "unrealized")}</small></div>
      <div class="r3"><small>${L.map((x) => `${bi("vào", "entry")} <b>${px(x.e ?? x.ap)}</b>${isNum(x.m) && !one ? ` → ${px(x.m)}` : ""}`).join(" · ")}${o.N ? ` · ${bi("giá trị", "size")} ${usd2(o.N)}` : ""}</small>${okPx(o.sl) ? `<small class="down">${bi("cắt lỗ", "stop")} ${px(o.sl)}</small>` : o.k === "pump" || o.k === "list" ? `<small class="faint">${bi("x1 · không cắt lỗ", "x1 · no stop")}</small>` : ""}${okPx(o.tp) ? `<small class="up">${bi("chốt", "target")} ${px(o.tp)}</small>` : ""}</div>
      <div class="r4"><small class="faint">${bi("vào", "opened")} ${dt(o.t0 + "Z")}${o.exp ? ` · ${bi("tự đóng sau", "auto-closes in")} ${xLeft(o.exp)}` : ""}</small></div></div>`, key, `${XNM[o.k] || o.k} ${L.map((x) => String(x.sym).replace(/USDT$/, "")).join("/")} (${real ? (LV?.env === "live" ? "TIỀN THẬT" : "Demo") : "sàn thử"})`, real, est); };
  const xOpenP = [...(SWX ? ["pump", "list"].flatMap((k) => (SWX[k]?.pos || []).map((p) => xCard({ ...p, k, legs: [{ sym: p.sym, side: -1, e: p.e, m: p.m }], exp: p.t1 }, "paper", false, `sw:${k}:${p.id}`, { e: p.e, q: p.q, sd: -1, f0: p.fee || 0, fr: 0.15, fund: p.fund || 0, m: p.m, sl: 0, paper: 1, long: 1 }))) : []),
    ...(QX ? QK.flatMap((k) => (QX[k]?.pos || []).map((p) => xCard({ ...p, k }, "paper", false, `q:${k}:${p.id}`, null))) : [])].join("");
  const XWHY = { TIME: bi("hết giờ", "time"), SL: bi("cắt lỗ", "stop"), TP: bi("chốt lời", "target"), X: bi("tín hiệu thoát", "exit signal"), MANUAL: bi("anh đóng tay", "manual"), OFF: bi("tắt phương pháp", "method off"), EOD: bi("hết ngày", "end of day"), EOM: bi("hết tháng", "end of month"), NOPX: bi("mất giá", "no price"), LIQ: bi("giá ×2 – mất trắng", "wiped out"), DELIST: bi("ngừng giao dịch", "delisted") };
  const xHist = [...(QX ? QK.flatMap((k) => (QX[k]?.hist || []).map((h) => ({ ...h, k }))) : []), ...(SWX ? ["pump", "list"].flatMap((k) => (SWX[k]?.hist || []).map((h) => ({ ...h, k, legs: [{ sym: h.sym, side: -1, e: h.e, x: h.x }] }))) : [])].sort((a, b) => (a.t2 < b.t2 ? 1 : -1)).slice(0, 40);
  const xTrades = xHist.length ? `<div class="sc-hl lvt">${xHist.map((h) => { const L = h.legs || [], hold = (Date.parse(h.t2 + "Z") - Date.parse(h.t0 + "Z")) / 1000;
    return `<div class="sc-ht"><div class="lvt-r"><span class="lvt-a"><small class="faint">${jTm(h.t2)}</small> 🧪 ${L.map((x) => `<b>${esc(String(x.sym).replace(/USDT$/, ""))}</b> <span class="${x.side > 0 ? "up" : "down"}">${x.side > 0 ? "Long" : "Short"}</span>`).join(" · ")} ${L[0] ? grpTag(L[0].sym) : ""}</span><span class="lvt-v"><b class="${cls(h.net)}">${sg$(h.net || 0)}</b>${isNum(h.pct) ? `<em class="${cls(h.pct)}">${h.pct >= 0 ? "+" : ""}${nf(h.pct, 1)}%</em>` : ""}</span><span></span>
      <small class="lvt-b faint">${esc(XNM[h.k] || h.k)} · ${L.map((x) => `${px(x.e)} → ${px(x.x)}`).join(" · ")}${h.N ? ` · ${bi("giá trị", "size")} ${usd2(h.N)}` : ""} · ${XWHY[h.why] || esc(h.why || "")}${isNum(hold) && hold > 0 ? ` · ${bi("giữ", "held")} ${jHold(hold)}` : ""}</small></div></div>`; }).join("")}</div>` : empty(bi("Chưa có lệnh thử nghiệm nào đã đóng trên sàn thử.", "No closed experimental trades yet."));
  const xOpenL = (LV?.qp?.open || []).map((p) => xCard(p, LV?.env === "live" ? "live" : "demo", true, `lq:${p.id}`, null)).join("");
  const LVEV = (LV?.log || []).map((l) => ({ t: l.t, m: l.m, k: l.k, s: "lv" })).map((e) => ({ ...e, c: /🔍/.test(e.m) ? "skip" : evCat(e) })).sort((a, b) => (a.t < b.t ? 1 : -1));
  // ---- 📈 tài sản futures: chọn khoảng (24 giờ / 7 ngày / 30 ngày / từ đầu) & cách xem (Tài sản · Lời/lỗ thật = bỏ tiền nạp/rút)
  const EQ5 = EQL, EQHR = LV?.eqHr?.[LVE] || [], EQDY = LV?.eqDay?.[LVE] || [], FLW = (LV?.flow?.[LVE] || []).slice().sort((a, b) => a[0] - b[0]);
  const LVR = [["1d", bi("24 giờ", "24h"), 1440], ["7d", bi("7 ngày", "7D"), 10080], ["30d", bi("30 ngày", "30D"), 43200], ["all", bi("Từ đầu", "All"), Infinity]];
  const lvSeries = (rk) => {      // ghép: ngày (cũ) → giờ → 5 phút (mới nhất), mỗi phần chỉ dùng trước điểm đầu của phần chi tiết hơn
    const span = (LVR.find((r) => r[0] === rk) || LVR[1])[2], f0 = EQ5[0]?.[0] ?? Infinity, h0 = EQHR[0]?.[0] ?? f0;
    let A = [...EQDY.filter((q) => q[0] < Math.min(h0, f0)), ...EQHR.filter((q) => q[0] < f0), ...EQ5];
    const now = A.length ? A[A.length - 1][0] : 0; A = A.filter((q) => q[0] >= now - span);
    if (span >= 43200 && A.length > 800) { const k = Math.ceil(A.length / 800); A = A.filter((_, i) => i % k === 0 || i === A.length - 1); }
    return A;
  };
  const lvEqHtml = () => {
    const rk = LVR.some((r) => r[0] === window.__lvRng) ? window.__lvRng : lsGet("lvrng", "7d"), md = window.__lvMd || lsGet("lvmd", "eq"), A = lvSeries(rk);
    const seg = `<div class="lv-ctl"><div class="bseg" role="tablist">${LVR.map(([k, t]) => `<button type="button" data-lvr="${k}" class="${k === rk ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="bseg">${[["eq", bi("Tài sản", "Equity")], ["pl", bi("Lời/lỗ thật", "Real P/L")]].map(([k, t]) => `<button type="button" data-lvm="${k}" class="${k === md ? "on" : ""}">${t}</button>`).join("")}</div></div>`;
    if (A.length < 3) return seg + empty(bi("Đường tài sản hiện sau khi máy chủ riêng cập nhật bản mới (5 phút 1 điểm).", "The equity line appears once your server runs the new version."));
    // nạp/rút trong từng đoạn → lời/lỗ thật (tài sản − tiền nạp ròng) và % lời/lỗ theo thời gian (TWR: nối % từng đoạn, tiền nạp/rút không tính là lời)
    let fi = 0; while (fi < FLW.length && FLW[fi][0] <= A[0][0]) fi++;
    let net = 0, tw = 1; const PL = [0], NETS = [0], FLAT = A.map(() => null), FLC = A.map(() => null);
    for (let i = 1; i < A.length; i++) {
      let f = 0; while (fi < FLW.length && FLW[fi][0] <= A[i][0]) f += FLW[fi++][1];
      if (f) { FLAT[i] = A[i][1]; FLC[i] = f > 0 ? "#3B82F6" : "#F59E0B"; }
      net += f; NETS.push(net); PL.push(A[i][1] - A[0][1] - net);
      if (A[i - 1][1] > 0) tw *= (A[i][1] - f) / A[i - 1][1];
    }
    const E0 = A[0][1], E1 = A[A.length - 1][1], pl = E1 - E0 - net, twr = (tw - 1) * 100;
    const fmtX = (m) => new Date(m * 60000).toLocaleString(LOC, rk === "1d" ? { hour: "2-digit", minute: "2-digit" } : rk === "7d" ? { day: "2-digit", month: "2-digit", hour: "2-digit" } : { day: "2-digit", month: "2-digit" });
    const mk = A.map(() => null), mc = A.map(() => null);
    LH.forEach((h) => { const m = Math.floor(Date.parse(h.t2 + "Z") / 60000); if (m < A[0][0]) return; let i = -1; for (let j = 0; j < A.length; j++) if (A[j][0] <= m) i = j; if (i >= 0) { mk[i] = md === "pl" ? PL[i] : A[i][1]; mc[i] = h.pnl >= 0 ? css("--up") : css("--down"); } });
    const main = md === "pl" ? { name: bi("Lời/lỗ thật (USDT, bỏ nạp/rút)", "Real P/L (USDT, excl. transfers)"), color: css("--brass") || css("--brand"), width: 2, pts: A.map(([m], i) => ({ x: fmtX(m), y: +PL[i].toFixed(3) })) }
      : { name: bi("Tài sản futures (USDT)", "Futures equity (USDT)"), color: css("--brand"), width: 2, pts: A.map(([m, v]) => ({ x: fmtX(m), y: v })) };
    const S = [main, { name: bi("Đóng lệnh", "Trade close"), dots: true, color: css("--ink-2"), pts: mk.map((y, i) => ({ x: "", y, c: mc[i] })) }];
    if (FLAT.some((v) => v != null)) S.push({ name: bi("Nạp (xanh) / rút (cam)", "Deposit (blue) / withdraw (orange)"), dots: true, color: "#3B82F6", pts: FLAT.map((y, i) => ({ x: "", y: y == null ? null : md === "pl" ? PL[i] : y, c: FLC[i] })) });
    const sum = `<p class="lv-sum"><span>${bi("Lời/lỗ thật", "Real P/L")} <b class="${cls(pl)}">${sg$(pl)}</b> <b class="${cls(twr)}">${twr >= 0 ? "+" : ""}${nf(twr, 2)}%</b></span><span>${bi("Nạp/rút ròng", "Net transfers")} <b>${net ? sg$(net) : "$0"}</b></span><span class="faint">${u$(E0)} → ${u$(E1)}</span></p>`;
    return seg + sum + lineSvg(S, { h: 200, dec: 2, zero: md === "pl" });
  };
  const lvEqChart = `<div id="lvEqBox">${lvEqHtml()}</div>`;
  window.__lvEqRedraw = () => { const b = $("#lvEqBox"); if (b) { b.innerHTML = lvEqHtml(); lvEqBind(); } };
  let lc = 0; const lvCum = LHs.length > 1 ? lineSvg([{ name: bi("🪝 Lời/lỗ cộng dồn (USDT)", "🪝 Cumulative P/L (USDT)"), color: css("--brass") || css("--brand"), width: 2, pts: LHs.map((h) => ({ x: hms(h.t2), y: +(lc += h.pnl).toFixed(3) })) }], { h: 160, dec: 2, zero: true }) : empty(bi("Chưa đủ lệnh đã đóng để vẽ.", "Not enough closed trades to chart."));
  // so với sàn thử: cùng cú sốc (cùng coin, cách nhau ≤ 20 phút)
  const PH = AT.filter((t) => t.strat === "hook"), tms = (x) => Date.parse((x || "") + "Z");
  const pFind = (k, tm) => PH.find((t) => t.k === k && Math.abs(tms(t.ts || t.t0) - tm) < 20 * 60e3);
  const CMP = [...LH.filter((h) => h.strat !== "pump").map((h) => ({ tm: tms(h.ts || h.t1), k: lvk(h), side: h.side, R: h.R, d: { ok: true, usd: h.pnl, bps: h.net, nl: h.nl } })), ...(LV?.miss || []).filter((m) => (m.env || LVE) === LVE).map((m) => ({ tm: tms(m.t0), k: m.k, side: m.side, R: m.R, d: { ok: false, m } }))];
  const t1st = CMP.length ? Math.min(...CMP.map((r) => r.tm)) : null;
  PH.filter((t) => t1st && tms(t.ts || t.t0) >= t1st && !CMP.some((r) => r.k === t.k && Math.abs(r.tm - tms(t.ts || t.t0)) < 20 * 60e3)).forEach((t) => CMP.push({ tm: tms(t.ts || t.t0), k: t.k, side: t.side, R: t.shock, d: null }));
  CMP.sort((a, b) => b.tm - a.tm);
  // mỗi cú sốc = 1 hàng gọn: dòng 1 lúc · coin · chiều · độ sốc · ghi chú; dòng 2 hai ô cạnh nhau Sàn thử | Binance (viền màu = khớp lời / lỗ, viền đứt = không khớp)
  const cmpCell = (lab, ok, usd, b, miss) => `<span class="cmp-c ${ok ? (usd >= 0 ? "w" : "l") : "n"}"><i>${lab}</i>${ok ? `<b class="${cls(usd)}">${sg$(usd)}</b>${isNum(b) ? `<small class="${cls(b)}">${bps(b, 0)}</small>` : ""}` : `<small class="faint">${miss}</small>`}</span>`;
  const LVI = LVE === "live" ? "💰" : "🟡";
  const cmpList = CMP.slice(0, 40).map((r) => { const p = pFind(r.k, r.tm), d = r.d, m = d?.m;
    const dMiss = !d ? bi("chưa đặt lệnh", "no order") : m?.what === "nofill" ? `✕ ${bi("thiếu", "short")} ${nf(m.gap, 2)}%${m.realHit ? ` · <span class="warn">${bi("sàn thật đã chạm", "real touched")}</span>` : ""}` : `✕ ${esc(m?.why || bi("bỏ qua", "skipped"))}`;
    const note = d?.ok && p ? `<span class="${cls((d.bps ?? 0) - p.net)}">${bi("chênh", "gap")} ${bps((d.bps ?? 0) - p.net, 0)} bps</span>` : "";
    return `<div class="cmp-r"${p ? " data-p" : ""}${d?.ok ? " data-d" : ""}${p && d?.ok ? " data-b" : ""}${d && !d.ok && m?.what === "nofill" ? " data-m" : ""}><div class="cmp-h"><small class="faint">${hms(new Date(r.tm).toISOString().slice(0, 19))}</small><span>🪝 <b>${esc(String(r.k).split(":")[0])}</b> <b class="${r.side > 0 ? "up" : "down"}">${r.side > 0 ? "L" : "S"}</b>${r.R ? ` <small class="faint">${nf(r.R / 100, 1)}%</small>` : ""}</span><small class="cmp-n">${note}</small></div>
      <div class="cmp-2">${cmpCell("🧪", !!p, p?.usd, p?.net, "✕ " + bi("không khớp", "no fill"))}${cmpCell(LVI, !!d?.ok, d?.usd, d?.bps, dMiss)}</div></div>`; }).join("");
  const nD = CMP.filter((r) => r.d?.ok).length, nMiss = CMP.filter((r) => r.d && !r.d.ok && r.d.m.what === "nofill").length, nMissReal = CMP.filter((r) => r.d && !r.d.ok && r.d.m.realHit).length, nP = CMP.filter((r) => pFind(r.k, r.tm)).length;
  // so sánh trên các cú sốc mà CẢ HAI cùng khớp: chênh TB (bps/lệnh) và tổng lời/lỗ mỗi bên
  const both = CMP.map((r) => [pFind(r.k, r.tm), r.d]).filter(([p, d]) => p && d?.ok), gapAvg = both.length ? both.reduce((a, [p, d]) => a + ((d.bps ?? 0) - p.net), 0) / both.length : null;
  const sumP = CMP.reduce((a, r) => a + (pFind(r.k, r.tm)?.usd || 0), 0), sumD = CMP.reduce((a, r) => a + (r.d?.ok ? r.d.usd || 0 : 0), 0);
  const cmpSum = `<div class="cmp-sum" role="group" aria-label="Lọc danh sách cú sốc"><button type="button" data-cmpf="all"><i>${bi("Cú sốc", "Shocks")}</i><b>${CMP.length}</b></button><button type="button" data-cmpf="p"><i>🧪 ${bi("khớp", "filled")}</i><b>${nP}</b><small>${sg$(sumP)}</small></button><button type="button" data-cmpf="d"><i>${LVE === "live" ? "💰" : "🟡"} ${bi("khớp", "filled")}</i><b>${nD}</b><small>${sg$(sumD)}</small></button><button type="button" data-cmpf="b"><i>${bi("Chênh TB", "Avg gap")}</i><b class="${cls(gapAvg)}">${gapAvg == null ? "—" : bps(gapAvg, 0)}</b><small>bps/${both.length} ${bi("cặp", "pairs")}</small></button><button type="button" data-cmpf="m"><i>${LVI} ${bi("lỡ", "missed")}</i><b>${nMiss}</b><small>${nMissReal} ${bi("đã chạm", "touched")}</small></button></div>`;
  const cmpPanel = panel(bi("Sàn thử so với Binance · từng cú sốc", "Paper vs Binance · per shock"), cmpList ? `${cmpSum}<p class="cmp-lg"><span>🧪 ${bi("Sàn thử", "Paper")}</span><span>${LVI} ${LVN}</span><small>${bi("số nhỏ = bps · viền xanh/đỏ = khớp lời/lỗ · viền đứt = không khớp", "small = bps · green/red edge = filled win/loss · dashed = no fill")}</small></p><div class="cmp-l" data-f="${window.__cmpF || "all"}">${cmpList}<p class="cmp-none faint">${bi("Không có cú sốc nào trong mục này.", "No shocks in this group.")}</p></div>
      ${info(bi(`<p>Sàn thử khớp theo giá Binance thật (sàn chính). ${LVE === "demo" ? "Binance Demo có sổ lệnh riêng – giá bám theo sàn thật nhưng râu nến lúc quét thanh lý thường ngắn hơn, nên lệnh chờ sâu của Bắt râu sập khớp ít hơn sàn thử. Demo dùng tốt để kiểm tra cơ chế (đặt lệnh, cắt lỗ, tự đóng, phí, funding), KHÔNG đo đúng được tỉ lệ khớp." : "Chênh lệch giữa sàn thử và tài khoản thật = trượt giá, khớp thiếu ở râu nến, độ trễ đặt lệnh."} Cột "chênh" = lời/lỗ thật trừ sàn thử, tính bằng bps/lệnh nên không phụ thuộc cỡ lệnh.</p>`, `<p>The paper account fills on real (main) Binance prices. ${LVE === "demo" ? "Binance Demo has its own order book – prices track the real market but liquidation wicks are usually shorter, so the Wick Catcher's deep limit orders fill less often than on paper. Demo is good for checking the mechanics (orders, stops, auto-close, fees, funding), NOT for measuring fill rates." : "The gap between paper and live = slippage, missed fills on wicks, order latency."} The "gap" column = live P/L minus paper, in bps per trade, so it doesn't depend on size.</p>`))}` : empty(bi("Chưa có cú sốc nào trên tài khoản Binance để so.", "No shocks on the Binance account to compare yet.")), bi("cùng coin, cách nhau ≤ 20 phút", "same coin, ≤ 20 minutes apart"));
  // lời/lỗ mỗi lệnh = bao nhiêu % TỔNG TÀI SẢN Binance (mọi ví) lúc đó: lệnh mới có sẵn số lúc đóng (h.tot); lệnh cũ → điểm lịch sử tổng tài sản gần nhất trước lúc đóng
  const WH0 = WALH[LVE] || [], totAt = (h) => { if (h.tot > 0) return h.tot; const m = Date.parse(h.t2) / 60000; let v = null; for (const q of WH0) { if (q[0] <= m) v = q[1]; else break; } return v ?? WH0[0]?.[1] ?? WL?.total ?? null; };
  const tPct = (h) => { const T = totAt(h); return T > 0 && isNum(h.pnl) ? h.pnl / T * 100 : null; };
  const LHr = LH.slice().reverse(), lvBase = LVE === "demo" ? "https://demo-fapi.binance.com" : null;
  const lvWhy = (w) => ({ TIME: bi("hết giờ", "time exit"), SL: bi("cắt lỗ", "stop"), TRAIL: bi("cắt lỗ đuổi", "trailing stop"), LIQ: bi("giá ×2 – sàn thanh lý", "liquidated (×2)"), GONE: bi("đã đóng trên Binance", "closed on Binance"), MANUAL: bi("anh đóng tay", "closed manually"), TP: bi("chốt lời", "take profit") }[w] || esc(w));
  const lvTrades = LHr.length ? `<div class="sc-hl lvt">${LHr.map((h, i) => { const q = tPct(h);
    return `<div class="sc-ht"><div class="lvt-r"><span class="lvt-a"><small class="faint">${hms(h.t2)}</small> ${h.strat === "pump" ? "🧪" : "🪝"} <b>${esc(String(lvk(h)).split(":")[0])}</b> <span class="${h.side > 0 ? "up" : "down"}">${h.side > 0 ? "Long" : "Short"}</span> ${grpTag(lvk(h))}</span><span class="lvt-v"><b class="${cls(h.pnl)}">${sg$(h.pnl)}</b>${q != null ? `<em class="${cls(q)}" title="${bi("so với tổng tài sản Binance lúc đó", "vs total Binance assets at the time")}">${q >= 0 ? "+" : ""}${nf(q, 2)}%</em>` : ""}</span>
      <small class="lvt-b faint">${px(h.e)} → ${px(h.x)}${h.q > 0 && h.e > 0 ? ` · ${bi("giá trị", "size")} ${usd2(h.q * h.e)}` : ""} · ${h.nl || 1} ${bi("mức", "lvl")} · ${lvWhy(h.why)}${isNum(h.net) ? ` · <span class="${cls(h.net)}">${bps(h.net, 0)} bps</span>` : ""}${h.fund ? ` · funding ${sg$(h.fund)}` : ""}</small><button type="button" class="lvt-c" data-lvc="${i}" aria-label="${bi("Xem biểu đồ", "Show chart")}">📈</button></div><div class="sc-hc" id="lvc${i}" hidden></div></div>`; }).join("")}</div>` : empty(bi(`Chưa có lệnh nào đã đóng trên ${LVN}.`, `No closed trades on ${LVN} yet.`));
  // ---------------------------------------------------------------- nội dung từng tab
  const trsSec = AT.filter((t) => t.strat !== "hook").slice().reverse().map((t) => `<tr><td class="l"><small>${hms(t.t1)}</small></td><td class="l">${scK(t.k)} <span class="${t.side > 0 ? "up" : "down"}">${t.side > 0 ? "L" : "S"}</span> <small>${t.how}</small></td><td>${px(t.e)} → ${px(t.x)}</td><td>${nf(t.hold, 1)}s</td><td class="${cls(t.gross)}">${bps(t.gross, 2)}</td><td class="down">−${nf(t.fee, 2)}</td><td class="${cls(t.net)}"><b>${bps(t.net, 2)}</b></td><td class="${cls(t.usd)}">${t.usd >= 0 ? "+" : ""}${nf(t.usd, 3)}</td><td><small>${{ TP: "chốt lời", SL: "cắt lỗ", TIME: "hết giờ", "TIME+": "hết giờ (giữ thêm)", REV: "đảo chiều – thoát sớm", BTC: "BTC sốc – thoát ngay", STALE: "mất dữ liệu" }[t.why] || t.why}</small></td></tr>`).join("");
  let body = "";
  const envSeg = TOP === "ov" || TOP === "ord" ? `<div class="sc-env" role="tablist" aria-label="${bi("Xem sàn", "Venue")}">${[["live", `${LVI} ${LVN}`, nLive], ["paper", `🧪 ${bi("Sàn thử", "Paper")}`, nPaper]].map(([k, t, n]) => `<button type="button" role="tab" data-scenv="${k}" class="${ENV === k ? "on" : ""}" aria-selected="${ENV === k}">${t}${n ? ` <i class="sc-bdg">${n}</i>` : ""}</button>`).join("")}</div>` : "";
  const goOrd = (n, what) => !n ? `<p class="sc-more-l"><button type="button" class="btn sm" data-sctab="ord" data-scenv0="paper">${bi(`Lệnh ${what} đã đóng → tab Lệnh`, `Closed ${what} trades → Trades tab`)}</button></p>` : `<p class="sc-goord"><span>${n ? bi(`${n} lệnh ${what} đang mở / chờ khớp`, `${n} ${what} trades open / pending`) : bi(`Lệnh ${what} (đang mở & đã đóng) nằm ở tab Lệnh`, `${what} trades (open & closed) are in the Trades tab`)}</span><button type="button" class="btn sm" data-sctab="ord" data-scenv0="paper">${bi("Xem lệnh →", "View trades →")}</button></p>`;
  const lvOff = !C.lv_on && !LV?.hist?.length && !LV?.ev?.length && !wEnv;
  const lvOffP = panel("💵 Tài khoản Binance", empty(`Tài khoản Binance đang tắt. Bật trong tab <button type="button" class="btn sm" data-sctab="set">⚙️ Thiết lập</button> → mục 💵 Tiền thật (nên chạy Demo trước).`));
  const omk = (html, k) => html.replace(/^<div class="sc-oc/, `<div data-omk="${k}" class="sc-oc`);
  const openCardsP = [...POS.map(([k, p]) => omk(pcard(k, p), p.strat === "hook" ? "hook" : "sec")), ...Object.entries(HK).map(([k, h]) => omk(hcard(k, h), "hook"))].join("") + xOpenP;
  const allOrd = (n) => `<p class="sc-more-l"><button type="button" class="btn sm" data-sctab="ord">${bi(`Xem tất cả lệnh${n ? ` (${n} đang mở)` : ""} →`, `All trades${n ? ` (${n} open)` : ""} →`)}</button></p>`;
  const openP = panel("📌 Đang mở & đang chờ", `${openCardsP ? `<div class="sc-ocs">${openCardsP}</div>` : empty(bi(`Chưa có lệnh nào đang mở. 🪝 Bắt râu sập chờ cú sốc ≥ ${nf(C.hk_r / 100, 1)}%/phút – vài lần mỗi ngày, có ngày không có.`, `No open trades. 🪝 Wick Catcher waits for a ≥ ${nf(C.hk_r / 100, 1)}%/minute shock – a few times a day, some days none.`))}${ords ? `<ul class="bot-rl">${ords}</ul>` : ""}`, bi(`${POS.length + swPos + qPos} lệnh · ${Object.keys(HK).length} chờ khớp`, `${POS.length + swPos + qPos} open · ${Object.keys(HK).length} pending`));
  const openL = panel(bi("Đang mở & chờ khớp", "Open & pending"), lvOpen || swOpenL || xOpenL ? `<div class="sc-ocs">${lvOpen}${swOpenL}${xOpenL}</div>` : empty(bi("Không có lệnh nào đang mở trên sàn.", "No open orders on the exchange.")), `${(LV?.ev || []).length} ${bi("lần bắt", "catches")}`);
  const halt = LV?.halt ? `<p class="sc-pause">⛔ ${esc(LV.halt)} <button type="button" class="btn sm" id="lvRes">${bi("▶ Chạy lại", "▶ Resume")}</button></p>` : "";
  const LMS = (LV?.miss || []).filter((m) => (m.env || LVE) === LVE).slice().reverse(), OL = window.__scOl || "all";
  const olChips = `<div class="bseg sc-om" role="tablist" aria-label="${bi("Lọc lệnh", "Filter")}">${[["all", bi("Tất cả", "All")], ["open", `${bi("Đang mở", "Open")}${nLive ? ` <i class="sc-bdg">${nLive}</i>` : ""}`], ["closed", `${bi("Đã đóng", "Closed")} <small>${LH.length}</small>`], ["miss", `${bi("Hụt", "Missed")} <small>${LMS.length}</small>`], ["cmp", bi("So sàn thử", "Vs paper")]].map(([k, t]) => `<button type="button" data-scol="${k}" class="${OL === k ? "on" : ""}">${t}</button>`).join("")}</div>`;
  const missP = panel(bi("Lệnh hụt", "Missed orders"), LMS.length ? `<div class="jt-m jt-all">${LMS.slice(0, 12).map((m) => `<div class="jc m"><div class="jc1"><span>🪝 <b>${esc(String(m.k).split(":")[0])}</b> <span class="${m.side > 0 ? "up" : "down"}">${m.side > 0 ? "Long" : "Short"}</span> ${grpTag(m.k)}</span><small class="faint">${jTm(m.t0)}</small></div><div class="jc2"><span>${jMissWhy(m)}${m.realHit ? ` · <span class="warn">${bi("sàn chính đã chạm", "main touched")}</span>` : ""}</span>${m.R ? `<span>${bi("sốc", "shock")} ${nf(m.R / 100, 1)}%</span>` : ""}</div></div>`).join("")}</div><p class="sc-more-l"><a class="btn sm" href="#/bot/miss/${LVE}">${bi(`Tất cả lệnh hụt · thống kê →`, "All missed orders →")}</a></p>` : empty(bi("Chưa có lần nào đặt lệnh chờ mà giá không tới.", "No missed orders yet.")), bi(`${LMS.length} lần gần nhất`, `${LMS.length} recent`));
  const nB = (n) => (n ? ` <small>${n}</small>` : "");
  const omChips = `<div class="bseg sc-om" role="tablist">${[["all", bi("Tất cả", "All")], ["hook", "🪝 " + bi("Bắt râu sập", "Wick") + nB(nHook)], ["sec", "⚡ " + bi("Lướt giây", "Scalp") + nB(posS.length)], ["lab", "🧪 " + bi("Thử nghiệm", "Experimental") + nB(swPos + qPos)]].map(([k, t]) => `<button type="button" data-scom="${k}" class="${(window.__scOm || "all") === k ? "on" : ""}">${t}</button>`).join("")}</div>`;
  if (TB === "ov") body = ENV === "paper" ? `${cards}<!--LB--><div class="sc-g2">${panel("📌 Đang mở & đang chờ", `${openCardsP ? `<div class="sc-ocs">${openCardsP}</div>` : empty(bi("Chưa có lệnh nào đang mở trên sàn thử.", "No open paper trades."))}${allOrd(nPaper)}`)}${panel("Sự kiện", `${feed((EVS.filter((e) => e.c !== "sys" && e.s !== "lv").length ? EVS.filter((e) => e.c !== "sys" && e.s !== "lv") : EVS).slice(0, 8), false)}<p class="sc-more-l"><button type="button" class="btn sm" data-sctab="ev">Xem tất cả sự kiện →</button></p>`)}</div>
      <div class="sc-g2">${panel("Tài sản · 12 giờ", `${eqChart}<p class="faint sc-cap">Chấm = lúc đóng lệnh (xanh lời, đỏ lỗ).</p>`)}${panel("⚖️ Lời/lỗ theo phương pháp", `${stChart}${stTable}`, "80 lệnh gần nhất")}</div>`
    : lvOff ? `${lvOffP}<!--LB-->` : `${halt}${lvCards}${/rk-b (full|hi)/.test(lvRisk) ? `<p class="sc-goord sc-rkw"><span>⚠️ ${bi("Giới hạn an toàn của tài khoản sắp đầy – bot có thể ngừng mở lệnh mới", "Account safety limits nearly full – the bot may stop opening trades")}</span><a class="btn sm" href="#/bot/binance">${bi("Xem →", "View →")}</a></p>` : ""}<!--LB-->
      <div class="sc-g2">${panel(bi("Đang mở & chờ khớp", "Open & pending"), `${lvOpen || swOpenL || xOpenL ? `<div class="sc-ocs">${lvOpen}${swOpenL}${xOpenL}</div>` : empty(bi("Không có lệnh nào đang mở trên sàn.", "No open orders on the exchange."))}${allOrd(nLive)}`)}${panel(bi("📜 Sự kiện tài khoản", "📜 Account events"), `${feed(LVEV.slice(0, 12), false)}<p class="sc-more-l"><button type="button" class="btn sm" data-sctab="ev">Xem tất cả sự kiện →</button></p>`)}</div>
      <div class="sc-g2">${panel(bi("Tài sản futures", "Futures equity"), `${lvEqChart}<p class="faint sc-cap">${bi("Gồm lãi/lỗ đang mở · chấm = lúc đóng lệnh. <b>Lời/lỗ thật</b> = tài sản thay đổi trừ tiền anh nạp vào / rút ra ví futures; <b>%</b> tính kiểu quỹ đầu tư (nối % lời/lỗ từng đoạn giữa các lần nạp/rút) nên nạp thêm tiền không làm % tăng giả.", "Includes unrealized P/L · dots = trade closes. <b>Real P/L</b> = equity change minus transfers in/out of the futures wallet; <b>%</b> is time-weighted, so deposits don't inflate it.")}</p>`)}${panel(bi("⚖️ Lời/lỗ cộng dồn", "⚖️ Cumulative P/L"), lvCum, `${LH.length} ${bi("lệnh gần nhất", "recent trades")}`)}</div>
      <p class="sc-goord"><span>${bi("Tổng tài sản các ví, giới hạn an toàn, trạng thái khoá của tài khoản", "Total assets across wallets, safety limits, key status")}</span><a class="btn sm" href="#/bot/binance">${bi("Tài khoản Binance →", "Binance account →")}</a></p>`;
  else if (TB === "ord") body = ENV === "paper" ? `${omChips}<div data-om="open">${openP}</div>
      <div data-om="hook">${panel("Bắt râu sập · đã đóng", `${hkTrades}<p class="faint sc-cap">Bấm 📈 để xem nến 1 phút quanh cú sốc: giá sau cú sốc, 2 mức chờ, điểm khớp và điểm thoát (giá lấy trực tiếp từ Binance).</p>`, `${HT.length} lệnh gần nhất`)}</div>
      <div data-om="sec">${panel("Lướt giây · đã đóng", trsSec ? `<div class="tw" style="max-height:420px"><table class="rs"><thead><tr><th class="l">Lúc</th><th class="l">Lệnh</th><th>Vào → ra</th><th>Giữ</th><th>Gộp (bps)</th><th>Phí</th><th>Ròng (bps)</th><th>USDT</th><th>Lý do</th></tr></thead><tbody>${trsSec}</tbody></table></div>` : empty("Chưa có lệnh – bot chỉ vào khi biên lời đo được lớn hơn phí."))}</div>
      <div data-om="lab">${panel(bi("Thử nghiệm · đã đóng", "Experimental · closed"), `${xTrades}<p class="faint sc-cap">${bi("Short coin vừa bơm / mới niêm yết và 6 kiểu định lượng chạy trên sàn thử. Bật/tắt, thông số ở tab Phương pháp.", "Pumped / newly listed shorts and 6 quant methods on paper. Toggle & settings in the Methods tab.")}</p>`, bi(`${xHist.length} lệnh gần nhất`, `${xHist.length} recent`))}</div>
      <p class="sc-goord"><span>${bi("Sổ lệnh mọi ngày của mọi bot · lọc theo coin, nhóm, lời/lỗ", "Every bot's full trade book")}</span><a class="btn sm" href="#/bot/journal/paper">${bi("Sổ lệnh →", "Trade book →")}</a></p>`
    : lvOff ? lvOffP : `${halt}${olChips}<div data-ol="open">${openL}</div><div data-ol="closed">${panel(bi("Lệnh đã đóng", "Closed trades"), `${lvTrades}<p class="faint sc-cap">${bi(`Lời/lỗ, phí và funding lấy từ sổ thu chi của sàn. Bấm 📈 để xem nến 1 phút${LVE === "demo" ? " của sàn Demo" : ""} quanh lệnh.`, `P/L, fees and funding come from the exchange's income history. Press 📈 for the 1-minute candles${LVE === "demo" ? " on Demo" : ""} around the trade.`)}</p>`, `${LH.length} ${bi("lệnh", "trades")}`)}</div>
      <div data-ol="miss">${missP}</div><div data-ol="cmp">${cmpPanel}</div>
      <p class="sc-goord"><span>${bi("Sổ lệnh đầy đủ mọi ngày · lọc theo coin, nhóm, lời/lỗ · lệnh hụt", "Full trade book · filter by coin, group, win/loss · missed orders")}</span><a class="btn sm" href="#/bot/journal/${LVE}">${bi("Sổ lệnh →", "Trade book →")}</a></p>`;
  else if (TB === "hook") body = `${goOrd(nHook, "Bắt râu sập")}${hkPanel}${filterPanel}`;
  else if (TB === "sec") body = `${goOrd(posS.length, "Lướt giây")}
      ${panel("🧮 Vì sao bot chưa vào lệnh – trực tiếp", `${N.all ? `<div class="sc-cnt"><span>Mỗi giây trên <b>${nf(N.all, 0)}</b> thị trường:</span><span class="pill buy">${nf(N.go || 0, 0)} đạt chuẩn</span><span class="pill brand">${nf(N.hold || 0, 0)} đang giữ</span><span class="pill warn">${nf(N.fee || 0, 0)} chưa đủ biên lời</span><span class="pill brand">${nf(N.verify || 0, 0)} đang đánh ảo</span><span class="pill">${nf(N.learn || 0, 0)} đang học</span><span class="pill">${nf(N.skip || 0, 0)} bỏ qua</span></div>` : ""}${whyLive(X, C)}`, `ngưỡng ${nf(C.k + (X.kadd || 0), 1)}× chi phí`)}
      ${panel("🎯 Radar – cơ hội tốt nhất toàn thị trường lúc này", `<div class="bseg sc-fl">${[["all", "Tất cả"], ["F", "Futures"], ["S", "Spot"]].map(([v, t]) => `<button type="button" data-scf="${v}" class="${F0 === v ? "on" : ""}">${t}</button>`).join("")}</div>
        ${radar ? `<div class="tw" style="max-height:560px"><table class="sc-r rs"><thead><tr><th class="l">Thị trường · lý do</th><th>Giá</th><th title="Chênh lệch mua/bán (bps)">Chênh lệch</th><th title="Dao động mỗi giây (bps)">Dao động</th><th>Tín hiệu</th><th title="Lợi thế kỳ vọng (bps) · thời gian giữ">Kỳ vọng</th><th title="Chi phí khứ hồi (bps)">Chi phí</th><th title="Ròng sau phí (bps)">Ròng (bps)</th><th>Trạng thái</th></tr></thead><tbody>${radar}</tbody></table></div>` : empty("Chưa có dữ liệu trực tiếp.")}
        ${info(`<p>Xếp theo lợi thế ròng sau phí / √thời gian giữ. Mỗi giây bot chấm điểm mọi thị trường, nhưng chỉ vào tối đa 1 lệnh – cơ hội tốt nhất – và chỉ khi lợi thế kỳ vọng ≥ <b>${nf(C.k + (X.kadd || 0), 1)}×</b> chi phí và ròng sau phí ≥ <b>${nf(C.min_net, 1)} bps</b>. Spot chỉ được Long.</p>`)}`, "đánh giá lại mỗi giây")}
      ${panel("🔍 Kiểm tra: kỳ vọng lúc vào lệnh vs kết quả thực", audit, "80 lệnh gần nhất")}
      ${panel("⚖️ Futures vs Spot", `<div class="tw"><table><thead><tr><th class="l">Loại</th><th>Số lệnh</th><th>Thắng</th><th>Ròng sau phí</th><th>Phí</th></tr></thead><tbody>${byRow("F", "Futures")}${byRow("S", "Spot")}</tbody></table></div>`)}`;
  if (TB === "lab" || TB === "ov") {      // bảng bật/tắt mọi phương pháp: tab Phương pháp › Tất cả VÀ ngay trên Tổng quan (1 chạm từ nút Bot)
    // 🧪 THỬ NGHIỆM – 1 bảng 3 cột kéo-thả: 📚 tất cả kiểu chơi | 🧪 đang đánh sàn thử | 💰 đang đánh tiền thật (Demo / thật)
    // 8 phương pháp: 6 📐 định lượng (worker/quant.js) + 2 🗓️ giữ nhiều ngày (worker/swing.js). Bấm thẻ → ngăn kéo: làm gì, kết quả, bật/tắt, ⚙️ thông số, luật.
    const sg = (v, d = 2) => `${v >= 0 ? "+" : ""}${nf(v, d)}`;
    const LVN = C.lv_env === "live" ? "tiền thật" : "Demo";
    // ---------- 🗓️ giữ nhiều ngày
    const BTS = { list: { n: 718, win: 65, mean: "+5,7%", yr: "≈ +41%/năm", dd: "49%", bad: "7% lệnh lỗ > 50%", mx: "+78%" }, pump: { n: 111, win: 74, mean: "+15%", yr: "≈ +38%/năm", dd: "16%", bad: "13% lệnh lỗ > 50%", mx: "+89%" } };
    const SD = { list: { sz: 10, max: 5, days: 14 }, pump: { sz: 5, max: 5, days: 7, chg: 100, vol: 10 } };
    const WS = { list: ["Coin mới lên sàn futures thường được đẩy giá lúc đầu rồi <b>giảm dần trong 1–2 tuần</b>. Bot Short coin đó 24 giờ sau khi niêm yết và giữ cố định, không cắt lỗ.", "Short coin mới niêm yết, giữ 14 ngày"],
      pump: ["Coin vừa <b>tăng gấp đôi trong 24 giờ</b> thường xì hơi trong tuần sau. Mỗi sáng 7:00 bot lọc các coin như vậy, Short và giữ cố định, không cắt lỗ.", "Short coin vừa tăng gấp đôi, giữ 7 ngày"] };
    const swLv = LV?.swp?.open || [];
    const swM = (k) => {
      const B = SWX?.[k] || {}, st = B.st || { n: 0, pnl: 0 }, pos = B.pos || [], open = pos.reduce((a, p) => a + (p.upnl || 0), 0), T = BTS[k], D = SD[k];
      const paperOn = C.swx?.[k]?.on !== false, lvOn = k === "pump" && !!C.sw_lv_pump, nlv = k === "pump" ? swLv.length : 0;
      const P = [{ g: "Cỡ lệnh (sàn thử)", f: "sz", type: "n", label: "Mỗi lệnh dùng", unit: "% tài sản", dp: 1, def: D.sz, desc: "phần tài sản sàn thử cho 1 lệnh", tip: k === "list" ? "lệnh có thể mất trắng (x1, không cắt lỗ) – đừng quá 10%" : "kiểm chứng dùng 5%/lệnh" },
        { g: "Cỡ lệnh (sàn thử)", f: "max", type: "n", label: "Tối đa lệnh cùng lúc", dp: 0, def: D.max, desc: "đủ thì bỏ qua tín hiệu mới", tip: "kiểm chứng tính danh mục 5 lệnh" },
        { g: "Vào & thoát lệnh", f: "days", type: "n", label: "Giữ lệnh", unit: "ngày", dp: 0, def: D.days, desc: "hết giờ thì đóng ở giá thị trường", tip: `kiểm chứng giữ ${D.days} ngày` }];
      if (k === "pump") P.push({ g: "Vào & thoát lệnh", f: "chg", type: "n", label: "Tăng tối thiểu trong 24 giờ", unit: "%", dp: 0, def: D.chg, desc: "áp dụng cho cả sàn thử và tiền thật", tip: "thấp hơn = nhiều lệnh hơn nhưng chưa kiểm chứng" },
        { g: "Vào & thoát lệnh", f: "vol", type: "n", label: "Khối lượng 24 giờ tối thiểu", unit: "triệu USD", dp: 0, def: D.vol, desc: "bỏ coin quá ít thanh khoản", tip: "dưới 10 triệu USD dễ bị trượt giá" },
        { g: "💰 Tiền thật", top: true, f: "sw_lv_sz", type: "n", label: "Mỗi lệnh thật dùng", unit: "% vốn", dp: 0, def: SCALP_DEF.sw_lv_sz, desc: "tối thiểu ~5,5 USDT mỗi lệnh", tip: "không nên quá 5% – lệnh có thể mất trắng" },
        { g: "💰 Tiền thật", top: true, f: "sw_lv_max", type: "n", label: "Tối đa lệnh thật cùng lúc", dp: 0, def: SCALP_DEF.sw_lv_max, desc: "", tip: "2 lệnh × 5% = tối đa 10% vốn đang rủi ro" });
      P.forEach((p) => (p.sc = "swx", p.k = k));
      const tot = st.pnl + open;
      return { sc: "swx", k, ico: k === "list" ? "🆕" : "🚀", name: B.name || (k === "list" ? "Short coin mới niêm yết" : "Short coin vừa bơm ≥ 100%"), kind: "🗓️ Giữ nhiều ngày", grp: "sw",
        verdict: k === "list" ? `<span class="pill warn">lời quá khứ · sụt sâu</span>` : `<span class="pill buy">lời quá khứ · ít lệnh</span>`, what: WS[k][0], short: WS[k][1],
        paper: { on: paperOn, attr: `data-lbt="paper|${k}"`, note: "tiền ảo · chung tài sản sàn thử · mặc định bật" },
        live: k === "list" ? { none: `chỉ theo dõi – ${T.bad}, sụt tối đa ${T.dd}: quá rủi ro cho tiền thật` } : { on: lvOn, attr: `data-lbt="live|${k}"`, note: lvOn ? `${C.sw_lv_sz}% vốn/lệnh · tối đa ${C.sw_lv_max} lệnh · chạy riêng, không cần sàn thử` : "Short lệnh thị trường, x1, không cắt lỗ" },
        mech: k === "pump" ? "Tiền thật chạy <b>riêng</b> với sàn thử: cùng tín hiệu, không cần bật sàn thử. Cần bật tài khoản Binance ở tab 💵 trước." : "Lệnh có thể mất trắng phần tiền của lệnh (giá ×2) – vì vậy chỉ đánh trên sàn thử.",
        ver: `<b class="up">${T.mean}</b>/lệnh <small class="faint">· ${T.n} lệnh</small>`, vs: [k === "list" ? "warn" : "ok", `${T.mean}`, `Kiểm chứng 2022–26: ${T.n} lệnh · thắng ${T.win}% · TB ${T.mean}/lệnh · sụt tối đa ${T.dd}`], tot, nOpen: pos.length, nlv,
        stats: [["Kiểm chứng 2022–26", `${T.mean}/lệnh`, `${T.n} lệnh · thắng ${T.win}% · ${T.yr} · sụt tối đa ${T.dd}`],
          ["Sàn thử – đã đóng", st.n ? `<span class="${cls(st.pnl)}">${sg(st.pnl)} USDT</span>` : "chưa có", st.n ? `${st.n} lệnh · thắng ${nf(st.win / st.n * 100, 0)}% · phí ${nf(st.fee || 0, 2)} · funding ${sg(st.fund || 0)}` : "chờ tín hiệu"],
          ["Sàn thử – đang mở", `${pos.length} lệnh`, pos.length ? `<span class="${cls(open)}">${sg(open)} USDT</span>` : ""],
          ["Tiền thật", k === "list" ? "—" : lvOn ? `${nlv} lệnh mở` : "tắt", k === "list" ? "không hỗ trợ" : ""]],
        pp: { n: st.n || 0, pnl: st.pnl || 0 },
        res: st.n || pos.length ? `<b class="${cls(tot)}">${sg(tot)}</b> <small class="faint">USDT · ${st.n} đóng · ${pos.length} mở</small>` : `<span class="faint">chưa có lệnh</span>`,
        params: P, rule: `<p><b>Luật đang chạy:</b> ${esc(B.rule || "")}.</p><p>Kiểm chứng 01/2022–10/2026 trên nến 1 giờ Binance futures (918 mã, kể cả mã đã huỷ niêm yết): ${T.n} lệnh · thắng ${T.win}% · TB ${T.mean}/lệnh · lời lớn nhất ${T.mx} · lỗ lớn nhất −100% (${T.bad}) · ${T.yr}, sụt tối đa ${T.dd}.</p><p>Không cắt lỗ là theo kết quả kiểm chứng: cắt lỗ +15/+30/+50% đều làm phương pháp kém đi hoặc thành lỗ. Phí 0,30% khứ hồi + funding thật mỗi kỳ chốt đã trừ.</p>` };
    };
    // ---------- 📐 định lượng
    const RULE = {
      ou: "Mỗi tháng chọn tối đa 20 cặp trong 60 coin lớn: tương quan ≥ 0,75, đồng tích hợp (ADF < −3,34), chu kỳ bán rã 2–72 giờ. Hệ số phòng vệ cập nhật bằng Kalman. Chênh lệch lệch |Z| > ngưỡng → bán coin đắt + mua coin rẻ (trung tính thị trường); chốt |Z| < 0,5, cắt |Z| > 3,5, tối đa 10× bán rã, đóng hết cuối tháng.",
      rsi2: "Nến đã đóng: giá > EMA200, ADX14 < 30 (không bão giá), RSI(2) < ngưỡng, đóng dưới dải Keltner (EMA20 − 2 ATR) → Long (bản Short: gương lại); thoát khi nến đóng trên SMA5 / EMA10.",
      fund: "Ngay sau kỳ chốt funding: funding âm và thấp nhất 5% của chính coin đó trong 90 ngày (phe Short quá đông, đang trả phí) → Long, giữ cố định; bản có lọc: 8 giờ trước đó giá không giảm thêm (lực bán bị hấp thụ).",
      orb: "00:00 UTC: hôm qua là ngày hẹp nhất 7 ngày (NR7) hoặc Bollinger hẹp nhất 30 ngày → chờ mua ở Open + Stretch / bán ở Open − Stretch (Stretch = TB 10 ngày của khoảng cách nhỏ hơn từ giá mở tới đỉnh/đáy). Chốt nhanh theo ATR, cắt ở mức đối diện, 23:59 UTC đóng.",
      vwap: "VWAP neo 00:00 UTC trên nến 5 phút ± kσ (σ theo khối lượng). Tuỳ chọn: chỉ đánh khi HMM 2 trạng thái trên BTC 1 giờ báo thị trường đi ngang (p > 0,7) và có phân kỳ MFI; chốt khi giá về VWAP, cắt ở k + 1,5σ, hết ngày đóng.",
      liq: "Nến 5 phút đã đóng: 15 phút giá −X%, Open Interest −Y% so với cao nhất 4 nến trước (phe Long bị thanh lý), râu dưới ≥ 40% nến, khối lượng > 3× TB 20 nến → Long bắt hồi; chốt khi hồi 50% cú sập, cắt dưới đáy 50% cú sập, giữ tối đa theo thông số.",
    };
    const WQ = {
      ou: ["Hai coin hay đi cùng nhau mà <b>tạm lệch nhau quá xa</b> → bán coin đắt, mua coin rẻ, chờ chúng về lại gần nhau. Lời/lỗ gần như không phụ thuộc thị trường lên hay xuống.", "Cặp coin lệch nhau → đánh chúng về gần nhau"],
      rsi2: ["Giá bị đẩy <b>quá đà trong vài nến</b> (RSI 2 kỳ ở mức cực trị) mà thị trường không bão giá → đánh ngược lại, chờ giá hồi về trung bình rồi thoát.", "Giá quá đà vài nến → đánh ngược chờ hồi"],
      fund: ["Khi phe Short <b>đông bất thường</b> (funding âm sâu nhất trong 90 ngày của coin đó) → Long, ăn cú ép Short và nhận luôn funding.", "Phe Short quá đông → Long ăn cú ép"],
      orb: ["Sau một ngày giá <b>đứng yên bất thường</b> (biên độ hẹp nhất), giá hay bùng mạnh → đặt chờ ở 2 phía, phá phía nào đi theo phía đó, đóng trong ngày.", "Ngày tích luỹ hẹp → theo hướng phá vỡ"],
      vwap: ["Giá lệch <b>quá xa giá trung bình theo khối lượng</b> trong ngày (VWAP) → đánh chờ giá quay về VWAP, đóng trong ngày.", "Giá lệch xa VWAP → chờ quay về"],
      liq: ["Cú sập nhanh kèm Open Interest giảm mạnh = <b>phe Long bị thanh lý hàng loạt</b> → Long bắt cú hồi, giữ ngắn.", "Thác thanh lý → bắt cú hồi ngắn"],
    };
    const SIDE = [["1", "Long"], ["-1", "Short"]];
    const QSPEC = {
      ou: [{ f: "mode", type: "g", label: "Hệ số phòng vệ", opts: [["kal", "Kalman"], ["fix", "β cố định"]], desc: "tỉ lệ 2 chân của cặp", tip: "Kalman tự cập nhật theo giá – walk-forward chọn" },
        { f: "zin", type: "n", label: "Vào khi chênh lệch |Z| >", unit: "σ", dp: 1, desc: "chốt khi |Z| < 0,5 · cắt khi |Z| > 3,5", tip: "cao hơn = ít lệnh hơn; đã thử 2,8 – vẫn chưa có lợi thế" }],
      rsi2: [{ f: "side", type: "g", label: "Hướng", opts: SIDE, desc: "Short = bản gương (giá dưới EMA200, RSI2 quá cao)", tip: "6 tháng gần nhất bản Short tốt hơn" },
        { f: "tf", type: "g", label: "Khung nến", opts: [["H1", "1 giờ"], ["H4", "4 giờ"]], desc: "", tip: "4 giờ ít nhiễu hơn" },
        { f: "lvl", type: "n", label: "Mức RSI(2) cực trị", dp: 0, desc: "Long: RSI2 < mức · Short: RSI2 > 100 − mức", tip: "thấp hơn = ít lệnh, quá đà hơn" },
        { f: "kel", type: "b", label: "Cần đóng ngoài dải Keltner", desc: "EMA20 ± 2 ATR – lọc tín hiệu yếu", tip: "" },
        { f: "ex", type: "g", label: "Thoát khi nến đóng vượt", opts: [["sma5", "SMA5"], ["ema10", "EMA10"]], desc: "", tip: "SMA5 thoát sớm hơn" }],
      fund: [{ f: "hold", type: "n", label: "Giữ lệnh", unit: "giờ", dp: 0, desc: "đóng sau chừng này giờ", tip: "8 giờ = 1 kỳ funding" },
        { f: "abs", type: "b", label: "Lọc hấp thụ", desc: "chỉ vào khi 8 giờ trước đó giá không giảm thêm", tip: "" }],
      orb: [{ f: "flt", type: "g", label: "Nhận ngày tích luỹ bằng", opts: [["nr7", "NR7"], ["bb30", "Bollinger"], ["both", "Cả hai"]], desc: "NR7 = hẹp nhất 7 ngày · Bollinger = dải hẹp nhất 30 ngày", tip: "" },
        { f: "tp", type: "n", label: "Chốt lời", unit: "ATR", dp: 1, desc: "× ATR 14 ngày tính từ giá vào", tip: "thấp hơn = chốt sớm, thắng nhiều hơn nhưng ăn ít" }],
      vwap: [{ f: "side", type: "g", label: "Hướng", opts: SIDE, desc: "Long khi giá dưới VWAP, Short khi trên", tip: "" },
        { f: "k", type: "n", label: "Vào khi lệch VWAP ≥", unit: "σ", dp: 2, desc: "cắt lỗ ở k + 1,5σ", tip: "cao hơn = ít lệnh, lệch xa hơn" },
        { f: "hmm", type: "b", label: "Chỉ khi thị trường đi ngang", desc: "bộ lọc HMM trên BTC 1 giờ", tip: "" },
        { f: "mfi", type: "b", label: "Cần phân kỳ MFI", desc: "dòng tiền đã đổi chiều", tip: "" }],
      liq: [{ f: "side", type: "g", label: "Hướng", opts: SIDE, desc: "Long = bắt hồi sau cú sập", tip: "" },
        { f: "X", type: "n", label: "Giá rơi trong 15 phút ≥", unit: "%", mul: 100, dp: 1, desc: "", tip: "thấp hơn = nhiều lệnh hơn" },
        { f: "Y", type: "n", label: "Open Interest giảm ≥", unit: "%", mul: 100, dp: 1, desc: "so với cao nhất 4 nến trước", tip: "" },
        { f: "hold", type: "n", label: "Giữ tối đa", unit: "phút", mul: 5, dp: 0, desc: "chưa chốt/cắt thì đóng", tip: "" }],
    };
    const P0 = QX?.QP0 || QX?.QP || {}, S0 = QX?.QS0 || {};
    const rsB = (r) => !r ? `<span class="faint">chưa có</span>` : r.n ? `<b class="${cls(r.mean)}">${r.mean >= 0 ? "+" : ""}${nf(r.mean, 0)} bps</b>/lệnh <small class="faint">· ${nf(r.n, 0)} lệnh</small>` : `<span class="faint">không có lệnh</span>`;
    const lvOpen = LV?.qp?.open || [];
    const qM = (k) => {
      const B = QX?.[k] || {}, R = QX?.QR?.[k], st = B.st || {}, pos = B.pos || [], op = pos.reduce((a, x) => a + (x.upnl || 0), 0), nlv = lvOpen.filter((p) => p.k === k).length;
      const paperOn = C.q_on !== false && C["q_" + k] !== false, liveOn = !!C["lq_" + k], edge = R?.t >= 2 && R?.mean > 0;
      const vr = !R?.n ? `<span class="pill">chưa kiểm chứng</span>` : edge ? `<span class="pill buy">có lợi thế</span>` : R.mean > 0 ? `<span class="pill">dương, chưa chắc</span>` : `<span class="pill sell">lỗ sau phí</span>`;
      const sz0 = S0[k] || { sz: B.sz, max: B.max };
      const P = [...(QSPEC[k] || []).map((p) => ({ ...p, g: "Điều kiện vào & thoát", def: P0[k]?.[p.f] })),
        { g: "Cỡ lệnh (sàn thử)", f: "sz", type: "n", label: "Mỗi lệnh dùng", unit: "% tài sản", dp: 1, def: sz0.sz, desc: "phần tài sản sàn thử cho 1 lệnh", tip: "tiền thật dùng cỡ riêng ở cột 💰" },
        { g: "Cỡ lệnh (sàn thử)", f: "max", type: "n", label: "Tối đa lệnh cùng lúc", dp: 0, def: sz0.max, desc: "đủ thì bỏ qua tín hiệu mới", tip: "" }].filter((p) => p.def !== undefined);
      P.forEach((p) => (p.sc = "qx", p.k = k));
      const tot = (st.pnl || 0) + op;
      return { sc: "qx", k, ico: B.ico || "📐", name: B.name || k, kind: "📐 Định lượng", grp: "q", verdict: vr, what: WQ[k][0], short: WQ[k][1], edge,
        paper: { on: paperOn, attr: `data-lbt="paper|${k}"`, note: "tiền ảo · chung tài sản sàn thử · mặc định bật" },
        live: { on: liveOn, attr: `data-lbt="live|${k}"`, note: liveOn ? `đi theo lệnh sàn thử · ${C.lq_sz}% vốn/lệnh` : edge ? "có lợi thế ngoài mẫu – cân nhắc bật Demo trước" : "chưa nên bật – chưa có lợi thế sau phí" },
        mech: "Tiền thật <b>đi theo đúng lệnh sàn thử</b> (mở/đóng cùng lúc) → tắt sàn thử là tắt luôn tiền thật. Cỡ lệnh thật chỉnh chung ở cột 💰.",
        ver: rsB(R), vs: [!R?.n ? "na" : edge ? "ok" : R.mean > 0 ? "mid" : "bad", R?.n ? `${R.mean >= 0 ? "+" : ""}${nf(R.mean, 0)} bps` : "—", R?.n ? `Kiểm chứng ngoài mẫu: ${R.n} lệnh · thắng ${nf(R.win, 0)}% · TB ${R.mean >= 0 ? "+" : ""}${nf(R.mean, 0)} bps/lệnh sau phí · t ${nf(R.t, 1)}` : "chưa có kết quả kiểm chứng ngoài mẫu"], tot, nOpen: pos.length, nlv, R,
        stats: [["Kiểm chứng ngoài mẫu", !R?.n ? "chưa có" : `<span class="${cls(R.mean)}">${R.mean >= 0 ? "+" : ""}${nf(R.mean, 0)} bps</span>/lệnh`, R?.n ? `${nf(R.n, 0)} lệnh · thắng ${nf(R.win, 0)}% · t ${nf(R.t, 1)}${isNum(R.ret10) ? ` · 10%/lệnh ≈ ${R.ret10 >= 0 ? "+" : ""}${nf(R.ret10, 0)}%/năm` : ""}` : "walk-forward 6 tháng → 2 tháng"],
          ["Sàn thử – đã đóng", st.n ? `<span class="${cls(st.pnl)}">${sg(st.pnl)} USDT</span>` : "chưa có", st.n ? `${nf(st.n, 0)} lệnh · thắng ${nf(st.win / st.n * 100, 0)}%` : "chờ tín hiệu"],
          ["Sàn thử – đang mở", `${pos.length} lệnh`, pos.length ? `<span class="${cls(op)}">${sg(op)} USDT</span>` : ""],
          ["Tiền thật", liveOn ? `${nlv} lệnh mở` : "tắt", liveOn ? LVN : ""]],
        pp: { n: st.n || 0, pnl: st.pnl || 0 },
        res: st.n || pos.length ? `<b class="${cls(tot)}">${sg(tot)}</b> <small class="faint">USDT · ${st.n || 0} đóng · ${pos.length} mở</small>` : `<span class="faint">chưa có lệnh</span>`,
        params: P, rule: `<p>${RULE[k]}</p><p>Mức chuẩn = tham số walk-forward chọn trên 6 tháng gần nhất. Kiểm chứng: <code>research/quant6a.py</code> (nến 1 giờ 01/2022 → nay, 100 coin/tháng theo khối lượng tháng trước, kể cả coin đã huỷ niêm yết) và <code>research/quant6b.py</code> (nến 5 phút + Open Interest ~16 tháng). Chỉ dùng nến đã đóng, vào ở giá mở nến kế tiếp; phí + chênh lệch + trượt 14–19 bps mỗi vòng (cặp coin: cả 2 chân). Đổi thông số khác chuẩn = kết quả kiểm chứng không còn áp dụng.</p>` };
    };
    // ⭐ 2 phương pháp chính (Bắt râu sập, Lướt giây) – cùng thanh 2 cần gạt; bấm tên mở trang riêng của nó
    const mainM = (k) => {
      const H = k === "hook", B = H ? bh : bsec, n = B?.n || 0, pend = H ? Object.keys(HK).length : 0, open = H ? posH.length : posS.length, nlv = H ? (LV?.ev || []).length : 0;
      const paperOn = H ? C.hk_on !== false : C.sec_on !== false, liveOn = !!C.lv_on && (H ? C.lv_hk !== false : !!C.lq_sec);
      return { main: 1, sc: "main", k, ico: H ? "🪝" : "⚡", name: H ? "Bắt râu sập" : "Lướt giây", grp: "main", params: [],
        short: H ? "Cú sập/vọt ≥ 3%/phút → chờ khớp ở râu nến, giữ ≤ 60 phút" : "Đọc sổ lệnh từng giây, vào–ra trong vài giây tới vài phút",
        vs: H ? ["ok", "+81 bps", "Kiểm chứng 01/2025–09/2026 (danh mục thật, thoát đuổi 150/100): ~3,7 lệnh/ngày · TB +81 bps/lệnh · thắng 88% · tổng +61% · sụt tối đa 5%"]
          : [n ? (B.net > 0 ? "mid" : "bad") : "na", n ? `${B.bps / n >= 0 ? "+" : ""}${nf(B.bps / n, 0)} bps` : "—", n ? `Sàn thử: ${n} lệnh · thắng ${nf(B.win / n * 100, 0)}% · ${B.net >= 0 ? "+" : ""}${usd2(B.net)} – chưa có kiểm chứng trên dữ liệu quá khứ` : "chưa có lệnh"],
        paper: { on: paperOn }, live: { on: liveOn, note: H ? "" : "đi theo lệnh sàn thử · chưa có lợi thế" },
        tot: B?.net || 0, nOpen: open + pend, nlv, edge: H, pp: { n, pnl: B?.net || 0 } };
    };
    const ML = [mainM("hook"), mainM("sec"), ...(QX ? QK.map(qM) : []), ...(SWX ? ["pump", "list"].map(swM) : [])], MM = Object.fromEntries(ML.map((m) => [m.k, m]));
    LB = { ML, MM };
    const nchgOf = (m) => m.params.filter((p) => String(p.top ? (C[p.f] ?? p.def) : lmV(p, p.def)) !== String(p.def)).length;
    // ---------- DANH SÁCH 1 CỘT: mỗi kiểu chơi = 1 thanh; cuối thanh chia 2 khúc = 2 cần gạt (🧪 sàn thử | 💰 tiền thật)
    // máy tính: 1 dòng (tên · kiểm chứng · 🧪 · 💰 thẳng cột) · điện thoại: tên ở trên, 2 cần gạt chia đôi ở dưới
    const NM = { ou: "Cặp coin O-U", rsi2: "RSI(2) Connors", fund: "Funding âm → Long", orb: "ORB + NR7", vwap: "VWAP ± σ", liq: "Thác thanh lý", pump: "Short coin vừa bơm", list: "Short coin mới niêm yết" }, nmOf = (m) => NM[m.k] || m.name;
    const pOn = ML.filter((m) => m.paper.on), lOn = ML.filter((m) => m.live.on), pSum = pOn.reduce((a, m) => a + m.tot, 0), lvN = lOn.reduce((a, m) => a + (m.nlv || 0), 0);
    const szB = (v) => `<button type="button" data-qsz="${v}" class="${+C.lq_sz === v ? "on" : ""}">${v}%</button>`, mxB = (v) => `<button type="button" data-qmx="${v}" class="${+C.lq_max === v ? "on" : ""}">${v}</button>`;
    const ctx = QX ? `<div class="sc-cnt lb-ctx">${QX.reg ? `<span>Thị trường (HMM BTC): <b>${QX.reg.p > 0.7 ? "đi ngang" : "có xu hướng"}</b> · p ${nf(QX.reg.p * 100, 0)}%</span>` : ""}${QX.pairs ? `<span>Cặp tháng ${esc(QX.pairs.m || "")}: <b>${QX.pairs.L.length}</b>${QX.pairs.L.length ? ` – ${QX.pairs.L.slice(0, 5).map((q) => esc(q.id.replace(/USDT/g, ""))).join(", ")}${QX.pairs.L.length > 5 ? "…" : ""}` : ""}</span>` : ""}${QX.orb?.L?.length ? `<span>ORB ${esc(QX.orb.day)}: ${QX.orb.L.length} coin chờ phá vỡ</span>` : ""}<span>${nf(QX.uni, 0)} coin đang quét</span>${SWX?.at ? `<span>giá & funding ${hms(SWX.at)}</span>` : ""}</div>` : "";
    const oldSrv = (QX && !QX.QLIM) || (SWX && !SWX.LIM);
    const LVT = C.lv_env === "live" ? "Tiền thật" : "Demo", LVI = C.lv_env === "live" ? "💰" : "🟡";
    const seg = (m, w) => {
      const P = w === "paper", on = P ? m.paper.on : m.live.on, none = !P && m.live.none, lock = !P && !none && !C.lv_on;
      const val = P ? (on ? (m.nOpen || m.tot ? `<b class="${cls(m.tot)}">${sg(m.tot)}</b>${m.nOpen ? ` · ${m.nOpen} mở` : ""}` : "chờ tín hiệu") : m.nOpen || m.tot ? `đã ${sg(m.tot)}` : "đang tắt")
        : none ? "không hỗ trợ" : lock ? "chưa bật Binance" : on ? (m.nlv ? `<b>${m.nlv}</b> lệnh mở` : "chờ tín hiệu") : "đang tắt";
      const tip = none ? m.live.none : lock ? "Tài khoản Binance của bot đang tắt – bật ở ⚙️ Thiết lập → 💵 trước" : `${on ? "Tắt" : "Bật"} ${m.name} trên ${P ? "sàn thử" : LVT === "Demo" ? "Binance Demo" : "tiền thật"}`;
      return `<button type="button" class="lb-seg ${P ? "p" : "l"}${on ? " on" : ""}${none || lock ? " dis" : ""}" ${none ? "disabled" : `data-lbt="${w}|${m.k}"`} role="switch" aria-checked="${on}" title="${esc(tip)}">
        <i class="lb-sw" aria-hidden="true"></i><span class="lb-st"><b>${P ? "Sàn thử" : LVT}</b><small>${val}</small></span></button>`;
    };
    const row = (m) => { const n = nchgOf(m); return `<div class="lb-r${m.paper.on || m.live.on ? " on" : ""}" data-lbk="${m.k}">
        <button type="button" class="lb-nm" ${m.main ? `data-scpm="${m.k}" title="Mở trang ${esc(m.name)}"` : `data-lbopen="${m.k}" title="Bấm xem chi tiết & chỉnh thông số"`}><i class="lb-vd ${m.vs[0]}" title="${esc(m.vs[2])}"></i><span class="lb-ic">${m.ico}</span>
          <span class="lb-tx"><b>${esc(nmOf(m))}${n ? ` <span class="lb-chg" title="${n} thông số khác chuẩn">⚙️${n}</span>` : ""}</b><small><span class="lb-vm">${m.vs[1]} · </span>${m.short}</small></span><span class="lb-go" aria-hidden="true">›</span></button>
        <span class="lb-ver" title="${esc(m.vs[2])}">${m.vs[1]}</span>${seg(m, "paper")}${seg(m, "live")}</div>`; };
    const GR = [["main", "Phương pháp chính"], ["q", "Định lượng · thử nghiệm"], ["sw", "Giữ nhiều ngày · thử nghiệm"]].map(([g, t]) => [t, ML.filter((m) => m.grp === g)]).filter(([, L]) => L.length);
    const board = `<div class="lbx" id="lb">
        <div class="lb-hr"><span>Kiểu chơi <small>${ML.length}</small></span><span class="lb-ver">Kiểm chứng</span>
          <span class="lb-hs p">Sàn thử <small>${pOn.length} bật</small>${pOn.length ? `<b class="${cls(pSum)}">${sg(pSum)}</b>` : ""}</span>
          <span class="lb-hs l">${LVT} <small>${lOn.length} bật${lvN ? ` · ${lvN} mở` : ""}</small>${C.lv_on ? "" : `<button type="button" class="lb-lockb" data-sctab="set">🔒 bật Binance</button>`}</span></div>
        ${GR.map(([t, L]) => `<div class="lb-gh"><span>${t}</span><small>${L.length}</small></div>${L.map(row).join("")}`).join("")}
      </div>
      <div class="lb-foot"><span>Gạt <b>🧪</b> để đánh tiền ảo · gạt <b>${LVI}</b> để đánh trên Binance (luôn hỏi xác nhận) · bấm tên để xem kết quả & chỉnh thông số</span>${QX ? `<span class="lb-cfg"><b>📐 Cỡ lệnh thật:</b><span class="bseg sc-seg">${[2, 3, 5, 10].map(szB).join("")}</span><b>tối đa</b><span class="bseg sc-seg">${[1, 2, 3].map(mxB).join("")}</span><small>/ kiểu</small></span>` : ""}</div>`;
    const drawer = `<div class="lb-dr" id="lbDr" hidden><div class="lb-dr-bg" data-lbclose></div><aside class="lb-dr-p" role="dialog" aria-modal="true" aria-label="Chi tiết phương pháp"><div class="lb-dr-h" aria-hidden="true"><i></i></div><button type="button" class="lb-dr-x" data-lbclose aria-label="Đóng">✕</button>${ML.filter((m) => !m.main).map((m) => `<div class="lb-dr-c" data-lbdr="${m.k}" hidden>${lmCard(m)}</div>`).join("")}</aside></div>`;
    // ---------- bảng lệnh (mọi phương pháp thử nghiệm)
    const lft = (t) => { const s = (Date.parse(t + "Z") - Date.now()) / 1000; return s <= 0 ? "sắp đóng" : s > 86400 ? `${Math.floor(s / 86400)} ngày ${Math.floor((s % 86400) / 3600)} giờ` : `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút`; };
    const lg = (L) => L.map((x) => `<span class="${x.side > 0 ? "up" : "down"}">${x.side > 0 ? "Long" : "Short"}</span> <b>${esc(x.sym.replace(/USDT$/, ""))}</b> ${px(x.e ?? x.ap)}${x.m ? ` → ${px(x.m)}` : ""}`).join("<br>");
    const OP = [...(QX ? QK.flatMap((k) => (QX[k]?.pos || []).map((p) => ({ ...p, k, q1: 1 }))) : []), ...(SWX ? ["list", "pump"].flatMap((k) => (SWX[k]?.pos || []).map((p) => ({ ...p, k, legs: [{ sym: p.sym, side: -1, e: p.e, m: p.m }], exp: p.t1 }))) : [])];
    const posT = OP.length ? `<div class="tw"><table class="rs sc-qpos keep"><thead><tr><th class="l">Kiểu chơi</th><th class="l">Lệnh</th><th>Lời/lỗ</th><th class="l">Vào lúc · đóng chậm nhất</th><th class="l">Lý do</th><th></th></tr></thead><tbody>${OP.map((p) => `<tr><td class="l">${MM[p.k]?.ico || ""} ${esc(MM[p.k]?.name || p.k)}</td><td class="l">${lg(p.legs)}${p.sl ? `<br><small class="faint">cắt ${px(p.sl)}</small>` : ""}${p.tp ? `<small class="faint"> · chốt ${px(p.tp)}</small>` : ""}</td>
        <td class="${cls(p.pct)}"><b>${sg(p.pct, 2)}%</b><br><small>${sg(p.upnl)} USDT</small></td><td class="l"><small>${dt(p.t0 + "Z")}<br>→ ${p.q1 ? dt(p.exp + "Z") : `còn ${lft(p.exp)}`}</small></td><td class="l"><small>${esc(p.why || "")}</small></td>
        <td>${p.q1 ? mxRow(`q:${p.k}:${p.id}`, `${MM[p.k]?.name} ${p.legs.map((x) => x.sym.replace(/USDT$/, "")).join("/")} (sàn thử)`, false, null) : mxRow(`sw:${p.k}:${p.id}`, `Short ${p.sym.replace(/USDT$/, "")} (thử nghiệm)`, false, { e: p.e, q: p.q, sd: -1, f0: p.fee || 0, fr: 0.15, fund: p.fund || 0, m: p.m, sl: 0, paper: 1, long: 1 })}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có lệnh đang mở trên sàn thử.</p>`;
    const lvT = lvOpen.length ? `<div class="tw"><table class="rs sc-qpos keep"><thead><tr><th class="l">Kiểu chơi</th><th class="l">Lệnh trên Binance</th><th>Lời/lỗ</th><th class="l">Vào lúc</th><th></th></tr></thead><tbody>${lvOpen.map((p) => `<tr><td class="l">${esc(p.name)}</td><td class="l">${lg(p.legs)}${p.legs.some((x) => x.stop) ? `<br><small class="faint">cắt lỗ trên sàn ${p.legs.map((x) => px(x.stop)).join(" / ")}</small>` : ""}</td>
        <td class="${cls(p.upnl)}"><b>${sg(p.upnl)}</b> USDT</td><td class="l"><small>${dt(p.t0 + "Z")}</small></td><td>${mxRow(`lq:${p.id}`, `${p.name} ${p.legs.map((x) => x.sym.replace(/USDT$/, "")).join("/")} (${C.lv_env === "live" ? "TIỀN THẬT" : "Demo"})`, true, null)}</td></tr>`).join("")}</tbody></table></div>` : "";
    const hwhy = { TIME: "hết giờ", SL: "cắt lỗ", TP: "chốt lời", X: "tín hiệu thoát", MANUAL: "đóng tay", OFF: "tắt phương pháp", EOD: "hết ngày", EOM: "hết tháng", NOPX: "mất giá", LIQ: "giá ×2 – mất trắng", DELIST: "ngừng giao dịch" };
    const HI = [...(QX ? QK.flatMap((k) => (QX[k]?.hist || []).map((h) => ({ ...h, k }))) : []), ...(SWX ? ["list", "pump"].flatMap((k) => (SWX[k]?.hist || []).map((h) => ({ ...h, k, legs: [{ sym: h.sym, side: -1, e: h.e, x: h.x }] }))) : [])].sort((a, b) => (a.t2 < b.t2 ? 1 : -1)).slice(0, 50);
    const histT = HI.length ? `<div class="tw" style="max-height:380px"><table class="rs keep"><thead><tr><th class="l">Kiểu chơi</th><th class="l">Lệnh</th><th>Lời/lỗ</th><th class="l">Vào → đóng</th><th class="l">Lý do đóng</th></tr></thead><tbody>${HI.map((h) => `<tr><td class="l">${MM[h.k]?.ico || ""} ${esc(MM[h.k]?.name || h.k)}</td><td class="l">${h.legs.map((x) => `<span class="${x.side > 0 ? "up" : "down"}">${x.side > 0 ? "L" : "S"}</span> ${esc(x.sym.replace(/USDT$/, ""))} ${px(x.e)} → ${px(x.x)}`).join("<br>")}</td>
        <td class="${cls(h.pct)}"><b>${sg(h.pct, 2)}%</b><br><small>${sg(h.net)} USDT</small></td><td class="l"><small>${dt(h.t0 + "Z")}<br>→ ${dt(h.t2 + "Z")}</small></td><td class="l"><small>${hwhy[h.why] || esc(h.why)}</small></td></tr>`).join("")}</tbody></table></div>` : "";
    if (TB === "ov") body = body.replace("<!--LB-->", ML.length ? `${panel(bi("Phương pháp", "Methods"), board, bi(`${pOn.length} sàn thử · ${lOn.length} ${LVT === "Demo" ? "Demo" : "tiền thật"}`, `${pOn.length} paper · ${lOn.length} live`))}${drawer}` : "");
    else body = !ML.length ? panel("🧪 Thử nghiệm", empty(`Chưa có dữ liệu – máy chủ riêng cần cập nhật bản mới (<code>sudo bash /opt/my-bit/scalper/install.sh</code>). Các phương pháp thử nghiệm chỉ chạy ở máy chủ riêng (cần dữ liệu Binance futures).`))
      : `<div class="lb-top">${ctx}
          ${oldSrv ? `<p class="lm-warn">⚠️ Máy chủ riêng đang chạy bản cũ – thông số và công tắc sàn thử của 🗓️ giữ nhiều ngày chỉ có tác dụng sau khi chạy <code>sudo bash /opt/my-bit/scalper/install.sh</code>.</p>` : ""}</div>
        ${board}${drawer}
        ${panel("📌 Lệnh đang mở – sàn thử", posT, `${OP.length} lệnh`)}${lvT ? panel(C.lv_env === "live" ? "💰 Lệnh đang mở – TIỀN THẬT" : "🟡 Lệnh đang mở – Binance Demo", lvT) : ""}${histT ? panel("🧾 Lệnh đã đóng – sàn thử", histT, `${HI.length} gần nhất`) : ""}`;
  }
  else if (TB === "learn") body = `${EN ? learnPanelEN : learnPanel}${panel("🧪 Kiểm nghiệm bằng lệnh ảo – chỉ đánh thật cái đã chứng minh có lời", shPanel(X.sh, C), X.sh ? `${nf(X.sh.open, 0)} lệnh ảo đang chạy` : "")}
      ${panel("🧪 Bộ học trực tuyến – học gộp theo nhóm thanh khoản", `${learn}${info(`<p>Mỗi giây, trên mọi thị trường, bot ghi tín hiệu rồi đo giá đi bao xa theo hướng tín hiệu sau 2 giây tới 15 phút – tính bằng <b>số lần dao động mỗi giây của chính coin đó</b>, nên coin lớn và coin nhỏ học chung được trong cùng nhóm thanh khoản. Kỳ vọng (bps) của một coin = số trong bảng × dao động của coin × √thời gian giữ, rồi co dần về số liệu riêng của coin khi coin có đủ mẫu. <b class="up">Ô xanh</b> = lợi thế rõ; ô mờ = chưa đủ số mẫu tối thiểu <b>${nf(C.min_n, 0)}</b>.</p>`)}
        <div class="sc-br"><p><b>🧠 Bộ nhớ học</b> – lưu lên MyBit khoảng 10 phút một lần, máy mới / cài lại không phải học lại từ đầu.</p>
        <p class="faint">${X.brain ? `Lần lưu gần nhất: <b>${dt(X.brain.at)}</b> · <b>${nf(X.brain.n, 0)}</b> mẫu · <b>${nf(X.brain.coins, 0)}</b> coin` : "Chưa lưu lần nào (lần đầu sau khoảng 1 phút chạy)."}</p>
        <div class="bsave"><button type="button" class="btn" id="scDl">⬇ Tải bộ nhớ học (JSON)</button><button type="button" class="btn" id="scWipe">🧹 Xoá bộ nhớ học</button></div></div>`, "tự học liên tục")}`;
  else if (TB === "ev") body = panel("📜 Sự kiện", `${feed(EVS, true)}<p class="faint sc-cap">${bi(`Gồm ${nf((X.log || []).length, 0)} sự kiện gần nhất của bot và ${nf((LV?.log || []).length, 0)} của tài khoản Binance. Kết quả từng ngày:`, `The bot's last ${nf((X.log || []).length, 0)} events and the Binance account's last ${nf((LV?.log || []).length, 0)}. Day-by-day results:`)} <a href="#/bot/days">📅 Kết quả theo ngày</a>.</p>`, bi(`${EVS.length} sự kiện`, `${EVS.length} events`));
  else if (TB === "set") body = `<div class="sc-setp" id="scForm"></div>`;
  if (window.__scMode === "acct") {      // 💵 TRANG BINANCE (#/bot/binance): số dư, ví, trạng thái tài khoản bot, kết nối khoá API trên trình duyệt (lệnh tay)
    // 11/2026: trang này = TIỀN (tài sản, ví, an toàn, khoá); hiệu quả & lệnh của bot nằm ở Bot Phản Xạ – không lặp lại thẻ lời/lỗ ở đây
    app().innerHTML = `<div class="ph"><h1>Tài khoản Binance</h1><span class="meta">${bi("Tài sản · ví · giới hạn an toàn · trạng thái khoá", "Assets · wallets · safety limits · key status")} · <a href="#/bot/scalp" data-scenvgo="1">${bi("Lời/lỗ & lệnh của bot → Bot Phản Xạ", "Bot P/L & trades → Reflex Bot")}</a></span></div>
      ${PG(bi("Tài khoản Binance", "Binance account"))}${lvOff ? lvOffP : ""}${walPanel || (lvOff ? "" : lvCards)}${lvRisk}${lvPanel || ""}<section class="panel" id="pvBx"></section>`;
    $$("[data-sctab-go]").forEach((a) => (a.onclick = () => { window.__scEnv = "live"; lsSet("scenv", "live"); window.__scTab = a.dataset.sctabGo; lsSet("sctab", a.dataset.sctabGo); }));
    $$("[data-scwal]").forEach((b) => (b.onclick = () => { window.__scWal = b.dataset.scwal; viewScalp(); }));
    $$("[data-scenvgo]").forEach((a) => (a.onclick = () => { window.__scEnv = "live"; lsSet("scenv", "live"); window.__scTab = "ov"; lsSet("sctab", "ov"); }));
    $$("[data-sctab]").forEach((b) => (b.onclick = () => { window.__scTab = scNormTab(b.dataset.sctab); lsSet("sctab", window.__scTab); location.hash = "#/bot/scalp"; }));
    if ($("#lvRes")) $("#lvRes").onclick = async () => { C.lv_resume_at = new Date().toISOString(); delete C.syms; await Store.put("scalp", C); toast("Tài khoản thật chạy lại trong ≤ 5 phút"); viewScalp(); };
    if (typeof bxPanel === "function") bxPanel();
    return;
  }
  app().innerHTML = `<div class="ph"><h1>Bot Phản Xạ</h1><span class="meta">Bắt râu sập · Lướt giây · <a href="#/bot/days">Kết quả & sổ lệnh →</a></span></div>
    ${hero}${tabBar}<div class="sc-body" data-tab="${TB}">${PG(TABS.find(([k]) => k === TOP)[1])}${envSeg}${subSeg}${body}</div>`;
  try { if (typeof CUR_TAB !== "undefined" && CUR_TAB && !$("#app .crumb[data-nd]")) navDecor(CUR_TAB); } catch (e) { /* bỏ qua */ }      // đường dẫn trang vẽ NGAY cùng nội dung – không chèn trễ làm cả trang nhảy xuống
  $$("[data-sctab]").forEach((b) => (b.onclick = () => { if (window.__scDirty && window.__scTab === "set" && !confirm("Thiết lập có thay đổi chưa lưu – bỏ thay đổi?")) return; window.__scDirty = false; if (b.dataset.scenv0) { window.__scEnv = b.dataset.scenv0; lsSet("scenv", b.dataset.scenv0); } scTabGo(b.dataset.sctab); }));
  $$("[data-scenv]").forEach((b) => (b.onclick = async () => {      // đổi sàn: giữ nguyên chỗ đang xem (không giật trang)
    if (window.__scEnv === b.dataset.scenv) return;
    window.__scEnv = b.dataset.scenv; lsSet("scenv", b.dataset.scenv); window.__scUseCache = true;
    const root = $("#app"), y0 = b.getBoundingClientRect().top; root.style.minHeight = root.offsetHeight + "px";
    await viewScalp();
    const b2 = $(`[data-scenv="${b.dataset.scenv}"]`); if (b2) scrollTo(0, Math.max(0, scrollY + b2.getBoundingClientRect().top - y0));
    setTimeout(() => { root.style.minHeight = ""; }, 400);
    try { cusDraw(); } catch (e) { /* bỏ qua */ } }));
  { const ap = () => { const ol = window.__scOl || "all"; $$("[data-ol]").forEach((d) => (d.hidden = ol !== "all" && d.dataset.ol !== ol)); }; ap();      // tab Lệnh (Binance): lọc Đang mở / Đã đóng / Hụt / So với sàn thử
    $$("[data-scol]").forEach((b) => (b.onclick = () => { window.__scOl = b.dataset.scol; $$("[data-scol]").forEach((x) => x.classList.toggle("on", x === b)); ap(); })); }
  { const ap = () => { const om = window.__scOm || "all"; $$("[data-om]").forEach((d) => (d.hidden = om !== "all" && d.dataset.om !== "open" && d.dataset.om !== om));
      const box = $('[data-om="open"]'); if (box) { let n = 0; $$("[data-omk]", box).forEach((c) => { const h = om !== "all" && c.dataset.omk !== om; c.hidden = h; if (!h) n++; }); let e = $(".sc-omnone", box); if (!n && $$("[data-omk]", box).length) { if (!e) { e = document.createElement("p"); e.className = "sc-empty sc-omnone"; e.textContent = bi("Không có lệnh đang mở của phương pháp này.", "No open trades for this method."); $(".sc-ocs", box)?.after(e); } e.hidden = false; } else if (e) e.hidden = true; } }; ap();      // tab Lệnh: lọc theo phương pháp
    $$("[data-scom]").forEach((b) => (b.onclick = () => { window.__scOm = b.dataset.scom; $$("[data-scom]").forEach((x) => x.classList.toggle("on", x === b)); ap(); })); }
  $$("[data-scwal]").forEach((b) => (b.onclick = () => { window.__scWal = b.dataset.scwal; viewScalp(); }));
  $$("[data-scpm]").forEach((b) => (b.onclick = () => { if (window.__scTab !== "pm") { scTabGo(b.dataset.scpm); return; } window.__scPm = b.dataset.scpm; lsSet("scpm", b.dataset.scpm); window.__scUseCache = true; viewScalp(); }));
  $$("[data-sclog]").forEach((b) => (b.onclick = () => { window.__scLog = b.dataset.sclog; lsSet("sclog", b.dataset.sclog); window.__scUseCache = true; viewScalp(); }));
  const evApply = () => { const c = window.__scEvF || "all", d = window.__scEvD || "all", sr = window.__scEvS || "all";
    $$(".sc-feed").forEach((ul) => { if (ul.dataset.f === "all" && !$(".sc-evf")) return; let hd = null, any = false; const fin = () => { if (hd) hd.hidden = !any; };
      for (const li of ul.children) { if (li.classList.contains("sc-fday")) { fin(); hd = li; any = false; continue; } if (!li.dataset.c) continue; li.hidden = (c !== "all" && li.dataset.c !== c) || (sr !== "all" && li.dataset.src !== sr) || (d !== "all" && li.dataset.d !== d); if (!li.hidden) any = true; } fin(); }); };
  $$("[data-scev]").forEach((b) => (b.onclick = () => { window.__scEvF = b.dataset.scev; $$("[data-scev]").forEach((x) => x.classList.toggle("on", x === b)); evApply(); }));
  $$("[data-scevs]").forEach((b) => (b.onclick = () => { window.__scEvS = b.dataset.scevs; $$("[data-scevs]").forEach((x) => x.classList.toggle("on", x === b)); evApply(); }));
  $$("[data-scevd]").forEach((b) => (b.onclick = () => { window.__scEvD = b.dataset.scevd; $$("[data-scevd]").forEach((x) => x.classList.toggle("on", x === b)); evApply(); }));
  if ($(".sc-evf")) evApply();
  $$("[data-hkc]").forEach((b) => (b.onclick = () => hkChartOpen(HT[+b.dataset.hkc], $("#hkc" + b.dataset.hkc))));
  $$("[data-lvc]").forEach((b) => (b.onclick = () => { const h = LHr[+b.dataset.lvc]; hkChartOpen({ k: lvk(h), t0: h.t1, t1: h.t2, e: h.e, x: h.x, usd: h.pnl, ts: h.ts, c0: h.c0, lvp: h.lvp, net: h.net, base: lvBase }, $("#lvc" + b.dataset.lvc)); }));
  rsTables($("#app"));
  { const tb = $(".sc-tabs"), on = tb?.querySelector("button.on"), x0 = window.__scTabX; window.__scTabX = null;      // tab đang chọn luôn nằm GIỮA thanh tab
    if (tb && on && tb.scrollWidth > tb.clientWidth + 2) {
      if (x0 != null) tb.scrollLeft = x0;
      const a = tb.getBoundingClientRect(), b = on.getBoundingClientRect(), to = Math.max(0, Math.min(tb.scrollWidth - tb.clientWidth, tb.scrollLeft + b.left + b.width / 2 - (a.left + a.width / 2)));
      if (Math.abs(to - tb.scrollLeft) > 1) tb.scrollTo({ left: to, behavior: x0 != null && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
    } }
  if (window.__scKeep != null) {      // đổi tab con: đặt lại cuộn NGAY sau khi vẽ (trước khi trình duyệt kịp hiện khung hình lệch) + thanh vị trí
    const k0 = window.__scKeep; window.__scKeep = null;
    if (typeof CUR_TAB !== "undefined" && CUR_TAB && $("#app .ph") && !$("#app .crumb[data-nd]")) navDecor(CUR_TAB);
    const bar = $(".sc-tabs"); if (bar) scrollTo(0, Math.max(0, scrollY + bar.getBoundingClientRect().top - k0));
  }
  // độ mới của số liệu (đếm từng giây, không vẽ lại trang)
  clearInterval(window.__scAgeT);
  window.__scAgeT = setInterval(() => { const el = $("#scAge"); if (!el) { clearInterval(window.__scAgeT); return; } const a = (Date.now() - Date.parse(el.dataset.at + "Z")) / 1000; el.textContent = `${LANG === "en" ? "data at" : "số liệu lúc"} ${hms(el.dataset.at)} · ${LANG === "en" ? `${Math.max(0, Math.round(a))}s ago` : `cách đây ${Math.max(0, Math.round(a))} giây`}`; el.className = a > 30 ? "warn" : "faint"; }, 1000);
  // ================================================================ (E) THIẾT LẬP: 3 mức có sẵn + cơ bản + nâng cao + tiền thật tách riêng
  const ORIG = { ...SCALP_DEF, ...scMig(rq.data) };
  const VR = { hk_r: [300, 500], hk_z: [4, 8], hk_v: [6, 10], hk_d1: [1, 2], hk_d2: [1.5, 2.5], hk_w: [6, 10], hk_h: [60, 120], hk_size: [1, 7.5], hk_max: [4, 10], hk_stop: [25, 35], hk_tra: [100, 300], hk_trg: [50, 150], hk_f6: [6, 12], hk_knife: [8, 15], hk_r15: [50, 150], hk_fund: [30, 100], hk_mk15: [250, 400], hk_mkS: [1, 3], daily_stop: [2, 5], day_target: [0, 3], lv_daily: [3, 10], lv_lev: [1, 3] };
  const PRE = {
    safe: { n: bi("🛡️ Thận trọng", "🛡️ Cautious"), d: bi("Chỉ cú sốc rất mạnh (≥ 4%), khối lượng ≥ 10×, chờ khớp 6 phút, mỗi lần 3% tài sản, tối đa 4 lần cùng lúc.", "Only very strong shocks (≥ 4%), volume ≥ 10×, 6-minute fill window, 3% of equity per catch, at most 4 at once."), bt: "+15%", dd: "−2,7%", wd: "−1,1%", v: { hk_r: 400, hk_v: 10, hk_w: 6, hk_size: 3, hk_max: 4, daily_stop: 2, lv_daily: 3 } },
    std: { n: bi("⭐ Chuẩn đã kiểm chứng", "⭐ Tested standard"), d: bi("Cấu hình vòng 5 (mặc định): sốc ≥ 3%, khối lượng ≥ 8×, chờ 8 phút, mỗi lần 5% tài sản, tối đa 6 lần.", "Round-5 settings (default): shock ≥ 3%, volume ≥ 8×, 8-minute fill window, 5% of equity per catch, at most 6 at once."), bt: "+51%", dd: "−8,8%", wd: "−4,3%", v: {} },
    bold: { n: bi("🔥 Mạnh tay", "🔥 Aggressive"), d: bi("Sốc ≥ 3%, khối lượng ≥ 6×, chờ 10 phút, mỗi lần 7,5% tài sản, tối đa 8 lần. Lời lớn hơn nhưng sụt cũng sâu hơn.", "Shock ≥ 3%, volume ≥ 6×, 10-minute fill window, 7.5% of equity per catch, at most 8 at once. Bigger gains, deeper drawdowns."), bt: "+80%", dd: "−12,6%", wd: "−6,5%", v: { hk_r: 300, hk_v: 6, hk_w: 10, hk_size: 7.5, hk_max: 8, daily_stop: 5, lv_daily: 10 } } };
  PRE.std.v = Object.fromEntries(Object.keys(PRE.safe.v).map((k) => [k, SCALP_DEF[k]]));
  const curPre = () => Object.keys(PRE).find((p) => Object.entries(PRE[p].v).every(([k, v]) => +C[k] === +v)) || null;
  const sl = (k, t, mn, mx, stp, help, unit = "") => {
    const v = +C[k], d = SCALP_DEF[k], r = VR[k], out = r && (v < r[0] || v > r[1]), pc = (q) => ((Math.max(mn, Math.min(mx, q)) - mn) / (mx - mn) * 100).toFixed(1);
    return `<div class="sc-sl ${out ? "out" : ""}" data-k="${k}"><div class="sc-sl1"><label for="sc_${k}">${t}</label><span class="sc-nv"><input id="sc_${k}" class="sc-num" inputmode="decimal" value="${v}">${unit ? `<small>${unit}</small>` : ""}</span></div>
      <div class="sc-trk"${r ? ` style="--a:${pc(r[0])}%;--b:${pc(r[1])}%"` : ""}><input type="range" min="${mn}" max="${mx}" step="${stp}" value="${Math.max(mn, Math.min(mx, v))}" data-for="${k}" aria-label="${esc(t)}"><i class="sc-def" style="left:${pc(d)}%" title="${bi("mức chuẩn", "default")} ${d}"></i></div>
      <small class="sc-h">${help} <span class="faint">· ${bi("chuẩn", "default")} <b>${d}${unit}</b>${r ? ` · ${bi("đã kiểm chứng", "tested")} ${r[0]}–${r[1]}${unit}` : ""}</span></small><small class="sc-w">⚠️ Ngoài vùng đã kiểm chứng – kết quả quá khứ không áp dụng cho mức này.</small></div>`;
  };
  const f = () => {
    const box = $("#scForm"); if (!box) return;
    const num = (k, t) => `<div class="field"><label for="sc_${k}">${t}</label><input id="sc_${k}" inputmode="decimal" value="${C[k]}"></div>`;
    const cp = curPre(), LVL = C.lv_env === "live";
    const QON = ["ou", "rsi2", "fund", "orb", "vwap", "liq"].filter((k) => C["lq_" + k]).length, hkOn = C.hk_on !== false;
    const adv = (k, title, inner) => `<details class="sc-adv sc-sub" data-adv="${k}" ${window.__scAdvO?.[k] ? "open" : ""}><summary>${title} <small class="faint">(nâng cao)</small></summary>${inner}</details>`;
    const SECS = [["sum", "Tóm tắt"], ["paper", "🧪 Sàn thử"], ["hook", "🪝 Bắt râu sập"], ["sec", "⚡ Lướt giây"], ["live", "💵 Binance"], ["sys", "🖥️ Máy chủ"]];
    const chip = (sec, ic, t, v, cl = "") => `<a href="#scs-${sec}" class="sc-schip ${cl}" data-scjump="${sec}"><span>${ic} ${t}</span><b>${v}</b></a>`;
    // ---- khối dựng giao diện: mỗi thiết lập = 1 dòng (tên + mô tả ngắn bên trái, điều khiển bên phải); giải thích dài nằm trong ⓘ cuối nhóm
    const row = (label, desc, ctrl, cls = "") => `<div class="sc-row ${cls}"><div class="sc-rl"><b>${label}</b>${desc ? `<small>${desc}</small>` : ""}</div><div class="sc-rc">${ctrl}</div></div>`;
    const sw = (attr, on) => `<button type="button" class="sc-sw${on ? " on" : ""}" ${attr} role="switch" aria-checked="${on}"><i></i><span>${on ? "Bật" : "Tắt"}</span></button>`;
    const seg = (attr, cur, items) => `<div class="bseg sc-seg">${items.map(([v, t]) => `<button type="button" ${attr}="${v}" class="${cur === v ? "on" : ""}">${t}</button>`).join("")}</div>`;
    const nin = (k, unit = "") => `<span class="sc-nin field"><input id="sc_${k}" inputmode="decimal" value="${C[k]}">${unit ? `<small>${unit}</small>` : ""}</span>`;
    const nr = (k, label, desc, unit) => row(label, desc, nin(k, unit));
    const grp = (title, inner, cls = "") => `<div class="sc-grp ${cls}">${title ? `<h4 class="sc-gt">${title}</h4>` : ""}<div class="sc-rows">${inner}</div></div>`;
    const sec = (id, title, meta, inner, cls = "") => `<section class="panel sc-sec ${cls}" id="scs-${id}"><div class="ph"><h2>${title}</h2>${meta ? `<span class="meta">${meta}</span>` : ""}</div>${inner}</section>`;
    box.innerHTML = `<nav class="sc-snav" aria-label="Các mục thiết lập">${SECS.map(([k, t]) => `<a href="#scs-${k}" data-scjump="${k}">${t}</a>`).join("")}</nav>
      <div class="sc-sbody">
      ${sec("sum", "Đang chạy thế nào", "bấm một ô để tới mục đó", `<div class="sc-schips">${chip("hook", "🪝", "Bắt râu sập", hkOn ? `bật · ${nf(C.hk_size, 1)}%/lần · tối đa ${C.hk_max}` : "đang tắt", hkOn ? "ok" : "off")}${chip("paper", "🧪", "Sàn thử", `${usd(C.capital)} · dừng khi lỗ ${nf(C.daily_stop, 1)}%/ngày`)}${chip("sec", "⚡", "Lướt giây", C.sec_on === false ? "đang tắt" : +C.day_target ? `mục tiêu ${nf(C.day_target, 1)}%/ngày` : "không đặt mục tiêu ngày", C.sec_on === false ? "off" : "")}
          ${chip("live", "💵", "Binance", !C.lv_on ? "đang tắt" : LVL ? "TIỀN THẬT" : "Demo", !C.lv_on ? "off" : LVL ? "live" : "ok")}${chip("live", "🚀", "Short bơm (tiền thật)", C.sw_lv_pump ? "bật" : "tắt", C.sw_lv_pump ? "live" : "off")}${chip("live", "📐", "Định lượng (tiền thật)", QON ? `${QON}/6 phương pháp` : "tắt hết", QON ? "live" : "off")}${chip("sys", "🖥️", "Chạy ở", C.where === "vps" ? "máy chủ riêng" : "Cloudflare")}</div>`)}

      ${sec("paper", "🧪 Sàn thử", "tiền ảo, giá & khớp lệnh thật", grp("", `${nr("capital", "Vốn sàn thử", "tài sản ảo khi làm lại tài khoản sàn thử", "USDT")}${sl("daily_stop", "Dừng khi lỗ trong ngày", 0.5, 10, 0.5, "mọi phương pháp ngừng mở lệnh mới tới hết ngày", "%")}`))}

      ${sec("hook", "🪝 Bắt râu sập", `${bi("mức: ", "preset: ")}${cp ? PRE[cp].n : bi("tuỳ chỉnh", "custom")}`, `${grp("", row("Bắt râu sập", "phương pháp chính – chờ lệnh ở râu nến sập/vọt", sw('data-sch="1"', hkOn)))}
        ${grp("Chọn nhanh một mức", `<div class="sc-pres">${Object.entries(PRE).map(([k, p]) => `<button type="button" class="sc-pre ${cp === k ? "on" : ""}" data-scp="${k}"><b>${p.n}</b><span>${p.d}</span><span class="sc-pbt"><i>${bi("22 tháng", "22 months")} <b class="up">${p.bt}</b></i><i>${bi("sụt tối đa", "max drawdown")} <b class="down">${EN ? p.dd.replace(",", ".") : p.dd}</b></i><i>${bi("ngày tệ nhất", "worst day")} <b class="down">${EN ? p.wd.replace(",", ".") : p.wd}</b></i></span></button>`).join("")}</div>`)}
        ${grp("Ngày vắng", `${row("Chưa khớp thì bắt gần hơn", C.hk_ad ? `từ ${C.hk_adH ?? 12}h chưa khớp lệnh nào → chờ ${C.hk_adD1 ?? 0.75}× / ${C.hk_adD2 ?? 1}× tới hết ngày` : "đang tắt – luôn chờ ở 2 mức bên dưới", sw('data-scad="1"', !!C.hk_ad))}${C.hk_ad ? `${sl("hk_adH", "Từ giờ", 0, 23, 1, "giờ Việt Nam, hôm đó chưa khớp lần nào", "h")}${sl("hk_adD1", "Lệnh chờ 1 (ngày vắng)", 0, 4, 0.05, "× độ lớn cú sốc", "×")}${sl("hk_adD2", "Lệnh chờ 2 (ngày vắng)", 0, 4, 0.05, "0 = chỉ 1 lệnh", "×")}` : ""}`)}
        ${grp("Cỡ lệnh", `${sl("hk_size", "Mỗi lần bắt dùng", 0.5, 15, 0.5, "phần tài sản cho 1 cú sốc, chia đều 2 mức chờ", "%")}${sl("hk_max", "Tối đa số lần bắt cùng lúc", 1, 20, 1, "nhiều coin cùng sập thì chỉ bắt chừng này")}`)}
        ${grp("Thoát lệnh", `${sl("hk_h", "Giữ sau khi khớp", 5, 240, 5, "hết giờ thì đóng", " phút")}${sl("hk_tra", "Cắt lỗ đuổi – bắt đầu khi lời", 0, 1000, 25, "0 = tắt, giữ đủ giờ", " bps")}${sl("hk_trg", "Cắt lỗ đuổi – đóng khi trả lại", 25, 500, 25, "tính từ đỉnh lời", " bps")}${sl("hk_stop", "Cắt lỗ thảm hoạ", 0, 60, 5, "từ giá vào; 0 = không cắt", "%")}`)}
        ${adv("hk_in", "Điều kiện cú sốc & điểm vào", grp("", `${sl("hk_r", "Cú sốc tối thiểu trong 1 phút", 100, 1000, 25, "giá rơi/vọt trong 1 phút", " bps")}${sl("hk_z", "… mạnh hơn dao động thường", 2, 15, 0.5, "≥ z lần dao động 60 phút", "×")}${sl("hk_v", "… và khối lượng", 1, 30, 1, "≥ × trung vị 60 phút", "×")}${sl("hk_d1", "Lệnh chờ 1 sâu thêm", 0, 4, 0.1, "× độ lớn cú sốc", "×")}${sl("hk_d2", "Lệnh chờ 2 sâu thêm", 0, 4, 0.1, "0 = chỉ 1 lệnh", "×")}${sl("hk_w", "Chờ khớp tối đa", 1, 30, 1, "khớp muộn thường là dao rơi", " phút")}${sl("hk_mk15", "Mua ngay nếu 15 phút trước đã giảm ≥", 100, 1000, 25, "tháo chạy → bật lại nhanh", " bps")}${sl("hk_mkS", "… mua ngay bằng", 0, 10, 0.5, "lệnh thị trường; 0 = tắt", "%")}`))}
        ${adv("hk_flt", "Bộ lọc bỏ qua cú sốc xấu", grp("", `${sl("hk_f6", "Bỏ coin đã có cú sốc khác trong", 0, 48, 1, "đang bơm/xả liên tục; 0 = tắt", " giờ")}${sl("hk_knife", "Bỏ \"dao rơi\": 4 giờ đã đi ngược >", 0, 40, 1, "0 = tắt", "%")}${sl("hk_r15", "Bỏ \"xả sau bơm\" (Short): 15 phút đã chạy cùng hướng >", 0, 500, 10, "0 = tắt; Long không lọc", " bps")}${sl("hk_fund", "Bỏ khi phải trả funding ≥", 0, 300, 10, "trong lúc chờ + giữ; 0 = tắt", " bps")}`))}
        ${info(`<p>3 mức chọn nhanh: kiểm chứng trên ~900 hợp đồng futures Binance 01/2025 – 10/2026, có tính giới hạn số lần bắt cùng lúc, phí, trượt giá. Chọn một mức chỉ đổi điều kiện cú sốc, cỡ lệnh, số lần cùng lúc và mức dừng lỗ ngày – các ô khác giữ nguyên.</p><p>Cắt lỗ đuổi: kiểm chứng tốt nhất bắt đầu ở 150 bps, đóng khi trả lại 100 bps. Cắt lỗ thảm hoạ chặt hơn 35% làm giảm lời. Mua ngay khi đã tháo chạy 15 phút: TB +119 bps/lệnh (vòng 8). Bộ lọc "xả sau bơm" chỉ áp cho Short vì với Long nó chặn nhầm lệnh lời. Kết quả quá khứ không bảo đảm tương lai.</p>`)}`)}

      ${sec("sec", "⚡ Lướt giây", "chỉ sàn thử", `${grp("", `${row("Lướt giây", C.sec_on !== false ? "đang chạy trên sàn thử" : "đang tắt – máy chủ chỉ nhận giá khớp, nhẹ hơn, tập trung Bắt râu sập", sw('data-scsec="1"', C.sec_on !== false))}${sl("day_target", "Mục tiêu lời mỗi ngày", 0, 10, 0.5, "0 = tắt; Bắt râu sập không dừng", "%")}${row("Đạt mục tiêu thì nghỉ", "ngừng mở lệnh lướt giây tới hết ngày", sw('data-scl="1"', C.day_lock !== false))}`)}
        ${adv("sec", "Cách vào lệnh, phí, kỷ luật, cú sốc BTC", `${grp("Cách vào lệnh & phí", `${row("Kiểu lệnh", "", seg("data-scm", C.mode, [["auto", "Tự chọn"], ["taker", "Taker"], ["maker", "Maker"]]))}${nr("fee_m", "Phí maker futures", "", "%")}${nr("fee_t", "Phí taker futures", "", "%")}${nr("fee_ms", "Phí maker spot", "", "%")}${nr("fee_ts", "Phí taker spot", "", "%")}`)}
          ${grp("Kỷ luật vào lệnh", `${nr("min_net", "Lời ròng tối thiểu sau phí", "", "bps")}${nr("k", "Kỳ vọng ≥ k × chi phí", "", "×")}${nr("min_n", "Số mẫu tối thiểu mỗi ô", "", "")}${nr("warm", "Học tối thiểu trước khi vào lệnh", "", "phút")}${nr("sh_min", "Số đợt 10 phút tối thiểu", "để tin một loại tình huống", "")}${nr("hmax", "Giữ tối đa", "≤ 1800", "giây")}${nr("cool", "Nghỉ sau khi đóng cùng coin", "", "giây")}${nr("risk", "Rủi ro mỗi lệnh", "", "%")}${nr("lev", "Đòn bẩy tối đa", "futures", "×")}${nr("max_pos", "Số vị thế mở tối đa", "", "")}${nr("max_h", "Tối đa lệnh mỗi giờ", "", "")}${nr("max_side", "Rủi ro tương quan tối đa", "số lệnh cùng chiều tương đương", "")}${nr("burst", "Tối đa lệnh mới trong 5 phút", "", "")}${nr("spread_max", "Bỏ qua khi chênh lệch >", "", "bps")}`, "c2")}
          ${grp("Cú sốc BTC ngược chiều lệnh đang giữ", `${row("Khi có cú sốc", "", seg("data-scb", C.bx_mode || "auto", [["auto", "Tự quyết"], ["on", "Thoát ngay"], ["off", "Không thoát"]]))}${nr("bx_z", "Cú sốc ≥ z lần dao động 1 phút", "", "×")}${nr("bx_r", "… và ≥ trong 60 giây", "", "bps")}${nr("bx_min", "Số cú sốc tối thiểu để tự áp dụng", "", "")}`)}`)}`)}

      ${sec("live", "💵 Tài khoản Binance", !C.lv_on ? "đang tắt" : LVL ? "TIỀN THẬT" : "Demo – tiền ảo, giá thật", `${grp("", `${row("Đặt lệnh trên Binance", "bot đặt lệnh 🪝 Bắt râu sập trên tài khoản của anh", sw('data-scv="1"', !!C.lv_on))}${row("Môi trường", LVL ? "<span class=\"down\">đang dùng tiền thật</span>" : "tiền ảo, giá thật", seg("data-sce", C.lv_env || "demo", [["demo", "Demo"], ["live", "Tiền thật"]]))}`)}
        ${grp("Vốn & giới hạn rủi ro", `${row("Cỡ lệnh tính theo", C.lv_all ? "toàn bộ số dư futures – lời thì lệnh tự lớn, lỗ thì tự nhỏ" : "tối đa bằng ô Vốn tối đa bên dưới", seg("data-sca", C.lv_all ? "1" : "0", [["0", "Vốn tối đa"], ["1", "Toàn bộ số dư"]]))}${row("Vốn tối đa", C.lv_all ? "không dùng khi chọn toàn bộ số dư" : "USDT ký quỹ bot được dùng", nin("lv_cap", "USDT"), C.lv_all ? "dim" : "")}${sl("lv_lev", "Đòn bẩy", 1, 5, 1, "ký quỹ cô lập", "×")}${sl("lv_daily", "Ngừng mở mới khi lỗ trong ngày", 1, 30, 1, "% vốn", "%")}${row("Khi vốn quá nhỏ", `chỉ đặt được 1 mức chờ${LV?.size?.mode && LV.size.mode !== "pct" ? ` – <b>đang áp dụng (${LV.size.mode === "min1" ? "1" : LV.size.mode === "min2" ? "2" : "3"} mức/lần)</b>` : ""}`, seg("data-scn", C.lv_small || "near", [["near", "Mức gần"], ["far", "Mức xa"]]))}`)}
        ${grp("Phương pháp khác trên tài khoản này", `${row("🚀 Short coin vừa bơm ≥ 100%", "00:00 UTC, Short x1, giữ 7 ngày, không cắt lỗ", sw('data-scsw="1"', !!C.sw_lv_pump))}${C.sw_lv_pump ? `${sl("sw_lv_sz", "… cỡ mỗi lệnh", 1, 25, 1, "% vốn, tối thiểu ~5,5 USDT", "%")}${sl("sw_lv_max", "… số lệnh giữ cùng lúc", 1, 5, 1, "", "")}` : ""}${row("📐 6 phương pháp định lượng", QON ? `đang bật ${QON}/6 · ${C.lq_sz}%/lệnh · tối đa ${C.lq_max} lệnh mỗi phương pháp` : "chưa bật phương pháp nào", `<button type="button" class="btn sm" data-sctab-q="1">Mở công tắc →</button>`)}`)}
        ${info(`<p><b>Toàn bộ số dư:</b> mỗi lần bắt ≤ 25% số dư, tổng lệnh mở ≤ 1× số dư, ngừng khi lỗ ngày ${C.lv_daily}% số dư.</p><p><b>Vốn nhỏ</b> (dưới ~44 USDT, sàn bắt mỗi lệnh ≥ ~5,5 USDT): mức gần 1,25× ~+108 bps/lệnh, khớp nhiều hơn; mức xa 1,5× ~+145 bps/lệnh nhưng nhiều lần giá không tới. Tổng lời 2 cách gần bằng nhau.</p><p><b>Short coin vừa bơm:</b> coin futures tăng ≥ 100%/24 giờ, khối lượng ≥ 10 triệu USD → Short lệnh thị trường, ký quỹ cô lập x1, giữ 7 ngày, không cắt lỗ (giá ×2 thì mất đúng phần tiền lệnh đó). Kiểm chứng 01/2022–10/2026: 111 lệnh, thắng 74%, TB +15%/lệnh; cắt lỗ +15%/+30% làm phương pháp lỗ. Mỗi lệnh ≤ 25% vốn, tổng ≤ 60% vốn.</p><p><b>Khoá API</b> không nhập ở đây – chỉ nằm trên máy chủ riêng (<code>sudo bash /opt/my-bit/scalper/install.sh --binance</code>). Khoá riêng cho bot: chỉ bật Futures, TẮT rút tiền, giới hạn IP. Mỗi lần bắt có cắt lỗ trên sàn ${nf(C.hk_stop, 0)}% và tự đóng sau ${nf(C.hk_h, 0)} phút.${LVL ? " <b>Đang ở chế độ tiền thật: thay đổi làm tăng rủi ro phải xác nhận khi lưu.</b>" : ""}</p>`)}`, `sc-real ${LVL ? "live" : ""}`)}

      ${sec("sys", "🖥️ Máy chủ & phạm vi quét", "", `${grp("", `${row("Nơi chạy bot", C.where === "vps" ? "Binance trực tiếp, không giới hạn" : "miễn phí, ~2 triệu tin nhắn/ngày (hết sau ~nửa giờ quét toàn thị trường)", seg("data-scw", C.where === "vps" ? "vps" : "cf", [["cf", "Cloudflare"], ["vps", "Máy chủ riêng"]]))}${C.where === "vps" ? row("Khoá máy chủ riêng", KEYH ? `đã có khoá từ ${dt(KEYH.at)} – tạo mới thì khoá cũ hết hiệu lực` : "chưa có khoá – khoá chỉ hiện 1 lần, dán vào tệp .env trên máy chủ", `<button type="button" class="btn sm" id="scKey">🔑 ${KEYH ? "Tạo khoá mới" : "Tạo khoá"}</button>`) + '<div id="scKeyOut"></div>' : ""}`)}
        ${grp("Phạm vi quét", `${row("Thị trường", "chọn ít nhất 1", `<div class="bseg sc-seg">${[["fut", "Futures"], ["spot", "Spot"]].map(([k, t]) => `<button type="button" data-sct="${k}" class="${C[k] ? "on" : ""}">${C[k] ? "✓ " : ""}${t}</button>`).join("")}</div>`)}${nr("min_vol", "Khối lượng 24h tối thiểu", "", "triệu USD")}${nr("max_mk", "Số thị trường tối đa", "", "")}`)}
        ${C.where === "vps" ? `<p class="faint sc-foot">Hướng dẫn cài máy chủ: <a href="https://github.com/havudinhkhanh/bot-status/blob/main/my-bit/SETUP.md" target="_blank" rel="noopener">tài liệu nội bộ (riêng tư)</a></p>` : ""}`)}
      <div class="sc-savebar"><span id="scDirtyMsg" class="faint">${window.__scDirty ? "● Có thay đổi chưa lưu" : "Chưa có thay đổi"}</span><button type="button" class="btn" id="scStd">↺ Khôi phục chuẩn</button><button class="btn primary" id="scSave">💾 Lưu</button></div></div>`;
    const dirty = () => { window.__scDirty = true; const m = $("#scDirtyMsg"); if (m) { m.textContent = "● Có thay đổi chưa lưu"; m.className = "warn"; } };
    const chk = (k) => { const w = box.querySelector(`.sc-sl[data-k="${k}"]`), r = VR[k], v = numIn($("#sc_" + k).value); if (w && r) w.classList.toggle("out", isFinite(v) && (v < r[0] || v > r[1])); };
    $$("#scForm input[type=range]").forEach((r) => (r.oninput = () => { $("#sc_" + r.dataset.for).value = r.value; chk(r.dataset.for); dirty(); }));
    $$("#scForm .sc-num").forEach((n) => (n.oninput = () => { const k = n.id.slice(3), r = box.querySelector(`input[type=range][data-for="${k}"]`), v = numIn(n.value); if (r && isFinite(v)) r.value = v; chk(k); dirty(); }));
    $$("#scForm details.sc-adv").forEach((d) => (d.ontoggle = () => { (window.__scAdvO ||= {})[d.dataset.adv] = d.open; }));
    $$("#scForm [data-scjump]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const el = $("#scs-" + a.dataset.scjump); if (!el) return; const top = el.getBoundingClientRect().top + scrollY - ((($(".sc-tabs")?.getBoundingClientRect().bottom) || 70) + 10); scrollTo({ top, behavior: "smooth" }); }));
    $$("#scForm [data-sctab-q]").forEach((b) => (b.onclick = () => { if (window.__scDirty && !confirm("Thiết lập có thay đổi chưa lưu – bỏ thay đổi?")) return; window.__scDirty = false; scTabGo("q"); }));
    // mục lục bên trái: tô mục đang xem
    try { const io = new IntersectionObserver((es) => { for (const en of es) if (en.isIntersecting) $$("#scForm .sc-snav a").forEach((a) => a.classList.toggle("on", "scs-" + a.dataset.scjump === en.target.id)); }, { rootMargin: "-40% 0px -55% 0px" }); $$("#scForm .sc-sbody > section[id]").forEach((s) => io.observe(s)); } catch (e) { /* bỏ qua */ }
    $$("#scForm [data-scp]").forEach((b) => (b.onclick = () => { rd(); Object.assign(C, PRE[b.dataset.scp].v); dirty(); f(); toast(bi(`Đã chọn ${PRE[b.dataset.scp].n} – bấm 💾 Lưu để áp dụng`, `${PRE[b.dataset.scp].n} selected – press 💾 Save to apply`)); }));
    $("#scStd").onclick = () => { rd(); for (const k of Object.keys(SCALP_DEF)) if (/^hk_/.test(k) || ["daily_stop", "day_target"].includes(k)) C[k] = SCALP_DEF[k]; dirty(); f(); toast("Đã đưa Bắt râu sập & giới hạn ngày về mức chuẩn – bấm 💾 Lưu"); };
    $$("#scForm [data-scl]").forEach((b) => (b.onclick = () => { rd(); C.day_lock = C.day_lock === false; dirty(); f(); }));
    $$("#scForm [data-scb]").forEach((b) => (b.onclick = () => { rd(); C.bx_mode = b.dataset.scb; dirty(); f(); }));
    $$("#scForm [data-scv]").forEach((b) => (b.onclick = () => { rd(); C.lv_on = !C.lv_on; dirty(); f(); }));
    $$("#scForm [data-scsec]").forEach((b) => (b.onclick = () => { rd(); C.sec_on = C.sec_on === false; dirty(); f(); }));
    $$("#scForm [data-scsw]").forEach((b) => (b.onclick = () => {
      rd();
      if (!C.sw_lv_pump && !confirm(`Bật 🧪 Short coin vừa bơm trên Binance ${LVL ? "TIỀN THẬT" : "Demo"}?\n\nKhi có coin tăng ≥ 100%/24h lúc 7:00 sáng, bot Short ${C.sw_lv_sz}% vốn mỗi lệnh (tối thiểu ~5,5 USDT), x1, giữ 7 ngày, KHÔNG cắt lỗ, tối đa ${C.sw_lv_max} lệnh cùng lúc.\nGiá tăng gấp đôi → mất trắng phần tiền của lệnh đó.`)) return;
      C.sw_lv_pump = !C.sw_lv_pump; dirty(); f();
    }));
    $$("#scForm [data-sca]").forEach((b) => (b.onclick = () => { rd(); C.lv_all = b.dataset.sca === "1"; dirty(); f(); }));
    $$("#scForm [data-scn]").forEach((b) => (b.onclick = () => { rd(); C.lv_small = b.dataset.scn; dirty(); f(); }));
    $$("#scForm [data-sce]").forEach((b) => (b.onclick = () => {
      rd();
      if (b.dataset.sce === "live" && C.lv_env !== "live") {
        const t = prompt(`Chuyển sang TIỀN THẬT trên Binance?\n\nBot sẽ tự đặt lệnh thật cho phương pháp Bắt râu sập, ${C.lv_all ? "dùng toàn bộ số dư ví futures" : `dùng tối đa ${C.lv_cap} USDT ký quỹ`}, đòn bẩy x${C.lv_lev}, ngừng khi lỗ ${C.lv_daily}% trong ngày. Kết quả quá khứ không bảo đảm tương lai; có thể mất tiền.\n\nGõ TIEN THAT để xác nhận:`);
        if ((t || "").trim().toUpperCase() !== "TIEN THAT") { toast("Chưa chuyển – giữ Demo"); return; }
        C.lv_live_ok = new Date().toISOString();
      }
      if (b.dataset.sce === "demo") delete C.lv_live_ok;
      C.lv_env = b.dataset.sce; dirty(); f();
    }));
    $$("#scForm [data-scad]").forEach((b) => (b.onclick = () => { rd(); C.hk_ad = !C.hk_ad; dirty(); f(); }));
    $$("#scForm [data-sch]").forEach((b) => (b.onclick = () => { rd(); C.hk_on = C.hk_on === false; dirty(); f(); }));
    $$("#scForm [data-scm]").forEach((b) => (b.onclick = () => { rd(); C.mode = b.dataset.scm; dirty(); f(); }));
    $$("#scForm [data-scw]").forEach((b) => (b.onclick = async () => {      // chọn nơi chạy = lưu ngay
      rd(); C.where = b.dataset.scw; delete C.syms;
      if (await Store.put("scalp", C)) toast(C.where === "vps" ? "Đã chọn chạy ở máy chủ riêng – bot trên Cloudflare dừng trong ≤ 1 phút" : "Đã chọn chạy ở Cloudflare");
      f();
    }));
    $$("#scForm [data-sct]").forEach((b) => (b.onclick = () => { rd(); C[b.dataset.sct] = !C[b.dataset.sct]; if (!C.fut && !C.spot) C[b.dataset.sct] = true; dirty(); f(); }));
    $$("#scForm .field input").forEach((n) => (n.oninput = dirty));
    if ($("#scKey")) $("#scKey").onclick = async () => {
      if (KEYH && !confirm("Tạo khoá mới? Máy chủ riêng đang dùng khoá cũ sẽ bị ngắt cho tới khi anh dán khoá mới.")) return;
      const k = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k)))].map((x) => x.toString(16).padStart(2, "0")).join("");
      await Store.put("scalpkey", { h, at: new Date().toISOString() });
      $("#scKeyOut").innerHTML = `<div class="sc-kv"><p><b>Khoá (chỉ hiện lần này):</b></p><code id="scKv" data-noi18n>MYBIT_SCALP_KEY=${k}</code><button type="button" class="btn" id="scCopy">📋 Chép</button><p class="faint">Dán nguyên dòng trên vào tệp <code>.env</code> trên máy chủ riêng.</p></div>`;
      $("#scCopy").onclick = () => navigator.clipboard?.writeText($("#scKv").textContent).then(() => toast("Đã chép khoá"));
    };
    $("#scSave").onclick = async () => {
      rd(); delete C.syms;
      // tiền thật: thay đổi làm TĂNG rủi ro phải xác nhận rõ
      if (C.lv_env === "live") {
        const ch = [];
        if (C.lv_on && !ORIG.lv_on) ch.push("BẬT đặt lệnh trên tài khoản thật");
        if (+C.lv_cap > +ORIG.lv_cap && !C.lv_all) ch.push(`vốn tối đa ${ORIG.lv_cap} → ${C.lv_cap} USDT`);
        if (C.lv_all && !ORIG.lv_all) ch.push("dùng TOÀN BỘ số dư ví futures (không giới hạn theo Vốn tối đa)");
        if (+C.lv_lev > +ORIG.lv_lev) ch.push(`đòn bẩy x${ORIG.lv_lev} → x${C.lv_lev}`);
        if (C.sw_lv_pump && !ORIG.sw_lv_pump) ch.push(`BẬT 🧪 Short coin vừa bơm (${C.sw_lv_sz}% vốn/lệnh, tối đa ${C.sw_lv_max} lệnh, x1, không cắt lỗ)`);
        if (C.sw_lv_pump && (+C.sw_lv_sz > +ORIG.sw_lv_sz || +C.sw_lv_max > +ORIG.sw_lv_max)) ch.push(`Short coin vừa bơm: ${ORIG.sw_lv_sz}% → ${C.sw_lv_sz}% vốn/lệnh, tối đa ${ORIG.sw_lv_max} → ${C.sw_lv_max} lệnh`);
        if (+C.lv_daily > +ORIG.lv_daily) ch.push(`ngừng khi lỗ ngày ${ORIG.lv_daily}% → ${C.lv_daily}%`);
        if (+C.hk_size > +ORIG.hk_size) ch.push(`mỗi lần bắt ${ORIG.hk_size}% → ${C.hk_size}%`);
        if (+C.hk_max > +ORIG.hk_max) ch.push(`số lần bắt cùng lúc ${ORIG.hk_max} → ${C.hk_max}`);
        if (+C.hk_stop > +ORIG.hk_stop || (!+C.hk_stop && +ORIG.hk_stop)) ch.push(`cắt lỗ thảm hoạ ${ORIG.hk_stop}% → ${+C.hk_stop ? C.hk_stop + "%" : "TẮT"}`);
        if (ch.length && !confirm(`Thay đổi trên tài khoản TIỀN THẬT:\n\n• ${ch.join("\n• ")}\n\nLưu và áp dụng?`)) { toast("Chưa lưu"); return; }
      }
      if (await Store.put("scalp", C)) { window.__scDirty = false; toast("Đã lưu – bot đọc thiết lập mới trong ≤ 30 giây"); viewScalp(); }
    };
  };
  const rd = () => { ["capital", "min_vol", "max_mk", "fee_m", "fee_t", "fee_ms", "fee_ts", "min_net", "k", "min_n", "warm", "sh_min", "hmax", "cool", "risk", "lev", "max_pos", "daily_stop", "day_target", "max_h", "spread_max", "max_side", "burst", "bx_z", "bx_r", "bx_min", "hk_r", "hk_z", "hk_v", "hk_d1", "hk_d2", "hk_adH", "hk_adD1", "hk_adD2", "hk_w", "hk_h", "hk_size", "hk_stop", "hk_tra", "hk_trg", "hk_max", "hk_f6", "hk_knife", "hk_r15", "hk_fund", "hk_mk15", "hk_mkS", "lv_cap", "lv_lev", "lv_daily", "sw_lv_sz", "sw_lv_max"].forEach((k) => { const el = $("#sc_" + k); if (!el) return; const v = numIn(el.value); if (isFinite(v)) C[k] = v; }); };
  f();
  $$("[data-scf]").forEach((b) => (b.onclick = () => { window.__scF = b.dataset.scf; viewScalp(); }));
  $$("[data-scg]").forEach((b) => (b.onclick = () => { window.__scG = b.dataset.scg; const y = scrollY; viewScalp().then(() => scrollTo(0, y)); }));
  $$("[data-scc]").forEach((b) => (b.onclick = () => { window.__scC = b.dataset.scc; const y = scrollY; viewScalp().then(() => scrollTo(0, y)); }));
  $$("[data-qsz]").forEach((b) => (b.onclick = async () => { C.lq_sz = +b.dataset.qsz; delete C.syms; if (await Store.put("scalp", C)) { toast(`Cỡ lệnh thật 📐: ${C.lq_sz}% vốn`); viewScalp(); } }));
  $$("[data-qmx]").forEach((b) => (b.onclick = async () => { C.lq_max = +b.dataset.qmx; delete C.syms; if (await Store.put("scalp", C)) { toast(`Tối đa ${C.lq_max} lệnh thật mỗi phương pháp`); viewScalp(); } }));
  // 🧪 khuôn thẻ phương pháp thử nghiệm: mở/đóng, nhảy tới thẻ, chỉnh thông số, lưu / về chuẩn, công tắc Giữ nhiều ngày
  $$("details[data-lmo]").forEach((d) => (d.ontoggle = () => { (window.__lmO ||= {})[d.dataset.lmo] = d.open; }));
  $$("[data-lmgo]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const el = $("#lm-" + a.dataset.lmgo); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - (($(".sc-tabs")?.getBoundingClientRect().bottom) || 70) - 10, behavior: "smooth" }); }));
  const lmDirty = (sec) => { if (!sec) return; const b = sec.querySelector("[data-lmsave]"); if (b) b.disabled = false; const m = sec.querySelector(".lm-dm"); if (m) { m.textContent = "● Có thay đổi chưa lưu"; m.className = "warn lm-dm"; } };
  $$("[data-lmb]").forEach((b) => (b.onclick = () => { const on = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", on); b.classList.toggle("on", on); b.querySelector("span").textContent = on ? "Bật" : "Tắt"; lmDirty(b.closest(".lm")); }));
  $$("[data-lmg] button").forEach((b) => (b.onclick = () => { b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); lmDirty(b.closest(".lm")); }));
  $$("[data-lmf]").forEach((i) => (i.oninput = () => lmDirty(i.closest(".lm"))));
  const lmRead = (sec) => {
    const out = {}, top = {};
    sec.querySelectorAll("[data-lmrow]").forEach((r) => {
      const f = r.dataset.lmrow.split("|")[2], t = r.dataset.type, d = r.dataset.def; let v;
      if (t === "n") { const i = r.querySelector("input"); v = numIn(i.value) / (+i.dataset.mul || 1); if (!isFinite(v)) return; v = +v.toFixed(6); if (i.dataset.top) { top[f] = v; return; } }
      else if (t === "b") v = r.querySelector("[data-lmb]").getAttribute("aria-checked") === "true";
      else { v = r.querySelector("[data-lmg] .on")?.dataset.v; if (v == null) return; if (/^-?\d+(\.\d+)?$/.test(v) && /^-?\d/.test(d)) v = +v; }
      if (String(v) !== d) out[f] = v;
    });
    return { out, top };
  };
  const lmKeep = (sc, k) => (sc === "swx" && C.swx?.[k]?.on === false ? { on: false } : {});
  $$("[data-lmsave]").forEach((b) => (b.onclick = async () => {
    const [sc, k] = b.dataset.lmsave.split("|"), { out, top } = lmRead(b.closest(".lm"));
    if (C.sw_lv_pump && (+top.sw_lv_sz > +C.sw_lv_sz || +top.sw_lv_max > +C.sw_lv_max) && !confirm(`Tăng cỡ Short coin vừa bơm trên Binance ${C.lv_env === "live" ? "TIỀN THẬT" : "Demo"}: ${C.sw_lv_sz}% → ${top.sw_lv_sz}% vốn/lệnh, tối đa ${C.sw_lv_max} → ${top.sw_lv_max} lệnh (x1, không cắt lỗ)?`)) return;
    C[sc] = { ...(C[sc] || {}), [k]: { ...lmKeep(sc, k), ...out } }; Object.assign(C, top); delete C.syms;
    if (await Store.put("scalp", C)) { toast(Object.keys(out).length ? `Đã lưu ${Object.keys(out).length} thông số khác chuẩn – áp dụng cho lệnh mới trong ≤ 30 giây` : "Đã lưu – đang dùng mức chuẩn"); viewScalp(); }
  }));
  $$("[data-lmstd]").forEach((b) => (b.onclick = async () => {
    const [sc, k] = b.dataset.lmstd.split("|");
    if (!confirm("Đưa mọi thông số của phương pháp này về mức chuẩn?")) return;
    C[sc] = { ...(C[sc] || {}), [k]: lmKeep(sc, k) }; if (sc === "swx" && k === "pump") { C.sw_lv_sz = SCALP_DEF.sw_lv_sz; C.sw_lv_max = SCALP_DEF.sw_lv_max; } delete C.syms;
    if (await Store.put("scalp", C)) { toast("Đã về mức chuẩn"); viewScalp(); }
  }));
  // 🧪 bảng thử nghiệm: bật/tắt sàn thử & tiền thật (nút, công tắc trong ngăn kéo, kéo-thả đều đi qua 2 hàm này)
  const lbEnv = () => (C.lv_env === "live" ? "tiền thật" : "Binance Demo");
  const lbSave = async (msg, fx) => { delete C.syms; if (await Store.put("scalp", C)) { if (fx) window.__lbFx = fx; toast(msg); window.__scUseCache = false; await viewScalp(); return true; } return false; };
  const lbPaper = async (m, on) => {
    if (m.paper.on === on) return false;
    if (m.main) {
      if (!on && !(await iosSheet({ title: `Tắt ${m.ico} ${m.name} trên sàn thử?`, body: m.k === "hook" ? `Ngừng đặt lệnh chờ ảo trên sàn thử; lệnh đang mở vẫn được quản lý tới khi đóng.${C.lv_on && C.lv_hk !== false ? "<br><b>Tiền thật vẫn chạy</b> – tắt riêng ở khúc 💰." : ""}` : `Ngừng lướt giây trên sàn thử; lệnh đang mở vẫn giữ tới khi đóng.${C.lq_sec ? " <b>Tiền thật lướt giây đi theo sàn thử nên cũng tắt.</b>" : ""}<br><b>Máy chủ riêng nhẹ hẳn:</b> thôi nhận sổ lệnh của mọi coin (chỉ còn giá khớp – đủ cho Bắt râu sập), thôi học từng giây, bỏ luồng spot nếu Bắt râu không đánh spot.`, ok: "Tắt", danger: true }))) return false;
      C[m.k === "hook" ? "hk_on" : "sec_on"] = on; if (!on && m.k === "sec") C.lq_sec = false;      // tiền thật lướt giây đi theo sàn thử
      return lbSave(on ? `Đã bật ${m.name} trên sàn thử` : `Đã tắt ${m.name} trên sàn thử`, on ? `paper|${m.k}` : "");
    }
    if (!on && !(await iosSheet({ title: `Tắt ${m.ico} ${esc(m.name)} trên sàn thử?`, body: m.sc === "qx" ? `Lệnh sàn thử đang mở của kiểu chơi này sẽ được đóng.${m.live.on ? `<br><b>Tiền thật đi theo sàn thử nên ${lbEnv()} cũng tắt</b> (lệnh thật đang mở vẫn được quản lý tới khi đóng).` : ""}` : "Chỉ ngừng mở lệnh mới – lệnh đang mở vẫn giữ tới khi hết giờ (hoặc anh đóng tay).", ok: "Tắt", danger: true }))) return false;
    if (m.sc === "qx") {
      if (on && C.q_on === false) { QK.forEach((x) => (C["q_" + x] = false)); C.q_on = true; }      // công tắc tổng cũ đang tắt → chỉ bật đúng cái này
      C["q_" + m.k] = on; if (!on) C["lq_" + m.k] = false;
    } else { const o = { ...(C.swx?.[m.k] || {}) }; if (on) delete o.on; else o.on = false; C.swx = { ...(C.swx || {}), [m.k]: o }; }
    return lbSave(on ? `Đã bật ${m.name} trên sàn thử – bot đọc trong ≤ 30 giây` : `Đã tắt ${m.name} trên sàn thử`, on ? `paper|${m.k}` : "");
  };
  const lbLive = async (m, on) => {
    if (m.live.none) { toast(`${m.name}: không hỗ trợ tiền thật – ${m.live.none}`); return false; }
    if (m.live.on === on) return false;
    const LVLx = C.lv_env === "live";
    if (on) {
      if (!C.lv_on) { toast("Tài khoản Binance của bot đang tắt – bật ở tab ⚙️ Thiết lập → 💵 trước"); return false; }
      const R = m.R, body = m.main && m.k === "sec" ? `Mỗi lệnh lướt giây trên sàn thử → bot vào lệnh thị trường y hệt trên Binance (${C.lq_sz || 5}% vốn, ký quỹ cô lập x${C.lv_lev || 2}, cắt lỗ đặt sẵn trên sàn, tối đa ${C.lq_max || 2} lệnh cùng lúc) và đóng cùng lúc với sàn thử.${C.sec_on === false ? " <b>Sàn thử lướt giây sẽ được bật cùng</b> (tiền thật đi theo sàn thử)." : ""}<br><br><b class="down">Lướt giây trên sàn thử đang lỗ sau phí${bsec?.n ? ` (${nf(bsec.bps / bsec.n, 0)} bps/lệnh, ${bsec.n} lệnh)` : ""}</b>; lệnh thật vào/ra trễ hơn sàn thử ~0,5–1 giây nên thường còn tệ hơn. Chỉ nên bật Demo để thử.` : m.main ? `Bot đặt lệnh Bắt râu sập trên tài khoản Binance theo thiết lập ở ⚙️ Thiết lập → 💵 Binance (${C.lv_all ? "toàn bộ số dư" : `tối đa ${C.lv_cap} USDT`}, x${C.lv_lev}, ngừng khi lỗ ${C.lv_daily}% trong ngày).${LVLx && !C.lv_live_ok ? "<br><b>Chưa xác nhận tiền thật</b> – vào ⚙️ Thiết lập → 💵 để gõ xác nhận trước." : ""}` : m.sc === "qx"
        ? `Mỗi tín hiệu: lệnh thị trường <b>${C.lq_sz || 5}% vốn</b> (mỗi chân ≥ ~5,5 USDT), ký quỹ cô lập x${C.lv_lev || 2}, cắt lỗ đặt sẵn trên sàn, tối đa ${C.lq_max || 2} lệnh cùng lúc. Lệnh thật đi theo đúng lệnh sàn thử${m.paper.on ? "" : " – <b>sàn thử sẽ được bật cùng</b>"}.<br><br>${R?.n ? `Kiểm chứng ngoài mẫu: ${R.n} lệnh, thắng ${R.win}%, TB ${R.mean >= 0 ? "+" : ""}${R.mean} bps/lệnh sau phí.` : "Chưa có kết quả kiểm chứng ngoài mẫu."}${m.edge ? "" : " <b class=\"down\">Chưa có lợi thế sau phí.</b>"} Quá khứ không bảo đảm tương lai.`
        : `Lúc 7:00 sáng, coin tăng ≥ ${X.sw?.pump?.chg || 100}%/24h → Short <b>${C.sw_lv_sz}% vốn</b> mỗi lệnh (tối thiểu ~5,5 USDT), x1, giữ ${(X.sw?.pump?.hold || 168) / 24} ngày, <b>không cắt lỗ</b>, tối đa ${C.sw_lv_max} lệnh cùng lúc.<br>Giá tăng gấp đôi → mất trắng phần tiền của lệnh đó.`;
      // ⚠️ sàn thử chưa chứng minh có lời (Jason 07/11/2026): < 10 lệnh đã đóng hoặc tổng lời/lỗ ≤ 0 → cảnh báo đỏ ở đầu bảng xác nhận, nút bấm chờ lâu hơn
      const PP = m.pp || { n: 0, pnl: 0 }, PMIN = 10, notYet = PP.n < PMIN || !(PP.pnl > 0);
      const warn = !notYet ? "" : `<div class="sc-lvwarn">⚠️ <b>Sàn thử chưa thấy lời</b> – ${PP.n ? `${nf(PP.n, 0)} lệnh đã đóng, tổng <b class="${cls(PP.pnl)}">${PP.pnl >= 0 ? "+" : ""}${usd2(PP.pnl)}</b>${PP.n < PMIN ? ` (chưa đủ ${PMIN} lệnh để biết)` : " – đang lỗ sau phí"}` : "chưa có lệnh nào đã đóng"}. Nên để chạy sàn thử tới khi có ít nhất ${PMIN} lệnh và tổng lời dương rồi mới đánh ${LVLx ? "tiền thật" : "Demo"}.</div>`;
      if (!(await iosSheet({ title: `${notYet ? "⚠️ " : ""}Bật ${m.ico} ${esc(m.name)} trên ${LVLx ? "Binance TIỀN THẬT" : "Binance Demo"}?`, body: warn + body, ok: notYet ? (LVLx ? "Vẫn tiếp tục" : "Vẫn bật trên Demo") : LVLx ? "Tiếp tục" : "Bật trên Demo", danger: LVLx || notYet, wait: LVLx ? (notYet ? 4000 : 1500) : notYet ? 1500 : 0 }))) return false;
      if (LVLx && prompt('Gõ "TIEN THAT" để xác nhận đánh bằng tiền thật:') !== "TIEN THAT") { toast("Chưa bật – xác nhận không đúng"); return false; }
    }
    if (m.main && m.k === "hook") C.lv_hk = on;
    else if (m.main) { C.lq_sec = on; if (on) C.sec_on = true; }
    else if (m.sc === "qx") { if (on) { if (C.q_on === false) { QK.forEach((x) => (C["q_" + x] = false)); C.q_on = true; } C["q_" + m.k] = true; } C["lq_" + m.k] = on; }
    else C.sw_lv_pump = on;
    return lbSave(on ? `Đã bật ${m.name} trên ${lbEnv()} – áp dụng cho tín hiệu MỚI` : `Đã tắt ${m.name} trên ${lbEnv()} – lệnh đang mở vẫn được quản lý tới khi đóng`, on ? `live|${m.k}` : "");
  };
  const lbMove = async (k, from, to) => {      // kéo-thả: lib → paper / live = bật · paper → live = bật tiền thật · live → paper = tắt tiền thật · → lib = tắt nơi kéo ra
    const m = LB?.MM[k]; if (!m || from === to) return;
    if (to === "paper") return from === "live" ? lbLive(m, false) : m.paper.on ? toast(`${m.name} đang đánh sàn thử rồi`) : lbPaper(m, true);
    if (to === "live") return m.live.on ? toast(`${m.name} đang đánh ${lbEnv()} rồi`) : lbLive(m, true);
    if (to === "lib") return from === "live" ? lbLive(m, false) : from === "paper" ? lbPaper(m, false) : null;
  };
  $$("[data-lbt]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const [w, k] = b.dataset.lbt.split("|"), m = LB?.MM[k]; if (!m) return; if (w === "paper") lbPaper(m, !m.paper.on); else lbLive(m, !m.live.on); }));
  // ngăn kéo chi tiết: bên phải (máy tính) / trượt từ dưới (điện thoại); giữ mở sau khi lưu
  document.querySelectorAll("body > .lb-dr").forEach((x) => x.remove());
  const DR = $("#lbDr");
  if (DR) {
    document.body.appendChild(DR);      // ra ngoài #app: không bị hiệu ứng chuyển trang làm lệch vị trí cố định
    const show = (k, anim = true) => { DR.querySelectorAll("[data-lbdr]").forEach((c) => (c.hidden = c.dataset.lbdr !== k)); DR.hidden = false; window.__lmOpen = k; requestAnimationFrame(() => DR.classList.add("on")); if (!anim) DR.classList.add("on", "now"); DR.querySelector(".lb-dr-p").scrollTop = window.__lbDrY?.[k] || 0; document.documentElement.classList.add("lb-lock"); };
    const hide = () => { window.__lmOpen = null; DR.classList.remove("on", "now"); document.documentElement.classList.remove("lb-lock"); setTimeout(() => { if (!DR.classList.contains("on")) DR.hidden = true; }, 260); };
    DR.querySelector(".lb-dr-p").addEventListener("scroll", (e) => { if (window.__lmOpen) (window.__lbDrY ||= {})[window.__lmOpen] = e.target.scrollTop; }, { passive: true });
    $$("[data-lbopen]").forEach((b) => (b.onclick = () => show(b.dataset.lbopen)));
    DR.querySelectorAll("[data-lbclose]").forEach((b) => (b.onclick = hide));
    // điện thoại: vuốt vạch kéo (hoặc vuốt xuống khi đang ở đầu nội dung) để đóng; nền mờ không cuộn trang bên dưới
    { const P = DR.querySelector(".lb-dr-p"), BG = DR.querySelector(".lb-dr-bg"); let sy = null, dy = 0, t0 = 0, fromH = false;
      BG.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
      P.addEventListener("touchstart", (e) => { if (!matchMedia("(max-width:640px)").matches) return; fromH = !!e.target.closest(".lb-dr-h"); if (!fromH && P.scrollTop > 0) { sy = null; return; } sy = e.touches[0].clientY; dy = 0; t0 = Date.now(); }, { passive: true });
      P.addEventListener("touchmove", (e) => {
        if (sy == null) return; dy = e.touches[0].clientY - sy;
        if (dy <= 0) { if (fromH) e.preventDefault(); else { sy = null; P.style.transform = ""; P.style.transition = ""; BG.style.opacity = ""; } return; }
        e.preventDefault(); P.style.transition = "none"; P.style.transform = `translateY(${dy}px)`; BG.style.opacity = String(1 - Math.min(dy / 500, 0.7));
      }, { passive: false });
      const end = () => { if (sy == null) return; sy = null; const v = dy / Math.max(1, Date.now() - t0); P.style.transition = ""; BG.style.opacity = ""; if (dy > 110 || (dy > 30 && v > 0.6)) { hide(); P.style.transform = ""; } else P.style.transform = ""; };
      P.addEventListener("touchend", end); P.addEventListener("touchcancel", end); }
    if (!window.__lbKey) { window.__lbKey = 1; addEventListener("keydown", (e) => { if (e.key === "Escape" && document.querySelector("body > .lb-dr.on")) document.querySelector("body > .lb-dr [data-lbclose]")?.click(); }); addEventListener("hashchange", () => { if (!location.hash.startsWith("#/bot/scalp")) { document.querySelectorAll("body > .lb-dr").forEach((x) => x.remove()); document.documentElement.classList.remove("lb-lock"); window.__lmOpen = null; } }); }
    if (window.__lmOpen && LB?.MM[window.__lmOpen]) show(window.__lmOpen, false); else document.documentElement.classList.remove("lb-lock");
  } else document.documentElement.classList.remove("lb-lock");
  // hiệu ứng thẻ vừa thả vào cột
  if (window.__lbFx) { const [c, k] = window.__lbFx.split("|"); window.__lbFx = null; const el = document.querySelector(`#lb .lb-r[data-lbk="${k}"] .lb-seg.${c === "paper" ? "p" : "l"}`); if (el) { el.classList.add("lb-pop"); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); } }
  // kéo-thả bằng con trỏ (chuột + cảm ứng): giữ ⠿ để kéo; gần mép màn hình thì tự cuộn
  const lbOk = (k, from, to) => { const m = LB?.MM[k]; if (!m || to === from) return null; if (to === "live") return !m.live.none && !!C.lv_on; if (to === "lib") return from !== "lib"; return true; };
  $$("#lb [data-lbgrip]").forEach((g) => g.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const card = g.closest(".lb-card"), k = card.dataset.lbk, from = card.dataset.lbsrc, r = card.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    e.preventDefault(); try { g.setPointerCapture(e.pointerId); } catch (er) { /* bỏ qua */ }
    const gh = card.cloneNode(true); gh.classList.add("lb-ghost"); gh.style.width = r.width + "px"; document.body.appendChild(gh);
    card.classList.add("lb-src"); document.documentElement.classList.add("lb-dragging");
    let over = null, y = e.clientY, raf = 0;
    const mv = (ev) => {
      y = ev.clientY; gh.style.transform = `translate(${ev.clientX - dx}px,${ev.clientY - dy}px) rotate(1.5deg) scale(1.02)`;
      const hit = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.matches?.("[data-lbcol]")), col = hit ? document.querySelector(`#lb .lb-bg[data-lbcol="${hit.dataset.lbcol}"]`) : null;      // tô sáng CẢ cột
      if (col !== over) { over?.classList.remove("lb-over", "lb-no"); over = col; const ok = col && lbOk(k, from, col.dataset.lbcol); if (col && ok !== null) col.classList.add(ok ? "lb-over" : "lb-no"); }
    };
    const auto = () => { const H = innerHeight, M = 80; if (y < M) scrollBy(0, -Math.ceil((M - y) / 6)); else if (y > H - M) scrollBy(0, Math.ceil((y - H + M) / 6)); raf = requestAnimationFrame(auto); };
    const up = async () => {
      g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); cancelAnimationFrame(raf);
      document.documentElement.classList.remove("lb-dragging"); card.classList.remove("lb-src"); gh.remove();
      const to = over?.dataset.lbcol, ok = over && lbOk(k, from, to); over?.classList.remove("lb-over", "lb-no");
      if (to && ok === false) { const m = LB?.MM[k]; toast(to === "live" && !C.lv_on ? "Tài khoản Binance của bot đang tắt – bật ở tab ⚙️ Thiết lập → 💵 trước" : `${m?.name}: không hỗ trợ tiền thật`); return; }
      if (to && ok) await lbMove(k, from, to);
    };
    mv(e); raf = requestAnimationFrame(auto);
    g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
  }));
  if ($("#lvRes")) $("#lvRes").onclick = async () => { C.lv_resume_at = new Date().toISOString(); delete C.syms; await Store.put("scalp", C); toast("Tài khoản thật chạy lại trong ≤ 5 phút"); viewScalp(); };
  if ($("#scRes")) $("#scRes").onclick = async () => { C.resume_at = new Date().toISOString(); delete C.syms; await Store.put("scalp", C); toast("Bot sẽ chạy tiếp trong ≤ 30 giây"); viewScalp(); };
  $("#scAuto").onclick = () => { const off = !autoOff("scalp"); try { localStorage.setItem("mybit_auto_scalp", off ? "0" : "1"); } catch (e) { /* bỏ qua */ } toast(off ? "Đã dừng tự cập nhật – bấm lại để chạy tiếp" : "Trang tự cập nhật lại"); if (off) $("#scAuto").textContent = "▶ Tự cập nhật"; else softRender(() => viewScalp()); };
  lvEqBind(); cmpMark(); fdPlace();
  $$("[data-menter]").forEach((b0) => (b0.onclick = async () => {      // ✋ VÀO NGAY lệnh chờ Bắt râu sập
    let b = b0; const key = b.dataset.menter, real = b.dataset.mreal === "1", k = key.slice(3), nm = b.dataset.mname;
    const card = b.closest(".sc-oc"), cur = card?.querySelector(".lpx")?.textContent?.trim() || "—";
    const ok = await iosSheet({ title: `Vào ngay ${esc(nm)}?`, danger: real, wait: real ? 1200 : 0, ok: real ? "Vào ngay bằng TIỀN THẬT" : "Vào ngay",
      body: `Huỷ các lệnh chờ còn lại và <b>vào phần còn thiếu bằng lệnh thị trường</b> ở giá hiện tại${/\d/.test(cur) ? ` (~${esc(cur)})` : ""}. Sau đó bot quản lý như lệnh khớp thường: cắt lỗ thảm hoạ ${nf(C.hk_stop, 0)}%${C.hk_tra ? `, cắt lỗ đuổi (lời ≥ ${nf(C.hk_tra / 100, 1)}% thì đóng khi trả lại ${nf(C.hk_trg / 100, 1)}%)` : ""}, giữ tối đa ${nf(C.hk_h, 0)} phút.<br><br><span class="faint">${HK_ENTER_NOTE}</span>` });
    if (!ok) return;
    if (!document.body.contains(b)) b = document.querySelector(`[data-menter="${CSS.escape(key)}"]`) || b;
    const now = new Date().toISOString(), R = {}; for (const [x, t] of Object.entries(C.enter_req || {})) if (Date.now() - Date.parse(t) < 30 * 60e3) R[x] = t;
    scCmd("enter", key, now); R[key] = now; C.enter_req = R; delete C.syms;
    b.disabled = true; b.classList.add("busy"); b.textContent = "Đang gửi…";
    if (await Store.put("scalp", C)) { (window.__mEntering ||= {})[key] = now; toast(real ? "Đã gửi – máy chủ vào lệnh thật trong vài giây" : "Đã gửi – sàn thử vào lệnh trong vài giây"); setTimeout(() => { delete window.__mEntering?.[key]; }, 60e3); }
    else { b.disabled = false; b.classList.remove("busy"); b.textContent = "Vào ngay"; }
  }));
  $$("[data-mclose]").forEach((b0) => (b0.onclick = async () => {
    let b = b0; const key = b.dataset.mclose, real = b.dataset.mreal === "1", pend = /^pp:/.test(key) && /lệnh chờ/.test(b.dataset.mname);
    if (!(await mxAsk(key, b.dataset.mname, real, pend))) return;
    if (!document.body.contains(b)) b = document.querySelector(`[data-mclose="${CSS.escape(key)}"]`) || b;      // trang đã vẽ lại trong lúc xem bảng
    const now = new Date().toISOString(), R = {}; for (const [k, t] of Object.entries(C.close_req || {})) if (Date.now() - Date.parse(t) < 30 * 60e3) R[k] = t;
    scCmd("close", key, now);      // đường nhanh (~1 giây) – thiết lập bên dưới là đường dự phòng (≤ 30 giây)
    R[key] = now; C.close_req = R; delete C.syms;
    b.disabled = true; b.classList.add("busy"); b.textContent = bi("⏳ Đang gửi lệnh đóng…", "⏳ Closing…");
    if (await Store.put("scalp", C)) { (window.__mClosing ||= {})[key] = now; toast(bi("Đã gửi – máy chủ đóng lệnh trong vài giây", "Sent – the server closes it in a few seconds")); setTimeout(() => { delete window.__mClosing?.[key]; }, 90e3); }
    else { b.disabled = false; b.classList.remove("busy"); b.textContent = bi("✕ Đóng lệnh", "✕ Close"); }
  })); if (window.__hzInfo) { const d = $(".hz2 > .sc-i"); if (d) d.open = true; }
  $("#scOn").onclick = async () => {
    if (C.enabled && !confirm(`Tắt Bot Phản Xạ?\n\nBot ngừng quét và không mở lệnh mới (cả sàn thử${C.lv_on ? " và Binance " + (C.lv_env === "live" ? "THẬT" : "Demo") : ""}).${C.lv_on ? " Lệnh đang mở trên Binance vẫn có cắt lỗ đặt sẵn trên sàn." : ""}`)) return;
    C.enabled = !C.enabled; $("#scOn")?.setAttribute("aria-checked", String(C.enabled)); delete C.syms; await Store.put("scalp", C); toast(C.enabled ? "Đã bật – máy chủ khởi động bot trong ≤ 1 phút" : "Đã tắt – bot đóng kết nối trong ≤ 30 giây"); viewScalp(); };
  $("#scReset").onclick = async () => { if (!confirm(`Làm lại tài khoản sàn thử với ${usd(C.capital)} (xoá lịch sử lệnh)? Bộ nhớ học được GIỮ nguyên.`)) return; C.reset_at = new Date().toISOString(); delete C.syms; await Store.put("scalp", C); toast("Bot làm lại tài khoản trong ≤ 30 giây"); viewScalp(); };
  if ($("#scWipe")) $("#scWipe").onclick = async () => { if (!confirm("Xoá TOÀN BỘ bộ nhớ học (cả bản lưu dùng chung)? Bot sẽ học lại từ đầu và phải chờ thời gian học tối thiểu.")) return; C.wipe_at = new Date().toISOString(); delete C.syms; await Store.put("scalp", C); toast("Bot xoá bộ nhớ học trong ≤ 30 giây"); viewScalp(); };
  if ($("#scDl")) $("#scDl").onclick = async () => { const r = await Store.get("scalpbrain"); if (!r.data) { toast("Chưa có bộ nhớ học được lưu"); return; } const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(r.data)], { type: "application/json" })); a.download = `mybit-scalp-brain-${String(r.data.at || "").slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  sclSync([...Object.keys(X.pos || {}), ...Object.keys(X.hk || {}), ...(X.live?.ev || []).map((e) => e.sym.replace(/USDT$/, "") + ":F"), ...rows.slice(0, 24).map(([id]) => id)]); sclApply();
  clearInterval(window.__scT);
  window.__scT = setInterval(async () => {
    if (location.hash !== "#/bot/scalp") { clearInterval(window.__scT); document.body.classList.remove("sc-set-on"); return; }
    if (document.hidden || autoOff("scalp") || userBusy() || window.__scDirty || $("#scKeyOut")?.textContent || document.activeElement?.closest?.("#scForm")) return;   // đang xem / sửa dở / đang hiện khoá → không tải lại
    if (Date.now() - (window.__scLast || 0) < (innerWidth < 980 ? 5000 : 3000)) return;     // điện thoại: 5 giây / lần
    try { const r = await Store.get("scalpstate"); if (r.data?.at && r.data.at !== X.at) { window.__scLast = Date.now(); await softRender(() => viewScalp()); } } catch (e) { /* bỏ qua */ }
  }, 3000);
}

async function viewBot(sel) {
  const [I, S] = await Promise.all([tryLoad("data/ideas.json"), sectorsData(), coins()]);
  if (ME && !can("bot")) { app().innerHTML = `<div class="ph"><h1>🤖 Bot giao dịch</h1></div><div class="panel"><p class="muted">🔒 Bot giao dịch tự động dành cho gói Pro.</p></div>`; return; }
  const [rc, rs, rq, rv] = await Promise.all([Store.get("bot"), Store.get("botstate"), Store.get("sup"), Store.get("supstate")]);
  let B = botsOf(rc.data).map((b, i) => ({ ...BOT_DEF, ...b, id: b.id || "b" + (i + 1) }));
  if (!B.length) B = [{ ...BOT_DEF, id: "b1" }];
  const SS = statesOf(rs.data);
  const id = sel && B.some((b) => b.id === sel) ? sel : B.some((b) => b.id === lsGet("botsel", "")) ? lsGet("botsel", "") : B[0].id;
  lsSet("botsel", id);
  let C = B.find((b) => b.id === id);
  const st = SS[id] || null, Sx = st?.stats || {};
  const { items } = await sbIdeas();
  const reg = I?.btc_up ? "up" : "down", stats = I?.stats || {};
  const groups = [...new Set((COINS?.rows || []).map((r) => r.g).filter(Boolean))].sort();
  const pxNow = (k) => BYK[k]?.p;
  const putAll = async () => Store.put("bot", { v: 2, bots: B });
  const stOf = (b) => { const s = SS[b.id]; return !b.enabled ? ["Đang tắt", ""] : s?.paused ? ["Tạm dừng", "sell"] : s?.stats?.halt ? ["Ngừng mở lệnh", "warn"] : ["Đang chạy", "buy"]; };
  const status = !C.enabled ? ["Đang tắt", "", "Bật bot để bắt đầu – bot theo dõi thị trường mỗi phút trên máy chủ, kể cả khi anh tắt máy."] : st?.paused ? ["⛔ Tạm dừng", "sell", st.paused.why] : Sx.halt ? ["⏸ Ngừng mở lệnh", "warn", Sx.halt] : ["● Đang chạy", "buy", st?.last ? `${Sx.engine === "1m" ? "theo dõi mỗi phút" : "chạy mỗi 15 phút"} · kiểm tra gần nhất ${agoShort(st.last + "Z")} trước` : "chờ lượt chạy đầu tiên (≤ 2 phút)"];
  const eqNow = botEq(st, pxNow) ?? C.capital;
  const ret = st ? (eqNow / st.start - 1) * 100 : 0, mon = st?.month?.eq0 ? (eqNow / st.month.eq0 - 1) * 100 : 0, dd = st?.peak ? Math.max(0, (1 - eqNow / Math.max(st.peak, eqNow)) * 100) : 0;
  const prog = (v, max, cls2) => `<i class="bot-bar"><i class="${cls2}" style="width:${Math.max(2, Math.min(100, (v / (max || 1)) * 100)).toFixed(0)}%"></i></i>`;
  const R = st?.research, TH = st?.think;
  // ---- đội bot: thẻ từng bot + so sánh
  const row = (b) => { const s = SS[b.id], e = botEq(s, pxNow) ?? b.capital, r = s ? (e / s.start - 1) * 100 : 0, x = s?.stats || {}, [t, c] = stOf(b);
    return { b, s, e, r, x, t, c, d: s?.peak ? Math.max(0, (1 - e / Math.max(s.peak, e)) * 100) : 0 }; };
  const rowsB = B.map(row);
  const fleet = `<div class="bfleet">${rowsB.map(({ b, s, r, x, t, c }) => `<a href="#/bot/${enc(b.id)}" class="bcard ${b.id === id ? "on" : ""}">
      <span class="bcard-h"><b>${esc(b.name)}</b><span class="pill ${c}">${t}</span></span>
      <span class="bcard-v ${cls(r)}">${pct(r, 2)}</span><small>${esc(BOT_PRE[b.preset]?.t || "Tuỳ chỉnh")} · ${b.tf === "both" ? "swing + lướt" : b.tf === "d" ? "swing" : "lướt 4h"} · ${(s?.pos || []).length} lệnh mở · ${x.n || 0} đã đóng${isNum(x.win) ? ` · thắng ${nf(x.win, 0)}%` : ""}</small>
      ${s?.eq?.length > 2 ? spark(s.eq.map((q) => q[1]), { w: 160, h: 26 }) : ""}</a>`).join("")}
      ${B.length < 6 ? `<button class="bcard badd" id="bAdd"><b>➕ Thêm bot</b><small>nhân bản thiết lập bot đang chọn</small></button>` : ""}
      ${B.length <= 3 ? `<button class="bcard badd" id="bTrio"><b>⚖️ Tạo bộ so sánh</b><small>3 bot Thận trọng / Cân bằng / Mạo hiểm, cùng vốn, chạy song song</small></button>` : ""}</div>`;
  let cmp = "";
  if (B.length > 1) {
    const buckets = [...new Set(rowsB.flatMap(({ s }) => (s?.eq || []).map((q) => q[0].slice(0, 13))))].sort();
    const cols = [css("--brand"), css("--up"), css("--floor"), css("--down"), css("--ceil"), css("--ref")];
    const ser = rowsB.filter(({ s }) => s?.eq?.length).map(({ b, s }, i) => { const m = {}; s.eq.forEach(([t, v]) => (m[t.slice(0, 13)] = (v / s.start - 1) * 100)); let last = null, started = false;
      return { name: b.name, color: cols[B.indexOf(b) % cols.length], width: b.id === id ? 2.4 : 1.5, pts: buckets.map((k) => { if (m[k] != null) { last = m[k]; started = true; } return { x: k.slice(8, 10) + "/" + k.slice(5, 7) + " " + k.slice(11, 13) + "h", y: started ? last : null }; }) }; });
    cmp = panel("📊 So sánh các bot", `<div class="tw"><table><thead><tr><th class="l">Bot</th><th class="l">Khẩu vị</th><th>Lãi/lỗ</th><th>Tháng này</th><th>Sụt tối đa</th><th>Lệnh</th><th>Thắng</th><th>Lãi TB</th><th>Đang mở</th></tr></thead><tbody>${rowsB.sort((p, q) => q.r - p.r).map(({ b, s, r, x, d }) => `<tr class="${b.id === id ? "on" : ""}"><td class="l"><a href="#/bot/${enc(b.id)}"><b>${esc(b.name)}</b></a></td><td class="l">${esc(BOT_PRE[b.preset]?.t || "Tuỳ chỉnh")} <small class="faint">rủi ro ${nf(b.risk, 1)}% · x${b.max_lev}</small></td><td class="${cls(r)}">${pct(r, 2)}</td><td class="${cls(x.mon_pct)}">${pct(x.mon_pct, 2)}</td><td class="${d > 0 ? "down" : ""}">${nf(isNum(x.dd) ? Math.max(x.dd, d) : d, 1)}%</td><td>${x.n || 0}</td><td>${isNum(x.win) ? nf(x.win, 0) + "%" : "—"}</td><td class="${cls(x.avgR)}">${isNum(x.avgR) ? nf(x.avgR, 2) + "R" : "—"}</td><td>${(s?.pos || []).length}</td></tr>`).join("")}</tbody></table></div>
      ${ser.length && buckets.length > 1 ? lineSvg(ser, { h: 190, dec: 1, zero: true, fmt: (v) => nf(v, 1) + "%" }) : `<p class="faint">Đường so sánh hiện sau vài giờ chạy.</p>`}
      <p class="faint" style="font-size:.75rem">Các bot cùng nhìn một thị trường và cùng danh sách tín hiệu, khác nhau ở thiết lập – nên chênh lệch kết quả là do cách chơi / khẩu vị rủi ro. Cần ≥ 30 lệnh mỗi bot mới đủ để kết luận.</p>`);
  }
  const thinkBox = TH ? `<p class="bth-h"><small>${esc(new Date(TH.at + "Z").toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" }))}</small> ${esc(TH.head)}</p>
      ${(TH.pos || []).length ? `<p class="sbh">Đang giữ</p>${TH.pos.map((p) => { const lo = Math.min(p.s, p.t), hi = Math.max(p.s, p.t), w = (v) => Math.max(0, Math.min(100, (v - lo) / (hi - lo || 1) * 100));
          return `<div class="bth-p"><div class="bth-l"><b>${p.side === "long" ? "Long" : "Short"} ${esc(p.k)}</b> <small>${p.mkt === "spot" ? "spot" : "fut x" + p.lev}</small><span class="${cls(p.u)}">${p.u >= 0 ? "+" : ""}${usd2(p.u)}${isNum(p.r) ? ` · ${nf(p.r, 2)}R` : ""}</span></div>
            <div class="bth-rail"><i class="s" style="left:${w(p.s)}%"></i><i class="e" style="left:${w(p.e)}%"></i><i class="t" style="left:${w(p.t)}%"></i><i class="p" style="left:${w(p.p)}%"></i></div>
            <small class="faint">${esc(p.why)}</small></div>`; }).join("")}` : ""}
      ${(TH.cands || []).length ? `<p class="sbh">Ứng viên bot đang xét (${TH.n} từ máy chủ phân tích)</p><div class="bth-c">${TH.cands.map((t) => { const v = BOT_V[t.v] || [t.v, ""];
          return `<div class="bth-ci"><span class="pill ${v[1]}">${v[0]}</span><b>${t.side === "long" ? "Long" : "Short"} ${esc(t.k)}</b> <small class="faint">${t.tf === "d" ? "ngày" : "4h"} · ${t.mkt === "spot" ? "spot" : "fut"} · thống kê ${nf(t.win1, 0)}% · ${nf(t.avgR, 2)}R</small>${isNum(t.pm) ? ` <span class="pill brand" title="Xác suất chạm MT1 do mô hình học máy ước cho đúng tín hiệu này">🧬 ${nf(t.pm, 0)}%</span>` : ""}${t.play ? ` <span class="pill ${{ prefer: "buy", ok: "", weak: "warn", avoid: "sell" }[t.play] || ""}" title="Sổ tay riêng của mã cho thiết lập này">${{ prefer: "mã hợp", ok: "mã được", weak: "mã yếu", avoid: "mã tránh" }[t.play]}</span>` : ""}<div class="bth-why">${esc(t.why || "")}${isNum(t.p) ? ` <small class="faint">· giá ${px(t.p)} · vào ${px(t.e)} · SL ${px(t.s)} · MT1 ${px(t.t1)}</small>` : ""}</div></div>`; }).join("")}</div>` : ""}`
    : `<p class="muted">Bot chưa chạy phút nào – bật bot và chờ 1–2 phút.</p>`;
  app().innerHTML = `<div class="ph"><h1>Bot xu hướng</h1><span class="meta">Thử nghiệm · sàn thử · khung ngày/4 giờ · phân tích mỗi 15 phút ${mLink("r")}</span></div>
    ${PG("Bot xu hướng")}${supStrip(rv.data, rq.data)}
    ${panel(`📈 Các bot xu hướng của anh (${B.length}/6)`, fleet)}
    ${cmp}
    <section class="panel hero bot-hero"><div class="bot-st"><span class="pill ${status[1]} big">${status[0]}</span><b>${esc(C.name)}</b><small>${esc(status[2])}</small>
      <span class="bot-btns"><button class="btn ${C.enabled ? "" : "primary"}" id="bOn">${C.enabled ? "⏸ Tắt bot" : "▶ Bật bot"}</button>${st?.paused ? `<button class="btn primary" id="bRes">Chạy lại</button>` : ""}<button class="btn" id="bClose" ${st?.pos?.length ? "" : "disabled"}>Đóng hết lệnh</button><button class="btn" id="bReset">Làm lại từ đầu</button>${B.length > 1 ? `<button class="btn" id="bDel">Xoá bot</button>` : ""}</span></div>
      ${kpis([["Tài sản bot", usd2(eqNow), "", `vốn ban đầu ${usd(st?.start ?? C.capital)}`], ["Lãi/lỗ từ đầu", pct(ret, 2), cls(ret)],
        ["Tháng này", `${pct(mon, 2)}`, cls(mon), `mục tiêu ${nf(C.target_month, 1)}%` + prog(Math.max(0, mon), C.target_month, "up")],
        ["Sụt so với đỉnh", `${nf(dd, 1)}%`, dd > C.max_dd * 0.7 ? "down" : "", `tạm dừng ở ${nf(C.max_dd, 0)}%` + prog(dd, C.max_dd, "down")],
        ["Số lệnh đã đóng", nf(Sx.n || 0, 0), "", isNum(Sx.win) ? `thắng ${nf(Sx.win, 0)}%` : "chưa có"], ["Lãi TB mỗi lệnh", isNum(Sx.avgR) ? nf(Sx.avgR, 2) + "R" : "—", cls(Sx.avgR)],
        ["Đang mở", `${(st?.pos || []).length}/${C.max_pos}`, "", isNum(Sx.heat) ? `rủi ro mở ${nf(Sx.heat, 1)}%/${nf(C.max_heat, 0)}% · vị thế ${nf(Sx.gross, 2)}×` + prog(Sx.heat, C.max_heat, "down") : ""], ["Rủi ro / lệnh", nf(C.risk * (Sx.risk_mult || 1), 2) + "%", "", (Sx.mult_why || []).join(" · ") || "% tài sản bot"]])}</section>
    <div class="g g2w">
      <div>
        ${PG("Suy nghĩ & nghiên cứu")}${panel("🧠 Bot đang nghĩ gì", thinkBox, "cập nhật mỗi phút")}
        ${panel("🧾 Báo cáo mỗi 2 phút", st?.report ? `<p class="faint" style="margin:0 0 6px">${esc(new Date(st.report.at + "Z").toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" }))}</p><ul class="bot-rl">${st.report.lines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          ${(st.reports || []).length > 1 ? `<details><summary class="faint">Các báo cáo trước (${st.reports.length - 1})</summary>${st.reports.slice(0, -1).reverse().map((r) => `<div class="brep"><small>${esc(new Date(r.at + "Z").toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" }))}</small><ul>${r.lines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}</details>` : ""}`
          : `<p class="muted">Báo cáo đầu tiên có trong vòng 2 phút sau khi bot chạy.</p>`, "tài sản · rủi ro · ứng viên · lệnh")}
        <div id="bModel"></div>
        ${panel("💭 Dòng suy nghĩ", st?.dlog?.length ? `<ul class="bot-log">${st.dlog.slice().reverse().slice(0, 60).map((l) => { const v = BOT_V[l.v] || ["", ""]; return `<li><small>${dt(l.t + "Z")}</small> <span class="pill ${v[1]}">${v[0]}</span> ${esc(l.m)}</li>`; }).join("")}</ul>` : `<p class="muted">Bot ghi lại mỗi khi đổi ý về một ứng viên (ví dụ từ CHỜ GIÁ sang VÀO).</p>`, "chỉ ghi khi bot đổi ý")}
        ${panel("📋 Báo cáo nghiên cứu hôm nay", R ? `<p class="faint" style="margin:0 0 6px">Viết lúc ${esc(new Date(R.at + "Z").toLocaleString(LOC))} · máy chủ phân tích lại mỗi 15 phút</p><ul class="bot-rl">${R.lines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          ${(R.sectors || []).length ? `<div class="tw"><table><thead><tr><th class="l">Nhóm anh chọn</th><th class="l">Trạng thái</th><th>30 ngày</th><th>So BTC</th><th class="l">Mạnh nhất 7n</th></tr></thead><tbody>${R.sectors.map((g) => `<tr><td class="l"><a href="#/sector/${enc(g.g)}">${esc(g.g)}</a></td><td class="l"><span class="pill ${QCOL[g.q] || ""}">${esc(g.q || "—")}</span></td><td class="${cls(g.r30)}">${pct(g.r30, 1)}</td><td class="${cls(g.rs30)}">${pct(g.rs30, 1)}</td><td class="l">${(g.top || []).map(([k, v]) => `${coinLink(k)} <small class="${cls(v)}">${pct(v, 0)}</small>`).join(" ")}</td></tr>`).join("")}</tbody></table></div>` : ""}`
          : `<p class="muted">Chưa có báo cáo – bot viết báo cáo ở lượt phân tích đầu tiên mỗi ngày (giờ Việt Nam) sau khi anh bật.</p>`)}
        ${PG("Kết quả & lệnh")}${panel("📈 Tài sản của bot", st?.eq?.length > 1 ? lineSvg([{ name: "Tài sản (USDT)", color: css("--brand"), width: 2, pts: st.eq.map(([t, v]) => ({ x: new Date(t + "Z").toLocaleDateString(LOC, { day: "2-digit", month: "2-digit" }), y: v })) }], { h: 200, dec: 0, hlines: [{ y: st.start, label: "vốn ban đầu" }] }) : `<p class="muted">Đường tài sản hiện sau vài giờ chạy.</p>`)}
        ${panel("Lệnh đang mở", st?.pos?.length ? `<div class="tw"><table><thead><tr><th class="l">Coin</th><th class="l">Lệnh</th><th>Vào</th><th>Giá</th><th>Cắt lỗ</th><th>MT1 / MT2</th><th>Lãi/lỗ</th><th class="l">Trạng thái</th></tr></thead><tbody>${st.pos.map((p) => { const m = pxNow(p.k) || p.e, u = p.sd * p.q * (m - p.e) + p.real - p.fee0 - p.fund, rr = p.risk_usd ? u / p.risk_usd : null;
            return `<tr><td class="l">${coinLink(p.k, "/smc")}</td><td class="l"><b class="${p.sd > 0 ? "up" : "down"}">${p.sd > 0 ? "Long" : "Short"}</b> ${p.mkt === "spot" ? "spot" : "fut x" + p.lev}<br><small class="faint">${esc(p.name || "")} · ${p.tf === "d" ? "ngày" : "4h"}</small></td><td>${px(p.e)}</td><td>${px(m)}</td><td class="down">${px(p.s)}${p.s !== p.s0 ? "<br><small>hoà vốn</small>" : ""}</td><td class="up">${px(p.t1)} / ${px(p.t2)}</td><td class="${cls(u)}">${u >= 0 ? "+" : ""}${usd2(u)}<br><small>${isNum(rr) ? nf(rr, 2) + "R" : ""}</small></td><td class="l">${p.tp1 ? '<span class="pill buy">đã chốt MT1</span>' : '<span class="pill">chờ MT1</span>'}<br><small class="faint">mở ${dt(p.opened + "Z")}</small></td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted">Không có lệnh đang mở.</p>`)}
        ${panel("Lệnh đã đóng", st?.hist?.length ? `<div class="tw" style="max-height:340px"><table><thead><tr><th class="l">Coin</th><th class="l">Lệnh</th><th>Vào</th><th>Lãi/lỗ</th><th>R</th><th class="l">Lý do</th><th>Đóng lúc</th></tr></thead><tbody>${st.hist.slice().reverse().map((h) => `<tr><td class="l">${coinLink(h.k)}</td><td class="l">${h.side === "long" ? "Long" : "Short"} ${h.mkt === "spot" ? "spot" : "fut x" + h.lev}</td><td>${px(h.e)}</td><td class="${cls(h.pnl)}">${h.pnl >= 0 ? "+" : ""}${usd2(h.pnl)}</td><td class="${cls(h.r)}">${isNum(h.r) ? nf(h.r, 2) : "—"}</td><td class="l">${esc({ SL: "Cắt lỗ", BE: "Hoà vốn sau MT1", TP1: "MT1", TP2: "MT2", TIME: "Hết thời gian", LIQ: "Thanh lý", MANUAL: "Anh đóng", PAUSE: "Tạm dừng", SUP_CUT: "Giám sát cắt", SUP_ROT: "Giám sát đổi lệnh" }[h.why] || h.why)}</td><td><small>${dt(h.closed + "Z")}</small></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có lệnh nào đóng.</p>`)}
        ${panel("📝 Nhật ký hành động", st?.log?.length ? `<ul class="bot-log">${st.log.slice().reverse().slice(0, 80).map((l) => `<li class="${l.k}"><small>${dt(l.t + "Z")}</small> ${esc(l.m)}</li>`).join("")}</ul>` : `<p class="muted">Chưa có hoạt động.</p>`)}
      </div>
      <div>${PG("Thiết lập")}${panel(`⚙️ Thiết lập: ${esc(C.name)}`, `<div id="bForm"></div>`)}
        ${panel("🔗 Giai đoạn 2: lệnh thật trên Binance", `<p class="sbp">Khi bot chạy ổn trên sàn thử vài tuần, anh sẽ chuyển sang Binance bằng một <b>khoá API riêng cho bot</b>: chỉ bật quyền Giao dịch (Spot & Futures), <b>tắt quyền Rút tiền</b>, và tự dán khoá vào phần bí mật của máy chủ – em không bao giờ thấy khoá. Có thể tắt khoá bất cứ lúc nào trên Binance.</p><p class="faint" style="font-size:.75rem">Chưa bật được ở giai đoạn này: máy chủ chạy bot đặt ở Mỹ, nơi Binance.com chặn kết nối – cần một máy chủ đặt ở châu Á để gửi lệnh. Em sẽ làm phần này khi anh sẵn sàng.</p>`)}</div>
    </div>`;
  // ---- form
  const T2 = (k, v) => `<button type="button" data-${k}="${v}"`;
  const form = () => {
    const m = botMatch(C, items, S), avgR = m.length ? m.reduce((a, x) => a + (x.avgR || 0), 0) / m.length : null;
    const hist = ["d", "h4"].filter((tf) => C.tf === "both" || C.tf === tf).flatMap((tf) => Object.entries(stats[tf] || {}).filter(([k]) => k !== "_all" && C.play.some((f) => BOT_FAM[f].includes(k)) && (C.sides === "both" || (C.sides === "long") === /_up$/.test(k))).map(([, v]) => v[reg] || v.all || {}))
      .filter((v) => isNum(v.avgR) && (v.n || 0) >= 100 && v.avgR >= C.min_avgR && (v.win1 || 0) >= C.min_win && (!C.edge_only || (v.avgR >= 0.05 && !(v.avgR_2y <= 0))));
    const hR = hist.length ? hist.reduce((a, v) => a + v.avgR * v.n, 0) / hist.reduce((a, v) => a + v.n, 0) : null;
    const perTrade = C.risk * (hR ?? avgR ?? 0.1), need = perTrade > 0 ? Math.ceil(C.target_month / perTrade) : null;
    $("#bForm").innerHTML = `
      <h4 class="bfh">1 · Mục tiêu & vốn</h4><div class="filters bff">
        <div class="field"><label>Tên bot</label><input id="b_name" value="${esc(C.name)}"></div>
        <div class="field"><label>Vốn giao cho bot (USDT)</label><input id="b_capital" inputmode="decimal" value="${C.capital}"></div>
        <div class="field"><label>Lợi nhuận mục tiêu / tháng (%)</label><input id="b_target_month" inputmode="decimal" value="${C.target_month}"></div>
        <div class="field"><label>Sụt tối đa → tạm dừng (%)</label><input id="b_max_dd" inputmode="decimal" value="${C.max_dd}"></div>
        <label class="chk"><input type="checkbox" id="b_protect" ${C.protect ? "checked" : ""}> Đạt mục tiêu tháng thì giảm 1/2 rủi ro để giữ lãi</label></div>
      <h4 class="bfh">2 · Khẩu vị rủi ro</h4><div class="bpre">${Object.entries(BOT_PRE).map(([k, p]) => `${T2("pre", k)} class="${C.preset === k ? "on" : ""}"><b>${p.t}</b><small>${p.d}</small></button>`).join("")}</div>
      <details class="badv"><summary>Tuỳ chỉnh chi tiết</summary><div class="filters bff">
        <div class="field"><label>Rủi ro mỗi lệnh (% tài sản)</label><input id="b_risk" inputmode="decimal" value="${C.risk}"></div>
        <div class="field"><label>Số lệnh mở cùng lúc tối đa (≤ 20)</label><input id="b_max_pos" inputmode="numeric" value="${C.max_pos}"></div>
        <div class="field"><label>Đòn bẩy tối đa (≤ x5, hệ thống còn hạ thêm)</label><input id="b_max_lev" inputmode="numeric" value="${C.max_lev}"></div>
        <div class="field"><label>Ngừng mở lệnh khi lỗ trong ngày (%)</label><input id="b_daily_stop" inputmode="decimal" value="${C.daily_stop}"></div></div></details>
      <h4 class="bfh">3 · Phong cách & cách chơi</h4>
      <div class="bseg">${[["both", "Swing + lướt"], ["d", "Swing khung ngày (giữ vài ngày–tuần)"], ["h4", "Lướt khung 4h (giữ vài giờ–ngày)"]].map(([v, t]) => `${T2("tf", v)} class="${C.tf === v ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="bseg">${[["trend", "📈 Theo xu hướng", "hồi Fibonacci, phá đỉnh/đáy"], ["reversal", "🔄 Bắt đảo chiều", "quét thanh khoản + CHoCH, quá mua/bán"], ["smc", "🧱 Smart Money", "hồi về Order Block"]].map(([v, t, d]) => `${T2("play", v)} class="${C.play.includes(v) ? "on" : ""}" title="${d}">${t}</button>`).join("")}</div>
      <div class="bseg">${[["both", "Long & Short"], ["long", "Chỉ Long"], ["short", "Chỉ Short"]].map(([v, t]) => `${T2("sides", v)} class="${C.sides === v ? "on" : ""}">${t}</button>`).join("")}
        <label class="chk"><input type="checkbox" id="b_spot" ${C.spot ? "checked" : ""}> Spot</label><label class="chk"><input type="checkbox" id="b_fut" ${C.fut ? "checked" : ""}> Futures</label></div>
      <h4 class="bfh">4 · Phạm vi nghiên cứu</h4>
      <p class="faint bfp">Chọn nhóm ngành bot được đánh (để trống = toàn thị trường).</p>
      <div class="bchips">${groups.map((g) => `${T2("sec", esc(g))} class="${C.sectors.includes(g) ? "on" : ""}">${esc(g)}</button>`).join("")}</div>
      <div class="filters bff"><div class="field"><label>Thêm coin cụ thể</label><input id="b_coins" placeholder="vd BTC, ETH, SOL" value="${esc(C.coins.join(", "))}"></div>
        <div class="field"><label>Loại trừ coin</label><input id="b_exclude" placeholder="vd PEPE, DOGE" value="${esc(C.exclude.join(", "))}"></div>
        <label class="chk" title="Long chỉ ở nhóm Dẫn dắt/Cải thiện, Short chỉ ở nhóm Tụt hậu/Suy yếu"><input type="checkbox" id="b_sector_lead" ${C.sector_lead ? "checked" : ""}> Chỉ đánh thuận dòng tiền nhóm ngành</label></div>
      <h4 class="bfh">5 · Bộ lọc chất lượng & quản lý lệnh</h4><div class="filters bff">
        <label class="chk"><input type="checkbox" id="b_edge_only" ${C.edge_only ? "checked" : ""}> Chỉ thiết lập có lợi thế lịch sử</label>
        <label class="chk"><input type="checkbox" id="b_htf_align" ${C.htf_align ? "checked" : ""}> Bắt buộc khung lớn cùng chiều</label>
        <div class="field"><label>Xác suất chạm MT1 tối thiểu (%)</label><input id="b_min_win" inputmode="decimal" value="${C.min_win}"></div>
        <div class="field"><label>Lãi TB tối thiểu (R)</label><input id="b_min_avgR" inputmode="decimal" value="${C.min_avgR}"></div>
        <div class="field"><label>Chốt bao nhiêu % ở MT1</label><input id="b_tp1_part" inputmode="numeric" value="${C.tp1_part}"></div>
        <label class="chk"><input type="checkbox" id="b_be_after_tp1" ${C.be_after_tp1 ? "checked" : ""}> Dời cắt lỗ về hoà vốn sau MT1</label>
        <label class="chk"><input type="checkbox" id="b_time_stop" ${C.time_stop ? "checked" : ""}> Đóng lệnh khi quá hạn kỳ vọng</label></div>
      <h4 class="bfh">6 · Kỷ luật & quản lý dòng tiền</h4><p class="faint bfp">Mở được nhiều lệnh nhưng tổng rủi ro luôn bị khoá trần – thua chuỗi hay tài sản đi xuống thì bot tự giảm khối lượng.</p><div class="filters bff">
        <div class="field"><label>Tổng rủi ro đang mở tối đa (% tài sản)</label><input id="b_max_heat" inputmode="decimal" value="${C.max_heat}"></div>
        <div class="field"><label>Số lệnh tối đa mỗi nhóm ngành</label><input id="b_max_sector" inputmode="numeric" value="${C.max_sector}"></div>
        <div class="field"><label>Tổng giá trị vị thế tối đa (× tài sản)</label><input id="b_max_gross" inputmode="decimal" value="${C.max_gross}"></div>
        <div class="field"><label>Luôn giữ tiền mặt tối thiểu (%)</label><input id="b_cash_min" inputmode="decimal" value="${C.cash_min}"></div>
        <label class="chk"><input type="checkbox" id="b_streak_cut" ${C.streak_cut ? "checked" : ""}> Thua 3 lệnh liên tiếp → giảm 1/2 rủi ro 24 giờ</label>
        <label class="chk"><input type="checkbox" id="b_eq_ma" ${C.eq_ma ? "checked" : ""}> Tài sản dưới trung bình 20 giờ → giảm 1/2 rủi ro</label></div>
      <h4 class="bfh">7 · Mô hình học theo từng mã</h4><div class="filters bff">
        <label class="chk" title="Bỏ thiết lập mà lịch sử riêng của mã cho thấy lỗ; xếp hạng & lọc theo xác suất của mô hình học máy; dùng mục tiêu đã tối ưu theo mã"><input type="checkbox" id="b_use_model" ${C.use_model ? "checked" : ""}> Dùng sổ tay từng mã + học máy để lọc, xếp hạng và đặt mục tiêu</label></div>
      <div class="bexp">
        <div><i>Khớp cấu hình lúc này</i><b>${m.length} lệnh</b><small>${m.slice(0, 4).map((x) => `${esc(x.k)} ${x.side === "long" ? "L" : "S"}`).join(" · ") || "không có"}</small></div>
        <div><i>Lãi TB lịch sử của các thiết lập đã chọn</i><b class="${cls(hR)}">${isNum(hR) ? nf(hR, 2) + "R" : "—"}</b><small>${hist.length} thiết lập, đã trừ phí</small></div>
        <div><i>Kỳ vọng mỗi lệnh</i><b class="${cls(perTrade)}">${pct(perTrade, 2)}</b><small>= rủi ro ${nf(C.risk, 1)}% × lãi TB</small></div>
        <div><i>Để đạt ${nf(C.target_month, 1)}%/tháng</i><b>${need ? "≈ " + need + " lệnh/tháng" : "—"}</b><small>${!need ? "" : need <= 12 ? "khả thi với cấu hình này" : need <= 30 ? "khó – cần nhiều tín hiệu" : "không thực tế – hạ mục tiêu hoặc tăng rủi ro"}</small></div></div>
      <div class="bsave"><button class="btn primary" id="bSave">💾 Lưu thiết lập</button><small class="faint">Bot dùng thiết lập mới từ phút kế tiếp; danh sách ứng viên cập nhật mỗi 15 phút.</small></div>`;
    const rd = () => { const g = (id) => $("#b_" + id); ["name"].forEach((k) => (C[k] = g(k).value.trim() || "Bot của tôi"));
      ["capital", "target_month", "max_dd", "risk", "max_pos", "max_lev", "daily_stop", "min_win", "min_avgR", "tp1_part", "max_heat", "max_sector", "max_gross", "cash_min"].forEach((k) => { const v = numIn(g(k).value); if (isFinite(v)) C[k] = v; });
      ["protect", "spot", "fut", "sector_lead", "edge_only", "htf_align", "be_after_tp1", "time_stop", "streak_cut", "eq_ma", "use_model"].forEach((k) => (C[k] = g(k).checked));
      C.coins = g("coins").value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => BYK[x]); C.exclude = g("exclude").value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean); };
    $$("#bForm [data-pre]").forEach((b) => b.onclick = () => { rd(); C.preset = b.dataset.pre; Object.assign(C, BOT_PRE[C.preset].v); form(); });
    $$("#bForm [data-tf]").forEach((b) => b.onclick = () => { rd(); C.tf = b.dataset.tf; form(); });
    $$("#bForm [data-sides]").forEach((b) => b.onclick = () => { rd(); C.sides = b.dataset.sides; form(); });
    $$("#bForm [data-play]").forEach((b) => b.onclick = () => { rd(); const v = b.dataset.play; C.play = C.play.includes(v) ? C.play.filter((x) => x !== v) : [...C.play, v]; if (!C.play.length) C.play = [v]; form(); });
    $$("#bForm [data-sec]").forEach((b) => b.onclick = () => { rd(); const v = b.dataset.sec; C.sectors = C.sectors.includes(v) ? C.sectors.filter((x) => x !== v) : [...C.sectors, v]; form(); });
    $$("#bForm input").forEach((e) => e.onchange = () => { rd(); form(); });
    $("#bSave").onclick = async () => { rd(); Object.assign(B.find((b) => b.id === id), C); await putAll(); toast("Đã lưu thiết lập bot"); viewBot(id); };
  };
  form();
  // ---- mô hình học theo từng mã: 1 câu kết luận · 3 con số dễ hiểu · bảng 1 dòng / mã · chi tiết kỹ thuật thu gọn
  tryLoad("data/coinmodel.json").then((CM) => {
    if (!CM || !$("#bModel")) return;
    const ml = CM.ml || {}, FN = { r1: "R:R tới MT1", prior_win: "trí nhớ của mã (thắng quá khứ)", setup_i: "loại thiết lập", compress: "độ nén giá (tam giác)", dslow: "khoảng cách MA200", mom10: "đà 10 nến", mom30: "đà 30 nến", stop_atr: "độ rộng cắt lỗ (ATR)", d20: "khoảng cách EMA20", d50: "khoảng cách EMA50", volz: "khối lượng bất thường", tri: "tam giác hội tụ", lo_slope: "độ dốc đáy", hi_slope: "độ dốc đỉnh", fibpos: "vị trí Fibonacci", rsi: "RSI", atrp: "biến động (ATR%)", slope50: "độ dốc EMA50", htf: "khung lớn", btc: "BTC trên/dưới MA200", mf: "dòng tiền chủ động", side: "chiều Long/Short", tf_d: "khung ngày/4h", prior_n: "số lần mã đã có tín hiệu" };
    const imp = Object.entries(ml.importance || {}).filter(([, v]) => v > 0), mx = Math.max(1e-9, ...imp.map(([, v]) => v));
    const NM = I?.names || {}, NMr = Object.fromEntries(Object.entries(NM).map(([a, b]) => [b, a]));
    const sn = (s) => esc(String(NM[s] || s).replace(/^SMC: /, "")), tfn = (tf) => (tf === "d" ? "ngày" : "4h");
    const PL = { prefer: ["buy", "Hợp"], ok: ["", "Được"], weak: ["warn", "Yếu"], avoid: ["sell", "Tránh"] };
    const on = C.use_model !== false, useML = on && ml.ok, pos = st?.pos || [], cands = st?.think?.cands || [];
    const keys = [...new Set([...pos.map((p) => p.k), ...cands.map((t) => t.k)])].slice(0, 12);
    const book = (k) => ["d", "h4"].flatMap((tf) => Object.entries(CM.coins?.[k]?.[tf] || {}).map(([s, v]) => ({ tf, s, ...v }))).sort((a, b) => b.shr - a.shr);
    const one = (v) => v ? `<span>${sn(v.s)} · ${tfn(v.tf)}</span><small class="faint">thắng ${nf(v.win, 0)}% · ${v.n} lần · ${v.shr >= 0 ? "+" : ""}${nf(v.shr, 2)}R/lệnh</small>` : `<small class="faint">—</small>`;
    const verdict = !on ? ["", "⏸", "Anh đang tắt phần này trong thiết lập bot – bot không dùng sổ tay từng mã, cũng không dùng điểm học máy."]
      : useML ? ["up", "✅", `Bot đang dùng cả hai lớp: <b>bỏ cách vào lệnh mà mã đó hay thua</b> (sổ tay) và <b>bỏ tín hiệu mô hình chấm dưới ${nf(C.min_win, 0)}%</b> khả năng chạm MT1.`]
      : ["warn", "⚠️", `Bot chỉ dùng <b>sổ tay từng mã</b> (bỏ cách vào lệnh mà mã đó hay thua). Điểm học máy <b>tạm chưa dùng</b> vì ${ml.auc ? "chưa đoán tốt hơn cách thống kê đơn giản" : esc(ml.why || "chưa huấn luyện")}.`];
    const rows = keys.map((k) => {
      const B = book(k), best = B.find((v) => v.play === "prefer" || v.play === "ok"), worst = [...B].reverse().find((v) => v.play === "avoid");
      const p = pos.find((x) => x.k === k), t = cands.find((x) => x.k === k), tn = CM.tune?.[k] || {};
      const now = p ? `<span class="pill brand">đang giữ</span> ${p.sd > 0 ? "Long" : "Short"} · ${tfn(p.tf)}` : t ? `${t.side === "long" ? "Long" : "Short"} · ${esc(String(t.name || "").replace(/^SMC: /, ""))} · ${tfn(t.tf)}${t.play && PL[t.play] ? ` <span class="pill ${PL[t.play][0]}" title="Lịch sử riêng của mã với đúng cách vào lệnh này">${PL[t.play][1]}</span>` : ""}` : "—";
      const pm = p?.pm ?? t?.pm, pass = isNum(pm) && pm >= C.min_win;
      const tg = [tn.d?.m ? `ngày ${nf(tn.d.m, 1)}R` : "", tn.h4?.m ? `4h ${nf(tn.h4.m, 1)}R` : ""].filter(Boolean).join(" · ");
      return `<div class="bm-row"><div class="bm-k1">${coinLink(k)}${tg ? `<small class="faint" title="Mục tiêu chốt lời đã tối ưu riêng cho mã (mặc định 1,5R)">🎯 ${tg}</small>` : ""}</div>
        <div class="bm-k2"><small class="faint bm-lb">Bot đang xét</small>${now}</div>
        <div class="bm-k3" title="Xác suất chạm MT1 do mô hình học máy ước cho đúng tín hiệu này">${isNum(pm) ? `<b class="${pass ? "up" : "down"}">🧬 ${nf(pm, 0)}%</b><small class="faint">${pass ? "đạt" : "dưới"} ngưỡng ${nf(C.min_win, 0)}%</small>` : `<small class="faint">chưa chấm</small>`}</div>
        <div class="bm-k4"><small class="faint bm-lb">✅ Hợp</small>${B.length ? one(best) : `<small class="faint">chưa đủ lịch sử</small>`}</div><div class="bm-k5"><small class="faint bm-lb">⛔ Tránh</small>${one(worst)}</div></div>`;
    });
    const full = keys.map((k) => { const B = book(k); return B.length ? `<div class="bm-c"><b>${coinLink(k)}</b><div class="bm-r">${B.map((v) => `<span class="pill ${PL[v.play]?.[0] || ""}" title="${esc(NM[v.s] || v.s)} · ${v.n} lần · thắng ${nf(v.win, 0)}% · lãi TB thực ${nf(v.avgR, 2)}R">${sn(v.s).slice(0, 26)} ${tfn(v.tf)} ${nf(v.shr, 2)}R</span>`).join("")}</div></div>` : ""; }).join("");
    $("#bModel").innerHTML = panel("🧬 Mô hình học theo từng mã", `<p class="bm-v ${verdict[0]}"><span>${verdict[1]}</span><span>${verdict[2]}</span></p>
      ${ml.auc ? `<div class="bexp bm-k">
        <div title="AUC trên dữ liệu mô hình chưa từng học: lấy ngẫu nhiên 1 tín hiệu thắng và 1 tín hiệu thua, mô hình chấm tín hiệu thắng cao hơn bao nhiêu % số lần"><i>Nhận ra tín hiệu thắng</i><b class="${ml.ok ? "up" : "down"}">${nf(ml.auc * 100, 0)}/100</b><small>đoán mò 50 · thống kê đơn giản ${nf(ml.auc_base * 100, 0)}</small></div>
        <div><i>Chỉ vào 30% tín hiệu điểm cao nhất</i><b class="${cls(ml.avgR_top30)}">${ml.avgR_top30 >= 0 ? "+" : ""}${nf(ml.avgR_top30, 2)}R/lệnh</b><small>vào tất cả: ${ml.avgR_all >= 0 ? "+" : ""}${nf(ml.avgR_all, 2)}R/lệnh</small></div>
</div>` : ""}
      <p class="faint bm-n" style="margin:-6px 0 10px">Học từ ${nf(CM.n_rows, 0)} tín hiệu cũ · học lại mỗi tuần · lần cuối ${CM.trained_at ? esc(new Date(CM.trained_at).toLocaleDateString(LOC)) : "—"}</p>
      <p class="sbh">Các mã bot đang xét</p>
      ${keys.length ? `<div class="bm-l"><div class="bm-row bm-hd"><div>Coin</div><div>Bot đang xét</div><div>Mô hình chấm</div><div>✅ Mã này hợp nhất với</div><div>⛔ Mã này nên tránh</div></div>${rows.slice(0, 6).join("")}${rows.length > 6 ? `<details class="bm-more"><summary>Xem thêm ${rows.length - 6} mã</summary>${rows.slice(6).join("")}</details>` : ""}</div>
        <p class="faint bm-n"><b>Hợp / Được / Yếu / Tránh</b> = lịch sử riêng của mã với cách vào lệnh đó (đã cân với trung bình chung để mã ít dữ liệu không bị chấm quá tay). <b>R</b> = bội số của mức rủi ro: +1R là lời đúng bằng số tiền chấp nhận mất.</p>`
        : `<p class="muted">Bật bot để thấy sổ tay của các mã bot đang xét.</p>`}
      <details class="bm-d"><summary>Chi tiết kỹ thuật – mô hình dựa vào gì, sổ tay đầy đủ</summary>
        ${ml.auc ? `<p class="faint">Kiểm tra trên ${nf(ml.n_test, 0)} tín hiệu gần nhất (20% dữ liệu) mà mô hình không được học · AUC ${nf(ml.auc, 3)} (thống kê thuần ${nf(ml.auc_base, 3)}) · Brier ${nf(ml.brier, 4)} (thống kê thuần ${nf(ml.brier_base, 4)}, càng thấp càng tốt) · tỉ lệ chạm MT1 chung ${nf(ml.base_rate, 0)}%. Chỉ dùng mô hình khi cả hai chỉ số đều tốt hơn thống kê thuần.</p>` : ""}
        ${imp.length ? `<p class="sbh">Mô hình dựa vào gì nhiều nhất</p><div class="bm-ig">${imp.map(([f, v]) => `<div class="bm-i"><span>${esc(FN[f] || f)}</span><i><i style="width:${(v / mx * 100).toFixed(0)}%"></i></i></div>`).join("")}</div>` : ""}
        ${full ? `<p class="sbh">Sổ tay đầy đủ (mọi cách vào lệnh, lãi TB đã cân / lệnh)</p>${full}` : ""}
        <p class="faint" style="font-size:.75rem">Các phương pháp hình học như "định lý Pytago", tam giác cân / đều trên biểu đồ chưa có bằng chứng thống kê; mô hình chỉ dùng những gì đo được (độ nén tam giác, Fibonacci, khối lượng, xu hướng…) và giữ lại cái nào thực sự giúp dự đoán trên dữ liệu chưa từng thấy. Dự đoán là xác suất, không phải chắc chắn.</p></details>`, "mỗi mã một cách chơi");
  });
  const save = async (patch, msg) => { Object.assign(C, patch); Object.assign(B.find((b) => b.id === id), C); await putAll(); toast(msg); viewBot(id); };
  $("#bOn").onclick = () => save({ enabled: !C.enabled }, C.enabled ? "Đã tắt bot – lệnh đang mở vẫn được quản lý tới khi đóng" : "Đã bật bot – bot bắt đầu theo dõi trong vòng 1–2 phút");
  if ($("#bRes")) $("#bRes").onclick = () => save({ resume_at: new Date().toISOString() }, "Bot sẽ chạy lại ở lượt kế tiếp");
  $("#bClose").onclick = () => { if (confirm("Đóng TẤT CẢ lệnh của bot theo giá thị trường ở lượt chạy kế tiếp?")) save({ close_all_at: new Date().toISOString() }, "Bot sẽ đóng hết lệnh ở lượt kế tiếp"); };
  $("#bReset").onclick = () => { if (confirm(`Xoá toàn bộ lịch sử bot và bắt đầu lại với ${usd(C.capital)}?`)) save({ reset_at: new Date().toISOString() }, "Bot sẽ khởi tạo lại ở lượt kế tiếp"); };
  const nid = () => { let i = 1; while (B.some((b) => b.id === "b" + i)) i++; return "b" + i; };
  if ($("#bDel")) $("#bDel").onclick = async () => { if (!confirm(`Xoá bot "${C.name}"? Lịch sử của bot này sẽ mất.`)) return; B = B.filter((b) => b.id !== id); await putAll(); lsSet("botsel", B[0].id); toast("Đã xoá bot"); location.hash = "#/bot/" + B[0].id; };
  if ($("#bAdd")) $("#bAdd").onclick = async () => { const n = { ...C, id: nid(), name: `${C.name} (bản sao)`, enabled: false, reset_at: null, close_all_at: null, resume_at: null }; B.push(n); await putAll(); toast("Đã thêm bot – chỉnh thiết lập rồi bấm Bật"); location.hash = "#/bot/" + n.id; };
  if ($("#bTrio")) $("#bTrio").onclick = async () => {
    if (!confirm("Tạo 3 bot Thận trọng / Cân bằng / Mạo hiểm (cùng phạm vi & vốn với bot đang chọn) và bật cả 3?")) return;
    for (const k of ["safe", "bal", "aggr"]) { if (B.length >= 6) break; B.push({ ...C, ...BOT_PRE[k].v, preset: k, id: nid(), name: BOT_PRE[k].t.replace(/^\S+\s/, "") + " – so sánh", enabled: true, reset_at: null, close_all_at: null, resume_at: null }); }
    await putAll(); toast("Đã tạo bộ so sánh – 3 bot bắt đầu trong 1–2 phút"); viewBot(id);
  };
  // tự làm mới trạng thái mỗi phút khi anh đang xem (không đụng vào form đang sửa)
  clearInterval(window.__botT); let dirty = false; $("#bForm").addEventListener("input", () => (dirty = true));
  window.__botT = setInterval(async () => {
    if (!/^#\/bot(\/(?!scalp|sup|days|home|binance|journal)[^/]*)?$/.test(location.hash)) { clearInterval(window.__botT); return; }     // chỉ trang Đội bot (trước đây cả #/bot/scalp → thỉnh thoảng vẽ trang Đội bot đè lên Bot Phản Xạ)
    if (document.hidden || dirty || userBusy() || document.activeElement?.closest?.("#bForm")) return;
    try { const r = await Store.get("botstate"); const s2 = statesOf(r.data)[id]; if (s2?.last && s2.last !== st?.last) softRender(() => viewBot(id)); } catch (e) { /* bỏ qua */ }
  }, 60000);
}

async function viewSup() {
  if (ME && !can("bot")) { app().innerHTML = `<div class="ph"><h1>🛡️ Bot giám sát</h1></div><div class="panel"><p class="muted">🔒 Dành cho gói Pro.</p></div>`; return; }
  const [rc, rs, rq, rv] = await Promise.all([Store.get("bot"), Store.get("botstate"), Store.get("sup"), Store.get("supstate")]);
  let B = botsOf(rc.data).map((b, i) => ({ ...BOT_DEF, ...b, id: b.id || "b" + (i + 1) }));
  const SS = statesOf(rs.data), ss = rv.data || {}, C = { ...SUP_DEF, ...(rq.data || {}) }, a = ss.acct || {}, TH = ss.think || {};
  const nm = (id) => esc(B.find((b) => b.id === id)?.name || id || "");
  const status = !C.enabled ? ["Đang tắt", "", "Bật để bot giám sát theo dõi rủi ro chung, khám nghiệm lệnh và rút bài học."] : ss.halt ? ["⛔ Khoá toàn tài khoản", "sell", ss.halt.why] : C.mode === "auto" ? ["● Đang giám sát · tự hành động", "buy", ss.at ? `kiểm tra mỗi phút · gần nhất ${agoShort(ss.at + "Z")} trước` : "chờ lượt chạy đầu tiên (≤ 2 phút)"] : ["● Chỉ khuyên", "warn", "ghi lại đề xuất, không tự cắt / đổi / dừng bot"];
  const on = (ss.lessons || []).filter((l) => l.on && !C.off.includes(l.id)), SC = ss.self?.cut || { ok: 0, bad: 0, R: 0 };
  const bar = (v, max, c2) => `<i class="bot-bar"><i class="${c2}" style="width:${Math.max(2, Math.min(100, (v / (max || 1)) * 100)).toFixed(0)}%"></i></i>`;
  // ---- giám sát đang nghĩ gì: từng lệnh đang mở
  const items = (TH.items || []).map((it) => { const d = SUP_D[it.dec] || [it.dec, ""];
    return `<div class="sup-it"><div class="sup-h"><span class="pill ${d[1]}">${d[0]}</span><b>${it.side === "long" ? "Long" : "Short"} ${esc(it.k)}</b><small class="faint">${esc(it.bn || nm(it.b))}</small><span class="${cls(it.uR)}">đang ${supSg(it.uR)}R</span></div>
      <div class="sup-pb" title="Xác suất tới ${esc(it.tgt)} trước cắt lỗ: bot giám sát ước ${pct(it.pn * 100, 0, false)}; nếu giá đi hoàn toàn ngẫu nhiên là ${pct(it.prw * 100, 0, false)}"><i style="width:${(it.pn * 100).toFixed(0)}%"></i><b style="left:${(it.prw * 100).toFixed(0)}%"></b></div>
      <small class="faint">Xác suất tới ${esc(it.tgt)} <b>${pct(it.pn * 100, 0, false)}</b> (ngẫu nhiên ${pct(it.prw * 100, 0, false)} · lợi thế ×${nf(it.E, 2)}) · kỳ vọng nếu giữ <b class="${cls(it.EV)}">${supSg(it.EV)}R</b>${(it.why || []).length ? ` · ${esc(it.why.join("; "))}` : ""}</small></div>`; }).join("");
  // ---- chấm điểm bot
  const cards = Object.entries(ss.cards || {});
  const cardT = cards.length ? `<div class="tw"><table><thead><tr><th class="l">Bot</th><th class="l">Đánh giá</th><th>Lệnh</th><th>Thắng</th><th>Lãi TB</th><th title="Khoảng tin cậy 80% của lãi TB mỗi lệnh – hẹp dần khi có thêm lệnh">Tin cậy 80%</th><th title="Tổng lãi ÷ tổng lỗ">PF</th><th>20 lệnh gần</th><th>Phí</th><th title="Phí ÷ lãi gộp của các lệnh thắng">Phí / lãi gộp</th></tr></thead><tbody>${cards.map(([id, c]) => { const v = SUP_V[c.v] || [c.v, ""];
      return `<tr><td class="l"><a href="#/bot/${enc(id)}"><b>${esc(c.name)}</b></a>${c.paused ? ' <span class="pill sell">tạm dừng</span>' : !c.enabled ? ' <span class="pill">tắt</span>' : ""}</td><td class="l"><span class="pill ${v[1]}">${v[0]}</span></td><td>${c.n}</td><td>${isNum(c.win) ? c.win + "%" : "—"}</td><td class="${cls(c.avgR)}">${supSg(c.avgR)}R</td><td><small>${isNum(c.lo) ? `${supSg(c.lo)} … ${supSg(c.hi)}` : "—"}</small></td><td>${isNum(c.pf) ? nf(c.pf, 2) : "—"}</td><td class="${cls(c.last20)}">${supSg(c.last20)}R</td><td>${usd2(c.fees)}${c.fund ? `<br><small class="faint">funding ${usd2(c.fund)}</small>` : ""}</td><td class="${c.fee_share > 25 ? "down" : ""}">${isNum(c.fee_share) ? nf(c.fee_share, 0) + "%" : "—"}</td></tr>
        <tr class="sup-why"><td colspan="10"><small>${esc(c.why)}</small>${(c.sug || []).map((s, i) => `<div class="sup-sug">💡 ${esc(s.t)}${s.patch ? ` <button class="btn sm" data-sug="${enc(id)}|${i}">Áp dụng</button>` : s.from ? ` <a class="btn sm" href="#/bot/${enc(s.from)}">Xem</a>` : ""}</div>`).join("")}</td></tr>`; }).join("")}</tbody></table></div>`
    : `<p class="muted">Chưa có bot nào chạy.</p>`;
  // ---- bài học
  const L = ss.lessons || [];
  const lesT = L.length ? `<div class="tw"><table><thead><tr><th class="l">Lỗi</th><th class="l">Trạng thái</th><th>Số lệnh</th><th title="Lãi TB của lệnh có lỗi này">Có lỗi</th><th title="Lãi TB các lệnh còn lại">Không lỗi</th><th>% thua</th><th title="Tổng R mất ở các lệnh thua có lỗi này">Thiệt hại</th><th title="Khi bài học chặn một tín hiệu, bot giám sát theo dõi xem giá về cắt lỗ trước (chặn đúng) hay tới MT1 trước (chặn nhầm)">Chặn đúng / nhầm</th></tr></thead><tbody>${L.map((l) => {
      const off = C.off.includes(l.id), s = l.on ? (off ? ["ANH ĐÃ TẮT", ""] : ["ĐANG ÁP DỤNG", "buy"]) : l.adv ? ["KHUYÊN", "warn"] : /tự gỡ/.test(l.note) ? ["ĐÃ GỠ", "sell"] : ["CHƯA ĐỦ BẰNG CHỨNG", ""];
      return `<tr><td class="l"><b>${esc(l.t)}</b></td><td class="l"><span class="pill ${s[1]}">${s[0]}</span></td><td>${l.n}</td><td class="${cls(l.rA)}">${supSg(l.rA)}R</td><td class="${cls(l.rB)}">${supSg(l.rB)}R</td><td>${l.loss}%</td><td class="down">${supSg(l.cost, 1)}R</td><td>${l.sh ? `${l.sh.ok} / ${l.sh.bad}` : "—"}</td></tr>
        <tr class="sup-why"><td colspan="8"><div class="sup-sug">${l.on || l.adv ? "👉" : "·"} ${esc(l.how)}${l.note ? ` <span class="faint">– ${esc(l.note)}</span>` : ""}${l.on ? ` <button class="btn sm" data-off="${l.id}">${off ? "Bật lại" : "Tắt bài học này"}</button>` : ""}</div></td></tr>`; }).join("")}</tbody></table></div>`
    : `<p class="muted">Chưa có lệnh nào đóng để khám nghiệm. Bài học chỉ thành quy tắc khi có ≥ 6 lệnh mắc cùng một lỗi và các lệnh đó lỗ rõ hơn phần còn lại.</p>`;
  const blk = (ss.blocks || []).filter((b) => new Date(b.until + "Z") > new Date());
  // ---- khám nghiệm
  const rev = Object.values(ss.rev || {}).filter((x) => !x.old).sort((x, y) => (y.closed || "").localeCompare(x.closed || "")).slice(0, 60);
  const WHYL = { SL: "Cắt lỗ", BE: "Hoà vốn", TP1: "MT1", TP2: "MT2", TIME: "Hết thời gian", LIQ: "Thanh lý", MANUAL: "Anh đóng", SUP_CUT: "Giám sát cắt", SUP_ROT: "Giám sát đổi lệnh" };
  const revT = rev.length ? `<div class="tw" style="max-height:380px"><table><thead><tr><th class="l">Đóng lúc</th><th class="l">Bot</th><th class="l">Lệnh</th><th>R</th><th class="l">Lý do</th><th title="Đi được xa nhất / ngược xa nhất trong lúc giữ">Xa nhất +/−</th><th class="l">Lỗi tìm thấy</th></tr></thead><tbody>${rev.map((x) => `<tr><td class="l"><small>${dt(x.closed + "Z")}</small></td><td class="l"><small>${nm(x.b)}</small></td><td class="l">${coinLink(x.k)} <small>${x.side === "long" ? "Long" : "Short"} ${x.tf === "d" ? "ngày" : "4h"}</small></td><td class="${cls(x.r)}">${supSg(x.r)}</td><td class="l"><small>${esc(WHYL[x.why] || x.why || "")}</small></td><td><small>${isNum(x.mfe) ? `${supSg(x.mfe, 1)} / ${supSg(x.mae, 1)}` : "—"}</small></td><td class="l">${x.tags.length ? x.tags.map((t) => `<span class="pill ${x.r < 0 ? "sell" : ""}">${esc(SUP_TAG[t] || t)}</span>`).join(" ") : x.r < 0 ? '<small class="faint">không lỗi quy trình – thua trong xác suất</small>' : '<small class="faint">—</small>'}${x.pend ? ' <small class="faint">(đang theo dõi giá sau cắt lỗ)</small>' : ""}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có lệnh đóng.</p>`;
  // ---- phí
  const cv = cards.map(([, c]) => c), fees = cv.reduce((s, c) => s + (c.fees || 0), 0), fund = cv.reduce((s, c) => s + (c.fund || 0), 0), fR = cv.filter((c) => isNum(c.feeR));
  const feeP = `${kpis([["Phí đã trả", usd2(fees)], ["Funding (+ = trả)", usd2(fund), fund > 0 ? "down" : "up"], ["Phí TB mỗi lệnh", fR.length ? nf(fR.reduce((s, c) => s + c.feeR, 0) / fR.length, 3) + "R" : "—"], ["Phí / lãi gộp (cao nhất)", cv.some((c) => isNum(c.fee_share)) ? nf(Math.max(...cv.filter((c) => isNum(c.fee_share)).map((c) => c.fee_share)), 0) + "%" : "—", "", "bot có tỷ lệ phí / lãi gộp cao nhất"]])}
    <p class="sbp">Phí khứ hồi tính theo R = (phí mở + phí đóng + trượt giá 2 chiều) ÷ khoảng cách tới cắt lỗ. Futures 0,05%/chiều, spot 0,1%/chiều, trượt giá 0,05%/chiều → cắt lỗ cách 2%: futures tốn ≈ <b>0,10R</b>, spot ≈ <b>0,15R</b> mỗi lệnh; cắt lỗ cách 0,8% thì futures đã tốn ≈ 0,25R. Bot giám sát trừ phí này vào mọi phép so (đổi lệnh, chấm điểm) và học để bỏ lệnh có cắt lỗ quá hẹp so với phí.</p>`;
  const logH = (ss.log || []).slice().reverse().slice(0, 120).map((l) => { const d = SUP_D[l.k] || ["", ""]; return `<li class="${l.k === "stop" ? "stop" : ""}"><small>${dt(l.t + "Z")}</small>${d[0] ? ` <span class="pill ${d[1]}">${d[0]}</span>` : ""} ${esc(l.m)}</li>`; }).join("");
  app().innerHTML = `${botHubHead("sup")}<p class="faint bh-help" style="margin-top:0">🛡️ Giám sát rủi ro · quản lý danh mục – đứng trên ${B.length} bot · chạy mỗi phút trên máy chủ · sàn thử</p>
    <section class="panel hero bot-hero"><div class="bot-st"><span class="pill ${status[1]} big">${status[0]}</span><small>${esc(status[2])}</small>
      <span class="bot-btns">${ss.halt ? `<button class="btn primary" id="sRes">Mở khoá tài khoản</button>` : ""}<button class="btn ${C.enabled ? "" : "primary"}" id="sOn">${C.enabled ? "⏸ Tắt giám sát" : "▶ Bật giám sát"}</button></span></div>
      <p class="bth-h">${esc(TH.head || "")}</p>
      ${kpis([["Tài sản chung", isNum(a.eq) ? usd2(a.eq) : "—", "", `${a.n_bots || 0} bot đang chạy`], ["Hôm nay", pct(a.day_pct, 2), cls(a.day_pct), `khoá khi lỗ ${nf(C.acct_day, 0)}%` + bar(Math.max(0, -(a.day_pct || 0)), C.acct_day, "down")],
        ["Sụt so với đỉnh", `${nf(a.dd || 0, 1)}%`, a.dd > C.acct_dd * 0.6 ? "down" : "", `khoá khi sụt ${nf(C.acct_dd, 0)}% · quá nửa thì giảm 1/2 rủi ro` + bar(a.dd || 0, C.acct_dd, "down")],
        ["Rủi ro mở chung", `${nf(a.heat || 0, 1)}%`, "", `${a.n_pos || 0} lệnh`], ["Bài học áp dụng", `${on.length}`, "", (on.map((l) => l.t).join(", ") || "chưa có")],
        ["Cắt / đổi đúng", `${SC.ok}/${SC.ok + SC.bad}`, cls(SC.R), `${SC.bad} lần sai · ròng ${supSg(SC.R)}R so với giữ nguyên`]])}</section>
    ${PG("Cỗ máy vốn", -1)}${panel(`🎯 Cỗ máy vốn – sàn +${nf(C.goal_floor, 0)}%/năm, mục tiêu ×${nf(C.goal_x, 0)}–×${nf(C.goal_x2, 0)}`, engPanel(ss, C, B), "đặt rủi ro/lệnh từng bot theo toán · mỗi phút")}
    <div class="g g2w"><div>
      ${PG("Theo dõi trực tiếp", 0)}${panel("🧠 Giám sát đang nghĩ gì", items || `<p class="muted">Không có lệnh đang mở để đánh giá.</p>`, "mỗi phút · từng lệnh đang mở")}
      ${panel("🧾 Báo cáo giám sát", ss.report ? `<p class="faint" style="margin:0 0 6px">${esc(new Date(ss.report.at + "Z").toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" }))}</p><ul class="bot-rl">${ss.report.lines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        ${(ss.reports || []).length > 1 ? `<details><summary class="faint">Các báo cáo trước (${ss.reports.length - 1})</summary>${ss.reports.slice(0, -1).reverse().map((r) => `<div class="brep"><small>${esc(new Date(r.at + "Z").toLocaleString(LOC))}</small><ul>${r.lines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}</details>` : ""}` : `<p class="muted">Báo cáo đầu tiên có sau lượt chạy đầu tiên.</p>`, "mỗi 15 phút")}
      ${panel("📝 Nhật ký giám sát", logH ? `<ul class="bot-log">${logH}</ul>` : `<p class="muted">Chưa có hoạt động.</p>`)}
    </div><div>
      ${PG("Thiết lập & cách nghĩ")}${panel("⚙️ Thiết lập giám sát", `<div id="sForm"></div>`)}
      ${panel("🧭 Bot giám sát suy nghĩ thế nào", `<ul class="bot-rl">
        <li><b>Chi phí chìm không quan trọng.</b> Đang lỗ không phải lý do để gồng hay để cắt – chỉ so kỳ vọng <i>từ giờ trở đi</i>.</li>
        <li><b>Giá đi ngẫu nhiên thì giữ hay cắt như nhau</b> (kỳ vọng = 0, xác suất tới mục tiêu = khoảng cách tới cắt lỗ ÷ tổng hai khoảng). Lợi thế của lệnh = xác suất thống kê/mô hình ÷ xác suất ngẫu nhiên lúc vào.</li>
        <li><b>Cắt</b> khi lợi thế đã mất làm kỳ vọng ≤ −0,15R liên tục 3 phút: đèn thị trường đổi ngược, BTC đi ngược ≥ 3%, quá nửa thời gian kỳ vọng mà chưa chạy, funding ăn mòn. Lệnh đã chốt MT1 / đã hoà vốn không bị cắt.</li>
        <li><b>Đổi lệnh</b> khi một tín hiệu bị chặn vì hết chỗ có kỳ vọng (đã trừ phí mở + đóng + trượt giá) hơn lệnh yếu nhất ≥ <b>${nf(C.min_edge, 2)}R</b>; lệnh cũ phải giữ ≥ 1 giờ; tối đa 1 lần / 2 giờ, 3 lần / ngày mỗi bot.</li>
        <li><b>Tự chấm chính mình:</b> sau mỗi lần cắt/đổi, theo dõi giá có về cắt lỗ cũ (cắt đúng) hay tới mục tiêu (cắt sai). Lỗ ròng sau ≥ 8 lần → nâng ngưỡng cắt; lỗ rõ sau ≥ 15 lần → ngừng tự cắt, chỉ khuyên.</li>
        <li><b>Cỗ máy vốn:</b> rủi ro/lệnh của từng bot = min(mức vừa đủ cho mục tiêu ×${nf(C.goal_x, 0)}, trần an toàn sụt, ${nf(C.kelly, 1)}×Kelly, ${nf(C.max_risk, 1)}%) – tính trên lợi thế THẬN TRỌNG (cận dưới 80%); bot chưa chứng minh được lợi thế chỉ được ½ hoặc ¼ rủi ro.</li>
        <li><b>Cầu dao tài khoản:</b> sụt quá nửa giới hạn → mọi bot giảm 1/2 rủi ro; chạm giới hạn sụt hoặc lỗ trong ngày → khoá mở lệnh mới mọi bot (lệnh đang mở vẫn giữ cắt lỗ).</li></ul>`)}
    </div></div>
      ${PG("Đánh giá & học hỏi", 1)}${panel("🤖 Chấm điểm từng bot", cardT + `<p class="faint" style="font-size:.75rem">R = lãi/lỗ chia cho số tiền rủi ro của lệnh, đã trừ phí & funding. Bot chỉ bị đánh giá "NÊN DỪNG" khi có ≥ <b>${C.min_trades}</b> lệnh và cả khoảng tin cậy 80% của lãi TB nằm dưới 0 – tức lỗ thật sự chứ không phải xui. Khi đó bot giám sát tạm dừng bot (nếu anh cho phép); anh bấm "Chạy lại" ở trang bot = cho thêm 10 lệnh thử.</p>`, "thống kê, không cảm tính")}
      ${panel("📚 Bài học rút ra", lesT + (blk.length ? `<p class="sbh">🔬 Đang tạm tránh (nghiên cứu gần đây ở các bot)</p><ul class="bot-rl">${blk.map((b) => `<li>${b.kind === "coin" ? `<b>${coinLink(b.k)}</b> – thua ${b.n} lệnh / 14 ngày (${supSg(b.R, 1)}R)` : b.kind === "side" ? `<b>Mọi lệnh ${b.side === "long" ? "Long" : "Short"}</b> – chế độ thị trường: ${b.n} tín hiệu / 7 ngày ở mọi thiết lập, TB ${supSg(b.R)}R (tự mở lại sớm nếu lệnh bị chặn lẽ ra thắng)` : `<b>${esc(b.name || b.setup)}</b> ${b.tf === "*" ? "mọi khung" : b.tf === "d" ? "ngày" : "4h"} ${b.side === "long" ? "Long" : "Short"} – ${b.n} ${b.tf === "*" ? "tín hiệu" : "lệnh"} / 30 ngày, TB ${supSg(b.R)}R`} · tới ${esc(new Date(b.until + "Z").toLocaleDateString(LOC))}</li>`).join("")}</ul>` : "")
        + `<p class="faint" style="font-size:.75rem">Lệnh của nhiều bot cùng đánh một tín hiệu chỉ tính là một bằng chứng. Mỗi bài học tự kiểm tra chính nó: nếu các tín hiệu nó chặn hoá ra thắng nhiều hơn thua, bài học tự gỡ.</p>`, "từ khám nghiệm mọi lệnh")}
      ${panel("🩺 Khám nghiệm lệnh", revT, "mỗi lệnh đóng đều được xét")}
      ${panel("💸 Phí giao dịch", feeP)}
`;
  // ---- form
  const f = () => {
    const ck = (k, t, tip = "") => `<label class="chk"${tip ? ` title="${esc(tip)}"` : ""}><input type="checkbox" id="s_${k}" ${C[k] ? "checked" : ""}> ${t}</label>`;
    $("#sForm").innerHTML = `<h4 class="bfh">Cách hành động</h4><div class="bseg">${[["auto", "🤖 Tự hành động"], ["advise", "💬 Chỉ khuyên"]].map(([v, t]) => `<button type="button" data-mode="${v}" class="${C.mode === v ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="filters bff">${ck("cut", "Cắt lệnh khi kỳ vọng phía trước âm")}${ck("rotate", "Đổi lệnh yếu lấy cơ hội tốt hơn (sau phí)")}${ck("lessons", "Áp dụng bài học vào cổng vào lệnh")}${ck("pause_bots", "Tạm dừng bot lỗ thật sự (thống kê)")}</div>
      <h4 class="bfh">Cầu dao toàn tài khoản</h4><div class="filters bff">
        <div class="field"><label>Khoá khi tài sản chung sụt (%)</label><input id="s_acct_dd" inputmode="decimal" value="${C.acct_dd}"></div>
        <div class="field"><label>Khoá khi lỗ trong ngày (%)</label><input id="s_acct_day" inputmode="decimal" value="${C.acct_day}"></div></div>
      <h4 class="bfh">🎯 Cỗ máy vốn</h4><div class="filters bff">
        <label class="chk"><input type="checkbox" id="s_engine" ${C.engine ? "checked" : ""}> Để cỗ máy đặt rủi ro/lệnh cho từng bot theo mục tiêu năm</label>
        <div class="field"><label>Sàn lợi nhuận / năm (%)</label><input id="s_goal_floor" inputmode="decimal" value="${C.goal_floor}"></div>
        <div class="field"><label>Mục tiêu (× tài sản / năm)</label><input id="s_goal_x" inputmode="decimal" value="${C.goal_x}"></div>
        <div class="field"><label>Mục tiêu cao (× / năm)</label><input id="s_goal_x2" inputmode="decimal" value="${C.goal_x2}"></div>
        <div class="field"><label>Trần rủi ro mỗi lệnh (%, ≤ 2)</label><input id="s_max_risk" inputmode="decimal" value="${C.max_risk}"></div>
        <div class="field"><label>Phần Kelly (0,25–1)</label><input id="s_kelly" inputmode="decimal" value="${C.kelly}"></div>
        <button type="button" class="btn sm" id="sGoalR">Bắt đầu năm mục tiêu mới từ hôm nay</button></div>
      <h4 class="bfh">Ngưỡng</h4><div class="filters bff">
        <div class="field"><label>Lợi thế tối thiểu để đổi lệnh (R)</label><input id="s_min_edge" inputmode="decimal" value="${C.min_edge}"></div>
        <div class="field"><label>Số lệnh tối thiểu để chấm bot</label><input id="s_min_trades" inputmode="numeric" value="${C.min_trades}"></div>
        <div class="field"><label>Dời hoà vốn khi lệnh đi +1R</label><select id="s_be1">${[["auto", "Tự động khi có bài học"], ["on", "Luôn bật"], ["off", "Tắt"]].map(([v, t]) => `<option value="${v}" ${C.be1 === v ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
      <div class="bsave"><button class="btn primary" id="sSave">💾 Lưu</button><small class="faint">Áp dụng từ phút kế tiếp.</small></div>`;
    $$("#sForm [data-mode]").forEach((b) => (b.onclick = () => { rd(); C.mode = b.dataset.mode; f(); }));
    $("#sSave").onclick = async () => { rd(); await Store.put("sup", C); toast("Đã lưu thiết lập bot giám sát"); viewSup(); };
    $("#sGoalR").onclick = async () => { if (!confirm("Bắt đầu năm mục tiêu mới từ hôm nay? Lợi nhuận tính lại từ 0%, sàn và đường mục tiêu tính từ hôm nay.")) return; rd(); C.goal_reset_at = new Date().toISOString(); await Store.put("sup", C); toast("Năm mục tiêu mới bắt đầu từ phút kế tiếp"); viewSup(); };
  };
  const rd = () => { ["cut", "rotate", "lessons", "pause_bots", "engine"].forEach((k) => (C[k] = $("#s_" + k).checked)); ["acct_dd", "acct_day", "min_edge", "min_trades", "goal_floor", "goal_x", "goal_x2", "max_risk", "kelly"].forEach((k) => { const v = numIn($("#s_" + k).value); if (isFinite(v)) C[k] = v; }); C.max_risk = Math.min(2, C.max_risk); C.be1 = $("#s_be1").value; };
  f();
  $("#sOn").onclick = async () => { C.enabled = !C.enabled; await Store.put("sup", C); toast(C.enabled ? "Đã bật bot giám sát" : "Đã tắt bot giám sát – các bot tự chạy theo kỷ luật riêng"); viewSup(); };
  if ($("#sRes")) $("#sRes").onclick = async () => { if (!confirm("Mở khoá toàn tài khoản? Đỉnh tài sản chung sẽ đặt lại theo hiện tại.")) return; C.resume_at = new Date().toISOString(); await Store.put("sup", C); toast("Sẽ mở khoá ở phút kế tiếp"); viewSup(); };
  $$("[data-off]").forEach((b) => (b.onclick = async () => { const id = b.dataset.off; C.off = C.off.includes(id) ? C.off.filter((x) => x !== id) : [...C.off, id]; await Store.put("sup", C); toast("Đã lưu"); viewSup(); }));
  $$("[data-sug]").forEach((b) => (b.onclick = async () => {
    const [bid, i] = decodeURIComponent(b.dataset.sug).split("|"), s = ss.cards?.[bid]?.sug?.[+i], bot = B.find((x) => x.id === bid);
    if (!s?.patch || !bot || !confirm(`Áp dụng cho ${bot.name}: ${s.t}?`)) return;
    Object.assign(bot, s.patch); await Store.put("bot", { v: 2, bots: B }); toast("Đã chỉnh thiết lập bot"); viewSup();
  }));
  clearInterval(window.__supT);
  window.__supT = setInterval(async () => {
    if (location.hash !== "#/bot/sup") { clearInterval(window.__supT); return; }
    if (document.hidden || userBusy() || document.activeElement?.closest?.("#sForm")) return;
    try { const r = await Store.get("supstate"); if (r.data?.at && r.data.at !== ss.at) softRender(() => viewSup()); } catch (e) { /* bỏ qua */ }
  }, 60000);
}

// Kết quả & sổ lệnh: 1 trang 2 phần – Theo ngày | Sổ lệnh & bài học (giữ môi trường đang xem khi chuyển)
function djSeg(cur, env) {
  const L = [["days", "Theo ngày", "lịch lời/lỗ · so sánh"], ["journal", "Sổ lệnh", "lệnh đã đóng · bài học"], ["miss", "Lệnh hụt", "cú sốc không khớp"]];
  return `<nav class="sc-sub2 dj-seg" aria-label="Kết quả & sổ lệnh">${L.map(([k, t, d]) => `<a href="#/bot/${k}${env ? "/" + env : ""}" class="${k === cur ? "on" : ""}"${k === cur ? ' aria-current="page"' : ""}><span>${t}</span><small>${d}</small></a>`).join("")}</nav>`;
}
// ---------------------------------------------------------------- HIỆU SUẤT THEO NGÀY, KHỬ TIỀN NẠP / RÚT
// lời/lỗ $ = tổng lời/lỗ các lệnh (không bao giờ tính tiền nạp là lời). % ngày = lời/lỗ ÷ (vốn đầu ngày + ½ tiền nạp/rút trong ngày) – kiểu Modified Dietz;
// % lũy kế = nối % từng ngày (∏(1 + r) − 1) – kiểu quỹ đầu tư (time-weighted), nạp thêm tiền không làm % tăng giả, rút bớt không làm % giảm giả.
function dayPerf(days, keys, env, X, C) {
  const FL = {}; if (env !== "paper") for (const [m, v] of X.live?.flow?.[env] || []) { const d = new Date(m * 60000 + 7 * 3600e3).toISOString().slice(0, 10); FL[d] = (FL[d] || 0) + v; }
  const out = {}; let cum = 0, cr = 1, prevEnd = null, inv = null;
  for (const d of keys) {
    const x = days[d] || {}, pnl = x.usd || 0, f = FL[d] || 0;
    let base = isNum(x.eq0) && x.eq0 > 0 ? x.eq0 : prevEnd != null ? prevEnd : env === "paper" ? (X.start ?? C.capital ?? null) : null;
    if (inv == null && base) inv = base;      // vốn ban đầu = tài sản đầu ngày đầu tiên có số liệu
    const den = base != null ? base + 0.5 * f : null, r = den && den > 0 ? pnl / den : null;
    cum += pnl; if (isNum(r)) cr *= 1 + r; if (inv != null) inv += f;
    prevEnd = isNum(x.eq1) && x.eq1 > 0 ? x.eq1 : base != null ? base + pnl + f : null;
    out[d] = { pnl, r, cum, cr: cr - 1, flow: f, base, end: prevEnd, inv };
  }
  return out;
}
// 📅 LỊCH THÁNG: mỗi ô 1 ngày – màu xanh/đỏ đậm nhạt theo % ngày; lời/lỗ $, % ngày, lũy kế $ và % (đã khử nạp/rút); ô có nạp/rút ghi số tiền
function calPanel(days, keys, PF, env, sel, TD) {
  if (!keys.length) return "";
  const mons = [...new Set(keys.map((d) => d.slice(0, 7)))].sort(), cur = mons.includes(window.__dMon) ? window.__dMon : (sel || TD).slice(0, 7), mi = mons.indexOf(cur);
  const [y, m] = cur.split("-").map(Number), first = new Date(Date.UTC(y, m - 1, 1)), nd = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (first.getUTCDay() + 6) % 7;
  const ds = Array.from({ length: nd }, (_, i) => `${cur}-${String(i + 1).padStart(2, "0")}`), act = ds.filter((d) => days[d]?.n);
  const mx = Math.max(1e-9, ...act.map((d) => Math.abs(PF[d]?.r ?? 0))), sg = (v, dp = 2) => `${v >= 0 ? "+" : "−"}${nf(Math.abs(v), dp)}`;
  const mP = act.reduce((a, d) => a + (PF[d]?.pnl || 0), 0), mR = ds.reduce((a, d) => (isNum(PF[d]?.r) && days[d]?.n ? a * (1 + PF[d].r) : a), 1) - 1, mF = ds.reduce((a, d) => a + (PF[d]?.flow || 0), 0);
  const win = act.filter((d) => PF[d].pnl > 0).length, last = [...ds].reverse().find((d) => PF[d]), L = last ? PF[last] : null;
  const cell = (d) => {
    const x = days[d], P = PF[d], has = !!x?.n, r = P?.r, k = !has ? "none" : P.pnl > 0 ? "up" : P.pnl < 0 ? "down" : "flat", a = has && isNum(r) ? Math.round(10 + 34 * Math.min(1, Math.abs(r) / mx)) : 0, fut = d > TD;
    const tip = `${d}${has ? ` · ${nf(x.n, 0)} lệnh, thắng ${nf(x.win / x.n * 100, 0)}%` : ""}${P?.flow ? ` · ${P.flow > 0 ? "nạp" : "rút"} ${usd2(Math.abs(P.flow))}` : ""}`;
    return `<button type="button" class="cal-d ${k}${d === sel ? " sel" : ""}${d === TD ? " today" : ""}${fut ? " fut" : ""}" ${fut ? "disabled" : `data-cald="${d}"`} style="--a:${a}%" title="${esc(tip)}">
      <span class="cal-h"><b class="cal-n">${+d.slice(8)}</b>${P?.flow ? `<i class="cal-f ${P.flow > 0 ? "in" : "out"}" title="${P.flow > 0 ? "nạp" : "rút"}">${P.flow > 0 ? "+" : "−"}${nf(Math.abs(P.flow), 0)}</i>` : ""}</span>
      ${has ? `<span class="cal-p">${sg(P.pnl)}</span><span class="cal-r">${isNum(r) ? sg(r * 100, 1) + "%" : "—"}</span>` : `<span class="cal-p cal-0">${fut ? "" : "–"}</span><span class="cal-r"></span>`}
      ${P && !fut ? `<span class="cal-c"><span>${sg(P.cum)}</span><span class="${cls(P.cr)}">${sg(P.cr * 100, 1)}%</span></span>` : ""}</button>`;
  };
  const nav = (j, t) => `<button type="button" class="cal-nb" ${j >= 0 && j < mons.length ? `data-calm="${mons[j]}"` : "disabled"} aria-label="Tháng ${t}">${t === "trước" ? "‹" : "›"}</button>`;
  const pick = `<select class="cal-pick" data-calpick aria-label="Chọn tháng">${mons.slice().reverse().map((q) => `<option value="${q}" ${q === cur ? "selected" : ""}>Tháng ${q.slice(5)}/${q.slice(0, 4)}</option>`).join("")}</select>`;
  const SD = sel && sel.startsWith(cur) ? sel : null, SP = SD ? PF[SD] : null, SX = SD ? days[SD] : null;
  const selBar = SD ? `<div class="cal-sel"><b>${ddmm(SD)}</b>${SX?.n ? `<span class="${cls(SP.pnl)}">${sg(SP.pnl)} USDT · ${isNum(SP.r) ? sg(SP.r * 100, 2) + "%" : "—"}</span><span>${nf(SX.n, 0)} lệnh · thắng ${nf(SX.win / SX.n * 100, 0)}%</span>` : `<span class="faint">không có lệnh</span>`}${SP?.flow ? `<span>${SP.flow > 0 ? "nạp" : "rút"} ${usd2(Math.abs(SP.flow))}</span>` : ""}<a href="#dDetail" data-caljump>Chi tiết ngày ↓</a></div>` : "";
  return panel("Lịch lời/lỗ", `<div class="cal-top">${nav(mi - 1, "trước")}${pick}${nav(mi + 1, "sau")}${cur !== TD.slice(0, 7) && mons.includes(TD.slice(0, 7)) ? `<button type="button" class="cal-nb cal-td" data-calm="${TD.slice(0, 7)}">Hôm nay</button>` : ""}</div>
      <div class="cal-sum"><span>Tháng <b class="${cls(mP)}">${sg(mP)} USDT</b> · <b class="${cls(mR)}">${sg(mR * 100, 2)}%</b></span><span>${win}/${act.length} ngày lời</span>${mF ? `<span>${mF > 0 ? "nạp ròng" : "rút ròng"} <b>${usd2(Math.abs(mF))}</b></span>` : ""}${L ? `<span>Lũy kế <b class="${cls(L.cum)}">${sg(L.cum)}</b> · <b class="${cls(L.cr)}">${sg(L.cr * 100, 2)}%</b></span>` : ""}</div>
    <div class="cal">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w) => `<span class="cal-w">${w}</span>`).join("")}${'<span class="cal-x"></span>'.repeat(lead)}${ds.map(cell).join("")}</div>${selBar}
    <p class="faint cal-note">Ô: lời/lỗ ngày · % ngày · dưới vạch = lũy kế từ đầu. Nạp/rút (số nhỏ góc ô) không tính là lời/lỗ.</p>`, L?.end ? `tài sản ${usd2(L.end)}` : "");
}
async function viewDays(envArg, dateArg, part) {
  const [rd, rs, rn, rq] = await Promise.all([Store.get("scalpdays"), Store.get("scalpstate"), Store.get("scalpnotes"), Store.get("scalp")]);
  const C = { ...SCALP_DEF, ...scMig(rq.data) }, X = rs.data || {}, ALL = rd.data || {}, NOTES = rn.data || {};
  const env = ["paper", "demo", "live"].includes(envArg) ? envArg : window.__dEnv || (C.lv_on ? (C.lv_env === "live" ? "live" : "demo") : "paper"); window.__dEnv = env;      // mặc định xem tài khoản Binance
  const src = ALL[env] || {}, days = JSON.parse(JSON.stringify(src.days || {})), dtr = JSON.parse(JSON.stringify(src.dtr || {})), TD = vnToday();
  // hôm nay: số liệu trực tiếp
  if (env === "paper" && X.today) {
    days[X.today.d] = { ...X.today, eq1: X.eq ?? X.today.eq1 };
    const tt = (X.trades || []).filter((t) => vnDayOf(t.t1) === X.today.d).map((t) => [t.t1.slice(11, 16), t.k, t.side, t.strat || "sec", t.usd, t.net, t.why, t.lv || null, t.hold]);
    if (tt.length >= (dtr[X.today.d] || []).length) dtr[X.today.d] = tt;
  }
  if (env !== "paper" && X.live?.env === env) {
    const h = (X.live.hist || []).filter((x) => x.env === env && vnDayOf(x.t2) === TD);
    if (h.length >= (dtr[TD] || []).length) dtr[TD] = h.map((x) => [x.t2.slice(11, 16), x.sym.replace(/USDT$/, "") + ":F", x.side, "hook", x.pnl, x.e ? x.side * (x.x / x.e - 1) * 1e4 : 0, x.why, null, null]);
    const D = (days[TD] ||= { n: 0, usd: 0, win: 0, by: {}, coins: {}, why: {} }); D.usd = X.live.day?.d === TD ? X.live.day.pnl : D.usd;
  }
  const keys = Object.keys(days).sort(), cnt = Object.fromEntries(DENV.map(([e]) => [e, Object.values(ALL[e]?.days || {}).filter((d) => d.n).length]));
  const R = window.__dRange || 30, ks = R === "all" ? keys : keys.slice(-R);
  const sel = dateArg && days[dateArg] ? dateArg : keys.includes(TD) ? TD : keys[keys.length - 1];
  const head = `<div class="ph"><h1>Kết quả & sổ lệnh</h1><span class="meta">Giờ Việt Nam · bài học tự động từ số liệu ngày</span></div>${djSeg("days", env)}
    <div class="bseg dseg d3">${DENV.map(([e, t, d, ts]) => `<a href="#/bot/days/${e}" class="${e === env ? "on" : ""}" title="${esc(d)}${cnt[e] ? ` · ${cnt[e]} ngày có lệnh` : ""}"><span class="dl">${t}</span><span class="ds">${ts}</span>${cnt[e] ? `<small>${cnt[e]}</small>` : ""}</a>`).join("")}</div>`;
  if (!keys.length) {
    app().innerHTML = head + panel(DENV.find((x) => x[0] === env)[1], `<p class="muted">${env === "paper" ? "Chưa có số liệu theo ngày – máy chủ riêng bắt đầu lưu sau khi cập nhật (sudo bash /opt/my-bit/scalper/install.sh), dựng lại các ngày cũ từ lịch sử lệnh." : env === "demo" ? "Chưa có lệnh nào trên Binance Demo." : "Chưa chạy trên Binance thật. Khi anh chuyển sang tiền thật, kết quả từng ngày hiện ở đây – tách riêng khỏi sàn thử & Demo."}</p>`);
    return;
  }
  // tổng hợp khoảng ngày đang xem
  const V = ks.map((d) => ({ d, ...days[d] })), act = V.filter((x) => x.n), tot = V.reduce((a, x) => a + (x.usd || 0), 0);
  let cum = 0, pk = 0, mdd = 0; const cumS = V.map((x) => { cum += x.usd || 0; pk = Math.max(pk, cum); mdd = Math.min(mdd, cum - pk); return cum; });
  const cumBy = (st) => { let c = 0; return V.map((x) => (c += x.by?.[st]?.usd || 0)); };
  const nT = V.reduce((a, x) => a + (x.n || 0), 0), nW = V.reduce((a, x) => a + (x.win || 0), 0), wd = act.filter((x) => x.usd > 0).length;
  const bestD = act.reduce((a, x) => (!a || x.usd > a.usd ? x : a), null), worstD = act.reduce((a, x) => (!a || x.usd < a.usd ? x : a), null);
  const PF = dayPerf(days, keys, env, X, C);      // % theo ngày & lũy kế đã khử tiền nạp/rút
  const pts = (f) => V.map((x, i) => ({ x: ddmm(x.d), y: f(x, i) }));
  const pctTip = (v) => (isNum(v) ? `${v >= 0 ? "+" : ""}${nf(v * 100, 2)}%` : "");
  const charts = `<div class="g g2w"><div>${panel("Lãi/lỗ mỗi ngày (USDT)", lineSvg([{ name: "Lãi/lỗ ngày", bars: true, pts: V.map((x) => ({ x: ddmm(x.d), y: +(x.usd || 0).toFixed(2), tip: pctTip(PF[x.d]?.r), tc: cls(PF[x.d]?.r) })) }], { h: 200, dec: 2, zero: true, label: "lãi lỗ theo ngày" }))}</div>
    <div>${panel("Lãi/lỗ cộng dồn", lineSvg([{ name: "Tổng", color: css("--brand"), width: 2, pts: V.map((x, i) => ({ x: ddmm(x.d), y: +cumS[i].toFixed(2), tip: pctTip(PF[x.d]?.cr), tc: cls(PF[x.d]?.cr) })) }, { name: "🪝 Bắt râu sập", color: css("--up"), pts: cumBy("hook").map((y, i) => ({ x: ddmm(V[i].d), y: +y.toFixed(2) })) }, ...(V.some((x) => x.by?.sec?.n) ? [{ name: "⚡ Lướt giây", color: css("--warn") || "#d89614", pts: cumBy("sec").map((y, i) => ({ x: ddmm(V[i].d), y: +y.toFixed(2) })) }] : [])], { h: 200, dec: 2, zero: true }))}</div></div>
    <div class="g g2w"><div>${panel("Số lệnh & tỉ lệ thắng mỗi ngày", lineSvg([{ name: "Số lệnh", bars: true, color: css("--line-2") || "#888", pts: pts((x) => x.n || 0) }, { name: "Thắng (%)", color: css("--up"), width: 2, pts: pts((x) => (x.n ? +(x.win / x.n * 100).toFixed(0) : null)) }], { h: 180, dec: 0, zero: true }))}</div>
    <div>${panel("Sụt giảm lớn nhất trong ngày (%)", lineSvg([{ name: "Sụt từ đỉnh trong ngày", bars: true, color: css("--down"), pts: pts((x) => (isNum(x.mdd) ? -x.mdd : null)) }], { h: 180, dec: 1, zero: true }))}</div></div>`;
  const rangeSeg = `<div class="bseg">${[[7, "7 ngày"], [30, "30 ngày"], [90, "90 ngày"], ["all", "Tất cả"]].map(([v, t]) => `<button type="button" data-dr="${v}" class="${R === v ? "on" : ""}">${t}</button>`).join("")}</div>`;
  const summ = panel(`${DENV.find((x) => x[0] === env)[1]} – tổng quan`, `${rangeSeg}${stg([["Lãi/lỗ", `${tot >= 0 ? "+" : ""}${usd2(tot)}`, cls(tot), act.length ? `TB ${tot / V.length >= 0 ? "+" : ""}${usd2(tot / V.length)}/ngày` : ""], ["Ngày lời", act.length ? `${wd}/${act.length}` : "—", "", "ngày có lệnh"], ["Số lệnh", nf(nT, 0), "", nT ? `thắng ${nf(nW / nT * 100, 0)}%` : ""],
    ["Ngày tốt nhất", bestD ? `+${usd2(bestD.usd)}` : "—", "up", bestD ? ddmm(bestD.d) : ""], ["Ngày tệ nhất", worstD ? usd2(worstD.usd) : "—", "down", worstD ? ddmm(worstD.d) : ""], ["Sụt tối đa", usd2(mdd), mdd < 0 ? "down" : "", "từ đỉnh lãi"]], "st3")}`, `${V.length} ngày · hôm nay trực tiếp`);
  const rows = keys.slice().reverse().map((d) => { const x = days[d], H = keys.filter((k) => k < d).map((k) => days[k]), r = dayLessons(x, dtr[d] || [], H, C, env); const p = isNum(PF[d]?.r) ? PF[d].r * 100 : null;
    return `<tr class="${d === sel ? "on" : ""}" data-dd="${d}"><td class="l"><a href="#/bot/days/${env}/${d}"><b>${ddmm(d)}</b></a>${d === TD ? ' <small class="pill brand">hôm nay</small>' : ""}</td><td class="${cls(x.usd)}"><b>${x.n ? `${x.usd >= 0 ? "+" : ""}${usd2(x.usd)}` : "—"}</b></td><td class="${cls(p)}">${isNum(p) ? pct(p, 2) : "—"}</td><td>${nf(x.n || 0, 0)}</td><td>${x.n ? nf(x.win / x.n * 100, 0) + "%" : "—"}</td><td>${isNum(x.mdd) ? nf(x.mdd, 1) + "%" : "—"}</td><td class="l"><small>${esc((r.L.find((l) => l[0] === "down") || r.L[0] || ["", ""])[1].slice(0, 110))}</small></td></tr>`; }).join("");
  const list = panel("Từng ngày", `<div class="tw" style="max-height:420px"><table class="dtab"><thead><tr><th class="l">Ngày</th><th>Lãi/lỗ</th><th>%</th><th>Lệnh</th><th>Thắng</th><th title="Sụt từ đỉnh trong ngày">Sụt</th><th class="l">Điểm chính</th></tr></thead><tbody>${rows}</tbody></table></div>`, "bấm ngày để xem chi tiết");
  // chi tiết ngày đang chọn
  const D = days[sel], T = (dtr[sel] || []).slice().sort((a, b) => a[0].localeCompare(b[0])), H = keys.filter((k) => k < sel).map((k) => days[k]), LS_ = dayLessons(D, T, H, C, env);
  const p = isNum(PF[sel]?.r) ? PF[sel].r * 100 : null, btc = D.btc0 && D.btc1 ? (D.btc1 / D.btc0 - 1) * 100 : null;
  const coins = Object.entries(D.coins || {}).map(([k, v]) => [k, v[0], v[1]]).sort((a, b) => b[2] - a[2]), mx = Math.max(1e-9, ...coins.map((c) => Math.abs(c[2])));
  const coinBars = coins.length ? `<div class="dbars">${coins.map(([k, nn, u]) => `<div><span><b>${esc(k)}</b> <small class="faint">${nn} lệnh</small></span><i><i class="${u >= 0 ? "up" : "down"}" style="width:${(Math.abs(u) / mx * 100).toFixed(0)}%"></i></i><b class="${cls(u)}">${u >= 0 ? "+" : ""}${usd2(u)}</b></div>`).join("")}</div>` : `<p class="muted">Không có lệnh.</p>`;
  const trT = T.length ? `<div class="tw" style="max-height:380px"><table><thead><tr><th class="l">Giờ</th><th class="l">Lệnh</th><th>Lãi/lỗ</th><th>bps</th><th>Giữ</th><th class="l">Lý do</th></tr></thead><tbody>${T.map((t) => `<tr><td class="l"><small>${vnHM(t[0])}</small></td><td class="l">${t[3] === "hook" ? "🪝 " : "⚡ "}${scK(t[1])} <span class="${t[2] > 0 ? "up" : "down"}">${t[2] > 0 ? "Long" : "Short"}</span>${t[7] === 2 ? ' <small class="faint">khớp 2 mức</small>' : ""}</td><td class="${cls(t[4])}"><b>${t[4] >= 0 ? "+" : ""}${usd2(t[4])}</b></td><td class="${cls(t[5])}">${bps(t[5], 0)}</td><td>${isNum(t[8]) ? (t[8] >= 600 ? nf(t[8] / 60, 0) + "p" : nf(t[8], 0) + "s") : "—"}</td><td class="l"><small>${esc(WHYD[t[6]] || t[6])}</small></td></tr>`).join("")}</tbody></table></div>` : "";
  const nk = `${env}|${sel}`;
  const detail = panel(`📆 ${ddmm(sel)}/${sel.slice(0, 4)}${sel === TD ? " (hôm nay – đang cập nhật)" : ""}`, `${kpis([["Lãi/lỗ", D.n ? `${D.usd >= 0 ? "+" : ""}${usd2(D.usd)}` : "—", cls(D.usd), isNum(p) ? `${pct(p, 2)} tài sản` : ""], ["Lệnh", nf(D.n || 0, 0), "", D.n ? `thắng ${nf(D.win / D.n * 100, 0)}%` : ""], ["Phí", isNum(D.fees) ? usd2(D.fees) : "—", "", isNum(D.fund) && D.fund ? bi(`funding ${D.fund >= 0 ? "nhận" : "trả"} ${usd2(Math.abs(D.fund))} (đã tính trong lãi/lỗ)`, `funding ${D.fund >= 0 ? "received" : "paid"} ${usd2(Math.abs(D.fund))} (included in P/L)`) : "giao dịch; funding tính trong lãi/lỗ"], ["Sụt từ đỉnh", isNum(D.mdd) ? nf(D.mdd, 1) + "%" : "—", D.mdd >= 2 ? "down" : "", "trong ngày"],
      ["Tài sản cuối ngày", isNum(D.eq1) ? usd2(D.eq1) : "—", "", isNum(D.eq0) ? `${bi("đầu ngày", "start of day")} ${usd2(D.eq0)}` : ""], ["BTC trong ngày", isNum(btc) ? pct(btc, 1) : "—", cls(btc), ""], ["Bộ lọc đã chặn", nf((D.f6 || 0) + (D.knife || 0) + (D.r15 || 0), 0), "", `${D.f6 || 0} bơm/xả · ${D.knife || 0} dao rơi · ${D.r15 || 0} xả sau bơm`]])}
    <div class="g g2w"><div><p class="sbh">📚 Bài học trong ngày</p><ul class="bot-rl dles">${LS_.L.map(([c, m]) => `<li class="${c}">${esc(m)}</li>`).join("")}</ul>
      <p class="sbh">➡️ Rút kinh nghiệm cho ngày tiếp theo</p><ul class="bot-rl dles">${(LS_.N.length ? LS_.N : ["Không có điều chỉnh – giữ nguyên thiết lập."]).map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
      <p class="sbh">📝 Ghi chú của anh</p><textarea id="dNote" rows="3" style="width:100%" placeholder="Ghi lại nhận định của anh về ngày này…">${esc(NOTES[nk] || "")}</textarea><div class="bsave"><button class="btn" id="dNoteSave">💾 Lưu ghi chú</button></div></div>
    <div><p class="sbh">Lời / lỗ theo coin</p>${coinBars}${T.length ? `<p class="sbh">Các lệnh</p>${trT}` : ""}</div></div>`);
  // so sánh Demo / thật với sàn thử cùng ngày
  let cmp = "";
  if (env !== "paper" && ALL.paper?.days?.[sel]) { const P = ALL.paper.days[sel]; cmp = panel("So với sàn thử cùng ngày", `<div class="tw"><table><thead><tr><th class="l"></th><th>Lệnh</th><th>Thắng</th><th>Lãi/lỗ</th><th>TB bps/lệnh</th></tr></thead><tbody>${[["🧪 Sàn thử", P], [DENV.find((x) => x[0] === env)[1], D]].map(([t, x]) => `<tr><td class="l">${t}</td><td>${nf(x.n || 0, 0)}</td><td>${x.n ? nf(x.win / x.n * 100, 0) + "%" : "—"}</td><td class="${cls(x.usd)}">${x.n ? usd2(x.usd) : "—"}</td><td>${x.n ? bps(x.bps / x.n, 0) : "—"}</td></tr>`).join("")}</tbody></table></div><p class="faint" style="font-size:.75rem">${bi(`Sàn thử dùng vốn ${usd(C.capital)}, ${env === "demo" ? "Demo" : "tài khoản thật"} dùng tối đa ${usd(C.lv_cap)} → so sánh bằng bps/lệnh (không phụ thuộc cỡ lệnh). Chênh nhiều = khớp thật khác mô phỏng (trễ, thiếu lượt khớp ở râu nến).`, `The paper account uses ${usd(C.capital)}, ${env === "demo" ? "Demo" : "the live account"} uses at most ${usd(C.lv_cap)} → compared in bps per trade (independent of size). A big gap = real fills differ from the simulation (late, missing fills on wicks).`)}</p>`); }
  const html = head + summ + `<div id="dCal">${calPanel(days, keys, PF, env, sel, TD)}</div>` + charts + `<div id="dDetail">${detail}</div>` + `<div id="dCmp">${cmp}</div>` + list;
  // lịch: chọn ngày / đổi tháng → CHỈ thay khung lịch + chi tiết ngày (phần trên trang giữ nguyên → không nhảy, không cuộn)
  if (part && $("#dCal")) { const T = document.createElement("div"); T.innerHTML = html; for (const id of ["dCal", "dDetail", "dCmp"]) { const a = $("#" + id), b = T.querySelector("#" + id); if (a && b) a.replaceWith(b); } }
  else app().innerHTML = html;
  // lịch: chọn ngày / đổi tháng → vẽ lại tại chỗ, KHÔNG chuyển trang (không cuộn lên đầu); địa chỉ cập nhật để quay lại đúng ngày
  const calRe = async (d, mon) => { const y0 = scrollY; if (mon) window.__dMon = mon; if (d && d !== sel) history.replaceState(history.state, "", `#/bot/days/${env}/${d}`);
    document.activeElement?.blur?.(); await viewDays(env, d || sel, true); if (Math.abs(scrollY - y0) > 2) scrollTo(0, y0); requestAnimationFrame(() => { if (Math.abs(scrollY - y0) > 2) scrollTo(0, y0); }); };
  $$("[data-calm]").forEach((b) => (b.onclick = () => calRe(null, b.dataset.calm)));
  $$("[data-calpick]").forEach((s2) => (s2.onchange = () => calRe(null, s2.value)));
  $$("[data-cald]").forEach((b) => (b.onclick = () => calRe(b.dataset.cald, null)));
  $$("[data-caljump]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = $("#dDetail"); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - ((parseInt(getComputedStyle(document.documentElement).getPropertyValue("--stick")) || 60) + 10), behavior: "smooth" }); }));
  $$("[data-dr]").forEach((b) => (b.onclick = () => { window.__dRange = b.dataset.dr === "all" ? "all" : +b.dataset.dr; viewDays(env, sel); }));
  $$(".dtab tr[data-dd]").forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest("a")) location.hash = `#/bot/days/${env}/${tr.dataset.dd}`; }));
  $("#dNoteSave").onclick = async () => { const r = await Store.get("scalpnotes"); const M = r.data || {}; M[nk] = $("#dNote").value.slice(0, 4000); await Store.put("scalpnotes", M); toast("Đã lưu ghi chú"); };
}

// ================================================================ 📒 SỔ LỆNH & BÀI HỌC – toàn bộ lịch sử giao dịch (sàn thử / Demo / thật) + bài học tổng hợp
// Nguồn: sổ lệnh đầy đủ máy chủ riêng lưu mãi (scalpledger, 5 phút/lần) + lệnh vừa đóng trong trạng thái trực tiếp (chưa kịp vào sổ).
const JSTRAT = { hook: ["🪝", "Bắt râu sập"], sec: ["⚡", "Lướt giây"], pump: ["🧪", "Short coin vừa bơm"], list: ["🆕", "Short coin mới niêm yết"] };
const JWHY = { TP: "chốt lời", SL: "cắt lỗ", TIME: "hết giờ giữ", "TIME+": "hết giờ (đã giữ thêm)", TRAIL: "cắt lỗ đuổi", REV: "tín hiệu đảo chiều", BTC: "BTC sốc ngược chiều", STALE: "mất dữ liệu giá", MANUAL: "anh đóng tay", GONE: "đã đóng trên sàn", LIQ: "thanh lý / mất trắng", DELIST: "ngừng giao dịch" };
const JENV = [["live", "Binance thật", "Thật"], ["demo", "Demo", "Demo"], ["paper", "Sàn thử", "Sàn thử"], ["all", "Tất cả", "Tất cả"]];
const jT = (s) => (s ? Date.parse(/Z$/.test(s) ? s : s + "Z") : NaN);
function jRows(LG, X) {
  const M = new Map(), put = (r) => { if (!r.t2 || !(r.q > 0) || !(r.e > 0)) return; const k = `${r.env}|${r.k}|${String(r.t2).slice(0, 19)}`; if (!M.has(k)) M.set(k, r); };
  for (const a of LG?.rows || []) put({ env: a[0], strat: a[1], k: a[2], side: a[3], q: a[4], e: a[5], x: a[6], t1: a[7], t2: a[8], fee: a[9], fund: a[10], pnl: a[11], why: a[12], lv: a[13], R: a[14], tot: a[15], note: a[16] });
  for (const h of X?.live?.hist || []) put({ env: h.env || "demo", strat: h.strat || "hook", k: h.k || String(h.sym).replace(/USDT$/, "") + ":F", side: h.side, q: h.q, e: h.e, x: h.x, t1: h.t1 || h.ts, t2: h.t2, fee: h.fee, fund: h.fund || 0, pnl: h.pnl, why: h.why, lv: h.nl, R: h.R, tot: h.tot, note: h.note });
  for (const t of X?.trades || []) { const n0 = t.net && t.usd ? Math.abs(t.usd / (t.net / 1e4)) : null; if (n0) put({ env: "paper", strat: t.strat || "sec", k: t.k, side: t.side, q: n0 / t.e, e: t.e, x: t.x, t1: t.t0, t2: t.t1, fee: (t.fee || 0) * n0 / 1e4, fund: t.fu || 0, pnl: t.usd, why: t.why, lv: t.lv, R: t.shock }); }
  for (const s of ["list", "pump"]) for (const h of X?.sw?.[s]?.hist || []) put({ env: "paper", strat: s, k: String(h.sym).replace(/USDT$/, "") + ":F", side: h.side, q: h.N / h.e, e: h.e, x: h.x, t1: h.t0, t2: h.t2, fee: h.fee, fund: h.fund, pnl: h.net, why: h.why, note: h.note });
  return [...M.values()].map((r) => { const N = r.q * r.e, g = r.side * r.q * (r.x - r.e); return { ...r, fee: +r.fee || 0, fund: +r.fund || 0, pnl: +r.pnl || 0, N, g, bps: (+r.pnl || 0) / N * 1e4, mv: r.side * (r.x / r.e - 1) * 100, hold: (jT(r.t2) - jT(r.t1)) / 1000, d: vnDayOf(String(r.t2).slice(0, 19)) }; })
    .sort((a, b) => jT(b.t2) - jT(a.t2));
}
const jHold = (s) => (!isNum(s) || s < 0 ? "—" : s < 120 ? `${nf(s, 0)} giây` : s < 7200 ? `${nf(s / 60, 0)} phút` : s < 172800 ? `${nf(s / 3600, 1)} giờ` : `${nf(s / 86400, 1)} ngày`);
const jTm = (s) => { const t = jT(s); return isNum(t) ? new Date(t).toLocaleString(LOC, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; };
const j$ = (v, d) => { const k = d ?? (Math.abs(v) < 1 ? 3 : 2); return `${nz(v, k) > 0 ? "+" : nz(v, k) < 0 ? "−" : ""}$${nf(Math.abs(v), k)}`; };
// bài học rút từ chính các lệnh trong khoảng đang xem (số liệu, không đoán)
function jLessons(F) {
  const out = [], grp = (f) => { const G = {}; for (const r of F) { const k = f(r); if (k == null) continue; const g = (G[k] ||= { n: 0, w: 0, pnl: 0, bps: 0 }); g.n++; g.pnl += r.pnl; g.bps += r.bps; if (r.pnl > 0) g.w++; } return Object.entries(G).map(([k, g]) => ({ k, ...g, ab: g.bps / g.n })); };
  if (F.length < 3) return { L: [["", "Cần ít nhất 3 lệnh trong khoảng đang xem để rút bài học."]], T: {} };
  const gp = F.reduce((a, r) => a + Math.max(0, r.g), 0), fee = F.reduce((a, r) => a + r.fee, 0), trap = F.filter((r) => r.g > 0 && r.pnl < 0), fund = F.reduce((a, r) => a + r.fund, 0);
  if (gp > 0) out.push([fee / gp > 0.4 ? "bad" : fee / gp > 0.2 ? "warn" : "good", `Phí giao dịch bằng ${nf(fee / gp * 100, 0)}% tiền lời theo giá (${j$(-fee)} / ${j$(gp)}).${fee / gp > 0.4 ? " Phí đang ăn phần lớn lợi nhuận – ưu tiên lệnh chờ (maker) và bỏ các cú sốc nhỏ." : ""}`]);
  if (trap.length) out.push(["warn", `${trap.length} lệnh lời theo giá nhưng LỖ sau phí/funding (tổng ${j$(trap.reduce((a, r) => a + r.pnl, 0))}) – lệnh "tưởng hoà" thật ra là lỗ.`]);
  if (Math.abs(fund) >= 0.01) out.push([fund < 0 ? "warn" : "good", `Funding cả khoảng: ${j$(fund)} (${fund < 0 ? "trả" : "nhận"}).`]);
  const why = grp((r) => r.why || "?").sort((a, b) => a.pnl - b.pnl);
  if (why.length > 1 && why[0].pnl < 0) out.push(["bad", `Đóng vì «${JWHY[why[0].k] || why[0].k}» lỗ nhiều nhất: ${why[0].n} lệnh, ${j$(why[0].pnl)}, TB ${nf(why[0].ab, 0)} bps/lệnh.`]);
  const bw = why[why.length - 1]; if (bw && bw.pnl > 0) out.push(["good", `Đóng vì «${JWHY[bw.k] || bw.k}» đem lại nhiều lời nhất: ${bw.n} lệnh, ${j$(bw.pnl)}.`]);
  const sd = grp((r) => (r.side > 0 ? "Long" : "Short")); if (sd.length === 2) { const [a, b] = sd.sort((x, y) => y.ab - x.ab); out.push([b.pnl < 0 ? "warn" : "", `${a.k} tốt hơn ${b.k}: TB ${nf(a.ab, 0)} vs ${nf(b.ab, 0)} bps/lệnh (thắng ${nf(a.w / a.n * 100, 0)}% vs ${nf(b.w / b.n * 100, 0)}%).`]); }
  const hr = grp((r) => { const h = (new Date(jT(r.t2)).getUTCHours() + 7) % 24; return h < 6 ? "0–6 giờ" : h < 12 ? "6–12 giờ" : h < 18 ? "12–18 giờ" : "18–24 giờ"; }).filter((g) => g.n >= 3).sort((a, b) => a.ab - b.ab);
  if (hr.length > 1) out.push([hr[0].pnl < 0 ? "warn" : "", `Khung giờ kém nhất (giờ VN): ${hr[0].k} – ${hr[0].n} lệnh, TB ${nf(hr[0].ab, 0)} bps; tốt nhất: ${hr[hr.length - 1].k} – TB ${nf(hr[hr.length - 1].ab, 0)} bps.`]);
  const hk = F.filter((r) => r.strat === "hook" && r.R), sh = grp((r) => (r.strat !== "hook" || !r.R ? null : Math.abs(r.R) < 400 ? "sốc < 4%" : Math.abs(r.R) < 800 ? "sốc 4–8%" : "sốc ≥ 8%")).sort((a, b) => a.ab - b.ab);
  if (hk.length >= 5 && sh.length > 1) out.push([sh[0].pnl < 0 ? "warn" : "", `Bắt râu sập theo cỡ cú sốc: ${sh.map((g) => `${g.k} ${g.n} lệnh, TB ${nf(g.ab, 0)} bps`).join(" · ")}.`]);
  const co = grp((r) => r.k.split(":")[0]).filter((g) => g.n >= 2).sort((a, b) => a.pnl - b.pnl);
  if (co.length && co[0].pnl < 0) out.push(["bad", `Coin lỗ lặp lại: ${co.filter((g) => g.pnl < 0).slice(0, 3).map((g) => `${g.k} (${g.n} lệnh, ${j$(g.pnl)})`).join(", ")}.`]);
  const W = F.filter((r) => r.pnl > 0), Lz = F.filter((r) => r.pnl <= 0), ah = (A) => A.reduce((a, r) => a + (isNum(r.hold) ? r.hold : 0), 0) / Math.max(1, A.length);
  if (W.length >= 2 && Lz.length >= 2) out.push(["", `Lệnh lời giữ TB ${jHold(ah(W))}, lệnh lỗ giữ TB ${jHold(ah(Lz))}.${ah(Lz) > ah(W) * 2 ? " Lệnh lỗ bị giữ lâu hơn hẳn – lỗ thường đến từ lệnh giữ tới hết giờ." : ""}`]);
  let st = 0, mx = 0; for (const r of F.slice().reverse()) { st = r.pnl < 0 ? st + 1 : 0; mx = Math.max(mx, st); }
  if (mx >= 3) out.push(["warn", `Chuỗi thua dài nhất: ${mx} lệnh liên tiếp.`]);
  return { L: out, T: { why, sd, hr, co } };
}
// nhóm / hệ coin (theo trang Nhóm ngành: AI, Meme, Layer 1…) – nhãn trên từng lệnh
const coinGrp = (k) => { const b = String(k || "").split(":")[0].replace(/USDT$/, ""); const R = typeof BYK === "object" && BYK ? BYK[b] || BYK[b.replace(/^1000+/, "")] || BYK[b.replace(/^1M/, "")] : null; return R?.g || ""; };
const grpTag = (k) => { const g = coinGrp(k); return g ? `<span class="jtag" title="Nhóm coin">${esc(g)}</span>` : ""; };
// 🎯 LỆNH HỤT: cú sốc bot đã đặt lệnh chờ trên Binance nhưng giá không tới (huỷ, không mất phí) hoặc bỏ qua – lấy từ sổ lưu mãi trên máy chủ + 40 lần gần nhất trong trạng thái trực tiếp
function jMiss(LG, X) {
  const M = new Map();
  for (const m of [...(LG?.miss || []), ...(X?.live?.miss || [])]) { if (!m?.t0 || !m.k) continue; const env = m.env || X?.live?.env || "demo", key = `${env}|${m.k}|${String(m.t0).slice(0, 16)}`; if (!M.has(key)) M.set(key, { ...m, env, d: vnDayOf(String(m.t0).slice(0, 19)) }); }
  return [...M.values()].sort((a, b) => jT(b.t0) - jT(a.t0));
}
const jMissWhy = (m) => (m.what === "nofill" ? `Giá không tới · thiếu <b>${nf(m.gap, 2)}%</b>` : `Bỏ qua · ${esc(m.why || "không rõ lý do")}`);
async function viewJournal(envArg, mode) {
  const [rl, rs, rd, rn, rq] = await Promise.all([Store.get("scalpledger"), Store.get("scalpstate"), Store.get("scalpdays"), Store.get("scalpnotes"), Store.get("scalp"), coins().catch(() => null)]);
  const J = (window.__J ||= { R: 30, st: "all", res: "all", q: "", lim: 100 });
  const C = { ...SCALP_DEF, ...scMig(rq.data) }, X = rs.data || {}, LG = rl.data || null, ALL = rd.data || {}, NOTES = rn.data || {};
  const MISS = mode === "miss", A = jRows(LG, X), MS = jMiss(LG, X);
  const JE = MISS ? JENV.filter(([e]) => e !== "paper") : JENV, src0 = MISS ? MS : A;
  const cnt = Object.fromEntries(JE.map(([e]) => [e, e === "all" ? src0.length : src0.filter((r) => r.env === e).length]));
  const env0 = JE.some((x) => x[0] === envArg) ? envArg : JE.some((x) => x[0] === J.env) ? J.env : cnt.live ? "live" : MISS ? (cnt.demo ? "demo" : "live") : "paper", env = env0; J.env = env;
  const TD = vnToday(), from = J.R === "all" ? "" : new Date(Date.parse(TD + "T00:00:00Z") - (J.R - 1) * 864e5).toISOString().slice(0, 10), qq = J.q.trim().toUpperCase();
  const base = `#/bot/${MISS ? "miss" : "journal"}/`;
  const rangeSeg = `<select id="jRg" aria-label="Khoảng thời gian">${[[7, "7 ngày qua"], [30, "30 ngày qua"], [90, "90 ngày qua"], ["all", "Từ đầu"]].map(([v, t]) => `<option value="${v}" ${J.R === v ? "selected" : ""}>${t}</option>`).join("")}</select>`;
  const stOpts = ["all", ...Object.keys(JSTRAT).filter((s) => A.some((r) => r.strat === s && (env === "all" || r.env === env)))];
  const head = `<div class="ph"><h1>Kết quả & sổ lệnh</h1><span class="meta">Giờ Việt Nam · ${LG?.at ? `cập nhật ${jTm(LG.at.slice(0, 19))}` : "sổ đầy đủ có sau khi cập nhật máy chủ riêng"}</span></div>${djSeg(MISS ? "miss" : "journal", env === "all" || (MISS && env === "paper") ? "" : env)}
    <div class="bseg dseg">${JE.map(([e, t, ts]) => `<a href="${base}${e}" class="${e === env ? "on" : ""}"><span class="dl">${t}</span><span class="ds">${ts}</span>${cnt[e] ? `<small>${cnt[e]}</small>` : ""}</a>`).join("")}</div>
    <div class="jf">${rangeSeg}${MISS ? "" : `<select id="jSt" aria-label="Phương pháp">${stOpts.map((s) => `<option value="${s}" ${J.st === s ? "selected" : ""}>${s === "all" ? "Mọi phương pháp" : JSTRAT[s][1]}</option>`).join("")}</select>
      <div class="bseg">${[["all", "Tất cả"], ["win", "Lời"], ["loss", "Lỗ"]].map(([v, t]) => `<button type="button" data-jx="${v}" class="${J.res === v ? "on" : ""}">${t}</button>`).join("")}</div>`}
      <input id="jQ" type="search" placeholder="Lọc coin…" value="${esc(J.q)}" autocomplete="off" enterkeyhint="search"></div>`;
  const bindCommon = (re) => {
    $("#jRg").onchange = (e) => { J.R = e.target.value === "all" ? "all" : +e.target.value; re(); };
    let qt = 0; $("#jQ").oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { J.q = e.target.value; re(); setTimeout(() => { const i = $("#jQ"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 350); };
  };
  if (MISS) {      // ---------------------------------------------------------------- trang Lệnh hụt
    const F = MS.filter((m) => (env === "all" || m.env === env) && (!from || m.d >= from) && (!qq || m.k.toUpperCase().includes(qq)));
    const PP = A.filter((r) => r.env === "paper" && r.strat === "hook"), pOf = (m) => PP.find((r) => r.k === m.k && Math.abs(jT(r.t1) - jT(m.t0)) < 20 * 60e3) || null;
    const nf0 = F.filter((m) => m.what === "nofill"), sk = F.filter((m) => m.what !== "nofill"), near = nf0.filter((m) => m.gap < 1), hit = F.filter((m) => m.realHit);
    const PF0 = F.map(pOf).filter(Boolean), pS = PF0.reduce((a, r) => a + r.pnl, 0), gapAvg = nf0.length ? nf0.reduce((a, m) => a + (+m.gap || 0), 0) / nf0.length : null;
    const why = Object.entries(sk.reduce((o, m) => ((o[m.why || "?"] = (o[m.why || "?"] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]);
    const summ = panel("Tổng quan lệnh hụt", stg([["Lần hụt", nf(F.length, 0), "", F.length ? `${nf0.length} giá không tới · ${sk.length} bỏ qua` : "không có"],
      ["Thiếu TB", isNum(gapAvg) ? nf(gapAvg, 2) + "%" : "—", "", near.length ? `${near.length} lần thiếu < 1%` : "khoảng cách giá tới mức chờ"],
      ["Sàn thử cùng cú sốc", PF0.length ? `${PF0.length} lệnh khớp` : "—", "", PF0.length ? `lời/lỗ ${j$(pS)} – phần bỏ lỡ` : "sàn thử cũng không khớp"],
      env === "live" ? ["Bỏ qua", nf(sk.length, 0), "", why.length ? `nhiều nhất: ${why[0][0]}` : "không đặt lệnh"] : ["Sàn chính đã chạm", nf(hit.length, 0), hit.length ? "warn" : "", "giá Binance chính tới mức chờ, Demo không tới"]]))
      + (F.length ? `<ul class="bot-rl dles">${[near.length ? ["", `${near.length}/${nf0.length} lần giá chỉ thiếu dưới 1% là khớp. Mức chờ gần hơn sẽ khớp nhiều hơn nhưng giá vào kém hơn – chỉ đổi khi anh quyết định.`] : null, PF0.length ? [pS > 0 ? "warn" : "good", `Sàn thử khớp ${PF0.length} cú sốc trong số này, tổng ${j$(pS)} – ${pS > 0 ? "đó là phần lời bị lỡ trên Binance" : "hụt ở đây không mất gì"}.`] : null, why.length ? ["", `Bỏ qua nhiều nhất: ${why.slice(0, 3).map(([w, n]) => `«${w}» ${n} lần`).join(" · ")}.`] : null].filter(Boolean).map(([c, m]) => `<li class="${c}">${esc(m)}</li>`).join("")}</ul>` : "");
    const S = F.slice(0, J.lim);
    const card = (m) => { const P = pOf(m), sym = m.k.split(":")[0];
      return `<div class="jc m"><div class="jc1"><span>🪝 <b>${esc(sym)}</b> <span class="${m.side > 0 ? "up" : "down"}">${m.side > 0 ? "Long" : "Short"}</span> ${grpTag(m.k)}${env === "all" ? ` <span class="sc-acc ${m.env}">${m.env === "live" ? "Thật" : "Demo"}</span>` : ""}</span><small class="faint">${jTm(m.t0)}</small></div>
        <div class="jc2"><span>${jMissWhy(m)}${m.realHit ? ` · <span class="warn">sàn chính đã chạm</span>` : ""}</span>${m.R ? `<span>sốc ${nf(m.R / 100, 1)}%</span>` : ""}</div>
        <div class="jc3">${m.what === "nofill" && m.lvl ? `<small>mức chờ ${px(m.lvl)} · giá xa nhất ${px(m.reach)}${isNum(m.real) && m.env !== "live" ? ` · sàn chính ${px(m.real)}` : ""}</small>` : ""}<small>${P ? `Sàn thử khớp: <b class="${cls(P.pnl)}">${j$(P.pnl)}</b> (${px(P.e)} → ${px(P.x)})` : `<span class="faint">Sàn thử: không khớp</span>`}</small></div></div>`; };
    const list = panel("Từng lần hụt", F.length ? `<div class="jt-m jt-all">${S.map(card).join("")}</div>${F.length > J.lim ? `<button class="btn" id="jMore" style="margin-top:10px">Xem thêm (${F.length - J.lim})</button>` : ""}` : `<p class="muted">Không có lần hụt nào trong khoảng đang xem.</p>`, F.length ? `${Math.min(F.length, J.lim)} / ${F.length}` : "");
    app().innerHTML = head + summ + list + `<p class="faint" style="font-size:var(--fs-xs)">Lệnh hụt = cú sốc bot đã đặt lệnh chờ trên Binance nhưng giá không tới (tự huỷ, không mất phí), hoặc bỏ qua không đặt. ${LG?.miss ? "" : "Hiện chỉ có 40 lần gần nhất – sau khi anh chạy <code>sudo bash /opt/my-bit/scalper/install.sh</code>, máy chủ lưu mãi mọi lần hụt."}</p>`;
    const re = () => { J.lim = 100; viewJournal(env, "miss"); };
    bindCommon(re); if ($("#jMore")) $("#jMore").onclick = () => { J.lim += 100; viewJournal(env, "miss"); };
    return;
  }
  const F = A.filter((r) => (env === "all" || r.env === env) && (!from || r.d >= from) && (J.st === "all" || r.strat === J.st) && (J.res === "all" || (J.res === "win" ? r.pnl > 0 : r.pnl <= 0)) && (!qq || r.k.toUpperCase().includes(qq)));
  const n = F.length, w = F.filter((r) => r.pnl > 0), lo = F.filter((r) => r.pnl <= 0), net = F.reduce((a, r) => a + r.pnl, 0), fee = F.reduce((a, r) => a + r.fee, 0), fund = F.reduce((a, r) => a + r.fund, 0), gross = F.reduce((a, r) => a + r.g, 0);
  const sw = w.reduce((a, r) => a + r.pnl, 0), sl = lo.reduce((a, r) => a + r.pnl, 0), best = F.reduce((a, r) => (!a || r.pnl > a.pnl ? r : a), null), worst = F.reduce((a, r) => (!a || r.pnl < a.pnl ? r : a), null);
  const nMiss = MS.filter((m) => (env === "all" || m.env === env) && (!from || m.d >= from)).length;
  const summ = panel("Tổng quan", stg([["Số lệnh", nf(n, 0), "", n ? `thắng ${nf(w.length / n * 100, 0)}% · ${w.length} lời / ${lo.length} lỗ` : "không có lệnh"],
    ["Lời/lỗ ròng", n ? j$(net) : "—", cls(net), n ? `TB ${nf(F.reduce((a, r) => a + r.bps, 0) / n, 0)} bps/lệnh · sau phí & funding` : ""],
    ["Lời/lỗ theo giá", n ? j$(gross) : "—", cls(gross), "trước phí & funding"], ["Phí giao dịch", n ? j$(-fee) : "—", fee > 0 ? "down" : "", gross > 0 ? `${nf(fee / Math.max(1e-9, F.reduce((a, r) => a + Math.max(0, r.g), 0)) * 100, 0)}% tiền lời theo giá` : ""],
    ["Funding", n && nz(fund, 3) ? j$(fund) : "—", nz(fund, 3) ? cls(fund) : "", fund < 0 ? "đã trả" : fund > 0 ? "đã nhận" : "không có kỳ chốt nào"], ["Lời TB / lỗ TB", w.length || lo.length ? `${w.length ? j$(sw / w.length) : "—"} / ${lo.length ? j$(sl / lo.length) : "—"}` : "—", "", sl < 0 ? `hệ số lời ${nf(sw / -sl, 2)} (> 1 là có lời)` : ""],
    ["Lệnh tốt nhất", best ? j$(best.pnl) : "—", "up", best ? `${best.k.split(":")[0]} · ${jTm(best.t2)}` : ""], ["Lệnh tệ nhất", worst ? j$(worst.pnl) : "—", "down", worst ? `${worst.k.split(":")[0]} · ${jTm(worst.t2)}` : ""]]))
    .replace(/<\/section>\s*$/, env !== "paper" && nMiss ? `<p class="sc-goord"><span>${nMiss} lần đặt lệnh chờ nhưng không khớp (lệnh hụt) trong khoảng này</span><a class="btn sm" href="#/bot/miss/${env}">Xem lệnh hụt →</a></p></section>` : "</section>");
  // bài học tổng hợp
  const LS = jLessons(F), tb = (G, t) => (G?.length ? `<div class="jg"><p class="sbh">${t}</p><table class="jmini"><tbody>${G.slice().sort((a, b) => b.pnl - a.pnl).map((g) => `<tr><td class="l">${esc(JWHY[g.k] || g.k)}</td><td>${g.n}</td><td>${nf(g.w / g.n * 100, 0)}%</td><td class="${cls(g.pnl)}">${j$(g.pnl)}</td></tr>`).join("")}</tbody></table></div>` : "");
  const GG = Object.entries(F.reduce((o, r) => { const g = coinGrp(r.k) || "Chưa phân nhóm", x = (o[g] ||= { n: 0, w: 0, pnl: 0 }); x.n++; x.pnl += r.pnl; if (r.pnl > 0) x.w++; return o; }, {})).map(([k, g]) => ({ k, ...g }));
  const lessons = panel("Bài học tổng hợp", `<ul class="bot-rl dles">${LS.L.map(([c, m]) => `<li class="${c}">${esc(m)}</li>`).join("")}</ul>
    ${n >= 3 ? `<div class="jgs">${tb(LS.T.why, "Theo lý do đóng")}${tb(LS.T.sd, "Long / Short")}${tb(GG, "Theo nhóm coin")}${tb(LS.T.hr, "Theo giờ (VN)")}${tb((LS.T.co || []).slice(0, 4).concat((LS.T.co || []).slice(-4)).filter((g, i, a) => a.indexOf(g) === i), "Coin lỗ & lời nhiều nhất (≥ 2 lệnh)")}</div>` : ""}
    <p class="faint" style="font-size:var(--fs-xs)">Tính trên ${n} lệnh đang lọc. Cột: số lệnh · tỉ lệ thắng · lời/lỗ ròng.</p>`, n ? `${n} lệnh` : "");
  // nhật ký bài học từng ngày (bộ rút bài học của trang Kết quả theo ngày + ghi chú của anh)
  const denv = env === "all" ? (cnt.live ? "live" : "paper") : env, src = ALL[denv] || {}, days = src.days || {}, dtr = src.dtr || {}, dk = Object.keys(days).filter((d) => (!from || d >= from) && days[d]?.n).sort().reverse();
  const diary = dk.length ? panel(`Nhật ký bài học từng ngày – ${JENV.find((x) => x[0] === denv)[1]}`, dk.slice(0, 31).map((d, i) => { const D = days[d], H = Object.keys(days).filter((k) => k < d).sort().map((k) => days[k]), L = dayLessons(D, dtr[d] || [], H, C, denv), nt = NOTES[`${denv}|${d}`];
    return `<details class="jd" ${i < 2 ? "open" : ""}><summary><b>${ddmm(d)}</b> <span class="${cls(D.usd)}">${j$(D.usd || 0)}</span> <small class="faint">${D.n} lệnh · thắng ${nf(D.win / D.n * 100, 0)}%</small><a href="#/bot/days/${denv}/${d}" class="jd-a">chi tiết →</a></summary>
      <ul class="bot-rl dles">${L.L.map(([c, m]) => `<li class="${c}">${esc(m)}</li>`).join("")}</ul>${L.N.length ? `<p class="sbh">➡️ Rút kinh nghiệm</p><ul class="bot-rl dles">${L.N.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}${nt ? `<p class="jd-n">📝 ${esc(nt)}</p>` : ""}</details>`; }).join(""), `${dk.length} ngày có lệnh`) : "";
  // bảng lệnh: máy tính = bảng đủ cột, điện thoại = thẻ
  const S = F.slice(0, J.lim), sg = (r) => `<span class="${r.side > 0 ? "up" : "down"}">${r.side > 0 ? "Long" : "Short"}</span>`, ac = (r) => (r.env === "live" ? `<span class="sc-acc live">Thật</span>` : r.env === "demo" ? `<span class="sc-acc demo">Demo</span>` : `<span class="sc-acc paper">Sàn thử</span>`);
  const pT = (r) => (r.tot > 0 ? ` · ${nz(r.pnl / r.tot * 100, 2) > 0 ? "+" : ""}${nf(r.pnl / r.tot * 100, 2)}% TS` : "");
  const tbl = `<div class="tw jt-d" style="max-height:640px"><table class="jt keep"><thead><tr><th class="l">Vào → ra</th><th class="l">Lệnh</th><th>Giá vào → ra</th><th>KL · giá trị lệnh</th><th>Phí · funding</th><th>Ròng</th><th>Giữ</th><th class="l">Lý do đóng</th></tr></thead><tbody>${S.map((r) => `<tr>
      <td class="l"><small>${jTm(r.t1)}<br>→ ${jTm(r.t2)}</small></td><td class="l">${(JSTRAT[r.strat] || ["•"])[0]} <b>${esc(r.k.split(":")[0])}</b> ${sg(r)}${r.lv > 1 ? ` <small class="faint">${r.lv} mức</small>` : ""}<br>${grpTag(r.k)}${env === "all" ? " " + ac(r) : ""}</td>
      <td>${px(r.e)} → ${px(r.x)}<br><small class="${cls(r.mv)}">${nz(r.mv, 2) > 0 ? "+" : ""}${nf(r.mv, 2)}%</small></td><td>${qty(r.q)}<br><b>${usd2(r.N)}</b></td>
      <td><span class="down">${j$(-r.fee)}</span><br><small class="${nz(r.fund, 3) ? cls(r.fund) : ""}">${nz(r.fund, 3) ? j$(r.fund) : "—"}</small></td>
      <td class="${cls(r.pnl)}"><b>${j$(r.pnl)}</b><br><small>${nf(r.bps, 0)} bps${pT(r)}</small></td><td><small>${jHold(r.hold)}</small></td><td class="l jw"><small>${esc(JWHY[r.why] || r.why || "")}${r.note ? ` · ${esc(r.note)}` : ""}</small></td></tr>`).join("")}</tbody></table></div>`;
  const cards = `<div class="jt-m">${S.map((r) => `<div class="jc ${r.pnl > 0 ? "w" : "l"}"><div class="jc1"><span>${(JSTRAT[r.strat] || ["•"])[0]} <b>${esc(r.k.split(":")[0])}</b> ${sg(r)} ${grpTag(r.k)}${env === "all" ? " " + ac(r) : ""}</span><span class="jc-r"><b class="${cls(r.pnl)}">${j$(r.pnl)}</b><small class="jc-v">giá trị lệnh <b>${usd2(r.N)}</b></small></span></div>
      <div class="jc2"><span>${px(r.e)} → ${px(r.x)} <em class="${cls(r.mv)}">${nz(r.mv, 2) > 0 ? "+" : ""}${nf(r.mv, 2)}%</em></span></div>
      <div class="jc3"><small>${jTm(r.t1)} → ${jTm(r.t2)} · ${jHold(r.hold)}</small><small>KL ${qty(r.q)} · phí ${j$(-r.fee)}${nz(r.fund, 3) ? ` · funding ${j$(r.fund)}` : ""} · ${nf(r.bps, 0)} bps${pT(r)}</small><small class="faint">${esc(JWHY[r.why] || r.why || "")}${r.note ? ` · ${esc(r.note)}` : ""}</small></div></div>`).join("")}</div>`;
  const list = panel("Từng lệnh", n ? `${tbl}${cards}${n > J.lim ? `<button class="btn" id="jMore" style="margin-top:10px">Xem thêm (${n - J.lim} lệnh)</button>` : ""}` : `<p class="muted">Không có lệnh nào khớp bộ lọc.</p>`, n ? `${Math.min(n, J.lim)} / ${n} lệnh <button type="button" class="btn sm" id="jCsv">Tải CSV</button>` : "");
  app().innerHTML = head + summ + list + lessons + diary + (LG ? "" : `<p class="faint" style="font-size:var(--fs-xs)">Hiện chỉ có các lệnh gần đây (trong trạng thái trực tiếp). Sau khi anh chạy <code>sudo bash /opt/my-bit/scalper/install.sh</code>, máy chủ riêng lưu mãi mọi lệnh và dựng lại các lệnh cũ còn trong bộ nhớ.</p>`);
  const re = () => { J.lim = 100; viewJournal(env); };
  bindCommon(re);
  $$("[data-jx]").forEach((b) => (b.onclick = () => { J.res = b.dataset.jx; re(); }));
  $("#jSt").onchange = (e) => { J.st = e.target.value; re(); };
  if ($("#jMore")) $("#jMore").onclick = () => { J.lim += 100; viewJournal(env); };
  if ($("#jCsv")) $("#jCsv").onclick = () => {
    const H = ["tai_khoan", "phuong_phap", "coin", "nhom", "chieu", "gio_vao_VN", "gio_ra_VN", "gia_vao", "khoi_luong", "gia_tri_USDT", "gia_ra", "gia_di_%", "loi_lo_theo_gia", "phi", "funding", "loi_lo_rong", "bps_rong", "giu_giay", "ly_do", "ghi_chu"];
    const vn = (s) => { const t = jT(s); return isNum(t) ? new Date(t + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " ") : ""; }, q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    const L = F.map((r) => [r.env, r.strat, r.k.split(":")[0], coinGrp(r.k), r.side > 0 ? "Long" : "Short", vn(r.t1), vn(r.t2), r.e, r.q, r.N.toFixed(4), r.x, r.mv.toFixed(3), r.g.toFixed(4), r.fee.toFixed(4), r.fund.toFixed(4), r.pnl.toFixed(4), r.bps.toFixed(1), isNum(r.hold) ? Math.round(r.hold) : "", JWHY[r.why] || r.why || "", r.note || ""].map(q).join(","));
    const blob = new Blob(["﻿" + [H.join(","), ...L].join("\n")], { type: "text/csv;charset=utf-8" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `mybit-so-lenh-${env}-${TD}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
}

// ================================================================ 🤖 BOT CỦA TÔI – 1 cửa vào cho mọi bot: đang chạy không, lời/lỗ hôm nay, lệnh mở, tiền thật, rủi ro chung
async function viewBotHome() {
  if (ME && !can("bot")) { app().innerHTML = `<div class="ph"><h1>🤖 Bot của tôi</h1></div><div class="panel"><p class="muted">🔒 Bot giao dịch tự động dành cho gói Pro.</p></div>`; return; }
  const [rc, rs, rq, rv, rk, rx] = await Promise.all([Store.get("bot"), Store.get("botstate"), Store.get("sup"), Store.get("supstate"), Store.get("scalp"), Store.get("scalpstate")]);
  const X0 = rx.data || {}, X = X0.v === 2 ? X0 : { at: X0.at }, C = { ...SCALP_DEF, ...(typeof scMig === "function" ? scMig(rk.data) : rk.data || {}) }, LV = X.live || null;
  const age = X.at ? (Date.now() - Date.parse(X.at + "Z")) / 1000 : null, alive = age != null && age < 90;
  const sp = (v) => (isNum(v) ? `<b class="${cls(v)}">${v >= 0 ? "+" : ""}${nf(v, 2)}%</b>` : "—"), su = (v) => (isNum(v) ? `<b class="${cls(v)}">${v >= 0 ? "+" : ""}${usd2(v)}</b>` : "—");
  // Bot Phản Xạ
  const day = X.day?.eq0 ? (X.eq / X.day.eq0 - 1) * 100 : null, ret = X.start ? (X.eq / X.start - 1) * 100 : null;
  const pend = Object.keys(X.hk || {}).length, posN = Object.keys(X.pos || {}).length, qN = X.q ? ["ou", "rsi2", "fund", "orb", "vwap", "liq"].reduce((a, k) => a + (X.q[k]?.pos?.length || 0), 0) : 0, swN = X.sw ? ["list", "pump"].reduce((a, k) => a + (X.sw[k]?.pos?.length || 0), 0) : 0;
  const lvOpen = (LV?.ev || []).length + (LV?.qp?.open?.length || 0) + (LV?.swp?.open?.length || 0), lvEnv = (LV?.env || C.lv_env) === "live" ? "Binance thật" : "Binance Demo";
  const scSt = !C.enabled ? ["Đang tắt", ""] : X.pause ? ["⏸ Tạm nghỉ", "warn"] : alive ? ["● Đang chạy", "buy"] : ["Chờ máy chủ", "warn"];
  // Bot xu hướng
  let B = botsOf(rc.data).map((b, i) => ({ ...BOT_DEF, ...b, id: b.id || "b" + (i + 1) })); if (!B.length) B = [{ ...BOT_DEF, id: "b1" }];      // giống trang Bot xu hướng
  const SS = statesOf(rs.data);
  const tr = B.map((b) => { const s = SS[b.id], q = s?.eq?.length ? s.eq[s.eq.length - 1][1] : null; return { b, s, on: !!b.enabled, pos: (s?.pos || []).length, r: s?.start && q ? (q / s.start - 1) * 100 : null }; });
  const trOn = tr.filter((x) => x.on).length, trPos = tr.reduce((a, x) => a + x.pos, 0);
  const card = (href, ico, name, pill, rows, foot) => `<a class="bh-card" href="${href}"><header><b>${ico} ${name}</b><span class="pill ${pill[1]}">${pill[0]}</span></header><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl><footer>${foot} <span aria-hidden="true">→</span></footer></a>`;
  const scCard = card("#/bot/scalp", "⚡", "Bot Phản Xạ", scSt, [      // tiền thật lên đầu
    [C.lv_on ? lvEnv : "Tiền thật", C.lv_on ? `hôm nay ${su(LV?.day?.pnl ?? 0)} · ${lvOpen} lệnh mở${LV?.halt ? ` · <span class="down">ngừng mở mới</span>` : ""}` : `<span class="faint">đang tắt</span>`],
    ["Sàn thử", X.eq ? `${usd2(X.eq)} · hôm nay ${sp(day)} · từ đầu ${sp(ret)}` : "chưa có số liệu"],
    ["Đang mở (sàn thử)", `${posN} lệnh${pend ? ` · ${pend} chờ khớp` : ""}${swN || qN ? ` · thử nghiệm ${swN + qN}` : ""}`]],
    "Bắt râu sập · Lướt giây · Thử nghiệm");
  const trCard = card("#/bot", "📈", "Bot xu hướng", trOn ? [`● ${trOn}/${B.length} bot chạy`, "buy"] : ["Đang tắt", ""], [
    ["Số bot", `${B.length} bot · ${trOn} đang chạy`], ["Đang mở", `${trPos} lệnh`],
    ["Kết quả", tr.length ? tr.map((x) => `${esc(x.b.name)} ${sp(x.r)}`).join(" · ") : "—"]], "Khung ngày / 4 giờ · sàn thử · mở");
  const ss = rv.data, sc = { ...(typeof SUP_DEF === "object" ? SUP_DEF : {}), ...(rq.data || {}) }, a = ss?.acct || {};
  const supCard = card("#/bot/sup", "🛡️", "Giám sát rủi ro", !sc.enabled ? ["Đang tắt", ""] : ss?.halt ? ["⛔ Khoá", "sell"] : ["● Đang giám sát", "buy"], [
    ["Tài sản chung", isNum(a.eq) ? `${usd2(a.eq)} · sụt ${nf(a.dd, 1)}%` : "—"], ["Rủi ro đang mở", isNum(a.heat) ? `${nf(a.heat, 1)}%` : "—"], ["Nhận xét", esc(ss?.think?.head || "chờ lượt chạy đầu tiên")]],
    "Giới hạn rủi ro chung, khám nghiệm lệnh · mở");
  const resCard = card("#/bot/days", "📒", "Kết quả & sổ lệnh", ["mọi bot", ""], [["Theo ngày", "lãi/lỗ từng ngày, sàn thử & Binance"], ["Sổ lệnh", "mọi lệnh: giá vào/ra, phí, funding"], ["Bài học", "tổng hợp từ lệnh đã đóng"]], "Xem báo cáo");
  const binCard = card("#/bot/binance", "💵", "Tài khoản Binance", C.lv_on ? [LV?.halt ? "⛔ Ngừng mở mới" : `● ${lvEnv}`, LV?.halt ? "sell" : "buy"] : ["Bot chưa nối", ""], [
    ["Số dư futures", isNum(LV?.st?.bal) ? usd2(LV.st.bal) : "—"], ["Hôm nay", C.lv_on ? su(LV?.day?.pnl ?? 0) : "—"], ["Kết nối", "khoá API trên máy chủ · không có quyền rút tiền"]], "Số dư, ví, khoá API · mở");
  app().innerHTML = `${botHubHead("home")}
    ${PG("Tổng quan bot")}
    <div class="bh-grid">${C.lv_on ? binCard + scCard : scCard + binCard}${resCard}${supCard}</div>
    <h3 class="bh-sub">🧪 Thử nghiệm</h3><div class="bh-grid">${trCard}</div>
    <p class="faint bh-help">Gợi ý: <b>⚡ Bot Phản Xạ</b> là bot đánh tiền thật trên Binance (bắt râu sập) · <b>📒 Kết quả & sổ lệnh</b> gộp kết quả của mọi bot · <b>💵 Tài khoản Binance</b>: số dư, ví, khoá API · <b>🛡️ Rủi ro & giám sát</b> theo dõi rủi ro chung · <b>📈 Bot xu hướng</b> đang thử nghiệm trên sàn thử.</p>`;
}
// đầu trang chung của trang chính Bot: 2 tab con "Tổng quan" (mọi bot) và "Rủi ro & giám sát" (Bot giám sát cũ) – cùng 1 trang
function botHubHead(on) {
  return `<div class="ph"><h1>Bot</h1><span class="meta">Lời/lỗ · lệnh mở · rủi ro chung</span></div>
    <div class="sc-sub2 bh-tabs" role="tablist">${[["home", "#/bot/home", "Tổng quan", "mọi bot · hôm nay"], ["sup", "#/bot/sup", "Rủi ro & giám sát", "giới hạn chung · khám nghiệm lệnh"]].map(([k, h, t, d]) => `<a role="tab" href="${h}" class="${on === k ? "on" : ""}" aria-selected="${on === k}"><span>${t}</span><small>${d}</small></a>`).join("")}</div>`;
}
