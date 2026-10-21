/* MyBit – trang đăng nhập / đăng ký / quên mật khẩu */
"use strict";
(function () {
  const $ = (s) => document.querySelector(s);
  const qs = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const next = (() => { const n = qs.get("next") || "/"; return n.startsWith("/") && !n.startsWith("//") ? n : "/"; })();
  let invite = (hash.get("invite") || qs.get("invite") || "").toUpperCase();
  const msg = (t, ok) => { const m = $("#msg"); m.textContent = t || ""; m.className = "msg " + (ok ? "ok" : t ? "bad" : ""); };
  try {
    const th = localStorage.getItem("mybit_theme");
    if (th) document.documentElement.dataset.theme = JSON.parse(th);
  } catch (e) { /* bỏ qua */ }

  function show(pane) {
    document.querySelectorAll("[data-pane]").forEach((f) => (f.hidden = f.dataset.pane !== pane));
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === pane));
    $("#gbox").hidden = !(window.__gcid && (pane === "login" || pane === "signup"));
    msg("");
  }
  document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  document.querySelectorAll("[data-go]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); show(a.dataset.go); }));

  async function post(path, body) {
    const r = await fetch("/api/auth/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    let j = {};
    try { j = await r.json(); } catch (e) { /* rỗng */ }
    if (!r.ok) { const e = new Error(j.error || `Lỗi ${r.status}`); e.pending = j.pending; throw e; }
    return j;
  }
  const form = (f) => Object.fromEntries(new FormData(f).entries());
  const busy = (f, on) => f.querySelectorAll("button,input").forEach((x) => (x.disabled = on));
  function done(j) {
    if (j.pending) { msg("Đã gửi yêu cầu. Quản trị viên sẽ duyệt và báo cho anh/chị – sau đó đăng nhập bằng email vừa đăng ký.", true); return; }
    msg("Đăng nhập thành công…", true);
    location.replace(next);
  }
  async function handle(f, fn) {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const d = form(f);
      busy(f, true); msg("");
      try { await fn(d); } catch (err) { msg(err.message); } finally { busy(f, false); }
    };
  }
  handle($("#f-login"), async (d) => done(await post("login", d)));
  handle($("#f-signup"), async (d) => done(await post("signup", { ...d, invite: (d.invite || "").trim().toUpperCase() })));
  handle($("#f-forgot"), async (d) => {
    const j = await post("forgot", d);
    msg(j.mailed ? "Nếu email có trong hệ thống, liên kết đặt lại đã được gửi (kiểm tra cả hộp thư rác)." : "Đã ghi nhận. Quản trị viên sẽ gửi liên kết đặt lại mật khẩu cho anh/chị.", true);
  });
  handle($("#f-reset"), async (d) => done(await post("reset", { ...d, token: hash.get("reset") })));

  if (invite) { $("#f-signup [name=invite]").value = invite; $("#invHint").textContent = "(đã điền từ liên kết mời)"; }
  show(hash.get("reset") ? "reset" : invite || hash.has("signup") ? "signup" : "login");

  // đã đăng nhập rồi thì vào thẳng
  fetch("/api/auth/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.me && !j.legacy && !hash.get("reset")) location.replace(next); }).catch(() => {});

  // đăng nhập Google (nếu quản trị viên đã cài Client ID)
  fetch("/api/auth/config").then((r) => r.json()).then((c) => {
    if (!c.google_client_id) return;
    window.__gcid = c.google_client_id;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => {
      /* global google */
      google.accounts.id.initialize({
        client_id: c.google_client_id,
        callback: async (resp) => {
          try { done(await post("google", { credential: resp.credential, invite: ($("#f-signup [name=invite]").value || invite).trim().toUpperCase() })); }
          catch (err) { msg(err.message); }
        },
      });
      google.accounts.id.renderButton($("#gbtn"), { theme: "outline", size: "large", width: 320, text: "continue_with", locale: "vi" });
      show(document.querySelector("[data-pane]:not([hidden])")?.dataset.pane || "login");
    };
    document.head.appendChild(s);
  }).catch(() => {});
})();
