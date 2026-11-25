"""Vòng 22 – Jason (25/11/2026): "các ngày gần đây râu sập không còn tác dụng nhiều, đóng lệnh sau 60 phút cũng không còn lời – tìm phương pháp mới".
Dữ liệu: nến 1 phút mọi mã futures USDT Binance (data.binance.vision), 01/2025 → hôm nay, khối lượng đúng thời điểm, cùng phí / trượt các vòng trước.

PHẦN A – Bắt râu sập (đúng luật vào lệnh đang chạy: mức chờ 1,25× / 1,5×, vào ngay khi 15 phút trước đã giảm ≥ 3%) với các cách THOÁT:
  cur       = HIỆN TẠI: cắt lỗ đuổi (lời ≥ 150 trả 100) + từ phút 40 còn lỗ ra ở đỉnh nhịp nảy khi đã bật ≥ 300 bps + hết 60 phút
  h15…h120  = như cur nhưng giữ tối đa 15 / 30 / 45 / 90 / 120 phút
  tp100…    = như cur + chốt lời cố định khi lời ≥ X bps
  sl500…    = như cur + cắt lỗ cứng khi lỗ ≥ X bps (hiện tại chỉ có cắt lỗ thảm hoạ 35%)
  tr80      = cắt lỗ đuổi sớm hơn: lời ≥ 80 trả 60
  → r22_calc.py so theo TUẦN 12 tuần gần nhất & theo tháng để xem lợi thế có thật sự giảm, và cách thoát nào hợp giai đoạn gần đây.

PHẦN B – PHƯƠNG PHÁP MỚI (vào bằng lệnh thị trường: phí taker 5 + trượt 10, thoát taker 18 / cắt lỗ 28 bps):
  knife     = ĐÀ SAU CÚ SỐC (ngược Bắt râu): sau cú sốc qua lọc, nếu trong 5 phút giá đóng cửa vượt tiếp đáy / đỉnh nến sốc ≥ 0,5% → đánh THEO chiều cú sốc,
              cắt lỗ ở đỉnh / đáy nến sốc, cắt lỗ đuổi 150/100, giữ tối đa 60 phút (k30 = 30 phút)
  drift     = QUÁ ĐÀ NHIỀU PHÚT: 15 phút đi ≥ 8% mà không có nến 1 phút nào ≥ 3% (không trùng Bắt râu) → đánh NGƯỢC, giữ 60 phút, cắt lỗ đuổi 150/100, cắt lỗ cứng 8%
  brk       = PHÁ BIÊN 60 PHÚT CÓ KHỐI LƯỢNG: đóng cửa vượt đỉnh / đáy 60 phút ≥ 0,5%, nến 1–3%, khối lượng ≥ 5× trung vị → đánh THEO,
              cắt lỗ ở giữa biên (tối đa 3%), cắt lỗ đuổi 150/100, giữ 60 phút
  pump      = BƠM / XẢ 60 PHÚT ≥ 15% → đánh NGƯỢC, giữ tối đa 4 giờ, cắt lỗ cứng 10%, cắt lỗ đuổi 300/150
  lag       = COIN CHẬM NHỊP BTC: BTC đi ≥ 1% trong 5 phút (z ≥ 3) mà coin mới đi ≤ 20% chừng đó → đánh coin THEO chiều BTC, giữ 30 phút, cắt lỗ 2%, đuổi 100/60
Mỗi lệnh ghi thời điểm, chiều, bps ròng → r22_calc.py: theo tháng, 2 nửa, 12 tuần gần nhất, bootstrap theo ngày, theo chiều Long / Short.
Chạy: python research/round22.py"""
import concurrent.futures as cf
import gzip
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round22.log")
import round20 as R20  # noqa: E402
import round15 as R15  # noqa: E402
import round8 as R8  # noqa: E402
import round6 as R6  # noqa: E402
import events as E  # noqa: E402

log = E.log
IN_T, OUT_T, OUT_S = R8.IN_T, R6.OUT_T, R6.OUT_S


# ---------------------------------------------------------------- PHẦN A: cách thoát cho Bắt râu sập
def sim(kind, prm, fav, adv, o_all, side, tb):
    A, Gp = prm.get("A", 150), prm.get("G", 100); peak = 0.0; M, T, S = R6.IN_M, R6.OUT_T, R6.OUT_S
    H = prm.get("H", 60)
    v, a = R15.deriv(np.asarray(o_all[:max(62, H + 2)], dtype=float), 9)
    lo = 0.0
    for k in range(H):
        ad, f = adv[k], fav[k]
        if ad <= -R6.CAT:
            return -R6.CAT - M - S, "S"
        if prm.get("sl") and ad <= -prm["sl"]:
            return -prm["sl"] - M - S, "L"
        if peak >= A and ad <= peak - Gp:
            return peak - Gp - M - S, "R"
        if prm.get("tp") and f >= prm["tp"] + R6.THR:
            return prm["tp"] - M - R6.OUT_P, "P"
        peak = max(peak, f); lo = min(lo, ad)
        j = k + 1
        p = o_all[j]
        if prm.get("u", True) and j >= 40 and j < H and np.isfinite(v[j]) and p < 0 and v[j] <= 0 and a[j] < 0 and v[j - 1] > 0 and p - lo >= prm.get("b", 300):
            return p - M - T, "U"
    return o_all[H] - M - T, "T"


R20.sim = sim
R20.RULES = [("cur", {})] + [(f"h{h}", dict(H=h)) for h in (15, 30, 45, 90, 120)] + [(f"tp{x}", dict(tp=x)) for x in (100, 200, 300)] \
    + [(f"sl{x}", dict(sl=x)) for x in (500, 800, 1200)] + [("tr80", dict(A=80, G=60))]


# ---------------------------------------------------------------- PHẦN B: phương pháp mới
def walk(c, h, l, o, i, side, H, stop=None, A=150, G=100, cat=3500.0):
    """vào ở giá MỞ nến i (lệnh thị trường), đi tối đa H nến; trong 1 nến giả định đi XẤU trước. → bps ròng, lý do."""
    e = o[i]
    if not (e > 0):
        return None
    pk = 0.0
    for k in range(i, min(len(c), i + H)):
        fav = side * ((h[k] if side > 0 else l[k]) / e - 1) * 1e4
        adv = side * ((l[k] if side > 0 else h[k]) / e - 1) * 1e4
        if not (np.isfinite(fav) and np.isfinite(adv)):
            continue
        if stop is not None and ((side > 0 and l[k] <= stop) or (side < 0 and h[k] >= stop)):
            return side * (stop / e - 1) * 1e4 - IN_T - OUT_S, "L"
        if adv <= -cat:
            return -cat - IN_T - OUT_S, "S"
        if pk >= A and adv <= pk - G:
            return pk - G - IN_T - OUT_S, "R"
        pk = max(pk, fav)
    k = min(len(c), i + H) - 1
    return side * (c[k] / e - 1) * 1e4 - IN_T - OUT_T, "T"


def new_methods(s, t0, o, h, l, c, qv, r, z, mq, q24, ok, base_idx):
    out = []
    n = len(c)
    add = (lambda m, i, sd, res, **kw: out.append(dict(m=m, s=s, T=int(t0 + i), side=int(sd), net=round(float(res[0]), 1), w=res[1], **kw)) if res else None)
    liq = q24 >= 2e6
    # knife – đà sau cú sốc
    for i in base_idx:
        if i + 70 >= n:
            continue
        sd = 1 if r[i] > 0 else -1          # chiều cú sốc
        ext = h[i] if sd > 0 else l[i]
        for k in range(i + 1, i + 6):
            if (sd > 0 and c[k] >= ext * 1.005) or (sd < 0 and c[k] <= ext * 0.995):
                stop = l[i] if sd > 0 else h[i]
                add("knife", k + 1, sd, walk(c, h, l, o, k + 1, sd, 60, stop), R=round(float(abs(r[i]) * 1e4)))
                add("k30", k + 1, sd, walk(c, h, l, o, k + 1, sd, 30, stop))
                break
    # drift – quá đà nhiều phút, không có nến sốc
    r15 = np.full(n, np.nan); r15[15:] = np.log(c[15:] / c[:-15]) * 1e4
    big1 = pd.Series(np.abs(r) * 1e4).rolling(15, min_periods=1).max().values
    cand = np.flatnonzero(ok & liq & (np.abs(r15) >= 800) & (big1 < 300))
    for i in E.dedupe(cand, 60):
        if i < 1440 or i + 62 >= n:
            continue
        sd = -1 if r15[i] > 0 else 1
        add("drift", i + 1, sd, walk(c, h, l, o, i + 1, sd, 60, o[i + 1] * (1 - sd * 0.08)), R=round(float(abs(r15[i]))))
    # brk – phá biên 60 phút có khối lượng
    hi60 = pd.Series(h).rolling(60, min_periods=50).max().shift(1).values; lo60 = pd.Series(l).rolling(60, min_periods=50).min().shift(1).values
    rb = np.abs(r) * 1e4
    up = ok & liq & (c >= hi60 * 1.005) & (qv >= 5 * mq) & (rb >= 100) & (rb < 300) & (r > 0)
    dn = ok & liq & (c <= lo60 * 0.995) & (qv >= 5 * mq) & (rb >= 100) & (rb < 300) & (r < 0)
    for sd, msk in ((1, up), (-1, dn)):
        for i in E.dedupe(np.flatnonzero(msk), 60):
            if i < 1440 or i + 62 >= n:
                continue
            mid = (hi60[i] + lo60[i]) / 2; e = o[i + 1]
            stop = max(mid, e * 0.97) if sd > 0 else min(mid, e * 1.03)
            add("brk", i + 1, sd, walk(c, h, l, o, i + 1, sd, 60, stop))
    # pump – bơm / xả 60 phút ≥ 15%
    r60 = np.full(n, np.nan); r60[60:] = np.log(c[60:] / c[:-60]) * 1e4
    for i in E.dedupe(np.flatnonzero(ok & liq & (np.abs(r60) >= 1500)), 240):
        if i < 1440 or i + 242 >= n:
            continue
        sd = -1 if r60[i] > 0 else 1; e = o[i + 1]
        add("pump", i + 1, sd, walk(c, h, l, o, i + 1, sd, 240, e * (1 - sd * 0.10), A=300, G=150), R=round(float(abs(r60[i]))))
    # lag – coin chậm nhịp BTC
    B = R20.BTC
    if B and s != "BTCUSDT":
        bi = np.arange(n) + t0 - B["t0"]; okb = (bi >= 5) & (bi < len(B["r"]))
        b5 = np.full(n, np.nan); bz = np.full(n, np.nan)
        b5[okb] = B["r5"][bi[okb]]; bz[okb] = B["z5"][bi[okb]]
        a5 = np.full(n, np.nan); a5[5:] = np.log(c[5:] / c[:-5]) * 1e4
        msk = ok & liq & (np.abs(b5) >= 100) & (bz >= 3) & (np.sign(a5) * np.sign(b5) * np.abs(a5) <= 0.2 * np.abs(b5))
        for i in E.dedupe(np.flatnonzero(msk), 30):
            if i < 1440 or i + 32 >= n:
                continue
            sd = 1 if b5[i] > 0 else -1; e = o[i + 1]
            add("lag", i + 1, sd, walk(c, h, l, o, i + 1, sd, 30, e * (1 - sd * 0.02), A=100, G=60))
    return out


def btc5():
    R20.btc_load()
    r = R20.BTC["r"]; cs = np.concatenate([[0], np.cumsum(r)])
    r5 = np.full(len(r), np.nan); r5[5:] = cs[6:] - cs[1:-5]
    sd = pd.Series(r5).rolling(1440, min_periods=600).std().shift(5).values
    R20.BTC.update(r5=r5, z5=np.abs(r5) / sd)


def process_both(s):
    """Phần A (giống round20.process, đọc dữ liệu 1 lần) + Phần B."""
    try:
        d = R6.load(s)
    except Exception:  # noqa: BLE001
        return [], []
    if d is None or len(d) < 3000:
        return [], []
    c = d.c.ffill().values; o = d.o.fillna(d.c.ffill()).values; h = d.h.fillna(d.c.ffill()).values; l = d.l.fillna(d.c.ffill()).values
    qv = d.qv.fillna(0).values; ok = d.c.notna().values; t0 = int(d.index[0]); n = len(d)
    r = np.diff(np.log(c), prepend=np.log(c[0]))
    sd = pd.Series(r).rolling(60, min_periods=40).std().shift(1).values
    mq = pd.Series(qv).rolling(60, min_periods=40).median().shift(1).values
    q24 = pd.Series(qv).rolling(1440, min_periods=600).sum().shift(1).values
    z = np.abs(r) / sd
    base = (z >= 4) & (np.abs(r) * 1e4 >= 300) & ok & (q24 >= 2e6)
    raw8 = np.flatnonzero(base & (qv >= 8 * mq))
    A = []
    bidx = E.dedupe(np.flatnonzero(base & (qv >= 3 * mq)), 30)
    for i in bidx:
        if i < 1440 or i + 2 + R20.W + R20.HMAX >= n:
            continue
        side = -1 if r[i] > 0 else 1; c0 = c[i]; mv = abs(math.expm1(r[i]))
        rec = dict(s=s, T=int(t0 + i), side=side, R=round(float(abs(r[i]) * 1e4)), z=round(float(z[i]), 1), vx=round(float(qv[i] / mq[i]), 1) if mq[i] > 0 else None,
                   prior6=int(((raw8 < i) & (raw8 >= i - 360)).sum()), r15=round(float(side * (c[i - 1] / c[i - 16] - 1) * 1e4)),
                   r4h=round(float(side * (c0 / c[i - 240] - 1) * 1e4)), res={})
        for D in (0.0,) + R20.DS:
            if D == 0:
                L = o[i + 1]; fill = i
            else:
                L = c0 * (1 - side * D * mv); Lt = L * (1 - side * R6.THR / 1e4); fill = None
                for j in range(i + 1, i + 1 + R20.W):
                    if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                        fill = j; break
                if fill is None:
                    continue
            seg_h, seg_l = h[fill + 1:fill + 1 + R20.HMAX], l[fill + 1:fill + 1 + R20.HMAX]
            pn = lambda px: side * (px / L - 1) * 1e4  # noqa: E731
            fav = pn(seg_h) if side > 0 else pn(seg_l); adv = pn(seg_l) if side > 0 else pn(seg_h)
            o_all = pn(o[fill + 1:fill + 2 + R20.HMAX])
            x = {}
            for k, prm in R20.RULES:
                v_, why = sim(None, prm, fav, adv, o_all, side, t0 + fill + 1)
                x[k] = round(float(v_) - (R8.IN_T - R6.IN_M if D == 0 else 0), 1)
                x[k + "_w"] = why
            x["f"] = int(fill - i)
            rec["res"][str(D)] = x
        A.append(rec)
    # cú sốc qua đúng bộ lọc Bắt râu (để "knife" là phần ngược lại của chính các cú sốc bot bắt)
    kn = [i for i in bidx if qv[i] >= 8 * mq[i] and i >= 1440]
    Bn = new_methods(s, t0, o, h, l, c, qv, r, z, mq, q24, ok, np.array(kn, dtype=np.int64))
    return A, Bn


if __name__ == "__main__":
    t00 = time.time()
    btc5()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {R6.MONTHS[0]} → {R6.MONTHS[-1]} + {len(R6.DAYS)} ngày · {len(R20.RULES)} cách thoát · 5 phương pháp mới")
    evs, nw = [], []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, (a, b) in enumerate(ex.map(process_both, syms)):
            evs += a; nw += b
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã, {len(evs)} cú sốc, {len(nw)} lệnh mới, {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round22.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    with gzip.open(os.path.join(E.OUT, "round22b.json.gz"), "wt") as f:
        json.dump(nw, f, ensure_ascii=False, default=float)
    log(f"{len(evs)} cú sốc · {len(nw)} lệnh phương pháp mới · {time.time() - t00:.0f}s")
    os.system(f"{sys.executable} {os.path.join(os.path.dirname(__file__), 'r22_calc.py')} {E.OUT} > {os.path.join(E.OUT, 'r22_result.md')} 2>&1")
