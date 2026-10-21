"""Kiểm soát đòn bẩy – giống hệt quy tắc trong site/app.js (levGov / GOV). Dùng để gửi cảnh báo khi vị thế của anh vượt mức."""
from __future__ import annotations

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
