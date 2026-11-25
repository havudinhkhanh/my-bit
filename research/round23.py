"""Vòng 23 – kiểm lại phát hiện vòng 22 bằng TỪNG GIAO DỊCH THẬT (aggTrades), như vòng 19, trên cú sốc tới 24/11/2026.
Vòng 22 (mô hình nến 1 phút): cắt lỗ đuổi 80/60 cho +248% so với +148% của 150/100 – rà soát cho thấy mô hình nến phút thổi phồng
cắt lỗ đuổi sát (đỉnh lời lấy theo giá cao nhất trong phút, khớp đúng giá đỉnh − G). Ở đây chạy lại mọi chân theo giá thật:
  · "như bot" – giá giữa từ giao dịch mua/bán gần nhất, lấy mẫu 2 giây, theo dõi từ giây thứ 4 sau khớp (đúng cách bot chạy)
  · "nến phút đóng" – chỉ xét giá cuối mỗi phút
  Lưới cắt lỗ đuổi A (lời tối thiểu để bật) × G (trả lại tối đa): A ∈ 50/80/100/120/150/200, G ∈ 40/60/80/100/150 (G < A), + giữ 30 / 60 phút
  Trượt thêm 0 / 10 / 20 / 30 bps. Danh mục như bot (7,5%/cú, tối đa 9 lệnh, dừng ngày −3%); chọn trên 2025 → kiểm 2026 H1 / H2; tin cậy theo NGÀY.
Thêm: kết quả theo THÁNG 2026 & 3 tuần gần nhất cho từng luật (lợi thế gần đây yếu đi?).
Đầu vào: research/data/round22.json.gz (cú sốc vòng 22). Chạy: python research/round23.py"""
import concurrent.futures as cf
import contextlib
import gzip
import json
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("RS_LOG", "round23.log")
os.environ.setdefault("R18_SRC", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "round22.json.gz"))
import round19 as R  # noqa: E402

M, E = R.M, R.E
R.TR_RULES = [(a, g) for a in (50, 80, 100, 120, 150, 200) for g in (40, 60, 80, 100, 150) if g < a]
R.SERIES = ("bot", "m1", "raw")
R.SLIPS = (0, 10, 20, 30)
R.RULES = R.rule_names()


def recent(B, TR):
    """bps ròng / chân (trượt 10) theo tháng 2026 và 3 tuần gần nhất – luật bot hiện tại & các luật dẫn đầu"""
    BK = B.set_index("k"); rows = []
    for k, Rr in TR.items():
        r = BK.loc[k]
        for D, v in Rr.items():
            if D == "0.0" or v["f"] > M.W:
                continue
            rows.append(dict(d=r.vnday, **{ru: v["r"][ru][0] - 10 for ru in R.RULES}))
    L = pd.DataFrame(rows); L["dt"] = pd.to_datetime(L.d); last = L.dt.max()
    L["mo"] = L.dt.dt.to_period("M").astype(str); L["wk"] = (last - L.dt).dt.days // 7
    sc = {ru: L[L.dt.dt.year == 2025][ru].mean() for ru in R.RULES}
    top = [ru for ru in sorted(R.RULES, key=lambda x: -sc[x]) if "như bot" in ru][:8]
    show = ["đuổi 150/100 · như bot"] + [t for t in top if t != "đuổi 150/100 · như bot"]
    mos = [m for m in sorted(L.mo.unique()) if m >= "2026-01"]
    print(f"\n## 4. Gần đây – bps ròng / chân (trượt 10) theo tháng & tuần (luật bot hiện tại + 8 luật 'như bot' tốt nhất trên 2025)\n")
    print("| Luật | 2025 | " + " | ".join(mos) + " | tuần t-2 | t-1 | t-0 |\n|---|---|" + "---|" * (len(mos) + 3))
    for ru in show:
        g = L.groupby("mo")[ru].mean(); w = L[L.wk < 3].groupby("wk")[ru].mean()
        print(f"| {ru} | {sc[ru]:+.0f} | " + " | ".join(f"{g.get(m, np.nan):+.0f}" for m in mos) + " | " + " | ".join(f"{w.get(i, np.nan):+.0f}" for i in (2, 1, 0)) + " |")
    print("\n| Số chân | " + " | ".join(f"{m}: {(L.mo == m).sum()}" for m in mos) + f" | 3 tuần: {(L.wk < 3).sum()} |")


if __name__ == "__main__":
    t00 = time.time()
    B, ALLD = M.load_events(); B = B.sort_values(["T", "s"], kind="mergesort").reset_index(drop=True); B["k"] = np.arange(len(B))
    recs = B.to_dict("records")
    E.log(f"{len(B)} cú sốc qua lọc · {len(R.RULES)} luật · dựng lại giá đặt từ nến…")
    with cf.ThreadPoolExecutor(48) as ex:
        P = {p["k"]: p for p in ex.map(M.prep, recs) if p}
    jobs = {}
    for r in recs:
        p = P.get(r["k"])
        if p and p["need"]:
            jobs.setdefault(r["s"], []).append((r["k"], int(r["T"]), int(r["side"]), r["r15"], p["L"]))
    E.log(f"dựng lại {len(P)}/{len(B)} · cần aggTrades {sum(len(v) for v in jobs.values())} cú sốc / {len(jobs)} mã · {time.time() - t00:.0f}s")
    TR = {}; miss = []
    with cf.ProcessPoolExecutor(int(os.environ.get("R19_PROC", "8"))) as ex:
        for j, (s, out, err) in enumerate(ex.map(R.per_symbol, sorted(jobs.items(), key=lambda x: -len(x[1])))):
            TR.update(out); miss += [f"{s}: {err}"] if err else []
            if j % 50 == 0:
                E.log(f"  … {j}/{len(jobs)} mã · {len(TR)} cú sốc · {time.time() - t00:.0f}s")
    t_run = time.time() - t00
    E.log(f"aggTrades xong: {len(TR)} · thiếu {len(miss)} mã · {t_run:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round23.json.gz"), "wt") as f:
        json.dump(dict(rules=R.RULES, tr={str(k): v for k, v in TR.items()}, miss=miss), f, default=float)
    with open(os.path.join(E.OUT, "r23_result.md"), "w") as f, contextlib.redirect_stdout(f):
        R.report(B, ALLD, P, TR, miss, t_run)
        recent(B, TR)
    E.log(f"xong · {time.time() - t00:.0f}s")
