"""Mức giá & mốc thời gian kiểu "hình học": Fibonacci (thoái lui / mở rộng / vùng thời gian), Gann (Square of 9, chu kỳ thời gian),
hồ sơ khối lượng (POC, vùng giá trị), đỉnh/đáy xoay (swing) – và gom các mức gần nhau thành "vùng hợp lưu".

Lưu ý trung thực: Fibonacci/Gann là quy ước người giao dịch dùng chung (nhiều người đặt lệnh ở đó nên đôi khi tự thành hỗ trợ/kháng cự),
không phải quy luật. Hệ thống chỉ dùng chúng làm mức tham chiếu; điểm vào/ra được kiểm chứng lịch sử ở ideas.py.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from . import indicators as ind
from .fmt import vn

FIB_R = (0.236, 0.382, 0.5, 0.618, 0.786)
FIB_X = (1.272, 1.618, 2.0, 2.618)
FIB_T = (8, 13, 21, 34, 55, 89, 144)
GANN_T = (30, 45, 60, 90, 120, 144, 180, 270, 360)


def sig(x, n=6):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else float(f"{x:.{n}g}")


def pivots(df: pd.DataFrame, atr_mult: float = 2.5, min_bars: int = 3) -> list[tuple[int, float, int, int]]:
    """Zigzag theo ATR: [(chỉ số đỉnh/đáy, giá, +1 đỉnh / -1 đáy, chỉ số nến xác nhận)].
    Một đỉnh chỉ được xác nhận khi giá đã rơi ≥ atr_mult × ATR từ đó (không nhìn trước tương lai)."""
    h, l = df["high"].values, df["low"].values
    a = ind.atr(df, 14).bfill().values
    out = []
    n = len(h)
    if n < 20:
        return out
    trend = 0
    hi_i, hi_p, lo_i, lo_p = 0, h[0], 0, l[0]
    ext_i, ext_p = 0, h[0]
    for i in range(1, n):
        th = atr_mult * a[i]
        if trend == 0:
            if h[i] > hi_p:
                hi_i, hi_p = i, h[i]
            if l[i] < lo_p:
                lo_i, lo_p = i, l[i]
            if hi_p - l[i] >= th and hi_i < i:
                out.append((hi_i, float(hi_p), 1, i))
                trend, ext_i, ext_p = -1, i, l[i]
            elif h[i] - lo_p >= th and lo_i < i:
                out.append((lo_i, float(lo_p), -1, i))
                trend, ext_i, ext_p = 1, i, h[i]
        elif trend == 1:
            if h[i] > ext_p:
                ext_i, ext_p = i, h[i]
            elif ext_p - l[i] >= th and i - ext_i >= min_bars - 1:
                out.append((ext_i, float(ext_p), 1, i))
                trend, ext_i, ext_p = -1, i, l[i]
        else:
            if l[i] < ext_p:
                ext_i, ext_p = i, l[i]
            elif h[i] - ext_p >= th and i - ext_i >= min_bars - 1:
                out.append((ext_i, float(ext_p), -1, i))
                trend, ext_i, ext_p = 1, i, h[i]
    return out


def last_swing(pv: list, close: float) -> dict | None:
    """Sóng gần nhất đã hoàn tất: đáy→đỉnh (sóng tăng) hoặc đỉnh→đáy (sóng giảm)."""
    if len(pv) < 2:
        return None
    a, b = pv[-2], pv[-1]
    up = a[2] == -1 and b[2] == 1
    lo, hi = (a[1], b[1]) if up else (b[1], a[1])
    return {"dir": 1 if up else -1, "i0": a[0], "i1": b[0], "p0": a[1], "p1": b[1], "lo": lo, "hi": hi}


def fib(sw: dict) -> dict:
    lo, hi, up = sw["lo"], sw["hi"], sw["dir"] == 1
    rng = hi - lo
    ret = {str(r): (hi - r * rng) if up else (lo + r * rng) for r in FIB_R}
    ext = {str(x): (lo + x * rng) if up else (hi - x * rng) for x in FIB_X}
    return {"ret": {k: sig(v) for k, v in ret.items()}, "ext": {k: sig(v) for k, v in ext.items() if v > 0}}


def sq9(price: float, n: int = 3) -> dict:
    """Gann Square of 9: các mức (√giá ± k×0,25)² – mỗi 0,25 vòng ~ 90°. Chỉ hữu ích như mức tham chiếu."""
    if not price or price <= 0:
        return {}
    # đưa giá về thang 10–10.000 để vòng xoắn có nghĩa, rồi quy đổi lại
    scale = 10 ** (math.floor(math.log10(price)) - 2)
    p = price / scale
    r = math.sqrt(p)
    up = [sig(((r + 0.25 * k) ** 2) * scale) for k in range(1, n + 1)]
    dn = [sig(((r - 0.25 * k) ** 2) * scale) for k in range(1, n + 1) if r - 0.25 * k > 0]
    return {"up": up, "dn": dn}


def vprofile(df: pd.DataFrame, bars: int = 120, bins: int = 40) -> dict:
    """Hồ sơ khối lượng: mức giá giao dịch nhiều nhất (POC) và vùng 70% khối lượng (VAL–VAH)."""
    d = df.tail(bars)
    if len(d) < 20:
        return {}
    lo, hi = float(d["low"].min()), float(d["high"].max())
    if hi <= lo:
        return {}
    edges = np.linspace(lo, hi, bins + 1)
    vol = np.zeros(bins)
    v = (d["qvol"] if "qvol" in d else d["volume"] * d["close"]).fillna(0).values
    for H, L, V in zip(d["high"].values, d["low"].values, v):
        i0 = max(0, np.searchsorted(edges, L) - 1)
        i1 = min(bins - 1, np.searchsorted(edges, H) - 1)
        n = i1 - i0 + 1
        vol[i0:i1 + 1] += V / max(1, n)
    poc = int(vol.argmax())
    order = np.argsort(-vol)
    tot, acc, sel = vol.sum(), 0.0, []
    for i in order:
        sel.append(i)
        acc += vol[i]
        if acc >= 0.7 * tot:
            break
    mid = (edges[:-1] + edges[1:]) / 2
    return {"poc": sig(mid[poc]), "val": sig(edges[min(sel)]), "vah": sig(edges[max(sel) + 1]),
            "hist": [[sig(m), round(float(x / tot * 100), 2)] for m, x in zip(mid, vol)]}


def time_windows(df: pd.DataFrame, pv: list, tf_days: float = 1.0, horizon_days: int = 120) -> list[dict]:
    """Mốc thời gian Fibonacci (8, 13, 21… nến) và chu kỳ Gann (30, 45, 90… ngày) tính từ đỉnh/đáy lớn gần nhất – các mốc trong tương lai."""
    if not pv:
        return []
    last_t = df["date"].iloc[-1]
    out = []
    for i, p, k, _ in pv[-3:]:
        t0 = df["date"].iloc[i]
        for n in FIB_T:
            t = t0 + pd.Timedelta(days=n * tf_days)
            if last_t < t <= last_t + pd.Timedelta(days=horizon_days):
                out.append({"t": t.strftime("%Y-%m-%d"), "src": f"Fibonacci {n} nến từ {'đỉnh' if k == 1 else 'đáy'} {t0:%d/%m}", "kind": "fib"})
        if tf_days >= 1:
            for n in GANN_T:
                t = t0 + pd.Timedelta(days=n)
                if last_t < t <= last_t + pd.Timedelta(days=horizon_days):
                    out.append({"t": t.strftime("%Y-%m-%d"), "src": f"Gann {n} ngày từ {'đỉnh' if k == 1 else 'đáy'} {t0:%d/%m}", "kind": "gann"})
    out.sort(key=lambda x: x["t"])
    # gộp mốc trùng/kề nhau (±2 ngày) = cửa sổ mạnh hơn
    merged = []
    for x in out:
        if merged and (pd.Timestamp(x["t"]) - pd.Timestamp(merged[-1]["t"])).days <= 2:
            merged[-1]["src"] += " · " + x["src"]
            merged[-1]["n"] += 1
        else:
            merged.append({**x, "n": 1})
    return merged[:12]


def confluence(price: float, atr: float, levels: list[tuple[float, str]]) -> list[dict]:
    """Gom các mức trong khoảng 0,5×ATR thành vùng; vùng càng nhiều nguồn càng đáng chú ý."""
    lv = sorted([(float(p), s) for p, s in levels if p and p > 0], key=lambda t: t[0])
    zones = []
    tol = max(atr * 0.5, price * 0.004)
    for p, s in lv:
        if zones and p - zones[-1]["hi"] <= tol:
            z = zones[-1]
            z["hi"] = max(z["hi"], p)
            z["lo"] = min(z["lo"], p)
            if s not in z["src"]:
                z["src"].append(s)
        else:
            zones.append({"lo": p, "hi": p, "src": [s]})
    out = []
    for z in zones:
        mid = (z["lo"] + z["hi"]) / 2
        out.append({"p": sig(mid), "lo": sig(z["lo"]), "hi": sig(z["hi"]), "n": len(z["src"]), "src": z["src"],
                    "side": "kháng cự" if mid > price else "hỗ trợ", "dist": round((mid / price - 1) * 100, 2)})
    return out


def analyze(df: pd.DataFrame, tf_days: float = 1.0) -> dict:
    """Toàn bộ mức cho 1 khung (ngày hoặc 4h)."""
    if df is None or len(df) < 60:
        return {}
    d = df.reset_index(drop=True)
    price = float(d["close"].iloc[-1])
    atr = float(ind.atr(d, 14).iloc[-1])
    pv = pivots(d, 2.5 if tf_days >= 1 else 3.0)
    sw = last_swing(pv, price)
    out = {"price": sig(price), "atr": sig(atr)}
    levels = []
    if sw:
        f = fib(sw)
        out["swing"] = {"dir": sw["dir"], "lo": sig(sw["lo"]), "hi": sig(sw["hi"]), "t0": d["date"].iloc[sw["i0"]].strftime("%Y-%m-%d"),
                        "t1": d["date"].iloc[sw["i1"]].strftime("%Y-%m-%d")}
        out["fib"] = f
        rng = sw["hi"] - sw["lo"]
        out["retr_now"] = round((sw["hi"] - price) / rng, 3) if sw["dir"] == 1 and rng > 0 else (round((price - sw["lo"]) / rng, 3) if rng > 0 else None)
        levels += [(v, f"Fib {k}") for k, v in f["ret"].items()] + [(v, f"Fib mở rộng {k}") for k, v in f["ext"].items()]
    out["pivots"] = [{"t": d["date"].iloc[i].strftime("%Y-%m-%d"), "p": sig(p), "k": k} for i, p, k, _ in pv[-8:]]
    levels += [(p, "Đỉnh cũ" if k == 1 else "Đáy cũ") for _, p, k, _ in pv[-8:]]
    g = sq9(price)
    out["sq9"] = g
    levels += [(v, "Gann Sq9") for v in (g.get("up") or [])[:2] + (g.get("dn") or [])[:2]]
    vp = vprofile(d, 120 if tf_days >= 1 else 180)
    if vp:
        out["vp"] = {k: v for k, v in vp.items() if k != "hist"}
        out["vp_hist"] = vp["hist"]
        levels += [(vp["poc"], "POC khối lượng"), (vp["val"], "Đáy vùng giá trị"), (vp["vah"], "Đỉnh vùng giá trị")]
    for n in (50, 200):
        if len(d) >= n:
            levels.append((float(d["close"].rolling(n).mean().iloc[-1]), f"MA{n}"))
    z = confluence(price, atr, levels)
    out["zones"] = [x for x in z if abs(x["dist"]) <= 35]
    out["sup"] = sorted([x for x in out["zones"] if x["p"] < price], key=lambda x: -x["p"])[:4]
    out["res"] = sorted([x for x in out["zones"] if x["p"] > price], key=lambda x: x["p"])[:4]
    out["time"] = time_windows(d, pv, tf_days)
    return out


def money_flow(df: pd.DataFrame, oi_chg: float | None = None, f8: float | None = None) -> dict:
    """Dòng tiền: CVD (mua chủ động − bán chủ động, từ nến Binance), OBV, CMF, MFI + OI/funding. Điểm -100…+100."""
    if df is None or len(df) < 30:
        return {}
    d = df.reset_index(drop=True)
    pts, why = 0.0, []
    q = d.get("qvol")
    tb = d.get("taker_buy_q")
    out = {}
    if tb is not None and q is not None and tb.notna().sum() > 20 and (q > 0).sum() > 20:
        delta = 2 * tb.fillna(0) - q.fillna(0)          # mua chủ động − bán chủ động (USD)
        cvd = delta.cumsum()
        r7 = float(delta.tail(7).sum() / max(1.0, q.tail(7).sum()))
        r30 = float(delta.tail(30).sum() / max(1.0, q.tail(30).sum()))
        ct = cvd.tail(120)
        out.update({"cvd7": round(r7 * 100, 2), "cvd30": round(r30 * 100, 2), "cvd": [sig(x, 5) for x in (ct - ct.iloc[0])]})
        if r7 > 0.02:
            pts += 25
            why.append(f"Lệnh mua chủ động áp đảo 7 kỳ gần nhất ({vn(r7 * 100, '+.1f')}% khối lượng)")
        elif r7 < -0.02:
            pts -= 25
            why.append(f"Lệnh bán chủ động áp đảo 7 kỳ gần nhất ({vn(r7 * 100, '+.1f')}% khối lượng)")
        pc = d["close"].iloc[-1] / d["close"].iloc[-8] - 1 if len(d) > 8 else 0
        if pc < -0.03 and r7 > 0.01:
            pts += 15
            why.append("Phân kỳ dương: giá giảm nhưng dòng mua chủ động tăng (có người gom)")
        elif pc > 0.03 and r7 < -0.01:
            pts -= 15
            why.append("Phân kỳ âm: giá tăng nhưng dòng bán chủ động tăng (có người xả)")
    c = d["close"]
    ob = ind.obv(d)
    if len(ob) > 21:
        s = (ob.iloc[-1] - ob.iloc[-21]) / max(1.0, d["volume"].tail(20).sum())
        out["obv20"] = round(float(s), 3)
        pts += float(np.clip(s * 60, -20, 20))
    cm = ind.cmf(d, 20).iloc[-1]
    if cm == cm:
        out["cmf"] = round(float(cm), 3)
        pts += float(np.clip(cm * 100, -20, 20))
    vr = d["volume"].tail(5).mean() / max(1e-12, d["volume"].tail(30).mean())
    out["vol5_30"] = round(float(vr), 2)
    if oi_chg is not None:
        pc7 = (c.iloc[-1] / c.iloc[-8] - 1) * 100 if len(c) > 8 else 0
        if oi_chg > 5 and pc7 > 2:
            pts += 10
            why.append("OI tăng cùng giá – tiền mới vào Long")
        elif oi_chg > 5 and pc7 < -2:
            pts -= 10
            why.append("OI tăng khi giá giảm – Short mới mở")
    if f8 is not None and f8 > 0.05:
        pts -= 10
        why.append("Funding nóng – Long đang trả phí cao")
    elif f8 is not None and f8 < -0.02:
        pts += 5
        why.append("Funding âm – Short đông, dễ bị ép")
    out["score"] = int(np.clip(pts, -100, 100))
    out["why"] = why
    return out
