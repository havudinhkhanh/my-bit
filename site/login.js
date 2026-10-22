/* MyBit – trang đăng nhập / đăng ký / quên mật khẩu */
"use strict";
(function () {
  const $ = (s) => document.querySelector(s);
  const qs = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const next = (() => { const n = qs.get("next") || "/"; return n.startsWith("/") && !n.startsWith("//") ? n : "/"; })();
  let invite = (hash.get("invite") || qs.get("invite") || "").toUpperCase();
  const EN = {
    "Đăng nhập · MyBit": "Sign in · MyBit",
    "Phân tích crypto spot & futures": "Crypto spot & futures analysis",
    "có số liệu thật, không theo cảm xúc.": "with real data, not emotions.",
    "Bản tin thị trường": "Market briefing", "cập nhật mỗi 4 giờ: BTC, độ rộng, nhóm ngành, funding, OI, tâm lý.": "updated every 4 hours: BTC, breadth, sectors, funding, OI, sentiment.",
    "Danh mục của riêng anh/chị": "Your own portfolio", ": mức cắt lỗ, chốt lời, cảnh báo khi giá chạm.": ": stop-loss, take-profit, alerts when price hits.",
    "Thông báo": "Notifications", "trên web, điện thoại và email khi coin trong danh sách đổi trạng thái.": "on web, phone and email when a watched coin changes status.",
    "Mọi phương pháp đều": "Every method is", "kiểm chứng trên dữ liệu lịch sử crypto": "verified on historical crypto data", "trước khi đưa ra khuyến nghị.": "before it is shown.",
    "Thông tin tham khảo từ hệ thống phân tích tự động, không phải lời khuyên đầu tư. Crypto và đòn bẩy có thể mất toàn bộ vốn.": "Reference information from an automated analysis system, not investment advice. Crypto and leverage can lose all your capital.",
    "Đăng nhập": "Sign in", "Đăng ký": "Sign up", "hoặc": "or", "Mật khẩu": "Password", "Quên mật khẩu?": "Forgot password?", "Họ tên": "Full name",
    "(tối thiểu 8 ký tự)": "(at least 8 characters)", "Mã mời": "Invite code", "(để trống nếu chưa có – yêu cầu sẽ chờ duyệt)": "(leave blank if you don't have one – the request will await approval)",
    "Tạo tài khoản": "Create account", "Nhập email đã đăng ký. Hệ thống gửi liên kết đặt lại mật khẩu (hoặc báo quản trị viên gửi cho anh/chị).": "Enter your registered email. The system sends a password reset link (or asks the admin to send it to you).",
    "Gửi yêu cầu": "Send request", "← Quay lại đăng nhập": "← Back to sign in", "Đặt mật khẩu mới cho tài khoản.": "Set a new password for your account.", "Mật khẩu mới": "New password", "Lưu mật khẩu mới": "Save new password",
    "Đã gửi yêu cầu. Quản trị viên sẽ duyệt và báo cho anh/chị – sau đó đăng nhập bằng email vừa đăng ký.": "Request sent. The admin will approve it and let you know – then sign in with the email you registered.",
    "Đăng nhập thành công…": "Signed in…", "Nếu email có trong hệ thống, liên kết đặt lại đã được gửi (kiểm tra cả hộp thư rác).": "If the email exists, a reset link has been sent (check your spam folder too).",
    "Đã ghi nhận. Quản trị viên sẽ gửi liên kết đặt lại mật khẩu cho anh/chị.": "Noted. The admin will send you a password reset link.", "(đã điền từ liên kết mời)": "(filled from the invite link)",
  };
  let LANG = "vi";
  try { LANG = JSON.parse(localStorage.getItem("mybit_lang")) || "vi"; } catch (e) { /* bỏ qua */ }
  const T = (t) => (LANG === "en" && t && EN[t.trim()] ? t.replace(t.trim(), EN[t.trim()]) : t);
  function trPage() {
    if (LANG !== "en") return;
    document.documentElement.lang = "en"; document.title = T(document.title);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let x = w.nextNode(); x; x = w.nextNode()) { const v = T(x.nodeValue); if (v !== x.nodeValue) x.nodeValue = v; }
  }
  trPage();
  const lb = $("#lang");
  if (lb) { lb.textContent = LANG === "en" ? "VI" : "EN"; lb.onclick = () => { try { localStorage.setItem("mybit_lang", JSON.stringify(LANG === "en" ? "vi" : "en")); } catch (e) { /* bỏ qua */ } location.reload(); }; }
  const msg = (t, ok) => { const m = $("#msg"); m.textContent = T(t) || ""; m.className = "msg " + (ok ? "ok" : t ? "bad" : ""); };
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

  if (invite) { $("#f-signup [name=invite]").value = invite; $("#invHint").textContent = T("(đã điền từ liên kết mời)"); }
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
      google.accounts.id.renderButton($("#gbtn"), { theme: "outline", size: "large", width: 320, text: "continue_with", locale: LANG === "en" ? "en" : "vi" });
      show(document.querySelector("[data-pane]:not([hidden])")?.dataset.pane || "login");
    };
    document.head.appendChild(s);
  }).catch(() => {});
})();
