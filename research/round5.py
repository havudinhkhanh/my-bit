"""Vòng 5 – tăng tỉ lệ thắng & lợi nhuận cho Bắt râu sập.
Toàn bộ mã futures USDT Binance từ 01/2025 (khối lượng đúng thời điểm). Với MỖI cú sốc đủ chuẩn bot (≥ 300 bps, z ≥ 4, khối lượng ≥ 3×,
khối lượng 24h ≥ 2 triệu USD) xuất ra: đặc trưng chỉ dùng dữ liệu TRƯỚC/TẠI nến sốc + kết quả nhiều cách vào/thoát:
  - độ sâu lệnh chờ D ∈ 1,0 / 1,5 / 2,0 / 2,5 / 3,0 × cú sốc (chờ 15 phút, khớp phải xuyên qua 5 bps)
  - thoát theo giờ H ∈ 15 / 30 / 60 / 120 / 240 phút (taker + trượt 10 bps)
  - chốt lời bằng lệnh chờ (maker) khi giá hồi về 1/3, 1/2, toàn bộ khoảng tới giá đóng nến sốc, hoặc về giá trước cú sốc; tối đa 60 / 120 / 240 phút
  - thoát sớm có điều kiện: sau 15 / 30 phút mà đang lỗ thì ra, còn lời thì giữ tới 60 / 120 phút
  - mức lỗ tạm lớn nhất / lời tạm lớn nhất trong 60 phút (để thử cắt lỗ ở máy)
Phân tích làm ở máy (research/r5_analyze.py) – dữ liệu xuất ra research_out/round5.json.gz.
Chạy: python research/round5.py"""
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
os.environ.setdefault("RS_LOG", "round5.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402

log = E.log
START = os.environ.get("RS_START", "2025-01")
MAKER, FEE, EXIT_SLIP, THROUGH, XTRA = 2.0, 5.0, 10.0, 5.0, 3.0
DS = (1.0, 1.5, 2.0, 2.5, 3.0)
W = 15
HS = (15, 30, 60, 120, 240)
TPF = (0.33, 0.5, 1.0, "p0")
TPH = (60, 120, 240)
EARLY = ((15, 60), (15, 120), (30, 60), (30, 120))
HMAX = 240


def months_from(start):
    y, m = map(int, start.split("-")); out = []
    while (y, m) < (E.TODAY.year, E.TODAY.month):
        out.append(f"{y:04d}-{m:02d}"); m += 1
        if m > 12:
            y += 1; m = 1
    return out


MONTHS = months_from(START)
DAYS = [(dt.date(E.TODAY.year, E.TODAY.month, 1) + dt.timedelta(days=k)).isoformat() for k in range((E.TODAY - dt.date(E.TODAY.year, E.TODAY.month, 1)).days)]


def load(s):
    L = [E.fetch(s, "monthly", m) for m in MONTHS] + [E.fetch(s, "daily", d) for d in DAYS]
    L = [d for d in L if d is not None and len(d)]
    if not L:
        return None
    d = pd.concat(L).drop_duplicates("t").sort_values("t").set_index("t")
    return d.reindex(np.arange(int(d.index.min()), int(d.index.max()) + 1))


BTC = {}


def process(s):
    try:
        d = load(s)
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
    hi24 = pd.Series(h).rolling(1440, min_periods=600).max().shift(1).values
    lo24 = pd.Series(l).rolling(1440, min_periods=600).min().shift(1).values
    z = np.abs(r) / sd
    m = (z >= 4) & (np.abs(r) * 1e4 >= 300) & (qv >= 3 * mq) & ok & (q24 >= 2e6)
    raw = np.flatnonzero(m)
    bt, bc = BTC.get("t0"), BTC.get("c")
    out = []
    for i in E.dedupe(raw, 30):
        if i < 1440 or i + 2 + W + HMAX >= n:
            continue
        side = -1 if r[i] > 0 else 1; c0 = c[i]; p0 = c[i - 1]; mv = abs(math.expm1(r[i]))
        T = t0 + i
        bi = T - bt if bt is not None else -1
        btc1 = btc60 = btc240 = None
        if bt is not None and 240 <= bi < len(bc):
            btc1 = side * (bc[bi] / bc[bi - 1] - 1) * 1e4; btc60 = side * (bc[bi] / bc[bi - 60] - 1) * 1e4; btc240 = side * (bc[bi] / bc[bi - 240] - 1) * 1e4
        rng = h[i] - l[i]
        wick = ((c0 - l[i]) / rng if side > 0 else (h[i] - c0) / rng) if rng > 0 else 0.0     # 0 = đóng ở tận cùng cú sốc, 1 = đã hồi hết trong nến
        rec = dict(s=s, T=int(T), side=side, R=round(float(abs(r[i]) * 1e4)), z=round(float(z[i]), 1), vx=round(float(qv[i] / mq[i]), 1) if mq[i] > 0 else None,
                   q24=round(float(q24[i] / 1e6), 1), qs=round(float(qv[i] / 1e6), 2),
                   prior6=int(((raw < i) & (raw >= i - 360)).sum()), prior24=int(((raw < i) & (raw >= i - 1440)).sum()),
                   r15=round(float(side * (c[i - 1] / c[i - 16] - 1) * 1e4)), r4h=round(float(side * (c0 / c[i - 240] - 1) * 1e4)), r24=round(float(side * (c0 / c[i - 1440] - 1) * 1e4)),
                   ext=round(float((c0 / hi24[i] - 1) * 1e4 if side > 0 else (c0 / lo24[i] - 1) * 1e4)), vol1d=round(float(sd1d[i] * 1e4), 1) if np.isfinite(sd1d[i]) else None,
                   age=round(i / 1440, 1), wick=round(float(wick), 2),
                   btc1=None if btc1 is None else round(float(btc1)), btc60=None if btc60 is None else round(float(btc60)), btc240=None if btc240 is None else round(float(btc240)),
                   res={})
        R = rec["res"]
        for D in DS:
            L = c0 * (1 - side * D * mv); Lt = L * (1 - side * THROUGH / 1e4); fill = None
            for j in range(i + 1, i + 1 + W):
                if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                    fill = j; break
            if fill is None:
                continue
            R[f"f{D}"] = int(fill - i)
            pnl = lambda px: side * (px / L - 1) * 1e4  # noqa: E731
            taker = MAKER + FEE + XTRA + EXIT_SLIP; mk = MAKER + MAKER + XTRA
            for H in HS:
                R[f"t{D}|{H}"] = round(float(pnl(o[fill + 1 + H]) - taker), 1)
            seg_h = h[fill + 1:fill + 1 + HMAX]; seg_l = l[fill + 1:fill + 1 + HMAX]
            fav = seg_h if side > 0 else seg_l; adv = seg_l if side > 0 else seg_h
            R[f"mae{D}"] = round(float(min(0.0, pnl(adv[:60].min() if side > 0 else adv[:60].max()))), 0)
            R[f"mfe{D}"] = round(float(max(0.0, pnl(fav[:60].max() if side > 0 else fav[:60].min()))), 0)
            for F in TPF:
                tgt = p0 if F == "p0" else L + F * (c0 - L)
                tt = tgt * (1 + side * THROUGH / 1e4)
                hit = np.flatnonzero(fav >= tt) if side > 0 else np.flatnonzero(fav <= tt)
                for H in TPH:
                    if hit.size and hit[0] < H:
                        R[f"p{D}|{F}|{H}"] = round(float(pnl(tgt) - mk), 1)
                    else:
                        R[f"p{D}|{F}|{H}"] = R[f"t{D}|{H}"]
            for (a, H) in EARLY:
                u = pnl(o[fill + 1 + a])
                R[f"e{D}|{a}|{H}"] = round(float(u - taker), 1) if u < 0 else R[f"t{D}|{H}"]
        out.append(rec)
    return out


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    b = load("BTCUSDT")
    BTC["t0"] = int(b.index[0]); BTC["c"] = b.c.ffill().values
    log(f"{len(syms)} mã · {MONTHS[0]} → {MONTHS[-1]} + {len(DAYS)} ngày tháng này · BTC {len(BTC['c'])} phút")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(process, syms)):
            evs += out
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã, {len(evs)} sự kiện, {time.time() - t00:.0f}s")
    log(f"{len(evs)} cú sốc · {time.time() - t00:.0f}s")
    # độ rộng: bao nhiêu mã khác cũng sốc trong ±2 phút (sập cả thị trường hay riêng 1 coin)
    TT = np.array(sorted(e["T"] for e in evs))
    for e in evs:
        e["breadth"] = int(np.searchsorted(TT, e["T"] + 2, "right") - np.searchsorted(TT, e["T"] - 2, "left") - 1)
    with gzip.open(os.path.join(E.OUT, "round5.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    v = np.array([(e["res"].get("t1.5|60", np.nan) + e["res"].get("t2.0|60", np.nan)) / 2 if "t2.0|60" in e["res"] else e["res"].get("t1.5|60", np.nan) for e in evs], dtype=float)
    log(f"kiểm tra nhanh – như bot (1,5× & 2×, giữ 60p): n={np.isfinite(v).sum()} TB {np.nanmean(v):+.1f} bps")
    log(f"xong {time.time() - t00:.0f}s")
