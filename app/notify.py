"""Cảnh báo sau mỗi lượt phân tích: vị thế gần thanh lý, chạm cắt lỗ, xu hướng coin đang giữ đảo chiều, đám đông futures cực đoan,
mở khoá token lớn, đèn thị trường đổi màu. Ghi vào chuông web (D1) + đẩy/email theo cài đặt; Telegram cho chủ sở hữu nếu có."""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

import requests

from . import users
from .analysis import risk
from .analysis.fmt import vn
from .data import store

log = logging.getLogger("notify")
MMR = 0.005


def _liq(side, entry, lev):
    return entry * (1 - 1 / lev + MMR) if side == "long" else entry * (1 + 1 / lev - MMR)


def _p(x):
    x = float(x)
    return f"{x:,.2f}" if x >= 1 else f"{x:.6g}"


def items_for(pf: dict, rows: dict, details: dict, light: str | None = None) -> list[dict]:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = []
    light = light or rows.get("_light") or "yellow"
    peak, eq0 = pf.get("peak"), pf.get("eq")
    dd = max(0.0, (1 - eq0 / peak) * 100) if peak and eq0 else 0.0
    # tổng vị thế ròng / ký quỹ / số lệnh so với mức hệ thống
    net = margin = 0.0
    eq = float(pf.get("cash") or 0)
    for h in pf.get("holdings") or []:
        r = rows.get(h.get("symbol")) or {}
        if r.get("p"):
            v = float(h.get("qty") or 0) * float(r["p"])
            net += v
            eq += v
    for f in pf.get("futures") or []:
        r = rows.get(f.get("symbol")) or {}
        if not r.get("p"):
            continue
        sd = -1 if f.get("side") == "short" else 1
        q, e, lev = float(f.get("qty") or 0), float(f.get("entry") or 0), float(f.get("lev") or 1)
        net += sd * q * float(r["p"])
        m = q * e / max(1.0, lev)
        margin += m
        eq += m + sd * q * (float(r["p"]) - e)
        stop = f.get("stop")
        cap = risk.lev_cap({**r, "k": f.get("symbol")}, f.get("side", "long"), f.get("tf") or "d", abs(e - float(stop)) / e * 100 if stop and e else None, light, dd)
        if lev > cap:
            out.append({"key": f"lev:{f.get('symbol')}:{f.get('side')}:{e}:{lev}:{cap}:{day}", "kind": "liq", "sev": 3, "sym": f.get("symbol"), "url": "#/portfolio",
                        "title": f"{f.get('symbol')}: đòn bẩy x{lev:g} vượt mức hệ thống cho phép x{cap}",
                        "body": f"Nạp thêm {vn(q * e / cap - m, ',.0f')} USD ký quỹ hoặc giảm vị thế còn {vn(q * cap / lev, ',.4f')} {f.get('symbol')}."})
    pcap = risk.PORT_LEV.get(light, 1.0)
    if eq > 0 and abs(net) / eq > pcap:
        out.append({"key": f"portlev:{light}:{day}:{int(abs(net) / eq * 10)}", "kind": "liq", "sev": 3, "url": "#/portfolio",
                    "title": f"Tổng vị thế ròng x{vn(abs(net) / eq, '.2f')} tài sản – vượt mức x{vn(pcap, '.1f')} (đèn {dict(green='xanh', yellow='vàng', red='đỏ').get(light, light)})",
                    "body": f"Giảm khoảng {vn(abs(net) - pcap * eq, ',.0f')} USD vị thế hoặc mở Short phòng hộ."})
    if eq > 0 and margin > risk.MARGIN_MAX * eq:
        out.append({"key": f"margin:{day}", "kind": "liq", "sev": 3, "url": "#/portfolio", "title": f"Tổng ký quỹ {margin / eq * 100:.0f}% tài sản – vượt mức 50%",
                    "body": "Đóng bớt vị thế futures."})
    held = {}
    for h in pf.get("holdings") or []:
        held.setdefault(h.get("symbol"), []).append(("spot", h))
    for f in pf.get("futures") or []:
        held.setdefault(f.get("symbol"), []).append((f.get("side", "long"), f))
    for k, pos in held.items():
        r = rows.get(k)
        if not r or not r.get("p"):
            continue
        p = float(r["p"])
        url = f"#/c/{k}"
        for side, x in pos:
            if side in ("long", "short"):
                lev = float(x.get("lev") or 1)
                e = float(x.get("entry") or 0)
                if e > 0 and lev > 1:
                    lq = _liq(side, e, lev)
                    dist = (p - lq) / p * 100 if side == "long" else (lq - p) / p * 100
                    if dist < 12:
                        out.append({"key": f"liq:{k}:{side}:{e}:{int(dist // 3)}", "kind": "liq", "sev": 3, "sym": k, "url": url + "/fut",
                                    "title": f"{k}: vị thế {side} cách giá thanh lý {dist:.1f}%", "body": f"Giá {_p(p)}, thanh lý ước tính {_p(lq)} (x{lev:g}). Bổ sung ký quỹ hoặc giảm vị thế."})
                st = x.get("stop")
                if st and ((side == "long" and p <= float(st)) or (side == "short" and p >= float(st))):
                    out.append({"key": f"stop:{k}:{side}:{e}:{st}", "kind": "stop", "sev": 3, "sym": k, "url": url + "/plan",
                                "title": f"{k}: giá chạm mức cắt lỗ {_p(st)}", "body": f"Giá hiện tại {_p(p)} – vị thế {side}."})
            ts = r.get("ts")
            if (side in ("spot", "long") and ts == -1) or (side == "short" and ts == 1):
                out.append({"key": f"trend:{k}:{side}:{ts}:{r.get('td', 0) <= 1 and day or 'run'}", "kind": "trend", "sev": 2, "sym": k, "url": url + "/plan",
                            "title": f"{k}: xu hướng ngày {'chuyển giảm' if ts == -1 else 'chuyển tăng'} – ngược vị thế {side}",
                            "body": "Quy tắc theo xu hướng đã thoát lệnh. Cân nhắc giảm tỷ trọng, dời cắt lỗ hoặc phòng hộ bằng perp."})
        for c in (details.get(k) or {}).get("crowd") or []:
            if c.get("sev", 0) >= 2:
                out.append({"key": f"crowd:{k}:{c['k']}:{day}", "kind": "crowd", "sev": 1, "sym": k, "url": url + "/fut", "title": f"{k}: {c['t']}", "body": c["d"]})
        for e in ((details.get(k) or {}).get("val") or {}).get("unlock_next") or []:
            if time.time() <= e["t"] <= time.time() + 7 * 86400 and (e.get("pct") or 0) >= 1:
                d = datetime.fromtimestamp(e["t"], tz=timezone.utc).strftime("%d/%m")
                out.append({"key": f"unlock:{k}:{e['t']}", "kind": "unlock", "sev": 2, "sym": k, "url": url + "/val",
                            "title": f"{k}: mở khoá {e['pct']:.1f}% lượng lưu hành ngày {d}", "body": f"{e.get('cat') or ''} {e.get('desc') or ''}".strip()})
    # kế hoạch đã lưu: tới điểm vào / mục tiêu / cắt lỗ / hết thời gian
    now_ms = time.time() * 1000
    for pl in pf.get("plans") or []:
        k = pl.get("k")
        r = rows.get(k)
        if not r or not r.get("p"):
            continue
        p, L = float(r["p"]), pl.get("side") == "long"
        e, s, t1, t2 = (float(pl.get(x) or 0) for x in ("e", "s", "t1", "t2"))
        pid = pl.get("id") or f"{k}{e}"
        url = f"#/c/{k}/plan"
        side = "Long" if L else "Short"
        ev = None
        if (L and p <= s) or (not L and p >= s):
            ev = ("stop", 3, f"{k}: kế hoạch {side} chạm cắt lỗ {_p(s)}", f"Giá {_p(p)}. Thoát lệnh theo kế hoạch.")
        elif (L and p >= t2) or (not L and p <= t2):
            ev = ("t2", 2, f"{k}: chạm mục tiêu 2 {_p(t2)}", f"Giá {_p(p)} – chốt phần còn lại.")
        elif (L and p >= t1) or (not L and p <= t1):
            ev = ("t1", 2, f"{k}: chạm mục tiêu 1 {_p(t1)}", f"Giá {_p(p)} – chốt 50%, dời cắt lỗ về {_p(e)}.")
        elif pl.get("tstop") and now_ms > float(pl["tstop"]):
            ev = ("time", 2, f"{k}: hết thời gian kỳ vọng của kế hoạch {side}", f"Chưa chạm mục tiêu 1 ({_p(t1)}) đúng hạn – cân nhắc thoát. Giá {_p(p)}.")
        elif pl.get("order") == "limit" and ((L and p <= e * 1.003) or (not L and p >= e * 0.997)):
            ev = ("entry", 2, f"{k}: giá tới điểm vào {_p(e)} ({side})", f"Giá {_p(p)}. Cắt lỗ {_p(s)}, mục tiêu {_p(t1)} / {_p(t2)}.")
        if ev:
            out.append({"key": f"plan:{pid}:{ev[0]}", "kind": "stop" if ev[0] == "stop" else "alert", "sev": ev[1], "sym": k, "url": url, "title": ev[2], "body": ev[3]})
    return out


def telegram(text: str) -> bool:
    tok, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not tok or not chat:
        return False
    try:
        r = requests.post(f"https://api.telegram.org/bot{tok}/sendMessage", json={"chat_id": chat, "text": text[:3900], "disable_web_page_preview": True}, timeout=20)
        return r.ok
    except requests.RequestException:
        return False


def run(market: dict, rows: list[dict], details: dict) -> dict:
    by = {r["k"]: r for r in rows}
    meta = store.meta()
    light = (market.get("light") or {}).get("color")
    prev = meta.get("light_last")
    common = []
    if light and prev and light != prev:
        common.append({"key": f"light:{light}:{datetime.now(timezone.utc):%Y%m%d%H}", "kind": "light", "sev": 2, "url": "#/",
                       "title": f"Đèn thị trường crypto đổi sang {dict(green='XANH', yellow='VÀNG', red='ĐỎ')[light]}", "body": (market.get("light") or {}).get("text", "")})
    meta["light_last"] = light
    store.save_meta(meta)
    out = {"users": 0, "new": 0}
    be = users.backend()
    us = users.load(be) if be else None
    if us:
        cfg = users.config(be)
        for u in us:
            items = common + items_for((u.get("data") or {}).get("portfolio") or {}, by, details, light)
            try:
                res = users.deliver(be, cfg, u, items, "MyBit – cảnh báo")
                out["users"] += 1
                out["new"] += res.get("new", 0)
            except Exception as e:  # noqa: BLE001
                log.warning("deliver %s: %s", u.get("email"), e)
    elif common:
        telegram("\n".join(f"{x['title']}\n{x['body']}" for x in common))
    log.info("Thông báo: %s", out)
    return out
