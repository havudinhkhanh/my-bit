// /api/auth/*: đăng ký (mã mời / chờ duyệt), đăng nhập mật khẩu + Google, quên / đặt lại mật khẩu, đăng xuất, thông tin tài khoản.
import {
  audit, clearAttempts, clearCookie, err, failAttempt, getConfig, getSession, getUser, hashPassword, json, LEGACY_KEYS, makeCookie,
  meOf, notifyAdmins, nowIso, ownerList, PLANS, randHex, sendMail, sha256Hex, tooMany, validEmail, verifyGoogle, verifyPassword, withCookie,
} from "./core.js";

async function body(request) { try { return await request.json(); } catch (e) { return {}; } }
const ip = (request) => request.headers.get("cf-connecting-ip") || "local";

async function migrateLegacy(env, uid) {
  if (!env.MYBIT_KV) return 0;
  let n = 0;
  for (const k of LEGACY_KEYS) {
    const v = await env.MYBIT_KV.get(k);
    if (v) {
      await env.DB.prepare("INSERT OR IGNORE INTO user_data(user_id, key, value, updated_at) VALUES(?, ?, ?, ?)").bind(uid, k, v, nowIso()).run();
      n++;
    }
  }
  return n;
}

/** Quyết định vai trò / trạng thái / gói cho người đăng ký mới. */
async function admission(env, email, inviteCode) {
  const count = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n;
  const owners = ownerList(env);
  if (owners.includes(email) || (count === 0 && owners.length === 0)) {
    return { role: "admin", plan: "pro", status: "active", plan_until: null, invite: null, owner: true };
  }
  const code = String(inviteCode || "").trim().toUpperCase();
  if (code) {
    const inv = await env.DB.prepare("SELECT * FROM invites WHERE code = ?").bind(code).first();
    if (!inv) return { error: "Mã mời không đúng" };
    if (inv.uses >= inv.max_uses) return { error: "Mã mời đã dùng hết lượt" };
    if (inv.expires_at && inv.expires_at < nowIso().slice(0, 10)) return { error: "Mã mời đã hết hạn" };
    const until = inv.days ? new Date(Date.now() + inv.days * 86400000).toISOString().slice(0, 10) : null;
    return { role: "user", plan: inv.plan, status: "active", plan_until: until, invite: code };
  }
  const c = await getConfig(env);
  if (c.signup_mode === "open") return { role: "user", plan: "free", status: "active", plan_until: null, invite: null };
  return { role: "user", plan: "free", status: "pending", plan_until: null, invite: null };
}

async function createUser(env, { email, name, pw, google_sub }, adm) {
  const r = await env.DB.prepare(`INSERT INTO users(email, name, pw, google_sub, role, plan, plan_until, status, invite, created_at)
                                  VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(email, name || null, pw || null, google_sub || null, adm.role, adm.plan, adm.plan_until, adm.status, adm.invite, nowIso()).run();
  const id = r.meta.last_row_id;
  if (adm.invite) await env.DB.prepare("UPDATE invites SET uses = uses + 1 WHERE code = ?").bind(adm.invite).run();
  if (adm.owner) await migrateLegacy(env, id);
  if (adm.status === "pending") {
    await notifyAdmins(env, `join:${id}`, `Yêu cầu tham gia: ${email}`, `${name ? name + " " : ""}muốn dùng MyBit – duyệt trong trang Quản trị.`, { url: "#/admin", sev: 2 });
  }
  await audit(env, id, "signup", `${adm.status} ${adm.plan}${adm.invite ? " invite " + adm.invite : ""}`);
  return await getUser(env, id);
}

async function loginOk(env, request, u, how) {
  await env.DB.prepare("UPDATE users SET last_login = ?, last_seen = ? WHERE id = ?").bind(nowIso(), nowIso(), u.id).run();
  await audit(env, u.id, "login", how);
  return json({ ok: true, me: meOf(u) }, 200, { "set-cookie": await makeCookie(env, u, request.url) });
}
const blocked = (u) => (u.status === "pending" ? err("Tài khoản đang chờ duyệt – anh/chị sẽ được báo khi được kích hoạt", 403, { pending: true })
  : err("Tài khoản đã bị khoá", 403));

export async function auth(ctx, action) {
  const { request, env } = ctx;
  const m = request.method;
  if (action === "config" && m === "GET") {
    const c = await getConfig(env);
    return json({ google_client_id: env.GOOGLE_CLIENT_ID || c.google_client_id || null, signup: c.signup_mode === "open" ? "open" : "invite",
                  reset_email: !!((env.RESEND_API_KEY || c.resend_key) && c.mail_from) });
  }
  if (action === "plans" && m === "GET") return json(PLANS);
  if (action === "me" && m === "GET") {
    const s = await getSession(request, env);
    if (!s) return err("Chưa đăng nhập", 401);
    const u = s.user || await getUser(env, s.ses.u);
    if (!u || u.status !== "active") return err("Chưa đăng nhập", 401, {}, );
    return withCookie(json({ me: meOf(u) }), s.setCookie);
  }
  if (action === "logout" && m === "POST") return json({ ok: true }, 200, { "set-cookie": clearCookie() });
  if (m !== "POST") return err("Phương thức không hỗ trợ", 405);
  const b = await body(request);

  if (action === "signup") {
    const email = String(b.email || "").trim().toLowerCase(), pw = String(b.password || ""), name = String(b.name || "").trim().slice(0, 80);
    if (!validEmail(email)) return err("Email không hợp lệ");
    if (pw.length < 8) return err("Mật khẩu tối thiểu 8 ký tự");
    if (await tooMany(env, "signup:" + ip(request))) return err("Thử lại sau ít phút", 429);
    if (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first()) return err("Email này đã có tài khoản – hãy đăng nhập", 409);
    const adm = await admission(env, email, b.invite);
    if (adm.error) { await failAttempt(env, "signup:" + ip(request), 10, 30); return err(adm.error); }
    const u = await createUser(env, { email, name, pw: await hashPassword(pw) }, adm);
    if (u.status !== "active") return json({ ok: true, pending: true });
    return loginOk(env, request, u, "signup");
  }
  if (action === "login") {
    const email = String(b.email || "").trim().toLowerCase(), pw = String(b.password || "");
    const k = "login:" + email;
    if (await tooMany(env, k)) return err("Sai quá nhiều lần – thử lại sau 15 phút", 429);
    const u = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (!u || !u.pw || !(await verifyPassword(pw, u.pw))) {
      await failAttempt(env, k);
      return err(u && !u.pw ? "Tài khoản này đăng nhập bằng Google" : "Sai email hoặc mật khẩu", 401);
    }
    await clearAttempts(env, k);
    if (u.status !== "active") return blocked(u);
    return loginOk(env, request, u, "password");
  }
  if (action === "google") {
    const c = await getConfig(env);
    const cid = env.GOOGLE_CLIENT_ID || c.google_client_id;
    if (!cid) return err("Chưa bật đăng nhập Google");
    let g;
    try { g = await verifyGoogle(b.credential, cid); } catch (e) { return err("Không xác thực được tài khoản Google", 401); }
    let u = await env.DB.prepare("SELECT * FROM users WHERE google_sub = ? OR email = ? ORDER BY google_sub IS NULL LIMIT 1").bind(g.sub, g.email).first();
    if (u) {
      if (!u.google_sub) await env.DB.prepare("UPDATE users SET google_sub = ? WHERE id = ?").bind(g.sub, u.id).run();
      if (u.status !== "active") return blocked(u);
      return loginOk(env, request, u, "google");
    }
    const adm = await admission(env, g.email, b.invite);
    if (adm.error) return err(adm.error);
    u = await createUser(env, { email: g.email, name: g.name, google_sub: g.sub }, adm);
    if (u.status !== "active") return json({ ok: true, pending: true });
    return loginOk(env, request, u, "google-signup");
  }
  if (action === "forgot") {
    const email = String(b.email || "").trim().toLowerCase();
    if (await tooMany(env, "forgot:" + ip(request))) return err("Thử lại sau ít phút", 429);
    await failAttempt(env, "forgot:" + ip(request), 5, 30);
    const u = validEmail(email) ? await env.DB.prepare("SELECT * FROM users WHERE email = ? AND status = 'active'").bind(email).first() : null;
    let mailed = false;
    if (u) {
      const tok = randHex(24);
      await env.DB.prepare("INSERT INTO resets(token_hash, user_id, expires_at) VALUES(?, ?, ?)").bind(await sha256Hex(tok), u.id, new Date(Date.now() + 3600000).toISOString()).run();
      const link = `${new URL(request.url).origin}/login#reset=${tok}`;
      mailed = await sendMail(env, u.email, "Đặt lại mật khẩu MyBit",
        `<p>Chào ${u.name || ""},</p><p>Bấm vào liên kết sau để đặt mật khẩu mới (hết hạn sau 1 giờ):</p><p><a href="${link}">${link}</a></p><p>Nếu không phải anh/chị yêu cầu, hãy bỏ qua email này.</p>`);
      if (!mailed) await notifyAdmins(env, `reset:${u.id}:${nowIso().slice(0, 13)}`, `Yêu cầu đặt lại mật khẩu: ${u.email}`, "Tạo liên kết đặt lại trong trang Quản trị rồi gửi cho người dùng.", { url: "#/admin", sev: 2 });
    }
    return json({ ok: true, mailed });
  }
  if (action === "reset") {
    const tok = String(b.token || ""), pw = String(b.password || "");
    if (pw.length < 8) return err("Mật khẩu tối thiểu 8 ký tự");
    const r = await env.DB.prepare("SELECT * FROM resets WHERE token_hash = ?").bind(await sha256Hex(tok)).first();
    if (!r || r.used || r.expires_at < nowIso()) return err("Liên kết đã hết hạn hoặc đã dùng");
    await env.DB.prepare("UPDATE resets SET used = 1 WHERE token_hash = ?").bind(r.token_hash).run();
    await env.DB.prepare("UPDATE users SET pw = ?, sv = sv + 1 WHERE id = ?").bind(await hashPassword(pw), r.user_id).run();
    const u = await getUser(env, r.user_id);
    await audit(env, u.id, "reset", "");
    if (u.status !== "active") return blocked(u);
    return loginOk(env, request, u, "reset");
  }
  // ---- các thao tác cần đăng nhập
  const s = await getSession(request, env);
  if (!s) return err("Chưa đăng nhập", 401);
  const u = await getUser(env, s.ses.u);
  if (action === "password") {
    const np = String(b.new || "");
    if (np.length < 8) return err("Mật khẩu mới tối thiểu 8 ký tự");
    if (u.pw && !(await verifyPassword(String(b.old || ""), u.pw))) return err("Mật khẩu hiện tại không đúng", 401);
    await env.DB.prepare("UPDATE users SET pw = ?, sv = sv + 1 WHERE id = ?").bind(await hashPassword(np), u.id).run();
    const u2 = await getUser(env, u.id);
    await audit(env, u.id, "password", "");
    return json({ ok: true }, 200, { "set-cookie": await makeCookie(env, u2, request.url) });
  }
  if (action === "profile") {
    await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(String(b.name || "").trim().slice(0, 80) || null, u.id).run();
    return json({ ok: true, me: meOf(await getUser(env, u.id)) });
  }
  if (action === "logout_all") {
    await env.DB.prepare("UPDATE users SET sv = sv + 1 WHERE id = ?").bind(u.id).run();
    return json({ ok: true }, 200, { "set-cookie": clearCookie() });
  }
  return err("Không có API này", 404);
}
