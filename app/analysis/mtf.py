"""Phân tích đa khung thời gian: ngày, tuần, tháng, quý.

Mỗi khung dùng đúng các công cụ như khung ngày nhưng trên nến của khung đó:
  xu hướng   giá so với 2 đường trung bình của khung (ngày 50/200 · tuần 10/40 · tháng 10/24 · quý 4/12)
  động lượng RSI 14 và MACD (12/26/9) của khung
  cấu trúc   2 đỉnh và 2 đáy gần nhất: đỉnh cao dần + đáy cao dần = tăng; thấp dần = giảm
  vị trí     giá nằm ở đâu trong biên độ ~1 năm (ngày 250 · tuần 52) / 2 năm (tháng 24) / 3 năm (quý 12)
Rồi so các khung với nhau: đồng thuận (cùng hướng) hay mâu thuẫn (ngắn hạn ngược dài hạn)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import indicators as ind

TF = {
    "D": {"name": "Ngày", "ma": (50, 200), "rng": 250, "piv": 5, "roc": 20},
    "W": {"name": "Tuần", "ma": (10, 40), "rng": 52, "piv": 3, "roc": 13},
    "M": {"name": "Tháng", "ma": (10, 24), "rng": 24, "piv": 2, "roc": 6},
    "Q": {"name": "Quý", "ma": (4, 12), "rng": 12, "piv": 1, "roc": 4},
}


def _r(x, nd=2):
    try:
        x = float(x)
        return None if np.isnan(x) or np.isinf(x) else round(x, nd)
    except (TypeError, ValueError):
        return None


def bucket_key(idx: pd.DatetimeIndex, tf: str) -> pd.DatetimeIndex:
    if tf == "W":
        return (idx - pd.to_timedelta(idx.weekday, unit="D")).normalize()
    if tf == "M":
        return idx.to_period("M").to_timestamp()
    if tf == "Q":
        return idx.to_period("Q").to_timestamp()
    if tf == "Y":
        return idx.to_period("Y").to_timestamp()
    return idx


def resample(df: pd.DataFrame, tf: str) -> pd.DataFrame:
    if tf == "D":
        return df
    k = bucket_key(df.index, tf)
    g = df.groupby(k)
    out = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(), "close": g["close"].last(),
                        "volume": g["volume"].sum() if "volume" in df else 0})
    return out.dropna(subset=["close"])


def payload(df: pd.DataFrame, n: int | None = None) -> dict:
    d = df if n is None else df.iloc[-n:]
    return {"t": [x.strftime("%Y-%m-%d") for x in d.index], "o": d["open"].round(2).tolist(), "h": d["high"].round(2).tolist(),
            "l": d["low"].round(2).tolist(), "c": d["close"].round(2).tolist(),
            "v": d["volume"].fillna(0).astype("int64").tolist() if "volume" in d else []}


def _pivots(h: pd.Series, l: pd.Series, k: int):
    hi, lo = [], []
    H, L = h.values, l.values
    for i in range(k, len(H) - k):
        if H[i] == max(H[i - k:i + k + 1]):
            hi.append(H[i])
        if L[i] == min(L[i - k:i + k + 1]):
            lo.append(L[i])
    return hi, lo


def analyze(df: pd.DataFrame, tf: str) -> dict:
    P = TF[tf]
    o = resample(df, tf)
    f, s = P["ma"]
    if len(o) < max(f + 3, 15):
        return {"ok": False, "tf": tf, "name": P["name"], "bars": len(o)}
    c, h, l = o["close"], o["high"], o["low"]
    maf, mas = ind.sma(c, f), ind.sma(c, s)
    last = float(c.iloc[-1])
    mf, ms = _r(maf.iloc[-1], 4), _r(mas.iloc[-1], 4)
    rising = bool(maf.iloc[-1] > maf.iloc[-4]) if len(maf.dropna()) > 4 else None
    if mf is None:
        trend = 0
    elif ms is not None:
        trend = 1 if last > mf > ms and rising else -1 if last < mf < ms and rising is False else 0
    else:
        trend = 1 if last > mf and rising else -1 if last < mf and rising is False else 0
    rsi = ind.rsi(c, 14) if len(c) >= 16 else pd.Series([np.nan])
    rv = _r(rsi.iloc[-1], 1)
    _, _, hist = ind.macd(c) if len(c) >= 35 else (None, None, pd.Series([np.nan]))
    mh = float(hist.iloc[-1]) if hist.notna().iloc[-1] else None
    mh_prev = float(hist.iloc[-2]) if len(hist) > 1 and hist.notna().iloc[-2] else None
    macd = None if mh is None else (1 if mh > 0 else -1)
    hi, lo = _pivots(h, l, P["piv"])
    struct = 0
    if len(hi) >= 2 and len(lo) >= 2:
        if hi[-1] > hi[-2] and lo[-1] > lo[-2]:
            struct = 1
        elif hi[-1] < hi[-2] and lo[-1] < lo[-2]:
            struct = -1
    n = P["roc"]
    roc = _r(100 * (last / float(c.iloc[-n - 1]) - 1), 1) if len(c) > n else None
    rr = o.iloc[-P["rng"]:]
    pos = _r(100 * (last - rr["low"].min()) / (rr["high"].max() - rr["low"].min()), 0) if rr["high"].max() > rr["low"].min() else None
    parts = [trend, struct]
    if macd is not None:
        parts.append(macd * (1 if mh_prev is None or (mh - mh_prev) * macd >= 0 else 0.5))
    if rv is not None:
        parts.append(float(np.clip((rv - 50) / 20, -1, 1)))
    if roc is not None:
        parts.append(float(np.sign(roc)) * min(1.0, abs(roc) / 10))
    score = float(np.mean(parts))
    label = "Tăng" if score >= 0.35 else "Giảm" if score <= -0.35 else "Đi ngang"
    return {"ok": True, "tf": tf, "name": P["name"], "bars": len(o), "trend": trend, "struct": struct, "macd": macd,
            "macd_up": None if mh is None or mh_prev is None else bool(mh > mh_prev), "rsi": rv, "roc": roc, "roc_n": n, "pos": pos,
            "ma_f": mf, "ma_s": ms, "ma_n": [f, s], "score": _r(score, 2), "label": label}


def summary(res: dict) -> dict:
    """So sánh các khung: đồng thuận hay mâu thuẫn, và câu kết luận dễ hiểu."""
    sc = {k: v["score"] for k, v in res.items() if v.get("ok")}
    if not sc:
        return {"text": "Chưa đủ dữ liệu."}
    sg = {k: (1 if v >= 0.35 else -1 if v <= -0.35 else 0) for k, v in sc.items()}
    short, mid = sg.get("D", 0), sg.get("W", 0)
    long_ = sg.get("M", 0) if "M" in sg else mid
    lq = sg.get("Q")
    w = {"D": 0.2, "W": 0.3, "M": 0.3, "Q": 0.2}
    tot = sum(w[k] for k in sc)
    align = sum(sc[k] * w[k] for k in sc) / tot
    vals = [sg[k] for k in ("D", "W", "M") if k in sg]
    conflict = (1 in vals) and (-1 in vals)
    if all(v == 1 for v in vals):
        text, tone = "Đồng thuận TĂNG trên mọi khung – xu hướng khoẻ từ ngắn đến dài hạn.", "up"
    elif all(v == -1 for v in vals):
        text, tone = "Đồng thuận GIẢM trên mọi khung – tránh bắt đáy, chờ khung tuần đảo chiều.", "down"
    elif long_ == 1 and short == -1:
        text, tone = "Điều chỉnh ngắn hạn trong xu hướng tăng dài hạn – thường là cơ hội mua khi khung ngày ổn định lại.", "up"
    elif long_ == -1 and short == 1:
        text, tone = "Nhịp hồi ngắn hạn trong xu hướng giảm dài hạn – dễ là hồi kỹ thuật, cẩn trọng khi mua đuổi.", "down"
    elif long_ == 1 and mid >= 0:
        text, tone = "Dài hạn tăng, ngắn hạn chưa rõ – giữ vị thế, mua thêm khi khung ngày xác nhận tăng.", "up"
    elif long_ == -1 and mid <= 0:
        text, tone = "Dài hạn giảm, ngắn hạn chưa rõ hướng – ưu tiên đứng ngoài hoặc giảm tỷ trọng.", "down"
    elif mid == 1 and short == 1:
        text, tone = "Ngắn và trung hạn tăng nhưng khung tháng chưa xác nhận – xu hướng mới đang hình thành.", "up"
    elif mid == -1 and short == -1:
        text, tone = "Ngắn và trung hạn giảm, khung tháng chưa gãy – theo dõi hỗ trợ dài hạn.", "down"
    else:
        text, tone = "Các khung chưa có hướng rõ – thị trường đang tích luỹ / đi ngang.", "ref"
    if lq is not None and lq != long_ and lq != 0:
        text += f" Khung quý đang {'tăng' if lq > 0 else 'giảm'}."
    return {"align": _r(align, 2), "conflict": conflict, "text": text, "tone": tone, "signs": sg}


def full(df: pd.DataFrame) -> dict:
    res = {k: analyze(df, k) for k in TF}
    return {"tf": res, "summary": summary(res)}
