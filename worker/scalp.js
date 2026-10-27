// BOT LƯỚT GIÂY trên Cloudflare: Durable Object bọc lõi chung (scalp_core.js) + hàm đánh thức gọi từ cron mỗi phút.
// Lưu ý hạn mức: gói Cloudflare miễn phí chỉ cho Durable Object 100.000 lượt/ngày, mỗi 20 tin nhắn WebSocket nhận về tính 1 lượt
// → quét toàn thị trường (hàng nghìn tin/giây) hết hạn mức sau khoảng nửa giờ. Muốn chạy liên tục: chọn "máy chủ riêng" (scalper/runner.mjs).
import { DurableObject } from "cloudflare:workers";
import { ScalpCore, ORD_CF, SCALP_DEF } from "./scalp_core.js";
import { notifyNow } from "../functions/_lib/push.js";

export { SCALP_DEF };
const cfOpenWS = async (url) => {
  const r = await fetch(url.replace(/^wss:/, "https:"), { headers: { Upgrade: "websocket" } });
  const ws = r.webSocket; if (!ws) throw new Error("WebSocket HTTP " + r.status);
  ws.accept(); return ws;
};
export class Scalper extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new ScalpCore({
      kv: ctx.storage, where: "cf", ord: ORD_CF, host: "cloudflare", openWS: cfOpenWS,
      readCfg: async (uid) => { const r = await env.DB.prepare("SELECT value FROM user_data WHERE user_id = ? AND key = 'scalp'").bind(Number(uid)).first(); return r ? JSON.parse(r.value) : null; },
      notify: async (uid, items) => notifyNow(env, uid, "scalp", items.map((x) => ({ ...x, key: "sc:" + x.key }))),
      loadBrain: async (uid) => { const r = await env.DB.prepare("SELECT value FROM user_data WHERE user_id = ? AND key = 'scalpbrain'").bind(Number(uid)).first(); return r ? JSON.parse(r.value) : null; },
      saveBrain: async (uid, b) => env.DB.prepare("INSERT INTO user_data(user_id, key, value, updated_at) VALUES(?, 'scalpbrain', ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(Number(uid), JSON.stringify(b), new Date().toISOString()).run(),
      saveDays: async (uid, paper) => env.DB.prepare("INSERT INTO user_data(user_id, key, value, updated_at) VALUES(?, 'scalpdays', ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(Number(uid), JSON.stringify({ v: 1, at: new Date().toISOString(), paper }), new Date().toISOString()).run(),
      writeState: async (uid, out) => env.DB.prepare("INSERT INTO user_data(user_id, key, value, updated_at) VALUES(?, 'scalpstate', ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(Number(uid), JSON.stringify(out), new Date().toISOString()).run(),
    });
  }
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname !== "/ping") return new Response("scalper");
    const b = await req.json().catch(() => ({}));
    try {
      const on = await this.core.boot(b.uid);
      if (on && !(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 10000);
      return Response.json({ ok: true, on, feeds: Object.fromEntries(Object.entries(this.core.F).map(([t, f]) => [t, { src: f.src, live: !!f.ws, n: f.list?.length }])) });
    } catch (e) { this.core.err("boot " + (e?.stack || e)); return Response.json({ ok: false, err: String(e?.stack || e).slice(0, 500) }, { status: 500 }); }
  }
  async alarm() {
    let on = false;
    try { on = await this.core.tick(); } catch (e) { this.core.err("tick " + (e?.message || e)); on = this.core.here(); }
    if (on) await this.ctx.storage.setAlarm(Date.now() + 10000);
  }
}

// gọi từ cron mỗi phút: đánh thức bot lướt giây của những người đang bật
export async function scalpPing(env, canBot) {
  if (!env.SCALP || !env.DB) return { skip: true };
  const { results } = await env.DB.prepare("SELECT d.user_id, d.value, u.role, u.plan, u.plan_until FROM user_data d JOIN users u ON u.id = d.user_id WHERE u.status = 'active' AND d.key = 'scalp'").all();
  let n = 0;
  for (const r of results || []) {
    let c = null; try { c = JSON.parse(r.value); } catch (e) { continue; }
    if (!c?.enabled || c.where === "vps") continue;      // chạy ở máy chủ riêng → Cloudflare không đánh thức
    if (!canBot(r)) continue;
    const stub = env.SCALP.get(env.SCALP.idFromName("u" + r.user_id), { locationHint: "apac" });
    let res;
    try { const rp = await stub.fetch("https://scalp/ping", { method: "POST", body: JSON.stringify({ uid: r.user_id }) }); res = { ok: rp.ok, status: rp.status, body: (await rp.text()).slice(0, 600) }; n++; }
    catch (e) { res = { ok: false, err: String(e?.message || e).slice(0, 600) }; console.log("scalp ping", r.user_id, res.err); }
    try {      // ghi kết quả đánh thức để kiểm tra từ xa (lỗi hạn mức Durable Object, lỗi khởi động …)
      await env.DB.prepare("INSERT INTO user_data(user_id, key, value, updated_at) VALUES(?, 'scalpping', ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(r.user_id, JSON.stringify({ at: new Date().toISOString(), ...res }), new Date().toISOString()).run();
    } catch (e) { /* bỏ qua */ }
  }
  return { scalpers: n };
}
