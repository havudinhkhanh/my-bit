/* Service worker (PWA): cài lên màn hình chính, mở được khi mất mạng, nhận thông báo đẩy.
   - Trang (điều hướng): lấy mạng trước, mất mạng → bản đã lưu gần nhất, không có → trang báo ngoại tuyến.
   - Tệp tĩnh có ?v=<băm> (app.js, app.css, vendor…): lấy từ đệm (đổi mã = đổi địa chỉ).
   - Tệp tĩnh khác: dùng bản đệm ngay, đồng thời tải bản mới cho lần sau.
   - Dữ liệu /data/: lấy mạng trước, mất mạng → bản đã lưu.
   - /api/ và mọi yêu cầu khác GET / khác tên miền: KHÔNG đụng tới (luôn đi thẳng tới máy chủ).
   Đăng xuất → trang gửi {t:"clear"} để xoá sạch đệm (dữ liệu theo gói của người dùng). */
const APP = "MyBit", VER = "v1", SHELL = `${APP}-shell-${VER}`, DATA = `${APP}-data-${VER}`;
const okRes = (r) => r && r.ok && r.status === 200 && r.type === "basic" && !r.redirected;
const LIMIT = { [SHELL]: 120, [DATA]: 200 };

// cài đặt: lưu sẵn khung trang "/" (chỉ khi đã đăng nhập – bị chuyển sang /login thì bỏ qua) để lần mở sau mất mạng vẫn chạy
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(fetch("/", { credentials: "same-origin", cache: "no-cache" })
  .then((r) => (okRes(r) && (r.headers.get("content-type") || "").includes("text/html") ? caches.open(SHELL).then((c) => c.put("/", r)) : null)).catch(() => {})); });
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const keep = new Set([SHELL, DATA]);
  for (const k of await caches.keys()) if (k.startsWith(APP + "-") && !keep.has(k)) await caches.delete(k);
  if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
  await self.clients.claim();
})()));
self.addEventListener("message", (e) => {
  if (e.data && e.data.t === "clear") e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(APP + "-")).map((k) => caches.delete(k)))));
});

async function put(name, req, res) {
  try {
    const c = await caches.open(name); await c.put(req, res);
    const ks = await c.keys(); for (let i = 0; i < ks.length - LIMIT[name]; i++) await c.delete(ks[i]);   // bỏ bản cũ nhất khi quá nhiều
  } catch (x) { /* hết dung lượng / chế độ riêng tư: bỏ qua */ }
}
const OFFLINE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B1119"><title>${APP} – ngoại tuyến</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B1119;color:#E6EDF3;font:16px/1.5 system-ui,-apple-system,sans-serif;text-align:center;padding:24px}b{font-size:20px}p{color:#8B98A5;margin:8px 0 18px}button{background:#2F81F7;color:#fff;border:0;border-radius:10px;padding:10px 18px;font:inherit;cursor:pointer}</style></head>
<body><div><b>📡 Không có kết nối mạng</b><p>${APP} sẽ tự mở lại khi có mạng.</p><button onclick="location.reload()">Thử lại</button></div>
<script>addEventListener("online",()=>location.reload())</script></body></html>`;

async function page(e) {
  const req = e.request;
  try {
    const res = (await e.preloadResponse) || (await fetch(req));
    // chỉ lưu trang ứng dụng thật (không lưu chuyển hướng sang /login hay trang lỗi)
    if (okRes(res) && (res.headers.get("content-type") || "").includes("text/html")) {
      const u = new URL(req.url); e.waitUntil(put(SHELL, u.pathname === "/" || u.pathname === "/index.html" ? "/" : u.origin + u.pathname, res.clone()));
    }
    return res;
  } catch (x) {
    const u = new URL(req.url), c = await caches.open(SHELL);
    return (await c.match(u.origin + u.pathname)) || (/^\/(index\.html)?$/.test(u.pathname) || !/\.[a-z0-9]+$/i.test(u.pathname) ? await c.match("/") : null)
      || new Response(OFFLINE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}
async function data(e) {
  try {
    const res = await fetch(e.request);
    if (okRes(res)) e.waitUntil(put(DATA, e.request, res.clone()));
    return res;
  } catch (x) {
    const c = await caches.open(DATA);
    const m = (await c.match(e.request)) || (await c.match(e.request, { ignoreSearch: true }));
    if (m) return m;
    throw x;
  }
}
async function asset(e, versioned) {
  const c = await caches.open(SHELL), hit = await c.match(e.request);
  const net = () => fetch(e.request).then(async (res) => { if (okRes(res)) await put(SHELL, e.request, res.clone()); return res; });
  if (hit) { if (!versioned) e.waitUntil(net().catch(() => {})); return hit; }
  try { return await net(); } catch (x) { const m = await c.match(e.request, { ignoreSearch: true }); if (m) return m; throw x; }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || u.pathname.startsWith("/api/") || u.pathname === "/sw.js" || req.cache === "no-store") return;
  if (req.mode === "navigate") return e.respondWith(page(e));
  if (u.pathname.startsWith("/data/") || u.pathname === "/i18n-en.json") return e.respondWith(data(e));      // bản dịch: lấy mạng trước (trước đây dùng bản đệm cũ → vừa thêm câu dịch mà lần mở đầu vẫn hiện tiếng Việt)
  if (/\.(js|css|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|json|webmanifest)$/i.test(u.pathname)) return e.respondWith(asset(e, u.searchParams.has("v")));
});

// 🔔 THÔNG BÁO ĐẨY – mỗi lệnh 1 thông báo tự đè (chờ → khớp → đóng), nội dung nhiều dòng, nút làm nhanh (Android / máy tính; iPhone chưa hỗ trợ nút → bấm vào thông báo là mở đúng lệnh).
// Nút đổi lệnh (đóng / gia hạn) chỉ MỞ APP tới bảng xác nhận – không làm thẳng từ thông báo (tiền thật luôn qua bước xác nhận).
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: APP, body: e.data ? e.data.text() : "" }; }
  // số trên biểu tượng app (vd. số lệnh bot đang chờ + đang mở) – iPhone (iOS 16.4+, app đã thêm vào màn hình chính), Android, máy tính
  const nb = self.navigator;
  const badge = typeof d.badge === "number" && nb && nb.setAppBadge ? (d.badge > 0 ? nb.setAppBadge(d.badge) : nb.clearAppBadge()).catch(() => {}) : null;
  const sev = Number(d.sev) || 0, acts = Array.isArray(d.acts) ? d.acts.slice(0, 2) : [];
  e.waitUntil(Promise.all([
    badge,
    self.registration.showNotification(d.title || APP, {
      body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag && sev >= 1, icon: "/apple-touch-icon.png", badge: "/icon-192.png",
      timestamp: Number(d.ts) || Date.now(),
      requireInteraction: sev >= 3,                     // ⛔ ngừng / lỗi nặng: ở lại tới khi anh xem
      silent: sev === 0,                                // tin nhỏ: không kêu, không rung
      vibrate: sev >= 3 ? [90, 60, 90, 60, 160] : sev >= 2 ? [70, 50, 70] : [40],
      actions: acts.map((a) => ({ action: a.a, title: a.t })),
      data: { url: d.url || "/", acts, nk: d.nk || [], ref: d.ref || null },
    }),
    // trang đang mở → cập nhật chuông ngay
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ t: "push" }))),
  ]));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const D = e.notification.data || {}, act = e.action && (D.acts || []).find((a) => a.a === e.action);
  const url = (act && act.u) || D.url || "/";
  // đã xem thông báo này → đánh dấu đã đọc trên chuông (theo khoá – máy dịch vụ không biết số thứ tự)
  const rd = D.nk && D.nk.length ? fetch("/api/notifications/read", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ keys: D.nk }) }).catch(() => {}) : null;
  e.waitUntil(Promise.all([rd, self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) { c.postMessage({ t: "go", url }); return c.focus().catch(() => {}); } }      // app đang mở: chỉ đổi trang trong app (nhanh, không tải lại)
    return self.clients.openWindow(url);
  })]));
});
