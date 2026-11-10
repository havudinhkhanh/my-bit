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
  KEYS: ["taxbook", "taxbook1", "taxbook2", "taxbook3", "taxbook4", "taxbook5"], A: "2026-03-27", B: "2026-07-01", RATE: 0.001,
  STB: new Set(["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "DAI", "USDP", "USD1", "USDE", "PYUSD", "XUSD"]),
  QUOTES: ["FDUSD", "USDT", "USDC", "BUSD", "TUSD", "DAI", "BTC", "ETH", "BNB", "TRY", "EUR", "BRL", "JPY", "TRX", "XRP", "DOGE", "SOL", "USD1"],
  F: ["id", "t", "src", "cat", "side", "base", "quote", "qty", "px", "usd", "vnd", "fee", "feeC", "pnl", "ref", "note"],
  book: null, busy: false, lim: 200,
};
const TXC = { spot: ["🔁", bi("Mua/bán spot", "Spot trade")], conv: ["⚡", "Convert"], p2p: ["🇻🇳", bi("P2P (VND)", "P2P (VND)")], fut: ["📈", "Futures"], fpl: ["🧾", bi("Lời/lỗ, phí, funding futures", "Futures P/L, fees, funding")], dep: ["⬇️", bi("Nạp", "Deposit")], wd: ["⬆️", bi("Rút", "Withdraw")], earn: ["🎁", bi("Thu nhập khác (lãi, airdrop, hoa hồng)", "Other income (interest, airdrop, referral)")], xfer: ["↔️", bi("Chuyển ví nội bộ", "Internal transfer")], other: ["•", bi("Khác", "Other")] };
const TXS = { buy: bi("Mua", "Buy"), sell: bi("Bán", "Sell"), swap: bi("Đổi", "Swap"), in: bi("Vào", "In"), out: bi("Ra", "Out") };
const TXSRC = { ledger: bi("Lịch sử giao dịch tổng", "Transaction history"), spot: bi("Khớp lệnh spot", "Spot trade history"), p2p: "P2P", fut: bi("Khớp lệnh futures", "Futures trade history"), conv: bi("Lịch sử convert", "Convert history"), bot: bi("Bot (tự động)", "Bot (auto)"), man: bi("Nhập tay", "Manual") };
const txDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
const txTime = (t) => { const d = new Date(t + 7 * 3600e3).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 19)}`; };
const txV = (v, d = 0) => (isNum(v) ? new Intl.NumberFormat(LOC, { maximumFractionDigits: d, minimumFractionDigits: d }).format(v) : "—");
const txQ = (v) => (isNum(v) ? new Intl.NumberFormat(LOC, { maximumSignificantDigits: 8 }).format(v) : "—");
const txH = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); };
const txO = (a) => Object.fromEntries(TAX.F.map((k, i) => [k, a[i] ?? null]));
const txA = (o) => TAX.F.map((k) => (o[k] === undefined ? null : o[k]));
const txIsSt = (c) => TAX.STB.has(String(c || "").toUpperCase());

// ---------------------------------------------------------------- lưu / tải (chia nhiều khoá vì mỗi khoá ≤ 400 KB)
async function txLoad() {
  const R = await Promise.all(TAX.KEYS.map((k) => Store.get(k).catch(() => ({ data: null }))));
  const m = R[0].data || {}, rows = R.flatMap((r) => r.data?.rows || []);
  TAX.book = { v: 1, fx: m.fx || {}, px: m.px || {}, files: m.files || [], set: { lev: 2, fxMode: "mkt", fxFix: null, note: "", ...(m.set || {}) }, fxo: m.fxo || {}, rows, used: R.map((r) => (r.data?.rows || []).length) };
  return TAX.book;
}
async function txSave() {
  const B = TAX.book, meta = { v: 1, fx: B.fx, px: B.px, files: B.files, set: B.set, fxo: B.fxo, at: new Date().toISOString() };
  const lim = 330000, parts = [[]]; let n = JSON.stringify(meta).length + 50;
  for (const r of B.rows) { const s = JSON.stringify(r).length + 1; if (n + s > lim) { parts.push([]); n = 50; } parts[parts.length - 1].push(r); n += s; }
  if (parts.length > TAX.KEYS.length) { toast(bi("⚠️ Sổ quá lớn để lưu hết – xuất Excel/JSON để giữ bản đầy đủ", "⚠️ Book too large to save fully – export Excel/JSON")); parts.length = TAX.KEYS.length; }
  let ok = true;
  for (let i = 0; i < TAX.KEYS.length; i++) {
    const rows = parts[i] || [];
    if (!rows.length && i > 0 && !(B.used?.[i] > 0)) continue;
    ok = (await Store.put(TAX.KEYS[i], i === 0 ? { ...meta, rows } : { rows })) && ok;
  }
  B.used = TAX.KEYS.map((_, i) => (parts[i] || []).length);
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
function txT(s, utc = true) {
  s = String(s || "").trim(); if (!s) return NaN;
  if (/^\d{12,13}$/.test(s)) return +s;
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
    if (/futures|coin-m|usd.?-?m/i.test(acc) || /realized profit|funding fee|insurance|liquidation/.test(o)) { if (/transfer/.test(o)) { out.push({ ...base, cat: "xfer", side: x < 0 ? "out" : "in", base: c, qty: Math.abs(x), usd: txIsSt(c) ? Math.abs(x) : null }); continue; } out.push({ ...base, cat: "fpl", side: x < 0 ? "out" : "in", base: c, qty: x, pnl: txIsSt(c) ? x : null, usd: null }); continue; }
    if (/^(deposit|fiat deposit|crypto deposit)/.test(o)) { out.push({ ...base, cat: "dep", side: "in", base: c, qty: Math.abs(x), usd: txIsSt(c) ? Math.abs(x) : null }); continue; }
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
const TXPARSE = { ledger: txFromLedger, spot: txFromSpot, fut: txFromFut, p2p: txFromP2p, conv: txFromConv };

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
  for (const r of all) if (r.src !== "ledger" && r.src !== "bot" && r.src !== "man") { const g = (rng[r.cat] ||= [Infinity, -Infinity]); g[0] = Math.min(g[0], r.t); g[1] = Math.max(g[1], r.t); }
  const inR = (r) => { const g = rng[r.cat]; return g && r.t >= g[0] - 60e3 && r.t <= g[1] + 60e3; };
  const bot = (TAX.bot || []).filter((r) => !inR(r));
  const rows = [...all.map((r) => ({ ...r, dup: r.src === "ledger" && ["spot", "conv", "p2p"].includes(r.cat) && inR(r) })), ...bot];
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
async function txImport(files, log) {
  const B = TAX.book, have = new Set(B.rows.map((a) => a[0])), rep = [];
  for (const file of files) {
    let sheets; try { sheets = await txSheets(file); } catch (e) { rep.push({ name: file.name, err: e.message }); continue; }
    for (const s of sheets) {
      const fh = txH(s.rows.map((r) => r.join("\u0001")).join("\n"));
      if (B.files.some((f) => f.h === fh)) { rep.push({ name: s.name, kind: B.files.find((f) => f.h === fh).kind, n: 0, dup: 0, same: 1 }); continue; }      // đúng file đã nhập → bỏ qua cả file
      const hi = s.rows.findIndex((r) => txKind(r) && txKind(r) !== "?"), kind = hi >= 0 ? txKind(s.rows[hi]) : "?";
      if (kind === "?") { rep.push({ name: s.name, err: bi("Không nhận ra loại file", "Unrecognized file"), cols: (s.rows[0] || []).slice(0, 12).join(", ") }); continue; }
      const P = TXPARSE[kind](s.rows.slice(hi)), add = [];
      log(`${s.name}: ${P.rows.length} ${bi("dòng", "rows")}…`);
      await txFill(P.rows, log);
      let dup = 0;
      for (const r of P.rows) { r.id = r.id || txH(`${r.src}|${r.cat}|${r.t}|${r.side}|${r.base}|${r.quote}|${(+r.qty).toPrecision(10)}|${r.ref || ""}`); if (have.has(r.id)) { dup++; continue; } have.add(r.id); add.push(txA(r)); }
      B.rows.push(...add);
      const ts = P.rows.map((r) => r.t).filter(isNum);
      B.files.push({ h: fh, name: s.name, kind, n: add.length, dup, at: new Date().toISOString(), from: ts.length ? Math.min(...ts) : null, to: ts.length ? Math.max(...ts) : null, net: P.net || null });
      rep.push({ name: s.name, kind, n: add.length, dup });
    }
  }
  return rep;
}

// ---------------------------------------------------------------- giao diện
async function viewTax() {
  if (!ME || ME.legacy) { app().innerHTML = `<div class="ph"><h1>${bi("Sổ thuế TNCN", "PIT tax journal")}</h1></div><div class="panel"><p class="muted">${bi("Cần đăng nhập để lưu sổ riêng trong tài khoản.", "Sign in to keep a private journal in your account.")}</p></div>`; return; }
  await txLoad(); TAX.bot = await txBotRows();
  const nd = [...new Set(TAX.bot.map((r) => txDay(r.t)))].filter((d) => !isNum(TAX.book.fx[d]));      // tỷ giá cho các ngày bot có lệnh
  txDraw();
  if (nd.length) { await txPool(nd, 6, (d) => txFx(d)); if (nd.some((d) => isNum(TAX.book.fx[d]))) { await txSave(); if (location.hash.startsWith("#/tax")) { const y = scrollY; txDraw(); scrollTo(0, y); } } }
}
function txDraw() {
  const B = TAX.book, R = txRows(), C = R.map((r) => ({ r, c: txCalc(r) })), U = (window.__TX ||= { y: "all", cat: "all", q: "", only: false, lim: TAX.lim, mon: String(new Date().getUTCFullYear()) });
  const live = C.filter((x) => !x.r.dup), sum = (from, k) => live.filter((x) => x.c.d >= from).reduce((a, x) => a + x.c[k], 0);
  const SA = { n: sum(TAX.A, "n"), b: sum(TAX.A, "b"), f1: sum(TAX.A, "f1"), f2: sum(TAX.A, "f2") }, SB = { n: sum(TAX.B, "n"), b: sum(TAX.B, "b"), f1: sum(TAX.B, "f1"), f2: sum(TAX.B, "f2") };
  const lo = SB.n, hi = SA.b + SA.f2, pre = live.filter((x) => x.c.d < TAX.A && (x.c.tn || x.c.tb || x.c.tf)), miss = live.filter((x) => x.c.miss && x.c.d >= TAX.A);
  const vnd = (v) => `${txV(v)} ₫`;
  const kpi = `<div class="tx-kpi">
    <div><i>${bi("Ước tính thấp nhất", "Lowest estimate")}</i><b>${vnd(lo)}</b><small>${bi("hẹp · không tính futures · từ 01/7/2026", "narrow · no futures · from 01/07/2026")}</small></div>
    <div class="hi"><i>${bi("Ước tính cao nhất", "Highest estimate")}</i><b>${vnd(hi)}</b><small>${bi("rộng · futures theo toàn bộ giá trị · từ 27/3/2026", "broad · futures on full value · from 27/03/2026")}</small></div>
    <div><i>${bi("Nên để riêng", "Set aside")}</i><b>${vnd(Math.ceil(hi / 1000) * 1000)}</b><small>${bi("theo mức cao nhất, phòng khi bị truy thu", "at the highest level, in case of back-tax")}</small></div>
    <div><i>${bi("Giao dịch trong sổ", "Rows in the journal")}</i><b>${txV(live.length)}</b><small>${live.length ? `${txTime(Math.min(...live.map((x) => x.r.t))).slice(0, 10)} → ${txTime(Math.max(...live.map((x) => x.r.t))).slice(0, 10)}` : bi("chưa có – nhập file ở dưới", "none yet – import files below")}</small></div></div>`;
  const mx = (S) => `<td>${vnd(S.n)}</td><td>${vnd(S.b)}</td><td>0 ₫</td><td>${vnd(S.f1)}</td><td>${vnd(S.f2)}</td>`;
  const matrix = `<div class="tx-tw"><table class="tx-t tx-mx"><thead><tr><th rowspan="2">${bi("Tính từ", "From")}</th><th colspan="2">${bi("Spot · Convert · P2P", "Spot · Convert · P2P")}</th><th colspan="3">Futures</th></tr><tr><th>${bi("Hẹp", "Narrow")}</th><th>${bi("Rộng", "Broad")}</th><th>F0</th><th>${bi("F1 · ký quỹ", "F1 · margin")}</th><th>${bi("F2 · toàn bộ", "F2 · full")}</th></tr></thead>
    <tbody><tr><td><b>27/3/2026</b><small>TT 32/2026</small></td>${mx(SA)}</tr><tr><td><b>01/7/2026</b><small>${bi("Luật Thuế TNCN", "PIT Law")}</small></td>${mx(SB)}</tr></tbody></table></div>
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
    <li><b>${bi("Lịch sử giao dịch tổng – quan trọng nhất", "Transaction history – most important")}</b>: ${bi("binance.com (máy tính) → Ví (Wallet) → Tổng quan → <i>Lịch sử giao dịch</i> (Transaction History) → <i>Xuất</i> / <i>Tạo báo cáo</i> → Tài khoản: Tất cả → Khoảng thời gian: tối đa 12 tháng mỗi lần → tải về. Lặp lại cho từng năm từ ngày mở tài khoản. File này có đủ spot, convert, P2P (số USDT), nạp/rút, Earn, futures (lời lỗ, phí, funding).", "binance.com (desktop) → Wallet → Overview → <i>Transaction History</i> → <i>Export</i> / <i>Generate statement</i> → Account: All → up to 12 months per request → download. Repeat per year since account opening. It covers spot, convert, P2P (USDT), deposits/withdrawals, Earn and futures P/L, fees, funding.")}</li>
    <li><b>P2P (${bi("để có đúng số VND", "for exact VND")})</b>: ${bi("P2P → Lệnh (Orders) → Tất cả lệnh → chọn mọi coin, Mua & Bán, mọi trạng thái, khoảng thời gian → Xuất/Tải.", "P2P → Orders → All orders → all coins, Buy & Sell, all statuses, date range → Export/Download.")}</li>
    <li><b>Futures (${bi("để có giá trị từng lệnh", "for each fill's value")})</b>: ${bi("Lệnh (Orders) → Lệnh Futures → <i>Lịch sử giao dịch</i> (Trade History) USDⓈ-M → Xuất. Lệnh của bot trên Binance thật đã tự có trong sổ; file này bổ sung lệnh anh tự vào.", "Orders → Futures Orders → <i>Trade History</i> USDⓈ-M → Export. Bot trades on live Binance are already included; this adds your manual trades.")}</li>
    <li>${bi("Tuỳ chọn – Khớp lệnh spot (Lệnh → Lệnh Spot → Lịch sử giao dịch → Xuất) và Lịch sử Convert: chính xác hơn lịch sử tổng; có thì sổ tự ưu tiên và bỏ dòng trùng.", "Optional – Spot trade history (Orders → Spot Orders → Trade History → Export) and Convert history: more precise than the transaction history; the journal prefers them and drops duplicates.")}</li></ol>
    <p class="tx-note">${bi("Chọn được nhiều file một lúc (CSV, XLSX hoặc ZIP). Sổ tự nhận ra loại file, nhập lại file cũ không bị đếm 2 lần. Tên mục trên Binance có thể khác một chút theo phiên bản – file nào không nhận ra, sổ sẽ báo tên các cột để em bổ sung.", "Pick several files at once (CSV, XLSX or ZIP). The journal detects each file type; re-importing never double-counts. Binance menu names may differ slightly by version – unrecognized files show their columns so support can be added.")}</p></details>`;
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
    ${panel(bi("Ước tính thuế theo kịch bản", "Tax estimate by scenario"), kpi + matrix, `<button type="button" class="btn sm" id="txXls">⬇️ Excel</button> <button type="button" class="btn sm" id="txPrint">🖨️ PDF</button> <button type="button" class="btn sm" id="txJson">💾 JSON</button>`)}
    ${panel(bi("Nhập dữ liệu", "Import data"), `<div class="tx-drop" id="txDrop"><input type="file" id="txFile" multiple accept=".csv,.xlsx,.xls,.zip,.txt"><p>📂 <b>${bi("Chọn hoặc kéo thả file xuất từ Binance", "Choose or drop files exported from Binance")}</b><br><small>${bi("CSV · XLSX · ZIP – lịch sử tổng, P2P, futures, spot, convert", "CSV · XLSX · ZIP – transaction history, P2P, futures, spot, convert")}</small></p></div><div id="txLog" class="tx-log" aria-live="polite"></div>${how}${add}
      <p class="tx-note">🤖 ${bi(`Lệnh bot trên Binance thật tự vào sổ: ${TAX.bot.length} lần khớp futures (mở & đóng).`, `Bot trades on live Binance are added automatically: ${TAX.bot.length} futures fills (open & close).`)}</p>`)}
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
    if (!files?.length || TAX.busy) return; TAX.busy = true; log(bi("Đang đọc file…", "Reading files…"));
    try {
      const rep = await txImport([...files], log), ok = await txSave();
      const el = $("#txLog"); txDraw(); const el2 = $("#txLog");
      if (el2) el2.innerHTML = rep.map((r) => r.err ? `⚠️ <b>${esc(r.name)}</b>: ${esc(r.err)}${r.cols ? `<br><small>${bi("Các cột", "Columns")}: ${esc(r.cols)}</small>` : ""}` : `✅ <b>${esc(r.name)}</b> – ${TXSRC[r.kind] || r.kind}: ${r.same ? bi("file này đã nhập rồi – bỏ qua", "already imported – skipped") : `${r.n} ${bi("dòng mới", "new rows")}`}${r.dup ? `, ${r.dup} ${bi("dòng trùng bỏ qua", "duplicates skipped")}` : ""}`).join("<br>") + (ok ? "" : `<br>⚠️ ${bi("Chưa lưu được lên tài khoản – thử lại", "Couldn't save to your account – try again")}`);
      void el;
    } catch (e) { log("⚠️ " + e.message); } finally { TAX.busy = false; }
  };
  $("#txFile").onchange = (e) => go(e.target.files);
  const dz = $("#txDrop"); dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("on"); }; dz.ondragleave = () => dz.classList.remove("on"); dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove("on"); go(e.dataTransfer.files); };
  $$("[data-txmon]").forEach((b) => (b.onclick = () => { U.mon = b.dataset.txmon; txDraw(); }));
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
