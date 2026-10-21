"""Chỉ báo kỹ thuật — viết thuần pandas/numpy, không phụ thuộc thư viện ngoài.

Đầu vào: DataFrame có cột open, high, low, close, volume (theo thứ tự thời gian).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


# ------------------------------------------------------------------ cơ bản
def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def rma(s: pd.Series, n: int) -> pd.Series:
    """Trung bình kiểu Wilder (dùng cho RSI, ATR, ADX)."""
    return s.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def true_range(df: pd.DataFrame) -> pd.Series:
    pc = df["close"].shift()
    return pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()],
                     axis=1).max(axis=1)


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    return rma(true_range(df), n)


# ------------------------------------------------------------------ xu hướng
def macd(close: pd.Series, fast=12, slow=26, signal=9):
    line = ema(close, fast) - ema(close, slow)
    sig = ema(line, signal)
    return line, sig, line - sig


def adx(df: pd.DataFrame, n: int = 14):
    up = df["high"].diff()
    dn = -df["low"].diff()
    plus_dm = np.where((up > dn) & (up > 0), up, 0.0)
    minus_dm = np.where((dn > up) & (dn > 0), dn, 0.0)
    tr = rma(true_range(df), n)
    pdi = 100 * rma(pd.Series(plus_dm, index=df.index), n) / tr
    mdi = 100 * rma(pd.Series(minus_dm, index=df.index), n) / tr
    dx = 100 * (pdi - mdi).abs() / (pdi + mdi).replace(0, np.nan)
    return rma(dx, n), pdi, mdi


def ichimoku(df: pd.DataFrame, t=9, k=26, s=52):
    hi, lo = df["high"], df["low"]
    tenkan = (hi.rolling(t).max() + lo.rolling(t).min()) / 2
    kijun = (hi.rolling(k).max() + lo.rolling(k).min()) / 2
    span_a = ((tenkan + kijun) / 2).shift(k)
    span_b = ((hi.rolling(s).max() + lo.rolling(s).min()) / 2).shift(k)
    chikou = df["close"].shift(-k)
    return tenkan, kijun, span_a, span_b, chikou


def supertrend(df: pd.DataFrame, n: int = 10, mult: float = 3.0):
    a = atr(df, n).values
    hl2 = ((df["high"] + df["low"]) / 2).values
    close = df["close"].values
    up = hl2 - mult * a
    dn = hl2 + mult * a
    st = np.full(len(df), np.nan)
    direction = np.ones(len(df))
    fu, fd = up.copy(), dn.copy()
    for i in range(1, len(df)):
        if np.isnan(a[i]):
            continue
        fu[i] = max(up[i], fu[i - 1]) if close[i - 1] > fu[i - 1] else up[i]
        fd[i] = min(dn[i], fd[i - 1]) if close[i - 1] < fd[i - 1] else dn[i]
        if close[i] > fd[i - 1]:
            direction[i] = 1
        elif close[i] < fu[i - 1]:
            direction[i] = -1
        else:
            direction[i] = direction[i - 1]
        st[i] = fu[i] if direction[i] == 1 else fd[i]
    return pd.Series(st, index=df.index), pd.Series(direction, index=df.index)


def psar(df: pd.DataFrame, step=0.02, max_step=0.2) -> pd.Series:
    hi, lo = df["high"].values, df["low"].values
    n = len(df)
    out = np.full(n, np.nan)
    if n < 3:
        return pd.Series(out, index=df.index)
    bull = True
    af = step
    ep = hi[0]
    sar = lo[0]
    for i in range(1, n):
        sar = sar + af * (ep - sar)
        if bull:
            sar = min(sar, lo[i - 1], lo[i - 2] if i > 1 else lo[i - 1])
            if lo[i] < sar:
                bull, sar, ep, af = False, ep, lo[i], step
            elif hi[i] > ep:
                ep, af = hi[i], min(af + step, max_step)
        else:
            sar = max(sar, hi[i - 1], hi[i - 2] if i > 1 else hi[i - 1])
            if hi[i] > sar:
                bull, sar, ep, af = True, ep, hi[i], step
            elif lo[i] < ep:
                ep, af = lo[i], min(af + step, max_step)
        out[i] = sar
    return pd.Series(out, index=df.index)


# ------------------------------------------------------------------ động lượng
def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    d = close.diff()
    gain = rma(d.clip(lower=0), n)
    loss = rma(-d.clip(upper=0), n)
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100.0).where(gain.notna())


def stochastic(df: pd.DataFrame, k=14, d=3, smooth=3):
    lo = df["low"].rolling(k).min()
    hi = df["high"].rolling(k).max()
    raw = 100 * (df["close"] - lo) / (hi - lo).replace(0, np.nan)
    kk = raw.rolling(smooth).mean()
    return kk, kk.rolling(d).mean()


def stoch_rsi(close: pd.Series, n=14, k=3, d=3):
    r = rsi(close, n)
    lo, hi = r.rolling(n).min(), r.rolling(n).max()
    st = 100 * (r - lo) / (hi - lo).replace(0, np.nan)
    kk = st.rolling(k).mean()
    return kk, kk.rolling(d).mean()


def williams_r(df: pd.DataFrame, n=14) -> pd.Series:
    hi, lo = df["high"].rolling(n).max(), df["low"].rolling(n).min()
    return -100 * (hi - df["close"]) / (hi - lo).replace(0, np.nan)


def cci(df: pd.DataFrame, n=20) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    ma = tp.rolling(n).mean()
    md = tp.rolling(n).apply(lambda x: np.mean(np.abs(x - x.mean())), raw=True)
    return (tp - ma) / (0.015 * md.replace(0, np.nan))


def roc(close: pd.Series, n=12) -> pd.Series:
    return 100 * close.pct_change(n)


def mfi(df: pd.DataFrame, n=14) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    flow = tp * df["volume"]
    pos = flow.where(tp > tp.shift(), 0.0).rolling(n).sum()
    neg = flow.where(tp < tp.shift(), 0.0).rolling(n).sum()
    return 100 - 100 / (1 + pos / neg.replace(0, np.nan))


# ------------------------------------------------------------------ biến động
def bollinger(close: pd.Series, n=20, k=2.0):
    ma = sma(close, n)
    sd = close.rolling(n).std(ddof=0)
    up, lo = ma + k * sd, ma - k * sd
    pctb = (close - lo) / (up - lo).replace(0, np.nan)
    width = (up - lo) / ma
    return up, ma, lo, pctb, width


def keltner(df: pd.DataFrame, n=20, mult=2.0):
    mid = ema(df["close"], n)
    a = atr(df, 10)
    return mid + mult * a, mid, mid - mult * a


def donchian(df: pd.DataFrame, n=20):
    return df["high"].rolling(n).max(), df["low"].rolling(n).min()


# ------------------------------------------------------------------ khối lượng
def obv(df: pd.DataFrame) -> pd.Series:
    sign = np.sign(df["close"].diff()).fillna(0)
    return (sign * df["volume"]).cumsum()


def ad_line(df: pd.DataFrame) -> pd.Series:
    rng = (df["high"] - df["low"]).replace(0, np.nan)
    mfm = ((df["close"] - df["low"]) - (df["high"] - df["close"])) / rng
    return (mfm.fillna(0) * df["volume"]).cumsum()


def cmf(df: pd.DataFrame, n=20) -> pd.Series:
    rng = (df["high"] - df["low"]).replace(0, np.nan)
    mfm = ((df["close"] - df["low"]) - (df["high"] - df["close"])) / rng
    return (mfm.fillna(0) * df["volume"]).rolling(n).sum() / df["volume"].rolling(n).sum()


def vwap_rolling(df: pd.DataFrame, n=20) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    return (tp * df["volume"]).rolling(n).sum() / df["volume"].rolling(n).sum()


# ------------------------------------------------------------------ cấu trúc
def pivots_classic(df: pd.DataFrame) -> dict:
    """Pivot của phiên gần nhất (dùng cho phiên tới)."""
    h, l, c = df["high"].iloc[-1], df["low"].iloc[-1], df["close"].iloc[-1]
    p = (h + l + c) / 3
    return {"P": p, "R1": 2 * p - l, "S1": 2 * p - h, "R2": p + (h - l), "S2": p - (h - l),
            "R3": h + 2 * (p - l), "S3": l - 2 * (h - p)}


def relative_strength(close: pd.Series, bench: pd.Series) -> pd.Series:
    """Đường sức mạnh tương đối so với VN-Index (chuẩn hoá về 100)."""
    b = bench.reindex(close.index).ffill()
    rs = close / b
    return 100 * rs / rs.dropna().iloc[0] if rs.notna().any() else rs


def rs_rating_raw(close: pd.Series) -> float:
    """Điểm sức mạnh giá kiểu IBD: 40% quý gần nhất + 20% mỗi quý trước (12 tháng)."""
    c = close.dropna()
    if len(c) < 260:
        if len(c) < 70:
            return np.nan
        return float(c.iloc[-1] / c.iloc[-63] - 1)
    q = [c.iloc[-1] / c.iloc[-63], c.iloc[-63] / c.iloc[-126], c.iloc[-126] / c.iloc[-189],
         c.iloc[-189] / c.iloc[-252]]
    return float(0.4 * (q[0] - 1) + 0.2 * (q[1] - 1) + 0.2 * (q[2] - 1) + 0.2 * (q[3] - 1))


def divergence(price: pd.Series, osc: pd.Series, lookback: int = 60, order: int = 5) -> str | None:
    """Phát hiện phân kỳ đơn giản giữa giá và dao động (RSI/MACD) trong N phiên gần nhất."""
    p = price.iloc[-lookback:]
    o = osc.reindex(p.index)
    if o.isna().all():
        return None
    lows = [i for i in range(order, len(p) - 1) if p.iloc[i] == p.iloc[max(0, i - order):i + order + 1].min()]
    highs = [i for i in range(order, len(p) - 1) if p.iloc[i] == p.iloc[max(0, i - order):i + order + 1].max()]
    if len(lows) >= 2:
        a, b = lows[-2], lows[-1]
        if p.iloc[b] < p.iloc[a] and o.iloc[b] > o.iloc[a] and len(p) - b <= 15:
            return "bullish"
    if len(highs) >= 2:
        a, b = highs[-2], highs[-1]
        if p.iloc[b] > p.iloc[a] and o.iloc[b] < o.iloc[a] and len(p) - b <= 15:
            return "bearish"
    return None


# ------------------------------------------------------------------ tất cả
def compute_all(df: pd.DataFrame) -> pd.DataFrame:
    """Tính toàn bộ chỉ báo, trả về DataFrame cùng index."""
    out = pd.DataFrame(index=df.index)
    c = df["close"]
    for n in (10, 20, 50, 100, 200):
        out[f"sma{n}"] = sma(c, n)
    for n in (9, 21, 50, 200):
        out[f"ema{n}"] = ema(c, n)
    out["macd"], out["macd_signal"], out["macd_hist"] = macd(c)
    out["adx"], out["pdi"], out["mdi"] = adx(df)
    out["tenkan"], out["kijun"], out["span_a"], out["span_b"], _ = ichimoku(df)
    out["supertrend"], out["st_dir"] = supertrend(df)
    out["psar"] = psar(df)
    out["rsi"] = rsi(c)
    out["stoch_k"], out["stoch_d"] = stochastic(df)
    out["stochrsi_k"], out["stochrsi_d"] = stoch_rsi(c)
    out["willr"] = williams_r(df)
    out["cci"] = cci(df)
    out["roc"] = roc(c)
    out["mfi"] = mfi(df)
    out["bb_up"], out["bb_mid"], out["bb_lo"], out["bb_pctb"], out["bb_width"] = bollinger(c)
    out["kc_up"], out["kc_mid"], out["kc_lo"] = keltner(df)
    out["dc_up"], out["dc_lo"] = donchian(df)
    out["atr"] = atr(df)
    out["obv"] = obv(df)
    out["ad"] = ad_line(df)
    out["cmf"] = cmf(df)
    out["vwap20"] = vwap_rolling(df)
    out["vol_ma20"] = sma(df["volume"], 20)
    out["vol_ratio"] = df["volume"] / out["vol_ma20"]
    out["value_bn"] = c * df["volume"] / 1e6  # nghìn đồng * cp -> tỷ đồng
    out["hi52"] = df["high"].rolling(250, min_periods=60).max()
    out["lo52"] = df["low"].rolling(250, min_periods=60).min()
    return out
