"""Tín hiệu cho 3 kiểu chơi + kiểm chứng lịch sử.

1) Theo xu hướng, đòn bẩy thấp (khung ngày): Long khi giá > EMA50, EMA20 > EMA50 và giá > MA200; thoát khi đóng cửa < EMA50.
   Short (chỉ perp) đối xứng khi cả BTC cũng dưới MA200. Cắt lỗ ban đầu 2×ATR. Kiểm chứng toàn bộ lịch sử có phí + funding.
2) Lướt trong ngày (4h định hướng, 1h vào lệnh): chỉ đánh cùng chiều xu hướng 4h; vào ở nhịp hồi về EMA20 1h, cắt lỗ 1,5×ATR 1h, chốt 1,5R/2,5R.
3) Phòng hộ spot: beta so với BTC, tương quan, chi phí/thu nhập funding khi bán perp phòng hộ.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from . import indicators as ind

FEE = 0.0005          # phí taker 1 chiều (0,05%)
FUND_DAY = 0.0003     # chi phí funding trung bình của lệnh Long perp ~0,01%/8h
SLIP = 0.0005


def _f(x, nd=4):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else round(x, nd)


def sig6(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return float(f"{x:.6g}")


# ------------------------------------------------------------------ xu hướng (ngày)
def trend_state(df: pd.DataFrame) -> pd.Series:
    """+1 Long, -1 điều kiện Short, 0 đứng ngoài – theo từng ngày."""
    c = df["close"]
    e20, e50 = ind.ema(c, 20), ind.ema(c, 50)
    ma200 = ind.sma(c, 200) if len(c) >= 200 else pd.Series(np.nan, index=c.index)
    long_ = (c > e50) & (e20 > e50) & ((c > ma200) | ma200.isna())
    short_ = (c < e50) & (e20 < e50) & ((c < ma200) | ma200.isna())
    return pd.Series(np.where(long_, 1, np.where(short_, -1, 0)), index=c.index)


def backtest_trend(df: pd.DataFrame, btc_reg: pd.Series | None = None, allow_short: bool = True, lev: float = 1.0) -> dict:
    """Mô phỏng: tín hiệu đóng cửa ngày t → vào lệnh giá đóng cửa ngày t (đơn giản hoá), giữ đến khi tín hiệu đổi.
    Long thoát khi close < EMA50; Short thoát khi close > EMA50. Có phí 2 chiều, trượt giá, funding cho lệnh Long."""
    if len(df) < 260:
        return {}
    c = df["close"].astype(float)
    e50 = ind.ema(c, 50)
    st = trend_state(df)
    if btc_reg is not None:
        br = btc_reg.reindex(df.index).ffill()
    pos = np.zeros(len(c))
    cur = 0
    for i in range(len(c)):
        s = st.iloc[i]
        if cur == 1 and c.iloc[i] < e50.iloc[i]:
            cur = 0
        elif cur == -1 and c.iloc[i] > e50.iloc[i]:
            cur = 0
        if cur == 0:
            if s == 1:
                cur = 1
            elif s == -1 and allow_short and (btc_reg is None or br.iloc[i] < 0):
                cur = -1
        pos[i] = cur
    r = c.pct_change().fillna(0).values
    p = np.roll(pos, 1)
    p[0] = 0
    turn = np.abs(np.diff(np.concatenate([[0], p])))
    strat = p * r * lev - turn * (FEE + SLIP) * lev - (p > 0) * FUND_DAY * lev
    strat = np.maximum(strat, -0.99)
    eq = np.cumprod(1 + strat)
    bh = np.cumprod(1 + r)
    years = len(c) / 365
    rets, i = [], 0
    while i < len(p):
        if p[i] != 0:
            j, g = i, 1.0
            while j < len(p) and p[j] == p[i]:
                g *= 1 + strat[j]
                j += 1
            rets.append(g - 1)
            i = j
        else:
            i += 1
    trades = len(rets)

    def mdd(e):
        pk = np.maximum.accumulate(e)
        return float(((e / pk) - 1).min() * 100)

    out = {"years": _f(years, 1), "cagr": _f((eq[-1] ** (1 / years) - 1) * 100, 1), "bh_cagr": _f((bh[-1] ** (1 / years) - 1) * 100, 1),
           "mdd": _f(mdd(eq), 1), "bh_mdd": _f(mdd(bh), 1), "trades": trades, "win": _f(np.mean([x > 0 for x in rets]) * 100, 0) if rets else None,
           "avg_win": _f(np.mean([x for x in rets if x > 0]) * 100, 1) if any(x > 0 for x in rets) else None,
           "avg_loss": _f(np.mean([x for x in rets if x <= 0]) * 100, 1) if any(x <= 0 for x in rets) else None,
           "expo": _f((p != 0).mean() * 100, 0), "lev": lev, "short": allow_short}
    tail = 365
    if len(eq) > tail:
        out["r1y"] = _f((eq[-1] / eq[-tail] - 1) * 100, 1)
        out["bh1y"] = _f((bh[-1] / bh[-tail] - 1) * 100, 1)
    step = max(1, len(eq) // 300)
    out["eq"] = [[d.strftime("%Y-%m-%d"), round(float(a), 4), round(float(b), 4)] for d, a, b in zip(df.index[::step], eq[::step], bh[::step])]
    return out


def trend_signal(df: pd.DataFrame, btc_down: bool) -> dict:
    if len(df) < 60:
        return {"state": None}
    c = df["close"]
    e20, e50 = ind.ema(c, 20), ind.ema(c, 50)
    ma200 = ind.sma(c, 200) if len(c) >= 200 else pd.Series(np.nan, index=c.index)
    atr = ind.atr(df, 14)
    st = trend_state(df)
    last = float(c.iloc[-1])
    s = int(st.iloc[-1])
    # bao nhiêu ngày đã ở trạng thái hiện tại
    run = 0
    for v in st.iloc[::-1]:
        if v == s:
            run += 1
        else:
            break
    a = float(atr.iloc[-1])
    out = {"state": s, "days": run, "close": sig6(last), "ema20": sig6(e20.iloc[-1]), "ema50": sig6(e50.iloc[-1]), "ma200": sig6(ma200.iloc[-1]),
           "atr": sig6(a), "atr_pct": _f(a / last * 100, 2)}
    if s == 1:
        stop = max(last - 2 * a, float(e50.iloc[-1]) - 0.5 * a)
        out.update({"side": "long", "stop": sig6(stop), "stop_pct": _f((last - stop) / last * 100, 2), "exit_rule": "Đóng cửa ngày dưới EMA50",
                    "exit_level": sig6(e50.iloc[-1]),
                    "fresh": run <= 5, "ext": _f((last / float(e20.iloc[-1]) - 1) * 100, 1)})
    elif s == -1:
        stop = min(last + 2 * a, float(e50.iloc[-1]) + 0.5 * a)
        out.update({"side": "short" if btc_down else None, "stop": sig6(stop), "stop_pct": _f((stop - last) / last * 100, 2),
                    "exit_rule": "Đóng cửa ngày trên EMA50", "exit_level": sig6(e50.iloc[-1]), "fresh": run <= 5,
                    "ext": _f((last / float(e20.iloc[-1]) - 1) * 100, 1), "short_blocked": not btc_down})
    return out


# ------------------------------------------------------------------ lướt trong ngày
def intraday(h4: pd.DataFrame | None, h1: pd.DataFrame | None, day_state: int | None) -> dict:
    if h4 is None or h1 is None or len(h4) < 60 or len(h1) < 60:
        return {}
    c4, c1 = h4["close"], h1["close"]
    e20_4, e50_4 = ind.ema(c4, 20), ind.ema(c4, 50)
    b4 = 1 if (c4.iloc[-1] > e50_4.iloc[-1] and e20_4.iloc[-1] > e50_4.iloc[-1]) else (-1 if (c4.iloc[-1] < e50_4.iloc[-1] and e20_4.iloc[-1] < e50_4.iloc[-1]) else 0)
    e20_1 = ind.ema(c1, 20)
    rsi1 = ind.rsi(c1, 14)
    atr1 = ind.atr(h1, 14)
    last = float(c1.iloc[-1])
    a = float(atr1.iloc[-1])
    hi24, lo24 = float(h1["high"].tail(24).max()), float(h1["low"].tail(24).min())
    tp = (h1["high"] + h1["low"] + h1["close"]) / 3
    vol = h1["volume"].replace(0, np.nan)
    vwap24 = float((tp * vol).tail(24).sum() / vol.tail(24).sum()) if vol.tail(24).sum() > 0 else None
    # điểm xoay ngày hôm qua (UTC)
    d = h1.set_index("date").resample("1D").agg({"high": "max", "low": "min", "close": "last"}).dropna()
    piv = {}
    if len(d) >= 2:
        H, L, C = d.iloc[-2]
        P = (H + L + C) / 3
        piv = {"P": sig6(P), "R1": sig6(2 * P - L), "S1": sig6(2 * P - H), "R2": sig6(P + (H - L)), "S2": sig6(P - (H - L)), "pdh": sig6(H), "pdl": sig6(L)}
    out = {"bias4h": b4, "rsi1h": _f(rsi1.iloc[-1], 1), "atr1h": sig6(a), "atr1h_pct": _f(a / last * 100, 2), "ema20_1h": sig6(e20_1.iloc[-1]),
           "ema20_4h": sig6(e20_4.iloc[-1]), "ema50_4h": sig6(e50_4.iloc[-1]), "hi24": sig6(hi24), "lo24": sig6(lo24), "vwap24": sig6(vwap24), "piv": piv,
           "chg24": _f((last / float(c1.iloc[-25]) - 1) * 100, 2) if len(c1) > 25 else None}
    aligned = b4 != 0 and (day_state in (None, 0) or day_state == b4)
    plan = None
    if b4 == 1:
        entry = float(e20_1.iloc[-1])
        stop = min(entry - 1.5 * a, lo24) if lo24 > entry - 3 * a else entry - 1.5 * a
        R = entry - stop
        plan = {"side": "long", "entry": sig6(entry), "stop": sig6(stop), "t1": sig6(entry + 1.5 * R), "t2": sig6(entry + 2.5 * R),
                "risk_pct": _f(R / entry * 100, 2), "note": "Chờ giá hồi về quanh EMA20 khung 1h (RSI 1h về 40–55) rồi mới vào; không mua đuổi khi đã xa EMA20 > 1,5 ATR"}
        if last > entry + 1.5 * a:
            plan["wait"] = "Giá đang cách EMA20 1h hơn 1,5 ATR – chờ hồi"
    elif b4 == -1:
        entry = float(e20_1.iloc[-1])
        stop = max(entry + 1.5 * a, hi24) if hi24 < entry + 3 * a else entry + 1.5 * a
        R = stop - entry
        plan = {"side": "short", "entry": sig6(entry), "stop": sig6(stop), "t1": sig6(entry - 1.5 * R), "t2": sig6(entry - 2.5 * R),
                "risk_pct": _f(R / entry * 100, 2), "note": "Chờ giá hồi lên quanh EMA20 khung 1h (RSI 1h lên 45–60) rồi mới bán; không Short đuổi khi đã giảm xa"}
        if last < entry - 1.5 * a:
            plan["wait"] = "Giá đang dưới EMA20 1h hơn 1,5 ATR – chờ hồi"
    if plan:
        plan["aligned"] = aligned
        if not aligned:
            plan["warn"] = "Ngược xu hướng khung ngày – chỉ đánh nhỏ, chốt nhanh"
    out["plan"] = plan
    out["bt"] = backtest_intraday(h4)
    return out


def backtest_intraday(h4: pd.DataFrame) -> dict:
    """Kiểm chứng nhanh trên nến 4h: hồi về EMA20 trong xu hướng EMA20/50, cắt lỗ 1,5 ATR, chốt 2R hoặc hết 6 nến (24h)."""
    if h4 is None or len(h4) < 200:
        return {}
    c, h, l = h4["close"].values, h4["high"].values, h4["low"].values
    e20, e50 = ind.ema(h4["close"], 20).values, ind.ema(h4["close"], 50).values
    atr = ind.atr(h4, 14).values
    res = []
    i = 60
    while i < len(c) - 7:
        up = c[i] > e50[i] and e20[i] > e50[i]
        dn = c[i] < e50[i] and e20[i] < e50[i]
        if up and l[i] <= e20[i] <= h[i]:
            ent, R = e20[i], 1.5 * atr[i]
            out = None
            for j in range(i + 1, i + 7):
                if l[j] <= ent - R:
                    out = -1
                    break
                if h[j] >= ent + 2 * R:
                    out = 2
                    break
            if out is None:
                out = (c[i + 6] - ent) / R
            res.append(out - 2 * (FEE + SLIP) * ent / R)
            i += 6
        elif dn and l[i] <= e20[i] <= h[i]:
            ent, R = e20[i], 1.5 * atr[i]
            out = None
            for j in range(i + 1, i + 7):
                if h[j] >= ent + R:
                    out = -1
                    break
                if l[j] <= ent - 2 * R:
                    out = 2
                    break
            if out is None:
                out = (ent - c[i + 6]) / R
            res.append(out - 2 * (FEE + SLIP) * ent / R)
            i += 6
        else:
            i += 1
    if len(res) < 10:
        return {"n": len(res)}
    r = np.array(res)
    return {"n": int(len(r)), "win": _f((r > 0).mean() * 100, 0), "avg_r": _f(r.mean(), 2), "days": _f(len(h4) / 6, 0)}


# ------------------------------------------------------------------ phòng hộ
def hedge_stats(df: pd.DataFrame, btc: pd.DataFrame) -> dict:
    if len(df) < 100 or btc is None or len(btc) < 100:
        return {}
    a = df.set_index("date")["close"].pct_change()
    b = btc.set_index("date")["close"].pct_change()
    j = pd.concat([a, b], axis=1, keys=["a", "b"]).dropna().tail(90)
    if len(j) < 60:
        return {}
    cov = np.cov(j["a"], j["b"])
    beta = cov[0, 1] / cov[1, 1] if cov[1, 1] > 0 else None
    corr = float(j["a"].corr(j["b"]))
    vol = float(j["a"].std() * math.sqrt(365) * 100)
    return {"beta": _f(beta, 2), "corr": _f(corr, 2), "vol90": _f(vol, 1)}
