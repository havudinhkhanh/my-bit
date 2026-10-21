"""Tổng hợp phân tích kỹ thuật cho 1 mã: bảng tín hiệu từng chỉ báo + điểm kỹ thuật."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import indicators as ind


def _sig(x: float) -> str:
    return "Mua" if x > 0.25 else ("Bán" if x < -0.25 else "Trung tính")


def _f(x, nd=2):
    try:
        x = float(x)
        return None if np.isnan(x) or np.isinf(x) else round(x, nd)
    except (TypeError, ValueError):
        return None


def summarize(df: pd.DataFrame, ti: pd.DataFrame, bench: pd.Series | None = None) -> dict:
    """df: OHLCV (index = ngày); ti: kết quả indicators.compute_all."""
    if len(df) < 30:
        return {"ok": False}
    c = df["close"]
    L = ti.iloc[-1]
    P = ti.iloc[-2] if len(ti) > 1 else L
    last = float(c.iloc[-1])
    rows = []

    def add(group, name, value, score, note=""):
        rows.append({"group": group, "name": name, "value": value, "score": float(score),
                     "signal": _sig(score), "note": note})

    # --- Xu hướng
    for n in (20, 50, 200):
        v = L.get(f"sma{n}")
        if v == v and v is not None:
            add("Xu hướng", f"Giá so với MA{n}", _f(v), 1 if last > v else -1,
                f"giá {'trên' if last > v else 'dưới'} MA{n}")
    if L["sma50"] == L["sma50"] and L["sma200"] == L["sma200"]:
        add("Xu hướng", "MA50 / MA200", f"{_f(L['sma50'])}/{_f(L['sma200'])}",
            1 if L["sma50"] > L["sma200"] else -1,
            "Golden cross (MA50 > MA200)" if L["sma50"] > L["sma200"] else "Death cross (MA50 < MA200)")
    if L["macd"] == L["macd"]:
        s = (1 if L["macd"] > L["macd_signal"] else -1) * (1 if abs(L["macd_hist"]) > abs(P["macd_hist"]) else 0.6)
        add("Xu hướng", "MACD (12,26,9)", _f(L["macd"]), s,
            "MACD trên đường tín hiệu" if L["macd"] > L["macd_signal"] else "MACD dưới đường tín hiệu")
    if L["adx"] == L["adx"]:
        strong = L["adx"] > 25
        s = (1 if L["pdi"] > L["mdi"] else -1) * (1 if strong else (0.4 if L["adx"] > 20 else 0))
        add("Xu hướng", "ADX / DMI (14)", _f(L["adx"], 1), s,
            f"{'xu hướng mạnh' if strong else 'xu hướng yếu'}; +DI {'>' if L['pdi'] > L['mdi'] else '<'} -DI")
    if L["span_a"] == L["span_a"] and L["span_b"] == L["span_b"]:
        top, bot = max(L["span_a"], L["span_b"]), min(L["span_a"], L["span_b"])
        s = 1 if last > top else (-1 if last < bot else 0)
        s += 0.3 if L["tenkan"] > L["kijun"] else -0.3
        add("Xu hướng", "Ichimoku", f"mây {_f(bot)}–{_f(top)}", np.clip(s, -1, 1),
            "giá trên mây" if last > top else ("giá dưới mây" if last < bot else "giá trong mây"))
    if L["supertrend"] == L["supertrend"]:
        add("Xu hướng", "Supertrend (10,3)", _f(L["supertrend"]), L["st_dir"],
            "tín hiệu tăng" if L["st_dir"] > 0 else "tín hiệu giảm")
    if L["psar"] == L["psar"]:
        add("Xu hướng", "Parabolic SAR", _f(L["psar"]), 1 if L["psar"] < last else -1,
            "SAR dưới giá" if L["psar"] < last else "SAR trên giá")
    if L["dc_up"] == L["dc_up"]:
        prev_up = ti["dc_up"].iloc[-2]
        prev_lo = ti["dc_lo"].iloc[-2]
        s = 1 if last >= prev_up else (-1 if last <= prev_lo else 0)
        add("Xu hướng", "Donchian (20)", f"{_f(L['dc_lo'])}–{_f(L['dc_up'])}", s,
            "phá đỉnh 20 phiên" if s > 0 else ("thủng đáy 20 phiên" if s < 0 else "trong kênh"))

    # --- Động lượng
    r = L["rsi"]
    if r == r:
        s = 1 if r < 30 else (-1 if r > 75 else (0.5 if 50 <= r <= 70 else (-0.3 if r < 45 else 0)))
        add("Động lượng", "RSI (14)", _f(r, 1), s,
            "quá bán" if r < 30 else ("quá mua" if r > 70 else ("động lượng tích cực" if r >= 50 else "động lượng yếu")))
    k, d = L["stoch_k"], L["stoch_d"]
    if k == k:
        s = (1 if k < 20 and k > d else (-1 if k > 80 and k < d else (0.3 if k > d else -0.3)))
        add("Động lượng", "Stochastic (14,3,3)", _f(k, 1), s,
            "quá bán" if k < 20 else ("quá mua" if k > 80 else ("%K cắt lên %D" if k > d else "%K dưới %D")))
    k2, d2 = L["stochrsi_k"], L["stochrsi_d"]
    if k2 == k2:
        s = (1 if k2 < 20 and k2 > d2 else (-1 if k2 > 80 and k2 < d2 else 0))
        add("Động lượng", "Stoch RSI", _f(k2, 1), s, "")
    w = L["willr"]
    if w == w:
        add("Động lượng", "Williams %R", _f(w, 1), 1 if w < -80 else (-1 if w > -20 else 0),
            "quá bán" if w < -80 else ("quá mua" if w > -20 else ""))
    cc = L["cci"]
    if cc == cc:
        add("Động lượng", "CCI (20)", _f(cc, 0), 1 if cc < -100 else (-1 if cc > 200 else (0.4 if cc > 0 else -0.4)), "")
    ro = L["roc"]
    if ro == ro:
        add("Động lượng", "ROC (12)", _f(ro, 1), np.clip(ro / 10, -1, 1), f"{_f(ro, 1)}% sau 12 phiên")
    m = L["mfi"]
    if m == m:
        add("Động lượng", "MFI (14)", _f(m, 1), 1 if m < 20 else (-1 if m > 80 else 0),
            "dòng tiền quá bán" if m < 20 else ("dòng tiền quá mua" if m > 80 else ""))

    # --- Biến động
    pb = L["bb_pctb"]
    if pb == pb:
        squeeze = L["bb_width"] <= ti["bb_width"].iloc[-120:].quantile(0.1)
        add("Biến động", "Bollinger %B (20,2)", _f(pb, 2), 1 if pb < 0 else (-1 if pb > 1.05 else 0),
            ("dải BB thắt chặt – sắp biến động mạnh; " if squeeze else "") +
            ("giá dưới dải dưới" if pb < 0 else ("giá trên dải trên" if pb > 1 else "")))
    if L["kc_up"] == L["kc_up"]:
        add("Biến động", "Keltner (20,2)", f"{_f(L['kc_lo'])}–{_f(L['kc_up'])}",
            1 if last > L["kc_up"] else (-1 if last < L["kc_lo"] else 0), "")
    add("Biến động", "ATR (14)", _f(L["atr"]), 0, f"{_f(100 * L['atr'] / last, 1)}% giá / phiên")

    # --- Khối lượng & dòng tiền
    ob = ti["obv"]
    if len(ob) > 25:
        sl = (ob.iloc[-1] - ob.iloc[-21]) / (df["volume"].iloc[-21:].sum() or 1)
        add("Dòng tiền", "OBV (xu hướng 20 phiên)", _f(sl, 2), np.clip(sl * 3, -1, 1),
            "tiền vào" if sl > 0 else "tiền ra")
    cm = L["cmf"]
    if cm == cm:
        add("Dòng tiền", "Chaikin Money Flow (20)", _f(cm, 3), np.clip(cm * 8, -1, 1), "")
    if L["vwap20"] == L["vwap20"]:
        add("Dòng tiền", "Giá so với VWAP 20", _f(L["vwap20"]), 1 if last > L["vwap20"] else -1, "")
    vr = L["vol_ratio"]
    if vr == vr:
        up = c.iloc[-1] >= c.iloc[-2]
        s = (1 if up else -1) * (1 if vr > 1.5 else (0.3 if vr > 1 else 0))
        add("Dòng tiền", "Khối lượng / TB20", _f(vr, 2), s,
            f"khối lượng {'đột biến' if vr > 1.5 else 'bình thường'} phiên {'tăng' if up else 'giảm'}")
    rs_line = None
    if bench is not None and len(bench) > 70:
        b = bench.reindex(c.index).ffill()
        rs3 = (c.iloc[-1] / c.iloc[-63]) / (b.iloc[-1] / b.iloc[-63]) - 1 if len(c) > 63 else np.nan
        if rs3 == rs3:
            add("Sức mạnh", "So với VN-Index (3 tháng)", f"{_f(rs3 * 100, 1)}%", np.clip(rs3 * 5, -1, 1),
                "mạnh hơn thị trường" if rs3 > 0 else "yếu hơn thị trường")
        rs_line = ind.relative_strength(c.iloc[-250:], b.iloc[-250:])

    # --- Tổng hợp theo nhóm (xu hướng 40%, động lượng 25%, dòng tiền 25%, biến động 10%)
    gw = {"Xu hướng": 0.40, "Động lượng": 0.20, "Dòng tiền": 0.25, "Biến động": 0.05, "Sức mạnh": 0.10}
    tbl = pd.DataFrame(rows)
    groups = {}
    tot, wsum = 0.0, 0.0
    for g, wgt in gw.items():
        sub = tbl[tbl["group"] == g]
        if sub.empty:
            continue
        mean = sub["score"].mean()
        groups[g] = {"score": round(50 + 50 * mean), "signal": _sig(mean),
                     "buy": int((sub["score"] > 0.25).sum()), "sell": int((sub["score"] < -0.25).sum()),
                     "neutral": int(((sub["score"] >= -0.25) & (sub["score"] <= 0.25)).sum())}
        tot += wgt * mean
        wsum += wgt
    overall = tot / wsum if wsum else 0
    label = ("Mua mạnh" if overall > 0.5 else "Mua" if overall > 0.15 else
             "Bán mạnh" if overall < -0.5 else "Bán" if overall < -0.15 else "Trung tính")

    # --- Trạng thái xu hướng (dùng làm hàng rào khi mua theo cơ bản)
    s50, s200 = L["sma50"], L["sma200"]
    s200_prev = ti["sma200"].iloc[-21] if len(ti) > 221 else np.nan
    if s200 == s200:
        if last > s50 > s200 and s200 >= (s200_prev if s200_prev == s200_prev else s200):
            trend = "up"
        elif last < s50 < s200 and (s200_prev != s200_prev or s200 < s200_prev):
            trend = "down"
        else:
            trend = "side"
    else:
        trend = "up" if last > (s50 if s50 == s50 else last) else "side"
    trend_vi = {"up": "Xu hướng tăng", "down": "Xu hướng giảm", "side": "Đi ngang / chuyển tiếp"}[trend]

    return {"ok": True, "score": round(50 + 50 * overall), "label": label, "trend": trend,
            "trend_vi": trend_vi, "groups": groups, "table": rows,
            "rs_line": [_f(x) for x in rs_line.values] if rs_line is not None else None,
            "pivots": {k: _f(v) for k, v in ind.pivots_classic(df).items()},
            "divergence": {"rsi": ind.divergence(c, ti["rsi"]), "macd": ind.divergence(c, ti["macd_hist"])},
            "atr": _f(L["atr"]), "atr_pct": _f(100 * L["atr"] / last, 2),
            "hi52": _f(L["hi52"]), "lo52": _f(L["lo52"]),
            "from_hi52_pct": _f(100 * (last / L["hi52"] - 1), 1) if L["hi52"] == L["hi52"] else None}
