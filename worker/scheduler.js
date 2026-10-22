// Cloudflare Worker: (1) hẹn giờ chạy GitHub Actions đúng giờ (lịch của GitHub hay trễ):
//   mỗi 15 phút: lượt nhanh; phút 00 của giờ chia hết cho 4 (UTC) → lượt đầy đủ (định giá, kiểm chứng, đăng web);
// (2) MỖI PHÚT: bộ khớp lệnh của bot giao dịch (worker/bot.js) – theo dõi giá, cắt lỗ / chốt lời, vào lệnh.
import { botTick } from "./bot.js";
async function dispatch(env, mode) {
  const url = `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/update.yml/dispatches`;
  let last = "";
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "my-bit-scheduler" },
      body: JSON.stringify({ ref: "main", inputs: { mode, auto: "true" } }),
    });
    if (r.status === 204) return { ok: true, tries: i + 1 };
    last = `${r.status} ${(await r.text()).slice(0, 200)}`;
    await new Promise((res) => setTimeout(res, 10000));
  }
  throw new Error(`GitHub từ chối: ${last}`);
}

export default {
  async scheduled(event, env, ctx) {
    const d = new Date(event.scheduledTime), m = d.getUTCMinutes();
    if (m % 15 === 0 && env.GH_TOKEN) {
      const full = d.getUTCHours() % 4 === 0 && m === 0;
      ctx.waitUntil(dispatch(env, full ? "" : "fast").then((res) => console.log(`my-bit: ${full ? "đầy đủ" : "nhanh"}`, JSON.stringify(res))).catch((e) => console.log("dispatch lỗi", e.message)));
    }
    try { console.log("bot", JSON.stringify(await botTick(env))); } catch (e) { console.log("bot lỗi", e.message); }
  },
  async fetch() {
    return new Response("my-bit scheduler: nhanh mỗi 15 phút · đầy đủ mỗi 4 giờ · bot mỗi phút", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
