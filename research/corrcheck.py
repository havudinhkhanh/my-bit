"""Kiểm tra: tương quan lợi suất 1 phút ước lượng từ 60 phút TRƯỚC có dự báo được việc 2 coin cùng chạy trong 60 phút SAU không?
Nếu có → dùng tương quan để tính rủi ro danh mục là hợp lý (không chỉ đếm cùng chiều / ngược chiều).
Dữ liệu: nến 1 phút Binance futures, 80 mã khối lượng lớn nhất, 10 ngày gần nhất. Chạy: python research/corrcheck.py"""
import concurrent.futures as cf
import datetime as dt
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "corrcheck.log")
import events as E  # noqa: E402

log = E.log
N, DAYS = 80, 10
days = [(E.TODAY - dt.timedelta(days=k)).isoformat() for k in range(DAYS + 1, 1, -1)]
syms = E.list_symbols()
with cf.ThreadPoolExecutor(48) as ex:
    probe = dict(zip(syms, ex.map(lambda s: E.fetch(s, "daily", days[-1]), syms)))
vol = {s: float(d.qv.sum()) for s, d in probe.items() if d is not None and len(d) > 1000}
top = [s for s, _ in sorted(vol.items(), key=lambda x: -x[1])[:N]]
if "BTCUSDT" not in top:
    top[-1] = "BTCUSDT"
with cf.ThreadPoolExecutor(48) as ex:
    res = list(ex.map(lambda j: (j[0], E.fetch(j[0], "daily", j[1])), [(s, d) for s in top for d in days]))
C = {}
for s, d in res:
    if d is not None:
        C.setdefault(s, []).append(d.set_index("t").c)
px = pd.DataFrame({s: pd.concat(v).sort_index() for s, v in C.items()})
px = px[~px.index.duplicated()].sort_index()
r = np.log(px).diff()
log(f"{px.shape[1]} mã × {px.shape[0]} phút ({days[0]} → {days[-1]})")
btc = r["BTCUSDT"]
rows = []
cols = [c for c in r.columns if c != "BTCUSDT"]
rng = np.random.default_rng(0)
for t in range(120, len(r) - 61, 30):
    past, fut = r.iloc[t - 60:t], r.iloc[t:t + 60]
    pb = past.corrwith(past["BTCUSDT"])
    for _ in range(20):
        a, b = rng.choice(cols, 2, replace=False)
        pa, pbb, fa, fb = past[a], past[b], fut[a], fut[b]
        if pa.count() < 50 or pbb.count() < 50 or fa.count() < 50 or fb.count() < 50:
            continue
        rho_s = pa.corr(pbb); fac = pb[a] * pb[b]
        rho = 0.7 * rho_s + 0.3 * fac
        realized = fa.corr(fb)
        # "cùng cược": 2 lệnh cùng chiều – độ biến động tổng 60 phút sau so với 2 lệnh độc lập
        ra, rb = fa.sum() / fa.std(), fb.sum() / fb.std()
        rows.append((rho_s, rho, realized, ra * rb))
D = pd.DataFrame(rows, columns=["rho_s", "rho", "real", "co"]).dropna()
log(f"{len(D)} cặp × thời điểm")
log(f"Tương quan giữa ρ dự báo (60 phút trước) và ρ thực tế (60 phút sau): thô {D.rho_s.corr(D.real):.2f} · co về BTC {D.rho.corr(D.real):.2f}")
D["bin"] = pd.cut(D.rho, [-1, 0, 0.2, 0.4, 0.6, 0.8, 1])
g = D.groupby("bin", observed=True).agg(n=("real", "size"), du_bao=("rho", "mean"), thuc_te=("real", "mean"), cung_chay=("co", "mean"))
log("Theo nhóm ρ dự báo → ρ thực tế trung bình 60 phút sau; 'cùng chạy' = E[z_a × z_b] lợi suất 60 phút (0 = độc lập, 1 = luôn cùng chạy):")
for k, x in g.iterrows():
    log(f"  ρ dự báo {k}: n={int(x.n)} · dự báo TB {x.du_bao:.2f} · thực tế TB {x.thuc_te:.2f} · cùng chạy {x.cung_chay:.2f}")
log(f"Tương quan 1 phút trung bình giữa các coin: {D.real.mean():.2f} · với BTC (TB các coin): {r[cols].corrwith(btc).mean():.2f}")
