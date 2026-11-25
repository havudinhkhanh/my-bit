"""Vòng 20 – phân tích: luật đỉnh nhịp nảy có ngưỡng bật / thoát khi BTC sập ngược lệnh, so với HIỆN TẠI (tr150 + đỉnh nhịp nảy từ phút 40), cùng luật danh mục bot đang chạy
(mức chờ 1,25× / 1,5×, vào ngay khi 15 phút trước đã giảm ≥ 3%, 7,5% tài sản mỗi lần bắt, tối đa 9 lần cùng lúc, dừng ngày −3%).
Chạy: python research/r20_calc.py <round20.json.gz>"""
import gzip, json, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round20.json.gz"
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
rules = sorted({k for r in E.res for x in r.values() for k in x if k != "f" and not k.endswith("_w")})
R = pd.DataFrame([run(k) for k in rules]).sort_values("tot", ascending=False)
def NM(k):
    import re
    if k == "cur": return "HIỆN TẠI: cắt lỗ đuổi + từ phút 40 còn lỗ ra ở đỉnh nhịp nảy"
    if k == "t60": return "Bỏ đỉnh nhịp nảy (cắt lỗ đuổi + giữ đủ 60 phút)"
    m = re.fullmatch(r"ub(\d+)", k)
    if m: return f"Đỉnh nhịp nảy chỉ khi đã bật ≥ {m[1]} bps từ đáy"
    m = re.fullmatch(r"bx(\d+)([la])", k)
    if m: return f"HIỆN TẠI + BTC sập ngược ≥ {m[1]} bps/1 phút → đóng {'(chỉ khi đang lỗ)' if m[2] == 'l' else '(mọi lúc)'}"
    m = re.fullmatch(r"bxt(\d+)l", k)
    if m: return f"Bỏ đỉnh nhịp nảy + BTC sập ngược ≥ {m[1]} bps → đóng (khi đang lỗ)"
    m = re.fullmatch(r"ub(\d+)bx(\d+)l", k)
    if m: return f"Đỉnh nhịp nảy bật ≥ {m[1]} bps + BTC sập ngược ≥ {m[2]} bps → đóng (khi lỗ)"
    return k
print(f"# Vòng 20 – đỉnh nhịp nảy có ngưỡng & thoát khi BTC sập ({E.ts.min():%d/%m/%Y} → {E.ts.max():%d/%m/%Y}, {len(ALLD)} ngày, {int(F.sum())} cú sốc qua lọc)\n")
print("| Cách thoát | Lợi nhuận | Sụt tối đa | Lệnh | TB bps | Thắng | Lỗ > 10% | 5% tệ nhất (bps) | Ngày tệ | Theo nửa năm |\n|---|---|---|---|---|---|---|---|---|---|")
for r in R.itertuples(index=False):
    print(f"| {NM(r.ex)} | {r.tot:+.1f}% | {r.dd:.1f}% | {r.n} | {r.avg:.0f} | {r.win:.1f}% | {r.big} | {r.p5:.0f} | {r.wday:.1f}% | {r.h} |")

# số lần mỗi luật thoát ra theo từng lý do (U = đỉnh nhịp nảy, B = BTC sập, R = cắt lỗ đuổi, S = thảm hoạ, T = hết giờ) & bps TB của lần đó
print("\n## Lý do thoát (mọi chân lệnh qua lọc)\n\n| Cách | U | B | R | S | T | bps TB khi thoát vì U | vì B |\n|---|---|---|---|---|---|---|---|")
LG = [(x, k) for r in E[F].itertuples(index=False) for k, x in r.res.items() if k in ("1.25", "1.5", "0.0")]
for k in rules:
    w = pd.Series([x.get(k + "_w") for x, _ in LG]); v = pd.Series([x.get(k) for x, _ in LG], dtype=float)
    cnt = w.value_counts()
    print(f"| {NM(k)} | " + " | ".join(str(int(cnt.get(c, 0))) for c in "UBRST") + f" | {v[w == 'U'].mean():.0f} | {v[w == 'B'].mean():.0f} |")
