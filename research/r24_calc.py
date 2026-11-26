"""Vòng 24 – phân tích lướt giây ra lệnh chủ động. Chạy: python research/r24_calc.py <round24.json.gz>"""
import gzip, json, sys
import numpy as np, pandas as pd
R = json.load(gzip.open(sys.argv[1] if len(sys.argv) > 1 else "research_out/round24.json.gz", "rt"))
rows = []
for r in R:
    for k, v in r["a"].items():
        rows.append(dict(s=r["s"], d=r["d"], var=k, n=v[0], sm=v[1], sq=v[2], w=v[3], h=v[4], **{f"x_{a}": b for a, b in v[5].items()}))
D = pd.DataFrame(rows); D["dt"] = pd.to_datetime(D.d); last = D.dt.max(); D["yr"] = D.dt.dt.year.astype(str); D["rec"] = D.dt > last - pd.Timedelta(days=21)
NF = D.groupby("d").s.nunique()      # số mã có dữ liệu mỗi ngày
print(f"# Vòng 24 – lướt giây, ra lệnh chủ động ({D.dt.min():%d/%m/%Y} → {last:%d/%m/%Y}, {D.d.nunique()} ngày mẫu, {D.s.nunique()} mã, theo từng giao dịch thật)\n")
print("Biến thể = K (bội khối lượng) | X (bps giá 2 giây) | hướng | T (lời ròng mục tiêu, bps) | S (cắt lỗ, bps) | kiểu chốt | độ trễ ms | trượt thêm bps\n")
rng = np.random.default_rng(3)
def boot(g):
    S = g.groupby("d").sm.sum().values; C = g.groupby("d").n.sum().values
    if len(S) < 10 or C.sum() == 0: return np.nan
    idx = rng.integers(0, len(S), (2000, len(S))); m = S[idx].sum(1) / np.maximum(1, C[idx].sum(1)); return (m > 0).mean()
def summ(g):
    n = g.n.sum(); m = g.sm.sum() / n if n else np.nan; sd = np.sqrt(max(g.sq.sum() / n - m * m, 0)) if n else np.nan
    return dict(n=n, avg=m, t=m / (sd / np.sqrt(max(n, 1))) if sd > 0 else np.nan, win=g.w.sum() / max(n, 1) * 100, hold=g.h.sum() / max(n, 1), per=n / max(1, g.groupby("d").s.nunique().sum()))
S = []
for v, g in D.groupby("var"):
    a = summ(g); ins = g[g.yr.isin(["2024", "2025"])]; oos = g[g.yr == "2026"]; rec = g[g.rec]
    a.update(var=v, ins=summ(ins)["avg"], oos=summ(oos)["avg"], rec=summ(rec)["avg"], y24=summ(g[g.yr == "2024"])["avg"], y25=summ(g[g.yr == "2025"])["avg"], y26=summ(oos)["avg"], p=boot(g), poos=boot(oos),
             **{k: g[k].sum() / max(g.n.sum(), 1) * 100 for k in ("x_tp", "x_sl", "x_rv", "x_max")})
    S.append(a)
S = pd.DataFrame(S)
cols = "| Biến thể | Lệnh | Lệnh/mã/ngày | Giữ TB (giây) | Thắng | TB bps ròng | t | 2024 | 2025 | 2026 | 21 ngày gần nhất | P(>0) theo ngày | P(>0) 2026 | Chốt / Cắt / Đảo / Trần |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"
def line(r): return (f"| {r['var']} | {r['n']:,} | {r['per']:.1f} | {r['hold']:.0f} | {r['win']:.0f}% | {r['avg']:+.1f} | {r['t']:.1f} | {r['y24']:+.1f} | {r['y25']:+.1f} | {r['y26']:+.1f} | {r['rec']:+.1f} | {r['p']:.2f} | {r['poos']:.2f} | "
                     f"{r['x_tp']:.0f}/{r['x_sl']:.0f}/{r['x_rv']:.0f}/{r['x_max']:.0f}% |")
print(f"## 1. Tổng quan: {len(S)} biến thể – {int((S.avg > 0).sum())} biến thể dương cả kỳ, {int(((S.ins > 0) & (S.oos > 0)).sum())} dương cả 2024–25 lẫn 2026, {int(((S.ins > 0) & (S.oos > 0) & (S.rec > 0)).sum())} dương thêm 21 ngày gần nhất\n")
print("TB bps ròng / lệnh – phân bố trên mọi biến thể: " + " · ".join(f"p{q}: {np.percentile(S.avg, q):+.1f}" for q in (5, 25, 50, 75, 95)) + "\n")
print("## 2. 15 biến thể tốt nhất khi CHỌN trên 2024–2025 (rồi xem 2026 & 21 ngày gần nhất)\n"); print(cols)
for _, r in S.sort_values("ins", ascending=False).head(15).iterrows(): print(line(r))
print("\n## 3. Theo từng yếu tố (TB bps ròng / lệnh, trung bình các biến thể)\n")
P = S.var.str.split("|", expand=True); P.columns = ["K", "X", "dir", "T", "S", "tp", "lat", "slip"]; S2 = pd.concat([S, P], axis=1)
for c, nm in (("dir", "hướng"), ("tp", "kiểu chốt"), ("lat", "độ trễ ms"), ("slip", "trượt"), ("T", "mục tiêu T"), ("S", "cắt lỗ S"), ("K", "bội khối lượng K"), ("X", "giá 2 giây X")):
    g = S2.groupby(c)[["avg", "ins", "oos", "rec"]].mean(); print(f"- **{nm}**: " + " · ".join(f"{i}: cả kỳ {r.avg:+.1f} / 24–25 {r.ins:+.1f} / 2026 {r.oos:+.1f} / 21 ngày {r.rec:+.1f}" for i, r in g.iterrows()))
print("\n## 4. Quy ra % tài sản mỗi lệnh (mục tiêu 0,05% = 5 bps tài sản): lời / lệnh = TB bps × đòn bẩy (giá trị lệnh / tài sản)\n")
b = S.sort_values("ins", ascending=False).iloc[0]
for lev in (1, 3, 5, 10):
    print(f"- x{lev}: biến thể chọn trên 2024–25 → 2026 {b['oos'] * lev / 100:+.3f}% tài sản/lệnh · 21 ngày gần nhất {b['rec'] * lev / 100:+.3f}%")
