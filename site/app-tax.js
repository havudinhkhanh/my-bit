"use strict";
// ================================================================ SỔ THUẾ TNCN – TÀI SẢN MÃ HOÁ (chuẩn bị hồ sơ, KHÔNG phải tờ khai)
// Căn cứ (tra 11/2026): Luật Thuế TNCN sửa đổi (hiệu lực 01/7/2026) · TT 32/2026/TT-BTC (27/3/2026): 0,1% trên giá chuyển nhượng TỪNG LẦN,
// không phân biệt lời/lỗ, không quyết toán năm · TT 41/2026/TT-BTC (06/4/2026): sàn được cấp phép khấu trừ ngay khi khớp. Giao dịch trên sàn
// nước ngoài (Binance) CHƯA có hướng dẫn → sổ tính song song nhiều kịch bản để chuẩn bị:
//   hẹp  = chỉ lần BÁN coin lấy stablecoin/VND (giống chứng khoán) + đổi coin↔coin (bên đem đi) + P2P bán USDT
//   rộng = MỌI lần đem một tài sản mã hoá đi (kể cả bỏ USDT ra mua coin) + P2P bán USDT
//   futures: F0 = không tính · F1 = 0,1% × ký quỹ (tham khảo cách tính phái sinh chứng khoán) · F2 = 0,1% × toàn bộ giá trị lệnh – mỗi lần khớp (mở & đóng)
//   mốc: từ 27/3/2026 (TT 32) và từ 01/7/2026 (Luật) – giao dịch trước mốc vẫn lưu đủ, ghi "trước hiệu lực".
// Dữ liệu: file xuất từ Binance (lịch sử giao dịch tổng, khớp lệnh spot, P2P, futures, convert – tự nhận dạng) + lệnh bot trên Binance thật (tự động) + nhập tay.
// Lưu riêng trong tài khoản (taxbook…taxbook5), không công khai.
const TAX = {
  KEYS: ["taxbook", ...Array.from({ length: 63 }, (_, i) => "taxbook" + (i + 1))],      /* sổ lưu thành nhiều khoá ≤ ~380 KB: gói miễn phí 6 khoá (~2 MB), Pro 64 khoá (~24 MB – đủ ~150 nghìn dòng) */ A: "2026-03-27", B: "2026-07-01", RATE: 0.001,
  STB: new Set(["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "DAI", "USDP", "USD1", "USDE", "PYUSD", "XUSD"]),
  QUOTES: ["FDUSD", "USDT", "USDC", "BUSD", "TUSD", "DAI", "BTC", "ETH", "BNB", "TRY", "EUR", "BRL", "JPY", "TRX", "XRP", "DOGE", "SOL", "USD1"],
  F: ["id", "t", "src", "cat", "side", "base", "quote", "qty", "px", "usd", "vnd", "fee", "feeC", "pnl", "ref", "note"],
  book: null, busy: false, lim: 200,
};
const TXC = { spot: ["🔁", bi("Mua/bán spot", "Spot trade")], conv: ["⚡", "Convert"], p2p: ["🇻🇳", bi("P2P (VND)", "P2P (VND)")], fut: ["📈", "Futures"], fpl: ["🧾", bi("Lời/lỗ, phí, funding futures", "Futures P/L, fees, funding")], dep: ["⬇️", bi("Nạp", "Deposit")], wd: ["⬆️", bi("Rút", "Withdraw")], earn: ["🎁", bi("Thu nhập khác (lãi, airdrop, hoa hồng)", "Other income (interest, airdrop, referral)")], xfer: ["↔️", bi("Chuyển ví nội bộ", "Internal transfer")], other: ["•", bi("Khác", "Other")] };
const TXS = { buy: bi("Mua", "Buy"), sell: bi("Bán", "Sell"), swap: bi("Đổi", "Swap"), in: bi("Vào", "In"), out: bi("Ra", "Out") };
const TXSRC = { ledger: bi("Lịch sử giao dịch tổng", "Transaction history"), dw: bi("Lịch sử nạp / rút", "Deposit / withdraw history"), spot: bi("Khớp lệnh spot", "Spot trade history"), p2p: "P2P", fut: bi("Khớp lệnh futures", "Futures trade history"), conv: bi("Lịch sử convert", "Convert history"), bot: bi("Bot (tự động)", "Bot (auto)"), man: bi("Nhập tay", "Manual") };
const TXDC = new Map(), txDay = (t) => { const k = Math.floor((t + 252e5) / 864e5); let d = TXDC.get(k); if (d === undefined) { d = new Date(k * 864e5).toISOString().slice(0, 10); TXDC.set(k, d); } return d; };      // ngày giờ VN – nhớ theo số ngày (sổ 50 nghìn dòng: khỏi dựng chuỗi ngày 50 nghìn lần)
const txTime = (t) => { const d = new Date(t + 7 * 3600e3).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 19)}`; };
const txV = (v, d = 0) => (isNum(v) ? new Intl.NumberFormat(LOC, { maximumFractionDigits: d, minimumFractionDigits: d }).format(v) : "—");
const txQ = (v) => (isNum(v) ? new Intl.NumberFormat(LOC, { maximumSignificantDigits: 8 }).format(v) : "—");
const txH = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); };
const txO = (a) => { const F = TAX.F, o = {}; for (let i = 0; i < F.length; i++) o[F[i]] = a[i] ?? null; return o; };
const txA = (o) => TAX.F.map((k) => (o[k] === undefined ? null : o[k]));
const txIsSt = (c) => TAX.STB.has(String(c || "").toUpperCase());

// ---------------------------------------------------------------- lưu / tải (chia nhiều khoá vì mỗi khoá ≤ 400 KB)
const txSig = (B, n) => `${n ?? B.rows.length}|${B.files.length}|${B.files.map((f) => f.h).join("")}`;
const txHs = (H) => { const r = (v, d = 2) => (isNum(v) ? +v.toFixed(d) : v), F = {}; for (const [d, g] of Object.entries(H.fut)) F[d] = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, r(v, 4)]));
  return { ...H, days: undefined, eq: H.eq.map((v) => r(v)), cap: H.cap.map((v) => r(v)), fut: F, flows: Object.fromEntries(Object.entries(H.flows).map(([k, v]) => [k, r(v)])) }; };
// lịch sử tài khoản cho trang khác: có sẵn trong bộ nhớ → dùng; chưa tải sổ → đọc khoá đầu (tóm tắt đã lưu, khớp chữ ký) → khỏi tải ~vài MB dòng sổ; lệch / chưa có → tải sổ, tính lại, lưu tóm tắt
async function txHistQuick() {
  if (TAX.hist) return TAX.hist; if (TAX.book) return txHist();
  try { const m = (await Store.get(TAX.KEYS[0])).data || {}; if (m.enc) { try { await txLoad(); } catch (e) { if (e.lock) return { locked: true }; throw e; } return txHist(); } if (m.hs && m.files && isNum(m.nrows) && m.hs.sig === txSig({ files: m.files }, m.nrows)) { const H = m.hs, D = []; for (let t = Date.parse(H.from + "T00:00:00Z"), i = 0; i < H.eq.length; t += 864e5, i++) D.push(new Date(t).toISOString().slice(0, 10)); H.days = D; return (TAX.hist = H); } } catch (e) { /* tải đủ sổ */ }
  const H = await txHist(); if (H && !H.empty) txSave(); return H;
}
window.txHistQuick = txHistQuick;
const txKMax = () => (typeof can !== "function" || can("acct_history") ? TAX.KEYS.length : 6);
const txPack = (r) => { const a = r.slice(); while (a.length && a[a.length - 1] == null) a.pop(); return a; };      // bỏ các ô rỗng cuối dòng → sổ nhỏ hơn ~25%
// 🔒 KHOÁ SỔ BẰNG MẬT KHẨU RIÊNG (tuỳ chọn): cả sổ (dòng + cài đặt + tóm tắt lịch sử) → nén gzip → mã hoá AES-GCM 256 (khoá dẫn từ mật khẩu bằng PBKDF2-SHA256 310.000 vòng)
//    NGAY TRÊN TRÌNH DUYỆT rồi mới gửi lên → máy chủ chỉ giữ chuỗi mã hoá, không ai đọc được nếu không có mật khẩu. Mật khẩu không lưu ở đâu; khoá đã dẫn chỉ giữ trong tab đang mở (sessionStorage).
const TXENC_IT = 310000, b64e = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }, b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function txKeyFrom(pass, salt, it = TXENC_IT) { const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: it, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]); }
async function txKeyKeep(k) { TAX.key = k; try { sessionStorage.setItem("mybit_txk", b64e(new Uint8Array(await crypto.subtle.exportKey("raw", k)))); } catch (e) { /* chỉ giữ trong bộ nhớ */ } }
async function txKeyGet() { if (TAX.key) return TAX.key; try { const r = sessionStorage.getItem("mybit_txk"); if (r) return (TAX.key = await crypto.subtle.importKey("raw", b64d(r), "AES-GCM", true, ["encrypt", "decrypt"])); } catch (e) { /* không có */ } return null; }
const txZ = async (u8, dir) => { if (typeof CompressionStream === "undefined") return u8; const st = new Blob([u8]).stream().pipeThrough(dir ? new CompressionStream("gzip") : new DecompressionStream("gzip")); return new Uint8Array(await new Response(st).arrayBuffer()); };
async function txSeal(obj, key, salt, it) { const iv = crypto.getRandomValues(new Uint8Array(12)), z = typeof CompressionStream !== "undefined", pt = z ? await txZ(new TextEncoder().encode(JSON.stringify(obj)), true) : new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt)); return { hdr: { alg: "AES-GCM-256", kdf: "PBKDF2-SHA256", it, salt: b64e(salt), iv: b64e(iv), z: z ? 1 : 0 }, body: b64e(ct) }; }
async function txOpen(hdr, body, key) { const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(hdr.iv) }, key, b64d(body))); return JSON.parse(new TextDecoder().decode(hdr.z ? await txZ(pt, false) : pt)); }
async function txLoad() {
  const r0 = await Store.get(TAX.KEYS[0]).catch(() => ({ data: null }));
  if (r0.data?.enc) {      // 🔒 sổ đã khoá: tải đủ các phần mã hoá → giải mã bằng khoá trong tab (chưa có → TXLOCK, trang hiện ô nhập mật khẩu)
    const E = r0.data, nk = Math.min(TAX.KEYS.length, E.nk || 1), R = [r0]; for (let i = 1; i < nk; i += 8) R.push(...(await Promise.all(TAX.KEYS.slice(i, Math.min(nk, i + 8)).map((k) => Store.get(k).catch(() => ({ data: null }))))));
    const body = R.map((r) => r.data?.blob || "").join(""), key = await txKeyGet(); TAX.lockd = { E, body, nk };
    if (!key) { const e = new Error("TXLOCK"); e.lock = 1; throw e; }
    let o; try { o = await txOpen(E.enc, body, key); } catch (er) { TAX.key = null; try { sessionStorage.removeItem("mybit_txk"); } catch (e) { /* bỏ qua */ } const e = new Error("TXLOCK"); e.lock = 1; e.bad = 1; throw e; }
    const m = o.meta || {}; TAX.lockd = null;
    TAX.book = { v: 1, fx: m.fx || {}, px: m.px || {}, files: m.files || [], set: { lev: 2, fxMode: "mkt", fxFix: null, note: "", ...(m.set || {}) }, fxo: m.fxo || {}, rows: o.rows || [], nk, sv: [], enc: { salt: E.enc.salt, it: E.enc.it }, hs: m.hs };
    return TAX.book;
  }
  const m = r0.data || {}, nk = Math.min(TAX.KEYS.length, m.nk || 6);      // nk: số khoá đang dùng (sổ cũ chưa ghi → 6)
  const R = [r0]; for (let i = 1; i < nk; i += 8) R.push(...(await Promise.all(TAX.KEYS.slice(i, Math.min(nk, i + 8)).map((k) => Store.get(k).catch(() => ({ data: null }))))));
  const rows = R.flatMap((r) => r.data?.rows || []);
  TAX.book = { v: 1, fx: m.fx || {}, px: m.px || {}, files: m.files || [], set: { lev: 2, fxMode: "mkt", fxFix: null, note: "", ...(m.set || {}) }, fxo: m.fxo || {}, rows, nk, sv: R.map((r) => (r.data?.rows ? txH(JSON.stringify(r.data.rows)) : "")) };
  return TAX.book;
}
// lưu: chia dòng thành nhiều phần ≤ ~380 KB, chỉ gửi phần nào ĐỔI (nhập thêm file nhỏ không phải gửi lại cả sổ); prog(i, n) để hiện tiến độ
async function txSave(prog) {
  if (TAX.book?.enc) return txSaveEnc(prog);
  const B = TAX.book, kmax = txKMax(), lim = 380000, parts = [[]]; let n = 0;
  const hs = TAX.hist && !TAX.hist.empty && TAX.hist.sig === txSig(B) ? txHs(TAX.hist) : null;      // tóm tắt lịch sử tài khoản (vài chục KB) → trang Tài khoản Binance / Kết quả mở nhanh, khỏi tải cả sổ
  const meta = { v: 1, fx: B.fx, px: B.px, files: B.files, set: B.set, fxo: B.fxo, nrows: B.rows.length, hs, at: new Date().toISOString() }, mlen = JSON.stringify(meta).length + 80; n = mlen;
  for (const r of B.rows) { const a = txPack(r), sz = JSON.stringify(a).length + 1; if (n + sz > lim) { parts.push([]); n = 30; } parts[parts.length - 1].push(a); n += sz; }
  let cut = false; if (parts.length > kmax) { cut = true; parts.length = kmax; }
  const nk = parts.length, old = B.nk || 6, sv = B.sv || [], todo = [];
  for (let i = 0; i < Math.max(nk, old); i++) { const rows = parts[i] || [], h = txH(JSON.stringify(rows)); if (i === 0 || h !== sv[i]) todo.push([i, rows, h]); }
  let ok = true, k = 0;
  for (const [i, rows, h] of todo) { const good = await Store.put(TAX.KEYS[i], i === 0 ? { ...meta, nk, rows } : { rows }); ok = good && ok; if (good) sv[i] = h; prog?.(++k, todo.length); }
  B.nk = nk; B.sv = sv;
  if (cut) toast(kmax < TAX.KEYS.length ? bi("⚠️ Gói miễn phí lưu sổ tối đa ~2 MB – phần cũ nhất chưa lưu. Gói Pro lưu đủ toàn bộ lịch sử; hoặc xuất Excel/JSON để giữ bản đầy đủ.", "⚠️ Free plan stores up to ~2 MB – the oldest part wasn't saved. Pro stores the full history; or export Excel/JSON.") : bi("⚠️ Sổ quá lớn để lưu hết – xuất Excel/JSON để giữ bản đầy đủ", "⚠️ Book too large to save fully – export Excel/JSON"));
  return ok;
}
// ---------------------------------------------------------------- đọc file: CSV / XLSX / ZIP
const txCdn = (src, test) => (test() ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error(bi("Không tải được thư viện đọc file – kiểm tra mạng", "Couldn't load the file reader library – check your connection"))); document.head.appendChild(s); }));
function txCsv(text) {
  text = text.replace(/^﻿/, ""); const out = []; let row = [], f = "", q = false;
  const sep = (() => { const l = text.split(/\r?\n/, 1)[0] || ""; return (l.match(/;/g) || []).length > (l.match(/,/g) || []).length ? ";" : (l.match(/\t/g) || []).length > (l.match(/,/g) || []).length ? "\t" : ","; })();
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some((x) => x !== "")) out.push(row); row = []; } else f += c;
  }
  row.push(f); if (row.some((x) => x !== "")) out.push(row);
  return out;
}
async function txSheets(file) {
  const nm = file.name.toLowerCase();
  if (nm.endsWith(".zip")) {
    await txCdn("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", () => window.JSZip);
    const z = await window.JSZip.loadAsync(file), out = [];
    for (const f of Object.values(z.files)) { if (f.dir) continue; const n = f.name.toLowerCase(); if (n.endsWith(".csv")) out.push({ name: f.name, rows: txCsv(await f.async("string")) }); else if (/\.xlsx?$/.test(n)) out.push(...(await txXlsx(await f.async("arraybuffer"), f.name))); }
    return out;
  }
  if (/\.xlsx?$/.test(nm)) return txXlsx(await file.arrayBuffer(), file.name);
  return [{ name: file.name, rows: txCsv(await file.text()) }];
}
async function txXlsx(buf, name) {
  await txCdn("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => window.XLSX);
  const wb = window.XLSX.read(buf, { type: "array", cellDates: true });
  return wb.SheetNames.map((s) => ({ name: `${name} · ${s}`, rows: window.XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: false, dateNF: "yyyy-mm-dd hh:mm:ss", defval: "" }).map((r) => r.map((x) => String(x ?? ""))) }));
}
// thời gian trong file Binance: UTC ("2026-03-27 10:11:12", "26-03-27 10:11:12", số ms…)
const TXPV = 3;      // phiên bản bộ đọc file: tăng khi đổi cách đọc → nhập lại đúng file cũ sẽ đọc lại thay vì bỏ qua
let TXOFF = 0;      // lệch múi giờ (ms) của file đang nhập: cột giờ ghi theo giờ VN (tên file "…UTC7…" / tên cột "(UTC+7)") → trừ ra để về UTC
function txTzOff(h, name) { const H = (h || []).map((x) => String(x).toLowerCase()), tc = H.find((x) => /time|date|thời gian|ngày/.test(x)) || "";
  const m = tc.match(/utc\s*([+-])\s*(\d{1,2})/); if (m) return (m[1] === "-" ? -1 : 1) * +m[2] * 3600e3; if (/utc/.test(tc)) return 0;
  const n = String(name || "").match(/utc\s*([+-]?)\s*(\d{1,2})(?!\d)/i); return n ? (n[1] === "-" ? -1 : 1) * +n[2] * 3600e3 : 0; }
function txT(s, utc = true) {
  const v = txT0(s, utc); return isNum(v) && utc ? v - TXOFF : v; }
function txT0(s, utc = true) {
  s = String(s || "").trim(); if (!s) return NaN;
  if (/^\d{12,13}$/.test(s)) return +s + TXOFF;
  let m = s.match(/(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) { let y = +m[1]; if (y < 100) y += 2000; return Date.UTC(y, m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - (utc ? 0 : 7 * 3600e3); }
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return Date.UTC(+m[3], m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) - (utc ? 0 : 7 * 3600e3);
  const t = Date.parse(s); return isNaN(t) ? NaN : t;
}
// "0.5BTC" → {v:0.5, u:"BTC"} · "1,234.5" → 1234.5
function txN(s) {
  s = String(s ?? "").trim().replace(/\s+/g, ""); if (!s) return { v: NaN, u: "" };
  const m = s.match(/^([-+]?[\d.,]+(?:e[-+]?\d+)?)([A-Za-z][A-Za-z0-9]*)?$/i); if (!m) return { v: NaN, u: "" };
  let n = m[1]; if (/,\d{3}(\D|$)/.test(n) || (n.includes(",") && n.includes("."))) n = n.replace(/,/g, ""); else n = n.replace(",", ".");
  return { v: parseFloat(n), u: (m[2] || "").toUpperCase() };
}
function txPair(p) {
  p = String(p || "").toUpperCase().replace(/[\s_-]/g, "");
  if (p.includes("/")) { const [b, q] = p.split("/"); return [b, q]; }
  for (const q of TAX.QUOTES) if (p.endsWith(q) && p.length > q.length) return [p.slice(0, -q.length), q];
  return [p, ""];
}
// tìm cột theo tên (không phân biệt hoa thường, bỏ đơn vị trong ngoặc)
function txCols(h) {
  const H = h.map((x) => String(x).replace(/^﻿/, "").trim().toLowerCase());
  const f = (...names) => { for (const n of names) { const i = H.findIndex((x) => x === n || x.replace(/\(.*\)/, "").trim() === n); if (i >= 0) return i; } for (const n of names) { const i = H.findIndex((x) => x.includes(n)); if (i >= 0) return i; } return -1; };
  return { H, f };
}
function txKind(h) {
  const { H, f } = txCols(h), has = (...n) => n.every((x) => f(x) >= 0), any = (...n) => n.some((x) => f(x) >= 0);
  if (has("operation", "change") && any("utc_time", "time")) return "ledger";
  if (any("order number", "order no") && any("fiat type", "fiat") && any("total price", "total")) return "p2p";
  if (has("wallet", "sell", "buy") && any("pair")) return "conv";
  if (any("txid", "transaction id", "tx hash") && any("address") && has("coin") && any("amount") && !any("operation")) return "dw";      // lịch sử nạp / rút coin (Deposit / Withdraw History)
  if (any("realized profit", "realized pnl") && any("symbol", "contract") && has("price")) return "fut";
  if (any("pair", "market", "symbol") && any("side", "type") && has("price") && any("executed", "amount", "quantity", "filled")) return "spot";
  return H.length ? "?" : "";
}

// ---------------------------------------------------------------- chuẩn hoá từng loại file → dòng sổ
function txFromLedger(rows) {
  const { f } = txCols(rows[0]), iT = f("utc_time", "time"), iA = f("account"), iO = f("operation"), iC = f("coin"), iX = f("change"), iR = f("remark");
  const G = new Map(), out = [], net = {};
  for (const r of rows.slice(1)) {
    const t = txT(r[iT]), op = String(r[iO] || "").trim(), c = String(r[iC] || "").toUpperCase().trim(), x = txN(r[iX]).v, acc = String(r[iA] || "").trim();
    if (!isNum(t) || !c || !isNum(x)) continue; net[c] = (net[c] || 0) + x;
    const o = op.toLowerCase(), base = { t, src: "ledger", ref: `${acc} · ${op}${r[iR] ? " · " + String(r[iR]).slice(0, 60) : ""}` };
    if (/^(buy|sell|transaction (buy|sold|spend|revenue|related)|small assets exchange bnb|large otc trading|etf subscription)$/.test(o) || /^transaction (fee)$|^fee$|bnb fee deduction/.test(o) && /spot/i.test(acc)) {
      const k = `S|${t}|${acc}`, g = G.get(k) || { t, acc, c: {}, fee: {}, ops: new Set() }; g.ops.add(op);
      if (/fee/.test(o)) g.fee[c] = (g.fee[c] || 0) + x; else g.c[c] = (g.c[c] || 0) + x; G.set(k, g); continue;
    }
    if (/convert/.test(o)) { const k = `C|${t}|${acc}`, g = G.get(k) || { t, acc, c: {}, fee: {}, ops: new Set(), conv: 1 }; g.ops.add(op); g.c[c] = (g.c[c] || 0) + x; G.set(k, g); continue; }
    if (/p2p|c2c/.test(o)) { out.push({ ...base, cat: "p2p", side: x < 0 ? "sell" : "buy", base: c, quote: "VND", qty: Math.abs(x), usd: txIsSt(c) ? Math.abs(x) : null }); continue; }
    if (/futures|coin-m|usd.?-?m/i.test(acc) || /realized profit|funding fee|insurance|liquidation/.test(o)) { if (/transfer/.test(o)) { out.push({ ...base, cat: "xfer", side: x < 0 ? "out" : "in", base: c, qty: Math.abs(x), usd: txIsSt(c) ? Math.abs(x) : null }); continue; } { const k = /realized/.test(o) ? "pnl" : /funding/.test(o) ? "fund" : /insurance|liquidation/.test(o) ? "liq" : /^fee$|commission|transaction fee/.test(o) ? "fee" : "oth"; out.push({ ...base, cat: "fpl", side: x < 0 ? "out" : "in", base: c, quote: k, qty: x, pnl: txIsSt(c) ? x : null, usd: null }); } continue; }      // giữ TỪNG dòng (quote = loại: pnl / fee / fund / liq / oth)
    if (/^(deposit|fiat deposit|crypto deposit|buy crypto with fiat)/.test(o)) { out.push({ ...base, cat: "dep", side: "in", base: c, qty: Math.abs(x), usd: txIsSt(c) ? Math.abs(x) : null }); continue; }
    if (/withdraw/.test(o)) { out.push({ ...base, cat: "wd", side: "out", base: c, qty: Math.abs(x), usd: txIsSt(c) ? Math.abs(x) : null }); continue; }
    if (/interest|reward|airdrop|distribution|commission|referral|cashback|rebate|bonus|mission|launchpool|megadrop|hodler|staking reward|voucher|gift/.test(o) && x > 0) { out.push({ ...base, cat: "earn", side: "in", base: c, qty: x, usd: txIsSt(c) ? x : null, px: null }); continue; }
    if (/transfer|subscription|redemption|staking|savings|earn|wallet/.test(o)) { out.push({ ...base, cat: "xfer", side: x < 0 ? "out" : "in", base: c, qty: Math.abs(x), usd: txIsSt(c) ? Math.abs(x) : null }); continue; }
    out.push({ ...base, cat: "other", side: x < 0 ? "out" : "in", base: c, qty: x, usd: txIsSt(c) ? Math.abs(x) : null });
  }
  // gộp các thay đổi cùng giây thành 1 lệnh: coin nhận + coin đem đi
  for (const g of G.values()) {
    const E = Object.entries(g.c).filter(([, v]) => Math.abs(v) > 1e-12), pos = E.filter(([, v]) => v > 0), neg = E.filter(([, v]) => v < 0);
    const fe = Object.entries(g.fee).filter(([, v]) => v), fee = fe.length ? Math.abs(fe[0][1]) : null, feeC = fe.length ? fe[0][0] : null, cat = g.conv ? "conv" : "spot", ref = `${g.acc} · ${[...g.ops].join(" + ")}`;
    if (pos.length === 1 && neg.length === 1) {
      const [rc, rv] = pos[0], [sc, sv] = neg[0], rS = txIsSt(rc), sS = txIsSt(sc);
      if (sS && !rS) out.push({ t: g.t, src: "ledger", cat, side: "buy", base: rc, quote: sc, qty: rv, px: -sv / rv, usd: -sv, fee, feeC, ref });
      else if (rS && !sS) out.push({ t: g.t, src: "ledger", cat, side: "sell", base: sc, quote: rc, qty: -sv, px: rv / -sv, usd: rv, fee, feeC, ref });
      else out.push({ t: g.t, src: "ledger", cat, side: "swap", base: sc, quote: rc, qty: -sv, px: rv / -sv, usd: rS || sS ? Math.abs(sS ? sv : rv) : null, fee, feeC, ref, note: bi(`đổi ${txQ(-sv)} ${sc} → ${txQ(rv)} ${rc}`, `swap ${txQ(-sv)} ${sc} → ${txQ(rv)} ${rc}`) });
    } else {
      // nhiều lệnh khớp cùng giây: mỗi coin không phải stablecoin thành 1 dòng, giá trị theo giá thị trường
      const st = E.find(([c]) => txIsSt(c));
      for (const [c, v] of E) { if (txIsSt(c) && E.length > 1) continue; out.push({ t: g.t, src: "ledger", cat, side: v > 0 ? "buy" : "sell", base: c, quote: st ? st[0] : "", qty: Math.abs(v), usd: null, fee: null, ref, note: bi("nhiều lệnh khớp cùng giây – giá trị theo giá thị trường lúc đó", "several fills in the same second – valued at market price") }); }
    }
  }
  return { rows: out, net };
}
function txFromSpot(rows) {
  const { f } = txCols(rows[0]), iT = f("date(utc)", "date", "time"), iP = f("pair", "market", "symbol"), iS = f("side", "type"), iPx = f("price"), iE = f("executed", "filled", "quantity", "amount"), iTot = f("total", "amount"), iF = f("fee"), iFc = f("fee coin", "fee asset");
  const tot = iTot === iE ? -1 : iTot, out = [];
  for (const r of rows.slice(1)) {
    const t = txT(r[iT]), [b, q] = txPair(r[iP]), sd = String(r[iS] || "").toUpperCase(), px = txN(r[iPx]).v, ex = txN(r[iE]), tt = tot >= 0 ? txN(r[tot]) : { v: NaN, u: "" }, fe = txN(r[iF]);
    if (!isNum(t) || !b || !isNum(ex.v)) continue;
    const qty = ex.v, quote = q || tt.u, val = isNum(tt.v) ? tt.v : qty * px;
    out.push({ t, src: "spot", cat: "spot", side: sd.includes("SELL") ? "sell" : "buy", base: b, quote, qty, px, usd: txIsSt(quote) ? val : null, qv: val, fee: isNum(fe.v) ? fe.v : null, feeC: fe.u || (iFc >= 0 ? String(r[iFc]).toUpperCase() : null), ref: `${r[iP]} ${sd}` });
  }
  return { rows: out };
}
function txFromFut(rows) {
  const { f } = txCols(rows[0]), iT = f("date(utc)", "date", "time"), iS = f("symbol", "contract"), iSd = f("side"), iPx = f("price"), iQ = f("quantity", "qty", "executed"), iA = f("amount", "quote quantity", "total"), iF = f("fee"), iR = f("realized profit", "realized pnl"), out = [];
  for (const r of rows.slice(1)) {
    const t = txT(r[iT]), [b, q] = txPair(String(r[iS] || "").replace(/PERP$/, "")), px = txN(r[iPx]).v, qq = txN(r[iQ]).v, am = txN(r[iA]).v, fe = txN(r[iF]);
    if (!isNum(t) || !b || !isNum(qq)) continue;
    const val = isNum(am) ? Math.abs(am) : Math.abs(qq * px);
    out.push({ t, src: "fut", cat: "fut", side: String(r[iSd]).toUpperCase().includes("SELL") ? "sell" : "buy", base: b, quote: q || "USDT", qty: Math.abs(qq), px, usd: txIsSt(q || "USDT") ? val : null, fee: isNum(fe.v) ? Math.abs(fe.v) : null, feeC: fe.u || "USDT", pnl: txN(r[iR]).v, ref: `${r[iS]} ${r[iSd]}` });
  }
  return { rows: out };
}
function txFromP2p(rows) {
  const { f } = txCols(rows[0]), iN = f("order number", "order no"), iTy = f("order type", "type", "side"), iA = f("asset type", "asset", "crypto"), iFi = f("fiat type", "fiat"), iTot = f("total price", "total"), iPx = f("price"), iQ = f("quantity", "amount"), iSt = f("status"), iT = f("created time", "create time", "time", "date"), iFee = f("taker fee", "maker fee", "fee"), out = [];
  for (const r of rows.slice(1)) {
    const st = String(r[iSt] || "").toLowerCase(); if (st && !/complet|success|done|hoàn/.test(st)) continue;
    const t = txT(r[iT]), a = String(r[iA] || "USDT").toUpperCase().trim(), fi = String(r[iFi] || "VND").toUpperCase().trim(), tot = txN(r[iTot]).v, qty = txN(r[iQ]).v, px = txN(r[iPx]).v;
    if (!isNum(t) || !isNum(qty)) continue;
    out.push({ t, src: "p2p", cat: "p2p", side: /sell|bán/i.test(r[iTy]) ? "sell" : "buy", base: a, quote: fi, qty, px, usd: txIsSt(a) ? qty : null, vnd: fi === "VND" && isNum(tot) ? tot : null, fee: iFee >= 0 ? txN(r[iFee]).v || null : null, feeC: a, ref: `P2P #${r[iN]}` });
  }
  return { rows: out };
}
function txFromConv(rows) {
  const { f } = txCols(rows[0]), iT = f("date", "time"), iS = f("sell"), iB = f("buy"), iSt = f("status"), iW = f("wallet"), out = [];
  for (const r of rows.slice(1)) {
    if (iSt >= 0 && r[iSt] && !/success|complet|thành/i.test(r[iSt])) continue;
    const t = txT(r[iT]), s = txN(r[iS]), b = txN(r[iB]); if (!isNum(t) || !s.u || !b.u) continue;
    const sS = txIsSt(s.u), bS = txIsSt(b.u);
    if (sS && !bS) out.push({ t, src: "conv", cat: "conv", side: "buy", base: b.u, quote: s.u, qty: b.v, px: s.v / b.v, usd: s.v, ref: `Convert · ${r[iW] || ""}` });
    else if (bS && !sS) out.push({ t, src: "conv", cat: "conv", side: "sell", base: s.u, quote: b.u, qty: s.v, px: b.v / s.v, usd: b.v, ref: `Convert · ${r[iW] || ""}` });
    else out.push({ t, src: "conv", cat: "conv", side: "swap", base: s.u, quote: b.u, qty: s.v, px: b.v / s.v, usd: sS ? s.v : bS ? b.v : null, ref: `Convert · ${r[iW] || ""}`, note: `${txQ(s.v)} ${s.u} → ${txQ(b.v)} ${b.u}` });
  }
  return { rows: out };
}
// lịch sử NẠP / RÚT coin: thêm mạng, địa chỉ ví, TXID, phí rút, trạng thái cho các dòng nạp / rút (lịch sử tổng chỉ có số lượng).
//   Nạp hay rút: theo tên file ("Deposit" / "Withdraw"); không rõ thì dòng có phí rút > 0 là rút. Giờ: theo múi giờ ghi ở tên cột / tên file (TXOFF)
function txFromDw(rows, name = "") {
  const { f } = txCols(rows[0]), iT = f("date", "time"), iC = f("coin"), iN = f("network"), iA = f("amount"), iF = f("transactionfee", "transaction fee", "fee"), iAd = f("address"), iTx = f("txid", "transaction id", "tx hash"), iSt = f("status"), out = [];
  const nm = String(name).toLowerCase(), kind = /withdraw|rút/.test(nm) ? "wd" : /deposit|nạp/.test(nm) ? "dep" : null;
  const sh = (x) => { x = String(x || "").trim(); return x.length > 14 ? `${x.slice(0, 6)}…${x.slice(-4)}` : x; };
  for (const r of rows.slice(1)) {
    const st = String(r[iSt] || "").toLowerCase(); if (st && !/complet|success|thành|hoàn|credited|done/.test(st)) continue;      // bỏ lệnh rút huỷ / thất bại / đang chờ
    const t = txT(r[iT]), c = String(r[iC] || "").toUpperCase().trim(), q = txN(r[iA]).v, fe = iF >= 0 ? txN(r[iF]).v : NaN; if (!isNum(t) || !c || !isNum(q)) continue;
    const cat = kind || (isNum(fe) && fe > 0 ? "wd" : "dep"), net = String(r[iN] || "").trim(), ad = String(r[iAd] || "").trim(), tx = String(r[iTx] || "").trim();
    out.push({ t, src: "dw", cat, side: cat === "wd" ? "out" : "in", base: c, qty: Math.abs(q), usd: txIsSt(c) ? Math.abs(q) : null, fee: cat === "wd" && isNum(fe) && fe > 0 ? fe : null, feeC: c,
      ref: [cat === "wd" ? bi("Rút", "Withdraw") : bi("Nạp", "Deposit"), net, ad && (cat === "wd" ? bi("tới ", "to ") : bi("từ ", "from ")) + sh(ad), tx && "TXID " + sh(tx)].filter(Boolean).join(" · "), note: [ad && `${bi("Địa chỉ", "Address")}: ${ad}`, tx && `TXID: ${tx}`].filter(Boolean).join(" · ") || null });
  }
  return { rows: out };
}
const TXPARSE = { ledger: txFromLedger, spot: txFromSpot, fut: txFromFut, p2p: txFromP2p, conv: txFromConv, dw: txFromDw };

// ---------------------------------------------------------------- giá (Binance, công khai) & tỷ giá USD/VND theo ngày
async function txPool(items, n, fn, prog) { let i = 0, done = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const x = items[i++]; try { await fn(x); } catch (e) { /* bỏ qua */ } done++; prog?.(done, items.length); } })); }
async function txPrice(coin, t, daily) {
  const B = TAX.book, k = `${coin}|${daily ? txDay(t) : Math.floor(t / 60000)}`;
  if (B.px[k] !== undefined) return B.px[k];
  for (const q of ["USDT", "FDUSD", "USDC"]) {
    try {
      const st = daily ? Date.parse(txDay(t) + "T00:00:00Z") - 7 * 3600e3 : t - 60000, r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${coin}${q}&interval=${daily ? "1d" : "1m"}&startTime=${st}&limit=2`);
      if (!r.ok) continue; const j = await r.json(); if (!j.length) continue;
      const c = j.find((x) => x[0] <= t && t < x[6]) || j[0], p = (+c[1] + +c[4]) / 2; B.px[k] = p; return p;
    } catch (e) { /* thử cặp khác */ }
  }
  B.px[k] = null; return null;
}
async function txFx(d) {
  const B = TAX.book; if (isNum(B.fx[d])) return B.fx[d];
  const day = d < "2024-03-02" ? "2024-03-02" : d > txDay(Date.now()) ? "latest" : d;
  for (const u of [`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/usd.min.json`, `https://${day}.currency-api.pages.dev/v1/currencies/usd.min.json`]) {
    try { const r = await fetch(u); if (!r.ok) continue; const j = await r.json(); const v = +j?.usd?.vnd; if (v > 1000) { B.fx[d] = Math.round(v); if (day !== d) B.fx[d + "~"] = day; return B.fx[d]; } } catch (e) { /* thử nguồn dự phòng */ }
  }
  return null;
}
// điền giá trị USD còn thiếu + tỷ giá cho mọi ngày có giao dịch
async function txFill(rows, prog) {
  const need = rows.filter((r) => r.usd == null && r.qty && r.base && !["fpl"].includes(r.cat));
  await txPool(need, 6, async (r) => {
    if (r.qv != null && r.quote && !txIsSt(r.quote)) { const p = await txPrice(r.quote, r.t, false); if (p) { r.usd = Math.abs(r.qv) * p; return; } }
    if (["swap"].includes(r.side) && r.quote && txIsSt(r.quote)) return;
    const daily = !["spot", "conv", "fut", "p2p"].includes(r.cat), p = await txPrice(r.base, r.t, daily); if (p) { r.usd = Math.abs(r.qty) * p; if (!r.px && !daily) r.px = p; }
  }, (a, b) => prog?.(`${bi("Lấy giá", "Fetching prices")} ${a}/${b}`));
  const days = [...new Set(rows.map((r) => txDay(r.t)))].filter((d) => !isNum(TAX.book.fx[d]));
  await txPool(days, 6, (d) => txFx(d), (a, b) => prog?.(`${bi("Lấy tỷ giá USD/VND", "Fetching USD/VND rates")} ${a}/${b}`));
}

// ---------------------------------------------------------------- tính thuế
function txRate(d) {
  const B = TAX.book, o = B.fxo?.[d]; if (isNum(o)) return { v: o, s: bi("anh nhập", "manual") };
  if (B.set.fxMode === "fix" && isNum(B.set.fxFix)) return { v: B.set.fxFix, s: bi("cố định", "fixed") };
  if (B.set.fxMode === "p2p" && isNum(TAX.p2pFx?.[d])) return { v: TAX.p2pFx[d], s: "P2P" };
  return isNum(B.fx[d]) ? { v: B.fx[d], s: B.fx[d + "~"] ? bi(`thị trường (ngày ${B.fx[d + "~"]})`, `market (${B.fx[d + "~"]})`) : bi("thị trường", "market") } : { v: null, s: "—" };
}
function txCalc(r) {
  const d = txDay(r.t), fx = txRate(d), vnd = isNum(r.vnd) ? r.vnd : isNum(r.usd) && isNum(fx.v) ? r.usd * fx.v : null, lev = Math.max(1, +TAX.book.set.lev || 1);
  const spot = r.cat === "spot" || r.cat === "conv", n = (spot && (r.side === "sell" || r.side === "swap")) || (r.cat === "p2p" && r.side === "sell"), b = spot || (r.cat === "p2p" && r.side === "sell"), fu = r.cat === "fut";
  const tx = (on, k = 1) => (on && isNum(vnd) ? vnd * k * TAX.RATE : 0);
  return { d, fx, vnd, n: tx(n), b: tx(b), f1: tx(fu, 1 / lev), f2: tx(fu), tn: n, tb: b, tf: fu, miss: (n || b || fu) && !isNum(vnd) };
}
// dòng dùng để tính: bỏ dòng trùng (file chuyên biệt được ưu tiên hơn lịch sử tổng; lệnh bot bị bỏ khi đã có file futures cùng khoảng)
function txRows() {
  const B = TAX.book, all = B.rows.map(txO), rng = {};
  for (const r of all) if (r.src !== "ledger" && r.src !== "bot" && r.src !== "man" && r.src !== "dw") { const g = (rng[r.cat] ||= [Infinity, -Infinity]); g[0] = Math.min(g[0], r.t); g[1] = Math.max(g[1], r.t); }
  const inR = (r) => { const g = rng[r.cat]; return g && r.t >= g[0] - 60e3 && r.t <= g[1] + 60e3; };
  const bot = (TAX.bot || []).filter((r) => !inR(r));
  const DW = all.filter((r) => r.src === "dw"), used = new Set();
  const dwDup = (r) => { if (r.src !== "ledger" || (r.cat !== "dep" && r.cat !== "wd") || !DW.length) return false;
    const m = DW.find((d) => !used.has(d.id) && d.cat === r.cat && d.base === r.base && Math.abs(d.t - r.t) < 30 * 60e3 && Math.min(Math.abs(d.qty - r.qty), Math.abs(d.qty + (d.fee || 0) - r.qty)) <= Math.max(1e-8, r.qty * 2e-3));
    if (m) used.add(m.id); return !!m; };
  const rows = [...all.map((r) => ({ ...r, dup: (r.src === "ledger" && ["spot", "conv", "p2p"].includes(r.cat) && inR(r)) || dwDup(r) })), ...bot];
  TAX.p2pFx = {}; const pg = {};
  for (const r of rows) if (r.cat === "p2p" && isNum(r.vnd) && r.qty > 0 && !r.dup) { const d = txDay(r.t), g = (pg[d] ||= [0, 0]); g[0] += r.vnd; g[1] += r.qty; }
  for (const [d, [v, q]] of Object.entries(pg)) TAX.p2pFx[d] = Math.round(v / q);
  return rows.sort((a, b) => b.t - a.t);
}
// lệnh bot trên Binance THẬT (sổ máy chủ riêng): mỗi lệnh = 2 lần khớp futures (mở & đóng)
async function txBotRows() {
  try {
    await lazyJs("app-bot.js");
    const [rl, rs, rq] = await Promise.all([Store.get("scalpledger"), Store.get("scalpstate"), Store.get("scalp")]);
    const A = typeof jRows === "function" ? jRows(rl.data || null, rs.data || {}).filter((r) => r.env === "live") : [];
    const lev = +rq.data?.lv_lev || null; if (lev && !TAX.book.set.levSet) TAX.book.set.lev = lev;
    const out = [];
    for (const r of A) {
      const b = String(r.k).split(":")[0], t1 = jT(r.t1), t2 = jT(r.t2);
      if (isNum(t1)) out.push({ id: "bot1" + txH(`${r.k}|${r.t1}`), t: t1, src: "bot", cat: "fut", side: r.side > 0 ? "buy" : "sell", base: b, quote: "USDT", qty: r.q, px: r.e, usd: r.q * r.e, fee: null, ref: `${r.strat === "man" ? "" : bi("Bot", "Bot") + " "}${(JSTRAT[r.strat] || ["", r.strat])[1]} · ${bi("mở", "open")}` });
      if (isNum(t2)) out.push({ id: "bot2" + txH(`${r.k}|${r.t2}`), t: t2, src: "bot", cat: "fut", side: r.side > 0 ? "sell" : "buy", base: b, quote: "USDT", qty: r.q, px: r.x, usd: r.q * r.x, fee: r.fee, feeC: "USDT", pnl: r.pnl, ref: `${r.strat === "man" ? "" : bi("Bot", "Bot") + " "}${(JSTRAT[r.strat] || ["", r.strat])[1]} · ${bi("đóng", "close")} · ${JWHY[r.why] || r.why || ""}` });
    }
    return out;
  } catch (e) { return []; }
}

// ---------------------------------------------------------------- nhập file
async function txImport(files, log, pg) {      // pg: thanh tiến độ (file thứ fi: trạng thái, phần trăm, dòng chữ)
  const B = TAX.book, have = new Set(B.rows.map((a) => a[0])), rep = [];
  for (const [fi, file] of [...files].entries()) {
    pg?.file(fi, "run", 0, bi("Đang mở file…", "Opening file…")); await new Promise((ok) => setTimeout(ok, 0));
    let sheets; try { sheets = await txSheets(file); } catch (e) { rep.push({ name: file.name, err: e.message }); pg?.file(fi, "err", 1, e.message); continue; }
    const r0 = rep.length;
    for (const [si, s] of sheets.entries()) {
      const sf = (x) => (si + x) / sheets.length;
      const fh = txH(s.rows.map((r) => r.join("\u0001")).join("\n"));
      const old = B.files.find((f) => f.h === fh);
      if (old && (old.pv || 1) >= TXPV) { rep.push({ name: s.name, kind: old.kind, n: 0, dup: 0, same: 1 }); pg?.file(fi, "run", sf(1), bi("đã nhập trước đây – bỏ qua", "already imported – skipped")); continue; }      // đúng file đã nhập → bỏ qua cả file
      if (old) { const SRC = { ledger: "ledger", dw: "dw", spot: "spot", p2p: "p2p", fut: "fut", conv: "conv" }[old.kind], a = (old.from ?? -Infinity) - 864e5, z = (old.to ?? Infinity) + 864e5;      // file nhập bằng bản đọc cũ (sai múi giờ / chưa gộp dòng) → xoá dòng cũ của file đó rồi đọc lại
        B.rows = B.rows.filter((x) => { const o = txO(x); return !(o.src === SRC && o.t >= a && o.t <= z); }); B.files = B.files.filter((f) => f !== old); have.clear(); B.rows.forEach((x) => have.add(x[0])); }
      const hi = s.rows.findIndex((r) => txKind(r) && txKind(r) !== "?"), kind = hi >= 0 ? txKind(s.rows[hi]) : "?";
      if (kind === "?") { rep.push({ name: s.name, err: bi("Không nhận ra loại file", "Unrecognized file"), cols: (s.rows[0] || []).slice(0, 12).join(", ") }); continue; }
      // ✂️ FILE LỚN: tự chia thành từng phần ~5.000 dòng, đọc lần lượt (trang không đơ, có tiến độ) – không cắt giữa các dòng cùng giây (1 lệnh khớp ghi nhiều dòng)
      const off = txTzOff(s.rows[hi], s.name), hdr = s.rows[hi], body = s.rows.slice(hi + 1), CH = 5000, NP = Math.max(1, Math.ceil(body.length / CH)), iT = txCols(hdr).f("utc_time", "time", "date", "created time");
      const add = [], occ = new Map(), net = {}; let dup = 0, a = 0, part = 0, t0 = Infinity, t1 = -Infinity;
      do {
        let z = Math.min(body.length, a + CH); if (iT >= 0) while (z < body.length && body[z][iT] === body[z - 1][iT]) z++;
        part++; const pm = `${bi("phần", "part")} ${part}/${NP} · ${bi("dòng", "rows")} ${txV(a + 1)}–${txV(z)} / ${txV(body.length)}`; log(`${s.name}: ${pm}`); pg?.file(fi, "run", sf((part - 1) / NP), pm);
        TXOFF = off; let P; try { P = TXPARSE[kind]([hdr, ...body.slice(a, z)], s.name); } finally { TXOFF = 0; }
        await txFill(P.rows, (m) => { log(`${s.name}: ${bi("phần", "part")} ${part}/${NP} · ${m}`); const mm = String(m).match(/(\d+)\s*\/\s*(\d+)\s*$/), ff = mm ? +mm[1] / Math.max(1, +mm[2]) : 0, fxs = /USD\/VND/.test(m); pg?.file(fi, "run", sf((part - 1 + 0.1 + 0.9 * (fxs ? 0.5 + 0.5 * ff : 0.5 * ff)) / NP), `${bi("phần", "part")} ${part}/${NP} · ${m}`); });      // tiến độ trong từng phần: lấy giá (nửa đầu) → lấy tỷ giá (nửa sau)
        for (const r of P.rows) {
          if (!r.id) { const k0 = `${r.src}|${r.cat}|${r.t}|${r.side}|${r.base}|${r.quote}|${(+r.qty).toPrecision(10)}|${r.ref || ""}`, o = (occ.get(k0) || 0) + 1; occ.set(k0, o); r.id = txH(o > 1 ? `${k0}#${o}` : k0); }      // 2 dòng giống hệt (vd funding 2 vị thế cùng giờ, cùng số) vẫn giữ đủ; nhập lại file vẫn ra cùng mã → không đếm 2 lần
          if (have.has(r.id)) { dup++; continue; } have.add(r.id); add.push(txA(r)); if (isNum(r.t)) { if (r.t < t0) t0 = r.t; if (r.t > t1) t1 = r.t; } }
        for (const [c, v] of Object.entries(P.net || {})) net[c] = (net[c] || 0) + v;
        a = z; await new Promise((ok) => setTimeout(ok, 0));
      } while (a < body.length);
      for (const x of add) B.rows.push(x);
      B.files.push({ h: fh, pv: TXPV, name: s.name, kind, n: add.length, dup, parts: NP, at: new Date().toISOString(), from: isFinite(t0) ? t0 : null, to: isFinite(t1) ? t1 : null, net: Object.keys(net).length ? net : null });
      rep.push({ name: s.name, kind, n: add.length, dup });
    }
    const R = rep.slice(r0); pg?.file(fi, R.some((x) => x.err) && !R.some((x) => x.n) ? "err" : R.every((x) => x.same) ? "same" : "ok", 1, R.map((x) => (x.err ? "⚠️ " + x.err : x.same ? bi("đã nhập trước đây – bỏ qua", "already imported – skipped") : `${txV(x.n)} ${bi("dòng mới", "new rows")}${x.dup ? ` · ${txV(x.dup)} ${bi("trùng", "dup")}` : ""}`)).join(" · ") || bi("không có dữ liệu", "no data"));
  }
  return rep;
}

// lưu sổ đã khoá: cả sổ thành 1 chuỗi mã hoá → cắt thành nhiều khoá ≤ 380 nghìn ký tự; ghi đè MỌI khoá cũ (kể cả phần dạng thường trước khi khoá) → máy chủ không còn bản đọc được
async function txSaveEnc(prog) {
  const B = TAX.book, key = await txKeyGet(); if (!key) { toast(bi("🔒 Sổ đang khoá – nhập mật khẩu trước khi lưu", "🔒 Ledger locked – enter the password before saving")); return false; }
  const hs = TAX.hist && !TAX.hist.empty && TAX.hist.sig === txSig(B) ? txHs(TAX.hist) : null;
  const sealed = await txSeal({ meta: { v: 1, fx: B.fx, px: B.px, files: B.files, set: B.set, fxo: B.fxo, nrows: B.rows.length, hs }, rows: B.rows.map(txPack) }, key, b64d(B.enc.salt), B.enc.it);
  const L = 380000, chunks = []; for (let i = 0; i < sealed.body.length; i += L) chunks.push(sealed.body.slice(i, i + L)); if (!chunks.length) chunks.push("");
  if (chunks.length > txKMax()) { toast(bi("⚠️ Sổ quá lớn để lưu – xuất JSON để giữ bản đầy đủ", "⚠️ Ledger too large to save – export JSON")); return false; }
  const old = Math.max(B.nk || 6, 6), nk = chunks.length; let ok = true, k = 0, N = Math.max(nk, old);
  for (let i = 0; i < N; i++) { const v = i === 0 ? { enc: sealed.hdr, nk, at: new Date().toISOString(), blob: chunks[0] } : i < nk ? { blob: chunks[i] } : { rows: [] }; ok = (await Store.put(TAX.KEYS[i], v)) && ok; prog?.(++k, N); }
  B.nk = nk; B.sv = []; return ok;
}
// bật / tắt khoá: bật = dẫn khoá từ mật khẩu mới (muối ngẫu nhiên) rồi lưu lại toàn bộ ở dạng mã hoá; tắt = lưu lại dạng thường
async function txLockOn(pass) { const salt = crypto.getRandomValues(new Uint8Array(16)), k = await txKeyFrom(pass, salt); await txKeyKeep(k); TAX.book.enc = { salt: b64e(salt), it: TXENC_IT }; return txSave(); }
async function txLockOff() { TAX.book.enc = null; TAX.book.sv = []; const ok = await txSave(); if (ok) { TAX.key = null; try { sessionStorage.removeItem("mybit_txk"); } catch (e) { /* bỏ qua */ } } return ok; }
async function txUnlock(pass) { const L = TAX.lockd; if (!L) return false; const k = await txKeyFrom(pass, b64d(L.E.enc.salt), L.E.enc.it); try { await txOpen(L.E.enc, L.body, k); } catch (e) { return false; } await txKeyKeep(k); return true; }
// ---------------------------------------------------------------- 📜 LỊCH SỬ TÀI KHOẢN dựng lại từ sổ (file Binance) – dùng cho Tài khoản Binance, Kết quả & sổ lệnh, Danh mục
//  Mỗi dòng sổ (đã bỏ dòng trùng) → thay đổi số dư từng coin theo ngày (giờ VN) → số dư cộng dồn × giá đóng cửa ngày = tài sản (USD) mỗi ngày.
//  Vốn nạp ròng = P2P mua − P2P bán + nạp − rút (kể cả mua bằng thẻ); lời/lỗ tích luỹ = tài sản − vốn nạp ròng. Futures: lời/lỗ đã chốt, phí, funding, phí thanh lý theo ngày.
//  Chưa tính lời/lỗ CHƯA chốt của lệnh futures đang mở (file lịch sử không có).
function txDelta(r) {
  const D = {}, add = (c, v) => { if (c && isNum(v) && v) D[c] = (D[c] || 0) + v; }, q = Math.abs(+r.qty || 0), sg = r.side === "sell" || r.side === "out" || r.side === "swap" ? -1 : 1;
  if (r.cat === "fut" || r.src === "bot" || r.src === "man") return D;      // khớp futures không đổi số dư trực tiếp (đã có ở dòng lời/lỗ, phí)
  if (r.cat === "spot" || r.cat === "conv") { add(r.base, sg * q); if (r.quote && isNum(r.px)) add(r.quote, -sg * q * r.px); else if (r.quote && txIsSt(r.quote) && isNum(r.usd)) add(r.quote, -sg * r.usd); }
  else if (r.cat === "fpl" || r.cat === "other") add(r.base, +r.qty);
  else if (r.cat === "wd") add(r.base, -(q + (r.src === "dw" ? +r.fee || 0 : 0)));
  else add(r.base, sg * q);
  if (r.fee && r.feeC && (r.cat === "spot" || r.cat === "conv" || r.cat === "p2p")) add(r.feeC, -Math.abs(r.fee));
  return D;
}
const TXDP = { m: null };      // giá đóng cửa NGÀY theo coin (bộ nhớ + lưu trên máy) – không lưu vào sổ (sổ có hạn dung lượng)
async function txDayPx(coin, d0, d1) {
  if (!TXDP.m) { TXDP.m = {}; try { TXDP.m = JSON.parse(localStorage.getItem("mybit_txdpx") || "{}"); } catch (e) { /* bỏ qua */ } }
  const M = (TXDP.m[coin] ||= {}), need = (d) => !(d in M) && d < txDay(Date.now());
  const days = []; for (let t = Date.parse(d0 + "T00:00:00Z"); t <= Date.parse(d1 + "T00:00:00Z"); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
  if (!days.some(need) && !days.includes(txDay(Date.now()))) return M;
  const pairs = coin === "TRY" ? [["USDTTRY", true]] : ["USDT", "BUSD", "FDUSD", "USDC"].map((qq) => [coin + qq, false]);
  for (const [sym, inv] of pairs) {
    let st = Date.parse(d0 + "T00:00:00Z") - 864e5, ok = false;
    try { while (st <= Date.parse(d1 + "T00:00:00Z")) { const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1d&startTime=${st}&limit=1000`); if (!r.ok) break; const j = await r.json(); if (!j.length) break; ok = true;
        for (const k of j) { const d = new Date(k[0]).toISOString().slice(0, 10), c = +k[4]; if (c > 0) M[d] = inv ? 1 / c : c; } st = j[j.length - 1][0] + 864e5; if (j.length < 1000) break; } } catch (e) { /* thử cặp khác */ }
    if (ok) break;
  }
  for (const d of days) if (!(d in M) && d < txDay(Date.now())) M[d] = null;      // không có giá (coin đã huỷ niêm yết…) → nhớ để khỏi hỏi lại
  try { localStorage.setItem("mybit_txdpx", JSON.stringify(TXDP.m)); } catch (e) { /* đầy bộ nhớ: chỉ giữ trong phiên */ }
  return M;
}
async function txHist(force) {
  if (!TAX.book) await txLoad();
  const B = TAX.book, sig = txSig(B);
  if (!force && TAX.hist && TAX.hist.sig === sig) return TAX.hist;
  if (!force && B.hs && B.hs.sig === sig && B.hs.eq) { const H = B.hs, D = []; for (let t = Date.parse(H.from + "T00:00:00Z"), i = 0; i < H.eq.length; t += 864e5, i++) D.push(new Date(t).toISOString().slice(0, 10)); H.days = D; return (TAX.hist = H); }      // sổ khoá: tóm tắt nằm trong phần đã giải mã
  const R = txRows().filter((r) => !r.dup && r.src !== "bot").sort((a, b) => a.t - b.t);
  if (!R.length) return (TAX.hist = { sig, empty: true });
  const DD = {}, FL = {}, FU = {}, cost = {}, TP = {};      // TP: giá khớp spot / convert theo ngày – dự phòng khi không lấy được giá ngày (coin đã huỷ niêm yết…)
  for (const r of R) {
    const d = txDay(r.t), x = txDelta(r); for (const [c, v] of Object.entries(x)) { const g = (DD[d] ||= {}); g[c] = (g[c] || 0) + v; }
    const u = isNum(r.usd) ? Math.abs(r.usd) : null;
    if ((r.cat === "spot" || r.cat === "conv") && r.base && !txIsSt(r.base) && isNum(r.qty) && r.qty > 0 && isNum(r.usd)) (TP[r.base] ||= {})[d] = Math.abs(r.usd) / r.qty;
    if (r.cat === "p2p" && u != null) FL[d] = (FL[d] || 0) + (r.side === "sell" ? -u : u);
    if ((r.cat === "dep" || r.cat === "wd") && u != null) FL[d] = (FL[d] || 0) + (r.cat === "wd" ? -u : u);
    if (r.cat === "fpl") { const k = r.quote || (/realized|lời\/lỗ/i.test(r.ref || "") ? "pnl" : /funding/i.test(r.ref || "") ? "fund" : /insurance|thanh lý/i.test(r.ref || "") ? "liq" : /fee|phí/i.test(r.ref || "") ? "fee" : "oth"), g = (FU[d] ||= { pnl: 0, fee: 0, fund: 0, liq: 0, oth: 0, n: 0, w: 0 }), v = isNum(r.pnl) ? r.pnl : +r.qty || 0;
      g[k] = (g[k] || 0) + v; if (k === "pnl") { const m = /gộp ngày|daily total/.test(r.ref || "") && String(r.ref).match(/· (\d+) /); if (m) { g.n += +m[1]; g.w += +r.px || 0; } else { g.n++; if (v > 0) g.w++; } } }
    if ((r.cat === "spot" || r.cat === "conv") && r.base && !txIsSt(r.base) && isNum(r.qty) && isNum(r.usd)) {      // giá vốn bình quân từng coin (mua cộng, bán trừ theo tỷ lệ)
      const c = (cost[r.base] ||= { q: 0, u: 0 }); if (r.side === "buy") { c.q += r.qty; c.u += r.usd; } else if (c.q > 0) { const k = Math.min(1, r.qty / c.q); c.u -= c.u * k; c.q = Math.max(0, c.q - r.qty); } }
  }
  const d0 = txDay(R[0].t), d1 = txDay(Date.now()), days = []; for (let t = Date.parse(d0 + "T00:00:00Z"); t <= Date.parse(d1 + "T00:00:00Z"); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
  // số dư cộng dồn từng coin + khoảng ngày cần giá
  const bal = {}, BAL = [], span = {};
  for (const d of days) { for (const [c, v] of Object.entries(DD[d] || {})) bal[c] = (bal[c] || 0) + v; const snap = {}; for (const [c, v] of Object.entries(bal)) if (Math.abs(v) > 1e-9) { snap[c] = v; if (!txIsSt(c) && v > 1e-9) { const s2 = (span[c] ||= [d, d]); s2[1] = d; } } BAL.push(snap); }
  const PX = {}, miss = [];
  await txPool(Object.keys(span), 4, async (c) => { PX[c] = await txDayPx(c, span[c][0], span[c][1]); });
  const eq = [], cap = []; let capS = 0; const lastPx = {};
  days.forEach((d, i) => { capS += FL[d] || 0; let v = 0;
    for (const [c, q] of Object.entries(BAL[i])) { if (q <= 0) continue; if (txIsSt(c)) { v += q; continue; } const p = PX[c]?.[d] ?? TP[c]?.[d] ?? lastPx[c] ?? null; if (isNum(p)) { lastPx[c] = p; v += q * p; } if (!isNum(PX[c]?.[d]) && !miss.includes(c)) miss.push(c); }
    eq.push(v); cap.push(capS); });
  const mon = {}; for (const [d, g] of Object.entries(FU)) { const m = mon[d.slice(0, 7)] ||= { pnl: 0, fee: 0, fund: 0, liq: 0, oth: 0, n: 0, w: 0, days: 0 }; for (const k of ["pnl", "fee", "fund", "liq", "oth", "n", "w"]) m[k] += g[k] || 0; m.days++; }
  for (const [d, v] of Object.entries(FL)) { const m = mon[d.slice(0, 7)] ||= { pnl: 0, fee: 0, fund: 0, liq: 0, oth: 0, n: 0, w: 0, days: 0 }; m.flow = (m.flow || 0) + v; }
  const S = { pnl: 0, fee: 0, fund: 0, liq: 0, oth: 0, n: 0, w: 0 }; for (const g of Object.values(FU)) for (const k of Object.keys(S)) S[k] += g[k] || 0;
  const cin = Object.values(FL).filter((v) => v > 0).reduce((a, v) => a + v, 0), cout = -Object.values(FL).filter((v) => v < 0).reduce((a, v) => a + v, 0);
  return (TAX.hist = { sig, days, eq, cap, fut: FU, mon, flows: FL, sum: { ...S, net: S.pnl + S.fee + S.fund + S.liq + S.oth, cin, cout, eq: eq[eq.length - 1], cap: cap[cap.length - 1] }, bal: BAL[BAL.length - 1], cost, miss, from: d0, files: B.files.length });
}
window.txHist = txHist;

// ---------------------------------------------------------------- giao diện
const txSize = (b) => (b >= 1048576 ? `${nf(b / 1048576, 1)} MB` : `${nf(Math.max(1, b / 1024), 0)} KB`);
// 📊 THANH TIẾN ĐỘ nhập file: báo đã nhận file ngay, % tổng (đọc 85% · dựng lịch sử 5% · lưu 10%, file lớn nặng hơn), từng file: chờ / đang xử lý / xong / lỗi, ước tính thời gian còn lại.
//    Vẽ trong #txProg (trang tự vẽ lại khi xong vẫn giữ bảng kết quả – TAX.progHtml), chặn rời trang khi đang ghi sổ
function txProg(files) {
  const F = files.map((f) => ({ name: f.name, size: f.size || 1, st: "wait", f: 0, msg: "" })), tot = F.reduce((a, x) => a + x.size, 0), t0 = performance.now(), S = { hist: 0, save: 0, k: "imp", msg: "" };
  let raf = 0, fin = null; const guard = (e) => { e.preventDefault(); e.returnValue = ""; }; addEventListener("beforeunload", guard);
  const pc = () => { const imp = F.reduce((a, x) => a + x.size * (x.st === "wait" ? 0 : x.f), 0) / tot; return Math.min(1, imp * 0.85 + S.hist * 0.05 + S.save * 0.1); };
  const IC = { wait: "⏳", run: "🔄", ok: "✅", same: "↩️", err: "⚠️" };
  const html = () => { const p = fin ? 1 : pc(), el = (performance.now() - t0) / 1000, eta = !fin && p > 0.06 ? el / p * (1 - p) : null, cur = F.find((x) => x.st === "run");
    const st = fin ? (fin.ok ? bi(`Xong · ${nf(el, 0)} giây`, `Done · ${nf(el, 0)} s`) : `⚠️ ${esc(fin.msg || bi("Chưa lưu được – thử lại", "Couldn't save – try again"))}`) : S.k !== "imp" ? esc(S.msg) : cur ? `${esc(cur.name)} · ${esc(cur.msg)}` : bi("Chuẩn bị…", "Preparing…");
    return `<div class="txpg ${fin ? (fin.ok ? "done" : "bad") : "run"}"><div class="txp-h"><b>📥 ${bi(`Đã nhận ${F.length} file`, `Received ${F.length} file(s)`)}</b><small>${txSize(tot)}</small><b class="txp-pc">${nf(p * 100, 0)}%</b>${fin ? `<button type="button" class="txp-x" data-txpx aria-label="${bi("Đóng", "Close")}">✕</button>` : ""}</div>
      <div class="txp-bar${!fin && p < 0.02 ? " ind" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><i style="width:${(p * 100).toFixed(1)}%"></i></div>
      <div class="txp-st">${st}${eta != null ? ` <span class="faint">· ${bi("còn khoảng", "about")} ${eta >= 90 ? nf(eta / 60, 0) + bi(" phút", " min") : nf(Math.max(1, eta), 0) + bi(" giây", " s")}${bi("", " left")}</span>` : ""}${!fin ? ` <span class="faint">· ${bi("cứ để trang mở", "keep this page open")}</span>` : ""}</div>
      <ul class="txp-f">${F.map((x) => `<li class="${x.st}"><span class="ic" aria-hidden="true">${IC[x.st]}</span><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span><small class="sz">${txSize(x.size)}</small><i class="txp-mini"><i style="width:${((x.st === "wait" ? 0 : x.f) * 100).toFixed(0)}%"></i></i><small class="msg">${esc(x.st === "wait" ? bi("chờ", "waiting") : x.msg)}</small></li>`).join("")}</ul></div>`; };
  const paint = () => { raf = 0; TAX.progHtml = html(); const el = $("#txProg"); if (el) el.innerHTML = TAX.progHtml; };
  const req = () => { if (!raf) raf = requestAnimationFrame(paint); };
  const tick = setInterval(req, 1000);      // thời gian còn lại tự cập nhật kể cả khi một bước chạy lâu
  paint(); $("#txProg")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const end = (o) => { fin = o; clearInterval(tick); removeEventListener("beforeunload", guard); paint(); };
  return { file: (i, st, f, msg) => { const x = F[i]; if (!x) return; x.st = st; x.f = Math.max(x.f, Math.min(1, f)); if (msg != null) x.msg = msg; req(); },
    stage: (k, f, msg) => { S.k = k; if (k === "hist") S.hist = f; if (k === "save") { S.hist = 1; S.save = f; } S.msg = msg; req(); },
    done: (ok) => end({ ok }), fail: (msg) => end({ ok: false, msg }) };
}
async function viewTax() {
  if (!ME || ME.legacy) { app().innerHTML = `<div class="ph"><h1>${bi("Sổ thuế TNCN", "PIT tax journal")}</h1></div><div class="panel"><p class="muted">${bi("Cần đăng nhập để lưu sổ riêng trong tài khoản.", "Sign in to keep a private journal in your account.")}</p></div>`; return; }
  try { await txLoad(); } catch (e) { if (!e.lock) throw e; return txLockScreen(e.bad); }
  TAX.bot = await txBotRows();
  const nd = [...new Set(TAX.bot.map((r) => txDay(r.t)))].filter((d) => !isNum(TAX.book.fx[d]));      // tỷ giá cho các ngày bot có lệnh
  txDraw();
  if (nd.length) { await txPool(nd, 6, (d) => txFx(d)); if (nd.some((d) => isNum(TAX.book.fx[d]))) { await txSave(); if (location.hash.startsWith("#/tax")) { const y = scrollY; txDraw(); scrollTo(0, y); } } }
}
// 🔒 QUYỀN RIÊNG TƯ: dữ liệu lưu ở đâu, ai đọc được, bật / tắt khoá bằng mật khẩu riêng
function txPrivPanel() {
  const B = TAX.book, kb = Math.round(JSON.stringify(B.rows).length / 1024), on = !!B.enc;
  const facts = `<ul class="tx-priv">
    <li>📄 ${bi("<b>File gốc không rời máy anh</b> – trình duyệt tự đọc file; chỉ các dòng giao dịch đã chuẩn hoá được lưu.", "<b>Original files never leave your device</b> – the browser reads them; only normalized rows are stored.")}</li>
    <li>🗄️ ${bi(`Lưu trong cơ sở dữ liệu của trang, gắn với tài khoản của anh (${txV(B.rows.length)} dòng · ~${txV(kb)} KB) – phải đăng nhập đúng tài khoản mới đọc được, không có đường dẫn công khai, không chia sẻ cho ai.`, `Stored in the site's database under your account (${txV(B.rows.length)} rows · ~${txV(kb)} KB) – readable only when signed in to your account; no public link, never shared.`)}</li>
    <li>${on ? "🔒 " + bi("<b>Đang khoá bằng mật khẩu riêng</b> (AES-256, mã hoá ngay trên trình duyệt): máy chủ chỉ giữ chuỗi mã hoá – kể cả quản trị viên hay ai lấy được cơ sở dữ liệu cũng không đọc được.", "<b>Locked with your own password</b> (AES-256, encrypted in the browser): the server only holds ciphertext – not even admins or anyone with database access can read it.") : "🔓 " + bi("<b>Chưa khoá</b>: trên máy chủ dữ liệu ở dạng đọc được với người có quyền vào cơ sở dữ liệu. Muốn chắc chắn không ai xem được: khoá bằng mật khẩu riêng bên dưới.", "<b>Not locked</b>: on the server the data is readable by whoever has database access. To be sure nobody else can read it: lock it with your own password below.")}</li></ul>`;
  const ctl = on ? `<div class="tx-set"><button type="button" class="btn" id="txLkForget">🔐 ${bi("Khoá lại ngay (quên mật khẩu trên tab này)", "Lock now (forget the key in this tab)")}</button><button type="button" class="btn" id="txLkOff">🔓 ${bi("Bỏ khoá – lưu dạng thường", "Remove lock – store as plain")}</button></div>`
    : `<form class="tx-set tx-lk" id="txLkF"><label>${bi("Mật khẩu sổ (≥ 10 ký tự)", "Ledger password (≥ 10 chars)")}<input id="txLkP" type="password" autocomplete="new-password" minlength="10" required></label><label>${bi("Nhập lại", "Repeat")}<input id="txLkP2" type="password" autocomplete="new-password" minlength="10" required></label><button class="btn primary" type="submit">🔒 ${bi("Khoá sổ bằng mật khẩu này", "Lock the ledger with this password")}</button></form>
      <p class="tx-note">⚠️ ${bi("Mật khẩu không lưu ở đâu cả: <b>quên là không ai mở được</b> (kể cả quản trị viên) – chỉ còn cách xoá sổ và nhập lại file Binance. Mỗi tab mở sổ cần nhập mật khẩu 1 lần; trang Tài khoản Binance / Kết quả dùng lịch sử từ sổ cũng cần sổ đã mở.", "The password isn't stored anywhere: <b>forget it and nobody can open the ledger</b> (not even admins) – the only way out is deleting it and re-importing your Binance files. Each tab asks for it once; the Binance account / Results pages also need the ledger unlocked.")}</p>`;
  return panel(bi("🔒 Quyền riêng tư & nơi lưu", "🔒 Privacy & storage"), facts + ctl + `<p class="tx-note" id="txLkM"></p>`, on ? "🔒 " + bi("đã mã hoá", "encrypted") : "🔓 " + bi("chưa mã hoá", "not encrypted"));
}
function txLockScreen(bad) {
  app().innerHTML = `<div class="ph"><h1>🧾 ${bi("Sổ thuế TNCN · tài sản mã hoá", "PIT journal · crypto assets")}</h1></div>${panel("🔒 " + bi("Sổ đang khoá", "Ledger locked"), `<p class="muted">${bi("Sổ được mã hoá bằng mật khẩu riêng của anh – máy chủ chỉ giữ dữ liệu đã mã hoá. Nhập mật khẩu để mở trong tab này.", "The ledger is encrypted with your own password – the server only holds encrypted data. Enter the password to open it in this tab.")}</p>
    <form class="tx-set tx-lk" id="txUnF"><label>${bi("Mật khẩu sổ", "Ledger password")}<input id="txUnP" type="password" autocomplete="current-password" required></label><button class="btn primary" type="submit">🔓 ${bi("Mở sổ", "Unlock")}</button></form>
    <p class="tx-note" id="txUnM">${bad ? `⚠️ ${bi("Mật khẩu không đúng.", "Wrong password.")}` : ""}</p>
    <details class="tx-how"><summary>${bi("Quên mật khẩu?", "Forgot the password?")}</summary><p class="tx-note">${bi("Không ai khôi phục được (kể cả quản trị viên) – đó chính là điều bảo vệ dữ liệu của anh. Cách duy nhất: xoá sổ đang khoá rồi nhập lại file Binance.", "Nobody can recover it (not even admins) – that's what protects your data. The only way: delete the locked ledger and re-import the Binance files.")}</p><button type="button" class="btn sm" id="txUnWipe">🗑️ ${bi("Xoá sổ đang khoá", "Delete the locked ledger")}</button></details>`)}`;
  $("#txUnP")?.focus();
  $("#txUnF").onsubmit = async (e) => { e.preventDefault(); const m = $("#txUnM"); m.textContent = bi("Đang mở…", "Unlocking…"); if (await txUnlock($("#txUnP").value)) { TAX.hist = null; viewTax(); } else m.textContent = "⚠️ " + bi("Mật khẩu không đúng.", "Wrong password."); };
  $("#txUnWipe").onclick = async () => { if (prompt(bi("Xoá TOÀN BỘ sổ đang khoá (không lấy lại được)? Gõ XOA để xác nhận", "Delete the WHOLE locked ledger? Type XOA to confirm")) !== "XOA") return; const nk = Math.max(6, TAX.lockd?.nk || 6); for (let i = 0; i < nk; i++) await Store.put(TAX.KEYS[i], i ? { rows: [] } : { rows: [], nk: 1 }); TAX.lockd = null; TAX.book = null; TAX.hist = null; viewTax(); };
}
// 📊 KHỐI LƯỢNG (exposure) & THUẾ THEO NĂM: spot · convert · P2P (giá trị bán / mua), futures (giá trị khớp thật từ bot / file futures + ƯỚC TÍNH từ phí cho phần chỉ có
//    trong lịch sử tổng – lịch sử tổng không ghi giá trị lệnh, phí TB ~0,04% giá trị khớp), lời/lỗ futures ròng, thuế theo luật (chỉ từ 27/3/2026) và thuế THAM KHẢO nếu 0,1% áp cho cả kỳ
const TXFR = 0.0004;      // phí futures trung bình / giá trị khớp (taker 0,05% · maker 0,02%) – dùng để ước tính giá trị khớp từ phí
function txYears(C) {
  const FXK = Object.entries(TAX.book.fx || {}).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && isNum(v)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const fxAny = (d) => { const r = txRate(d).v; if (isNum(r)) return r; let best = null; for (const [k, v] of FXK) { if (k <= d) best = v; else { if (best == null) best = v; break; } } return best ?? 25500; };      // thiếu tỷ giá ngày → ngày gần nhất có tỷ giá (để thấy quy mô; số thuế chính thức vẫn ở bảng kịch bản)
  const Y = {}, FD = {}, EST = {}, mk = () => ({ sS: 0, sB: 0, sU: 0, fK: 0, fKu: 0, fE: 0, fEu: 0, pnl: 0, fee: 0, fund: 0, liq: 0, oth: 0, nF: 0, tL: 0, tLlo: 0, tR: 0, tRf: 0, n: 0, d0: null, d1: null });
  for (const { r, c } of C) { if (r.dup) continue; const d = c.d, g = (Y[d.slice(0, 4)] ||= mk()); g.n++; g.d0 = !g.d0 || d < g.d0 ? d : g.d0; g.d1 = !g.d1 || d > g.d1 ? d : g.d1;
    const on = d >= TAX.A, u = isNum(r.usd) ? Math.abs(r.usd) : 0, v = isNum(c.vnd) ? c.vnd : u * fxAny(d);
    if (r.cat === "spot" || r.cat === "conv" || r.cat === "p2p") { if (c.tn) { g.sS += v; g.tR += v * TAX.RATE; } else g.sB += v; g.sU += u; if (on) { g.tL += c.b; g.tLlo += d >= TAX.B ? c.n : 0; } }
    else if (r.cat === "fut") { g.fK += v; g.fKu += u; g.nF++; g.tRf += v * TAX.RATE; if (on) g.tL += c.f2; const f = (FD[d] ||= { led: 0, known: 0 }); f.known += Math.abs(+r.fee || 0); }
    else if (r.cat === "fpl") { const k = r.quote || (/realized/i.test(r.ref || "") ? "pnl" : /funding/i.test(r.ref || "") ? "fund" : /insurance|liquidation|thanh lý/i.test(r.ref || "") ? "liq" : /fee|phí/i.test(r.ref || "") ? "fee" : "oth"), x = isNum(r.pnl) ? r.pnl : +r.qty || 0;
      g[k] = (g[k] || 0) + x; if (k === "fee") (FD[d] ||= { led: 0, known: 0 }).led += Math.abs(x); } }
  for (const [d, f] of Object.entries(FD)) { const e = Math.max(0, f.led - f.known) / TXFR; if (e < 1) continue; const g = Y[d.slice(0, 4)], ev = e * fxAny(d);
    g.fEu += e; g.fE += ev; g.tRf += ev * TAX.RATE; if (d >= TAX.A) g.tL += ev * TAX.RATE; EST[d] = ev; }      // phí trong lịch sử tổng nhiều hơn phí các lệnh đã biết giá trị → phần chênh = lệnh tay / lệnh cũ chưa có file futures
  TAX.est = EST; return Y;
}
function txYearPanel(C) {
  const Y = TAX.yrs || txYears(C), U = window.__TX, ys = Object.keys(Y).sort(); if (!ys.length) return "";
  if (U.yr !== "all" && !Y[U.yr]) U.yr = "all";
  const T = U.yr === "all" ? ys.reduce((a, y) => { for (const [k, v] of Object.entries(Y[y])) if (typeof v === "number") a[k] = (a[k] || 0) + v; a.d0 = a.d0 && a.d0 < Y[y].d0 ? a.d0 : Y[y].d0; a.d1 = a.d1 && a.d1 > Y[y].d1 ? a.d1 : Y[y].d1; return a; }, {}) : Y[U.yr];
  const vnd = (v) => `${txV(v)} ₫`, us = (v) => `${v < 0 ? "-" : ""}$${txV(Math.abs(v), Math.abs(v) >= 100 ? 0 : 2)}`, cl = (v) => (v > 0 ? "up" : v < 0 ? "down" : ""), net = T.pnl + T.fee + T.fund + T.liq + T.oth;
  const chips = `<div class="tx-yr">${["all", ...ys.slice().reverse()].map((y) => `<button type="button" class="chip ${y === U.yr ? "on" : ""}" data-txyr="${y}">${y === "all" ? bi("Tất cả", "All") : y}</button>`).join("")}</div>`;
  const kpi = `<div class="tx-kpi">
    <div><i>${bi("Spot · Convert · P2P", "Spot · Convert · P2P")}</i><b>${vnd(T.sS + T.sB)}</b><small>${bi("bán", "sold")} ${vnd(T.sS)} · ${bi("mua", "bought")} ${vnd(T.sB)} · ≈ ${us(T.sU)}</small></div>
    <div><i>${bi("Futures – giá trị khớp", "Futures – traded value")}</i><b>${vnd(T.fK + T.fE)}</b><small>${bi("đã biết", "known")} ${vnd(T.fK)}${T.fE ? ` · <span title="${bi("Lịch sử tổng không ghi giá trị lệnh: ước tính = phí ÷ 0,04%", "The transaction history has no order value: estimate = fee ÷ 0.04%")}">${bi("ước tính từ phí", "estimated from fees")} ${vnd(T.fE)}</span>` : ""} · ≈ ${us(T.fKu + T.fEu)}</small></div>
    <div><i>${bi("Lời / lỗ futures ròng", "Futures net P/L")}</i><b class="${cl(net)}">${us(net)}</b><small>${bi("chốt", "realized")} ${us(T.pnl)} · ${bi("phí", "fees")} ${us(T.fee)} · funding ${us(T.fund)}${T.liq ? ` · ${bi("thanh lý", "liq.")} ${us(T.liq)}` : ""}</small></div>
    <div class="hi"><i>${bi("Thuế theo luật · tham khảo", "Tax by law · reference")}</i><b>${vnd(T.tL)}</b><small>${bi("phải tính (mức cao nhất, chỉ giao dịch từ 27/3/2026)", "due (highest, only trades from 27/03/2026)")} · ${bi("nếu 0,1% áp cho cả kỳ", "if 0.1% applied to all")}: ${vnd(T.tR + T.tRf)}</small></div></div>`;
  const rows = ys.slice().reverse().map((y) => { const g = Y[y], nt = g.pnl + g.fee + g.fund + g.liq + g.oth, pre = y < TAX.A.slice(0, 4);
    return `<tr class="${y === U.yr ? "on" : ""}" data-txyr="${y}"><td><b>${y}</b>${pre ? ` <small class="faint">${bi("trước hiệu lực", "pre-law")}</small>` : ""}</td><td>${vnd(g.sS + g.sB)}<br><small class="faint">${bi("bán", "sold")} ${vnd(g.sS)}</small></td><td>${vnd(g.fK + g.fE)}<br><small class="faint">${g.fE ? `${bi("ước tính", "est.")} ${vnd(g.fE)}` : bi("đã biết", "known")}</small></td><td><b>${vnd(g.sS + g.sB + g.fK + g.fE)}</b></td><td class="${cl(nt)}">${us(nt)}</td><td class="down">${g.fee ? us(g.fee) : "—"}</td><td>${g.tL ? vnd(g.tL) : "0 ₫"}</td><td class="faint">${vnd(g.tR + g.tRf)}</td></tr>`; }).join("");
  const tbl = `<div class="tx-tw"><table class="tx-t tx-yrt"><thead><tr><th>${bi("Năm", "Year")}</th><th>Spot · Convert · P2P</th><th>${bi("Futures (giá trị khớp)", "Futures (traded value)")}</th><th>${bi("Tổng khối lượng", "Total volume")}</th><th>${bi("Lời/lỗ futures ròng", "Futures net P/L")}</th><th>${bi("Phí futures", "Futures fees")}</th><th>${bi("Thuế theo luật", "Tax by law")}</th><th title="${bi("Nếu mức 0,1% giá chuyển nhượng áp cho mọi giao dịch (không phải số phải nộp)", "If 0.1% of transfer value applied to every trade (not an amount due)")}">${bi("Tham khảo 0,1%", "Reference 0.1%")}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const nPre = ys.filter((y) => y < TAX.A.slice(0, 4)).length;
  const why = `<p class="tx-note">💡 ${bi(`<b>Vì sao nhập thêm file cũ mà số thuế không đổi?</b> Thuế 0,1% trên giá chuyển nhượng chỉ áp dụng cho giao dịch từ <b>27/3/2026</b> (TT 32/2026) – giao dịch trước đó${nPre ? ` (${ys.filter((y) => y < TAX.A.slice(0, 4)).join(", ")})` : ""} không chịu loại thuế này, sổ vẫn lưu để đối chiếu và thể hiện khối lượng ở bảng trên. Cột "Tham khảo 0,1%" chỉ cho biết quy mô nếu mức này áp từ trước – <b>không phải số phải nộp</b>.`, `<b>Why didn't the tax change after importing older files?</b> The 0.1% transfer tax only applies to trades from <b>27/03/2026</b> (Circular 32/2026) – earlier trades aren't subject to it; the ledger keeps them for reconciliation and shows their volume above. "Reference 0.1%" only shows the scale if the rate had applied earlier – <b>not an amount due</b>.`)}</p>
    ${T.fE ? `<p class="tx-note">📈 ${bi(`Futures: lịch sử tổng chỉ ghi lời/lỗ, phí, funding – <b>không có giá trị từng lệnh</b>, nên giá trị khớp được ước tính từ phí (≈ phí ÷ 0,04%, thực tế 0,02–0,05% tuỳ maker/taker → con số có thể lệch ±50%). Nhập file <i>Futures Trade History</i> để có số chính xác – phần ước tính sẽ tự thay bằng số thật.`, `Futures: the transaction history only records P/L, fees and funding – <b>no order value</b>, so traded value is estimated from fees (≈ fee ÷ 0.04%; real rates 0.02–0.05% maker/taker → may be off by ±50%). Import <i>Futures Trade History</i> for exact figures – estimates are replaced automatically.`)}</p>` : ""}`;
  return panel(bi("📊 Khối lượng & thuế theo năm", "📊 Volume & tax by year"), chips + kpi + tbl + why, `${U.yr === "all" ? bi("tất cả các năm", "all years") : U.yr} · ${T.d0 ? `${T.d0.slice(8, 10)}/${T.d0.slice(5, 7)}/${T.d0.slice(0, 4)} → ${T.d1.slice(8, 10)}/${T.d1.slice(5, 7)}/${T.d1.slice(0, 4)}` : ""}`);
}
function txDraw() {
  const B = TAX.book, R = txRows(), C = R.map((r) => ({ r, c: txCalc(r) })), U = (window.__TX ||= { y: "all", cat: "all", q: "", only: false, lim: TAX.lim, mon: String(new Date().getUTCFullYear()), yr: "all" }); U.yr ||= "all";
  const live = C.filter((x) => !x.r.dup), sum = (from, k) => live.filter((x) => x.c.d >= from).reduce((a, x) => a + x.c[k], 0);
  TAX.yrs = txYears(C); const est = (from) => Object.entries(TAX.est || {}).filter(([d]) => d >= from).reduce((a, [, v]) => a + v * TAX.RATE, 0), lev0 = Math.max(1, +B.set.lev || 1), eA = est(TAX.A), eB = est(TAX.B);      // + futures ƯỚC TÍNH từ phí (lệnh chưa có giá trị khớp)
  const SA = { n: sum(TAX.A, "n"), b: sum(TAX.A, "b"), f1: sum(TAX.A, "f1") + eA / lev0, f2: sum(TAX.A, "f2") + eA, e: eA }, SB = { n: sum(TAX.B, "n"), b: sum(TAX.B, "b"), f1: sum(TAX.B, "f1") + eB / lev0, f2: sum(TAX.B, "f2") + eB, e: eB };
  const lo = SB.n, hi = SA.b + SA.f2, pre = live.filter((x) => x.c.d < TAX.A && (x.c.tn || x.c.tb || x.c.tf)), miss = live.filter((x) => x.c.miss && x.c.d >= TAX.A);
  const vnd = (v) => `${txV(v)} ₫`;
  const kpi = `<div class="tx-kpi">
    <div><i>${bi("Ước tính thấp nhất", "Lowest estimate")}</i><b>${vnd(lo)}</b><small>${bi("hẹp · không tính futures · từ 01/7/2026", "narrow · no futures · from 01/07/2026")}</small></div>
    <div class="hi"><i>${bi("Ước tính cao nhất", "Highest estimate")}</i><b>${vnd(hi)}</b><small>${bi("rộng · futures theo toàn bộ giá trị · từ 27/3/2026", "broad · futures on full value · from 27/03/2026")}</small></div>
    <div><i>${bi("Nên để riêng", "Set aside")}</i><b>${vnd(Math.ceil(hi / 1000) * 1000)}</b><small>${bi("theo mức cao nhất, phòng khi bị truy thu", "at the highest level, in case of back-tax")}</small></div>
    <div><i>${bi("Giao dịch trong sổ", "Rows in the journal")}</i><b>${txV(live.length)}</b><small>${live.length ? `${txTime(live.reduce((m, x) => Math.min(m, x.r.t), Infinity)).slice(0, 10)} → ${txTime(live.reduce((m, x) => Math.max(m, x.r.t), -Infinity)).slice(0, 10)}` : bi("chưa có – nhập file ở dưới", "none yet – import files below")}</small></div></div>`;
  const mx = (S) => `<td>${vnd(S.n)}</td><td>${vnd(S.b)}</td><td>0 ₫</td><td>${vnd(S.f1)}</td><td>${vnd(S.f2)}</td>`;
  const matrix = `<div class="tx-tw"><table class="tx-t tx-mx"><thead><tr><th rowspan="2">${bi("Tính từ", "From")}</th><th colspan="2">${bi("Spot · Convert · P2P", "Spot · Convert · P2P")}</th><th colspan="3">Futures</th></tr><tr><th>${bi("Hẹp", "Narrow")}</th><th>${bi("Rộng", "Broad")}</th><th>F0</th><th>${bi("F1 · ký quỹ", "F1 · margin")}</th><th>${bi("F2 · toàn bộ", "F2 · full")}</th></tr></thead>
    <tbody><tr><td><b>27/3/2026</b><small>TT 32/2026</small></td>${mx(SA)}</tr><tr><td><b>01/7/2026</b><small>${bi("Luật Thuế TNCN", "PIT Law")}</small></td>${mx(SB)}</tr></tbody></table></div>
    ${SA.e ? `<p class="tx-note">📈 ${bi(`Cột Futures đã gồm ${txV(SA.e)} ₫ thuế của phần giá trị khớp ƯỚC TÍNH từ phí (lệnh futures chỉ có trong lịch sử tổng, chưa có file Futures Trade History).`, `Futures columns include ${txV(SA.e)} ₫ tax on traded value ESTIMATED from fees (futures fills only in the transaction history, no Futures Trade History file yet).`)}</p>` : ""}
    <p class="tx-note">${bi(`Tổng phải nộp theo một kịch bản = 1 cột Spot + 1 cột Futures cùng hàng. Đòn bẩy dùng cho F1: x${txV(B.set.lev, 0)}. Giao dịch trước 27/3/2026: ${pre.length} dòng – lưu để đối chiếu, không tính thuế.`, `Total for one scenario = one Spot column + one Futures column on the same row. Leverage for F1: x${txV(B.set.lev, 0)}. Before 27/03/2026: ${pre.length} rows – kept for reconciliation, not taxed.`)}${miss.length ? ` <b class="warn">⚠️ ${miss.length} ${bi("dòng chịu thuế chưa có giá/tỷ giá – xem cột VND trống trong sổ.", "taxable rows lack a price/rate – see empty VND cells.")}</b>` : ""}</p>`;
  // theo tháng
  const yrs = [...new Set(live.map((x) => x.c.d.slice(0, 4)))].sort().reverse(); if (!yrs.includes(U.mon)) U.mon = yrs[0] || U.mon;
  const M = {}; for (const x of live) { if (x.c.d.slice(0, 4) !== U.mon) continue; const k = x.c.d.slice(0, 7), g = (M[k] ||= { n: 0, b: 0, f1: 0, f2: 0, sv: 0, cnt: 0, p2pS: 0 }), on = x.c.d >= TAX.A; if (on) { g.n += x.c.n; g.b += x.c.b; g.f1 += x.c.f1; g.f2 += x.c.f2; } g.cnt++; if (x.c.tn) g.sv += x.c.vnd || 0; if (x.r.cat === "p2p" && x.r.side === "sell") g.p2pS += x.c.vnd || 0; }
  const mon = `<div class="tx-yr">${yrs.map((y) => `<button type="button" class="chip ${y === U.mon ? "on" : ""}" data-txmon="${y}">${y}</button>`).join("")}</div>
    <div class="tx-tw"><table class="tx-t"><thead><tr><th>${bi("Tháng", "Month")}</th><th>${bi("Dòng", "Rows")}</th><th>${bi("Giá trị bán (hẹp)", "Sales value (narrow)")}</th><th>${bi("Trong đó P2P bán", "of which P2P sells")}</th><th>${bi("Thuế hẹp", "Narrow tax")}</th><th>${bi("Thuế rộng", "Broad tax")}</th><th>F1</th><th>F2</th></tr></thead><tbody>
    ${Object.keys(M).sort().map((k) => { const g = M[k], pre2 = k < TAX.A.slice(0, 7); return `<tr class="${pre2 ? "faint" : ""}"><td>${k.slice(5)}/${k.slice(0, 4)}${pre2 ? ` <small>${bi("trước hiệu lực", "pre-effective")}</small>` : k === TAX.A.slice(0, 7) ? ` <small>${bi("từ 27/3", "from 27/3")}</small>` : ""}</td><td>${g.cnt}</td><td>${vnd(g.sv)}</td><td>${vnd(g.p2pS)}</td><td>${vnd(g.n)}</td><td>${vnd(g.b)}</td><td>${vnd(g.f1)}</td><td>${vnd(g.f2)}</td></tr>`; }).join("") || `<tr><td colspan="8" class="muted">${bi("Chưa có giao dịch trong năm này.", "No transactions this year.")}</td></tr>`}</tbody></table></div>
    <p class="tx-note">${bi("Thuế tháng tính theo ngày giờ Việt Nam. Tháng 3/2026 chỉ tính phần từ ngày 27; cột thuế đã áp mốc 27/3 (hàng 01/7 xem ở bảng trên).", "Monthly figures use Vietnam time. March 2026 counts only from the 27th; the tax columns use the 27/03 start (see the table above for 01/07).")}</p>`;
  // sổ chi tiết
  const yrsR = [...new Set(C.map((x) => x.c.d.slice(0, 4)))].sort().reverse(), qq = U.q.trim().toUpperCase();
  const F = C.filter((x) => (U.y === "all" || x.c.d.startsWith(U.y)) && (U.cat === "all" || x.r.cat === U.cat) && (!qq || `${x.r.base} ${x.r.quote} ${x.r.ref || ""}`.toUpperCase().includes(qq)) && (!U.only || x.c.tn || x.c.tb || x.c.tf));
  const cats = Object.keys(TXC).filter((k) => C.some((x) => x.r.cat === k));
  const filt = `<div class="tx-f"><select id="txY" aria-label="${bi("Năm", "Year")}"><option value="all">${bi("Mọi năm", "All years")}</option>${yrsR.map((y) => `<option ${U.y === y ? "selected" : ""}>${y}</option>`).join("")}</select>
    <select id="txC" aria-label="${bi("Loại", "Type")}"><option value="all">${bi("Mọi loại", "All types")}</option>${cats.map((k) => `<option value="${k}" ${U.cat === k ? "selected" : ""}>${TXC[k][0]} ${TXC[k][1]}</option>`).join("")}</select>
    <input id="txQ" type="search" placeholder="${bi("Tìm coin, mã lệnh…", "Search coin, order id…")}" value="${esc(U.q)}"><label class="chk"><input type="checkbox" id="txOnly" ${U.only ? "checked" : ""}> ${bi("chỉ dòng có thể chịu thuế", "taxable rows only")}</label></div>`;
  const row = (x) => { const r = x.r, c = x.c, cat = TXC[r.cat] || TXC.other, pair = r.quote ? `${esc(r.base)}/${esc(r.quote)}` : esc(r.base || "");
    return `<tr class="${r.dup ? "tx-dup" : ""}${c.d < TAX.A ? " tx-pre" : ""}"><td>${txTime(r.t)}</td><td>${cat[0]} ${cat[1]}</td><td><b>${pair}</b></td><td class="${r.side === "sell" || r.side === "out" ? "down" : r.side === "buy" || r.side === "in" ? "up" : ""}">${TXS[r.side] || r.side || ""}</td><td class="n">${txQ(r.qty)}</td><td class="n">${txQ(r.px)}</td><td class="n">${isNum(r.usd) ? txV(r.usd, 2) : "—"}</td><td class="n" title="${esc(c.fx.s)}">${isNum(r.vnd) ? "P2P" : txV(c.fx.v)}</td><td class="n">${isNum(c.vnd) ? txV(c.vnd) : c.miss ? `<b class="warn">?</b>` : "—"}</td><td class="n">${c.tn ? txV(c.n) : ""}</td><td class="n">${c.tb ? txV(c.b) : ""}</td><td class="n">${c.tf ? `${txV(c.f1)} / ${txV(c.f2)}` : ""}</td><td><small>${TXSRC[r.src] || r.src}${r.dup ? ` · <b>${bi("trùng – không tính", "duplicate – excluded")}</b>` : ""}</small></td><td><small>${esc(r.ref || "")}${r.note ? ` · ${esc(r.note)}` : ""}</small></td><td>${r.src === "bot" ? "" : `<button type="button" class="tx-del" data-txdel="${esc(r.id)}" title="${bi("Xoá dòng", "Delete row")}" aria-label="${bi("Xoá dòng", "Delete row")}">✕</button>`}</td></tr>`; };
  const tbl = `<div class="tx-tw tx-big"><table class="tx-t tx-led"><thead><tr><th>${bi("Thời gian (giờ VN)", "Time (VN)")}</th><th>${bi("Loại", "Type")}</th><th>${bi("Cặp / tài sản", "Pair / asset")}</th><th>${bi("Bên", "Side")}</th><th>${bi("Số lượng", "Qty")}</th><th>${bi("Giá", "Price")}</th><th>${bi("Giá trị (USD)", "Value (USD)")}</th><th>${bi("Tỷ giá", "Rate")}</th><th>${bi("Giá chuyển nhượng (VND)", "Transfer value (VND)")}</th><th>${bi("Thuế hẹp", "Narrow")}</th><th>${bi("Thuế rộng", "Broad")}</th><th>${bi("Futures F1 / F2", "Futures F1 / F2")}</th><th>${bi("Nguồn", "Source")}</th><th>${bi("Tham chiếu", "Reference")}</th><th></th></tr></thead><tbody>${F.slice(0, U.lim).map(row).join("") || `<tr><td colspan="15" class="muted">${bi("Chưa có dòng nào khớp bộ lọc.", "No rows match the filter.")}</td></tr>`}</tbody></table></div>${F.length > U.lim ? `<button type="button" class="btn" id="txMore">${bi("Xem thêm", "Show more")} (${F.length - U.lim})</button>` : ""}`;
  // nguồn dữ liệu & đối chiếu
  const files = B.files.length ? `<div class="tx-tw"><table class="tx-t"><thead><tr><th>${bi("File", "File")}</th><th>${bi("Loại", "Type")}</th><th>${bi("Dòng mới", "New rows")}</th><th>${bi("Trùng bỏ qua", "Duplicates")}</th><th>${bi("Khoảng thời gian", "Period")}</th><th>${bi("Nhập lúc", "Imported")}</th></tr></thead><tbody>${B.files.map((f) => `<tr><td>${esc(f.name)}</td><td>${TXSRC[f.kind] || f.kind}</td><td>${f.n}</td><td>${f.dup}</td><td>${f.from ? `${txTime(f.from).slice(0, 10)} → ${txTime(f.to).slice(0, 10)}` : "—"}</td><td>${esc(String(f.at).slice(0, 16).replace("T", " "))}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">${bi("Chưa nhập file nào.", "No files imported yet.")}</p>`;
  const nets = B.files.filter((f) => f.net).sort((a, b) => a.from - b.from), ovl = nets.some((f, i) => i && f.from <= nets[i - 1].to), NET = {}; for (const f of nets) for (const [c, v] of Object.entries(f.net)) NET[c] = (NET[c] || 0) + v;
  const recon = Object.keys(NET).length ? `<h3 class="tx-h3">${bi("Đối chiếu số dư theo lịch sử giao dịch tổng", "Balance reconciliation from transaction history")}</h3><p class="tx-note">${bi("Cộng mọi thay đổi trong các file lịch sử tổng đã nhập. Nếu đã nhập đủ từ ngày mở tài khoản, số này phải bằng số dư hiện tại trên Binance (lệch nhỏ do bụi/làm tròn).", "Sum of all changes in the imported transaction-history files. If imported from account opening, this should equal the current Binance balance (small gaps from dust/rounding).")}${ovl ? ` <b class="warn">⚠️ ${bi("Có các file lịch sử tổng trùng khoảng thời gian – số đối chiếu bị cộng 2 lần phần trùng; nên xuất lại theo từng năm không chồng nhau.", "Some transaction-history files overlap in time – the overlap is counted twice here; re-export by non-overlapping years.")}</b>` : ""}</p><div class="tx-chips">${Object.entries(NET).filter(([, v]) => Math.abs(v) > 1e-8).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 40).map(([c, v]) => `<span><b>${esc(c)}</b> ${txQ(v)}</span>`).join("")}</div>` : "";
  const fxSet = `<div class="tx-set"><label>${bi("Tỷ giá USD/VND", "USD/VND rate")}<select id="txFxM"><option value="mkt" ${B.set.fxMode === "mkt" ? "selected" : ""}>${bi("Thị trường theo ngày (tự lấy)", "Daily market (auto)")}</option><option value="p2p" ${B.set.fxMode === "p2p" ? "selected" : ""}>${bi("Giá P2P của anh trong ngày (nếu có)", "Your P2P price that day (if any)")}</option><option value="fix" ${B.set.fxMode === "fix" ? "selected" : ""}>${bi("Một tỷ giá cố định", "One fixed rate")}</option></select></label>
    <label>${bi("Tỷ giá cố định", "Fixed rate")}<input id="txFxF" type="number" inputmode="decimal" value="${B.set.fxFix ?? ""}" placeholder="vd 26300"></label>
    <label>${bi("Đòn bẩy futures (cho F1)", "Futures leverage (for F1)")}<input id="txLev" type="number" min="1" max="125" value="${B.set.lev}"></label>
    <button type="button" class="btn" id="txSetSave">💾 ${bi("Lưu", "Save")}</button></div>
    <p class="tx-note">${bi("P2P luôn dùng đúng số VND anh đã nhận/trả. Giao dịch khác quy USDT/USDC… = USD rồi nhân tỷ giá ngày (giờ VN). Tỷ giá thị trường lấy từ bộ tỷ giá công khai theo ngày (fawazahmed0 currency-api); trước 02/3/2024 dùng tỷ giá ngày gần nhất có dữ liệu. Nếu cơ quan thuế yêu cầu tỷ giá Vietcombank/Ngân hàng Nhà nước, chọn tỷ giá cố định hoặc sửa từng ngày trong file Excel xuất ra.", "P2P always uses the exact VND you received/paid. Other rows convert stablecoins = USD at the daily rate (VN time). Market rates come from a public daily dataset (fawazahmed0 currency-api); before 02/03/2024 the nearest available day is used. If the tax office requires Vietcombank/SBV rates, use a fixed rate or adjust per day in the exported Excel.")}</p>`;
  const how = `<details class="tx-how"><summary>${bi("📥 Cách lấy file từ Binance (làm 1 lần cho toàn bộ lịch sử)", "📥 How to get files from Binance (once for the full history)")}</summary><ol>
    <li><b>${bi("Lịch sử giao dịch tổng – quan trọng nhất", "Transaction history – most important")}</b>: ${bi(`binance.com trên máy tính → menu <b>Tài sản</b> (Assets – trước đây tên là Ví / Wallet) → <i>Lịch sử tài sản</i> (Asset History). Không thấy menu này: bấm biểu tượng người góc trên phải → <i>Lệnh</i> (Orders) → cột trái mục <i>Tài khoản</i> → <i>Lịch sử tài sản</i>, hoặc mở thẳng <a href="https://www.binance.com/vi/my/wallet/history/overview" target="_blank" rel="noopener">trang Lịch sử tài sản</a>.
      Rê vào biểu tượng tải xuống góc trên phải → <i>Xuất bản ghi giao dịch</i> (Export Transaction Records) → Loại dữ liệu: <i>Transaction History</i> · Thời gian: <i>Tuỳ chỉnh</i>, từ ngày mở tài khoản tới hôm nay (Binance không cho chọn dài thì chia mỗi lần 12 tháng) → Tài khoản: Tất cả · Coin: Tất cả → <i>Tạo</i> (Generate) → chờ vài phút (Binance báo qua email) → <i>Tải xuống</i> trong mục Export Details. File này có đủ spot, convert, P2P (số USDT), nạp/rút, Earn, futures (lời lỗ, phí, funding).`, `binance.com on desktop → <b>Assets</b> menu (formerly Wallet) → <i>Asset History</i>. Can't find it: click the person icon top right → <i>Orders</i> → left column under <i>Account</i> → <i>Asset History</i>, or open the <a href="https://www.binance.com/en/my/wallet/history/overview" target="_blank" rel="noopener">Asset History page</a> directly.
      Hover the download icon top right → <i>Export Transaction Records</i> → Data type: <i>Transaction History</i> · Time: <i>Customize</i>, from account opening to today (if Binance won't allow a long range, split into 12-month requests) → Account: All · Coin: All → <i>Generate</i> → wait a few minutes (Binance emails you) → <i>Download</i> under Export Details. It covers spot, convert, P2P (USDT), deposits/withdrawals, Earn and futures P/L, fees, funding.`)}</li>
    <li><b>P2P (${bi("để có đúng số VND", "for exact VND")})</b>: ${bi("Lệnh (Orders) → <i>Lệnh P2P</i> → Lịch sử lệnh → chọn mọi coin, Mua &amp; Bán, mọi trạng thái, khoảng thời gian → biểu tượng tải xuống / Xuất. Không thấy nút xuất: trong <i>Lịch sử tài sản</i> → <i>Xuất bản ghi giao dịch</i> → loại dữ liệu <i>P2P (C2C)</i>.", "Orders → <i>P2P Orders</i> → order history → all coins, Buy &amp; Sell, all statuses, date range → download / Export. No export button: <i>Asset History</i> → <i>Export Transaction Records</i> → data type <i>P2P (C2C)</i>.")}</li>
    <li><b>Futures (${bi("để có giá trị từng lệnh", "for each fill's value")})</b>: ${bi("Lệnh (Orders) → <i>Lệnh Futures</i> → USDⓈ-M → <i>Lịch sử giao dịch</i> (Trade History) → Xuất; giao dịch cũ hơn 3 tháng: chọn <i>Hơn 3 tháng – Tuỳ chỉnh</i>. Lệnh của bot trên Binance thật đã tự có trong sổ; file này bổ sung lệnh anh tự vào.", "Orders → <i>Futures Orders</i> → USDⓈ-M → <i>Trade History</i> → Export; older than 3 months: pick <i>Beyond 3 months – Custom</i>. Bot trades on live Binance are already included; this adds your manual trades.")}</li>
    <li>${bi("Tuỳ chọn – Khớp lệnh spot (Lệnh → <i>Lệnh Spot</i> → <i>Lịch sử giao dịch</i> → Xuất; trang này chỉ hiện 6 tháng gần nhất, cũ hơn thì đã có trong lịch sử tổng ở bước 1) và Lịch sử Convert (Lệnh → <i>Lịch sử chuyển đổi</i> → Xuất): chính xác hơn lịch sử tổng; có thì sổ tự ưu tiên và bỏ dòng trùng.", "Optional – Spot trade history (Orders → <i>Spot Orders</i> → <i>Trade History</i> → Export; shows the last 6 months only – older trades are in step 1's history) and Convert history (Orders → <i>Convert History</i> → Export): more precise than the transaction history; the journal prefers them and drops duplicates.")}</li>
    <li>${bi("Tuỳ chọn – <b>Lịch sử nạp</b> và <b>Lịch sử rút</b> (cùng chỗ <i>Xuất bản ghi giao dịch</i> → loại dữ liệu <i>Deposit History</i> / <i>Withdraw History</i>): thêm mạng, địa chỉ ví, TXID, phí rút cho từng lần nạp / rút – để chứng minh tiền chỉ chuyển giữa các ví của anh (không phải bán). Sổ tự gộp với dòng nạp / rút trong lịch sử tổng, bỏ lệnh rút bị huỷ; nộp kèm không bị đếm 2 lần.", "Optional – <b>Deposit History</b> and <b>Withdraw History</b> (same <i>Export Transaction Records</i> → data type): adds network, wallet address, TXID and withdrawal fee to each deposit / withdrawal – evidence that funds only moved between your own wallets (not sold). The journal merges them with the transaction-history rows and skips cancelled withdrawals; never double-counted.")}</li></ol>
    <p class="tx-note">${bi("Lưu ý từ Binance: mỗi tháng chỉ được tạo một số lượt báo cáo, link tải hết hạn sau 7 ngày, báo cáo quá lớn (hơn ~50.000 dòng) có thể lỗi – chia nhỏ khoảng thời gian. Tải về rồi nhập thẳng, <b>đừng mở bằng Excel rồi lưu lại</b> (Excel đổi ngày giờ / số). Trên điện thoại: tạo báo cáo trên máy tính dễ hơn.", "Binance notes: monthly report quota is limited, download links expire after 7 days, very large reports (over ~50,000 rows) may fail – split the period. Import the downloaded file as-is, <b>don't open and re-save it in Excel</b> (Excel alters dates / numbers). On a phone: generating reports on a computer is easier.")}</p>
    <p class="tx-note">${bi("Chọn được nhiều file một lúc (CSV, XLSX hoặc ZIP). Sổ tự nhận ra loại file, nhập lại file cũ không bị đếm 2 lần. Tên mục trên Binance có thể khác một chút theo phiên bản (hướng dẫn cập nhật theo giao diện 11/2026) – file nào không nhận ra, sổ sẽ báo tên các cột để em bổ sung.", "Pick several files at once (CSV, XLSX or ZIP). The journal detects each file type; re-importing never double-counts. Binance menu names may differ slightly by version (guide matches the Nov 2026 interface) – unrecognized files show their columns so support can be added.")}</p></details>`;
  const add = `<details class="tx-how" id="txAddD"><summary>✍️ ${bi("Nhập tay một giao dịch", "Add a transaction manually")}</summary><div class="tx-add">
    <label>${bi("Ngày giờ (giờ VN)", "Date & time (VN)")}<input id="txaT" type="datetime-local" step="1"></label>
    <label>${bi("Loại", "Type")}<select id="txaC">${["spot", "p2p", "conv", "fut", "dep", "wd", "earn", "other"].map((k) => `<option value="${k}">${TXC[k][1]}</option>`).join("")}</select></label>
    <label>${bi("Bên", "Side")}<select id="txaS"><option value="sell">${TXS.sell}</option><option value="buy">${TXS.buy}</option><option value="swap">${TXS.swap}</option><option value="in">${TXS.in}</option><option value="out">${TXS.out}</option></select></label>
    <label>Coin<input id="txaB" placeholder="BTC"></label><label>${bi("Đổi lấy / trả bằng", "Against")}<input id="txaQ" placeholder="USDT / VND"></label>
    <label>${bi("Số lượng", "Quantity")}<input id="txaN" type="number" inputmode="decimal" step="any"></label><label>${bi("Giá (USD)", "Price (USD)")}<input id="txaP" type="number" inputmode="decimal" step="any"></label>
    <label>${bi("Giá trị VND (nếu biết)", "VND value (if known)")}<input id="txaV" type="number" inputmode="decimal" step="any"></label><label class="w">${bi("Ghi chú / mã lệnh", "Note / order id")}<input id="txaR"></label>
    <button type="button" class="btn primary" id="txaGo">➕ ${bi("Thêm vào sổ", "Add to journal")}</button></div></details>`;
  const legal = `<details class="tx-how"><summary>⚖️ ${bi("Căn cứ & cách hiểu đang dùng", "Legal basis & interpretation used")}</summary><ul>
    <li>${bi("Luật Thuế TNCN sửa đổi (hiệu lực 01/7/2026): thu nhập từ chuyển nhượng tài sản số chịu thuế 0,1%.", "Amended PIT Law (effective 01/07/2026): income from transferring digital assets taxed at 0.1%.")}</li>
    <li>${bi("Thông tư 32/2026/TT-BTC (hiệu lực 27/3/2026): cá nhân cư trú & không cư trú nộp 0,1% trên giá chuyển nhượng từng lần qua tổ chức cung cấp dịch vụ theo Nghị quyết 05/2025; không phân biệt lời/lỗ; không quyết toán năm.", "Circular 32/2026/TT-BTC (effective 27/03/2026): residents & non-residents pay 0.1% of each transfer price via providers under Resolution 05/2025; regardless of profit/loss; no annual finalization.")}</li>
    <li>${bi("Thông tư 41/2026/TT-BTC (06/4/2026): sàn được cấp phép khấu trừ khi khớp lệnh, nộp hằng tháng. Đến 23/10/2026 chưa có sàn nào được cấp phép; giao dịch trên sàn nước ngoài chưa có hướng dẫn tự khai.", "Circular 41/2026/TT-BTC (06/04/2026): licensed platforms withhold at execution, file monthly. As of 23/10/2026 no platform was licensed; no self-declaration guidance for foreign platforms.")}</li>
    <li>${bi("Nghị định 284/2026/NĐ-CP (01/9/2026): phạt giao dịch ngoài sàn được cấp phép, chỉ sau 6 tháng kể từ khi có sàn đầu tiên được cấp phép.", "Decree 284/2026/ND-CP (01/09/2026): fines for trading outside licensed platforms, only 6 months after the first license.")}</li>
    <li>${bi("Sổ này là bảng tính chuẩn bị, không phải tờ khai và không phải tư vấn thuế – nên nhờ tư vấn thuế xác nhận cách hiểu trước khi nộp.", "This is a preparation worksheet, not a tax return or tax advice – have a tax adviser confirm the interpretation before filing.")}</li></ul></details>`;
  app().innerHTML = `<div class="ph"><h1>🧾 ${bi("Sổ thuế TNCN · tài sản mã hoá", "PIT journal · crypto assets")}</h1><span class="meta">${bi("0,1% giá chuyển nhượng từng lần · lưu riêng trong tài khoản · chuẩn bị hồ sơ khi cơ quan thuế yêu cầu", "0.1% of each transfer price · private to your account · documents ready if the tax office asks")}</span></div>
    <div class="txp">
    ${txYearPanel(C)}
    ${panel(bi("Ước tính thuế theo kịch bản", "Tax estimate by scenario"), kpi + matrix, `<button type="button" class="btn sm" id="txXls">⬇️ Excel</button> <button type="button" class="btn sm" id="txPrint">🖨️ PDF</button> <button type="button" class="btn sm" id="txJson">💾 JSON</button>`)}
    ${panel(bi("Nhập dữ liệu", "Import data"), `<div class="tx-drop" id="txDrop"><input type="file" id="txFile" multiple accept=".csv,.xlsx,.xls,.zip,.txt"><p>📂 <b>${bi("Chọn hoặc kéo thả file xuất từ Binance", "Choose or drop files exported from Binance")}</b><br><small>${bi("CSV · XLSX · ZIP – lịch sử tổng, P2P, futures, spot, convert", "CSV · XLSX · ZIP – transaction history, P2P, futures, spot, convert")}</small></p></div><div id="txProg" class="tx-prog" aria-live="polite">${TAX.progHtml || ""}</div><div id="txLog" class="tx-log" aria-live="polite"></div>${how}${add}
      <p class="tx-note">🤖 ${bi(`Lệnh bot trên Binance thật tự vào sổ: ${TAX.bot.length} lần khớp futures (mở & đóng).`, `Bot trades on live Binance are added automatically: ${TAX.bot.length} futures fills (open & close).`)}</p>`)}
    ${txPrivPanel()}
    ${panel(bi("Tổng hợp theo tháng", "Monthly summary"), mon)}
    ${panel(bi("Sổ chi tiết từng giao dịch", "Detailed ledger"), filt + tbl, `${txV(F.length)} ${bi("dòng", "rows")}`)}
    ${panel(bi("Nguồn dữ liệu, tỷ giá & đối chiếu", "Sources, rates & reconciliation"), files + fxSet + recon + `<h3 class="tx-h3">${bi("Ghi chú của anh", "Your notes")}</h3><textarea id="txNote" rows="3" style="width:100%" placeholder="${bi("vd: đã hỏi tư vấn thuế ngày…, số tiền đã để riêng…", "e.g. asked a tax adviser on…, amount set aside…")}">${esc(B.set.note || "")}</textarea><div class="bsave"><button type="button" class="btn" id="txNoteSave">💾 ${bi("Lưu ghi chú", "Save note")}</button>${B.rows.length ? ` <button type="button" class="btn sm danger" id="txWipe">${bi("Xoá toàn bộ sổ", "Delete the whole journal")}</button>` : ""}</div>`)}
    ${panel(bi("Căn cứ pháp lý", "Legal basis"), legal)}
    </div>`;
  txWire(F);
}
function txWire() {
  const U = window.__TX, B = TAX.book, log = (m) => { const el = $("#txLog"); if (el) el.textContent = m; };
  const go = async (files) => {
    files = [...(files || [])]; if (!files.length) return;
    if (TAX.busy) { (TAX.queue ||= []).push(...files); toast(`📥 ${bi(`Đã nhận thêm ${files.length} file – xử lý ngay sau file đang chạy`, `Got ${files.length} more file(s) – queued after the current one`)}`); return; }      // đang xử lý → xếp hàng, không bỏ file
    TAX.busy = true; const pg = txProg(files); toast(`📥 ${bi(`Đã nhận ${files.length} file (${txSize(files.reduce((a, f) => a + f.size, 0))}) – đang xử lý, xem tiến độ ở mục Nhập dữ liệu`, `Received ${files.length} file(s) (${txSize(files.reduce((a, f) => a + f.size, 0))}) – processing, see progress under Import data`)}`);
    try {
      const rep = await txImport(files, log, pg); TAX.hist = null; pg.stage("hist", 0, bi("Dựng lịch sử tài khoản…", "Rebuilding account history…")); log(bi("Dựng lịch sử tài khoản…", "Rebuilding account history…")); try { await txHist(true); } catch (e) { /* lịch sử chỉ là phần phụ */ }
      pg.stage("save", 0, bi("Đang lưu sổ…", "Saving…")); const ok = await txSave((a, b) => { log(`${bi("Đang lưu sổ", "Saving")} ${a}/${b}…`); pg.stage("save", a / b, `${bi("Đang lưu sổ", "Saving")} ${a}/${b}`); });
      pg.done(ok); txDraw(); const el2 = $("#txLog");
      if (el2) el2.innerHTML = rep.map((r) => r.err ? `⚠️ <b>${esc(r.name)}</b>: ${esc(r.err)}${r.cols ? `<br><small>${bi("Các cột", "Columns")}: ${esc(r.cols)}</small>` : ""}` : `✅ <b>${esc(r.name)}</b> – ${TXSRC[r.kind] || r.kind}: ${r.same ? bi("file này đã nhập rồi – bỏ qua", "already imported – skipped") : `${r.n} ${bi("dòng mới", "new rows")}`}${r.dup ? `, ${r.dup} ${bi("dòng trùng bỏ qua", "duplicates skipped")}` : ""}`).join("<br>") + (ok ? "" : `<br>⚠️ ${bi("Chưa lưu được lên tài khoản – thử lại", "Couldn't save to your account – try again")}`);
      toast(ok ? `✅ ${bi(`Xong ${files.length} file – sổ đã cập nhật`, `Done – ${files.length} file(s) imported`)}` : `⚠️ ${bi("Đã đọc file nhưng chưa lưu được – thử lại", "Read the files but couldn't save – try again")}`);
    } catch (e) { log("⚠️ " + e.message); pg.fail(e.message); } finally { TAX.busy = false; if (TAX.queue?.length) { const q = TAX.queue; TAX.queue = []; setTimeout(() => go(q), 300); } }
  };
  $("#txFile").onchange = (e) => { go(e.target.files); e.target.value = ""; };      // xoá chọn → chọn lại đúng file đó vẫn nhận
  $("#txProg").onclick = (e) => { if (e.target.closest("[data-txpx]")) { TAX.progHtml = ""; $("#txProg").innerHTML = ""; } };
  const dz = $("#txDrop"); dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("on"); }; dz.ondragleave = () => dz.classList.remove("on"); dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove("on"); go(e.dataTransfer.files); };
  $$("[data-txmon]").forEach((b) => (b.onclick = () => { U.mon = b.dataset.txmon; txDraw(); }));
  $("#txLkF") && ($("#txLkF").onsubmit = async (e) => { e.preventDefault(); const p1 = $("#txLkP").value, p2 = $("#txLkP2").value, m = $("#txLkM"); if (p1 !== p2) { m.textContent = "⚠️ " + bi("Hai lần nhập không khớp.", "The passwords don't match."); return; } if (p1.length < 10) { m.textContent = "⚠️ " + bi("Mật khẩu cần ≥ 10 ký tự.", "Use at least 10 characters."); return; }
    if (!confirm(bi("Quên mật khẩu này là KHÔNG mở lại được sổ. Đã ghi nhớ / lưu mật khẩu ở nơi an toàn?", "If you forget this password the ledger CANNOT be opened again. Saved it somewhere safe?"))) return;
    m.textContent = bi("Đang mã hoá & lưu…", "Encrypting & saving…"); const ok = await txLockOn(p1); m.textContent = ""; toast(ok ? bi("🔒 Đã khoá sổ – máy chủ chỉ giữ dữ liệu mã hoá", "🔒 Ledger locked – the server only holds encrypted data") : bi("⚠️ Chưa lưu được – thử lại", "⚠️ Couldn't save – try again")); const y = scrollY; txDraw(); scrollTo(0, y); });
  $("#txLkForget") && ($("#txLkForget").onclick = () => { TAX.key = null; TAX.book = null; TAX.hist = null; try { sessionStorage.removeItem("mybit_txk"); } catch (e) { /* bỏ qua */ } viewTax(); });
  $("#txLkOff") && ($("#txLkOff").onclick = async () => { if (!confirm(bi("Bỏ khoá: sổ sẽ lưu lại ở dạng đọc được trên máy chủ. Tiếp tục?", "Remove lock: the ledger will be stored readable on the server. Continue?"))) return; const ok = await txLockOff(); toast(ok ? bi("🔓 Đã bỏ khoá", "🔓 Lock removed") : bi("⚠️ Chưa lưu được – thử lại", "⚠️ Couldn't save – try again")); const y = scrollY; txDraw(); scrollTo(0, y); });
  $$("[data-txyr]").forEach((b) => (b.onclick = () => { U.yr = b.dataset.txyr; if (U.yr !== "all") { U.mon = U.yr; U.y = U.yr; } const y = scrollY; txDraw(); scrollTo(0, y); }));      // chọn năm → thẻ tổng, bảng tháng và sổ chi tiết cùng lọc theo năm đó
  const keep = (fn) => { const y = scrollY; fn(); txDraw(); scrollTo(0, y); };
  $("#txY").onchange = (e) => keep(() => { U.y = e.target.value; U.lim = TAX.lim; });
  $("#txC").onchange = (e) => keep(() => { U.cat = e.target.value; U.lim = TAX.lim; });
  $("#txOnly").onchange = (e) => keep(() => { U.only = e.target.checked; });
  let qt; $("#txQ").oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { keep(() => { U.q = e.target.value; }); const q = $("#txQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 300); };
  $("#txMore") && ($("#txMore").onclick = () => keep(() => { U.lim += 500; }));
  $$("[data-txdel]").forEach((b) => (b.onclick = async () => { if (!confirm(bi("Xoá dòng này khỏi sổ?", "Delete this row?"))) return; B.rows = B.rows.filter((a) => a[0] !== b.dataset.txdel); await txSave(); keep(() => {}); }));
  $("#txSetSave").onclick = async () => { B.set.fxMode = $("#txFxM").value; B.set.fxFix = +$("#txFxF").value || null; const lv = +$("#txLev").value; if (lv >= 1) { B.set.lev = lv; B.set.levSet = 1; } if (await txSave()) toast(bi("Đã lưu thiết lập sổ thuế", "Saved")); keep(() => {}); };
  $("#txNoteSave").onclick = async () => { B.set.note = $("#txNote").value; if (await txSave()) toast(bi("Đã lưu ghi chú", "Note saved")); };
  $("#txWipe") && ($("#txWipe").onclick = async () => { if (prompt(bi('Xoá TOÀN BỘ sổ thuế (không lấy lại được)? Gõ XOA để xác nhận', 'Delete the WHOLE journal (cannot be undone)? Type XOA to confirm')) !== "XOA") return; B.rows = []; B.files = []; await txSave(); txDraw(); });
  $("#txaGo").onclick = async () => {
    const tv = $("#txaT").value, t = tv ? Date.parse(tv + (tv.length === 16 ? ":00" : "") + "Z") - 7 * 3600e3 : NaN, base = $("#txaB").value.trim().toUpperCase(), qty = +$("#txaN").value;
    if (!isNum(t) || !base || !(qty > 0)) { toast(bi("Cần ngày giờ, coin và số lượng", "Date, coin and quantity are required")); return; }
    const px = +$("#txaP").value || null, vndv = +$("#txaV").value || null, quote = $("#txaQ").value.trim().toUpperCase() || (vndv ? "VND" : "USDT");
    const r = { t, src: "man", cat: $("#txaC").value, side: $("#txaS").value, base, quote, qty, px, usd: px ? px * qty : txIsSt(base) ? qty : null, vnd: vndv, ref: $("#txaR").value.trim() || bi("nhập tay", "manual") };
    r.id = "m" + txH(`${t}|${base}|${qty}|${Math.random()}`);
    await txFill([r]); B.rows.push(txA(r)); if (await txSave()) toast(bi("Đã thêm vào sổ", "Added")); keep(() => {});
  };
  $("#txXls").onclick = () => txExport("xlsx").catch((e) => toast("⚠️ " + e.message));
  $("#txJson").onclick = () => txExport("json");
  $("#txPrint").onclick = () => { document.body.classList.add("tx-print"); $$(".txp details").forEach((d) => (d.open = true)); setTimeout(() => { print(); document.body.classList.remove("tx-print"); }, 60); };
}
// ---------------------------------------------------------------- xuất hồ sơ: Excel nhiều trang + dấu kiểm SHA-256
async function txSha(s) { try { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); } catch (e) { return ""; } }
async function txExport(kind) {
  const B = TAX.book, R = txRows().filter((r) => !r.dup).sort((a, b) => a.t - b.t), C = R.map((r) => ({ r, c: txCalc(r) })), stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const det = C.map(({ r, c }) => ({ [bi("Thời gian (giờ VN)", "Time (VN)")]: txTime(r.t), [bi("Ngày", "Date")]: c.d, [bi("Loại", "Type")]: (TXC[r.cat] || TXC.other)[1], [bi("Bên", "Side")]: TXS[r.side] || r.side, Coin: r.base, [bi("Đối ứng", "Against")]: r.quote, [bi("Số lượng", "Qty")]: r.qty, [bi("Giá", "Price")]: r.px, [bi("Giá trị USD", "Value USD")]: r.usd, [bi("Tỷ giá USD/VND", "USD/VND")]: isNum(r.vnd) ? null : c.fx.v, [bi("Nguồn tỷ giá", "Rate source")]: isNum(r.vnd) ? "P2P" : c.fx.s, [bi("Giá chuyển nhượng VND", "Transfer value VND")]: isNum(c.vnd) ? Math.round(c.vnd) : null, [bi("Thuế hẹp 0,1%", "Narrow 0.1%")]: Math.round(c.n), [bi("Thuế rộng 0,1%", "Broad 0.1%")]: Math.round(c.b), "Futures F1": Math.round(c.f1), "Futures F2": Math.round(c.f2), [bi("Phí", "Fee")]: r.fee, [bi("Coin phí", "Fee coin")]: r.feeC, [bi("Lời/lỗ (futures)", "P/L (futures)")]: r.pnl, [bi("Nguồn dữ liệu", "Data source")]: TXSRC[r.src] || r.src, [bi("Tham chiếu", "Reference")]: r.ref, [bi("Ghi chú", "Note")]: r.note }));
  const hash = await txSha(JSON.stringify(det));
  if (kind === "json") { const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), sha256: hash, book: { ...B, used: undefined } })], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `so-thue-tncn-${stamp}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return; }
  await txCdn("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => window.XLSX);
  const X = window.XLSX, wb = X.utils.book_new(), sum = (from, k) => Math.round(C.filter((x) => x.c.d >= from).reduce((a, x) => a + x.c[k], 0));
  const S = [[bi("SỔ THUẾ TNCN – TÀI SẢN MÃ HOÁ (bảng tính chuẩn bị, không phải tờ khai)", "PIT JOURNAL – CRYPTO ASSETS (preparation worksheet, not a return)")], [bi("Xuất lúc (giờ VN)", "Exported (VN time)"), txTime(Date.now())], [bi("Số dòng", "Rows"), C.length], ["SHA-256 (" + bi("sổ chi tiết", "detail sheet") + ")", hash], [], [bi("Tính từ", "From"), bi("Spot/Convert/P2P – hẹp", "Spot/Convert/P2P – narrow"), bi("– rộng", "– broad"), "Futures F0", "Futures F1", "Futures F2"],
    ["27/03/2026", sum(TAX.A, "n"), sum(TAX.A, "b"), 0, sum(TAX.A, "f1"), sum(TAX.A, "f2")], ["01/07/2026", sum(TAX.B, "n"), sum(TAX.B, "b"), 0, sum(TAX.B, "f1"), sum(TAX.B, "f2")], [],
    [bi("Hẹp: chỉ lần bán coin lấy stablecoin/VND, đổi coin↔coin và P2P bán USDT. Rộng: mọi lần đem một tài sản mã hoá đi (kể cả dùng USDT mua coin) và P2P bán USDT.", "Narrow: only sales of coins for stablecoins/VND, coin↔coin swaps and P2P USDT sales. Broad: every disposal of any crypto asset (incl. spending USDT on coins) and P2P USDT sales.")],
    [bi(`Futures: F0 không tính; F1 = 0,1% × giá trị lệnh ÷ đòn bẩy x${B.set.lev} (tham khảo cách tính phái sinh chứng khoán); F2 = 0,1% × toàn bộ giá trị lệnh; mỗi lần khớp mở & đóng.`, `Futures: F0 none; F1 = 0.1% × value ÷ leverage x${B.set.lev} (by analogy with securities derivatives); F2 = 0.1% × full value; each opening & closing fill.`)],
    [bi("Căn cứ: Luật Thuế TNCN sửa đổi (01/7/2026); TT 32/2026/TT-BTC (27/3/2026); TT 41/2026/TT-BTC (06/4/2026); NĐ 284/2026/NĐ-CP (01/9/2026).", "Basis: amended PIT Law (01/07/2026); Circular 32/2026/TT-BTC (27/03/2026); Circular 41/2026/TT-BTC (06/04/2026); Decree 284/2026/ND-CP (01/09/2026).")], [bi("Ghi chú", "Notes"), B.set.note || ""]];
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(S), bi("Tong hop", "Summary"));
  const M = {}; for (const { c } of C) { const k = c.d.slice(0, 7), g = (M[k] ||= [k, 0, 0, 0, 0, 0, 0]), on = c.d >= TAX.A; g[1]++; if (c.tn) g[2] += c.vnd || 0; if (on) { g[3] += c.n; g[4] += c.b; g[5] += c.f1; g[6] += c.f2; } }
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([[bi("Tháng", "Month"), bi("Số dòng", "Rows"), bi("Giá trị bán (hẹp) VND", "Sales value (narrow) VND"), bi("Thuế hẹp", "Narrow tax"), bi("Thuế rộng", "Broad tax"), "F1", "F2"], ...Object.values(M).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((g) => g.map((v, i) => (i > 1 ? Math.round(v) : v)))]), bi("Theo thang", "Monthly"));
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(det), bi("So chi tiet", "Ledger"));
  const days = [...new Set(C.map((x) => x.c.d))].sort();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([[bi("Ngày", "Date"), bi("Tỷ giá dùng", "Rate used"), bi("Nguồn", "Source"), bi("Tỷ giá thị trường", "Market rate"), bi("Giá P2P bình quân của anh", "Your avg P2P price")], ...days.map((d) => { const f = txRate(d); return [d, f.v, f.s, B.fx[d] ?? null, TAX.p2pFx?.[d] ?? null]; })]), bi("Ty gia", "Rates"));
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([[bi("File", "File"), bi("Loại", "Type"), bi("Dòng mới", "New rows"), bi("Trùng", "Duplicates"), bi("Từ", "From"), bi("Đến", "To"), bi("Nhập lúc", "Imported")], ...B.files.map((f) => [f.name, TXSRC[f.kind] || f.kind, f.n, f.dup, f.from ? txTime(f.from) : "", f.to ? txTime(f.to) : "", f.at]), [], [bi("Lệnh bot (tự động, từ sổ máy chủ riêng)", "Bot trades (auto, from own-server ledger)"), "", TAX.bot.length]]), bi("Nguon du lieu", "Sources"));
  X.writeFile(wb, `so-thue-tncn-${stamp}.xlsx`);
  toast(bi(`Đã xuất Excel · SHA-256 ${hash.slice(0, 12)}…`, `Excel exported · SHA-256 ${hash.slice(0, 12)}…`));
}
