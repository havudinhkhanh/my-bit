"""Vòng 22 – phân tích. Chạy: python research/r22_calc.py <thư mục chứa round22.json.gz & round22b.json.gz>
A) Bắt râu sập: các cách thoát theo luật danh mục bot đang chạy (như r21_calc) + theo THÁNG và 12 TUẦN gần nhất → lợi thế có giảm thật không.
B) Phương pháp mới: bps ròng / lệnh theo tháng, nửa năm, 12 tuần gần nhất, Long / Short, độ bền (bootstrap theo ngày, thêm 10 bps chi phí)."""
import gzip, json, os, sys
import numpy as np, pandas as pd
D0 = sys.argv[1] if len(sys.argv) > 1 else "research_out"
E = pd.DataFrame(json.load(gzip.open(os.path.join(D0, "round22.json.gz"), "rt"))).sort_values("T").reset_index(drop=True)
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True); vn = E.ts + pd.Timedelta(hours=7)
E["vnday"] = vn.dt.strftime("%Y-%m-%d")
ALLD = pd.date_range(vn.min().normalize(), vn.max().normalize(), freq="D").strftime("%Y-%m-%d")
LAST = pd.Timestamp(vn.max().normalize()).tz_localize(None)
SZ, CAP, W, FAR = 0.075, 9, 8, ("1.25", "1.5")
F = (E.R >= 300) & (E.z >= 4) & (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))
NM = {"cur": "HIỆN TẠI (đuổi 150/100 · đỉnh nhịp nảy ≥ 3% từ phút 40 · 60 phút)", "tr80": "đuổi sớm hơn 80/60", **{f"h{h}": f"giữ tối đa {h} phút" for h in (15, 30, 45, 90, 120)},
      **{f"tp{x}": f"+ chốt lời cố định {x} bps" for x in (100, 200, 300)}, **{f"sl{x}": f"+ cắt lỗ cứng {x} bps" for x in (500, 800, 1200)}}
def legs(r):
    L = [(r.res[D], SZ / 2) for D in FAR if D in r.res and r.res[D]["f"] <= W]
    if r.side > 0 and r.r15 <= -300 and "0.0" in r.res: L.append((r.res["0.0"], 0.02))
    return L
def run(EX):
    eq = peak = 1.0; dd = 0.0; op = []; day = None; day0 = 1.0; paused = False; dayp = {}; tr = []
    for r in E[F].itertuples(index=False):
        t = r.T; st = []
        for (tc, p, d_) in sorted(op):
            if tc <= t: eq *= 1 + p; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); dayp[d_] = dayp.get(d_, 1) * (1 + p)
            else: st.append((tc, p, d_))
        op = st
        if r.vnday != day: day = r.vnday; day0 = eq; paused = False
        if not paused and (eq / day0 - 1) * 100 <= -3: paused = True
        if paused or len(op) >= CAP: continue
        L = legs(r)
        if not L or any(EX not in l for l, _ in L): continue
        p = sum(l[EX] / 1e4 * s for l, s in L); tr.append(p / sum(s for _, s in L) * 1e4)
        op.append((t + max(l["f"] for l, _ in L) + 121, p, r.vnday))
    for (tc, p, d_) in op: eq *= 1 + p; dayp[d_] = dayp.get(d_, 1) * (1 + p)
    dr = pd.Series({d: dayp.get(d, 1) - 1 for d in ALLD}); dr.index = pd.to_datetime(dr.index)
    tr = np.array(tr)
    mo = (1 + dr).groupby(dr.index.to_period("M")).prod() - 1
    wk = (1 + dr[dr.index > LAST - pd.Timedelta(days=84)]).groupby(lambda x: (LAST - x).days // 7).prod() - 1
    return dict(ex=EX, tot=(eq - 1) * 100, dd=dd * 100, n=len(tr), avg=tr.mean(), win=(tr > 0).mean() * 100, mo=mo, wk=wk.sort_index(ascending=False), dr=dr)
rules = sorted({k for r in E.res for x in r.values() for k in x if k != "f" and not k.endswith("_w")}, key=lambda k: list(NM).index(k) if k in NM else 99)
RR = {k: run(k) for k in rules}
print(f"# Vòng 22 – Bắt râu sập gần đây & phương pháp mới ({E.ts.min():%d/%m/%Y} → {E.ts.max():%d/%m/%Y})\n")
print("## A1. Bắt râu sập – cách thoát (cả kỳ, luật danh mục bot đang chạy)\n\n| Cách thoát | Lợi nhuận | Sụt tối đa | Lệnh | TB bps | Thắng |\n|---|---|---|---|---|---|")
for k in rules:
    r = RR[k]; print(f"| {NM.get(k, k)} | {r['tot']:+.1f}% | {r['dd']:.1f}% | {r['n']} | {r['avg']:.0f} | {r['win']:.1f}% |")
mcols = [p for p in RR["cur"]["mo"].index if p >= pd.Period("2026-05")]
print("\n## A2. Theo tháng (% tài khoản)\n\n| Cách | " + " | ".join(str(p) for p in mcols) + " |\n|---|" + "---|" * len(mcols))
for k in rules: print(f"| {NM.get(k, k)} | " + " | ".join(f"{RR[k]['mo'].get(p, 0) * 100:+.1f}" for p in mcols) + " |")
wcols = list(RR["cur"]["wk"].index)
print(f"\n## A3. 12 tuần gần nhất (% tài khoản · tuần 0 = 7 ngày tới {LAST:%d/%m})\n\n| Cách | " + " | ".join(f"t-{w}" for w in wcols) + " |\n|---|" + "---|" * len(wcols))
for k in rules: print(f"| {NM.get(k, k)} | " + " | ".join(f"{RR[k]['wk'].get(w, 0) * 100:+.1f}" for w in wcols) + " |")
# số cú sốc qua lọc mỗi tuần & tỷ lệ khớp – thị trường có ít cú sốc hơn không?
E["wk"] = ((LAST - pd.to_datetime(E.vnday)).dt.days // 7)
g = E[F & (E.wk < 12)].groupby("wk")
print("\n| Tuần | " + " | ".join(f"t-{w}" for w in sorted(g.groups)) + " |\n|---|" + "---|" * len(g.groups))
print("| Cú sốc qua lọc | " + " | ".join(str(len(x)) for _, x in sorted(g)) + " |")
print("| Có khớp mức chờ | " + " | ".join(str(int(x.res.map(lambda d: any(k in d and d[k]['f'] <= W for k in FAR)).sum())) for _, x in sorted(g)) + " |")

# ---------------------------------------------------------------- B. phương pháp mới
B = pd.DataFrame(json.load(gzip.open(os.path.join(D0, "round22b.json.gz"), "rt")))
if len(B):
    B["ts"] = pd.to_datetime(B["T"] * 60, unit="s", utc=True); B["day"] = (B.ts + pd.Timedelta(hours=7)).dt.strftime("%Y-%m-%d")
    B["mo"] = B.ts.dt.to_period("M"); B["half"] = B.ts.dt.year.astype(str) + np.where(B.ts.dt.month <= 6, "H1", "H2"); B["wk"] = (LAST - pd.to_datetime(B.day)).dt.days // 7
    rng = np.random.default_rng(7)
    def boot(x):
        dd = x.groupby("day").net.sum(); days = dd.values
        if len(days) < 20: return np.nan
        m = np.array([rng.choice(days, len(days)).mean() for _ in range(2000)]); return (m > 0).mean()
    print("\n## B1. Phương pháp mới – bps ròng / lệnh (đã trừ phí & trượt)\n\n| Phương pháp | Chiều | Lệnh | Lệnh/ngày | TB bps | Thắng | TB nếu +10 bps phí | t | P(ngày dương) bootstrap | 2025H1 | 2025H2 | 2026H1 | 2026H2 | 8 tuần gần nhất |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    nd = max(1, B.day.nunique())
    for m in ["knife", "k30", "drift", "brk", "pump", "lag"]:
        for sdn, sd in (("cả 2", 0), ("Long", 1), ("Short", -1)):
            x = B[(B.m == m) & ((B.side == sd) if sd else True)]
            if len(x) < 30: continue
            hv = x.groupby("half").net.mean(); rec = x[x.wk < 8]
            t = x.net.mean() / (x.net.std(ddof=1) / np.sqrt(len(x)))
            print(f"| {m} | {sdn} | {len(x)} | {len(x) / nd:.1f} | {x.net.mean():+.0f} | {(x.net > 0).mean() * 100:.0f}% | {x.net.mean() - 10:+.0f} | {t:.1f} | {boot(x):.2f} | "
                  + " | ".join(f"{hv.get(h, np.nan):+.0f}" for h in ("2025H1", "2025H2", "2026H1", "2026H2")) + f" | {rec.net.mean():+.0f} ({len(rec)}) |")
    mcols = [p for p in sorted(B.mo.unique()) if p >= pd.Period("2026-05")]
    print("\n## B2. Theo tháng – TB bps/lệnh (số lệnh)\n\n| Phương pháp | " + " | ".join(str(p) for p in mcols) + " |\n|---|" + "---|" * len(mcols))
    for m in ["knife", "k30", "drift", "brk", "pump", "lag"]:
        x = B[B.m == m]; g = x.groupby("mo").net
        print(f"| {m} | " + " | ".join(f"{g.mean().get(p, np.nan):+.0f} ({g.size().get(p, 0)})" for p in mcols) + " |")
    print("\n## B3. Lý do thoát\n\n| Phương pháp | " + " | ".join("LSRT") + " |\n|---|---|---|---|---|")
    for m in ["knife", "drift", "brk", "pump", "lag"]:
        x = B[B.m == m]; v = x.w.value_counts(); print(f"| {m} | " + " | ".join(f"{v.get(k, 0)} ({x[x.w == k].net.mean():+.0f})" if v.get(k, 0) else "0" for k in "LSRT") + " |")
    if "R" in B:
        x = B[(B.m == "knife") & B.R.notna()]
        if len(x): print("\nknife theo độ lớn cú sốc: " + " · ".join(f"{a}-{b} bps: {x[(x.R >= a) & (x.R < b)].net.mean():+.0f} ({((x.R >= a) & (x.R < b)).sum()})" for a, b in ((300, 500), (500, 800), (800, 99999))))
