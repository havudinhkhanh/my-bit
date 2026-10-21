// Cloudflare Worker: hẹn giờ chạy GitHub Actions đúng giờ (lịch của GitHub hay trễ).
// Mỗi 15 phút: lượt nhanh. Phút 07 của giờ chia hết cho 4 (UTC) → lượt đầy đủ (định giá, kiểm chứng, đăng web).
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
  async scheduled(event, env) {
    const d = new Date(event.scheduledTime);
    const full = d.getUTCHours() % 4 === 0 && d.getUTCMinutes() < 15;
    const res = await dispatch(env, full ? "" : "fast");
    console.log(`my-bit: ${full ? "đầy đủ" : "nhanh"}`, JSON.stringify(res));
  },
  async fetch() {
    return new Response("my-bit scheduler: nhanh mỗi 15 phút · đầy đủ mỗi 4 giờ", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
