// /api/admin/*: người dùng, gói, mã mời, liên kết đặt lại mật khẩu, cấu hình hệ thống, thống kê.
import { audit, effPlan, err, getConfig, getUser, json, notify, nowIso, PLANS, randHex, setConfig, sha256Hex } from "./core.js";

const CFG_KEYS = ["google_client_id", "signup_mode", "site_url", "mail_from", "resend_key", "smtp_host", "smtp_port", "smtp_user", "smtp_pass"];
const SECRET_KEYS = new Set(["resend_key", "smtp_pass"]);
const mask = (v) => (v ? "••••" + String(v).slice(-3) : "");

export async function admin(ctx, action, ses) {
  const { request, env } = ctx;
  if (ses.r !== "admin") return err("Chỉ quản trị viên", 403);
  const m = request.method;
  const url = new URL(request.url);
  let b = {};
  if (m !== "GET") { try { b = await request.json(); } catch (e) { b = {}; } }

  if (action === "users" && m === "GET") {
    const { results } = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.role, u.plan, u.plan_until, u.status, u.invite, u.note, u.created_at, u.last_login, u.last_seen,
        (u.pw IS NOT NULL) AS has_pw, (u.google_sub IS NOT NULL) AS google,
        (SELECT COUNT(*) FROM push_subs p WHERE p.user_id = u.id) AS push,
        (SELECT length(value) FROM user_data d WHERE d.user_id = u.id AND d.key = 'portfolio') AS pf_size
      FROM users u ORDER BY (u.status = 'pending') DESC, u.id`).all();
    return json({ users: results.map((u) => ({ ...u, eff_plan: effPlan(u) })), plans: Object.fromEntries(Object.entries(PLANS.plans).map(([k, v]) => [k, v.name])) });
  }
  if (action === "user" && m === "POST") {
    const u = await getUser(env, Number(b.id));
    if (!u) return err("Không có người dùng", 404);
    const set = {};
    if (b.plan !== undefined) { if (!PLANS.plans[b.plan]) return err("Gói không hợp lệ"); set.plan = b.plan; }
    if (b.plan_until !== undefined) set.plan_until = b.plan_until ? String(b.plan_until).slice(0, 10) : null;
    if (b.status !== undefined) { if (!["active", "pending", "disabled"].includes(b.status)) return err("Trạng thái không hợp lệ"); set.status = b.status; }
    if (b.role !== undefined) { if (!["user", "admin"].includes(b.role)) return err("Vai trò không hợp lệ"); if (u.id === ses.u && b.role !== "admin") return err("Không tự bỏ quyền quản trị của chính mình"); set.role = b.role; }
    if (b.note !== undefined) set.note = String(b.note || "").slice(0, 300) || null;
    if (b.name !== undefined) set.name = String(b.name || "").slice(0, 80) || null;
    const ks = Object.keys(set);
    if (!ks.length) return json({ ok: true });
    const bump = ("status" in set && set.status !== "active") || "role" in set ? ", sv = sv + 1" : "";
    await env.DB.prepare(`UPDATE users SET ${ks.map((k) => `${k} = ?`).join(", ")}${bump} WHERE id = ?`).bind(...ks.map((k) => set[k]), u.id).run();
    if (u.status === "pending" && set.status === "active") await notify(env, u.id, "welcome", "Tài khoản đã được kích hoạt", "Chào mừng đến MyBit – bắt đầu bằng việc nhập danh mục ở tab Danh mục.", { kind: "system", url: "#/portfolio" });
    if (set.plan && set.plan !== u.plan) await notify(env, u.id, `plan:${set.plan}:${nowIso().slice(0, 16)}`, `Gói của anh/chị: ${PLANS.plans[set.plan].name}`, set.plan_until ? `Hiệu lực tới ${set.plan_until}` : "", { kind: "system", url: "#/account" });
    await audit(env, ses.u, "admin_user", `${u.email} ${JSON.stringify(set)}`);
    return json({ ok: true });
  }
  if (action === "reset_link" && m === "POST") {
    const u = await getUser(env, Number(b.id));
    if (!u) return err("Không có người dùng", 404);
    const tok = randHex(24);
    await env.DB.prepare("INSERT INTO resets(token_hash, user_id, expires_at) VALUES(?, ?, ?)").bind(await sha256Hex(tok), u.id, new Date(Date.now() + 72 * 3600000).toISOString()).run();
    await audit(env, ses.u, "reset_link", u.email);
    return json({ link: `${url.origin}/login#reset=${tok}`, hours: 72 });
  }
  if (action === "invites") {
    if (m === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM invites ORDER BY created_at DESC").all();
      return json({ invites: results });
    }
    if (m === "POST") {
      const code = (String(b.code || "").trim().toUpperCase() || randHex(4).toUpperCase()).replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
      if (code.length < 4) return err("Mã tối thiểu 4 ký tự");
      if (!PLANS.plans[b.plan || "free"]) return err("Gói không hợp lệ");
      await env.DB.prepare("INSERT INTO invites(code, plan, days, max_uses, expires_at, note, created_by, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(code, b.plan || "free", b.days ? Number(b.days) : null, Math.max(1, Number(b.max_uses || 1)), b.expires_at ? String(b.expires_at).slice(0, 10) : null,
              String(b.note || "").slice(0, 200) || null, ses.u, nowIso()).run().catch(() => null);
      return json({ ok: true, code });
    }
    if (m === "DELETE") {
      await env.DB.prepare("DELETE FROM invites WHERE code = ?").bind(String(url.searchParams.get("code") || "")).run();
      return json({ ok: true });
    }
  }
  if (action === "config") {
    if (m === "GET") {
      const c = await getConfig(env, true);
      return json({ config: Object.fromEntries(CFG_KEYS.map((k) => [k, SECRET_KEYS.has(k) ? mask(c[k]) : (c[k] || "")])),
                    env: { GOOGLE_CLIENT_ID: !!env.GOOGLE_CLIENT_ID, RESEND_API_KEY: !!env.RESEND_API_KEY, OWNER_EMAIL: env.OWNER_EMAIL || "" } });
    }
    if (m === "POST") {
      for (const k of CFG_KEYS) {
        if (b[k] === undefined) continue;
        const v = String(b[k] ?? "").trim();
        if (SECRET_KEYS.has(k) && v.startsWith("••••")) continue;   // giữ nguyên giá trị cũ
        await setConfig(env, k, v);
      }
      await audit(env, ses.u, "admin_config", Object.keys(b).join(","));
      return json({ ok: true });
    }
  }
  if (action === "stats" && m === "GET") {
    const q = async (sql) => (await env.DB.prepare(sql).first()) || {};
    const d7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const [all, act, pend, pro, week, subs, notif] = await Promise.all([
      q("SELECT COUNT(*) n FROM users"), q("SELECT COUNT(*) n FROM users WHERE status='active'"), q("SELECT COUNT(*) n FROM users WHERE status='pending'"),
      q(`SELECT COUNT(*) n FROM users WHERE status='active' AND plan='pro' AND (plan_until IS NULL OR plan_until >= '${nowIso().slice(0, 10)}')`),
      q(`SELECT COUNT(*) n FROM users WHERE last_seen >= '${d7}'`), q("SELECT COUNT(*) n FROM push_subs"), q(`SELECT COUNT(*) n FROM notifications WHERE created_at >= '${d7}'`)]);
    return json({ users: all.n, active: act.n, pending: pend.n, pro: pro.n, active7: week.n, push: subs.n, notif7: notif.n });
  }
  if (action === "audit" && m === "GET") {
    const { results } = await env.DB.prepare("SELECT a.*, u.email FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200").all();
    return json({ audit: results });
  }
  return err("Không có API này", 404);
}
