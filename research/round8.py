"""Vòng 8 – ĐIỂM CHỜ của Bắt râu sập: chờ nông hơn (khớp nhiều hơn) có lời hơn không? Lưới độ sâu D × thời gian chờ W, thoát 30 / 60 phút,
và vào ngay bằng lệnh thị trường (D = 0). Đặc trưng lọc giống vòng 7. Phân tích: research/r8_analyze.py.
(Mô tả gốc vòng 7:) Vòng 7 – BỘ LỌC của Bắt râu sập có đáng không, tính cả lệnh lời lẫn lệnh lỗ bị chặn (không chỉ lãi TB/lệnh mà TỔNG lợi nhuận & sụt giảm).
Xuất MỌI cú sốc đạt chuẩn cơ bản (≥ 300 bps/1 phút, z ≥ 4, khối lượng ≥ 3× trung vị, khối lượng 24h ≥ 2 triệu USD) từ 01/2025, KHÔNG lọc,
kèm đặc trưng chỉ dùng dữ liệu tới lúc sốc (cú sốc trước trên cùng coin, giá 15 phút / 4 giờ / 24 giờ trước, khối lượng…) và kết quả
2 mức chờ 1,5× / 2× (chờ 8 phút): giữ 60 phút (như bot) và cắt lỗ đuổi 1,5%/1%. Phân tích chi tiết ở máy: research/r7_analyze.py.
Chạy: python research/round7.py"""
import concurrent.futures as cf
import datetime as dt
import gzip
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round8.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402
import round6 as R6  # noqa: E402

log = E.log
DS, WS, HMAX = (0.5, 0.75, 1.0, 1.25, 1.5, 2.0), (8, 20), 120
W = max(WS)
RULES = [("t60", "T", 60), ("t30", "T", 30)]
IN_T = 15.0          # vào ngay: phí taker 5 bps + trượt giá lúc sốc ~10 bps


def process(s):
    try:
        d = R6.load(s)
    except Exception:  # noqa: BLE001
        return []
    if d is None or len(d) < 3000:
        return []
    c = d.c.ffill().values; o = d.o.fillna(d.c.ffill()).values; h = d.h.fillna(d.c.ffill()).values; l = d.l.fillna(d.c.ffill()).values
    qv = d.qv.fillna(0).values; ok = d.c.notna().values; t0 = int(d.index[0]); n = len(d)
    r = np.diff(np.log(c), prepend=np.log(c[0]))
    sd = pd.Series(r).rolling(60, min_periods=40).std().shift(1).values
    sd1d = pd.Series(r).rolling(1440, min_periods=600).std().shift(1).values
    mq = pd.Series(qv).rolling(60, min_periods=40).median().shift(1).values
    q24 = pd.Series(qv).rolling(1440, min_periods=600).sum().shift(1).values
    z = np.abs(r) / sd
    base = (z >= 4) & (np.abs(r) * 1e4 >= 300) & ok & (q24 >= 2e6)
    raw8 = np.flatnonzero(base & (qv >= 8 * mq))          # cú sốc theo đúng chuẩn của bot (dùng đếm "cú sốc khác trong 6 giờ")
    out = []
    for i in E.dedupe(np.flatnonzero(base & (qv >= 3 * mq)), 30):
        if i < 1440 or i + 2 + W + HMAX >= n:
            continue
        side = -1 if r[i] > 0 else 1; c0 = c[i]; mv = abs(math.expm1(r[i]))
        rng = h[i] - l[i]
        rec = dict(s=s, T=int(t0 + i), side=side, R=round(float(abs(r[i]) * 1e4)), z=round(float(z[i]), 1), vx=round(float(qv[i] / mq[i]), 1) if mq[i] > 0 else None,
                   q24=round(float(q24[i] / 1e6), 1), prior6=int(((raw8 < i) & (raw8 >= i - 360)).sum()), prior24=int(((raw8 < i) & (raw8 >= i - 1440)).sum()),
                   r15=round(float(side * (c[i - 1] / c[i - 16] - 1) * 1e4)), r60=round(float(side * (c[i - 1] / c[i - 61] - 1) * 1e4)),
                   r4h=round(float(side * (c0 / c[i - 240] - 1) * 1e4)), r24=round(float(side * (c0 / c[i - 1440] - 1) * 1e4)),
                   vol1d=round(float(sd1d[i] * 1e4), 1) if np.isfinite(sd1d[i]) else None,
                   wick=round(float(((c0 - l[i]) / rng if side > 0 else (h[i] - c0) / rng) if rng > 0 else 0.0), 2),
                   nx=round(float(side * (c[i + 1] / c0 - 1) * 1e4)), res={})
        for D in (0.0,) + DS:
            if D == 0:     # vào ngay ở giá mở nến kế tiếp (lệnh thị trường)
                L = o[i + 1]; fill = i
            else:
                L = c0 * (1 - side * D * mv); Lt = L * (1 - side * R6.THR / 1e4); fill = None
                for j in range(i + 1, i + 1 + W):
                    if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                        fill = j; break
                if fill is None:
                    continue
            seg_h, seg_l = h[fill + 1:fill + 1 + HMAX], l[fill + 1:fill + 1 + HMAX]
            pn = lambda px: side * (px / L - 1) * 1e4  # noqa: E731
            fav = pn(seg_h) if side > 0 else pn(seg_l); adv = pn(seg_l) if side > 0 else pn(seg_h)
            o_all = pn(o[fill + 1:fill + 2 + HMAX])
            x = {k: round(float(R6.sim(kind, prm, fav, adv, None, o_all, L, side, c0)[0]) - (IN_T - R6.IN_M if D == 0 else 0), 1) for k, kind, prm in RULES}
            x["f"] = int(fill - i)
            rec["res"][str(D)] = x
        out.append(rec)
    return out


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {R6.MONTHS[0]} → {R6.MONTHS[-1]} + {len(R6.DAYS)} ngày tháng này")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(process, syms)):
            evs += out
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã, {len(evs)} cú sốc, {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round8.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    log(f"{len(evs)} cú sốc (khối lượng ≥ 3×) · có khớp {sum(1 for e in evs if e['res'])} · {time.time() - t00:.0f}s")
