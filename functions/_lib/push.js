// Gửi Web Push TỨC THÌ từ Cloudflare (Pages Function / Worker) – RFC 8291 (mã hoá aes128gcm) + RFC 8292 (VAPID), chỉ dùng WebCrypto.
// Dùng chung cho: bot lướt giây (cổng máy chủ riêng + Durable Object) và bot phút (Worker mỗi phút). Khoá VAPID nằm trong D1 (config).
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
export async function encrypt(payload, p256dh, auth) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(secret, shared, cat(enc.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);
}
async function vapid(jwk, endpoint, sub) {
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })));
  const sig = b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${sig}, k=${b64u(cat(new Uint8Array([4]), unb64u(jwk.x), unb64u(jwk.y)))}`;
}
// 🔗 thông báo lệnh bot → "ref" của lệnh (dùng chung với nút trên trang Bot: lv:<id>, swp:<id>, lq:<id>, pp:…) + trạng thái của mốc đó.
//    Khoá do máy chủ bot đặt: sc:lv:open:<id> · sc:lv:fill:<id>:<q> · sc:lv:close:<id> · sc:lv:swo|swc:<id> · sc:lv:qo|qc:<id> · sc:(lv:)kpr:<ref>:<n>
export function ntRef(key) {
  const k = String(key || "").replace(/^sc:/, ""); let m;
  if ((m = k.match(/^lv:(open|fill|close):([^:]+)/))) return { ref: "lv:" + m[2], st: m[1] === "close" ? "closed" : m[1] };
  if ((m = k.match(/^lv:sw([oc]):([^:]+)/))) return { ref: "swp:" + m[2], st: m[1] === "c" ? "closed" : "fill" };
  if ((m = k.match(/^lv:q([oc]):([^:]+)/))) return { ref: "lq:" + m[2], st: m[1] === "c" ? "closed" : "fill" };
  if ((m = k.match(/^lv:ask([wq]?):([^:]+)/))) return { ref: ({ "": "lv:", w: "swp:", q: "lq:" })[m[1]] + m[2], st: "ask" };      // ⏰ sắp tự đóng mà đang lỗ → hỏi việc tiếp theo
  if ((m = k.match(/^(?:lv:)?kpr:(.+):\d+$/))) return { ref: m[1], st: "keep" };
  return null;
}
// nút làm nhanh theo trạng thái lệnh – mọi nút đổi lệnh đều MỞ APP tới bảng xác nhận (không đóng / gia hạn tiền thật thẳng từ thông báo)
export function ntActs(r) {
  if (!r) return [];
  const u = (d) => `#/bot/scalp?do=${d}&k=${encodeURIComponent(r.ref)}`;
  if (r.st === "open") return [{ a: "close", t: "Huỷ lệnh chờ…", u: u("close") }, { a: "show", t: "Xem lệnh", u: u("show") }];
  if (r.st === "fill") return [{ a: "close", t: "Đóng lệnh…", u: u("close") }, { a: "ext", t: "Gia hạn…", u: u("ext") }];
  if (r.st === "keep") return [{ a: "snz", t: "🔕 Nhắc sau 1 giờ", u: u("snz") }, { a: "close", t: "Đóng lệnh…", u: u("close") }];
  if (r.st === "ask") return [{ a: "ext", t: "⏱ Gia hạn / cách ra…", u: u("ext") }, { a: "close", t: "Đóng ngay…", u: u("close") }];
  return [];
}
const SEV_MIN = { all: 0, normal: 1, important: 2, off: 99 };
// items: [{ key, sev, title, body, url, kind }] – đã được ghi vào bảng thông báo; hàm này chỉ ĐẨY tới điện thoại theo tuỳ chọn của người dùng
export async function pushNotify(env, uid, items, opt = {}) {
  if (!env.DB || !items?.length) return 0;
  const [cfgR, prefR, subR] = await Promise.all([
    env.DB.prepare("SELECT key, value FROM config WHERE key IN ('vapid_private_jwk', 'site_url', 'smtp_user')").all(),
    env.DB.prepare("SELECT value FROM user_data WHERE user_id = ? AND key = 'notify'").bind(Number(uid)).first(),
    env.DB.prepare("SELECT id, endpoint, p256dh, auth FROM push_subs WHERE user_id = ?").bind(Number(uid)).all(),
  ]);
  const cfg = Object.fromEntries((cfgR.results || []).map((r) => [r.key, r.value]));
  const subs = subR.results || []; if (!cfg.vapid_private_jwk || !subs.length) return 0;
  let pr = {}; try { pr = prefR ? JSON.parse(prefR.value) : {}; } catch (e) { /* mặc định */ }
  const lvl = SEV_MIN[pr.push || "normal"] ?? 1, off = new Set(Object.entries(pr.kinds || {}).filter(([, v]) => v === false).map(([k]) => k));
  const want = items.filter((x) => (x.sev || 0) >= lvl && !off.has(x.kind) && !off.has(String(x.kind || "").replace(/w$/, "")));
  if (!want.length) return 0;
  const base = (cfg.site_url || "").replace(/\/+$/, "") + "/";
  // mỗi lệnh (grp) → 1 thông báo riêng trên điện thoại, tự ĐÈ bản cũ của chính lệnh đó (chờ khớp → đã khớp → đã đóng);
  // việc lẻ khác gộp thành 1 thông báo. Trên chuông web vẫn giữ đủ lịch sử.
  const bySev = (L) => [...L].sort((a, b) => (b.sev || 0) - (a.sev || 0)), G = new Map(), loose = [];
  for (const x of want) { if (x.grp) { if (!G.has(x.grp)) G.set(x.grp, []); G.get(x.grp).push(x); } else loose.push(x); }
  // mốc MỚI NHẤT của lệnh quyết định nút (chờ → khớp → đóng); bấm vào thông báo = mở đúng lệnh trên tab Lệnh
  const rich = (t, L) => { const r = ntRef(t.key); return { ref: r?.ref || null, st: r?.st || null, acts: ntActs(r), keys: L.map((x) => x.key), url: r && r.st !== "closed" ? `#/bot/scalp?do=show&k=${encodeURIComponent(r.ref)}` : t.url || "#/" }; };
  const msgs = [...G.entries()].slice(0, 4).map(([g, L]) => { const t = L[L.length - 1], top = bySev(L)[0], R = rich(t, L); return { sev: top.sev || 0, title: t.title, body: t.body || "", tag: "mybit-o-" + String(g).slice(0, 60), ...R }; });
  if (loose.length) {
    const top = bySev(loose), one = top.length === 1;
    const R1 = one ? rich(top[0], top) : { keys: top.map((x) => x.key), acts: [] };
    msgs.push({ sev: top[0].sev || 0, title: one ? top[0].title : `MyBit: ${top.length} việc mới`, body: one ? top[0].body || "" : top.slice(0, 5).map((x) => "• " + x.title).join("\n"),
      tag: "mybit-" + String(top[0].key).slice(0, 40), ...R1, url: one ? R1.url : "#/notifications" });
  }
  const badge = Number.isFinite(opt.badge) ? { badge: opt.badge } : {};
  const jwk = JSON.parse(cfg.vapid_private_jwk), subject = "mailto:" + (cfg.smtp_user || "admin@example.com");
  let ok = 0;
  for (const s of subs) for (const m of msgs) {
    try {
      // tải trọng ≤ ~3 KB (giới hạn đẩy 4 KB sau mã hoá): nội dung đủ 3–5 dòng, nút làm nhanh, mốc giờ, khoá để đánh dấu đã đọc khi bấm
      const data = JSON.stringify({ title: m.title, body: String(m.body).slice(0, 400), url: base + m.url, tag: m.tag, sev: m.sev, ts: Date.now(), st: m.st || null, ref: m.ref || null,
        acts: (m.acts || []).slice(0, 2).map((a) => ({ a: a.a, t: a.t, u: base + a.u })), nk: (m.keys || []).slice(0, 8).map((k) => String(k).slice(0, 180)), ...badge });
      const r = await fetch(s.endpoint, { method: "POST", body: await encrypt(data, s.p256dh, s.auth), headers: { Authorization: await vapid(jwk, s.endpoint, subject), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "43200", Urgency: m.sev >= 2 ? "high" : "normal" } });
      if (r.status >= 200 && r.status < 300) { ok++; await env.DB.prepare("UPDATE push_subs SET last_ok = ?, fails = 0 WHERE id = ?").bind(new Date().toISOString(), s.id).run(); }
      else if (r.status === 404 || r.status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE id = ?").bind(s.id).run();
      else await env.DB.prepare("UPDATE push_subs SET fails = fails + 1 WHERE id = ?").bind(s.id).run();
    } catch (e) { /* thử máy kế */ }
  }
  return ok;
}
// ghi vào bảng thông báo (chuông) + đẩy ngay những cái MỚI
export async function notifyNow(env, uid, kind, items, opt = {}) {
  if (!items?.length) return 0;
  const now = new Date().toISOString();
  const res = await env.DB.batch(items.map((x) => env.DB.prepare("INSERT OR IGNORE INTO notifications(user_id, key, kind, sev, title, body, url, sym, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(Number(uid), String(x.key).slice(0, 200), kind, x.sev || 0, String(x.title).slice(0, 200), String(x.body || "").slice(0, 1500), x.url || "#/", x.sym || null, now)));
  const fresh = items.filter((x, i) => res[i]?.meta?.changes > 0).map((x) => ({ ...x, kind }));
  try { await pushNotify(env, uid, fresh, opt); } catch (e) { console.log("push", e.message); }
  return fresh.length;
}
