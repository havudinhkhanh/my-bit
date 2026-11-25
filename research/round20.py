"""Vòng 20 – sau ngày 24/11/2026 (MON: khớp 2 mức, BTC sập 2 lần trong lúc giữ, luật "ra ở đỉnh nhịp nảy" đóng gần đáy):
Jason hỏi lý do & cách cải thiện. Thử trên cùng dữ liệu, cùng luật danh mục với vòng 15 (mức chờ 1,25× / 1,5×, vào ngay khi 15 phút trước đã giảm ≥ 3%):
  cur   = HIỆN TẠI: cắt lỗ đuổi tr150 + từ phút 40 còn lỗ ra ở đỉnh nhịp nảy (parabol 9 phút) + cắt thảm hoạ + hết 60 phút
  t60   = bỏ luật đỉnh nhịp nảy (chỉ tr150 + 60 phút)
  ub{b} = đỉnh nhịp nảy CHỈ khi giá đã bật lên ≥ b bps từ đáy lời/lỗ (không thì giữ tới hết giờ) – vá chỗ "nảy 0,2% đã coi là đỉnh"
  bx{X}{l|a} = cur + đóng khi BTC có nến 1 phút đi NGƯỢC lệnh ≥ X bps (z ≥ 4 so với 60 phút trước), l = chỉ khi lệnh đang lỗ, a = mọi lúc
  bxt{X}l = t60 + đóng khi BTC sập ngược lệnh ≥ X bps và lệnh đang lỗ
  ub{b}bx{X}l = kết hợp
Quyết định ở giá đóng nến BTC (bot thấy trong vài giây) → khớp ở giá MỞ nến kế tiếp của coin, phí thoát taker + trượt như các vòng trước.
Chạy: python research/round20.py → research_out/round20.json.gz, research_out/r20_result.md"""
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
os.environ.setdefault("RS_LOG", "round20.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402
import round6 as R6  # noqa: E402
import round8 as R8  # noqa: E402
import round15 as R15  # noqa: E402

log = E.log
DS = (1.25, 1.5)
W, HMAX = 8, 120
BTC = {}


def btc_load():
    d = R6.load("BTCUSDT")
    c = d.c.ffill().values
    r = np.diff(np.log(c), prepend=np.log(c[0])) * 1e4
    sd = pd.Series(r).rolling(60, min_periods=40).std().shift(1).values
    BTC.update(t0=int(d.index[0]), r=r, z=np.abs(r) / sd)
    log(f"BTC: {len(c)} phút từ {pd.to_datetime(int(d.index[0]) * 60, unit='s')}")


def btc_at(t):
    i = t - BTC["t0"]
    if i < 0 or i >= len(BTC["r"]):
        return 0.0, 0.0
    z = BTC["z"][i]
    return float(BTC["r"][i]), float(z) if np.isfinite(z) else 0.0


def sim(kind, prm, fav, adv, o_all, side, tb):
    """kind: U (cur) · T (t60) với tuỳ chọn prm = dict(u=bool, b=bounce_bps, x=btc_bps, c='l'|'a')."""
    A, Gp = 150, 100; peak = 0.0; M, T, S = R6.IN_M, R6.OUT_T, R6.OUT_S
    v, a = R15.deriv(np.asarray(o_all[:62], dtype=float), 9)
    lo = 0.0
    for k in range(60):
        ad, f = adv[k], fav[k]
        if ad <= -R6.CAT:
            return -R6.CAT - M - S, "S"
        if peak >= A and ad <= peak - Gp:
            return peak - Gp - M - S, "R"
        peak = max(peak, f); lo = min(lo, ad)
        j = k + 1
        p = o_all[j]
        if prm.get("x"):      # BTC nến phút k (thời điểm tb + k) vừa đóng
            rb, zb = btc_at(tb + k)
            if side * rb <= -prm["x"] and zb >= 4 and (prm["c"] == "a" or p < 0):
                return p - M - T, "B"
        if prm.get("u") and np.isfinite(v[j]) and j >= 40 and p < 0 and v[j] <= 0 and a[j] < 0 and v[j - 1] > 0:
            if not prm.get("b") or p - lo >= prm["b"]:
                return p - M - T, "U"
    return o_all[60] - M - T, "T"


RULES = [("cur", dict(u=True)), ("t60", dict(u=False))] \
    + [(f"ub{b}", dict(u=True, b=b)) for b in (50, 100, 200, 300)] \
    + [(f"bx{x}{c}", dict(u=True, x=x, c=c)) for x in (30, 50, 80) for c in ("l", "a")] \
    + [(f"bxt{x}l", dict(u=False, x=x, c="l")) for x in (30, 50, 80)] \
    + [(f"ub{b}bx{x}l", dict(u=True, b=b, x=x, c="l")) for b in (100, 200) for x in (30, 50)]


def process(s):
    try:
        d = R6.load(s)
    except Exception:  # noqa: BLE001
        return []
    if d is None or len(d) < 3000:
        return []
    c = d.c.ffill().values; o = d.o.fillna(d.c.ffill()).values; h = d.h.fillna(d.c.ffill()).values; l = d.l.fillna(d.c.ffill()).values
    qv = d.qv.fillna(0).values; ok = d.c.notna().values; t0 = int(d.index[0]); n = len(d)
    r = np.diff(np.log(c), prepend=np.log(c[0]))
    sd = pd.Series(r).rolling(60, min_periods=40).std().shift(1).values
    mq = pd.Series(qv).rolling(60, min_periods=40).median().shift(1).values
    q24 = pd.Series(qv).rolling(1440, min_periods=600).sum().shift(1).values
    z = np.abs(r) / sd
    base = (z >= 4) & (np.abs(r) * 1e4 >= 300) & ok & (q24 >= 2e6)
    raw8 = np.flatnonzero(base & (qv >= 8 * mq))
    out = []
    for i in E.dedupe(np.flatnonzero(base & (qv >= 3 * mq)), 30):
        if i < 1440 or i + 2 + W + HMAX >= n:
            continue
        side = -1 if r[i] > 0 else 1; c0 = c[i]; mv = abs(math.expm1(r[i]))
        rec = dict(s=s, T=int(t0 + i), side=side, R=round(float(abs(r[i]) * 1e4)), z=round(float(z[i]), 1), vx=round(float(qv[i] / mq[i]), 1) if mq[i] > 0 else None,
                   prior6=int(((raw8 < i) & (raw8 >= i - 360)).sum()), r15=round(float(side * (c[i - 1] / c[i - 16] - 1) * 1e4)),
                   r4h=round(float(side * (c0 / c[i - 240] - 1) * 1e4)), res={})
        for D in (0.0,) + DS:
            if D == 0:
                L = o[i + 1]; fill = i
            else:
                L = c0 * (1 - side * D * mv); Lt = L * (1 - side * R6.THR / 1e4); fill = None
                for j in range(i + 1, i + 1 + W):
                    if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                        fill = j; break
                if fill is None:
                    continue
            seg_h, seg_l = h[fill + 1:fill + 1 + HMAX], l[fill + 1:fill + 1 + HMAX]
            pn = lambda px: side * (px / L - 1) * 1e4  # noqa: E731
            fav = pn(seg_h) if side > 0 else pn(seg_l); adv = pn(seg_l) if side > 0 else pn(seg_h)
            o_all = pn(o[fill + 1:fill + 2 + HMAX])
            tb = t0 + fill + 1
            x = {}
            for k, prm in RULES:
                v_, why = sim(None, prm, fav, adv, o_all, side, tb)
                x[k] = round(float(v_) - (R8.IN_T - R6.IN_M if D == 0 else 0), 1)
                x[k + "_w"] = why
            x["f"] = int(fill - i)
            rec["res"][str(D)] = x
        out.append(rec)
    return out


if __name__ == "__main__":
    t00 = time.time()
    btc_load()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {R6.MONTHS[0]} → {R6.MONTHS[-1]} + {len(R6.DAYS)} ngày · {len(RULES)} cách thoát")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(process, syms)):
            evs += out
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã, {len(evs)} cú sốc, {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round20.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    log(f"{len(evs)} cú sốc · {time.time() - t00:.0f}s")
    os.system(f"{sys.executable} {os.path.join(os.path.dirname(__file__), 'r20_calc.py')} {os.path.join(E.OUT, 'round20.json.gz')} > {os.path.join(E.OUT, 'r20_result.md')} 2>&1")
