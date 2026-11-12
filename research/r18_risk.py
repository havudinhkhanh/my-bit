"""Vòng 18a – tăng cỡ lệnh khi CẢ NHÓM / cả thị trường cùng sập (từ vòng 17) – kiểm độ bền trước khi nghĩ tới tiền thật.
"Cả nhóm" = ≥ 60% 10 coin đồng nhịp 1 phút cũng sập cùng phút, HOẶC ≥ 10% mọi coin cùng sập ≥ 1% phút đó.
Kiểm: (1) đảo thứ tự khớp các lệnh trong CÙNG 1 phút 50 lần (dữ liệu nến phút không biết lệnh nào vào trước) → trung vị & lần tệ nhất
      (2) chặn rủi ro dồn: tối đa N lệnh mới / phút, tối đa M lệnh "cả nhóm" đang mở
      (3) bỏ lần lượt từng ngày sập lớn (top 10 ngày đóng góp + đêm 10–11/10/2025) – lợi thế còn không
Chạy: python research/r18_risk.py <round17.json.gz>"""
import gzip, json, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round17.json.gz"
E = pd.DataFrame(json.load(gzip.open(P, "rt"))).sort_values("T").reset_index(drop=True)
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True); vn = E.ts + pd.Timedelta(hours=7)
E["vnday"] = vn.dt.strftime("%Y-%m-%d"); E["half"] = E.ts.dt.year.astype(str) + np.where(E.ts.dt.month <= 6, "H1", "H2")
ALLD = pd.date_range(vn.min().normalize(), vn.max().normalize(), freq="D").strftime("%Y-%m-%d")
SZ, CAP, W, FAR = 0.075, 9, 8, ("1.25", "1.5")
for c in ("p1_dn", "brd"):
    if c not in E: E[c] = np.nan
F = (E.R >= 300) & (E.z >= 4) & (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))
E["grp"] = (E.p1_dn >= 0.6) | (E.brd >= 0.1)
B = E[F].reset_index(drop=True)


def legs(r, k):
    L = [(r.res[D]["tr150"], SZ / 2 * k, r.res[D]["f"]) for D in FAR if D in r.res and r.res[D]["f"] <= W]
    if r.side > 0 and r.r15 <= -300 and "0.0" in r.res: L.append((r.res["0.0"]["tr150"], 0.02 * k, 0))
    return L


def sim(D, kg=1.0, ks=1.0, per_min=99, gmax=99, seed=None):
    """kg / ks: hệ số cỡ lệnh khi cả nhóm sập / sập một mình · per_min: tối đa lệnh mới mỗi phút · gmax: tối đa lệnh 'cả nhóm' đang mở"""
    if seed is not None:
        rng = np.random.default_rng(seed); D = D.assign(_r=rng.random(len(D))).sort_values(["T", "_r"])
    eq = peak = 1.0; dd = 0.0; op = []; day = None; day0 = 1.0; paused = False; hv = {}; dayp = {}; lastT = None; nmin = 0; tr = []; exp = 0.0
    for r in D.itertuples(index=False):
        t = r.T; st = []
        for x in sorted(op):
            tc, p, hf, d_, g = x
            if tc <= t: eq *= 1 + p; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1) * (1 + p); dayp[d_] = dayp.get(d_, 1) * (1 + p)
            else: st.append(x)
        op = st
        if r.vnday != day: day = r.vnday; day0 = eq; paused = False
        if not paused and (eq / day0 - 1) * 100 <= -3: paused = True
        if t != lastT: lastT = t; nmin = 0
        if paused or len(op) >= CAP or nmin >= per_min: continue
        if r.grp and sum(1 for x in op if x[4]) >= gmax: continue
        k = kg if r.grp else ks; L = legs(r, k)
        if not L: continue
        nmin += 1; p = sum(x / 1e4 * s for x, s, _ in L); exp += sum(s for _, s, _ in L); tr.append(p / sum(s for _, s, _ in L) * 1e4)
        op.append((t + max(f for _, _, f in L) + 61, p, r.half, r.vnday, bool(r.grp)))
    for (tc, p, hf, d_, g) in op: eq *= 1 + p; hv[hf] = hv.get(hf, 1) * (1 + p); dayp[d_] = dayp.get(d_, 1) * (1 + p)
    dr = np.array([dayp.get(d, 1) - 1 for d in ALLD])
    sh = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
    return dict(tot=(eq - 1) * 100, dd=dd * 100, wday=dr.min() * 100, sh=sh, n=len(tr), exp=exp, h=[(v - 1) * 100 for k, v in sorted(hv.items())])


VARS = [("HIỆN TẠI", dict()),
        ("×1,5 khi cả nhóm sập", dict(kg=1.5)),
        ("×1,5 cả nhóm · ≤ 3 lệnh mới/phút · ≤ 5 lệnh cả nhóm đang mở", dict(kg=1.5, per_min=3, gmax=5)),
        ("×1,5 cả nhóm · ×0,8 sập một mình · có chặn", dict(kg=1.5, ks=0.8, per_min=3, gmax=5)),
        ("×2 cả nhóm · có chặn", dict(kg=2.0, per_min=3, gmax=5)),
        ("×2 cả nhóm (không chặn – vòng 17)", dict(kg=2.0)),
        ("CHỈ chặn dồn (cỡ cũ) · ≤ 3 lệnh mới/phút · ≤ 5 cả nhóm", dict(per_min=3, gmax=5))]
NS = 50
print(f"# Vòng 18a – tăng cỡ lệnh khi cả nhóm cùng sập: độ bền ({B.ts.min():%d/%m/%Y} → {B.ts.max():%d/%m/%Y}, {len(B)} cú sốc qua lọc, {int(B.grp.sum())} 'cả nhóm')\n")
print(f"## 1. Đảo thứ tự khớp trong cùng phút {NS} lần – trung vị (lần tệ nhất)\n")
print("| Cách | Lợi nhuận | Sụt tối đa | Ngày tệ | Sharpe năm | Tiền đặt cược (×hiện tại) | 4 nửa năm (trung vị) |\n|---|---|---|---|---|---|---|")
R = {}
for nm, kw in VARS:
    X = [sim(B, seed=s, **kw) for s in range(NS)]; R[nm] = X
    a = lambda k: np.array([x[k] for x in X])  # noqa: E731
    e0 = np.median([x["exp"] for x in R["HIỆN TẠI"]])
    hh = np.median(np.array([x["h"] for x in X]), 0)
    print(f"| {nm} | {np.median(a('tot')):+.0f}% ({a('tot').min():+.0f}%) | {np.median(a('dd')):.1f}% ({a('dd').max():.1f}%) | {np.median(a('wday')):.1f}% ({a('wday').min():.1f}%) | {np.median(a('sh')):.2f} ({a('sh').min():.2f}) | ×{np.median(a('exp')) / e0:.2f} | " + " ".join(f"{v:+.0f}%" for v in hh) + " |")
# ngày đóng góp nhiều nhất của lệnh "cả nhóm"
G = B[B.grp].copy(); G["pnl"] = [sum(x * s for x, s, _ in legs(r, 1)) / 1e4 for r in G.itertuples(index=False)]
top = G.groupby("vnday").pnl.sum().sort_values(ascending=False)
days = list(top.index[:10]); days += [d for d in ("2025-10-10", "2025-10-11") if d not in days]
print(f"\n## 2. Bỏ lần lượt từng ngày (top 10 ngày lệnh 'cả nhóm' lời nhiều nhất + đêm 10–11/10/2025) – trung vị 20 lần đảo\n")
print("| Bỏ ngày | Lệnh cả nhóm ngày đó | HIỆN TẠI | ×1,5 có chặn | Chênh | ×1,5 có chặn: ngày tệ (tệ nhất) |\n|---|---|---|---|---|---|")
pas = 0
for d in days:
    D = B[B.vnday != d]
    b0 = np.median([sim(D, seed=s)["tot"] for s in range(20)])
    Y = [sim(D, seed=s, kg=1.5, per_min=3, gmax=5) for s in range(20)]; y = np.median([x["tot"] for x in Y])
    wd = [x["wday"] for x in Y]; ok = (y - b0 >= 10) and (np.mean(np.array(wd) >= -3.5) >= 0.95); pas += ok
    print(f"| {d} | {int((G.vnday == d).sum())} | {b0:+.0f}% | {y:+.0f}% | {y - b0:+.0f} {'✅' if ok else '❌'} | {np.median(wd):.1f}% ({min(wd):.1f}%) |")
print(f"\nĐạt (hơn hiện tại ≥ 10 điểm % VÀ ngày tệ ≥ −3,5% ở ≥ 95% lần đảo): **{pas}/{len(days)}**")
D = B[~B.vnday.isin(days[:5])]
b0 = np.median([sim(D, seed=s)["tot"] for s in range(20)]); y = np.median([sim(D, seed=s, kg=1.5, per_min=3, gmax=5)["tot"] for s in range(20)])
print(f"\nBỏ CÙNG LÚC 5 ngày lời nhất: HIỆN TẠI {b0:+.0f}% · ×1,5 có chặn {y:+.0f}% (chênh {y - b0:+.0f}).")
