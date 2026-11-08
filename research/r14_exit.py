"""Vòng 14 – phân tích: thoát sớm khi giá không hồi (Q / N / E) so với hiện tại (tr150), cùng luật danh mục bot đang chạy
(mức chờ 1,25× / 1,5×, vào ngay khi 15 phút trước đã giảm ≥ 3%, 7,5% tài sản mỗi lần bắt, tối đa 9 lần cùng lúc, dừng ngày −3%).
Chạy: python research/r14_exit.py <round14.json.gz>"""
import gzip, json, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round14.json.gz"
E = pd.DataFrame(json.load(gzip.open(P, "rt"))).sort_values("T").reset_index(drop=True)
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True); vn = E.ts + pd.Timedelta(hours=7)
E["vnday"] = vn.dt.strftime("%Y-%m-%d"); E["half"] = E.ts.dt.year.astype(str) + np.where(E.ts.dt.month <= 6, "H1", "H2")
ALLD = pd.date_range(vn.min().normalize(), vn.max().normalize(), freq="D").strftime("%Y-%m-%d")
SZ, CAP, W, FAR = 0.075, 9, 8, ("1.25", "1.5")
F = (E.R >= 300) & (E.z >= 4) & (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))
def legs(r):
    L = [(r.res[D], SZ / 2) for D in FAR if D in r.res and r.res[D]["f"] <= W]
    if r.side > 0 and r.r15 <= -300 and "0.0" in r.res: L.append((r.res["0.0"], 0.02))
    return L
def run(EX):
    eq = peak = 1.0; dd = 0.0; op = []; day = None; day0 = 1.0; paused = False; hv = {}; dayp = {}; tr = []; mo = {}
    for r in E[F].itertuples(index=False):
        t = r.T; st = []
        for (tc, p, hf, d_) in sorted(op):
            if tc <= t: eq *= 1 + p; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1) * (1 + p); dayp[d_] = dayp.get(d_, 1) * (1 + p)
            else: st.append((tc, p, hf, d_))
        op = st
        if r.vnday != day: day = r.vnday; day0 = eq; paused = False
        if not paused and (eq / day0 - 1) * 100 <= -3: paused = True
        if paused or len(op) >= CAP: continue
        L = legs(r)
        if not L or any(EX not in l for l, _ in L): continue
        p = sum(l[EX] / 1e4 * s for l, s in L); tr.append(p / sum(s for _, s in L) * 1e4)
        op.append((t + max(l["f"] for l, _ in L) + 61, p, r.half, r.vnday))
    for (tc, p, hf, d_) in op: eq *= 1 + p; hv[hf] = hv.get(hf, 1) * (1 + p); dayp[d_] = dayp.get(d_, 1) * (1 + p)
    dr = np.array([dayp.get(d, 1) - 1 for d in ALLD]); tr = np.array(tr)
    return dict(ex=EX, tot=(eq - 1) * 100, dd=dd * 100, n=len(tr), avg=tr.mean(), win=(tr > 0).mean() * 100, big=int((tr < -1000).sum()), p5=np.percentile(tr, 5), wday=dr.min() * 100, h=" ".join(f"{k} {(v - 1) * 100:+.1f}%" for k, v in sorted(hv.items())))
rules = sorted({k for r in E.res for x in r.values() for k in x if k != "f"})
R = pd.DataFrame([run(k) for k in rules]).sort_values("tot", ascending=False)
NM0 = lambda k: "HIỆN TẠI: 60 phút + cắt lỗ đuổi" if k == "tr150" else f"sau {k[1:].split('_')[0]} phút còn lỗ ≥ {int(k.split('_')[1]) / 100:g}% → đóng" if k[0] == "q" else f"sau {k[1:].split('_')[0]} phút chưa từng lời {int(k.split('_')[1])} bps → đóng" if k[0] == "n" else f"cắt lỗ {int(k.split('_')[1]) / 100:g}% trong {k[1:].split('_')[0]} phút đầu"
def NM(k):
    try: return NM0(k) if k == "tr150" or (k[0] in "qne" and "_" in k) else k
    except Exception: return k
print(f"# Vòng 14 – thoát sớm khi giá không hồi ({E.ts.min():%d/%m/%Y} → {E.ts.max():%d/%m/%Y}, {len(ALLD)} ngày, {int(F.sum())} cú sốc qua lọc)\n")
print("| Cách thoát | Lợi nhuận | Sụt tối đa | Lệnh | TB bps | Thắng | Lỗ > 10% | 5% tệ nhất (bps) | Ngày tệ | Theo nửa năm |\n|---|---|---|---|---|---|---|---|---|---|")
for r in R.itertuples(index=False):
    print(f"| {NM(r.ex)} | {r.tot:+.1f}% | {r.dd:.1f}% | {r.n} | {r.avg:.0f} | {r.win:.1f}% | {r.big} | {r.p5:.0f} | {r.wday:.1f}% | {r.h} |")
