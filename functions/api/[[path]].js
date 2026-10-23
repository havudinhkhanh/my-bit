// Cloudflare Pages Function: API của MyBit.
// Nhiều người dùng (khi đã gắn D1 "DB"): tài khoản, dữ liệu riêng từng người, thông báo, đẩy, quản trị.
// Chế độ cũ (chưa gắn D1): một chủ sở hữu, đăng nhập qua Cloudflare Access, dữ liệu trong Workers KV.
import { admin } from "../_lib/admin.js";
import { auth } from "../_lib/auth.js";
import {
  can, ensureSchema, err, getSession, json, limits, nowIso, sameOrigin, sha256Hex, USER_KEYS, vapidPublic, withCookie,
} from "../_lib/core.js";

// ---------------------------------------------------------------- chế độ cũ (một chủ sở hữu)
const KEYS = new Set(["portfolio", "assumptions", "groups", "profile", "journal", "watchlist", "views", "ui", "peermap"]);
function legacyAuthorized(request, env) {
  const email = (request.headers.get("cf-access-authenticated-user-email") || "").toLowerCase();
  if (!email) return false;
  const owners = String(env.OWNER_EMAIL || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return owners.length === 0 || owners.includes(email);
}
async function ghRun(env) {
  if (!env.GH_TOKEN || !env.GH_REPO) return err("Chưa cài GH_TOKEN / GH_REPO");
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/update.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "my-bit" },
    body: JSON.stringify({ ref: "main" }),
  });
  return json({ ok: r.status === 204, status: r.status }, r.status === 204 ? 200 : 502);
}
async function legacy({ request, env }, key) {
  if (key === "auth") {
    // trang web hỏi "tôi là ai": chế độ cũ = chủ sở hữu, đủ mọi tính năng
    const email = (request.headers.get("cf-access-authenticated-user-email") || "").toLowerCase();
    return json({ legacy: true, me: { id: 0, email, name: "", role: "admin", plan: "pro", eff_plan: "pro", features: ["*"], limits: {} } });
  }
  if (!legacyAuthorized(request, env)) return err("Chưa đăng nhập qua Cloudflare Access", 401);
  if (!env.MYBIT_KV) return err("Chưa gắn Workers KV (MYBIT_KV)", 500);
  if (key === "run" && request.method === "POST") return ghRun(env);
  if (key === "intraday") {
    if (request.method !== "GET") return err("Chỉ đọc", 405);
    const v = await env.MYBIT_KV.get("intraday");
    return json(v ? JSON.parse(v) : { ok: false });
  }
  if (key === "notifications") return json({ items: [], unread: 0, legacy: true });
  if (!KEYS.has(key)) return err("Không có API này", 404);
  if (request.method === "GET") {
    const v = await env.MYBIT_KV.get(key);
    return json(v ? JSON.parse(v) : (key === "portfolio" ? { holdings: [], cash: 0, capital: null } : {}));
  }
  if (request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch (e) { return err("Dữ liệu không hợp lệ"); }
    const text = JSON.stringify(body);
    if (text.length > 200000) return err("Dữ liệu quá lớn", 413);
    await env.MYBIT_KV.put(key, text);
    return json({ ok: true });
  }
  return err("Phương thức không hỗ trợ", 405);
}

// ---------------------------------------------------------------- nhiều người dùng
async function getData(env, uid, key) {
  const r = await env.DB.prepare("SELECT value FROM user_data WHERE user_id = ? AND key = ?").bind(uid, key).first();
  return r ? JSON.parse(r.value) : null;
}
async function putData(env, uid, key, text) {
  await env.DB.prepare("INSERT INTO user_data(user_id, key, value, updated_at) VALUES(?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(uid, key, text, nowIso()).run();
}
function checkLimits(key, body, lim) {
  if (key === "portfolio") {
    const n = (body.holdings || []).filter((h) => h && h.symbol).length;
    if (lim.holdings && n > lim.holdings) return `Gói hiện tại cho tối đa ${lim.holdings} mã trong danh mục`;
  }
  if (key === "watchlist") {
    const it = (body.items || []).filter((x) => x && x.symbol);
    if (lim.watch && it.length > lim.watch) return `Gói hiện tại cho tối đa ${lim.watch} mã theo dõi`;
    const na = it.reduce((s, x) => s + (x.alerts || []).filter((a) => a.active !== false).length, 0);
    if (lim.alerts && na > lim.alerts) return `Gói hiện tại cho tối đa ${lim.alerts} cảnh báo giá đang bật`;
  }
  return null;
}

// ---------------------------------------------------------------- cổng cho bot lướt giây chạy ở MÁY CHỦ RIÊNG (VPS)
// Xác thực bằng khoá riêng anh tạo trên trang (chỉ lưu mã băm SHA-256 trong D1 – khoá thật chỉ nằm trên VPS).
// GET  → thiết lập bot lướt giây của chủ khoá;  POST → ghi trạng thái bot (scalpstate). Không đọc / ghi được gì khác.
async function scalpRunner({ request, env }) {
  const key = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[0-9a-f]{64}$/.test(key)) return err("Thiếu hoặc sai khoá máy chủ riêng", 401);
  const h = await sha256Hex(key);
  const u = await env.DB.prepare("SELECT d.user_id AS id, u.role, u.plan, u.plan_until, u.status FROM user_data d JOIN users u ON u.id = d.user_id WHERE d.key = 'scalpkey' AND json_extract(d.value, '$.h') = ?").bind(h).first();
  if (!u || u.status !== "active") return err("Khoá không hợp lệ hoặc đã bị thay", 401);
  const p = u.plan_until && u.plan_until < nowIso().slice(0, 10) ? "free" : u.plan;
  if (!can({ r: u.role, p }, "bot")) return err("Bot lướt giây dành cho gói Pro", 402);
  if (request.method === "GET") return json({ uid: u.id, cfg: await getData(env, u.id, "scalp") });
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > 1500000) return err("Dữ liệu quá lớn", 413);
    try { JSON.parse(text); } catch (e) { return err("Dữ liệu không hợp lệ"); }
    await putData(env, u.id, "scalpstate", text);
    return json({ ok: true });
  }
  return err("Phương thức không hỗ trợ", 405);
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const parts = Array.isArray(params.path) ? params.path : [params.path];
  const [key, sub] = parts;
  if (!env.DB) return legacy(ctx, key);
  await ensureSchema(env);
  if (key === "scalp-runner") return scalpRunner(ctx);
  if (request.method !== "GET" && !sameOrigin(request)) return err("Sai nguồn gửi", 403);
  if (key === "auth") return auth(ctx, sub);

  const s = await getSession(request, env);
  if (!s) return err("Chưa đăng nhập", 401);
  const ses = s.ses, uid = ses.u, m = request.method;
  const out = async () => {
    if (key === "admin") return admin(ctx, sub, ses);
    if (key === "run" && m === "POST") return ses.r === "admin" ? ghRun(env) : err("Chỉ quản trị viên", 403);

    if (key === "personal" && m === "GET") {
      const [p, l, w] = await Promise.all([getData(env, uid, "_personal"), getData(env, uid, "_live"), getData(env, uid, "_weekly")]);
      return json({ personal: p, live: l, weekly: can(ses, "weekly") ? w : null });
    }
    if (key === "intraday" && m === "GET") {
      if (!can(ses, "live")) return err("Tính năng của gói Pro", 402, { feature: "live" });
      const [v, l] = await Promise.all([env.MYBIT_KV ? env.MYBIT_KV.get("intraday") : null, getData(env, uid, "_live")]);
      const o = v ? JSON.parse(v) : { ok: false };
      o.personal = l && o.date && l.date === o.date ? l.items || [] : [];
      return json(o);
    }
    if (key === "notifications") {
      if (m === "GET") {
        const url = new URL(request.url);
        const before = Number(url.searchParams.get("before") || 0) || 1e15, limit = Math.min(100, Number(url.searchParams.get("limit") || 40));
        const unread = (await env.DB.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(uid).first()).n;
        if (sub === "count") return json({ unread });
        const { results } = await env.DB.prepare("SELECT id, kind, sev, title, body, url, sym, created_at, read_at FROM notifications WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?")
          .bind(uid, before, limit).all();
        return json({ items: results, unread });
      }
      if (m === "POST" && sub === "read") {
        let b = {};
        try { b = await request.json(); } catch (e) { /* rỗng */ }
        if (b.all) await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(nowIso(), uid).run();
        else for (const id of (b.ids || []).slice(0, 200)) await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL").bind(nowIso(), uid, Number(id)).run();
        return json({ ok: true });
      }
      if (m === "DELETE") {
        await env.DB.prepare("DELETE FROM notifications WHERE user_id = ? AND read_at IS NOT NULL").bind(uid).run();
        return json({ ok: true });
      }
    }
    if (key === "push") {
      if (sub === "key" && m === "GET") return json({ key: await vapidPublic(env) });
      let b = {};
      try { b = await request.json(); } catch (e) { /* rỗng */ }
      if (sub === "subscribe" && m === "POST") {
        if (!can(ses, "notify_push")) return err("Thông báo đẩy là tính năng của gói Pro", 402, { feature: "notify_push" });
        const ep = String(b.endpoint || ""), k = b.keys || {};
        if (!/^https:\/\//.test(ep) || !k.p256dh || !k.auth) return err("Đăng ký đẩy không hợp lệ");
        await env.DB.prepare(`INSERT INTO push_subs(user_id, endpoint, p256dh, auth, ua, created_at) VALUES(?, ?, ?, ?, ?, ?)
                              ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, fails = 0`)
          .bind(uid, ep, k.p256dh, k.auth, (request.headers.get("user-agent") || "").slice(0, 200), nowIso()).run();
        return json({ ok: true });
      }
      if (sub === "unsubscribe" && m === "POST") {
        await env.DB.prepare("DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?").bind(uid, String(b.endpoint || "")).run();
        return json({ ok: true });
      }
      if (sub === "list" && m === "GET") {
        const { results } = await env.DB.prepare("SELECT id, ua, created_at, last_ok, fails FROM push_subs WHERE user_id = ?").bind(uid).all();
        return json({ subs: results });
      }
    }
    // cầu nối tới Binance khi trình duyệt không gọi thẳng được: chỉ chuyển tiếp yêu cầu ĐÃ KÝ sẵn từ trình duyệt,
    // không nhận / không lưu Secret Key; chỉ cho các đường dẫn giao dịch & tài khoản cần thiết, chỉ quản trị viên
    if (key === "bx" && m === "POST") {
      if (ses.r !== "admin") return err("Chỉ quản trị viên được dùng cầu nối Binance", 403);
      let b;
      try { b = await request.json(); } catch (e) { return err("Dữ liệu không hợp lệ"); }
      const HOST = { demo: { spot: "https://demo-api.binance.com", fut: "https://demo-fapi.binance.com" }, test: { spot: "https://testnet.binance.vision", fut: "https://testnet.binancefuture.com" },
        live: { spot: "https://api.binance.com", fut: "https://fapi.binance.com" } };
      const base = (HOST[b.env] || {})[b.mkt];
      const okPath = /^\/(api\/v3\/(account|order|openOrders|allOrders|myTrades|orderList\/oco|openOrderList|exchangeInfo|time)|fapi\/v[123]\/(account|balance|positionRisk|order|openOrders|allOrders|leverage|marginType|userTrades|exchangeInfo|time|income))$/;
      if (!base || !okPath.test(String(b.path || "")) || !["GET", "POST", "DELETE"].includes(b.method) || /[\s#]/.test(String(b.qs || ""))) return err("Yêu cầu không được phép", 400);
      const r = await fetch(base + b.path + (b.qs ? "?" + b.qs : ""), { method: b.method, headers: b.key ? { "X-MBX-APIKEY": String(b.key) } : {} });
      return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
    if (!USER_KEYS.has(key)) return err("Không có API này", 404);
    if (m === "GET") {
      const v = await getData(env, uid, key);
      return json(v ?? (key === "portfolio" ? { holdings: [], cash: 0, capital: null } : {}));
    }
    if (m === "PUT") {
      let body;
      try { body = await request.json(); } catch (e) { return err("Dữ liệu không hợp lệ"); }
      const text = JSON.stringify(body);
      if (text.length > 400000) return err("Dữ liệu quá lớn", 413);
      const why = checkLimits(key, body, limits(ses.r, ses.p));
      if (why) return err(why, 402, { limit: true });
      await putData(env, uid, key, text);
      return json({ ok: true });
    }
    return err("Phương thức không hỗ trợ", 405);
  };
  return withCookie(await out(), s.setCookie);
}
