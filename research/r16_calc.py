"""Vòng 16 – phân tích: (1) vào theo "đáy cong" so với lệnh chờ độ sâu cố định, cùng luật danh mục bot; (2) đặc trưng toán / hình học làm bộ lọc.
Chạy: python research/r16_calc.py <round16.json.gz>"""
import gzip, json, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round16.json.gz"
E = pd.DataFrame(json.load(gzip.open(P, "rt"))).sort_values("T").reset_index(drop=True)
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True); vn = E.ts + pd.Timedelta(hours=7)
E["vnday"] = vn.dt.strftime("%Y-%m-%d"); E["half"] = E.ts.dt.year.astype(str) + np.where(E.ts.dt.month <= 6, "H1", "H2")
ALLD = pd.date_range(vn.min().normalize(), vn.max().normalize(), freq="D").strftime("%Y-%m-%d")
SZ, CAP, W, FAR = 0.075, 9, 8, ("1.25", "1.5")
F = (E.R >= 300) & (E.z >= 4) & (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))
def legs_now(r):
    L = [(r.res[D]["tr150"], SZ / 2, r.res[D]["f"]) for D in FAR if D in r.res and r.res[D]["f"] <= W]
    if r.side > 0 and r.r15 <= -300 and "0.0" in r.res: L.append((r.res["0.0"]["tr150"], 0.02, 0))
    return L
def mk(key, mode):
    def f(r):
        c = r.res.get(key); now = legs_now(r)
        if mode == "only": return [(c["tr150"], SZ, c["f"])] if c else []
        if mode == "add": return now + ([(c["tr150"], SZ / 2, c["f"])] if c else [])            # thêm 1 chân "đáy cong" bên cạnh lệnh chờ
        if mode == "fallback": return now if now else ([(c["tr150"], SZ / 2, c["f"])] if c else [])   # chỉ khi lệnh chờ KHÔNG khớp
    return f
def run(legs, mask=None):
    eq = peak = 1.0; dd = 0.0; op = []; day = None; day0 = 1.0; paused = False; hv = {}; dayp = {}; tr = []
    for r in E[F if mask is None else (F & mask)].itertuples(index=False):
        t = r.T; st = []
        for (tc, p, hf, d_) in sorted(op):
            if tc <= t: eq *= 1 + p; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1) * (1 + p); dayp[d_] = dayp.get(d_, 1) * (1 + p)
            else: st.append((tc, p, hf, d_))
        op = st
        if r.vnday != day: day = r.vnday; day0 = eq; paused = False
        if not paused and (eq / day0 - 1) * 100 <= -3: paused = True
        if paused or len(op) >= CAP: continue
        L = legs(r)
        if not L: continue
        p = sum(x / 1e4 * s for x, s, _ in L); tr.append(p / sum(s for _, s, _ in L) * 1e4)
        op.append((t + max(f for _, _, f in L) + 61, p, r.half, r.vnday))
    for (tc, p, hf, d_) in op: eq *= 1 + p; hv[hf] = hv.get(hf, 1) * (1 + p); dayp[d_] = dayp.get(d_, 1) * (1 + p)
    dr = np.array([dayp.get(d, 1) - 1 for d in ALLD]); tr = np.array(tr) if tr else np.array([0.0])
    return dict(tot=(eq - 1) * 100, dd=dd * 100, n=len(tr), avg=tr.mean(), win=(tr > 0).mean() * 100, big=int((tr < -1000).sum()), wday=dr.min() * 100, h=" ".join(f"{k} {(v - 1) * 100:+.1f}%" for k, v in sorted(hv.items())))
def row(name, x): print(f"| {name} | {x['tot']:+.1f}% | {x['dd']:.1f}% | {x['n']} | {x['avg']:.0f} | {x['win']:.1f}% | {x['big']} | {x['wday']:.1f}% | {x['h']} |")
HD = "| Cách vào | Lợi nhuận | Sụt tối đa | Lệnh | TB bps | Thắng | Lỗ > 10% | Ngày tệ | Theo nửa năm |\n|---|---|---|---|---|---|---|---|---|"
print(f"# Vòng 16 – vào theo đáy cong + đặc trưng toán / hình học ({E.ts.min():%d/%m/%Y} → {E.ts.max():%d/%m/%Y}, {len(ALLD)} ngày, {int(F.sum())} cú sốc qua lọc)\n")
print("## 1. Cách vào\n\n" + HD)
base = run(legs_now); row("HIỆN TẠI: lệnh chờ 1,25× / 1,5× (+ vào ngay khi 15 phút trước đã giảm ≥ 3%)", base)
keys = sorted({k for r in E.res for k in r if k.startswith("c")})
rows = []
for k in keys:
    w, d = k[1:].split("_")
    for mode, nm in (("only", "CHỈ đáy cong"), ("add", "lệnh chờ + thêm chân đáy cong"), ("fallback", "đáy cong khi lệnh chờ không khớp")):
        rows.append((f"{nm} · parabol {w}p · đã đi thêm ≥ {d}× cú sốc", run(mk(k, mode))))
for nm, x in sorted(rows, key=lambda z: -z[1]["tot"]): row(nm, x)
print("\n## 2. Lệnh đáy cong đứng riêng (mọi cú sốc qua lọc, chưa tính danh mục)\n\n| Cách | Số lệnh | TB bps | Thắng | Vào ở (bps so giá đóng nến sốc, TB) | Phút chờ TB |\n|---|---|---|---|---|---|")
for k in ["0.0", "1.25", "1.5"] + keys:
    X = [r[k] for r in E[F].res if k in r]
    if X: a = np.array([x["tr150"] for x in X]); print(f"| {k} | {len(a)} | {a.mean():+.0f} | {(a > 0).mean() * 100:.0f}% | {np.mean([x.get('dp', 0) for x in X]):+.0f} | {np.mean([x['f'] for x in X]):.1f} |")
print("\n## 3. Đặc trưng làm bộ lọc – TB bps của lệnh HIỆN TẠI theo 5 nhóm bằng nhau (thấp → cao), tách 2 nửa thời gian để xem có ổn định không\n")
G = E[F].copy(); G["pnl"] = [ (lambda L: sum(x * s for x, s, _ in L) / sum(s for _, s, _ in L) if L else np.nan)(legs_now(r)) for r in G.itertuples(index=False)]
G = G[G.pnl.notna()]; mid = G["T"].median()
print("| Đặc trưng | Nửa | Q1 (thấp) | Q2 | Q3 | Q4 | Q5 (cao) | Ngưỡng Q1/Q5 |\n|---|---|---|---|---|---|---|---|")
for ft, nm in (("vr", "Tỷ số phương sai (xu hướng > 1)"), ("er", "Hiệu quả Kaufman 60p"), ("hl", "Bán rã OU (phút)"), ("tb", "Tỷ lệ mua chủ động nến sốc"), ("imp", "Xung lượng 5p trước"), ("R", "Cỡ cú sốc (bps)"), ("z", "z-score"), ("vx", "Khối lượng ×")):
    if ft not in G: continue
    S = G[G[ft].notna()]
    if len(S) < 200: continue
    try: qs = pd.qcut(S[ft], 5, labels=False, duplicates="drop"); edges = S[ft].quantile([0.2, 0.8]).values
    except Exception: continue
    for lab, sub in (("đầu", S["T"] <= mid), ("sau", S["T"] > mid)):
        m = S[sub].groupby(qs[sub]).pnl.agg(["mean", "count"]); print(f"| {nm} | {lab} | " + " | ".join(f"{m['mean'].get(q, float('nan')):+.0f} ({int(m['count'].get(q, 0))})" for q in range(5)) + f" | {edges[0]:.3g} / {edges[1]:.3g} |")
print("\n## 4. Bộ lọc đơn giản trên danh mục (bỏ nhóm xấu nếu ổn định ở cả 2 nửa)\n\n" + HD)
row("HIỆN TẠI", base)
for ft in ("vr", "er", "hl", "tb", "imp"):
    if ft not in E: continue
    lo, hi = E[F][ft].quantile(0.2), E[F][ft].quantile(0.8)
    row(f"bỏ 20% {ft} thấp nhất (< {lo:.3g})", run(legs_now, ~(E[ft] < lo))); row(f"bỏ 20% {ft} cao nhất (> {hi:.3g})", run(legs_now, ~(E[ft] > hi)))
