"""Vòng 13 – lệnh bắt gần ngày vắng có nên CHỐT LỜI SỚM (+X bps, lệnh giới hạn) thay vì giữ 60 phút + cắt lỗ đuổi? (Jason 07/11/2026)
Cùng luật với r12_adapt.py; dữ liệu round13.json.gz (thêm cách thoát p30 … p300).
Dùng dữ liệu vòng 11 (round13.json.gz: mỗi cú sốc có kết quả khớp/lãi ở mọi độ sâu 0 … 2,0×), cùng luật danh mục với r11_port.py.
Luật thích ứng: mặc định chờ 1,25× / 1,5×; từ giờ H (giờ Việt Nam) nếu hôm đó CHƯA có cú sốc nào khớp → các cú sốc còn lại trong ngày dùng mức gần.
Chạy: python research/r12_adapt.py <round13.json.gz>"""
import gzip, json, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round13.json.gz"
EX, SZ, CAP, W = "tr150", 0.075, 9, 8
E = pd.DataFrame(json.load(gzip.open(P, "rt"))).sort_values("T").reset_index(drop=True)
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True)
vn = E.ts + pd.Timedelta(hours=7)
E["vnday"] = vn.dt.strftime("%Y-%m-%d"); E["vnh"] = vn.dt.hour + vn.dt.minute / 60
E["half"] = E.ts.dt.year.astype(str) + np.where(E.ts.dt.month <= 6, "H1", "H2")
ALLD = pd.date_range(vn.min().normalize(), vn.max().normalize(), freq="D").strftime("%Y-%m-%d"); DAYS = len(ALLD)
F = (E.R >= 300) & (E.z >= 4) & (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))
FAR = ("1.25", "1.5")


def legs_of(r, lv):
    return [(r.res[D], SZ / len(lv)) for D in lv if D in r.res and r.res[D]["f"] <= W]


def run(near=None, H=99, need=0, dstop=3.0, mk=True, exn=EX, exf=EX):
    eq = peak = 1.0; dd = 0.0; open_ = []; day = None; day0 = 1.0; paused = False; hv = {}; nf = 0; dfill = 0; sw = []; dayp = {}
    for r in E[F].itertuples(index=False):
        t = r.T; still = []
        for (tc, pnl, hf, d_) in sorted(open_):
            if tc <= t:
                eq *= 1 + pnl; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1.0) * (1 + pnl); dayp[d_] = dayp.get(d_, 1.0) * (1 + pnl)
            else:
                still.append((tc, pnl, hf, d_))
        open_ = still
        if r.vnday != day:
            day = r.vnday; day0 = eq; paused = False; dfill = 0
        if not paused and (eq / day0 - 1) * 100 <= -dstop:
            paused = True
        if paused or len(open_) >= CAP:
            continue
        adapt = near is not None and r.vnh >= H and dfill <= need
        lv = near if adapt else FAR
        legs = legs_of(r, lv)
        if mk and r.side > 0 and r.r15 <= -300 and "0.0" in r.res:
            legs.append((r.res["0.0"], 0.02))
        if not legs:
            continue
        nf += 1; dfill += 1
        ex = exn if adapt else exf
        pnl = sum(l[ex] / 1e4 * s for l, s in legs)
        if adapt:
            sw += [l[ex] for l, _ in legs]
        open_.append((t + max(l["f"] for l, _ in legs) + 61, pnl, r.half, r.vnday))
    for (tc, pnl, hf, d_) in open_:
        eq *= 1 + pnl; hv[hf] = hv.get(hf, 1.0) * (1 + pnl); dayp[d_] = dayp.get(d_, 1.0) * (1 + pnl)
    dr = np.array([dayp.get(d, 1.0) - 1 for d in ALLD])
    return dict(tot=(eq - 1) * 100, dd=dd * 100, fill=nf / DAYS, nod=np.mean([d not in dayp for d in ALLD]) * 100, worst=dr.min() * 100,
                sw=len(sw), swb=np.mean(sw) if sw else 0.0, h={k: (v - 1) * 100 for k, v in sorted(hv.items())})


print(f"{E.ts.min():%Y-%m-%d} → {E.ts.max():%Y-%m-%d} · {DAYS} ngày · {int(F.sum())} cú sốc qua lọc\n")
EXS = ["tr150", "t60"] + [f"p{x}" for x in (30, 40, 50, 60, 80, 100, 150, 200, 300)]
G = E[F].copy()
G["farfill"] = [bool(legs_of(r, FAR)) for r in G.itertuples(index=False)]
G["cumf"] = G.groupby("vnday").farfill.cumsum() - G.farfill
print("TB bps/lệnh theo cách thoát (đã trừ phí) – lệnh 1 mức, khớp trong 8 phút:")
for nm, sub in (("ngày vắng từ 12h, 0,75×", G[(G.vnh >= 12) & (G.cumf == 0)]), ("ngày vắng từ 12h, 1,0×", None), ("mọi cú sốc, 1,25×", G), ("mọi cú sốc, 1,5×", G)):
    D = "1.0" if "1,0×" in nm else "0.75" if "0,75" in nm else "1.25" if "1,25" in nm else "1.5"
    if sub is None:
        sub = G[(G.vnh >= 12) & (G.cumf == 0)]
    L = [r.res[D] for r in sub.itertuples(index=False) if D in r.res and r.res[D]["f"] <= W]
    print(f"  {nm} ({len(L)} lệnh): " + " | ".join(f"{k} {np.mean([l[k] for l in L]):+.0f} ({np.mean([l[k] > 0 for l in L]) * 100:.0f}%)" for k in EXS if k in L[0]))
print("\n| Phương án | Tổng (lãi gộp) | Sụt tối đa | Ngày tệ nhất | Lệnh gần | TB bps lệnh gần |")
print("|---|---|---|---|---|---|")
for nm, a in [("Đang chạy, ngày vắng TẮT", dict())] + [(f"Ngày vắng 12h 0,75×/1,0× · thoát lệnh gần {k}", dict(near=("0.75", "1.0"), H=12, exn=k)) for k in EXS] + [(f"(so) MỌI lệnh chốt {k}", dict(exf=k)) for k in ("p50", "p60", "p100", "p150")]:
    x = run(**a)
    print(f"| {nm} | **{x['tot']:+.0f}%** | {x['dd']:.1f}% | {x['worst']:+.1f}% | {x['sw']} | {x['swb']:+.0f} |")
