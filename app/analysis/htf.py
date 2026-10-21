"""Xu hướng khung lớn (tuần / tháng / quý, hoặc ngày / tuần cho khung 4h) tại từng nến – KHÔNG nhìn trước.

Ở nến i, xu hướng khung lớn = so giá đóng cửa nến i với EMA của các kỳ khung lớn ĐÃ ĐÓNG trước đó, kèm độ dốc EMA:
  +1  giá trên EMA và EMA đang dốc lên   |   −1  giá dưới EMA và EMA dốc xuống   |   0  còn lại (chuyển tiếp)
Dùng để đo: thiết lập đánh CÙNG chiều khung lớn có tốt hơn thiết lập đánh NGƯỢC chiều không.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# khung vào lệnh → các khung lớn cần xét (nhãn, tần suất pandas, số kỳ EMA)
PARENTS = {
    "d": [("W", "W-SUN", 10), ("M", "M", 10), ("Q", "Q", 4)],
    "h4": [("D", "D", 50), ("W", "W-SUN", 10)],
    "h1": [("H4", "4h", 50), ("D", "D", 50)],
}
USE = {"d": ("W", "M"), "h4": ("D", "W"), "h1": ("H4", "D")}      # 2 khung lớn liền trên dùng để phân nhóm thống kê


def trend_on(df: pd.DataFrame, freq: str, n: int) -> np.ndarray:
    t = pd.to_datetime(df["date"]).reset_index(drop=True)
    c = df["close"].astype(float).reset_index(drop=True)
    if freq in ("D", "4h"):
        per = t.dt.floor(freq)
    else:
        per = t.dt.to_period(freq).dt.start_time
    agg = c.groupby(per.values).last()
    ema = agg.ewm(span=n, adjust=False, min_periods=max(3, n // 2)).mean()
    ref = ema.shift(1)                       # EMA tính tới kỳ đã đóng trước đó
    slope = ema.shift(1) - ema.shift(2)
    r = ref.reindex(per.values).values
    s = slope.reindex(per.values).values
    out = np.zeros(len(c))
    cv = c.values
    up = (cv > r) & (s > 0)
    dn = (cv < r) & (s < 0)
    out[up] = 1
    out[dn] = -1
    return out


def trends(df: pd.DataFrame, tf: str) -> dict[str, np.ndarray]:
    return {lab: trend_on(df, f, n) for lab, f, n in PARENTS.get(tf, [])}


def bucket(tr: dict[str, np.ndarray], tf: str, i: int, side: int) -> str | None:
    """h+ = cả 2 khung lớn cùng chiều lệnh · h- = có khung lớn ngược chiều và không khung nào cùng chiều · h0 = lẫn lộn / đi ngang."""
    keys = USE.get(tf)
    if not keys or any(k not in tr for k in keys):
        return None
    a = [tr[k][i] * side for k in keys]
    if all(x > 0 for x in a):
        return "h+"
    if any(x < 0 for x in a) and not any(x > 0 for x in a):
        return "h-"
    return "h0"


def now(df: pd.DataFrame, tf: str) -> dict:
    """Trạng thái khung lớn ở nến cuối (để hiển thị)."""
    tr = trends(df, tf)
    return {k: int(v[-1]) for k, v in tr.items() if len(v)}
