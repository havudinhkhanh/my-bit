"""Phân tích vòng 8 (research_out/round8.json.gz): đặt lệnh chờ ở độ sâu nào, chờ bao lâu thì Bắt râu sập khớp nhiều hơn mà vẫn lời?
Bộ lọc như bot đang chạy (khối lượng ≥ 8×, không có cú sốc khác trong 6 giờ, dao rơi 4 giờ > -10%, xả sau bơm 15 phút chỉ áp cho Short).
Mỗi mức chờ dùng SZ tài sản; lời cộng dồn theo thời gian; sụt tối đa theo đường tài sản. Mẫu học 2025, ngoài mẫu 2026.
Chạy: python research/r8_analyze.py <round8.json.gz> [SZ=0.025]"""
import gzip
import itertools
import json
import sys

import numpy as np
import pandas as pd

P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round8.json.gz"
SZ = float(sys.argv[2]) if len(sys.argv) > 2 else 0.025
ev = json.load(gzip.open(P, "rt"))
E = pd.DataFrame([{k: v for k, v in e.items() if k != "res"} for e in ev])
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True)
E["half"] = E.ts.dt.year.astype(str) + np.where(E.ts.dt.month <= 6, "H1", "H2")
DAYS = (E["T"].max() - E["T"].min()) / 1440
F = (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))
idx = np.flatnonzero(F.values)
LV = ["0.0", "0.5", "0.75", "1.0", "1.25", "1.5", "2.0"]
print(f"{len(ev)} cú sốc · {F.sum()} qua bộ lọc hiện tại ({F.sum() / DAYS:.2f}/ngày) · {DAYS:.0f} ngày · mỗi mức {SZ * 100:.1f}% tài sản")

# bảng kết quả từng mức: pnl (bps) nếu khớp trong W phút, NaN nếu không
def col(D, W, ex):
    out = np.full(len(ev), np.nan)
    for i in idx:
        x = ev[i]["res"].get(D)
        if x and x["f"] <= W:
            out[i] = x[ex]
    return out


cache = {}
def lvl(D, W, ex):
    k = (D, W, ex)
    if k not in cache:
        cache[k] = col(D, 0 if D == "0.0" else W, ex) if D != "0.0" else col(D, 99, ex)
    return cache[k]


def run(levels, W, ex):
    M = np.vstack([lvl(D, W, ex) for D in levels])            # mức × cú sốc
    fills = (~np.isnan(M)).sum(0)
    g = np.nansum(M, 0) / 1e4 * SZ                            # lời/lỗ theo phần tài sản của từng cú sốc
    m = fills > 0
    x = pd.DataFrame({"g": g[m], "T": E["T"].values[m], "half": E["half"].values[m], "b": np.nansum(M, 0)[m] / fills[m]}).sort_values("T")
    if not len(x):
        return None
    eq = np.cumprod(1 + x.g.values); dd = (1 - eq / np.maximum.accumulate(eq)).max() * 100
    per = x.assign(G=1 + x.g).groupby("half")["G"].prod().sub(1).mul(100).round(0).to_dict()
    return dict(cfg=f"{'+'.join('ngay' if D == '0.0' else D for D in levels)} · chờ {W}p · giữ {ex[1:]}p", shocks=int(m.sum()), perday=m.sum() / DAYS, fills=int(fills.sum()),
                mean=float(np.nanmean(M[~np.isnan(M)])), win=float((x.b > 0).mean() * 100), tot=(eq[-1] - 1) * 100, dd=dd, per=per)


rows = []
for ex in ("t60", "t30"):
    for W in (8, 20):
        for n in (1, 2):
            for lv in itertools.combinations(LV, n):
                if W == 20 and lv == ("0.0",):
                    continue
                r = run(lv, W, ex)
                if r:
                    rows.append(r)
R = pd.DataFrame(rows)
fmt = lambda r: (f"{r.cfg:<34} {r.shocks:>5} cú ({r.perday:4.2f}/ngày) · {r.fills:>5} lệnh · TB {r['mean']:+6.1f} bps/lệnh · thắng {r.win:4.1f}% · "  # noqa: E731
                 f"TỔNG {r.tot:+8.1f}% · sụt {r.dd:5.1f}% · " + " ".join(f"{k}:{v:+.0f}%" for k, v in r.per.items()))
cur = R[R.cfg == "1.5+2.0 · chờ 8p · giữ 60p"]
print("\n== Bot đang chạy"); [print(fmt(r)) for r in cur.itertuples()] if False else [print(fmt(r)) for _, r in cur.iterrows()]
print("\n== Xếp theo TỔNG lời (top 25)")
for _, r in R.sort_values("tot", ascending=False).head(25).iterrows():
    print(fmt(r))
print("\n== Tần suất cao nhất mà vẫn TỔNG > bot hiện tại")
base = float(cur.tot.iloc[0]) if len(cur) else 0
for _, r in R[R.tot > base].sort_values("perday", ascending=False).head(12).iterrows():
    print(fmt(r))
print("\n== Lời / sụt (TỔNG ÷ sụt tối đa) – top 12, ít nhất 2 cú/ngày")
R["ratio"] = R.tot / R.dd.clip(lower=1)
for _, r in R[R.perday >= 2].sort_values("ratio", ascending=False).head(12).iterrows():
    print(fmt(r))
