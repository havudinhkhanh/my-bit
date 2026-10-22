"""Người dùng của trang web (Cloudflare D1) cho các lượt chạy Python.

Đọc danh mục / theo dõi / khẩu vị / cài đặt thông báo của từng người, ghi lại phần tư vấn riêng và thông báo,
gửi thông báo đẩy (Web Push, khoá VAPID do trang web tự tạo và lưu trong D1) và email (SMTP hoặc Resend).

Kết nối:
  - D1 qua API Cloudflare: CF_ACCOUNT_ID, CF_API_TOKEN (quyền D1 Edit), D1_DATABASE_ID;
  - hoặc tệp SQLite cục bộ (MYBIT_D1_SQLITE) để chạy thử.
Không có kết nối → None: hệ thống chạy như cũ (một chủ sở hữu, danh mục trong KV / tệp).
"""
from __future__ import annotations

import json
import logging
import os
import smtplib
import sqlite3
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.utils import formataddr

import requests

from . import webpush
from .config import ROOT

log = logging.getLogger("users")
PLANS = json.loads((ROOT / "functions" / "_lib" / "plans.json").read_text(encoding="utf-8"))
DATA_KEYS = ("portfolio", "watchlist", "profile", "notify", "assumptions", "journal", "peermap", "_nstate", "risk", "bot", "botstate", "botplan")
SEV_MIN = {"all": 0, "normal": 1, "important": 2, "off": 99}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


class D1:
    def __init__(self, acc: str, tok: str, db: str):
        self.url = f"https://api.cloudflare.com/client/v4/accounts/{acc}/d1/database/{db}/query"
        self.h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    def q(self, sql: str, params: list | None = None) -> tuple[list[dict], dict]:
        for i in range(3):
            try:
                r = requests.post(self.url, headers=self.h, json={"sql": sql, "params": params or []}, timeout=40)
                j = r.json()
                if not j.get("success"):
                    raise RuntimeError(str(j.get("errors"))[:300])
                res = (j.get("result") or [{}])[0]
                return res.get("results") or [], res.get("meta") or {}
            except (requests.RequestException, ValueError) as e:
                if i == 2:
                    raise
                log.warning("D1 lỗi mạng (%s) – thử lại", e)
        return [], {}


class Sqlite:
    def __init__(self, path: str):
        self.c = sqlite3.connect(path)
        self.c.row_factory = sqlite3.Row

    def q(self, sql: str, params: list | None = None) -> tuple[list[dict], dict]:
        cur = self.c.execute(sql, params or [])
        rows = [dict(r) for r in cur.fetchall()] if cur.description else []
        self.c.commit()
        return rows, {"changes": cur.rowcount}


def backend():
    if os.environ.get("MYBIT_D1_SQLITE"):
        return Sqlite(os.environ["MYBIT_D1_SQLITE"])
    acc, tok, db = os.environ.get("CF_ACCOUNT_ID"), os.environ.get("CF_API_TOKEN"), os.environ.get("D1_DATABASE_ID")
    if acc and tok and db:
        return D1(acc, tok, db)
    return None


def _eff_plan(u: dict) -> str:
    if u.get("plan_until") and u["plan_until"] < datetime.now().strftime("%Y-%m-%d"):
        return "free"
    return u["plan"] if u.get("plan") in PLANS["plans"] else "free"


def features(u: dict) -> set:
    if u.get("role") == "admin":
        return {f for p in PLANS["plans"].values() for f in p["features"]}
    return set(PLANS["plans"][_eff_plan(u)]["features"])


def load(be) -> list[dict] | None:
    """Người dùng đang hoạt động (kèm dữ liệu riêng), quản trị viên đứng trước. None nếu chưa có bảng."""
    try:
        users, _ = be.q("SELECT id, email, name, role, plan, plan_until, status FROM users WHERE status = 'active' ORDER BY (role = 'admin') DESC, id")
    except Exception as e:  # noqa: BLE001
        log.warning("Chưa đọc được danh sách người dùng (D1): %s", e)
        return None
    by = {u["id"]: {**u, "data": {}, "push": [], "eff_plan": _eff_plan(u)} for u in users}
    if not by:          # chưa ai đăng ký (kể cả chủ sở hữu) → chạy như cũ
        return None
    rows, _ = be.q(f"SELECT user_id, key, value FROM user_data WHERE key IN ({','.join('?' * len(DATA_KEYS))})", list(DATA_KEYS))
    for r in rows:
        if r["user_id"] in by:
            try:
                by[r["user_id"]]["data"][r["key"]] = json.loads(r["value"])
            except ValueError:
                pass
    subs, _ = be.q("SELECT id, user_id, endpoint, p256dh, auth FROM push_subs")
    for s in subs:
        if s["user_id"] in by:
            by[s["user_id"]]["push"].append(s)
    out = list(by.values())
    for u in out:
        u["features"] = features(u)
    return out


def config(be) -> dict:
    try:
        rows, _ = be.q("SELECT key, value FROM config")
        return {r["key"]: r["value"] for r in rows}
    except Exception:  # noqa: BLE001
        return {}


def save(be, uid: int, key: str, obj) -> None:
    be.q("INSERT INTO user_data(user_id, key, value, updated_at) VALUES(?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
         [uid, key, json.dumps(obj, ensure_ascii=False, default=str), now_iso()])


def add_notifications(be, uid: int, items: list[dict]) -> list[dict]:
    """Ghi thông báo (bỏ qua key đã có). Trả về các thông báo MỚI."""
    new = []
    ts = now_iso()
    for i in range(0, len(items), 10):
        chunk = items[i:i + 10]
        vals, params = [], []
        for x in chunk:
            vals.append("(?, ?, ?, ?, ?, ?, ?, ?, ?)")
            params += [uid, x["key"][:200], x.get("kind"), int(x.get("sev") or 0), (x.get("title") or "")[:200], (x.get("body") or "")[:1500],
                       x.get("url"), x.get("sym"), ts]
        rows, _ = be.q("INSERT OR IGNORE INTO notifications(user_id, key, kind, sev, title, body, url, sym, created_at) VALUES "
                       + ", ".join(vals) + " RETURNING key", params)
        got = {r["key"] for r in rows}
        new += [x for x in chunk if x["key"][:200] in got]
    return new


def prefs(u: dict) -> dict:
    p = (u.get("data") or {}).get("notify") or {}
    return {"push": p.get("push", "normal"), "email": p.get("email", "important"), "email_to": p.get("email_to") or u.get("email"),
            "kinds": p.get("kinds") or {}}


def _wanted(u: dict, items: list[dict], channel: str) -> list[dict]:
    pr = prefs(u)
    lvl = SEV_MIN.get(pr[channel], 2)
    off = {k for k, v in (pr.get("kinds") or {}).items() if v is False}
    return [x for x in items if int(x.get("sev") or 0) >= lvl and x.get("kind") not in off]


# ---------------------------------------------------------------- thông báo đẩy
def _vapid(cfg: dict):
    jwk = cfg.get("vapid_private_jwk")
    if not jwk:
        return None
    try:
        return webpush.vapid_key_from_jwk(json.loads(jwk))
    except Exception as e:  # noqa: BLE001
        log.warning("Khoá VAPID lỗi: %s", e)
        return None


def send_push(be, cfg: dict, u: dict, items: list[dict], site_url: str = "") -> int:
    if "notify_push" not in u["features"] or not u["push"]:
        return 0
    want = _wanted(u, items, "push")
    if not want:
        return 0
    key = _vapid(cfg)
    if key is None:
        return 0
    top = sorted(want, key=lambda x: -int(x.get("sev") or 0))
    one = len(top) == 1
    base = site_url.rstrip("/") + "/" if site_url else "/"
    payload = {"title": top[0]["title"] if one else f"MyBit: {len(top)} việc mới",
               "body": (top[0].get("body") or "")[:180] if one else " · ".join(x["title"] for x in top[:4])[:180],
               "url": base + ((top[0].get("url") or "#/") if one else "#/notifications"), "tag": "mybit-" + top[0]["key"][:40]}
    subject = "mailto:" + (os.environ.get("VAPID_SUBJECT_EMAIL") or cfg.get("smtp_user") or "admin@example.com")
    ok = 0
    for s in u["push"]:
        try:
            code = webpush.send({"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}}, payload, key, subject)
        except Exception as e:  # noqa: BLE001
            log.warning("Đẩy tới %s lỗi %s", u["email"], e)
            continue
        if code in (200, 201, 202):
            be.q("UPDATE push_subs SET last_ok = ?, fails = 0 WHERE id = ?", [now_iso(), s["id"]])
            ok += 1
        elif code in (404, 410):
            be.q("DELETE FROM push_subs WHERE id = ?", [s["id"]])
        else:
            be.q("UPDATE push_subs SET fails = fails + 1 WHERE id = ?", [s["id"]])
            log.warning("Đẩy tới %s: HTTP %s", u["email"], code)
    return ok


# ---------------------------------------------------------------- email
def send_email(cfg: dict, u: dict, items: list[dict], subject: str, site_url: str = "") -> bool:
    if "notify_email" not in u["features"]:
        return False
    want = _wanted(u, items, "email")
    if not want:
        return False
    to = prefs(u)["email_to"]
    rows = "".join(f"<tr><td style='padding:6px 8px;border-bottom:1px solid #eee'><b>{_e(x['title'])}</b><br><span style='color:#555'>{_e(x.get('body') or '')}</span>"
                   + (f"<br><a href='{site_url.rstrip('/')}/{x.get('url') or ''}'>Mở</a>" if site_url else "") + "</td></tr>" for x in want)
    body = (f"<div style='font-family:Arial,sans-serif;font-size:14px'><p>Chào {_e(u.get('name') or '')},</p><table style='border-collapse:collapse;width:100%'>{rows}</table>"
            f"<p style='color:#888;font-size:12px'>Đổi cài đặt nhận email trong trang Tài khoản. Thông tin chỉ để tham khảo, không phải khuyến nghị đầu tư.</p></div>")
    return send_html(cfg, to, subject, body)


def send_html(cfg: dict, to: str, subject: str, body: str) -> bool:
    """Gửi một email HTML qua SMTP (ưu tiên) hoặc Resend."""
    smtp_user = os.environ.get("SMTP_USER") or cfg.get("smtp_user")
    smtp_pass = os.environ.get("SMTP_PASS") or cfg.get("smtp_pass")
    resend = os.environ.get("RESEND_API_KEY") or cfg.get("resend_key")
    sender = cfg.get("mail_from") or os.environ.get("MAIL_FROM") or smtp_user
    try:
        if smtp_user and smtp_pass:
            host = os.environ.get("SMTP_HOST") or cfg.get("smtp_host") or "smtp.gmail.com"
            port = int(os.environ.get("SMTP_PORT") or cfg.get("smtp_port") or 465)
            msg = MIMEText(body, "html", "utf-8")
            msg["Subject"], msg["To"] = subject, to
            msg["From"] = sender if "<" in (sender or "") else formataddr(("MyBit", sender))
            with (smtplib.SMTP_SSL(host, port, timeout=30) if port == 465 else smtplib.SMTP(host, port, timeout=30)) as s:
                if port != 465:
                    s.starttls()
                s.login(smtp_user, smtp_pass)
                s.send_message(msg)
            return True
        if resend and sender:
            r = requests.post("https://api.resend.com/emails", headers={"Authorization": f"Bearer {resend}"},
                              json={"from": sender, "to": [to], "subject": subject, "html": body}, timeout=20)
            return r.ok
    except Exception as e:  # noqa: BLE001
        log.warning("Email tới %s lỗi: %s", to, e)
    return False


def _e(s: str) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def deliver(be, cfg: dict, u: dict, items: list[dict], subject: str) -> dict:
    """Ghi thông báo vào D1 rồi đẩy / gửi email cho phần MỚI."""
    if not items:
        return {"new": 0}
    new = add_notifications(be, u["id"], items)
    site = os.environ.get("SITE_URL") or cfg.get("site_url") or ""
    res = {"new": len(new), "push": 0, "email": False}
    if new:
        res["push"] = send_push(be, cfg, u, new, site)
        res["email"] = send_email(cfg, u, new, subject, site)
    return res
