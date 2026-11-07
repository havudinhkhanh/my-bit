"""Vòng 12 – 'cuối ngày chưa khớp lệnh nào thì tự bắt gần hơn' (Jason 07/11/2026).
Dùng dữ liệu vòng 11 (round11.json.gz: mỗi cú sốc có kết quả khớp/lãi ở mọi độ sâu 0 … 2,0×), cùng luật danh mục với r11_port.py.
Luật thích ứng: mặc định chờ 1,25× / 1,5×; từ giờ H (giờ Việt Nam) nếu hôm đó CHƯA có cú sốc nào khớp → các cú sốc còn lại trong ngày dùng mức gần.
Chạy: python research/r12_adapt.py <round11.json.gz>"""
import gzip, json, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round11.json.gz"
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


def run(near=None, H=99, need=0, dstop=3.0, mk=True):
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
        pnl = sum(l[EX] / 1e4 * s for l, s in legs)
        if adapt:
            sw += [l[EX] for l, _ in legs]
        open_.append((t + max(l["f"] for l, _ in legs) + 61, pnl, r.half, r.vnday))
    for (tc, pnl, hf, d_) in open_:
        eq *= 1 + pnl; hv[hf] = hv.get(hf, 1.0) * (1 + pnl); dayp[d_] = dayp.get(d_, 1.0) * (1 + pnl)
    dr = np.array([dayp.get(d, 1.0) - 1 for d in ALLD])
    return dict(tot=(eq - 1) * 100, dd=dd * 100, fill=nf / DAYS, nod=np.mean([d not in dayp for d in ALLD]) * 100, worst=dr.min() * 100,
                sw=len(sw), swb=np.mean(sw) if sw else 0.0, h={k: (v - 1) * 100 for k, v in sorted(hv.items())})


print(f"{E.ts.min():%Y-%m-%d} → {E.ts.max():%Y-%m-%d} · {DAYS} ngày · {int(F.sum())} cú sốc qua lọc\n")
# 1) thống kê điều kiện: cú sốc xảy ra sau giờ H trong ngày CHƯA có khớp (theo mức xa) – mỗi độ sâu cho bao nhiêu bps/lệnh
G = E[F].copy()
G["farfill"] = [bool(legs_of(r, FAR)) for r in G.itertuples(index=False)]
G["cumf"] = G.groupby("vnday").farfill.cumsum() - G.farfill
print("Cú sốc đến khi hôm đó CHƯA khớp lệnh nào (mức 1,25×/1,5×) – nếu đặt 1 mức ở độ sâu D: số lệnh khớp · TB bps · thắng%")
for H in (0, 12, 18, 20, 21, 22):
    sub = G[(G.vnh >= H) & (G.cumf == 0)]
    cells = []
    for D in ("0.5", "0.75", "1.0", "1.25", "1.5"):
        x = [r.res[D][EX] for r in sub.itertuples(index=False) if D in r.res and r.res[D]["f"] <= W]
        cells.append(f"{D}×: {len(x)} · {np.mean(x) if x else 0:+.0f} · {np.mean(np.array(x) > 0) * 100 if x else 0:.0f}%")
    print(f"  từ {H:>2}h ({len(sub)} cú sốc): " + " | ".join(cells))
print("\nSo với cú sốc khi hôm đó ĐÃ có khớp:")
sub = G[G.cumf > 0]
print("  " + " | ".join(f"{D}×: {np.mean([r.res[D][EX] for r in sub.itertuples(index=False) if D in r.res and r.res[D]['f'] <= W]):+.0f}" for D in ("0.5", "0.75", "1.0", "1.25", "1.5")))
# 2) danh mục lãi gộp
H_ = sorted({k for k in run()["h"]})
print("\n| Phương án | Tổng (lãi gộp) | Sụt tối đa | Ngày tệ nhất | Có khớp/ngày | Ngày không lệnh | Lệnh 'gần' | TB bps lệnh gần | " + " | ".join(H_) + " |")
print("|" + "---|" * (8 + len(H_)))
rows = [("Đang chạy (luôn 1,25×/1,5×)", None, 99, 0)]
for H in (12, 16, 18, 20, 21, 22):
    for nm, nr in (("1,0×/1,25×", ("1.0", "1.25")), ("0,75×/1,0×", ("0.75", "1.0")), ("1 mức 1,0×", ("1.0",))):
        rows.append((f"từ {H}h chưa khớp → {nm}", nr, H, 0))
for nm, nr, H, nd in rows:
    x = run(nr, H, nd)
    print(f"| {nm} | **{x['tot']:+.0f}%** | {x['dd']:.1f}% | {x['worst']:+.1f}% | {x['fill']:.2f} | {x['nod']:.0f}% | {x['sw']} | {x['swb']:+.0f} | " + " | ".join(f"{x['h'].get(k, 0):+.0f}%" for k in H_) + " |")
