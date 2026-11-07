"""Vòng 11 – danh mục thật, LÃI GỘP (cỡ lệnh = % tài sản hiện tại): chờ gần (khớp nhiều, lời/lệnh ít) vs chờ xa (khớp ít, lời/lệnh nhiều).
Giống bot đang chạy: cú sốc ≥ 300 bps/phút, z ≥ 4, khối lượng ≥ 8×, bỏ coin có cú sốc khác 6 giờ trước, bỏ "dao rơi" 4 giờ > 10%,
"xả sau bơm" 15 phút > 100 bps chỉ áp cho Short, Long đã tháo chạy 15 phút ≥ 300 bps thì mua ngay thêm 2%,
mỗi cú sốc 7,5% tài sản chia đều các mức chờ, chờ khớp 8 phút, tối đa 9 lần cùng lúc, dừng ngày khi lỗ 3%, thoát tr150 (giữ 60 phút + đuổi 150/100).
Chạy: python research/r11_port.py <round11.json.gz> [thoát=tr150] [cỡ=7.5] [tối đa=9]"""
import gzip, json, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round11.json.gz"
EX = sys.argv[2] if len(sys.argv) > 2 else "tr150"
SZ = float(sys.argv[3]) / 100 if len(sys.argv) > 3 else 0.075
CAP = int(sys.argv[4]) if len(sys.argv) > 4 else 9
ev = json.load(gzip.open(P, "rt"))
E = pd.DataFrame(ev).sort_values("T").reset_index(drop=True)
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True)
E["vnday"] = (E.ts + pd.Timedelta(hours=7)).dt.strftime("%Y-%m-%d")
E["half"] = E.ts.dt.year.astype(str) + np.where(E.ts.dt.month <= 6, "H1", "H2")
ALLD = pd.date_range((E.ts.min() + pd.Timedelta(hours=7)).normalize(), (E.ts.max() + pd.Timedelta(hours=7)).normalize(), freq="D").strftime("%Y-%m-%d")
DAYS = len(ALLD)
F = (E.R >= 300) & (E.z >= 4) & (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))


def run(lv, mk=True, sz=SZ, cap=CAP, dstop=3.0, W=8, ex=EX):
    eq = peak = 1.0; dd = 0.0; open_ = []; day = None; day0 = 1.0; paused = False; tr = []; hv = {}; nplace = nfill = 0; dayp = {}; dlast = {}
    for r in E[F].itertuples(index=False):
        t = r.T; still = []
        for (tc, pnl, hf, dd_) in sorted(open_):
            if tc <= t:
                eq *= 1 + pnl; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1.0) * (1 + pnl); dayp[dd_] = dayp.get(dd_, 1.0) * (1 + pnl)
            else:
                still.append((tc, pnl, hf, dd_))
        open_ = still
        if r.vnday != day:
            day = r.vnday; day0 = eq; paused = False
        if not paused and (eq / day0 - 1) * 100 <= -dstop:
            paused = True
        if paused or len(open_) >= cap:
            continue
        nplace += 1
        each = sz / len(lv)
        legs = [(r.res[D], each) for D in lv if D in r.res and r.res[D]["f"] <= W]
        if mk and r.side > 0 and r.r15 <= -300 and "0.0" in r.res:
            legs.append((r.res["0.0"], 0.02))
        if not legs:
            continue
        nfill += 1
        pnl = sum(l[ex] / 1e4 * s for l, s in legs)
        tc = t + max(l["f"] for l, _ in legs) + 61
        open_.append((tc, pnl, r.half, r.vnday)); tr += [l[ex] for l, _ in legs]
    for (tc, pnl, hf, dd_) in open_:
        eq *= 1 + pnl; hv[hf] = hv.get(hf, 1.0) * (1 + pnl); dayp[dd_] = dayp.get(dd_, 1.0) * (1 + pnl)
    tr = np.array(tr) if tr else np.array([0.0])
    dr = np.array([dayp.get(d, 1.0) - 1 for d in ALLD])
    return dict(lv=" / ".join(f"{float(x):g}×" for x in lv), place=nplace / DAYS, fill=nfill / DAYS, fpct=nfill / max(1, nplace) * 100, legs=len(tr) / DAYS, bps=tr.mean(), win=(tr > 0).mean() * 100,
                tot=(eq - 1) * 100, dd=dd * 100, nod=(np.array([d not in dayp for d in ALLD]).mean() * 100), worst=dr.min() * 100,
                yr=((eq ** (365 / DAYS)) - 1) * 100, h={k: (v - 1) * 100 for k, v in sorted(hv.items())})


SC = [("Đang chạy", ("1.25", "1.5")), ("Gần hơn 1 bậc", ("1.0", "1.25")), ("Gần hơn 2 bậc", ("0.75", "1.0")), ("Rất gần", ("0.5", "0.75")),
      ("Gần + xa", ("1.0", "1.5")), ("Xa hơn", ("1.5", "2.0")),
      ("1 mức 0,5×", ("0.5",)), ("1 mức 0,75×", ("0.75",)), ("1 mức 1,0×", ("1.0",)), ("1 mức 1,25× (TK nhỏ 'gần')", ("1.25",)), ("1 mức 1,5× (TK nhỏ 'xa')", ("1.5",)),
      ("Vào ngay (lệnh thị trường)", ("0.0",))]
print(f"Dữ liệu {E.ts.min():%Y-%m-%d} → {E.ts.max():%Y-%m-%d} · {DAYS} ngày · {E.s.nunique()} mã · {int(F.sum())} cú sốc qua bộ lọc · thoát {EX} · {SZ*100:g}%/cú sốc · tối đa {CAP}\n")
R = [(n, run(lv)) for n, lv in SC]
H = sorted({k for _, x in R for k in x["h"]})
print("| Phương án | Mức chờ | Cú sốc/ngày | Có khớp/ngày | % khớp | Ngày không lệnh | TB bps/lệnh | Thắng | TỔNG (lãi gộp) | ≈/năm | Sụt tối đa | Ngày tệ nhất | " + " | ".join(H) + " |")
print("|" + "---|" * (12 + len(H)))
for n, x in R:
    print(f"| {n} | {x['lv']} | {x['place']:.1f} | {x['fill']:.2f} | {x['fpct']:.0f}% | {x['nod']:.0f}% | {x['bps']:+.0f} | {x['win']:.0f}% | **{x['tot']:+.0f}%** | {x['yr']:+.0f}% | {x['dd']:.1f}% | {x['worst']:+.1f}% | " + " | ".join(f"{x['h'].get(k, 0):+.0f}%" for k in H) + " |")
print("\nĐộ nhạy cỡ lệnh (đang chạy vs gần hơn 1 bậc):")
for s in (0.05, 0.075, 0.10):
    a, b = run(("1.25", "1.5"), sz=s), run(("1.0", "1.25"), sz=s)
    print(f"  {s*100:g}%/cú sốc: đang chạy {a['tot']:+.0f}% (sụt {a['dd']:.1f}%) · gần hơn {b['tot']:+.0f}% (sụt {b['dd']:.1f}%)")
print("\nThoát giữ 60 phút (không đuổi) để so:")
for n, lv in SC[:4]:
    x = run(lv, ex="t60"); print(f"  {n} {x['lv']}: {x['tot']:+.0f}% · sụt {x['dd']:.1f}% · {x['bps']:+.0f} bps")
