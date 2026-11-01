"""Phân tích vòng 10 (research_out/round10.json.gz) – các phương pháp ngoài Bắt râu sập.
Chi phí khứ hồi (phí taker 0,05% × 2 + trượt giá): coin lớn 0,14%, altcoin 0,30%. Funding THẬT trong lúc giữ lệnh được cộng / trừ (có dữ liệu thì tính).
Lợi nhuận danh mục: mỗi lệnh dùng SZ% vốn (giá trị lệnh, không đòn bẩy thêm), cộng dồn không lãi kép; sụt tối đa trên đường cộng dồn theo giờ đóng lệnh.
Chạy: python research/r10_analyze.py <round10.json.gz> [SZ=10]"""
import bisect
import gzip
import json
import sys

import numpy as np
import pandas as pd

P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round10.json.gz"
SZ = float(sys.argv[2]) if len(sys.argv) > 2 else 10.0
D = json.load(gzip.open(P, "rt"))
FR = {s: (np.array([x[0] for x in v]), np.array([x[1] for x in v]) / 1e4) for s, v in D["fr"].items()}     # giờ, funding %
MAJ = set(D["maj"])
cost = lambda s: 0.14 if s in MAJ else 0.30  # noqa: E731
yr = lambda h: pd.Timestamp(h * 3600, unit="s").year  # noqa: E731


def fund(s, side, t0, t1):
    """funding nhận (+) / trả (−) theo % giá trị lệnh, các kỳ chốt trong (t0, t1]"""
    if s not in FR:
        return 0.0, False
    T, f = FR[s]; a, b = bisect.bisect_right(T, t0), bisect.bisect_right(T, t1)
    return float(-side * f[a:b].sum()), True


def stats(name, rows, sz=None):
    """rows: list (giờ đóng, lời ròng %, lời tốt nhất %, lỗ xấu nhất %)"""
    if not rows:
        print(f"  {name:<52} (không có lệnh)"); return None
    sz = SZ if sz is None else sz
    R = pd.DataFrame(rows, columns=["t", "r", "best", "worst"]).sort_values("t")
    R["r"] = R.r.clip(lower=-100)          # lệnh không đòn bẩy: mất tối đa toàn bộ tiền của lệnh (Short bị thanh lý khi giá ×2)
    eq = 1 + np.cumsum(R.r.values * sz / 100) / 100; dd = (1 - eq / np.maximum.accumulate(np.maximum(eq, 1))).max() * 100
    streak = cur = 0
    for v in R.r.values:
        cur = cur + 1 if v <= 0 else 0; streak = max(streak, cur)
    by = R.groupby(R.t.map(yr)).r.sum().mul(sz / 100).round(0)
    yrs = (R.t.max() - R.t.min()) / 24 / 365 or 1
    print(f"  {name:<52} {len(R):>5} lệnh ({len(R) / yrs:5.0f}/năm) · thắng {(R.r > 0).mean() * 100:4.1f}% · TB {R.r.mean():+6.2f}% · trung vị {R.r.median():+6.2f}% · "
          f"lời max {R.r.max():+7.1f}% · lỗ max {R.r.min():+7.1f}% · gồng lỗ xấu nhất {R.worst.min():+6.1f}% · thua liền {streak:>2} · "
          f"tổng {(eq[-1] - 1) * 100:+7.1f}% · sụt {dd:5.1f}% · " + " ".join(f"{k}:{v:+.0f}%" for k, v in by.items()))
    return R


print(f"Mỗi lệnh {SZ:.0f}% vốn · dữ liệu {D['months'][0]} → {D['months'][-1]} · {len(D['top'])} mã khối lượng lớn có funding")

# ================================================================ S1 short coin vừa bơm
print("\n==================== S1 · SHORT COIN VỪA BƠM (24 giờ ≥ X%, vào 00:00 UTC)")
for thr in (25, 40, 60, 100):
    for key in ("24|None", "72|0.3", "72|None", "168|0.3", "168|None", "168|0.15"):
        rows = []
        for x in D["s1"]:
            if x["r24"] < thr or key not in x["res"]:
                continue
            r, why, t2, best, worst = x["res"][key]; fu, _ = fund(x["s"], -1, x["t"], t2)
            rows.append((t2, r - cost(x["s"]) + fu, best, worst))
        h, sl = key.split("|")
        stats(f"bơm ≥ {thr}% · giữ {int(h) // 24} ngày · cắt lỗ {'không' if sl == 'None' else '+' + str(int(float(sl) * 100)) + '%'}", rows)

# ================================================================ S2 short coin mới niêm yết
print("\n==================== S2 · SHORT COIN MỚI NIÊM YẾT FUTURES")
for dly in (24, 72):
    for key in ("168|None", "336|None", "336|0.5", "720|None", "720|0.5", "720|0.3"):
        rows = []
        for x in D["s2"]:
            if x["dly"] != dly or key not in x["res"]:
                continue
            r, why, t2, best, worst = x["res"][key]; fu, _ = fund(x["s"], -1, x["t"], t2)
            rows.append((t2, r - cost(x["s"]) + fu, best, worst))
        h, sl = key.split("|")
        stats(f"vào sau {dly // 24} ngày · giữ {int(h) // 24} ngày · cắt lỗ {'không' if sl == 'None' else '+' + str(int(float(sl) * 100)) + '%'}", rows)

# ================================================================ S3 Donchian
print("\n==================== S3 · THEO XU HƯỚNG DONCHIAN (12 coin lớn, nến ngày, cắt lỗ 2 ATR)")
for sys_ in ("20/10", "55/20"):
    for lab, f in (("Long + Short", lambda x: True), ("chỉ Long", lambda x: x["side"] > 0), ("chỉ Short", lambda x: x["side"] < 0),
                   ("Long khi giá > TB 200 ngày", lambda x: x["side"] > 0 and x["trend"] == 1), ("Long>TB200 + Short<TB200", lambda x: (x["side"] > 0 and x["trend"] == 1) or (x["side"] < 0 and x["trend"] == 0))):
        rows = []
        for x in D["s3"]:
            if x["sys"] != sys_ or not f(x):
                continue
            fu, _ = fund(x["s"], x["side"], x["t"], x["t2"])
            rows.append((x["t2"], x["r"] - cost(x["s"]) + fu, x["best"], x["worst"]))
        stats(f"{sys_} ngày · {lab}", rows)
    for s in ("BTCUSDT", "ETHUSDT", "SOLUSDT"):
        rows = [(x["t2"], x["r"] - cost(s) + fund(s, x["side"], x["t"], x["t2"])[0], x["best"], x["worst"]) for x in D["s3"] if x["sys"] == sys_ and x["s"] == s]
        stats(f"   {sys_} · riêng {s[:-4]}", rows)

# ================================================================ S5 funding cực đoan
print("\n==================== S5 · FUNDING CỰC ĐOAN – ĐÁNH NGƯỢC ĐÁM ĐÔNG (300 mã khối lượng lớn)")
for thr in (0.05, 0.1, 0.2):
    for side, lab in ((1, "Long khi funding ≤ −"), (-1, "Short khi funding ≥ +")):
        for key in ("24|None", "72|None", "72|0.2"):
            rows = []
            for x in D["s5"]:
                if x["side"] != side or abs(x["f"]) / 1e4 < thr or key not in x["res"]:
                    continue
                r, why, t2, best, worst = x["res"][key]; fu, _ = fund(x["s"], side, x["t"], t2)
                rows.append((t2, r - cost(x["s"]) + fu, best, worst))
            h, sl = key.split("|")
            stats(f"{lab}{thr:.2f}%/kỳ · giữ {int(h) // 24} ngày · cắt lỗ {'không' if sl == 'None' else str(int(float(sl) * 100)) + '%'}", rows)

# ================================================================ S6 ăn funding trung tính
print("\n==================== S6 · ĂN FUNDING TRUNG TÍNH (giữ spot + short perp cùng lượng) – lợi suất/năm theo năm, chưa trừ phí vào/ra 1 lần ~0,4%")
for s in ("BTCUSDT", "ETHUSDT", "SOLUSDT"):
    if s not in FR:
        continue
    T, f = FR[s]; S = pd.Series(f, index=pd.to_datetime(T * 3600, unit="s"))
    y = S.groupby(S.index.year).sum(); neg = S.groupby(S.index.year).apply(lambda v: (v < 0).mean() * 100)
    print(f"  {s[:-4]:<5} " + " · ".join(f"{k}: {v:+.1f}%/năm (kỳ âm {neg[k]:.0f}%)" for k, v in y.items()))
# đuổi funding cao: mỗi thứ Hai chọn 5 mã có funding TB 7 ngày trước cao nhất (khối lượng tuần ≥ 350 triệu USD), ăn funding 7 ngày sau; đổi mã mất 0,4%
WK = D["wk"]; weeks = sorted({w[0] for v in WK.values() for w in v})
vol = {(s, w[0]): w[3] for s, v in WK.items() for w in v}
rows = []; prev = set()
for t in weeks:
    cand = []
    for s, (T, f) in FR.items():
        if vol.get((s, t), 0) < 350:
            continue
        a, b = bisect.bisect_right(T, t - 168), bisect.bisect_right(T, t)
        if b - a >= 15:
            cand.append((f[a:b].mean(), s))
    if len(cand) < 10:
        continue
    pick = [s for _, s in sorted(cand, reverse=True)[:5]]
    earn = np.mean([fund(s, -1, t, t + 168)[0] for s in pick]); turn = len(set(pick) - prev) / 5; prev = set(pick)
    rows.append((t + 168, earn - turn * 0.4, earn, -turn * 0.4))
R = stats("đuổi funding: 5 mã funding cao nhất, đổi mỗi tuần (lời % / tuần, cả vốn)", rows, 100)
if R is not None:
    print(f"     → trung bình {R.r.mean() * 52:+.1f}%/năm trên vốn dùng (mỗi bên spot & perp nửa vốn → chia đôi: {R.r.mean() * 26:+.1f}%/năm trên tổng vốn)")

# ================================================================ S7 động lượng chéo
print("\n==================== S7 · ĐỘNG LƯỢNG CHÉO (mỗi thứ Hai, coin khối lượng tuần ≥ 350 triệu USD, niêm yết ≥ 60 ngày, giữ 7 ngày, phí 0,3%/tuần)")
snap = {}
for s, v in WK.items():
    for w in v:
        t, r28, r7, q7, nx, hi, lo, lst = w
        if q7 >= 350 and t - lst >= 24 * 60:
            snap.setdefault(t, []).append((s, r28, r7, nx, hi, lo))
btc = {w[0]: w[4] for w in WK.get("BTCUSDT", [])}
for k, lab in ((1, "28 ngày"), (2, "7 ngày")):
    for side, nm in ((1, "MUA 5 mạnh nhất"), (-1, "BÁN 5 yếu nhất"), (0, "mua 5 mạnh + bán 5 yếu"), (-2, "MUA 5 YẾU nhất (bắt đáy)")):
        rows = []
        for t, L in sorted(snap.items()):
            if len(L) < 15:
                continue
            L = sorted(L, key=lambda x: -x[k])
            top, bot = L[:5], L[-5:]
            if side == 1:
                r = np.mean([x[3] for x in top]) - 0.3; b, w = np.mean([x[4] for x in top]), np.mean([x[5] for x in top])
            elif side == -1:
                r = -np.mean([x[3] for x in bot]) - 0.3; b, w = -np.mean([x[5] for x in bot]), -np.mean([x[4] for x in bot])
            elif side == -2:
                r = np.mean([x[3] for x in bot]) - 0.3; b, w = np.mean([x[4] for x in bot]), np.mean([x[5] for x in bot])
            else:
                r = (np.mean([x[3] for x in top]) - np.mean([x[3] for x in bot])) / 2 - 0.3; b, w = 0, 0
            rows.append((t + 168, r, b, w))
        stats(f"{lab} · {nm} (lời % / tuần, cả vốn)", rows, 100)
rows = [(t + 168, v - 0.0, 0, 0) for t, v in sorted(btc.items())]
stats("so sánh: giữ BTC (lời % / tuần, cả vốn)", rows, 100)
