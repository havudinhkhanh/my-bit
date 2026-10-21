"""Kiểm soát đòn bẩy – giống hệt quy tắc trong site/app.js (levGov / GOV). Dùng để gửi cảnh báo khi vị thế của anh vượt mức."""
from __future__ import annotations

from datetime import datetime, timedelta

BASE = {"d": {"green": 3, "yellow": 2, "red": 1}, "h4": {"green": 5, "yellow": 3, "red": 2}}
SHORT_RED = {"d": 2, "h4": 3}
PORT_LEV = {"green": 1.5, "yellow": 1.0, "red": 0.6}
MARGIN_MAX, MAX_POS = 0.5, 5


def lev_cap(row: dict, side: str, tf: str, stop_pct: float | None, light: str, dd: float = 0.0) -> int:
    tfk = "d" if tf == "d" else "h4"
    light = light or "yellow"
    cap = SHORT_RED[tfk] if side == "short" and light == "red" else BASE[tfk].get(light, 2)
    atr = row.get("atr")
    if atr is not None:
        cap = min(cap, 10 if atr <= 3 else 5 if atr <= 5 else 3 if atr <= 8 else 2 if atr <= 12 else 1)
    mc = row.get("mc") or 0
    big = row.get("k") in ("BTC", "ETH") or row.get("id") in ("bitcoin", "ethereum")
    cap = min(cap, 10 if big else 5 if mc >= 1e10 else 3 if mc >= 1e9 else 2 if mc >= 2e8 else 1)
    cr = row.get("cr") or []
    if (side == "long" and "long_crowded" in cr) or (side == "short" and "short_crowded" in cr):
        cap = max(1, cap - 1)
    if stop_pct:
        mmr = 0.01 if mc < 1e9 else 0.005
        cap = min(cap, max(1, int(1 / (2.2 * stop_pct / 100 + mmr + 0.002))))
    if row.get("ml"):
        cap = min(cap, int(row["ml"]))
    if dd >= 20:
        cap = 1
    elif dd >= 10:
        cap = min(cap, 2)
    return max(1, int(cap))


# ------------------------------------------------------------------ theo dõi tài khoản (chạy mỗi 15 phút trên máy chủ)
DAY_STOP = -3.0     # lỗ ≥ 3% trong ngày → dừng mở lệnh mới tới hết ngày (giờ Việt Nam)
WEEK_HALF = -6.0    # lỗ ≥ 6% trong tuần → rủi ro mỗi lệnh giảm 1/2 tới hết tuần
STREAK = 3          # thua 3 lệnh liên tiếp → rủi ro giảm 1/2 trong 24 giờ


def equity(pf: dict, price) -> dict:
    """Tài sản = tiền mặt + spot theo giá + (ký quỹ + lãi/lỗ) futures. 'basis' = vốn đã bỏ vào (để nhận biết nạp/rút)."""
    cash = float(pf.get("cash") or 0)
    eq, basis, gross = cash, cash, 0.0
    for h in pf.get("holdings") or []:
        p = price(h.get("symbol"))
        q, c = float(h.get("qty") or 0), float(h.get("cost") or 0)
        basis += q * (c or (p or 0))
        if p:
            eq += q * p
            gross += q * p
        else:
            eq += q * c
    for f in pf.get("futures") or []:
        p = price(f.get("symbol"))
        q, e, lev = float(f.get("qty") or 0), float(f.get("entry") or 0), max(1.0, float(f.get("lev") or 1))
        sd = -1 if f.get("side") == "short" else 1
        m = q * e / lev
        basis += m
        eq += m + (sd * q * (p - e) if p else 0)
        gross += q * (p or e)
    realized = sum(float(j.get("pnl") or 0) for j in (pf.get("journal") or []))
    return {"eq": eq, "basis": basis - realized, "gross": gross}


def update_state(st: dict | None, pf: dict, price, now: datetime) -> dict:
    """Cập nhật mốc tài sản: đỉnh, đầu ngày, đầu tuần; nạp/rút tiền (vốn bỏ vào thay đổi) được trừ ra để không tính nhầm là lãi/lỗ."""
    from datetime import timedelta
    st = dict(st or {})
    E = equity(pf, price)
    eq = E["eq"]
    vn_now = now + timedelta(hours=7)
    day, week = vn_now.strftime("%Y-%m-%d"), (vn_now - timedelta(days=vn_now.weekday())).strftime("%Y-%m-%d")
    flow = E["basis"] - float(st.get("basis", E["basis"]))
    if abs(flow) > 1e-6:                      # nạp / rút / thêm vị thế bằng vốn mới → dời các mốc theo
        for k in ("peak", "day0", "week0"):
            if st.get(k) is not None:
                st[k] = float(st[k]) + flow
    st["basis"] = E["basis"]
    if eq <= 0:
        st.update({"eq": eq, "at": now.isoformat(timespec="seconds")})
        return st
    if st.get("day") != day or st.get("day0") is None:
        st["day"], st["day0"] = day, eq
    if st.get("week") != week or st.get("week0") is None:
        st["week"], st["week0"] = week, eq
    st["peak"] = max(float(st.get("peak") or eq), eq)
    st["eq"] = eq
    st["gross"] = E["gross"]
    st["day_pct"] = (eq / st["day0"] - 1) * 100 if st["day0"] else 0.0
    st["week_pct"] = (eq / st["week0"] - 1) * 100 if st["week0"] else 0.0
    st["dd"] = max(0.0, (1 - eq / st["peak"]) * 100) if st["peak"] else 0.0
    # chuỗi thua
    J = sorted(pf.get("journal") or [], key=lambda j: j.get("closed") or "")
    streak = 0
    for j in reversed(J):
        if float(j.get("pnl") or 0) < 0:
            streak += 1
        else:
            break
    st["streak"] = streak
    last_loss = J[-1].get("closed") if J and streak else None
    # khoá / giảm rủi ro
    st["halt"] = st["day_pct"] <= DAY_STOP
    st["halt_until"] = (vn_now.replace(hour=23, minute=59, second=0, microsecond=0) - timedelta(hours=7)).isoformat(timespec="seconds") if st["halt"] else None
    half = []
    if st["week_pct"] <= WEEK_HALF:
        half.append(f"lỗ {st['week_pct']:.1f}% trong tuần")
    if streak >= STREAK and last_loss:
        try:
            if now - datetime.fromisoformat(last_loss.replace("Z", "")) < timedelta(hours=24):
                half.append(f"thua {streak} lệnh liên tiếp")
        except ValueError:
            pass
    st["half"] = half
    h = st.get("hist") or []
    if not h or (now - datetime.fromisoformat(h[-1][0])).total_seconds() >= 3000:      # ~1 điểm/giờ, giữ 90 ngày
        h.append([now.isoformat(timespec="seconds"), round(eq, 2)])
    st["hist"] = h[-2200:]
    st["at"] = now.isoformat(timespec="seconds")
    return st
