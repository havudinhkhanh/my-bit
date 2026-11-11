"""Vòng 17 – phân tích ĐỒNG NHỊP: cú sập đi một mình hay cả nhóm / coin đi trước đã rơi tiếp → lệnh Bắt râu sập lời hay lỗ.
Cùng luật danh mục với bot (7,5%/lệnh chia 2 mức chờ, tối đa 9 lệnh, dừng ngày −3%) như vòng 15–16. Chạy: python research/r17_calc.py <round17.json.gz>"""
import gzip, json, math, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round17.json.gz"
E = pd.DataFrame(json.load(gzip.open(P, "rt"))).sort_values("T").reset_index(drop=True)
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True); vn = E.ts + pd.Timedelta(hours=7)
E["vnday"] = vn.dt.strftime("%Y-%m-%d"); E["half"] = E.ts.dt.year.astype(str) + np.where(E.ts.dt.month <= 6, "H1", "H2")
ALLD = pd.date_range(vn.min().normalize(), vn.max().normalize(), freq="D").strftime("%Y-%m-%d")
SZ, CAP, W, FAR = 0.075, 9, 8, ("1.25", "1.5")
F = (E.R >= 300) & (E.z >= 4) & (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))
for c in ("p1_dn", "p5_dn", "p1_m1", "p5_m1", "p1_m5", "p5_m5", "p1_c", "p5_c", "ld_r", "ld_r0", "ld_k", "ld_sh", "ld_ret", "btc1", "btc5", "eth1", "brd", "mkt1"):
    if c not in E: E[c] = np.nan


def legs_now(r, k=1.0):
    L = [(r.res[D]["tr150"], SZ / 2 * k, r.res[D]["f"]) for D in FAR if D in r.res and r.res[D]["f"] <= W]
    if r.side > 0 and r.r15 <= -300 and "0.0" in r.res: L.append((r.res["0.0"]["tr150"], 0.02 * k, 0))
    return L


def run(mask=None, size=None):
    """mask: bỏ cú sốc không qua · size: hàm(r) → hệ số cỡ lệnh (vd. ×2 khi sập một mình)"""
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
        L = legs_now(r, size(r) if size else 1.0)
        if not L: continue
        p = sum(x / 1e4 * s for x, s, _ in L); tr.append(p / sum(s for _, s, _ in L) * 1e4)
        op.append((t + max(f for _, _, f in L) + 61, p, r.half, r.vnday))
    for (tc, p, hf, d_) in op: eq *= 1 + p; hv[hf] = hv.get(hf, 1) * (1 + p); dayp[d_] = dayp.get(d_, 1) * (1 + p)
    dr = np.array([dayp.get(d, 1) - 1 for d in ALLD]); tr = np.array(tr) if tr else np.array([0.0])
    return dict(tot=(eq - 1) * 100, dd=dd * 100, n=len(tr), avg=tr.mean(), win=(tr > 0).mean() * 100, big=int((tr < -1000).sum()), wday=dr.min() * 100, h=" ".join(f"{k} {(v - 1) * 100:+.1f}%" for k, v in sorted(hv.items())))


def row(name, x, b=None):
    d = f" ({x['tot'] - b['tot']:+.1f})" if b else ""
    print(f"| {name} | {x['tot']:+.1f}%{d} | {x['dd']:.1f}% | {x['n']} | {x['avg']:.0f} | {x['win']:.1f}% | {x['big']} | {x['wday']:.1f}% | {x['h']} |")


HD = "| Cách | Lợi nhuận (so hiện tại) | Sụt tối đa | Lệnh | TB bps | Thắng | Lỗ > 10% | Ngày tệ | Theo nửa năm |\n|---|---|---|---|---|---|---|---|---|"
G = E[F].copy()
G["pnl"] = [(lambda L: sum(x * s for x, s, _ in L) / sum(s for _, s, _ in L) if L else np.nan)(legs_now(r)) for r in G.itertuples(index=False)]
G = G[G.pnl.notna()]; mid = G["T"].median()
print(f"# Vòng 17 – đồng nhịp 1 phút / 5 phút & coin đi trước ({E.ts.min():%d/%m/%Y} → {E.ts.max():%d/%m/%Y}, {len(ALLD)} ngày, {int(F.sum())} cú sốc qua lọc, {len(G)} có lệnh khớp)\n")
print(f"Có đặc trưng đồng nhịp: {int(G.p1_c.notna().sum())} lệnh · tương quan TB nhóm 1 phút {G.p1_c.mean():.2f}, nhóm 5 phút {G.p5_c.mean():.2f} · coin đi trước: tương quan trễ TB {G.ld_r.mean():.3f} (cùng phút {G.ld_r0.mean():.3f}), "
      f"≥ 0,10: {(G.ld_r >= 0.1).mean() * 100:.0f}% · ≥ 0,20: {(G.ld_r >= 0.2).mean() * 100:.0f}% · trễ hay gặp: {G.ld_k.mode().iloc[0] if G.ld_k.notna().any() else '—'} phút\n")
base = run()
print("## 1. Danh mục hiện tại\n\n" + HD); row("HIỆN TẠI (lệnh chờ 1,25× / 1,5×)", base)


def welch(a, b):
    if len(a) < 30 or len(b) < 30: return float("nan")
    return (a.mean() - b.mean()) / math.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b))


print("\n## 2. Lời/lỗ TB mỗi lệnh (bps) theo nhóm – tách 2 nửa thời gian để xem có ổn định không\n")
print("| Đặc trưng | Nhóm | Nửa đầu | Nửa sau | Cả kỳ | t so phần còn lại |\n|---|---|---|---|---|---|")
BK = [
    ("p1_dn", "Nhóm đồng nhịp 1p: tỷ lệ cũng sập", [(0, 0, "không coin nào"), (0.01, 0.29, "1–2 coin"), (0.3, 0.59, "3–5 coin"), (0.6, 1, "≥ 6/10 coin")]),
    ("p5_dn", "Nhóm đồng nhịp 5p: tỷ lệ cũng sập", [(0, 0, "không coin nào"), (0.01, 0.29, "1–2 coin"), (0.3, 0.59, "3–5 coin"), (0.6, 1, "≥ 6/10 coin")]),
    ("p1_m5", "Nhóm 1p: trung vị 5 phút (bps, theo chiều lệnh)", [(-1e9, -200, "≤ −200"), (-200, -50, "−200…−50"), (-50, 50, "−50…+50"), (50, 1e9, "> +50")]),
    ("p5_m5", "Nhóm 5p: trung vị 5 phút (bps)", [(-1e9, -200, "≤ −200"), (-200, -50, "−200…−50"), (-50, 50, "−50…+50"), (50, 1e9, "> +50")]),
    ("p5_c", "Độ đồng nhịp 5p của nhóm (tương quan TB)", [(-1, 0.3, "< 0,3"), (0.3, 0.5, "0,3–0,5"), (0.5, 0.7, "0,5–0,7"), (0.7, 1, "≥ 0,7")]),
    ("btc1", "BTC phút sốc (bps, theo chiều lệnh)", [(-1e9, -50, "≤ −50"), (-50, -15, "−50…−15"), (-15, 15, "±15"), (15, 1e9, "> +15")]),
    ("btc5", "BTC 5 phút (bps)", [(-1e9, -100, "≤ −100"), (-100, -30, "−100…−30"), (-30, 30, "±30"), (30, 1e9, "> +30")]),
    ("brd", "Cả thị trường: tỷ lệ coin cùng sập ≥ 1%", [(0, 0.005, "< 0,5%"), (0.005, 0.02, "0,5–2%"), (0.02, 0.1, "2–10%"), (0.1, 1, "≥ 10%")]),
]
for ft, nm, bins in BK:
    S = G[G[ft].notna()]
    for lo, hi, lab in bins:
        m = (S[ft] >= lo) & (S[ft] <= hi)
        a, rest = S[m].pnl, S[~m].pnl
        f = lambda x: f"{x.mean():+.0f} ({len(x)})" if len(x) else "—"  # noqa: E731
        print(f"| {nm} | {lab} | {f(S[m & (S['T'] <= mid)].pnl)} | {f(S[m & (S['T'] > mid)].pnl)} | {f(a)} | {welch(a, rest):+.1f} |")
# coin đi trước
S = G[G.ld_r.notna()]
for rmin in (0.05, 0.10, 0.20):
    L = S[S.ld_r >= rmin]
    if len(L) < 60: continue
    for lab, m in (("nó đã sập ở phút tương ứng (≤ −100) rồi RƠI TIẾP (≤ 0)", (L.ld_sh <= -100) & (L.ld_ret <= 0)), ("nó đã sập rồi BẬT LẠI (> 0)", (L.ld_sh <= -100) & (L.ld_ret > 0)), ("nó không sập ở phút tương ứng", L.ld_sh > -100)):
        a = L[m].pnl; rest = L[~m].pnl
        f = lambda x: f"{x.mean():+.0f} ({len(x)})" if len(x) else "—"  # noqa: E731
        print(f"| Coin đi trước (tương quan trễ ≥ {rmin:.2f}) | {lab} | {f(L[m & (L['T'] <= mid)].pnl)} | {f(L[m & (L['T'] > mid)].pnl)} | {f(a)} | {welch(a, rest):+.1f} |")

print("\n## 3. Bộ lọc / cỡ lệnh trên danh mục (cùng luật bot)\n\n" + HD)
row("HIỆN TẠI", base)
T = []
for ft, cut in (("p1_dn", 0.3), ("p1_dn", 0.6), ("p5_dn", 0.3), ("p5_dn", 0.6)):
    T.append((f"BỎ khi ≥ {cut:.0%} nhóm {ft[1]}p cũng sập", run(~(E[ft] >= cut))))
for ft, cut in (("p1_m5", -200), ("p5_m5", -200), ("p1_m5", -100), ("p5_m5", -100)):
    T.append((f"BỎ khi nhóm {ft[1]}p đã giảm ≥ {-cut} bps trong 5 phút", run(~(E[ft] <= cut))))
for cut in (-100, -50): T.append((f"BỎ khi BTC phút sốc ≤ {cut} bps (theo chiều lệnh)", run(~(E.btc1 <= cut))))
for cut in (-150, -100): T.append((f"BỎ khi BTC 5 phút ≤ {cut} bps", run(~(E.btc5 <= cut))))
for cut in (0.02, 0.05, 0.1): T.append((f"BỎ khi ≥ {cut:.0%} cả thị trường cùng sập ≥ 1%", run(~(E.brd >= cut))))
for rmin in (0.05, 0.1, 0.2):
    T.append((f"BỎ khi coin đi trước (tương quan trễ ≥ {rmin}) đã sập & rơi tiếp", run(~((E.ld_r >= rmin) & (E.ld_sh <= -100) & (E.ld_ret <= 0)))))
solo1 = (E.p1_dn == 0) & (E.p5_dn == 0); solo2 = solo1 & (E.btc1.abs() <= 15)
T.append(("×2 cỡ lệnh khi sập MỘT MÌNH (0 coin đồng nhịp 1p & 5p cùng sập)", run(None, lambda r: 2.0 if (r.p1_dn == 0 and r.p5_dn == 0) else 1.0)))
T.append(("×2 cỡ lệnh khi sập một mình & BTC yên (±15 bps)", run(None, lambda r: 2.0 if (r.p1_dn == 0 and r.p5_dn == 0 and abs(r.btc1 if r.btc1 == r.btc1 else 99) <= 15) else 1.0)))
T.append(("½ cỡ lệnh khi ≥ 30% nhóm 5p cũng sập", run(None, lambda r: 0.5 if (r.p5_dn == r.p5_dn and r.p5_dn >= 0.3) else 1.0)))
for nm, x in sorted(T, key=lambda z: -z[1]["tot"]): row(nm, x, base)
print("\n_Ghi chú: \"theo chiều lệnh\" = âm khi đi NGƯỢC lệnh (lệnh Long thì giá giảm là âm). t so phần còn lại: |t| ≥ 2 mới coi là khác biệt thật. Bộ lọc chỉ đáng dùng khi tốt hơn ở CẢ hai nửa thời gian và cả 4 nửa năm._")
