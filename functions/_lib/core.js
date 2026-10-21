// Lõi tài khoản: phiên đăng nhập (cookie ký HMAC), mật khẩu (PBKDF2), D1, gói hội viên, tiện ích chung.
import PLANS from "./plans.json";

export { PLANS };
export const COOKIE = "vs";
const SESSION_DAYS = 30;
const REFRESH_SEC = 600;          // 10 phút: đọc lại người dùng từ D1 để cập nhật gói / khoá tài khoản
const PBKDF2_ITER = 50000;        // vừa giới hạn CPU gói Workers miễn phí (lưu kèm trong chuỗi băm, tăng được sau)

const enc = new TextEncoder();
export const nowIso = () => new Date().toISOString();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
export const err = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);

// ---------------------------------------------------------------- mã hoá
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
export const randHex = (n = 32) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function sha256Hex(s) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function eqBytes(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }

export async function hashPassword(pw, iter = PBKDF2_ITER) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${b64u(salt)}$${b64u(bits)}`;
}
export async function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith("pbkdf2$")) return false;
  const [, it, s, h] = stored.split("$");
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64u(s), iterations: Number(it) }, key, 256);
  return eqBytes(new Uint8Array(bits), unb64u(h));
}

// ---------------------------------------------------------------- D1: bảng & cấu hình
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT, pw TEXT, google_sub TEXT UNIQUE,
     role TEXT NOT NULL DEFAULT 'user', plan TEXT NOT NULL DEFAULT 'free', plan_until TEXT, status TEXT NOT NULL DEFAULT 'active',
     sv INTEGER NOT NULL DEFAULT 1, invite TEXT, note TEXT, created_at TEXT, last_login TEXT, last_seen TEXT)`,
  `CREATE TABLE IF NOT EXISTS user_data(user_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT, PRIMARY KEY(user_id, key))`,
  `CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY, plan TEXT NOT NULL DEFAULT 'free', days INTEGER, max_uses INTEGER NOT NULL DEFAULT 1,
     uses INTEGER NOT NULL DEFAULT 0, expires_at TEXT, note TEXT, created_by INTEGER, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, key TEXT NOT NULL, kind TEXT, sev INTEGER DEFAULT 0,
     title TEXT NOT NULL, body TEXT, url TEXT, sym TEXT, created_at TEXT NOT NULL, read_at TEXT, UNIQUE(user_id, key))`,
  `CREATE INDEX IF NOT EXISTS ix_notif_user ON notifications(user_id, id)`,
  `CREATE TABLE IF NOT EXISTS push_subs(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL,
     auth TEXT NOT NULL, ua TEXT, created_at TEXT, last_ok TEXT, fails INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS resets(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS attempts(k TEXT PRIMARY KEY, n INTEGER NOT NULL, first_at TEXT NOT NULL, until TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, detail TEXT, at TEXT)`,
];
let schemaOk = false;
export async function ensureSchema(env) {
  if (schemaOk) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  schemaOk = true;
}
const cfgCache = { at: 0, v: {} };
export async function getConfig(env, fresh = false) {
  if (!fresh && Date.now() - cfgCache.at < 60000) return cfgCache.v;
  await ensureSchema(env);
  const { results } = await env.DB.prepare("SELECT key, value FROM config").all();
  cfgCache.v = Object.fromEntries(results.map((r) => [r.key, r.value]));
  cfgCache.at = Date.now();
  return cfgCache.v;
}
export async function setConfig(env, key, value) {
  await env.DB.prepare("INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(value)).run();
  cfgCache.at = 0;
}
async function secret(env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const c = await getConfig(env);
  if (c.session_secret) return c.session_secret;
  const s = randHex(32);
  await env.DB.prepare("INSERT OR IGNORE INTO config(key, value) VALUES('session_secret', ?)").bind(s).run();
  return (await getConfig(env, true)).session_secret;
}
export async function audit(env, uid, action, detail) {
  try { await env.DB.prepare("INSERT INTO audit(user_id, action, detail, at) VALUES(?, ?, ?, ?)").bind(uid ?? null, action, detail ? String(detail).slice(0, 500) : null, nowIso()).run(); } catch (e) { /* bỏ qua */ }
}

// ---------------------------------------------------------------- gói & quyền
export function effPlan(u) {
  if (!u) return "free";
  if (u.plan_until && u.plan_until < nowIso().slice(0, 10)) return "free";
  return PLANS.plans[u.plan] ? u.plan : "free";
}
export function features(role, plan) {
  if (role === "admin") return [...new Set(Object.values(PLANS.plans).flatMap((p) => p.features))];
  return (PLANS.plans[plan] || PLANS.plans.free).features;
}
export function limits(role, plan) {
  if (role === "admin") return { holdings: 1000, watch: 1000, alerts: 1000 };
  return (PLANS.plans[plan] || PLANS.plans.free).limits;
}
export const can = (ses, f) => !!ses && (ses.r === "admin" || features(ses.r, ses.p).includes(f));

// ---------------------------------------------------------------- phiên
function parseCookies(h) {
  const o = {};
  (h || "").split(/;\s*/).forEach((kv) => { const i = kv.indexOf("="); if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  return o;
}
async function hmac(env, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(await secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
export async function makeCookie(env, u, url) {
  const t = Math.floor(Date.now() / 1000);
  const payload = b64u(enc.encode(JSON.stringify({ u: u.id, r: u.role, p: effPlan(u), s: u.sv, t, e: t + SESSION_DAYS * 86400 })));
  const v = `${payload}.${await hmac(env, payload)}`;
  const secure = !url || new URL(url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
export function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`; }
export async function getUser(env, id) {
  return await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}
/** Trả về { ses, user?, setCookie? } hoặc null. ses = {u, r, p, s, t, e}. */
export async function getSession(request, env) {
  const raw = parseCookies(request.headers.get("cookie"))[COOKIE];
  if (!raw || !raw.includes(".")) return null;
  const [payload, sig] = raw.split(".");
  if (sig !== await hmac(env, payload)) return null;
  let ses;
  try { ses = JSON.parse(new TextDecoder().decode(unb64u(payload))); } catch (e) { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (!ses.e || ses.e < now) return null;
  if (now - ses.t < REFRESH_SEC) return { ses };
  await ensureSchema(env);
  const u = await getUser(env, ses.u);
  if (!u || u.status !== "active" || u.sv !== ses.s) return null;
  await env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(nowIso(), u.id).run();
  return { ses: { u: u.id, r: u.role, p: effPlan(u), s: u.sv, t: now, e: ses.e }, user: u, setCookie: await makeCookie(env, u, request.url) };
}
export function withCookie(res, cookie) {
  if (!cookie) return res;
  const r = new Response(res.body, res);
  r.headers.append("set-cookie", cookie);
  return r;
}
export function sameOrigin(request) {
  const o = request.headers.get("origin");
  if (!o) return true;          // trình duyệt luôn gửi Origin với fetch POST/PUT; công cụ dòng lệnh thì không – vẫn phải có cookie
  return o === new URL(request.url).origin;
}
export function meOf(u) {
  const plan = effPlan(u);
  return { id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan, plan_until: u.plan_until, eff_plan: plan,
           plan_name: (PLANS.plans[plan] || {}).name, features: features(u.role, plan), limits: limits(u.role, plan),
           has_pw: !!u.pw, google: !!u.google_sub, created_at: u.created_at };
}

// ---------------------------------------------------------------- chặn dò mật khẩu
export async function tooMany(env, k) {
  const r = await env.DB.prepare("SELECT * FROM attempts WHERE k = ?").bind(k).first();
  return !!(r && r.until && r.until > nowIso());
}
export async function failAttempt(env, k, max = 8, minutes = 15) {
  const now = new Date();
  const r = await env.DB.prepare("SELECT * FROM attempts WHERE k = ?").bind(k).first();
  const fresh = !r || (now - new Date(r.first_at)) > minutes * 60000;
  const n = fresh ? 1 : r.n + 1;
  const until = n >= max ? new Date(now.getTime() + minutes * 60000).toISOString() : null;
  await env.DB.prepare("INSERT INTO attempts(k, n, first_at, until) VALUES(?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, first_at = excluded.first_at, until = excluded.until")
    .bind(k, n, fresh ? now.toISOString() : r.first_at, until).run();
}
export async function clearAttempts(env, k) { await env.DB.prepare("DELETE FROM attempts WHERE k = ?").bind(k).run(); }

// ---------------------------------------------------------------- thông báo nội bộ & email
export async function notify(env, uid, key, title, body = "", opts = {}) {
  await env.DB.prepare("INSERT OR IGNORE INTO notifications(user_id, key, kind, sev, title, body, url, sym, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(uid, key, opts.kind || "system", opts.sev ?? 1, title, body, opts.url || null, opts.sym || null, nowIso()).run();
}
export async function notifyAdmins(env, key, title, body = "", opts = {}) {
  const { results } = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all();
  for (const r of results) await notify(env, r.id, key, title, body, { kind: "admin", ...opts });
}
export async function sendMail(env, to, subject, html) {
  const c = await getConfig(env);
  const key = env.RESEND_API_KEY || c.resend_key;
  const from = c.mail_from || env.MAIL_FROM;
  if (!key || !from) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return r.ok;
}

// ---------------------------------------------------------------- Google: xác thực ID token (Google Identity Services)
let jwks = { at: 0, keys: [] };
export async function verifyGoogle(token, clientId) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) throw new Error("token");
  const head = JSON.parse(new TextDecoder().decode(unb64u(h)));
  const body = JSON.parse(new TextDecoder().decode(unb64u(p)));
  if (Date.now() - jwks.at > 3600000 || !jwks.keys.find((k) => k.kid === head.kid)) {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    jwks = { at: Date.now(), keys: (await r.json()).keys || [] };
  }
  const jwk = jwks.keys.find((k) => k.kid === head.kid);
  if (!jwk) throw new Error("kid");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64u(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error("sig");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(body.iss)) throw new Error("iss");
  if (body.aud !== clientId) throw new Error("aud");
  if (body.exp * 1000 < Date.now()) throw new Error("exp");
  if (!body.email || body.email_verified === false || body.email_verified === "false") throw new Error("email");
  return { sub: body.sub, email: String(body.email).toLowerCase(), name: body.name || "" };
}

// ---------------------------------------------------------------- khoá đẩy (VAPID) – tự tạo lần đầu, lưu trong D1
export async function vapidPublic(env) {
  const c = await getConfig(env);
  if (c.vapid_public) return c.vapid_public;
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
  const prv = JSON.stringify(await crypto.subtle.exportKey("jwk", kp.privateKey));
  await env.DB.prepare("INSERT OR IGNORE INTO config(key, value) VALUES('vapid_public', ?)").bind(pub).run();
  await env.DB.prepare("INSERT OR IGNORE INTO config(key, value) VALUES('vapid_private_jwk', ?)").bind(prv).run();
  return (await getConfig(env, true)).vapid_public;
}

export const LEGACY_KEYS = ["portfolio", "assumptions", "groups", "profile", "journal", "watchlist", "views"];
export const USER_KEYS = new Set([...LEGACY_KEYS, "notify", "ui"]);
export const ownerList = (env) => String(env.OWNER_EMAIL || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || "");
