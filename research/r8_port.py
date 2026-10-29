"""Mô phỏng DANH MỤC (giới hạn lệnh cùng lúc, dừng ngày) cho Bắt râu sập trên dữ liệu vòng 8: so mức chờ hiện tại với thêm "vào ngay" (lệnh thị trường)
cho cú sập đến sau khi 15 phút trước giá đã giảm mạnh, và chờ nông hơn. Chạy: python research/r8_port.py <round8.json.gz> [cap=8] [dstop=3]"""
import gzip, json, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round8.json.gz"
CAP = int(sys.argv[2]) if len(sys.argv) > 2 else 8
DST = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
ev = json.load(gzip.open(P, "rt"))
E = pd.DataFrame([{k: v for k, v in e.items() if k != "res"} | {"res": e["res"]} for e in ev]).sort_values("T").reset_index(drop=True)
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True)
E["vnday"] = (E.ts + pd.Timedelta(hours=7)).dt.strftime("%Y-%m-%d")
E["half"] = E.ts.dt.year.astype(str) + np.where(E.ts.dt.month <= 6, "H1", "H2")
DAYS = (E["T"].max() - E["T"].min()) / 1440
F = (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))


def run(name, lv=("1.5", "2.0"), sz=0.0325, mk=None, mkS=0.02, cap=CAP, dstop=DST, W=8, ex="t60"):
    eq = peak = 1.0; dd = 0.0; open_ = []; day = None; day0 = 1.0; paused = False; tr = []; hv = {}; ns = 0
    for r in E[F].itertuples(index=False):
        t = r.T; still = []
        for (tc, pnl, hf) in sorted(open_):
            if tc <= t:
                eq *= 1 + pnl; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1.0) * (1 + pnl)
            else:
                still.append((tc, pnl, hf))
        open_ = still
        if r.vnday != day:
            day = r.vnday; day0 = eq; paused = False
        if not paused and (eq / day0 - 1) * 100 <= -dstop:
            paused = True
        if paused or len(open_) >= cap:
            continue
        legs = [(r.res[D], sz) for D in lv if D in r.res and r.res[D]["f"] <= W]
        if mk is not None and r.side > 0 and r.r15 <= -mk and "0.0" in r.res:
            legs.append((r.res["0.0"], mkS))
        if not legs:
            continue
        pnl = sum(l[ex] / 1e4 * s for l, s in legs); ns += 1
        tc = t + max(l["f"] for l, _ in legs) + int(ex[1:]) + 1
        open_.append((tc, pnl, r.half)); tr += [l[ex] for l, _ in legs]
    for (tc, pnl, hf) in open_:
        eq *= 1 + pnl; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1.0) * (1 + pnl)
    a = np.array(tr)
    print(f"{name:<60} {ns / DAYS:4.1f} cú/ngày · {len(a) / DAYS:4.1f} lệnh/ngày · TB {a.mean():+6.1f} bps · thắng {(a > 0).mean() * 100:4.1f}% · TỔNG {(eq - 1) * 100:+7.1f}% · sụt {dd * 100:5.1f}% · "
          + " ".join(f"{k}:{(v - 1) * 100:+.0f}%" for k, v in sorted(hv.items())))


print(f"{len(E)} cú sốc · {DAYS:.0f} ngày · tối đa {CAP} lần bắt cùng lúc · dừng ngày khi lỗ {DST}%")
run("Đang chạy: 1,5× + 2× · mỗi mức 3,25%")
for th in (250, 300, 350):
    for s in (0.015, 0.02, 0.03):
        run(f"+ mua ngay khi 15 phút trước đã giảm ≥ {th / 100:.1f}% · {s * 100:.1f}%", mk=th, mkS=s)
run("1,25× + 1,5× · mỗi mức 3,25%", lv=("1.25", "1.5"))
run("1,25× + 1,5× + mua ngay ≥ 3% · 2%", lv=("1.25", "1.5"), mk=300)
run("1,0× + 1,5× + mua ngay ≥ 3% · 2%", lv=("1.0", "1.5"), mk=300)
run("Đang chạy + mua ngay ≥ 3% · 2% · tối đa 12 cùng lúc", mk=300, cap=12)
