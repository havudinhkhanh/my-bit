"""Phân tích vòng 7 (research_out/round7.json.gz): bộ lọc Bắt râu sập có đáng không – tính TỔNG lợi nhuận, không chỉ lãi TB/lệnh.
Mỗi cú sốc dùng 5% tài sản (2 mức chờ, mỗi mức 2,5%) như bot. Lợi nhuận cộng dồn theo thứ tự thời gian, sụt giảm tối đa theo đường tài sản.
Mẫu học = 2025, ngoài mẫu = 2026. Chạy: python research/r7_analyze.py <round7.json.gz> [t60|tr150|t90]"""
import gzip
import json
import sys

import numpy as np
import pandas as pd

P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round7.json.gz"
EX = sys.argv[2] if len(sys.argv) > 2 else "t60"
SZ = 0.025                                      # phần tài sản mỗi mức chờ
ev = json.load(gzip.open(P, "rt"))
rows = []
for e in ev:
    res = e.pop("res")
    for D, x in res.items():
        rows.append({**e, "D": float(D), **x})
d = pd.DataFrame(rows)
d["ts"] = pd.to_datetime(d["T"] * 60, unit="s", utc=True)
d["half"] = d.ts.dt.year.astype(str) + np.where(d.ts.dt.month <= 6, "H1", "H2")
d["yr"] = d.ts.dt.year
d = d.sort_values("T").reset_index(drop=True)
DAYS = (d["T"].max() - d["T"].min()) / 1440
d["pnl"] = d[EX]
F = {"vol8": d.vx >= 8, "f6": d.prior6 == 0, "r15": d.r15 <= 100, "knife": d.r4h > -1000}
CUR = F["vol8"] & F["f6"] & F["r15"] & F["knife"]


def curve(x):
    """x: DataFrame các lệnh đã chọn (theo thời gian) → tổng lời cộng dồn %, sụt tối đa %, theo nửa năm"""
    if not len(x):
        return dict(n=0)
    g = 1 + x["pnl"].values / 1e4 * SZ
    eq = np.cumprod(g); dd = (1 - eq / np.maximum.accumulate(eq)).max() * 100
    per = x.assign(g=g).groupby("half")["g"].prod().sub(1).mul(100).round(1).to_dict()
    return dict(n=len(x), perday=round(len(x) / DAYS, 2), mean=round(x["pnl"].mean(), 1), win=round((x["pnl"] > 0).mean() * 100, 1),
                tot=round((eq[-1] - 1) * 100, 1), dd=round(dd, 1), per=per)


def line(name, m, extra=""):
    c = curve(d[m])
    if not c["n"]:
        print(f"{name:<52} —"); return c
    print(f"{name:<52} {c['n']:>5} lệnh ({c['perday']:.2f}/ngày) · TB {c['mean']:+6.1f} bps · thắng {c['win']:4.1f}% · TỔNG {c['tot']:+7.1f}% · sụt tối đa {c['dd']:5.1f}% · "
          + " ".join(f"{k}:{v:+.0f}%" for k, v in c["per"].items()) + extra)
    return c


print(f"{len(ev)} cú sốc · {len(d)} lệnh khớp · {d.ts.min():%Y-%m-%d} → {d.ts.max():%Y-%m-%d} ({DAYS:.0f} ngày) · cách thoát: {EX} · mỗi mức {SZ * 100:.1f}% tài sản")
print("\n== 1. Bộ lọc hiện tại so với bỏ bớt (TỔNG = lời cộng dồn cả giai đoạn)")
base = line("Hiện tại (khối lượng ≥8× + 6 giờ + 15 phút + dao rơi)", CUR)
line("Không lọc gì (khối lượng ≥3×)", pd.Series(True, index=d.index))
line("Chỉ khối lượng ≥8×", F["vol8"])
for k, lab in (("f6", "cú sốc khác trong 6 giờ"), ("r15", "xả sau bơm 15 phút"), ("knife", "dao rơi 4 giờ"), ("vol8", "khối lượng ≥ 8×")):
    m = CUR | (~F[k] & np.logical_and.reduce([F[j] for j in F if j != k]))
    blk = ~F[k] & np.logical_and.reduce([F[j] for j in F if j != k])
    b = d[blk]
    print(f"\n  Bỏ lọc '{lab}': lọc này đang chặn {len(b)} lệnh · TB {b['pnl'].mean():+.1f} bps · thắng {(b['pnl'] > 0).mean() * 100:.0f}% · "
          f"2025 {b[b.yr == 2025]['pnl'].mean():+.0f} / 2026 {b[b.yr == 2026]['pnl'].mean():+.0f} bps · 5% xấu nhất {np.percentile(b['pnl'], 5) if len(b) else 0:+.0f}")
    line(f"    → hiện tại nhưng KHÔNG lọc '{lab}'", m)

print("\n== 2. Lệnh bị chặn: có nhóm nào đáng giữ lại không? (TB bps 2025 / 2026 · số lệnh)")
V8 = F["vol8"]


def buckets(name, col, edges, mask):
    x = d[mask]
    cut = pd.cut(x[col], edges)
    g = x.groupby(cut, observed=True)
    out = []
    for k, q in g:
        a, b2 = q[q.yr == 2025]["pnl"], q[q.yr == 2026]["pnl"]
        out.append(f"{k}: {a.mean():+.0f}/{b2.mean():+.0f} ({len(q)})")
    print(f"  {name}: " + " · ".join(out))


buckets("Số cú sốc khác 6 giờ trước", "prior6", [-1, 0, 1, 2, 4, 99], V8 & F["r15"] & F["knife"])
buckets("Giá 15 phút trước, cùng hướng lệnh (bps)", "r15", [-1e5, -300, -100, 0, 100, 200, 400, 800, 1e5], V8 & F["f6"] & F["knife"])
buckets("Giá 4 giờ trước, so hướng lệnh (bps)", "r4h", [-1e5, -3000, -2000, -1000, -500, 0, 500, 1e5], V8 & F["f6"] & F["r15"])
buckets("Giá 24 giờ trước, so hướng lệnh (bps)", "r24", [-1e5, -5000, -2000, -1000, 0, 1000, 1e5], CUR)
buckets("Độ lớn cú sốc (bps)", "R", [0, 400, 600, 1000, 1500, 1e5], CUR)
buckets("Khối lượng so trung vị (×)", "vx", [0, 5, 8, 15, 30, 60, 1e6], F["f6"] & F["r15"] & F["knife"])
buckets("Râu trong nến sốc (0 = đóng ở tận cùng)", "wick", [-0.01, 0.1, 0.3, 0.5, 1.01], CUR)
for sd, lab in ((1, "Long (mua cú sập)"), (-1, "Short (bán cú vọt)")):
    line(f"  Hiện tại – chỉ {lab}", CUR & (d.side == sd))

print("\n== 3. Theo từng coin: cú sốc lặp lại trên cùng coin – chặn tất cả (như bây giờ) hay chỉ chặn khi lần trước LỖ?")
C = d[V8 & F["r15"] & F["knife"]].copy()
evk = C.groupby(["s", "T"])["pnl"].mean().reset_index().sort_values("T")
prev = {}
info = []
for s, T, p in evk.itertuples(index=False):
    L = prev.get(s, [])
    rec6 = [q for q in L if T - q[0] <= 360]
    known = [q for q in L if T - q[0] >= 70 and T - q[0] <= 1440]
    last = known[-1] if known else None
    info.append((s, T, len(rec6), None if last is None else last[1], len([q for q in L if T - q[0] < 70])))
    prev.setdefault(s, []).append((T, p))
I = pd.DataFrame(info, columns=["s", "T", "rep6", "lastp", "open"])
C = C.merge(I, on=["s", "T"], how="left")
sel = lambda m: C[m]  # noqa: E731


def cline(name, m):
    x = C[m].sort_values("T")
    g = 1 + x["pnl"].values / 1e4 * SZ; eq = np.cumprod(g); dd = (1 - eq / np.maximum.accumulate(eq)).max() * 100 if len(g) else 0
    per = x.assign(g=g).groupby("half")["g"].prod().sub(1).mul(100).round(0).to_dict()
    print(f"  {name:<58} {len(x):>5} lệnh · TB {x['pnl'].mean():+6.1f} · thắng {(x['pnl'] > 0).mean() * 100:4.1f}% · TỔNG {(eq[-1] - 1) * 100 if len(g) else 0:+7.1f}% · sụt {dd:5.1f}% · " + " ".join(f"{k}:{v:+.0f}%" for k, v in per.items()))


cline("Chặn mọi cú sốc lặp lại trong 6 giờ (hiện tại)", C.prior6 == 0)
cline("Không chặn lặp lại", C.prior6 >= 0)
cline("Lệnh lặp lại (đang bị chặn) – riêng nhóm này", C.prior6 > 0)
cline("  … trong đó lần trước trên coin LỜI", (C.prior6 > 0) & (C.lastp > 0))
cline("  … trong đó lần trước trên coin LỖ", (C.prior6 > 0) & (C.lastp <= 0))
cline("  … lần trước chưa biết kết quả (< 70 phút)", (C.prior6 > 0) & C.lastp.isna())
cline("Chỉ chặn khi lần trước LỖ hoặc chưa rõ (trong 6 giờ)", (C.prior6 == 0) | (C.lastp > 0))
cline("Chặn nếu lần trước LỖ trong 24 giờ, còn lại như hiện tại", (C.prior6 == 0) & ~(C.lastp <= 0))

print("\n== 4. Ngưỡng lọc khác (giữ các lọc còn lại như hiện tại) – TỔNG % · sụt % · TB bps")
for k, col, vals, op in (("r15", "r15", (50, 100, 200, 300, 500, 1e9), "le"), ("knife", "r4h", (-500, -1000, -1500, -2000, -3000, -1e9), "gt"), ("vol8", "vx", (3, 5, 8, 12, 20), "ge")):
    others = np.logical_and.reduce([F[j] for j in F if j != k])
    out = []
    for v in vals:
        m = others & ((d[col] <= v) if op == "le" else (d[col] > v) if op == "gt" else (d[col] >= v))
        c = curve(d[m]); out.append(f"{'không lọc' if abs(v) >= 1e9 else v}: {c['tot']:+.0f}% · sụt {c['dd']:.0f}% · {c['mean']:+.0f} ({c['n']})")
    print(f"  {k}: " + " | ".join(out))
