// Cổng vào trang web: bắt đăng nhập, giới hạn dữ liệu theo gói hội viên.
// Chưa gắn D1 (DB) → giữ nguyên chế độ cũ (Cloudflare Access bảo vệ cả trang).
import { can, ensureSchema, getSession, PLANS, withCookie } from "./_lib/core.js";

const PUBLIC = [/^\/login(\.html)?$/, /^\/login\.js$/, /^\/auth\.css$/, /^\/app\.css$/, /^\/icon\.svg$/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/,
  /^\/vendor\//, /^\/favicon\.ico$/, /^\/ban-tin(\/|$)/, /^\/(robots\.txt|sitemap\.xml|rss\.xml)$/, /^\/api\//];
const RULES = PLANS.paths.map((r) => ({ ...r, rx: new RegExp(r.re) }));
const STRIP = PLANS.strip.map((r) => ({ ...r, rx: new RegExp(r.re) }));

const wantsHtml = (request, p) => p === "/" || p.endsWith(".html") || !/\.[a-z0-9]+$/i.test(p) || (request.headers.get("accept") || "").includes("text/html");

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url), p = url.pathname;
  if (!env.DB) {
    // Chế độ cũ chỉ an toàn khi có Cloudflare Access đứng trước. Không có Access và cũng chưa gắn D1 → khoá lại,
    // tránh lộ dữ liệu nếu một lần triển khai bị thiếu cơ sở dữ liệu đăng nhập.
    if (request.headers.get("cf-access-jwt-assertion") || url.hostname === "localhost" || url.hostname === "127.0.0.1") return next();
    if (PUBLIC.some((rx) => rx.test(p)) && !p.startsWith("/api/")) return next();
    return new Response("Hệ thống đăng nhập đang bảo trì – vui lòng thử lại sau ít phút.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "300" } });
  }
  if (PUBLIC.some((rx) => rx.test(p))) return next();
  await ensureSchema(env);
  const s = await getSession(request, env);
  if (!s) {
    if (wantsHtml(request, p)) return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(p + url.search + url.hash)}`, 302);
    return new Response(JSON.stringify({ error: "Chưa đăng nhập" }), { status: 401, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  const rule = RULES.find((r) => r.rx.test(p));
  if (rule && !can(s.ses, rule.feature)) {
    return withCookie(new Response(JSON.stringify({ error: "Tính năng của gói Pro", feature: rule.feature, locked: true }),
      { status: 402, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }), s.setCookie);
  }
  let res = await next();
  const st = STRIP.find((r) => r.rx.test(p));
  if (st && res.ok && !can(s.ses, st.feature)) {
    try {
      const j = await res.json();
      st.keys.forEach((k) => delete j[k]);
      j._locked = { feature: st.feature, keys: st.keys };
      res = new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });
    } catch (e) { /* không phải JSON: trả nguyên */ }
  } else if (p.startsWith("/data/")) {
    res = new Response(res.body, res);
    // ?v=<giờ tạo dữ liệu>.<gói> do app.js gắn: đổi dữ liệu hoặc đổi gói = đổi địa chỉ → giữ đệm 1 ngày an toàn
    res.headers.set("cache-control", url.searchParams.get("v") ? "private, max-age=86400" : "private, no-cache");
  } else if (res.ok && /\.(js|css)$/.test(p) && url.searchParams.has("v")) {
    // app.js có gắn phiên bản (?v=<băm>) → lưu đệm lâu dài trên trình duyệt (đổi mã = đổi băm = tải bản mới)
    res = new Response(res.body, res);
    res.headers.set("cache-control", "private, max-age=31536000, immutable");
  }
  return withCookie(res, s.setCookie);
}
