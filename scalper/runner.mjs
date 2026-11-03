#!/usr/bin/env node
// MyBit – BOT LƯỚT GIÂY chạy trên MÁY CHỦ RIÊNG (VPS), nối thẳng Binance futures + Binance spot.
// Dùng chung bộ não với bản Cloudflare (../worker/scalp_core.js). Thiết lập đọc từ trang MyBit, trạng thái gửi về trang MyBit
// qua cổng /api/scalp-runner, xác thực bằng khoá anh tạo trên trang (Bot Phản Xạ → Thiết lập → Nơi chạy → Tạo khoá).
// Mặc định là SÀN THỬ. Chỉ khi anh tự cài khoá Binance (install.sh --binance) VÀ bật "Tài khoản Binance thật" trên trang thì
// phương pháp Bắt râu sập mới đặt lệnh thật – xem scalper/live.mjs.
//
// Chạy:  node scalper/runner.mjs        (cần Node.js ≥ 22; tệp scalper/.env chứa MYBIT_SCALP_KEY=...)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ScalpCore, ORD_VPS } from "../worker/scalp_core.js";
import { LiveExec } from "./live.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// ---------------------------------------------------------------- cấu hình (.env cạnh tệp này, hoặc biến môi trường)
for (const f of [path.join(HERE, ".env")]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const SITE = (process.env.MYBIT_SITE || "https://my-bit.pages.dev").replace(/\/+$/, "");
const KEY = (process.env.MYBIT_SCALP_KEY || "").trim().toLowerCase();
const DIR = process.env.MYBIT_DATA || path.join(HERE, "data");
const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace("T", " "), ...a);
if (!/^[0-9a-f]{64}$/.test(KEY)) { log("❌ Thiếu MYBIT_SCALP_KEY (64 ký tự) trong scalper/.env – tạo khoá trên trang: Bot Phản Xạ → Thiết lập → Nơi chạy → Máy chủ riêng → Tạo khoá"); process.exit(1); }
if (typeof WebSocket === "undefined") { log("❌ Cần Node.js ≥ 22 (có sẵn WebSocket)"); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });

// ---------------------------------------------------------------- lưu trữ: một tệp JSON, ghi kiểu nguyên tử (tệp tạm rồi đổi tên)
class FileKV {
  constructor(file) { this.file = file; this.m = new Map(); this.t = null; try { this.m = new Map(Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))); } catch (e) { /* tệp mới */ } }
  async get(k) { return this.m.get(k); }
  async put(k, v) { if (typeof k === "object") for (const [a, b] of Object.entries(k)) this.m.set(a, b); else this.m.set(k, v); this.soon(); }
  async list({ prefix = "" } = {}) { return new Map([...this.m].filter(([k]) => k.startsWith(prefix))); }
  async delete(ks) { for (const k of [].concat(ks)) this.m.delete(k); this.soon(); }
  soon() { if (!this.t) this.t = setTimeout(() => this.flush(), 5000); }
  flush() { clearTimeout(this.t); this.t = null; const tmp = this.file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.m))); fs.renameSync(tmp, this.file); }
}
const kv = new FileKV(path.join(DIR, "state.json"));

// ---------------------------------------------------------------- cổng trang MyBit
async function api(method, body, sub = "") {
  const r = await fetch(`${SITE}/api/scalp-runner${sub}`, { method, headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", "user-agent": "mybit-scalper" }, body, signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  if (!r.ok) { let m = t; try { m = JSON.parse(t).error || t; } catch (e) { /* để nguyên */ } throw new Error(`HTTP ${r.status}: ${String(m).slice(0, 200)}`); }
  return JSON.parse(t);
}
let UID = null;
const readCfg = async () => { const j = await api("GET"); UID = j.uid; return j.cfg; };
let live = null;
// số lệnh đang chờ khớp + đang mở → số trên biểu tượng app (điện thoại). Đang chạy lệnh thật/Demo → đếm lệnh đó, không thì đếm Bắt râu sập sàn thử.
let ACT = null;
const actOf = (out) => {
  const ids = new Set([...Object.keys(out.hk || {}), ...Object.entries(out.pos || {}).filter(([, p]) => p.strat === "hook").map(([k]) => k)]);
  const L = live ? live.active() : [], lo = L.filter((e) => e.pos?.q > 0).length, onL = !!(core?.cfg?.lv_on && live);
  return { n: onL ? L.length : ids.size, paper: ids.size, lw: L.length - lo, lo, src: onL ? live.env() : "paper", at: new Date().toISOString() };
};
const writeState = async (uid, out) => { try { ACT = actOf(out); } catch (e) { ACT = null; } return api("POST", JSON.stringify(live ? { ...out, live: live.summary(), act: ACT } : { ...out, act: ACT })); };
const loadBrain = async () => api("GET", undefined, "/brain");
const saveDays = async (uid, paper) => api("POST", JSON.stringify({ v: 1, at: new Date().toISOString(), paper, demo: live?.daysOut("demo"), live: live?.daysOut("live") }), "/days");
// ---------------------------------------------------------------- 📒 SỔ GIAO DỊCH ĐẦY ĐỦ: mọi lệnh đã đóng (sàn thử / Demo / thật) – giá vào, khối lượng, giá ra, phí, funding, lời/lỗ
// lưu mãi trên máy chủ (data/ledger.json) + gửi lên MyBit (trang "Sổ lệnh & bài học") 5 phút/lần. Dòng: [tài khoản, phương pháp, mã, chiều, KL, giá vào, giá ra,
// giờ vào, giờ ra (UTC), phí, funding, lời/lỗ ròng USDT, lý do đóng, số mức khớp, cú sốc bps, % tổng tài sản lúc đó, ghi chú]
const LEDF = path.join(DIR, "ledger.json");
let LED = { v: 1, bf: false, rows: [] }; try { const j = JSON.parse(fs.readFileSync(LEDF, "utf8")); if (Array.isArray(j.rows)) LED = j; } catch (e) { /* tệp mới */ }
let ledDirty = true;
const r8 = (v) => (Number.isFinite(+v) ? +(+v).toPrecision(8) : null), r4 = (v) => (Number.isFinite(+v) ? +(+v).toFixed(4) : 0);
const ledKey = (r) => `${r[0]}|${r[2]}|${String(r[8]).slice(0, 19)}`;
const ledAdd = (t) => {
  if (!t || !t.t2 || !(+t.q > 0) || !(+t.e > 0)) return;
  const r = [t.env || "paper", t.strat || "hook", t.k, t.side > 0 ? 1 : -1, r8(t.q), r8(t.e), r8(t.x), String(t.t1 || "").slice(0, 19), String(t.t2).slice(0, 19), r4(t.fee), r4(t.fund), r4(t.pnl), t.why || "", t.lv || null, t.R || null, t.tot > 0 ? +(+t.tot).toFixed(2) : null, t.note ? String(t.note).slice(0, 80) : null];
  const k = ledKey(r); if (LED.rows.some((x) => ledKey(x) === k)) return;
  LED.rows.push(r); LED.rows.sort((a, b) => (a[8] < b[8] ? -1 : a[8] > b[8] ? 1 : 0)); ledDirty = true;
};
const ledTrim = () => {      // giữ dưới ~1,7 MB: bỏ lệnh sàn thử cũ nhất trước, rồi Demo; lệnh TIỀN THẬT giữ lại hết
  for (const env of ["paper", "demo"]) { while (JSON.stringify(LED.rows).length > 1.7e6) { const i = LED.rows.findIndex((r) => r[0] === env); if (i < 0) break; LED.rows.splice(i, 1); } }
};
const ledBackfill = () => {      // lần đầu: dựng lại từ lịch sử đang có (sàn thử 300 lệnh gần nhất, Binance 200 lệnh, phòng thử nghiệm 200 lệnh/phương pháp)
  if (LED.bf) return; LED.bf = true;
  for (const t of core?.S?.trades || []) {
    const n0 = t.net && t.usd ? Math.abs(t.usd / (t.net / 1e4)) : null; if (!n0) continue;
    const ent = t.t0 || (t.t1 && t.hold ? new Date(Date.parse(t.t1 + "Z") - t.hold * 1000).toISOString() : null);
    ledAdd({ env: "paper", strat: t.strat || "sec", k: t.k, side: t.side, q: n0 / t.e, e: t.e, x: t.x, t1: ent, t2: t.t1, fee: (t.fee || 0) * n0 / 1e4, fund: t.fu || 0, pnl: t.usd, why: t.why, lv: t.lv, R: t.shock });
  }
  for (const h of live?.S?.hist || []) live.led?.(h);
  for (const k of ["list", "pump"]) for (const h of core?.S?.sw?.[k]?.hist || []) ledAdd({ env: "paper", strat: k, k: h.sym.replace(/USDT$/, "") + ":F", side: h.side, q: h.N / h.e, e: h.e, x: h.x, t1: h.t0, t2: h.t2, fee: h.fee, fund: h.fund, pnl: h.net, why: h.why, note: h.note });
};
const ledSave = async () => {
  try { ledBackfill(); } catch (e) { log("📒 dựng lại sổ lệnh:", e.message); }
  if (!ledDirty) return; ledTrim();
  try { const tmp = LEDF + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(LED)); fs.renameSync(tmp, LEDF); } catch (e) { log("📒 ghi sổ lệnh:", e.message); }
  try { await api("POST", JSON.stringify({ v: 1, at: new Date().toISOString(), rows: LED.rows }), "/ledger"); ledDirty = false; } catch (e) { log("📒 gửi sổ lệnh:", e.message); }
};
const notify = async (uid, items) => api("POST", JSON.stringify({ items, act: ACT }), "/notify");
const saveBrain = async (uid, b) => { await api("POST", JSON.stringify(b), "/brain"); if (b) log(`🧠 đã lưu bộ nhớ học lên MyBit: ${b.n} mẫu, ${b.coins} coin`); };
const openWS = (url) => new Promise((res, rej) => {
  const ws = new WebSocket(url);
  const tm = setTimeout(() => { rej(new Error("hết thời gian chờ kết nối")); try { ws.close(); } catch (e) { /* bỏ qua */ } }, 15000);
  ws.addEventListener("open", () => { clearTimeout(tm); res(ws); }, { once: true });
  ws.addEventListener("error", (e) => { clearTimeout(tm); rej(new Error(e?.message || "lỗi WebSocket")); }, { once: true });
});

// ---------------------------------------------------------------- tự đo sức máy: độ trễ vòng lặp sự kiện (event loop) → tự giảm / tăng số thị trường quét
// Máy nhỏ (1 vCPU) mà dữ liệu đổ về nhiều hơn sức xử lý thì tin nhắn xếp hàng, trễ tăng dần, bộ nhớ phình ra → phải bớt thị trường.
const CAP = { F: +(process.env.MYBIT_CAP || 1000), S: +(process.env.MYBIT_CAP || 1000) }, LAG = [];
let lagT = performance.now(), capAt = Date.now();
setInterval(() => { const n = performance.now(); LAG.push(Math.max(0, n - lagT - 1000)); lagT = n; if (LAG.length > 60) LAG.shift(); }, 1000);
// ---- đo CPU mỗi phút: bot dùng bao nhiêu % một nhân, cả máy bận bao nhiêu, "steal" (nhà cung cấp đang bóp CPU), chờ ổ đĩa, 5 chương trình ăn CPU nhất.
// Nhà cung cấp VPS (vd. Vultr) giới hạn CPU cả tài khoản nếu máy chạy cao liên tục → bot tự bớt thị trường khi vượt MYBIT_CPU_MAX % (mặc định 40).
const CPU_MAX = +(process.env.MYBIT_CPU_MAX || 40), CPU = { me: null, sys: null, steal: null, io: null, top: [], hist: [] };
let cpuPrev = process.cpuUsage(), cpuT = performance.now(), statPrev = null, procPrev = new Map();
const rd = (f) => { try { return fs.readFileSync(f, "utf8"); } catch (e) { return null; } };
function cpuSample() {
  const u = process.cpuUsage(cpuPrev), t = performance.now(); CPU.me = Math.round((u.user + u.system) / 1000 / Math.max(1, t - cpuT) * 1000) / 10; cpuPrev = process.cpuUsage(); cpuT = t;
  CPU.hist = [...CPU.hist.slice(-9), CPU.me];
  const st = rd("/proc/stat")?.split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
  if (st && statPrev) { const d = st.map((v, i) => v - (statPrev[i] || 0)), tot = d.reduce((a, b) => a + b, 0) || 1; CPU.sys = Math.round((tot - d[3] - (d[4] || 0)) / tot * 100); CPU.io = Math.round((d[4] || 0) / tot * 100); CPU.steal = Math.round((d[7] || 0) / tot * 100); }
  if (st) statPrev = st;
  try {      // chương trình nào ăn CPU nhất trong phút qua (đọc /proc, không cần quyền root)
    const now = new Map(), dt = 60 * 100 * Math.max(1, os.cpus().length);
    for (const pid of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(pid)) continue;
      const x = rd(`/proc/${pid}/stat`); if (!x) continue;
      const a = x.lastIndexOf(")"), name = x.slice(x.indexOf("(") + 1, a), f = x.slice(a + 2).split(" "), ticks = +f[11] + +f[12];
      now.set(pid, [name, ticks]);
    }
    CPU.top = [...now].map(([pid, [name, tk]]) => [name, pid, procPrev.has(pid) ? tk - procPrev.get(pid)[1] : 0]).filter((q) => q[2] > 0).sort((a, b) => b[2] - a[2]).slice(0, 5).map(([n, pid, d]) => [n, +pid, Math.round(d / dt * 1000) / 10]);
    procPrev = now;
  } catch (e) { /* không đọc được /proc */ }
}
setInterval(cpuSample, 60000);
const lagP = (q) => { const a = [...LAG].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : 0; };
// Không bao giờ bớt coin theo dõi (anh muốn MỌI mã Binance luôn được cập nhật) – quá tải thì giảm phần việc tốn CPU của "lướt giây":
// mức 1: lướt giây chỉ học 150 coin lớn nhất · mức 2: tạm dừng lướt giây. Bắt râu sập, quản lý lệnh, giá luôn chạy trên toàn bộ thị trường.
let liteAt = 0;
function adapt() {
  if (LAG.length < 30 || Date.now() - capAt < 60000) return;
  const p90 = lagP(0.9), mem = process.memoryUsage().rss / 1048576, H = CPU.hist.slice(-2), cpu = H.length === 2 ? (H[0] + H[1]) / 2 : null, lv = core.lite || 0;
  const hot = p90 > 300 || mem > 700 || (cpu != null && cpu > CPU_MAX), cool = p90 < 40 && mem < 450 && cpu != null && cpu < CPU_MAX * 0.5;
  capAt = Date.now();
  if (hot && lv < 2) { core.lite = lv + 1; liteAt = Date.now(); log(`⚠️ máy bận (trễ ${p90.toFixed(0)} ms, RAM ${mem.toFixed(0)} MB, CPU bot ${cpu != null ? cpu.toFixed(0) + "%" : "?"} / giới hạn ${CPU_MAX}%) → ${core.lite === 1 ? "lướt giây chỉ học 150 coin lớn nhất" : "tạm dừng lướt giây"} · vẫn theo dõi đủ mọi coin`); }
  else if (cool && lv > 0 && Date.now() - liteAt > 900000) { core.lite = lv - 1; liteAt = Date.now(); log(`máy rảnh (CPU bot ${cpu.toFixed(0)}%) → ${core.lite ? "lướt giây học 150 coin lớn nhất" : "lướt giây chạy đầy đủ"}`); }
}
const sys = () => ({ lag50: Math.round(lagP(0.5)), lag90: Math.round(lagP(0.9)), rss: Math.round(process.memoryUsage().rss / 1048576), load: os.loadavg()[0].toFixed(2), cpus: os.cpus().length, mem: Math.round(os.totalmem() / 1048576), cap: { ...CAP }, lite: core.lite || 0, cpu: CPU.me, cpuMax: CPU_MAX, sysCpu: CPU.sys, steal: CPU.steal, iow: CPU.io, top: CPU.top });

// ---------------------------------------------------------------- chạy
const core = new ScalpCore({ kv, where: "vps", ord: ORD_VPS, host: os.hostname(), openWS, readCfg, writeState, loadBrain, saveBrain, saveDays, notify, cap: (t) => CAP[t], sys });
live = new LiveExec({ core, dir: DIR, log });
core.io.onHook = (h) => live.onHook(h);
core.io.onSwing = (s) => live.onSwing(s);
core.io.onTrade = (t) => { try { ledAdd(t); } catch (e) { log("📒", e.message); } };
let walBusy = 0; core.io.onWalReq = () => { if (Date.now() - walBusy < 20e3) return; walBusy = Date.now(); live.wallets().then(() => core.snapshot?.()).catch((e) => log("💵 đọc ví:", e.message)); };      // 🔄 Danh mục: đọc ví ngay
core.io.onManual = (k) => live.onManual(k);      // ✋ anh bấm "Đóng" trên trang      // 🧪 Short coin vừa bơm → lệnh thật (khi anh bật trong Thiết lập)
let busy = false, lastErr = "";
async function tick(first) {
  if (busy) return; busy = true;
  try {
    const on = first ? await core.boot(UID) : await core.tick();
    adapt();
    const F = Object.values(core.F).map((f) => `${f.t === "F" ? "futures" : "spot"} ${f.src || "—"} ${f.list.length} thị trường ${Math.round(f.rate || 0)} tin/giây${f.ws ? "" : " (mất kết nối)"}`).join(" · ");
    const e = core.diag.err.slice(-1)[0] || "";
    if (first || Date.now() % 60000 < 10000 || e !== lastErr) log(on ? "● chạy" : "○ chờ (bot đang tắt hoặc chọn chạy ở Cloudflare)", "·", F || "chưa kết nối", "·", `trễ ${Math.round(lagP(0.9))} ms · RAM ${Math.round(process.memoryUsage().rss / 1048576)} MB · CPU bot ${CPU.me ?? "?"}% · cả máy ${CPU.sys ?? "?"}%${CPU.steal ? ` (bị bóp ${CPU.steal}%)` : ""}`, "·", core.S ? `tài sản ${core.equity().toFixed(2)} · ${core.S.stats.n} lệnh` : "", e && e !== lastErr ? `· lỗi: ${e}` : "");
    if (/HTTP 401/.test(e) && (!tick.h || Date.now() - tick.h > 300000)) { tick.h = Date.now(); log("🔑 Khoá trên máy chủ KHÔNG khớp khoá trên trang (đã tạo khoá mới?). Trên trang: Tạo khoá → Chép; trên máy chủ chạy:  curl -fsSL https://raw.githubusercontent.com/havudinhkhanh/my-bit/main/scalper/install.sh | sudo bash -s -- --key"); }
    lastErr = e;
  } catch (e) { log("⚠️", e.message); } finally { busy = false; }
}
async function main() {
  log(`MyBit bot Phản Xạ – máy chủ riêng ${os.hostname()} · trang ${SITE}`);
  for (let i = 0; ; i++) {     // chờ trang MyBit trả lời (khoá đúng, gói Pro)
    try { await readCfg(); break; } catch (e) { log("⚠️ chưa kết nối được trang MyBit:", e.message); if (/HTTP 40[12]/.test(e.message) && i > 2) log("   → kiểm tra lại khoá trong scalper/.env (tạo khoá mới trên trang nếu cần)"); await new Promise((r) => setTimeout(r, 30000)); }
  }
  log(`Đã xác thực – tài khoản #${UID}`);
  await tick(true);
  setInterval(() => tick(false), 10000);
  // tài khoản Binance thật: kiểm tra mỗi 5 phút, quản lý lệnh mỗi 2 giây (chạy cả khi bot tạm tắt – lệnh đang mở vẫn phải được đóng đúng hạn)
  const lvCheck = async () => { try { if (core.cfg?.lv_on || live.active().length || live.keys()) await live.check(); live.resume(core.cfg?.lv_resume_at); } catch (e) { log("💵 kiểm tra:", e.message); } try { await live.wallets(); } catch (e) { log("💵 tổng tài sản:", e.message); } };
  await lvCheck(); setInterval(lvCheck, 300000);
  setTimeout(ledSave, 60000); setInterval(ledSave, 300000);      // 📒 sổ lệnh: lần đầu sau 1 phút (đợi nạp trạng thái), rồi 5 phút/lần
  setInterval(() => live.tick().catch((e) => log("💵", e.message)), 2000);
  let lvOn = null; setInterval(() => { const on = !!core.cfg?.lv_on; if (on !== lvOn) { lvOn = on; if (on) lvCheck(); } }, 15000);
  setTimeout(() => setInterval(() => { if (!busy && core.here()) core.snapshot().catch(() => {}); }, 10000), 5000);
  let pxOff = false;      // chuyển tiếp giá Binance thật cho các bot phút (chỉ máy chủ của quản trị viên – trang trả 403 nếu không phải)
  setInterval(async () => { if (pxOff || !core.here()) return; const px = core.pxRelay(); if (Object.keys(px).length < 10) return; try { await api("POST", JSON.stringify({ px }), "/px"); } catch (e) { if (/HTTP 403/.test(e.message)) { pxOff = true; log("ℹ️ tài khoản không phải quản trị viên – không chuyển tiếp giá cho bot phút"); } } }, 10000);   // gửi số liệu lên trang mỗi ~5 giây (xen giữa các vòng 10 giây)
}
const stop = async (sig) => { log(`Nhận ${sig} – lưu trạng thái rồi thoát`); try { await core.snapshot(); await core.saveBrain(); await ledSave(); } catch (e) { /* bỏ qua */ } try { kv.flush(); } catch (e) { /* bỏ qua */ } process.exit(0); };
process.on("SIGTERM", () => stop("SIGTERM")); process.on("SIGINT", () => stop("SIGINT"));
process.on("unhandledRejection", (e) => log("⚠️ unhandled", e?.message || e));
main();
