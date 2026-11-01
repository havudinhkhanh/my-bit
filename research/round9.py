"""Vòng 9 – QUẢN LÝ LỆNH ĐANG LỖ của Bắt râu sập: cắt lỗ sớm hơn (giá đi ngược X% sau khi khớp) và ĐẢO CHIỀU (đóng rồi mở lệnh ngược) có lời hơn
giữ đủ 60 phút như bot đang chạy không?
Chỉ lấy cú sốc qua đúng bộ lọc bot (khối lượng ≥ 8×, không có cú sốc khác trong 6 giờ, dao rơi 4 giờ > -10%, xả sau bơm chỉ Short, 24h ≥ 2 triệu USD)
và 3 kiểu vào lệnh của tài khoản thật: mua ngay (Long, 15 phút trước sập ≥ 3%), chờ 1,25×, chờ 1,5× (chờ 8 phút).
Mỗi lệnh khớp lưu đường giá 120 phút sau khớp (bps theo chiều lệnh, mỗi phút: mở / tốt nhất / xấu nhất) để mô phỏng ở máy: research/r9_analyze.py.
Chạy: research.yml script=round9.py nsym=1000"""
import concurrent.futures as cf
import gzip
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round9.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402
import round6 as R6  # noqa: E402

log = E.log
DS, W, HP = (1.25, 1.5), 8, 120


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
    mq = pd.Series(qv).rolling(60, min_periods=40).median().shift(1).values
    q24 = pd.Series(qv).rolling(1440, min_periods=600).sum().shift(1).values
    z = np.abs(r) / sd
    base = (z >= 4) & (np.abs(r) * 1e4 >= 300) & ok & (q24 >= 2e6)
    raw8 = np.flatnonzero(base & (qv >= 8 * mq))
    out = []
    for i in E.dedupe(raw8, 30):
        if i < 1440 or i + 2 + W + HP >= n:
            continue
        side = -1 if r[i] > 0 else 1; c0 = c[i]; mv = abs(math.expm1(r[i]))
        prior6 = int(((raw8 < i) & (raw8 >= i - 360)).sum())
        r15 = side * (c[i - 1] / c[i - 16] - 1) * 1e4
        r4h = side * (c0 / c[i - 240] - 1) * 1e4
        if prior6 or r4h <= -1000 or (side < 0 and r15 > 100):
            continue
        rec = dict(s=s, T=int(t0 + i), side=side, R=round(float(abs(r[i]) * 1e4)), r15=round(float(r15)), p={})
        legs = ([(0.0, o[i + 1], i)] if side > 0 and r15 <= -300 else [])
        for D in DS:
            L = c0 * (1 - side * D * mv); Lt = L * (1 - side * R6.THR / 1e4)
            for j in range(i + 1, i + 1 + W):
                if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                    legs.append((D, L, j)); break
        for D, L, f in legs:
            sl = slice(f + 1, f + 1 + HP)
            pn = lambda px: np.round(side * (px / L - 1) * 1e4).astype(int)  # noqa: E731
            fav, adv = (pn(h[sl]), pn(l[sl])) if side > 0 else (pn(l[sl]), pn(h[sl]))
            rec["p"][str(D)] = dict(f=int(f - i), o=pn(o[sl]).tolist(), b=fav.tolist(), w=adv.tolist(), e=int(pn(np.array([o[f + 1 + HP]]))[0]))
        if rec["p"]:
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
    os.makedirs(E.OUT, exist_ok=True)
    with gzip.open(os.path.join(E.OUT, "round9.json.gz"), "wt") as f:
        json.dump(evs, f, separators=(",", ":"))
    log(f"xong {len(evs)} cú sốc qua bộ lọc · {sum(len(e['p']) for e in evs)} lệnh khớp · {time.time() - t00:.0f}s")
