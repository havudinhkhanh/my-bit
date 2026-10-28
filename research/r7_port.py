"""Mô phỏng DANH MỤC thật cho Bắt râu sập trên dữ liệu vòng 7: tối đa 6 lần bắt râu mở cùng lúc, dừng mở lệnh mới tới hết ngày (giờ VN)
khi lỗ trong ngày ≤ −3% (như bot), mỗi cú sốc 5% tài sản (2 mức × 2,5%). So các phương án bộ lọc. Chạy: python research/r7_port.py <round7.json.gz>"""
import gzip, json, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round7.json.gz"
EX = sys.argv[2] if len(sys.argv) > 2 else "t60"
ev = json.load(gzip.open(P, "rt"))
E = pd.DataFrame([{k: v for k, v in e.items() if k != "res"} | {"res": e["res"]} for e in ev]).sort_values("T").reset_index(drop=True)
TT = E["T"].values; SS = E["s"].values
# độ rộng: số coin KHÁC có cú sốc trong 10 phút trước (tính cả phút này) – chỉ dùng dữ liệu đã biết
lo = np.searchsorted(TT, TT - 10, "left"); hi = np.searchsorted(TT, TT, "right")
E["br10"] = [len(set(SS[a:b])) - 1 for a, b in zip(lo, hi)]
lo60 = np.searchsorted(TT, TT - 60, "left"); E["br60"] = [len(set(SS[a:b])) - 1 for a, b in zip(lo60, hi)]
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True)
E["vnday"] = (E.ts + pd.Timedelta(hours=7)).dt.strftime("%Y-%m-%d")
E["half"] = E.ts.dt.year.astype(str) + np.where(E.ts.dt.month <= 6, "H1", "H2")
DAYS = (TT.max() - TT.min()) / 1440


def run(mask, cap=6, dstop=3.0, name="", sz=0.025):
    x = E[mask]
    eq = 1.0; peak = 1.0; dd = 0.0; open_ = []; day = None; day0 = 1.0; paused = False; n = 0; tr = []; hv = {}
    lastp = {}
    for r in x.itertuples(index=False):
        t = r.T
        # đóng các lệnh đã hết giờ trước thời điểm này
        still = []
        for (tc, pnl, hf) in sorted(open_):
            if tc <= t:
                eq *= 1 + pnl; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1.0) * (1 + pnl)
            else:
                still.append((tc, pnl, hf))
        open_ = still
        if r.vnday != day:
            day = r.vnday; day0 = eq; paused = False
        if not paused and (eq / day0 - 1) * 100 <= -dstop:
            paused = True
        if paused or len(open_) >= cap or not r.res:
            continue
        legs = list(r.res.values())
        pnl = sum(l[EX] / 1e4 * sz for l in legs)
        tc = t + max(l["f"] for l in legs) + (61 if EX != "t90" else 91)
        open_.append((tc, pnl, r.half)); n += len(legs); tr += [l[EX] for l in legs]
    for (tc, pnl, hf) in open_:
        eq *= 1 + pnl; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1.0) * (1 + pnl)
    a = np.array(tr)
    print(f"{name:<62} {n:>5} lệnh ({n / DAYS:.1f}/ngày) · TB {a.mean():+6.1f} bps · thắng {(a > 0).mean() * 100:4.1f}% · TỔNG {(eq - 1) * 100:+7.1f}% · sụt tối đa {dd * 100:5.1f}% · "
          + " ".join(f"{k}:{(v - 1) * 100:+.0f}%" for k, v in sorted(hv.items())))


V8 = E.vx >= 8; f6 = E.prior6 == 0; r15 = E.r15 <= 100; kn = E.r4h > -1000; r15s = (E.side > 0) | r15
print(f"{len(E)} cú sốc · {DAYS:.0f} ngày · thoát {EX} · tối đa 6 lệnh cùng lúc · dừng ngày khi lỗ 3%")
run(V8 & f6 & r15 & kn, name="Hiện tại (≥8× · 6 giờ · 15 phút · dao rơi 10%)")
run(V8 & f6 & r15 & kn, dstop=1e9, cap=10**6, name="  (cùng bộ lọc nhưng KHÔNG giới hạn 6 lệnh / dừng ngày)")
run(V8 & f6 & r15, name="Bỏ dao rơi")
run(V8 & f6 & r15s & kn, name="Lọc 15 phút chỉ áp cho Short")
run(V8 & f6 & r15s, name="Bỏ dao rơi + lọc 15 phút chỉ cho Short")
run(V8 & r15 & kn, name="Bỏ lọc 6 giờ")
run(V8 & f6 & kn, name="Bỏ lọc 15 phút")
for N in (3, 5, 8, 12):
    run(V8 & f6 & r15 & (E.br10 < N), name=f"Thay dao rơi bằng 'thị trường sập': < {N} coin khác sốc trong 10 phút")
for N in (3, 5, 8):
    run(V8 & f6 & r15 & kn & (E.br10 < N), name=f"Hiện tại + chặn khi ≥ {N} coin khác sốc trong 10 phút")
    run(V8 & f6 & r15s & kn & (E.br10 < N), name=f"Hiện tại + chặn ≥ {N} coin/10p + lọc 15p chỉ Short")
for K in (-1500, -2000):
    for N in (3, 5):
        run(V8 & f6 & r15 & ((E.r4h > K) & (E.br10 < N) | kn), name=f"Dao rơi 10% → nới tới {-K // 100}% nếu < {N} coin khác sốc/10p")
run(V8 & f6 & r15 & kn & (E.side > 0), name="Hiện tại – chỉ Long")
print("\n-- giới hạn nào ăn mất lời (bộ lọc hiện tại)")
M = V8 & f6 & r15 & kn
for cap, ds in ((6, 1e9), (10, 1e9), (20, 1e9), (10**6, 3.0), (10**6, 5.0), (10**6, 10.0), (12, 5.0), (20, 10.0)):
    run(M, cap=cap, dstop=ds, name=f"tối đa {cap if cap < 1e5 else '∞'} lệnh cùng lúc · dừng ngày {ds if ds < 1e8 else 'không'}%")

print("\n-- cùng tổng vốn tối đa đang dùng (30% tài sản danh nghĩa), chia nhỏ hơn cho nhiều cú sốc hơn")
for sz, cap in ((0.025, 6), (0.0125, 12), (0.00625, 24), (0.003125, 48)):
    run(M, cap=cap, sz=sz, name=f"mỗi cú sốc {sz * 200:.2f}% tài sản · tối đa {cap} cùng lúc")
    run(V8 & f6 & r15s & kn, cap=cap, sz=sz, name=f"   + lọc 15 phút chỉ cho Short")
