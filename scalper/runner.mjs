#!/usr/bin/env node
// MyBit – BOT LƯỚT GIÂY chạy trên MÁY CHỦ RIÊNG (VPS), nối thẳng Binance futures + Binance spot.
// Dùng chung bộ não với bản Cloudflare (../worker/scalp_core.js). Thiết lập đọc từ trang MyBit, trạng thái gửi về trang MyBit
// qua cổng /api/scalp-runner, xác thực bằng khoá anh tạo trên trang (Bot lướt giây → Thiết lập → Nơi chạy → Tạo khoá).
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
if (!/^[0-9a-f]{64}$/.test(KEY)) { log("❌ Thiếu MYBIT_SCALP_KEY (64 ký tự) trong scalper/.env – tạo khoá trên trang: Bot lướt giây → Thiết lập → Nơi chạy → Máy chủ riêng → Tạo khoá"); process.exit(1); }
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
const writeState = async (uid, out) => api("POST", JSON.stringify(live ? { ...out, live: live.summary() } : out));
const loadBrain = async () => api("GET", undefined, "/brain");
const notify = async (uid, items) => api("POST", JSON.stringify({ items }), "/notify");
const saveBrain = async (uid, b) => { await api("POST", JSON.stringify(b), "/brain"); if (b) log(`🧠 đã lưu bộ nhớ học lên MyBit: ${b.n} mẫu, ${b.coins} coin`); };
const openWS = (url) => new Promise((res, rej) => {
  const ws = new WebSocket(url);
  const tm = setTimeout(() => { rej(new Error("hết thời gian chờ kết nối")); try { ws.close(); } catch (e) { /* bỏ qua */ } }, 15000);
  ws.addEventListener("open", () => { clearTimeout(tm); res(ws); }, { once: true });
  ws.addEventListener("error", (e) => { clearTimeout(tm); rej(new Error(e?.message || "lỗi WebSocket")); }, { once: true });
});

// ---------------------------------------------------------------- tự đo sức máy: độ trễ vòng lặp sự kiện (event loop) → tự giảm / tăng số thị trường quét
// Máy nhỏ (1 vCPU) mà dữ liệu đổ về nhiều hơn sức xử lý thì tin nhắn xếp hàng, trễ tăng dần, bộ nhớ phình ra → phải bớt thị trường.
const CAP = { F: +(process.env.MYBIT_CAP || 400), S: +(process.env.MYBIT_CAP || 400) }, LAG = [];
let lagT = performance.now(), capAt = Date.now();
setInterval(() => { const n = performance.now(); LAG.push(Math.max(0, n - lagT - 1000)); lagT = n; if (LAG.length > 60) LAG.shift(); }, 1000);
const lagP = (q) => { const a = [...LAG].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : 0; };
function adapt() {
  if (LAG.length < 30 || Date.now() - capAt < 60000) return;
  const p90 = lagP(0.9), mem = process.memoryUsage().rss / 1048576;
  let ch = 0;
  if (p90 > 300 || mem > 700) ch = 0.7; else if (p90 < 40 && mem < 400 && Date.now() - capAt > 600000) ch = 1.15;
  if (!ch) return;
  // chỉ kết nối lại luồng nào mà danh sách thị trường thật sự đổi (trước đây cứ 10 phút lại kết nối lại cả hai luồng – mất dữ liệu vài giây mỗi lần)
  const redo = [];
  for (const f of Object.values(core.F)) {
    const t = f.t, n = f.list.length, old = CAP[t];
    if (ch < 1) CAP[t] = Math.max(40, Math.round(Math.min(old, n) * ch));
    else if (n >= old) CAP[t] = Math.min(1000, Math.round(old * ch));      // chỉ nâng khi đang bị giới hạn bởi trần
    if (CAP[t] < n || (CAP[t] > old && n >= old)) redo.push(f);
  }
  capAt = Date.now();
  if (!redo.length) return;
  log(ch < 1 ? `⚠️ máy quá tải (trễ ${p90.toFixed(0)} ms, RAM ${mem.toFixed(0)} MB) → giảm còn tối đa ${CAP.F} futures / ${CAP.S} spot` : `máy còn dư sức → nâng lên tối đa ${CAP.F} futures / ${CAP.S} spot`);
  for (const f of redo) f.at = 0;    // kết nối lại với danh sách mới ở vòng sau
}
const sys = () => ({ lag50: Math.round(lagP(0.5)), lag90: Math.round(lagP(0.9)), rss: Math.round(process.memoryUsage().rss / 1048576), load: os.loadavg()[0].toFixed(2), cpus: os.cpus().length, mem: Math.round(os.totalmem() / 1048576), cap: { ...CAP } });

// ---------------------------------------------------------------- chạy
const core = new ScalpCore({ kv, where: "vps", ord: ORD_VPS, host: os.hostname(), openWS, readCfg, writeState, loadBrain, saveBrain, notify, cap: (t) => CAP[t], sys });
live = new LiveExec({ core, dir: DIR, log });
core.io.onHook = (h) => live.onHook(h);
let busy = false, lastErr = "";
async function tick(first) {
  if (busy) return; busy = true;
  try {
    const on = first ? await core.boot(UID) : await core.tick();
    adapt();
    const F = Object.values(core.F).map((f) => `${f.t === "F" ? "futures" : "spot"} ${f.src || "—"} ${f.list.length} thị trường ${Math.round(f.rate || 0)} tin/giây${f.ws ? "" : " (mất kết nối)"}`).join(" · ");
    const e = core.diag.err.slice(-1)[0] || "";
    if (first || Date.now() % 60000 < 10000 || e !== lastErr) log(on ? "● chạy" : "○ chờ (bot đang tắt hoặc chọn chạy ở Cloudflare)", "·", F || "chưa kết nối", "·", `trễ ${Math.round(lagP(0.9))} ms · RAM ${Math.round(process.memoryUsage().rss / 1048576)} MB`, "·", core.S ? `tài sản ${core.equity().toFixed(2)} · ${core.S.stats.n} lệnh` : "", e && e !== lastErr ? `· lỗi: ${e}` : "");
    if (/HTTP 401/.test(e) && (!tick.h || Date.now() - tick.h > 300000)) { tick.h = Date.now(); log("🔑 Khoá trên máy chủ KHÔNG khớp khoá trên trang (đã tạo khoá mới?). Trên trang: Tạo khoá → Chép; trên máy chủ chạy:  curl -fsSL https://raw.githubusercontent.com/havudinhkhanh/my-bit/main/scalper/install.sh | sudo bash -s -- --key"); }
    lastErr = e;
  } catch (e) { log("⚠️", e.message); } finally { busy = false; }
}
async function main() {
  log(`MyBit bot lướt giây – máy chủ riêng ${os.hostname()} · trang ${SITE}`);
  for (let i = 0; ; i++) {     // chờ trang MyBit trả lời (khoá đúng, gói Pro)
    try { await readCfg(); break; } catch (e) { log("⚠️ chưa kết nối được trang MyBit:", e.message); if (/HTTP 40[12]/.test(e.message) && i > 2) log("   → kiểm tra lại khoá trong scalper/.env (tạo khoá mới trên trang nếu cần)"); await new Promise((r) => setTimeout(r, 30000)); }
  }
  log(`Đã xác thực – tài khoản #${UID}`);
  await tick(true);
  setInterval(() => tick(false), 10000);
  // tài khoản Binance thật: kiểm tra mỗi 5 phút, quản lý lệnh mỗi 2 giây (chạy cả khi bot tạm tắt – lệnh đang mở vẫn phải được đóng đúng hạn)
  const lvCheck = async () => { try { if (core.cfg?.lv_on || live.active().length || live.keys()) await live.check(); live.resume(core.cfg?.lv_resume_at); } catch (e) { log("💵 kiểm tra:", e.message); } };
  await lvCheck(); setInterval(lvCheck, 300000);
  setInterval(() => live.tick().catch((e) => log("💵", e.message)), 2000);
  let lvOn = null; setInterval(() => { const on = !!core.cfg?.lv_on; if (on !== lvOn) { lvOn = on; if (on) lvCheck(); } }, 15000);
  setTimeout(() => setInterval(() => { if (!busy && core.here()) core.snapshot().catch(() => {}); }, 10000), 5000);
  let pxOff = false;      // chuyển tiếp giá Binance thật cho các bot phút (chỉ máy chủ của quản trị viên – trang trả 403 nếu không phải)
  setInterval(async () => { if (pxOff || !core.here()) return; const px = core.pxRelay(); if (Object.keys(px).length < 10) return; try { await api("POST", JSON.stringify({ px }), "/px"); } catch (e) { if (/HTTP 403/.test(e.message)) { pxOff = true; log("ℹ️ tài khoản không phải quản trị viên – không chuyển tiếp giá cho bot phút"); } } }, 10000);   // gửi số liệu lên trang mỗi ~5 giây (xen giữa các vòng 10 giây)
}
const stop = async (sig) => { log(`Nhận ${sig} – lưu trạng thái rồi thoát`); try { await core.snapshot(); await core.saveBrain(); } catch (e) { /* bỏ qua */ } try { kv.flush(); } catch (e) { /* bỏ qua */ } process.exit(0); };
process.on("SIGTERM", () => stop("SIGTERM")); process.on("SIGINT", () => stop("SIGINT"));
process.on("unhandledRejection", (e) => log("⚠️ unhandled", e?.message || e));
main();
