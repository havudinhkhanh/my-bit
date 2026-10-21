"""Phân tích phái sinh: funding, OI, basis, long/short – gộp nhiều sàn (Bitget, OKX, Gate, Hyperliquid, Binance lưu trữ).

Diễn giải theo kinh nghiệm thị trường perp:
 - Funding dương cao = phe Long trả phí để giữ lệnh → đông người Long, dễ bị "xả" (long squeeze) khi giá quay đầu.
 - Funding âm sâu = phe Short đông → dễ bị ép tăng (short squeeze).
 - Giá ↑ + OI ↑: tiền mới mở Long (xu hướng có lực). Giá ↑ + OI ↓: Short đóng lệnh (tăng do cắt lỗ, kém bền).
   Giá ↓ + OI ↑: Short mới mở (bán chủ động). Giá ↓ + OI ↓: Long cắt lỗ / xả đòn bẩy (thường gần cuối nhịp giảm).
"""
from __future__ import annotations

import math

import numpy as np

from .fmt import vn
import pandas as pd


def _f(x, nd=4):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else round(x, nd)


def f8(funding, interval_h) -> float | None:
    """Quy funding 1 kỳ về mức tương đương 8 giờ (%)."""
    if funding is None or funding != funding:
        return None
    ih = interval_h if interval_h and interval_h == interval_h and interval_h > 0 else 8.0
    return float(funding) * 8.0 / ih * 100


def venues(fut_map: dict, now: pd.DataFrame) -> list[dict]:
    """fut_map: {sàn: {base, mult, inst}} của coin; now: ảnh chụp futures mới nhất (mọi sàn)."""
    out = []
    if now is None or now.empty:
        return out
    idx = now.set_index(["ex", "base"])
    for ex, v in fut_map.items():
        try:
            r = idx.loc[(ex, v["base"])]
        except KeyError:
            continue
        if isinstance(r, pd.DataFrame):
            r = r.iloc[0]
        m = v.get("mult") or 1
        out.append({"ex": ex, "inst": v.get("inst"), "price": _f((r.get("price") or 0) / m, 10), "oi_usd": _f(r.get("oi_usd"), 0),
                    "vol_usd": _f(r.get("vol_usd"), 0), "f8": _f(f8(r.get("funding"), r.get("interval_h")), 5),
                    "interval_h": _f(r.get("interval_h"), 1), "basis": _f((r.get("basis") or 0) * 100, 4) if r.get("basis") == r.get("basis") else None,
                    "max_lev": _f(r.get("max_lev"), 0)})
    out.sort(key=lambda x: -(x.get("oi_usd") or 0))
    return out


def oi_change(fut_map: dict, hist: pd.DataFrame, hours: float) -> float | None:
    """% thay đổi tổng OI (các sàn có đủ dữ liệu 2 thời điểm)."""
    if hist is None or hist.empty:
        return None
    ts = hist["ts"].max()
    tgt = ts - pd.Timedelta(hours=hours)
    times = hist["ts"].drop_duplicates().sort_values()
    old_t = times[times <= tgt + pd.Timedelta(hours=max(1.5, hours * 0.1))]
    if old_t.empty:
        return None
    old_t = old_t.iloc[-1]
    if (tgt - old_t) > pd.Timedelta(hours=max(3, hours * 0.25)):
        return None
    a = b = 0.0
    for ex, v in fut_map.items():
        sel = hist[(hist["ex"] == ex) & (hist["base"] == v["base"])]
        x = sel[sel["ts"] == ts]["oi_usd"]
        y = sel[sel["ts"] == old_t]["oi_usd"]
        if len(x) and len(y) and y.iloc[0] and y.iloc[0] > 0:
            a += float(x.iloc[0])
            b += float(y.iloc[0])
    return (a / b - 1) * 100 if b > 0 else None


def funding_stats(fh: pd.DataFrame | None, cur8: float | None, interval_h: float | None) -> dict:
    """fh: lịch sử funding 1 sàn (time, rate, ex). Trả: trung bình 7/30 ngày (8h-equiv, %), phân vị hiện tại trong 90 ngày, tỉ lệ kỳ dương."""
    if fh is None or fh.empty:
        return {}
    d = fh.sort_values("time").copy()
    # Bitget/HL: rate là mức 1 kỳ – suy độ dài kỳ từ khoảng cách thời gian
    dt = d["time"].diff().dt.total_seconds().median() / 3600 if len(d) > 2 else (interval_h or 8)
    ih = dt if dt and dt > 0 else (interval_h or 8)
    d["f8"] = d["rate"] * 8.0 / ih * 100
    end = d["time"].max()
    out = {"interval_h": _f(ih, 2)}
    for n in (1, 7, 30):
        s = d[d["time"] > end - pd.Timedelta(days=n)]["f8"]
        if len(s):
            out[f"avg{n}d"] = _f(s.mean(), 5)
    s90 = d[d["time"] > end - pd.Timedelta(days=90)]["f8"]
    c = cur8 if cur8 is not None else (float(d["f8"].iloc[-1]) if len(d) else None)
    if len(s90) >= 20 and c is not None:
        out["pctl90"] = _f((s90 < c).mean() * 100, 1)
    s30 = d[d["time"] > end - pd.Timedelta(days=30)]["f8"]
    if len(s30):
        out["pos30"] = _f((s30 > 0).mean() * 100, 1)
    out["series"] = [[t.strftime("%Y-%m-%dT%H:%M"), round(float(v), 5)] for t, v in zip(d["time"].tail(270), d["f8"].tail(270))]
    return out


def quadrant(px_chg: float | None, oi_chg: float | None) -> dict | None:
    if px_chg is None or oi_chg is None:
        return None
    up, oiu = px_chg > 0.5, oi_chg > 2
    dn, oid = px_chg < -0.5, oi_chg < -2
    if up and oiu:
        return {"k": "long_build", "t": "Giá ↑ OI ↑", "d": "Tiền mới mở Long – đà tăng có lực đỡ (nhưng nếu funding nóng thì dễ bị xả)"}
    if up and oid:
        return {"k": "short_cover", "t": "Giá ↑ OI ↓", "d": "Short đóng lệnh/cắt lỗ – nhịp tăng do ép short, thường kém bền nếu không có Long mới vào"}
    if dn and oiu:
        return {"k": "short_build", "t": "Giá ↓ OI ↑", "d": "Short mới mở – bán chủ động; nếu funding đã âm sâu thì cẩn thận cú ép short"}
    if dn and oid:
        return {"k": "long_flush", "t": "Giá ↓ OI ↓", "d": "Long cắt lỗ / xả đòn bẩy – áp lực giảm dần khi OI đã sạch"}
    return {"k": "flat", "t": "Đi ngang", "d": "Giá và OI chưa có thay đổi đáng kể"}


def crowding(f8_now, fstats: dict, oi7, px7, lsr, cfg: dict) -> list[dict]:
    hot, cold = float(cfg.get("funding_hot_8h", 0.05)), float(cfg.get("funding_cold_8h", -0.03))
    out = []
    p = fstats.get("pctl90")
    if f8_now is not None:
        if f8_now >= hot or (p is not None and p >= 95 and f8_now > 0.02):
            k = "long_crowded"
            d = f"Funding {vn(f8_now, '+.3f')}%/8h" + (f" (cao hơn {p:.0f}% thời gian 90 ngày)" if p is not None else "")
            if (oi7 or 0) > 15:
                d += f", OI tăng {oi7:.0f}%/7 ngày"
            out.append({"k": k, "sev": 2 if f8_now >= hot * 2 else 1, "t": "Long quá đông", "d": d + " → rủi ro bị xả Long khi giá quay đầu; Long mới nên chờ funding hạ nhiệt"})
        elif f8_now <= cold or (p is not None and p <= 5 and f8_now < 0):
            d = f"Funding {vn(f8_now, '+.3f')}%/8h" + (f" (thấp hơn {100 - p:.0f}% thời gian 90 ngày)" if p is not None else "")
            if (oi7 or 0) > 10:
                d += f", OI tăng {oi7:.0f}%/7 ngày"
            out.append({"k": "short_crowded", "sev": 2 if f8_now <= cold * 2 else 1, "t": "Short quá đông",
                        "d": d + " → dễ có cú ép Short (tăng gắt); không nên Short đuổi"})
    if oi7 is not None and oi7 >= 40 and px7 is not None and abs(px7) < 10:
        out.append({"k": "oi_spike", "sev": 1, "t": "OI tăng vọt, giá chưa chạy", "d": f"OI +{oi7:.0f}%/7 ngày trong khi giá {px7:+.0f}% → đòn bẩy dồn tích, sắp có biến động mạnh"})
    if lsr is not None and lsr >= 3:
        out.append({"k": "lsr_high", "sev": 1, "t": "Đa số tài khoản đang Long", "d": f"Tỉ lệ tài khoản Long/Short Binance {vn(lsr, '.2f')} – tín hiệu ngược (đám đông nhỏ lẻ thường sai ở cực trị)"})
    elif lsr is not None and lsr <= 0.7:
        out.append({"k": "lsr_low", "sev": 1, "t": "Đa số tài khoản đang Short", "d": f"Tỉ lệ tài khoản Long/Short Binance {vn(lsr, '.2f')} – đám đông nghiêng Short"})
    return out


def carry(vlist: list[dict], fstats: dict, has_spot: bool) -> dict | None:
    """Giao dịch chênh lệch funding (mua spot + bán perp cùng lượng: trung tính giá, hưởng funding)."""
    if not has_spot or not vlist:
        return None
    best = max((v for v in vlist if v.get("f8") is not None), key=lambda v: v["f8"], default=None)
    if not best:
        return None
    a7 = fstats.get("avg7d")
    a30 = fstats.get("avg30d")
    base = a7 if a7 is not None else best["f8"]
    ann = base * 3 * 365
    cost = 0.4      # % – mở + đóng cả 2 chân (phí taker ~0,1%/chân/lượt)
    return {"ex": best["ex"], "f8_now": best["f8"], "ann_now": _f(best["f8"] * 3 * 365, 1), "ann7": _f(a7 * 3 * 365, 1) if a7 is not None else None,
            "ann30": _f(a30 * 3 * 365, 1) if a30 is not None else None, "pos30": fstats.get("pos30"), "cost": cost,
            "net_30d": _f(base * 3 * 30 - cost, 2), "ok": bool(ann >= 15 and (fstats.get("pos30") or 0) >= 70)}


def bnm_stats(b: pd.DataFrame | None) -> dict:
    if b is None or b.empty:
        return {}
    b = b.sort_values("date")
    L = b.iloc[-1]
    out = {"date": L["date"].strftime("%Y-%m-%d"), "oi_usd": _f(L.get("oi_usd"), 0), "lsr_acct": _f(L.get("lsr_acct"), 3),
           "lsr_top_pos": _f(L.get("lsr_top_pos"), 3), "taker": _f(L.get("taker_ratio"), 3)}
    for n in (1, 7, 30):
        if len(b) > n and b["oi_usd"].iloc[-1 - n]:
            out[f"oi{n}d"] = _f((b["oi_usd"].iloc[-1] / b["oi_usd"].iloc[-1 - n] - 1) * 100, 2)
    out["series"] = [[d.strftime("%Y-%m-%d"), _f(o, 0), _f(l, 3), _f(t, 3)] for d, o, l, t in
                     zip(b["date"].tail(120), b["oi_usd"].tail(120), b["lsr_acct"].tail(120), b["taker_ratio"].tail(120))]
    return out
